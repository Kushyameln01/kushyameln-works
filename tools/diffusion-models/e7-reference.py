"""Independent bounded Q-row tiling reference; no Hike, ORT, LoRA or full NN.

Decode actual E4M3FN bits independently; round decoded scale multiplication to
F32; use F64 accumulation, round projection to F32, then add F16->F32 bias in
F32. This checks the declared F32 diagnostic boundary, not original scaled_mm.
"""
import argparse
import hashlib
import json
import math
import os
import struct
import time
from pathlib import Path

# Fix the reference BLAS policy before NumPy import; no hidden host fan-out.
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
import numpy as np

MODELS = {
 'LOW': {
  'name':'Bernini_LOW_fp8_e4m3fn_scaled.safetensors',
  'sha256':'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3',
  'headerSHA256':'286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b'},
 'HIGH': {
  'name':'Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors',
  'sha256':'9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52',
  'headerSHA256':'d8aec897e3af480492d7eca7b57141ea968e89cde7f46ea7886db11754ebd6e3'}
}
sha = lambda b: hashlib.sha256(b).hexdigest()

def decode(c):
 exponent=(c >> 3) & 15
 mantissa=c & 7
 if exponent == 15 and mantissa == 7:
  return math.nan
 value=math.ldexp(mantissa,-9) if exponent == 0 else math.ldexp(1+mantissa/8,exponent-7)
 return -value if c & 128 else value


def main():
 p=argparse.ArgumentParser()
 p.add_argument('--models',required=True,type=Path)
 p.add_argument('--output',required=True,type=Path)
 p.add_argument('--side',choices=MODELS,default='LOW')
 a=p.parse_args()
 model=MODELS[a.side]
 path=a.models/model['name']
 original_stat=path.stat()
 started=time.perf_counter()
 tolerance={'absolute':1e-4,'relative':1e-5,'fixedBeforeRuntimeComparison':True}
 lut=np.asarray([decode(i) for i in range(256)],dtype='<f4')
 activation=np.asarray([((i % 31)-15)/64 for i in range(5120)],dtype='<f4')
 activation64=activation.astype(np.float64)
 result=np.empty(5120,dtype='<f4')
 weights=np.empty((16,5120),dtype='<f4')
 tiles=[]
 bytes_read=0
 with path.open('rb') as f:
  prefix=f.read(8);bytes_read+=len(prefix)
  header_size=struct.unpack('<Q',prefix)[0]
  raw_header=f.read(header_size);bytes_read+=len(raw_header)
  assert sha(raw_header)==model['headerSHA256']
  assert path.stat().st_size==15574833216
  h=json.loads(raw_header)
  wkey='blocks.0.self_attn.q.weight'
  bkey='blocks.0.self_attn.q.bias'
  skey='blocks.0.self_attn.q.weight_scale'
  ckey='blocks.0.self_attn.q.comfy_quant'
  assert h[wkey]['dtype']=='F8_E4M3' and h[wkey]['shape']==[5120,5120]
  assert h[bkey]['dtype']=='F16' and h[bkey]['shape']==[5120]
  assert h[skey]['dtype']=='F32' and h[skey]['shape']==[]
  assert h[ckey]['dtype']=='U8' and h[ckey]['shape']==[27]
  payload=8+header_size
  def read(key,offset,length):
   nonlocal bytes_read
   f.seek(payload+h[key]['data_offsets'][0]+offset)
   raw=f.read(length)
   assert len(raw)==length
   bytes_read+=length
   return raw
  scale_raw=read(skey,0,4)
  scale=struct.unpack('<f',scale_raw)[0]
  assert math.isfinite(scale) and scale>0
  config_raw=read(ckey,0,27)
  assert config_raw==b'{"format": "float8_e4m3fn"}'
  for row in range(0,5120,16):
   raw=read(wkey,row*5120,81920)
   codes=np.frombuffer(raw,dtype=np.uint8).reshape(16,5120)
   assert not np.any((codes & 127)==127)
   np.take(lut,codes,out=weights)
   np.multiply(weights,np.float32(scale),out=weights)
   bias_raw=read(bkey,row*2,32)
   bias=np.asarray([v[0] for v in struct.iter_unpack('<e',bias_raw)],dtype='<f4')
   # BLAS inputs are bounded one-tile temporaries, never full weight matrices.
   projected64=weights.astype(np.float64) @ activation64
   projected=projected64.astype('<f4')
   np.add(projected,bias,out=result[row:row+16])
   tiles.append({'rowStart':row,'rowCount':16,'rawWeightSHA256':sha(raw),
                 'weightF32SHA256':sha(weights.tobytes()),'biasRawSHA256':sha(bias_raw),
                 'biasF32SHA256':sha(bias.tobytes()),'outputF32SHA256':sha(result[row:row+16].tobytes())})
 elapsed=(time.perf_counter()-started)*1000
 after_stat=path.stat()
 assert (after_stat.st_size,after_stat.st_mtime_ns)==(original_stat.st_size,original_stat.st_mtime_ns),'Original file changed during bounded reads'
 assert np.isfinite(result).all()
 report={
  'scope':'E7 single-token full-Q Linear output-row tiling reference only; no full model/attention/LoRA/original FP8 scaled_mm acceptance',
  'model':{'side':a.side,**model,'fullSHA256Role':'previous verified retained-original identity; not recomputed',
           'fileBytes':path.stat().st_size},
  'originalKey':wkey,'biasOriginalKey':bkey,'fullWeightShape':[5120,5120],
  'activationShape':[1,5120],'outputShape':[1,5120],'tileWeightShape':[16,5120],
  'tileCount':320,'computeProfile':'scaled-e4m3fn-scalar-f32-v1',
  'storageDtype':'F8_E4M3','computeDtype':'F32','biasStorageDtype':'F16',
  'scale':scale,'scaleSHA256':sha(scale_raw),'quantizationConfigSHA256':sha(config_raw),
  'referenceArithmetic':'independent Python E4M3FN lookup; F32 scale; F64 accumulation; projection F32; F32 bias addition',
  'activation':'x[i]=f32(((i%31)-15)/64), i=0..5119',
  'activationSHA256':sha(activation.tobytes()),'tolerance':tolerance,
  'expected':result.tolist(),'smallExpected':result[:16].tolist(),
  'expectedF32SHA256':sha(result.tobytes()),'smallExpectedF32SHA256':sha(result[:16].tobytes()),
  'tiles':tiles,'bytesRead':bytes_read,'weightPayloadBytesRead':5120*5120,
  'largestRawWeightRead':81920,'largestF32WeightArray':327680,
  'largestF64DotWeightTemporary':655360,
  'fullWeightMatrixMaterialized':False,'fullFileSHA256Recomputed':False,
  'sourceStatStableDuringRead':True,
  'elapsedMs':elapsed,'numpyVersion':np.__version__,
  'blasThreads':{'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1'},
  'sourceSHA256':sha(Path(__file__).read_bytes()),
 }
 a.output.parent.mkdir(parents=True,exist_ok=True)
 a.output.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'path':str(a.output),'side':a.side,'outputs':len(result),'tiles':len(tiles),'bytesRead':bytes_read,'elapsedMs':elapsed,'expectedSHA256':report['expectedF32SHA256']}))

if __name__=='__main__':main()
