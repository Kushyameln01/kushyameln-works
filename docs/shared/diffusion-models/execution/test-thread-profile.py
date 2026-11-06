"""Small controlled ORT thread profile; no model read and no runtime edits."""
import argparse,functools,hashlib,http.server,json,os,statistics,subprocess,threading,time
from pathlib import Path

os.environ['OPENBLAS_NUM_THREADS']='1'
import numpy as np
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[4]
DOCS=ROOT/'docs'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
def raw(value,dtype):return np.ascontiguousarray(value,dtype=dtype).tobytes()
def pattern(shape,multiplier,period,divisor):
 count=int(np.prod(shape));index=np.arange(count,dtype=np.int64);return (((index*multiplier)%period-period//2)/divisor).astype('<f4').reshape(shape)
x=pattern((128,2048),7,31,127);weight=pattern((2048,2048),11,37,131)
q=pattern((40,128,128),3,29,113);k=pattern((40,256,128),5,31,109);v=pattern((40,256,128),7,37,103)
linear=x.astype(np.float64)@weight.astype(np.float64).T
score=(q.astype(np.float64)@k.astype(np.float64).transpose(0,2,1))*np.float32(1/np.sqrt(128))
maximum=score.max(axis=-1);probability=np.exp(score-maximum[:,:,None]);denominator=probability.sum(axis=-1);context=probability@v.astype(np.float64)
fixtures={'x.f32':raw(x,'<f4'),'weight.f32':raw(weight,'<f4'),'q.f32':raw(q,'<f4'),'k.f32':raw(k,'<f4'),'v.f32':raw(v,'<f4'),'linear.f64':raw(linear,'<f8'),'max.f64':raw(maximum,'<f8'),'denominator.f64':raw(denominator,'<f8'),'context.f64':raw(context,'<f8')}
del linear,score,maximum,probability,denominator,context,x,weight,q,k,v
names=['shared/diffusion-models/execution/thread-profile-cases.mjs','shared/diffusion-models/execution/wasm-memory-observer.mjs','shared/diffusion-models/execution/batched-attention-graph.mjs','shared/diffusion-models/ort-bridge/block-hidden/graph.mjs','shared/inference/vendor/ort.wasm.min.mjs','shared/inference/vendor/ort-wasm-simd-threaded.mjs','shared/inference/vendor/ort-wasm-simd-threaded.wasm']
snapshot={name:(DOCS/name).read_bytes() for name in names}
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=self.path.split('?',1)[0]
  if path=='/':body=b'<!doctype html><meta charset="utf-8"><title>Bounded ORT thread profile</title>';mime='text/html'
  elif path.startswith('/__fixture__/') and path[13:] in fixtures:body=fixtures[path[13:]];mime='application/octet-stream'
  elif path[1:] in snapshot:body=snapshot[path[1:]];mime='application/wasm' if path.endswith('.wasm') else 'text/javascript'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');self.send_header('Cross-Origin-Resource-Policy','same-origin');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
records=[]
try:
 with sync_playwright() as p:
  for threads in [1,4]:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--disable-dev-shm-usage'])
   try:
    page=browser.new_page();page.set_default_timeout(120000);page.goto(f'http://127.0.0.1:{server.server_port}/')
    result=page.evaluate('''async threads=>await(await import('/shared/diffusion-models/execution/thread-profile-cases.mjs')).runThreadProfile({threads})''',threads);result['chromiumVersion']=browser.version;records.append(result)
   finally:browser.close()
finally:server.shutdown();server.server_close()
assert all((DOCS/name).read_bytes()==value for name,value in snapshot.items())
assert all(record['passed'] for record in records)
assert records[0]['inputHashes']==records[1]['inputHashes']
report={'schemaVersion':'ort-wasm-thread-resource-experiment/1','sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'sourceSHA256':{name:hashlib.sha256(value).hexdigest() for name,value in snapshot.items()},'driverSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'fixtureSHA256':{name:hashlib.sha256(value).hexdigest() for name,value in fixtures.items()},'gateFixedBeforeExecution':{'absolute':.001,'relative':.0001,'allElements':True},'threadOutputBitIdentical':records[0]['outputHashes']==records[1]['outputHashes'],'sourceBytesUnchangedDuringRun':True,'records':records,'ratiosOneOverFour':{kind:records[0]['mediansMs'][kind]/records[1]['mediansMs'][kind] for kind in ['linear','attention']},'scope':'Controlled Gemm128x2048x2048 and H40/Q128/K256/D128; no model read, no production shape acceptance or default change; this realm memory observations exclude pthread realms','requirements':['COOP same-origin','COEP require-corp','crossOriginIsolated true','SharedArrayBuffer available','one fresh ORT realm per thread profile']}
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':True,'threadOutputBitIdentical':report['threadOutputBitIdentical'],'ratiosOneOverFour':report['ratiosOneOverFour'],'output':str(args.output)}))
