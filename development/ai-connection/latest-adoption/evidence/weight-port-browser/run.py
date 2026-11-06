import datetime,hashlib,http.server,json,pathlib,subprocess,threading,time
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path('/workspace/work/ai-connection/full-route-r17/checkout')
PRIVATE=pathlib.Path(__file__).resolve().parent
COMMIT='f084790d7f594915c869ef375fcbdc6e44ee56f3'
PATHS=['docs/shared/ai-connection','docs/shared/ft/vendor/fflate.mjs']
sha=lambda b:hashlib.sha256(b).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def capture():
 head=git('rev-parse','HEAD').decode().strip()
 if head!=COMMIT:raise ValueError('Expected frozen source A commit: '+head)
 subprocess.run(['git','diff','--exit-code',COMMIT,'--',*PATHS],cwd=ROOT,check=True,stdout=subprocess.PIPE)
 names=git('ls-files','-z','--',*PATHS).decode().split('\0')
 data={name:(ROOT/name).read_bytes() for name in names if name}
 manifest=[{'path':name,'byteLength':len(value),'sha256':sha(value)} for name,value in sorted(data.items())]
 digest=sha(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode())
 return data,{'commit':head,'capturedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'trackedSourceCount':len(manifest),'totalBytes':sum(x['byteLength'] for x in manifest),'sourceInventorySHA256':digest,'allEqualCommittedBytes':True,'gitStatusPorcelain':git('status','--porcelain').decode(),'files':manifest}
frozen,before=capture();(PRIVATE/'source-before.json').write_text(json.dumps(before,indent=2))
harness=(PRIVATE/'harness.mjs').read_bytes();requests=[];denied=[]
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  name=urlsplit(self.path).path.lstrip('/')
  if not name:value=b'<!doctype html><link rel="icon" href="data:,"><title>Fixed f084790 weight-port ownership probe</title>';mime='text/html'
  elif name=='harness.mjs':value=harness;mime='text/javascript'
  elif name in frozen:
   value=frozen[name];mime='text/javascript' if name.endswith(('.mjs','.js')) else 'application/json' if name.endswith('.json') else 'application/octet-stream';requests.append({'path':name,'sha256':sha(value),'byteLength':len(value)})
  else:
   denied.append(name);self.send_response(404);self.end_headers();return
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(value)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
worker_events=[];cdp_events=[];worker_serial=0
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 cdp=browser.new_browser_cdp_session()
 cdp.on('Target.targetCreated',lambda event:cdp_events.append({'event':'created','target':event['targetInfo'],'at':time.time()}))
 cdp.on('Target.targetDestroyed',lambda event:cdp_events.append({'event':'destroyed','targetId':event['targetId'],'at':time.time()}))
 cdp.send('Target.setDiscoverTargets',{'discover':True})
 page=browser.new_page()
 def on_worker(worker):
  global worker_serial
  worker_serial+=1;ident=worker_serial;worker_events.append({'event':'created','workerId':ident,'url':worker.url,'at':time.time()})
  worker.on('close',lambda:worker_events.append({'event':'closed','workerId':ident,'url':worker.url,'at':time.time()}))
 page.on('worker',on_worker)
 page.goto('http://127.0.0.1:'+str(server.server_port))
 result=page.evaluate("async()=>{const {run}=await import('/harness.mjs');return await run();}")
 page.wait_for_timeout(200)
 before_browser_close_events=list(worker_events);before_browser_close_cdp=list(cdp_events)
 browser.close()
server.shutdown()
_,after=capture();(PRIVATE/'source-after.json').write_text(json.dumps(after,indent=2))
created={e['workerId'] for e in before_browser_close_events if e['event']=='created'};closed={e['workerId'] for e in before_browser_close_events if e['event']=='closed'}
cdp_created={e['target']['targetId'] for e in before_browser_close_cdp if e['event']=='created' and e['target'].get('type')=='worker'}
cdp_closed={e['targetId'] for e in before_browser_close_cdp if e['event']=='destroyed'}
physical={'playwrightWorkerCreated':len(created),'playwrightWorkerClosedBeforeBrowserClose':len(created&closed),'playwrightLiveBeforeBrowserClose':sorted(created-closed),'cdpWorkerCreated':len(cdp_created),'cdpWorkerDestroyedBeforeBrowserClose':len(cdp_created&cdp_closed),'cdpLiveBeforeBrowserClose':sorted(cdp_created-cdp_closed),'allObservedWorkersPhysicallyClosed':bool(created) and created<=closed and cdp_created<=cdp_closed,'scope':'All actual synthetic-provider dedicated Workers observed across the complete ownership trace; closing recorded before browser shutdown'}
proof={'commit':COMMIT,'beforeSHA256':before['sourceInventorySHA256'],'afterSHA256':after['sourceInventorySHA256'],'unchanged':before['sourceInventorySHA256']==after['sourceInventorySHA256'] and before['files']==after['files'],'trackedSourceCount':before['trackedSourceCount'],'totalBytes':before['totalBytes'],'allEqualCommittedBytes':before['allEqualCommittedBytes'] and after['allEqualCommittedBytes'],'beforeGitStatus':before['gitStatusPorcelain'],'afterGitStatus':after['gitStatusPorcelain'],'harnessSHA256':sha(harness),'runnerSHA256':sha(pathlib.Path(__file__).read_bytes()),'servedFromFrozenBeforeBytes':True,'servedRequestCount':len(requests),'servedUniqueSourceCount':len({r['path'] for r in requests}),'deniedPaths':denied}
result.update({'sourceProof':proof,'physicalWorkerTrace':physical,'modelProvider':'synthetic; native factory relay and native weight client/server are actual adopted code','nativeNNExecuted':False,'realModelFilesLoaded':False})
result['passed']=not result.get('error') and all(x.get('passed') for x in result['cases']) and proof['unchanged'] and proof['allEqualCommittedBytes'] and not denied and physical['allObservedWorkersPhysicallyClosed']
(PRIVATE/'result.json').write_text(json.dumps(result,indent=2))
(PRIVATE/'source-proof.json').write_text(json.dumps(proof,indent=2))
(PRIVATE/'worker-trace.json').write_text(json.dumps({'summary':physical,'playwrightEvents':before_browser_close_events,'cdpEvents':before_browser_close_cdp},indent=2))
(PRIVATE/'served-sources.json').write_text(json.dumps(requests,indent=2))
print(json.dumps({'passed':result['passed'],'cases':result['cases'],'sourceProof':proof,'physicalWorkerTrace':physical,'error':result.get('error')},ensure_ascii=False))
