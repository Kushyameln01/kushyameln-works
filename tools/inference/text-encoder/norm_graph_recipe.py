#!/usr/bin/env python3
"""Source-preserving two-inner-RMSNorm graph metadata recipe; no model export.

Read small NodeProto fields, seek over model initializer payloads. Replace the
two ReduceMean wire fields by source-exact AVX2 F32 cascade nodes and update the
ModelProto.graph length. Optional source/execution hashes read assets once but
never write/copy a whole graph. Runtime uses one explicit output allocation.
"""
import argparse
import base64
import hashlib
import importlib.util
import io
import json
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TYPE = 'umt5-inner-rmsnorm-avx2-cascade-f32-v1'
STATUS = 'diagnostic-only-unaccepted'
MODEL = 'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68'


def _module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def varint(value):
    raw = bytearray()
    while value > 127:
        raw.append((value & 127) | 128)
        value >>= 7
    raw.append(value)
    return bytes(raw)


def execution_hashes(stream, size, operations, chunk_bytes=8 * 1024 * 1024):
    original, executed = hashlib.sha256(), hashlib.sha256()
    stream.seek(0)
    cursor = 0
    def consume(end):
        nonlocal cursor
        while cursor < end:
            raw = stream.read(min(chunk_bytes, end - cursor))
            if not raw:
                raise ValueError('Truncated graph hash input')
            original.update(raw)
            executed.update(raw)
            cursor += len(raw)
    for operation in sorted(operations, key=lambda value: value['offset']):
        if operation['offset'] < cursor:
            raise ValueError('Overlapping graph metadata replacements')
        consume(operation['offset'])
        before = bytes.fromhex(operation['beforeHex'])
        actual = stream.read(len(before))
        if actual != before:
            raise ValueError('Original graph metadata payload changed')
        original.update(actual)
        executed.update(base64.b64decode(operation['afterBase64'], validate=True))
        cursor += len(before)
    consume(size)
    return original.hexdigest(), executed.hexdigest()


def inspect_graph(path, onnx):
    wire = _module('text_sdpa_wire', HERE / 'sdpa_scale_recipe.py')
    norm = _module('text_norm_probe', HERE / 'norm_reduction_probe.py')
    operations = []
    nodes = {}
    initializers, hidden_shape = {}, None
    graph_start = graph_length = None
    with Path(path).open('rb') as stream:
        for number, kind, start, length, _ in wire._fields(stream, Path(path).stat().st_size):
            if number != 7:
                continue
            if kind != 2 or graph_start is not None:
                raise ValueError('Exactly one graph payload required')
            graph_start, graph_length = start, length
            stream.seek(start)
            for field, node_kind, node_start, node_length, _ in wire._fields(stream, start + length):
                if field == 5:
                    stream.seek(node_start)
                    dims, dtype, name = [], None, None
                    for tensor_field, tensor_kind, tensor_start, tensor_length, integer in wire._fields(stream, node_start + node_length):
                        if tensor_field == 1:
                            if tensor_kind == 0:
                                dims.append(integer)
                            else:
                                packed = io.BytesIO(wire._payload(stream, tensor_start, tensor_length))
                                while packed.tell() < tensor_length:
                                    dims.append(wire._integer(packed))
                        elif tensor_field == 2:
                            dtype = integer
                        elif tensor_field == 8:
                            name = wire._payload(stream, tensor_start, tensor_length).decode('utf8')
                        # Tensor data fields are always skipped, including norm weights.
                    initializers[name] = (dtype, dims)
                    continue
                if field == 11:
                    info = onnx.ValueInfoProto()
                    info.ParseFromString(wire._payload(stream, node_start, node_length))
                    if info.name == 'hidden':
                        hidden_shape = [value.dim_value if value.HasField('dim_value') else value.dim_param for value in info.type.tensor_type.shape.dim]
                        if info.type.tensor_type.elem_type != onnx.TensorProto.FLOAT:
                            raise ValueError('Original hidden input is not float32')
                    continue
                if field != 1:
                    continue
                if node_kind != 2:
                    raise ValueError('Invalid graph node field')
                raw = wire._payload(stream, node_start, node_length)
                node = onnx.NodeProto()
                node.ParseFromString(raw)
                if node.name in nodes:
                    raise ValueError('Duplicate graph node name')
                nodes[node.name] = node
                for layer in [0, 1]:
                    prefix = '/block/layer.%d/layer_norm/' % layer
                    if node.name != prefix + 'ReduceMean':
                        continue
                    attributes = {value.name: onnx.helper.get_attribute_value(value) for value in node.attribute}
                    if node.op_type != 'ReduceMean' or list(node.input) != [prefix + 'Pow_output_0'] or list(node.output) != [prefix + 'ReduceMean_output_0'] or list(attributes.get('axes', [])) != [-1] or attributes.get('keepdims', 1) != 1:
                        raise ValueError('Unsupported original inner norm reduction semantics')
                    replacement = b''
                    for value in norm.cascade_nodes(node.input[0], node.output[0], onnx, prefix=prefix + 'source-avx2'):
                        raw_node = value.SerializeToString()
                        replacement += b'\x0a' + varint(len(raw_node)) + raw_node
                    before = b'\x0a' + varint(node_length) + raw
                    operations.append({'role': 'inner-rmsnorm-%d-reduce-mean' % layer,
                                       'offset': node_start - len(varint(node_length)) - 1,
                                       'beforeHex': before.hex(), 'afterBase64': base64.b64encode(replacement).decode()})
    if graph_start is None or len(operations) != 2:
        raise ValueError('Exactly two original inner RMSNorm reductions required')
    if not hidden_shape or hidden_shape[0] != 1 or hidden_shape[-1] != 4096 or len(hidden_shape) != 3 or not isinstance(hidden_shape[1], str):
        raise ValueError('Original dynamic BLC [1,L,4096] input required')
    # Both norm inputs are BLC4096 in the fixed manifest; learned scales4096 and
    # the exact Pow(2)/epsilon semantics are checked before replacing reductions.
    for layer in [0, 1]:
        prefix = '/block/layer.%d/layer_norm/' % layer
        pow_node = nodes[prefix + 'Pow']
        exponent = nodes.get(pow_node.input[1].removesuffix('_output_0'))
        epsilon = nodes.get(prefix + 'Constant_1')
        if pow_node.op_type != 'Pow' or exponent is None or exponent.op_type != 'Constant' or epsilon is None:
            raise ValueError('Unsupported original inner RMSNorm power')
        if float(onnx.numpy_helper.to_array(exponent.attribute[0].t)) != 2. or float(onnx.numpy_helper.to_array(epsilon.attribute[0].t)) != struct.unpack('<f', struct.pack('<f', 1e-6))[0]:
            raise ValueError('Original inner RMSNorm exponent/epsilon changed')
        if layer == 0 and pow_node.input[0] != 'hidden':
            raise ValueError('Unexpected first RMSNorm source input')
        if layer == 1 and pow_node.input[0] != '/block/layer.0/Add_output_0':
            raise ValueError('Unexpected second RMSNorm residual input')
        multiply = nodes[prefix + 'Mul_1']
        if multiply.op_type != 'Mul' or list(multiply.input)[1:] != [prefix + 'Mul_output_0'] or initializers.get(multiply.input[0]) != (1, [4096]):
            raise ValueError('Original float32 learned RMSNorm scale4096 required')
    delta = sum(len(base64.b64decode(value['afterBase64'])) - len(bytes.fromhex(value['beforeHex'])) for value in operations)
    new_length = graph_length + delta
    operations.append({'role': 'graph-length', 'offset': graph_start - len(varint(graph_length)),
                       'beforeHex': varint(graph_length).hex(), 'afterBase64': base64.b64encode(varint(new_length)).decode()})
    operations.sort(key=lambda value: value['offset'])
    executed_bytes = Path(path).stat().st_size + sum(len(base64.b64decode(value['afterBase64'])) - len(bytes.fromhex(value['beforeHex'])) for value in operations)
    if executed_bytes - Path(path).stat().st_size > 65536:
        raise ValueError('Unbounded graph metadata growth')
    return {'operations': operations, 'sourceGraphPayloadOffset': graph_start, 'sourceGraphLength': graph_length,
            'executedGraphLength': new_length, 'executedBytes': executed_bytes, 'initializerPayloadBytesRead': 0,
            'wholeGraphCopiesAtRuntime': 1, 'reductionWidth': 4096, 'sumVectorLanes': 8, 'dynamicTokens': [1, 512], 'hiddenShape': hidden_shape,
            'scope': 'Both inner RMSNorm reductions only; source weights and all other nodes unchanged'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--deps', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--execution-hashes', action='store_true')
    args = parser.parse_args()
    sys.path.insert(0, str(args.deps))
    import onnx
    raw = (args.bundle / 'manifest.json').read_bytes()
    manifest = json.loads(raw)
    if manifest.get('modelSha256') != MODEL or manifest.get('hiddenSize') != 4096 or manifest.get('numLayers') != 24 or manifest.get('maxTokens') != 512:
        raise ValueError('Original fixed UMT5 manifest required')
    result = {'schemaVersion': 1, 'type': TYPE, 'status': STATUS, 'sourceManifestSha256': hashlib.sha256(raw).hexdigest(),
              'newModelExports': 0, 'newOperatorRuns': 0, 'executionHashReadBytes': 0, 'blocks': []}
    for index, block in enumerate(manifest['blocks']):
        if block['index'] != index or block.get('attentionLowering') or block.get('normLowering'):
            raise ValueError('Original assets only; other numeric candidates must not be mixed')
        path = args.bundle / block['path']
        if path.stat().st_size != block['bytes']:
            raise ValueError('Original asset size mismatch')
        record = {'schemaVersion': 1, 'type': TYPE, 'status': STATUS, 'index': index, 'path': block['path'],
                  'sourceAsset': {'bytes': block['bytes'], 'sha256': block['sha256']}, **inspect_graph(path, onnx)}
        if args.execution_hashes:
            with path.open('rb') as stream:
                source, executed = execution_hashes(stream, block['bytes'], record['operations'])
            if source != block['sha256']:
                raise ValueError('Original graph asset hash mismatch')
            record.update(executedGraphSha256=executed, sourceAssetHashVerified=True)
            result['executionHashReadBytes'] += block['bytes']
        result['blocks'].append(record)
        print(json.dumps({'phase': 'norm-recipe', 'completed': index + 1, 'total': 24, 'executionHashReadBytes': result['executionHashReadBytes']}), flush=True)
    with args.output.open('x') as stream:
        json.dump(result, stream, indent=2)
        stream.write('\n')


if __name__ == '__main__':
    main()
