"""Actual delayed-import Worker message delivery test; no model/NN execution."""
import http.server
import json
from pathlib import Path
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
WORKER = '/docs/shared/diffusion-models/api/worker.mjs'
OBSERVER = '/tools/diffusion-models/public-model-worker-observer.mjs'


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/':
            data, kind = b'<!doctype html><title>No-NN Worker delivery test</title>', 'text/html'
        else:
            file = (ROOT / path.lstrip('/')).resolve()
            if not file.is_relative_to(ROOT) or not file.is_file() or file.suffix not in ['.mjs', '.js']:
                self.send_error(404)
                return
            # The first postMessage must arrive while the observer awaits the
            # real API module. No fake prediction or numerical owner is used.
            if path == WORKER:
                time.sleep(0.15)
            data, kind = file.read_bytes(), 'text/javascript'
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.end_headers()
        self.wfile.write(data)


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                                 args=['--disable-dev-shm-usage'])
            try:
                page = browser.new_page()
                page.goto('http://127.0.0.1:' + str(server.server_address[1]))
                result = page.evaluate("""async({workerPath,observerPath})=>{
                  const observations=[],target=new URL(workerPath,location.href),bootstrap=new URL(observerPath,location.href);
                  bootstrap.searchParams.set('worker',target.href);
                  const worker=new Worker(bootstrap,{type:'module'});
                  try{
                    const result=await new Promise((resolve,reject)=>{
                      const timer=setTimeout(()=>reject(Error('Initial modelStatus request was lost before imported handler was ready')),3000);
                      worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};
                      worker.onmessage=event=>{
                        if(event.data.__publicWasmObservation){observations.push(event.data);return;}
                        clearTimeout(timer);resolve(event.data);
                      };
                      worker.postMessage({protocolVersion:'diffusion-models/0.1',sessionId:'bootstrap-test',jobId:'first-message',inputRevision:1,op:'modelStatus',input:{}});
                    });
                    if(result.status!=='ok'||result.result.loaded!==false||result.result.resources!==null)throw Error('Actual unloaded modelStatus response differs');
                    return {initialMessageDelivered:true,actualApiWorker:true,modelLoaded:false,nativeNNExecuted:false,
                            status:result.status,op:result.op,observations};
                  }finally{worker.terminate();}
                }""", {'workerPath': WORKER, 'observerPath': OBSERVER})
                assert result['initialMessageDelivered'] and result['nativeNNExecuted'] is False
                forwarded = [item for item in result['observations'] if item['stage'] == 'worker-import-ready']
                assert len(forwarded) == 1 and forwarded[0]['initialMessagesForwarded'] == 1
                assert forwarded[0]['captureListenerRemoved'] is True
                print(json.dumps(result))
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == '__main__':
    main()
