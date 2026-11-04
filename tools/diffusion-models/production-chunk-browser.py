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
PREFIX_STAGES = ['patchHidden', 'textEmbedded', 'timeRaw', 'timeAct1', 'timeProjection']
HEAD_STAGES = ['headAll', 'prediction']
SCRIPT = 'tools/diffusion-models/production-chunk-browser.py'
WORKER = 'tools/diffusion-models/production-chunk-browser.mjs'
REFERENCE = 'tools/diffusion-models/production-reference.py'
SAMPLE_PY = 'tools/diffusion-models/production-sample-chunks.py'
SAMPLE_JS = 'tools/diffusion-models/production-sample-chunks.mjs'
LATENT_FORMATS = 'development/ai-connection/profile-adoption/p4/core-source/comfy/latent_formats.py'
LATENT_FORMATS_PROVENANCE = 'development/ai-connection/profile-adoption/p4/core-source/comfy/latent_formats.provenance.json'


def load_reference():
    spec = importlib.util.spec_from_file_location('production_independent_chunk_reference', ROOT / REFERENCE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_sample_helpers():
    spec = importlib.util.spec_from_file_location('production_independent_sampler_chunks', ROOT / SAMPLE_PY)
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
    for name in [SCRIPT, WORKER, REFERENCE, SAMPLE_PY, SAMPLE_JS, LATENT_FORMATS, LATENT_FORMATS_PROVENANCE, 'tools/diffusion-models/standalone-reference.py', 'tools/diffusion-models/standalone-sampler-reference.py', str(build_path.relative_to(ROOT)), str(contract.relative_to(ROOT)), 'docs/shared/diffusion-models/diagnostics/resource-observer/observer.mjs']:
        sources[name] = (ROOT / name).read_bytes()
    for name, raw in sources.items():
        fixed = subprocess.check_output(['git', 'show', commit + ':' + name], cwd=ROOT)
        require(fixed == raw, 'Execution source differs from fixed commit: ' + name)
    return sources


def source_receipt(sources, operation='blocks'):
    entries = {name: {'bytes': len(raw), 'sha256': sha(raw)} for name, raw in sources.items()}
    references = load_sample_helpers().captured_reference_sources() if operation == 'sample' else {}
    inventory = {'committed': entries, 'referenceSources': references}
    return {'entries': entries, 'count': len(entries), 'referenceSources': references, 'capturedHTTPBytes': sum(len(raw) for raw in sources.values()), 'inventorySHA256': sha(json.dumps(inventory, sort_keys=True, separators=(',', ':')).encode())}


def reference_resource(threadpoolctl, requested):
    pools = [{key: value.get(key) for key in ['user_api', 'internal_api', 'num_threads', 'prefix', 'version', 'threading_layer', 'architecture']} for value in threadpoolctl.threadpool_info() if value.get('user_api') == 'blas']
    require(pools and all(value['num_threads'] == requested for value in pools), 'Observed reference BLAS thread count differs from explicit request')
    return {'requestedThreads': requested, 'threadpoolctlVersion': threadpoolctl.__version__, 'observedBLASPools': pools, 'numericOperatorChange': False, 'fallback': False}


def verify_reference_threads(reference, model, side):
    """Bounded real-weight evidence only; this does not accept a model run."""
    import threadpoolctl
    np = reference.np
    params = reference.CachedParameters(model, side)
    cases, profiles = [], {}
    try:
        for rows in [1, 3]:
            x = reference.REF.dyadic(rows * 5120, 17, 11, 257, 128, 1024).reshape(rows, 5120)
            outputs = {}
            for threads in [1, 4]:
                with threadpoolctl.threadpool_limits(limits=threads, user_api='blas'):
                    profiles[str(threads)] = reference_resource(threadpoolctl, threads)
                    begin = time.perf_counter()
                    outputs[threads] = [params.linear('blocks.0.self_attn.' + name, x) for name in ['q', 'k', 'v']]
                    outputs[threads].append(reference.streamed_attention(*outputs[threads], key_rows=2))
                    elapsed = time.perf_counter() - begin
                profiles[str(threads)]['lastCaseElapsedSeconds'] = elapsed
            for index, name in enumerate(['q', 'k', 'v', 'all40headAttention']):
                expected, actual = outputs[1][index], outputs[4][index]
                error = np.abs(actual.astype(np.float64) - expected.astype(np.float64))
                gate = reference.GATE['abs'] + reference.GATE['rel'] * np.abs(expected.astype(np.float64))
                failed = int(np.count_nonzero(~np.isfinite(error) | (error > gate)))
                cases.append({'name': name, 'rows': rows, 'elements': int(actual.size), 'bitExact': bool(np.array_equal(actual.view('<u4'), expected.view('<u4'))), 'failed': failed, 'maxAbsolute': float(np.max(error, initial=0)), 'maxNormalizedToGate': float(np.max(error / gate, initial=0)), 'oneThreadSHA256': sha(expected.tobytes()), 'fourThreadSHA256': sha(actual.tobytes())})
                print(json.dumps({'phase': 'reference-thread-verification', **cases[-1]}), flush=True)
        return {'passed': all(case['failed'] == 0 for case in cases), 'gate': reference.GATE, 'cases': cases, 'resources': profiles, 'actualRetainedWeightRows': True, 'independentOriginalReference': True, 'oldOneThreadReceiptReused': False, 'nativeModelExecuted': False, 'fullPredictionAccepted': False, 'weightPayloadBytesRead': params.payload_read}
    finally:
        params.close()


class Coverage:
    def __init__(self, manifest, stages, block_limit, operation='blocks'):
        self.total = manifest['canonicalShape']['concatenation']['totalTokens']
        self.text_rows = manifest['conditioning']['metadata']['shape'][1]
        self.target_shape = manifest['tensors'][0]['shape'] if 'tensors' in manifest else None
        require(operation in ['blocks', 'predict'], 'Explicit blocks or predict chunk coverage required')
        require(operation != 'predict' or block_limit == 39 and all(name in stages for name in HEAD_STAGES), 'Full prediction requires all40 blocks and head/unpatch stages')
        self.stages, self.block_limit, self.operation, self.rows, self.count = stages, block_limit, operation, {}, 0

    def extent(self, name):
        return math.prod(self.target_shape) // self.target_shape[-1] if name == 'prediction' else 1 if name in ['timeRaw', 'timeAct1'] else 6 if name == 'timeProjection' else self.text_rows if name in ['textEmbedded', 'crossK', 'crossV'] else self.total

    def check(self, event, *, commit=False):
        name, block = event.get('name'), event.get('block')
        require(name in self.stages, 'Unexpected diagnostic stage')
        prefix = name in PREFIX_STAGES + HEAD_STAGES
        require(block is None if prefix else type(block) is int and 0 <= block <= self.block_limit, 'Unexpected diagnostic block')
        key = (block, name)
        start, count = event.get('globalRowStart'), event.get('rowCount')
        require(type(start) is int and type(count) is int and 1 <= count <= 128 and start == self.rows.get(key, 0) and start + count <= self.extent(name), 'Duplicate, skipped, noncontiguous or out-of-range diagnostic chunk')
        if commit:
            self.rows[key] = start + count
            self.count += 1

    def summary(self):
        expected = [(None, name) for name in self.stages if name in PREFIX_STAGES + HEAD_STAGES]
        expected += [(block, name) for block in range(self.block_limit + 1) for name in self.stages if name not in PREFIX_STAGES + HEAD_STAGES]
        rows = [{'block': block, 'name': name, 'completedRows': self.rows.get((block, name), 0), 'requiredRows': self.extent(name)} for block, name in expected]
        return {'complete': all(row['completedRows'] == row['requiredRows'] for row in rows), 'operation': self.operation, 'chunks': self.count, 'rows': rows, 'allQueriesKeysHeads': 'numerical acceptance requires every selected stage complete plus independent comparisons passing'}


def oracle_child(connection, manifest, model, side, directory, reference_threads=1, operation='blocks'):
    owner = None
    try:
        reference = load_reference()
        import threadpoolctl
        with threadpoolctl.threadpool_limits(limits=reference_threads, user_api='blas'):
            resource = reference_resource(threadpoolctl, reference_threads)
            if operation == 'sample':
                last_progress = 0
                def progress(event):
                    nonlocal last_progress
                    now = time.monotonic()
                    if now - last_progress >= 3 or event['rows'] == event['total']:
                        connection.send({'kind': 'progress', **event})
                        last_progress = now
                owner = load_sample_helpers().SampleOracle(reference, manifest, model, directory, progress=progress)
            else:
                owner = reference.ChunkOracle(manifest, model, side, directory, allow_model_work=True)
            connection.send({'kind': 'ready', 'numpy': reference.np.__version__, 'resource': resource})
            while True:
                message = connection.recv()
                if message['kind'] == 'compare':
                    connection.send({'kind': 'started', 'name': message['event']['name'], 'block': message['event'].get('block'), 'rowStart': message['event']['globalRowStart'], 'rowCount': message['event']['rowCount']})
                    result = owner.compare(message['event'], message['raw'])
                    reference_resource(threadpoolctl, reference_threads)
                    connection.send({'kind': 'comparison', 'value': result})
                elif message['kind'] == 'close':
                    before = owner.stats()
                    owner.close()
                    connection.send({'kind': 'closed', 'beforeClose': before, 'afterClose': owner.stats(), 'resource': reference_resource(threadpoolctl, reference_threads)})
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
    def __init__(self, manifest, model, side, directory, reference_threads=1, operation='blocks'):
        context = multiprocessing.get_context('spawn')
        self.connection, child = context.Pipe()
        self.process = context.Process(target=oracle_child, args=(child, str(manifest), str(model), side, str(directory), reference_threads, operation), daemon=True)
        self.directory = Path(directory)
        self.owned_paths = load_sample_helpers().private_paths(self.directory)
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
                if message['kind'] in ['started', 'progress']:
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
        owned_paths = getattr(self, 'owned_paths', [self.directory / name for name in ['reference-x.f32', 'reference-k.f32', 'reference-v.f32']])
        for path in owned_paths:
            name = str(path.relative_to(self.directory))
            try:
                if path.exists():
                    path.unlink()
                    removed.append(name)
            except BaseException as error:
                cleanup_errors.append({'phase': 'backing-unlink', 'path': str(path), 'name': type(error).__name__, 'message': str(error)[:2000]})
        for step in range(6):
            path = self.directory / ('prediction-' + str(step))
            if path.is_dir():
                try:
                    path.rmdir()
                except OSError as error:
                    cleanup_errors.append({'phase': 'backing-directory-remove', 'path': str(path), 'name': type(error).__name__, 'message': str(error)[:2000]})
        self.stats = {'oracle': self.stats, 'childExitCode': self.process.exitcode, 'childStillAlive': self.process.is_alive(), 'terminated': terminated, 'backingFilesRemoved': removed, 'backingFilesRemaining': [str(path.relative_to(self.directory)) for path in owned_paths if path.exists()], 'cleanupErrors': cleanup_errors}
        return self.stats


def comparison_stages(operation, *, skip_prefix=False):
    require(type(skip_prefix) is bool, 'Explicit prefix comparison selection required')
    require(not(skip_prefix and operation == 'sample'), 'sample compares sixteen sampler traces; prefix reuse selection is only for blocks/predict')
    stages = STAGES + HEAD_STAGES if operation == 'predict' else list(STAGES)
    return [name for name in stages if name not in PREFIX_STAGES + ['postModulated']] if skip_prefix else stages


def input_config(manifest, side, block_limit, run_id, *, operation='blocks', wasm_threads=1, decoder='lookup', read_ahead_bytes=1048576, skip_prefix=False):
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
    stages = comparison_stages(operation, skip_prefix=skip_prefix)
    config = {'runId': run_id, 'shapeRequest': manifest['shapeRequest'], 'side': side, 'timestep': manifest['timestep'], 'totalTokens': manifest['canonicalShape']['concatenation']['totalTokens'], 'tensors': tensors, 'conditioning': conditioning, 'stages': stages, 'blockLimit': block_limit, 'operation': operation, 'wasmThreads': wasm_threads, 'crossOriginIsolationRequired': wasm_threads == 4, 'decoder': decoder, 'readAheadBytes': read_ahead_bytes}
    if operation == 'sample':
        for name in ['initialEmptyTarget', 'explicitNoise']:
            tensor = manifest[name]
            config[name] = entry(tensor['path'], math.prod(tensors[0]['shape']) * 4, tensor['sha256'])
    return config, whitelist


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
    parser.add_argument('--operation', choices=['blocks', 'predict', 'sample'], default='blocks', help='blocks preserves block0 default; predict runs all40/head/unpatch; sample compares all six velocities and16 update/handoff/restore identities')
    parser.add_argument('--wasm-threads', type=int, choices=[1, 4], default=1, help='1 uses no COI; explicit4 requires COI, with no fallback')
    parser.add_argument('--decoder', choices=['legacy', 'lookup'], default='lookup')
    parser.add_argument('--read-ahead-bytes', type=int, default=1048576)
    parser.add_argument('--reference-threads', type=int, choices=[1, 4], default=1, help='Explicit independent BLAS thread profile; never changes native WASM threads')
    parser.add_argument('--skip-prefix-comparison', action='store_true', help='Reuse unchanged prefix/post-modulation evidence; still computes every native prefix/KV, compares all self/cross/FFN stages, and records the selected comparison scope')
    parser.add_argument('--verify-reference-threads', action='store_true', help='Bounded real-weight 1-vs4 BLAS reference gate only, without browser/model prediction')
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
    required = ['manifest', 'contract', 'source_commit', 'output'] + ([] if args.verify_reference_threads else ['private_reference_dir'])
    require(all(getattr(args, name) is not None for name in required), 'Manifest, contract, source commit, private reference directory and output required')
    require(not(args.verify_reference_threads and args.validate_only), 'Choose reference thread verification or validate-only')
    require(args.diagnostic_timeout_seconds > 0, 'Positive operational watchdog required')
    require(0 <= args.read_ahead_bytes <= 1048576, 'Bounded read-ahead0..1048576 required')
    require(args.operation == 'blocks' or args.block_limit in [0, 39], 'predict/sample execute all40 blocks; a partial block-limit is not a prediction')
    require(args.operation != 'sample' or args.decoder == 'lookup', 'The existing sampler explicitly uses lookup decoder; legacy is unsupported for sample')
    require(args.operation != 'sample' or args.side == 'HIGH', 'Sample always executes HIGH3 then LOW3; --side selects only blocks/predict diagnostics')
    require(not(args.operation == 'sample' and args.verify_reference_threads), 'Reference thread verification is a separate bounded predictor diagnostic')
    block_limit = args.block_limit if args.operation == 'blocks' else 39
    require(not args.output.exists(), 'Existing diagnostic receipt must not be overwritten')
    reference = load_reference()
    manifest = read_json(args.manifest)
    require(read_json(args.contract) == reference.reference_contract(args.manifest), 'Fixed pre-execution input/gate/source contract mismatch')
    sources = committed_sources(args.source_commit, args.contract)
    captured = source_receipt(sources, args.operation)
    model = args.model_dir / reference.REF.MODELS[args.side][0]
    require(model.stat().st_size == reference.REF.MODEL_BYTES, 'Pinned local model byte length mismatch')
    models = {side: args.model_dir / reference.REF.MODELS[side][0] for side in ['HIGH', 'LOW']} if args.operation == 'sample' else {args.side: model}
    require(all(path.stat().st_size == reference.REF.MODEL_BYTES for path in models.values()), 'Both pinned model File byte lengths required for sample')
    require(args.operation != 'sample' or math.prod(manifest['tensors'][0]['shape']) * 4 <= MAX_CHUNK_BYTES, 'Sampler trace target must fit explicit8MiB profile')
    resource_config = {'wasmThreads': args.wasm_threads, 'crossOriginIsolationRequired': args.wasm_threads == 4, 'decoder': args.decoder, 'readAheadBytes': args.read_ahead_bytes, 'referenceThreads': args.reference_threads, 'prefixComparisonsSkipped': args.skip_prefix_comparison, 'fallback': False}
    if args.verify_reference_threads:
        result = {'schemaVersion': 'bernini-production-reference-thread-verification/1', 'sourceCommit': args.source_commit, 'sourceBefore': captured, 'side': args.side, 'manifestSHA256': reference.file_sha(args.manifest), 'contractSHA256': reference.file_sha(args.contract), 'numpy': reference.np.__version__, 'generationReady': False}
        try:
            result.update(verify_reference_threads(reference, model, args.side))
        except BaseException as error:
            result.update(passed=False, error={'name': type(error).__name__, 'message': str(error)[:4000]})
        finally:
            try:
                result['sourceAfter'] = source_receipt(committed_sources(args.source_commit, args.contract), args.operation)
                require(result['sourceAfter'] == captured, 'Fixed source changed during reference thread verification')
            except BaseException as error:
                result.update(passed=False, sourceAfterError={'name': type(error).__name__, 'message': str(error)[:4000]})
        reference.write_json(args.output, result, exclusive=True)
        print(json.dumps({'passed': result['passed'], 'mode': 'reference-thread-verification', 'output': str(args.output), 'nativeModelExecuted': False}))
        return
    run_id = secrets.token_hex(24)
    config, inputs = input_config(manifest, args.side, block_limit, run_id, operation=args.operation, wasm_threads=args.wasm_threads, decoder=args.decoder, read_ahead_bytes=args.read_ahead_bytes, skip_prefix=args.skip_prefix_comparison)
    config['wasmModules'] = [{'role': name, 'sha256': sha(raw)} for name, raw in sources.items() if name.endswith('.wasm')]
    if args.validate_only:
        print(json.dumps({'passed': True, 'sourceCommit': args.source_commit, 'sources': captured['count'], 'inputFiles': len(inputs), 'totalTokens': config['totalTokens'], 'operation': args.operation, 'blockLimit': block_limit, 'resource': resource_config, 'modelWorkExecuted': False}))
        return
    private_dir = reference.private_directory(args.private_reference_dir)
    require(not any(private_dir.iterdir()), 'Fresh empty private reference directory required')
    coverage = load_sample_helpers().SampleCoverage(manifest) if args.operation == 'sample' else Coverage(manifest, config['stages'], block_limit, args.operation)
    comparison_lock = threading.Lock()
    metrics = {'chunks': 0, 'bytes': 0, 'failedElements': 0, 'maxAbsolute': 0.0, 'maxNormalizedToGate': 0.0, 'compareSeconds': 0.0, 'byStage': {}}
    last_events, requests, browser_errors = deque(maxlen=160), {}, []
    failures, worker_result, source_after, cleanup = [], None, None, None
    started = time.monotonic()
    try:
        oracle = OracleProcess(args.manifest, args.model_dir if args.operation == 'sample' else model, args.side, private_dir, args.reference_threads, args.operation)
    except BaseException as error:
        failure = {'schemaVersion': 'bernini-production-chunk-browser/1', 'passed': False, 'sourceCommit': args.source_commit, 'sourceBefore': captured, 'sourceAfter': None, 'manifestSHA256': reference.file_sha(args.manifest), 'contractSHA256': reference.file_sha(args.contract), 'side': args.side, 'targetShape': manifest['tensors'][0]['shape'], 'totalTokens': config['totalTokens'], 'operation': args.operation, 'blockLimit': block_limit, 'resource': resource_config, 'coverage': coverage.summary(), 'failures': [{'stage': 'independent-oracle-startup', 'name': type(error).__name__, 'message': str(error)[:4000]}], 'oracleCleanup': getattr(error, 'oracle_cleanup', None), 'elapsedSeconds': time.monotonic() - started, 'browserConstructed': False, 'rawIntermediateArraysSaved': False, 'modelBytesServedOverHTTP': 0, 'generationReady': False, 'unknownObservationScope': ['No native model stage executed; see startup cleanup result']}
        try:
            failure['sourceAfter'] = source_receipt(committed_sources(args.source_commit, args.contract), args.operation)
            require(failure['sourceAfter'] == captured, 'Fixed source changed during oracle startup')
        except BaseException as source_error:
            failure['failures'].append({'stage': 'fixed-source-after', 'name': type(source_error).__name__, 'message': str(source_error)[:4000]})
        reference.write_json(args.output, failure, exclusive=True)
        print(json.dumps({'passed': False, 'stage': 'independent-oracle-startup', 'output': str(args.output), 'modelWorkExecuted': False}))
        return

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def send(self, status, raw, kind='application/json'):
            self.send_response(status)
            isolation = [('Cross-Origin-Opener-Policy', 'same-origin'), ('Cross-Origin-Embedder-Policy', 'require-corp'), ('Cross-Origin-Resource-Policy', 'same-origin')] if args.wasm_threads == 4 else []
            for key, value in isolation + [('Cache-Control', 'no-store'), ('Content-Type', kind), ('Content-Length', str(len(raw)))]:
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
                self.send(200, b'<!doctype html><meta charset=utf-8><input type=file id=model><input type=file id=HIGH><input type=file id=LOW>', 'text/html')
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

    server, server_started = None, False
    try:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        server_started = True
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
            try:
                page = browser.new_page()
                page.set_default_timeout(30000)
                page.on('pageerror', lambda error: browser_errors.append(str(error)))
                page.goto('http://127.0.0.1:' + str(server.server_port) + '/')
                if args.operation == 'sample':
                    for side, path in models.items():page.locator('#' + side).set_input_files(str(path))
                else:
                    page.locator('#model').set_input_files(str(model))
                page.evaluate("""config=>{globalThis.__diagnostic={done:false,last:null,result:null,error:null,events:[]};const w=globalThis.__diagnosticWorker=new Worker('/tools/diffusion-models/production-chunk-browser.mjs',{type:'module'});w.onmessage=({data})=>{const s=globalThis.__diagnostic;s.last=data;if(data.type==='result'){s.result=data.value;s.done=true;}else if(data.type==='fatal'){s.error=data.value;s.done=true;}else{if(data.type==='progress'||data.type==='phase')s.events.push(data);if(s.events.length>160)s.events.shift();}};w.onerror=e=>{globalThis.__diagnostic.error={name:'WorkerError',message:e.message};globalThis.__diagnostic.done=true;};w.postMessage({kind:'run',file:document.querySelector('#model').files[0],files:config.operation==='sample'?{HIGH:document.querySelector('#HIGH').files[0],LOW:document.querySelector('#LOW').files[0]}:undefined,config});}""", config)
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
    except BaseException as error:
        failures.append({'name': type(error).__name__, 'message': str(error)[:4000], 'elapsedSeconds': time.monotonic() - started})
    finally:
        success = bool(worker_result and worker_result['completed'] and coverage.summary()['complete'] and metrics['failedElements'] == 0 and not failures and not browser_errors)
        cleanup = oracle.close(graceful=success)
        if server is not None:
            operations = ([('server-shutdown', server.shutdown)] if server_started else []) + [('server-close', server.server_close)]
            for phase, operation in operations:
                try:
                    operation()
                except BaseException as error:
                    failures.append({'stage': phase, 'name': type(error).__name__, 'message': str(error)[:4000], 'elapsedSeconds': time.monotonic() - started})
        try:
            source_after = source_receipt(committed_sources(args.source_commit, args.contract), args.operation)
            require(source_after == captured, 'Fixed source changed during execution')
        except BaseException as error:
            failures.append({'stage': 'fixed-source-after', 'name': type(error).__name__, 'message': str(error)[:4000], 'elapsedSeconds': time.monotonic() - started})
        if failures or cleanup['cleanupErrors'] or cleanup['backingFilesRemaining'] or cleanup['childStillAlive']:
            success = False
    scope = 'six independent full40/head velocity outputs plus16 sampler update/handoff/restore identities; per-block comparison for each sample prediction is not claimed' if args.operation == 'sample' else 'all selected stages across40 complete blocks, all-token final head, target extraction and NCTHW unpatch' if args.operation == 'predict' else 'all declared query/key/head rows through selected complete block boundaries only; no final head or complete predict/sample'
    result = {'schemaVersion': 'bernini-production-chunk-browser/1', 'passed': success, 'sourceCommit': args.source_commit, 'sourceBefore': captured, 'sourceAfter': source_after, 'manifestSHA256': reference.file_sha(args.manifest), 'contractSHA256': reference.file_sha(args.contract), 'side': args.side, 'targetShape': manifest['tensors'][0]['shape'], 'totalTokens': config['totalTokens'], 'operation': args.operation, 'blockLimit': block_limit, 'resource': resource_config, 'oracleResource': oracle.initial, 'scope': scope, 'gate': reference.GATE, 'coverage': coverage.summary(), 'comparison': metrics, 'worker': worker_result, 'failures': failures, 'browserErrors': browser_errors, 'lastEvents': list(last_events), 'requests': requests, 'oracleCleanup': cleanup, 'elapsedSeconds': time.monotonic() - started, 'rawIntermediateArraysSaved': False, 'modelBytesServedOverHTTP': 0, 'normalAPIRequiresGateOrReference': False, 'generationReady': False, 'unknownObservationScope': ['native/internal ORT staging/allocator peaks not directly observable', 'reference IPC adds bounded binary copies and is included only by outer process monitor', 'whole-process RSS/PSS sampling is supplied by outer resource wrapper']}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
        stream.write('\n')
    print(json.dumps({'passed': success, 'output': str(args.output), 'comparedChunks': metrics['chunks'], 'failedElements': metrics['failedElements'], 'coverageComplete': coverage.summary()['complete'], 'elapsedSeconds': result['elapsedSeconds']}))


if __name__ == '__main__':
    main()
