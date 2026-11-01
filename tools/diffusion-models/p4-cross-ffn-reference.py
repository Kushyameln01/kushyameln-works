"""Independent streamed Bernini P4 oracle; private arrays, public identities only.

The default input is the authenticated saved N2 tail plus a frozen explicit L4
dyadic Text fixture. No Text producer or original workflow is invented. Original
weights are read in bounded rows and independently decoded. NumPy binary64 dot,
norm and attention calculations are rounded at named F32 operator boundaries.
Optional runtime cuts isolate each operation using actual predecessor bits.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import time

for _thread_variable in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ[_thread_variable] = '1'
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / 'development/ai-connection/p4-cross-ffn/core'
PLAN = CORE / 'candidate-plan.json'
PLAN_SHA256 = '051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600'
MODELS = {
    'HIGH': ('Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors', '9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52', 'd8aec897e3af480492d7eca7b57141ea968e89cde7f46ea7886db11754ebd6e3'),
    'LOW': ('Bernini_LOW_fp8_e4m3fn_scaled.safetensors', 'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3', '286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b'),
}
ARRAY_SHAPES = {
    'textLinear0': ['L', 5120], 'textGelu': ['L', 5120], 'textEmbedded': ['L', 5120],
    'crossNorm': [2, 5120], 'qkvQ': [2, 5120], 'qkvK': ['L', 5120], 'qkvV': ['L', 5120],
    'normQ': [2, 5120], 'normK': ['L', 5120], 'crossContext': [2, 5120],
    'crossO': [2, 5120], 'crossResidual': [2, 5120], 'ffnLayerNorm': [2, 5120],
    'shift': [5120], 'scale': [5120], 'gate': [5120], 'ffnModulated': [2, 5120],
    'ffnUp': [2, 13824], 'ffnGelu': [2, 13824], 'ffnDown': [2, 5120],
    'ffnGated': [2, 5120], 'blockOutput': [2, 5120],
    'timeProjection3': [5120], 'timeProjection4': [5120], 'timeProjection5': [5120],
}
sha = lambda value: hashlib.sha256(value).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON key')
        result[key] = value
    return result


def read_json(path):
    raw = Path(path).read_bytes()
    return json.loads(raw, object_pairs_hook=unique_object), sha(raw)


def load_plan():
    raw = PLAN.read_bytes()
    require(sha(raw) == PLAN_SHA256, 'Frozen precomparison P4 plan changed')
    plan = json.loads(raw)
    require(plan['status'] == 'PRE_EXECUTION_GATE_FIXED' and plan['gateMayNotBeRelaxedAfterComparison'] is True, 'Gate not frozen')
    require(sha((ROOT / plan['coreSource']).read_bytes()) == plan['coreSourceSHA256'], 'Pinned actual core changed')
    require(sha((ROOT / plan['fixtureContractPath']).read_bytes()) == plan['fixtureContractSHA256'], 'Pinned fixture construction changed')
    require(set(plan['intermediates']) == set(ARRAY_SHAPES), 'Intermediate contract changed')
    return plan


def f32_array(values, shape, name='array'):
    try:
        a = np.asarray(values, dtype='<f4')
    except (TypeError, ValueError, OverflowError) as error:
        raise ValueError(name + ': invalid F32 data') from error
    require(list(a.shape) in (list(shape), [math.prod(shape)]), name + ': exact shape/count required')
    a = a.reshape(shape).copy()
    require(np.isfinite(a).all(), name + ': nonfinite values')
    return a


def identity(a):
    a = np.asarray(a, dtype='<f4', order='C')
    return {'shape': list(a.shape), 'elements': int(a.size), 'bytes': int(a.nbytes), 'sha256': sha(a.tobytes())}


def fixture_conditioning():
    plan = load_plan()
    contract = json.loads((ROOT / plan['fixtureContractPath']).read_bytes())
    a = np.empty((4, 4096), dtype='<f4')
    for row in range(4):
        for channel in range(4096):
            a[row, channel] = 0.0 if row == 2 else (((row + 1) * 131 + (channel + 1) * 17) % 257 - 128) / 1024
    mask = np.asarray([1, 1, 0, 1], dtype='u1')
    require(identity(a)['sha256'] == contract['dataSHA256'] and sha(mask.tobytes()) == contract['attentionMaskSHA256'], 'Fixture bit construction mismatch')
    return a, mask, contract


def validate_native_text(payload):
    require(isinstance(payload, dict) and payload.get('schemaVersion') == 'bernini-p4-native-text-input/0.1', 'Explicit native Text input schema required')
    require(payload.get('dtype') == 'float32' and payload.get('layout') == 'BLC' and payload.get('meaning') == 'text_hidden_states', 'Native Text dtype/layout/meaning mismatch')
    shape = payload.get('shape')
    require(isinstance(shape, list) and len(shape) == 3 and shape[0] == 1 and type(shape[1]) is int and 1 <= shape[1] <= 512 and shape[2] == 4096, 'Native Text exact BLC shape required')
    mask = payload.get('attentionMask')
    require(isinstance(mask, list) and len(mask) == shape[1] and all(type(v) is int and v in (0, 1) for v in mask) and any(mask), 'Native Text explicit attention mask required')
    producer = payload.get('producer')
    require(isinstance(producer, dict) and producer.get('module') == 'text_encoder' and isinstance(producer.get('sourceCommit'), str) and len(producer['sourceCommit']) == 40 and all(c in '0123456789abcdef' for c in producer['sourceCommit']), 'Native Text producer identity required')
    model_hash = payload.get('modelSha256')
    tokenizer_hash = payload.get('tokenizerSha256')
    require(isinstance(model_hash, str) and len(model_hash) == 64 and all(c in '0123456789abcdef' for c in model_hash), 'Native Text model identity required')
    require(tokenizer_hash is None or isinstance(tokenizer_hash, str) and len(tokenizer_hash) == 64 and all(c in '0123456789abcdef' for c in tokenizer_hash), 'Tokenizer identity must be known hash or explicit unknown')
    x = f32_array(payload.get('data'), [shape[1], 4096], 'native Text data')
    mask = np.asarray(mask, dtype='u1')
    if payload.get('dataSHA256') is not None:
        require(identity(x)['sha256'] == payload['dataSHA256'], 'Native Text data hash mismatch')
    metadata = {'schemaVersion': payload['schemaVersion'], 'inputClass': 'native-text-encoder', 'meaning': payload['meaning'], 'shape': shape, 'dtype': 'float32', 'layout': 'BLC', 'producer': {'module': 'text_encoder', 'sourceCommit': producer['sourceCommit']}, 'modelSha256': model_hash, 'tokenizerSha256': tokenizer_hash, 'dataSHA256': identity(x)['sha256'], 'attentionMaskSHA256': sha(mask.tobytes()), 'maskedRowsPreserved': True, 'originalWorkflowTextVerified': False, 'textEncoderProducerVerified': False, 'jointAcceptanceRequired': True}
    return x, mask, metadata


def validate_patches(payload, side, plan):
    require(isinstance(payload, dict) and payload.get('schemaVersion') == 'bernini-p4-final-f32-patches/0.1' and payload.get('side') == side and payload.get('candidatePlanSHA256') == PLAN_SHA256, 'Explicit final-F32 patch schema/side/plan required')
    blocks = payload.get('patches')
    require(isinstance(blocks, list) and 1 <= len(blocks) <= 64, 'Bounded explicit patch list required')
    patches, public_blocks, intervals = [], [], {}
    for block in blocks:
        require(isinstance(block, dict), 'Patch block required')
        key = block.get('weightId')
        require(isinstance(key, str) and key in plan['parameters'] and (key.startswith('blocks.0.cross_attn.') and '.norm_' not in key or key.startswith('blocks.0.ffn.') or payload.get('allowTextEmbedding') is True and key.startswith('text_embedding.')), 'Unregistered patch target; norm/time/modulation patches excluded')
        spec = plan['parameters'][key]
        is_matrix = 'selectedRows' in spec
        binding = {'kind': 'runtime-input' if is_matrix else 'hike-parameter', 'name': key}
        require(block.get('fullShape') == spec['fullShape'] and block.get('binding') == binding and block.get('dtype') == 'F32', 'Patch original fullshape/binding/F32 mismatch')
        offset, count = block.get('offset'), block.get('count')
        require(type(offset) is int and type(count) is int and offset >= 0 and 1 <= count <= 81920 and offset + count <= math.prod(spec['fullShape']), 'Patch element extent outside original tensor')
        if is_matrix:
            width = spec['fullShape'][1]
            require(offset % width == 0 and count % width == 0 and count // width <= spec['tileRows'], 'Patch rows must be complete and fit original tile admission')
        values = f32_array(block.get('data'), [count], 'final-F32 patch data')
        require(block.get('sha256') == identity(values)['sha256'], 'Patch exact F32 byte hash mismatch')
        for first, stop in intervals.setdefault(key, []):
            require(offset >= stop or offset + count <= first, 'Overlapping patch ranges')
        intervals[key].append((offset, offset + count))
        patches.append({'key': key, 'offset': offset, 'count': count, 'data': values})
        public_blocks.append({'weightId': key, 'offset': offset, 'count': count, 'fullShape': spec['fullShape'], 'binding': binding, 'dtype': 'F32', 'sha256': block['sha256']})
    return patches, {'schemaVersion': payload['schemaVersion'], 'inputClass': 'caller-final-f32-feed-fixture', 'side': side, 'patches': public_blocks, 'patchCount': len(patches), 'patchedF32Bytes': sum(p['count'] * 4 for p in patches), 'lowRankMathImplemented': False, 'unpatchedWeightSource': 'immutable-original-base', 'textEmbeddingTargetsExplicitlyEnabled': payload.get('allowTextEmbedding') is True}


def apply_overrides(key, element_offset, values, patches):
    result = np.asarray(values, dtype='<f4').copy()
    first, stop = element_offset, element_offset + result.size
    for patch in patches or []:
        if patch['key'] != key:
            continue
        lower, upper = max(first, patch['offset']), min(stop, patch['offset'] + patch['count'])
        if lower < upper:
            result[lower - first:upper - first] = patch['data'][lower - patch['offset']:upper - patch['offset']]
    return result


def decode_binary16(code):
    require(type(code) is int and 0 <= code < 65536, 'Binary16 code required')
    sign = -1.0 if code & 32768 else 1.0
    exponent, fraction = (code >> 10) & 31, code & 1023
    if exponent == 31:
        return sign * float('inf') if fraction == 0 else float('nan')
    if exponent == 0:
        return sign * math.ldexp(fraction, -24)
    return sign * math.ldexp(1.0 + fraction / 1024.0, exponent - 15)


def decode_e4m3fn(code):
    require(type(code) is int and 0 <= code < 256, 'E4M3FN code required')
    sign = -1.0 if code & 128 else 1.0
    exponent, fraction = (code >> 3) & 15, code & 7
    if exponent == 15 and fraction == 7:
        return float('nan')
    if exponent == 0:
        return sign * math.ldexp(fraction / 8.0, -6)
    return sign * math.ldexp(1.0 + fraction / 8.0, exponent - 7)


_HALF_TABLE = None
_FP8_TABLE = np.asarray([decode_e4m3fn(i) for i in range(256)], dtype='<f4')


def decode_f16(raw):
    global _HALF_TABLE
    require(len(raw) > 0 and len(raw) % 2 == 0, 'Exact little-endian F16 payload required')
    if _HALF_TABLE is None:
        _HALF_TABLE = np.asarray([decode_binary16(i) for i in range(65536)], dtype='<f4')
    values = _HALF_TABLE[np.frombuffer(raw, dtype='<u2')].copy()
    require(np.isfinite(values).all(), 'Nonfinite F16 model data')
    return values


def decode_fp8(raw, scale):
    require(math.isfinite(float(scale)) and float(scale) > 0 and math.isfinite(float(np.float32(scale))) and np.float32(scale) > 0, 'Positive finite F32 scale required')
    require(len(raw) > 0, 'Nonempty FP8 payload required')
    result = np.multiply(_FP8_TABLE[np.frombuffer(raw, dtype='u1')], np.float32(scale), dtype=np.float32)
    require(np.isfinite(result).all(), 'Nonfinite FP8 model data')
    return result


def select_offset(desc, shape, dtype, *, row_start=0, rows=None, element_offset=0, count=None):
    require(desc.get('shape') == shape and desc.get('dtype') == dtype, 'Original fullshape/storage mismatch')
    unit = {'F16': 2, 'F32': 4, 'U8': 1, 'F8_E4M3': 1}[dtype]
    offsets = desc.get('data_offsets')
    require(isinstance(offsets, list) and len(offsets) == 2 and all(type(v) is int for v in offsets) and 0 <= offsets[0] < offsets[1] and offsets[1] - offsets[0] == math.prod(shape) * unit, 'Original full tensor byte extent mismatch')
    total = math.prod(shape)
    if rows is not None:
        require(len(shape) == 2 and element_offset == 0 and count is None and type(row_start) is int and type(rows) is int and 0 <= row_start < shape[0] and 0 < rows <= shape[0] - row_start, 'Exact row selection required')
        start, count = row_start * shape[1], rows * shape[1]
    else:
        count = total if count is None else count
        require(row_start == 0 and type(element_offset) is int and type(count) is int and 0 <= element_offset < total and 0 < count <= total - element_offset, 'Exact element selection required')
        start = element_offset
    return offsets[0] + start * unit, count * unit


def layer_norm(x, weight=None, bias=None):
    x = np.asarray(x, dtype='<f4')
    require(x.ndim == 2 and x.shape[1] == 5120 and np.isfinite(x).all(), 'LayerNorm full width5120 required')
    values = x.astype(np.float64)
    centered = values - np.mean(values, axis=1, keepdims=True, dtype=np.float64)
    variance = np.mean(centered * centered, axis=1, keepdims=True, dtype=np.float64)
    output = (centered / np.sqrt(variance + 1e-6)).astype('<f4')
    if weight is not None:
        output = np.add(np.multiply(output, f32_array(weight, [5120]), dtype=np.float32), f32_array(bias, [5120]), dtype=np.float32)
    require(np.isfinite(output).all(), 'Nonfinite LayerNorm output')
    return output


def rms_norm(x, weight):
    x = np.asarray(x, dtype='<f4')
    require(x.ndim == 2 and x.shape[1] == 5120 and np.isfinite(x).all(), 'QK norm must cover full5120 before head split')
    values = x.astype(np.float64)
    output = (values / np.sqrt(np.mean(values * values, axis=1, keepdims=True, dtype=np.float64) + 1e-6)).astype('<f4')
    return np.multiply(output, f32_array(weight, [5120]), dtype=np.float32)


def gelu_tanh(x):
    values = np.asarray(x, dtype='<f4').astype(np.float64)
    output = (.5 * values * (1.0 + np.tanh(math.sqrt(2.0 / math.pi) * (values + .044715 * values ** 3)))).astype('<f4')
    require(np.isfinite(output).all(), 'Nonfinite GELU output')
    return output


def all_head_attention(q, k, v):
    q = f32_array(q, [2, 5120], 'cross query')
    require(np.asarray(k).ndim == 2 and 1 <= np.asarray(k).shape[0] <= 512, 'Explicit complete Text key count1..512 required')
    rows = np.asarray(k).shape[0]
    k, v = f32_array(k, [rows, 5120], 'cross key'), f32_array(v, [rows, 5120], 'cross value')
    output = np.empty((2, 5120), dtype='<f4')
    for head in range(40):
        selected = slice(head * 128, (head + 1) * 128)
        scores = q[:, selected].astype(np.float64) @ k[:, selected].astype(np.float64).T / math.sqrt(128)
        weights = np.exp(scores - np.max(scores, axis=1, keepdims=True))
        weights /= np.sum(weights, axis=1, keepdims=True, dtype=np.float64)
        output[:, selected] = (weights @ v[:, selected].astype(np.float64)).astype('<f4')
    require(np.isfinite(output).all(), 'Nonfinite complete40head attention')
    return output


def modulate(x, shift, scale):
    return np.add(np.multiply(x, np.add(np.float32(1), scale, dtype=np.float32), dtype=np.float32), shift, dtype=np.float32)


def gated_residual(down, gate, residual):
    gated = np.multiply(down, gate, dtype=np.float32)
    return gated, np.add(residual, gated, dtype=np.float32)


class Parameters:
    """Only selected original rows are resident; receipts never contain values."""
    def __init__(self, path, side, plan, patches=None):
        require(side in MODELS, 'Explicit original side required')
        self.path, self.side, self.plan = Path(path), side, plan
        self.patches = patches or []
        self.before = self.path.stat()
        require(self.before.st_size == plan['bounds']['modelBytes'], 'Original model size mismatch')
        self.file = self.path.open('rb')
        self.total = self.payload_bytes = self.reads = self.max_payload_read = self.tiles = 0
        self.sources, self.scales = {}, {}
        try:
            n = struct.unpack('<Q', self.read(0, 8, header=True))[0]
            require(n == plan['bounds']['headerBytes'], 'Pinned header size mismatch')
            raw = self.read(8, n, header=True)
            require(sha(raw) == MODELS[side][2], 'Pinned original side/header mismatch')
            self.header = json.loads(raw, object_pairs_hook=unique_object)
            self.payload = 8 + n
            for key, spec in plan['parameters'].items():
                require(key in self.header, 'Registered original key absent')
                self.selection(key, spec)
            for key, spec in plan['parameters'].items():
                if spec['storageDtype'] == 'F8_E4M3':
                    stem = key[:-7]
                    scale_raw = self.config(stem + '.weight_scale', [], 'F32')
                    config_raw = self.config(stem + '.comfy_quant', [27], 'U8')
                    require(config_raw == b'{"format": "float8_e4m3fn"}', 'FP8 own quantization profile mismatch')
                    scale = struct.unpack('<f', scale_raw)[0]
                    require(math.isfinite(scale) and scale > 0, 'Own FP8 positive scalar scale required')
                    self.scales[key] = np.float32(scale)
        except BaseException:
            self.file.close()
            raise

    def read(self, offset, count, *, header=False):
        limit = self.plan['bounds']['headerBytes'] if header else self.plan['bounds']['maxPayloadReadBytes']
        require(type(offset) is int and type(count) is int and 0 <= offset <= self.before.st_size - count and 0 < count <= limit, 'Original read exceeds declared bounds')
        self.file.seek(offset)
        raw = self.file.read(count)
        require(len(raw) == count, 'Short selected original read')
        self.total += count
        self.reads += 1
        if not header:
            self.payload_bytes += count
            self.max_payload_read = max(self.max_payload_read, count)
        return raw

    def selection(self, key, spec=None):
        spec = self.plan['parameters'][key] if spec is None else spec
        selection = spec.get('selectedRows')
        elements = spec.get('selectedElements')
        offset, count = select_offset(self.header[key], spec['fullShape'], spec['storageDtype'], row_start=selection[0] if selection else 0, rows=selection[1] - selection[0] if selection else None, element_offset=elements[0] if elements else 0, count=elements[1] - elements[0] if elements else None)
        require(self.payload + offset + count <= self.before.st_size, 'Selected original tensor outside file')
        return self.payload + offset, count

    def config(self, key, shape, dtype):
        require(key in self.header, 'FP8 own scalar/profile key missing')
        offset, count = select_offset(self.header[key], shape, dtype)
        raw = self.read(self.payload + offset, count)
        self.sources[key] = {'originalKey': key, 'fullShape': shape, 'storageDtype': dtype, 'absoluteByteOffset': self.payload + offset, 'selectedRawBytes': count, 'rawSHA256': sha(raw), 'decodedF32SHA256': sha(raw) if dtype == 'F32' else None}
        return raw

    def vector(self, key):
        spec = self.plan['parameters'][key]
        require('selectedElements' in spec and spec['storageDtype'] == 'F16', 'Registered F16 vector required')
        offset, count = self.selection(key)
        raw = self.read(offset, count)
        decoded = decode_f16(raw)
        out = apply_overrides(key, spec['selectedElements'][0], decoded, self.patches)
        self.sources[key] = {'originalKey': key, **spec, 'absoluteByteOffset': offset, 'selectedRawBytes': count, 'rawSHA256': sha(raw), 'decodedF32SHA256': sha(decoded.tobytes()), 'finalF32SHA256': sha(out.tobytes())}
        if key in ('time_projection.1.bias', 'blocks.0.modulation'):
            first = spec['selectedElements'][0]
            for at in range(0, out.size, 5120):
                elements = min(5120, out.size - at)
                self.sources[key + ':' + str(first + at)] = {'originalKey': key, 'fullShape': spec['fullShape'], 'storageDtype': spec['storageDtype'], 'selectedElements': [first + at, first + at + elements], 'absoluteByteOffset': offset + at * 2, 'selectedRawBytes': elements * 2, 'rawSHA256': sha(raw[at * 2:(at + elements) * 2]), 'decodedF32SHA256': sha(decoded[at:at + elements].tobytes()), 'finalF32SHA256': sha(out[at:at + elements].tobytes())}
        return out

    def linear_pair(self, key, inputs, bias):
        spec = self.plan['parameters'][key]
        first_row, stop = spec['selectedRows']
        width, count = spec['fullShape'][1], stop - first_row
        xs = [np.asarray(x, dtype='<f4').reshape(-1, width).astype(np.float64) for x in inputs]
        require(all(1 <= x.shape[0] <= 512 and np.isfinite(x).all() for x in xs), 'Bounded finite matrix inputs required')
        bias = f32_array(bias, [count], key + ' bias')
        outputs = [np.empty((x.shape[0], count), dtype='<f4') for x in xs]
        raw_hash, decoded_hash, final_hash = hashlib.sha256(), hashlib.sha256(), hashlib.sha256()
        chunk_hashes = {}
        offset, _ = self.selection(key)
        unit = 2 if spec['storageDtype'] == 'F16' else 1
        tile_rows = spec['tileRows']
        for row in range(0, count, tile_rows):
            rows = min(tile_rows, count - row)
            require(rows * width <= self.plan['bounds']['maxDecodedElementsPerTile'], 'Decoded element tile exceeds frozen bound')
            raw = self.read(offset + row * width * unit, rows * width * unit)
            decoded = decode_f16(raw) if unit == 2 else decode_fp8(raw, self.scales[key])
            raw_hash.update(raw)
            decoded_hash.update(decoded.tobytes())
            final = apply_overrides(key, (first_row + row) * width, decoded, self.patches)
            final_hash.update(final.tobytes())
            if key == 'time_projection.1.weight':
                chunk_start = first_row + (row // 5120) * 5120
                group = chunk_hashes.setdefault(chunk_start, [hashlib.sha256(), hashlib.sha256(), hashlib.sha256()])
                group[0].update(raw)
                group[1].update(decoded.tobytes())
                group[2].update(final.tobytes())
            weight64 = final.reshape(rows, width).astype(np.float64)
            for x, output in zip(xs, outputs):
                dot = (x @ weight64.T).astype('<f4')
                output[:, row:row + rows] = np.add(dot, bias[row:row + rows], dtype=np.float32)
            self.tiles += 1
        require(all(np.isfinite(output).all() for output in outputs), 'Nonfinite binary64 projection')
        self.sources[key] = {'originalKey': key, **spec, 'absoluteByteOffset': offset, 'selectedRawBytes': count * width * unit, 'rawSHA256': raw_hash.hexdigest(), 'decodedF32SHA256': decoded_hash.hexdigest(), 'finalF32SHA256': final_hash.hexdigest(), 'tiles': (count + tile_rows - 1) // tile_rows}
        if spec['storageDtype'] == 'F8_E4M3':
            stem = key[:-7]
            self.sources[key].update(scaleSHA256=self.sources[stem + '.weight_scale']['rawSHA256'], quantConfigSHA256=self.sources[stem + '.comfy_quant']['rawSHA256'], fp8ProfileId='scaled-e4m3fn-scalar-f32-v1')
        if key == 'time_projection.1.weight':
            for chunk_start, group in chunk_hashes.items():
                chunk_rows = min(5120, stop - chunk_start)
                self.sources[key + ':' + str(chunk_start)] = {'originalKey': key, 'fullShape': spec['fullShape'], 'storageDtype': spec['storageDtype'], 'selectedRows': [chunk_start, chunk_start + chunk_rows], 'absoluteByteOffset': offset + (chunk_start - first_row) * width * unit, 'selectedRawBytes': chunk_rows * width * unit, 'rawSHA256': group[0].hexdigest(), 'decodedF32SHA256': group[1].hexdigest(), 'finalF32SHA256': group[2].hexdigest(), 'tiles': (chunk_rows + tile_rows - 1) // tile_rows}
        else:
            self.sources[key + ':' + str(first_row)] = dict(self.sources[key])
        return outputs

    def close(self):
        self.file.close()
        after = self.path.stat()
        require(all(getattr(after, key) == getattr(self.before, key) for key in ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')), 'Original model changed during selected reads')


def saved_inputs(side, path, plan):
    anchor = plan['cases'][side]
    payload, artifact_hash = read_json(path)
    receipt, receipt_hash = read_json(ROOT / anchor['exportReceiptPath'])
    require(receipt_hash == anchor['exportReceiptSHA256'] and receipt.get('passed') is True and receipt.get('acceptedOutputBitMatch') is True, 'Pinned saved-tail export receipt mismatch')
    require(artifact_hash == anchor['savedArtifactSHA256'] == receipt['privateArtifactSHA256'] and Path(path).stat().st_size == anchor['savedArtifactBytes'], 'Pinned saved-tail artifact mismatch')
    require(payload.get('schemaVersion') == 'bernini-self-attention-tail-saved-outputs/0.1', 'Saved tail schema mismatch')
    for key in ('side', 'blockIndex', 'scheduleIndex', 'tokens', 'acceptedTailReceiptSHA256'):
        require(payload.get(key) == anchor[key], 'Saved tail fixed case mismatch: ' + key)
    e = payload['evidence']
    require(e['modelHash'] == MODELS[side][1] and e['headerSHA256'] == MODELS[side][2] and e['residualBasis'] == 'original-fullprefix-arrays.patchHidden', 'Saved residual model/semantic basis mismatch')
    for key in ('productionHiddenVerified', 'originalWorkflowInputsVerified', 'originalProductionPrecisionVerified', 'fullBlockVerified', 'modelInference', 'lowIsHighHandoff'):
        require(e.get(key) is False, 'Saved tail scope changed')
    require(all(e.get(key) == 'NOT_READY' for key in ('load', 'predict', 'sample')), 'Saved readiness changed')
    residual = f32_array(payload['arrays']['residual'], [2, 5120], 'saved residual')
    time_act1 = f32_array(payload['inputs']['timeAct1'], [5120], 'saved timeAct1')
    require(identity(residual)['sha256'] == anchor['residualSHA256'] == e['outputHashes']['residualSHA256'], 'Saved residual bit mismatch')
    require(identity(time_act1)['sha256'] == anchor['timeAct1SHA256'] == e['inputHashes']['timeAct1SHA256'], 'Saved timeAct1 bit mismatch')
    return {'residual': residual, 'timeAct1': time_act1}, dict(anchor)


def runtime_binding(bindings):
    required = ('savedArtifactSHA256', 'conditioningDataSHA256', 'conditioningMaskSHA256')
    require(all(isinstance(bindings.get(key), str) and len(bindings[key]) == 64 and all(c in '0123456789abcdef' for c in bindings[key]) for key in required), 'Saved tail, conditioning data and mask hashes required')
    fixture = 'fixtureContractSHA256' in bindings
    native = 'nativeTextArtifactSHA256' in bindings
    require(fixture != native, 'Exactly one fixture contract or complete native Text artifact binding required')
    expected_binding = {key: bindings[key] for key in required}
    provenance_key = 'fixtureContractSHA256' if fixture else 'nativeTextArtifactSHA256'
    require(isinstance(bindings[provenance_key], str) and len(bindings[provenance_key]) == 64 and all(c in '0123456789abcdef' for c in bindings[provenance_key]), 'Conditioning provenance hash required')
    expected_binding[provenance_key] = bindings[provenance_key]
    if 'finalF32PatchArtifactSHA256' in bindings:
        require(isinstance(bindings['finalF32PatchArtifactSHA256'], str) and len(bindings['finalF32PatchArtifactSHA256']) == 64 and all(c in '0123456789abcdef' for c in bindings['finalF32PatchArtifactSHA256']), 'Patch artifact hash required')
        expected_binding['finalF32PatchArtifactSHA256'] = bindings['finalF32PatchArtifactSHA256']
    return expected_binding


def runtime_cuts(path, side, rows, bindings):
    payload, artifact_hash = read_json(path)
    require(payload.get('schemaVersion') == 'bernini-p4-runtime-arrays/0.1' and payload.get('side') == side and payload.get('candidatePlanSHA256') == PLAN_SHA256, 'Explicit P4 runtime-cut schema/side/plan binding required')
    expected_binding = runtime_binding(bindings)
    require(payload.get('inputBindings') == expected_binding, 'Runtime-cut input identity mismatch')
    plan = load_plan()
    case = plan['cases'][side]
    evidence = payload.get('evidence')
    require(isinstance(evidence, dict) and evidence.get('schemaVersion') == 'bernini-post-self-attention-evidence/0.1' and evidence.get('executionProfileId') == plan['profileId'] and evidence.get('side') == side, 'Exact runtime evidence required before reading cuts')
    input_hashes = evidence.get('inputHashes')
    expected_input_hashes = {'residualSHA256': case['residualSHA256'], 'timeAct1SHA256': case['timeAct1SHA256'], 'conditioningSHA256': bindings['conditioningDataSHA256'], 'conditioningMaskSHA256': bindings['conditioningMaskSHA256']}
    require(isinstance(input_hashes, dict) and all(input_hashes.get(key) == value for key, value in expected_input_hashes.items()), 'Runtime input bit hashes mismatch saved inputs or declared conditioning')
    arrays = payload.get('arrays')
    require(isinstance(arrays, dict) and set(arrays) == set(ARRAY_SHAPES), 'All and only25 runtime intermediates required')
    output_hashes = evidence.get('outputHashes')
    require(isinstance(output_hashes, dict) and set(output_hashes) == {key + 'SHA256' for key in ARRAY_SHAPES}, 'All and only25 runtime output bit hashes required')
    result = {}
    for key, shape in ARRAY_SHAPES.items():
        result[key] = f32_array(arrays[key], [rows if n == 'L' else n for n in shape], 'runtime cut ' + key)
        require(identity(result[key])['sha256'] == output_hashes[key + 'SHA256'], 'Runtime output bit hash mismatch: ' + key + '; signed-zero-safe serialization required')
    return result, artifact_hash


def run_reference(parameters, inputs, text, actual=None):
    composed, local = {}, {} if actual is not None else None

    def project(key, name, input_c, input_l=None):
        bias = parameters.vector(key.replace('.weight', '.bias'))
        values = [input_c] if local is None else [input_c, input_l]
        outputs = parameters.linear_pair(key, values, bias)
        composed[name] = outputs[0]
        if local is not None:
            local[name] = outputs[1]

    def operation(name, fn, *keys):
        composed[name] = fn(*(composed[k] for k in keys))
        if local is not None:
            local[name] = fn(*(actual[k] for k in keys))

    project('text_embedding.0.weight', 'textLinear0', text, text)
    operation('textGelu', gelu_tanh, 'textLinear0')
    project('text_embedding.2.weight', 'textEmbedded', composed['textGelu'], None if actual is None else actual['textGelu'])
    norm_weight, norm_bias = parameters.vector('blocks.0.norm3.weight'), parameters.vector('blocks.0.norm3.bias')
    composed['crossNorm'] = layer_norm(inputs['residual'], norm_weight, norm_bias)
    if local is not None:
        local['crossNorm'] = composed['crossNorm'].copy()
    for kind, name, input_name in (('q', 'qkvQ', 'crossNorm'), ('k', 'qkvK', 'textEmbedded'), ('v', 'qkvV', 'textEmbedded')):
        project('blocks.0.cross_attn.' + kind + '.weight', name, composed[input_name], None if actual is None else actual[input_name])
    for kind, name, input_name in (('q', 'normQ', 'qkvQ'), ('k', 'normK', 'qkvK')):
        norm = parameters.vector('blocks.0.cross_attn.norm_' + kind + '.weight')
        operation(name, lambda x, norm=norm: rms_norm(x, norm), input_name)
    operation('crossContext', all_head_attention, 'normQ', 'normK', 'qkvV')
    project('blocks.0.cross_attn.o.weight', 'crossO', composed['crossContext'], None if actual is None else actual['crossContext'])
    operation('crossResidual', lambda o: np.add(inputs['residual'], o, dtype=np.float32), 'crossO')
    operation('ffnLayerNorm', layer_norm, 'crossResidual')
    time_bias = parameters.vector('time_projection.1.bias')
    projections = parameters.linear_pair('time_projection.1.weight', [inputs['timeAct1']] if local is None else [inputs['timeAct1'], inputs['timeAct1']], time_bias)
    modulation = parameters.vector('blocks.0.modulation').reshape(3, 5120)
    for index, (chunk, output_name) in enumerate(((3, 'shift'), (4, 'scale'), (5, 'gate'))):
        projection_name = 'timeProjection' + str(chunk)
        composed[projection_name] = projections[0].reshape(3, 5120)[index].copy()
        composed[output_name] = np.add(composed[projection_name], modulation[index], dtype=np.float32)
        if local is not None:
            local[projection_name] = projections[1].reshape(3, 5120)[index].copy()
            local[output_name] = np.add(actual[projection_name], modulation[index], dtype=np.float32)
    operation('ffnModulated', modulate, 'ffnLayerNorm', 'shift', 'scale')
    project('blocks.0.ffn.0.weight', 'ffnUp', composed['ffnModulated'], None if actual is None else actual['ffnModulated'])
    operation('ffnGelu', gelu_tanh, 'ffnUp')
    project('blocks.0.ffn.2.weight', 'ffnDown', composed['ffnGelu'], None if actual is None else actual['ffnGelu'])
    operation('ffnGated', lambda x, gate: np.multiply(x, gate, dtype=np.float32), 'ffnDown', 'gate')
    operation('blockOutput', lambda residual, gated: np.add(residual, gated, dtype=np.float32), 'crossResidual', 'ffnGated')
    require(set(composed) == set(ARRAY_SHAPES) and all(np.isfinite(a).all() for a in composed.values()), 'Incomplete/nonfinite reference')
    return composed, local


def compare(actual, expected, gate):
    a, b = np.asarray(actual, dtype='<f4'), np.asarray(expected, dtype='<f4')
    require(a.shape == b.shape and np.isfinite(a).all() and np.isfinite(b).all(), 'Exact finite comparison arrays required')
    delta = np.abs(a.astype(np.float64) - b.astype(np.float64))
    allowed = gate['abs'] + gate['rel'] * np.abs(b.astype(np.float64))
    worst = int(np.argmax(delta))
    return {'values': int(a.size), 'failed': int(np.count_nonzero(delta > allowed)), 'maxAbsolute': float(delta.reshape(-1)[worst]), 'worstIndex': worst, 'actualSHA256': identity(a)['sha256'], 'referenceSHA256': identity(b)['sha256'], 'gate': dict(gate)}


def private_write(path, payload):
    path = Path(path)
    require(path.is_absolute() and path.resolve().is_relative_to(Path('/tmp')) and not path.exists(), 'New absolute private output under /tmp required')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    raw = (json.dumps(payload, separators=(',', ':'), allow_nan=False) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
    return raw


def public_receipt(result, raw, source, elapsed, runtime=None):
    """Whitelist projection: expected arrays, arbitrary metadata and scales excluded."""
    keys = ('schemaVersion', 'mode', 'side', 'profileId', 'candidatePlanSHA256', 'modelHash', 'headerSHA256', 'inputBindings', 'conditioning', 'weightFeed', 'arrayIdentities', 'gates', 'readiness')
    receipt = {key: result[key] for key in keys}
    receipt.update(schemaVersion='bernini-p4-reference-receipt/0.1', referenceSHA256=sha(raw), referenceBytes=len(raw), generatorSHA256=sha(Path(__file__).read_bytes()), parameterSources=source.sources, selectedOriginalFileBytesRead=source.total, selectedPayloadBytesRead=source.payload_bytes, maxPayloadReadBytes=source.max_payload_read, matrixTiles=source.tiles, originalReadCalls=source.reads, fullFileSHA256Recomputed=False, prefixRecomputed=False, privateArraysPublished=False, originalProductionPrecisionVerified=False, referenceBackend={'numpy': np.__version__, **load_plan()['precision'], 'blasThreads': 1}, elapsedSeconds=elapsed)
    if runtime is not None:
        receipt['comparisons'] = runtime
        receipt['passed'] = all(c['failed'] == 0 for c in runtime.values())
    return receipt


def generate(args):
    plan = load_plan()
    inputs, bindings = saved_inputs(args.side, args.saved_tail, plan)
    if args.text:
        text_payload, text_artifact = read_json(args.text)
        text, mask, metadata = validate_native_text(text_payload)
        metadata['inputArtifactSHA256'] = text_artifact
        bindings['nativeTextArtifactSHA256'] = text_artifact
    else:
        text, mask, metadata = fixture_conditioning()
        bindings['fixtureContractSHA256'] = plan['fixtureContractSHA256']
    bindings['conditioningDataSHA256'] = identity(text)['sha256']
    bindings['conditioningMaskSHA256'] = sha(mask.tobytes())
    if args.patches:
        patch_payload, patch_hash = read_json(args.patches)
        patches, weight_feed = validate_patches(patch_payload, args.side, plan)
        bindings['finalF32PatchArtifactSHA256'] = patch_hash
        weight_feed['inputArtifactSHA256'] = patch_hash
    else:
        patches, weight_feed = [], {'inputClass': 'immutable-original-base', 'patchCount': 0, 'lowRankMathImplemented': False}
    actual, actual_hash = runtime_cuts(args.runtime_cuts, args.side, text.shape[0], bindings) if args.runtime_cuts else (None, None)
    source = Parameters(args.models / MODELS[args.side][0], args.side, plan, patches)
    started = time.perf_counter()
    try:
        composed, local = run_reference(source, inputs, text, actual)
    finally:
        source.close()
    results = []
    for mode, arrays, gate_name in [('COMPOSED_FROM_SAVED_N2_TAIL', composed, 'composed')] + ([('LOCAL_RUNTIME_CUTS', local, 'localCut')] if local is not None else []):
        suffix = 'composed' if gate_name == 'composed' else 'local'
        result = {'schemaVersion': 'bernini-p4-reference/0.1', 'mode': mode, 'side': args.side, 'profileId': plan['profileId'], 'candidatePlanSHA256': PLAN_SHA256, 'modelHash': MODELS[args.side][1], 'headerSHA256': MODELS[args.side][2], 'inputBindings': bindings, 'conditioning': metadata, 'weightFeed': weight_feed, 'parameterSources': source.sources, 'expected': {key: arrays[key].reshape(-1).tolist() for key in plan['intermediates']}, 'arrayIdentities': {key: identity(arrays[key]) for key in plan['intermediates']}, 'gates': plan['gates'], 'readiness': plan['readiness']}
        raw = private_write(args.output_dir / (args.side.lower() + '-' + suffix + '-reference.json'), result)
        comparisons = {key: compare(actual[key], arrays[key], plan['gates'][gate_name]) for key in plan['intermediates']} if actual is not None else None
        receipt = public_receipt(result, raw, source, time.perf_counter() - started, comparisons)
        if actual_hash:
            receipt['runtimeCutArtifactSHA256'] = actual_hash
        target = args.receipt_dir / (args.side.lower() + '-' + suffix + '-reference-receipt.json')
        require(not target.exists(), 'Reference receipt already exists; explicit new receipt directory required')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(receipt, indent=2, allow_nan=False) + '\n')
        results.append({'mode': mode, 'referenceSHA256': sha(raw), 'referenceBytes': len(raw), 'receiptPath': str(target), 'passed': receipt.get('passed')})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--models', type=Path, required=True)
    parser.add_argument('--side', choices=MODELS, required=True)
    parser.add_argument('--saved-tail', type=Path, required=True)
    parser.add_argument('--text', type=Path, help='Optional explicit private native Text payload; fixture is default')
    parser.add_argument('--runtime-cuts', type=Path, help='Optional private actual runtime arrays for local-cut oracle')
    parser.add_argument('--patches', type=Path, help='Optional explicit private final-F32 patch feed; no low-rank math')
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--receipt-dir', type=Path, default=CORE)
    args = parser.parse_args()
    print(json.dumps({'side': args.side, 'references': generate(args)}))


if __name__ == '__main__':
    main()
