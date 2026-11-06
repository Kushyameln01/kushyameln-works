#!/usr/bin/env python3
"""Actual Chromium WASM arithmetic capacity/gate; local GET only, no model callback."""
import http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
r=Path(__file__).resolve().parent
shared=r.parents[2]
base='/shared/diffusion-models/execution/generated-space/'
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path==base:
   data=b'''<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="module">import {runGeneratedCases} from './test-cases.mjs';globalThis.completed=runGeneratedCases(async path=>{const r=await fetch(path);if(!r.ok)throw Error(path);return new Uint8Array(await r.arrayBuffer());});</script>''';mime='text/html'
  else:
   path=(shared.parent/self.path.lstrip('/')).resolve()
   if not path.is_relative_to(shared) or not path.is_file():self.send_error(404);return
   data=path.read_bytes();mime='application/wasm' if path.suffix=='.wasm' else 'application/json' if path.suffix=='.json' else 'text/javascript' if path.suffix=='.mjs' else 'text/plain'
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');self.end_headers();self.wfile.write(data)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}';network=[];errors=[];console=[];blocked=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage','--disable-background-networking'])
  page=browser.new_page(service_workers='block')
  def route(request):
   q=request.request
   if q.method!='GET' or not q.url.startswith(origin+'/'):blocked.append({'method':q.method,'url':q.url});request.abort()
   else:network.append({'method':q.method,'url':q.url.removeprefix(origin)});request.continue_()
  page.route('**/*',route);page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda e:console.append(e.text) if e.type=='error' else None)
  try:
   page.goto(origin+base);page.wait_for_function('globalThis.completed!==undefined');result=page.evaluate('async()=>await globalThis.completed')
   result.update(browserVersion=browser.version,network=network,pageErrors=errors,consoleErrors=console,blockedRequests=blocked)
   assert not errors and not console and not blocked
   assert all(c['status']=='PASS' for c in result['cases'])
   assert all(m['exactValues']==m['elements'] and m['maxAbs']==0 for m in result['comparisons'].values())
  finally:browser.close()
 (r/'work').mkdir(exist_ok=True);(r/'work/browser-results.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'browser':result['browserVersion'],'cases':len(result['cases']),'targetElements':result['elements'],'comparisons':result['comparisons'],'errors':len(errors)+len(console)+len(blocked)}))
finally:server.shutdown();server.server_close()
