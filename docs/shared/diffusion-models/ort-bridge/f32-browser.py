#!/usr/bin/env python3
"""Real Chromium/ORT WASM acceptance for the bounded F32 weight consumer."""
import argparse,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--output',required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[3]
allowed={
 '/shared/diffusion-models/ort-bridge/'+name for name in
 ('f32-cases.mjs','stage.mjs','graph.mjs','hike.mjs','kernel/registry.mjs','kernel/bridge.wasm')}
allowed.update('/shared/inference/vendor/'+name for name in
 ('ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'))
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path=='/':
   data=b'''<!doctype html><meta charset="utf-8"><script type="module">try{const {runF32Cases}=await import('/shared/diffusion-models/ort-bridge/f32-cases.mjs');window.result=await runF32Cases();}catch(e){window.failure=String(e.stack||e);}</script>''';mime='text/html'
  elif self.path in allowed:
   p=root/self.path.lstrip('/')
   if not p.is_file():self.send_error(404);return
   data=p.read_bytes();mime='application/wasm' if p.suffix=='.wasm' else 'text/javascript'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',mime);self.end_headers();self.wfile.write(data)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
  try:
   page=browser.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/');page.wait_for_function('window.result||window.failure',timeout=30000)
   state=page.evaluate('()=>({result:window.result,failure:window.failure})')
   report={'browser':browser.version,'pageErrors':errors,**state}
   out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n')
   result=state.get('result') or {}
   print(json.dumps({'passed':bool(result.get('passed')),'failure':state.get('failure'),'caseCount':len(result.get('cases',[])),'report':str(out)}))
   assert not state.get('failure') and not errors and state['result']['passed']
  finally:browser.close()
finally:server.shutdown();server.server_close()
