import sys,importlib.util,json,time,argparse
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--work',default='/workspace/work/inference/text-implementation');parser.add_argument('--deps',default='/workspace/work/inference/vae-proof/deps');parser.add_argument('--model',default='/workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors');args=parser.parse_args();ROOT=Path(args.work);sys.path.insert(0,args.deps)
import numpy as np,torch
from safetensors import safe_open
spec=importlib.util.spec_from_file_location('prepare',Path(__file__).with_name('prepare.py'));prep=importlib.util.module_from_spec(spec);spec.loader.exec_module(prep)
torch.set_num_threads(2);mod,ops,attend=prep.source_module(ROOT/'vendor/comfy-text_encoders-t5.py',torch)
state={}
with safe_open(args.model,framework='pt') as f:
 for k in f.keys():
  if not k.startswith('encoder.block.0.') or k.endswith('.scale_weight'):continue
  v=f.get_tensor(k);state[k[len('encoder.block.0.'):]]=v.float()*f.get_tensor(k[:-7]+'.scale_weight') if v.dtype==torch.float8_e4m3fn else v.float()
 norm=f.get_tensor('encoder.final_layer_norm.weight').float()
with torch.device('meta'):b=mod.T5Block(4096,4096,10240,'gelu_pytorch_tanh',True,64,True,torch.float32,'meta',ops)
b.load_state_dict(state,strict=True,assign=True);del state;b.eval()
x=np.fromfile(ROOT/'bundle/embedding-reference.f32',dtype='<f4').reshape(1,4,4096);long=np.concatenate([x[:,:3],np.repeat(x[:,3:],509,axis=1)],axis=1)
def run(x,mask):
 x=torch.from_numpy(x.copy());mask=torch.from_numpy(mask);m=1-mask.reshape(1,1,1,-1).expand(1,1,x.shape[1],x.shape[1]);m=m.masked_fill(m.bool(),-torch.finfo(torch.float32).max)
 with torch.inference_mode():return b(x,m,None,attend)[0].numpy()
# Gates below are fixed before either padded or compact result is evaluated.
gate={'hiddenNormalizedPeakError':1e-4,'normalizedOutputMaxAbsError':.001,'scope':'one real block0, originalweights, FP32reference; arbitrary fullworkflow still separate'}
t=time.monotonic();a=run(long,np.array([[1,1,1]+[0]*509],dtype=np.float32))[:,:3];c=run(x[:,:3],np.ones((1,3),dtype=np.float32));delta=np.abs(a-c)
def normed(v):return (v/np.sqrt(np.mean(v*v,axis=-1,keepdims=True)+1e-6))*norm.numpy()
r={'sourceSha256':prep.sha(ROOT/'vendor/comfy-text_encoders-t5.py'),'paddedLength':512,'compactLength':3,'preserveInternalPositions':True,'gate':gate,'hiddenMaxAbsError':float(delta.max()),'hiddenNormalizedPeakError':float(delta.max()/np.max(np.abs(a))),'normalizedOutputMaxAbsError':float(np.max(np.abs(normed(a)-normed(c)))),'seconds':time.monotonic()-t}
r['pass']=r['hiddenNormalizedPeakError']<=gate['hiddenNormalizedPeakError'] and r['normalizedOutputMaxAbsError']<=gate['normalizedOutputMaxAbsError'];(ROOT/'compact-proof.json').write_text(json.dumps(r,indent=2));print(json.dumps(r),flush=True);assert r['pass']
