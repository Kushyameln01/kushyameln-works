"""N2 post-self-attention browser measurement; private inputs never enter HTTP.

The old p4-browser.py selected-QKV diagnostic is intentionally unchanged.
Numerical comparison is a separate --compare-only pass over private runtime
cuts and independent, pre-gated references. Neither pass runs the old tail.
"""
import argparse
import hashlib
import http.server
import importlib.util
import json
import math
import os
from pathlib import Path
import struct
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
SAVED = ROOT.parent / 'diffusion-private-tail-saved-outputs-20261101'
OLD_PRIVATE = ROOT.parent / 'diffusion-private-tail-attention-20261101'
PACKAGES = ROOT.parent / 'managed-n2-execution-8xrdkeqy/run'
OUTPUT = ROOT / 'development/ai-connection/p4-cross-ffn/integration'
PUBLIC_KEYS = frozenset(('schemaVersion', 'passed', 'status', 'side', 'candidatePlanSHA256', 'inputBindings', 'outputIdentities', 'boundaries', 'phases', 'topology', 'stagingAndCopies', 'evidence', 'observer', 'sourceSHA256', 'unknowns', 'acceptance', 'privateArtifactSHA256', 'numericalAccepted', 'comparisons', 'referenceSHA256', 'parameterProof', 'observerRestoredAfterRun'))


def module_at(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encode_browser_payload(payload):
    # Playwright's Python float serializer in the installed version treats
    # +0.0 as -0. Send one string and let native JSON.parse preserve both signs.
    return json.dumps(payload, separators=(',', ':'), allow_nan=False)


def f32_bytes(values):
    if not isinstance(values, list) or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in values):
        raise ValueError('Finite F32 arrays required')
    return struct.pack('<' + str(len(values)) + 'f', *values)


def verify_private_artifact_text(text, output_identities):
    """Fail before writing if JSON transport changed any native output bits."""
    reference = module_at('p4-cross-ffn-reference')
    artifact = json.loads(text)
    arrays, hashes = artifact.get('arrays', {}), artifact.get('evidence', {}).get('outputHashes', {})
    if artifact.get('schemaVersion') != 'bernini-p4-runtime-arrays/0.1' or set(arrays) != set(reference.ARRAY_SHAPES) or set(output_identities) != set(reference.ARRAY_SHAPES) or set(hashes) != {key + 'SHA256' for key in reference.ARRAY_SHAPES}:
        raise ValueError('Private serialized output requires all25 native array identities')
    for name, shape in reference.ARRAY_SHAPES.items():
        shape = [4 if n == 'L' else n for n in shape]
        identity = output_identities[name]
        raw = f32_bytes(arrays[name])
        actual_hash = sha(raw)
        if identity.get('shape') != shape or identity.get('elements') != math.prod(shape) or identity.get('bytes') != len(raw) or len(raw) != math.prod(shape) * 4 or actual_hash != identity.get('sha256') or actual_hash != hashes.get(name + 'SHA256'):
            raise ValueError('Private serialized output bits differ from native identity: ' + name)
    return {'verifiedOutputCount': len(arrays), 'strictNativeOutputBits': True}


def load_saved_inputs(side, saved_dir=SAVED):
    reference = module_at('p4-cross-ffn-reference')
    plan = reference.load_plan()
    if side not in plan['cases']:
        raise ValueError('Explicit HIGH or LOW required')
    path = Path(saved_dir) / (side.lower() + '-tail-outputs.json')
    inputs, bindings = reference.saved_inputs(side, path, plan)
    saved = json.loads(path.read_bytes())
    if set(saved['arrays']) != {'o', 'gateProjection', 'gate', 'gated', 'residual'}:
        raise ValueError('Exactly five accepted old output arrays required')
    for key, values in saved['arrays'].items():
        raw = f32_bytes(values)
        identity = saved['arrayIdentities'][key]
        if sha(raw) != identity['sha256'] or len(raw) != identity['bytes']:
            raise ValueError('Saved old output bit identity mismatch: ' + key)
    bindings.update(prefixRecomputed=False, fullModelHashRecomputed=False)
    payload = {'side': side, 'residual': inputs['residual'].reshape(-1).tolist(),
               'timeAct1': inputs['timeAct1'].reshape(-1).tolist(), 'oldOutputs': saved['arrays'],
               'trustedInputs': saved['inputBindings'], 'savedArrayIdentities': saved['arrayIdentities']}
    return payload, bindings


def verify_old_packages(side, saved_payload, package_root=PACKAGES):
    package = Path(package_root) / (side.lower() + '-outputs')
    manifest = json.loads((package / 'manifest.json').read_bytes())
    for item in manifest['files']:
        path = (package / item['path']).resolve()
        if not path.is_relative_to(package.resolve()):
            raise ValueError('Package path escape')
        raw = path.read_bytes()
        if len(raw) != item['byteLength'] or sha(raw) != item['sha256']:
            raise ValueError('Old E4 package hash mismatch')
    for key, values in saved_payload['oldOutputs'].items():
        raw = (package / key / 'output.wktensor').read_bytes()
        size = struct.unpack('<I', raw[8:12])[0]
        metadata = json.loads(raw[12:12 + size])
        if raw[:8] != b'WKTSR001' or metadata['dtype'] != 'float32' or raw[12 + size:] != f32_bytes(values):
            raise ValueError('Saved/E4 decoded output mismatch')
        if key == 'residual' and (metadata['shape'] != [2, 5120] or metadata['layout'] != 'LC' or metadata['meaning'] != 'block0-self-attention-residual-token-hidden'):
            raise ValueError('Residual consumer meaning mismatch')
    return {'manifestSHA256': sha((package / 'manifest.json').read_bytes()), 'verifiedFileCount': len(manifest['files']), 'verifiedOutputCount': 5}


def private_write(path, payload):
    path = Path(path)
    if not path.is_absolute() or not path.resolve().is_relative_to(Path('/tmp')):
        raise ValueError('Private output must use an absolute path under /tmp')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    raw = payload.encode() if isinstance(payload, str) else (json.dumps(payload, separators=(',', ':'), allow_nan=False) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as output:
        output.write(raw)
    return raw


def public_projection(value):
    result = {key: item for key, item in value.items() if key in PUBLIC_KEYS}
    def verify(item, path=()):
        if isinstance(item, dict):
            for key, nested in item.items():
                if key in ('arrays', 'data', 'expected', 'attentionMask', 'raw', 'values') or (key == 'scale' and not any(p in ('outputIdentities', 'comparisons') for p in path)):
                    # Numerical comparison's values field is an integer count.
                    if key != 'values' or not isinstance(nested, int):
                        raise ValueError('Private field in public receipt: ' + '.'.join(path + (key,)))
                verify(nested, path + (key,))
        elif isinstance(item, list):
            for nested in item:
                verify(nested, path)
    verify(result)
    return result


def verify_parameter_identities(actual, expected, *, patch_scope=None):
    """Check every executed selection against independent original/F32 hashes.

    Whole-selection hashes cannot establish chunk identities; every executed
    time/modulation selection must have its own independent reference record.
    """
    plan = module_at('p4-cross-ffn-reference').load_plan()
    allowed_targets = set()
    if patch_scope is not None:
        patch_targets = {stem + '.' + role for stem in
                         ['blocks.0.cross_attn.' + kind for kind in ('q', 'k', 'v', 'o')] +
                         ['blocks.0.ffn.0', 'blocks.0.ffn.2'] for role in ('weight', 'bias')}
        if not isinstance(patch_scope, dict) or set(patch_scope) != {'artifactSHA256', 'allowedTargetIds'}:
            raise ValueError('Explicit patch scope requires only artifact hash and allowed target IDs')
        artifact_hash, targets = patch_scope['artifactSHA256'], patch_scope['allowedTargetIds']
        if not isinstance(artifact_hash, str) or len(artifact_hash) != 64 or any(c not in '0123456789abcdef' for c in artifact_hash):
            raise ValueError('Explicit patch scope requires a lowercase SHA256 artifact binding')
        if not isinstance(targets, list) or not 1 <= len(targets) <= len(patch_targets) or any(not isinstance(key, str) for key in targets):
            raise ValueError('Explicit patch scope requires bounded registered target IDs')
        allowed_targets = set(targets)
        if len(allowed_targets) != len(targets) or not allowed_targets <= patch_targets or not allowed_targets <= set(plan['parameters']):
            raise ValueError('Explicit patch scope targets must be unique registered cross/FFN weight or bias IDs')
    selections = {}
    for key, spec in plan['parameters'].items():
        matrix = 'selectedRows' in spec
        first, stop = spec['selectedRows' if matrix else 'selectedElements']
        step = 5120 if key in ('time_projection.1.weight', 'time_projection.1.bias', 'blocks.0.modulation') else stop - first
        for start in range(first, stop, step):
            runtime_key = key + (':' + str(start) if matrix or start else '')
            selections[runtime_key] = (key, spec, matrix, start, min(start + step, stop))
    if not isinstance(actual, dict) or set(actual) != set(selections):
        raise ValueError('Runtime parameter selection coverage must match all29 frozen selections')
    verified = {}
    for runtime_key, (key, spec, matrix, start, end) in selections.items():
        source, reference = actual[runtime_key], expected.get(runtime_key)
        if not isinstance(reference, dict):
            raise ValueError('Independent parameter selection missing: ' + runtime_key)
        width = spec['fullShape'][1] if matrix else 1
        unit = 2 if spec['storageDtype'] == 'F16' else 1
        elements, raw_bytes = (end - start) * width, (end - start) * width * unit
        binding = {'kind': 'runtime-input' if matrix else 'hike-parameter', 'name': key}
        fixed = {'originalKey': key, 'fullShape': spec['fullShape'], 'storageDtype': spec['storageDtype']}
        if any(source.get(field) != value or reference.get(field) != value for field, value in fixed.items()):
            raise ValueError('Independent parameter canonical mapping/full shape/storage mismatch: ' + runtime_key)
        if source.get('computeDtype') != 'F32' or source.get('binding') != binding or ('binding' in reference and reference['binding'] != binding):
            raise ValueError('Independent parameter compute dtype/binding mismatch: ' + runtime_key)
        if source.get('byteLength') != math.prod(spec['fullShape']) * unit:
            raise ValueError('Independent parameter full tensor byte length mismatch: ' + runtime_key)
        if matrix:
            fields = {'selectedRows': [start, end], 'rowStart': start, 'rowCount': end-start,
                      'elementOffset': start*width, 'elementCount': elements, 'selectedElementCount': elements,
                      'selectedByteLength': raw_bytes, 'selectedRawBytes': raw_bytes,
                      'selectedEffectiveBytes': elements*4, 'columns': width}
            if reference.get('selectedRows') != [start, end]:
                raise ValueError('Independent parameter reference selected rows mismatch: ' + runtime_key)
        else:
            fields = {'elementOffset': start, 'elementCount': elements, 'selectedByteLength': raw_bytes}
            if reference.get('selectedElements') != [start, end]:
                raise ValueError('Independent parameter reference selected elements mismatch: ' + runtime_key)
        if any(source.get(field) != value for field, value in fields.items()) or reference.get('selectedRawBytes') != raw_bytes:
            raise ValueError('Independent parameter range/count/selected length mismatch: ' + runtime_key)
        offset = reference.get('absoluteByteOffset')
        if type(offset) is not int or offset < 8 + plan['bounds']['headerBytes'] or offset > plan['bounds']['modelBytes'] - raw_bytes or source.get('absoluteByteOffset') != offset:
            raise ValueError('Independent parameter selected absolute offset mismatch: ' + runtime_key)
        if matrix and source.get('originalAbsoluteByteOffset') != offset - start*width*unit:
            raise ValueError('Independent parameter original absolute offset mismatch: ' + runtime_key)
        actual_final = source.get('effectiveF32SHA256', source.get('decodedF32SHA256'))
        expected_final = reference.get('finalF32SHA256', reference.get('decodedF32SHA256'))
        hashes = (source.get('rawSHA256'), reference.get('rawSHA256'), actual_final, expected_final, reference.get('decodedF32SHA256'))
        if not all(isinstance(value, str) and len(value) == 64 and all(c in '0123456789abcdef' for c in value) for value in hashes) or source.get('rawSHA256') != reference.get('rawSHA256') or actual_final != expected_final:
            raise ValueError('Independent parameter raw/final F32 bits mismatch: ' + runtime_key)
        # The baseline proves Hike decoder bits. An explicit patch scope proves
        # original storage and consumed final F32 bits; it cannot authenticate
        # the decoder's pre-patch output for an overwritten target.
        changed = reference['decodedF32SHA256'] != expected_final
        if changed and patch_scope is None:
            raise ValueError('Patched parameter proof requires an explicit patch scope')
        if changed and key not in allowed_targets:
            raise ValueError('Changed parameter lies outside explicit patch scope: ' + runtime_key)
        if spec['storageDtype'] == 'F8_E4M3':
            if source.get('fp8ProfileId') != 'scaled-e4m3fn-scalar-f32-v1' or reference.get('fp8ProfileId', 'scaled-e4m3fn-scalar-f32-v1') != source['fp8ProfileId']:
                raise ValueError('Independent parameter FP8 decoder profile mismatch: ' + runtime_key)
            stem = key[:-7]
            for field, suffix in [('scaleSHA256', '.weight_scale'), ('quantConfigSHA256', '.comfy_quant')]:
                config = expected.get(stem + suffix)
                code_hash = source.get(field)
                if not config or not isinstance(code_hash, str) or len(code_hash) != 64 or any(c not in '0123456789abcdef' for c in code_hash) or code_hash != config.get('rawSHA256'):
                    raise ValueError('Independent parameter quantization bits mismatch: ' + key)
                desc = source.get('scaleSource' if field == 'scaleSHA256' else 'quantConfigSource', {})
                size, shape, dtype = (4, [], 'F32') if field == 'scaleSHA256' else (27, [27], 'U8')
                wanted = {'originalKey': stem + suffix, 'fullShape': shape, 'storageDtype': dtype,
                          'absoluteByteOffset': config.get('absoluteByteOffset'), 'byteLength': size}
                if any(desc.get(name) != value for name, value in wanted.items()) or config.get('selectedRawBytes') != size:
                    raise ValueError('Independent parameter quantization descriptor mismatch: ' + key)
        elif source.get('fp8ProfileId') is not None:
            raise ValueError('Independent parameter F16 decoder profile mismatch: ' + runtime_key)
        verified[runtime_key] = {'rawSHA256': source['rawSHA256'],
                                 'decodedF32SHA256': actual_final if patch_scope is None else None,
                                 'effectiveF32SHA256': actual_final,
                                 'independentOriginalDecodedF32SHA256': reference['decodedF32SHA256'],
                                 'originalKey': key, 'fullShape': spec['fullShape'], 'storageDtype': spec['storageDtype'],
                                 'computeDtype': 'F32', 'binding': binding, 'absoluteByteOffset': offset,
                                 'selectedRawBytes': raw_bytes, 'selectedElements': [start*width, end*width],
                                 'strictOriginalAndDecodedBits': patch_scope is None,
                                 'strictOriginalStorageAndFinalF32Bits': True,
                                 'finalDiffersFromOriginalDecoded': changed}
    if not verified:
        raise ValueError('Independent parameter proof missing')
    proof = {'verifiedParameterCount': len(verified), 'expectedParameterCount': len(selections), 'completeSelectionCoverage': True,
             'parameters': verified, 'strictOriginalAndDecodedBits': patch_scope is None,
             'strictOriginalStorageAndFinalF32Bits': True,
             'scope': 'All29 runtime parameter selections including chunk-specific time/modulation reads. Numerical output gates remain separate. ' +
                      ('Explicit patched scope proves original storage and consumed final F32 bytes; original decoder output before patches is not verified.' if patch_scope is not None else 'Unpatched baseline proves exact independent original decoder bytes.')}
    if patch_scope is not None:
        proof['patchScope'] = {'artifactSHA256': patch_scope['artifactSHA256'], 'allowedTargetIds': list(patch_scope['allowedTargetIds'])}
    return proof


def compare_private(side, actual_path, reference_dir):
    ref = module_at('p4-cross-ffn-reference')
    payload, bindings = load_saved_inputs(side)
    text, mask, metadata = ref.fixture_conditioning()
    bindings['conditioningDataSHA256'] = ref.identity(text)['sha256']
    bindings['conditioningMaskSHA256'] = sha(mask.tobytes())
    bindings['fixtureContractSHA256'] = ref.load_plan()['fixtureContractSHA256']
    actual, actual_sha = ref.runtime_cuts(actual_path, side, 4, bindings)
    runtime_payload, _ = ref.read_json(actual_path)
    plan, comparisons, hashes, parameter_proof = ref.load_plan(), {}, {}, None
    for suffix, mode, gate_name in [('local', 'LOCAL_RUNTIME_CUTS', 'localCut'), ('composed', 'COMPOSED_FROM_SAVED_N2_TAIL', 'composed')]:
        path = Path(reference_dir) / (side.lower() + '-' + suffix + '-reference.json')
        reference, hashes[suffix] = ref.read_json(path)
        if reference.get('mode') != mode or reference.get('side') != side or reference.get('candidatePlanSHA256') != ref.PLAN_SHA256 or reference.get('gates') != plan['gates']:
            raise ValueError('Independent reference fixed mode/side/plan/gates mismatch')
        if any(reference['inputBindings'].get(key) != bindings[key] for key in ('savedArtifactSHA256', 'conditioningDataSHA256', 'conditioningMaskSHA256', 'fixtureContractSHA256')):
            raise ValueError('Independent reference input binding mismatch')
        if set(reference['expected']) != set(ref.ARRAY_SHAPES):
            raise ValueError('All25 independent references required')
        proof = verify_parameter_identities(runtime_payload['evidence']['parameterSources'], reference.get('parameterSources', {}))
        if parameter_proof is not None and proof != parameter_proof:
            raise ValueError('Local/composed independent parameter proof differs')
        parameter_proof = proof
        comparisons[suffix] = {}
        for key, shape in ref.ARRAY_SHAPES.items():
            expected = ref.f32_array(reference['expected'][key], [4 if n == 'L' else n for n in shape])
            if ref.identity(expected) != reference['arrayIdentities'][key]:
                raise ValueError('Reference array identity mismatch: ' + key)
            comparisons[suffix][key] = ref.compare(actual[key], expected, plan['gates'][gate_name])
    passed = all(item['failed'] == 0 for group in comparisons.values() for item in group.values())
    return public_projection({'schemaVersion': 'bernini-p4-cross-ffn-comparison/0.1', 'side': side, 'passed': passed,
                              'numericalAccepted': passed, 'candidatePlanSHA256': ref.PLAN_SHA256,
                              'privateArtifactSHA256': actual_sha, 'referenceSHA256': hashes, 'comparisons': comparisons,
                              'parameterProof': parameter_proof,
                              'acceptance': plan['readiness']})


def source_inventory():
    paths = []
    for directory in ('docs/shared/diffusion-models', 'docs/shared/inference'):
        paths.extend(p for p in (ROOT / directory).rglob('*') if p.is_file() and p.suffix in ('.mjs', '.js', '.wasm'))
    paths.extend((ROOT / name) for name in ('docs/shared/vr180/sha256.mjs', 'tools/diffusion-models/p4-cross-ffn-browser.py', 'tools/diffusion-models/p4-cross-ffn-reference.py'))
    return {str(path.relative_to(ROOT)): sha(path.read_bytes()) for path in paths}


def handler_for(docs):
    docs = Path(docs).resolve()
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(docs), **kwargs)
        def log_message(self, *args):
            pass
        def translate_path(self, path):
            translated = Path(super().translate_path(path)).resolve()
            return str(translated if translated.is_relative_to(docs) else docs / '__blocked__')
    return Handler


def write_public(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(value, indent=2, allow_nan=False) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    with os.fdopen(fd, 'wb') as output:
        output.write(raw)
    return sha(raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--side', choices=('HIGH', 'LOW'), action='append')
    parser.add_argument('--model-dir', type=Path, default=ROOT.parent / 'retained/bernini')
    parser.add_argument('--saved-dir', type=Path, default=SAVED)
    parser.add_argument('--private-dir', type=Path, required=True)
    parser.add_argument('--reference-dir', type=Path)
    parser.add_argument('--output-dir', type=Path, default=OUTPUT)
    parser.add_argument('--validate-only', action='store_true')
    parser.add_argument('--compare-only', action='store_true')
    args = parser.parse_args()
    sides = args.side or ['HIGH', 'LOW']
    if args.compare_only:
        if not args.reference_dir:
            parser.error('--compare-only requires --reference-dir')
        for side in sides:
            result = compare_private(side, args.private_dir / (side.lower() + '-runtime-arrays.json'), args.reference_dir)
            digest = write_public(args.output_dir / (side.lower() + '-comparison.json'), result)
            print(json.dumps({'side': side, 'passed': result['passed'], 'receiptSHA256': digest}), flush=True)
            if not result['passed']:
                raise ValueError('Fixed numerical gates failed')
        return
    ref = module_at('p4-cross-ffn-reference')
    old = module_at('tail-browser')
    inputs = []
    for side in sides:
        payload, bindings = load_saved_inputs(side, args.saved_dir)
        old_payload, old_anchors = old.load_tail_inputs(side, OLD_PRIVATE)
        if payload['trustedInputs'] != old_payload['trustedInputs']:
            raise ValueError('Saved and independently checked old trusted inputs differ')
        bindings['oldE4Package'] = verify_old_packages(side, payload)
        bindings['priorProducerGuardSHA256'] = sha(json.dumps(old_anchors, sort_keys=True, separators=(',', ':')).encode())
        text, mask, metadata = ref.fixture_conditioning()
        payload.update(candidatePlanSHA256=ref.PLAN_SHA256, inputBindings={'savedArtifactSHA256': bindings['savedArtifactSHA256'], 'conditioningDataSHA256': ref.identity(text)['sha256'], 'conditioningMaskSHA256': sha(mask.tobytes()), 'fixtureContractSHA256': ref.load_plan()['fixtureContractSHA256']},
                       conditioning={'shape': [1, 4, 4096], 'data': text.reshape(-1).tolist(), 'attentionMask': mask.tolist(), 'fixtureId': metadata['fixtureId'], 'sourceRef': {'path': ref.load_plan()['fixtureContractPath'], 'sha256': ref.load_plan()['fixtureContractSHA256']}},
                       outputShapes={name: [4 if n == 'L' else n for n in shape] for name, shape in ref.ARRAY_SHAPES.items()})
        model = args.model_dir / ref.MODELS[side][0]
        if model.stat().st_size != 15574833216:
            raise ValueError('Original model file size mismatch')
        inputs.append((side, model, payload, bindings))
    if args.validate_only:
        print(json.dumps({'passed': True, 'sides': sides, 'browserConstructed': False, 'prefixRecomputed': False, 'modelFullHashRecomputed': False}))
        return
    if not args.private_dir.is_absolute() or not args.private_dir.resolve().is_relative_to(Path('/tmp')):
        raise ValueError('Private run directory must be under /tmp')
    args.private_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    args.private_dir.chmod(0o700)
    from playwright.sync_api import sync_playwright
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler_for(ROOT / 'docs'))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            for side, model, payload, bindings in inputs:
                private_path = args.private_dir / (side.lower() + '-runtime-arrays.json')
                public_path = args.output_dir / (side.lower() + '-browser.json')
                if private_path.exists() or public_path.exists():
                    raise FileExistsError('Use new private/public output paths')
                inventory = source_inventory()
                payload['modules'] = [{'role': role, 'sha256': inventory[path]} for role, path in (
                    ('ORT', 'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm'),
                    ('Hike.decode', 'docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm'),
                    ('Hike.stream-attention', 'docs/shared/diffusion-models/ort-bridge/stream-attention/kernel.wasm'),
                    ('Hike.p4-cross-ffn', 'docs/shared/diffusion-models/ort-bridge/post-self-attention/kernel.wasm'),
                    ('Hike.self-attention-tail', 'docs/shared/diffusion-models/ort-bridge/self-attention-tail/kernel.wasm'))]
                requests, errors = [], []
                started = time.monotonic()
                browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--disable-dev-shm-usage'])
                try:
                    page = browser.new_page()
                    page.set_default_timeout(600000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('request', lambda request: requests.append(request.url))
                    page.goto(f'http://127.0.0.1:{server.server_port}/')
                    page.set_content('<input type=file id=model>')
                    page.locator('#model').set_input_files(str(model))
                    result = page.evaluate("""async text=>{const p=JSON.parse(text),names=['compile','compileStreaming','instantiate','instantiateStreaming','Instance'],originals=names.map(k=>WebAssembly[k]);const m=await import('/shared/diffusion-models/diagnostics/p4-cross-ffn/run.mjs');const result=await m.runP4CrossFfn(document.querySelector('#model').files[0],p);if(!names.every((k,i)=>WebAssembly[k]===originals[i]))throw Error('Observer not restored');result.observerRestoredAfterRun=true;return result;}""", encode_browser_payload(payload))
                    private_text = result.pop('privateArtifactText')
                    result['boundaries']['privateArtifactNativeBits'] = verify_private_artifact_text(private_text, result['outputIdentities'])
                    private_raw = private_write(private_path, private_text)
                    if sha(private_raw) != result['privateArtifactSHA256']:
                        raise ValueError('Private artifact serialization changed')
                    executed = {url.split('/', 3)[-1].split('?', 1)[0] for url in requests if url.endswith(('.mjs', '.js', '.wasm'))}
                    sources = {'tools/diffusion-models/p4-cross-ffn-browser.py': inventory['tools/diffusion-models/p4-cross-ffn-browser.py']}
                    for path in executed:
                        key = 'docs/' + path
                        if key not in inventory or sha((ROOT / key).read_bytes()) != inventory[key]:
                            raise ValueError('Unanchored or changed requested source: ' + key)
                        sources[key] = inventory[key]
                    result = public_projection(result)
                    result['sourceSHA256'] = sources
                    result['inputBindings'].update(savedTailGuard=bindings)
                    if errors or any('.safetensors' in url for url in requests) or not result['passed']:
                        raise ValueError('Browser P4 lifecycle/resource diagnostic failed')
                finally:
                    browser.close()
                result['browser'] = {'version': browser.version, 'pageErrorCount': len(errors), 'modelHTTPRequests': 0, 'wallSeconds': time.monotonic() - started, 'closedBeforeNextSide': True, 'disconnected': not browser.is_connected()}
                digest = write_public(public_path, result)
                print(json.dumps({'side': side, 'passed': True, 'numericalAccepted': False, 'privateArtifactSHA256': sha(private_raw), 'receiptSHA256': digest, 'output': str(public_path)}), flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
