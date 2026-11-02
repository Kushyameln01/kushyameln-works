#!/usr/bin/env python3
"""One existing UMT5 block versus pinned source; no export or model changes.

The source stage writes one full512 input/hidden/normalized checkpoint. The
native stage runs the unchanged block0 with actual pinned ORT WASM in a fresh
Node process, then compares every hidden and normalized value. These are local
diagnostics, never a replacement for the fixed full24 final-output gate.
"""
import argparse,gc,hashlib,importlib.util,json,os,re,shutil,struct,subprocess,sys,time
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def record(path):
 p=Path(path);raw=p.read_bytes();return {'path':str(p),'bytes':len(raw),'sha256':sha(raw)}
def write(path,value):Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def committed(path,source):
 rel=str(path.relative_to(ROOT));fixed=subprocess.run(['git','show',source+':'+rel],cwd=ROOT,check=True,capture_output=True).stdout
 if fixed!=path.read_bytes():raise ValueError('Source bytes differ from execution commit: '+rel)
 return record(path)
def fresh(path):
 if path.exists():raise FileExistsError('Fresh private output required')
 if path.resolve().is_relative_to(ROOT/'docs'):raise ValueError('Public output prohibited')
 if shutil.disk_usage(path.parent).free<536870912:raise ValueError('At least512MiB free disk required')
 path.mkdir(parents=True)
def metrics(actual,reference,np):
 delta=np.abs(actual.astype(np.float64)-reference.astype(np.float64));scale=max(1.,float(np.max(np.abs(reference))));rms=float(np.sqrt(np.mean(reference.astype(np.float64)**2)))
 row=delta.max(axis=(0,2));top=np.argsort(row)[-5:][::-1]
 return {'finite':bool(np.isfinite(actual).all() and np.isfinite(reference).all()),'elements':int(actual.size),'maxAbsError':float(delta.max()),'rmsError':float(np.sqrt(np.mean(delta**2))),'normalizedPeakError':float(delta.max()/scale),'relativeRmsError':float(np.sqrt(np.mean(delta**2))/max(1.,rms)),'overFixed001':int(np.sum(delta>.001)),'allclose':bool(np.all(delta<=.001+.001*np.abs(reference.astype(np.float64)))),'worstRows':[{'position':int(i),'maxAbsError':float(row[i])}for i in top],'allValuesCompared':True}

NODE_CODE=r'''
import {readFile,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const c=JSON.parse(readFileSync(0,'utf8')),base=c.runtime;
const ort=await import(pathToFileURL(base+'/vendor/ort.wasm.min.mjs').href),{createHike}=await import(pathToFileURL(base+'/hike.mjs').href);
ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths={mjs:pathToFileURL(base+'/vendor/ort-wasm-simd-threaded.mjs').href,wasm:pathToFileURL(base+'/vendor/ort-wasm-simd-threaded.wasm').href};
const f32=async path=>{const bytes=await readFile(path);return new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=new Uint8Array(await readFile(c.graph)),actualGraphHash=hash(bytes);if(bytes.length!==c.graphRecord.bytes||actualGraphHash!==c.graphRecord.sha256)throw Error('Selected block0 bytes/hash mismatch');
const hidden=await f32(c.reference+'/block0-input.f32'),mask=new Float32Array(c.input.attentionMask),weight=await f32(c.reference+'/final-norm.f32');
const options={executionProviders:['wasm'],graphOptimizationLevel:c.optimization,extra:{session:{disable_prepacking:'1'}}},started=performance.now();
let session,input,maskInput,result,hike;
try{
 session=await ort.InferenceSession.create(bytes,options);const created=performance.now();input=new ort.Tensor('float32',hidden,[1,512,4096]);maskInput=new ort.Tensor('float32',mask,[1,512]);result=await session.run({hidden:input,mask:maskInput});const ran=performance.now(),next=result.hidden_out;
 if(next.type!=='float32'||next.dims.join(',')!=='1,512,4096')throw Error('Wrong block0 output');
 const native=new Float32Array(next.data);await writeFile(c.output+'/native-hidden.f32',new Uint8Array(native.buffer));
 const kernel=new Uint8Array(await readFile(base+'/kernel/tensor.wasm'));if(hash(kernel)!==c.hikeSha256)throw Error('Pinned Hike identity mismatch');hike=await createHike(kernel);
 const normalized=await hike.rmsNorm(native,weight,512,4096,1e-6);for(let row=0;row<512;row++)if(!mask[row])normalized.fill(0,row*4096,(row+1)*4096);
 await writeFile(c.output+'/native-normalized.f32',new Uint8Array(normalized.buffer));
 console.log(JSON.stringify({passed:true,provider:'actual pinned ORT WASM',options,graphSha256:actualGraphHash,shape:next.dims,createSeconds:(created-started)/1000,runSeconds:(ran-created)/1000,hikeStats:hike.stats(),peakRssBytes:process.resourceUsage().maxRSS*1024}));
}finally{for(const tensor of new Set([...Object.values(result??{}),input,maskInput]))tensor?.dispose?.();await session?.release();hike?.dispose();}
'''

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('stage',choices=['source','native']);p.add_argument('--bundle',required=True,type=Path);p.add_argument('--output',required=True,type=Path);p.add_argument('--execution-source-sha',required=True);p.add_argument('--preflight-only',action='store_true');p.add_argument('--model',type=Path);p.add_argument('--inputs',type=Path);p.add_argument('--case-id',default='id-l512-all-active');p.add_argument('--deps',type=Path);p.add_argument('--reference',type=Path);p.add_argument('--optimization',choices=['all','disabled'],default='all');a=p.parse_args()
 if not re.fullmatch('[0-9a-f]{40}',a.execution_source_sha):raise ValueError('Full committed execution source required')
 manifest=json.loads((a.bundle/'manifest.json').read_text());source_files=[Path(__file__),HERE/'prepare.py',HERE/'plain_checks.py',HERE/'pinned-t5.py',HERE/'pinned-umt5-config.json']
 if a.stage=='native':source_files.extend(ROOT/'docs/shared/inference'/name for name in ['hike.mjs','vendor/ort.wasm.min.mjs','vendor/ort-wasm-simd-threaded.mjs','vendor/ort-wasm-simd-threaded.wasm','kernel/tensor.wasm'])
 closure=[committed(path,a.execution_source_sha)for path in source_files]
 if a.stage=='source':
  if not a.model or not a.inputs or not a.deps:raise ValueError('Source stage needs model, inputs and existing CPU deps')
  inp=next(case for case in json.loads(a.inputs.read_text())['inputs'] if case['id']==a.case_id)
  if inp['shape']!=[1,512,4096] or len(inp['tokenIds'])!=512 or len(inp['attentionMask'])!=512:raise ValueError('Full512 diagnostic input required')
  if a.model.stat().st_size!=manifest['modelBytes'] or inp['modelSha256']!=manifest['modelSha256'] or inp['manifestSha256']!=sha((a.bundle/'manifest.json').read_bytes()):raise ValueError('Selected input/model/manifest mismatch')
 else:
  if not a.reference:raise ValueError('Native stage needs source checkpoint reference')
  source_report=json.loads((a.reference/'source-results.json').read_text());inp=source_report['input']
  if not source_report['passed'] or source_report['manifest']['sha256']!=sha((a.bundle/'manifest.json').read_bytes()):raise ValueError('Complete matching source checkpoint required')
  for name in ['block0-input.f32','block0-source-hidden.f32','block0-source-normalized.f32','final-norm.f32']:
   if record(a.reference/name)['sha256']!=source_report['files'][name]['sha256']:raise ValueError('Source checkpoint changed: '+name)
 if a.preflight_only:print(json.dumps({'passed':True,'stage':a.stage,'caseId':inp['id'],'newNeuralRuns':0,'sourceClosure':closure}));return 0
 fresh(a.output);started=time.monotonic();report={'passed':False,'stage':a.stage,'scope':'One existing block0 full512 diagnostic; no full24 acceptance or changed gate','input':inp,'manifest':record(a.bundle/'manifest.json'),'executionSourceSha':a.execution_source_sha,'sourceClosure':closure,'newExports':0}
 try:
  if a.stage=='source':
   sys.path.insert(0,str(a.deps));import numpy as np,torch
   from safetensors import safe_open
   from prepare import source_module
   torch.set_num_threads(2);torch.set_num_interop_threads(1);initial=a.model.stat();mod,ops,attend=source_module(HERE/'pinned-t5.py',torch);config=json.loads((HERE/'pinned-umt5-config.json').read_text())
   with a.model.open('rb') as f:
    hlen=struct.unpack('<Q',f.read(8))[0];header=json.loads(f.read(hlen));embedding=header['shared.weight'];assert embedding['dtype']=='F16' and embedding['shape']==[256384,4096];cache={}
    for token in set(inp['tokenIds']):f.seek(8+hlen+embedding['data_offsets'][0]+token*8192);cache[token]=np.frombuffer(f.read(8192),dtype='<f2').astype(np.float32)
   x=torch.from_numpy(np.stack([cache[token]for token in inp['tokenIds']])[None]);del cache;x.numpy().astype('<f4').tofile(a.output/'block0-input.f32');attention=torch.tensor([inp['attentionMask']],dtype=torch.float32);mask=(1-attention).reshape(1,1,1,512).expand(1,1,512,512);mask=mask.masked_fill(mask.bool(),-torch.finfo(torch.float32).max);state={};scales=[];prefix='encoder.block.0.'
   with safe_open(str(a.model),framework='pt',device='cpu') as model:
    for key in model.keys():
     if not key.startswith(prefix) or key.endswith('.scale_weight'):continue
     value=model.get_tensor(key)
     if value.dtype==torch.float8_e4m3fn:
      scale=model.get_tensor(key[:-7]+'.scale_weight');assert scale.dtype==torch.float32 and scale.numel()==1 and bool(torch.isfinite(scale).all()) and float(scale)>0;value=value.float()*scale;scales.append({'key':key[:-7]+'.scale_weight','value':float(scale)});del scale
     else:value=value.float()
     assert bool(torch.isfinite(value).all());state[key[len(prefix):]]=value
   with torch.device('meta'):block=mod.T5Block(4096,4096,10240,config['dense_act_fn'],True,64,True,torch.float32,'meta',ops)
   strict=block.load_state_dict(state,strict=True,assign=True);del state;block.eval()
   with torch.inference_mode():hidden,_=block(x,mask,None,attend)
   assert list(hidden.shape)==[1,512,4096] and bool(torch.isfinite(hidden).all());hidden.numpy().astype('<f4').tofile(a.output/'block0-source-hidden.f32');del block,value;gc.collect()
   with safe_open(str(a.model),framework='pt',device='cpu') as model:weight=model.get_tensor('encoder.final_layer_norm.weight').float()
   weight.numpy().astype('<f4').tofile(a.output/'final-norm.f32');assert record(a.output/'final-norm.f32')['sha256']==manifest['finalNorm']['sha256'];norm=mod.T5LayerNorm(4096,eps=1e-6,dtype=torch.float32,device='meta',operations=ops);norm.load_state_dict({'weight':weight},strict=True,assign=True)
   with torch.inference_mode():normalized=(norm(hidden)*attention[...,None]).numpy().astype('<f4')
   normalized.tofile(a.output/'block0-source-normalized.f32');end=a.model.stat();assert(initial.st_size,initial.st_mtime_ns)==(end.st_size,end.st_mtime_ns)
   report.update(passed=True,strictMissing=strict.missing_keys,strictUnexpected=strict.unexpected_keys,scales=scales,torchVersion=torch.__version__,files={name:record(a.output/name)for name in ['block0-input.f32','block0-source-hidden.f32','block0-source-normalized.f32','final-norm.f32']})
  else:
   import numpy as np
   c={'bundle':str(a.bundle),'output':str(a.output),'reference':str(a.reference),'runtime':str(ROOT/'docs/shared/inference'),'graph':str(a.bundle/manifest['blocks'][0]['path']),'graphRecord':manifest['blocks'][0],'input':inp,'optimization':a.optimization,'hikeSha256':'9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8'}
   native=subprocess.run(['node','--input-type=module','-e',NODE_CODE],input=json.dumps(c),text=True,capture_output=True)
   (a.output/'native-stdout.txt').write_text(native.stdout);(a.output/'native-stderr.txt').write_text(native.stderr);native.check_returncode();observation=json.loads(native.stdout.strip().splitlines()[-1]);comparisons={}
   for suffix in ['hidden','normalized']:
    actual=np.fromfile(a.output/('native-'+suffix+'.f32'),dtype='<f4').reshape(1,512,4096);reference=np.fromfile(a.reference/('block0-source-'+suffix+'.f32'),dtype='<f4').reshape(1,512,4096);comparisons[suffix]=metrics(actual,reference,np)
   report.update(passed=all(value['finite'] for value in comparisons.values()),optimization=a.optimization,sourceCheckpointExecutionSha=source_report['executionSourceSha'],native=observation,comparison=comparisons,files={name:record(a.output/name)for name in ['native-hidden.f32','native-normalized.f32']})
 except Exception as error:report['failure']={'name':type(error).__name__,'message':str(error)};raise
 finally:report['wallSeconds']=time.monotonic()-started;write(a.output/(a.stage+'-results.json'),report)
 print(json.dumps(report));return 0
if __name__=='__main__':raise SystemExit(main())
