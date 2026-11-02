"""Prepare or explicitly run the controlled N5 six-NN sampler in Chromium.

Normal mode calls the real candidate .sample. --diagnose calls .diagnose once
instead, collecting sixteen private sampler snapshots. Neither mode passes expected
arrays, reference receipts or acceptance gates into the candidate.
"""
import argparse
import hashlib
import http.server
import importlib.util
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DOCS = ROOT / 'docs'
_spec = importlib.util.spec_from_file_location('frozen_model_browser_helpers', Path(__file__).with_name('model-candidate-browser.py'))
BASE = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(BASE)
EXECUTION = 'docs/shared/diffusion-models/execution/'
SOURCE_FILES = sorted(set(BASE.SOURCE_FILES + [
    EXECUTION + name for name in [
        'model-sampler-browser.py', 'model-sampler-browser.mjs',
        'model-sampler-candidate.mjs', 'generated-space.mjs',
        'generated-space/kernel-registry.mjs', 'generated-space/build/generated-space.wasm',
    ]
] + [
    'docs/shared/diffusion-models/' + name for name in [
        'scheduler/scheduler-kernel.mjs', 'scheduler/build/scheduler.wasm',
        'euler-kernel.mjs', 'kernel-registry.mjs', 'kernel/euler.wasm',
        'tensor-interop.mjs',
    ]
] + ['docs/shared/inference/tensor.mjs', 'development/ai-connection/standalone-d1-d4-20261102/sampler-reference/contract.json']))
TRACE_NAMES = ['initialX', 'velocity00', 'step00X', 'velocity01', 'step01X', 'velocity02', 'step02X', 'highPublic', 'lowEntry', 'velocity03', 'step03X', 'velocity04', 'step04X', 'velocity05', 'step05X', 'finalRaw']
SHAPE = [1, 16, 1, 2, 4]
sha = BASE.sha
require = BASE.require


def source_guard(commit, previous=None):
    require(bool(re.fullmatch(r'[0-9a-f]{40}', commit)), 'Exact source commit SHA required')
    require(BASE.git('rev-parse', 'HEAD').decode().strip() == commit, 'HEAD differs from requested source commit')
    identities = {}
    for relative in SOURCE_FILES:
        BASE.git('ls-files', '--error-unmatch', '--', relative)
        actual = (ROOT / relative).read_bytes()
        require(actual == BASE.git('show', f'{commit}:{relative}'), f'Runtime source is uncommitted or changed: {relative}')
        identities[relative] = sha(actual)
    if previous is not None:
        require(identities == previous, 'Runtime bytes changed during native sampling')
    return identities


def private_tmp_path(value, label):
    path = BASE.private_path(value, label)
    temp = Path(tempfile.gettempdir()).resolve()
    require(path.is_relative_to(temp) and len(path.relative_to(temp).parts) >= 2, f'{label} must use a dedicated private /tmp subdirectory')
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--private-output', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='Public metrics and identities only')
    parser.add_argument('--models', type=Path, default=ROOT.parent / 'retained/bernini')
    parser.add_argument('--high-model', type=Path)
    parser.add_argument('--low-model', type=Path)
    parser.add_argument('--contract', type=Path, default=ROOT / 'development/ai-connection/standalone-d1-d4-20261102/reference/contract.json')
    parser.add_argument('--sampler-contract', type=Path, default=ROOT / 'development/ai-connection/standalone-d1-d4-20261102/sampler-reference/contract.json', help='Host-only frozen sampler identity/comparison binding; never passed into candidate')
    parser.add_argument('--core', type=Path, default=ROOT.parent / 'diffusion-investigation/model-architecture/comfy_ldm_wan_model.py')
    parser.add_argument('--chromium', default=shutil.which('chromium') or '/usr/bin/chromium')
    parser.add_argument('--timeout-seconds', type=float, default=21600)
    parser.add_argument('--diagnose', action='store_true', help='Use separate .diagnose path once; save all sixteen sampler snapshots')
    parser.add_argument('--check-only', action='store_true', help='Verify frozen inputs/source/model stats without launching a browser or executing NN work')
    args = parser.parse_args()
    require(args.timeout_seconds > 0 and math.isfinite(args.timeout_seconds), 'Positive timeout required')
    fixture = BASE.private_path(args.fixture, 'Private frozen fixture')
    BASE.private_parent(fixture)
    fixture_bytes = fixture.read_bytes()
    require(sha(fixture_bytes) == BASE.FIXTURE_SHA256, 'Exact frozen N5/L3 fixture bytes required')
    parsed_fixture = json.loads(fixture_bytes)
    require(len(parsed_fixture['construction']['explicitNoise']) == 128, 'Explicit frozen noise required')
    contract_bytes = args.contract.read_bytes()
    contract = json.loads(contract_bytes)
    require(contract['fixtureSHA256'] == BASE.FIXTURE_SHA256 and contract['headAllTokens'] == 5 and contract['allTextRows'] == 3, 'Frozen N5/L3 identity contract required')
    sampler_contract_bytes = args.sampler_contract.read_bytes()
    sampler_contract = json.loads(sampler_contract_bytes)
    require(sampler_contract['schemaVersion'] == 'bernini-independent-sampler-contract/0.1' and sampler_contract['fixtureSHA256'] == BASE.FIXTURE_SHA256 and set(sampler_contract['traceShapes']) == set(TRACE_NAMES), 'Frozen sixteen-array sampler contract required')
    require(sha(args.core.read_bytes()) == contract['coreSourceSHA256'], 'Pinned core source differs from frozen contract')
    private_output = private_tmp_path(args.private_output, 'Private sampler manifest')
    BASE.private_parent(private_output, create=True)
    trace_dir = private_output.with_name(private_output.name + '.traces')
    encoded_path = private_output.with_name(private_output.name + '.wktensor')
    metrics_output = args.output.resolve()
    progress_output = metrics_output.with_name(metrics_output.name + '.progress.jsonl')
    output_paths = [private_output, trace_dir, encoded_path, metrics_output, progress_output]
    require(len(set(output_paths)) == len(output_paths) and not any(path.exists() for path in output_paths), 'Distinct new private/public output paths required')
    require(not metrics_output.is_relative_to(trace_dir) and not progress_output.is_relative_to(trace_dir), 'Public outputs cannot be inside private traces')
    models = {side: (getattr(args, side.lower() + '_model') or args.models / contract['models'][side]['fileName']).resolve() for side in ['HIGH', 'LOW']}
    before = {side: BASE.stat_identity(path) for side, path in models.items()}
    for side in models:
        require(before[side]['st_size'] == contract['models'][side]['bytes'], 'Retained original model size differs: ' + side)
    source_hashes = source_guard(args.source_commit)
    require(contract_bytes == BASE.git('show', args.source_commit + ':development/ai-connection/standalone-d1-d4-20261102/reference/contract.json'), 'Contract differs from committed frozen identity contract')
    require(sampler_contract_bytes == BASE.git('show', args.source_commit + ':development/ai-connection/standalone-d1-d4-20261102/sampler-reference/contract.json'), 'Sampler contract differs from committed frozen contract')
    mode = 'diagnose' if args.diagnose else 'sample'
    base = {'sourceCommit': args.source_commit, 'sourceSHA256': source_hashes, 'fixtureSHA256': BASE.FIXTURE_SHA256, 'fixtureContractSHA256': sha(contract_bytes), 'samplerContractSHA256': sha(sampler_contract_bytes), 'coreSourceSHA256': contract['coreSourceSHA256'], 'models': contract['models'], 'modelStatBefore': before, 'fullModelFilesReadByServer': False, 'sourceFullFileHashRecomputed': False, 'privateValuesPublished': False, 'required81FrameWorkflowVerified': False, 'acceptedProduction': False, 'generationReady': False}
    if args.check_only:
        print(json.dumps({'checkOnly': True, 'passed': True, 'mode': mode, 'guardedSources': len(source_hashes), 'fixtureSHA256': BASE.FIXTURE_SHA256, 'sourceCommit': args.source_commit, 'nativeNNExecuted': False}))
        return
    from playwright.sync_api import sync_playwright

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *values, **options):
            super().__init__(*values, directory=str(DOCS), **options)

        def log_message(self, *values):
            pass

        def do_GET(self):
            if self.path == '/':
                payload = b'<!doctype html><meta charset="utf-8"><title>Private controlled sampler host</title>'
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            else:
                super().do_GET()

    trace_dir.mkdir(mode=0o700)
    os.chmod(trace_dir, 0o700)
    progress_output.parent.mkdir(parents=True, exist_ok=True)
    progress_fd = os.open(progress_output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    traces, checkpoints = {}, []
    saved = None

    def receive_trace(_source, trace):
        name = trace['name']
        require(name in TRACE_NAMES and name not in traces and (mode == 'diagnose' or name == 'finalRaw'), 'Unexpected or duplicate private sampler trace')
        require(trace['shape'] == SHAPE and len(trace['data']) == 128 and all(math.isfinite(value) for value in trace['data']), 'Finite exact N5 target trace required')
        path = trace_dir / (name + '.json')
        BASE.write_json(path, trace, private=True)
        traces[name] = path

    def receive_encoded(_source, encoded):
        nonlocal saved
        require(saved is None and len(encoded['bytes']) == encoded['byteLength'] and len(encoded['bytes']) < 65536, 'One compact encoded sample required')
        require(all(isinstance(value, int) and 0 <= value <= 255 for value in encoded['bytes']), 'Encoded sample byte values required')
        raw = bytes(encoded['bytes'])
        require(sha(raw) == encoded['sha256'], 'Encoded browser/host hash mismatch')
        fd = os.open(encoded_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as output:
            output.write(raw)
        saved = {'encodedSHA256': sha(raw), 'encodedBytes': len(raw), 'hostReadbackSHA256': sha(encoded_path.read_bytes())}

    def receive_checkpoint(_source, event):
        checkpoints.append(event)
        with os.fdopen(os.dup(progress_fd), 'w') as output:
            output.write(json.dumps(event, separators=(',', ':'), allow_nan=False) + '\n')
        if event.get('stage') in ['prepared', 'prediction-start', 'step-complete', 'block-complete', 'terminal']:
            print(json.dumps({key: event.get(key) for key in ['stage', 'step', 'side', 'block', 'elapsedMs', 'outcome']}), flush=True)

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    started = time.perf_counter()
    result, disk_readback = None, None
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=args.chromium, headless=True, args=['--disable-dev-shm-usage'])
            try:
                page = browser.new_page()
                page.expose_binding('privateSamplerTrace', receive_trace)
                page.expose_binding('privateSamplerEncoded', receive_encoded)
                page.expose_binding('samplerCheckpoint', receive_checkpoint)
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                page.set_content('<input id="high" type="file"><input id="low" type="file"><input id="fixture" type="file"><input id="saved" type="file">')
                for side, model in models.items():
                    page.locator('#' + side.lower()).set_input_files(str(model))
                page.locator('#fixture').set_input_files(str(fixture))
                result = page.evaluate('''async options => {
                    const {runModelSamplerBrowser}=await import('/shared/diffusion-models/execution/model-sampler-browser.mjs');
                    return runModelSamplerBrowser({...options,
                        files:{HIGH:document.querySelector('#high').files[0],LOW:document.querySelector('#low').files[0]},
                        fixtureFile:document.querySelector('#fixture').files[0],
                        deliverTrace:window.privateSamplerTrace,deliverEncoded:window.privateSamplerEncoded,
                        checkpoint:window.samplerCheckpoint});
                }''', {'mode': mode, 'timeoutMs': args.timeout_seconds * 1000})
                result['chromiumVersion'] = browser.version
                if result['outcome'] == 'completed':
                    require(saved is not None, 'Completed sample must have actual saved encoded bytes')
                    page.locator('#saved').set_input_files(str(encoded_path))
                    disk_readback = page.evaluate('''async () => {
                        const {readSavedSamplerFile}=await import('/shared/diffusion-models/execution/model-sampler-browser.mjs');
                        return readSavedSamplerFile(document.querySelector('#saved').files[0]);
                    }''')
                    require(disk_readback['encodedSHA256'] == saved['encodedSHA256'] == result['codec']['encodedSHA256'], 'Disk encoded readback hash mismatch')
                    require(disk_readback['payloadSHA256'] == result['codec']['payloadSHA256'] and disk_readback['metadata'] == result['codec']['metadata'] and disk_readback['payloadElements'] == 128, 'Disk payload/metadata readback mismatch')
            finally:
                browser.close()
    except Exception as caught:
        result = {'schemaVersion': 'bernini-model-sampler-browser/0.1', 'mode': mode, 'outcome': 'browser-failed', 'nativeSixFull40PredictionsExecuted': False, 'error': {'name': type(caught).__name__, 'message': str(caught)[:1000]}, 'traceCount': len(traces), 'events': checkpoints}
    finally:
        server.shutdown()
        os.close(progress_fd)
    after = {side: BASE.stat_identity(path) for side, path in models.items()}
    require(before == after, 'Retained original model stat changed during sampling')
    source_guard(args.source_commit, source_hashes)
    require(sha(fixture.read_bytes()) == BASE.FIXTURE_SHA256 and sha(args.contract.read_bytes()) == sha(contract_bytes) and sha(args.sampler_contract.read_bytes()) == sha(sampler_contract_bytes) and sha(args.core.read_bytes()) == contract['coreSourceSHA256'], 'Fixture, identity contracts or pinned core changed during sampling')
    complete = result['outcome'] == 'completed'
    if complete:
        require(set(traces) == (set(TRACE_NAMES) if args.diagnose else {'finalRaw'}), 'Complete trace population required for selected mode')
        require(saved is not None and disk_readback is not None, 'Actual codec save and disk readback required')
    private = {'schemaVersion': 'bernini-model-sampler-private/0.1', 'sourceCommit': args.source_commit, 'mode': mode, 'fixtureSHA256': BASE.FIXTURE_SHA256, 'samplerContractSHA256': sha(sampler_contract_bytes), 'acceptedProduction': False, 'nativeSixFull40PredictionsExecuted': complete, 'arrays': {name: json.loads(path.read_text()) for name, path in traces.items()}, 'encodedSample': saved, 'diskReadback': disk_readback}
    BASE.write_json(private_output, private, private=True)
    receipt = {**base, **result, 'modelStatAfter': after, 'sourceStatStableDuringReads': True, 'runtimeSourcesUnchanged': True, 'privateCandidateSHA256': sha(private_output.read_bytes()), 'privateCandidateBytes': private_output.stat().st_size, 'savedRawSample': saved, 'diskReadback': disk_readback, 'hostElapsedSeconds': time.perf_counter() - started, 'acceptedProduction': False, 'generationReady': False, 'publicRuntimeEnabled': False, 'required81FrameWorkflowVerified': False, 'originalProductionPrecisionVerified': False}
    BASE.write_json(metrics_output, receipt)
    print(json.dumps({'outcome': result['outcome'], 'metricsOutput': str(metrics_output), 'traceCount': len(traces), 'nativeSixFull40PredictionsExecuted': complete, 'codecDiskReadback': disk_readback is not None, 'acceptedProduction': False, 'required81FrameWorkflowVerified': False}), flush=True)


if __name__ == '__main__':
    main()
