#!/usr/bin/env python3
"""Prepare or explicitly execute a target-storage / largest native FFN tile diagnostic.

prepare/self-test allocate no target stores and read no model payload. Heavy
reference/native commands require committed sources and exclusive NN access.
"""
import argparse
from array import array
from contextlib import contextmanager
import fcntl
import hashlib
import http.server
import json
import math
import os
from pathlib import Path
import resource
import stat
import subprocess
import sys
import threading
import time
import types

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CONTRACT = HERE / 'contract.json'
MODELS = ROOT.parent / 'retained/bernini'
MODEL_NAME = 'Bernini_LOW_fp8_e4m3fn_scaled.safetensors'
CORE = ROOT / 'development/ai-connection/profile-adoption/p4/core-source/comfy/ldm/wan/model.py'
MODEL_SHA = 'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3'
HEADER_SHA = '286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b'
CORE_SHA = '17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699'


def require(value, message):
    if not value:
        raise RuntimeError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read_contract():
    raw = CONTRACT.read_bytes()
    value = json.loads(raw)
    require(value['profileId'] == 'bernini-target65520-four-stores-ffn-down128-capacity-diagnostic-v1', 'Fixed profile required')
    require(value['gate'] == {'absolute': .001, 'relative': .0001, 'rule': 'Every655360 biased projection output finite and abs(actual-reference)<=absolute+relative*abs(reference)'}, 'Fixed all-value pre-execution gate required')
    require(value['plan']['components']['fourHostStores'] == 5367398400 and value['plan']['components']['ffnStageCache'] == 566231040, 'Exact target/cache capacity required')
    return value, sha(raw)


def source_evidence(spec, commit=None, strict=True):
    current = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if commit is not None:
        require(len(commit) == 40 and all(c in '0123456789abcdef' for c in commit) and current == commit, 'Exact source commit must equal HEAD')
    snapshots, frozen = {}, True
    for name in spec['sourcePaths']:
        raw = (ROOT / name).read_bytes()
        committed = subprocess.run(['git', 'show', current + ':' + name], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        frozen = frozen and committed.returncode == 0 and committed.stdout == raw
        snapshots[name] = raw
    require(not strict or frozen, 'Commit all prepared source bytes before numerical execution')
    return {'sourceCommit': current, 'sourceSHA256': {key: sha(raw) for key, raw in snapshots.items()}, 'allSourcesAtHead': frozen}, snapshots


def private_dir(value, create=True):
    path = Path(value).resolve()
    require(path.is_relative_to(Path('/tmp')) and len(path.relative_to('/tmp').parts) >= 1, 'Dedicated private /tmp subdirectory required')
    if create:
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(path.is_dir() and path.stat().st_uid == os.getuid() and stat.S_IMODE(path.stat().st_mode) == 0o700, 'Owned mode0700 private directory required')
    for parent in [path, *path.parents]:
        marker = parent / '.git'
        require(not (marker.is_file() or marker.is_dir() and (marker / 'HEAD').exists()), 'Private values cannot be inside a Git checkout')
    return path


def write_json(path, value, private=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600 if private else 0o644)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(value, output, indent=2, allow_nan=False)
        output.write('\n')


def model_stat(path):
    result = path.stat()
    return {key: getattr(result, key) for key in ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')}


def memory_snapshot():
    result = {}
    for name in ('memory.current', 'memory.max', 'memory.peak'):
        value = Path('/sys/fs/cgroup', name).read_text().strip()
        result[name] = int(value) if value.isdigit() else value
    values = dict(line.split() for line in Path('/sys/fs/cgroup/memory.stat').read_text().splitlines())
    result['stat'] = {name: int(values.get(name, 0)) for name in ('anon', 'file', 'file_dirty', 'file_writeback', 'shmem', 'active_file', 'inactive_file')}
    result['scope'] = 'Shared cgroup; file cache is not an immediately-free guarantee; memory.peak is historical, not this run peak'
    return result


def active_other_nn():
    found = []
    owners = {'model-candidate-browser.py', 'model-sampler-browser.py', 'standalone-reference.py', 'standalone-sampler-reference.py'}
    for path in Path('/proc').glob('[0-9]*/cmdline'):
        try:
            fields = path.read_bytes().split(b'\0')
            if len(fields) < 2 or not Path(os.fsdecode(fields[0])).name.startswith('python') or int(path.parent.name) == os.getpid():
                continue
            script = Path(os.fsdecode(fields[1])).name
            own_probe = Path(os.fsdecode(fields[1])).resolve() == Path(__file__).resolve() and (b'reference' in fields or b'native' in fields)
            if own_probe or script in owners and (not script.startswith('standalone-') or b'run' in fields):
                found.append({'pid': int(path.parent.name), 'script': script})
        except OSError:
            continue
    return found


@contextmanager
def phase_lock():
    """Mutually exclude this diagnostic's reference/native owners, without cache changes."""
    descriptor = os.open('/tmp/bernini-target-capacity.phase.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        require(os.fstat(descriptor).st_uid == os.getuid(), 'Owned capacity phase-lock file required')
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError('Another target-capacity numerical phase owns the exclusive lock') from error
        yield
    finally:
        os.close(descriptor)


def preflight(spec, *, exclusive=False):
    memory = memory_snapshot()
    others = active_other_nn()
    if exclusive:
        require(not others, 'Other actual model NN/reference process active; use sequential execution after it exits')
        limit = memory['memory.max']
        require(isinstance(limit, int) and limit >= 16 * 1073741824, 'This prepared resource configuration requires at least16GiB cgroup limit')
        require(spec['plan']['withSafety'] + memory['stat']['anon'] < limit, 'Named reservations plus safety and current anon exceed cgroup limit')
    return {'memoryBefore': memory, 'otherNNProcesses': others, 'exclusiveNNGateRequiredForHeavy': True,
            'planningOnly': True, 'largestHostArrayBytes': spec['plan']['hostStoreBytes'], 'hostArrayExclusive2GiBBound': 2147483648,
            'namedSpansAndUnverifiedReservations': spec['plan']['namedPlusRuntimeReservations'], 'extraSafetyBytes': spec['plan']['reservations']['safety'],
            'noCachesDropped': True, 'doesNotProveAllocationWillSucceed': True}


def input_row(row):
    result = array('f', (((row * 7 + column * 3) % 23 - 11) / 32 for column in range(13824)))
    if sys.byteorder != 'little':
        result.byteswap()
    return result


def input_sha():
    result = hashlib.sha256()
    for row in range(128):
        result.update(input_row(row))
    return result.hexdigest()


def self_test(spec):
    require(input_sha() == spec['input']['sha256'], 'Exact bounded-row controlled input hash mismatch')
    require(spec['plan']['hostStoreBytes'] == 1341849600 and spec['plan']['hostStoreBytes'] < 2147483648, 'Actual per-array bound mismatch')
    require(spec['plan']['namedPlusRuntimeReservations'] <= 8 * 1073741824, 'Named plus runtime-reservation plan exceeds8GiB')
    counts = [(0, 5120), (5120, 5120), (10240, 3584)]
    require(sum(count for _, count in counts) == 13824, 'Exact FFN-up output partition')
    require(sum(count * 5120 * 4 for _, count in counts) + 5120 * 13824 * 4 == 566231040, 'Actual cache bytes')
    plan = subprocess.check_output(['node', '--input-type=module', '-e', "const m=await import('./plan.mjs');process.stdout.write(JSON.stringify(m.capacityPlan()));"], cwd=HERE)
    require(json.loads(plan) == spec['plan'], 'Canonical source shape/budget plan changed')
    return {'passed': True, 'checks': 6, 'inputSHA256': input_sha(), 'maximumInputGeneratorChunkBytes': 13824 * 4,
            'modelPayloadRead': False, 'targetArraysAllocated': False, 'nativeOrReferenceMatMulExecuted': False}


def load_reference_module(raw):
    path = ROOT / 'tools/diffusion-models/standalone-reference.py'
    module = types.ModuleType('independent_full40_reference')
    module.__file__ = str(path)
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    return module


def reference(args, spec, contract_sha):
    before_sources, snapshots = source_evidence(spec, args.source_commit)
    admission = preflight(spec, exclusive=True)
    directory = private_dir(args.private_dir)
    output_path = directory / 'ffn-down-biased.f32'
    require(not output_path.exists(), 'New private reference path required')
    require(sha(args.core.read_bytes()) == CORE_SHA, 'Pinned actual core source required')
    own = load_reference_module(snapshots['tools/diffusion-models/standalone-reference.py'])
    np = own.np
    # Independent generator; never imports the JS probe or a native output.
    rows = np.arange(128, dtype=np.int32)[:, None]
    columns = np.arange(13824, dtype=np.int32)[None, :]
    values = np.ascontiguousarray(((rows * 7 + columns * 3) % 23 - 11).astype(np.float32) / np.float32(32), dtype='<f4')
    require(sha(memoryview(values)) == spec['input']['sha256'], 'Independent full input identity mismatch')
    before_model = model_stat(args.model)
    began = time.perf_counter()
    parameters = own.Parameters(args.model, 'LOW', tile_rows=128)
    try:
        output = parameters.linear('blocks.0.ffn.2', values)
        source = {'readCalls': parameters.read_calls, 'readBytes': parameters.total_read, 'maxPayloadReadBytes': parameters.max_payload_read, 'targets': parameters.sources}
    finally:
        parameters.close()
    require(output.shape == (128, 5120) and np.isfinite(output).all(), 'Complete independent biased projection required')
    raw = output.astype('<f4', copy=False).tobytes()
    descriptor = os.open(output_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(raw)
    after_sources, _ = source_evidence(spec, args.source_commit)
    require(before_sources == after_sources and before_model == model_stat(args.model) and sha(args.core.read_bytes()) == CORE_SHA, 'Source/model/core changed during reference')
    report = {'schemaVersion': 'bernini-target-capacity-reference/0.1', 'profileId': spec['profileId'], **before_sources,
              'contractSHA256': contract_sha, 'inputSHA256': spec['input']['sha256'], 'outputSHA256': sha(raw), 'outputBytes': len(raw), 'outputShape': [128, 5120], 'outputDtype': 'F32LE',
              'arithmetic': 'Existing independent Parameters.linear: original F16/scaledE4M3FN decode toF32; full-inner F64 dot ->F32 ->separateF32bias',
              'gate': spec['gate'], 'source': source, 'model': spec['model'], 'modelStatBefore': before_model, 'modelStatAfter': model_stat(args.model),
              'elapsedSeconds': time.perf_counter() - began, 'referenceProcessPeakRSSBytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024,
              'admission': admission, 'scope': spec['scope'], 'targetStoresAllocatedInReference': False}
    write_json(Path(args.meta), report)
    print(json.dumps({'referenceComplete': True, 'outputBytes': len(raw), 'outputSHA256': report['outputSHA256'], 'meta': args.meta}), flush=True)


def native(args, spec, contract_sha):
    before_sources, snapshots = source_evidence(spec, args.source_commit)
    admission = preflight(spec, exclusive=True)
    directory = private_dir(args.private_dir, create=False)
    reference_raw = (directory / 'ffn-down-biased.f32').read_bytes()
    reference_meta_raw = Path(args.meta).read_bytes()
    reference_meta = json.loads(reference_meta_raw)
    require(reference_meta['sourceCommit'] == args.source_commit and reference_meta['sourceSHA256'] == before_sources['sourceSHA256'], 'Reference and native require exactly the same frozen sources')
    require(reference_meta['contractSHA256'] == contract_sha and reference_meta['inputSHA256'] == spec['input']['sha256'] and reference_meta['gate'] == spec['gate'] and reference_meta['model'] == spec['model'], 'Exact independent input/gate/model contract required')
    require(len(reference_raw) == 2621440 and sha(reference_raw) == reference_meta['outputSHA256'], 'Complete private reference payload hash required')
    require(sha(args.core.read_bytes()) == CORE_SHA, 'Pinned actual core source required')
    before_model = model_stat(args.model)
    report_path = Path(args.report)
    require(not report_path.exists(), 'New public report path required')
    progress_path = report_path.with_name(report_path.name + '.progress.jsonl')
    progress = progress_path.open('x')
    checkpoints = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            name = self.path.split('?', 1)[0]
            if name == '/':
                raw, mime = b'<!doctype html><input id="model" type="file">', 'text/html'
            elif name == '/__reference__.f32':
                raw, mime = reference_raw, 'application/octet-stream'
            elif name.startswith('/') and name[1:] in snapshots and Path(name).suffix in ('.mjs', '.js', '.wasm', '.json'):
                raw = snapshots[name[1:]]
                mime = 'application/wasm' if name.endswith('.wasm') else 'application/json' if name.endswith('.json') else 'text/javascript'
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(raw)

        def log_message(self, *_args):
            pass

    def checkpoint(_source, value):
        checkpoints.append(value)
        progress.write(json.dumps(value, separators=(',', ':'), allow_nan=False) + '\n')
        progress.flush()
        print(json.dumps({key: value.get(key) for key in ('stage', 'elapsedMs', 'storeIndex')}), flush=True)

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    began = time.perf_counter()
    result, browser_closed = None, False
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=args.chromium, headless=True, args=['--disable-dev-shm-usage'])
            try:
                page = browser.new_page()
                page.expose_binding('capacityCheckpoint', checkpoint)
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                page.locator('#model').set_input_files(str(args.model))
                result = page.evaluate('''async options=>{
                    const {installWasmMemoryObserver}=await import('/docs/shared/diffusion-models/execution/wasm-memory-observer.mjs');
                    const observer=installWasmMemoryObserver();
                    try {
                        const {runTargetCapacity}=await import('/development/ai-connection/standalone-d1-d4-20261102/target-capacity/browser-cases.mjs');
                        const bytes=await (await fetch('/__reference__.f32')).arrayBuffer();
                        return await runTargetCapacity({...options,file:document.querySelector('#model').files[0],referenceBytes:bytes,memoryObserver:observer,checkpoint:window.capacityCheckpoint});
                    } finally {observer.unhook();}
                }''', {'contract': spec, 'referenceMeta': reference_meta, 'timeoutMs': args.timeout_seconds * 1000, 'cancelAfterStage': args.cancel_after_stage})
                result['chromiumVersion'] = browser.version
            finally:
                browser.close()
                browser_closed = True
    except Exception as error:
        result = {'schemaVersion': 'bernini-target-capacity-result/0.1', 'outcome': 'browser-failed', 'passed': False, 'error': {'name': type(error).__name__, 'message': str(error)[:1000]}, 'events': checkpoints,
                  'scope': spec['scope'], 'cleanupKnown': False}
    finally:
        server.shutdown()
        server.server_close()
        progress.close()
    after_sources, _ = source_evidence(spec, args.source_commit)
    require(before_sources == after_sources and before_model == model_stat(args.model) and sha(args.core.read_bytes()) == CORE_SHA, 'Frozen source/model/core changed during native probe')
    require(sha(Path(args.meta).read_bytes()) == sha(reference_meta_raw) and sha((directory / 'ffn-down-biased.f32').read_bytes()) == sha(reference_raw), 'Private reference or identity receipt changed during native probe')
    report = {**before_sources, 'contractSHA256': contract_sha, 'referenceOutputSHA256': sha(reference_raw), 'referenceMetaSHA256': sha(reference_meta_raw), 'sourcesServedFromVerifiedSnapshot': True,
              'modelStatBefore': before_model, 'modelStatAfter': model_stat(args.model), 'model': spec['model'], 'fullModelFileHashRecomputed': False, 'modelFileServedByHttp': False,
              'admission': admission, 'memoryAfterBrowserClose': memory_snapshot(), 'browserClosed': browser_closed, 'hostElapsedSeconds': time.perf_counter() - began, **result}
    write_json(report_path, report)
    print(json.dumps({'outcome': result['outcome'], 'passed': result['passed'], 'report': str(report_path), 'browserClosed': browser_closed}), flush=True)
    if not result['passed'] and result['outcome'] != 'cancelled':
        raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('prepare', help='Source/budget metadata only; never allocate target stores or read model payload')
    sub.add_parser('self-test', help='Bounded55KiB-row generator and canonical plan checks only')
    for command in ('reference', 'native'):
        child = sub.add_parser(command, help='Explicit exclusive numerical phase; requires committed sources')
        child.add_argument('--source-commit', required=True)
        child.add_argument('--private-dir', required=True)
        child.add_argument('--meta', required=True)
        child.add_argument('--models', type=Path, default=MODELS, help='Recipient-owned directory containing the original LOW file')
        child.add_argument('--model', type=Path, help='Optional exact LOW file path, overriding --models')
        child.add_argument('--core', type=Path, default=CORE)
        if command == 'native':
            child.add_argument('--report', required=True)
            child.add_argument('--chromium', default='/usr/bin/chromium')
            child.add_argument('--timeout-seconds', type=float, default=600)
            child.add_argument('--cancel-after-stage', choices=['host-stores-ready', 'weights-ready', 'before-linear'])
    args = parser.parse_args()
    if args.command in ('reference', 'native'):
        args.model = (args.model if args.model is not None else args.models / MODEL_NAME).resolve()
        args.core = args.core.resolve()
    spec, contract_sha = read_contract()
    if args.command == 'prepare':
        source, _ = source_evidence(spec, strict=False)
        print(json.dumps({'contractSHA256': contract_sha, **source, 'admission': preflight(spec), 'heavyExecutionStarted': False}, indent=2))
    elif args.command == 'self-test':
        print(json.dumps(self_test(spec)))
    elif args.command == 'reference':
        with phase_lock():
            reference(args, spec, contract_sha)
    else:
        require(math.isfinite(args.timeout_seconds) and args.timeout_seconds > 0, 'Positive finite timeout required')
        with phase_lock():
            native(args, spec, contract_sha)


if __name__ == '__main__':
    main()
