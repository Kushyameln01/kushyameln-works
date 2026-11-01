#!/usr/bin/env python3
"""Actual plain Worker/ORT/Hike acceptance against an independent full512 oracle."""
import argparse,hashlib,json,mimetypes,os,shutil,subprocess,sys,threading,time,traceback
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
def memory_summary(report):
 samples=report.get('memoryTimeline',[]);phases={};pid_peaks={}
 boundaries={event['event']:event['epochMs'] for event in report.get('memoryEvents',[]) if event.get('source')=='page' and event.get('event') in ['full-start','full-end','cancel-start','cancel-end']}
 def phase_at(sample):
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

def main():
 p=argparse.ArgumentParser(description=__doc__)
 for key in ['plan','bundle','source','reference','output']:p.add_argument('--'+key,required=True,type=Path)
 p.add_argument('--execution-source-sha');p.add_argument('--reference-execution-source-sha');p.add_argument('--browser',default=os.environ.get('CHROMIUM_BINARY') or shutil.which('chromium'));p.add_argument('--preflight-only',action='store_true');a=p.parse_args()
 assert a.browser,'Real Chromium required'
 if a.output.exists():raise FileExistsError('Fresh private output directory required')
 assert not a.output.resolve().is_relative_to(ROOT/'docs')
 assert shutil.disk_usage(a.output.parent).free>=536870912,'At least512MiB disk headroom required'
 a.output.mkdir(parents=True)
 plan=json.loads(a.plan.read_text());manifest=json.loads((a.bundle/'manifest.json').read_text());input_record=json.loads((a.reference/'plain-input.json').read_text())
 reference_source_sha=a.reference_execution_source_sha or a.execution_source_sha
 assert sha((a.bundle/'manifest.json').read_bytes())==plan['selectedManifest']['sha256']==input_record['manifestSha256'];validate_gate(manifest['numericGate'])
 assert input_record['textUtf8Sha256']==plan['input']['utf8Sha256'] and a.source.stat().st_size==manifest['modelBytes']
 if not a.preflight_only:
  assert a.execution_source_sha and reference_source_sha and input_record['executionSourceSha']==reference_source_sha,'Committed source oracle required'
  oracle=json.loads((a.reference/'reference-results.json').read_text());assert oracle['passed'] and oracle['oracleUsesOnnxOrHike'] is False and oracle['input']['oracleUsesFull512Positions']
  assert sha((a.reference/'plain-reference.f32').read_bytes())==oracle['reference']['sha256']
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
 owner=ProcessOwnership().start();start=time.monotonic();report={'passed':False,'scope':'Native plain Hello world FP32 diagnostic compared with the selected independent full512 reference','executionSourceSha':a.execution_source_sha,'referenceExecutionSourceSha':reference_source_sha,'reusedReference':None if a.preflight_only else {'executionSourceSha':reference_source_sha,'reference':oracle['reference'],'usesFull512Positions':oracle['input']['oracleUsesFull512Positions'],'usesOnnxOrHike':oracle['oracleUsesOnnxOrHike'],'gate':manifest['numericGate']},'preflightOnly':a.preflight_only,'input':input_record,'gate':manifest['numericGate'],'newExports':0,'httpRequests':[],'blockedRequests':[],'pageErrors':[],'consoleErrors':[],'progress':[],'memoryEvents':[],'memoryTimeline':[],'memoryProcesses':[],'servedSources':served,'serverErrors':server_errors}
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
    if a.preflight_only:
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
  if 'memoryEvents' in report and not a.preflight_only:
   events=[event for event in report['memoryEvents'] if event.get('source')=='worker' and event.get('phase')=='full']
   coverage={name:sum(event.get('event')==name for event in events) for name in ['ort-create-end','ort-run-end','ort-release-end','tensor-dispose-end']}
   coverage['wasmCapacityObserved']=any(memory.get('capacityBytes',0)>0 for event in events for memory in event.get('wasmMemories',[]));report['memoryCoverage']=coverage
   if coverage!={'ort-create-end':24,'ort-run-end':24,'ort-release-end':24,'tensor-dispose-end':72,'wasmCapacityObserved':True} or not report.get('memoryTimeline'):errors['memoryCoverage']=['Missing full-session events, WASM capacity or process timeline']
  if any(errors.values()):report['passed']=False;report.setdefault('failure',{'name':'ObservationError','message':'Browser/server/memory observation errors','details':errors})
  if not cleanup_complete(proc['liveAfterClose'],proc['zombiesAfterClose'],proc['errors']):report['passed']=False
  report['servedSources']=list(served.values());write_json(a.output/'browser-results.json',report)
 print(json.dumps({'passed':report['passed'],'failure':report.get('failure'),'comparison':report.get('comparison'),'resource':report['resource'],'newExports':0}),flush=True)
 return 0 if report['passed'] else 1
if __name__=='__main__':raise SystemExit(main())
