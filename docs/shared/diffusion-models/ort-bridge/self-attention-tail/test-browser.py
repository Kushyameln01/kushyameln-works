"""Bounded real-browser ownership checks; retained private inputs never enter output."""
import argparse,http.server,threading,json,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
r=Path(__file__).resolve().parents[5];docs=r/'docs'
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path);args=parser.parse_args();side='LOW'
capture=r/'development/ai-connection/self-attention-tail/integration/low-attention-capture.json'
c=json.loads(capture.read_text());prefix=json.loads((r.parent/'diffusion-private-hidden/low-prefix-actual.json').read_text());att=json.loads((r.parent/'diffusion-private-tail-attention-20261101/low-attention-actual.json').read_text())
full={'receiptSHA256':'ec161f89a53f8dbd6b8c4a02c59a236ac544224cfe700592e8982900eeb4ade5','artifactSHA256':'1b2808f5ee1185db85cba4e2c59c030fd45d6e3c83c9fde457e70c7d1545d797','patchHiddenSHA256':'1dc2ad17c0f7f7e7c41272efa538d573fc99e355c99dfd7b238cb9aa16e77b8b','timeAct1SHA256':'cf07ca0bf0160886acafb9bf42d22f57f56482cd82a8cad5aa3791901e9938c5'}
t={'schemaVersion':'bernini-self-attention-tail-trusted-inputs/0.1','side':side,'blockIndex':0,'scheduleIndex':3,'tokens':2,'fullPrefix':full,'attention':{'receiptSHA256':hashlib.sha256(capture.read_bytes()).hexdigest(),'artifactSHA256':c['artifactSHA256'],'contextSHA256':c['contextSHA256'],'fullPrefixReceiptSHA256':full['receiptSHA256'],'fullPrefixArtifactSHA256':full['artifactSHA256']},**{key:False for key in ['productionHiddenVerified','originalWorkflowInputsVerified','originalProductionPrecisionVerified','fullBlockVerified','modelInference','lowIsHighHandoff']},**{key:'NOT_READY' for key in ['load','predict','sample']}}
payload={'side':side,'trustedInputs':t,'attention':att['attention'],'patchHidden':prefix['arrays']['patchHidden'],'timeAct1':prefix['arrays']['timeAct1']}
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(docs),**kw)
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
  try:
   page=browser.new_page();page.set_default_timeout(180000);page.goto(f'http://127.0.0.1:{server.server_port}/');page.set_content('<input id=model type=file>');page.locator('#model').set_input_files(str(r.parent/'retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors'))
   result=page.evaluate("""async p=>{const m=await import('/shared/diffusion-models/ort-bridge/self-attention-tail/browser-cases.mjs');return m.runTailOwnershipCases(document.querySelector('#model').files[0],p)}""",payload)
   result['driverSHA256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
   result['testModuleSHA256']=hashlib.sha256((Path(__file__).parent/'browser-cases.mjs').read_bytes()).hexdigest()
   if args.output:
    with args.output.open('x') as output:output.write(json.dumps(result,indent=2)+'\n')
   print(json.dumps(result))
  finally:browser.close()
finally:server.shutdown()
