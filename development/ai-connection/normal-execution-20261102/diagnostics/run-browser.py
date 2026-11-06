"""Run the normal P4 facade in Chromium using local private File inputs.

Only hashes, descriptors, counters, timing, memory, and numerical error metrics
leave the page. The model is never uploaded or read as one complete payload.
"""
import argparse
import hashlib
import http.server
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import threading
import time

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True

ROOT = Path('/workspace/work/diffusion-models')
HERE = ROOT / 'development/ai-connection/normal-execution-20261102/diagnostics'
HARNESS = HERE / 'browser-validation.mjs'
MODEL = Path('/workspace/work/retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors')
SAVED = Path('/workspace/work/diffusion-private-tail-saved-outputs-20261101/low-tail-outputs.json')
NATIVE = Path('/tmp/p4-real-text-l512/inputs/real-text-l512-native.json')
COMPOSED = Path('/tmp/p4-real-text-l512/composed/low')
LOCAL = Path('/tmp/p4-real-text-l512/local/low')
PATCH = Path('/tmp/p4-real-text-l512/lora-runtime-s1/low-runtime/actual-prepared-patches.json')
CROSS_NORM = Path('/tmp/p4-real-text-l512/runtime-base/low-runtime/crossNorm.f32')
EXPECTED_Q = Path('/tmp/p4-real-text-l512/lora-reference/s1/qkvQ.f32')
PATCH_ROUTE = '/_normal-p4-private-patch.json'
SHA = lambda data: hashlib.sha256(data).hexdigest()


def source_head():
    return subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()


def verify_sources(commit, names):
    if source_head() != commit:
        raise ValueError('Normal execution source commit must equal current HEAD')
    tracked = set(subprocess.check_output(['git', 'ls-files', '--', *names], cwd=ROOT, text=True).splitlines())
    if tracked != set(names) or subprocess.run(['git', 'diff', '--quiet', commit, '--', *names], cwd=ROOT).returncode:
        raise ValueError('Executed normal sources must be tracked and unchanged from fixed HEAD')
    return {name: SHA((ROOT / name).read_bytes()) for name in names}


def verify_frozen_files(frozen):
    entries = [frozen['inputFreeze'], frozen['savedTail'], frozen['nativeText']]
    for reference in frozen['references'].values():
        entries.append({'path': reference['manifestPath'], 'sha256': reference['manifestSHA256']})
        entries.extend(reference['arrays'].values())
    for entry in entries:
        path = Path(entry['path'])
        if SHA(path.read_bytes()) != entry['sha256']:
            raise ValueError('Frozen private input/reference changed: ' + str(path))
    return {'passed': True, 'verifiedFileCount': len(entries), 'referencesRegenerated': False}


def verify_weight_feed_inputs():
    frozen = json.loads((HERE / 'weight-feed-input-freeze.json').read_text())
    for entry in frozen['files']:
        path = Path(entry['path'])
        if path.stat().st_size != entry['bytes'] or SHA(path.read_bytes()) != entry['sha256']:
            raise ValueError('Frozen weight-feed input changed: ' + str(path))
    return {'passed': True, 'verifiedFileCount': len(frozen['files']), 'freezeSHA256': SHA((HERE / 'weight-feed-input-freeze.json').read_bytes()), 'patchArtifactSHA256': frozen['files'][0]['sha256'], 'scope': frozen['scope']}


def preflight_sources(commit):
    tracked = subprocess.check_output(['git', 'ls-files', '--', 'docs/shared/diffusion-models', 'docs/shared/inference', 'docs/shared/vr180'], cwd=ROOT, text=True).splitlines()
    names = sorted(set(['docs/shared/diffusion-models/execution/p4.mjs', 'docs/shared/diffusion-models/execution/capabilities.mjs', 'docs/shared/diffusion-models/execution/weight-feed-browser.mjs'] + [name for name in tracked if name.endswith(('.mjs', '.js', '.wasm'))]))
    inventory = verify_sources(commit, names)
    return {'passed': True, 'verifiedSourceCount': len(inventory), 'inventorySHA256': SHA(json.dumps(inventory, sort_keys=True, separators=(',', ':')).encode())}


def sampler_class():
    path = ROOT / 'tools/diffusion-models/p4-real-text-l512-browser.py'
    spec = importlib.util.spec_from_file_location('normal_p4_memory_sampler', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.MemorySampler


def handler_class():
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT / 'docs'), **kwargs)

        def do_GET(self):
            if self.path in ('/_normal-p4-validation.mjs', PATCH_ROUTE):
                data = (HARNESS if self.path == '/_normal-p4-validation.mjs' else PATCH).read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'text/javascript' if self.path == '/_normal-p4-validation.mjs' else 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                super().do_GET()

        def log_message(self, *args):
            pass
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--output', type=Path, default=HERE / 'normal-low-browser.json')
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError('Use a new receipt path')
    frozen = json.loads(Path('/tmp/normal-p4-frozen-input-reference-receipt.json').read_text())
    if not frozen['passed']:
        raise ValueError('Frozen private input/reference verification must pass before browser construction')
    for path in (MODEL, SAVED, NATIVE, COMPOSED / 'manifest.json', LOCAL / 'manifest.json', HARNESS, PATCH, CROSS_NORM, EXPECTED_Q):
        if not path.is_file():
            raise FileNotFoundError(path)
    frozen_preflight = verify_frozen_files(frozen)
    weight_feed_preflight = verify_weight_feed_inputs()
    source_preflight = preflight_sources(args.source_commit)
    sampler = sampler_class()()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler_class())
    threading.Thread(target=server.serve_forever, daemon=True).start()
    requests, errors = [], []
    result, browser, failure = None, None, None
    checkpoints = []
    def checkpoint(source, receipt):
        checkpoints.append(receipt)
        Path('/tmp/normal-p4-browser-checkpoint.json').write_text(json.dumps(receipt, indent=2) + '\n')
    began = time.monotonic()
    sampler.start()
    try:
        with sync_playwright() as playwright:
            try:
                browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
                page = browser.new_page()
                page.set_default_timeout(1800000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('request', lambda request: requests.append(request.url))
                page.expose_binding('__normalP4Phase', lambda source, event: sampler.phase_event(event))
                page.expose_binding('__normalP4Checkpoint', checkpoint)
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                page.set_content('<input type=file id=model><input type=file id=saved><input type=file id=native><input type=file id=composed multiple><input type=file id=local multiple><input type=file id=composedManifest><input type=file id=localManifest><input type=file id=crossNorm><input type=file id=expectedQ>')
                for name, path in [('model', MODEL), ('saved', SAVED), ('native', NATIVE), ('composedManifest', COMPOSED / 'manifest.json'), ('localManifest', LOCAL / 'manifest.json'), ('crossNorm', CROSS_NORM), ('expectedQ', EXPECTED_Q)]:
                    page.locator('#' + name).set_input_files(str(path))
                for name, directory in [('composed', COMPOSED), ('local', LOCAL)]:
                    page.locator('#' + name).set_input_files([str(path) for path in sorted(directory.glob('*.f32'))])
                result = page.evaluate("""async()=>{const module=await import('/_normal-p4-validation.mjs');return module.runNormalP4BrowserValidation();}""")
                executed = sorted({'docs/' + url.split('/', 3)[-1].split('?', 1)[0] for url in requests if url.split('?', 1)[0].endswith(('.mjs', '.js', '.wasm')) and '/_normal-p4-validation.mjs' not in url})
                result['sourceExecution'] = {'commit': args.source_commit, 'workingTreeSourcesMatchCommit': True, 'sources': verify_sources(args.source_commit, executed), 'harnessSHA256': SHA(HARNESS.read_bytes()), 'pythonHarnessSHA256': SHA(Path(__file__).read_bytes())}
                result['sourceExecution']['preflight'] = source_preflight
                result['frozenInputReferenceVerification'] = {'before': frozen_preflight, 'after': verify_frozen_files(frozen)}
                result['weightFeedInputVerification'] = {'before': weight_feed_preflight, 'after': verify_weight_feed_inputs()}
                private_requests = [url for url in requests if any(part in url for part in ('.safetensors', '.f32', '.wktensor', '/tmp/', 'native.json', 'tail-outputs.json', PATCH_ROUTE))]
                patch_requests = [url for url in private_requests if url.endswith(PATCH_ROUTE)]
                unexpected_private_requests = [url for url in private_requests if not url.endswith(PATCH_ROUTE)]
                if errors or unexpected_private_requests or len(patch_requests) != 1 or not result['passed']:
                    raise ValueError('Browser validation or private File isolation failed')
                result['browser'] = {'version': browser.version, 'pageErrorCount': len(errors), 'privateFileHTTPRequests': len(private_requests), 'authorizedRetainedPatchHTTPRequests': len(patch_requests), 'unexpectedPrivateFileHTTPRequests': len(unexpected_private_requests), 'modelHTTPRequests': 0, 'wallSeconds': time.monotonic() - began}
                result['frozenInputReferenceReceiptSHA256'] = SHA(Path('/tmp/normal-p4-frozen-input-reference-receipt.json').read_bytes())
            except BaseException as error:
                failure = {'schemaVersion': 'bernini-normal-p4-browser-failure/0.1', 'passed': False, 'errorType': type(error).__name__, 'errorMessage': str(error), 'lastPhase': sampler.phase, 'pageErrors': errors,'lastCheckpoint':checkpoints[-1] if checkpoints else None}
                raise
            finally:
                if browser:
                    browser.close()
    finally:
        memory = sampler.finish()
        server.shutdown()
        server.server_close()
        destination = result if result is not None and failure is None else failure
        if destination is not None:
            destination['browserMemory'] = memory
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(destination, indent=2) + '\n')
            print(json.dumps({'passed': destination['passed'], 'receipt': str(args.output), 'receiptSHA256': SHA(args.output.read_bytes()), 'wallSeconds': time.monotonic() - began}), flush=True)


if __name__ == '__main__':
    main()
