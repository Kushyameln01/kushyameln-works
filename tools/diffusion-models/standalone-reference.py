"""Independent, bounded-row Bernini full-40-block numerical reference.

This module never imports the candidate, its runtime, ORT, or an existing oracle.
Original safetensors descriptors and payload bytes are parsed here. Only one
bounded weight-row tile is decoded at a time. A controlled N5/L3 test is not the
required original-media 81-frame workflow or a production-readiness assertion.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import sys
import time

for _name in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ[_name] = '1'
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'development/ai-connection/standalone-d1-d4-20261102/reference'
CORE = Path('/workspace/work/diffusion-investigation/model-architecture/comfy_ldm_wan_model.py')
CORE_SHA256 = '17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699'
MODEL_BYTES, HEADER_BYTES = 15574833216, 181280
MODELS = {
    'HIGH': ('Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors', '9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52', 'd8aec897e3af480492d7eca7b57141ea968e89cde7f46ea7886db11754ebd6e3'),
    'LOW': ('Bernini_LOW_fp8_e4m3fn_scaled.safetensors', 'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3', '286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b'),
}
GATE = {'abs': 0.01, 'rel': 0.001}
TEXT_MODEL = 'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68'
TOKENIZER = 'e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458'
PROFILE = 'bernini-independent-full40-controlled-n5-l3-f64-reference-v1'
sha = lambda value: hashlib.sha256(value).hexdigest()


def trace_shapes():
    return {'patchHidden': [1, 5, 5120], 'textEmbedded': [1, 3, 5120], 'timeRaw': [1, 5120], 'timeAct1': [1, 5120], 'timeProjection': [1, 6, 5120], **{'block' + str(index).zfill(2) + 'Output': [1, 5, 5120] for index in range(40)}, 'headAll': [1, 5, 64], 'prediction': [1, 16, 1, 2, 4]}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON key: ' + key)
        result[key] = value
    return result


def read_json(path):
    raw = Path(path).read_bytes()
    return json.loads(raw, object_pairs_hook=unique_object), sha(raw)


def f32(values, shape=None):
    result = np.asarray(values, dtype='<f4')
    if shape is not None:
        require(result.size == math.prod(shape), 'Exact F32 element count required')
        result = result.reshape(shape)
    require(np.isfinite(result).all(), 'Finite F32 values required')
    return result


def identity(values):
    values = np.ascontiguousarray(f32(values))
    return {'shape': list(values.shape), 'elements': int(values.size), 'bytes': int(values.nbytes), 'sha256': sha(values.tobytes())}


def expected_specs():
    """Registry derived from the pinned actual model constructors, not runtime."""
    specs = {}
    def add(key, shape, dtype='F16'):
        specs[key] = {'shape': shape, 'dtype': dtype}
    for name, shape in (
        ('patch_embedding', [5120, 16, 1, 2, 2]),
        ('text_embedding.0', [5120, 4096]), ('text_embedding.2', [5120, 5120]),
        ('time_embedding.0', [5120, 256]), ('time_embedding.2', [5120, 5120]),
        ('time_projection.1', [30720, 5120]), ('head.head', [64, 5120]),
    ):
        add(name + '.weight', shape)
        add(name + '.bias', [shape[0]])
    add('head.modulation', [1, 2, 5120])
    for block in range(40):
        prefix = 'blocks.' + str(block) + '.'
        add(prefix + 'modulation', [1, 6, 5120])
        for kind in ('weight', 'bias'):
            add(prefix + 'norm3.' + kind, [5120])
        for attention in ('self_attn', 'cross_attn'):
            for kind in ('q', 'k'):
                add(prefix + attention + '.norm_' + kind + '.weight', [5120])
            for projection in ('q', 'k', 'v', 'o'):
                stem = prefix + attention + '.' + projection
                add(stem + '.bias', [5120])
                quantized = not (attention == 'cross_attn' and projection == 'o')
                add(stem + '.weight', [5120, 5120], 'F8_E4M3' if quantized else 'F16')
        for layer, shape in (('0', [13824, 5120]), ('2', [5120, 13824])):
            stem = prefix + 'ffn.' + layer
            add(stem + '.weight', shape, 'F8_E4M3')
            add(stem + '.bias', [shape[0]])
    for key, spec in list(specs.items()):
        if spec['dtype'] == 'F8_E4M3':
            add(key[:-7] + '.weight_scale', [], 'F32')
            add(key[:-7] + '.comfy_quant', [27], 'U8')
    return specs


def decode_e4m3fn(code):
    sign = -1.0 if code & 128 else 1.0
    exponent, fraction = (code >> 3) & 15, code & 7
    if exponent == 15 and fraction == 7:
        return float('nan')
    return sign * math.ldexp(fraction / 8.0, -6) if exponent == 0 else sign * math.ldexp(1 + fraction / 8.0, exponent - 7)


FP8 = np.asarray([decode_e4m3fn(code) for code in range(256)], dtype='<f4')


def decode(raw, dtype, scale=None):
    if dtype == 'F16':
        require(len(raw) % 2 == 0, 'Exact binary16 byte extent required')
        # NumPy's IEEE binary16 decode is independent of candidate JS/WASM code.
        result = np.frombuffer(raw, dtype='<f2').astype('<f4')
    elif dtype == 'F32':
        require(len(raw) % 4 == 0, 'Exact binary32 byte extent required')
        result = np.frombuffer(raw, dtype='<f4').copy()
    else:
        require(dtype == 'F8_E4M3' and scale is not None and np.isfinite(scale) and scale > 0, 'Positive finite own FP8 scale required')
        result = np.multiply(FP8[np.frombuffer(raw, dtype='u1')], np.float32(scale), dtype=np.float32)
    require(np.isfinite(result).all(), 'Nonfinite original model data')
    return result


class Parameters:
    """Seek only; neither a full-file mapping nor a dequantized model cache."""
    def __init__(self, path, side, tile_rows=128):
        require(side in MODELS and type(tile_rows) is int and 1 <= tile_rows <= 128, 'Pinned side and bounded rows1..128 required')
        self.path, self.side, self.tile_rows = Path(path), side, tile_rows
        self.before = self.path.stat()
        require(self.before.st_size == MODEL_BYTES, 'Pinned original model byte size mismatch')
        self.file = self.path.open('rb')
        self.read_calls = self.total_read = self.payload_read = self.max_payload_read = self.tiles = 0
        self.sources, self.scales = {}, {}
        try:
            n = struct.unpack('<Q', self.read(0, 8, header=True))[0]
            require(n == HEADER_BYTES, 'Pinned original header length mismatch')
            raw = self.read(8, n, header=True)
            require(sha(raw) == MODELS[side][2], 'Pinned original side/header mismatch')
            self.header, self.payload = json.loads(raw, object_pairs_hook=unique_object), 8 + n
            specs = expected_specs()
            require(set(self.header) == set(specs) | {'__metadata__'}, 'Exact actual model tensor population required')
            intervals = []
            units = {'F16': 2, 'F32': 4, 'F8_E4M3': 1, 'U8': 1}
            for key, spec in specs.items():
                entry = self.header[key]
                require(entry.get('shape') == spec['shape'] and entry.get('dtype') == spec['dtype'], 'Original tensor descriptor mismatch: ' + key)
                offsets = entry.get('data_offsets')
                require(isinstance(offsets, list) and len(offsets) == 2 and all(type(v) is int for v in offsets) and 0 <= offsets[0] < offsets[1] <= MODEL_BYTES - self.payload and offsets[1] - offsets[0] == math.prod(spec['shape']) * units[spec['dtype']], 'Original tensor byte extent mismatch: ' + key)
                intervals.append(tuple(offsets))
            intervals.sort()
            require(intervals[0][0] == 0 and intervals[-1][1] == MODEL_BYTES - self.payload and all(a[1] == b[0] for a, b in zip(intervals, intervals[1:])), 'Safetensors payload overlap/gap detected')
        except BaseException:
            self.file.close()
            raise

    def read(self, offset, count, *, header=False):
        bound = HEADER_BYTES if header else 128 * 13824 * 2
        require(type(offset) is int and type(count) is int and 0 < count <= bound and 0 <= offset <= self.before.st_size - count, 'Original selected read outside bounded extent')
        self.file.seek(offset)
        raw = self.file.read(count)
        require(len(raw) == count, 'Short original selected read')
        self.read_calls += 1
        self.total_read += count
        if not header:
            self.payload_read += count
            self.max_payload_read = max(self.max_payload_read, count)
        return raw

    def whole_small(self, key):
        spec = self.header[key]
        require(math.prod(spec['shape']) <= 30720 and spec['dtype'] in ('F16', 'F32', 'U8'), 'Small original parameter only')
        begin, stop = spec['data_offsets']
        raw = self.read(self.payload + begin, stop - begin)
        self.sources[key] = {'shape': spec['shape'], 'storageDtype': spec['dtype'], 'absoluteOffset': self.payload + begin, 'bytesRead': len(raw), 'rawSHA256': sha(raw)}
        return raw if spec['dtype'] == 'U8' else decode(raw, spec['dtype']).reshape(spec['shape'])

    def scale(self, key):
        if key not in self.scales:
            stem = key[:-7]
            scale = self.whole_small(stem + '.weight_scale').item()
            config = self.whole_small(stem + '.comfy_quant')
            require(config == b'{"format": "float8_e4m3fn"}' and math.isfinite(scale) and scale > 0, 'Own exact scaled E4M3FN scalar profile required')
            self.scales[key] = np.float32(scale)
        return self.scales[key]

    def linear(self, stem, x):
        key = stem + '.weight'
        entry = self.header[key]
        shape, dtype = entry['shape'], entry['dtype']
        rows, inner = shape[0], math.prod(shape[1:])
        x = f32(x)
        require(x.ndim == 2 and x.shape[1] == inner and 1 <= x.shape[0] <= 512, 'Complete finite projection input required: ' + stem)
        values = x.astype(np.float64)
        bias = self.whole_small(stem + '.bias').reshape(rows)
        scale = self.scale(key) if dtype == 'F8_E4M3' else None
        unit = 1 if dtype == 'F8_E4M3' else 2
        begin = self.payload + entry['data_offsets'][0]
        output = np.empty((x.shape[0], rows), dtype='<f4')
        for first in range(0, rows, self.tile_rows):
            count = min(self.tile_rows, rows - first)
            raw = self.read(begin + first * inner * unit, count * inner * unit)
            weight = decode(raw, dtype, scale).reshape(count, inner)
            # Full inner dimension is reduced in binary64; projection is rounded
            # before the separate F32 bias operation, matching the fixed gate.
            dot = (values @ weight.astype(np.float64).T).astype('<f4')
            output[:, first:first + count] = np.add(dot, bias[first:first + count], dtype=np.float32)
            self.tiles += 1
            del raw, weight, dot
        require(np.isfinite(output).all(), 'Nonfinite projection: ' + stem)
        self.sources[key] = {'shape': shape, 'storageDtype': dtype, 'absoluteOffset': begin, 'bytesRead': rows * inner * unit, 'tiles': (rows + self.tile_rows - 1) // self.tile_rows, 'fullInnerDimension': inner, 'decodedTileRowsAtMost': self.tile_rows}
        return output

    def close(self):
        self.file.close()
        after = self.path.stat()
        require(all(getattr(self.before, key) == getattr(after, key) for key in ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')), 'Original source file changed during reference reads')


def layer_norm(x, weight=None, bias=None):
    values = f32(x).astype(np.float64)
    centered = values - np.mean(values, axis=-1, keepdims=True, dtype=np.float64)
    output = (centered / np.sqrt(np.mean(centered * centered, axis=-1, keepdims=True, dtype=np.float64) + 1e-6)).astype('<f4')
    if weight is not None:
        output = np.add(np.multiply(output, f32(weight), dtype=np.float32), f32(bias), dtype=np.float32)
    return f32(output)


def rms_norm(x, weight):
    values = f32(x).astype(np.float64)
    normalized = (values / np.sqrt(np.mean(values * values, axis=-1, keepdims=True, dtype=np.float64) + 1e-6)).astype('<f4')
    return f32(np.multiply(normalized, f32(weight), dtype=np.float32))


def modulate(normalized, shift, scale):
    return f32(np.add(np.multiply(f32(normalized), np.add(np.float32(1), f32(scale), dtype=np.float32), dtype=np.float32), f32(shift), dtype=np.float32))


def gate_residual(base, value, gate):
    return f32(np.add(f32(base), np.multiply(f32(value), f32(gate), dtype=np.float32), dtype=np.float32))


def gelu(x):
    x = f32(x).astype(np.float64)
    return f32((0.5 * x * (1 + np.tanh(math.sqrt(2 / math.pi) * (x + 0.044715 * x ** 3)))).astype('<f4'))


def silu(x):
    x = f32(x).astype(np.float64)
    positive = x >= 0
    sigmoid = np.empty_like(x)
    sigmoid[positive] = 1 / (1 + np.exp(-x[positive]))
    exponent = np.exp(x[~positive])
    sigmoid[~positive] = exponent / (1 + exponent)
    return f32((x * sigmoid).astype('<f4'))


def sinusoidal(timestep):
    require(math.isfinite(timestep) and 0 <= timestep <= 1000, 'Explicit model timestep0..1000 required')
    output = np.empty((1, 256), dtype='<f4')
    for index in range(128):
        exponent = np.float32(-np.float32(index) / np.float32(128))
        frequency = np.float32(math.pow(10000, float(exponent)))
        phase = np.float32(np.float32(timestep) * frequency)
        output[0, index] = np.float32(math.cos(float(phase)))
        output[0, index + 128] = np.float32(math.sin(float(phase)))
    return output


def rotation_matrices(positions, source_ids):
    positions = f32(positions)
    require(positions.ndim == 2 and positions.shape[1] == 3 and len(source_ids) == len(positions), 'Exact independent stream positions/source IDs required')
    matrices = np.empty((len(positions), 64, 2, 2), dtype='<f4')
    for row, position in enumerate(positions):
        source = source_ids[row]
        require(type(source) in (int, np.int32, np.int64) and 0 <= source <= 16777216, 'Exact nonnegative source ID required')
        for pair in range(64):
            axis, local, dim = (0, pair, 44) if pair < 22 else (1, pair - 22, 42) if pair < 43 else (2, pair - 43, 42)
            angle = float(position[axis]) / math.pow(10000, 2 * local / dim)
            cosine, sine = np.float32(math.cos(angle)), np.float32(math.sin(angle))
            spatial = np.asarray([[cosine, -sine], [sine, cosine]], dtype='<f4')
            if source:
                angle = float(np.float32(source)) / math.pow(10000, 2 * pair / 128)
                cosine, sine = np.float32(math.cos(angle)), np.float32(math.sin(angle))
                extra = np.asarray([[cosine, -sine], [sine, cosine]], dtype='<f4')
                # Actual source composes the two F32 rotation matrices; preserve
                # each multiplication and add boundary before applying them.
                spatial = np.add(np.multiply(spatial[:, 0, None], extra[None, 0, :], dtype=np.float32), np.multiply(spatial[:, 1, None], extra[None, 1, :], dtype=np.float32), dtype=np.float32)
            matrices[row, pair] = spatial
    return matrices


def apply_rope(x, matrices):
    x = f32(x)
    require(x.ndim == 2 and x.shape[1] == 5120 and matrices.shape == (len(x), 64, 2, 2), 'Full40-head RoPE shape required')
    pairs = x.reshape(len(x), 40, 64, 2)
    first = np.multiply(matrices[:, None, :, :, 0], pairs[:, :, :, None, 0], dtype=np.float32)
    second = np.multiply(matrices[:, None, :, :, 1], pairs[:, :, :, None, 1], dtype=np.float32)
    return f32(np.add(first, second, dtype=np.float32).reshape(x.shape))


def attention(q, k, v):
    q, k, v = f32(q), f32(k), f32(v)
    require(q.ndim == k.ndim == v.ndim == 2 and q.shape[1] == k.shape[1] == v.shape[1] == 5120 and k.shape == v.shape and len(k) >= 1, 'Complete all40-head attention shapes required')
    output = np.empty_like(q)
    for head in range(40):
        selected = slice(head * 128, (head + 1) * 128)
        scores = q[:, selected].astype(np.float64) @ k[:, selected].astype(np.float64).T / math.sqrt(128)
        weights = np.exp(scores - scores.max(axis=1, keepdims=True))
        weights /= weights.sum(axis=1, keepdims=True, dtype=np.float64)
        output[:, selected] = (weights @ v[:, selected].astype(np.float64)).astype('<f4')
    return f32(output)


def patch_rows(streams):
    patches, positions, source_ids = [], [], []
    for source_id, stream in enumerate(streams):
        shape = stream['shape']
        require(len(shape) == 5 and shape[:2] == [1, 16] and all(type(v) is int and v > 0 for v in shape) and shape[3] % 2 == shape[4] % 2 == 0, 'Exact batch1 C16 even-spatial stream required')
        latent = f32(stream['data'], shape)[0]
        _, frames, height, width = latent.shape
        for t in range(frames):
            for h in range(height // 2):
                for w in range(width // 2):
                    patches.append(latent[:, t:t + 1, 2*h:2*h + 2, 2*w:2*w + 2].reshape(64))
                    positions.append([t, h, w])
                    source_ids.append(source_id)
    return f32(patches), f32(positions), source_ids


def unpatch_target(head, target_shape):
    _, channels, frames, height, width = target_shape
    tokens = frames * (height // 2) * (width // 2)
    values = f32(head)[:tokens].reshape(frames, height // 2, width // 2, 1, 2, 2, channels)
    return values.transpose(6, 0, 3, 1, 4, 2, 5).reshape(target_shape).copy()


def dyadic(count, multiplier, addend, modulus, center, denominator):
    return ((np.arange(count, dtype=np.int64) * multiplier + addend) % modulus - center).astype('<f4') / np.float32(denominator)


def controlled_fixture():
    semantics = {role: {'meaning': 'bernini-generated-model-latent:v1' if role == 'target-latent' else 'wan21-normalized-posterior-mean:v1', 'normalization': 'wan21-comfy-f32-v1'} for role in ('target-latent', 'source-latent', 'reference-latent', 'context-latent')}
    raw_mean = dyadic(128, 17, 11, 257, 128, 256)
    noise = dyadic(128, 31, 19, 263, 131, 256)
    target = np.add(raw_mean, np.multiply(noise, np.float32(0.75), dtype=np.float32), dtype=np.float32)
    streams = []
    for role, shape, data in (
        ('target', [1, 16, 1, 2, 4], target),
        ('source', [1, 16, 1, 2, 4], dyadic(128, 29, 7, 251, 125, 256)),
        ('reference', [1, 16, 1, 2, 2], dyadic(64, 43, 5, 241, 120, 256)),
    ):
        streams.append({'requirementId': role + '.latent', 'shape': shape, 'dtype': 'float32', **semantics[role + '-latent'], 'data': data.tolist()})
    text = np.stack([dyadic(4096, 17 + 2*row, 131*(row + 1), 257, 128, 1024) for row in range(3)]).astype('<f4')
    return {
        'schemaVersion': 'bernini-standalone-controlled-input/0.1',
        'fixtureClass': 'controlled-n5-l3-not-original-media-or-81-frame-workflow',
        'producerVerified': False, 'modelSpaceDeclarationOnly': True,
        'shapeRequest': {'ruleId': 'bernini-ca69274-b5a4321-wan21-shapes-v1', 'target': {'batch': 1, 'frames': 1, 'height': 16, 'width': 32}, 'refMaxSize': 32, 'geometry': {'rgbChannels': 3, 'latentChannels': 16, 'temporalCompression': 4, 'spatialCompression': [8, 8], 'temporalRule': 'first-then-groups-floor', 'patchSize': [1, 2, 2], 'hiddenSize': 5120, 'dtype': 'float32', 'concatOrder': 'target-first', 'paddingMode': 'none'}, 'semantics': semantics, 'media': {'sourceVideo': {'state': 'present', 'rgb': {'frames': 1, 'height': 16, 'width': 32}}, 'referenceVideo': {'state': 'present', 'rgb': {'frames': 1, 'height': 16, 'width': 16}}, 'slots': []}},
        'tensors': streams,
        'conditioning': {'schemaVersion': 'bernini-p4-native-text-input/0.1', 'inputClass': 'controlled-dyadic-text-fixture-not-text-encoder-output', 'dtype': 'float32', 'shape': [1, 3, 4096], 'layout': 'BLC', 'meaning': 'text_hidden_states', 'normalization': 'umt5-final-rmsnorm-f32-v1', 'modelSha256': TEXT_MODEL, 'tokenizerSha256': TOKENIZER, 'producerVerified': False, 'declaredModelIdentityOnly': True, 'attentionMask': [1, 1, 1], 'data': text.reshape(-1).tolist()},
        'timestep': 750.0, 'sigma': 0.75,
        'construction': {'controlledRawMean': raw_mean.tolist(), 'explicitNoise': noise.tolist(), 'targetExpression': 'F32(controlledRawMean + F32(0.75 * explicitNoise))', 'mediaOrVaeProducerVerified': False, 'textRows': 'all3 nonzero dyadic rows preserved with mask1; no truncation of L512 artifact', 'textModelIdentitySource': '/tmp/p4-real-text-l512/inputs/real-text-l512-native.json metadata only'},
    }


def private_write(path, payload):
    path = Path(path)
    roots = (Path('/tmp'), Path('/workspace/work/diffusion-private-hidden'))
    require(path.is_absolute() and any(path.resolve().is_relative_to(root) for root in roots) and not path.exists(), 'New private path under /tmp or diffusion-private-hidden required')
    require(path.parent.resolve() != Path('/tmp'), 'Dedicated private subdirectory of /tmp required')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    raw = (json.dumps(payload, separators=(',', ':'), allow_nan=False) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
    return raw


def freeze(args):
    fixture = controlled_fixture()
    raw = private_write(args.output, fixture)
    patches, positions, ids = patch_rows(fixture['tensors'])
    identities = {tensor['requirementId']: identity(f32(tensor['data'], tensor['shape'])) for tensor in fixture['tensors']}
    identities['text'] = identity(f32(fixture['conditioning']['data'], [3, 4096]))
    identities['patchRows'] = identity(patches)
    contract = {'schemaVersion': 'bernini-standalone-reference-contract/0.1', 'status': 'PRE_EXECUTION_GATE_FIXED', 'profileId': PROFILE, 'gateMayNotBeRelaxedAfterComparison': True, 'gate': GATE, 'fixtureClass': fixture['fixtureClass'], 'fixtureSHA256': sha(raw), 'fixtureBytes': len(raw), 'fixtureIdentities': identities, 'tokenPositions': positions.tolist(), 'sourceIds': ids, 'coreSourceSHA256': CORE_SHA256, 'blockRange': [0, 40], 'allHeads': 40, 'headDim': 128, 'hiddenWidth': 5120, 'ffnWidth': 13824, 'allTextRows': 3, 'targetHeadTokens': 2, 'headAllTokens': 5, 'models': {side: {'fileName': item[0], 'previouslyVerifiedModelSHA256': item[1], 'headerSHA256': item[2], 'bytes': MODEL_BYTES} for side, item in MODELS.items()}, 'precision': {'decode': 'original F16 or E4M3FN times own positive scalar -> F32', 'linear': 'full-inner F64 dot -> F32 -> separate F32 bias', 'norm': 'F64 mean/variance/sqrt -> F32 then staged F32 affine', 'attention': 'all40 heads, global all supplied keys, F64 score/softmax/context -> F32', 'elementwise': 'separate F32 add/multiply, no fused addcmul', 'activations': 'mathematical F64 SiLU/GELU(tanh) -> F32'}, 'scope': {'full40ControlledCaseOnly': True, 'originalWorkflowInputsVerified': False, 'originalProductionPrecisionVerified': False, 'required81FrameWorkflowVerified': False, 'load': 'NOT_READY', 'predict': 'NOT_READY', 'sample': 'NOT_READY', 'generationReady': False}}
    contract['traceShapes'] = trace_shapes()
    contract['preExecutionRevision'] = {'revision': 1, 'supersedesFixtureSHA256': '4741b413693a6b196f11a770a061e7e7ff52dbb59dcee629261497cd43a67a9e', 'reason': 'Native conditioning admission requires mask0 rows to be zero. Use mask1 on all3 controlled nonzero rows. Gate, timestep and numerical data unchanged; neither NN had executed.'}
    args.contract.parent.mkdir(parents=True, exist_ok=True)
    require(not args.contract.exists(), 'Frozen contract exists; do not overwrite')
    args.contract.write_text(json.dumps(contract, indent=2) + '\n')
    print(json.dumps({'fixturePath': str(args.output), 'fixtureSHA256': sha(raw), 'contractPath': str(args.contract), 'tokens': 5, 'heavyInferenceExecuted': False}))


def load_fixture(path, contract_path):
    fixture, digest = read_json(path)
    contract, contract_hash = read_json(contract_path)
    require(contract.get('profileId') == PROFILE and contract.get('status') == 'PRE_EXECUTION_GATE_FIXED' and contract.get('gate') == GATE and contract.get('gateMayNotBeRelaxedAfterComparison') is True, 'Frozen unrelaxed comparison contract required')
    require(contract.get('traceShapes') == trace_shapes(), 'Exact fixed47 native trace shapes required')
    require(digest == contract.get('fixtureSHA256') and fixture == controlled_fixture(), 'Exact frozen controlled fixture required')
    require(sha(CORE.read_bytes()) == contract.get('coreSourceSHA256') == CORE_SHA256, 'Pinned actual source identity changed')
    return fixture, contract, contract_hash


def run_reference(parameters, fixture, progress=None):
    arrays = {}
    def capture(name, value):
        arrays[name] = f32(value).copy()
        return arrays[name]
    patches, positions, ids = patch_rows(fixture['tensors'])
    rotations = rotation_matrices(positions, ids)
    hidden = capture('patchHidden', parameters.linear('patch_embedding', patches))
    text = f32(fixture['conditioning']['data'], [3, 4096])
    text = capture('textEmbedded', parameters.linear('text_embedding.2', gelu(parameters.linear('text_embedding.0', text))))
    time_raw = capture('timeRaw', parameters.linear('time_embedding.2', silu(parameters.linear('time_embedding.0', sinusoidal(fixture['timestep'])))))
    time_act = capture('timeAct1', silu(time_raw))
    projected = capture('timeProjection', parameters.linear('time_projection.1', time_act).reshape(6, 5120))
    for index in range(40):
        prefix = 'blocks.' + str(index) + '.'
        chunks = np.add(parameters.whole_small(prefix + 'modulation').reshape(6, 5120), projected, dtype=np.float32)
        y = modulate(layer_norm(hidden), chunks[0], chunks[1])
        q = apply_rope(rms_norm(parameters.linear(prefix + 'self_attn.q', y), parameters.whole_small(prefix + 'self_attn.norm_q.weight')), rotations)
        k = apply_rope(rms_norm(parameters.linear(prefix + 'self_attn.k', y), parameters.whole_small(prefix + 'self_attn.norm_k.weight')), rotations)
        v = parameters.linear(prefix + 'self_attn.v', y)
        hidden = gate_residual(hidden, parameters.linear(prefix + 'self_attn.o', attention(q, k, v)), chunks[2])
        normalized = layer_norm(hidden, parameters.whole_small(prefix + 'norm3.weight'), parameters.whole_small(prefix + 'norm3.bias'))
        q = rms_norm(parameters.linear(prefix + 'cross_attn.q', normalized), parameters.whole_small(prefix + 'cross_attn.norm_q.weight'))
        k = rms_norm(parameters.linear(prefix + 'cross_attn.k', text), parameters.whole_small(prefix + 'cross_attn.norm_k.weight'))
        v = parameters.linear(prefix + 'cross_attn.v', text)
        hidden = np.add(hidden, parameters.linear(prefix + 'cross_attn.o', attention(q, k, v)), dtype=np.float32)
        y = modulate(layer_norm(hidden), chunks[3], chunks[4])
        y = parameters.linear(prefix + 'ffn.2', gelu(parameters.linear(prefix + 'ffn.0', y)))
        hidden = capture('block' + str(index).zfill(2) + 'Output', gate_residual(hidden, y, chunks[5]))
        if progress:
            progress(index, identity(hidden))
    modulation = np.add(parameters.whole_small('head.modulation').reshape(2, 5120), time_raw.reshape(1, 5120), dtype=np.float32)
    head = capture('headAll', parameters.linear('head.head', modulate(layer_norm(hidden), modulation[0], modulation[1])))
    capture('prediction', unpatch_target(head, fixture['tensors'][0]['shape']))
    require(len(arrays) == 47 and all(np.isfinite(value).all() for value in arrays.values()), 'Complete finite prefix/full40/head prediction required')
    # The independent arithmetic uses compact 2D rows. Saved trace descriptors
    # retain the native batch1 dimension expected by both producers.
    arrays = {name: value if name in ('timeRaw', 'timeAct1', 'prediction') else value[None, ...] for name, value in arrays.items()}
    require({name: list(value.shape) for name, value in arrays.items()} == trace_shapes(), 'Exact fixed47 native trace shapes required')
    return arrays


def compare_arrays(actual, expected, gate=GATE):
    a, b = f32(actual), f32(expected)
    require(a.shape == b.shape and a.size > 0, 'Exact nonempty comparison shapes required')
    delta = np.abs(a.astype(np.float64) - b.astype(np.float64))
    limit = gate['abs'] + gate['rel'] * np.abs(b.astype(np.float64))
    return {'elements': int(a.size), 'failed': int(np.count_nonzero(delta > limit)), 'maxAbsolute': float(delta.max()), 'maxNormalizedToGate': float(np.max(delta / limit)), 'actualSHA256': identity(a)['sha256'], 'referenceSHA256': identity(b)['sha256'], 'gate': dict(gate)}


def execute(args):
    fixture, contract, contract_hash = load_fixture(args.fixture, args.contract)
    parameters = Parameters(args.models / MODELS[args.side][0], args.side, args.tile_rows)
    started = time.perf_counter()
    try:
        def progress(block, digest):
            print(json.dumps({'side': args.side, 'finishedBlock': block, 'elapsedSeconds': time.perf_counter() - started, 'outputSHA256': digest['sha256']}), file=sys.stderr, flush=True)
        arrays = run_reference(parameters, fixture, progress)
    finally:
        parameters.close()
    identities = {name: identity(value) for name, value in arrays.items()}
    common = {'profileId': PROFILE, 'side': args.side, 'fixtureSHA256': contract['fixtureSHA256'], 'contractSHA256': contract_hash, 'coreSourceSHA256': CORE_SHA256, 'previouslyVerifiedModelSHA256': MODELS[args.side][1], 'headerSHA256': MODELS[args.side][2], 'gate': GATE, 'arrayIdentities': identities, 'scope': contract['scope']}
    private = {'schemaVersion': 'bernini-standalone-full40-reference/0.1', **common, 'arrays': {name: {'shape': list(value.shape), 'data': value.reshape(-1).tolist()} for name, value in arrays.items()}}
    raw = private_write(args.output, private)
    receipt = {'schemaVersion': 'bernini-standalone-full40-reference-receipt/0.1', **common, 'referenceSHA256': sha(raw), 'referenceBytes': len(raw), 'generatorSHA256': sha(Path(__file__).read_bytes()), 'numpy': np.__version__, 'blasThreads': 1, 'tileRows': args.tile_rows, 'parameterSources': parameters.sources, 'originalBytesRead': parameters.total_read, 'payloadBytesRead': parameters.payload_read, 'maxPayloadReadBytes': parameters.max_payload_read, 'matrixTiles': parameters.tiles, 'readCalls': parameters.read_calls, 'fullFileSHA256Recomputed': False, 'fullF32ModelResident': False, 'maxDecodedWeightTileBytes': args.tile_rows * 13824 * 4, 'sourceStatStableDuringReads': True, 'privateValuesPublished': False, 'elapsedSeconds': time.perf_counter() - started}
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    require(not args.receipt.exists(), 'New receipt path required')
    args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'receipt': str(args.receipt), 'referenceSHA256': sha(raw), 'arrays': len(arrays), 'full40ControlledReferenceExecuted': True, 'required81FrameWorkflowVerified': False}))


def compare_saved(args):
    reference, reference_hash = read_json(args.reference)
    receipt, _ = read_json(args.reference_receipt)
    contract, contract_hash = read_json(args.contract)
    candidate, candidate_hash = read_json(args.candidate)
    side = reference.get('side')
    require(side in MODELS and reference.get('schemaVersion') == 'bernini-standalone-full40-reference/0.1', 'Pinned independent reference side/schema required')
    require(contract.get('profileId') == PROFILE and contract.get('status') == 'PRE_EXECUTION_GATE_FIXED' and contract.get('gate') == GATE and contract.get('gateMayNotBeRelaxedAfterComparison') is True and contract.get('traceShapes') == trace_shapes(), 'Frozen unrelaxed47-array contract required')
    bindings = {'profileId': PROFILE, 'side': side, 'fixtureSHA256': contract['fixtureSHA256'], 'contractSHA256': contract_hash, 'coreSourceSHA256': CORE_SHA256, 'previouslyVerifiedModelSHA256': MODELS[side][1], 'headerSHA256': MODELS[side][2], 'gate': GATE}
    require(all(reference.get(key) == value and receipt.get(key) == value for key, value in bindings.items()), 'Reference/receipt frozen provenance binding mismatch')
    require(receipt.get('schemaVersion') == 'bernini-standalone-full40-reference-receipt/0.1' and receipt.get('referenceSHA256') == reference_hash and receipt.get('referenceBytes') == args.reference.stat().st_size and receipt.get('arrayIdentities') == reference.get('arrayIdentities'), 'Separate reference receipt identity mismatch')
    candidate_bindings = {key: bindings[key] for key in ('side', 'fixtureSHA256', 'contractSHA256', 'coreSourceSHA256', 'previouslyVerifiedModelSHA256', 'headerSHA256')}
    require(all(candidate.get(key) == value for key, value in candidate_bindings.items()), 'Exact candidate fixture/contract/source/model/side binding required')
    names = set(trace_shapes())
    require(set(reference.get('arrays', {})) == set(candidate.get('arrays', {})) == set(reference.get('arrayIdentities', {})) == names, 'All fixed47 prefix/full40/head/prediction arrays required')
    comparisons = {}
    for key, descriptor in reference['arrays'].items():
        actual = candidate['arrays'][key]
        require(actual.get('shape') == descriptor.get('shape') == trace_shapes()[key], 'Fixed native runtime/reference shape mismatch: ' + key)
        expected = f32(descriptor['data'], descriptor['shape'])
        require(identity(expected) == reference['arrayIdentities'][key], 'Reference value hash mismatch: ' + key)
        comparisons[key] = compare_arrays(f32(actual['data'], actual['shape']), expected)
    result = {'schemaVersion': 'bernini-standalone-full40-comparison/0.1', 'side': reference['side'], 'fixtureSHA256': reference['fixtureSHA256'], 'contractSHA256': reference['contractSHA256'], 'gate': GATE, 'referenceSHA256': reference_hash, 'candidateSHA256': candidate_hash, 'comparisons': comparisons, 'passed': all(value['failed'] == 0 for value in comparisons.values()), 'scope': reference['scope']}
    require(not args.output.exists(), 'New comparison receipt path required')
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'arrays': len(comparisons), 'failedElements': sum(value['failed'] for value in comparisons.values()), 'output': str(args.output)}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    command = sub.add_parser('freeze', help='Freeze controlled fixture and gate; no inference')
    command.add_argument('--output', type=Path, required=True)
    command.add_argument('--contract', type=Path, default=EVIDENCE / 'contract.json')
    command.set_defaults(fn=freeze)
    command = sub.add_parser('run', help='Explicit heavy independent full40 execution')
    command.add_argument('--side', choices=MODELS, required=True)
    command.add_argument('--models', type=Path, default=Path('/workspace/work/retained/bernini'))
    command.add_argument('--fixture', type=Path, required=True)
    command.add_argument('--contract', type=Path, default=EVIDENCE / 'contract.json')
    command.add_argument('--tile-rows', type=int, default=128)
    command.add_argument('--output', type=Path, required=True)
    command.add_argument('--receipt', type=Path, required=True)
    command.set_defaults(fn=execute)
    command = sub.add_parser('compare', help='Full-value comparison with fixed abs/rel gate')
    command.add_argument('--reference', type=Path, required=True)
    command.add_argument('--reference-receipt', type=Path, required=True)
    command.add_argument('--contract', type=Path, default=EVIDENCE / 'contract.json')
    command.add_argument('--candidate', type=Path, required=True)
    command.add_argument('--output', type=Path, required=True)
    command.set_defaults(fn=compare_saved)
    args = parser.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
