"""Independent streamed N2 block0 O/chunk2/residual oracle.

Local mode consumes only actual runtime attention and retained actual prefix bits.
Composed mode consumes independent prefix/head references. Both share a single
selected-weight traversal; neither oracle is an actual runtime input producer.
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
os.environ['MKL_NUM_THREADS'] = '1'
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / 'development/ai-connection/self-attention-tail/core'
PLAN = CORE / 'candidate-plan.json'
PLAN_SHA256 = '58a7a187d9580cd5af1d12e4d9552f8880a47c8a89e50b7bf1d27fec4ff11549'
F32 = np.float32
MODELS = {
    'HIGH': ('Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors', '9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52', 'd8aec897e3af480492d7eca7b57141ea968e89cde7f46ea7886db11754ebd6e3'),
    'LOW': ('Bernini_LOW_fp8_e4m3fn_scaled.safetensors', 'ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3', '286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b'),
}
PREFIX_RECEIPTS = {
    'HIGH': 'c12885eb71b0b46f91f79b94bba0315f1c9eae635daa3493686bb5882c7703f0',
    'LOW': 'ec161f89a53f8dbd6b8c4a02c59a236ac544224cfe700592e8982900eeb4ade5',
}
CONTEXT_RECEIPTS = {
    'HIGH': '75bdf4a9e6e09769d5edcbab400db103eead7822c92f12e355fc7028938b158b',
    'LOW': '618c46b6ad4233a519516d923dc8df317b54c8f673299ef2428fba9b99c23e77',
}
HEAD_RECEIPTS = {
    'HIGH': 'a13a44b46ddcb4aba7e03fa2856d815adc0bcf2437db586d9a7109a2ed13f31d',
    'LOW': '2979711e0ba0ee4d838d95eab8443847db5df47fd8009e7b2226355feacd43ad',
}
sha = lambda value: hashlib.sha256(value).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    raw = path.read_bytes()
    return json.loads(raw), sha(raw)


def load_plan():
    raw = PLAN.read_bytes()
    require(sha(raw) == PLAN_SHA256, 'Frozen precomparison tail plan changed')
    plan = json.loads(raw)
    require(plan['status'] == 'PRE_EXECUTION_GATE_FIXED' and plan['gateMayNotBeRelaxedAfterComparison'], 'Tail gate not fixed')
    require(sha((ROOT / plan['coreSource']).read_bytes()) == plan['coreSourceSHA256'], 'Pinned source changed')
    return plan


def f32_array(values, shape, name):
    try:
        a = np.asarray(values, dtype='<f4')
    except (ValueError, TypeError, OverflowError) as error:
        raise ValueError(name + ': invalid F32 values') from error
    require(list(a.shape) in (list(shape), [math.prod(shape)]), name + ': exact shape/count required')
    a = a.reshape(shape).copy()
    require(np.isfinite(a).all(), name + ': nonfinite values')
    return a


def identity(a):
    a = np.asarray(a, dtype='<f4')
    return {'shape': list(a.shape), 'elements': int(a.size), 'bytes': a.nbytes, 'sha256': sha(a.tobytes())}


def decode_e4m3fn(byte):
    require(isinstance(byte, int) and 0 <= byte <= 255, 'E4M3FN byte required')
    sign = -1.0 if byte & 128 else 1.0
    exponent, mantissa = (byte >> 3) & 15, byte & 7
    if exponent == 15 and mantissa == 7:
        return float('nan')
    if exponent == 0:
        return sign * math.ldexp(mantissa / 8.0, -6)
    return sign * math.ldexp(1.0 + mantissa / 8.0, exponent - 7)


def select_offset(desc, key, fullshape, dtype, row_start=0, rows=None, element_offset=0, count=None):
    """Return selected payload-relative byte offset/count, preserving fullshape."""
    require(desc.get('shape') == fullshape and desc.get('dtype') == dtype, key + ': original fullshape/storage mismatch')
    unit = {'F8_E4M3': 1, 'F16': 2, 'F32': 4, 'U8': 1}[dtype]
    offsets = desc.get('data_offsets', [])
    require(len(offsets) == 2 and all(type(v) is int for v in offsets), key + ': invalid offsets')
    require(0 <= offsets[0] < offsets[1] and offsets[1] - offsets[0] == math.prod(fullshape) * unit, key + ': full tensor byte extent mismatch')
    if rows is not None:
        require(element_offset == 0 and count is None and len(fullshape) >= 2, key + ': mixed row/element selection')
        require(type(row_start) is int and type(rows) is int and 0 <= row_start < fullshape[0] and 0 < rows <= fullshape[0] - row_start, key + ': row selection outside tensor')
        width = math.prod(fullshape[1:])
        return offsets[0] + row_start * width * unit, rows * width * unit
    require(row_start == 0, key + ': row start requires row count')
    count = math.prod(fullshape) if count is None else count
    require(type(element_offset) is int and type(count) is int and 0 <= element_offset < math.prod(fullshape) and 0 < count <= math.prod(fullshape) - element_offset, key + ': element selection outside tensor')
    return offsets[0] + element_offset * unit, count * unit


def finish_tail(o, gate_projection, modulation, patch_hidden):
    o = f32_array(o, [2, 5120], 'o')
    patch_hidden = f32_array(patch_hidden, [2, 5120], 'patchHidden')
    gate_projection = f32_array(gate_projection, [5120], 'gateProjection')
    modulation = f32_array(modulation, [5120], 'modulation chunk2')
    gate = np.add(modulation, gate_projection, dtype=np.float32)
    require(np.isfinite(gate).all(), 'gate: nonfinite values')
    for name, a in (('o', o), ('gate', gate), ('patchHidden', patch_hidden)):
        require(float(np.max(np.abs(a))) <= 1e16, name + ': exceeds pointwise input bound')
    gated = np.multiply(o, gate.reshape(1, 5120), dtype=np.float32)
    residual = np.add(patch_hidden, gated, dtype=np.float32)
    require(np.isfinite(gated).all() and np.isfinite(residual).all(), 'nonfinite pointwise output')
    return {'gate': gate, 'gated': gated, 'residual': residual}


class Parameters:
    """Independent original safetensors decoder; selected16-row blocks only."""
    def __init__(self, path, side, plan):
        self.path, self.side, self.plan = path, side, plan
        self.before = path.stat()
        require(self.before.st_size == plan['resources']['modelBytesPerSide'], 'Original model size mismatch')
        self.file = path.open('rb')
        self.total = self.parameter_bytes = self.max_read = self.max_parameter_read = 0
        self.ranges = []
        try:
            n = struct.unpack('<Q', self.read(0, 8, header=True))[0]
            require(n == plan['resources']['headerBytes'], 'Header size mismatch')
            raw = self.read(8, n, header=True)
            require(sha(raw) == MODELS[side][2], 'Pinned model header mismatch')
            self.header, self.payload = json.loads(raw), 8 + n
            for selection in plan['parameterSelection']:
                offset, count = self.selection(selection)
                require((offset, count) == (selection['absoluteOffset'], selection['sourceBytes']), selection['key'] + ': selected address mismatch')
        except BaseException:
            self.file.close()
            raise

    def read(self, offset, count, header=False):
        limit = 181280 if header else 163840
        require(type(offset) is int and type(count) is int and 0 <= offset <= self.before.st_size - count and 0 < count <= limit, 'Read outside declared bound')
        self.file.seek(offset)
        raw = self.file.read(count)
        require(len(raw) == count, 'Short original-file read')
        self.total += count
        self.max_read = max(self.max_read, count)
        if not header:
            self.parameter_bytes += count
            self.max_parameter_read = max(self.max_parameter_read, count)
        return raw

    def selection(self, s):
        require(s['key'] in self.header, 'Original key absent: ' + s['key'])
        row = s.get('selectedRows')
        offset, count = select_offset(self.header[s['key']], s['key'], s['fullShape'], s['storageDtype'], row_start=row[0] if row else 0, rows=row[1] - row[0] if row else None, element_offset=s.get('elementOffset', 0), count=s.get('selectedElements'))
        require(self.payload + self.header[s['key']]['data_offsets'][1] <= self.before.st_size, 'Tensor outside original file')
        return self.payload + offset, count

    def vector(self, key):
        s = next(s for s in self.plan['parameterSelection'] if s['key'] == key)
        offset, count = self.selection(s)
        raw = self.read(offset, count)
        entry = dict(s, rawSHA256=sha(raw))
        if s['storageDtype'] == 'U8':
            require(raw == s['requiredUTF8'].encode(), 'O own quantization config mismatch')
            out = raw
        else:
            dtype = '<f2' if s['storageDtype'] == 'F16' else '<f4'
            out = np.frombuffer(raw, dtype=dtype).astype('<f4')
            require(np.isfinite(out).all(), key + ': nonfinite decoded values')
            entry['decodedF32SHA256'] = sha(out.tobytes())
        self.ranges.append(entry)
        return out

    def linear_pair(self, key, inputs, bias, scale=None):
        s = next(s for s in self.plan['parameterSelection'] if s['key'] == key)
        offset, byte_count = self.selection(s)
        start, stop = s['selectedRows']
        width = math.prod(s['fullShape'][1:])
        require(width == 5120 and stop - start == 5120, 'Exact tail projection required')
        xs = [np.asarray(x, dtype='<f4').reshape(-1, width).astype(np.float64) for x in inputs]
        outputs = [np.empty((x.shape[0], stop - start), dtype='<f4') for x in xs]
        lut = np.asarray([decode_e4m3fn(i) for i in range(256)], dtype='<f4') if scale is not None else None
        raw_hash, decoded_hash = hashlib.sha256(), hashlib.sha256()
        unit = 1 if scale is not None else 2
        for first in range(0, stop - start, 16):
            raw = self.read(offset + first * width * unit, 16 * width * unit)
            if scale is None:
                decoded = np.frombuffer(raw, dtype='<f2').astype('<f4').reshape(16, width)
            else:
                decoded = np.multiply(lut[np.frombuffer(raw, dtype='u1')].reshape(16, width), scale, dtype=np.float32)
            require(np.isfinite(decoded).all(), key + ': nonfinite decoded weight')
            raw_hash.update(raw)
            decoded_hash.update(decoded.tobytes())
            w64 = decoded.astype(np.float64)
            for x, out in zip(xs, outputs):
                dot = (x @ w64.T).astype('<f4')
                out[:, first:first + 16] = np.add(dot, bias[first:first + 16], dtype=np.float32)
        require(all(np.isfinite(x).all() for x in outputs), 'Nonfinite independent projection')
        self.ranges.append(dict(s, rawSHA256=raw_hash.hexdigest(), decodedF32SHA256=decoded_hash.hexdigest(), tiles=(stop - start) // 16))
        return outputs

    def close(self):
        self.file.close()
        after = self.path.stat()
        fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        require(all(getattr(after, f) == getattr(self.before, f) for f in fields), 'Original model changed during reads')


def prefix_inputs(side, actual_path, reference_path, heads_path):
    actual, actual_hash = read_json(actual_path)
    prefix, prefix_hash = read_json(reference_path)
    heads, heads_hash = read_json(heads_path)
    short = side.lower()
    producer, producer_hash = read_json(ROOT / f'development/ai-connection/qkv-next/hidden-runtime/{short}-comparison.json')
    require(producer_hash == PREFIX_RECEIPTS[side] and producer['passed'] is True and producer['side'] == side, 'Unknown or failed full-prefix receipt')
    require(actual_hash == producer['artifactSHA256'], 'Full-prefix artifact mismatch')
    require(prefix_hash == producer['referenceSHA256'], 'Independent prefix reference mismatch')
    head_receipt, head_receipt_hash = read_json(ROOT / f'development/ai-connection/qkv-next/expansion/{short}-composed-reference-receipt.json')
    require(head_receipt_hash == HEAD_RECEIPTS[side], 'Unknown independent composed-head receipt')
    require(heads_hash == head_receipt['referenceSHA256'] and heads['inputArtifactSHA256'] == prefix_hash, 'Independent composed-head reference mismatch')
    require(heads['mode'] == 'COMPOSED_INDEPENDENT_PREFIX' and heads['side'] == side, 'Independent head mode/side mismatch')
    evidence = actual['evidence']
    case = next(c for c in load_plan()['cases'] if c['side'] == side)
    for field in ('side', 'blockIndex', 'scheduleIndex', 'sigma', 'timestep'):
        require(evidence[field] == case[field], 'Full-prefix case mismatch: ' + field)
    require(evidence['modelHash'] == heads['modelHash'] == prefix['meta']['modelSha256'] == MODELS[side][1], 'Input model identity mismatch')
    require(evidence['headerSHA256'] == MODELS[side][2] and evidence['operatorShape'] == [2, 5120] and evidence['grid'] == [1, 1, 2], 'Prefix shape/header mismatch')
    actual_arrays, independent = {}, {}
    for name, shape in (('patchHidden', [2, 5120]), ('timeAct1', [5120])):
        actual_arrays[name] = f32_array(actual['arrays'][name], shape, 'actual ' + name)
        independent[name] = f32_array(prefix['expected'][name], shape, 'independent ' + name)
        stage = producer['stages'][name]
        require(stage['finite'] is True and stage['failCount'] == 0, 'Failed prefix stage')
        require(identity(actual_arrays[name])['sha256'] == stage['actualF32SHA256'], 'Actual prefix F32 bits mismatch: ' + name)
        require(identity(independent[name])['sha256'] == stage['referenceF32SHA256'], 'Independent prefix F32 bits mismatch: ' + name)
    require(len(actual['arrays']['timeProjection']) == 10240 and len(prefix['expected']['timeProjection']) == 10240, 'Unexpected retained time projection coverage')
    independent['attention'] = f32_array(heads['expected']['attention'], [2, 5120], 'independent attention')
    require(identity(independent['attention'])['sha256'] == heads['arrayIdentities']['attention']['sha256'], 'Independent context F32 bits mismatch')
    bindings = {'fullPrefixReceiptSHA256': producer_hash, 'fullPrefixArtifactSHA256': actual_hash, 'prefixReferenceSHA256': prefix_hash, 'headsReferenceSHA256': heads_hash, 'headsReferenceReceiptSHA256': head_receipt_hash}
    return actual_arrays, independent, bindings


def actual_attention(side, path, receipt_path, bindings):
    context, context_hash = read_json(path)
    receipt, receipt_hash = read_json(receipt_path)
    require(receipt_hash == CONTEXT_RECEIPTS[side], 'Unknown actual context receipt')
    require(receipt['schemaVersion'] == 'bernini-n2-attention-tail-input-receipt/0.1' and receipt['passed'] is True and receipt['side'] == side and receipt['artifactSHA256'] == context_hash, 'Actual context receipt/artifact mismatch')
    case = next(c for c in load_plan()['cases'] if c['side'] == side)
    require(receipt['blockIndex'] == 0 and receipt['scheduleIndex'] == case['scheduleIndex'] and receipt['tokens'] == 2, 'Actual context side/block/timestep binding mismatch')
    require(receipt['producerDisposed'] is True and receipt['prefixRerun'] is False, 'Old attention owner disposal/prefix reuse not authenticated')
    require(receipt['fullPrefixReceiptSHA256'] == bindings['fullPrefixReceiptSHA256'], 'Context and prefix receipt differ')
    attention = f32_array(context['attention'], [2, 5120], 'actual attention')
    require(identity(attention)['sha256'] == receipt['contextSHA256'], 'Actual context F32 bits mismatch')
    require(receipt['fullPrefixArtifactSHA256'] == bindings['fullPrefixArtifactSHA256'], 'Context and prefix artifact differ')
    return attention, {'contextArtifactSHA256': context_hash, 'contextReceiptSHA256': receipt_hash, 'contextSHA256': identity(attention)['sha256']}


def inventory(models, side, actual_path, prefix_path, heads_path):
    plan = load_plan()
    actual, independent, bindings = prefix_inputs(side, actual_path, prefix_path, heads_path)
    source = Parameters(models / MODELS[side][0], side, plan)
    try:
        scale = source.vector('blocks.0.self_attn.o.weight_scale')
        require(scale.size == 1 and scale[0] > 0, 'O own scale must be positive scalar')
        source.vector('blocks.0.self_attn.o.comfy_quant')
        source.vector('blocks.0.self_attn.o.bias')
        source.vector('time_projection.1.bias')
        source.vector('blocks.0.modulation')
    finally:
        source.close()
    return {'schemaVersion': 'bernini-self-attention-tail-inventory/0.1', 'side': side, 'planSHA256': PLAN_SHA256, 'modelHash': MODELS[side][1], 'headerSHA256': MODELS[side][2], 'bindings': bindings, 'actualInputIdentities': {k: identity(v) for k, v in actual.items()}, 'composedInputIdentities': {k: identity(v) for k, v in independent.items()}, 'retainedActualAttentionAvailable': False, 'retainedTimeProjectionRows': [0, 10240], 'missingGateProjectionRows': [10240, 15360], 'parameterSelection': plan['parameterSelection'], 'smallParameterSources': source.ranges, 'originalFileBytesRead': source.total, 'selectedParameterBytesRead': source.parameter_bytes, 'maxSingleReadBytes': source.max_read, 'fullFileSha256Recomputed': False, 'sourceGatesFixedBeforeNewTailObservation': True, 'privatePayloadPublished': False, 'readiness': plan['readiness']}


def private_write(path, value):
    require(path.is_absolute() and not path.resolve().is_relative_to(ROOT) and not path.exists(), 'New private absolute output outside repository required')
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(value, separators=(',', ':'), allow_nan=False) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as file:
        file.write(raw)
    return raw


def generate(args):
    plan = load_plan()
    local, composed, bindings = prefix_inputs(args.side, args.prefix_actual, args.prefix_reference, args.heads_reference)
    local['attention'], context_binding = actual_attention(args.side, args.context, args.context_receipt, bindings)
    bindings.update(context_binding)
    modes = [('LOCAL_ACTUAL_INPUTS', local), ('COMPOSED_INDEPENDENT_PREFIX', composed)]
    for label in ('local', 'composed'):
        target = args.output_dir / (args.side.lower() + '-' + label + '-reference.json')
        require(target.is_absolute() and not target.resolve().is_relative_to(ROOT) and not target.exists(), 'New private absolute output outside repository required')
    source = Parameters(args.models / MODELS[args.side][0], args.side, plan)
    started = time.perf_counter()
    try:
        scale = source.vector('blocks.0.self_attn.o.weight_scale')
        require(scale.size == 1 and scale[0] > 0, 'O own scale must be positive scalar')
        source.vector('blocks.0.self_attn.o.comfy_quant')
        o_bias = source.vector('blocks.0.self_attn.o.bias')
        gate_bias = source.vector('time_projection.1.bias')
        modulation = source.vector('blocks.0.modulation')
        o = source.linear_pair('blocks.0.self_attn.o.weight', [x['attention'] for _, x in modes], o_bias, scale[0])
        projection = source.linear_pair('time_projection.1.weight', [x['timeAct1'] for _, x in modes], gate_bias)
    finally:
        source.close()
    require(source.parameter_bytes == plan['resources']['selectedParameterBytesPerSide'], 'Selected parameter byte total mismatch')
    results = []
    for index, (mode, inputs) in enumerate(modes):
        arrays = {'o': o[index], 'gateProjection': projection[index].reshape(5120)}
        arrays.update(finish_tail(arrays['o'], arrays['gateProjection'], modulation, inputs['patchHidden']))
        identities = {name: identity(a) for name, a in arrays.items()}
        result = {'schemaVersion': 'bernini-self-attention-tail-reference/0.1', 'mode': mode, 'side': args.side, 'profileId': plan['profileId'], 'modelHash': MODELS[args.side][1], 'headerSHA256': MODELS[args.side][2], 'planSHA256': PLAN_SHA256, 'case': next(c for c in plan['cases'] if c['side'] == args.side), 'inputBindings': bindings, 'inputs': {name: identity(a) for name, a in inputs.items()}, 'expected': {name: a.reshape(-1).tolist() for name, a in arrays.items()}, 'arrayIdentities': identities, 'parameterSources': source.ranges, 'gates': plan['gates'], 'readiness': plan['readiness'], 'originalProductionPrecisionVerified': False, 'torchAddcmulFusedGPUParityVerified': False}
        label = 'local' if index == 0 else 'composed'
        output = args.output_dir / (args.side.lower() + '-' + label + '-reference.json')
        raw = private_write(output, result)
        receipt = {k: v for k, v in result.items() if k != 'expected'}
        receipt.update(schemaVersion='bernini-self-attention-tail-reference-receipt/0.1', referenceSHA256=sha(raw), referenceBytes=len(raw), generatorSHA256=sha(Path(__file__).read_bytes()), originalFileBytesRead=source.total, selectedParameterBytesRead=source.parameter_bytes, maxSingleReadBytes=source.max_read, maxSingleParameterReadBytes=source.max_parameter_read, fullFileSha256Recomputed=False, privateArrayPayloadPublished=False, sharedTraversalForTwoReferenceModes=True, referenceBackend={'numpy': np.__version__, 'blasThreads': 1, 'decode': 'independent scalar E4M3FN table times own F32 scale; binary16 to F32', 'linear': 'NumPy binary64 dot then F32, separate F32 bias', 'pointwise': 'separate F32 addition, multiplication, addition; no fused addcmul'}, elapsedSeconds=time.perf_counter() - started)
        target = args.receipt_dir / (args.side.lower() + '-' + label + '-reference-receipt.json')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(receipt, indent=2, allow_nan=False) + '\n')
        results.append({'mode': mode, 'referenceSHA256': sha(raw), 'referenceBytes': len(raw)})
    return results


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--models', type=Path, required=True)
    p.add_argument('--side', choices=MODELS, required=True)
    p.add_argument('--prefix-actual', type=Path, required=True)
    p.add_argument('--prefix-reference', type=Path, required=True)
    p.add_argument('--heads-reference', type=Path, required=True)
    p.add_argument('--inventory', type=Path)
    p.add_argument('--context', type=Path)
    p.add_argument('--context-receipt', type=Path)
    p.add_argument('--output-dir', type=Path)
    p.add_argument('--receipt-dir', type=Path, default=CORE)
    args = p.parse_args()
    if args.inventory:
        result = inventory(args.models, args.side, args.prefix_actual, args.prefix_reference, args.heads_reference)
        args.inventory.parent.mkdir(parents=True, exist_ok=True)
        args.inventory.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
        print(json.dumps({'side': args.side, 'inventorySHA256': sha(args.inventory.read_bytes()), 'planSHA256': PLAN_SHA256}))
    else:
        require(args.context and args.context_receipt and args.output_dir, 'Context, context receipt and private output directory required')
        print(json.dumps({'side': args.side, 'references': generate(args)}))


if __name__ == '__main__':
    main()
