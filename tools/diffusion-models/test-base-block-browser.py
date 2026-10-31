"""Private artifact File only: no original model File or server-side model route."""
import argparse,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--artifact',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
repo=Path(__file__).resolve().parents[2];docs=repo/'docs';reference=json.loads((repo/'development/ai-connection/l1-reference.json').read_text())
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(docs),**kwargs)
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/block-test':
   raw=b'<!doctype html><meta charset="utf-8"><input id="artifact" type="file">';self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(raw)
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
  try:
   page=browser.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url));page.goto(f'http://127.0.0.1:{server.server_port}/block-test');page.locator('#artifact').set_input_files(str(a.artifact))
   result=page.evaluate('''async reference=>{try{const file=document.querySelector('#artifact').files[0],bytes=await file.arrayBuffer(),artifact=JSON.parse(new TextDecoder().decode(bytes)),m=await import('/shared/diffusion-models/lora/base-block-browser-cases.mjs');return {passed:true,artifact:{name:file.name,bytes:file.size,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')},result:await m.runBaseBlockCases(artifact,reference)};}catch(e){return {passed:false,error:String(e.stack||e)};}}''',reference)
   report={'browser':browser.version,'scope':'local private bounded-fragment actual WASM test; no original model File supplied','pageErrors':errors,'originalModelRequests':[r for r in requests if '.safetensors' in r],**result};a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'pageErrors':errors,'error':report.get('error'),'output':str(a.output)}));assert report['passed'] and not errors and not report['originalModelRequests']
  finally:browser.close()
finally:server.shutdown();server.server_close()
