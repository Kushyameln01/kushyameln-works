"""A slow old File read must not erase a newer valid VAE selection."""
from pathlib import Path
import json,threading
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];WORK=Path('/workspace/work/inference')
def main():
 class Handler(SimpleHTTPRequestHandler):
  def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'docs'),**kw)
  def log_message(self,*a):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=browser.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/vae/')
   page.locator('#bundle').set_input_files(str(WORK/'vae-implementation/bundle'));page.wait_for_function('!document.querySelector("#run").disabled')
   data=list((WORK/'integration/vae-input.wktensor').read_bytes())
   page.evaluate('''bytes=>{const real=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){const result=await real.call(this);if(this.name==='old.wktensor'){await new Promise(resolve=>window.releaseOld=resolve);}return result;};const choose=name=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],name));const i=document.querySelector('#tensor-input');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));};choose('old.wktensor');window.chooseNew=()=>choose('new.wktensor');}''',data)
   page.wait_for_function('typeof window.releaseOld==="function"');page.evaluate('window.chooseNew()');page.wait_for_function('document.querySelector("#input-info").textContent.includes("raw-decoder-rgb")');page.evaluate('window.releaseOld()');page.wait_for_timeout(100)
   page.locator('#run').click();page.wait_for_timeout(100)
   status=page.locator('#status').inner_text();assert 'tensorファイルを選んで' not in status,status
   page.wait_for_function('!document.querySelector("#save").disabled',timeout=120000);assert page.locator('#status').inner_text()=='完了'
   result={'passed':True,'browser':browser.version,'scope':'old selected File resolves after new selection; new actual VAE input still executes'};(WORK/'integration/ui-race-results.json').write_text(json.dumps(result,indent=2));browser.close()
 finally:server.shutdown();server.server_close()
 print(json.dumps(result))
if __name__=='__main__':main()
