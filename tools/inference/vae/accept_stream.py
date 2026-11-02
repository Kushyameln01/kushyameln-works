#!/usr/bin/env python3
"""Accept one explicit streaming VAE case through its normal browser API.

Only local File inputs and real CPU WASM are used. Independent source outputs
remain external private files and every numerical value is compared in chunks.
Run model jobs serially; this tool never downsizes an unsupported/failed case.
"""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import mimetypes
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
import traceback
from urllib.parse import unquote, urlsplit

from accept_still import ProcessSampler
from process_lifecycle import ProcessOwnership, cleanup_complete
from stream_reference import (COMPARISON_GATE, MODEL_SHA256, SOURCE_SHA256,
                              PLAN_PATH, case_by_id, sha256_file, read_cgroup_memory)

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')


def tensor_header(path):
    with path.open('rb') as source:
        prefix = source.read(12)
        if len(prefix) != 12 or prefix[:8] != b'WKTSR001':
            raise ValueError('Downloaded file is not a complete WKTSR001 tensor')
        length = int.from_bytes(prefix[8:12], 'little')
        if not 0 < length <= 65536:
            raise ValueError('Invalid WKT header length')
        raw = source.read(length)
        if len(raw) != length:
            raise ValueError('Truncated WKT header')
    return json.loads(raw.decode('utf-8')), 12 + length


def compare_download(path, reference, expected_metadata, gate, chunk_elements=262144):
    """Exact shape/hash/metadata and all-value comparison without loading RGB copies."""
    import numpy as np
    if gate != COMPARISON_GATE:
        raise ValueError('Acceptance gate differs from the predeclared new-domain gate')
    header, offset = tensor_header(path)
    if header.get('schemaVersion') != 1 or header.get('byteOrder') != 'little':
        raise ValueError('Unsupported WKT schema or byte order')
    for key in ['dtype', 'layout', 'shape', 'meaning', 'modelSha256', 'context',
                'normalization', 'latentContract', 'frameProcessing']:
        if (key in header) != (key in expected_metadata) or header.get(key) != expected_metadata.get(key):
            raise ValueError('Downloaded normal tensor metadata differs: ' + key)
    if (header['dtype'], header['layout']) != ('float32', 'NCTHW'):
        raise ValueError('Expected little-endian float32 NCTHW output')
    count = math.prod(header['shape'])
    payload_bytes = count * 4
    if header.get('byteLength') != payload_bytes or path.stat().st_size != offset + payload_bytes:
        raise ValueError('Downloaded WKT payload length does not match exact shape')
    if reference.stat().st_size != payload_bytes:
        raise ValueError('Independent reference byte count does not match exact output shape')
    digest = hashlib.sha256()
    with path.open('rb') as source:
        source.seek(offset)
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != header.get('dataSha256'):
        raise ValueError('Downloaded WKT payload SHA256 mismatch')
    actual = np.memmap(path, mode='r', dtype='<f4', offset=offset, shape=(count,))
    expected = np.memmap(reference, mode='r', dtype='<f4', shape=(count,))
    finite, allclose, maximum, squares = True, True, 0.0, 0.0
    failed_elements, first_failed = 0, None
    for begin in range(0, count, chunk_elements):
        end = min(begin + chunk_elements, count)
        left, right = actual[begin:end].astype(np.float64), expected[begin:end].astype(np.float64)
        valid = np.isfinite(left) & np.isfinite(right)
        difference = np.abs(left - right)
        accepted = valid & (difference <= gate['atol'] + gate['rtol'] * np.abs(right))
        finite = finite and bool(valid.all())
        allclose = allclose and bool(accepted.all())
        failures = int(np.count_nonzero(~accepted))
        failed_elements += failures
        if failures and first_failed is None:
            first_failed = begin + int(np.flatnonzero(~accepted)[0])
        if valid.any():
            maximum = max(maximum, float(difference[valid].max(initial=0)))
            squares += float(np.dot(difference[valid], difference[valid]))
    del actual, expected
    passed = finite and allclose and maximum <= gate['maxAbs']
    return {'passed': passed, 'file': path.name, 'bytes': path.stat().st_size,
            'fileSha256': sha256_file(path), 'payloadSha256': digest.hexdigest(),
            'header': header, 'reference': {'file': reference.name, 'sha256': sha256_file(reference)},
            'elements': count, 'allValuesCompared': True, 'allFinite': finite, 'allclose': allclose,
            'maxAbs': maximum, 'rmse': math.sqrt(squares / count),
            'failedAllcloseElements': failed_elements, 'firstFailedElement': first_failed,
            'gate': gate, 'method': 'Chunked little-endian FP32 file memmaps; no frame/pixel/channel subset'}


class FileProcessSampler(ProcessSampler):
    """Reuse process-tree sampling, retaining only bounded summaries in RAM."""
    def __init__(self, pid, path):
        super().__init__(pid)
        self.path = path
        self.log = path.open('x')
        self.count = 0
        self.phase_peaks = {}
        self.cgroup_peak = 0

    def _sample(self):
        super()._sample()
        while self.samples:
            sample = self.samples.pop(0)
            sample['cgroup'] = read_cgroup_memory()
            self.cgroup_peak = max(self.cgroup_peak, sample['cgroup']['currentBytes'] or 0)
            self.log.write(json.dumps(sample) + '\n')
            self.log.flush()
            self.count += 1
            peak = self.phase_peaks.setdefault(sample['phase'], {'samples': 0,
                'sampledPeakSumRssBytes': 0, 'sampledPeakSumPssBytes': None})
            peak['samples'] += 1
            peak['sampledPeakSumRssBytes'] = max(peak['sampledPeakSumRssBytes'], sample['sumRssBytes'])
            if sample['sumPssBytes'] is not None:
                peak['sampledPeakSumPssBytes'] = max(peak['sampledPeakSumPssBytes'] or 0, sample['sumPssBytes'])

    def stop(self):
        super().stop()
        if self.thread.is_alive():
            raise RuntimeError('Resource sampler did not stop before browser close')
        if not self.log.closed:
            self.log.close()

    def report(self):
        result = super().report()
        result.update(samplesFile=self.path.name, samples=self.count, phases=self.phase_peaks,
                      sampledPeakCgroupCurrentBytes=self.cgroup_peak,
                      cgroupScope='Observed shared cgroup; includes scratch page cache and other processes',
                      retention='Raw samples streamed to private JSONL; scalar phase peaks retained')
        return result


def validate_inputs(bundle, reference_dir, operations):
    manifest_path = bundle / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    report_path = reference_dir / 'reference-report.json'
    report = json.loads(report_path.read_text())
    if report.get('status') != 'REFERENCE_WRITTEN':
        raise ValueError('A completed independent untouched-source reference is required')
    if manifest.get('kind') != 'wan21-vae-stream-v1' or manifest.get('model', {}).get('sha256') != MODEL_SHA256:
        raise ValueError('Expected the original-model streaming VAE bundle')
    if manifest.get('source', {}).get('sha256') != SOURCE_SHA256:
        raise ValueError('Streaming bundle has a different pinned VAE source')
    if report.get('model', {}).get('sha256') != MODEL_SHA256 or report.get('source', {}).get('sha256') != SOURCE_SHA256:
        raise ValueError('Independent reference model/source identity differs')
    if report['model'].get('verified') is not True or report['source'].get('verified') is not True:
        raise ValueError('Independent model/source hash verification is missing')
    if report.get('strictLoad') != {'keys': 194, 'missing': [], 'unexpected': []}:
        raise ValueError('Independent source did not strictly load all194 keys')
    if report.get('comparisonGate') != COMPARISON_GATE or report.get('predeclaredPlan', {}).get('sha256') != sha256_file(PLAN_PATH):
        raise ValueError('Frozen source-reference gate/plan does not match current predeclared plan')
    case = case_by_id(report['case']['id'])
    if report['case'] != case:
        raise ValueError('Independent source case shape differs from its explicit declaration')
    asset_paths = [manifest_path]
    for role, record in manifest.get('assets', {}).items():
        name = record.get('file', '')
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', name) or '..' in name:
            raise ValueError('Invalid local bundle filename: ' + role)
        path = bundle / name
        if path.stat().st_size != record['bytes'] or sha256_file(path) != record['sha256']:
            raise ValueError('Streaming asset bytes/hash mismatch: ' + role)
        asset_paths.append(path)
    references = {}
    for operation in operations:
        record = report['references'].get(operation)
        if not record or report.get('operations', {}).get(operation, {}).get('status') != 'REFERENCE_WRITTEN':
            raise ValueError('Independent source operation is unavailable: ' + operation)
        expected_in = case['rgbShape'] if operation == 'encode' else case['latentShape']
        expected_out = case['latentShape'] if operation == 'encode' else case['decodeRgbShape']
        for kind, expected in [('input', expected_in), ('output', expected_out)]:
            tensor = record[kind]
            if Path(tensor['file']).name != tensor['file'] or tensor['shape'] != expected:
                raise ValueError('Independent tensor filename/shape mismatch')
            path = reference_dir / tensor['file']
            if (tensor.get('complete') is not True or tensor.get('dtype') != 'float32'
                    or tensor.get('layout') != 'NCTHW' or tensor.get('byteOrder') != 'little'
                    or path.stat().st_size != math.prod(expected) * 4
                    or path.stat().st_size != tensor['bytes'] or sha256_file(path) != tensor['sha256']):
                raise ValueError('Independent all-value tensor file bytes/hash mismatch')
        if operation == 'decode' and record['input'].get('provenance') != 'RAW_LATENT_DECLARED_NORMAL_INPUT':
            raise ValueError('Decode requires independent declared raw latent, not an encode output or producer receipt')
        references[operation] = record
    return manifest, report, references, asset_paths


class Blocked(RuntimeError):
    pass


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--operation', choices=['encode', 'decode', 'both'], required=True)
    parser.add_argument('--execution-source-sha', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--controls', action='store_true')
    parser.add_argument('--browser', default=os.environ.get('CHROMIUM_BINARY') or shutil.which('chromium'))
    parser.add_argument('--timeout-seconds', type=int, default=7200)
    parser.add_argument('--preflight-only', action='store_true', help='Exact capabilities and resource/source preflight only; no numerical Worker')
    args = parser.parse_args(argv)
    if not re.fullmatch('[0-9a-f]{40}', args.execution_source_sha):
        parser.error('--execution-source-sha requires a full40hex committed source identity')
    args.output = args.output.resolve()
    if 'docs' in args.output.parts:
        parser.error('Private acceptance output must be outside docs/')
    args.output.mkdir(parents=True, exist_ok=False)
    result = {'schemaVersion': 1, 'passed': False, 'status': 'RUNNING',
              'scope': 'One explicit synthetic VAE case, default normal owner API, actual ORT/Hike CPU WASM and independent all-value source comparison',
              'executionSourceSha': args.execution_source_sha, 'diagnostics': False,
              'productionReady': False, 'originalBf16ArithmeticEquivalence': False,
              'operations': {}, 'progressEvents': [], 'httpRequests': {}, 'httpErrors': [],
              'requestFailures': [], 'pageErrors': [], 'consoleErrors': []}
    started = time.monotonic()
    phase, server, browser, sampler, owner, failure = 'input-preflight', None, None, None, None, None
    page = None
    served, server_errors = {}, []
    browser_session_disposed = False
    sampler_stopped_before_close = False

    def source_bytes(path):
        path = path.resolve()
        relative = str(path.relative_to(REPO))
        raw = path.read_bytes()
        fixed = subprocess.run(['git', 'show', args.execution_source_sha + ':' + relative],
                               cwd=REPO, check=True, capture_output=True).stdout
        if raw != fixed:
            raise ValueError('Served source differs from the specified commit: ' + relative)
        served[relative] = {'path': relative, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        return raw

    try:
        if not args.browser:
            raise Blocked('Real Chromium is unavailable')
        if not 1 <= args.timeout_seconds <= 2147483:
            raise ValueError('Browser timeout must fit a positive bounded JavaScript timer')
        operations = ['encode', 'decode'] if args.operation == 'both' else [args.operation]
        bundle, reference_dir = args.bundle.resolve(), args.reference.resolve()
        manifest, reference_report, references, assets = validate_inputs(bundle, reference_dir, operations)
        result.update(case=reference_report['case'], comparisonGate=COMPARISON_GATE,
                      manifestSha256=sha256_file(bundle / 'manifest.json'),
                      referenceReport={'path': str(reference_dir / 'reference-report.json'),
                                       'sha256': sha256_file(reference_dir / 'reference-report.json'),
                                       'executionSourceSha': reference_report.get('executionSourceSha')},
                      initialCgroup=read_cgroup_memory())
        # All native worker imports are checked before a numerical job can start.
        source_paths = [Path(__file__), HERE / 'stream_browser.mjs', HERE / 'stream_observer_worker.mjs',
                        HERE / 'process_lifecycle.py', HERE / 'accept_still.py', HERE / 'stream_reference.py', PLAN_PATH,
                        HERE.parent / 'text-encoder/plain_memory.mjs', REPO / 'docs/shared/vr180/sha256.mjs']
        source_paths += list((REPO / 'docs/shared/inference').glob('*.mjs'))
        source_paths += list((REPO / 'docs/shared/inference/vendor').glob('*.mjs'))
        source_paths += [REPO / 'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm',
                         REPO / 'docs/shared/inference/kernel/tensor.wasm']
        for path in source_paths:
            source_bytes(path)
        result['servedSourcePreflight'] = {'allCheckedBeforeNumericalExecution': True,
                                          'files': list(served.values()), 'count': len(served)}
        output_bytes = [math.prod(references[operation]['output']['shape']) * 4 + 65548 for operation in operations]
        required_storage = sum(output_bytes) + max(output_bytes, default=0)
        result['downloadStoragePreflight'] = {'requiredBytes': required_storage,
            'availableBytes': shutil.disk_usage(args.output).free,
            'scope': 'All selected WKT outputs plus one simultaneous browser download staging copy and maximum headers'}
        if required_storage > result['downloadStoragePreflight']['availableBytes']:
            raise Blocked('Insufficient output storage for exact full tensors and download staging')
        spec = {'case': reference_report['case'], 'operations': operations, 'references': references,
                'manifestSha256': result['manifestSha256'], 'modelSha256': MODEL_SHA256}

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                requested = unquote(urlsplit(self.path).path)
                result['httpRequests'][requested] = result['httpRequests'].get(requested, 0) + 1
                try:
                    if requested == '/favicon.ico':
                        self.send_response(204); self.end_headers(); return
                    if requested == '/':
                        raw = (b'<!doctype html><meta charset="utf-8"><input id="bundle" type="file" multiple>'
                               b'<input id="encode-input" type="file"><input id="decode-input" type="file">'
                               b'<script type="module" src="/harness/vae/stream_browser.mjs"></script>')
                        kind = 'text/html'
                    else:
                        if requested.startswith('/harness/'):
                            base, relative = HERE.parent, requested.removeprefix('/harness/')
                        elif requested.startswith('/shared/inference/') or requested == '/shared/vr180/sha256.mjs':
                            base, relative = REPO / 'docs', requested.lstrip('/')
                        else:
                            self.send_error(404); return
                        path = (base / relative).resolve()
                        if not path.is_relative_to(base.resolve()) or path.suffix not in ('.mjs', '.wasm'):
                            self.send_error(403); return
                        raw = source_bytes(path)
                        kind = 'application/wasm' if path.suffix == '.wasm' else 'text/javascript'
                    self.send_response(200)
                    self.send_header('Content-Type', kind)
                    self.send_header('Content-Length', str(len(raw)))
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
                    self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
                    self.end_headers()
                    try:
                        self.wfile.write(raw)
                    except (BrokenPipeError, ConnectionResetError):
                        pass
                except Exception as error:
                    server_errors.append({'path': requested, 'error': str(error)})
                    self.send_error(500)

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        origin = f'http://127.0.0.1:{server.server_port}'
        owner = ProcessOwnership().start()
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            try:
                phase = 'browser-start'
                browser = playwright.chromium.launch(executable_path=args.browser, headless=True,
                    args=['--no-sandbox', '--disable-dev-shm-usage'])
                result['browserVersion'] = browser.version
                cdp = browser.new_browser_cdp_session()
                processes = cdp.send('SystemInfo.getProcessInfo')['processInfo']
                browser_pid = next(int(process['id']) for process in processes if process['type'] == 'browser')
                cdp.detach()
                sampler = FileProcessSampler(browser_pid, args.output / 'resource-samples.jsonl')
                sampler.start()
                context = browser.new_context(accept_downloads=True, service_workers='block')
                context.route('**/*', lambda route: route.continue_()
                    if route.request.url.startswith(origin + '/') and route.request.method == 'GET' else route.abort())
                page = context.new_page()
                page.set_default_timeout(args.timeout_seconds * 1000)
                page.on('pageerror', lambda error: result['pageErrors'].append(str(error)) if len(result['pageErrors']) < 100 else None)
                page.on('console', lambda message: result['consoleErrors'].append(message.text[:10000])
                        if message.type == 'error' and len(result['consoleErrors']) < 100 else None)
                page.on('response', lambda response: result['httpErrors'].append({'url': response.url, 'status': response.status})
                        if response.status >= 400 and len(result['httpErrors']) < 100 else None)
                page.on('requestfailed', lambda request: result['requestFailures'].append({'url': request.url, 'failure': request.failure})
                        if len(result['requestFailures']) < 100 else None)

                def progress(message):
                    if message.type == 'log' and message.text.startswith('vae-stream-progress:'):
                        value = json.loads(message.text.removeprefix('vae-stream-progress:'))
                        sampler.phase = value.get('operation', '') + ':' + value.get('controlPhase', '')
                        result['progressEvents'].append(value)
                        print(json.dumps({'progress': value}), flush=True)
                page.on('console', progress)
                page.goto(origin + '/')
                page.wait_for_function("typeof prepareVaeStream==='function'")
                page.set_input_files('#bundle', [str(path) for path in assets])
                for operation in operations:
                    page.set_input_files('#' + operation + '-input', str(reference_dir / references[operation]['input']['file']))
                phase = sampler.phase = 'exact-capabilities-no-NN'
                result['capabilities'] = page.evaluate('spec=>prepareVaeStream(spec)', spec)
                if not result['capabilities']['passed']:
                    if result['capabilities']['status'] == 'BLOCKED_CAPABILITY':
                        raise Blocked('Configured owner rejects the actual full descriptor: ' + json.dumps(result['capabilities']))
                    raise RuntimeError('Normal owner preparation failed: ' + json.dumps(result['capabilities']))
                if args.preflight_only:
                    result['status'] = 'PREFLIGHT_ONLY'
                    result['numericalExecutionPerformed'] = False
                else:
                    for index, operation in enumerate(operations):
                        phase = sampler.phase = operation + ':normal-or-recovery'
                        with page.expect_download(timeout=args.timeout_seconds * 1000) as download:
                            native = page.evaluate('options=>runVaeStreamOperation(options)',
                                                   {'operation': operation, 'controls': args.controls and index == 0,
                                                    'timeoutMs': args.timeout_seconds * 1000})
                            result['operations'][operation] = {'browser': native}
                            if not native['passed']:
                                raise RuntimeError('Normal streaming execution failed: ' + json.dumps(native))
                        path = args.output / native['codec']['download']
                        download.value.save_as(str(path))
                        # Avoid retaining every prior388MB browser staging artifact.
                        download.value.delete()
                        page.evaluate('operation=>releaseVaeStreamDownload(operation)', operation)
                        phase = sampler.phase = operation + ':independent-all-value-comparison'
                        comparison = compare_download(path, reference_dir / references[operation]['output']['file'],
                                                      native['output']['tensor'], COMPARISON_GATE)
                        result['operations'][operation]['comparison'] = comparison
                        if not comparison['passed']:
                            raise ValueError('Independent full-value numerical comparison failed: ' + operation)
                    result['passed'] = True
                    result['status'] = 'ACCEPTED_SELECTED_CASE'
                    result['numericalExecutionPerformed'] = True
                result['browserLifecycle'] = page.evaluate('()=>disposeVaeStream()')
                browser_session_disposed = True
                if any(not worker['terminated'] for worker in result['browserLifecycle']['workers']):
                    raise RuntimeError('Owned native Worker remains after normal completion')
                if result['pageErrors'] or result['httpErrors'] or result['requestFailures'] or server_errors:
                    raise RuntimeError('Browser/server execution errors were observed')
            finally:
                if page is not None and not browser_session_disposed:
                    try:
                        result['browserLifecycle'] = page.evaluate('()=>typeof disposeVaeStream===\'function\'?disposeVaeStream():null')
                    except Exception as error:
                        result['browserDisposeError'] = str(error)
                # Stop the sampler while the browser is still alive, on both paths.
                try:
                    if sampler is not None:
                        sampler.stop()
                        sampler_stopped_before_close = True
                finally:
                    if browser is not None:
                        browser.close()
                        browser = None
    except Exception as error:
        failure = error
        resource_error = bool(re.search(r'out of memory|allocation failed|memory allocation|could not allocate memory|cannot allocate memory|failed to allocate|cannot enlarge|bad_alloc|memory capacity', str(error), re.I))
        result['status'] = 'BLOCKED_RUNTIME_RESOURCE' if resource_error else 'BLOCKED' if isinstance(error, Blocked) else 'FAILED'
        result['failure'] = {'phase': phase, 'type': type(error).__name__, 'message': str(error),
                             'traceback': traceback.format_exc(),
                             'scope': 'Observed actual failure; no smaller replacement case was executed'}
    finally:
        if sampler is not None and not sampler.stop_event.is_set():
            sampler.stop()
            sampler_stopped_before_close = browser is not None
        if browser is not None:
            browser.close()
        if owner is not None:
            ownership = owner.finish(timeout_seconds=5)
            result['processOwnership'] = ownership
            if not cleanup_complete(ownership['liveAfterClose'], ownership['zombiesAfterClose'], ownership['errors']):
                result['passed'] = False
                result['processCleanupFailure'] = 'Owned live/zombie children remain or ownership cleanup is unverified'
        if sampler is not None:
            live, zombies = sampler.remaining()
            resources = sampler.report()
            resources.update(liveProcessesAfterClose=live, zombieProcessesAfterClose=zombies,
                             allObservedPidsGone=not live and not zombies,
                             samplerStoppedBeforeBrowserClose=sampler_stopped_before_close)
            path = args.output / 'resource-measurements.json'
            write_json(path, resources)
            result['resources'] = {'file': path.name, 'sha256': sha256_file(path),
                'phases': resources['phases'], 'sampledPeakCgroupCurrentBytes': sampler.cgroup_peak,
                'allObservedPidsGone': not live and not zombies,
                'liveProcessesAfterClose': live, 'zombieProcessesAfterClose': zombies}
            if live or zombies or resources['errors'] or not sampler_stopped_before_close:
                result['passed'] = False
                result['processCleanupFailure'] = 'Observed browser process cleanup/resource sampling is incomplete'
        if server is not None:
            server.shutdown(); server.server_close()
        result['servedSources'] = list(served.values())
        result['serverErrors'] = server_errors
        result['wallSeconds'] = time.monotonic() - started
        if failure is not None:
            result['passed'] = False
        if result.get('processCleanupFailure'):
            result['status'] = 'FAILED_CLEANUP'
        write_json(args.output / 'acceptance-results.json', result)
        print(json.dumps({'passed': result['passed'], 'status': result['status'], 'output': str(args.output),
                          'operations': list(result['operations']), 'failure': result.get('failure'),
                          'wallSeconds': result['wallSeconds']}), flush=True)
    return 0 if result['passed'] or result['status'] == 'PREFLIGHT_ONLY' else 2 if result['status'].startswith('BLOCKED') else 1


if __name__ == '__main__':
    raise SystemExit(main())
