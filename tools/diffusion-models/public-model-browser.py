"""Source-pinned real public API/Worker execution, cancellation and disk readback.

Models enter only as actual browser File inputs. Only manifest-declared input
binary files may be fetched. Normal API calls contain no references/gates; a
separate independent comparison consumes private tensor.f32 after completion.
--check-only verifies files and committed sources without constructing a browser.
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
import stat
import subprocess
import tempfile
import threading
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / 'docs/shared/diffusion-models/api'
SELF = 'tools/diffusion-models/public-model-browser.py'
RUNNER = 'tools/diffusion-models/public-model-browser.mjs'
OBSERVER = 'tools/diffusion-models/public-model-worker-observer.mjs'
CONTRACT = 'development/ai-connection/public-worker-20261102/CONTRACT.json'
MAX_OUTPUT_BYTES = 64 * 1024 * 1024
MODEL_NAMES = {'HIGH': 'Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors',
               'LOW': 'Bernini_LOW_fp8_e4m3fn_scaled.safetensors'}


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def git(*arguments):
    return subprocess.check_output(['git', *arguments], cwd=ROOT)


def snapshot_sources(commit):
    """Use generated inventory, not a historical hand-written 31-file list."""
    require(re.fullmatch(r'[0-9a-f]{40}', commit), 'Complete execution source SHA required')
    require(git('rev-parse', 'HEAD').decode().strip() == commit, 'Execution source must equal HEAD')
    build = (API / 'build-info.mjs').read_bytes()
    match = re.search(rb'BUILD_SOURCES=Object\.freeze\((\{.*?\})\);', build, re.S)
    require(match is not None, 'Generated BUILD_SOURCES dictionary was not found')
    declared = json.loads(match.group(1))
    names = {}
    for relative, digest in declared.items():
        path = (API / relative).resolve()
        require(path.is_relative_to(ROOT), 'Build source escaped repository')
        names[path.relative_to(ROOT).as_posix()] = digest
    require('docs/shared/diffusion-models/api/model-adapter.mjs' in names,
            'Regenerate build-info with public model adapter before execution')
    for relative in [SELF, RUNNER, OBSERVER, CONTRACT, 'docs/shared/diffusion-models/api/build-info.mjs']:
        names[relative] = None
    snapshots = {}
    for relative, digest in sorted(names.items()):
        actual = (ROOT / relative).read_bytes()
        require(actual == git('show', commit + ':' + relative),
                'Execution source is not exactly committed: ' + relative)
        require(digest is None or sha(actual) == digest,
                'Generated build identity is stale: ' + relative)
        snapshots['/' + relative] = actual
    return snapshots


def guard_sources(commit, snapshots):
    latest = snapshot_sources(commit)
    require(latest == snapshots, 'Execution source bytes changed during browser lifetime')


def file_stat(path):
    value = path.stat()
    return {key: getattr(value, key) for key in ['st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns']}


def private_path(path):
    path = path.resolve()
    require(not path.is_relative_to(ROOT), 'Private values must stay outside repository')
    require(path.is_relative_to(Path(tempfile.gettempdir()).resolve()) or
            path.is_relative_to(ROOT.parent / 'diffusion-private-hidden'),
            'Private values require dedicated temporary/private storage')
    for parent in path.parents:
        marker = parent / '.git'
        require(not (marker.is_file() or marker.is_dir() and (marker / 'HEAD').exists()),
                'Private values may not be placed inside any Git checkout')
    return path


def write_json(path, value, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(value, output, indent=2, allow_nan=False)
        output.write('\n')


def prepare_inputs(path):
    """Hash only explicit saved inputs, never original complete model files."""
    raw = private_path(path).read_bytes()
    source = json.loads(raw)
    declared = {}

    def register(item, key, expected_bytes=None, expected_sha=None):
        candidate = private_path(Path(item['path']))
        data = candidate.read_bytes()
        size = expected_bytes if expected_bytes is not None else item['bytes']
        digest = expected_sha if expected_sha is not None else item['sha256']
        require(len(data) == size and sha(data) == digest, 'Private saved input identity differs: ' + key)
        url = '/__input__/' + key
        declared[url] = data
        return {**{name: value for name, value in item.items() if name != 'path'},
                'url': url, 'bytes': size, 'sha256': digest}

    tensors = [register(item, 'tensor-' + str(index) + '.f32') for index, item in enumerate(source['tensors'])]
    initial = register(source['initialEmptyTarget'], 'initial-target.f32')
    noise = register(source['explicitNoise'], 'noise.f32')
    text = source['conditioning']
    metadata = text['metadata']
    rows = metadata['shape'][1]
    payload = register({'path': text['payloadPath']}, 'conditioning.f32', rows * 4096 * 4, text['payloadSHA256'])
    mask = register({'path': text['maskPath']}, 'attention-mask.u8', rows, text['maskSHA256'])
    public = {key: source.get(key) for key in ['schemaVersion', 'profileId', 'caseClass', 'producerVerified', 'shapeRequest', 'canonicalShape']}
    public.update(tensors=tensors, initialEmptyTarget=initial, explicitNoise=noise,
                  conditioning={'metadata': metadata, 'payloadURL': payload['url'], 'maskURL': mask['url'],
                                'payloadSHA256': payload['sha256'], 'maskSHA256': mask['sha256']})
    identities = [{'url': url, 'bytes': len(data), 'sha256': sha(data)} for url, data in sorted(declared.items())]
    return public, declared, {'manifestSHA256': sha(raw), 'bytes': len(raw), 'files': identities,
                              'caseClass': source.get('caseClass'), 'profileId': source.get('profileId'),
                              'shapeRequest': source['shapeRequest'],
                              'canonicalShape': source.get('canonicalShape'),
                              'conditioning': {'shape': metadata['shape'], 'modelSha256': metadata['modelSha256'],
                                               'tokenizerSha256': metadata.get('tokenizerSha256'),
                                               'producer': metadata.get('producer'),
                                               'normalization': metadata.get('normalization'),
                                               'payloadSHA256': text['payloadSHA256'], 'maskSHA256': text['maskSHA256']}}


class OutputSink:
    def __init__(self, directory):
        self.directory = private_path(directory)
        require(not self.directory.exists(), 'Private output directory already exists')
        self.directory.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        require(stat.S_IMODE(self.directory.parent.stat().st_mode) == 0o700,
                'Private output parent must be mode0700')
        self.directory.mkdir(mode=0o700)
        self.lock = threading.Lock()
        self.entries = {}

    def write(self, name, data, digest):
        require(name in ['tensor.f32', 'tensor.wktensor'], 'Unregistered output name')
        require(0 < len(data) <= MAX_OUTPUT_BYTES and sha(data) == digest, 'Output extent/SHA256 differs')
        with self.lock:
            descriptor = os.open(self.directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'wb') as output:
                output.write(data)
            require((self.directory / name).read_bytes() == data, 'Actual saved output readback differs')
            self.entries[name] = {'bytes': len(data), 'sha256': digest, 'mode': '0600', 'oExcl': True,
                                  'actualFileHostReadback': True}
            return self.entries[name]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--models', type=Path, default=ROOT.parent / 'retained/bernini')
    parser.add_argument('--mode', choices=['smoke', 'predict', 'sample'], default='smoke')
    parser.add_argument('--side', choices=['HIGH', 'LOW'], default='HIGH')
    parser.add_argument('--timestep', type=float, default=1000)
    parser.add_argument('--wasm-threads', type=int, choices=[1, 4], default=4)
    parser.add_argument('--private-output', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='Public metadata/resources only')
    parser.add_argument('--chromium', default=shutil.which('chromium') or '/usr/bin/chromium')
    parser.add_argument('--timeout-seconds', type=float, default=21600)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    require(math.isfinite(args.timeout_seconds) and args.timeout_seconds > 0, 'Positive finite timeout required')
    require(math.isfinite(args.timestep) and 0 <= args.timestep <= 1000, 'Timestep0..1000 required')
    snapshots = snapshot_sources(args.source_commit)
    manifest, binary_inputs, input_receipt = prepare_inputs(args.manifest)
    models = {side: (args.models / name).resolve() for side, name in MODEL_NAMES.items()}
    model_stats = {side: file_stat(path) for side, path in models.items()}
    require(all(value['st_size'] == 15574833216 for value in model_stats.values()), 'Original HIGH/LOW model sizes differ')
    source_receipt = {name[1:]: {'bytes': len(data), 'sha256': sha(data)} for name, data in snapshots.items()}
    if args.check_only:
        print(json.dumps({'checkOnly': True, 'passed': True, 'sourceCommit': args.source_commit,
                          'guardedSources': len(snapshots), 'nativeNNExecuted': False,
                          'inputs': input_receipt, 'modelStats': model_stats}))
        return
    require(not args.output.exists(), 'Public result path already exists')
    progress_path = args.output.with_name(args.output.name + '.progress.jsonl')
    require(not progress_path.exists(), 'Progress result path already exists')
    sink = OutputSink(args.private_output)
    sink_base = '/__sink__/' + secrets.token_hex(24)
    served, denied, page_errors, console_errors = {}, [], [], []
    http_lock = threading.Lock()
    manifest_bytes = json.dumps(manifest, separators=(',', ':'), allow_nan=False).encode()
    html = b'<!doctype html><meta charset="utf-8"><title>Private public-Worker harness</title><input id="model-high" type="file"><input id="model-low" type="file"><input id="saved-tensor" type="file">'

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *values):
            pass

        def send(self, code, body, content_type='application/octet-stream'):
            self.send_response(code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
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
            data = snapshots.get(path)
            if data is None:
                data = binary_inputs.get(path)
            if data is None:
                with http_lock:
                    denied.append(path)
                return self.send(404, b'Not in explicit source/input allowlist')
            with http_lock:
                entry = served.setdefault(path, {'requests': 0, 'bytes': len(data), 'sha256': sha(data)})
                entry['requests'] += 1
            kind = 'text/javascript' if path.endswith(('.mjs', '.js')) else 'application/wasm' if path.endswith('.wasm') else 'application/json' if path.endswith('.json') else 'application/octet-stream'
            return self.send(200, data, kind)

        def do_POST(self):
            try:
                path = urlsplit(self.path).path
                require(path.startswith(sink_base + '/'), 'Unknown private sink')
                name = path[len(sink_base) + 1:]
                length = int(self.headers.get('Content-Length', '-1'))
                require(0 < length <= MAX_OUTPUT_BYTES, 'Bounded output Content-Length required')
                data = self.rfile.read(length)
                require(len(data) == length, 'Truncated private output upload')
                result = sink.write(name, data, self.headers.get('X-Content-SHA256'))
                self.send(200, json.dumps(result).encode(), 'application/json')
            except (ValueError, OSError) as error:
                self.send(400, str(error).encode(), 'text/plain')

    progress_path.parent.mkdir(parents=True, exist_ok=True)
    progress_fd = os.open(progress_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    event_count = 0

    def checkpoint(event):
        nonlocal event_count
        # Resource events contain no tensor payload. Native progress is metadata.
        line = json.dumps(event, separators=(',', ':'), allow_nan=False) + '\n'
        with os.fdopen(os.dup(progress_fd), 'w') as output:
            output.write(line)
            output.flush()
        event_count += 1
        progress = event.get('progress', {})
        model = progress.get('model', {})
        if event.get('stage') in ['prepared', 'request-terminal', 'operation-error', 'real-file-readback', 'finished'] or model.get('stage') == 'block-complete':
            print(json.dumps({'stage': event.get('stage'), 'modelStage': model.get('stage'),
                              'block': model.get('block'), 'step': progress.get('step'),
                              'side': progress.get('side'), 'elapsedMs': event.get('elapsedMs'),
                              'status': event.get('status')}), flush=True)

    started = time.monotonic()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    result, launch_error, browser_version = None, None, None
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=args.chromium, headless=True,
                                                 args=['--disable-dev-shm-usage'])
            browser_version = browser.version
            try:
                page = browser.new_page()
                page.set_default_timeout(args.timeout_seconds * 1000)
                page.on('pageerror', lambda error: page_errors.append(str(error)))
                page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
                page.expose_function('reportPublicCheckpoint', checkpoint)
                page.goto('http://127.0.0.1:' + str(server.server_address[1]) + '/')
                page.locator('#model-high').set_input_files(str(models['HIGH']))
                page.locator('#model-low').set_input_files(str(models['LOW']))
                config = {'sourceCommit': args.source_commit, 'mode': args.mode, 'side': args.side,
                          'timestep': args.timestep, 'wasmThreads': args.wasm_threads, 'sinkBase': sink_base,
                          'timeoutMs': args.timeout_seconds * 1000}

                def evaluate_phase(phase, timeout_ms):
                    # Playwright's default timeout does not bound page.evaluate.
                    # The JS race additionally covers imports and file readback;
                    # the model session's own watchdog hard-cancels its Worker.
                    return page.evaluate("""async({phase,config,timeoutMs})=>{
                      let timer;try{return await Promise.race([
                        (async()=>{const m=await import('/tools/diffusion-models/public-model-browser.mjs');return await m[phase](config);})(),
                        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Public browser phase timeout: '+phase)),timeoutMs);})
                      ]);}finally{clearTimeout(timer);}
                    }""", {'phase': phase, 'config': config, 'timeoutMs': timeout_ms})

                try:
                    result = evaluate_phase('startPublicModelBrowser', config['timeoutMs'] + 5000)
                    if result.get('outcome') == 'awaiting-real-file-readback':
                        require(set(sink.entries) == {'tensor.f32', 'tensor.wktensor'}, 'Both private real output files required')
                        page.locator('#saved-tensor').set_input_files(str(sink.directory / 'tensor.wktensor'))
                        evaluate_phase('readbackPublicModelFile', 60000)
                finally:
                    if page.evaluate('Boolean(globalThis.__publicModelSession)'):
                        result = evaluate_phase('finishPublicModelBrowser', 60000)
            finally:
                browser.close()
    except Exception as error:
        launch_error = {'type': type(error).__name__, 'message': str(error)}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        os.close(progress_fd)
    guard_error = None
    try:
        guard_sources(args.source_commit, snapshots)
        require(all(file_stat(path) == model_stats[side] for side, path in models.items()), 'Retained model stat changed during run')
    except Exception as error:
        guard_error = str(error)
    report = {'schemaVersion': 'bernini-public-model-worker-host/0.1', 'sourceCommit': args.source_commit,
              'mode': args.mode, 'side': args.side, 'timestep': args.timestep,
              'sourceInventory': source_receipt, 'servedSourcesAndInputs': served, 'deniedPaths': denied,
              'sourceGuardAfter': guard_error is None, 'sourceGuardError': guard_error,
              'inputReceipt': input_receipt, 'modelStatBefore': model_stats,
              'modelsSelectedAsActualFiles': True, 'fullModelReadByHTTPServer': False,
              'fullModelSHA256Recomputed': False, 'privateValuesPublished': False,
              'privateOutputs': sink.entries, 'publicResult': result, 'hostError': launch_error,
              'browser': {'version': browser_version, 'closed': True, 'pageErrors': page_errors,
                          'consoleErrors': console_errors, 'coop': 'same-origin', 'coep': 'require-corp'},
              'progressEvents': event_count, 'elapsedSeconds': time.monotonic() - started,
              'resources': 'Native owner stats and progress; external process monitor is separate',
              'passed': bool(result and result.get('outcome') == 'completed' and result.get('callerInputsBitExact') and not launch_error and not guard_error and not page_errors and not denied),
              'numericalComparison': 'Separate independent reference; not performed by this ordinary-API runner',
              'generationReady': False, 'originalWorkflowAccepted': False}
    write_json(sink.directory / 'host-result.json', report, 0o600)
    write_json(args.output, report)
    print(json.dumps({'passed': report['passed'], 'sourceCommit': args.source_commit,
                      'outcome': result.get('outcome') if result else None,
                      'hostError': launch_error, 'sourceGuardError': guard_error,
                      'elapsedSeconds': report['elapsedSeconds']}), flush=True)
    if not report['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
