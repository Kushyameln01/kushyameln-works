"""Independent streamed actual-weight QKV/norm/RoPE selected-operator reference.

This explicit hidden fixture is not an actual model activation or production
precision acceptance. Numeric arrays stay in the caller's private output file.
Only metadata/hashes are written to the optional public receipt.
"""
import argparse
import hashlib
import json
import math
import os
import struct
import time
from pathlib import Path

os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / 'development/ai-connection/profile-adoption/p4/candidate-plan.json'
MODELS = {
    'LOW': ('Bernini_LOW_fp8_e4m3fn_scaled.safetensors', 'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3', '286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b'),
    'HIGH': ('Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors', '9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52', 'd8aec897e3af480492d7eca7b57141ea968e89cde7f46ea7886db11754ebd6e3'),
}
sha = lambda raw: hashlib.sha256(raw).hexdigest()
f32 = np.float32


def decode_e4m3fn(code):
    exponent, mantissa = (code >> 3) & 15, code & 7
    if exponent == 15 and mantissa == 7:
        return math.nan
    value = math.ldexp(mantissa, -9) if exponent == 0 else math.ldexp(1 + mantissa / 8, exponent - 7)
    return -value if code & 128 else value


def array_identity(value):
    a = np.asarray(value, dtype='<f4')
    return {'shape': list(a.shape), 'elements': a.size, 'bytes': a.nbytes, 'sha256': sha(a.tobytes())}


def axis_rope(position, dim):
    # Independent equivalent of fixed flux/math.py:rope before source rotation.
    scale = np.linspace(0.0, (dim - 2) / dim, dim // 2, dtype=np.float64)
    omega = 1.0 / np.power(np.float64(10000.0), scale)
    angles = np.float64(f32(position)) * omega
    return np.stack([np.cos(angles), -np.sin(angles), np.sin(angles), np.cos(angles)], axis=-1).astype('<f4').reshape(-1, 2, 2)


def rope_matrices(coordinates):
    output = np.empty((16, 64, 2, 2), dtype='<f4')
    for row, c in enumerate(coordinates):
        base = np.concatenate([axis_rope(c[axis], dim) for axis, dim in zip(('t', 'h', 'w'), (44, 42, 42))])
        if c['sourceId']:
            rotation = axis_rope(c['sourceId'], 128)
            composed = np.empty_like(base)
            for i in range(2):
                for j in range(2):
                    first = (base[:, i, 0] * rotation[:, 0, j]).astype('<f4')
                    second = (base[:, i, 1] * rotation[:, 1, j]).astype('<f4')
                    composed[:, i, j] = (first + second).astype('<f4')
            base = composed
        output[row] = base
    return output


def apply_rope(value, matrices):
    pairs = np.asarray(value, dtype='<f4').reshape(16, 64, 2)
    output = np.empty_like(pairs)
    for i in range(2):
        first = (matrices[:, :, i, 0] * pairs[:, :, 0]).astype('<f4')
        second = (matrices[:, :, i, 1] * pairs[:, :, 1]).astype('<f4')
        output[:, :, i] = (first + second).astype('<f4')
    return output.reshape(16, 128)


def norms(value, weight):
    value64, weight64 = value.astype(np.float64), weight.astype(np.float64)
    epsilon = np.float64(f32(1e-6))
    truth = (value64 / np.sqrt(np.mean(value64 * value64, axis=-1, keepdims=True) + epsilon) * weight64).astype('<f4')
    ordered = np.empty_like(value)
    for row in range(16):
        total = f32(0)
        for item in value[row]:
            total = f32(total + f32(item * item))
        variance = f32(total / f32(5120))
        inverse = f32(f32(1) / f32(math.sqrt(float(f32(variance + f32(1e-6))))))
        ordered[row] = ((value[row] * inverse).astype('<f4') * weight).astype('<f4')
    return truth, ordered


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--models', type=Path, required=True)
    parser.add_argument('--side', choices=MODELS, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--receipt', type=Path)
    args = parser.parse_args()
    if not args.output.is_absolute() or args.output.resolve().is_relative_to(ROOT) or args.output.exists():
        raise ValueError('Use a new absolute private output path outside this repository')
    start = time.perf_counter()
    plan_bytes = PLAN.read_bytes()
    plan = json.loads(plan_bytes)
    assert plan['status'] == 'PRE_EXECUTION_GATE_FIXED' and plan['gateMayNotBeRelaxedAfterComparison'] is True
    coords = plan['target']['coordinates']
    assert len(coords) == 16 and sorted(set(c['sourceId'] for c in coords)) == [0, 1, 2]
    name, model_hash, header_hash = MODELS[args.side]
    path = args.models / name
    original = path.stat()
    assert original.st_size == 15574833216
    input_value = np.asarray([[(((row * 17 + col * 13) % 101) - 50) / 64 for col in range(5120)] for row in range(16)], dtype='<f4')
    input64 = input_value.astype(np.float64)
    lut = np.asarray([decode_e4m3fn(c) for c in range(256)], dtype='<f4')
    ranges, projection, weights, bytes_read, max_read = [], {}, {}, 0, 0
    norm_weight, norm_truth, norm_ordered = {}, {}, {}
    with path.open('rb') as source:
        def raw_at(offset, length):
            nonlocal bytes_read, max_read
            assert 0 <= offset <= original.st_size and 0 < length <= 181280 and offset + length <= original.st_size
            source.seek(offset)
            raw = source.read(length)
            assert len(raw) == length
            bytes_read += length
            max_read = max(max_read, length)
            return raw
        header_size = struct.unpack('<Q', raw_at(0, 8))[0]
        assert header_size == 181280
        header_bytes = raw_at(8, header_size)
        assert sha(header_bytes) == header_hash
        header = json.loads(header_bytes)
        payload = 8 + header_size
        def tensor(key, dtype, shape, count):
            d = header[key]
            assert d['dtype'] == dtype and d['shape'] == shape and d['data_offsets'][1] - d['data_offsets'][0] == count
            return d
        for component in ('q', 'k', 'v'):
            prefix = 'blocks.0.self_attn.' + component
            weight = tensor(prefix + '.weight', 'F8_E4M3', [5120, 5120], 5120 * 5120)
            bias_desc = tensor(prefix + '.bias', 'F16', [5120], 5120 * 2)
            scale_desc = tensor(prefix + '.weight_scale', 'F32', [], 4)
            config_desc = tensor(prefix + '.comfy_quant', 'U8', [27], 27)
            scale_bytes = raw_at(payload + scale_desc['data_offsets'][0], 4)
            scale = np.frombuffer(scale_bytes, dtype='<f4')[0]
            assert math.isfinite(float(scale)) and scale > 0
            config = raw_at(payload + config_desc['data_offsets'][0], 27)
            assert config == b'{"format": "float8_e4m3fn"}'
            bias_raw = raw_at(payload + bias_desc['data_offsets'][0], 5120 * 2)
            bias = np.frombuffer(bias_raw, dtype='<f2').astype('<f4')
            out = np.empty((16, 5120), dtype='<f4')
            raw_hash, decoded_hash = hashlib.sha256(), hashlib.sha256()
            for row in range(0, 5120, 16):
                raw = raw_at(payload + weight['data_offsets'][0] + row * 5120, 16 * 5120)
                raw_hash.update(raw)
                decoded = (lut[np.frombuffer(raw, dtype='u1')].reshape(16, 5120) * scale).astype('<f4')
                assert np.isfinite(decoded).all()
                decoded_hash.update(decoded.tobytes())
                projected = (input64 @ decoded.astype(np.float64).T).astype('<f4')
                out[:, row:row + 16] = (projected + bias[row:row + 16]).astype('<f4')
            assert np.isfinite(out).all()
            projection[component] = out
            ranges.append({'key': prefix + '.weight', 'fullShape': [5120, 5120], 'storageDtype': 'F8_E4M3', 'payloadOffset': weight['data_offsets'][0], 'sourceBytes': 5120 * 5120, 'rawSHA256': raw_hash.hexdigest(), 'decodedF32SHA256': decoded_hash.hexdigest(), 'scaleSHA256': sha(scale_bytes), 'configSHA256': sha(config), 'biasF32SHA256': sha(bias.tobytes())})
        for component in ('q', 'k'):
            key = 'blocks.0.self_attn.norm_' + component + '.weight'
            d = tensor(key, 'F16', [5120], 10240)
            raw = raw_at(payload + d['data_offsets'][0], 10240)
            affine = np.frombuffer(raw, dtype='<f2').astype('<f4')
            assert np.isfinite(affine).all()
            norm_weight[component] = affine
            norm_truth[component], norm_ordered[component] = norms(projection[component], affine)
            ranges.append({'key': key, 'fullShape': [5120], 'storageDtype': 'F16', 'payloadOffset': d['data_offsets'][0], 'sourceBytes': len(raw), 'rawSHA256': sha(raw), 'decodedF32SHA256': sha(affine.tobytes())})
    after = path.stat()
    assert (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) == (original.st_dev, original.st_ino, original.st_size, original.st_mtime_ns, original.st_ctime_ns)
    matrices = rope_matrices(coords)
    q = apply_rope(norm_truth['q'][:, :128], matrices)
    k = apply_rope(norm_truth['k'][:, :128], matrices)
    v = projection['v'][:, :128].copy()
    scale = f32(1 / math.sqrt(128))
    score = (q.astype(np.float64) @ k.astype(np.float64).T) * float(scale)
    exp = np.exp(score - np.max(score, axis=1, keepdims=True))
    attention = (exp / np.sum(exp, axis=1, keepdims=True) @ v.astype(np.float64)).astype('<f4')
    arrays = {'input': input_value, 'matrices': matrices, 'q': q, 'k': k, 'v': v, 'attention': attention}
    for group, items in [('qkv', projection), ('norm', norm_truth), ('normOrdered', norm_ordered), ('normWeights', norm_weight)]:
        for component, value in items.items():
            arrays[group + '.' + component] = value
    assert all(np.isfinite(value).all() for value in arrays.values())
    identities = {name: array_identity(value) for name, value in arrays.items()}
    expected = {'qkv': {n: a.reshape(-1).tolist() for n, a in projection.items()}, 'norm': {n: a.reshape(-1).tolist() for n, a in norm_truth.items()}, 'normOrdered': {n: a.reshape(-1).tolist() for n, a in norm_ordered.items()}, **{n: arrays[n].reshape(-1).tolist() for n in ('matrices', 'q', 'k', 'v', 'attention')}}
    output = {'schemaVersion': 'bernini-p4-reference/0.1', 'scope': 'ACTUAL_WEIGHT_EXPLICIT_HIDDEN16_DIAGNOSTIC_ONLY', 'side': args.side, 'modelHash': model_hash, 'headerSHA256': header_hash, 'fullFileHashRecomputed': False, 'planSHA256': sha(plan_bytes), 'gates': plan['gates'], 'coords': coords, 'inputRecipe': 'float32((((row*17+column*13)%101)-50)/64), rows16/columns5120', 'input': input_value.reshape(-1).tolist(), 'normWeights': {n: a.tolist() for n, a in norm_weight.items()}, 'expected': expected, 'arrayIdentities': identities, 'ranges': ranges, 'productionQKVVerified': False, 'P5': 'BLOCKED'}
    raw = (json.dumps(output, separators=(',', ':'), allow_nan=False) + '\n').encode()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as target:
        target.write(raw)
    receipt = {'schemaVersion': 'bernini-p4-reference-receipt/0.1', 'scope': output['scope'], 'side': args.side, 'modelHash': model_hash, 'headerSHA256': header_hash, 'fullFileHashRecomputed': False, 'planSHA256': sha(plan_bytes), 'generatorSHA256': sha(Path(__file__).read_bytes()), 'referenceBytes': len(raw), 'referenceSHA256': sha(raw), 'privateReferencePayloadPublished': False, 'inputRecipe': output['inputRecipe'], 'gates': plan['gates'], 'arrayIdentities': identities, 'ranges': ranges, 'originalFileBytesRead': bytes_read, 'maxSingleReadBytes': max_read, 'elapsedSeconds': time.perf_counter() - start, 'referenceBackend': {'numpy': np.__version__, 'blasThreads': 1, 'projectionAccumulation': 'binary64', 'normOracle': 'binary64 reduction/sqrt then F32', 'ropeTrigonometry': 'binary64 numpy then F32', 'attention': 'binary64 stable softmax then F32'}, 'productionQKVVerified': False, 'P5': 'BLOCKED'}
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(receipt, indent=2, allow_nan=False) + '\n')
    print(json.dumps({k: receipt[k] for k in ('scope', 'side', 'referenceBytes', 'referenceSHA256', 'originalFileBytesRead', 'maxSingleReadBytes', 'elapsedSeconds', 'productionQKVVerified', 'P5')}))


if __name__ == '__main__':
    main()
