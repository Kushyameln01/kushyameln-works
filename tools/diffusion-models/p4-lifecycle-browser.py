"""Actual ORT owner cleanup fault injection. Header-only local model File."""
import argparse,hashlib,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--model',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[2];docs=root/'docs'
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(docs),**kwargs)
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/p4-lifecycle':
   raw=b'<!doctype html><input type=file id=file>';self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(raw)
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
  try:
   page=browser.new_page();page.set_default_timeout(30000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/p4-lifecycle');page.locator('#file').set_input_files(str(a.model));result=page.evaluate('''async()=>{try{const {runDisposalCases}=await import('/shared/diffusion-models/ort-bridge/qkv/disposal-cases.mjs');return await runDisposalCases(document.querySelector('#file').files[0]);}catch(error){return {passed:false,error:String(error.stack||error)};}}''')
   paths=['docs/shared/diffusion-models/ort-bridge/qkv/stage.mjs','docs/shared/diffusion-models/ort-bridge/qkv/ownership.mjs','docs/shared/diffusion-models/ort-bridge/qkv/disposal-cases.mjs','docs/shared/diffusion-models/ort-bridge/stream-attention/stage.mjs'];report={'browser':browser.version,'pageErrors':errors,'sourceSHA256':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in paths},**result};a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'error':report.get('error'),'output':str(a.output)}));assert report['passed'] and not errors
  finally:browser.close()
finally:server.shutdown();server.server_close()
