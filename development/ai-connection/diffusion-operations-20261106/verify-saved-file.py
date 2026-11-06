"""Read an existing generated-sample File through the pinned public API/Worker; no NN or export."""
import argparse
import http.server
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import threading
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[3]
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('public_model_browser', ROOT / 'tools/diffusion-models/public-model-browser.py')
HOST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HOST)
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', type=Path, required=True)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--output', type=Path, required=True, help='New private metadata-only JSON path')
    parser.add_argument('--chromium', default=shutil.which('chromium') or '/usr/bin/chromium')
    args = parser.parse_args()
    snapshots = HOST.snapshot_sources(args.source_commit)
    harness = Path(__file__).read_bytes()
    harness_path = Path(__file__).relative_to(ROOT).as_posix()
    harness_committed = bool(HOST.git('ls-tree', '--name-only', args.source_commit, '--', harness_path))
    HOST.require(not harness_committed or harness == HOST.git('show', args.source_commit + ':' + harness_path), 'Harness differs from committed source')
    original = args.file.resolve(strict=True)
    before, raw = HOST.file_stat(original), original.read_bytes()
    HOST.require(12 <= len(raw) <= HOST.MAX_OUTPUT_BYTES and raw[:8] == b'WKTSR001', 'Canonical bounded tensor File required')
    header_length = int.from_bytes(raw[8:12], 'little')
    HOST.require(0 < header_length <= 65536 and 12 + header_length <= len(raw), 'Invalid canonical header extent')
    metadata = json.loads(raw[12:12 + header_length])
    expected = {key: metadata[key] for key in ['dtype', 'shape', 'layout', 'meaning', 'latentContract']}
    expected.update(fileBytes=len(raw), fileSHA256=HOST.sha(raw), payloadSHA256=metadata['dataSha256'])
    output = HOST.private_path(args.output)
    HOST.require(not output.exists(), 'Output must be a new private path')
    served, denied, errors = {}, [], []
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            path = urlsplit(self.path).path
            data = b'<!doctype html><meta charset="utf-8"><input id="saved" type="file">' if path == '/' else snapshots.get(path)
            if path == '/favicon.ico':
                data = b''
            code = 200 if data is not None else 404
            if data is None:
                denied.append(path)
                data = b'Not in pinned source allowlist'
            else:
                served[path] = {'bytes': len(data), 'sha256': HOST.sha(data)}
            kind = 'text/html' if path == '/' else 'text/javascript' if path.endswith(('.mjs', '.js')) else 'application/octet-stream'
            self.send_response(code)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    result, host_error, browser_version = None, None, None
    started = time.monotonic()
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=args.chromium, headless=True, args=['--disable-dev-shm-usage'])
            try:
                browser_version = browser.version
                page = browser.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto('http://127.0.0.1:' + str(server.server_address[1]) + '/')
                page.locator('#saved').set_input_files(str(original))
                result = page.evaluate("""async expected => {
                  let timer;try{return await Promise.race([(async()=>{
                    const assert=(value,message)=>{if(!value)throw Error(message)},equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
                    const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
                    const NativeWorker=globalThis.Worker;let workers=0,terminated=0,api;
                    globalThis.Worker=class extends NativeWorker{constructor(...args){super(...args);workers++}terminate(){terminated++;return super.terminate()}};
                    try{
                      assert(!crossOriginIsolated,'Pages/no-COI expected');
                      const file=document.querySelector('#saved').files[0],before=new Uint8Array(await file.arrayBuffer());
                      assert(file instanceof File&&file.size===expected.fileBytes&&await sha(before)===expected.fileSHA256,'Actual selected File identity differs');
                      const {createDiffusionModels,PROTOCOL_VERSION}=await import('/docs/shared/diffusion-models/api/index.mjs');
                      api=createDiffusionModels();const request={protocolVersion:PROTOCOL_VERSION,sessionId:api.sessionId,jobId:'saved-file-reuse',inputRevision:0,op:'readTensor',input:{file}};
                      const started=performance.now(),reply=await api.request(request);assert(reply.status==='ok',JSON.stringify(reply.error));
                      const tensor=reply.result.tensor,descriptor=Object.fromEntries(['dtype','shape','layout','meaning','latentContract'].map(key=>[key,tensor[key]]));
                      assert(equal(descriptor,Object.fromEntries(Object.keys(descriptor).map(key=>[key,expected[key]]))),'Descriptor changed');
                      assert(tensor.dtype==='float32'&&tensor.layout==='NCTHW'&&tensor.meaning==='wan21-raw-generated-sample:v1','Expected generated raw sample');
                      const contract=tensor.latentContract;assert(contract.representation==='generated-sample'&&contract.space==='raw'&&contract.normalization.state==='restored'&&contract.normalization.owner==='diffusion_models','Raw/restored contract required');
                      assert(tensor.data instanceof Float32Array&&tensor.data.length===tensor.shape.reduce((a,b)=>a*b,1)&&tensor.data.every(Number.isFinite),'Finite shape-matched F32 required');
                      const payloadSHA256=await sha(tensor.data);assert(payloadSHA256===expected.payloadSHA256&&reply.result.sha256===expected.fileSHA256,'Readback digest differs');
                      const after=new Uint8Array(await file.arrayBuffer());assert(before.length===after.length&&before.every((v,i)=>v===after[i]),'Caller File mutated');
                      api.dispose();const disposed=await api.request(request);assert(disposed.error?.code==='DISPOSED'&&workers===1&&terminated===1,'Worker disposal failed');
                      return {passed:true,descriptor,elements:tensor.data.length,payloadSHA256,fileSHA256:await sha(after),fileBytes:file.size,callerFileBytesPreserved:true,actualBrowserFile:true,publicWorkerCreated:workers,publicWorkerTerminated:terminated,afterDispose:'DISPOSED',elapsedMs:performance.now()-started,crossOriginIsolated};
                    }finally{api?.dispose();globalThis.Worker=NativeWorker}
                  })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Saved File probe timeout')),30000)})])}finally{clearTimeout(timer)}
                }""", expected)
            finally:
                browser.close()
    except Exception as error:
        host_error = {'type': type(error).__name__, 'message': str(error)}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    HOST.guard_sources(args.source_commit, snapshots)
    HOST.require(Path(__file__).read_bytes() == harness and HOST.file_stat(original) == before and original.read_bytes() == raw, 'Harness or retained File changed during probe')
    report = {'schemaVersion': 'diffusion-saved-file-reuse/0.1', 'executionSourceCommit': args.source_commit, 'harness': {'path': harness_path, 'bytes': len(harness), 'sha256': HOST.sha(harness), 'committedAtExecutionSource': harness_committed}, 'file': {'path': str(original), **expected}, 'result': result, 'sourceGuardAfter': True, 'servedSources': served, 'deniedPaths': denied, 'browser': {'version': browser_version, 'closed': True, 'pageErrors': errors}, 'hostError': host_error, 'resourceProfile': HOST.resource_config(1, 'false'), 'modelLoaded': False, 'nativeNNExecuted': False, 'tensorSavedOrExported': False, 'privatePayloadServedByHTTP': False, 'elapsedSeconds': time.monotonic() - started, 'passed': bool(result and result['passed'] and not host_error and not denied and not errors)}
    HOST.write_json(output, report, 0o600)
    print(json.dumps({'passed': report['passed'], 'output': str(output), 'hostError': host_error}))
    if not report['passed']:
        raise SystemExit(1)
if __name__ == '__main__':
    main()
