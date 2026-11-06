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
import subprocess
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'development/ai-connection/self-attention-tail/integration'
DIAGNOSTIC = ROOT / 'docs/shared/diffusion-models/diagnostics/self-attention-tail'
CORE = ROOT / 'development/ai-connection/self-attention-tail/core'
CAPTURE_RECEIPT_SHA = {'HIGH': '75bdf4a9e6e09769d5edcbab400db103eead7822c92f12e355fc7028938b158b', 'LOW': '618c46b6ad4233a519516d923dc8df317b54c8f673299ef2428fba9b99c23e77'}
TAIL_REFERENCE_SHA = {'HIGH': {'local': 'eabbe3255c99b815615ac06736c52e2f8547403ddb095f0f84be481fab64c9f1', 'composed': '9ca18c2e852dbd981b4bec745eab1ac24e1dde76658478ddc673b7fa2f7b9d8e'}, 'LOW': {'local': 'ac7596ea3bb2a071d3f3827ce06d14d9df426351fad01ebfd76e3e03df43234e', 'composed': '2a30505c909fcca78fe1475a97c0cad01f0d2520b052abcefe628123681dd159'}}
FINAL_REFERENCE_RECEIPT_SHA = {'HIGH': {'local': '467bba24bce9066abf00156b534c8df9df999dd2bf314844bf72882b9f33814b', 'composed': '4f9a25ea913d59fb0ba4d9f7ea7977c805bf14da54e6058095dc41c901648ae5'}, 'LOW': {'local': '5fe1601c3ef0f4391cb55ccb6bd6340fbc543b8fd77ca83410c15cb91a319774', 'composed': '5a4499396cd8fbedfd2b7a45bcd70d5c79557854f7240471b2190dd232bc1582'}}
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
    if side not in ('HIGH', 'LOW'):
        raise ValueError('Explicit HIGH or LOW required')
    old = resource_harness()
    low = side.lower()
    base = 'development/ai-connection/qkv-next/'
    handoff = old.fixed_json(ROOT, base + 'handoff.json')
    if handoff['runtimeCodeCommit'] != old.RUNTIME_COMMIT:
        raise ValueError('Fixed runtime commit mismatch')
    metadata_paths = {'docs/shared/diffusion-models/api/build-info.py', 'docs/shared/diffusion-models/api/build-info.mjs'}
    runtime_sources, metadata_changes, current_equal = {}, {}, 0
    for path, expected in handoff['commitAlignment']['assets'].items():
        fixed = subprocess.run(['git', '-C', str(ROOT), 'show', old.RUNTIME_COMMIT + ':' + path], check=True, capture_output=True).stdout
        if sha(fixed) != expected['sha256'] or len(fixed) != expected['bytes']:
            raise ValueError('Old98 fixed-commit inventory mismatch: ' + path)
        current = (ROOT / path).read_bytes()
        if current != fixed:
            if path not in metadata_paths:
                raise ValueError('Immutable old numerical/runtime source changed: ' + path)
            metadata_changes[path] = {'oldSHA256': sha(fixed), 'currentSHA256': sha(current), 'scope': 'explicitly changed build closure metadata; not numerical execution source'}
        else:
            current_equal += 1
        runtime_sources[path] = sha(current)
    prefix_plan = old.fixed_json(ROOT, base + 'hidden-core/candidate-plan.json')
    head_plan = old.fixed_json(ROOT, base + 'expansion/candidate-plan.json')
    prefix_anchor = old.fixed_json(ROOT, base + f'hidden-core/{low}-reference-receipt.json')
    local_anchor = old.fixed_json(ROOT, base + f'expansion/{low}-local-reference-receipt.json')
    composed_anchor = old.fixed_json(ROOT, base + f'expansion/{low}-composed-reference-receipt.json')
    receipt_path = ROOT / (base + f'hidden-runtime/{low}-comparison.json')
    receipt_raw = old.fixed_bytes(ROOT, str(receipt_path.relative_to(ROOT)))
    producer = json.loads(receipt_raw)
    artifact = read_anchored(ROOT.parent / f'diffusion-private-hidden/{low}-prefix-actual.json', producer['artifactSHA256'])
    if not producer['passed']:
        raise ValueError('Accepted full-prefix receipt required')
    prefix = old.private_reference(ROOT.parent / f'diffusion-private-hidden/{low}-prefix-reference.json', prefix_anchor)
    local = old.private_reference(ROOT.parent / f'diffusion-private-heads/{low}-local-binding-final-reference.json', local_anchor)
    composed = old.private_reference(ROOT.parent / f'diffusion-private-heads/{low}-composed-reference.json', composed_anchor)
    prefix_plan_sha = sha(old.fixed_bytes(ROOT, base + 'hidden-core/candidate-plan.json'))
    head_plan_sha = sha(old.fixed_bytes(ROOT, base + 'expansion/candidate-plan.json'))
    if prefix['gates'] != prefix_plan['gates'] or prefix['meta']['planSHA256'] != prefix_plan_sha:
        raise ValueError('Fixed independent prefix gates/plan mismatch')
    for reference, mode in ((local, 'LOCAL_ACTUAL_HIDDEN'), (composed, 'COMPOSED_INDEPENDENT_PREFIX')):
        if reference['mode'] != mode or reference['side'] != side or reference['gates'] != head_plan['gates'] or reference['planSHA256'] != head_plan_sha:
            raise ValueError('Fixed independent head reference scope/gates/plan mismatch')
    if local['inputArtifactSHA256'] != producer['artifactSHA256'] or composed['inputArtifactSHA256'] != prefix_anchor['referenceSHA256'] or local['arrayIdentities']['hidden']['sha256'] != artifact['evidence']['hiddenSHA256']:
        raise ValueError('Fixed actual/composed prior input binding mismatch')
    for path, expected in producer['producerSourceSHA256'].items():
        if sha(old.fixed_bytes(ROOT, path, old.RUNTIME_COMMIT)) != expected:
            raise ValueError('Actual old producer executed source changed: ' + path)
    modules = [{'role': role, 'sha256': sha(old.fixed_bytes(ROOT, path, old.RUNTIME_COMMIT)), 'path': path} for role, path in old.MODULE_PATHS.items()]
    for name in ('patchHidden', 'timeAct1'):
        if f32_sha(artifact['arrays'][name]) != producer['stages'][name]['actualF32SHA256']:
            raise ValueError('Full prefix array bit mismatch: ' + name)
    anchors = {'fixedHandoffCommit': old.ANCHOR_COMMIT, 'fixedRuntimeCommit': old.RUNTIME_COMMIT,
               'old98FixedCommitInventoryVerified': True, 'oldPackageAssetCount': len(handoff['commitAlignment']['assets']),
               'currentOldPackageUnchangedAssetCount': current_equal, 'explicitBuildMetadataChanges': metadata_changes,
               'actualPriorProducerSourceCount': len(producer['producerSourceSHA256']), 'actualPriorProducerSourcesUnchanged': True,
               'reusedGuardScope': 'Old98 fixed commit bytes validated independently; current bytes checked except explicitly recorded root build-metadata updates; all old numerical modules and actual prior producer executed sources exact. No claim that old98 current package is unchanged.',
               'modelFullHashRecomputed': False, 'fullPrefixReceiptSHA256': sha(receipt_raw), 'priorArtifactSHA256': producer['artifactSHA256'],
               'prefixReferenceSHA256': prefix_anchor['referenceSHA256'], 'localReferenceSHA256': local_anchor['referenceSHA256'], 'composedReferenceSHA256': composed_anchor['referenceSHA256'],
               'prefixPlanSHA256': prefix_plan_sha, 'headPlanSHA256': head_plan_sha,
               'fullPrefixArrayIdentities': {name: f32_sha(artifact['arrays'][name]) for name in ('patchHidden', 'timeAct1')}}
    payload = {'side': side, 'modules': modules, 'prefixReference': prefix, 'localReference': local, 'composedReference': composed,
               'priorEvidence': artifact['evidence'], 'priorArtifactSHA256': producer['artifactSHA256'], 'actualSourceCandidates': runtime_sources,
               'fullPrefixArtifact': artifact, 'fullPrefixReceiptSHA256': sha(receipt_raw),
               'trustedProducer': {'schemaVersion': producer['schemaVersion'], 'passed': producer['passed'], 'artifactSHA256': producer['artifactSHA256'],
                                   'producerSourceSHA256': producer['producerSourceSHA256'], 'evidence': artifact['evidence']}}
    return payload, anchors


def verify_current_build():
    api = ROOT / 'docs/shared/diffusion-models/api'
    raw = (api / 'build-info.mjs').read_bytes()
    text = raw.decode()
    build_id = json.loads(text.split('export const BUILD_ID=', 1)[1].split(';', 1)[0])
    source_digest = json.loads(text.split('export const BUILD_SOURCE_SHA256=', 1)[1].split(';', 1)[0])
    inventory = json.loads(text.split('export const BUILD_SOURCES=Object.freeze(', 1)[1].rsplit(');', 1)[0])
    expected = 'bba4dc740028dcecf849a36e395970b24358a6185378336d61d3a063ad72bc74'
    if source_digest != expected or build_id != 'diffusion-models/0.1+' + expected or sha(json.dumps(inventory, sort_keys=True, separators=(',', ':')).encode()) != expected or len(inventory) != 100:
        raise ValueError('Frozen current100 build closure identity mismatch')
    for name, digest in inventory.items():
        path = (api / name).resolve()
        if not path.is_relative_to(ROOT) or sha(path.read_bytes()) != digest:
            raise ValueError('Frozen current100 source changed: ' + name)
    return {'buildId': build_id, 'sourceInventorySHA256': expected, 'verifiedSourceCount': len(inventory), 'buildInfoModuleSHA256': sha(raw), 'scope': 'current100 source closure; independently verified from current bytes; separate from historical old98 guard and actual requested execution modules'}


def load_tail_inputs(side, private_dir, output_dir=OUTPUT, reference_dir=None):
    reference_dir = reference_dir or ROOT.parent / 'diffusion-private-tail-reference-final-20261101'
    payload, anchors = load_capture_inputs(side)
    anchors['currentBuild'] = verify_current_build()
    low = side.lower()
    plan_raw = (CORE / 'candidate-plan.json').read_bytes()
    if sha(plan_raw) != FROZEN_PLAN_SHA:
        raise ValueError('Frozen tail plan changed')
    plan = json.loads(plan_raw)
    capture_raw = (output_dir / f'{low}-attention-capture.json').read_bytes()
    if sha(capture_raw) != CAPTURE_RECEIPT_SHA[side]:
        raise ValueError('Pinned actual attention capture receipt mismatch')
    receipt = json.loads(capture_raw)
    if receipt['blockIndex'] != 0 or receipt['scheduleIndex'] != (1 if side == 'HIGH' else 3) or receipt['tokens'] != 2:
        raise ValueError('Capture exact block/time/N2 scope mismatch')
    snapshots = json.loads((output_dir / 'capture-source-snapshot.json').read_bytes())
    for path, expected in receipt['producerSourceSHA256'].items():
        archived = snapshots.get(path)
        checked_path = ROOT / (archived['snapshotPath'] if archived else path)
        if sha(checked_path.read_bytes()) != expected:
            raise ValueError('Capture executed source bytes changed: ' + path)
    old_gates = payload['localReference']['gates']
    expected_old_gates = {**{'qkv.' + name: old_gates['projection'] for name in ('q', 'k', 'v')}, **{'norm.' + name: old_gates['qkNorm'] for name in ('q', 'k')}, 'matrices': old_gates['ropeMatrix'], 'q': old_gates['ropeApply'], 'k': old_gates['ropeApply'], 'v': old_gates['projection'], 'context-local': old_gates['allHeadContext'], 'context-composed': old_gates['composedPrefixToContext']}
    if set(receipt['headComparisons']) != set(expected_old_gates):
        raise ValueError('All prior accepted attention comparisons required')
    for name, gate in expected_old_gates.items():
        comparison = receipt['headComparisons'][name]
        if comparison['failed'] != 0 or comparison['gate'] != gate:
            raise ValueError('Prior accepted fixed numerical gate mismatch: ' + name)
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
        anchor_raw = (CORE / 'final-reference' / f'{low}-{kind}-reference-receipt.json').read_bytes()
        if sha(anchor_raw) != FINAL_REFERENCE_RECEIPT_SHA[side][kind]:
            raise ValueError('Final independent reference receipt mismatch')
        anchor = json.loads(anchor_raw)
        if anchor['referenceSHA256'] != TAIL_REFERENCE_SHA[side][kind]:
            raise ValueError('Pinned independent tail reference mismatch')
        reference = read_anchored(reference_dir / f'{low}-{kind}-reference.json', anchor['referenceSHA256'])
        if reference['side'] != side or reference['mode'] != mode or reference['planSHA256'] != FROZEN_PLAN_SHA or reference['gates'] != plan['gates']:
            raise ValueError('Tail reference mode/side/fixed gate mismatch')
        old_head_receipt = ROOT / f'development/ai-connection/qkv-next/expansion/{low}-composed-reference-receipt.json'
        expected_bindings = {'fullPrefixReceiptSHA256': payload['fullPrefixReceiptSHA256'], 'fullPrefixArtifactSHA256': payload['priorArtifactSHA256'], 'prefixReferenceSHA256': anchors['prefixReferenceSHA256'], 'headsReferenceSHA256': anchors['composedReferenceSHA256'], 'headsReferenceReceiptSHA256': sha(old_head_receipt.read_bytes()), 'contextArtifactSHA256': receipt['artifactSHA256'], 'contextReceiptSHA256': sha(capture_raw), 'contextSHA256': receipt['contextSHA256']}
        if reference['inputBindings'] != expected_bindings or anchor['inputBindings'] != expected_bindings:
            raise ValueError('Independent local/composed input provenance mismatch')
        actual_hashes = {'attention': receipt['contextSHA256'], **anchors['fullPrefixArrayIdentities']}
        independent_hashes = {'attention': payload['composedReference']['arrayIdentities']['attention']['sha256'], **{name: payload['prefixReference']['arrayIdentities'][name]['sha256'] for name in ('patchHidden', 'timeAct1')}}
        expected_hashes = actual_hashes if kind == 'local' else independent_hashes
        if any(reference['inputs'][name]['sha256'] != expected for name, expected in expected_hashes.items()):
            raise ValueError('Local exact actual / composed independent array bit identity mismatch')
        if reference['case'] != plan['cases'][0 if side == 'HIGH' else 1] or reference['modelHash'] != payload['priorEvidence']['modelHash']:
            raise ValueError('Independent reference exact model/side/time mismatch')
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
    parser.add_argument('--private-reference-dir', type=Path)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    sides = args.side or ['HIGH', 'LOW']
    inputs = [(side, *(load_capture_inputs(side) if args.mode == 'capture' else load_tail_inputs(side, args.private_dir, args.output_dir, args.private_reference_dir))) for side in sides]
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
                    result = page.evaluate("""async p=>{const names=['compile','compileStreaming','instantiate','instantiateStreaming','Instance'],originals=names.map(name=>WebAssembly[name]);const module=await import('/shared/diffusion-models/diagnostics/self-attention-tail/'+p.mode+'.mjs');const result=await module[p.mode==='capture'?'captureAcceptedAttention':'runAttentionTail'](document.querySelector('#model').files[0],p.payload);if(!names.every((name,i)=>WebAssembly[name]===originals[i]))throw Error('Diagnostic observer was not restored');result.observerRestoredAfterRun=true;return result;}""", {'mode': args.mode, 'payload': payload})
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
