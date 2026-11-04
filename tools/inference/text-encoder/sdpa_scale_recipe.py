#!/usr/bin/env python3
"""Inspect existing UMT5 graph metadata for a bounded, unaccepted SDPA candidate.

No graph/model inference, export, initializer read or whole-graph copy/hash occurs.
The candidate changes two float32 Constant payloads in caller-owned graph bytes:
K scale exponent .5 -> 0 and SDPA scale numerator 1 -> 8. For the selected
4096/64-head implementation this cancels K*8 and SDPA/8 before split scaling.
Weights, model identity, dynamic token axis and numeric acceptance gate stay put.
"""
import argparse
import hashlib
import io
import json
import struct
from pathlib import Path

TYPE = 'umt5-sdpa-scale-cancellation-candidate-v1'
STATUS = 'diagnostic-only-unaccepted'
PREFIX = '/block/layer.0/SelfAttention/'
MODEL = 'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68'


def _integer(stream):
    value = 0
    for shift in range(0, 70, 7):
        raw = stream.read(1)
        if not raw:
            raise ValueError('Truncated protobuf integer')
        value |= (raw[0] & 127) << shift
        if raw[0] < 128:
            return value
    raise ValueError('Oversized protobuf integer')


def _fields(stream, end):
    while stream.tell() < end:
        key = _integer(stream)
        number, wire = key >> 3, key & 7
        if not number:
            raise ValueError('Invalid protobuf field number')
        integer = None
        if wire == 2:
            length = _integer(stream)
            start = stream.tell()
            finish = start + length
        elif wire == 0:
            start = stream.tell()
            integer = _integer(stream)
            finish = stream.tell()
            length = finish - start
        elif wire in (1, 5):
            start = stream.tell()
            length = 8 if wire == 1 else 4
            finish = start + length
        else:
            raise ValueError('Unsupported protobuf wire type')
        if finish > end:
            raise ValueError('Truncated protobuf field')
        yield number, wire, start, length, integer
        stream.seek(finish)
    if stream.tell() != end:
        raise ValueError('Protobuf boundary mismatch')


def _payload(stream, start, length):
    if length > 65536:
        raise ValueError('Unexpected oversized node metadata')
    stream.seek(start)
    value = stream.read(length)
    if len(value) != length:
        raise ValueError('Truncated node metadata')
    return value


def _node(raw, absolute_offset):
    stream = io.BytesIO(raw)
    node = {'inputs': [], 'outputs': [], 'attributes': []}
    for number, wire, start, length, _ in _fields(stream, len(raw)):
        if number in (1, 2, 3, 4):
            if wire != 2:
                raise ValueError('Invalid node string')
            value = _payload(stream, start, length).decode('utf8')
            if number in (1, 2):
                node['inputs' if number == 1 else 'outputs'].append(value)
            else:
                node['name' if number == 3 else 'op'] = value
        elif number == 5:
            node['attributes'].append((_payload(stream, start, length), absolute_offset + start))
    return node


def _constant(node):
    tensors = []
    for raw, absolute in node['attributes']:
        stream = io.BytesIO(raw)
        name = None
        tensor = None
        for number, wire, start, length, _ in _fields(stream, len(raw)):
            if number == 1:
                name = _payload(stream, start, length).decode('utf8')
            elif number == 5:
                tensor = (_payload(stream, start, length), absolute + start)
        if name == 'value' and tensor is not None:
            tensors.append(tensor)
    if node.get('op') != 'Constant' or len(tensors) != 1:
        raise ValueError('Expected one TensorProto Constant: ' + node.get('name', '?'))
    raw, absolute = tensors[0]
    stream = io.BytesIO(raw)
    dims, dtype, value, offset = [], None, None, None
    for number, wire, start, length, integer in _fields(stream, len(raw)):
        if number == 1:
            if wire == 0:
                dims.append(integer)
            elif wire == 2:
                packed = io.BytesIO(_payload(stream, start, length))
                while packed.tell() < length:
                    dims.append(_integer(packed))
            else:
                raise ValueError('Invalid TensorProto dimensions')
        elif number == 2:
            dtype = integer
        elif number == 9:
            value, offset = _payload(stream, start, length), absolute + start
    if dtype not in (1, 7) or value is None or len(value) != (4 if dtype == 1 else 8):
        raise ValueError('Expected small raw Constant payload: ' + node['name'])
    return {'dtype': dtype, 'dims': dims, 'value': struct.unpack('<f' if dtype == 1 else '<q', value)[0],
            'hex': value.hex(), 'offset': offset}


def inspect_graph(stream, size):
    """Seek over every initializer and return exactly two metadata byte offsets."""
    nodes, graph_count, metadata_bytes = {}, 0, 0
    stream.seek(0)
    for number, wire, start, length, _ in _fields(stream, size):
        if number != 7:
            continue
        if wire != 2:
            raise ValueError('Invalid ModelProto graph')
        graph_count += 1
        stream.seek(start)
        for field, node_wire, node_start, node_length, _ in _fields(stream, start + length):
            if field != 1:
                continue
            if node_wire != 2:
                raise ValueError('Invalid GraphProto node')
            raw = _payload(stream, node_start, node_length)
            metadata_bytes += len(raw)
            node = _node(raw, node_start)
            name = node.get('name')
            if not name or name in nodes:
                raise ValueError('Missing or duplicate node name')
            nodes[name] = node
    if graph_count != 1:
        raise ValueError('Exactly one ModelProto graph required')
    consumers = {}
    for node in nodes.values():
        for name in node['inputs']:
            consumers.setdefault(name, []).append(node['name'])

    def output(suffix):
        return PREFIX + suffix + '_output_0'

    def expected_node(suffix, op, inputs):
        node = nodes.get(PREFIX + suffix)
        if not node or node['op'] != op or node['inputs'] != [output(value) for value in inputs] or node['outputs'] != [output(suffix)]:
            raise ValueError('Unexpected selected SDPA node: ' + suffix)
        return node

    def constant(suffix, value, dtype, dims):
        node = expected_node(suffix, 'Constant', [])
        actual = _constant(node)
        if (actual['value'], actual['dtype'], actual['dims']) != (value, dtype, dims):
            raise ValueError('Unexpected fixed Constant: ' + suffix)
        return actual

    def consumer(suffix, expected):
        if sorted(consumers.get(output(suffix), [])) != sorted(PREFIX + value for value in expected):
            raise ValueError('Unexpected/shared consumer for selected scale: ' + suffix)

    constant('Constant_15', 64., 1, [])
    exponent = constant('Constant_16', .5, 1, [])
    for suffix, dims in [('Constant_20', []), ('Constant_21', [1]), ('Constant_22', [1]),
                         ('Constant_23', [1]), ('Constant_27', [])]:
        constant(suffix, 64, 7, dims)
    numerator = constant('Constant_26', 1., 1, [1])
    for suffix, op, inputs in [
        ('Div_2', 'Div', ['Cast_4', 'Constant_15']), ('Pow', 'Pow', ['Div_2', 'Constant_16']),
        ('Mul_2', 'Mul', ['k/MatMul', 'Pow']), ('Sqrt', 'Sqrt', ['Cast_7']),
        ('Div_4', 'Div', ['Constant_26', 'Sqrt']), ('Cast_8', 'Cast', ['Div_4']),
        ('Sqrt_1', 'Sqrt', ['Cast_8']), ('Sqrt_2', 'Sqrt', ['Cast_8']),
        ('Mul_3', 'Mul', ['Transpose_1', 'Sqrt_1']), ('Mul_4', 'Mul', ['Transpose_3', 'Sqrt_2']),
        ('MatMul', 'MatMul', ['Mul_3', 'Mul_4']),
    ]:
        expected_node(suffix, op, inputs)
    for suffix, expected in [
        ('Constant_15', ['Div_2']), ('Constant_16', ['Pow']), ('Pow', ['Mul_2']),
        ('Constant_26', ['Div_4']), ('Div_4', ['Cast_8']), ('Cast_8', ['Sqrt_1', 'Sqrt_2']),
        ('Sqrt_1', ['Mul_3']), ('Sqrt_2', ['Mul_4']), ('Mul_3', ['MatMul']), ('Mul_4', ['MatMul']),
    ]:
        consumer(suffix, expected)
    patches = []
    for suffix, before, after in [('Constant_16', exponent, 0.), ('Constant_26', numerator, 8.)]:
        patches.append({'nodeName': PREFIX + suffix, 'offset': before['offset'], 'beforeHex': before['hex'],
                        'afterHex': struct.pack('<f', after).hex(), 'beforeValue': before['value'], 'afterValue': after})
    return {'patches': patches, 'nodeCount': len(nodes), 'nodeMetadataBytesRead': metadata_bytes,
            'initializerPayloadBytesRead': 0, 'consumerClosureVerified': True, 'headCount': 64, 'headDimension': 64}


def execution_hashes(stream, size, patches, chunk_bytes=8 * 1024 * 1024):
    """Hash source and changed views in one read pass; write/copy no graph file."""
    source, executed = hashlib.sha256(), hashlib.sha256()
    selected = sorted(patches, key=lambda item: item['offset'])
    if any(patch['offset'] < 0 or patch['offset'] + 4 > size for patch in selected):
        raise ValueError('Candidate offset outside graph')
    if any(right['offset'] < left['offset'] + 4 for left, right in zip(selected, selected[1:])):
        raise ValueError('Overlapping candidate offsets')
    stream.seek(0)
    offset = 0
    while offset < size:
        raw = stream.read(min(chunk_bytes, size - offset))
        if not raw:
            raise ValueError('Truncated graph during execution hash')
        source.update(raw)
        view, cursor = memoryview(raw), 0
        for patch in selected:
            start, end = max(offset, patch['offset']), min(offset + len(raw), patch['offset'] + 4)
            if start >= end:
                continue
            local_start, local_end = start - offset, end - offset
            first, last = start - patch['offset'], end - patch['offset']
            if view[local_start:local_end].tobytes() != bytes.fromhex(patch['beforeHex'])[first:last]:
                raise ValueError('Changed Constant payload during execution hash')
            executed.update(view[cursor:local_start])
            executed.update(bytes.fromhex(patch['afterHex'])[first:last])
            cursor = local_end
        executed.update(view[cursor:])
        offset += len(raw)
    return source.hexdigest(), executed.hexdigest()


def create_recipe(bundle, with_execution_hashes=False):
    bundle = Path(bundle)
    raw = (bundle / 'manifest.json').read_bytes()
    manifest = json.loads(raw)
    if manifest.get('modelSha256') != MODEL or manifest.get('hiddenSize') != 4096 or manifest.get('numLayers') != 24 or manifest.get('onnxOpset') != 17:
        raise ValueError('Only selected FP32 UMT5 4096-hidden/24-layer manifest is supported')
    blocks = manifest.get('blocks', [])
    if len(blocks) != 24:
        raise ValueError('Complete selected24 graph records required')
    result = {'schemaVersion': 1, 'type': TYPE, 'status': STATUS, 'modelSha256': MODEL,
              'manifestSha256': hashlib.sha256(raw).hexdigest(), 'newExports': 0, 'newNeuralRuns': 0,
              'scope': 'Two scalar metadata writes; FP32 SDPA scale cancellation candidate; fixed gate not evaluated',
              'executionGraphHashPolicy': 'Must hash actual in-place bytes separately from the original verified asset before session creation',
              'executionHashReadBytes': 0, 'blocks': []}
    for index, block in enumerate(blocks):
        path = bundle / block['path']
        if block.get('index') != index or path.stat().st_size != block.get('bytes'):
            raise ValueError('Selected graph record/size mismatch')
        with path.open('rb') as stream:
            inspection = inspect_graph(stream, block['bytes'])
            if with_execution_hashes:
                actual, executed = execution_hashes(stream, block['bytes'], inspection['patches'])
                if actual != block['sha256']:
                    raise ValueError('Original graph asset SHA-256 mismatch: ' + block['path'])
                inspection.update(executedGraphSha256=executed, sourceAssetHashVerified=True)
                result['executionHashReadBytes'] += block['bytes']
        result['blocks'].append({'schemaVersion': 1, 'type': TYPE, 'status': STATUS, 'index': index, 'path': block['path'],
                                 'sourceAsset': {'bytes': block['bytes'], 'sha256': block['sha256']}, **inspection})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--execution-hashes', action='store_true', help='One streaming original/changed hash pass; no graph writes or inference')
    args = parser.parse_args()
    result = create_recipe(args.bundle, args.execution_hashes)
    with args.output.open('x') as stream:
        json.dump(result, stream, indent=2)
        stream.write('\n')
    print(json.dumps({'passed': True, 'status': STATUS, 'graphsInspected': len(result['blocks']),
                      'metadataInspectionInitializerPayloadBytesRead': 0, 'executionHashReadBytes': result['executionHashReadBytes'],
                      'newExports': 0, 'newNeuralRuns': 0, 'output': str(args.output)}))


if __name__ == '__main__':
    main()
