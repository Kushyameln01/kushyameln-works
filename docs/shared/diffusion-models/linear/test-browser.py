#!/usr/bin/env python3
"""Loopback validation serves only named candidate assets and private tiny fixtures."""
import http.server,json,mimetypes,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent
allow={'/linear-kernel.mjs','/test-cases.mjs','/build/linear.wasm','/build/build-record.json','/work/fixture.json','/work/low.q8','/work/high.q8','/work/low.bias.f32','/work/high.bias.f32'}
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/':
   data=b'''<!doctype html><meta charset="utf-8"><title>Hike FP8 linear validation</title><script type="module">import {runCases} from './test-cases.mjs';globalThis.completed=runCases(async name=>{const r=await fetch(name);if(!r.ok)throw Error(name+': '+r.status);return new Uint8Array(await r.arrayBuffer());});</script>''';mime='text/html'
  elif self.path in allow:
   p=root/self.path.lstrip('/');data=p.read_bytes();mime='text/javascript' if p.suffix=='.mjs' else 'application/wasm' if p.suffix=='.wasm' else 'application/json' if p.suffix=='.json' else 'application/octet-stream'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
  page=browser.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/');report=page.evaluate('async()=>await globalThis.completed');report['browserVersion']=browser.version;browser.close()
 (root/'work/browser-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:server.shutdown();server.server_close()
