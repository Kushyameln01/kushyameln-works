import http.server,json,threading,argparse
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[2]/'docs'
class H(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kw):super().__init__(*args,directory=str(root),**kw)
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--disable-dev-shm-usage']);page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/')
  r=page.evaluate("async()=>{try{const m=await import('/shared/diffusion-models/api/test/e6-cases.mjs');return await m.runE6API();}catch(e){return {passed:false,error:String(e.stack||e)};}}")
  j={'browser':browser.version,'pageErrors':errors,**r};a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(j,indent=2)+'\n');print(json.dumps({'passed':j['passed'],'error':j.get('error'),'report':str(a.output)}));browser.close();assert j['passed'] and not errors
finally:server.shutdown();server.server_close()
