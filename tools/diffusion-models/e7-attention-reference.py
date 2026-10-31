"""Independent dense FP64 attention reference for explicit post-RoPE fixtures.

No original model inference, projection, QK normalization or RoPE construction is
performed. F32 input fixtures/scale are promoted to FP64 only for the independent
reference. Runtime online/stream attention is compared with fixed tolerances.
No K/V fixture binaries are persisted.
"""
import argparse
import hashlib
import json
import math
import os
import time
from pathlib import Path
os.environ['OPENBLAS_NUM_THREADS']='1'
os.environ['OMP_NUM_THREADS']='1'
import numpy as np

QCOUNT=16
DIM=128
TOTAL_KEYS=32760
KEY_TILE=64
TOLERANCE={'absolute':1e-5,'relative':1e-4,'fixedBeforeRuntimeComparison':True}
sha=lambda b:hashlib.sha256(b).hexdigest()

def dense_reference(q,k,v,scale):
 # Only one 16xK dense score matrix, not head40 or model attention. Conversions
 # of K/V are separate bounded-lifetime temporaries, avoiding retained doubles.
 scores=q.astype(np.float64) @ k.astype(np.float64).T
 scores*=float(scale)
 logit_min=float(np.min(scores));logit_max=float(np.max(scores))
 row_max=np.max(scores,axis=1,keepdims=True)
 scores-=row_max
 np.exp(scores,out=scores)
 denominator=np.sum(scores,axis=1,keepdims=True,dtype=np.float64)
 normalized_sums=np.sum(scores/denominator,axis=1,dtype=np.float64)
 output=(scores @ v.astype(np.float64))/denominator
 return output.astype('<f4'),row_max.ravel(),denominator.ravel(),{'logitMinimumF64':logit_min,'logitMaximumF64':logit_max,'softmaxNormalizedRowSumsF64':normalized_sums.tolist(),'positiveFiniteDenominators':bool(np.isfinite(denominator).all() and np.all(denominator>0)),'finiteOutput':bool(np.isfinite(output).all())}

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',required=True,type=Path);a=p.parse_args()
 started=time.perf_counter()
 q=np.empty((QCOUNT,DIM),dtype='<f4')
 k=np.empty((TOTAL_KEYS,DIM),dtype='<f4')
 v=np.empty((TOTAL_KEYS,DIM),dtype='<f4')
 d=np.arange(DIM,dtype=np.int64)[None,:]
 qi=np.arange(QCOUNT,dtype=np.int64)[:,None]
 q[:]=(((qi*19+d*7)%97)-48)/64
 # Generate small integer tiles so fixture generation does not create a full
 # KxD integer temporary or exceed the declared reference data-memory budget.
 for start in range(0,TOTAL_KEYS,KEY_TILE):
  end=min(start+KEY_TILE,TOTAL_KEYS)
  ids=np.arange(start,end,dtype=np.int64)[:,None]
  k[start:end]=(((ids*13+d*11)%101)-50)/64
  v[start:end]=(((ids*17+d*5)%103)-51)/64
 scale=np.float32(1/math.sqrt(DIM))
 assert np.isfinite(q).all() and np.isfinite(k).all() and np.isfinite(v).all()
 fixture={
  'qSHA256':sha(q.tobytes()),'kSHA256':sha(k.tobytes()),'vSHA256':sha(v.tobytes()),
  'qBytes':int(q.nbytes),'kBytes':int(k.nbytes),'vBytes':int(v.nbytes),
  'qFormula':'q[q,d]=f32((((q*19+d*7)%97)-48)/64)',
  'kFormula':'k[k,d]=f32((((k*13+d*11)%101)-50)/64)',
  'vFormula':'v[k,d]=f32((((k*17+d*5)%103)-51)/64)',
 }
 cases=[]
 for count in (64,120,TOTAL_KEYS):
  began=time.perf_counter();out,maxima,denominators,stats=dense_reference(q,k[:count],v[:count],scale)
  assert out.shape==(QCOUNT,DIM) and np.isfinite(out).all()
  cases.append({
   'id':'explicit-post-rope-q16-k'+str(count)+'-d128',
   'qShape':[QCOUNT,DIM],'kShape':[count,DIM],'vShape':[count,DIM],
   'outputShape':[QCOUNT,DIM],'keyTile':KEY_TILE,
   'fullTiles':count//KEY_TILE,'tailKeys':count%KEY_TILE,
   'allKeysIncluded':True,'phantomPaddingKeys':0,
   'inputSHA256':{'q':fixture['qSHA256'],'k':sha(k[:count].tobytes()),'v':sha(v[:count].tobytes())},
   'expected':out.ravel().tolist(),'expectedF32SHA256':sha(out.tobytes()),
   'rowMaximaF64':maxima.tolist(),'softmaxDenominatorF64':denominators.tolist(),
   'referenceElapsedMs':(time.perf_counter()-began)*1000,
   'referenceDenseScoreBytes':QCOUNT*count*8,**stats,
  })
 special_cases=[]
 for mode in ('uniform','increasing-max','moderate-extreme'):
  began=time.perf_counter();key_count=120
  special_q=np.zeros((QCOUNT,DIM),dtype='<f4')
  special_k=k[:key_count] if mode=='uniform' else np.zeros((key_count,DIM),dtype='<f4')
  special_v=v[:key_count]
  if mode=='increasing-max':
   special_q[:,0]=8
   special_k[:,0]=np.arange(key_count,dtype=np.float32)/4
  elif mode=='moderate-extreme':
   special_q[:,0]=32
   special_k[:,0]=(((np.arange(key_count,dtype=np.int64)*13)%193)-96)/4
  out,maxima,denominators,stats=dense_reference(special_q,special_k,special_v,scale)
  assert out.shape==(QCOUNT,DIM) and stats['positiveFiniteDenominators'] and stats['finiteOutput']
  assert np.allclose(stats['softmaxNormalizedRowSumsF64'],np.ones(QCOUNT),atol=1e-14,rtol=0)
  extra={}
  if mode=='uniform':
   mean=special_v.astype(np.float64).mean(axis=0).astype('<f4')
   assert np.array_equal(out,np.repeat(mean[None,:],QCOUNT,axis=0))
   extra={'analyticUniformMeanVF32SHA256':sha(mean.tobytes()),'uniformDenominator':120}
  elif mode=='increasing-max':
   first_scores=(special_q.astype(np.float64) @ special_k[:64].astype(np.float64).T)*float(scale)
   first_max=first_scores.max(axis=1)
   assert np.all(maxima>first_max)
   extra={'firstTileRowMaximaF64':first_max.tolist(),'requiresCrossTileMaximumUpdate':True}
  special_cases.append({'mode':mode,'keyCount':key_count,'qShape':[QCOUNT,DIM],
   'kShape':[key_count,DIM],'vShape':[key_count,DIM],'outputShape':[QCOUNT,DIM],
   'keyTile':KEY_TILE,'fullTiles':key_count//KEY_TILE,'tailKeys':key_count%KEY_TILE,
   'allKeysIncluded':True,'phantomPaddingKeys':0,
   'inputSHA256':{'q':sha(special_q.tobytes()),'k':sha(special_k.tobytes()),'v':sha(special_v.tobytes())},
   'expected':out.ravel().tolist(),'expectedF32SHA256':sha(out.tobytes()),
   'rowMaximaF64':maxima.tolist(),'softmaxDenominatorF64':denominators.tolist(),
   'fixtureDefinition':{
    'uniform':'Q all zero; K baseline pattern; V baseline pattern',
    'increasing-max':'Q[:,0]=8, other Q zero; K[k,0]=f32(k/4), other K zero; V baseline pattern',
    'moderate-extreme':'Q[:,0]=32, other Q zero; K[k,0]=f32((((k*13)%193)-96)/4), other K zero; V baseline pattern'
   }[mode],
   'referenceElapsedMs':(time.perf_counter()-began)*1000,**stats,**extra})
 # This is a conservative known-array logical live amount for dense reference:
 # F32 fixtures + Q64 + one K/V64 conversion + scores64 + output64 + row stats.
 known_reference_live=q.nbytes+k.nbytes+v.nbytes+q.nbytes*2+k.nbytes*2+QCOUNT*TOTAL_KEYS*8+QCOUNT*DIM*8+QCOUNT*16
 report={
  'schemaVersion':'bernini-explicit-stream-attention-reference/0.1',
  'scope':'one-head explicit postnorm/postRoPE fixture attention; no original NN/core norm/RoPE/model or production acceptance',
  'headCount':1,'headDimension':DIM,'queryCount':QCOUNT,'keyCount':TOTAL_KEYS,
  'inputDtype':'F32','scale':float(scale),'scaleF32SHA256':sha(np.asarray([scale],dtype='<f4').tobytes()),
  'scaleFormula':'f32(1/sqrt(128))','referenceDtype':'F64 accumulation and stable softmax, final output F32',
  'referenceAlgorithm':'scores=(Q64@K64.T)*float(scaleF32); exp(scores-rowMax); output=(weights@V64)/rowSum; castF32',
  'semantics':{'allKeys':True,'causal':False,'mask':None,'dropout':0,'headCount':1,'qAndKAlreadyNormalizedAndRotated':True},
  'unverified':['original QK normalization','original RoPE/source_id generation','full head count40','original compute/softmax precision','complete attention block','production combined budget'],
  'fixture':fixture,'cases':cases,'specialCases':special_cases,'tolerance':TOLERANCE,
  'fixtureBinariesWritten':False,'numpyVersion':np.__version__,
  'referenceLogicalKnownArrayBytes':int(known_reference_live),
  'referenceMemoryScope':'known named logical arrays only; BLAS allocator/Python/OS peak not measured; not runtime live budget',
  'elapsedMs':(time.perf_counter()-started)*1000,
  'sourceSHA256':sha(Path(__file__).read_bytes()),
 }
 a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'output':str(a.output),'cases':[(c['kShape'][0],len(c['expected']),c['tailKeys']) for c in cases],'tolerance':TOLERANCE,'scale':float(scale),'fixtureBytes':q.nbytes+k.nbytes+v.nbytes,'specialCases':[c['mode'] for c in special_cases],'elapsedMs':report['elapsedMs']}))
if __name__=='__main__':main()
