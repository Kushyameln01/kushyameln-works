"""NN0 checks for the bounded SDPA arithmetic candidate, never a numeric gate."""
import importlib.util
import hashlib
import io
import struct
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
PREFIX = '/block/layer.0/SelfAttention/'


def varint(value):
    raw = bytearray()
    while value > 127:
        raw.append((value & 127) | 128)
        value >>= 7
    raw.append(value)
    return bytes(raw)


def field(number, raw):
    return varint(number * 8 + 2) + varint(len(raw)) + raw


def node(suffix, op, inputs=(), constant=None):
    name = PREFIX + suffix
    raw = b''.join(field(1, value.encode()) for value in inputs)
    raw += field(2, (name + '_output_0').encode()) + field(3, name.encode()) + field(4, op.encode())
    if constant is not None:
        value, dims, dtype = constant
        tensor = b''.join(b'\x08' + varint(dim) for dim in dims) + b'\x10' + varint(dtype)
        tensor += field(9, struct.pack('<f' if dtype == 1 else '<q', value))
        raw += field(5, field(1, b'value') + field(5, tensor) + b'\xa0\x01\x04')
    return field(1, raw)


def graph_fixture(shared=False):
    output = lambda suffix: PREFIX + suffix + '_output_0'
    nodes = []
    for suffix, value, dims, dtype in [
        ('Constant_15', 64., [], 1), ('Constant_16', .5, [], 1),
        ('Constant_20', 64, [], 7), ('Constant_21', 64, [1], 7),
        ('Constant_22', 64, [1], 7), ('Constant_23', 64, [1], 7),
        ('Constant_26', 1., [1], 1), ('Constant_27', 64, [], 7),
    ]:
        nodes.append(node(suffix, 'Constant', constant=(value, dims, dtype)))
    for suffix, op, inputs in [
        ('Div_2', 'Div', ['Cast_4', 'Constant_15']),
        ('Pow', 'Pow', ['Div_2', 'Constant_16']),
        ('Mul_2', 'Mul', ['k/MatMul', 'Pow']),
        ('Sqrt', 'Sqrt', ['Cast_7']),
        ('Div_4', 'Div', ['Constant_26', 'Sqrt']),
        ('Cast_8', 'Cast', ['Div_4']),
        ('Sqrt_1', 'Sqrt', ['Cast_8']), ('Sqrt_2', 'Sqrt', ['Cast_8']),
        ('Mul_3', 'Mul', ['Transpose_1', 'Sqrt_1']),
        ('Mul_4', 'Mul', ['Transpose_3', 'Sqrt_2']),
        ('MatMul', 'MatMul', ['Mul_3', 'Mul_4']),
    ]:
        nodes.append(node(suffix, op, [output(value) for value in inputs]))
    if shared:
        nodes.append(node('unexpected-consumer', 'Identity', [output('Constant_26')]))
    # The stream reader must seek over this initializer, not read or hash it.
    initializer = field(5, b'WEIGHT' * 400000)
    graph = b''.join(nodes) + initializer
    model = b'\x08\x0a' + field(7, graph)
    initializer_start = model.index(b'WEIGHT' * 10)
    return model, (initializer_start, initializer_start + 2400000)


class NoWeightReads(io.BytesIO):
    def __init__(self, raw, forbidden):
        super().__init__(raw)
        self.forbidden = forbidden

    def read(self, size=-1):
        start = self.tell()
        end = len(self.getbuffer()) if size < 0 else start + size
        if start < self.forbidden[1] and end > self.forbidden[0]:
            raise AssertionError('Large initializer payload was read')
        return super().read(size)


class SdpaRecipe(unittest.TestCase):
    def target(self):
        path = HERE / 'sdpa_scale_recipe.py'
        self.assertTrue(path.is_file(), 'Missing bounded SDPA metadata recipe implementation')
        spec = importlib.util.spec_from_file_location('sdpa_recipe', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_two_scalar_offsets_change_scale_without_reading_initializers(self):
        target = self.target()
        raw, forbidden = graph_fixture()
        result = target.inspect_graph(NoWeightReads(raw, forbidden), len(raw))
        self.assertEqual(len(result['patches']), 2)
        self.assertEqual([(p['beforeHex'], p['afterHex']) for p in result['patches']],
                         [('0000003f', '00000000'), ('0000803f', '00000041')])
        self.assertEqual(result['initializerPayloadBytesRead'], 0)
        for patch in result['patches']:
            self.assertEqual(raw[patch['offset']:patch['offset'] + 4].hex(), patch['beforeHex'])

    def test_shared_scale_constant_is_rejected_instead_of_changing_other_math(self):
        target = self.target()
        raw, _ = graph_fixture(shared=True)
        with self.assertRaisesRegex(ValueError, 'consumer'):
            target.inspect_graph(io.BytesIO(raw), len(raw))

    def test_changed_head_count_is_rejected(self):
        target = self.target()
        raw, _ = graph_fixture()
        # The independently fixed first Constant contains the float32 head count.
        raw = raw.replace(struct.pack('<f', 64.), struct.pack('<f', 32.), 1)
        with self.assertRaisesRegex(ValueError, 'Constant_15'):
            target.inspect_graph(io.BytesIO(raw), len(raw))

    def test_streaming_execution_hash_retains_source_identity_across_chunk_boundaries(self):
        target = self.target()
        original = bytes([9, 9, 0, 0, 0, 63, 9, 9, 9, 9, 0, 0, 128, 63, 9, 9])
        expected = bytes([9, 9, 0, 0, 0, 0, 9, 9, 9, 9, 0, 0, 0, 65, 9, 9])
        patches = [{'offset': 2, 'beforeHex': '0000003f', 'afterHex': '00000000'},
                   {'offset': 10, 'beforeHex': '0000803f', 'afterHex': '00000041'}]
        source, executed = target.execution_hashes(io.BytesIO(original), len(original), patches, chunk_bytes=3)
        self.assertEqual(source, hashlib.sha256(original).hexdigest())
        self.assertEqual(executed, hashlib.sha256(expected).hexdigest())


if __name__ == '__main__':
    unittest.main()
