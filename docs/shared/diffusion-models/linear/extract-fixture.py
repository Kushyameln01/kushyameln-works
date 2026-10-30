#!/usr/bin/env python3
"""Private real-weight fixture; reads only16 contiguous q rows,16 bias values and scalar scale."""
import argparse,hashlib,json,math,struct
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--models-root',required=True,type=Path);p.add_argument('--output',required=True,type=Path);args=p.parse_args();args.output.mkdir(parents=True,exist_ok=True)
f32=lambda v:struct.unpack('<f',struct.pack('<f',v))[0]
def decode(n):
 sign=-1 if n&128 else 1;e=(n>>3)&15;m=n&7
 if e==15 and m==7:raise ValueError('E4M3FN NaN rejected')
 return sign*math.ldexp(m,-9) if e==0 else sign*math.ldexp(1+m/8,e-7)
manifest=json.loads((args.models_root/'manifest.json').read_text());hashes={x['name']:x['sha256'] for x in manifest};records=[]
# Tolerance fixed before kernel is built or actual candidate executed.
for role,name in [('LOW','Bernini_LOW_fp8_e4m3fn_scaled.safetensors'),('HIGH','Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors')]:
 path=args.models_root/name
 with path.open('rb') as f:
  n=struct.unpack('<Q',f.read(8))[0];header=json.loads(f.read(n));start=8+n
  qkey='blocks.0.self_attn.q.weight';bkey='blocks.0.self_attn.q.bias';skey='blocks.0.self_attn.q.weight_scale'
  assert header[qkey]['dtype']=='F8_E4M3' and header[qkey]['shape']==[5120,5120]
  assert header[bkey]['dtype']=='F16' and header[bkey]['shape']==[5120]
  def read(key,size):f.seek(start+header[key]['data_offsets'][0]);return f.read(size)
  raw=read(qkey,16*5120);scale=struct.unpack('<f',read(skey,4))[0];bias=[v[0] for v in struct.iter_unpack('<e',read(bkey,32))]
  assert len(raw)==81920 and math.isfinite(scale) and scale>0
  xs=[f32(((i%31)-15)/64) for i in range(5120)];staged=[];double=[]
  for row in range(16):
   acc=0.;acc64=0.
   for col in range(5120):
    w=f32(decode(raw[row*5120+col])*scale);acc=f32(acc+f32(w*xs[col]));acc64+=decode(raw[row*5120+col])*scale*xs[col]
   staged.append(f32(acc+bias[row]));double.append(acc64+bias[row])
  prefix=role.lower();qfile=prefix+'.q8';bfile=prefix+'.bias.f32';(args.output/qfile).write_bytes(raw);(args.output/bfile).write_bytes(struct.pack('<16f',*bias));outbytes=struct.pack('<16f',*staged)
  records.append({'role':role,'sourceName':name,'sourceSha256':hashes[name],'weightKey':qkey,'tileRows':[0,16],'columns':[0,5120],'tileFile':'work/'+qfile,'biasFile':'work/'+bfile,'tileSha256':hashlib.sha256(raw).hexdigest(),'scale':scale,'bias':bias,'expectedStagedF32':staged,'expectedDouble':double,'expectedStagedF32Sha256':hashlib.sha256(outbytes).hexdigest(),'payloadBytesRead':81920+32+4,'qPayloadAbsoluteOffset':start+header[qkey]['data_offsets'][0]})
result={'candidate':'FP8-e4m3fn decode -> FP32 multiply scale -> sequentialFP32 dot -> FP32 bias, not reference scaled_mm','activation':'x[i]=float32(((i%31)-15)/64), i0..5119','tolerance':{'stagedF32':'bit-exact','absolute':1e-4,'relative':1e-5},'models':records};(args.output/'fixture.json').write_text(json.dumps(result,indent=2)+'\n');print('extracted',len(records),'private fixtures; payload bytes',sum(m['payloadBytesRead'] for m in records))
