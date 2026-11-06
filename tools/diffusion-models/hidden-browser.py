"""Private local File / explicit JSON browser runner; server never exposes model weights."""
import argparse,contextlib,functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--reference',type=Path);p.add_argument('--model',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--actual-out',type=Path);p.add_argument('--linear-only',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parents[2]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
handler=functools.partial(Handler,directory=str(root/'docs'))
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=browser.new_page();page.goto('http://127.0.0.1:%d/'%server.server_port)
  result=page.evaluate("""async()=>{const {testLinear}=await import('/shared/diffusion-models/ort-bridge/block-hidden/browser-cases.mjs');return await testLinear();}""")
  if not a.linear_only:
   assert a.model and a.reference and a.actual_out
   page.set_content('<input type=file id=model>');page.locator('#model').set_input_files(str(a.model))
   reference=json.loads(a.reference.read_text());payload=page.evaluate("""async(reference)=>{const {testPrefix}=await import('/shared/diffusion-models/ort-bridge/block-hidden/browser-cases.mjs');const result=await testPrefix(reference,document.querySelector('#model').files[0]);const rec=(v)=>ArrayBuffer.isView(v)?Array.from(v):Array.isArray(v)?v.map(rec):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rec(x)])):v;return rec(result);}""",reference)
   a.actual_out.write_text(json.dumps(payload,separators=(',',':'))+'\n');result['prefixArtifactPathRole']='private explicit output; not published';result['prefixSide']=reference['meta']['side'];result['evidence']=payload['evidence']
  result['browserVersion']=browser.version;browser.close();a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'passed':result.get('passed'),'side':result.get('prefixSide')}))
finally:server.shutdown();server.server_close()
