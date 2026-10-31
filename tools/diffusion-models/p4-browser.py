"""Selected QKV operator diagnostic. Original File and reference stay local."""
import argparse,hashlib,http.server,json,threading,time,os
from pathlib import Path
from playwright.sync_api import sync_playwright
try:import psutil
except ImportError:psutil=None
p=argparse.ArgumentParser();p.add_argument('--model',type=Path,required=True);p.add_argument('--reference',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[2];docs=root/'docs';reference=json.loads(a.reference.read_text())
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(docs),**kwargs)
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/p4-test':
   raw=b'<!doctype html><input type=file id=file>';self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(raw)
  else:super().do_GET()
samples=[];stop=threading.Event()
def sample():
 if psutil is None:return
 rows=[]
 for process in psutil.Process(os.getpid()).children(recursive=True):
  try:
   if 'chromium' in process.name().lower():
    m=process.memory_full_info();rows.append((m.rss,m.pss))
  except (psutil.NoSuchProcess,psutil.AccessDenied):pass
 if rows:samples.append({'rssProcessSumBytes':sum(x[0] for x in rows),'pssProcessSumBytes':sum(x[1] for x in rows)})
def sampling():
 while not stop.wait(.02):sample()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
  try:
   page=browser.new_page();page.set_default_timeout(240000);errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url));page.goto(f'http://127.0.0.1:{server.server_port}/p4-test');page.locator('#file').set_input_files(str(a.model));sample();thread=threading.Thread(target=sampling,daemon=True);thread.start();started=time.perf_counter()
   try:result=page.evaluate('''async reference=>{try{const {runQkvCases}=await import('/shared/diffusion-models/ort-bridge/qkv/cases.mjs');return await runQkvCases(document.querySelector('#file').files[0],reference);}catch(error){return {passed:false,error:String(error.stack||error)};}}''',reference)
   finally:stop.set();thread.join(timeout=2);sample()
   sources=[p for p in (docs/'shared/diffusion-models/ort-bridge/qkv').iterdir() if p.is_file()]
   dependencies=['docs/shared/inference/hike.mjs','docs/shared/inference/kernel/tensor.wasm','tools/inference/kernel/tensor.hike','tools/inference/kernel/manifest.json','docs/shared/diffusion-models/api/safetensors.mjs','docs/shared/diffusion-models/lora/targets.mjs','docs/shared/diffusion-models/lora/weights.mjs','docs/shared/diffusion-models/lora/strict-json.mjs','docs/shared/vr180/sha256.mjs','docs/shared/diffusion-models/ort-bridge/hike.mjs','docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm','docs/shared/diffusion-models/ort-bridge/kernel/bridge.hike','docs/shared/diffusion-models/ort-bridge/kernel/registry.mjs','docs/shared/diffusion-models/ort-bridge/kernel/build-record.json','docs/shared/inference/vendor/ort.wasm.min.mjs','docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs','docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm','tools/diffusion-models/p4-browser.py','tools/diffusion-models/p4-reference.py']
   dependencies+=['docs/shared/diffusion-models/ort-bridge/stream-attention/'+name for name in ['stage.mjs','graph.mjs','hike.mjs','registry.mjs','kernel.wasm','kernel.hike','build-record.json','build.py']]
   sources+=list(map(lambda p:root/p,dependencies))
   measurement={'pssBaselineBytes':samples[0]['pssProcessSumBytes'] if samples else None,'pssPeakBytes':max(x['pssProcessSumBytes'] for x in samples) if samples else None,'rssPeakProcessSumBytes':max(x['rssProcessSumBytes'] for x in samples) if samples else None,'samples':len(samples),'scope':'owned Chromium descendants, constructor/all tests/private reference harness included; not allocator-only or production peak'}
   report={'browser':browser.version,'pageErrors':errors,'originalModelHTTPRequests':[u for u in requests if '.safetensors' in u],'wallSeconds':time.perf_counter()-started,'OSMeasurement':measurement,'referenceSHA256':hashlib.sha256(a.reference.read_bytes()).hexdigest(),'sourceSHA256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},**result};a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'error':report.get('error'),'output':str(a.output)}));assert report['passed'] and not errors and not report['originalModelHTTPRequests']
  finally:browser.close()
finally:server.shutdown();server.server_close()
