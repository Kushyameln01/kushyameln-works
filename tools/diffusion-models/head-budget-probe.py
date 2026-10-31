"""Touch/hold/release host3H caches only; neither graph nor full-query numerical acceptance."""
import argparse,hashlib,http.server,json,os,threading,time
from pathlib import Path
import psutil
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[2];cg=Path('/sys/fs/cgroup');maximum=int((cg/'memory.max').read_text());events_before=(cg/'memory.events').read_text();initial=int((cg/'memory.current').read_text());baselinechildren={p.pid for p in psutil.Process().children(recursive=True)}
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*x,**kw):super().__init__(*x,directory=str(root/'docs'),**kw)
 def log_message(self,*x):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();stages=[]
def owned():
 result=[]
 for proc in psutil.Process().children(recursive=True):
  try:
   if proc.pid not in baselinechildren and 'chromium' in proc.name().lower():result.append(proc)
  except (psutil.NoSuchProcess,psutil.AccessDenied):pass
 return result
def sample():
 rows=[]
 for proc in owned():
  try:m=proc.memory_full_info();rows.append((m.rss,m.pss))
  except (psutil.NoSuchProcess,psutil.AccessDenied):pass
 return {'pss':sum(r[1] for r in rows),'rssProcessSum':sum(r[0] for r in rows),'cgroup':int((cg/'memory.current').read_text()),'pidCount':len(rows)}
try:
 with sync_playwright() as pw:
  for n in (32760,65520):
   required=n*5120*4*3;before=int((cg/'memory.current').read_text());reserve=2*1024**3
   if maximum-before<required+reserve:raise MemoryError('Predeclared2GiB headroom reserve failed before allocation; no relaxed retry')
   browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage']);samples=[];stop=threading.Event();started=time.perf_counter()
   def monitor():
    while not stop.wait(.02):samples.append(sample())
   thread=threading.Thread(target=monitor,daemon=True)
   try:
    page=browser.new_page();page.set_default_timeout(120000);page.goto(f'http://127.0.0.1:{server.server_port}/');runtime=page.evaluate("""async()=>{const {createAllHeadContext}=await import('/shared/diffusion-models/ort-bridge/attention-heads/attention.mjs');window.stage=await createAllHeadContext();return {stats:window.stage.stats(),description:window.stage.describe()};}""");baseline=sample();thread.start()
    allocation=page.evaluate("""n=>{const start=performance.now();window.__headBuffers=['hidden','K','V'].map((kind,i)=>{const x=new Float32Array(n*5120);x.fill(i+0.25);return x;});return {arrays:window.__headBuffers.map(x=>({bytes:x.byteLength,first:x[0],last:x.at(-1)})),elapsedMs:performance.now()-start};}""",n)
    held=[sample() for _ in range(3)];check=page.evaluate("""()=>{let checksum=0;for(const x of window.__headBuffers){for(let i=0;i<x.length;i+=1024)checksum+=x[i];checksum+=x.at(-1);}return {checksum,runtime:window.stage.stats(),buffersStillRetained:window.__headBuffers.length===3};}""");allocated=sample();page.evaluate("""async()=>{window.__headBuffers=null;await window.stage.dispose();window.stage=null;}""")
   finally:
    stop.set();thread.join(timeout=2) if thread.is_alive() else None;ownedpids=[p.pid for p in owned()];browser.close()
   deadline=time.monotonic()+10
   while owned() and time.monotonic()<deadline:time.sleep(.05)
   after=sample();assert not owned(),'Owned Chromium processes survived close barrier'
   stage={'tokens':n,'hiddenHBytes':n*5120*4,'named3HBytes':required,'cgroupBeforeBrowserBytes':before,'headroomBytes':maximum-before,'headroomReserveBytes':reserve,'baseline':baseline,'allocatedHold':allocated,'heldSamples':held,'peak':{k:max([v[k] for v in samples]+[baseline[k],allocated[k]]) for k in ('pss','rssProcessSum','cgroup')},'runtimeBefore':runtime,'allocation':allocation,'check':check,'closedPIDs':ownedpids,'afterBrowserClose':after,'browserCloseBarrierPassed':True,'wallSeconds':time.perf_counter()-started,'scope':'host3H nonzero fill/hold with one actualORTattentionSession+oneHikeMemory; no Gemm/prefix or numerical attention run','modelGraphExecution':False,'nativePointwiseExecuted':False,'fullQueryNumericalAcceptance':False};stages.append(stage)
  report={'schemaVersion':'bernini-head-host-allocation/0.1','passed':len(stages)==2,'sequence':'target then browserclose barrier then two-source context scenario','cgroupMaxBytes':maximum,'cgroupInitialBytes':initial,'cgroupEventsBefore':events_before,'cgroupEventsAfter':(cg/'memory.events').read_text(),'stages':stages,'sourceSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'unknowns':['combined productionORTMemory, Gemm/SiLU sessions, latent/source/VAE, weights/copy/staging, allocator/GC, full FFN and futurequery work','N65520 is one scenario, not a supported max'],'acceptance':{'allocationOnly':True,'fullQueryNumericalVerified':False,'load':'NOT_READY','predict':'NOT_READY','sample':'NOT_READY'}};a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'stages':[{k:s[k] for k in ('tokens','named3HBytes','peak','afterBrowserClose')}for s in stages]}))
finally:server.shutdown();server.server_close()
