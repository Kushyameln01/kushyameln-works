"""Real L512 LOW3 LoRA A/B oracle using exact owner math and unchanged P4 core.

The owner controlled-K4 CLI is never called. A imports its independent selected
LoRA functions; B consumes A's separately rounded final-F32 sparse patches with
the real frozen L512 packet and retained actual LOW3 residual/timeAct1.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time

for _variable in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ[_variable] = '1'
import numpy as np

ROOT = Path(__file__).resolve().parents[4]
OWNER_COMMIT = 'a80db72feea60b9bd69e292e4716665c6f0ee77f'
OWNER_ROOT = Path('/tmp/p4-l512-lora/a80/source')
OWNER_PATH = OWNER_ROOT / 'tools/ai-connection/p4-lora-reference.py'
OWNER_SHA = '6f9ed048c7c1ae1ddbd3fa7b3d4328304c4fbd7dc4ca0bfd031c712e5e17987b'
INVENTORY = OWNER_ROOT / 'development/lora/contracts/original-inventory.json'
INVENTORY_SHA = '97229d6ea17738dc983fa898a38e771a784aeafff9513734c5af0ba0250c23b3'
BASE_TRANSPORT = ROOT / 'development/ai-connection/p4-real-text-l512/reference/run-reference.py'
BASE_TRANSPORT_SHA = '599dd92de2afc3dab266132eb86180ec6253a31caf1a7455b0454467435a03f8'
ORIGINAL = Path('/tmp/p4-l512-lora/original/Bernini-R_LightX2V_low_noise.safetensors')
ORIGINAL_RECEIPT = ORIGINAL.with_name('acquisition.json')
ORIGINAL_SHA = '86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b'
ORIGINAL_HEADER_SHA = 'bd4e95892305560456676c8fc9a4545c27f4deb979f5d2b929b7be7df2d5d333'
BASE = Path('/workspace/work/retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors')
SAVED_TAIL = Path('/workspace/work/diffusion-private-tail-saved-outputs-20261101/low-tail-outputs.json')
NATIVE_TEXT = Path('/tmp/p4-real-text-l512/inputs/real-text-l512-native.json')
BASE_REFERENCE = Path('/tmp/p4-real-text-l512/composed/low/manifest.json')
BASE_REFERENCE_SHA = '530746b1e2d59d0c9cbe82e1ddad6d743ae32eb8fd7029f56cca694b57672be7'
STRENGTH = 1
SCOPE = 'real-text-l512-saved-low3-n2-block0-selected-light-q4-strength1'


def require(value, message):
    if not value:
        raise ValueError(message)


def import_exact(name, path, expected):
    import hashlib
    require(hashlib.sha256(path.read_bytes()).hexdigest() == expected, 'Frozen source changed: ' + str(path))
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def modules():
    owner = import_exact('exact_owner_lora_math', OWNER_PATH, OWNER_SHA)
    transport = import_exact('frozen_real_l512_transport', BASE_TRANSPORT, BASE_TRANSPORT_SHA)
    require(owner.GATES == {
        'weight': {'absolute': 1e-5, 'relative': 1e-4},
        'bias': {'absolute': 0, 'relative': 0},
        'projection': {'absolute': .01, 'relative': .001},
        'projectionGateId': 'p4-cross-ffn-composed-f32-v1',
    }, 'Owner A/B predeclared gates changed')
    require(owner.sha(INVENTORY.read_bytes()) == INVENTORY_SHA, 'Owner original inventory changed')
    return owner, transport


def source_binding(commit):
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    require(head == commit and len(commit) == 40, 'Explicit committed execution source required')
    path = Path(__file__).resolve().relative_to(ROOT).as_posix()
    committed = subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)
    require(committed == Path(__file__).read_bytes(), 'LoRA reference differs from committed source')
    return {'commit': commit, 'path': path, 'sha256': modules()[0].sha(committed)}


def selected_item(owner):
    item = next(x for x in json.loads(INVENTORY.read_bytes()) if x['pairId'] == 'light' and x['side'].upper() == 'LOW')
    require(item['fileName'] == ORIGINAL.name and item['bytes'] == 1244141856 and item['sha256'] == ORIGINAL_SHA and item['headerSha256'] == ORIGINAL_HEADER_SHA, 'Selected original lightLOW identity changed')
    return item


def verify_original_receipt(owner, original, receipt_path):
    raw = Path(receipt_path).read_bytes()
    receipt = json.loads(raw)
    stat = owner.stat_identity(original)
    require(receipt.get('status') == 'COMPLETE_VERIFIED' and receipt.get('fullFileVerified') is True and receipt.get('actualSHA256') == ORIGINAL_SHA and receipt.get('expectedSHA256') == ORIGINAL_SHA and receipt.get('actualBytes') == 1244141856 and receipt.get('expectedBytes') == 1244141856 and Path(receipt['destination']).resolve() == original.resolve(), 'Original whole-file acquisition receipt mismatch')
    require(receipt.get('fileStat') == {key: stat[key] for key in ('size', 'mtimeNs', 'dev', 'ino')}, 'Original changed after whole-file acquisition verification')
    return {'path': str(receipt_path), 'sha256': owner.sha(raw), 'wholeHashRecomputedByReference': False}, stat


def patch_payload(owner, weight, bias, plan_sha):
    values = [(owner.WEIGHT_ID, [5120, 5120], np.asarray(weight, dtype='<f4'), 'runtime-input'),
              (owner.BIAS_ID, [5120], np.asarray(bias, dtype='<f4'), 'hike-parameter')]
    return {
        'schemaVersion': 'bernini-p4-final-f32-patches/0.1', 'side': 'LOW',
        'candidatePlanSHA256': plan_sha,
        'patches': [{'weightId': key, 'fullShape': shape, 'offset': 0,
                     'count': int(array.size), 'binding': {'kind': kind, 'name': key},
                     'dtype': 'F32', 'sha256': owner.sha(array.tobytes()),
                     'data': array.reshape(-1).tolist()}
                    for key, shape, array, kind in values],
    }


def save_array(owner, transport, output, name, array, dtype):
    array = np.asarray(array, dtype={'F32': '<f4', 'F64': '<f8'}[dtype], order='C')
    require(np.isfinite(array).all(), 'Nonfinite independent A output')
    raw = array.tobytes()
    transport.binary_write(output / name, raw)
    return {'file': name, 'dtype': dtype, **owner.identity(array)}


def immutable_source_proof(actual, baseline):
    require(set(actual) == set(baseline), 'Original parameter source coverage changed from accepted base')
    fields = ('originalKey', 'fullShape', 'storageDtype', 'absoluteByteOffset', 'selectedRawBytes', 'rawSHA256', 'decodedF32SHA256')
    require(all(all(source.get(field) == baseline[key].get(field) for field in fields) for key, source in actual.items()), 'Immutable original raw/decoded source identity changed from accepted base')
    return {'acceptedBaseManifestSHA256': BASE_REFERENCE_SHA,
            'allSourceRecordsChecked': len(actual), 'expectedExecutedSelections': 29,
            'allImmutableOriginalRawAndDecodedIdentitiesEqual': True,
            'patchedFinalF32IdentitiesComparedSeparately': True}


def independent_a(owner, transport, core, plan, args):
    item = selected_item(owner)
    receipt, original_before = verify_original_receipt(owner, args.file, args.original_receipt)
    base_before = owner.stat_identity(args.base)
    h, lh = owner.original_header(args.base), owner.original_header(args.file)
    require(h['fileBytes'] == owner.MODEL_BYTES and h['headerSHA256'] == owner.HEADER_SHA and lh['fileBytes'] == item['bytes'] and lh['headerSHA256'] == item['headerSha256'], 'Fresh selected model/LoRA header identity mismatch')
    for key, dtype, shape in [
        (owner.WEIGHT_ID, 'F8_E4M3', [5120, 5120]), (owner.BIAS_ID, 'F16', [5120]),
        ('blocks.0.cross_attn.q.weight_scale', 'F32', []),
        ('blocks.0.cross_attn.q.comfy_quant', 'U8', [27]),
    ]:
        require(h['tensors'].get(key, {}).get('dtype') == dtype and h['tensors'][key]['shape'] == shape, 'Actual LOW cross-Q base tensor profile mismatch')
    q, qr = owner.read_tensor(args.base, h, owner.WEIGHT_ID, count=20480)
    bias, br = owner.read_tensor(args.base, h, owner.BIAS_ID, count=4)
    scale, sr = owner.read_tensor(args.base, h, 'blocks.0.cross_attn.q.weight_scale')
    config, cr = owner.read_tensor(args.base, h, 'blocks.0.cross_attn.q.comfy_quant')
    require(sr['sha256'] == owner.SCALE_SHA and cr['sha256'] == owner.CONFIG_SHA and config.tobytes() == b'{"format": "float8_e4m3fn"}', 'Own original LOW Q scale/config mismatch')
    base_weight = owner.decode_fp8(q, scale[0]).reshape(4, 5120)
    dn, un, an, bn = [owner.STEM + suffix for suffix in ('.lora_down.weight', '.lora_up.weight', '.alpha', '.diff_b')]
    for key, shape in [(dn, [128, 5120]), (un, [5120, 128]), (an, []), (bn, [5120])]:
        require(lh['tensors'].get(key, {}).get('dtype') == 'BF16' and lh['tensors'][key]['shape'] == shape, 'Actual lightLOW factor/alpha/diff_b profile mismatch')
    down, dr = owner.read_tensor(args.file, lh, dn)
    up, ur = owner.read_tensor(args.file, lh, un, count=512)
    alpha, ar = owner.read_tensor(args.file, lh, an)
    delta, delta_r = owner.read_tensor(args.file, lh, bn, count=4)
    require(float(alpha[0]) == 128, 'Actual alpha128 required; no default inferred')
    weight = owner.merge_reference(base_weight, down.reshape(128, 5120), up.reshape(4, 128), STRENGTH, float(alpha[0]))
    expected_bias = owner.bias_reference(bias, delta, STRENGTH)
    require(weight.dtype == np.float64 and weight.shape == (4, 5120) and expected_bias.dtype == np.dtype('<f4') and expected_bias.shape == (4,), 'Owner independent A output shape/dtype changed')
    patch = patch_payload(owner, weight, expected_bias, core.PLAN_SHA256)
    patch_raw = core.private_write(args.output_dir / 'A-independent-patches.json', patch)
    patches, description = core.validate_patches(patch, 'LOW', plan)
    records = {
        'baseWeight': save_array(owner, transport, args.output_dir, 'A-base-weight.f32', base_weight, 'F32'),
        'baseBias': save_array(owner, transport, args.output_dir, 'A-base-bias.f32', bias, 'F32'),
        'weight': save_array(owner, transport, args.output_dir, 'A-weight.f64', weight, 'F64'),
        'bias': save_array(owner, transport, args.output_dir, 'A-bias.f32', expected_bias, 'F32'),
        'independentPatchArtifact': {'file': 'A-independent-patches.json', 'bytes': len(patch_raw), 'sha256': owner.sha(patch_raw)},
        'baseRanges': [qr, br, sr, cr], 'originalRanges': [dr, ur, ar, delta_r],
        'patchDescription': description, 'sourceOriginalAcquisition': receipt,
        'independentPatchProducer': 'owner independent binary64 A, separately rounded to F32; not actual SDK/Hike prepared bytes',
    }
    return records, patches, base_before, original_before


def generate(args):
    os.umask(0o077)
    owner, transport = modules()
    execution_source = source_binding(args.source_commit)
    require(args.output_dir.is_absolute() and args.output_dir.resolve().is_relative_to(Path('/tmp')) and not args.output_dir.exists(), 'New private reference directory under /tmp required')
    core, plan, inputs, text, bindings, metadata = transport.load_inputs('LOW', args.text, args.saved_tail)
    require(plan['gates']['composed'] == {'abs': owner.GATES['projection']['absolute'], 'rel': owner.GATES['projection']['relative']}, 'Owner B gate differs from unchanged core composed gate')
    started = time.perf_counter()
    a, patches, base_before, original_before = independent_a(owner, transport, core, plan, args)
    bindings['finalF32PatchArtifactSHA256'] = a['independentPatchArtifact']['sha256']
    require(core.runtime_binding(bindings) == bindings, 'Independent A patch binding mismatch')
    parameters = core.Parameters(args.base, 'LOW', plan, patches)
    try:
        composed, _ = core.run_reference(parameters, inputs, text)
    finally:
        parameters.close()
    require(base_before == owner.stat_identity(args.base) and original_before == owner.stat_identity(args.file), 'Original model or LoRA changed during independent A/B reads')
    base_reference, base_reference_sha = core.read_json(BASE_REFERENCE)
    require(base_reference_sha == BASE_REFERENCE_SHA, 'Accepted base original-source reference changed')
    original_proof = immutable_source_proof(parameters.sources, base_reference['parameterSources'])
    descriptors, identities = transport.save_arrays(args.output_dir, composed, core)
    require(identities['blockOutput']['shape'] == [2, 5120] and identities['blockOutput']['elements'] == 10240, 'Actual L512 blockOutput expected10240 values')
    item = selected_item(owner)
    manifest = {
        'schemaVersion': 'bernini-p4-real-text-l512-lora-oracle/0.1',
        'scope': SCOPE, 'mode': 'COMPOSED_BEFORE_RUNTIME', 'side': 'LOW', 'strength': STRENGTH,
        'sourceCommit': args.source_commit, 'executionSource': execution_source,
        'referenceId': 'real-text-l512-light-LOW-q4-s1:' + args.source_commit,
        'ownerSource': {'commit': OWNER_COMMIT, 'path': 'tools/ai-connection/p4-lora-reference.py', 'sha256': OWNER_SHA},
        'candidatePlanSHA256': core.PLAN_SHA256,
        'modelHash': owner.MODEL_SHA, 'headerSHA256': owner.HEADER_SHA,
        'inputBindings': bindings, 'conditioning': metadata,
        'selection': {'pairId': 'light', 'side': 'LOW', 'weightId': owner.WEIGHT_ID, 'biasWeightId': owner.BIAS_ID,
                      'fullWeightShape': [5120, 5120], 'fullBiasShape': [5120], 'rows': [0, 4], 'columns': [0, 5120],
                      'coverage': 'PARTIAL', 'completeAdapter': False,
                      'excludedPatchCount': item['pairCount'] + item['weightDiffCount'] + item['biasDiffCount'] - 2},
        'original': {'fileName': args.file.name, 'byteLength': item['bytes'], 'expectedSha256': ORIGINAL_SHA,
                     'headerSha256': ORIGINAL_HEADER_SHA, 'sourceDtype': 'BF16', 'rank': 128, 'alpha': 128,
                     'loaderPolicyId': owner.POLICY, 'ranges': a['originalRanges'],
                     'wholeHashRecomputedByReference': False},
        'A': a, 'arrays': descriptors, 'outputIdentities': identities,
        'parameterSources': parameters.sources, 'gates': owner.GATES, 'numericGates': plan['gates'],
        'immutableOriginalSourceProof': original_proof,
        'independentOracleSHA256': core.sha(Path(core.__file__).read_bytes()),
        'forwardCoreLowRankMathImplemented': False,
        'nativePreparedPatchHashesRemainSeparate': True,
        'sourceStat': {'baseBefore': base_before, 'baseAfter': owner.stat_identity(args.base),
                       'originalBefore': original_before, 'originalAfter': owner.stat_identity(args.file)},
        'resources': {'selectedOriginalFileBytesReadB': parameters.total, 'selectedPayloadBytesReadB': parameters.payload_bytes,
                      'maxPayloadReadBytesB': parameters.max_payload_read, 'matrixTilesB': parameters.tiles,
                      'peakRSSMeasured': False, 'elapsedSeconds': time.perf_counter() - started},
        'scopeLimits': {'realTextL512': True, 'savedActualLOW3Inputs': True, 'tokens': 2, 'blockIndex': 0,
                        'HIGHtoLOWhandoff': False, 'fullModel': False, 'allLoraTargets': False,
                        'nativeLoraAppliedByReference': False, 'privateArraysPublished': False},
        'readiness': plan['readiness'],
    }
    raw = core.private_write(args.output_dir / 'manifest.json', manifest)
    receipt = {key: value for key, value in manifest.items() if key != 'arrays'}
    receipt.update(schemaVersion='bernini-p4-real-text-l512-lora-reference-receipt/0.1',
                   referenceManifestSHA256=owner.sha(raw), referenceManifestBytes=len(raw))
    require(not args.receipt.exists(), 'New public receipt required')
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, indent=2, allow_nan=False) + '\n')
    return {'scope': SCOPE, 'manifestPath': str(args.output_dir / 'manifest.json'), 'manifestSHA256': owner.sha(raw), 'receiptPath': str(args.receipt), 'nativeApplied': False}


def selected_sdk_patches(core, plan, path):
    payload, digest = core.read_json(path)
    patches, description = core.validate_patches(payload, 'LOW', plan)
    expected = {'blocks.0.cross_attn.q.weight': ([5120, 5120], 20480),
                'blocks.0.cross_attn.q.bias': ([5120], 4)}
    require(len(patches) == 2 and {patch['key'] for patch in patches} == set(expected), 'Actual SDK patch artifact must contain only selectedQ4/bias4')
    for patch in patches:
        require(patch['offset'] == 0 and patch['count'] == expected[patch['key']][1], 'Actual SDK patch original-coordinate selection changed')
    return patches, description, digest


def a_comparison(actual, expected, gate):
    actual, expected = np.asarray(actual, dtype='<f4'), np.asarray(expected, dtype=np.float64)
    require(actual.shape == expected.shape and np.isfinite(actual).all() and np.isfinite(expected).all(), 'Exact finite independent A comparison arrays required')
    delta = np.abs(actual.astype(np.float64) - expected)
    failed = int(np.count_nonzero(delta > gate['absolute'] + gate['relative'] * np.abs(expected)))
    return {'values': int(actual.size), 'failed': failed, 'maxAbsolute': float(delta.max()), 'gate': gate}


def load_a_record(owner, root, record):
    require(record.get('file') in ('A-weight.f64', 'A-bias.f32') and record.get('dtype') in ('F64', 'F32'), 'Exact independent A artifact descriptor required')
    raw = (root / record['file']).read_bytes()
    require(len(raw) == record['bytes'] and owner.sha(raw) == record['sha256'], 'Independent A artifact byte/hash mismatch')
    array = np.frombuffer(raw, dtype='<f8' if record['dtype'] == 'F64' else '<f4').reshape(record['shape']).copy()
    require(owner.identity(array) == {key: record[key] for key in ('shape', 'elements', 'bytes', 'sha256')}, 'Independent A identity mismatch')
    return array


def streamed_weight_overlay(core, source, key, patches, previous):
    """Hash original decoded rows with SDK F32 byte overlays; no projections."""
    spec = source.plan['parameters'][key]
    offset, _ = source.selection(key)
    width = spec['fullShape'][1]
    raw_hash, decoded_hash, final_hash = [hashlib.sha256() for _ in range(3)]
    first, stop = spec['selectedRows']
    for row in range(first, stop, spec['tileRows']):
        rows = min(spec['tileRows'], stop - row)
        raw = source.read(offset + (row - first) * width, rows * width)
        decoded = core.decode_fp8(raw, source.scales[key])
        effective = core.apply_overrides(key, row * width, decoded, patches)
        raw_hash.update(raw)
        decoded_hash.update(decoded.tobytes())
        final_hash.update(effective.tobytes())
    return {**previous, 'rawSHA256': raw_hash.hexdigest(), 'decodedF32SHA256': decoded_hash.hexdigest(), 'finalF32SHA256': final_hash.hexdigest()}


def sdk_overlay_parameter_proof(core, transport, plan, base, patches, artifact_sha, actual_sources, independent_sources):
    """Original decoder plus actual SDK byte overlays, without LoRA/forward math."""
    expected = copy.deepcopy(independent_sources)
    source = core.Parameters(base, 'LOW', plan, patches)
    overlay = {}
    try:
        for key in ('blocks.0.cross_attn.q.weight', 'blocks.0.cross_attn.q.bias'):
            if key.endswith('.bias'):
                source.vector(key)
                entry = source.sources[key]
                aliases = (key,)
            else:
                entry = streamed_weight_overlay(core, source, key, patches, expected[key])
                aliases = (key, key + ':0')
            for field in ('rawSHA256', 'decodedF32SHA256'):
                require(entry[field] == independent_sources[key][field], 'SDK overlay original raw/decoded identity differs from pre-runtime B: ' + key)
            for alias in aliases:
                expected[alias]['finalF32SHA256'] = entry['finalF32SHA256']
            overlay[key] = {
                'immutableOriginalRawSHA256': entry['rawSHA256'],
                'independentOriginalDecodedF32SHA256': entry['decodedF32SHA256'],
                'independentAThenRoundedF32SHA256': independent_sources[key]['finalF32SHA256'],
                'sdkByteOverlayExpectedFullSelectionF32SHA256': entry['finalF32SHA256'],
                'equalsIndependentARoundedF32': independent_sources[key]['finalF32SHA256'] == entry['finalF32SHA256'],
            }
    finally:
        source.close()
    require(core.sha(transport.BROWSER_VERIFIER.read_bytes()) == transport.BROWSER_VERIFIER_SHA256, 'Frozen all29 verifier changed')
    spec = importlib.util.spec_from_file_location('all29_lora_byte_overlay_verifier', transport.BROWSER_VERIFIER)
    verifier = importlib.util.module_from_spec(spec); spec.loader.exec_module(verifier)
    proof = verifier.verify_parameter_identities(actual_sources, expected, patch_scope={'artifactSHA256': artifact_sha, 'allowedTargetIds': list(overlay)})
    return {
        'all29Proof': proof, 'patchedSelections': overlay,
        'effectiveExpectedSource': 'independent original decoder plus actual SDK final-F32 sparse byte overlays; no lowrank or forward math',
        'independentBFrozenReferenceWasModified': False,
        'allOriginalRawAndDecodedHashesMatchPreRuntimeB': True,
        'unpatched27EffectiveSelectionsMatchIndependentB': True,
        'selectedOriginalFileBytesRead': source.total,
        'maxPayloadReadBytes': source.max_payload_read,
    }


def local(args):
    os.umask(0o077)
    owner, transport = modules()
    execution_source = source_binding(args.source_commit)
    require(args.reference_manifest is not None and args.reference_manifest_sha256 is not None and args.runtime_manifest is not None and args.actual_patches is not None, 'Local mode requires frozen B reference SHA, actual runtime manifest and actual SDK patch artifact')
    require(args.output_dir.is_absolute() and args.output_dir.resolve().is_relative_to(Path('/tmp')) and not args.output_dir.exists(), 'New private local reference directory under /tmp required')
    core, plan, inputs, text, base_bindings, _ = transport.load_inputs('LOW', args.text, args.saved_tail)
    reference, reference_sha = core.read_json(args.reference_manifest)
    require(reference_sha == args.reference_manifest_sha256 and reference.get('schemaVersion') == 'bernini-p4-real-text-l512-lora-oracle/0.1' and reference.get('mode') == 'COMPOSED_BEFORE_RUNTIME' and reference.get('scope') == SCOPE and reference.get('sourceCommit') == args.source_commit and reference.get('strength') == 1, 'Frozen pre-runtime real L512 LoRA reference binding mismatch')
    reference_root = args.reference_manifest.resolve().parent
    independent_patch, independent_sha = core.read_json(reference_root / reference['A']['independentPatchArtifact']['file'])
    require(independent_sha == reference['A']['independentPatchArtifact']['sha256'] == reference['inputBindings']['finalF32PatchArtifactSHA256'], 'Independent A frozen patch artifact mismatch')
    independent_patches, _ = core.validate_patches(independent_patch, 'LOW', plan)
    require(reference['inputBindings'] == {**base_bindings, 'finalF32PatchArtifactSHA256': independent_sha}, 'Independent B real input binding mismatch')
    frozen = transport.load_binary_arrays(args.reference_manifest, reference, core)
    actual_patches, actual_description, actual_sha = selected_sdk_patches(core, plan, args.actual_patches)
    runtime, runtime_sha = core.read_json(args.runtime_manifest)
    require(runtime.get('schemaVersion') == 'bernini-p4-real-text-l512-lora-runtime/0.1' and runtime.get('independentReferenceBindings') == {'oracleManifestSHA256': reference_sha, 'independentPatchArtifactSHA256': independent_sha}, 'Actual runtime independent reference binding mismatch')
    require(runtime.get('inputBindings') == {**base_bindings, 'finalF32PatchArtifactSHA256': actual_sha}, 'Actual SDK patch/input binding mismatch')
    # The LoRA runtime schema binds actual and independent patch artifacts
    # separately, while retaining the exact base native-evidence guards.
    require(runtime.get('side') == 'LOW' and runtime.get('candidatePlanSHA256') == core.PLAN_SHA256, 'Actual LoRA runtime side/plan mismatch')
    evidence = runtime.get('evidence', {})
    require(evidence.get('schemaVersion') == 'bernini-post-self-attention-evidence/0.1' and evidence.get('executionProfileId') == plan['profileId'] and evidence.get('side') == 'LOW', 'Actual LoRA runtime native evidence mismatch')
    expected_inputs = {'residualSHA256': plan['cases']['LOW']['residualSHA256'], 'timeAct1SHA256': plan['cases']['LOW']['timeAct1SHA256'], 'conditioningSHA256': base_bindings['conditioningDataSHA256'], 'conditioningMaskSHA256': base_bindings['conditioningMaskSHA256']}
    require(all(evidence.get('inputHashes', {}).get(key) == value for key, value in expected_inputs.items()), 'Actual LoRA runtime input bits mismatch')
    require(set(evidence.get('outputHashes', {})) == {key + 'SHA256' for key in core.ARRAY_SHAPES}, 'All25 native LoRA output hashes required')
    actual = transport.load_binary_arrays(args.runtime_manifest, runtime, core)
    require(all(evidence['outputHashes'][key + 'SHA256'] == core.identity(array)['sha256'] for key, array in actual.items()), 'Actual LoRA binary cuts differ from native output hashes')
    a_weight = load_a_record(owner, reference_root, reference['A']['weight'])
    a_bias = load_a_record(owner, reference_root, reference['A']['bias'])
    native = {patch['key']: patch['data'] for patch in actual_patches}
    a_proof = {'weight': a_comparison(native[owner.WEIGHT_ID].reshape(4, 5120), a_weight, owner.GATES['weight']),
               'bias': a_comparison(native[owner.BIAS_ID], a_bias, owner.GATES['bias'])}
    require(all(result['failed'] == 0 for result in a_proof.values()), 'Actual SDK final-F32 patches fail unchanged independent A gate')
    started = time.perf_counter()
    parameters = core.Parameters(args.base, 'LOW', plan, independent_patches)
    try:
        recomposed, local_arrays = core.run_reference(parameters, inputs, text, actual)
    finally:
        parameters.close()
    require(parameters.sources == reference['parameterSources'] and all(core.identity(recomposed[key]) == reference['outputIdentities'][key] for key in core.ARRAY_SHAPES), 'Pre-runtime independent B failed bit-exact reproduction')
    parameter_proof = sdk_overlay_parameter_proof(core, transport, plan, args.base, actual_patches, actual_sha, evidence.get('parameterSources'), reference['parameterSources'])
    comparisons = {
        'local': {key: core.compare(actual[key], local_arrays[key], plan['gates']['localCut']) for key in core.ARRAY_SHAPES},
        'composed': {key: core.compare(actual[key], frozen[key], plan['gates']['composed']) for key in core.ARRAY_SHAPES},
    }
    descriptors, identities = transport.save_arrays(args.output_dir, local_arrays, core)
    manifest = {'schemaVersion': 'bernini-p4-real-text-l512-lora-local-reference/0.1', 'scope': SCOPE,
                'mode': 'LOCAL_RUNTIME_CUTS', 'side': 'LOW', 'executionSource': execution_source,
                'candidatePlanSHA256': core.PLAN_SHA256, 'inputBindings': reference['inputBindings'],
                'runtimeManifestSHA256': runtime_sha, 'frozenPreRuntimeReferenceSHA256': reference_sha,
                'actualSDKPatchArtifactSHA256': actual_sha, 'actualSDKPatchDescription': actual_description,
                'A': a_proof, 'parameterProof': parameter_proof,
                'arrays': descriptors, 'outputIdentities': identities, 'comparisons': comparisons,
                'gates': owner.GATES, 'numericGates': plan['gates'],
                'passed': all(cut['failed'] == 0 for group in comparisons.values() for cut in group.values()),
                'preRuntimeBReproducedBitExactly': True,
                'elapsedSeconds': time.perf_counter() - started, 'readiness': plan['readiness']}
    raw = core.private_write(args.output_dir / 'manifest.json', manifest)
    receipt = {key: value for key, value in manifest.items() if key != 'arrays'}
    receipt.update(schemaVersion='bernini-p4-real-text-l512-lora-local-receipt/0.1', referenceManifestSHA256=owner.sha(raw))
    require(not args.receipt.exists(), 'New LoRA local public receipt required')
    args.receipt.parent.mkdir(parents=True, exist_ok=True); args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
    return {'manifestPath': str(args.output_dir / 'manifest.json'), 'manifestSHA256': owner.sha(raw), 'passed': manifest['passed'], 'receiptPath': str(args.receipt)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=('compose', 'local'), default='compose')
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--base', type=Path, default=BASE)
    parser.add_argument('--file', type=Path, default=ORIGINAL)
    parser.add_argument('--original-receipt', type=Path, default=ORIGINAL_RECEIPT)
    parser.add_argument('--saved-tail', type=Path, default=SAVED_TAIL)
    parser.add_argument('--text', type=Path, default=NATIVE_TEXT)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--reference-manifest', type=Path)
    parser.add_argument('--reference-manifest-sha256')
    parser.add_argument('--runtime-manifest', type=Path)
    parser.add_argument('--actual-patches', type=Path)
    args = parser.parse_args()
    print(json.dumps(generate(args) if args.mode == 'compose' else local(args)))


if __name__ == '__main__':
    main()
