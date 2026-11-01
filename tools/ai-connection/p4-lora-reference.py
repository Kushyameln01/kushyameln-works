#!/usr/bin/env python3
"""Independent controlled-input P4 oracle. No SDK/Hike imports or whole-file hash.

A computes LoRA weight/bias references from independently decoded selected ranges.
B calls the byte-pinned Diffusion NumPy core with A's independent final-F32 patches.
The existing natural-tail CLI and its saved-input guards are not modified.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys

for _name in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ[_name] = '1'
sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PEER_COMMIT = '7ee36228030ba3bb544a90b1d4b528702a7bae32'
CORE_PATH = 'tools/diffusion-models/p4-cross-ffn-reference.py'
CORE_SHA = '66ded34a4bb74d261b81484bf2abd2d9ee75b0e4cf82ce6a063e02237a7a7ecf'
PLAN_PATH = 'development/ai-connection/p4-cross-ffn/core/candidate-plan.json'
PLAN_SHA = '051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600'
BUILD_PATH = 'development/ai-connection/p4-cross-ffn/build.json'
SCRIPT_PATH = 'tools/ai-connection/p4-lora-reference.py'
INVENTORY_PATH = 'development/lora/contracts/original-inventory.json'
SCOPE = 'controlled-caller-input-n2-k4'
POLICY = 'comfy-lora-b5a4321-linear-diff-v1'
STEM = 'diffusion_model.blocks.0.cross_attn.q'
WEIGHT_ID = 'blocks.0.cross_attn.q.weight'
BIAS_ID = 'blocks.0.cross_attn.q.bias'
MODEL_SHA = 'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3'
HEADER_SHA = '286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b'
MODEL_BYTES = 15574833216
SCALE_SHA = 'f501056e42ea5d7180b5bf7d00515305aa45bbadc939c8df74359887dab05c8d'
CONFIG_SHA = 'dc6ecd1e9459beb7956b08ac094a9d0cd2e5fd54678085b6a8f43e2e96b6b28a'
WIDTHS = {'BF16': 2, 'F16': 2, 'F32': 4, 'F8_E4M3': 1, 'U8': 1}
GATES = {'weight': {'absolute': 1e-5, 'relative': 1e-4},
         'bias': {'absolute': 0, 'relative': 0},
         'projection': {'absolute': 0.01, 'relative': 0.001},
         'projectionGateId': 'p4-cross-ffn-composed-f32-v1'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(array):
    a = np.ascontiguousarray(array)
    return {'shape': list(a.shape), 'elements': int(a.size), 'bytes': int(a.nbytes),
            'sha256': sha(a.tobytes())}


def controlled_inputs():
    inputs = {'residual': ((np.arange(10240, dtype=np.int32) % 17 - 8) / 128).astype('<f4').reshape(2, 5120),
              'timeAct1': ((np.arange(5120, dtype=np.int32) % 13 - 6) / 256).astype('<f4')}
    declaration = {'schemaVersion': 'lora-p4-controlled-inputs/0.1-draft.1', 'scope': SCOPE,
                   'producerAuthenticated': False, 'naturalN2Reused': False,
                   'timeEmbeddingProducerVerified': False, 'scheduleAuthenticated': False,
                   'formulas': {'residual': '((i%17)-8)/128', 'timeAct1': '((i%13)-6)/256'},
                   'identities': {k: identity(v) for k, v in inputs.items()}}
    return inputs, declaration


def decode_bf16(raw):
    require(len(raw) % 2 == 0, 'Incomplete BF16 element')
    return (np.frombuffer(raw, dtype='<u2').astype('<u4') << 16).view('<f4').copy()


def decode_fp8(raw, scale):
    q = np.asarray(raw, dtype=np.uint8)
    exponent, mantissa = (q.astype(np.int32) >> 3) & 15, q & 7
    require(not np.any((exponent == 15) & (mantissa == 7)) and math.isfinite(float(scale)) and scale > 0,
            'Invalid own scalar-scaled E4M3FN profile')
    values = np.where(exponent == 0, np.ldexp(mantissa.astype(np.float64), -9),
                      np.ldexp(1 + mantissa.astype(np.float64) / 8, exponent - 7))
    values = np.where(q & 128, -values, values)
    return np.multiply(values.astype('<f4'), np.float32(scale), dtype=np.float32).astype('<f4')


def merge_reference(base, down, up, strength, alpha):
    require(math.isfinite(strength) and (alpha is None or math.isfinite(alpha)), 'Finite strength/alpha required')
    base, down, up = [np.asarray(a) for a in (base, down, up)]
    require(base.ndim == down.ndim == up.ndim == 2 and down.shape[0] > 0
            and base.shape == (up.shape[0], down.shape[1]) and up.shape[1] == down.shape[0]
            and all(np.isfinite(a).all() for a in (base, down, up)), 'Exact finite Linear dimensions required')
    scale = 1 if alpha is None else alpha / down.shape[0]
    result = base.astype(np.float64) + strength * scale * (up.astype(np.float64) @ down.astype(np.float64))
    require(np.isfinite(result).all(), 'Nonfinite independent LoRA result')
    return result


def bias_reference(base, delta, strength):
    base, delta = np.asarray(base, dtype='<f4'), np.asarray(delta, dtype='<f4')
    require(math.isfinite(strength) and base.shape == delta.shape and np.isfinite(base).all()
            and np.isfinite(delta).all(), 'Finite matching bias operands required')
    return np.add(base, np.multiply(np.float32(strength), delta, dtype=np.float32), dtype=np.float32).astype('<f4')


def unique(pairs):
    value = {}
    for key, item in pairs:
        require(key not in value, 'Duplicate Safetensors header key')
        value[key] = item
    return value


def original_header(path):
    path = Path(path)
    size = path.stat().st_size
    with path.open('rb') as stream:
        prefix = stream.read(8)
        require(len(prefix) == 8, 'Missing Safetensors header prefix')
        count = struct.unpack('<Q', prefix)[0]
        require(0 < count <= 8 * 1024 * 1024 and count <= size - 8, 'Header size exceeds bounds')
        raw = stream.read(count)
    require(len(raw) == count, 'Truncated Safetensors header')
    tensors = json.loads(raw, object_pairs_hook=unique)
    require(isinstance(tensors, dict), 'Safetensors header object required')
    ranges = []
    for key, t in tensors.items():
        if key == '__metadata__':
            continue
        require(isinstance(t, dict) and t.get('dtype') in WIDTHS and isinstance(t.get('shape'), list)
                and all(type(n) is int and n > 0 for n in t['shape']), 'Invalid tensor descriptor')
        offsets = t.get('data_offsets')
        require(isinstance(offsets, list) and len(offsets) == 2 and all(type(n) is int for n in offsets)
                and 0 <= offsets[0] <= offsets[1] <= size - count - 8
                and offsets[1] - offsets[0] == math.prod(t['shape']) * WIDTHS[t['dtype']], 'Invalid tensor byte range')
        ranges.append(tuple(offsets))
    ordered = sorted(ranges)
    require(all(a[1] <= b[0] for a, b in zip(ordered, ordered[1:])), 'Overlapping tensor storage')
    return {'payloadStart': count + 8, 'tensors': tensors, 'headerSHA256': sha(raw),
            'fileBytes': size, 'headerBytes': count}


def read_tensor(path, header, key, offset=0, count=None):
    t = header['tensors'][key]
    total, width = math.prod(t['shape']), WIDTHS[t['dtype']]
    count = total - offset if count is None else count
    require(type(offset) is int and type(count) is int and offset >= 0 and count > 0
            and offset <= total - count and count * width <= 16 * 1024 * 1024, 'Selected tensor element range exceeds bounds')
    at = header['payloadStart'] + t['data_offsets'][0] + offset * width
    with Path(path).open('rb') as stream:
        stream.seek(at)
        raw = stream.read(count * width)
    require(len(raw) == count * width, 'Truncated selected tensor storage')
    if t['dtype'] == 'BF16':
        array = decode_bf16(raw)
    elif t['dtype'] in ('F16', 'F32'):
        array = np.frombuffer(raw, dtype='<f2' if t['dtype'] == 'F16' else '<f4').astype('<f4')
    else:
        array = np.frombuffer(raw, dtype='u1').copy()
    require(np.isfinite(array).all(), 'Nonfinite selected original values')
    return array, {'name': key, 'elementOffset': offset, 'elementCount': count,
                   'absoluteByteOffset': at, 'byteLength': len(raw), 'sha256': sha(raw),
                   'dtype': t['dtype'], 'fullShape': t['shape']}


def stat_identity(path):
    s = Path(path).stat()
    return {key: str(value) for key, value in {'size': s.st_size, 'mtimeNs': s.st_mtime_ns,
            'ctimeNs': s.st_ctime_ns, 'dev': s.st_dev, 'ino': s.st_ino}.items()}


def write_private_json(path, value):
    raw = (json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + '\n').encode()
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as stream:
        stream.write(raw)
    return raw


def static_budget():
    return {'allMatrixWeightsResident': False, 'parameterReadsAreBounded': True,
            'maxDecodedElementsPerTile': 81920, 'ffnDownMaxRowsPerRead': 4,
            'fullBaseHashRecomputed': False, 'controlledForwardValuesPerStrength': 321536,
            'controlledForwardF32ArrayBytesPerStrength': 1286144,
            'ASelectedDownBF16Bytes': 1310720, 'ASelectedUpBF16Bytes': 1024,
            'ASelectedBaseRawWeightBytes': 20480, 'ASelectedBaseRawBiasBytes': 8,
            'AExpectedWeightF64BytesPerStrength': 163840,
            'BSelectedOriginalBytesPerStrength': 524671171,
            'BThreeStrengthSelectedOriginalBytes': 1574013513,
            'maxReferenceFileBytes': 2 * 1024 * 1024,
            'maxOutputBytes': 16 * 1024 * 1024, 'minimumFreeDiskBytes': 64 * 1024 * 1024,
            'minimumAvailableMemoryBytes': 256 * 1024 * 1024,
            'peakRSSMeasured': False, 'scope': 'Static array/read bounds; excludes Python/BLAS/OS cache and native resources'}


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])


def fixed_source(root, commit, path):
    file = Path(root) / path
    raw = file.read_bytes()
    require(raw == git(root, 'show', commit + ':' + path), 'Source differs from committed Git blob: ' + path)
    return {'commit': commit, 'path': path, 'bytes': len(raw), 'sha256': sha(raw)}


def load_peer(peer):
    require(git(peer, 'rev-parse', 'HEAD').decode().strip() == PEER_COMMIT, 'Explicit fixed7ee peer checkout required')
    core_record = fixed_source(peer, PEER_COMMIT, CORE_PATH)
    require(core_record['sha256'] == CORE_SHA, 'Independent forward core hash differs')
    plan_record = fixed_source(peer, PEER_COMMIT, PLAN_PATH)
    require(plan_record['sha256'] == PLAN_SHA, 'Frozen P4 plan differs')
    build_record = fixed_source(peer, PEER_COMMIT, BUILD_PATH)
    build = json.loads(git(peer, 'show', PEER_COMMIT + ':' + BUILD_PATH))
    core_record['buildManifest'] = build_record
    records = []
    for path, expected in build['sources'].items():
        record = fixed_source(peer, PEER_COMMIT, path)
        require(record['bytes'] == expected['byteLength'] and record['sha256'] == expected['sha256'], 'P4 build closure mismatch')
        records.append(record)
    require(len(records) == build['sourceCount'] == 50, 'Complete fixed P4 source closure required')
    spec = importlib.util.spec_from_file_location('fixed_p4_controlled_forward_core', peer / CORE_PATH)
    core = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(core)
    return core, records, core_record


def generate(args):
    peer, base, original = [Path(p).resolve() for p in (args.peer_root, args.base, args.file)]
    commit = git(ROOT, 'rev-parse', 'HEAD').decode().strip()
    own_source = fixed_source(ROOT, commit, SCRIPT_PATH)
    inventory_source = fixed_source(ROOT, commit, INVENTORY_PATH)
    core, peer_records, core_record = load_peer(peer)
    plan = core.load_plan()
    inventory = json.loads((ROOT / INVENTORY_PATH).read_bytes())
    item = next(v for v in inventory if v['pairId'] == 'light' and v['side'].upper() == 'LOW')
    require(re.fullmatch('[a-f0-9]{64}', args.expected_sha256) and args.expected_sha256 == item['sha256']
            and original.name == item['fileName'], 'Selected light/LOW identity differs from retained inventory')
    base_before, original_before = stat_identity(base), stat_identity(original)
    receipt_raw = Path(args.base_receipt).read_bytes()
    receipt_data = json.loads(receipt_raw)
    receipt = receipt_data.get('baseAcquisitionReceipt', receipt_data)
    require(receipt.get('status') == 'COMPLETE_VERIFIED' and receipt.get('fullFileVerified') is True
            and receipt.get('actualSHA256') == MODEL_SHA and receipt.get('expectedBytes') == MODEL_BYTES
            and Path(receipt['destination']).resolve() == base
            and {k: base_before[k] for k in ('size', 'mtimeNs', 'dev', 'ino')} == receipt.get('fileStat'),
            'Retained full-base receipt/stat binding changed; no new whole hash is claimed')
    require(int(original_before['size']) == item['bytes'], 'Selected File size changed')
    output = Path(args.out).resolve()
    require(not output.exists(), 'Use a new private output directory; do not overwrite prior evidence')
    require(not output.is_relative_to(ROOT) and not output.is_relative_to(peer)
            and not base.is_relative_to(output) and not original.is_relative_to(output), 'Private output must remain outside source/input repositories')
    budget = static_budget()
    output.mkdir(parents=True, mode=0o700)
    os.chmod(output, 0o700)
    free = shutil.disk_usage(output).free
    require(free >= budget['minimumFreeDiskBytes'], 'Insufficient private output disk headroom')
    available = os.sysconf('SC_AVPHYS_PAGES') * os.sysconf('SC_PAGE_SIZE')
    require(available >= budget['minimumAvailableMemoryBytes'], 'Insufficient static oracle memory headroom')
    files = []

    def save_json(name, value):
        raw = write_private_json(output / name, value)
        record = {'file': name, 'bytes': len(raw), 'sha256': sha(raw), 'dtype': 'JSON'}
        files.append(record)
        return record

    def save_array(name, value, dtype):
        value = np.asarray(value, dtype={'F32': '<f4', 'F64': '<f8', 'U8': 'u1'}[dtype], order='C')
        require(np.isfinite(value).all(), 'Nonfinite oracle array')
        raw = value.tobytes()
        with os.fdopen(os.open(output / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as stream:
            stream.write(raw)
        record = {'file': name, 'dtype': dtype, **identity(value)}
        files.append(record)
        return record

    # Gates and controlled input recipes are frozen before original values/products.
    gate_file = save_json('pre-execution-gates.json', {'scope': SCOPE, 'loaderPolicyId': POLICY,
        'strengths': [0, 1, -1], 'declaredStrengthRange': [-1, 1], 'gates': GATES, 'budget': budget})
    inputs, declaration = controlled_inputs()
    text, mask, fixture = core.fixture_conditioning()
    input_files = {'residual': save_array('input-residual.f32', inputs['residual'], 'F32'),
                   'timeAct1': save_array('input-timeAct1.f32', inputs['timeAct1'], 'F32'),
                   'conditioning': save_array('input-conditioning.f32', text.reshape(1, 4, 4096), 'F32'),
                   'conditioningMask': save_array('input-conditioning-mask.u8', mask, 'U8'),
                   'conditioningContract': fixture, 'declaration': declaration}
    input_file = save_json('controlled-inputs.json', input_files)
    # The plan identity is over exact published bytes, not a JSON reserialization.
    exact_plan = git(peer, 'show', PEER_COMMIT + ':' + PLAN_PATH)
    require(sha(exact_plan) == PLAN_SHA, 'Exact published plan bytes changed')
    with os.fdopen(os.open(output / 'candidate-plan.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as stream:
        stream.write(exact_plan)
    candidate_plan = {'file': 'candidate-plan.json', 'bytes': len(exact_plan), 'sha256': sha(exact_plan), 'dtype': 'JSON'}
    files.append(candidate_plan)
    h, lh = original_header(base), original_header(original)
    require(h['headerSHA256'] == HEADER_SHA and h['fileBytes'] == MODEL_BYTES, 'Fresh LOW base header/size mismatch')
    require(lh['headerSHA256'] == item['headerSha256'], 'Fresh selected LoRA header differs from retained identity')
    for key, dtype, shape in [(WEIGHT_ID, 'F8_E4M3', [5120, 5120]), (BIAS_ID, 'F16', [5120]),
                              (WEIGHT_ID[:-7] + '.weight_scale', 'F32', []),
                              (WEIGHT_ID[:-7] + '.comfy_quant', 'U8', [27])]:
        require(h['tensors'][key]['dtype'] == dtype and h['tensors'][key]['shape'] == shape, 'Actual cross-Q original profile mismatch')
    q, qr = read_tensor(base, h, WEIGHT_ID, count=20480)
    bias, br = read_tensor(base, h, BIAS_ID, count=4)
    scale, sr = read_tensor(base, h, 'blocks.0.cross_attn.q.weight_scale')
    config, cr = read_tensor(base, h, 'blocks.0.cross_attn.q.comfy_quant')
    require(sr['sha256'] == SCALE_SHA and cr['sha256'] == CONFIG_SHA
            and config.tobytes() == b'{"format": "float8_e4m3fn"}', 'Own LOW cross-Q scale/config receipt mismatch')
    base_weight = decode_fp8(q, scale[0]).reshape(4, 5120)
    dn, un, an, bn = [STEM + suffix for suffix in ('.lora_down.weight', '.lora_up.weight', '.alpha', '.diff_b')]
    for key, shape in [(dn, [128, 5120]), (un, [5120, 128]), (an, []), (bn, [5120])]:
        require(lh['tensors'][key]['dtype'] == 'BF16' and lh['tensors'][key]['shape'] == shape, 'Selected fixed-loader factor/alpha/bias shape or dtype mismatch')
    down, dr = read_tensor(original, lh, dn)
    up, ur = read_tensor(original, lh, un, count=4 * 128)
    alpha, ar = read_tensor(original, lh, an)
    delta, delta_r = read_tensor(original, lh, bn, count=4)
    require(float(alpha[0]) == 128, 'Observed alpha is not the selected fixed128/rank128 contract')
    down, up = down.reshape(128, 5120), up.reshape(4, 128)
    base_record = {'weight': save_array('base-weight.f32', base_weight, 'F32'),
                   'bias': save_array('base-bias.f32', bias, 'F32'),
                   'identity': {'modelSha256': MODEL_SHA, 'headerSha256': h['headerSHA256'],
                       'fileBytes': MODEL_BYTES, 'freshHeaderAndRangesRead': True,
                       'historicalFullHashReceiptReused': True, 'fullFileHashRecomputed': False,
                       'retainedStat': receipt['fileStat'], 'newStatBefore': base_before,
                       'ranges': [qr, br, sr, cr]}}
    cases = []
    for strength in (0, 1, -1):
        case_id = 's' + str(strength)
        weight = merge_reference(base_weight, down, up, strength, float(alpha[0]))
        expected_bias = bias_reference(bias, delta, strength)
        patch_values = [(WEIGHT_ID, [5120, 5120], weight.astype('<f4'), 'runtime-input'),
                        (BIAS_ID, [5120], expected_bias, 'hike-parameter')]
        patch = {'schemaVersion': 'bernini-p4-final-f32-patches/0.1', 'side': 'LOW',
                 'candidatePlanSHA256': PLAN_SHA, 'patches': [
                     {'weightId': key, 'fullShape': shape, 'offset': 0, 'count': int(values.size),
                      'binding': {'kind': kind, 'name': key}, 'dtype': 'F32',
                      'sha256': sha(values.tobytes()), 'data': values.reshape(-1).tolist()}
                     for key, shape, values, kind in patch_values]}
        patch_file = save_json(case_id + '-independent-patches.json', patch)
        patches, patch_description = core.validate_patches(patch, 'LOW', plan)
        parameters = core.Parameters(base, 'LOW', plan, patches)
        try:
            composed, _ = core.run_reference(parameters, inputs, text)
        finally:
            parameters.close()
        require(parameters.total <= budget['BSelectedOriginalBytesPerStrength'], 'Forward source read exceeded static traversal bound')
        record = {'id': case_id, 'strength': strength,
                  'weight': save_array(case_id + '-weight.f64', weight, 'F64'),
                  'bias': save_array(case_id + '-bias.f32', expected_bias, 'F32'),
                  'expectedOutput': save_array(case_id + '-blockOutput.f32', composed['blockOutput'].reshape(-1), 'F32'),
                  'independentPatchArtifact': patch_file}
        forward = {'schemaVersion': 'lora-p4-controlled-forward-reference/0.1-draft.1',
                   'scope': SCOPE, 'side': 'LOW', 'strength': strength,
                   'referenceId': 'lora-p4-controlled:LOW:' + case_id + ':' + commit,
                   'inputArtifactSha256': input_file['sha256'], 'inputIdentities': declaration['identities'],
                   'conditioning': fixture, 'independentPatchArtifactSha256': patch_file['sha256'],
                   'patchDescription': patch_description, 'forwardCoreLowRankMathImplemented': False,
                   'patchProducer': 'separate independent LoRA oracle A, not SDK/Hike actual prepared bytes',
                   'arrayIdentities': {key: core.identity(value) for key, value in composed.items()},
                   'parameterSources': parameters.sources, 'gates': GATES,
                   'selectedOriginalBytesRead': parameters.total, 'selectedPayloadBytesRead': parameters.payload_bytes,
                   'maxPayloadReadBytes': parameters.max_payload_read, 'matrixTiles': parameters.tiles,
                   'fullFileHashRecomputed': False, 'naturalN2Reused': False,
                   'modelInference': False, 'generationReady': False}
        record['forwardReference'] = save_json(case_id + '-forward-reference.json', forward)
        cases.append(record)
        del composed, parameters, patches, weight
    require(base_before == stat_identity(base) and original_before == stat_identity(original), 'Original source changed during independent selected reads')
    require(all(f['bytes'] <= budget['maxReferenceFileBytes'] for f in files)
            and sum(f['bytes'] for f in files) <= budget['maxOutputBytes'], 'Bounded private output budget exceeded')
    source_record = save_json('source-proof.json', {'executionSource': own_source, 'inventorySource': inventory_source,
        'peerSources': peer_records, 'coreSource': core_record, 'baseReceiptSha256': sha(receipt_raw),
        'baseStatBefore': base_before, 'baseStatAfter': stat_identity(base),
        'originalStatBefore': original_before, 'originalStatAfter': stat_identity(original),
        'wholeOriginalHashesComputed': 0, 'wholeBaseHashesComputed': 0})
    require(all(f['bytes'] <= budget['maxReferenceFileBytes'] for f in files)
            and sum(f['bytes'] for f in files) <= budget['maxOutputBytes'], 'Final private output budget exceeded')
    manifest = {'schemaVersion': 'lora-p4-controlled-oracle/0.1-draft.1', 'scope': SCOPE,
        'executionSource': {'commit': commit, 'path': SCRIPT_PATH, 'sha256': own_source['sha256'],
            'peerCommit': PEER_COMMIT, 'corePath': CORE_PATH, 'coreSha256': CORE_SHA,
            'planPath': PLAN_PATH, 'planSha256': PLAN_SHA},
        'selection': {'pairId': 'light', 'side': 'LOW', 'noise': 'low', 'weightId': WEIGHT_ID,
            'biasWeightId': BIAS_ID, 'fullWeightShape': [5120, 5120], 'fullBiasShape': [5120],
            'rows': [0, 4], 'columns': [0, 5120], 'coverage': 'PARTIAL', 'completeAdapter': False,
            'logicalPatchCount': item['pairCount'] + item['weightDiffCount'] + item['biasDiffCount'],
            'excludedPatchCount': item['pairCount'] + item['weightDiffCount'] + item['biasDiffCount'] - 2,
            'excludedTargetPolicy': 'all original LoRA targets except the selected cross-Q weight and explicit bias',
            'unselectedRegions': [{'weightId': WEIGHT_ID, 'rows': [4, 5120], 'columns': [0, 5120]},
                                  {'weightId': BIAS_ID, 'elements': [4, 5120]}]},
        'original': {'fileName': original.name, 'byteLength': int(original_before['size']),
            'expectedSha256': args.expected_sha256, 'headerSha256': lh['headerSHA256'],
            'wholeHashVerifiedByOracle': False, 'newRuntimeLoadWholeHashRequired': True,
            'historicalFourOriginalsRequired': False, 'sourceDtype': 'BF16', 'rank': 128,
            'alpha': float(alpha[0]), 'loaderPolicyId': POLICY, 'ranges': [dr, ur, ar, delta_r]},
        'inputs': input_files, 'controlledInputArtifact': input_file, 'candidatePlan': candidate_plan,
        'base': base_record, 'gates': GATES, 'gateArtifact': gate_file, 'sourceProof': source_record,
        'cases': cases, 'files': files, 'resources': {'staticBudget': budget, 'freeDiskBytesBefore': free,
            'availablePhysicalBytesBefore': available, 'measuredPeakRSSBytes': None},
        'status': 'INDEPENDENT_CONTROLLED_REFERENCES_GENERATED_NOT_NATIVE_ACCEPTANCE',
        'nativeTestsRun': 0, 'sdkOrHikeArithmeticUsed': False, 'naturalTailInputsReused': False,
        'realLoraAppliedByOracle': False, 'runtimeActualPreparedPatchHashesMustRemainSeparate': True,
        'generationReady': False, 'modelInference': False, 'snapshotPublished': False}
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, allow_nan=False, indent=2) + '\n').encode()
    require(len(manifest_bytes) <= budget['maxReferenceFileBytes']
            and sum(f['bytes'] for f in files) + len(manifest_bytes) <= budget['maxOutputBytes'],
            'Manifest-inclusive private output budget exceeded')
    write_private_json(output / 'manifest.json', manifest)
    return {'status': manifest['status'], 'manifest': str(output / 'manifest.json'),
            'manifestSHA256': sha((output / 'manifest.json').read_bytes()), 'cases': len(cases),
            'scope': SCOPE, 'generationReady': False}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--peer-root', required=True, type=Path)
    p.add_argument('--base', required=True, type=Path)
    p.add_argument('--base-receipt', required=True, type=Path)
    p.add_argument('--file', required=True, type=Path)
    p.add_argument('--expected-sha256', required=True)
    p.add_argument('--out', required=True, type=Path)
    print(json.dumps(generate(p.parse_args())))


if __name__ == '__main__':
    main()
