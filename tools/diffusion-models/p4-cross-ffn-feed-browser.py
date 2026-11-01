"""Two-phase actual immutable-base/final-F32 sink/runtime diagnostic.

Prepare reads bounded Hike-decoded Q-weight rows 0..4 and bias 0..4, then
exports a private caller-final-F32 sign-bit fixture. Generate an independent
composed reference with p4-cross-ffn-reference.py --patches before validate.
Only docs are served over HTTP; model/input/reference/patch bytes stay private.
"""
import argparse
import http.server
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time

_spec = importlib.util.spec_from_file_location('p4_cross_ffn_browser', Path(__file__).with_name('p4-cross-ffn-browser.py'))
_base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_base)
ROOT, SAVED = _base.ROOT, _base.SAVED
module_at, sha, private_write = _base.module_at, _base.sha, _base.private_write
load_saved_inputs, verify_old_packages, handler_for = _base.load_saved_inputs, _base.verify_old_packages, _base.handler_for
OUTPUT = ROOT / 'development/ai-connection/p4-cross-ffn/feed-integration'
TARGETS = {'blocks.0.cross_attn.q.weight': ([5120, 5120], 20480, 'runtime-input'),
           'blocks.0.cross_attn.q.bias': ([5120], 4, 'hike-parameter')}
PUBLIC_KEYS = frozenset(('schemaVersion', 'passed', 'numericalAccepted', 'side', 'candidatePlanSHA256', 'inputClass', 'registry', 'patches', 'privatePatchSHA256', 'resources', 'lowRankMathImplemented', 'fullFileHashRecomputed', 'generationReady', 'inputBindings', 'validation', 'referenceSHA256', 'patchArtifactSHA256', 'outputIdentities', 'boundaries', 'observer', 'acceptance', 'privateArtifactSHA256', 'sourceSHA256', 'sourceCommit', 'observerRestoredAfterRun', 'browser', 'parameterProof', 'baseProviderProof'))
VALIDATION_KEYS = frozenset(('schemaVersion', 'modelHash', 'graphHash', 'registryHash', 'side', 'executionProfileId', 'scope', 'candidateId', 'packageHash', 'valid', 'referenceId', 'gateId', 'expectedSHA256', 'outputSHA256', 'inputHashes', 'inputBindingHash', 'tolerance', 'maxAbsoluteError', 'failedValues', 'modelInference', 'generationReady', 'canonicalLoraAdapterExtension', 'evidence'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def browser_payload_argument(payload):
    # This Playwright Python version maps both float(+0) and float(-0) to JS -0.
    # JSON text crosses that serializer as one string; JSON.parse preserves the
    # sign of every zero in the original finite numeric payload.
    return _base.encode_browser_payload(payload)


def private_input(path):
    path = Path(path)
    require(path.is_absolute() and path.resolve().is_relative_to(Path('/tmp')), 'Private input must stay under /tmp')
    require(path.stat().st_mode & 0o777 == 0o600 and path.parent.stat().st_mode & 0o777 == 0o700, 'Private input requires file 0600 and parent 0700')


def load_patches(path, side, ref):
    payload, digest = ref.read_json(path)
    blocks, public = ref.validate_patches(payload, side, ref.load_plan())
    require(set(p['key'] for p in blocks) == set(TARGETS) and len(blocks) == 2, 'Exactly Q-weight and Q-bias diagnostic patches required')
    for patch in payload['patches']:
        shape, count, kind = TARGETS[patch['weightId']]
        require(patch['fullShape'] == shape and patch['offset'] == 0 and patch['count'] == count and patch['binding'] == {'kind': kind, 'name': patch['weightId']}, 'Diagnostic full shape/range/binding mismatch')
    private_input(path)
    return Path(path).read_text(), digest, public


def load_expected(path, expected_file_sha256, side, bindings, ref):
    payload, digest = ref.read_json(path)
    require(re.fullmatch('[0-9a-f]{64}', expected_file_sha256 or '') and digest == expected_file_sha256, 'Independent reference file hash mismatch')
    plan = ref.load_plan()
    require(payload.get('schemaVersion') == 'bernini-p4-reference/0.1' and payload.get('mode') == 'COMPOSED_FROM_SAVED_N2_TAIL' and payload.get('side') == side and payload.get('candidatePlanSHA256') == ref.PLAN_SHA256 and payload.get('profileId') == plan['profileId'] and payload.get('gates') == plan['gates'], 'Frozen composed reference schema/mode/side/plan/gate mismatch')
    require(payload.get('modelHash') == ref.MODELS[side][1] and payload.get('headerSHA256') == ref.MODELS[side][2], 'Composed reference original model/header mismatch')
    require(all(payload.get('inputBindings', {}).get(key) == value for key, value in bindings.items()), 'Composed reference saved/fixture/patch input binding mismatch')
    if 'finalF32PatchArtifactSHA256' in bindings:
        require(payload.get('weightFeed', {}).get('inputArtifactSHA256') == bindings['finalF32PatchArtifactSHA256'], 'Composed reference final-F32 patch artifact binding missing')
    require(set(payload.get('expected', {})) == set(ref.ARRAY_SHAPES), 'All25 independent composed expected arrays required')
    for key, shape in ref.ARRAY_SHAPES.items():
        array = ref.f32_array(payload['expected'][key], [4 if n == 'L' else n for n in shape])
        require(ref.identity(array) == payload.get('arrayIdentities', {}).get(key), 'Composed reference exact F32 array identity mismatch: ' + key)
    private_input(path)
    return payload['expected']['blockOutput'], payload['arrayIdentities']['blockOutput']['sha256'], digest


def verify_patched_parameter_identities(actual, reference, patch_public, patch_hash, package_hash):
    """Strict original-raw/final-consumed proof for all29 actual selections.

    This separate path permits an independently expected changed final only on
    declared patch targets. It does not weaken the historical baseline helper.
    Untouched base-decode bits within patched selections remain the same-source
    baseline proof's scope; no additional original-F32 payload is exported.
    """
    expected = reference.get('parameterSources', {})
    require(reference.get('inputBindings', {}).get('finalF32PatchArtifactSHA256') == patch_hash and reference.get('weightFeed', {}).get('inputArtifactSHA256') == patch_hash, 'Independent parameter proof patch artifact binding mismatch')
    patches = patch_public['patches']
    require(reference.get('weightFeed', {}).get('patches') == patches and set(p['weightId'] for p in patches) == set(TARGETS), 'Independent parameter proof declared targets mismatch')
    require(isinstance(actual, dict) and len(actual) == 29, 'All29 actual parameter selections required')
    require(re.fullmatch('[0-9a-f]{64}', package_hash or ''), 'Actual validated package hash required')
    # Shared frozen29 structure/hash checks retain the baseline's strict default.
    # Explicit bound patch scope changes only its original-decode equality rule.
    _base.verify_parameter_identities(actual, expected, patch_scope={'artifactSHA256': patch_hash, 'allowedTargetIds': sorted(TARGETS)})
    patch_signatures = {(p['weightId'], p['offset'], p['count'], p['sha256']) for p in patches}
    observed_patches, changed_targets, verified = set(), set(), {}
    for runtime_key, source in actual.items():
        key = source['originalKey']
        matrix = 'selectedRows' in source
        record = expected[runtime_key]
        require(source.get('fullShape') == record.get('fullShape') and source.get('storageDtype') == record.get('storageDtype'), 'Independent parameter original shape/dtype mismatch: ' + runtime_key)
        shape = record['fullShape']
        if matrix:
            require(source['selectedRows'] == record.get('selectedRows'), 'Independent parameter row extent mismatch: ' + runtime_key)
            start, stop = (row * shape[1] for row in source['selectedRows'])
        else:
            start, stop = source.get('elementOffset', 0), source.get('elementOffset', 0) + source.get('elementCount', 0)
            require([start, stop] == record.get('selectedElements'), 'Independent parameter element extent mismatch: ' + runtime_key)
        binding = {'kind': 'runtime-input' if matrix else 'hike-parameter', 'name': key}
        require(source.get('binding') == binding, 'Actual parameter binding mismatch: ' + runtime_key)
        unit = 1 if record['storageDtype'] == 'F8_E4M3' else 2
        actual_offset = source.get('absoluteByteOffset', -1)
        require(actual_offset == record.get('absoluteByteOffset') and source.get('selectedRawBytes', source.get('selectedByteLength')) == (stop - start) * unit == record.get('selectedRawBytes'), 'Independent parameter byte offset/extent mismatch: ' + runtime_key)
        actual_final = source.get('effectiveF32SHA256', source.get('decodedF32SHA256'))
        final, decoded = record.get('finalF32SHA256'), record.get('decodedF32SHA256')
        require(all(re.fullmatch('[0-9a-f]{64}', value or '') for value in (final, decoded, record.get('rawSHA256'))), 'Independent parameter raw/decoded/final hashes required: ' + runtime_key)
        require(source.get('rawSHA256') == record['rawSHA256'] and actual_final == final, 'Independent original raw/final F32 bits mismatch: ' + runtime_key)
        overlaps = [p for p in patches if p['weightId'] == key and start < p['offset'] + p['count'] and p['offset'] < stop]
        require((decoded != final) == bool(overlaps), 'Changed final F32 must match declared patch target: ' + runtime_key)
        if overlaps:
            changed_targets.add(key)
        require(source.get('weightFeed', {}).get('packageHash') == package_hash, 'Actual parameter package binding mismatch: ' + runtime_key)
        feed_bindings = source.get('tileBindings', [source.get('weightFeed', {})])
        for feed in feed_bindings:
            require(feed.get('packageHash') == package_hash, 'Actual parameter tile package binding mismatch: ' + runtime_key)
            for patch in feed.get('patches', []):
                signature = (patch.get('weightId'), patch.get('offset'), patch.get('count'), patch.get('blockSHA256'))
                require(signature in patch_signatures, 'Actual undeclared patch tile binding: ' + runtime_key)
                observed_patches.add(signature)
        if record['storageDtype'] == 'F8_E4M3':
            stem = key[:-7]
            for field, suffix in (('scaleSHA256', '.weight_scale'), ('quantConfigSHA256', '.comfy_quant')):
                require(source.get(field) == record.get(field) == expected.get(stem + suffix, {}).get('rawSHA256'), 'Independent FP8 scale/profile bytes mismatch: ' + runtime_key)
            require(source.get('fp8ProfileId') == record.get('fp8ProfileId') == 'scaled-e4m3fn-scalar-f32-v1', 'Independent FP8 profile mismatch: ' + runtime_key)
        verified[runtime_key] = {'originalKey': key, 'fullShape': shape, 'storageDtype': record['storageDtype'], 'binding': binding, 'selectedElements': [start, stop], 'absoluteByteOffset': actual_offset, 'rawSHA256': record['rawSHA256'], 'independentOriginalDecodedF32SHA256': decoded, 'actualFinalF32SHA256': final, 'declaredPatchApplied': bool(overlaps), **{field: source[field] for field in ('fp8ProfileId', 'scaleSHA256', 'quantConfigSHA256') if field in source}}
    require(observed_patches == patch_signatures and changed_targets == set(TARGETS), 'Every declared final-F32 patch must be independently changed and actually consumed')
    return {'verifiedParameterCount': len(verified), 'parameters': verified, 'strictOriginalRawAndConsumedFinalBits': True, 'patchArtifactSHA256': patch_hash, 'declaredTargets': sorted(TARGETS), 'scope': 'All29 actual original-storage raw hashes, original fullshape/selection/binding, and final F32 consumed hashes vs independent patched reference. Patched selections original decode bits outside the small provider proof retain same-source baseline scope; baseline acceptance helper unchanged.'}


def verify_prepared_base(receipt, model, side, ref):
    """Independent bounded Python decode of the provider's two original slices."""
    source = ref.Parameters(model, side, ref.load_plan())
    verified = []
    try:
        for patch in receipt['patches']:
            key = patch['weightId']
            spec = dict(source.plan['parameters'][key])
            if len(spec['fullShape']) == 2:
                spec['selectedRows'] = [0, 4]
            else:
                spec['selectedElements'] = [0, 4]
            offset, count = source.selection(key, spec)
            raw = source.read(offset, count)
            decoded = ref.decode_fp8(raw, source.scales[key]) if spec['storageDtype'] == 'F8_E4M3' else ref.decode_f16(raw)
            decoded_hash = ref.identity(decoded)['sha256']
            require(decoded_hash == patch['baseF32SHA256'], 'Independent provider original decoded F32 bits mismatch: ' + key)
            verified.append({'weightId': key, 'fullShape': spec['fullShape'], 'offset': 0, 'count': patch['count'], 'storageDtype': spec['storageDtype'], 'rawSHA256': sha(raw), 'decodedF32SHA256': decoded_hash, 'actualHikeProviderBitsExact': True})
        target = next(t for t in receipt['registry']['targets'] if t['weightId'] == 'blocks.0.cross_attn.q.weight')
        require(target['scaleSHA256'] == source.sources['blocks.0.cross_attn.q.weight_scale']['rawSHA256'] and target['quantConfigSHA256'] == source.sources['blocks.0.cross_attn.q.comfy_quant']['rawSHA256'], 'Independent provider FP8 scale/profile hash mismatch')
    finally:
        source.close()
    return {'selections': verified, 'independentBoundedDecodeBitsExact': True, 'modelFullHashRecomputed': False, 'scope': 'Only original Q first4rows and bias first4elements; no full matrix or prefix recomputation.'}


def public_projection(value):
    result = {key: item for key, item in value.items() if key in PUBLIC_KEYS}
    if 'validation' in result:
        result['validation'] = {key: item for key, item in result['validation'].items() if key in VALIDATION_KEYS}
    def verify(item, path=()):
        if isinstance(item, dict):
            for key, nested in item.items():
                if key in ('arrays', 'data', 'expected', 'attentionMask', 'raw', 'values', 'scale', 'privateArtifactText', 'privatePatchText'):
                    scale_identity = (key == 'scale' and path == ('outputIdentities',) and isinstance(nested, dict)
                                      and set(nested) == {'shape', 'elements', 'bytes', 'sha256'} and nested['shape'] == [5120]
                                      and type(nested['elements']) is int and nested['elements'] == 5120
                                      and type(nested['bytes']) is int and nested['bytes'] == 20480
                                      and isinstance(nested['sha256'], str) and re.fullmatch('[0-9a-f]{64}', nested['sha256']))
                    if not scale_identity:
                        raise ValueError('Private field in public receipt: ' + '.'.join(path + (key,)))
                verify(nested, path + (key,))
        elif isinstance(item, list):
            for nested in item:
                verify(nested, path)
    verify(result)
    return result


def source_inventory():
    inventory = _base.source_inventory()
    name = 'tools/diffusion-models/p4-cross-ffn-feed-browser.py'
    inventory[name] = sha((ROOT / name).read_bytes())
    return inventory


def frozen_source(commit):
    require(re.fullmatch('[0-9a-f]{40}', commit or ''), 'Explicit frozen source commit required')
    subprocess.run(['git', 'merge-base', '--is-ancestor', commit, 'HEAD'], cwd=ROOT, check=True, capture_output=True)
    paths = ['docs/shared/diffusion-models', 'docs/shared/inference', 'docs/shared/vr180/sha256.mjs',
             'tools/diffusion-models/p4-cross-ffn-feed-browser.py', 'tools/diffusion-models/p4-cross-ffn-browser.py', 'tools/diffusion-models/p4-cross-ffn-reference.py']
    changed = subprocess.check_output(['git', 'diff', '--name-only', commit, '--', *paths], cwd=ROOT, text=True)
    require(not changed.strip(), 'Execution source differs from frozen commit')
    for path in paths[3:]:
        committed = subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)
        require(sha(committed) == sha((ROOT / path).read_bytes()), 'CLI source differs from frozen commit')


def build_payload(side, saved_dir, patches_path=None, reference_path=None, reference_sha256=None, base_output_sha256=None):
    ref = module_at('p4-cross-ffn-reference')
    payload, saved_bindings = load_saved_inputs(side, saved_dir)
    old_package = verify_old_packages(side, payload)
    text, mask, metadata = ref.fixture_conditioning()
    bindings = {'savedArtifactSHA256': saved_bindings['savedArtifactSHA256'], 'conditioningDataSHA256': ref.identity(text)['sha256'], 'conditioningMaskSHA256': sha(mask.tobytes()), 'fixtureContractSHA256': ref.load_plan()['fixtureContractSHA256']}
    payload.update(candidatePlanSHA256=ref.PLAN_SHA256, inputBindings=bindings,
                   conditioning={'shape': [1, 4, 4096], 'data': text.reshape(-1).tolist(), 'attentionMask': mask.tolist(), 'fixtureId': metadata['fixtureId'], 'sourceRef': {'path': ref.load_plan()['fixtureContractPath'], 'sha256': bindings['fixtureContractSHA256']}},
                   outputShapes={name: [4 if n == 'L' else n for n in shape] for name, shape in ref.ARRAY_SHAPES.items()})
    if patches_path:
        patch_text, patch_hash, _ = load_patches(patches_path, side, ref)
        bindings['finalF32PatchArtifactSHA256'] = patch_hash
        expected, expected_hash, reference_hash = load_expected(reference_path, reference_sha256, side, bindings, ref)
        payload.update(patchArtifactText=patch_text, expectedBlockOutput=expected, expectedSHA256=expected_hash, referenceSHA256=reference_hash)
    if base_output_sha256:
        require(re.fullmatch('[0-9a-f]{64}', base_output_sha256), 'Baseline output SHA256 required')
        payload['baseOutputSHA256'] = base_output_sha256
    return payload, {'savedTailGuard': saved_bindings, 'oldE4Package': old_package}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    phase = parser.add_mutually_exclusive_group(required=True)
    phase.add_argument('--prepare', action='store_true')
    phase.add_argument('--validate', action='store_true')
    parser.add_argument('--side', choices=('HIGH', 'LOW'), required=True)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--model-dir', type=Path, default=ROOT.parent / 'retained/bernini')
    parser.add_argument('--saved-dir', type=Path, default=SAVED)
    parser.add_argument('--private-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=OUTPUT)
    parser.add_argument('--patches', type=Path)
    parser.add_argument('--reference', type=Path)
    parser.add_argument('--expected-reference-sha256')
    parser.add_argument('--base-output-sha256')
    parser.add_argument('--admission-only', action='store_true', help='Verify all non-model input/source bindings without browser/model reads')
    args = parser.parse_args()
    if args.validate and not (args.patches and args.reference and args.expected_reference_sha256):
        parser.error('--validate requires --patches, --reference and --expected-reference-sha256')
    if args.prepare and any((args.patches, args.reference, args.expected_reference_sha256, args.base_output_sha256)):
        parser.error('Patch/reference/baseline flags belong to --validate')
    frozen_source(args.source_commit)
    require(args.private_dir.is_absolute() and args.private_dir.resolve().is_relative_to(Path('/tmp')), 'Private output directory must stay under /tmp')
    payload, saved_guard = build_payload(args.side, args.saved_dir, args.patches, args.reference, args.expected_reference_sha256, args.base_output_sha256)
    ref = module_at('p4-cross-ffn-reference')
    model = args.model_dir / ref.MODELS[args.side][0]
    require(model.stat().st_size == 15574833216, 'Original model file size mismatch')
    if args.admission_only:
        print(json.dumps({'passed': True, 'side': args.side, 'phase': 'prepare' if args.prepare else 'validate', 'browserConstructed': False, 'modelPayloadRead': False}))
        return
    args.private_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    args.private_dir.chmod(0o700)
    suffix = 'prepare' if args.prepare else 'browser'
    private_path = args.private_dir / (args.side.lower() + ('-final-f32-patches.json' if args.prepare else '-runtime-arrays.json'))
    public_path = args.output_dir / (args.side.lower() + '-feed-' + suffix + '.json')
    require(not private_path.exists() and not public_path.exists(), 'Use new private/public output paths')
    inventory = source_inventory()
    payload['modules'] = [{'role': role, 'sha256': inventory[path]} for role, path in (
        ('ORT', 'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm'),
        ('Hike.decode', 'docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm'),
        ('Hike.stream-attention', 'docs/shared/diffusion-models/ort-bridge/stream-attention/kernel.wasm'),
        ('Hike.p4-cross-ffn', 'docs/shared/diffusion-models/ort-bridge/post-self-attention/kernel.wasm'))]
    from playwright.sync_api import sync_playwright
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler_for(ROOT / 'docs'))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    requests, errors = [], []
    started = time.monotonic()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
            try:
                page = browser.new_page()
                page.set_default_timeout(600000)
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('request', lambda request: requests.append(request.url))
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                page.set_content('<input type=file id=model>')
                page.locator('#model').set_input_files(str(model))
                payload['phase'] = 'prepare' if args.prepare else 'validate'
                result = page.evaluate("""async text=>{const p=JSON.parse(text),names=['compile','compileStreaming','instantiate','instantiateStreaming','Instance'],originals=names.map(k=>WebAssembly[k]);const m=await import('/shared/diffusion-models/diagnostics/p4-cross-ffn/feed.mjs');const fn=p.phase==='prepare'?m.prepareP4FinalF32:m.validateP4FinalF32;const r=await fn(document.querySelector('#model').files[0],p);if(!names.every((k,i)=>WebAssembly[k]===originals[i]))throw Error('Observer not restored');r.observerRestoredAfterRun=true;return r;}""", browser_payload_argument(payload))
                private_text = result.pop('privatePatchText' if args.prepare else 'privateArtifactText')
                if args.prepare:
                    ref.validate_patches(json.loads(private_text), args.side, ref.load_plan())
                else:
                    _base.verify_private_artifact_text(private_text, result['outputIdentities'])
                private_raw = private_write(private_path, private_text)
                require(sha(private_raw) == result['privatePatchSHA256' if args.prepare else 'privateArtifactSHA256'], 'Private artifact serialization changed')
                if args.prepare:
                    load_patches(private_path, args.side, ref)
                    result['baseProviderProof'] = verify_prepared_base(result, model, args.side, ref)
                else:
                    reference, reference_hash = ref.read_json(args.reference)
                    _, patch_hash, patch_public = load_patches(args.patches, args.side, ref)
                    require(reference_hash == payload['referenceSHA256'] and patch_hash == payload['inputBindings']['finalF32PatchArtifactSHA256'], 'Private reference/patch artifact changed during actual run')
                    result['parameterProof'] = verify_patched_parameter_identities(result['validation']['evidence']['parameterSources'], reference, patch_public, patch_hash, result['validation']['packageHash'])
                    result['numericalAccepted'] = True
                executed = {url.split('/', 3)[-1].split('?', 1)[0] for url in requests if url.endswith(('.mjs', '.js', '.wasm'))}
                sources = {name: inventory[name] for name in ('tools/diffusion-models/p4-cross-ffn-feed-browser.py', 'tools/diffusion-models/p4-cross-ffn-browser.py', 'tools/diffusion-models/p4-cross-ffn-reference.py')}
                for path in executed:
                    key = 'docs/' + path
                    require(key in inventory and sha((ROOT / key).read_bytes()) == inventory[key], 'Unanchored or changed requested source: ' + key)
                    committed = subprocess.check_output(['git', 'show', args.source_commit + ':' + key], cwd=ROOT)
                    require(sha(committed) == inventory[key], 'Executed source not in frozen commit: ' + key)
                    sources[key] = inventory[key]
                require(not errors and not any('.safetensors' in url for url in requests) and result['passed'], 'Actual final-F32 browser diagnostic failed')
                result = public_projection(result)
                result.update(sourceSHA256=sources, sourceCommit=args.source_commit)
                result['inputBindings'] = {**result.get('inputBindings', {}), **saved_guard}
                browser_version = browser.version
            finally:
                browser.close()
            result['browser'] = {'version': browser_version, 'pageErrorCount': len(errors), 'modelHTTPRequests': 0, 'wallSeconds': time.monotonic() - started, 'disconnected': not browser.is_connected()}
            digest = _base.write_public(public_path, public_projection(result))
            print(json.dumps({'side': args.side, 'passed': True, 'phase': suffix, 'privateArtifactSHA256': sha(private_raw), 'receiptSHA256': digest, 'output': str(public_path)}), flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
