"""Persist accepted tail output bits by a separate replay; never change acceptance receipts."""
import argparse
import hashlib
import http.server
import importlib.util
import json
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ACCEPTED_SHA = {'HIGH': '759380dcbe016b1f1d9a51579c21a1e1d47545d250e1badc9e93842a4537d62e', 'LOW': '93f7c2a03e36ec9a2bc1eaefbd794dc14e16a615bfaf0863ecc83236e206ad96'}
NAMES = ['o', 'gateProjection', 'gate', 'gated', 'residual']


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def harness():
    path = Path(__file__).with_name('tail-browser.py')
    spec = importlib.util.spec_from_file_location('frozen_tail_browser', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_export_inputs(side, private_dir, reference_dir, accepted_dir):
    module = harness()
    payload, anchors = module.load_tail_inputs(side, private_dir, accepted_dir, reference_dir)
    receipt_raw = (accepted_dir / (side.lower() + '-tail-browser.json')).read_bytes()
    if sha(receipt_raw) != ACCEPTED_SHA[side]:
        raise ValueError('Pinned accepted tail receipt changed')
    receipt = json.loads(receipt_raw)
    for path, expected in receipt['actualExecutedSourceSHA256'].items():
        if sha((ROOT / path).read_bytes()) != expected:
            raise ValueError('Frozen accepted tail execution source changed: ' + path)
    identities = {}
    for name in NAMES:
        comparison = receipt['comparisons']['local' + name[0].upper() + name[1:]]
        if comparison['failed'] != 0:
            raise ValueError('Accepted output comparison required')
        identities[name] = {'sha256': comparison['actualSHA256'], 'elements': comparison['values']}
    sources = {str(path.relative_to(ROOT)): sha(path.read_bytes()) for path in [Path(__file__), ROOT / 'docs/shared/diffusion-models/diagnostics/self-attention-tail/export.mjs']}
    admission_sources = {str(path.relative_to(ROOT)): sha(path.read_bytes()) for path in [Path(__file__).with_name('tail-browser.py'), Path(__file__).with_name('resource-browser.py')]}
    payload['actualSourceCandidates'].update(receipt['actualExecutedSourceSHA256'])
    payload['actualSourceCandidates'].update(sources)
    payload.update(acceptedOutputIdentities=identities, acceptedTailReceiptSHA256=ACCEPTED_SHA[side],
                   currentBuild=anchors['currentBuild'], executedHarnessSourceSHA256={str(Path(__file__).relative_to(ROOT)): sources[str(Path(__file__).relative_to(ROOT))]},
                   exportSourceSHA256=sources, reusedAdmissionSourceSHA256=admission_sources)
    return payload


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--private-dir', type=Path, default=ROOT.parent / 'diffusion-private-tail-attention-20261101')
    p.add_argument('--private-reference-dir', type=Path, default=ROOT.parent / 'diffusion-private-tail-reference-final-20261101')
    p.add_argument('--private-output-dir', type=Path, required=True)
    p.add_argument('--model-dir', type=Path, default=ROOT.parent / 'retained/bernini')
    p.add_argument('--accepted-dir', type=Path, default=ROOT / 'development/ai-connection/self-attention-tail/integration')
    p.add_argument('--output-dir', type=Path, default=ROOT / 'development/ai-connection/self-attention-tail/output-export')
    p.add_argument('--validate-only', action='store_true')
    a = p.parse_args()
    inputs = [(side, load_export_inputs(side, a.private_dir, a.private_reference_dir, a.accepted_dir)) for side in ('HIGH', 'LOW')]
    if not a.private_output_dir.is_absolute() or a.private_output_dir.resolve().is_relative_to(ROOT):
        raise ValueError('New private output directory must stay outside repository')
    if a.validate_only:
        print(json.dumps({'passed': True, 'purpose': 'accepted output persistence replay', 'admittedSides': ['HIGH', 'LOW'], 'browserConstructed': False}))
        return
    a.private_output_dir.mkdir(mode=0o700, parents=True, exist_ok=False)
    a.output_dir.mkdir(parents=True, exist_ok=False)
    module = harness()
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
    from playwright.sync_api import sync_playwright
    try:
        with sync_playwright() as playwright:
            for side, payload in inputs:
                model = a.model_dir / ('Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors' if side == 'HIGH' else 'Bernini_LOW_fp8_e4m3fn_scaled.safetensors')
                if model.stat().st_size != 15574833216:
                    raise ValueError('Original model size mismatch')
                browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
                requests, errors = [], []
                try:
                    page = browser.new_page()
                    page.set_default_timeout(300000)
                    page.on('request', lambda request: requests.append(request.url))
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(f'http://127.0.0.1:{server.server_port}/')
                    page.set_content('<input type=file id=model>')
                    page.locator('#model').set_input_files(str(model))
                    result = page.evaluate("""async payload=>{const {exportAcceptedTail}=await import('/shared/diffusion-models/diagnostics/self-attention-tail/export.mjs');return exportAcceptedTail(document.querySelector('#model').files[0],payload);}""", payload)
                    private_text = result.pop('privateArtifactText')
                    private_raw = private_text.encode()
                    if sha(private_raw) != result['privateArtifactSHA256']:
                        raise ValueError('Private output serialization hash mismatch')
                    artifact = json.loads(private_text)
                    for name, expected in payload['acceptedOutputIdentities'].items():
                        if module.f32_sha(artifact['arrays'][name]) != expected['sha256'] or len(artifact['arrays'][name]) != expected['elements']:
                            raise ValueError('Python output bit verification failed: ' + name)
                    if errors or any('.safetensors' in url for url in requests) or not result['acceptedOutputBitMatch']:
                        raise ValueError('Persistence replay failed')
                    private_path = a.private_output_dir / (side.lower() + '-tail-outputs.json')
                    module.write_new(private_path, private_text, private=True)
                    result.update(exportSourceSHA256=payload['exportSourceSHA256'], reusedAdmissionSourceSHA256=payload['reusedAdmissionSourceSHA256'], browserVersion=browser.version,
                                  modelHTTPRequests=[], pageErrors=errors)
                finally:
                    browser.close()
                result['browserCloseBarrier'] = {'closedBeforeNextSide': True, 'browserDisconnected': not browser.is_connected(), 'gcReclamationClaimed': False}
                output_path = a.output_dir / (side.lower() + '-export-receipt.json')
                module.write_new(output_path, result)
                print(json.dumps({'passed': True, 'side': side, 'privateOutputPath': str(private_path), 'privateArtifactSHA256': result['privateArtifactSHA256'], 'publicReceiptPath': str(output_path), 'publicReceiptSHA256': sha(output_path.read_bytes())}), flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
