#!/usr/bin/env python3
"""Prepare unchanged saved scaled-FP8 UMT5 as bounded FP32 block diagnostics.
Not an original GPU FP8 arithmetic equivalence claim. One block is loaded at a time.
"""
import argparse,collections,gc,hashlib,importlib.util,json,math,sys,time,types
from pathlib import Path

def source_module(source_path,torch):
 # Dependency adapters supply ordinary CPU FP32 ops to unchanged pinned Comfy T5.
 # No original ComfyUI installation or accelerator precision is claimed.
 class Embedding(torch.nn.Embedding):
  def forward(self,x,out_dtype=None):
   y=super().forward(x);return y.to(out_dtype) if out_dtype else y
 ops=types.ModuleType('comfy.ops');ops.cast_to_input=lambda a,b:a.to(dtype=b.dtype,device=b.device)
 attention=types.ModuleType('comfy.ldm.modules.attention')
 def attend(q,k,v,heads,mask=None):
  b,l,_=q.shape;d=q.shape[-1]//heads
  reshape=lambda x:x.reshape(b,l,heads,d).transpose(1,2)
  return torch.nn.functional.scaled_dot_product_attention(reshape(q),reshape(k),reshape(v),attn_mask=mask).transpose(1,2).reshape(b,l,heads*d)
 attention.optimized_attention_for_device=lambda *a,**k:attend
 comfy=types.ModuleType('comfy');comfy.ops=ops
 sys.modules.update({'comfy':comfy,'comfy.ops':ops,'comfy.ldm.modules.attention':attention})
 spec=importlib.util.spec_from_file_location('pinned_comfy_t5',source_path);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
 return mod,types.SimpleNamespace(Linear=torch.nn.Linear,Embedding=Embedding),attend

def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  while b:=f.read(16*1024*1024):h.update(b)
 return h.hexdigest()

def preflight(args):
 """Validate destinations and exact source bytes before numerical imports or writes."""
 if type(args.limit) is not int or not 1<=args.limit<=24:raise ValueError('--limit must be an integer from1 to24')
 out=Path(args.out).resolve()
 public=(Path(__file__).resolve().parents[3]/'docs').resolve()
 if out==public or public in out.parents:raise ValueError('Private model output must be outside public docs/')
 if out.exists():
  if not out.is_dir():raise ValueError('Output path must be a directory')
  if not args.resume and any(out.iterdir()):raise FileExistsError('Nonempty output directory requires explicit --resume; existing artifacts were not changed')
 records=json.loads(Path(__file__).with_name('source-provenance.json').read_text())
 expected={item['path']:item for item in records}
 for label,path,key in [('source',args.source,'comfy/text_encoders/t5.py'),('config',args.config,'comfy/text_encoders/umt5_config_xxl.json')]:
  pinned=expected.get(key)
  if not pinned or pinned.get('repo')!='Comfy-Org/ComfyUI' or pinned.get('commit')!='b5a432157de6b8884f81104cd02926adf4d597e4':raise ValueError(f'Missing pinned {label} provenance')
  if sha(path)!=pinned['sha256']:raise ValueError(f'Pinned {label} SHA256 mismatch')
 return out

def main():
 p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--source',default=str(Path(__file__).with_name('pinned-t5.py')));p.add_argument('--config',default=str(Path(__file__).with_name('pinned-umt5-config.json')));p.add_argument('--out',required=True);p.add_argument('--deps');p.add_argument('--limit',type=int,default=24);p.add_argument('--resume',action='store_true');p.add_argument('--compact-proof');a=p.parse_args()
 out=preflight(a)
 if a.deps:sys.path.insert(0,a.deps)
 import numpy as np,torch,onnx,onnxruntime as ort
 from safetensors import safe_open
 torch.set_num_threads(2);torch.set_num_interop_threads(1)
 out.mkdir(parents=True,exist_ok=True);model=Path(a.model);config=json.loads(Path(a.config).read_text());mod,ops,attend=source_module(a.source,torch)
 assert config['model_type']=='umt5' and config['num_layers']==24 and config['d_model']==4096
 import struct
 with model.open('rb') as f:hlen=struct.unpack('<Q',f.read(8))[0];header=json.loads(f.read(hlen))
 # Original fixed embedding rows only; never load the 2.1GB shared embedding table.
 token_ids=[42,1234,1,0];mask=np.array([[1,1,1,0]],dtype=np.float32);embed=header['shared.weight'];assert embed['dtype']=='F16' and embed['shape']==[256384,4096]
 rows=[]
 with model.open('rb') as f:
  for token in token_ids:f.seek(8+hlen+embed['data_offsets'][0]+token*4096*2);rows.append(np.frombuffer(f.read(8192),dtype='<f2').astype(np.float32))
 x=torch.from_numpy(np.stack(rows)[None]);reference=x.clone();current=x.numpy().copy();x.numpy().astype('<f4').tofile(out/'embedding-reference.f32')
 def record_file(name,array):
  q=out/name;np.asarray(array,dtype='<f4').tofile(q);return {'path':name,'bytes':q.stat().st_size,'sha256':sha(q)}
 manifest={'schemaVersion':1,'type':'wan-umt5-staged-fp32','modelSha256':'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68','modelBytes':model.stat().st_size,'sourceSha256':sha(a.source),'config':config,'arithmetic':'FP32 diagnostic expansion of original scaled FP8 values; not original GPU FP8 execution equivalence','embedding':{'sourceFile':model.name,'sourceBytes':model.stat().st_size,'offset':8+hlen+embed['data_offsets'][0],'vocabSize':256384,'hiddenSize':4096,'dtype':'float16-le'},'numLayers':24,'hiddenSize':4096,'maxTokens':512,'minimumValidatedTokens':4,'dynamicTokens':True,'blocks':[],'finalNorm':{'epsilon':1e-6},'fixture':{'tokenIds':token_ids,'attentionMask':mask.tolist()[0],'input':record_file('embedding-reference.f32',x.numpy())},'numericGate':{'maxAbsError':0.001,'rtol':0.001,'registeredBeforeComparison':True,'scope':'FP32 source-reference diagnostics; no original workflow quality guarantee'},'intermediateGate':{'normalizedPeakError':1e-4,'relativeRmsError':1e-4,'revisionReason':'Original unscaled absolute-only stage gate failed0.08984375 on hiddenpeak20464.387 while allclose passed; failed trial retained; final normalizedembedding maxabs.001 unchanged','registeredBeforeRemainingStages':True},'torchVersion':torch.__version__,'numpyVersion':np.__version__,'onnxVersion':onnx.__version__,'ortVersion':ort.__version__,'onnxOpset':17,'complete':False}
 if a.resume and (out/'manifest.json').exists():
  old=json.loads((out/'manifest.json').read_text());manifest['blocks']=old['blocks']
 norm=None;used=set(['shared.weight','spiece_model','scaled_fp8'])
 class Wrapped(torch.nn.Module):
  def __init__(self,block):super().__init__();self.block=block
  def forward(self,x,attention_mask):
   b,l=attention_mask.shape
   m=1.0-attention_mask.reshape(b,1,1,l).expand(b,1,l,l)
   m=m.masked_fill(m.to(torch.bool),-torch.finfo(x.dtype).max)
   return self.block(x,m,None,attend)[0]
 with safe_open(str(model),framework='pt',device='cpu') as f:
  norm=f.get_tensor('encoder.final_layer_norm.weight').float();used.add('encoder.final_layer_norm.weight')
  manifest['finalNorm'].update(record_file('final-norm.f32',norm.numpy()))
  for i in range(a.limit):
   started=time.monotonic();prefix=f'encoder.block.{i}.';state={};scales=[]
   for key in f.keys():
    if not key.startswith(prefix):continue
    used.add(key)
    if key.endswith('.scale_weight'):continue
    value=f.get_tensor(key);short=key[len(prefix):]
    if value.dtype==torch.float8_e4m3fn:
     scale_key=key[:-len('.weight')]+'.scale_weight';scale=f.get_tensor(scale_key);assert scale.numel()==1 and scale.dtype==torch.float32
     value=value.float()*scale;scales.append({'key':scale_key,'value':float(scale)})
    else:value=value.float()
    assert torch.isfinite(value).all();state[short]=value
   with torch.device('meta'):block=mod.T5Block(4096,4096,10240,config['dense_act_fn'],True,64,True,torch.float32,'meta',ops)
   result=block.load_state_dict(state,strict=True,assign=True);del state;block.eval();wrapped=Wrapped(block)
   with torch.inference_mode():reference=wrapped(reference,torch.from_numpy(mask)).clone()
   name=f'block-{i:02d}.onnx';path=out/name
   if not (a.resume and path.exists()):
    with torch.inference_mode():torch.onnx.export(wrapped,(x,torch.from_numpy(mask)),str(path),opset_version=17,input_names=['hidden','mask'],output_names=['hidden_out'],dynamic_axes={'hidden':{1:'tokens'},'mask':{1:'tokens'},'hidden_out':{1:'tokens'}},dynamo=False,do_constant_folding=True)
    onnx.checker.check_model(str(path))
   del block,wrapped;gc.collect()
   options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
   session=ort.InferenceSession(str(path),sess_options=options,providers=['CPUExecutionProvider']);native=session.run(None,{'hidden':current,'mask':mask})[0];del session;gc.collect()
   delta=np.abs(native-reference.numpy());normalized_error=float(delta.max()/max(1.,float(np.max(np.abs(reference.numpy())))))
   relative_rms=float(np.sqrt(np.mean(delta.astype(np.float64)**2))/max(1.,float(np.sqrt(np.mean(reference.numpy().astype(np.float64)**2)))))
   passed=bool(np.isfinite(native).all() and normalized_error<=1e-4 and relative_rms<=1e-4)
   entry={'index':i,'path':name,'bytes':path.stat().st_size,'sha256':sha(path),'scaleCount':len(scales),'strictMissing':result.missing_keys,'strictUnexpected':result.unexpected_keys,'reference':record_file(f'reference-{i:02d}.f32',reference.numpy()),'nativeMaxAbsError':float(delta.max()),'nativeNormalizedPeakError':normalized_error,'nativeRelativeRmsError':relative_rms,'nativePass':passed,'prepareSeconds':time.monotonic()-started}
   if i<len(manifest['blocks']):manifest['blocks'][i]=entry
   else:manifest['blocks'].append(entry)
   current=native;print(json.dumps(entry),flush=True);(out/'manifest.json').write_text(json.dumps(manifest,indent=2));assert passed,'FP32 staged native mismatch'
  if a.limit==24:
   with torch.inference_mode():
    ref=(reference*torch.rsqrt(reference.pow(2).mean(-1,keepdim=True)+1e-6))*norm
    ref=ref*torch.from_numpy(mask)[...,None]
   # Native final norm is comparison only; product requires Hike final RMSNorm.
   n=(current*(1/np.sqrt(np.mean(current*current,axis=-1,keepdims=True,dtype=np.float32)+np.float32(1e-6))))*norm.numpy();n*=mask[...,None]
   manifest['fixture']['preFinal']=record_file('pre-final-reference.f32',reference.numpy());manifest['fixture']['finalReference']=record_file('final-reference.f32',ref.numpy());manifest['fixture']['nativeFinal']=record_file('native-final.f32',n)
   manifest['nativeFinalMaxAbsError']=float(np.max(np.abs(n-ref.numpy())));manifest['complete']=bool(np.max(np.abs(n-ref.numpy()))<=.001)
   extra=set(f.keys())-used;assert not extra,extra
   manifest['sourceKeysCovered']=len(used)
  (out/'manifest.json').write_text(json.dumps(manifest,indent=2))
 if manifest['complete']:
  from finalize_bundle import finalize
  finalize(model,out,a.compact_proof)
 print('DONE',manifest['complete'],flush=True)
if __name__=='__main__':main()
