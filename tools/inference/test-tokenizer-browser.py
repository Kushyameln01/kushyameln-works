"""Actual browser tokenizer bytes must reproduce the original embedded model's IDs."""
from pathlib import Path
import hashlib,json,threading
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];WORK=Path('/workspace/work/inference')
def main():
 class Handler(SimpleHTTPRequestHandler):
  def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'docs'),**kw)
  def log_message(self,*a):pass
  def do_GET(self):
   if self.path=='/tokenizer-model':
    b=(WORK/'model-inventory/embedded-spiece.model').read_bytes();self.send_response(200);self.end_headers();self.wfile.write(b)
   else:super().do_GET()
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=browser.new_page()
   page.goto(f'http://127.0.0.1:{server.server_port}/text-encoder/')
   fixture=json.loads((WORK/'tokenizer-reference.json').read_text())
   result=page.evaluate('''async fixture=>{const {tokenizePlainText}=await import('/shared/inference/tokenizer.mjs');const bytes=await(await fetch('/tokenizer-model')).arrayBuffer();const cases=[];for(const f of fixture.cases){const r=await tokenizePlainText(f.text,bytes);const ids=Array.from(r.tokenIds.subarray(0,r.effectiveTokens));cases.push({text:f.text,ids,expected:f.ids,pass:JSON.stringify(ids)===JSON.stringify(f.ids),length:r.tokenIds.length,padCount:r.attentionMask.filter(x=>x===0).length});}return {passed:cases.every(c=>c.pass&&c.length===512),cases};}''',fixture)
   result['browser']=browser.version;(WORK/'tokenizer-browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));browser.close()
 finally:server.shutdown();server.server_close()
 print(json.dumps(result,ensure_ascii=False));assert result['passed']
if __name__=='__main__':main()
