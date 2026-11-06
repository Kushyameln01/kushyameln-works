"""Fixed-source idle browser/observer check. No model load, tensor or NN call."""
import datetime
import hashlib
import http.server
import json
import os
from pathlib import Path
import subprocess
import threading
import time
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path('/workspace/kushyameln-works')
HERE = Path(__file__).resolve().parent
COMMIT = '296c18d5f2c878fa42bbb198a706991fc901065f'
HOST = 'tools/ai-connection/run-diffusion-public-browser.py'
RUNNER = '/tools/ai-connection/diffusion-public-browser.mjs'
OBSERVER = '/tools/ai-connection/diffusion-public-worker-observer.mjs'
MODULES = [HOST, 'tools/ai-connection/run-diffusion-public-browser.mjs', RUNNER[1:], OBSERVER[1:]]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, stderr=subprocess.PIPE)


def write_new(name, value):
    descriptor = os.open(HERE / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write('\n')


def main():
    assert git('rev-parse', 'HEAD').decode().strip() == COMMIT
    host_source = (ROOT / HOST).read_bytes()
    assert host_source == git('show', COMMIT + ':' + HOST)
    namespace = {'__name__': 'fixed_idle_source_guard', '__file__': str(ROOT / HOST)}
    exec(compile(host_source, str(ROOT / HOST), 'exec'), namespace)
    captured, source_proof = namespace['snapshot_sources'](COMMIT)
    inventory = {path: {'bytes': len(data), 'sha256': digest(data)} for path, data in captured.items()}
    script_before = Path(__file__).read_bytes()
    started = time.monotonic()
    receipt = {'schemaVersion': 'works-diffusion-public-idle-observer-check/0.1',
               'sourceCommit': COMMIT, 'ownerCommit': namespace['OWNER_COMMIT'],
               'startedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'scope': 'Actual manager default factory -> real public Worker with adopted observer; modelStatus, unload and dispose only. No model load, tensors, prediction, sample or NN.',
               'fixedSourceProofBefore': source_proof,
               'guardedSourceCount': len(captured), 'profiles': [],
               'scriptSHA256Before': digest(script_before),
               'sourceInventoryBefore': inventory,
               'nativeNNExecuted': False, 'modelsLoaded': False,
               'generationReady': False, 'originalWorkflowAccepted': False}
    logs = []
    errors = []
    lock = threading.Lock()
    html = b'<!doctype html><meta charset="utf-8"><title>Fixed-source idle observer check</title>'

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            path = urlsplit(self.path).path
            data = html if path == '/' else b'' if path == '/favicon.ico' else captured.get(path)
            code = 204 if path == '/favicon.ico' else 200 if data is not None else 404
            if data is None:
                data = b'Not in fixed-source allowlist'
            entry = {'elapsedSeconds': time.monotonic() - started, 'profile': self.server.profile,
                     'method': 'GET', 'path': path, 'rawPath': self.path,
                     'status': code, 'bytes': len(data), 'sha256': digest(data),
                     'committedSource': path in captured}
            with lock:
                self.server.requests.append(entry)
                logs.append({'kind': 'http', **entry})
            self.send_response(code)
            kind = 'text/html; charset=utf-8' if path == '/' else 'text/javascript' if path.endswith(('.mjs', '.js')) else 'application/wasm' if path.endswith('.wasm') else 'application/json' if path.endswith('.json') else 'application/octet-stream'
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            if self.server.coi:
                self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
                self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
                self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            self.send_error(405, 'Idle check permits no POST')

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                                 args=['--no-sandbox', '--disable-dev-shm-usage'])
            receipt['browserVersion'] = browser.version
            try:
                for coi in [False, True]:
                    profile = {'name': 'coi-' + str(coi).lower(), 'headersRequested': coi,
                               'expectedWindowAndWorkerCOI': coi, 'pageErrors': [],
                               'consoleErrors': [], 'physicalWorkers': [], 'deniedRequests': []}
                    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
                    server.profile = profile['name']
                    server.coi = coi
                    server.requests = []
                    thread = threading.Thread(target=server.serve_forever, daemon=True)
                    thread.start()
                    page = browser.new_page()
                    try:
                        origin = 'http://127.0.0.1:' + str(server.server_address[1])
                        page.set_default_timeout(30000)
                        page.on('pageerror', lambda error: profile['pageErrors'].append(str(error)))
                        page.on('console', lambda message: profile['consoleErrors'].append(message.text) if message.type == 'error' else None)

                        def worker_created(worker):
                            record = {'id': len(profile['physicalWorkers']) + 1, 'url': worker.url,
                                      'closed': False, 'createdSeconds': time.monotonic() - started}
                            profile['physicalWorkers'].append(record)
                            def worker_closed():
                                record.update(closed=True, closedSeconds=time.monotonic() - started,
                                              event='playwright-worker-close')
                            worker.on('close', worker_closed)

                        page.on('worker', worker_created)
                        def route_request(route):
                            selected = urlsplit(route.request.url)
                            if route.request.method == 'GET' and selected.scheme in ['http', 'https'] and selected.netloc == urlsplit(origin).netloc:
                                route.continue_()
                            else:
                                profile['deniedRequests'].append({'url': route.request.url, 'method': route.request.method})
                                route.abort()
                        page.route('**/*', route_request)
                        response = page.goto(origin + '/')
                        profile['actualPageHeaders'] = {key: response.headers.get(key) for key in ['cross-origin-opener-policy', 'cross-origin-embedder-policy', 'cross-origin-resource-policy']}
                        profile['result'] = page.evaluate('''async()=>{
                          const base='/docs/shared/ai-connection/native/diffusion-ffeeeedb/docs/shared/diffusion-models/api/worker.mjs';
                          const Original=globalThis.Worker,observations=[],posts=[],terminations=[];
                          globalThis.Worker=class extends Original {
                            constructor(url,options){
                              const target=new URL(url,location.href),observed=target.origin===location.origin&&target.pathname===base;
                              const wrapper=new URL('/tools/ai-connection/diffusion-public-worker-observer.mjs',location.href);
                              wrapper.searchParams.set('worker',target.href);
                              super(observed?wrapper:url,options);
                              this.observed=observed;
                              if(observed)this.addEventListener('message',event=>{if(event.data?.__publicWasmObservation)observations.push(event.data);});
                            }
                            postMessage(value,...rest){if(this.observed)posts.push(Object.fromEntries(['protocolVersion','buildId','sessionId','jobId','inputRevision','op'].map(key=>[key,value?.[key]])));return super.postMessage(value,...rest);}
                            terminate(){if(this.observed)terminations.push({elapsedMs:performance.now()});return super.terminate();}
                          };
                          const runner=await import('/tools/ai-connection/diffusion-public-browser.mjs');
                          const {createDiffusionPublicManagement}=await import('/docs/shared/ai-connection/adapters/diffusion-public/adapter.mjs');
                          let manager,disposed;
                          try {
                            manager=await createDiffusionPublicManagement();
                            const status=await manager.modelStatus({requestId:'idle-status:'+crypto.randomUUID()});
                            const unloaded=await manager.unload({requestId:'idle-unload:'+crypto.randomUUID()});
                            const state=manager.inspect();
                            disposed=await manager.dispose();
                            return {runnerExports:Object.keys(runner),window:{crossOriginIsolated,sharedArrayBuffer:typeof SharedArrayBuffer==='function'},workerObservations:observations,status:{status:status.status,nativeReply:status.nativeReply,target:status.target,terminal:status.terminal},unload:{status:unloaded.status,nativeReply:unloaded.nativeReply,target:unloaded.target,terminal:unloaded.terminal},disposed,loaded:state.loaded,controlTestDouble:state.controlTestDouble,modelRuntime:state.modelRuntime,posts,terminateCalls:terminations.length,nativeNNExecuted:false};
                          } finally {if(manager&&!disposed)await manager.dispose();globalThis.Worker=Original;}
                        }''')
                        deadline = time.monotonic() + 5
                        while any(not worker['closed'] for worker in profile['physicalWorkers']) and time.monotonic() < deadline:
                            page.wait_for_timeout(50)
                        profile['allObservedWorkersClosedBeforePageOrBrowserTeardown'] = bool(profile['physicalWorkers']) and all(worker['closed'] for worker in profile['physicalWorkers'])
                        profile['checkedBeforePageCloseSeconds'] = time.monotonic() - started
                        result = profile['result']
                        bootstraps = [value for value in result['workerObservations'] if value['stage'] == 'worker-bootstrap']
                        profile['workerEnvironments'] = [{key: value[key] for key in ['crossOriginIsolated', 'sharedArrayBuffer']} for value in bootstraps]
                        profile['passed'] = (result['window']['crossOriginIsolated'] is coi
                                             and result['window']['sharedArrayBuffer'] is coi
                                             and len(bootstraps) == 1
                                             and all(value['crossOriginIsolated'] is coi and value['sharedArrayBuffer'] is coi for value in bootstraps)
                                             and result['status']['nativeReply']['status'] == 'ok'
                                             and result['status']['nativeReply']['result']['loaded'] is False
                                             and result['unload']['nativeReply']['result']['unloaded'] is True
                                             and result['disposed']['disposed'] is True
                                             and result['loaded'] is False and result['controlTestDouble'] is False
                                             and [value['op'] for value in result['posts']] == ['modelStatus', 'unload']
                                             and all(value['memoryObjects'] == 0 and value['bytes'] == 0 for value in result['workerObservations'])
                                             and profile['allObservedWorkersClosedBeforePageOrBrowserTeardown']
                                             and not profile['pageErrors'] and not profile['consoleErrors'] and not profile['deniedRequests'])
                    except Exception as error:
                        profile['error'] = {'name': type(error).__name__, 'message': str(error)}
                        profile['passed'] = False
                    finally:
                        page.close()
                        server.shutdown()
                        server.server_close()
                        thread.join(5)
                    profile['requests'] = server.requests
                    source_gets = [entry for entry in server.requests if entry['committedSource']]
                    counts = {}
                    for entry in source_gets:
                        counts[entry['path']] = counts.get(entry['path'], 0) + 1
                    profile['sourceGETCount'] = len(source_gets)
                    profile['distinctSourceGETCount'] = len(counts)
                    profile['sourceGETCounts'] = counts
                    profile['allSourceGETBytesMatchBeforeInventory'] = all(entry['status'] == 200 and entry['sha256'] == inventory[entry['path']]['sha256'] and entry['bytes'] == inventory[entry['path']]['bytes'] for entry in source_gets)
                    profile['passed'] = profile['passed'] and profile['allSourceGETBytesMatchBeforeInventory'] and all(entry['status'] < 400 for entry in server.requests)
                    receipt['profiles'].append(profile)
            finally:
                browser.close()
    except Exception as error:
        errors.append({'name': type(error).__name__, 'message': str(error)})
    try:
        after, proof_after = namespace['snapshot_sources'](COMMIT)
        receipt['sourceGuardAfter'] = after == captured
        receipt['fixedSourceProofAfter'] = proof_after
        actual_paths = sorted({entry['path'] for profile in receipt['profiles'] for entry in profile['requests'] if entry['committedSource']})
        receipt['actuallyServedSourcesBeforeAfter'] = {path: {'before': inventory[path], 'after': {'bytes': len(after[path]), 'sha256': digest(after[path])}, 'exactCommitBefore': captured[path] == git('show', COMMIT + ':' + path[1:]), 'exactCommitAfter': after[path] == git('show', COMMIT + ':' + path[1:])} for path in actual_paths}
        receipt['runnerAndObserverBeforeAfter'] = {path: {'before': inventory['/' + path], 'after': {'bytes': len(after['/' + path]), 'sha256': digest(after['/' + path])}} for path in MODULES}
    except Exception as error:
        receipt['sourceGuardAfter'] = False
        errors.append({'stage': 'source-guard-after', 'name': type(error).__name__, 'message': str(error)})
    receipt['scriptSHA256After'] = digest(Path(__file__).read_bytes())
    receipt['errors'] = errors
    receipt['finishedUTC'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    receipt['elapsedSeconds'] = time.monotonic() - started
    receipt['passed'] = len(receipt['profiles']) == 2 and all(profile['passed'] for profile in receipt['profiles']) and receipt.get('sourceGuardAfter') is True and receipt['scriptSHA256Before'] == receipt['scriptSHA256After'] and not errors
    write_new('receipt.json', receipt)
    descriptor = os.open(HERE / 'private-http.jsonl', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        for entry in logs:
            stream.write(json.dumps(entry, allow_nan=False) + '\n')
    print(json.dumps({'passed': receipt['passed'], 'sourceCommit': COMMIT, 'guardedSourceCount': len(captured), 'profiles': [{'name': profile['name'], 'passed': profile['passed'], 'sourceGETCount': profile['sourceGETCount'], 'distinctSourceGETCount': profile['distinctSourceGETCount'], 'workersClosedBeforeTeardown': profile.get('allObservedWorkersClosedBeforePageOrBrowserTeardown'), 'error': profile.get('error')} for profile in receipt['profiles']], 'errors': errors, 'receipt': str(HERE / 'receipt.json')}))
    if not receipt['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
