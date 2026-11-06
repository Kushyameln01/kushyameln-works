"""Native-browser verification of changed F32 ownership/resource boundaries only."""
import argparse,hashlib,http.server,json,subprocess,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[4]
DOCS=ROOT/'docs'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
names=['shared/diffusion-models/execution/prepared-attention-kv.mjs','shared/diffusion-models/execution/test-owned-attention-query.mjs','shared/diffusion-models/execution/owned-attention-query.mjs','shared/diffusion-models/execution/batched-ops.mjs','shared/diffusion-models/execution/test-prepared-batched-ops.mjs','shared/diffusion-models/execution/test-thread-resource.mjs','shared/diffusion-models/execution/test-batched-ops.mjs','shared/diffusion-models/execution/batched-attention-graph.mjs','shared/diffusion-models/ort-bridge/block-hidden/graph.mjs','shared/diffusion-models/ort-bridge/qkv/ownership.mjs','shared/inference/vendor/ort.wasm.min.mjs','shared/inference/vendor/ort-wasm-simd-threaded.mjs','shared/inference/vendor/ort-wasm-simd-threaded.wasm']
snapshot={name:(DOCS/name).read_bytes() for name in names}
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=self.path.split('?',1)[0]
  if path in ['/', '/plain']:body=b'<!doctype html><meta charset="utf-8"><title>Batched F32 ownership tests</title>';mime='text/html'
  elif path[1:] in snapshot:body=snapshot[path[1:]];mime='application/wasm' if path.endswith('.wasm') else 'text/javascript'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store')
  if path!='/plain':self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');self.send_header('Cross-Origin-Resource-Policy','same-origin')
  self.end_headers();self.wfile.write(body)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();results=[]
cases=[('owned-attention1','/',"await(await import('/shared/diffusion-models/execution/test-owned-attention-query.mjs')).runOwnedAttentionQueryTests({numThreads:1})"),('owned-attention4','/',"await(await import('/shared/diffusion-models/execution/test-owned-attention-query.mjs')).runOwnedAttentionQueryTests({numThreads:4})"),('prepared','/',"await(await import('/shared/diffusion-models/execution/test-prepared-batched-ops.mjs')).runPreparedBatchedOpsTests()"),('existing-operator-regression','/',"await(await import('/shared/diffusion-models/execution/test-batched-ops.mjs')).runBatchedOpsTests()"),('resource1','/',"await(await import('/shared/diffusion-models/execution/test-thread-resource.mjs')).runThreadResourceTests(1)"),('resource4','/',"await(await import('/shared/diffusion-models/execution/test-thread-resource.mjs')).runThreadResourceTests(4)"),('nonisolated-refusal','/plain',"await(await import('/shared/diffusion-models/execution/test-thread-resource.mjs')).runNonisolatedResourceRefusal()"),('preinitialized-refusal','/',"await(await import('/shared/diffusion-models/execution/test-thread-resource.mjs')).runPreinitializedResourceRefusal()")]
try:
 with sync_playwright() as p:
  for name,url,expression in cases:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
   try:
    page=browser.new_page();page.set_default_timeout(120000);page.goto(f'http://127.0.0.1:{server.server_port}'+url)
    result=page.evaluate('async()=>{try{return '+expression+';}catch(error){return {passed:false,error:String(error.stack||error),code:error.code,details:error.details};}}');results.append({'name':name,'result':result,'chromiumVersion':browser.version})
   finally:browser.close()
finally:server.shutdown();server.server_close()
assert all((DOCS/name).read_bytes()==body for name,body in snapshot.items())
report={'schemaVersion':'batched-model-ops-changed-boundaries/1','sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'sourceSHA256':{name:hashlib.sha256(body).hexdigest() for name,body in snapshot.items()},'driverSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'sourcesServedFromCapturedBytes':True,'sourceBytesUnchangedDuringRun':True,'passed':all(item['result'].get('passed') for item in results),'scope':'Native ORT primitive/resource changes; no model weights or model inference, no expanded production capabilities','results':results}
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':report['passed'],'cases':len(results),'output':str(args.output)}))
if not report['passed']:raise SystemExit(1)
