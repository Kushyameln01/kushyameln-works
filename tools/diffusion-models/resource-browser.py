"""Observe unchanged natural-N2 operators; models/private arrays never use HTTP."""
import argparse
import hashlib
import http.server
import json
import os
import subprocess
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ANCHOR_COMMIT = '78a3268166eca63e5daafb1b21e184224c4d14b1'
RUNTIME_COMMIT = 'e48021d8da29ef3b3b9e9d6161331c282798b6b3'
OLD = 'development/ai-connection/qkv-next/'
MODULE_PATHS = {
    'ORT': 'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm',
    'Hike.decode': 'docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm',
    'Hike.prefix-math': 'docs/shared/diffusion-models/ort-bridge/block-hidden/kernel.wasm',
    'Hike.latent': 'docs/shared/diffusion-models/latent-space/build/latent-space.wasm',
    'Hike.scheduler': 'docs/shared/diffusion-models/scheduler/build/scheduler.wasm',
    'Hike.norm': 'docs/shared/inference/kernel/tensor.wasm',
    'Hike.rope': 'docs/shared/diffusion-models/ort-bridge/qkv/kernel.wasm',
    'Hike.attention': 'docs/shared/diffusion-models/ort-bridge/stream-attention/kernel.wasm',
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def fixed_bytes(root, path, commit=ANCHOR_COMMIT):
    raw = subprocess.run(['git', '-C', str(root), 'show', commit + ':' + path],
                         check=True, capture_output=True).stdout
    if (root / path).read_bytes() != raw:
        raise ValueError('Fixed source changed: ' + path)
    return raw


def fixed_json(root, path):
    return json.loads(fixed_bytes(root, path))


def private_reference(path, receipt):
    raw = path.read_bytes()
    if sha(raw) != receipt['referenceSHA256']:
        raise ValueError('Private reference hash mismatch: ' + path.name)
    return json.loads(raw)


def load_inputs(root, side, local_path=None, hidden_dir=None, heads_dir=None):
    if side not in ('HIGH', 'LOW'):
        raise ValueError('Explicit HIGH or LOW side required')
    low = side.lower()
    handoff = fixed_json(root, OLD + 'handoff.json')
    if handoff['runtimeCodeCommit'] != RUNTIME_COMMIT:
        raise ValueError('Fixed runtime commit mismatch')
    runtime_sources = {}
    for path, receipt in handoff['commitAlignment']['assets'].items():
        raw = fixed_bytes(root, path, RUNTIME_COMMIT)
        if sha(raw) != receipt['sha256'] or len(raw) != receipt['bytes']:
            raise ValueError('Runtime inventory mismatch: ' + path)
        runtime_sources[path] = sha(raw)
    prefix_plan = fixed_json(root, OLD + 'hidden-core/candidate-plan.json')
    head_plan = fixed_json(root, OLD + 'expansion/candidate-plan.json')
    prefix_anchor = fixed_json(root, OLD + f'hidden-core/{low}-reference-receipt.json')
    local_anchor = fixed_json(root, OLD + f'expansion/{low}-local-reference-receipt.json')
    composed_anchor = fixed_json(root, OLD + f'expansion/{low}-composed-reference-receipt.json')
    producer = fixed_json(root, OLD + f'hidden-runtime/{low}-comparison.json')
    hidden_dir = hidden_dir or root.parent / 'diffusion-private-hidden'
    heads_dir = heads_dir or root.parent / 'diffusion-private-heads'
    prefix_path = hidden_dir / f'{low}-prefix-reference.json'
    local_path = local_path or heads_dir / f'{low}-local-binding-final-reference.json'
    composed_path = heads_dir / f'{low}-composed-reference.json'
    prefix = private_reference(prefix_path, prefix_anchor)
    local = private_reference(local_path, local_anchor)
    composed = private_reference(composed_path, composed_anchor)
    artifact_path = hidden_dir / f'{low}-prefix-actual.json'
    artifact_raw = artifact_path.read_bytes()
    if not producer['passed'] or sha(artifact_raw) != producer['artifactSHA256']:
        raise ValueError('Prior actual artifact mismatch')
    artifact = json.loads(artifact_raw)
    if prefix['gates'] != prefix_plan['gates']:
        raise ValueError('Prefix gate mismatch')
    if prefix['meta']['planSHA256'] != sha(fixed_bytes(root, OLD + 'hidden-core/candidate-plan.json')):
        raise ValueError('Prefix plan mismatch')
    for reference, mode in ((local, 'LOCAL_ACTUAL_HIDDEN'), (composed, 'COMPOSED_INDEPENDENT_PREFIX')):
        if reference['mode'] != mode or reference['side'] != side or reference['gates'] != head_plan['gates']:
            raise ValueError('Reference mode/side/gate mismatch')
        if reference['planSHA256'] != sha(fixed_bytes(root, OLD + 'expansion/candidate-plan.json')):
            raise ValueError('Head plan mismatch')
    if local['inputArtifactSHA256'] != sha(artifact_raw) or composed['inputArtifactSHA256'] != prefix_anchor['referenceSHA256']:
        raise ValueError('Local/composed reference provenance mismatch')
    if local['arrayIdentities']['hidden']['sha256'] != artifact['evidence']['hiddenSHA256']:
        raise ValueError('Local hidden bit identity mismatch')
    for path, expected in producer['producerSourceSHA256'].items():
        if sha(fixed_bytes(root, path, RUNTIME_COMMIT)) != expected:
            raise ValueError('Producer source mismatch: ' + path)
    modules = [{'role': role, 'sha256': sha(fixed_bytes(root, path, RUNTIME_COMMIT)), 'path': path}
               for role, path in MODULE_PATHS.items()]
    anchors = {
        'fixedHandoffCommit': ANCHOR_COMMIT, 'fixedRuntimeCommit': RUNTIME_COMMIT,
        'runtimeInventoryVerified': True, 'runtimeAssetCount': len(handoff['commitAlignment']['assets']),
        'runtimePackageMainSources': handoff['sourceBuild']['mainSources'],
        'reusedGuardScope': 'Fixed98-asset integrity and prior producer/reference receipt guards; old browser harnesses were not executed in this experiment',
        'priorArtifactSHA256': sha(artifact_raw), 'prefixReferenceSHA256': prefix_anchor['referenceSHA256'],
        'localReferenceSHA256': local_anchor['referenceSHA256'], 'composedReferenceSHA256': composed_anchor['referenceSHA256'],
        'prefixPlanSHA256': prefix['meta']['planSHA256'], 'headPlanSHA256': local['planSHA256'],
        'privateReferenceUTF8Bytes': {'prefix': prefix_path.stat().st_size, 'local': local_path.stat().st_size,
                                      'composed': composed_path.stat().st_size},
        'modelFullHashRecomputed': False,
    }
    return {'side': side, 'modules': modules, 'prefixReference': prefix, 'localReference': local,
            'composedReference': composed, 'priorEvidence': artifact['evidence'],
            'priorArtifactSHA256': sha(artifact_raw), 'actualSourceCandidates': runtime_sources}, anchors


def write_new_private(path, text):
    if not path.is_absolute() or path.resolve().is_relative_to(ROOT):
        raise ValueError('Private artifact must stay outside the repository')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as file:
        file.write(text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'development/ai-connection/qkv-followup/resources')
    parser.add_argument('--model-dir', type=Path, default=ROOT.parent / 'retained/bernini')
    parser.add_argument('--private-hidden-dir', type=Path, default=ROOT.parent / 'diffusion-private-hidden')
    parser.add_argument('--private-heads-dir', type=Path, default=ROOT.parent / 'diffusion-private-heads')
    parser.add_argument('--private-output-dir', type=Path)
    parser.add_argument('--side', choices=('HIGH', 'LOW'), action='append')
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    sides = args.side or ['HIGH', 'LOW']
    inputs = [(side, *load_inputs(ROOT, side, hidden_dir=args.private_hidden_dir, heads_dir=args.private_heads_dir)) for side in sides]
    if args.validate_only:
        print(json.dumps({'passed': True, 'admittedSides': sides, 'browserConstructed': False}))
        return
    from playwright.sync_api import sync_playwright
    output = args.output_dir
    output.mkdir(parents=True, exist_ok=True)
    for side in sides:
        if (output / (side.lower() + '-browser.json')).exists():
            raise FileExistsError('Existing measurement output must not be overwritten')
    private_dir = args.private_output_dir
    if private_dir is None:
        private_dir = Path(tempfile.mkdtemp(prefix='diffusion-private-resource-', dir=ROOT.parent))
    else:
        if not private_dir.is_absolute() or private_dir.resolve().is_relative_to(ROOT):
            raise ValueError('Private output directory must stay outside the repository')
        private_dir.mkdir(parents=True, exist_ok=False)
    docs = ROOT / 'docs'
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *values, **kwargs):
            super().__init__(*values, directory=str(docs), **kwargs)
        def log_message(self, *values):
            pass
        def translate_path(self, path):
            result = Path(super().translate_path(path)).resolve()
            return str(result if result.is_relative_to(docs) else docs / '__blocked__')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    source_paths = [Path(__file__), Path(__file__).with_name('test-resource-browser.py'),
                    Path(__file__).with_name('test-resource-browser.mjs'),
                    ROOT / 'tools/diffusion-models/test-resource-observer.mjs',
                    ROOT / 'docs/shared/diffusion-models/diagnostics/resource-observer/observer.mjs',
                    ROOT / 'docs/shared/diffusion-models/diagnostics/resource-observer/pipeline.mjs']
    source_hashes = {str(path.relative_to(ROOT)): sha(path.read_bytes()) for path in source_paths}
    executed_harness_hashes = {key: value for key, value in source_hashes.items() if Path(key).name in ('resource-browser.py', 'pipeline.mjs', 'observer.mjs')}
    candidate_plan_sha = sha((ROOT / 'development/ai-connection/qkv-followup/resources/candidate-plan.json').read_bytes())
    try:
        with sync_playwright() as playwright:
            for side, payload, anchors in inputs:
                payload['executedHarnessSourceSHA256'] = executed_harness_hashes
                payload['actualSourceCandidates'].update(executed_harness_hashes)
                model_name = 'Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors' if side == 'HIGH' else 'Bernini_LOW_fp8_e4m3fn_scaled.safetensors'
                model = args.model_dir / model_name
                if model.stat().st_size != 15574833216:
                    raise ValueError('Original model size mismatch')
                errors, requests = [], []
                started = time.monotonic()
                browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                                     args=['--disable-dev-shm-usage'])
                try:
                    page = browser.new_page()
                    page.set_default_timeout(300000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('request', lambda request: requests.append(request.url))
                    page.goto(f'http://127.0.0.1:{server.server_port}/')
                    page.set_content('<input type="file" id="model">')
                    page.locator('#model').set_input_files(str(model))
                    result = page.evaluate("""async payload => {
                      const {runResourcePipeline}=await import('/shared/diffusion-models/diagnostics/resource-observer/pipeline.mjs');
                      return runResourcePipeline(document.querySelector('#model').files[0],payload);
                    }""", payload)
                    artifact_text = result.pop('privateArtifactText')
                    if sha(artifact_text.encode()) != result['freshArtifactSHA256']:
                        raise ValueError('Returned fresh artifact bytes changed')
                    private_path = private_dir / (side.lower() + '-prefix-actual.json')
                    write_new_private(private_path, artifact_text)
                    result.update(anchors=anchors, diagnosticSourceAndTestSHA256=source_hashes,
                                  resourceCandidatePlanSHA256=candidate_plan_sha,
                                  browserVersion=browser.version, pageErrors=errors,
                                  modelHTTPRequests=[url for url in requests if '.safetensors' in url],
                                  privateArtifactPayloadPublished=False,
                                  privateArtifactBytes=len(artifact_text.encode()),
                                  OSMeasurement={'PSSBytes': None, 'RSSBytes': None, 'totalPeakBytes': None,
                                                 'reason': 'Not sampled in this observer-only experiment'},
                                  wallSeconds=time.monotonic() - started)
                    if errors or result['modelHTTPRequests'] or not result['passed']:
                        raise RuntimeError('Resource/numeric measurement failed: ' + json.dumps(result.get('error')))
                finally:
                    browser.close()
                result['browserCloseBarrier'] = {'closedBeforeNextSide': True, 'browserDisconnected': not browser.is_connected(),
                                                'processTerminationMeasured': False, 'ownedPSSBytes': None, 'gcReclamationClaimed': False}
                path = output / (side.lower() + '-browser.json')
                with path.open('x') as file:
                    json.dump(result, file, indent=2, allow_nan=False)
                    file.write('\n')
                print(json.dumps({'passed': result['passed'], 'side': side, 'output': str(path),
                                  'freshArtifactSHA256': result['freshArtifactSHA256'],
                                  'privateArtifactPath': str(private_path)}), flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
