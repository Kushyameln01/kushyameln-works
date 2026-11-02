"""Frozen-source DedicatedWorker/all-query chunk diagnostic; no model HTTP.

Ordinary API inputs contain neither reference tensors nor error gates. The
independent NumPy oracle runs in a killable child process, receives one bounded
native F32 comparison chunk at a time and never returns replacement values.
"""
import argparse
import base64
from collections import deque
import hashlib
import http.server
import importlib.util
import json
import math
import mimetypes
import multiprocessing
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import threading
import time
from types import SimpleNamespace
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'development/ai-connection/d1-d4-production-20261102'
MAX_CHUNK_BYTES = 8388608
STAGES = ['patchHidden', 'textEmbedded', 'timeRaw', 'timeAct1', 'timeProjection', 'postModulated', 'k', 'v', 'q', 'selfAttention', 'oProjection', 'selfResidual', 'crossK', 'crossV', 'crossQ', 'crossAttention', 'crossResidual', 'ffnOutput', 'blockOutput']
SCRIPT = 'tools/diffusion-models/production-chunk-browser.py'
WORKER = 'tools/diffusion-models/production-chunk-browser.mjs'
REFERENCE = 'tools/diffusion-models/production-reference.py'


def load_reference():
    spec = importlib.util.spec_from_file_location('production_independent_chunk_reference', ROOT / REFERENCE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    return json.loads(Path(path).read_bytes())


def committed_sources(commit, contract):
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    require(commit == head and re.fullmatch('[0-9a-f]{40}', commit), 'Execution source must equal current full HEAD')
    build_path = ROOT / 'docs/shared/diffusion-models/api/build-info.mjs'
    text = build_path.read_text()
    entries = json.loads(text.split('BUILD_SOURCES=Object.freeze(', 1)[1].rsplit(');', 1)[0])
    sources = {}
    for relative, expected in entries.items():
        path = (build_path.parent / relative).resolve()
        require(path.is_relative_to(ROOT), 'Build source outside repository')
        raw = path.read_bytes()
        require(sha(raw) == expected, 'Owner build receipt mismatch: ' + str(path.relative_to(ROOT)))
        sources[str(path.relative_to(ROOT))] = raw
    contract = Path(contract).resolve()
    require(contract.is_relative_to(ROOT), 'Pre-execution contract must be a committed repository file')
    for name in [SCRIPT, WORKER, REFERENCE, 'tools/diffusion-models/standalone-reference.py', 'tools/diffusion-models/standalone-sampler-reference.py', str(build_path.relative_to(ROOT)), str(contract.relative_to(ROOT)), 'docs/shared/diffusion-models/diagnostics/resource-observer/observer.mjs']:
        sources[name] = (ROOT / name).read_bytes()
    for name, raw in sources.items():
        fixed = subprocess.check_output(['git', 'show', commit + ':' + name], cwd=ROOT)
        require(fixed == raw, 'Execution source differs from fixed commit: ' + name)
    return sources


def source_receipt(sources):
    entries = {name: {'bytes': len(raw), 'sha256': sha(raw)} for name, raw in sources.items()}
    return {'entries': entries, 'count': len(entries), 'capturedHTTPBytes': sum(len(raw) for raw in sources.values()), 'inventorySHA256': sha(json.dumps(entries, sort_keys=True, separators=(',', ':')).encode())}


class Coverage:
    def __init__(self, manifest, stages, block_limit):
        self.total = manifest['canonicalShape']['concatenation']['totalTokens']
        self.text_rows = manifest['conditioning']['metadata']['shape'][1]
        self.stages, self.block_limit, self.rows, self.count = stages, block_limit, {}, 0

    def extent(self, name):
        return 1 if name in ['timeRaw', 'timeAct1'] else 6 if name == 'timeProjection' else self.text_rows if name in ['textEmbedded', 'crossK', 'crossV'] else self.total

    def check(self, event, *, commit=False):
        name, block = event.get('name'), event.get('block')
        require(name in self.stages, 'Unexpected diagnostic stage')
        prefix = name in ['patchHidden', 'textEmbedded', 'timeRaw', 'timeAct1', 'timeProjection']
        require(block is None if prefix else type(block) is int and 0 <= block <= self.block_limit, 'Unexpected diagnostic block')
        key = (block, name)
        start, count = event.get('globalRowStart'), event.get('rowCount')
        require(type(start) is int and type(count) is int and 1 <= count <= 128 and start == self.rows.get(key, 0) and start + count <= self.extent(name), 'Duplicate, skipped, noncontiguous or out-of-range diagnostic chunk')
        if commit:
            self.rows[key] = start + count
            self.count += 1

    def summary(self):
        expected = [(None, name) for name in self.stages if name in ['patchHidden', 'textEmbedded', 'timeRaw', 'timeAct1', 'timeProjection']]
        expected += [(block, name) for block in range(self.block_limit + 1) for name in self.stages if name not in ['patchHidden', 'textEmbedded', 'timeRaw', 'timeAct1', 'timeProjection']]
        rows = [{'block': block, 'name': name, 'completedRows': self.rows.get((block, name), 0), 'requiredRows': self.extent(name)} for block, name in expected]
        return {'complete': all(row['completedRows'] == row['requiredRows'] for row in rows), 'chunks': self.count, 'rows': rows, 'allQueriesKeysHeads': 'numerical acceptance requires every selected stage complete plus independent comparisons passing'}


def oracle_child(connection, manifest, model, side, directory):
    owner = None
    try:
        reference = load_reference()
        owner = reference.ChunkOracle(manifest, model, side, directory, allow_model_work=True)
        connection.send({'kind': 'ready', 'numpy': reference.np.__version__})
        while True:
            message = connection.recv()
            if message['kind'] == 'compare':
                connection.send({'kind': 'started', 'name': message['event']['name'], 'block': message['event'].get('block'), 'rowStart': message['event']['globalRowStart'], 'rowCount': message['event']['rowCount']})
                result = owner.compare(message['event'], message['raw'])
                connection.send({'kind': 'comparison', 'value': result})
            elif message['kind'] == 'close':
                before = owner.stats()
                owner.close()
                connection.send({'kind': 'closed', 'beforeClose': before, 'afterClose': owner.stats()})
                return
            else:
                raise ValueError('Unknown oracle control message')
    except BaseException as error:
        try:
            connection.send({'kind': 'error', 'error': {'name': type(error).__name__, 'message': str(error)[:3000]}})
        except (EOFError, BrokenPipeError):
            pass
    finally:
        if owner is not None:
            owner.close()
        connection.close()


class OracleProcess:
    def __init__(self, manifest, model, side, directory):
        context = multiprocessing.get_context('spawn')
        self.connection, child = context.Pipe()
        self.process = context.Process(target=oracle_child, args=(child, str(manifest), str(model), side, str(directory)), daemon=True)
        self.directory = Path(directory)
        self.lock, self.closed = threading.Lock(), False
        self.last_started, self.stats = None, None
        try:
            self.process.start()
            child.close()
            require(self.connection.poll(30), 'Independent oracle startup timed out')
            initial = self.connection.recv()
            require(initial['kind'] == 'ready', 'Independent oracle startup failed: ' + json.dumps(initial))
            self.initial = initial
        except BaseException as error:
            child.close()
            error.oracle_cleanup = self.close(graceful=False)
            raise

    def compare(self, event, raw):
        with self.lock:
            require(not self.closed, 'Independent oracle is closed')
            self.connection.send({'kind': 'compare', 'event': event, 'raw': raw})
            while True:
                message = self.connection.recv()
                if message['kind'] == 'started':
                    self.last_started = message
                elif message['kind'] == 'comparison':
                    self.last_started = None
                    return message['value']
                else:
                    raise RuntimeError('Independent oracle failed: ' + json.dumps(message))

    def close(self, graceful):
        if self.closed:
            return self.stats
        cleanup_errors = []
        if graceful:
            try:
                with self.lock:
                    self.connection.send({'kind': 'close'})
                    require(self.connection.poll(30), 'Independent oracle close timed out')
                    self.stats = self.connection.recv()
                    require(self.stats.get('kind') == 'closed', 'Independent oracle close rejected')
            except BaseException as error:
                cleanup_errors.append({'phase': 'graceful-close', 'name': type(error).__name__, 'message': str(error)[:2000]})
        self.closed = True
        terminated = False
        try:
            if self.process.pid is not None:
                self.process.join(timeout=2)
                terminated = self.process.is_alive()
                if terminated:
                    self.process.terminate()
                    self.process.join(timeout=5)
                if self.process.is_alive():
                    self.process.kill()
                    self.process.join(timeout=5)
        except BaseException as error:
            cleanup_errors.append({'phase': 'join-terminate', 'name': type(error).__name__, 'message': str(error)[:2000]})
        try:
            self.connection.close()
        except BaseException as error:
            cleanup_errors.append({'phase': 'pipe-close', 'name': type(error).__name__, 'message': str(error)[:2000]})
        removed = []
        for name in ['reference-x.f32', 'reference-k.f32', 'reference-v.f32']:
            path = self.directory / name
            try:
                if path.exists():
                    path.unlink()
                    removed.append(name)
            except BaseException as error:
                cleanup_errors.append({'phase': 'backing-unlink', 'path': str(path), 'name': type(error).__name__, 'message': str(error)[:2000]})
        self.stats = {'oracle': self.stats, 'childExitCode': self.process.exitcode, 'childStillAlive': self.process.is_alive(), 'terminated': terminated, 'backingFilesRemoved': removed, 'backingFilesRemaining': [name for name in ['reference-x.f32', 'reference-k.f32', 'reference-v.f32'] if (self.directory / name).exists()], 'cleanupErrors': cleanup_errors}
        return self.stats


def input_config(manifest, side, block_limit, run_id):
    whitelist = {}

    def entry(path, count, digest):
        path = Path(path)
        raw_hash = hashlib.sha256()
        with path.open('rb') as stream:
            for data in iter(lambda: stream.read(1048576), b''):
                raw_hash.update(data)
        require(path.stat().st_size == count and raw_hash.hexdigest() == digest, 'Declared input bytes/hash mismatch')
        url = '/inputs/' + str(len(whitelist))
        whitelist[url] = {'path': path, 'bytes': count, 'sha256': digest}
        return {'url': url, 'bytes': count, 'sha256': digest}

    tensors = []
    for tensor in manifest['tensors']:
        item = {key: tensor[key] for key in ['requirementId', 'dtype', 'layout', 'shape', 'meaning', 'normalization']}
        item.update(entry(tensor['path'], tensor['bytes'], tensor['sha256']))
        tensors.append(item)
    text = manifest['conditioning']
    conditioning = {'metadata': text['metadata'], 'payload': entry(text['payloadPath'], 512 * 4096 * 4, text['payloadSHA256']), 'mask': entry(text['maskPath'], 512, text['maskSHA256'])}
    return {'runId': run_id, 'shapeRequest': manifest['shapeRequest'], 'side': side, 'timestep': manifest['timestep'], 'totalTokens': manifest['canonicalShape']['concatenation']['totalTokens'], 'tensors': tensors, 'conditioning': conditioning, 'stages': STAGES, 'blockLimit': block_limit}, whitelist


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--contract', type=Path)
    parser.add_argument('--model-dir', type=Path, default=ROOT.parent / 'retained/bernini')
    parser.add_argument('--side', choices=['HIGH', 'LOW'], default='HIGH')
    parser.add_argument('--source-commit')
    parser.add_argument('--private-reference-dir', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--block-limit', type=int, choices=range(40), default=0)
    parser.add_argument('--diagnostic-timeout-seconds', type=float, default=3600)
    parser.add_argument('--validate-only', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        mock = {'canonicalShape': {'concatenation': {'totalTokens': 9}}, 'conditioning': {'metadata': {'shape': [1, 512, 4096]}}}
        coverage = Coverage(mock, ['k'], 0)
        event = {'name': 'k', 'block': 0, 'globalRowStart': 0, 'rowCount': 4}
        coverage.check(event, commit=True)
        try:
            coverage.check(event)
            raise AssertionError('Duplicate chunk accepted')
        except ValueError:
            pass
        coverage.check({**event, 'globalRowStart': 4, 'rowCount': 5}, commit=True)
        assert coverage.summary()['complete']
        with tempfile.TemporaryDirectory(prefix='production-chunk-cleanup-test-') as directory:
            owner = object.__new__(OracleProcess)
            owner.closed, owner.stats, owner.directory, owner.lock = False, None, Path(directory), threading.Lock()
            def broken_send(_value):
                raise BrokenPipeError('injected close-control failure')
            owner.connection = SimpleNamespace(send=broken_send, close=lambda: None)
            owner.process = SimpleNamespace(pid=123, exitcode=0, join=lambda timeout: None, is_alive=lambda: False)
            cleanup = owner.close(graceful=True)
            assert cleanup['cleanupErrors'][0]['phase'] == 'graceful-close' and not cleanup['childStillAlive'] and owner.close(graceful=True) is cleanup
        print(json.dumps({'passed': True, 'coverageRejectsDuplicates': True, 'completeTailRequired': True, 'closedOraclePipeReportedWithoutSkippingCleanup': True, 'idempotentOracleClose': True, 'modelWorkExecuted': False}))
        return
    require(all(getattr(args, name) is not None for name in ['manifest', 'contract', 'source_commit', 'private_reference_dir', 'output']), 'Manifest, contract, source commit, private reference directory and output required')
    require(args.diagnostic_timeout_seconds > 0, 'Positive operational watchdog required')
    require(not args.output.exists(), 'Existing diagnostic receipt must not be overwritten')
    reference = load_reference()
    manifest = read_json(args.manifest)
    require(read_json(args.contract) == reference.reference_contract(args.manifest), 'Fixed pre-execution input/gate/source contract mismatch')
    sources = committed_sources(args.source_commit, args.contract)
    captured = source_receipt(sources)
    model = args.model_dir / reference.REF.MODELS[args.side][0]
    require(model.stat().st_size == reference.REF.MODEL_BYTES, 'Pinned local model byte length mismatch')
    run_id = secrets.token_hex(24)
    config, inputs = input_config(manifest, args.side, args.block_limit, run_id)
    config['wasmModules'] = [{'role': name, 'sha256': sha(raw)} for name, raw in sources.items() if name.endswith('.wasm')]
    if args.validate_only:
        print(json.dumps({'passed': True, 'sourceCommit': args.source_commit, 'sources': captured['count'], 'inputFiles': len(inputs), 'totalTokens': config['totalTokens'], 'modelWorkExecuted': False}))
        return
    private_dir = reference.private_directory(args.private_reference_dir)
    require(not any(private_dir.iterdir()), 'Fresh empty private reference directory required')
    coverage, comparison_lock = Coverage(manifest, STAGES, args.block_limit), threading.Lock()
    metrics = {'chunks': 0, 'bytes': 0, 'failedElements': 0, 'maxAbsolute': 0.0, 'maxNormalizedToGate': 0.0, 'compareSeconds': 0.0, 'byStage': {}}
    last_events, requests, browser_errors = deque(maxlen=160), {}, []
    failures, worker_result, source_after, cleanup = [], None, None, None
    started = time.monotonic()
    try:
        oracle = OracleProcess(args.manifest, model, args.side, private_dir)
    except BaseException as error:
        failure = {'schemaVersion': 'bernini-production-chunk-browser/1', 'passed': False, 'sourceCommit': args.source_commit, 'sourceBefore': captured, 'sourceAfter': None, 'manifestSHA256': reference.file_sha(args.manifest), 'contractSHA256': reference.file_sha(args.contract), 'side': args.side, 'targetShape': manifest['tensors'][0]['shape'], 'totalTokens': config['totalTokens'], 'blockLimit': args.block_limit, 'coverage': coverage.summary(), 'failures': [{'stage': 'independent-oracle-startup', 'name': type(error).__name__, 'message': str(error)[:4000]}], 'oracleCleanup': getattr(error, 'oracle_cleanup', None), 'elapsedSeconds': time.monotonic() - started, 'browserConstructed': False, 'rawIntermediateArraysSaved': False, 'modelBytesServedOverHTTP': 0, 'generationReady': False, 'unknownObservationScope': ['No native model stage executed; see startup cleanup result']}
        reference.write_json(args.output, failure, exclusive=True)
        print(json.dumps({'passed': False, 'stage': 'independent-oracle-startup', 'output': str(args.output), 'modelWorkExecuted': False}))
        return

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def send(self, status, raw, kind='application/json'):
            self.send_response(status)
            for key, value in [('Cross-Origin-Opener-Policy', 'same-origin'), ('Cross-Origin-Embedder-Policy', 'require-corp'), ('Cross-Origin-Resource-Policy', 'same-origin'), ('Cache-Control', 'no-store'), ('Content-Type', kind), ('Content-Length', str(len(raw)))]:
                self.send_header(key, value)
            self.end_headers()
            try:
                self.wfile.write(raw)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_GET(self):
            path = unquote(urlsplit(self.path).path)
            requests[path] = requests.get(path, 0) + 1
            if path == '/':
                self.send(200, b'<!doctype html><meta charset=utf-8><input type=file id=model>', 'text/html')
            elif path in inputs:
                self.send(200, inputs[path]['path'].read_bytes(), 'application/octet-stream')
            elif path.lstrip('/') in sources:
                name = path.lstrip('/')
                kind = 'application/javascript' if name.endswith(('.mjs', '.js')) else 'application/wasm' if name.endswith('.wasm') else mimetypes.guess_type(name)[0] or 'application/octet-stream'
                self.send(200, sources[name], kind)
            else:
                self.send(404, b'{"error":"not in captured source or declared input whitelist"}')

        def do_POST(self):
            try:
                require(self.path == '/compare' and self.headers.get('X-Run-ID') == run_id, 'Unknown comparison route/run')
                length = int(self.headers.get('Content-Length', '0'))
                encoded = self.headers.get('X-Chunk-Metadata', '')
                require(0 < length <= MAX_CHUNK_BYTES and len(encoded) <= 65536, 'Bounded binary body/metadata required')
                event = json.loads(base64.b64decode(encoded, validate=True))
                require(event.get('dtype') == 'float32' and type(event.get('columns')) is int and type(event.get('rowCount')) is int and length == event['columns'] * event['rowCount'] * 4, 'Exact binary32 declared chunk required')
                raw = self.rfile.read(length)
                require(len(raw) == length, 'Truncated native comparison body')
                with comparison_lock:
                    coverage.check(event)
                    result = oracle.compare(event, raw)
                    coverage.check(event, commit=True)
                    metrics['chunks'] += 1
                    metrics['bytes'] += len(raw)
                    metrics['failedElements'] += result['failed']
                    metrics['maxAbsolute'] = max(metrics['maxAbsolute'], result['maxAbsolute'])
                    metrics['maxNormalizedToGate'] = max(metrics['maxNormalizedToGate'], result['maxNormalizedToGate'])
                    metrics['compareSeconds'] += result['elapsedSeconds']
                    key = str(event.get('block')) + ':' + event['name']
                    row = metrics['byStage'].setdefault(key, {'elements': 0, 'failed': 0, 'maxAbsolute': 0.0, 'maxNormalizedToGate': 0.0})
                    row['elements'] += result['elements']
                    row['failed'] += result['failed']
                    row['maxAbsolute'] = max(row['maxAbsolute'], result['maxAbsolute'])
                    row['maxNormalizedToGate'] = max(row['maxNormalizedToGate'], result['maxNormalizedToGate'])
                self.send(200, json.dumps(result, allow_nan=False).encode())
            except BaseException as error:
                failure = {'name': type(error).__name__, 'message': str(error)[:3000], 'stage': locals().get('event'), 'elapsedSeconds': time.monotonic() - started}
                failures.append(failure)
                self.send(422, json.dumps({'error': failure['message'], 'code': 'INDEPENDENT_COMPARE_REJECTED'}).encode())

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
            try:
                page = browser.new_page()
                page.set_default_timeout(30000)
                page.on('pageerror', lambda error: browser_errors.append(str(error)))
                page.goto('http://127.0.0.1:' + str(server.server_port) + '/')
                page.locator('#model').set_input_files(str(model))
                page.evaluate("""config=>{globalThis.__diagnostic={done:false,last:null,result:null,error:null,events:[]};const w=globalThis.__diagnosticWorker=new Worker('/tools/diffusion-models/production-chunk-browser.mjs',{type:'module'});w.onmessage=({data})=>{const s=globalThis.__diagnostic;s.last=data;if(data.type==='result'){s.result=data.value;s.done=true;}else if(data.type==='fatal'){s.error=data.value;s.done=true;}else{if(data.type==='progress'||data.type==='phase')s.events.push(data);if(s.events.length>160)s.events.shift();}};w.onerror=e=>{globalThis.__diagnostic.error={name:'WorkerError',message:e.message};globalThis.__diagnostic.done=true;};w.postMessage({kind:'run',file:document.querySelector('#model').files[0],config});}""", config)
                deadline, next_report = started + args.diagnostic_timeout_seconds, 0
                while True:
                    state = page.evaluate('()=>globalThis.__diagnostic')
                    if state['done']:
                        worker_result = state['result']
                        if state['error']:
                            failures.append({'stage': 'DedicatedWorker', 'error': state['error']})
                        last_events.extend(state['events'])
                        break
                    now = time.monotonic()
                    if now >= next_report:
                        status = {'elapsedSeconds': now - started, 'last': state['last'], 'oracleActive': oracle.last_started, 'comparedChunks': metrics['chunks'], 'comparedBytes': metrics['bytes']}
                        print(json.dumps(status, allow_nan=False), flush=True)
                        last_events.append(status)
                        next_report = now + 5
                    if now >= deadline:
                        failures.append({'name': 'DiagnosticWatchdog', 'message': 'Operational timeout; not a numerical/resource acceptance gate', 'last': state['last'], 'oracleActive': oracle.last_started, 'elapsedSeconds': now - started})
                        page.evaluate("()=>globalThis.__diagnosticWorker.postMessage({kind:'cancel'})")
                        for _ in range(30):
                            page.wait_for_timeout(1000)
                            state = page.evaluate('()=>globalThis.__diagnostic')
                            if state['done']:
                                worker_result = state['result']
                                break
                        break
                    page.wait_for_timeout(1000)
                page.evaluate('()=>globalThis.__diagnosticWorker.terminate()')
            finally:
                browser.close()
        source_after = source_receipt(committed_sources(args.source_commit, args.contract))
        require(source_after == captured, 'Fixed source changed during execution')
    except BaseException as error:
        failures.append({'name': type(error).__name__, 'message': str(error)[:4000], 'elapsedSeconds': time.monotonic() - started})
    finally:
        success = bool(worker_result and worker_result['completed'] and coverage.summary()['complete'] and metrics['failedElements'] == 0 and not failures and not browser_errors)
        cleanup = oracle.close(graceful=success)
        server.shutdown()
        server.server_close()
        if cleanup['cleanupErrors'] or cleanup['backingFilesRemaining'] or cleanup['childStillAlive']:
            success = False
    result = {'schemaVersion': 'bernini-production-chunk-browser/1', 'passed': success, 'sourceCommit': args.source_commit, 'sourceBefore': captured, 'sourceAfter': source_after, 'manifestSHA256': reference.file_sha(args.manifest), 'contractSHA256': reference.file_sha(args.contract), 'side': args.side, 'targetShape': manifest['tensors'][0]['shape'], 'totalTokens': config['totalTokens'], 'blockLimit': args.block_limit, 'scope': 'all declared query/key/head rows through selected complete block boundaries only; no final head or complete predict/sample', 'gate': reference.GATE, 'coverage': coverage.summary(), 'comparison': metrics, 'worker': worker_result, 'failures': failures, 'browserErrors': browser_errors, 'lastEvents': list(last_events), 'requests': requests, 'oracleCleanup': cleanup, 'elapsedSeconds': time.monotonic() - started, 'rawIntermediateArraysSaved': False, 'modelBytesServedOverHTTP': 0, 'normalAPIRequiresGateOrReference': False, 'generationReady': False, 'unknownObservationScope': ['native/internal ORT staging/allocator peaks not directly observable', 'reference IPC adds bounded binary copies and is included only by outer process monitor', 'whole-process RSS/PSS sampling is supplied by outer resource wrapper']}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
        stream.write('\n')
    print(json.dumps({'passed': success, 'output': str(args.output), 'comparedChunks': metrics['chunks'], 'failedElements': metrics['failedElements'], 'coverageComplete': coverage.summary()['complete'], 'elapsedSeconds': result['elapsedSeconds']}))


if __name__ == '__main__':
    main()
