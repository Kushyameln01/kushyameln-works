"""Independent N2/all40 downstream reference; actual hidden and independent-prefix modes stay separate."""
import argparse,hashlib,json,math,os,struct,time,importlib.util
from pathlib import Path
os.environ['OPENBLAS_NUM_THREADS']='1';os.environ['OMP_NUM_THREADS']='1'
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('p4_reference',ROOT/'tools/diffusion-models/p4-reference.py');old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
sha=old.sha;f32=np.float32

def generate(models,side,hidden,metadata,mode,source_hash):
 plan_bytes=(ROOT/'development/ai-connection/qkv-next/expansion/candidate-plan.json').read_bytes();plan=json.loads(plan_bytes);assert plan['status']=='PRE_EXECUTION_GATE_FIXED' and plan['gateMayNotBeRelaxedAfterComparison']
 name,modelhash,headerhash=old.MODELS[side];path=models/name;before=path.stat();assert before.st_size==15574833216
 hidden=np.asarray(hidden,dtype='<f4').reshape(2,5120);assert np.isfinite(hidden).all()
 if metadata.get('modelHash',metadata.get('modelSha256'))!=modelhash:raise ValueError('Input/model source mismatch')
 coords=[{'t':0,'h':0,'w':0,'sourceId':0},{'t':0,'h':0,'w':1,'sourceId':0}]
 lut=np.asarray([old.decode_e4m3fn(x) for x in range(256)],dtype='<f4');qkv={};norm={};ranges=[];readbytes=0;maxread=0
 with path.open('rb') as file:
  def read(offset,count):
   nonlocal readbytes,maxread
   assert 0<=offset<=before.st_size-count and 0<count<=181280;file.seek(offset);b=file.read(count);assert len(b)==count;readbytes+=count;maxread=max(maxread,count);return b
  hsize=struct.unpack('<Q',read(0,8))[0];assert hsize==181280;hb=read(8,hsize);assert sha(hb)==headerhash;header=json.loads(hb);payload=8+hsize
  def descriptor(key,dtype,shape):
   d=header[key];assert d['dtype']==dtype and d['shape']==shape;return d
  for c in ('q','k','v'):
   key='blocks.0.self_attn.'+c;d=descriptor(key+'.weight','F8_E4M3',[5120,5120]);sd=descriptor(key+'.weight_scale','F32',[]);cd=descriptor(key+'.comfy_quant','U8',[27]);bd=descriptor(key+'.bias','F16',[5120]);sr=read(payload+sd['data_offsets'][0],4);scale=np.frombuffer(sr,dtype='<f4')[0];cr=read(payload+cd['data_offsets'][0],27);assert cr==b'{"format": "float8_e4m3fn"}' and math.isfinite(float(scale)) and scale>0
   br=read(payload+bd['data_offsets'][0],10240);bias=np.frombuffer(br,dtype='<f2').astype('<f4');out=np.empty((2,5120),dtype='<f4');rh=hashlib.sha256();dh=hashlib.sha256()
   for row in range(0,5120,16):
    raw=read(payload+d['data_offsets'][0]+row*5120,81920);rh.update(raw);weight=(lut[np.frombuffer(raw,dtype='u1')].reshape(16,5120)*scale).astype('<f4');assert np.isfinite(weight).all();dh.update(weight.tobytes());projected=(hidden.astype(np.float64)@weight.astype(np.float64).T).astype('<f4');out[:,row:row+16]=(projected+bias[row:row+16]).astype('<f4')
   qkv[c]=out;ranges.append({'key':key+'.weight','fullShape':[5120,5120],'storageDtype':'F8_E4M3','rawSHA256':rh.hexdigest(),'decodedF32SHA256':dh.hexdigest(),'scaleSHA256':sha(sr),'configSHA256':sha(cr),'biasF32SHA256':sha(bias.tobytes())})
  for c in ('q','k'):
   key='blocks.0.self_attn.norm_'+c+'.weight';d=descriptor(key,'F16',[5120]);raw=read(payload+d['data_offsets'][0],10240);weight=np.frombuffer(raw,dtype='<f2').astype('<f4');v=qkv[c].astype(np.float64);norm[c]=(v/np.sqrt(np.mean(v*v,axis=1,keepdims=True)+float(f32(1e-6)))*weight.astype(np.float64)).astype('<f4');ranges.append({'key':key,'decodedF32SHA256':sha(weight.tobytes())})
 after=path.stat();assert (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns)
 matrices=np.stack([np.concatenate([old.axis_rope(c[a],d) for a,d in zip(('t','h','w'),(44,42,42))]) for c in coords]).astype('<f4')
 def rope(values):
  pairs=values.reshape(2,40,64,2);out=np.empty_like(pairs)
  for i in range(2):out[:,:,:,i]=((matrices[:,None,:,i,0]*pairs[:,:,:,0]).astype('<f4')+(matrices[:,None,:,i,1]*pairs[:,:,:,1]).astype('<f4')).astype('<f4')
  return out.reshape(2,5120)
 q=rope(norm['q']);k=rope(norm['k']);v=qkv['v'].copy();context=np.empty((2,40,128),dtype='<f4');scale=float(f32(1/math.sqrt(128)))
 for h in range(40):
  qq=q.reshape(2,40,128)[:,h,:].astype(np.float64);kk=k.reshape(2,40,128)[:,h,:].astype(np.float64);vv=v.reshape(2,40,128)[:,h,:].astype(np.float64);score=(qq@kk.T)*scale;ex=np.exp(score-np.max(score,axis=1,keepdims=True));context[:,h,:]=(ex/np.sum(ex,axis=1,keepdims=True)@vv).astype('<f4')
 arrays={'hidden':hidden,'matrices':matrices,'q':q,'k':k,'v':v,'attention':context.reshape(2,5120),**{'qkv.'+c:a for c,a in qkv.items()},**{'norm.'+c:a for c,a in norm.items()}}
 identities={name:old.array_identity(a) for name,a in arrays.items()};expected={'qkv':{c:a.reshape(-1).tolist() for c,a in qkv.items()},'norm':{c:a.reshape(-1).tolist() for c,a in norm.items()},**{name:arrays[name].reshape(-1).tolist() for name in ('matrices','q','k','v','attention')}}
 return {'schemaVersion':'bernini-derived-heads-reference/0.1','mode':mode,'side':side,'modelHash':modelhash,'planSHA256':sha(plan_bytes),'inputArtifactSHA256':source_hash,'inputEvidence':metadata,'hidden':hidden.reshape(-1).tolist(),'coords':coords,'gates':plan['gates'],'expected':expected,'arrayIdentities':identities,'ranges':ranges,'originalFileBytesRead':readbytes,'maxSingleReadBytes':maxread,'referenceBackend':'NumPy binary64 Gemm/reduction/attention; independent E4M3FN/F16; ordered F32 bias and RoPE; one BLAS thread','scope':'N2 all40 before O; original workflow false','load':'NOT_READY','predict':'NOT_READY','sample':'NOT_READY'}

def main():
 p=argparse.ArgumentParser();p.add_argument('--models',type=Path,required=True);p.add_argument('--side',choices=old.MODELS,required=True);group=p.add_mutually_exclusive_group(required=True);group.add_argument('--input-hidden',type=Path);group.add_argument('--prefix-reference',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--receipt',type=Path,required=True);a=p.parse_args();path=a.input_hidden or a.prefix_reference;raw=path.read_bytes();source=json.loads(raw);mode='LOCAL_ACTUAL_HIDDEN' if a.input_hidden else 'COMPOSED_INDEPENDENT_PREFIX';hidden=source['hidden'] if a.input_hidden else source['expected']['hidden'];metadata=source['evidence'] if a.input_hidden else source['meta'];t=time.perf_counter();result=generate(a.models,a.side,hidden,metadata,mode,sha(raw))
 if not a.output.is_absolute() or a.output.resolve().is_relative_to(ROOT) or a.output.exists():raise ValueError('New private output outside repo required')
 data=(json.dumps(result,separators=(',',':'),allow_nan=False)+'\n').encode();a.output.parent.mkdir(parents=True,exist_ok=True);fd=os.open(a.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:f.write(data)
 receipt={k:v for k,v in result.items() if k not in ('hidden','expected','inputEvidence')};receipt.update(referenceSHA256=sha(data),referenceBytes=len(data),generatorSHA256=sha(Path(__file__).read_bytes()),elapsedSeconds=time.perf_counter()-t,privateArrayPayloadPublished=False);a.receipt.parent.mkdir(parents=True,exist_ok=True);a.receipt.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'mode':mode,'side':a.side,'elapsedSeconds':receipt['elapsedSeconds'],'referenceSHA256':receipt['referenceSHA256']}))
if __name__=='__main__':main()
