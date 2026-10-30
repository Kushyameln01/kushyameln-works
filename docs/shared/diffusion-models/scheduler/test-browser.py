#!/usr/bin/env python3
import http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
r=Path(__file__).resolve().parent;allowed={'/scheduler-kernel.mjs','/test-cases.mjs','/build/scheduler.wasm'}
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/':data=b'''<!doctype html><meta charset="utf-8"><title>Hike scheduler validation</title><script type="module">import {runCases} from './test-cases.mjs';globalThis.completed=runCases(async name=>{const r=await fetch(name);if(!r.ok)throw Error(name);return new Uint8Array(await r.arrayBuffer());});</script>''';mime='text/html'
  elif self.path in allowed:
   p=r/self.path[1:];data=p.read_bytes();mime='application/wasm' if p.suffix=='.wasm' else 'text/javascript'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage']);page=browser.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/');report=page.evaluate('async()=>await globalThis.completed');report['browserVersion']=browser.version;browser.close()
 (r/'work').mkdir(exist_ok=True);(r/'work/browser-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
finally:server.shutdown();server.server_close()
