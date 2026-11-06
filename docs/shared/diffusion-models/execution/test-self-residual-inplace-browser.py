"""Captured native real-weight self-residual storage parity; no model HTTP."""
import argparse, hashlib, http.server, json, subprocess, threading
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[4]
DOCS=ROOT/'docs'
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--model',type=Path,default=ROOT.parent/'retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors')
p.add_argument('--output',type=Path,required=True)
a=p.parse_args()
build=(DOCS/'shared/diffusion-models/api/build-info.mjs').read_text()
inventory=json.loads(build.split('BUILD_SOURCES=Object.freeze(',1)[1].rsplit(');',1)[0])
snap={str((DOCS/'shared/diffusion-models/api'/name).resolve().relative_to(DOCS)):(DOCS/'shared/diffusion-models/api'/name).resolve().read_bytes() for name in inventory if (DOCS/'shared/diffusion-models/api'/name).resolve().is_relative_to(DOCS)}
runner='shared/diffusion-models/execution/test-self-residual-inplace-browser.mjs'
snap[runner]=(DOCS/runner).read_bytes()
key='shared/diffusion-models/execution/model-candidate.mjs'
original=snap[key]
hook='''async __testSelfResidual(input,sequence,total,modulation,s,progress,onRows){currentChunks={rows:onRows};currentContext={sequence};try{return await selfAttention(input,sequence,total,0,modulation,s,progress);}finally{currentChunks=null;currentContext=null;}},\n   predict(input={}){'''
current=original.decode().replace('predict(input={}){',hook)
assert current!=original.decode()
previous=current.replace('output=kvPool?input:new Float32Array(total*W)','output=new Float32Array(total*W)').replace('hiddenStores(kvPool?3:4,total)','hiddenStores(4,total)')
assert previous!=current
variants={'self-residual-inplace':current.encode(),'self-residual-separate':previous.encode()}
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=urlsplit(self.path)
  if path.path=='/test':body=b'<!doctype html><input id="model" type="file">';mime='text/html'
  elif path.path[1:] in snap:
   name=path.path[1:];body=variants.get(path.query,snap[name]) if name==key else snap[name];mime='application/wasm' if path.path.endswith('.wasm') else 'text/javascript'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
  try:
   page=browser.new_page();page.set_default_timeout(600000);page.goto(f'http://127.0.0.1:{server.server_port}/test');page.locator('#model').set_input_files(str(a.model));errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   result=page.evaluate('''async()=>{try{return await(await import('/shared/diffusion-models/execution/test-self-residual-inplace-browser.mjs')).runSelfResidualInplaceTest(document.querySelector('#model').files[0]);}catch(e){return {passed:false,error:String(e.stack||e)};}}''')
   report={'schemaVersion':'bernini-self-residual-inplace-native/1','sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'sourceSHA256':{name:hashlib.sha256(body).hexdigest() for name,body in snap.items()},'testOnlyInstrumentedVariantsSHA256':{name:hashlib.sha256(body).hexdigest() for name,body in variants.items()},'instrumentation':'Captured candidate adds private test method calling actual selfAttention and chunk emitter; separate-output variant changes only output storage and logical span accounting','driverSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'browserVersion':browser.version,'pageErrors':errors,'model':{'name':a.model.name,'bytes':a.model.stat().st_size,'fullFileHashRecomputed':False},'sourcesServedFromCapturedBytes':True,'sourceBytesUnchangedDuringRun':all((DOCS/name).read_bytes()==body for name,body in snap.items()),'passed':bool(result.get('passed')) and not errors,'result':result}
   a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'output':str(a.output),'error':result.get('error')}),flush=True)
   assert report['passed'] and report['sourceBytesUnchangedDuringRun']
  finally:browser.close()
finally:server.shutdown();server.server_close()
