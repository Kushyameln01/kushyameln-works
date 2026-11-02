#!/usr/bin/env python3
"""Actual plain Worker/ORT/Hike acceptance against an independent full512 oracle."""
import argparse,hashlib,json,mimetypes,os,re,shutil,subprocess,sys,threading,time,traceback
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
sys.path.insert(0,str(HERE.parent/'vae'))
from process_lifecycle import ProcessOwnership,cleanup_complete
from plain_checks import unpack_tensor,compare_values,validate_gate
def sha(data):return hashlib.sha256(data).hexdigest()
def write_json(path,value):Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def validate_suite_control_references(plan,all_inputs,selected_ids,oracle_cases,reference_dir,reference_source_sha,manifest_sha256):
 """Prehash every control reference, including unselected recovery cases; NN0."""
 records={record['id']:record for record in all_inputs};planned={case['id']:case for case in plan['cases']};controls=plan.get('controls',[])
 if len(records)!=len(all_inputs):raise ValueError('Duplicate control input IDs')
 if len({control['id']for control in controls})!=len(controls):raise ValueError('Duplicate suite control IDs')
 if sum(bool(control.get('recover'))for control in controls)>1:raise ValueError('Browser suite supports one explicit recovery download per invocation')
 ids=set();native_ids=set()
 for control in controls:
  if not re.fullmatch('[A-Za-z0-9_-]+',control['id']) or control['action'] not in ['cancel','reconfigure','dispose','cancel-save']:raise ValueError('Invalid suite control')
  case_id=control['caseId'];ids.add(case_id)
  if control['action']=='cancel-save':
   if case_id not in selected_ids:raise ValueError('cancel-save case must be selected for a completed numerical output: '+case_id)
  else:native_ids.add(case_id)
  if control.get('recover') and control['action']!='cancel':raise ValueError('Recovery requires a cancel control')
 checks=[]
 for case_id in sorted(ids):
  record=records.get(case_id);case=oracle_cases.get(case_id);expected=planned.get(case_id)
  if not re.fullmatch('[a-z0-9][a-z0-9-]{0,63}',case_id) or record is None or case is None or expected is None:raise ValueError('Missing planned control input/oracle: '+case_id)
  if record.get('executionSourceSha')!=reference_source_sha or record.get('manifestSha256')!=manifest_sha256:raise ValueError('Control source/manifest mismatch: '+case_id)
  if record.get('input')!=expected['input'] or record.get('byteGraph')!=expected.get('byteGraph') or case.get('input')!=record:raise ValueError('Control input differs from its frozen oracle: '+case_id)
  if record.get('oracleUsesFull512Positions') is not True or case.get('oracleInternalShape')!=[1,512,4096]:raise ValueError('Control reference must use the independent full512 source: '+case_id)
  path=Path(reference_dir)/(case_id+'-reference.f32');raw=path.read_bytes();reference=case['reference'];shape=record['shape'];elements=1
  for dim in shape:elements*=dim
  if len(raw)!=reference.get('bytes') or len(raw)!=elements*4 or sha(raw)!=reference.get('sha256'):raise ValueError('Control reference bytes/hash mismatch: '+case_id)
  checks.append({'id':case_id,'passed':True,'file':path.name,'bytes':len(raw),'sha256':sha(raw),'referenceExecutionSourceSha':reference_source_sha,'oracleInternalShape':[1,512,4096],'newNeuralRuns':0})
 return [record for record in all_inputs if record['id'] in native_ids],checks

def validate_text_storage_metadata(meta,record,manifest):
 if meta.get('modelSha256')!=manifest['modelSha256'] or meta.get('tokenizerSha256')!=manifest['tokenizer']['sha256'] or meta.get('attentionMask')!=record['attentionMask'] or meta.get('normalization')!='umt5-final-rmsnorm-f32-v1':raise ValueError('Text storage metadata/mask/normalization mismatch: '+record['id'])

def memory_summary(report):
 samples=report.get('memoryTimeline',[]);phases={};pid_peaks={}
 boundaries={event['event']:event['epochMs'] for event in report.get('memoryEvents',[]) if event.get('source')=='page' and event.get('event') in ['full-start','full-end','cancel-start','cancel-end']}
 def phase_at(sample):
  if not boundaries:return sample.get('phase','startup')
  epoch=sample['epochMs']
  for phase in ['full','cancel']:
   if boundaries.get(phase+'-start',float('inf'))<=epoch<=boundaries.get(phase+'-end',float('inf')):return phase
  if epoch<boundaries.get('full-start',float('inf')):return 'startup'
  return 'finished' if epoch>boundaries.get('cancel-end',float('inf')) else 'between'
 for sample in samples:
  peak=phases.setdefault(phase_at(sample),{'samples':0,'peakRssSumBytes':0,'peakCompletePssSumBytes':None})
  peak['samples']+=1;peak['peakRssSumBytes']=max(peak['peakRssSumBytes'],sample['rssSumBytes'])
  if sample['pssComplete']:peak['peakCompletePssSumBytes']=max(peak['peakCompletePssSumBytes'] or 0,sample['pssSumBytes'])
  for process in sample['processes']:
   key=(process['pid'],process['ctime']);entry=pid_peaks.setdefault(key,{'pid':key[0],'ctime':key[1],'role':process['role'],'peakRssBytes':0,'peakPssBytes':None})
   entry['peakRssBytes']=max(entry['peakRssBytes'],process['rssBytes'])
   if process['pssBytes'] is not None:entry['peakPssBytes']=max(entry['peakPssBytes'] or 0,process['pssBytes'])
 complete=[s['pssSumBytes'] for s in samples if s['pssComplete']]
 return {'sampledCompleteGroupPeakPssSumBytes':max(complete) if complete else None,'phasePeaks':phases,'phaseEpochBoundaries':boundaries,'perPidRssPssPeaks':list(pid_peaks.values()),'actualMaximumSampleGapSeconds':max((b['elapsedSeconds']-a['elapsedSeconds'] for a,b in zip(samples,samples[1:])),default=None),'pssScope':'PSS is sampled from memory_full_info when available; only complete process samples enter the complete-PSS peak. RSS sums may double-count shared pages. Phase peaks use sample start epoch versus page start/end epochs; reads span sampleDurationMs. Raw timeline phase is the latest received browser event.'}

def validate_node_sdk_mode(skip_controls,suite_mode,inputs):
 if not skip_controls or not suite_mode:raise ValueError('--node-sdk requires an explicit suite plan and --skip-controls; Browser/T3 controls remain separate')
 if any('byteGraph' in record for record in inputs):raise ValueError('--node-sdk accepts File-backed cases only; byteGraph cases require the standard Browser host')

NODE_SDK_SOURCE_PATHS=[
 'tools/inference/text-encoder/node_sdk_host.mjs','tools/inference/text-encoder/node_resource_guard.cjs',
 'docs/shared/inference/text-encoder-api.mjs','docs/shared/inference/client.mjs','docs/shared/inference/text-job.mjs','docs/shared/inference/text-encoder.mjs','docs/shared/inference/tokenizer.mjs','docs/shared/inference/vendor/sentencepiece.mjs','docs/shared/inference/tensor.mjs','docs/shared/inference/hike.mjs','docs/shared/inference/kernel/tensor.wasm','docs/shared/inference/vendor/ort.wasm.min.mjs','docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs','docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm','docs/shared/vr180/sha256.mjs']

def verify_node_sdk_sources(root,execution_source_sha):
 """Parent owns Git verification; the child independently checks these bytes."""
 if not execution_source_sha or not re.fullmatch('[0-9a-f]{40}',execution_source_sha):raise ValueError('Full committed execution source SHA required')
 root=Path(root);kind=subprocess.run(['git','cat-file','-t',execution_source_sha],cwd=root,check=True,capture_output=True).stdout.strip()
 if kind!=b'commit':raise ValueError('Execution source object must be a commit')
 records=[]
 for relative in ['tools/inference/text-encoder/accept_plain.py','tools/inference/text-encoder/plain_checks.py','tools/inference/vae/process_lifecycle.py',*NODE_SDK_SOURCE_PATHS]:
  raw=(root/relative).read_bytes();fixed=subprocess.run(['git','show',execution_source_sha+':'+relative],cwd=root,check=True,capture_output=True).stdout
  if raw!=fixed:raise ValueError('Executed source differs from committed source: '+relative)
  records.append({'path':relative,'bytes':len(raw),'sha256':sha(raw),'executionSourceSha':execution_source_sha})
 return records

def advise_text_graph_cache(bundle,blocks,index,policy,*,phase,case_id=None,seen=None):
 """Best-effort clean-page advice on readonly prepared Text graphs only."""
 policy.setdefault('policy','readonly POSIX_FADV_DONTNEED for selected prepared Text graph files')
 policy.setdefault('scope','Advisory requests only; successful calls and cumulative file bytes do not prove page eviction, lower RSS or free memory')
 for key in ['requestCount','advisedCount','advisedFileBytes']:policy.setdefault(key,0)
 policy.setdefault('requests',[]);policy.setdefault('errors',[])
 if type(index) is not int or not 0<=index<len(blocks):policy['errors'].append({'phase':phase,'caseId':case_id,'index':index,'message':'Invalid prepared graph index; no file opened'});return
 key=(case_id,index)
 if seen is not None:
  if key in seen:return
  seen.add(key)
 block=blocks[index];path=(bundle/block['path']).resolve();entry={'phase':phase,'caseId':case_id,'index':index,'path':str(path),'bytes':block['bytes'],'advised':False};policy['requests'].append(entry);policy['requestCount']+=1;fd=None
 try:
  if not path.is_relative_to(bundle.resolve()) or path.suffix!='.onnx':raise ValueError('Cache advice is restricted to prepared graph files inside the Text bundle')
  fd=os.open(path,os.O_RDONLY|getattr(os,'O_CLOEXEC',0))
  if os.fstat(fd).st_size!=block['bytes']:raise ValueError('Prepared graph file size mismatch')
  os.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED);entry['advised']=True;policy['advisedCount']+=1;policy['advisedFileBytes']+=block['bytes']
 except FileNotFoundError as error:
  policy['errors'].append({**entry,'name':type(error).__name__,'message':str(error)});raise
 except Exception as error:policy['errors'].append({**entry,'name':type(error).__name__,'message':str(error)})
 finally:
  if fd is not None:
   try:os.close(fd)
   except OSError as error:policy['errors'].append({**entry,'name':type(error).__name__,'message':'Readonly descriptor close: '+str(error)})

def consume_node_sdk_artifacts(a,host,inputs,manifest,oracle_cases,report):
 """Compare each completed public-SDK artifact once, including after host death."""
 import numpy as np
 selected={record['id']:record for record in inputs};completed={item['id'] for item in report['comparisons']};cases=host.get('cases',[])
 if len({case['id'] for case in cases})!=len(cases):raise ValueError('Duplicate Node host case receipt')
 for case in cases:
  case_id=case['id']
  if case_id not in selected:raise ValueError('Unexpected Node host case: '+case_id)
  if case_id in completed or case.get('passed') is not True:continue
  record=selected[case_id];artifact=case['artifact'];path=a.output/(case_id+'.wktensor')
  if artifact['path']!=path.name:raise ValueError('Unexpected native artifact path')
  raw=path.read_bytes()
  if len(raw)!=artifact['bytes'] or sha(raw)!=artifact['sha256']:raise ValueError('Node artifact bytes/hash mismatch: '+case_id)
  meta,actual=unpack_tensor(raw,shape=record['shape']);reference=np.fromfile(a.reference/(case_id+'-reference.f32'),dtype='<f4').reshape(record['shape']);mask=np.array(record['attentionMask'],dtype=np.uint8)
  if meta['modelSha256']!=manifest['modelSha256'] or meta['tokenizerSha256']!=manifest['tokenizer']['sha256'] or meta['attentionMask']!=record['attentionMask'] or meta.get('normalization')!='umt5-final-rmsnorm-f32-v1':raise ValueError('Node native tensor identity/mask/normalization mismatch')
  comparison=compare_values(actual,reference,mask,shape=record['shape'])
  if not comparison['finite'] or not comparison['paddingExactlyZero']:raise ValueError('Node native/reference finite or exact masked-row contract failed: '+case_id)
  report['comparisons'].append({'id':case_id,**comparison,'artifact':artifact,'reference':oracle_cases[case_id]['reference']});completed.add(case_id)
  if not comparison['passed']:report['numericFailures'].append({'id':case_id,'kind':'case-output','comparison':comparison})

def run_node_sdk(a,plan,manifest,inputs,oracle_cases,reference_source_sha):
 """Conforming reference host; no Browser Worker or cancellation acceptance."""
 import psutil
 report={'passed':False,'complete':False,'scope':'Node conforming reference host using the normal public Text factory and shared Text job; no Browser Worker/T3 control acceptance','host':'node-sdk','executionSourceSha':a.execution_source_sha,'referenceExecutionSourceSha':reference_source_sha,'inputs':inputs,'selectedCaseIds':[record['id'] for record in inputs],'comparisons':[],'numericFailures':[],'sourceClosure':[],'preflightOnly':a.preflight_only,'browserWorkerAcceptance':False,'cancellationAcceptance':False,'newExports':0,'gate':manifest['numericGate'],'progress':[],'memoryTimeline':[]}
 receipt=a.output/'node-sdk-acceptance.json';host_path=a.output/'node-sdk-results.json';owner=ProcessOwnership().start();stop=threading.Event();process=None;peak=0;started=time.monotonic();root=psutil.Process();advised_blocks=set();report['preparedGraphCacheAdvice']={}
 def update():
  if host_path.exists():
   host=json.loads(host_path.read_text());report['native']=host
   if not a.preflight_only:consume_node_sdk_artifacts(a,host,inputs,manifest,oracle_cases,report)
  completed={item['id'] for item in report['comparisons']};report['completedCaseIds']=[record['id'] for record in inputs if record['id'] in completed];report['pendingCaseIds']=[record['id'] for record in inputs if record['id'] not in completed]
  write_json(receipt,{key:value for key,value in report.items() if key!='memoryTimeline'}|{'memorySamples':len(report['memoryTimeline'])})
 def sample():
  nonlocal peak
  try:
   while not stop.wait(.1):
    rows=[]
    for child in [root,*root.children(recursive=True)]:
     try:rows.append({'pid':child.pid,'ctime':child.create_time(),'rssBytes':child.memory_info().rss})
     except psutil.NoSuchProcess:pass
    total=sum(row['rssBytes'] for row in rows);peak=max(peak,total);report['memoryTimeline'].append({'elapsedSeconds':time.monotonic()-started,'rssSumBytes':total,'processes':rows})
  except Exception as error:report['memorySamplerFailure']=str(error)
 sampler=threading.Thread(target=sample,daemon=True);sampler.start()
 try:
  report['sourceClosure']=verify_node_sdk_sources(ROOT,a.execution_source_sha)
  report['sourceVerification']={'parent':'Git cat-file confirms exact commit; git show byte equality for full Node closure and parent harness','node':'Independent filesystem byte length and SHA-256 checks against the exact parent-verified table','nodeRunsGit':False}
  config={'root':str(ROOT),'bundle':str(a.bundle.resolve()),'source':str(a.source.resolve()),'inputs':inputs,'manifest':manifest,'manifestSha256':inputs[0]['manifestSha256'],'executionSourceSha':a.execution_source_sha,'output':str(a.output.resolve()),'diagnostics':False,'preflightOnly':a.preflight_only}
  config['sourceRecords']=[record for record in report['sourceClosure'] if record['path'] in NODE_SDK_SOURCE_PATHS]
  for index in range(len(manifest['blocks'])):advise_text_graph_cache(a.bundle,manifest['blocks'],index,report['preparedGraphCacheAdvice'],phase='before-node')
  write_json(receipt,report)
  with (a.output/'node-sdk-stdout.txt').open('w') as stdout,(a.output/'node-sdk-stderr.txt').open('w') as stderr:
   process=subprocess.Popen(['node',str(HERE/'node_sdk_host.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=stderr,text=True)
   report['ownedNode']={'pid':process.pid,'ctime':psutil.Process(process.pid).create_time()};write_json(receipt,{key:value for key,value in report.items() if key!='memoryTimeline'})
   process.stdin.write(json.dumps(config));process.stdin.close()
   for line in process.stdout:
    stdout.write(line);stdout.flush()
    if line.strip():
     event=json.loads(line);report['progress'].append(event)
     if event.get('phase')=='node-sdk-progress' and event.get('stage')=='text-block' and event.get('id') in report['selectedCaseIds']:
      completed=event.get('completed');index=completed-1 if type(completed) is int else None
      advise_text_graph_cache(a.bundle,manifest['blocks'],index,report['preparedGraphCacheAdvice'],phase='block-complete',case_id=event['id'],seen=advised_blocks)
     print(json.dumps(event),flush=True);update()
   code=process.wait();report['nodeExitCode']=code;update()
  native=report.get('native',{});report['complete']=a.preflight_only or not report['pendingCaseIds'];report['completedFullNeuralRuns']=0 if a.preflight_only else len(report['completedCaseIds'])
  report['passed']=code==0 and native.get('passed') is True and report['complete'] and not report['numericFailures']
  if not report['passed']:report['failure']={'name':'NumericGateFailure' if report['numericFailures'] else 'NodeHostFailure','message':'Node host or selected native case acceptance failed; completed artifacts retained','nodeExitCode':code,'nativeFailure':native.get('failure'),'numericFailureIds':[failure['id'] for failure in report['numericFailures']]}
  if a.preflight_only:report['newNeuralRuns']=0
 except Exception as error:
  report['passed']=False;report['failure']={'name':type(error).__name__,'message':str(error),'traceback':traceback.format_exc()}
  if process is not None and process.poll() is None:
   process.terminate()
   try:process.wait(timeout=10)
   except subprocess.TimeoutExpired:process.kill();process.wait()
 finally:
  stop.set();sampler.join();proc=owner.finish(timeout_seconds=5);report['processOwnership']=proc
  if report.get('memorySamplerFailure') or not cleanup_complete(proc['liveAfterClose'],proc['zombiesAfterClose'],proc['errors']):report['passed']=False
  report['resource']={'wallSeconds':time.monotonic()-started,'sampledGroupPeakRssSumBytes':peak,'sampleIntervalSeconds':.1,'scope':'RSS sum of this harness and its owned Node descendants only; excludes concurrent VAE/other jobs, can double-count shared pages and miss short peaks'}
  if not a.preflight_only and report.get('native') is not None:
   try:write_json(a.output/'conditioning-handoff.json',{'schemaVersion':'works-text-standalone-handoff/1.0','passed':report['passed'],'scope':report['scope'],'host':'node-sdk','executionSourceSha':a.execution_source_sha,'referenceExecutionSourceSha':reference_source_sha,'inputs':inputs,'completedCaseIds':report.get('completedCaseIds',[]),'pendingCaseIds':report.get('pendingCaseIds',[record['id'] for record in inputs]),'gate':manifest['numericGate'],'comparisons':report['comparisons'],'numericFailures':report['numericFailures'],'browserWorkerAcceptance':False,'cancellationAcceptance':False,'generationReady':False})
   except Exception as error:report['passed']=False;report['failure']={'name':type(error).__name__,'message':str(error)}
  write_json(receipt,report)
 print(json.dumps({'passed':report['passed'],'host':'node-sdk','complete':report['complete'],'comparisons':report['comparisons'],'failure':report.get('failure'),'resource':report['resource']}),flush=True)
 return 0 if report['passed'] else 1

def main():
 p=argparse.ArgumentParser(description=__doc__)
 for key in ['plan','bundle','source','reference','output']:p.add_argument('--'+key,required=True,type=Path)
 p.add_argument('--execution-source-sha');p.add_argument('--reference-execution-source-sha');p.add_argument('--browser',default=os.environ.get('CHROMIUM_BINARY') or shutil.which('chromium'));p.add_argument('--preflight-only',action='store_true');p.add_argument('--case-id',action='append');p.add_argument('--skip-controls',action='store_true');p.add_argument('--node-sdk',action='store_true');a=p.parse_args()
 if a.node_sdk and not a.skip_controls:p.error('--node-sdk requires --skip-controls; Browser/T3 controls are separate')
 if not a.node_sdk:assert a.browser,'Real Chromium required'
 if a.output.exists():raise FileExistsError('Fresh private output directory required')
 assert not a.output.resolve().is_relative_to(ROOT/'docs')
 assert shutil.disk_usage(a.output.parent).free>=536870912,'At least512MiB disk headroom required'
 a.output.mkdir(parents=True)
 plan=json.loads(a.plan.read_text());manifest=json.loads((a.bundle/'manifest.json').read_text());suite_mode='cases' in plan
 inputs=json.loads((a.reference/'text-inputs.json').read_text())['inputs'] if suite_mode else [json.loads((a.reference/'plain-input.json').read_text())]
 if a.case_id:
  assert suite_mode and set(a.case_id)<=set(record['id'] for record in inputs),'Unknown selected suite case'
  inputs=[record for record in inputs if record['id'] in a.case_id]
 input_record=inputs[0]
 if a.node_sdk:validate_node_sdk_mode(a.skip_controls,suite_mode,inputs)
 reference_source_sha=a.reference_execution_source_sha or a.execution_source_sha
 assert sha((a.bundle/'manifest.json').read_bytes())==plan['selectedManifest']['sha256']==input_record['manifestSha256'];validate_gate(manifest['numericGate'])
 assert a.source.stat().st_size==manifest['modelBytes']
 if suite_mode:
  planned={case['id']:case for case in plan['cases']}
  for record in inputs:
   expected=planned[record['id']]['input'];assert record['manifestSha256']==input_record['manifestSha256'] and record.get('byteGraph')==planned[record['id']].get('byteGraph')
   if 'text' in expected:assert record['input']=={'text':expected['text']} and sha(expected['text'].encode())==record['textUtf8Sha256']
   else:assert record['input']==expected
 else:assert input_record['textUtf8Sha256']==plan['input']['utf8Sha256']
 if not a.preflight_only:
  assert a.execution_source_sha and reference_source_sha and all(record['executionSourceSha']==reference_source_sha for record in inputs),'Committed source oracle required'
  oracle=json.loads((a.reference/'reference-results.json').read_text());assert oracle['passed'] and oracle['oracleUsesOnnxOrHike'] is False and oracle['input']['oracleUsesFull512Positions']
  if suite_mode:
   assert sha(a.plan.read_bytes())==oracle['plan']['sha256'],'Frozen suite plan changed since source oracle'
   oracle_cases={case['id']:case for case in oracle['cases']}
   for record in inputs:
    case=oracle_cases[record['id']];assert case['input']==record and case['oracleInternalShape']==[1,512,4096]
    assert sha((a.reference/(record['id']+'-reference.f32')).read_bytes())==case['reference']['sha256']
  else:assert sha((a.reference/'plain-reference.f32').read_bytes())==oracle['reference']['sha256']
 if a.node_sdk:return run_node_sdk(a,plan,manifest,inputs,{} if a.preflight_only else oracle_cases,reference_source_sha)
 served={};server_errors=[]
 def source_bytes(path):
  raw=path.read_bytes();relative=str(path.relative_to(ROOT))
  if not a.preflight_only:
   fixed=subprocess.run(['git','show',a.execution_source_sha+':'+relative],cwd=ROOT,check=True,capture_output=True).stdout
   if raw!=fixed:raise ValueError('Executed source differs from committed source: '+relative)
  served[relative]={'path':relative,'bytes':len(raw),'sha256':sha(raw),'executionSourceSha':a.execution_source_sha}
  return raw
 for path in [Path(__file__),HERE/'plain_checks.py',HERE/'plain_browser.mjs',HERE/'plain_observer_worker.mjs',HERE/'plain_memory.mjs',HERE.parent/'vae/process_lifecycle.py',ROOT/'docs/shared/vr180/sha256.mjs']:source_bytes(path)
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def do_GET(self):
   try:
    relative=urlsplit(self.path).path
    if relative=='/':raw=b'<!doctype html><input id="bundle" type="file" multiple><input id="source" type="file"><script type="module" src="/plain-proof/plain_browser.mjs"></script>';kind='text/html'
    elif relative.startswith('/plain-proof/'):
     name=relative.removeprefix('/plain-proof/');assert name in ['plain_browser.mjs','plain_observer_worker.mjs','plain_memory.mjs'];raw=source_bytes(HERE/name);kind='text/javascript'
    elif relative=='/shared/vr180/sha256.mjs':raw=source_bytes(ROOT/'docs/shared/vr180/sha256.mjs');kind='text/javascript'
    elif relative.startswith('/shared/inference/') and relative.endswith(('.mjs','.wasm')):
     path=(ROOT/'docs'/relative.lstrip('/')).resolve();assert path.is_relative_to(ROOT/'docs/shared/inference');raw=source_bytes(path);kind='application/wasm' if path.suffix=='.wasm' else 'text/javascript'
    else:self.send_error(404);return
    self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
   except (BrokenPipeError,ConnectionResetError):pass
   except Exception as error:server_errors.append(str(error));self.send_error(500,str(error))
 owner=ProcessOwnership().start();start=time.monotonic();report={'passed':False,'scope':'Selected explicit Text cases, actual native Worker/ORT WASM/Hike compared with independent uncompacted full512 source' if suite_mode else 'Native plain Hello world FP32 diagnostic compared with the selected independent full512 reference','executionSourceSha':a.execution_source_sha,'referenceExecutionSourceSha':reference_source_sha,'reusedReference':None if a.preflight_only else {'executionSourceSha':reference_source_sha,'reference':oracle['reference'],'usesFull512Positions':oracle['input']['oracleUsesFull512Positions'],'usesOnnxOrHike':oracle['oracleUsesOnnxOrHike'],'gate':manifest['numericGate']},'preflightOnly':a.preflight_only,'input':input_record,'inputs':inputs,'gate':manifest['numericGate'],'newExports':0,'httpRequests':[],'blockedRequests':[],'pageErrors':[],'consoleErrors':[],'progress':[],'memoryEvents':[],'memoryTimeline':[],'memoryProcesses':[],'servedSources':served,'serverErrors':server_errors}
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);serverthread=threading.Thread(target=server.serve_forever,daemon=True);serverthread.start();base=f'http://127.0.0.1:{server.server_port}'
 import psutil
 rootprocess=psutil.Process();memory_stop=threading.Event();group_peak=0;pid_peaks={};memory_samples=0;process_details={}
 def sample_group():
  nonlocal group_peak,memory_samples
  while not memory_stop.wait(.05):
   sampled=time.monotonic();sample_epoch_ms=time.time()*1000;total=0;pss_total=0;pss_complete=True;process_samples=[]
   for process in [rootprocess,*rootprocess.children(recursive=True)]:
    try:
     key=(process.pid,process.create_time());rss=process.memory_info().rss;total+=rss;pid_peaks[key]=max(pid_peaks.get(key,0),rss)
     if key not in process_details:
      name=process.name();command=process.cmdline();role='harness' if process.pid==rootprocess.pid else next((arg.removeprefix('--type=') for arg in command if arg.startswith('--type=')),name)
      process_details[key]={'pid':key[0],'ctime':key[1],'name':name,'role':role,'cmdline':command};report['memoryProcesses'].append(process_details[key])
     try:pss=getattr(process.memory_full_info(),'pss',None)
     except (psutil.NoSuchProcess,psutil.AccessDenied):pss=None
     if pss is None:pss_complete=False
     else:pss_total+=pss
     process_samples.append({'pid':key[0],'ctime':key[1],'role':process_details[key]['role'],'rssBytes':rss,'pssBytes':pss})
    except (psutil.NoSuchProcess,psutil.AccessDenied):pss_complete=False
   group_peak=max(group_peak,total);memory_samples+=1
   phase=report['memoryEvents'][-1].get('phase','setup') if report['memoryEvents'] else 'startup'
   report['memoryTimeline'].append({'epochMs':sample_epoch_ms,'endEpochMs':time.time()*1000,'elapsedSeconds':sampled-start,'sampleDurationMs':(time.monotonic()-sampled)*1000,'phase':phase,'rssSumBytes':total,'pssSumBytes':pss_total,'pssComplete':pss_complete,'processes':process_samples})
 def guarded_sample_group():
  try:sample_group()
  except Exception as error:report.setdefault('memorySamplerErrors',[]).append({'name':type(error).__name__,'message':str(error),'traceback':traceback.format_exc()})
 memorythread=threading.Thread(target=guarded_sample_group,daemon=True);memorythread.start()
 try:
  from playwright.sync_api import sync_playwright
  with sync_playwright() as pw:
   browser=pw.chromium.launch(executable_path=a.browser,headless=True,args=['--no-sandbox']);report['browserVersion']=browser.version
   try:
    context=browser.new_context(accept_downloads=True,service_workers='block')
    def route(r):
     request=r.request;record={'method':request.method,'url':request.url};report['httpRequests'].append(record)
     if request.method=='GET' and request.url.startswith(base+'/'):r.continue_()
     else:report['blockedRequests'].append(record);r.abort()
    context.route('**/*',route);page=context.new_page();page.set_default_timeout(1800000)
    page.on('pageerror',lambda error:report['pageErrors'].append(str(error)))
    def console(message):
     if message.type=='error':report['consoleErrors'].append(message.text)
     if message.text.startswith('plain-progress:'):
      event=json.loads(message.text.removeprefix('plain-progress:'));report['progress'].append(event);print(json.dumps(event),flush=True)
     if message.text.startswith('plain-memory:'):
      event=json.loads(message.text.removeprefix('plain-memory:'));event['receivedEpochMs']=time.time()*1000;report.setdefault('memoryEvents',[]).append(event)
    page.on('console',console);page.goto(base+'/',wait_until='networkidle');page.wait_for_function('typeof runPlain === "function"')
    selected=[a.bundle/'manifest.json',*(a.bundle/r['path'] for r in manifest['blocks']),a.bundle/manifest['embedding']['rowHashes']['path'],a.bundle/manifest['finalNorm']['path'],a.bundle/manifest['tokenizer']['path']]
    page.set_input_files('#bundle',[str(path) for path in selected]);page.set_input_files('#source',str(a.source))
    if suite_mode:
     suite_spec={'inputs':inputs,'manifest':manifest,'manifestSha256':input_record['manifestSha256'],'negativeCases':plan.get('negativeCases',[])}
     if a.preflight_only:
      report['preflight']=page.evaluate('spec=>runTextSuite({...spec,preflightOnly:true})',suite_spec)
      assert report['preflight']['passed'] and report['preflight']['newNeuralRuns']==0 and report['preflight']['workers']['created']==0,report['preflight'];report['newNeuralRuns']=0;report['passed']=True
     else:
      import numpy as np
      controls=[] if a.skip_controls else plan.get('controls',[])
      control_inputs=[]
      if controls:
       control_inputs,report['controlReferencePreflight']=validate_suite_control_references(plan,json.loads((a.reference/'text-inputs.json').read_text())['inputs'],[record['id']for record in inputs],oracle_cases,a.reference,reference_source_sha,input_record['manifestSha256'])
      native_cases=[];native_controls=[];comparisons=[];numeric_failures=[]
      report['native']={'passed':False,'cases':native_cases,'controls':native_controls};report['comparisons']=comparisons;report['numericFailures']=numeric_failures
      for record in inputs:
       save_controls=[control for control in controls if control['action']=='cancel-save' and control['caseId']==record['id']]
       spec={**suite_spec,'inputs':[record],'controls':save_controls,'negativeCases':[]}
       with page.expect_download(timeout=1800000) as download:
        native=page.evaluate('spec=>runTextSuite(spec)',spec)
        assert native['passed'],native.get('error')
       download.value.save_as(str(a.output/(record['id']+'.wktensor')))
       assert len(native['cases'])==1
       native_cases.extend(native['cases']);native_controls.extend(native['controls'])
       meta,actual=unpack_tensor((a.output/(record['id']+'.wktensor')).read_bytes(),shape=record['shape'])
       reference=np.fromfile(a.reference/(record['id']+'-reference.f32'),dtype='<f4').reshape(record['shape']);mask=np.array(record['attentionMask'],dtype=np.uint8)
       validate_text_storage_metadata(meta,record,manifest)
       comparison=compare_values(actual,reference,mask,shape=record['shape'])
       if not comparison['finite'] or not comparison['paddingExactlyZero']:raise ValueError('Native/reference finite values or exact masked-row contract failed: '+record['id'])
       comparisons.append({'id':record['id'],**comparison,'artifact':{'path':record['id']+'.wktensor','bytes':(a.output/(record['id']+'.wktensor')).stat().st_size,'sha256':sha((a.output/(record['id']+'.wktensor')).read_bytes())},'reference':oracle_cases[record['id']]['reference']})
       if not comparison['passed']:numeric_failures.append({'id':record['id'],'kind':'case-output','comparison':comparison})
      cancel_controls=[control for control in controls if control['action']!='cancel-save']
      if cancel_controls:
       control_ids={control['caseId'] for control in cancel_controls}
       assert {record['id'] for record in control_inputs}==control_ids,'Control case absent from frozen source inputs'
       control_spec={**suite_spec,'inputs':[],'controlInputs':control_inputs,'controls':cancel_controls}
       recover_controls=[control for control in cancel_controls if control.get('recover')]
       if recover_controls:
        with page.expect_download(timeout=1800000) as download:
         native=page.evaluate('spec=>runTextSuite(spec)',control_spec)
         assert native['passed'],native.get('error')
        control=recover_controls[0];recovery=next(value for value in native['controls'] if value['id']==control['id'])['recovery'];name='recovery-'+control['id']+'.wktensor'
        if recovery['download']['name']!=name:raise ValueError('Unexpected recovery download name')
        download.value.save_as(str(a.output/name))
       else:
        native=page.evaluate('spec=>runTextSuite(spec)',control_spec)
        assert native['passed'],native.get('error')
       native_controls.extend(native['controls'])
       for control in native['controls']:
        if 'recovery' not in control:continue
        recovery=control['recovery'];record=next(record for record in control_inputs if record['id']==control['caseId'])
        name='recovery-'+control['id']+'.wktensor';raw=(a.output/name).read_bytes();artifact={'path':name,'bytes':len(raw),'sha256':sha(raw)}
        if len(raw)!=recovery['download']['bytes'] or sha(raw)!=recovery['download']['sha256']:raise ValueError('Recovery artifact bytes/hash mismatch: '+control['id'])
        meta,actual=unpack_tensor(raw,shape=record['shape']);validate_text_storage_metadata(meta,record,manifest)
        reference=np.fromfile(a.reference/(record['id']+'-reference.f32'),dtype='<f4').reshape(record['shape'])
        recovery['artifact']=artifact;recovery['reference']=oracle_cases[record['id']]['reference'];recovery['comparison']=compare_values(actual,reference,np.array(record['attentionMask'],dtype=np.uint8),shape=record['shape'])
        if not recovery['comparison']['finite'] or not recovery['comparison']['paddingExactlyZero']:raise ValueError('Recovery finite values or exact masked-row contract failed: '+control['id'])
        if not recovery['comparison']['passed']:numeric_failures.append({'id':control['id'],'caseId':record['id'],'kind':'recovery-output','comparison':recovery['comparison']})
      if len(native_controls)!=len(controls) or {control['id']for control in native_controls}!={control['id']for control in controls}:raise ValueError('Selected suite controls were not all collected')
      report['native']={'passed':True,'cases':native_cases,'controls':native_controls};report['comparisons']=comparisons
      report['nativeJobAttempts']=len(native_cases)+len(cancel_controls)+sum('recovery' in control for control in native_controls);report['completedFullNeuralRuns']=len(native_cases)+sum('recovery' in control for control in native_controls);report['cancelledJobs']=len(cancel_controls)
      assert not report['pageErrors'] and not report['blockedRequests'] and not server_errors
      report['passed']=not numeric_failures
      if numeric_failures:report['failure']={'name':'NumericGateFailure','message':'Selected Text outputs failed the unchanged numeric gate; all selected cases and native controls were collected','ids':[failure['id'] for failure in numeric_failures]}
      write_json(a.output/'conditioning-handoff.json',{'schemaVersion':'works-text-standalone-handoff/1.0','scope':'Selected explicit Text cases only','passed':report['passed'],'executionSourceSha':a.execution_source_sha,'referenceExecutionSourceSha':reference_source_sha,'inputs':inputs,'gate':manifest['numericGate'],'comparisons':comparisons,'numericFailures':numeric_failures,'controls':native_controls,'independentReference':'Pinned PyTorch source, uncompacted512 positions per case, batch1; final normalized/masked reference sliced to native requested L','generationReady':False})
    elif a.preflight_only:
     report['preflight']=page.evaluate('''async input=>{const {tokenizePlainText}=await import('/shared/inference/tokenizer.mjs');const ort=await import('/shared/inference/vendor/ort.wasm.min.mjs');const files=new Map(Array.from(document.querySelector('#bundle').files,f=>[f.name,f]));const result=await tokenizePlainText(input.text,new Uint8Array(await files.get('spiece.model').arrayBuffer()));return {ids:Array.from(result.tokenIds),mask:Array.from(result.attentionMask),tokenizerSha256:result.tokenizerSha256,sourceFileBytes:document.querySelector('#source').files[0].size,ortCreateWritable:Object.getOwnPropertyDescriptor(ort.InferenceSession,'create')?.writable,tensorDisposeType:typeof ort.Tensor.prototype.dispose};}''',input_record)
     q=report['preflight'];assert q['ids']==input_record['tokenIds'] and q['mask']==input_record['attentionMask'] and q['tokenizerSha256']==input_record['tokenizerSha256'];assert q['ortCreateWritable'] and q['tensorDisposeType']=='function';assert q['sourceFileBytes']==manifest['modelBytes'];report['newNeuralRuns']=0;report['passed']=True
    else:
     with page.expect_download(timeout=1800000) as download:report['native']=page.evaluate('spec=>runPlain(spec)',{'input':input_record,'manifest':manifest})
     download.value.save_as(str(a.output/'plain-conditioning.wktensor'))
     assert report['native']['passed'],report['native'].get('error');assert not report['pageErrors'] and not report['blockedRequests'] and not server_errors
     meta,actual=unpack_tensor((a.output/'plain-conditioning.wktensor').read_bytes())
     import numpy as np
     reference=np.fromfile(a.reference/'plain-reference.f32',dtype='<f4').reshape(1,512,4096);mask=np.array(input_record['attentionMask'],dtype=np.uint8)
     assert meta['modelSha256']==manifest['modelSha256'] and meta['tokenizerSha256']==manifest['tokenizer']['sha256'] and meta['attentionMask']==input_record['attentionMask']
     report['comparison']=compare_values(actual,reference,mask);assert report['comparison']['passed'],report['comparison'];report['passed']=True
     handoff={'schemaVersion':'works-plain-conditioning-handoff/1.0','scope':'One explicit accepted plain prompt FP32 diagnostic','executionSourceSha':a.execution_source_sha,'referenceExecutionSourceSha':report.get('referenceExecutionSourceSha',input_record['executionSourceSha']),'file':'plain-conditioning.wktensor','fileSha256':sha((a.output/'plain-conditioning.wktensor').read_bytes()),'header':meta,'sourceInput':{'kind':'plain-text','text':input_record['text'],'utf8Sha256':input_record['textUtf8Sha256']},'reference':oracle['reference'],'gate':manifest['numericGate'],'comparison':report['comparison'],'numericReferenceScope':'Selected full512 pinned PyTorch source, independent of original ID fixture and ORT/Hike execution; source execution SHA is separate from current browser execution','p3Reuse':'Native WKTSR001 tensor/mask/model/tokenizer unchanged; source text hash/gate/reference are outer lineage evidence, not fabricated native fields'}
     write_json(a.output/'conditioning-handoff.json',handoff)
    context.close()
   finally:browser.close();report['browserClosed']=True
 except Exception as error:report['passed']=False;report['failure']={'name':type(error).__name__,'message':str(error),'traceback':traceback.format_exc()}
 finally:
  server.shutdown();server.server_close();serverthread.join();memory_stop.set();memorythread.join();report['localServerClosed']=True
  report['processOwnership']=proc=owner.finish(timeout_seconds=5)
  report['resource']={'sampledGroupPeakRssSumBytes':group_peak,'sampleIntervalSeconds':.05,'samples':memory_samples,'perPidPeakRss':[{'pid':pid,'ctime':ctime,'peakRssBytes':rss} for (pid,ctime),rss in pid_peaks.items()],'wallSeconds':time.monotonic()-start,**memory_summary(report),'scope':'Sampled RSS/PSS over harness descendants including startup/full/cancellation; sampling can miss short peaks. API-visible bytes and WASM capacity are separate from retained OS memory and user-device benefit.'}
  errors={key:report.get(key,[]) for key in ['pageErrors','consoleErrors','blockedRequests','memorySamplerErrors']};errors['serverErrors']=server_errors
  if 'memoryEvents' in report and not a.preflight_only and not suite_mode:
   events=[event for event in report['memoryEvents'] if event.get('source')=='worker' and event.get('phase')=='full']
   coverage={name:sum(event.get('event')==name for event in events) for name in ['ort-create-end','ort-run-end','ort-release-end','tensor-dispose-end']}
   coverage['wasmCapacityObserved']=any(memory.get('capacityBytes',0)>0 for event in events for memory in event.get('wasmMemories',[]));report['memoryCoverage']=coverage
   if coverage!={'ort-create-end':24,'ort-run-end':24,'ort-release-end':24,'tensor-dispose-end':72,'wasmCapacityObserved':True} or not report.get('memoryTimeline'):errors['memoryCoverage']=['Missing full-session events, WASM capacity or process timeline']
  if suite_mode and not a.preflight_only:
   coverage={}
   for record in inputs:
    events=[event for event in report['memoryEvents'] if event.get('source')=='worker' and event.get('phase')=='case:'+record['id']]
    counts={name:sum(event.get('event')==name for event in events) for name in ['ort-create-end','ort-run-end','ort-release-end','tensor-dispose-end']}
    counts['wasmCapacityObserved']=any(memory.get('capacityBytes',0)>0 for event in events for memory in event.get('wasmMemories',[]));coverage[record['id']]=counts
    if counts!={'ort-create-end':24,'ort-run-end':24,'ort-release-end':24,'tensor-dispose-end':72,'wasmCapacityObserved':True}:errors.setdefault('memoryCoverage',[]).append(record['id'])
   report['memoryCoverage']=coverage
   if not report.get('memoryTimeline'):errors.setdefault('memoryCoverage',[]).append('Missing process timeline')
  if any(errors.values()):report['passed']=False;report.setdefault('failure',{'name':'ObservationError','message':'Browser/server/memory observation errors','details':errors})
  if not cleanup_complete(proc['liveAfterClose'],proc['zombiesAfterClose'],proc['errors']):report['passed']=False
  report['servedSources']=list(served.values());write_json(a.output/'browser-results.json',report)
 print(json.dumps({'passed':report['passed'],'failure':report.get('failure'),'comparison':report.get('comparison'),'comparisons':report.get('comparisons'),'resource':report['resource'],'newExports':0}),flush=True)
 return 0 if report['passed'] else 1
if __name__=='__main__':raise SystemExit(main())
