"""Independent bounded reference; original base only, no LoRA or full NN."""
import argparse,json,hashlib,math,struct
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--models',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
f32=lambda x:struct.unpack('<f',struct.pack('<f',x))[0]
def fp8(c):
 e=(c>>3)&15;m=c&7
 if e==15 and m==7:raise ValueError('NaN')
 v=math.ldexp(m,-9) if e==0 else math.ldexp(1+m/8,e-7)
 return -v if c&128 else v
records=[]
for side,name in [('LOW','Bernini_LOW_fp8_e4m3fn_scaled.safetensors'),('HIGH','Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors')]:
 with (a.models/name).open('rb') as f:
  n=struct.unpack('<Q',f.read(8))[0];raw=f.read(n);h=json.loads(raw);start=n+8
  def read(k,n):f.seek(start+h[k]['data_offsets'][0]);return f.read(n)
  q=read('blocks.0.self_attn.q.weight',81920);br=read('blocks.0.self_attn.q.bias',32);sr=read('blocks.0.self_attn.q.weight_scale',4)
  s=struct.unpack('<f',sr)[0];w=[f32(fp8(c)*s) for c in q];b=[x[0] for x in struct.iter_unpack('<e',br)]
  x=[0.]*5120;x[0]=.25;x[17]=-.5;x[5119]=1.
  expected=[];patched=[]
  for r in range(16):
   v=f32(f32(f32(w[r*5120]*x[0])+f32(w[r*5120+17]*x[17]))+w[r*5120+5119]);expected.append(f32(v+b[r]))
   pw=f32(w[r*5120]+.125) if r==0 else w[r*5120]
   pb=f32(b[r]+.25) if r==0 else b[r]
   v=f32(f32(f32(pw*x[0])+f32(w[r*5120+17]*x[17]))+w[r*5120+5119]);patched.append(f32(v+pb))
  records.append({'side':side,'name':name,'headerSHA256':hashlib.sha256(raw).hexdigest(),'scale':s,'weightSHA256':hashlib.sha256(struct.pack('<81920f',*w)).hexdigest(),'biasSHA256':hashlib.sha256(struct.pack('<16f',*b)).hexdigest(),'rawWeightSHA256':hashlib.sha256(q).hexdigest(),'rawBiasSHA256':hashlib.sha256(br).hexdigest(),'expected':expected,'explicitF32PatchedExpected':patched,'payloadBytesRead':81956})
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps({'scope':'independent real-base selected rows; explicit F32 change is a consumer test, not LoRA','activation':{'0':.25,'17':-.5,'5119':1},'tolerance':{'absolute':1e-6,'relative':1e-5},'models':records},indent=2)+'\n');print(a.output)
