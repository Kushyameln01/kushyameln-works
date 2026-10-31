"""Actual browser File/Worker/ORT/Hike diagnostic; bounded original-base reads."""
import argparse,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--mode',choices=['api','base-consumer','all'],default='all');p.add_argument('--models',type=Path,default=Path('/workspace/work/retained/bernini'));p.add_argument('--output',type=Path,required=True);a=p.parse_args()
repo=Path(__file__).resolve().parents[2];docs=repo/'docs';refs=json.loads((repo/'development/ai-connection/l1-reference.json').read_text())
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(docs),**kwargs)
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/l1-test':
   raw=b'<!doctype html><meta charset="utf-8"><input type="file" multiple id="files">';self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(raw)
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
  try:
   page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/l1-test')
   if a.mode!='api':page.locator('#files').set_input_files([str(a.models/r['name']) for r in refs['models']])
   result=page.evaluate('''async ({mode,reference})=>{try{const results={};if(mode!=='base-consumer'){const m=await import('/shared/diffusion-models/api/test/l1-cases.mjs');results.api=await m.runL1APICases();}if(mode!=='api'){const m=await import('/shared/diffusion-models/lora/l1-browser-cases.mjs');results.baseConsumer=await m.runRealBaseCases([...document.querySelector('#files').files],reference);}return {passed:true,results};}catch(e){return {passed:false,error:String(e.stack||e)};}}''',{'mode':a.mode,'reference':refs})
   report={'browser':browser.version,'scope':'local actual WASM/File validation only; no export or publication','pageErrors':errors,**result};a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'errors':errors,'error':report.get('error'),'report':str(a.output)}));assert report['passed'] and not errors
  finally:browser.close()
finally:server.shutdown();server.server_close()
