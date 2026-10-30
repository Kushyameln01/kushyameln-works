#!/usr/bin/env python3
import http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[3] # docs
HERE=Path(__file__).resolve().parent
allowed={
 '/shared/diffusion-models/ort-bridge/test-cases.mjs',
 '/shared/diffusion-models/ort-bridge/stage.mjs',
 '/shared/diffusion-models/ort-bridge/graph.mjs',
 '/shared/diffusion-models/ort-bridge/hike.mjs',
 '/shared/diffusion-models/ort-bridge/kernel/registry.mjs',
 '/shared/diffusion-models/ort-bridge/kernel/bridge.wasm',
 '/shared/diffusion-models/linear/work/fixture.json',
 '/shared/diffusion-models/linear/work/low.q8',
 '/shared/diffusion-models/linear/work/high.q8',
 '/shared/diffusion-models/linear/work/low.bias.f32',
 '/shared/diffusion-models/linear/work/high.bias.f32',
 '/shared/inference/vendor/ort.wasm.min.mjs',
 '/shared/inference/vendor/ort-wasm-simd-threaded.mjs',
 '/shared/inference/vendor/ort-wasm-simd-threaded.wasm'}
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path=='/':
   data=b'''<!doctype html><meta charset="utf-8"><script type="module">try{const {runCases}=await import('/shared/diffusion-models/ort-bridge/test-cases.mjs');window.result=await runCases(async name=>{const r=await fetch(new URL(name,location.origin+'/shared/diffusion-models/ort-bridge/'));if(!r.ok)throw Error('HTTP'+r.status);return new Uint8Array(await r.arrayBuffer());});}catch(e){window.failure=String(e.stack||e);}</script>''';mime='text/html'
  elif self.path in allowed:
   p=root/self.path.lstrip('/')
   if not p.is_file():self.send_error(404);return
   data=p.read_bytes();mime='application/wasm' if p.suffix=='.wasm' else 'text/javascript' if p.suffix=='.mjs' else 'application/octet-stream'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',mime);self.end_headers();self.wfile.write(data)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
  try:
   page=browser.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/');page.wait_for_function('window.result||window.failure',timeout=30000)
   state=page.evaluate('()=>({result:window.result,failure:window.failure})');report={'browser':browser.version,'pageErrors':errors,**state}
   (HERE/'browser-results.json').write_text(json.dumps(report,indent=2)+'\n')
   print(json.dumps(report));assert not state.get('failure') and not errors and state['result']['passed']
  finally:browser.close()
finally:server.shutdown();server.server_close()
