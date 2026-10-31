#!/usr/bin/env python3
"""Independent NumPy/binary64 oracle; never imports the SDK or Hike arithmetic."""
import argparse,hashlib,json,math,pathlib,struct,sys
import numpy as np
POLICY='comfy-lora-b5a4321-linear-diff-v1'
STEM='diffusion_model.blocks.0.self_attn.q'
BASE={'HIGH':('Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors','9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52'),'LOW':('Bernini_LOW_fp8_e4m3fn_scaled.safetensors','ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3')}
GATES={'baseDecode':{'absolute':0,'relative':0},'weight':{'absolute':1e-5,'relative':1e-4},'bias':{'absolute':0,'relative':0},'projection':{'absolute':1e-6,'relative':1e-5}}
def digest(b):return hashlib.sha256(b).hexdigest()
def decode_bf16(raw):return (np.frombuffer(raw,dtype='<u2').astype(np.uint32)<<16).view(np.float32).copy()
def decode_fp8(raw,scale):
 q=np.asarray(raw,dtype=np.uint8);e=(q.astype(np.int32)>>3)&15;m=q&7
 if np.any((e==15)&(m==7)) or not math.isfinite(float(scale)) or scale<=0:raise ValueError('Invalid E4M3FN scalar profile')
 v=np.where(e==0,np.ldexp(m.astype(np.float64),-9),np.ldexp(1+m.astype(np.float64)/8,e-7));v=np.where(q&128,-v,v)
 return (v.astype(np.float32)*np.float32(scale)).astype('<f4')
def merge_reference(base,down,up,strength,alpha):
 if not math.isfinite(strength):raise ValueError('Finite explicit strength required')
 rank=down.shape[0];scale=1 if alpha is None else alpha/rank
 return np.asarray(base,dtype=np.float64)+strength*scale*(np.asarray(up,dtype=np.float64)@np.asarray(down,dtype=np.float64))
def unique(pairs):
 out={}
 for k,v in pairs:
  if k in out:raise ValueError('Duplicate original header key')
  out[k]=v
 return out
def header(path):
 with path.open('rb') as f:
  prefix=f.read(8)
  if len(prefix)!=8:raise ValueError('Missing original header prefix')
  n=struct.unpack('<Q',prefix)[0]
  if n>8*1024*1024:raise ValueError('Header budget exceeded')
  raw=f.read(n)
  if len(raw)!=n:raise ValueError('Truncated original header')
  return n+8,json.loads(raw,object_pairs_hook=unique),digest(raw)
def tensor(path,start,h,key,offset=0,count=None):
 t=h[key];width={'BF16':2,'F16':2,'F32':4,'F8_E4M3':1,'U8':1}[t['dtype']];total=math.prod(t['shape']);count=total-offset if count is None else count
 if offset<0 or count<0 or offset+count>total:raise ValueError('Original tensor bounds')
 with path.open('rb') as f:f.seek(start+t['data_offsets'][0]+offset*width);raw=f.read(count*width)
 if len(raw)!=count*width:raise ValueError('Truncated original tensor')
 if t['dtype']=='BF16':a=decode_bf16(raw)
 elif t['dtype']=='F16':a=np.frombuffer(raw,dtype='<f2').astype('<f4')
 elif t['dtype']=='F32':a=np.frombuffer(raw,dtype='<f4').copy()
 else:a=np.frombuffer(raw,dtype=np.uint8).copy()
 if not np.isfinite(a).all():raise ValueError('Nonfinite original tensor')
 return a,{'name':key,'elementOffset':offset,'elementCount':count,'byteLength':len(raw),'sha256':digest(raw)}
def write_array(out,name,array):
 b=np.ascontiguousarray(array).tobytes();(out/name).write_bytes(b);return {'file':name,'dtype':str(array.dtype),'elements':int(array.size),'bytes':len(b),'sha256':digest(b)}
def main():
 p=argparse.ArgumentParser();p.add_argument('--side',choices=['HIGH','LOW'],required=True);p.add_argument('--base',type=pathlib.Path,required=True);p.add_argument('--lora-root',type=pathlib.Path,required=True);p.add_argument('--inventory',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[2]/'development/lora/contracts/original-inventory.json');p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 gate={'scope':'PARTIAL Q16x5120 f32 diagnostic','loaderPolicyId':POLICY,'strengths':[0,1,-1],'declaredDiagnosticStrengthRange':[-1,1],'gates':GATES,'activation':{'0':.25,'17':-.5,'5119':1},'referencePrecision':'NumPy binary64 products/sums over independently decoded source values, float32 reference bytes for native expected output'}
 (a.out/'pre-execution-gates.json').write_text(json.dumps(gate,indent=2)+'\n')
 start,h,base_header=header(a.base);q,qr=tensor(a.base,start,h,'blocks.0.self_attn.q.weight',count=81920);bias,br=tensor(a.base,start,h,'blocks.0.self_attn.q.bias',count=16);scale,sr=tensor(a.base,start,h,'blocks.0.self_attn.q.weight_scale');config,cr=tensor(a.base,start,h,'blocks.0.self_attn.q.comfy_quant')
 if h['blocks.0.self_attn.q.weight']['shape']!=[5120,5120] or h['blocks.0.self_attn.q.weight']['dtype']!='F8_E4M3' or config.tobytes()!=b'{"format": "float8_e4m3fn"}' or scale.size!=1:raise ValueError('Unexpected original Q profile')
 base=decode_fp8(q,scale[0]).reshape(16,5120);x=np.zeros(5120,dtype='<f4');x[[0,17,5119]]=[.25,-.5,1]
 # The gate file is fixed before source decode or products. These diagnostic
 # choices are not product defaults or original GPU precision claims.
 rec={'side':a.side,'gates':GATES,'activation':write_array(a.out,'activation.f32',x),'baseWeight':write_array(a.out,'base-weight.f32',base),'baseBias':write_array(a.out,'base-bias.f32',bias),'baseExpectedOutput':[float(v) for v in (base.astype(np.float64)@x.astype(np.float64)+bias.astype(np.float64)).astype('<f4')],'baseIdentity':{'expectedFullSha256':BASE[a.side][1],'headerSha256':base_header,'fullFileHashComputedByThisOracle':False},'inputRanges':[qr,br,sr,cr],'cases':[]}
 for item in json.loads(a.inventory.read_text()):
  if item['side'].upper()!=a.side:continue
  pair=item['pairId'];path=a.lora_root/(pair+'-safetensors')/item['fileName'];s,lh,hh=header(path)
  if hh!=item['headerSha256'] or path.stat().st_size!=item['bytes']:raise ValueError('LoRA original header/size mismatch')
  dn=STEM+('.lora_down.weight' if pair=='light' else '.lora_A.weight');un=STEM+('.lora_up.weight' if pair=='light' else '.lora_B.weight');rank=lh[dn]['shape'][0]
  if lh[dn]['shape']!=[rank,5120] or lh[un]['shape']!=[5120,rank] or rank!=(128 if pair=='light' else 64):raise ValueError('Unexpected Q factor layout')
  down,dr=tensor(path,s,lh,dn);up,ur=tensor(path,s,lh,un,count=16*rank);down=down.reshape(rank,5120);up=up.reshape(16,rank);alpha=None;ranges=[dr,ur]
  if STEM+'.alpha' in lh:av,ar=tensor(path,s,lh,STEM+'.alpha');alpha=float(av[0]);ranges.append(ar)
  if pair=='light':delta,der=tensor(path,s,lh,STEM+'.diff_b',count=16);ranges.append(der)
  else:delta=np.zeros(16,dtype='<f4')
  for strength in [0,1,-1]:
   name=f'{pair}-{a.side}-s{strength}';w=merge_reference(base,down,up,strength,alpha);b=(bias+np.float32(strength)*delta).astype('<f4');y=(w@x.astype(np.float64)+b.astype(np.float64)).astype('<f4')
   rec['cases'].append({'id':name,'pairId':pair,'side':a.side,'strength':strength,'loaderPolicyId':POLICY,'rank':rank,'alpha':alpha,'scale':strength*(1 if alpha is None else alpha/rank),'retainedOriginalIdentity':{'fileName':item['fileName'],'sha256':item['sha256'],'status':'inventory identity; real runtime source hash must match before accepting trial'},'inputRanges':ranges,'weight':write_array(a.out,name+'-weight.f64',w.astype('<f8')),'bias':write_array(a.out,name+'-bias.f32',b),'expectedOutput':[float(v) for v in y],'coverage':'PARTIAL','completeAdapter':False,'fullShape':[5120,5120],'rows':[0,16],'columns':[0,5120],'excludedPatchCount':1050 if pair=='light' else 399,'unpatchedBaseBiasPassThrough':pair=='detail'})
 (a.out/'reference.json').write_text(json.dumps(rec,indent=2)+'\n');print(json.dumps({'side':a.side,'cases':len(rec['cases']),'elementsPerWeight':81920,'allExpectedOutputs':[c['expectedOutput'] for c in rec['cases']],'report':str(a.out/'reference.json')}))
if __name__=='__main__':main()
