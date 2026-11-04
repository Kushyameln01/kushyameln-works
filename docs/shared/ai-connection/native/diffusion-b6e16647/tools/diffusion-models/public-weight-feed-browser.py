"""Pinned public Worker/weight-port lifecycle test; no full NN or real LoRA."""
import argparse
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
SELF = 'tools/diffusion-models/public-weight-feed-browser.py'
RUNNER = 'tools/diffusion-models/public-weight-feed-browser.mjs'
spec = importlib.util.spec_from_file_location('public_model_browser', ROOT / 'tools/diffusion-models/public-model-browser.py')
BASE = importlib.util.module_from_spec(spec)
spec.loader.exec_module(BASE)

def snapshot_sources(commit):
    snapshots = BASE.snapshot_sources(commit)
    for relative in [SELF, RUNNER]:
        actual = (ROOT / relative).read_bytes()
        BASE.require(actual == BASE.git('show', commit + ':' + relative),
                     'Additional weight driver is not exactly committed: ' + relative)
        snapshots['/' + relative] = actual
    return snapshots

def self_test():
    script = r'''
import assert from 'node:assert/strict';
const m=await import('./tools/diffusion-models/public-weight-feed-browser.mjs').catch(()=>({}));
assert.equal(typeof m.runPublicWeightFeedBrowser,'function','Actual public weight driver required');
assert.equal(typeof m.createOuterWeightRequester,'function','Explicit outer-port requester required');
let port;
const api={sessionId:'structural-test',async request(q){
 if(q.op==='echo'){assert.deepEqual([...q.input.data],[1,2]);return {...q,status:'ok',result:{data:new Float32Array(q.input.data)}};}
 const channel=new MessageChannel();port=channel.port1;port.start();port.addEventListener('message',e=>port.postMessage(e.data));return {...q,status:'ok',result:{port:channel.port2}};
}};
const owner=m.createOuterWeightRequester(api,{timeoutMs:1000}),data=new Float32Array([1,2]);
try{
 const reply=await owner.request('echo',{data});assert.equal(reply.status,'ok');assert.equal(data.byteLength,8);assert.deepEqual([...reply.result.data],[1,2]);
 const received=await owner.request('open',{});assert.ok(received.result.port instanceof MessagePort);const peer=received.result.port;peer.start();const read=new Promise(resolve=>peer.addEventListener('message',e=>resolve(e.data),{once:true}));peer.postMessage('transfer-ok');assert.equal(await read,'transfer-ok');peer.close();
}finally{port?.close();owner.dispose();}
'''
    subprocess.run(['node', '--input-type=module', '-'], cwd=ROOT, input=script, text=True, check=True)
    assert BASE.resource_config(1, None)['coi'] is False
    assert BASE.resource_config(4, None)['coi'] is True
    try:
        BASE.resource_config(4, 'false')
    except ValueError:
        pass
    else:
        raise AssertionError('Explicit four-thread/no-COI must reject')
    print(json.dumps({'passed': True, 'scope': 'outer MessagePort actual transferable delivery/caller ownership and explicit resource selection; no models'}))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--source-commit')
    parser.add_argument('--models', type=Path, default=ROOT.parent / 'retained/bernini')
    parser.add_argument('--wasm-threads', type=int, choices=[1, 4], default=1)
    parser.add_argument('--coi', choices=['true', 'false'])
    parser.add_argument('--transport', choices=['direct', 'outer', 'both'], default='both')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--timeout-seconds', type=float, default=180)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    BASE.require(args.source_commit and re.fullmatch(r'[0-9a-f]{40}', args.source_commit), 'Full source SHA required')
    BASE.require(args.timeout_seconds > 0 and args.timeout_seconds < 1800, 'Bounded positive timeout required')
    resource = BASE.resource_config(args.wasm_threads, args.coi)
    snapshots = snapshot_sources(args.source_commit)
    models = {side: (args.models / name).resolve() for side, name in BASE.MODEL_NAMES.items()}
    stats = {side: BASE.file_stat(path) for side, path in models.items()}
    BASE.require(all(item['st_size'] == 15574833216 for item in stats.values()), 'Original model pair size differs')
    if args.check_only:
        print(json.dumps({'passed': True, 'checkOnly': True, 'sourceCommit': args.source_commit,
                          'sourceFiles': len(snapshots), 'requestedResource': resource, 'modelStats': stats,
                          'nativeNNExecuted': False, 'modelsRead': False}))
        return
    BASE.require(args.output is not None and not args.output.exists(), 'New output receipt path required')
    served, denied, page_errors, console_errors = {}, [], [], []
    lock = threading.Lock()
    html = b'<!doctype html><meta charset="utf-8"><title>Public weight boundary</title><input id="model-high" type="file"><input id="model-low" type="file">'
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_GET(self):
            path = urlsplit(self.path).path
            data = html if path == '/' else b'' if path == '/favicon.ico' else snapshots.get(path)
            status = 204 if path == '/favicon.ico' else 200
            if data is None:
                with lock:
                    denied.append(path)
                status, data = 404, b'Outside fixed source allowlist'
            elif path in snapshots:
                with lock:
                    entry = served.setdefault(path, {'bytes': len(data), 'sha256': BASE.sha(data), 'requests': 0})
                    entry['requests'] += 1
            kind = 'text/html' if path == '/' else 'text/javascript' if path.endswith(('.mjs', '.js')) else 'application/wasm' if path.endswith('.wasm') else 'application/octet-stream'
            self.send_response(status)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
            if resource['coi']:
                self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
                self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
            self.end_headers()
            self.wfile.write(data)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monitoring = threading.Event()
    memory = {'scope': 'This Python host and live descendant Playwright/Chromium processes only; sum RSS double-counts shared pages; sampled PSS where permitted', 'samples': 0, 'peakSumRSSBytes': None, 'peakSumPSSBytes': None, 'errors': []}
    def monitor():
        try:
            import psutil
            owner = psutil.Process(os.getpid())
            while not monitoring.is_set():
                rss, pss, complete = 0, 0, True
                for process in [owner, *owner.children(recursive=True)]:
                    try:
                        rss += process.memory_info().rss
                        value = process.memory_full_info()
                        if hasattr(value, 'pss'):
                            pss += value.pss
                        else:
                            complete = False
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        complete = False
                memory['samples'] += 1
                memory['peakSumRSSBytes'] = max(memory['peakSumRSSBytes'] or 0, rss)
                if complete:
                    memory['peakSumPSSBytes'] = max(memory['peakSumPSSBytes'] or 0, pss)
                monitoring.wait(.1)
        except Exception as error:
            memory['errors'].append(str(error))
    observer = threading.Thread(target=monitor, daemon=True)
    observer.start()
    began, result, failure, browser_version = time.monotonic(), None, None, None
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
            browser_version = browser.version
            try:
                page = browser.new_page()
                page.on('pageerror', lambda error: page_errors.append(str(error)))
                page.on('console', lambda event: console_errors.append(event.text) if event.type == 'error' else None)
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                page.locator('#model-high').set_input_files(str(models['HIGH']))
                page.locator('#model-low').set_input_files(str(models['LOW']))
                config = {'sourceCommit': args.source_commit, 'wasmThreads': args.wasm_threads,
                          'expectedCOI': resource['coi'], 'resourceProfile': resource['profile'],
                          'transport': args.transport, 'timeoutMs': args.timeout_seconds * 1000}
                result = page.evaluate("""async config=>{let timer;try{return await Promise.race([(async()=>{const m=await import('/tools/diffusion-models/public-weight-feed-browser.mjs');return m.runPublicWeightFeedBrowser(config);})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Public weight test timeout')),config.timeoutMs);})]);}finally{clearTimeout(timer);}}""", config)
            finally:
                browser.close()
    except Exception as error:
        failure = {'type': type(error).__name__, 'message': str(error)}
    finally:
        server.shutdown()
        server.server_close()
        monitoring.set()
        observer.join(timeout=5)
    guard_error = None
    try:
        BASE.require(snapshot_sources(args.source_commit) == snapshots, 'Fixed source bytes changed during execution')
        BASE.require(all(BASE.file_stat(path) == stats[side] for side, path in models.items()), 'Retained model identity/stat changed')
    except Exception as error:
        guard_error = str(error)
    report = {'schemaVersion': 'bernini-public-weight-worker-host/1', 'sourceCommit': args.source_commit,
              'requestedResource': resource, 'transport': args.transport,
              'sourceInventory': {path[1:]: {'bytes': len(data), 'sha256': BASE.sha(data)} for path, data in sorted(snapshots.items())},
              'servedSources': served, 'deniedPaths': denied, 'sourceGuardAfter': guard_error is None,
              'sourceGuardError': guard_error, 'modelsSelectedAsActualFiles': True,
              'modelStatBefore': stats, 'fullModelReadByHTTPServer': False,
              'fullModelSHA256Recomputed': False, 'privateValuesPublished': False,
              'publicResult': result, 'hostError': failure, 'browser': {'version': browser_version, 'pageErrors': page_errors, 'consoleErrors': console_errors},
              'resources': memory, 'elapsedSeconds': time.monotonic() - began,
              'passed': bool(result and result.get('passed') and not failure and not guard_error and not denied and not page_errors),
              'actualLoRA': False, 'modelPredictExecuted': False, 'modelSampleExecuted': False,
              'generationReady': False}
    BASE.write_json(args.output, report)
    print(json.dumps({'passed': report['passed'], 'sourceCommit': args.source_commit, 'requestedResource': resource,
                      'transport': args.transport, 'hostError': failure, 'sourceGuardError': guard_error,
                      'elapsedSeconds': report['elapsedSeconds'], 'resources': memory}), flush=True)
    if not report['passed']:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
