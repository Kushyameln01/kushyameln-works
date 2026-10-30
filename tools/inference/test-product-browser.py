"""Real Works UI -> dedicated Worker -> actual models -> downloaded binary tensor."""
import argparse,hashlib,json,threading,time
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
import numpy as np
ROOT=Path(__file__).resolve().parents[2];WORK=Path('/workspace/work/inference');OUT=WORK/'integration';OUT.mkdir(exist_ok=True)
def unpack(path):
 b=path.read_bytes();assert b[:8]==b'WKTSR001';length=int.from_bytes(b[8:12],'little');m=json.loads(b[12:12+length]);data=b[12+length:];assert hashlib.sha256(data).hexdigest()==m['dataSha256'];return m,np.frombuffer(data,dtype='<f4')
def main():
 p=argparse.ArgumentParser();p.add_argument('--module',choices=['vae','text'],required=True);p.add_argument('--plain',action='store_true');p.add_argument('--images',action='store_true');a=p.parse_args();logs=[]
 class Handler(SimpleHTTPRequestHandler):
  def __init__(self,*args,**kw):super().__init__(*args,directory=str(ROOT/'docs'),**kw)
  def log_message(self,*args):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();started=time.monotonic()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=browser.new_page(accept_downloads=True);errors=[];requests=[]
   page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append({'method':r.method,'url':r.url}))
   page.on('console',lambda msg:print('BROWSER',msg.text[:250],flush=True) if msg.type=='error' else None)
   await_url=f'http://127.0.0.1:{server.server_port}/';page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(await_url) else route.abort())
   page.goto(await_url+('vae/' if a.module=='vae' else 'text-encoder/'))
   page.evaluate('''new MutationObserver(()=>console.log('STATUS '+document.querySelector('#status').textContent)).observe(document.querySelector('#status'),{childList:true,subtree:true,characterData:true})''')
   page.on('console',lambda msg:print(msg.text,flush=True) if msg.text.startswith('STATUS') else None)
   bundle=WORK/('vae-implementation/bundle' if a.module=='vae' else 'text-implementation/bundle')
   page.locator('#bundle').set_input_files(str(bundle));page.wait_for_function('!document.querySelector("#run").disabled',timeout=30000)
   if a.module=='vae':
    if a.images:
     page.locator('#images').set_input_files([str(f) for f in sorted((WORK/'vae-implementation/png-fixtures').glob('frame-*.png'))]);page.wait_for_function('document.querySelector("#input-info").textContent.includes("画像5枚")')
    else:
     page.locator('#tensor-input').set_input_files(str(OUT/'vae-input.wktensor'));page.wait_for_function('document.querySelector("#input-info").textContent.includes("raw-decoder-rgb")')
   else:
    page.locator('#source').set_input_files('/workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors')
    if a.plain:page.locator('#prompt').fill('Hello world')
    else:
     page.locator('details').first.locator('summary').click();page.locator('#token-input').fill('{"tokenIds":[42,1234,1,0],"attentionMask":[1,1,1,0]}')
   page.locator('#run').click();page.wait_for_function('!document.querySelector("#save").disabled || (!document.querySelector("#run").disabled && document.querySelector("#status").textContent!=="準備中")',timeout=600000)
   if page.locator('#save').is_disabled():raise RuntimeError(page.locator('#status').inner_text())
   evidence=json.loads(page.locator('#evidence').text_content());name='vae-images' if a.images else 'text-plain' if a.plain else a.module
   with page.expect_download(timeout=60000) as dl:page.locator('#save').click()
   path=OUT/(name+'-output.wktensor');dl.value.save_as(str(path));m,data=unpack(path)
   checks={'downloadHash':True,'allFinite':bool(np.isfinite(data).all())}
   if a.images:
    reference=np.fromfile(WORK/'vae-implementation/png-encode-reference.f32',dtype='<f4');checks['encodeMaxAbs']=float(np.max(np.abs(data-reference)));assert checks['encodeMaxAbs']<=.002;assert evidence['hikeContributed'] and evidence['hikeCalls']==1
   elif a.module=='vae':
    reference=np.fromfile(WORK/'vae-proof/encode-reference.f32',dtype='<f4');checks['encodeMaxAbs']=float(np.max(np.abs(data-reference)));assert checks['encodeMaxAbs']<=.002
    page.locator('#operation').select_option('decode');page.locator('#tensor-input').set_input_files(str(path));page.wait_for_function('document.querySelector("#input-info").textContent.includes("raw-posterior-mean")');page.locator('#run').click();page.wait_for_function('!document.querySelector("#save").disabled',timeout=120000)
    with page.expect_download() as dl:page.locator('#save').click()
    roundtrip=OUT/'vae-roundtrip.wktensor';dl.value.save_as(str(roundtrip));rm,rd=unpack(roundtrip);ref=np.fromfile(WORK/'vae-implementation/roundtrip-reference.f32',dtype='<f4');checks['roundtripMaxAbs']=float(np.max(np.abs(rd-ref)));assert checks['roundtripMaxAbs']<=.002
    checks['connection']='encode saved raw mean -> decode readback';checks['roundtripShape']=rm['shape']
   elif not a.plain:
    reference=np.fromfile(WORK/'text-implementation/bundle/final-reference.f32',dtype='<f4');checks['finalMaxAbs']=float(np.max(np.abs(data-reference)));assert checks['finalMaxAbs']<=.001
   else:
    assert m['shape']==[1,512,4096];checks['paddingZero']=bool((data.reshape(512,4096)[3:]==0).all());assert checks['paddingZero']
   assert not errors;assert all(r['method']=='GET' and r['url'].startswith(await_url) for r in requests)
   result={'passed':True,'module':a.module,'plain':a.plain,'browser':browser.version,'seconds':time.monotonic()-started,'shape':m['shape'],'evidence':evidence,'checks':checks,'pageErrors':errors,'httpRequests':requests};(OUT/(name+'-browser-results.json')).write_text(json.dumps(result,indent=2));page.screenshot(path=str(OUT/(name+'-ui.png')),full_page=True);browser.close()
 finally:server.shutdown();server.server_close()
 print(json.dumps({k:v for k,v in result.items() if k not in ['httpRequests','evidence']},indent=2),flush=True)
if __name__=='__main__':main()
