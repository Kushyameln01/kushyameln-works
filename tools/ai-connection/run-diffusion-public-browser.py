"""Run the fixed management facade against the real public model Worker.

No model is read by this server. Only exact committed source and manifest-listed
small inputs are served. --check-only never constructs a browser or runs NN.
"""
import argparse
import hashlib
import http.server
import json
import math
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import threading
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
OWNER_COMMIT = 'ffeeeedb6b57d182a977c3ac02c042ce235fc87a'
NATIVE = Path('docs/shared/ai-connection/native/diffusion-ffeeeedb')
API = NATIVE / 'docs/shared/diffusion-models/api'
OWNER_HELPERS = ['tools/diffusion-models/public-model-browser.py',
                 'tools/diffusion-models/public-model-browser.mjs',
                 'tools/diffusion-models/public-model-worker-observer.mjs']
RUNNERS = ['tools/ai-connection/run-diffusion-public-browser.mjs',
           'tools/ai-connection/run-diffusion-public-browser.py',
           'tools/ai-connection/diffusion-public-browser.mjs',
           'tools/ai-connection/diffusion-public-worker-observer.mjs']
BROWSER = '/' + RUNNERS[2]
MODEL_NAMES = {'HIGH': 'Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors',
               'LOW': 'Bernini_LOW_fp8_e4m3fn_scaled.safetensors'}
MAX_OUTPUT_BYTES = 64 * 1024 * 1024


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def git(*arguments):
    return subprocess.check_output(['git', *arguments], cwd=ROOT, stderr=subprocess.PIPE)


def load_owner_helpers():
    path = ROOT / NATIVE / OWNER_HELPERS[0]
    namespace = {'__name__': 'fixed_diffusion_public_host', '__file__': str(path)}
    # Loading source without importlib avoids writing pycache into fixed sources.
    exec(compile(path.read_bytes(), str(path), 'exec'), namespace)
    return namespace


def snapshot_sources(commit):
    require(re.fullmatch(r'[0-9a-f]{40}', commit or ''), 'Complete management source SHA required')
    require(git('rev-parse', 'HEAD').decode().strip() == commit, 'Management execution source must equal HEAD')
    build_path = API / 'build-info.mjs'
    match = re.search(rb'BUILD_SOURCES=Object\.freeze\((\{.*?\})\);', (ROOT / build_path).read_bytes(), re.S)
    require(match is not None, 'Frozen BUILD_SOURCES not found')
    declared = json.loads(match.group(1))
    names = set(RUNNERS)
    pinned = {}
    for relative, digest in declared.items():
        path = (ROOT / API / relative).resolve()
        require(path.is_relative_to(ROOT / NATIVE), 'Native closure escaped the pinned tree')
        name = path.relative_to(ROOT).as_posix()
        pinned[name] = digest
        names.add(name)
    for original in OWNER_HELPERS + ['docs/shared/diffusion-models/api/build-info.mjs']:
        name = (NATIVE / original).as_posix()
        names.add(name)
        pinned[name] = None
    manifest_path = NATIVE / 'SOURCE.json'
    manifest_bytes = (ROOT / manifest_path).read_bytes()
    manifest = json.loads(manifest_bytes)
    require(manifest['sourceCommit'] == OWNER_COMMIT, 'Adopted source manifest changed owner commit')
    names.add(manifest_path.as_posix())
    for entry in manifest['files']:
        name = (NATIVE / entry['path']).as_posix()
        require((ROOT / name).resolve().is_relative_to(ROOT / NATIVE), 'Adoption manifest escaped pinned tree')
        names.add(name)
        if name in pinned:
            require(pinned[name] is None or pinned[name] == entry['sha256'], 'Build/adoption manifests disagree: ' + name)
        pinned[name] = entry['sha256']
    # The manager's imports are intentionally a committed source superset.
    # Denied HTTP paths fail the run, so an omitted lazy dependency is visible.
    tracked = git('ls-tree', '-r', '--name-only', commit, 'docs/shared/ai-connection').decode().splitlines()
    names.update(name for name in tracked if not name.startswith(str(NATIVE) + '/') and name.endswith(('.mjs', '.js', '.json')))
    names.add('docs/shared/ft/vendor/fflate.mjs')
    names.add('docs/shared/ai-connection/adapters/diffusion-public/adapter.mjs')
    snapshots = {}
    for name in sorted(names):
        data = (ROOT / name).read_bytes()
        require(data == git('show', commit + ':' + name), 'Management source not exactly committed: ' + name)
        if name in pinned:
            original = Path(name).relative_to(NATIVE).as_posix()
            require(data == git('show', OWNER_COMMIT + ':' + original), 'Native source differs from fixed owner: ' + original)
            digest = pinned[name]
            require(digest is None or sha(data) == digest, 'Frozen generated source hash differs: ' + original)
        snapshots['/' + name] = data
    return snapshots, {'nativeDeclaredSources': len(declared), 'nativeClosureWithBuildInfo': len(declared) + 1,
                       'adoptedSourceFiles': len(manifest['files']), 'adoptionManifestSHA256': sha(manifest_bytes),
                       'sourceCommit': commit, 'ownerCommit': OWNER_COMMIT, 'allExactCommittedBytes': True}


def preflight(args):
    result = {'checkOnly': True, 'nativeNNExecuted': False, 'browserLaunched': False,
              'sourceCommit': args.source_commit, 'ownerCommit': OWNER_COMMIT,
              'wasmThreads': args.wasm_threads, 'coiHeadersRequested': args.coi,
              'generationReady': False, 'originalWorkflowAccepted': False,
              'errors': [], 'modelStats': {}}
    snapshots = inputs = binary_inputs = helper = None
    try:
        snapshots, proof = snapshot_sources(args.source_commit)
        result['sourceProof'] = proof
        result['guardedSources'] = len(snapshots)
        helper = load_owner_helpers()
    except Exception as error:
        result['errors'].append({'stage': 'source', 'type': type(error).__name__, 'message': str(error)})
    if helper:
        try:
            inputs, binary_inputs, result['inputReceipt'] = helper['prepare_inputs'](args.manifest)
        except Exception as error:
            result['errors'].append({'stage': 'saved-inputs', 'type': type(error).__name__, 'message': str(error)})
    models = {side: (args.models / name).resolve() for side, name in MODEL_NAMES.items()}
    for side, path in models.items():
        try:
            value = path.stat()
            result['modelStats'][side] = {key: getattr(value, key) for key in ['st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns']}
            require(value.st_size == 15574833216, 'Original ' + side + ' model size differs')
        except Exception as error:
            result['errors'].append({'stage': 'model-' + side, 'type': type(error).__name__, 'message': str(error)})
    result['passed'] = not result['errors']
    result['status'] = 'SOURCE_AND_ASSETS_PRESENT' if result['passed'] else 'BLOCKED'
    return result, snapshots, helper, inputs, binary_inputs, models


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--models', type=Path, default=ROOT.parent / 'retained/bernini')
    parser.add_argument('--mode', choices=['smoke', 'predict', 'sample'], default='sample')
    parser.add_argument('--cancel-before-run', action='store_true')
    parser.add_argument('--side', choices=['HIGH', 'LOW'], default='HIGH')
    parser.add_argument('--timestep', type=float, default=1000)
    parser.add_argument('--wasm-threads', type=int, choices=[1, 4], default=1)
    parser.add_argument('--coi', choices=['false', 'true'], default='false', help='Only true sends actual COOP/COEP; default false')
    parser.add_argument('--private-output', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--chromium', default=shutil.which('chromium') or '/usr/bin/chromium')
    parser.add_argument('--timeout-seconds', type=float, default=21600)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    args.coi = args.coi == 'true'
    require(math.isfinite(args.timeout_seconds) and args.timeout_seconds > 0, 'Positive finite timeout required')
    require(math.isfinite(args.timestep) and 0 <= args.timestep <= 1000, 'Timestep 0..1000 required')
    require(args.wasm_threads != 4 or args.coi, 'Explicit four threads require --coi true; no fallback')
    require(not args.cancel_before_run or args.mode == 'sample', '--cancel-before-run requires --mode sample')
    checked, snapshots, helper, manifest, binary_inputs, models = preflight(args)
    if args.check_only or not checked['passed']:
        print(json.dumps(checked, allow_nan=False), flush=True)
        if not checked['passed']:
            raise SystemExit(2)
        return
    require(args.output is not None and args.private_output is not None, 'Actual execution needs --output and --private-output')
    require(not args.output.exists(), 'Public result path already exists')
    progress_path = args.output.with_name(args.output.name + '.progress.jsonl')
    require(not progress_path.exists(), 'Progress path already exists')
    sink = helper['OutputSink'](args.private_output)
    sink_base = '/__sink__/' + secrets.token_hex(24)
    served, denied, page_errors, console_errors, workers = {}, [], [], [], []
    lock = threading.Lock()
    manifest_bytes = json.dumps(manifest, separators=(',', ':'), allow_nan=False).encode()
    html = b'<!doctype html><meta charset="utf-8"><title>Private management/public Worker harness</title><input id="model-high" type="file"><input id="model-low" type="file"><input id="saved-tensor" type="file">'

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *values):
            pass

        def send(self, code, body, content_type='application/octet-stream'):
            self.send_response(code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            if args.coi:
                self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
                self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
                self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == '/':
                return self.send(200, html, 'text/html; charset=utf-8')
            if path == '/favicon.ico':
                return self.send(204, b'')
            if path == '/__case__.json':
                return self.send(200, manifest_bytes, 'application/json')
            data = snapshots.get(path, binary_inputs.get(path))
            if data is None:
                with lock:
                    denied.append(path)
                return self.send(404, b'Not in explicit source/input allowlist')
            with lock:
                entry = served.setdefault(path, {'requests': 0, 'bytes': len(data), 'sha256': sha(data)})
                entry['requests'] += 1
            kind = 'text/javascript' if path.endswith(('.mjs', '.js')) else 'application/wasm' if path.endswith('.wasm') else 'application/json' if path.endswith('.json') else 'application/octet-stream'
            return self.send(200, data, kind)

        def do_POST(self):
            try:
                path = urlsplit(self.path).path
                require(path.startswith(sink_base + '/'), 'Unknown private sink')
                length = int(self.headers.get('Content-Length', '-1'))
                require(0 < length <= MAX_OUTPUT_BYTES, 'Bounded output Content-Length required')
                data = self.rfile.read(length)
                require(len(data) == length, 'Truncated private output upload')
                result = sink.write(path[len(sink_base) + 1:], data, self.headers.get('X-Content-SHA256'))
                self.send(200, json.dumps(result).encode(), 'application/json')
            except (ValueError, OSError) as error:
                self.send(400, str(error).encode(), 'text/plain')

    progress_path.parent.mkdir(parents=True, exist_ok=True)
    progress_fd = os.open(progress_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    event_count = 0

    def checkpoint(event):
        nonlocal event_count
        line = json.dumps(event, separators=(',', ':'), allow_nan=False) + '\n'
        with os.fdopen(os.dup(progress_fd), 'w') as output:
            output.write(line)
            output.flush()
        event_count += 1
        model = event.get('progress', {}).get('model', {})
        if event.get('stage') in ['prepared', 'request-terminal', 'operation-error', 'real-file-readback', 'finished'] or model.get('stage') == 'block-complete':
            print(json.dumps({'stage': event.get('stage'), 'modelStage': model.get('stage'), 'block': model.get('block'), 'step': event.get('progress', {}).get('step'), 'elapsedMs': event.get('elapsedMs')}), flush=True)

    started = time.monotonic()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    result = host_error = browser_version = None
    workers_closed_before_browser_close = False
    model_file_selections = []
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=args.chromium, headless=True,
                                                 args=['--no-sandbox', '--disable-dev-shm-usage'])
            browser_version = browser.version
            try:
                page = browser.new_page()
                page.set_default_timeout(args.timeout_seconds * 1000)
                page.on('pageerror', lambda error: page_errors.append(str(error)))
                page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)

                def worker_created(worker):
                    record = {'id': len(workers) + 1, 'url': worker.url, 'closed': False, 'createdSeconds': time.monotonic() - started}
                    workers.append(record)
                    def closed():
                        record.update(closed=True, closedSeconds=time.monotonic() - started, closeEvent='playwright-worker-close')
                    worker.on('close', closed)

                page.on('worker', worker_created)
                origin = 'http://127.0.0.1:' + str(server.server_address[1])
                def route_request(route):
                    url = urlsplit(route.request.url)
                    if url.scheme == 'blob' or url.scheme in ['http', 'https'] and url.netloc == urlsplit(origin).netloc and route.request.method in ['GET', 'POST']:
                        route.continue_()
                    else:
                        denied.append({'offOrigin': route.request.url, 'method': route.request.method})
                        route.abort()
                page.route('**/*', route_request)
                page.expose_function('reportDiffusionCheckpoint', checkpoint)
                def worker_close_state(epoch):
                    matched = [worker for worker in workers
                               if urlsplit(worker['url']).path == '/tools/ai-connection/diffusion-public-worker-observer.mjs'
                               and 'epoch=' + str(epoch) in urlsplit(worker['url']).query.split('&')]
                    return {'observed': len(matched) == 1, 'closed': len(matched) == 1 and matched[0]['closed'],
                            'event': matched[0].get('closeEvent') if len(matched) == 1 else None}
                page.expose_function('diffusionWorkerCloseState', worker_close_state)
                page.goto(origin + '/')
                page.locator('#model-high').set_input_files(str(models['HIGH']))
                model_file_selections.append('HIGH')
                page.locator('#model-low').set_input_files(str(models['LOW']))
                model_file_selections.append('LOW')
                config = {'sourceCommit': args.source_commit, 'mode': args.mode, 'side': args.side,
                          'timestep': args.timestep, 'wasmThreads': args.wasm_threads, 'coi': args.coi,
                          'sinkBase': sink_base, 'timeoutMs': args.timeout_seconds * 1000,
                          'cancelBeforeRun': args.cancel_before_run}

                def evaluate_phase(phase, timeout_ms):
                    return page.evaluate("""async({phase,config,timeoutMs,path})=>{
                      let timer;try{return await Promise.race([
                        (async()=>{const m=await import(path);return await m[phase](config);})(),
                        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Management browser phase timeout: '+phase)),timeoutMs);})
                      ]);}finally{clearTimeout(timer);}
                    }""", {'phase': phase, 'config': config, 'timeoutMs': timeout_ms, 'path': BROWSER})
                try:
                    result = evaluate_phase('startDiffusionPublicBrowser', config['timeoutMs'] + 5000)
                    if result.get('outcome') == 'awaiting-real-file-readback':
                        require(set(sink.entries) == {'tensor.f32', 'tensor.wktensor'}, 'Both actual output files required')
                        page.locator('#saved-tensor').set_input_files(str(sink.directory / 'tensor.wktensor'))
                        evaluate_phase('readbackDiffusionPublicFile', 60000)
                finally:
                    if page.evaluate('Boolean(globalThis.__diffusionManagementSession)'):
                        result = evaluate_phase('finishDiffusionPublicBrowser', 60000)
                    # Pump the event loop until actual Worker close events arrive;
                    # timeout is failure, never proof of physical termination.
                    deadline = time.monotonic() + 30
                    while any(not worker['closed'] for worker in workers) and time.monotonic() < deadline:
                        page.wait_for_timeout(100)
                    workers_closed_before_browser_close = bool(workers) and all(worker['closed'] for worker in workers)
            finally:
                browser.close()
    except Exception as error:
        host_error = {'type': type(error).__name__, 'message': str(error)}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        os.close(progress_fd)
    guard_error = None
    try:
        latest, _ = snapshot_sources(args.source_commit)
        require(latest == snapshots, 'Source bytes changed during browser lifetime')
        require(all(helper['file_stat'](path) == checked['modelStats'][side] for side, path in models.items()), 'Retained model stat changed during run')
    except Exception as error:
        guard_error = str(error)
    physical_closed = workers_closed_before_browser_close
    report = {'schemaVersion': 'works-diffusion-public-management-host/0.1',
              'sourceCommit': args.source_commit, 'ownerCommit': OWNER_COMMIT,
              'sourceProof': checked['sourceProof'], 'mode': args.mode, 'wasmThreads': args.wasm_threads,
              'cancelBeforeRun': args.cancel_before_run,
              'sourceInventory': {name[1:]: {'bytes': len(data), 'sha256': sha(data)} for name, data in snapshots.items()},
              'servedSourcesAndInputs': served, 'deniedPaths': denied,
              'sourceGuardAfter': guard_error is None, 'sourceGuardError': guard_error,
              'inputReceipt': checked['inputReceipt'], 'modelStatBefore': checked['modelStats'],
              'modelsSelectedAsActualFiles': model_file_selections == ['HIGH', 'LOW'],
              'actualFileSelections': model_file_selections, 'fullModelReadByHTTPServer': False,
              'fullModelSHA256Recomputed': False, 'privateValuesPublished': False,
              'privateOutputs': sink.entries, 'publicResult': result, 'hostError': host_error,
              'browser': {'version': browser_version, 'closed': True, 'pageErrors': page_errors,
                          'consoleErrors': console_errors,
                          'coop': 'same-origin' if args.coi else None,
                          'coep': 'require-corp' if args.coi else None},
              'physicalWorkers': workers, 'allObservedWorkersClosedBeforeBrowserClose': physical_closed,
              'allObservedWorkersClosed': bool(workers) and all(worker['closed'] for worker in workers),
              'progressEvents': event_count, 'elapsedSeconds': time.monotonic() - started,
              'resources': 'Observed public Worker WASM counters and actual browser Worker close events; process RSS/PSS, JS buffers and unexported allocations are outside this scope',
              'passed': bool(result and result.get('outcome') == 'completed' and result.get('callerInputsBitExact') and result.get('resourceEnvironmentVerified') and physical_closed and not host_error and not guard_error and not page_errors and not denied),
              'numericalComparison': 'Separate optional postprocessing; no reference or gate in ordinary management input',
              'generationReady': False, 'originalWorkflowAccepted': False}
    helper['write_json'](sink.directory / 'host-result.json', report, 0o600)
    helper['write_json'](args.output, report)
    print(json.dumps({'passed': report['passed'], 'sourceCommit': args.source_commit,
                      'outcome': result.get('outcome') if result else None, 'hostError': host_error,
                      'sourceGuardError': guard_error, 'allObservedWorkersClosed': physical_closed,
                      'elapsedSeconds': report['elapsedSeconds']}), flush=True)
    if not report['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
