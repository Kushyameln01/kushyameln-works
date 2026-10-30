#!/usr/bin/env python3
"""Export unchanged Wan2.1 VAE weights to a local, fixed-shape ORT/Hike profile.

Output contains private model weights. Do not put output under docs/ or publish it.
"""
import argparse,hashlib,json,pathlib,sys,time
ROOT=pathlib.Path(__file__).resolve().parent
MODEL_HASH='2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'
def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  while chunk:=f.read(16*1024*1024):h.update(chunk)
 return h.hexdigest()
def args():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--model',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path)
 p.add_argument('--frames',type=int,default=5);p.add_argument('--height',type=int,default=16);p.add_argument('--width',type=int,default=16)
 p.add_argument('--deps',type=pathlib.Path,help='Optional isolated Python dependency directory, no package installation performed')
 return p.parse_args()
def main():
 a=args();dest=a.output.resolve()
 if a.frames<1 or a.frames%4!=1 or min(a.height,a.width)<16 or a.height%16 or a.width%16:raise ValueError('Frames must be4n+1; height/width must be multiplesof16 >=16')
 if 'docs' in dest.parts:raise ValueError('Private profile output must be outside public docs/')
 if dest.exists():raise FileExistsError('Select a new output directory; existing bundles are not overwritten')
 if sha(a.model)!=MODEL_HASH:raise ValueError('Original Wan2.1 VAE model SHA256 mismatch')
 expected=json.loads((ROOT/'vendor/source.json').read_text())
 if sha(ROOT/'vendor/vae.py')!=expected['sha256']:raise ValueError('Pinned official VAE source hash mismatch')
 if a.deps:sys.path.insert(0,str(a.deps.resolve()))
 sys.path[:0]=[str(ROOT/'vendor'),str(ROOT)]
 import torch,numpy as np,onnx
 from safetensors.torch import load_file
 from vae import WanVAE_
 from nearest_exact_symbolic import register
 register();torch.set_num_threads(2);torch.set_num_interop_threads(1)
 dest.mkdir(parents=True)
 with torch.device('meta'):model=WanVAE_(dim=96,z_dim=16,dim_mult=[1,2,4,4],num_res_blocks=2,attn_scales=[],temperal_downsample=[False,True,True],dropout=0.)
 state=load_file(str(a.model));loaded=model.load_state_dict(state,strict=True,assign=True);del state
 model=model.float().eval()
 class Encode(torch.nn.Module):
  def __init__(self,m):super().__init__();self.model=m
  def forward(self,x):return self.model.encode(x,[0.,1.])
 class DecodeBody(torch.nn.Module):
  def __init__(self,m):super().__init__();self.model=m
  def forward(self,x):
   self.model.clear_cache()
   for index in range(x.shape[2]):
    self.model._conv_idx=[0]
    step=self.model.decoder(x[:,:,index:index+1,:,:],feat_cache=self.model._feat_map,feat_idx=self.model._conv_idx)
    output=step if index==0 else torch.cat([output,step],2)
   self.model.clear_cache();return output
 video_shape=[1,3,a.frames,a.height,a.width];latent_shape=[1,16,(a.frames-1)//4+1,a.height//8,a.width//8]
 x=torch.linspace(-1.,1.,int(np.prod(video_shape)),dtype=torch.float32).reshape(video_shape)
 z=torch.linspace(-.25,.25,int(np.prod(latent_shape)),dtype=torch.float32).reshape(latent_shape)
 def binary(name,tensor):
  path=dest/name;array=tensor.detach().cpu().numpy().astype('<f4');path.write_bytes(array.tobytes());return {'file':name,'bytes':path.stat().st_size,'sha256':sha(path),'shape':list(array.shape)}
 manifest=json.loads((ROOT/'profile.json').read_text());manifest['profile'].update(id=f'wan21-raw-f32-{a.frames}x{a.height}x{a.width}',videoShape=video_shape,latentShape=latent_shape)
 manifest['validation']={'status':'exported; browser validation still required for this bundle/profile','strictModelState':True,'keys':194,'missingKeys':list(loaded.missing_keys),'unexpectedKeys':list(loaded.unexpected_keys)}
 manifest['source']=expected;manifest['versions']={'torch':torch.__version__,'onnx':onnx.__version__,'numpy':np.__version__}
 manifest['lowering']={'operation':'nearest-exact 2x upsample -> ONNX Resize nearest half_pixel round_prefer_floor','sourceSha256':sha(ROOT/'nearest_exact_symbolic.py'),'opset':17}
 manifest['references']={};started=time.monotonic()
 with torch.inference_mode():
  assert list(model.conv2.weight.shape)==[16,16,1,1,1]
  manifest['assets']['conv2Weight']=binary('conv2-weight.f32',model.conv2.weight.reshape(16,16))
  manifest['assets']['conv2Bias']=binary('conv2-bias.f32',model.conv2.bias)
  encoded=Encode(model)(x);after=model.conv2(z);decoded=DecodeBody(model)(after)
  assert list(encoded.shape)==latent_shape and list(decoded.shape)==video_shape
  torch.testing.assert_close(decoded,model.decode(z,[0.,1.]),atol=0,rtol=0)
  for op,inp,expected_output in [('encode',x,encoded),('decode',z,decoded)]:
   manifest['references'][op]={'input':binary(op+'-input.f32',inp),'output':binary(op+'-reference.f32',expected_output)}
  manifest['references']['conv2']={'input':binary('conv2-input.f32',z),'output':binary('conv2-reference.f32',after)}
  for role,wrapper,inp,name in [('encoder',Encode(model),x,'encode.onnx'),('decoderBody',DecodeBody(model),after,'decoder-body.onnx')]:
   path=dest/name;torch.onnx.export(wrapper,(inp,),str(path),opset_version=17,input_names=['input'],output_names=['output'],dynamo=False,do_constant_folding=True)
   onnx.checker.check_model(str(path));manifest['assets'][role]={'file':name,'bytes':path.stat().st_size,'sha256':sha(path)}
 manifest['exportSeconds']=time.monotonic()-started
 manifest['validation']['numericGate']={'atol':.002,'rtol':.002,'maxAbs':.002,'scope':'Explicit FP32 reference threshold; run browser checks before declaring profile accepted'}
 (dest/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps({'profile':manifest['profile']['id'],'manifest':str(dest/'manifest.json'),'assets':manifest['assets'],'validation':manifest['validation']}))
if __name__=='__main__':main()
