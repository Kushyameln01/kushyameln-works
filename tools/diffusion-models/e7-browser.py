"""Bounded row-tiled actual-Q candidate in Chromium; local File stays local."""
import argparse,hashlib,http.server,json,os,threading,time
from pathlib import Path
from playwright.sync_api import sync_playwright
try:
 import psutil
except ImportError:
 psutil=None
p=argparse.ArgumentParser();p.add_argument('--model',type=Path,default=Path('/workspace/work/retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors'));p.add_argument('--reference',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];docs=root/'docs';reference=json.loads(a.reference.read_text())
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(docs),**kwargs)
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/e7-test':
   raw=b'<!doctype html><meta charset="utf-8"><input type="file" id="file">';self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(raw)
  else:super().do_GET()
class Sampler:
 def __init__(self):
  self.stop=threading.Event();self.samples=[];self.pids=set();self.errors=[];self.thread=None
 def sample(self):
  if psutil is None:return
  rss=0;pss=0;count=0
  try:processes=psutil.Process(os.getpid()).children(recursive=True)
  except (psutil.NoSuchProcess,psutil.AccessDenied) as e:self.errors.append(type(e).__name__);return
  for proc in processes:
   try:
    name=proc.name().lower()
    if 'chromium' not in name and 'chrome_crashpad' not in name:continue
    m=proc.memory_full_info();self.pids.add(proc.pid);rss+=m.rss;pss+=m.pss;count+=1
   except (psutil.NoSuchProcess,psutil.AccessDenied,psutil.ZombieProcess):continue
  if count:self.samples.append({'elapsed':time.perf_counter(),'rssProcessSumBytes':rss,'pssProcessSumBytes':pss,'processCount':count})
 def start(self):
  self.sample()
  def loop():
   while not self.stop.wait(.02):self.sample()
  self.thread=threading.Thread(target=loop,daemon=True);self.thread.start()
 def finish(self):
  self.stop.set()
  if self.thread:self.thread.join(timeout=2)
  self.sample()
  if not self.samples:return {'pssPeakBytes':None,'rssPeakProcessSumBytes':None,'reason':'psutil unavailable or no readable owned Chromium process','samples':0}
  return {'pssBaselineBytes':self.samples[0]['pssProcessSumBytes'],'pssPeakBytes':max(x['pssProcessSumBytes'] for x in self.samples),'rssPeakProcessSumBytes':max(x['rssProcessSumBytes'] for x in self.samples),'samples':len(self.samples),'intervalTargetMs':20,'ownedPidsObserved':sorted(self.pids),'readErrors':sorted(set(self.errors)),'scope':'observed peak of owned Chromium descendants during constructor/all cases, includes renderer/runtime/test harness; RSS process sum double-counts shared pages, use PSS; not ORT allocator-only, not production pipeline peak'}
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
  try:
   page=browser.new_page();page.set_default_timeout(120000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/e7-test');page.locator('#file').set_input_files(str(a.model));sampler=Sampler();sampler.start();start=time.perf_counter()
   try:result=page.evaluate('''async reference=>{try{const m=await import('/shared/diffusion-models/ort-bridge/tiled-q-cases.mjs');return await m.runTiledQCases(document.querySelector('#file').files[0],reference);}catch(e){return {passed:false,error:String(e.stack||e)};}}''',reference)
   finally:measurement=sampler.finish()
   sources=['docs/shared/diffusion-models/ort-bridge/tiled-q.mjs','docs/shared/diffusion-models/ort-bridge/tiled-q-cases.mjs','docs/shared/diffusion-models/ort-bridge/stage.mjs','docs/shared/diffusion-models/ort-bridge/hike.mjs','docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm','tools/diffusion-models/e7-reference.py','tools/diffusion-models/e7-browser.py']
   hashes={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in sources}
   report={'browser':browser.version,'pageErrors':errors,'wallSeconds':time.perf_counter()-start,'scope':'actual immutable File, Hike and ORT row-tiled full-Q boundary; not production inference','OSMeasurement':measurement,'sourceSHA256':hashes,'referenceSHA256':hashlib.sha256(a.reference.read_bytes()).hexdigest(),**result};a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'error':report.get('error'),'cases':len(report.get('cases',[])),'wallSeconds':report['wallSeconds'],'pssPeakBytes':measurement.get('pssPeakBytes'),'report':str(a.output)}));assert report['passed'] and not errors
  finally:browser.close()
finally:server.shutdown();server.server_close()
