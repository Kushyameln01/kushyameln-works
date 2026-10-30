from pathlib import Path
import threading,json
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];WORK=Path('/workspace/work/inference')
def main():
 class H(SimpleHTTPRequestHandler):
  def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'docs'),**kw)
  def log_message(self,*a):pass
 s=ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=s.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();page.goto(f'http://127.0.0.1:{s.server_port}/vae/');page.locator('#bundle').set_input_files(str(WORK/'vae-implementation/bundle'));page.wait_for_function('!document.querySelector("#run").disabled')
   page.evaluate('''async()=>{const dt=new DataTransfer();for(let i=0;i<5;i++){const c=document.createElement('canvas');c.width=16;c.height=16;const ctx=c.getContext('2d');ctx.fillStyle='rgb(50,100,150)';ctx.fillRect(0,0,16,16);if(i===0)ctx.clearRect(0,0,1,1);const blob=await new Promise(r=>c.toBlob(r,'image/png'));dt.items.add(new File([blob],`frame-${i}.png`,{type:'image/png'}));}const input=document.querySelector('#images');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));}''')
   page.wait_for_function('document.querySelector("#status").textContent.includes("透過") || document.querySelector("#input-info").textContent.includes("画像5枚")')
   status=page.locator('#status').inner_text();assert '透過' in status,status;b.close()
 finally:s.shutdown();s.server_close()
 result={'passed':True,'scope':'Transparent input rejected without choosing an implicit background'};(WORK/'integration/image-alpha-results.json').write_text(json.dumps(result));print(result)
if __name__=='__main__':main()
