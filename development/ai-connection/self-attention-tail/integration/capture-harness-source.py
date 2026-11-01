"""Capture old accepted attention once, or run its separately owned tail in a fresh browser.
Private arrays/models enter through Python/Playwright or a local File; HTTP serves docs only.
"""
import argparse
import hashlib
import http.server
import importlib.util
import json
import os
import struct
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'development/ai-connection/self-attention-tail/integration'
DIAGNOSTIC = ROOT / 'docs/shared/diffusion-models/diagnostics/self-attention-tail'
CORE = ROOT / 'development/ai-connection/self-attention-tail/core'
FROZEN_PLAN_SHA = '58a7a187d9580cd5af1d12e4d9552f8880a47c8a89e50b7bf1d27fec4ff11549'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def f32_sha(values):
    return sha(struct.pack('<' + str(len(values)) + 'f', *values))


def resource_harness():
    spec = importlib.util.spec_from_file_location('immutable_resource_browser', Path(__file__).with_name('resource-browser.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_anchored(path, expected):
    raw = path.read_bytes()
    if sha(raw) != expected:
        raise ValueError('Anchored artifact/reference mismatch: ' + path.name)
    return json.loads(raw)


def load_capture_inputs(side):
    old = resource_harness()
    payload, anchors = old.load_inputs(ROOT, side)
    low = side.lower()
    receipt_path = ROOT / f'development/ai-connection/qkv-next/hidden-runtime/{low}-comparison.json'
    receipt_raw = old.fixed_bytes(ROOT, str(receipt_path.relative_to(ROOT)))
    producer = json.loads(receipt_raw)
    artifact = read_anchored(ROOT.parent / f'diffusion-private-hidden/{low}-prefix-actual.json', producer['artifactSHA256'])
    for name in ('patchHidden', 'timeAct1'):
        if f32_sha(artifact['arrays'][name]) != producer['stages'][name]['actualF32SHA256']:
            raise ValueError('Full prefix array bit mismatch: ' + name)
    payload.update(fullPrefixArtifact=artifact, fullPrefixReceiptSHA256=sha(receipt_raw),
                   trustedProducer={'schemaVersion': producer['schemaVersion'], 'passed': producer['passed'],
                                    'artifactSHA256': producer['artifactSHA256'],
                                    'producerSourceSHA256': producer['producerSourceSHA256'], 'evidence': artifact['evidence']})
    anchors['fullPrefixReceiptSHA256'] = sha(receipt_raw)
    anchors['fullPrefixArrayIdentities'] = {name: f32_sha(artifact['arrays'][name]) for name in ('patchHidden', 'timeAct1')}
    return payload, anchors


def load_tail_inputs(side, private_dir, output_dir=OUTPUT):
    payload, anchors = load_capture_inputs(side)
    low = side.lower()
    plan_raw = (CORE / 'candidate-plan.json').read_bytes()
    if sha(plan_raw) != FROZEN_PLAN_SHA:
        raise ValueError('Frozen tail plan changed')
    plan = json.loads(plan_raw)
    capture_raw = (output_dir / f'{low}-attention-capture.json').read_bytes()
    receipt = json.loads(capture_raw)
    if not receipt['passed'] or not receipt['producerDisposed'] or not receipt['browserCloseBarrier']['browserDisconnected']:
        raise ValueError('Old native owner and browser close barrier required')
    if receipt['side'] != side or receipt['fullPrefixReceiptSHA256'] != payload['fullPrefixReceiptSHA256'] or receipt['fullPrefixArtifactSHA256'] != payload['priorArtifactSHA256']:
        raise ValueError('Capture side/fullprefix binding mismatch')
    attention = read_anchored(private_dir / f'{low}-attention-actual.json', receipt['artifactSHA256'])
    if attention['side'] != side or attention['contextSHA256'] != receipt['contextSHA256'] or f32_sha(attention['attention']) != receipt['contextSHA256']:
        raise ValueError('Actual attention bit identity mismatch')
    if receipt['headComparisons']['context-local']['actualSHA256'] != receipt['contextSHA256'] or receipt['headComparisons']['context-composed']['actualSHA256'] != receipt['contextSHA256']:
        raise ValueError('Accepted old context comparison identity mismatch')
    references = {}
    for kind, mode in [('local', 'LOCAL_ACTUAL_INPUTS'), ('composed', 'COMPOSED_INDEPENDENT_PREFIX')]:
        anchor_raw = (CORE / f'{low}-{kind}-reference-receipt.json').read_bytes()
        anchor = json.loads(anchor_raw)
        reference = read_anchored(private_dir / f'{low}-{kind}-reference.json', anchor['referenceSHA256'])
        if reference['side'] != side or reference['mode'] != mode or reference['planSHA256'] != FROZEN_PLAN_SHA or reference['gates'] != plan['gates']:
            raise ValueError('Tail reference mode/side/fixed gate mismatch')
        references[kind] = reference
        anchors[kind + 'TailReferenceReceiptSHA256'] = sha(anchor_raw)
        anchors[kind + 'TailReferenceSHA256'] = anchor['referenceSHA256']
    trusted = {'schemaVersion': 'bernini-self-attention-tail-trusted-inputs/0.1', 'side': side,
               'blockIndex': 0, 'scheduleIndex': 1 if side == 'HIGH' else 3, 'tokens': 2,
               'fullPrefix': {'receiptSHA256': payload['fullPrefixReceiptSHA256'], 'artifactSHA256': payload['priorArtifactSHA256'],
                              **{name + 'SHA256': anchors['fullPrefixArrayIdentities'][name] for name in ('patchHidden', 'timeAct1')}},
               'attention': {'receiptSHA256': sha(capture_raw), 'artifactSHA256': receipt['artifactSHA256'], 'contextSHA256': receipt['contextSHA256'],
                             'fullPrefixReceiptSHA256': payload['fullPrefixReceiptSHA256'], 'fullPrefixArtifactSHA256': payload['priorArtifactSHA256']},
               **{name: False for name in ('productionHiddenVerified', 'originalWorkflowInputsVerified', 'originalProductionPrecisionVerified', 'fullBlockVerified', 'modelInference', 'lowIsHighHandoff')},
               **{name: 'NOT_READY' for name in ('load', 'predict', 'sample')}}
    payload.update(actualAttentionArtifact=attention, attentionCaptureReceipt=receipt, trustedInputs=trusted,
                   localTailReference=references['local'], composedTailReference=references['composed'], tailPlan=plan)
    anchors.update(attentionCaptureReceiptSHA256=sha(capture_raw), actualAttentionArtifactSHA256=receipt['artifactSHA256'], actualContextSHA256=receipt['contextSHA256'], tailPlanSHA256=FROZEN_PLAN_SHA)
    return payload, anchors


def write_new(path, value, private=False):
    if private and (not path.is_absolute() or path.resolve().is_relative_to(ROOT)):
        raise ValueError('Private output must stay outside repository')
    raw = value if isinstance(value, str) else json.dumps(value, indent=2, allow_nan=False) + '\n'
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600 if private else 0o644)
    with os.fdopen(fd, 'w') as output:
        output.write(raw)


def source_snapshot(payload):
    paths = [Path(__file__)] + list(DIAGNOSTIC.glob('*.mjs'))
    hashes = {str(path.relative_to(ROOT)): sha(path.read_bytes()) for path in paths}
    candidates = dict(payload['actualSourceCandidates'])
    for path in (ROOT / 'docs/shared/diffusion-models/ort-bridge/self-attention-tail').glob('*'):
        if path.suffix in ('.mjs', '.js', '.wasm'):
            candidates[str(path.relative_to(ROOT))] = sha(path.read_bytes())
    candidates.update(hashes)
    observer = ROOT / 'docs/shared/diffusion-models/diagnostics/resource-observer/observer.mjs'
    candidates[str(observer.relative_to(ROOT))] = sha(observer.read_bytes())
    payload.update(actualSourceCandidates=candidates, executedHarnessSourceSHA256={str(Path(__file__).relative_to(ROOT)): hashes[str(Path(__file__).relative_to(ROOT))]})
    return hashes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=('capture', 'tail'), required=True)
    parser.add_argument('--side', choices=('HIGH', 'LOW'), action='append')
    parser.add_argument('--model-dir', type=Path, default=ROOT.parent / 'retained/bernini')
    parser.add_argument('--output-dir', type=Path, default=OUTPUT)
    parser.add_argument('--private-dir', type=Path, required=True)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    sides = args.side or ['HIGH', 'LOW']
    inputs = [(side, *(load_capture_inputs(side) if args.mode == 'capture' else load_tail_inputs(side, args.private_dir, args.output_dir))) for side in sides]
    if args.validate_only:
        print(json.dumps({'passed': True, 'mode': args.mode, 'admittedSides': sides, 'browserConstructed': False}))
        return
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if not args.private_dir.is_absolute() or args.private_dir.resolve().is_relative_to(ROOT):
        raise ValueError('Exclusive private directory must stay outside repository')
    args.private_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright
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
    try:
        with sync_playwright() as playwright:
            for side, payload, anchors in inputs:
                name = side.lower() + ('-attention-capture.json' if args.mode == 'capture' else '-tail-browser.json')
                output_path = args.output_dir / name
                if output_path.exists():
                    raise FileExistsError('Measurement output must not be overwritten: ' + name)
                source_hashes = source_snapshot(payload)
                if args.mode == 'tail':
                    wasm_path = ROOT / 'docs/shared/diffusion-models/ort-bridge/self-attention-tail/kernel.wasm'
                    payload['modules'].append({'role': 'Hike.self-attention-tail', 'sha256': sha(wasm_path.read_bytes()), 'path': str(wasm_path.relative_to(ROOT))})
                model = args.model_dir / ('Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors' if side == 'HIGH' else 'Bernini_LOW_fp8_e4m3fn_scaled.safetensors')
                if model.stat().st_size != 15574833216:
                    raise ValueError('Original model size mismatch')
                requests, errors = [], []
                started = time.monotonic()
                browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
                try:
                    page = browser.new_page()
                    page.set_default_timeout(300000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('request', lambda request: requests.append(request.url))
                    page.goto(f'http://127.0.0.1:{server.server_port}/')
                    page.set_content('<input type=file id=model>')
                    page.locator('#model').set_input_files(str(model))
                    result = page.evaluate("""async p=>{const module=await import('/shared/diffusion-models/diagnostics/self-attention-tail/'+p.mode+'.mjs');return module[p.mode==='capture'?'captureAcceptedAttention':'runAttentionTail'](document.querySelector('#model').files[0],p.payload);}""", {'mode': args.mode, 'payload': payload})
                    private_text = result.pop('privateArtifactText', None)
                    if private_text is not None:
                        artifact_hash = sha(private_text.encode())
                        if artifact_hash != result['artifactSHA256']:
                            raise ValueError('Returned private artifact serialization changed')
                        write_new(args.private_dir / (side.lower() + '-attention-actual.json'), private_text, private=True)
                    result.update(anchors=anchors, sourceSnapshotSHA256=source_hashes, browserVersion=browser.version,
                                  pageErrors=errors, modelHTTPRequests=[url for url in requests if '.safetensors' in url],
                                  privatePayloadPublished=False, wallSeconds=time.monotonic()-started,
                                  OSMeasurement={'PSSBytes': None, 'RSSBytes': None, 'totalPeakBytes': None})
                    if errors or result['modelHTTPRequests'] or not result['passed']:
                        raise ValueError('Browser diagnostic failed')
                finally:
                    browser.close()
                result['browserCloseBarrier'] = {'closedBeforeNextSide': True, 'browserDisconnected': not browser.is_connected(), 'processTerminationMeasured': False, 'gcReclamationClaimed': False}
                write_new(output_path, result)
                print(json.dumps({'passed': True, 'mode': args.mode, 'side': side, 'output': str(output_path), 'receiptSHA256': sha(output_path.read_bytes()), 'artifactSHA256': result.get('artifactSHA256'), 'contextSHA256': result.get('contextSHA256')}), flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
