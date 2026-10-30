#!/usr/bin/env python3
"""Loopback-only actual Chromium, real Hike, and fixed G1C codec checks."""
import http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
r=Path(__file__).resolve().parent;repo=r.parents[3];shared=r.parents[1];base='/diffusion-models/latent-space/'
evidence=repo/'development/ai-connection/e6'
allowed={base+n:r/n for n in ['latent-space.mjs','test-cases.mjs','test-f1-cases.mjs','kernel-registry.mjs','build/latent-space.wasm']}
allowed.update({'/diffusion-models/tensor-interop.mjs':r.parent/'tensor-interop.mjs','/inference/tensor.mjs':shared/'inference/tensor.mjs','/e6/g1c-tensor.mjs':evidence/'source/g1c-tensor.mjs'})
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path==base:
   data=b'''<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="module">import {runCases} from './test-cases.mjs';import {runF1Cases} from './test-f1-cases.mjs';import * as metadataCodec from '/e6/g1c-tensor.mjs';const read=async name=>{const r=await fetch(name);if(!r.ok)throw Error(name);return new Uint8Array(await r.arrayBuffer());};globalThis.completed=(async()=>({f1:await runF1Cases(read,{metadataCodec}),legacy:await runCases(read)}))();</script>''';mime='text/html'
  elif self.path in allowed:
   p=allowed[self.path];data=p.read_bytes();mime='application/wasm' if p.suffix=='.wasm' else 'text/javascript'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}';network=[];errors=[];console=[];blocked=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage','--disable-background-networking'])
  page=browser.new_page(service_workers='block')
  def route(request):
   q=request.request
   if q.method!='GET' or not q.url.startswith(url+'/'):blocked.append({'method':q.method,'url':q.url});request.abort()
   else:network.append({'method':q.method,'url':q.url});request.continue_()
  page.route('**/*',route);page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda e:console.append(e.text) if e.type=='error' else None)
  try:
   page.goto(url+base);page.wait_for_function('globalThis.completed!==undefined');result=page.evaluate('async()=>await globalThis.completed');result.update(browserVersion=browser.version,network=network,pageErrors=errors,consoleErrors=console,blockedRequests=blocked)
   assert not errors and not console and not blocked
   assert all(c['status']=='PASS' for group in ['f1','legacy'] for c in result[group]['cases'])
  finally:browser.close()
 (evidence/'browser-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'browser':result['browserVersion'],'f1':len(result['f1']['cases']),'legacy':len(result['legacy']['cases']),'errors':len(errors)+len(console)+len(blocked)}))
finally:server.shutdown();server.server_close()
