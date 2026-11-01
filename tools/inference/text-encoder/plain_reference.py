#!/usr/bin/env python3
"""Full512 pinned-source CPU oracle for one explicit plain prompt; no export."""
import argparse,gc,hashlib,importlib.util,json,os,re,shutil,struct,subprocess,sys,threading,time
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def file_record(path):
 p=Path(path);raw=p.read_bytes();return {'path':str(p),'bytes':len(raw),'sha256':sha(raw)}
def write_json(path,value):Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

def main():
 p=argparse.ArgumentParser(description=__doc__)
 for key in ['plan','bundle','model','deps','tokenizer-deps','output']:p.add_argument('--'+key,required=True,type=Path)
 p.add_argument('--execution-source-sha');p.add_argument('--preflight-only',action='store_true');a=p.parse_args()
 from plain_checks import validate_gate
 plan=json.loads(a.plan.read_text());mraw=(a.bundle/'manifest.json').read_bytes();manifest=json.loads(mraw)
 assert sha(mraw)==plan['selectedManifest']['sha256'];validate_gate(manifest['numericGate'])
 assert manifest['type']=='wan-umt5-staged-fp32' and manifest['complete'] and len(manifest['blocks'])==24
 assert a.model.stat().st_size==manifest['modelBytes'];initial_model_stat=a.model.stat()
 sources=json.loads((HERE/'source-provenance.json').read_text());source=HERE/'pinned-t5.py';configpath=HERE/'pinned-umt5-config.json'
 for path,key in [(source,'comfy/text_encoders/t5.py'),(configpath,'comfy/text_encoders/umt5_config_xxl.json')]:assert sha(path.read_bytes())==next(r['sha256'] for r in sources if r['path']==key)
 assert source.read_bytes() and sha(source.read_bytes())==manifest['sourceSha256']
 if not a.preflight_only:
  assert a.execution_source_sha and re.fullmatch('[0-9a-f]{40}',a.execution_source_sha),'Explicit committed execution source required'
  for rel in ['plain_reference.py','plain_checks.py','prepare.py','pinned-t5.py','pinned-umt5-config.json']:
   path=HERE/rel;fixed=subprocess.run(['git','show',a.execution_source_sha+':'+str(path.relative_to(ROOT))],cwd=ROOT,check=True,capture_output=True).stdout;assert path.read_bytes()==fixed,rel
 if a.output.exists():raise FileExistsError('Fresh private output directory required')
 assert not a.output.resolve().is_relative_to(ROOT/'docs')
 assert shutil.disk_usage(a.output.parent).free>=536870912,'At least512MiB disk headroom required'
 a.output.mkdir(parents=True)
 sys.path.insert(0,str(a.tokenizer_deps));import sentencepiece as spm
 tokenizer_bytes=(a.bundle/manifest['tokenizer']['path']).read_bytes();assert sha(tokenizer_bytes)==manifest['tokenizer']['sha256']
 prompt=plan['input']['text'];assert sha(prompt.encode())==plan['input']['utf8Sha256']
 tokenizer=spm.SentencePieceProcessor(model_proto=tokenizer_bytes,add_bos=False,add_eos=True)
 ids=tokenizer.encode(prompt,out_type=int);active=len(ids);assert 1<=active<=512 and ids[-1]==1
 ids=ids+[0]*(512-active);mask=[1]*active+[0]*(512-active)
 input_record={'text':prompt,'textUtf8Sha256':sha(prompt.encode()),'tokenIds':ids,'attentionMask':mask,'effectiveTokens':active,'shape':[1,512,4096],'tokenizerSha256':sha(tokenizer_bytes),'tokenizerVersion':spm.__version__,'modelSha256':manifest['modelSha256'],'manifestSha256':sha(mraw),'executionSourceSha':a.execution_source_sha,'zeroOutMasked':True,'oracleUsesFull512Positions':True}
 write_json(a.output/'plain-input.json',input_record);(a.output/'prompt.txt').write_bytes(prompt.encode())
 if a.preflight_only:write_json(a.output/'preflight.json',{'passed':True,'newNeuralRuns':0,'input':input_record});print(json.dumps({'preflightPassed':True,'activeTokens':active,'NN':0}),flush=True);return 0
 sys.path.insert(0,str(a.deps));import numpy as np,torch,psutil
 from safetensors import safe_open
 torch.set_num_threads(2);torch.set_num_interop_threads(1)
 process=psutil.Process();peak=process.memory_info().rss;stop=threading.Event();samples=[];started=time.monotonic();cpu0=process.cpu_times()
 def sample():
  nonlocal peak
  while not stop.wait(.05):
   rss=process.memory_info().rss;peak=max(peak,rss);samples.append({'seconds':time.monotonic()-started,'rssBytes':rss})
 thread=threading.Thread(target=sample,daemon=True);thread.start()
 report={'passed':False,'scope':'New full512 pinned-source FP32 reference for explicit plain Hello world; not original GPU FP8 arithmetic','executionSourceSha':a.execution_source_sha,'sourceCommit':'b5a432157de6b8884f81104cd02926adf4d597e4','source':file_record(source),'config':file_record(configpath),'dependencyAdapter':file_record(HERE/'prepare.py'),'manifest':file_record(a.bundle/'manifest.json'),'gate':manifest['numericGate'],'input':input_record,'layers':[],'newExports':0,'oracleUsesOnnxOrHike':False,'wholeOriginalModelHashRecomputed':False}
 try:
  spec=importlib.util.spec_from_file_location('existing_fp32_adapters',HERE/'prepare.py');prep=importlib.util.module_from_spec(spec);spec.loader.exec_module(prep)
  mod,ops,attend=prep.source_module(source,torch);config=json.loads(configpath.read_text())
  with a.model.open('rb') as handle:
   headerlen=struct.unpack('<Q',handle.read(8))[0];headerraw=handle.read(headerlen);header=json.loads(headerraw)
   embed=header['shared.weight'];assert embed['dtype']=='F16' and embed['shape']==[256384,4096]
   cache={}
   for token in set(ids):
    handle.seek(8+headerlen+embed['data_offsets'][0]+token*4096*2);row=handle.read(8192);assert len(row)==8192;cache[token]=np.frombuffer(row,dtype='<f2').astype(np.float32)
  x=torch.from_numpy(np.stack([cache[token] for token in ids])[None]);attention=torch.tensor([mask],dtype=torch.float32)
  mask_tensor=(1-attention).reshape(1,1,1,512).expand(1,1,512,512);mask_tensor=mask_tensor.masked_fill(mask_tensor.bool(),-torch.finfo(torch.float32).max)
  used={'shared.weight','spiece_model','scaled_fp8','encoder.final_layer_norm.weight'};past_bias=None
  with safe_open(str(a.model),framework='pt',device='cpu') as model:
   embedded_tokenizer=model.get_tensor('spiece_model').numpy().tobytes();assert sha(embedded_tokenizer)==manifest['tokenizer']['sha256']
   for index in range(24):
    begin=time.monotonic();prefix=f'encoder.block.{index}.';state={};scales=[]
    for key in model.keys():
     if not key.startswith(prefix):continue
     used.add(key)
     if key.endswith('.scale_weight'):continue
     value=model.get_tensor(key)
     if value.dtype==torch.float8_e4m3fn:
      scale_key=key[:-7]+'.scale_weight';scale=model.get_tensor(scale_key);assert scale.dtype==torch.float32 and scale.numel()==1 and bool(torch.isfinite(scale).all()) and float(scale)>0
      value=value.float()*scale;scales.append({'key':scale_key,'value':float(scale),'sha256':sha(scale.numpy().tobytes())})
     else:value=value.float()
     assert bool(torch.isfinite(value).all());state[key[len(prefix):]]=value
    with torch.device('meta'):block=mod.T5Block(4096,4096,10240,config['dense_act_fn'],True,64,True,torch.float32,'meta',ops)
    strict=block.load_state_dict(state,strict=True,assign=True);del state;block.eval()
    with torch.inference_mode():x,past_bias=block(x,mask_tensor,past_bias,attend)
    assert bool(torch.isfinite(x).all());report['layers'].append({'index':index,'shape':list(x.shape),'strictMissing':strict.missing_keys,'strictUnexpected':strict.unexpected_keys,'scales':scales,'hiddenSha256':sha(x.numpy().tobytes()),'seconds':time.monotonic()-begin})
    del block,value;gc.collect();print(json.dumps({'phase':'source-oracle','completed':index+1,'total':24,'seconds':time.monotonic()-started,'rssBytes':process.memory_info().rss}),flush=True)
   weight=model.get_tensor('encoder.final_layer_norm.weight').float();assert sha(weight.numpy().tobytes())==manifest['finalNorm']['sha256']
   norm=mod.T5LayerNorm(4096,eps=manifest['finalNorm']['epsilon'],dtype=torch.float32,device='meta',operations=ops);norm.load_state_dict({'weight':weight},strict=True,assign=True)
   with torch.inference_mode():reference=(norm(x)*attention[...,None]).numpy().astype('<f4')
   assert not (set(model.keys())-used),set(model.keys())-used
  assert reference.shape==(1,512,4096) and np.isfinite(reference).all() and np.all(reference[:,np.array(mask)==0,:]==0)
  target=a.output/'plain-reference.f32';reference.tofile(target);report.update(passed=True,reference=file_record(target),shape=list(reference.shape),dtype='float32',layout='BLC',meaning='text_hidden_states',elements=int(reference.size),sourceKeysCovered=len(used),sourceHeaderSha256=sha(headerraw),versions={'torch':torch.__version__,'numpy':np.__version__,'sentencepiece':spm.__version__})
  end=a.model.stat();assert (end.st_size,end.st_mtime_ns)==(initial_model_stat.st_size,initial_model_stat.st_mtime_ns),'Original source changed during oracle'
 except Exception as error:report['failure']={'name':type(error).__name__,'message':str(error)};raise
 finally:
  stop.set();thread.join();cpu1=process.cpu_times();report['resource']={'pid':process.pid,'ctime':process.create_time(),'peakRssBytes':peak,'sampleIntervalSeconds':.05,'samples':len(samples),'wallSeconds':time.monotonic()-started,'cpuUserSeconds':cpu1.user-cpu0.user,'cpuSystemSeconds':cpu1.system-cpu0.system,'scope':'This source process; no browser concurrency; sampled RSS may miss short peaks'};write_json(a.output/'reference-results.json',report)
 print(json.dumps({'passed':report['passed'],'reference':report['reference'],'resource':report['resource']}),flush=True)
 return 0
if __name__=='__main__':raise SystemExit(main())
