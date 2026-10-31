"""Independent streamed Bernini block0 prefix oracle for the natural Rect N2.

This is a separate diagnostic profile. It never promotes the old explicit N16
fixture or claims original production inputs, precision, HIGH-to-LOW handoff,
full block or model inference. Actual arrays are written only outside the repo.
"""
import argparse
import hashlib
import json
import math
import os
import struct
import subprocess
import time
from pathlib import Path

os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / 'development/ai-connection/qkv-next/hidden-core/candidate-plan.json'
MODELS = {
    'LOW': ('Bernini_LOW_fp8_e4m3fn_scaled.safetensors', 'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3', '286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b'),
    'HIGH': ('Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors', '9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52', 'd8aec897e3af480492d7eca7b57141ea968e89cde7f46ea7886db11754ebd6e3'),
}
F32 = np.float32
MEAN = np.asarray([-.7571, -.7089, -.9113, .1075, -.1745, .9653, -.1517, 1.5508, .4134, -.0715, .5517, -.3632, -.1922, -.9497, .2503, -.2921], dtype='<f4')
STD = np.asarray([2.8184, 1.4541, 2.3275, 2.6558, 1.2196, 1.7708, 2.6052, 2.0743, 3.2687, 2.1526, 2.8652, 1.5579, 1.6382, 1.1253, 2.8251, 1.916], dtype='<f4')
sha = lambda b: hashlib.sha256(b).hexdigest()


def identity(value):
    a = np.asarray(value, dtype='<f4')
    return {'shape': list(a.shape), 'elements': a.size, 'bytes': a.nbytes, 'sha256': sha(a.tobytes())}


def private_target(path):
    if not path.is_absolute() or path.resolve().is_relative_to(ROOT) or path.exists():
        raise ValueError('Use a new absolute private output path outside the repository')


def actual_raw_mean(plan):
    s = plan['sourceInput']
    raw = subprocess.run(['git', '-C', str(ROOT), 'show', s['commit'] + ':' + s['path']], check=True, capture_output=True).stdout
    assert len(raw) == 829 and sha(raw) == s['fileSha256']
    assert raw[:8] == b'WKTSR001'
    n = struct.unpack('<I', raw[8:12])[0]
    metadata = json.loads(raw[12:12 + n])
    payload = raw[12 + n:]
    assert len(payload) == 512 and metadata['byteLength'] == 512
    assert sha(payload) == s['payloadSha256'] == metadata['dataSha256']
    for field in ('dtype', 'shape', 'layout', 'meaning', 'modelSha256'):
        assert metadata[field] == s[field]
    return np.frombuffer(payload, dtype='<f4').copy(), metadata


def time_sinusoid(timestep):
    # Independent scalar primitives with explicit F32 intermediate positions.
    output = np.empty(256, dtype='<f4')
    for i in range(128):
        exponent = F32(-F32(F32(i) / F32(128)))
        omega = F32(math.pow(10000.0, float(exponent)))
        phase = F32(F32(timestep) * omega)
        output[i] = F32(math.cos(float(phase)))
        output[128 + i] = F32(math.sin(float(phase)))
    return output


def silu(value):
    # Stable mathematical oracle, independent of ORT Sigmoid/Mul kernels.
    x = np.asarray(value, dtype='<f4')
    assert np.isfinite(x).all() and np.max(np.abs(x)) <= 1e6
    x64 = x.astype(np.float64)
    positive = x64 >= 0
    sigmoid = np.empty_like(x64)
    sigmoid[positive] = 1.0 / (1.0 + np.exp(-x64[positive]))
    ex = np.exp(x64[~positive])
    sigmoid[~positive] = ex / (1.0 + ex)
    return (x64 * sigmoid).astype('<f4')


class OriginalParameters:
    """Bounded immutable F16 read provider for the independent reference only."""
    def __init__(self, path, expected_header):
        self.path, self.expected_header = path, expected_header
        self.original = path.stat()
        assert self.original.st_size == 15574833216
        self.file = path.open('rb')
        self.total, self.parameter_bytes, self.max_read, self.max_parameter_read = 0, 0, 0, 0
        self.ranges = []
        n = struct.unpack('<Q', self.read(0, 8, header=True))[0]
        assert n == 181280
        raw = self.read(8, n, header=True)
        assert sha(raw) == expected_header
        self.header = json.loads(raw)
        self.payload = 8 + n

    def read(self, offset, count, header=False):
        assert isinstance(offset, int) and isinstance(count, int)
        assert 0 <= offset < self.original.st_size and 0 < count <= (181280 if header else 163840)
        assert offset + count <= self.original.st_size
        self.file.seek(offset)
        raw = self.file.read(count)
        assert len(raw) == count
        self.total += count
        self.max_read = max(self.max_read, count)
        if not header:
            self.parameter_bytes += count
            self.max_parameter_read = max(self.max_parameter_read, count)
        return raw

    def descriptor(self, key, shape):
        d = self.header[key]
        assert d['shape'] == shape and d['dtype'] == 'F16'
        assert d['data_offsets'][1] - d['data_offsets'][0] == math.prod(shape) * 2
        assert 0 <= self.payload + d['data_offsets'][0] < self.original.st_size
        assert self.payload + d['data_offsets'][1] <= self.original.st_size
        return d

    def vector(self, key, full_shape, count=None):
        d = self.descriptor(key, full_shape)
        count = math.prod(full_shape) if count is None else count
        assert 0 < count <= math.prod(full_shape)
        raw = self.read(self.payload + d['data_offsets'][0], count * 2)
        out = np.frombuffer(raw, dtype='<f2').astype('<f4')
        assert np.isfinite(out).all()
        self.ranges.append({'key': key, 'fullShape': full_shape, 'storageDtype': 'F16', 'selectedElements': count, 'absoluteOffset': self.payload + d['data_offsets'][0], 'sourceBytes': len(raw), 'rawSHA256': sha(raw), 'decodedF32SHA256': sha(out.tobytes())})
        return out

    def linear(self, key, full_shape, input_value, rows=None):
        d = self.descriptor(key + '.weight', full_shape)
        width = math.prod(full_shape[1:])
        rows = full_shape[0] if rows is None else rows
        assert 0 < rows <= full_shape[0] and rows % 16 == 0
        x = np.asarray(input_value, dtype='<f4').reshape(-1, width)
        bias = self.vector(key + '.bias', [full_shape[0]], rows)
        out = np.empty((x.shape[0], rows), dtype='<f4')
        raw_hash, decoded_hash = hashlib.sha256(), hashlib.sha256()
        for first in range(0, rows, 16):
            raw = self.read(self.payload + d['data_offsets'][0] + first * width * 2, 16 * width * 2)
            decoded = np.frombuffer(raw, dtype='<f2').astype('<f4').reshape(16, width)
            assert np.isfinite(decoded).all()
            raw_hash.update(raw)
            decoded_hash.update(decoded.tobytes())
            dot = (x.astype(np.float64) @ decoded.astype(np.float64).T).astype('<f4')
            out[:, first:first + 16] = (dot + bias[first:first + 16]).astype('<f4')
        self.ranges.append({'key': key + '.weight', 'fullShape': full_shape, 'storageDtype': 'F16', 'selectedRows': [0, rows], 'absoluteOffset': self.payload + d['data_offsets'][0], 'sourceBytes': rows * width * 2, 'rawSHA256': raw_hash.hexdigest(), 'decodedF32SHA256': decoded_hash.hexdigest()})
        assert np.isfinite(out).all()
        return out

    def close(self):
        self.file.close()
        after = self.path.stat()
        fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        assert all(getattr(after, f) == getattr(self.original, f) for f in fields)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--models', type=Path, required=True)
    p.add_argument('--side', choices=MODELS, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--receipt', type=Path)
    args = p.parse_args()
    private_target(args.output)
    started = time.perf_counter()
    plan_bytes = PLAN.read_bytes()
    plan = json.loads(plan_bytes)
    assert plan['status'] == 'PRE_EXECUTION_GATE_FIXED' and plan['gateMayNotBeRelaxedAfterComparison']
    assert plan['target']['hiddenShape'] == [2, 5120]
    raw_mean, raw_metadata = actual_raw_mean(plan)
    noise = np.asarray([(((i * 29 + 7) % 127) - 63) / 64 for i in range(128)], dtype='<f4')
    case = next(c for c in plan['input']['cases'] if c['side'] == args.side)
    sigma = F32(case['sigma'])
    timestep = F32(sigma * F32(1000))
    normalized = np.empty(128, dtype='<f4')
    for i in range(128):
        normalized[i] = F32(F32(F32(raw_mean[i] - MEAN[i // 8]) * F32(1)) / STD[i // 8])
    assert sha(normalized.tobytes()) == '4c6802f01df4ecd426cfc5910ee33d450858214c3d4bd4823499c2ddd313bfe5'
    complement = F32(F32(1) - sigma)
    noised = (np.asarray(sigma * np.asarray(F32(1) * noise, dtype='<f4'), dtype='<f4') + np.asarray(complement * normalized, dtype='<f4')).astype('<f4')
    patches = np.empty((2, 64), dtype='<f4')
    for token in range(2):
        for channel in range(16):
            for kh in range(2):
                for kw in range(2):
                    patches[token, channel * 4 + kh * 2 + kw] = noised[channel * 8 + kh * 4 + token * 2 + kw]
    name, model_hash, header_hash = MODELS[args.side]
    source = OriginalParameters(args.models / name, header_hash)
    try:
        patch_hidden = source.linear('patch_embedding', [5120, 16, 1, 2, 2], patches)
        time_sin = time_sinusoid(timestep)
        time0 = source.linear('time_embedding.0', [5120, 256], time_sin).reshape(-1)
        act0 = silu(time0)
        time_embedding = source.linear('time_embedding.2', [5120, 5120], act0).reshape(-1)
        act1 = silu(time_embedding)
        projection = source.linear('time_projection.1', [30720, 5120], act1, rows=10240).reshape(-1)
        modulation = source.vector('blocks.0.modulation', [1, 6, 5120], 10240)
        combined = (projection + modulation).astype('<f4')
        shift, scale = combined[:5120].copy(), combined[5120:].copy()
    finally:
        source.close()
    assert source.parameter_bytes == 160634880
    assert source.max_parameter_read <= 163840 and source.max_read <= 181280
    assert np.max(np.abs(patch_hidden)) <= 1e16
    hidden64 = patch_hidden.astype(np.float64)
    center = hidden64 - np.mean(hidden64, axis=-1, keepdims=True)
    normalized_hidden = (center / np.sqrt(np.mean(center * center, axis=-1, keepdims=True) + float(F32(1e-6)))).astype('<f4')
    one_plus_scale = (F32(1) + scale).astype('<f4')
    hidden = (normalized_hidden.astype(np.float64) * one_plus_scale.astype(np.float64) + shift.astype(np.float64)).astype('<f4')
    arrays = {'normalizedMean': normalized, 'noisedLatent': noised, 'patches': patches, 'patchHidden': patch_hidden, 'timeSin': time_sin, 'timeLinear0': time0, 'timeAct0': act0, 'timeEmbedding': time_embedding, 'timeAct1': act1, 'timeProjection': projection, 'shift': shift, 'scale': scale, 'layerNorm': normalized_hidden, 'hidden': hidden}
    assert all(np.isfinite(v).all() for v in arrays.values())
    identities = {k: identity(v) for k, v in arrays.items()}
    meta = {'profileId': plan['profileId'], 'scope': plan['scope'], 'side': args.side, 'globalSigmaIndex': case['globalSigmaIndex'], 'sigma': float(sigma), 'modelTimestep': float(timestep), 'modelSha256': model_hash, 'headerSha256': header_hash, 'coreCommit': plan['coreCommit'], 'planSHA256': sha(plan_bytes), 'rawMeanSource': plan['sourceInput'], 'noiseRecipe': plan['input']['noiseRecipe'], 'noiseIdentity': identity(noise), 'coordinates': plan['target']['coordinates'], 'actualModelOperatorsDerived': True, 'originalWorkflowInputVerified': False, 'originalWorkflowNoiseVerified': False, 'productionHiddenVerified': False, 'lowIsActualHighToLowHandoff': False, 'readiness': plan['readiness']}
    output = {'schemaVersion': 'bernini-hidden-prefix-reference/0.1', 'meta': meta, 'coords': plan['target']['coordinates'], 'input': {'rawMean': {**raw_metadata, 'profileId': plan['sourceInput']['rawMeanProfileId'], 'data': raw_mean.tolist()}, 'noise': noise.tolist(), 'noiseScale': 1}, 'expected': {k: v.reshape(-1).tolist() for k, v in arrays.items()}, 'arrayIdentities': identities, 'ranges': source.ranges, 'gates': plan['gates']}
    raw = (json.dumps(output, separators=(',', ':'), allow_nan=False) + '\n').encode()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(raw)
    receipt = {'schemaVersion': 'bernini-hidden-prefix-reference-receipt/0.1', 'meta': meta, 'referenceBytes': len(raw), 'referenceSHA256': sha(raw), 'generatorSHA256': sha(Path(__file__).read_bytes()), 'arrayIdentities': identities, 'ranges': source.ranges, 'originalFileBytesRead': source.total, 'selectedParameterBytesRead': source.parameter_bytes, 'maxSingleReadBytes': source.max_read, 'maxSingleParameterReadBytes': source.max_parameter_read, 'fullFileSha256Recomputed': False, 'privateReferencePayloadPublished': False, 'gates': plan['gates'], 'referenceBackend': {'numpy': np.__version__, 'blasThreads': 1, 'linear': 'binary64 dot then F32; F32 bias', 'sinusoid': 'scalar F64 math primitives at declared F32 intermediate positions', 'silu': 'stable binary64 sigmoid*x then F32', 'layerNorm': 'binary64 two-pass mean/variance/sqrt then F32', 'modulate': 'F32 scale+one; binary64 product+add then F32'}, 'elapsedSeconds': time.perf_counter() - started}
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(receipt, indent=2, allow_nan=False) + '\n')
    print(json.dumps({k: receipt[k] for k in ('referenceBytes', 'referenceSHA256', 'selectedParameterBytesRead', 'maxSingleParameterReadBytes', 'maxSingleReadBytes', 'elapsedSeconds')}))


if __name__ == '__main__':
    main()
