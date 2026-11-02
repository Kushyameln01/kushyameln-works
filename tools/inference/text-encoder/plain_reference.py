#!/usr/bin/env python3
"""Full512 pinned-source CPU oracle for explicit plain/ID cases; no export."""
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
 p.add_argument('--execution-source-sha');p.add_argument('--preflight-only',action='store_true');p.add_argument('--write-suite-plan',type=Path);p.add_argument('--case-id',action='append');a=p.parse_args()
 from plain_checks import validate_gate,compile_case,oracle_vectors,default_suite_cases
 plan=json.loads(a.plan.read_text());mraw=(a.bundle/'manifest.json').read_bytes();manifest=json.loads(mraw)
 assert sha(mraw)==plan['selectedManifest']['sha256'];validate_gate(manifest['numericGate'])
 assert manifest['type']=='wan-umt5-staged-fp32' and manifest['complete'] and len(manifest['blocks'])==24
 assert a.model.stat().st_size==manifest['modelBytes'];initial_model_stat=a.model.stat()
 sources=json.loads((HERE/'source-provenance.json').read_text());source=HERE/'pinned-t5.py';configpath=HERE/'pinned-umt5-config.json'
 for path,key in [(source,'comfy/text_encoders/t5.py'),(configpath,'comfy/text_encoders/umt5_config_xxl.json')]:assert sha(path.read_bytes())==next(r['sha256'] for r in sources if r['path']==key)
 assert source.read_bytes() and sha(source.read_bytes())==manifest['sourceSha256']
 if not a.preflight_only and not a.write_suite_plan:
  assert a.execution_source_sha and re.fullmatch('[0-9a-f]{40}',a.execution_source_sha),'Explicit committed execution source required'
  for rel in ['plain_reference.py','plain_checks.py','prepare.py','pinned-t5.py','pinned-umt5-config.json']:
   path=HERE/rel;fixed=subprocess.run(['git','show',a.execution_source_sha+':'+str(path.relative_to(ROOT))],cwd=ROOT,check=True,capture_output=True).stdout;assert path.read_bytes()==fixed,rel
 sys.path.insert(0,str(a.tokenizer_deps));import sentencepiece as spm
 tokenizer_bytes=(a.bundle/manifest['tokenizer']['path']).read_bytes();assert sha(tokenizer_bytes)==manifest['tokenizer']['sha256']
 tokenizer=spm.SentencePieceProcessor(model_proto=tokenizer_bytes,add_bos=False,add_eos=True)
 encode=lambda text:tokenizer.encode(text,out_type=int)
 if a.write_suite_plan:
  if a.write_suite_plan.exists():raise FileExistsError('Fresh suite plan required')
  assert not a.write_suite_plan.resolve().is_relative_to(ROOT/'docs')
  cases,negative=default_suite_cases(encode)
  controls=[{'id':'cancel-file-load','caseId':'id-l1','action':'cancel','event':'file-read-start','fileName':'block-00.onnx'},{'id':'cancel-file-bytes','caseId':'id-l1','action':'cancel','event':'file-read-end','fileName':'block-00.onnx'},{'id':'cancel-bytes-map-hash','caseId':'id-l2','action':'cancel','event':'incremental-digest-update-start','inputBytes':8388608},{'id':'cancel-hash','caseId':'id-l1','action':'cancel','event':'incremental-digest-update-start','inputBytes':8388608},{'id':'cancel-session-create','caseId':'id-l1','action':'cancel','event':'ort-create-start'},{'id':'cancel-run','caseId':'id-l1','action':'cancel','event':'ort-run-start','recover':True},{'id':'reconfigure-session','caseId':'id-l1','action':'reconfigure','event':'ort-create-end'},{'id':'dispose-run','caseId':'id-l1','action':'dispose','event':'ort-run-start'},{'id':'cancel-save','caseId':'plain-empty','action':'cancel-save'}]
  suite={'schemaVersion':'works-text-standalone-plan/1.0','scope':'Text standalone FP32 source diagnostics; independent full512 source per case','selectedManifest':plan['selectedManifest'],'numericGate':manifest['numericGate'],'cases':cases,'negativeCases':negative,'controls':controls,'executionPolicy':{'sourceBatchSize':1,'sourcePositions':512,'loadOneSourceBlockForAllCases':True,'nativeJobsSequential':True,'newExports':0}}
  a.write_suite_plan.parent.mkdir(parents=True,exist_ok=True);write_json(a.write_suite_plan,suite);print(json.dumps({'suitePlan':str(a.write_suite_plan),'cases':len(cases),'negativeCases':len(negative),'NN':0}));return 0
 if a.output.exists():raise FileExistsError('Fresh private output directory required')
 assert not a.output.resolve().is_relative_to(ROOT/'docs')
 assert shutil.disk_usage(a.output.parent).free>=536870912,'At least512MiB disk headroom required'
 a.output.mkdir(parents=True)
 suite_mode='cases' in plan
 cases=plan['cases'] if suite_mode else [{'id':'plain','input':plan['input']}]
 if a.case_id:
  assert suite_mode and set(a.case_id)<=set(case['id'] for case in cases),'Unknown selected suite case'
  cases=[case for case in cases if case['id'] in a.case_id]
 assert cases and len({case['id'] for case in cases})==len(cases),'Nonempty unique cases required'
 records=[]
 for case in cases:
  record=compile_case(case,encode);record.update(tokenizerSha256=sha(tokenizer_bytes),tokenizerVersion=spm.__version__,modelSha256=manifest['modelSha256'],manifestSha256=sha(mraw),executionSourceSha=a.execution_source_sha,zeroOutMasked=True)
  records.append(record)
 input_record=records[0]
 if suite_mode:write_json(a.output/'text-inputs.json',{'schemaVersion':'works-text-standalone-inputs/1.0','inputs':records})
 else:write_json(a.output/'plain-input.json',input_record);(a.output/'prompt.txt').write_bytes(input_record['text'].encode())
 if a.preflight_only:write_json(a.output/'preflight.json',{'passed':True,'newNeuralRuns':0,'inputs':records,'input':input_record});print(json.dumps({'preflightPassed':True,'cases':len(records),'NN':0}),flush=True);return 0
 sys.path.insert(0,str(a.deps));import numpy as np,torch,psutil
 from safetensors import safe_open
 torch.set_num_threads(2);torch.set_num_interop_threads(1)
 process=psutil.Process();peak=process.memory_info().rss;stop=threading.Event();samples=[];started=time.monotonic();cpu0=process.cpu_times()
 def sample():
  nonlocal peak
  while not stop.wait(.05):
   rss=process.memory_info().rss;peak=max(peak,rss);samples.append({'seconds':time.monotonic()-started,'rssBytes':rss})
 thread=threading.Thread(target=sample,daemon=True);thread.start()
 report={'passed':False,'scope':'New uncompacted full512 pinned-source FP32 references; each case executes separately at batch1; not original GPU FP8 arithmetic' if suite_mode else 'New full512 pinned-source FP32 reference for explicit plain Hello world; not original GPU FP8 arithmetic','executionSourceSha':a.execution_source_sha,'sourceCommit':'b5a432157de6b8884f81104cd02926adf4d597e4','source':file_record(source),'config':file_record(configpath),'dependencyAdapter':file_record(HERE/'prepare.py'),'manifest':file_record(a.bundle/'manifest.json'),'plan':file_record(a.plan),'gate':manifest['numericGate'],'input':input_record,'layers':[],'newExports':0,'oracleUsesOnnxOrHike':False,'wholeOriginalModelHashRecomputed':False,'caseCount':len(records),'sourceBlocksLoaded':0}
 try:
  spec=importlib.util.spec_from_file_location('existing_fp32_adapters',HERE/'prepare.py');prep=importlib.util.module_from_spec(spec);spec.loader.exec_module(prep)
  mod,ops,attend=prep.source_module(source,torch);config=json.loads(configpath.read_text())
  with a.model.open('rb') as handle:
   headerlen=struct.unpack('<Q',handle.read(8))[0];headerraw=handle.read(headerlen);header=json.loads(headerraw)
   embed=header['shared.weight'];assert embed['dtype']=='F16' and embed['shape']==[256384,4096]
   cache={}
   for token in {token for record in records for token in oracle_vectors(record)[0]}:
    handle.seek(8+headerlen+embed['data_offsets'][0]+token*4096*2);row=handle.read(8192);assert len(row)==8192;cache[token]=np.frombuffer(row,dtype='<f2').astype(np.float32)
  states=[]
  for record in records:
   ids,mask=oracle_vectors(record);attention=torch.tensor([mask],dtype=torch.float32)
   mask_tensor=(1-attention).reshape(1,1,1,512).expand(1,1,512,512);mask_tensor=mask_tensor.masked_fill(mask_tensor.bool(),-torch.finfo(torch.float32).max)
   states.append({'record':record,'x':torch.from_numpy(np.stack([cache[token] for token in ids])[None]),'attention':attention,'mask':mask_tensor,'past_bias':None,'layers':[]})
  del cache
  used={'shared.weight','spiece_model','scaled_fp8','encoder.final_layer_norm.weight'}
  with safe_open(str(a.model),framework='pt',device='cpu') as model:
   original_keys=set(model.keys());embedded_tokenizer=model.get_tensor('spiece_model').numpy().tobytes();assert sha(embedded_tokenizer)==manifest['tokenizer']['sha256']
  # Close each read-only source mapping after copying this block to FP32.
  # No mapped scalar tensor is retained across iterations.
  for index in range(24):
   begin=time.monotonic();prefix=f'encoder.block.{index}.';state={};scales=[]
   with safe_open(str(a.model),framework='pt',device='cpu') as model:
    for key in model.keys():
     if not key.startswith(prefix):continue
     used.add(key)
     if key.endswith('.scale_weight'):continue
     value=model.get_tensor(key)
     if value.dtype==torch.float8_e4m3fn:
      scale_key=key[:-7]+'.scale_weight';scale=model.get_tensor(scale_key);assert scale.dtype==torch.float32 and scale.numel()==1 and bool(torch.isfinite(scale).all()) and float(scale)>0
      value=value.float()*scale;scales.append({'key':scale_key,'value':float(scale),'sha256':sha(scale.numpy().tobytes())});del scale
     else:value=value.float()
     assert bool(torch.isfinite(value).all());state[key[len(prefix):]]=value
   with torch.device('meta'):block=mod.T5Block(4096,4096,10240,config['dense_act_fn'],True,64,True,torch.float32,'meta',ops)
   strict=block.load_state_dict(state,strict=True,assign=True);del state;block.eval()
   report['sourceBlocksLoaded']+=1
   for state in states:
    case_begin=time.monotonic()
    with torch.inference_mode():state['x'],state['past_bias']=block(state['x'],state['mask'],state['past_bias'],attend)
    x=state['x'];assert bool(torch.isfinite(x).all())
    state['layers'].append({'index':index,'shape':list(x.shape),'hiddenSha256':sha(x.numpy().tobytes()),'seconds':time.monotonic()-case_begin})
   report['layers'].append({'index':index,'shape':[1,512,4096],'strictMissing':strict.missing_keys,'strictUnexpected':strict.unexpected_keys,'scales':scales,'hiddenSha256':states[0]['layers'][-1]['hiddenSha256'],'seconds':time.monotonic()-begin})
   del block,value;gc.collect();print(json.dumps({'phase':'source-oracle','completed':index+1,'total':24,'seconds':time.monotonic()-started,'rssBytes':process.memory_info().rss}),flush=True)
  with safe_open(str(a.model),framework='pt',device='cpu') as model:
   weight=model.get_tensor('encoder.final_layer_norm.weight').float();assert sha(weight.numpy().tobytes())==manifest['finalNorm']['sha256']
  norm=mod.T5LayerNorm(4096,eps=manifest['finalNorm']['epsilon'],dtype=torch.float32,device='meta',operations=ops);norm.load_state_dict({'weight':weight},strict=True,assign=True)
  references=[]
  for state in states:
   with torch.inference_mode():full=(norm(state['x'])*state['attention'][...,None]).numpy().astype('<f4')
   assert full.shape==(1,512,4096) and np.isfinite(full).all()
   assert np.all(full[:,np.array(oracle_vectors(state['record'])[1])==0,:]==0)
   references.append(full[:,:state['record']['shape'][1],:].copy())
  reference=references[0];mask=input_record['attentionMask']
  assert not (original_keys-used),original_keys-used
  assert reference.shape==tuple(input_record['shape']) and np.isfinite(reference).all() and np.all(reference[:,np.array(mask)==0,:]==0)
  target=a.output/(input_record['id']+'-reference.f32' if suite_mode else 'plain-reference.f32');reference.tofile(target);report.update(passed=True,reference=file_record(target),shape=list(reference.shape),dtype='float32',layout='BLC',meaning='text_hidden_states',elements=int(reference.size),sourceKeysCovered=len(used),sourceHeaderSha256=sha(headerraw),versions={'torch':torch.__version__,'numpy':np.__version__,'sentencepiece':spm.__version__})
  if suite_mode:
   report['cases']=[]
   for state,case_reference in zip(states,references):
    target=a.output/(state['record']['id']+'-reference.f32');case_reference.tofile(target)
    report['cases'].append({'id':state['record']['id'],'input':state['record'],'reference':file_record(target),'layers':state['layers'],'oracleInternalShape':[1,512,4096],'returnedShape':list(case_reference.shape),'returnedLengthRule':'Final full512 normalized/masked source is sliced to the requested native L; source attention positions are never shortened'})
  end=a.model.stat();assert (end.st_size,end.st_mtime_ns)==(initial_model_stat.st_size,initial_model_stat.st_mtime_ns),'Original source changed during oracle'
 except Exception as error:report['passed']=False;report['failure']={'name':type(error).__name__,'message':str(error)};raise
 finally:
  stop.set();thread.join();cpu1=process.cpu_times();report['resource']={'pid':process.pid,'ctime':process.create_time(),'peakRssBytes':peak,'sampleIntervalSeconds':.05,'samples':len(samples),'wallSeconds':time.monotonic()-started,'cpuUserSeconds':cpu1.user-cpu0.user,'cpuSystemSeconds':cpu1.system-cpu0.system,'scope':'This source process; no browser concurrency; sampled RSS may miss short peaks'};write_json(a.output/'reference-results.json',report)
 print(json.dumps({'passed':report['passed'],'reference':report['reference'],'resource':report['resource']}),flush=True)
 return 0
if __name__=='__main__':raise SystemExit(main())
