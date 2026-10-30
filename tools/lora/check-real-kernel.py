#!/usr/bin/env python3
"""Independent Python reference for real LoRA slices; synthetic zero base only."""
import pathlib,json,struct,subprocess,math,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
SOURCE=pathlib.Path('/workspace/work/lora')
ATOL=1e-5;RTOL=1e-4
NODE='''import {createKernel} from './docs/shared/inference/lora/kernel/host.mjs';import fs from 'node:fs';const x=JSON.parse(fs.readFileSync(0,'utf8'));const k=await createKernel({wasmBytes:fs.readFileSync('./docs/shared/inference/lora/kernel/lora.wasm')});const down=k.decode(new Uint8Array(x.down),'BF16'),up=k.decode(new Uint8Array(x.up),'BF16');const actual=[...k.merge({base:new Float32Array(x.rows*x.cols),down,up,rows:x.rows,cols:x.cols,rank:x.rank,scale:x.scale})];console.log(JSON.stringify({actual,info:k.info}));k.dispose();'''
def read_header(p):
 with p.open('rb') as f:
  length=struct.unpack('<Q',f.read(8))[0];return 8+length,json.loads(f.read(length))
def decode(b):return [struct.unpack('<f',b'\0\0'+b[i:i+2])[0] for i in range(0,len(b),2)]
results=[]
for p in sorted(SOURCE.glob('*-safetensors/*.safetensors')):
 offset,h=read_header(p);down_name=next(k for k in h if k.endswith(('.lora_down.weight','.lora_A.weight')));suffix='.lora_A.weight' if down_name.endswith('.lora_A.weight') else '.lora_down.weight';up_name=down_name.replace(suffix,'.lora_B.weight' if suffix=='.lora_A.weight' else '.lora_up.weight');prefix=down_name.removesuffix(suffix);down=h[down_name];up=h[up_name]
 assert down['dtype']==up['dtype']=='BF16' and len(down['shape'])==len(up['shape'])==2
 rank=down['shape'][0];cols=min(16,down['shape'][1]);rows=min(2,up['shape'][0]);assert up['shape'][1]==rank
 with p.open('rb') as f:
  db=b''
  for i in range(rank):f.seek(offset+down['data_offsets'][0]+2*i*down['shape'][1]);db+=f.read(cols*2)
  f.seek(offset+up['data_offsets'][0]);ub=f.read(rows*rank*2)
  if prefix+'.alpha' in h:
   f.seek(offset+h[prefix+'.alpha']['data_offsets'][0]);alpha=decode(f.read(2))[0];scale=alpha/rank;scale_source='stored alpha/rank'
  else:scale=1;scale_source='absent alpha: ComfyUI weight_adapter/lora.py b5a432157de6b8884f81104cd02926adf4d597e4'
 d=decode(db);u=decode(ub);expected=[scale*sum(u[i*rank+k]*d[k*cols+j] for k in range(rank)) for i in range(rows) for j in range(cols)]
 request={'down':list(db),'up':list(ub),'rows':rows,'cols':cols,'rank':rank,'scale':scale}
 process=subprocess.run(['node','--input-type=module','-e',NODE],input=json.dumps(request),capture_output=True,text=True,cwd=ROOT,check=True);actual=json.loads(process.stdout)
 errors=[abs(a-b) for a,b in zip(actual['actual'],expected)];passed=all(math.isfinite(a) and abs(a-b)<=ATOL+RTOL*abs(b) for a,b in zip(actual['actual'],expected))
 assert passed,p.name
 results.append({'file':str(p),'inputDown':down_name,'inputUp':up_name,'sliceShape':[rows,cols],'rank':rank,'scale':scale,'scaleSource':scale_source,'base':'synthetic FP32 zeros; not a target model weight','reference':'independent Python binary64 sum over BF16 values','atol':ATOL,'rtol':RTOL,'maxAbsoluteError':max(errors),'passed':passed,'sourceSliceSha256':hashlib.sha256(db+ub).hexdigest(),'actual':actual['actual'],'expected':expected,'kernel':actual['info']})
out=ROOT/'development/lora/kernel-evidence.json';out.parent.mkdir(parents=True,exist_ok=True)
browser=ROOT/'tools/lora/kernel/build/browser-results.json'
record={'status':'KERNEL_REAL_SLICES_VERIFIED','limitations':['Synthetic zero base. Not ComfyUI loader equivalence. Not target compatibility. Not full inference.','One 2x16 output slice from one layer per source file.'],'cases':results,'browser':json.loads(browser.read_text()) if browser.exists() else None}
out.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'passed':len(results),'maxAbsoluteErrors':{pathlib.Path(r['file']).name:r['maxAbsoluteError'] for r in results},'evidence':str(out)}))
