"""Small independent P4 oracle boundary tests; no original matrix execution."""
import importlib.util
import json
import math
from pathlib import Path
import struct
import tempfile
import unittest

import numpy as np

PATH = Path(__file__).with_name('p4-cross-ffn-reference.py')
SPEC = importlib.util.spec_from_file_location('p4_reference', PATH)
P4 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(P4)


class ReferenceBoundaries(unittest.TestCase):
    def test_frozen_plan_and_exact_fixture(self):
        plan = P4.load_plan()
        data, mask, metadata = P4.fixture_conditioning()
        self.assertEqual(data.shape, (4, 4096))
        self.assertEqual(mask.tolist(), [1, 1, 0, 1])
        self.assertTrue(np.all(data[2] == 0))
        self.assertEqual(P4.identity(data)['sha256'], metadata['dataSHA256'])
        self.assertEqual(set(plan['intermediates']), set(P4.ARRAY_SHAPES))
        self.assertFalse(metadata['textEncoderProducerVerified'])

    def test_independent_binary16_all_codes(self):
        decoded = P4.decode_f16(struct.pack('<4H', 0, 1, 0x3c00, 0x8000))  # finite ordinary sample
        self.assertEqual(decoded.dtype, np.dtype('<f4'))
        for code in range(65536):
            scalar = P4.decode_binary16(code)
            native = struct.unpack('<e', struct.pack('<H', code))[0]
            if math.isnan(native):
                self.assertTrue(math.isnan(scalar))
            else:
                self.assertEqual(struct.pack('<f', scalar), struct.pack('<f', native))
        self.assertEqual(math.copysign(1.0, P4.decode_binary16(0x8000)), -1)
        with self.assertRaises(ValueError):
            P4.decode_f16(b'\x00|')  # infinity rejected for model values

    def test_independent_fp8_nan_negative_zero_and_scaled_bytes(self):
        self.assertTrue(math.isnan(P4.decode_e4m3fn(127)))
        self.assertTrue(math.isnan(P4.decode_e4m3fn(255)))
        self.assertEqual(P4.decode_e4m3fn(126), 448)
        self.assertEqual(math.copysign(1, P4.decode_e4m3fn(128)), -1)
        result = P4.decode_fp8(bytes([0, 128, 56, 184]), np.float32(0.5))
        self.assertEqual(result.tobytes(), struct.pack('<4f', 0, -0., .5, -.5))
        for scale in (0., -1., math.inf, math.nan):
            with self.assertRaises(ValueError):
                P4.decode_fp8(bytes([56]), scale)

    def test_selection_preserves_full_shape_and_exact_tiling(self):
        d = {'shape': [5120, 13824], 'dtype': 'F8_E4M3', 'data_offsets': [99, 99 + 5120 * 13824]}
        self.assertEqual(P4.select_offset(d, [5120, 13824], 'F8_E4M3', row_start=4, rows=4), (99 + 4 * 13824, 4 * 13824))
        for kwargs in ({'row_start': 5119, 'rows': 4}, {'row_start': -1, 'rows': 4}, {'row_start': 0, 'rows': 0}):
            with self.assertRaises(ValueError):
                P4.select_offset(d, [5120, 13824], 'F8_E4M3', **kwargs)
        with self.assertRaises(ValueError):
            P4.select_offset(d, [5120, 13824], 'F16', row_start=0, rows=4)

    def test_cross_attention_keeps_masked_zero_keys(self):
        q = np.zeros((2, 5120), dtype=np.float32)
        k = np.zeros((4, 5120), dtype=np.float32)
        v = np.repeat(np.array([[1.], [3.], [100.], [5.]], dtype=np.float32), 5120, axis=1)
        result = P4.all_head_attention(q, k, v)
        self.assertTrue(np.all(result == np.float32(27.25)))
        self.assertEqual(result.shape, (2, 5120))

    def test_norm_affine_axis_and_ffn_gate_basis(self):
        x = np.arange(10240, dtype=np.float32).reshape(2, 5120) / 8192
        unit = np.ones(5120, dtype=np.float32)
        ln = P4.layer_norm(x)
        self.assertLess(float(np.abs(ln.mean(axis=1)).max()), 1e-6)
        self.assertTrue(np.array_equal(P4.layer_norm(x, unit * 2, unit * 3), np.add(np.multiply(ln, 2, dtype=np.float32), 3, dtype=np.float32)))
        norm = P4.rms_norm(x, unit)
        self.assertEqual(norm.shape, x.shape)
        shift, scale, gate = unit, unit * 2, -unit * 4
        modulated = P4.modulate(ln, shift, scale)
        np.testing.assert_array_equal(modulated, np.add(np.multiply(ln, 3, dtype=np.float32), 1, dtype=np.float32))
        down = np.full_like(x, 2)
        gated, output = P4.gated_residual(down, gate, x)
        np.testing.assert_array_equal(gated, np.full_like(x, -8))
        np.testing.assert_array_equal(output, np.add(x, -8, dtype=np.float32))

    def test_gelu_is_tanh_formula(self):
        x = np.array([-5., -1., 0., 1., 5.], dtype=np.float32)
        expected = [np.float32(.5 * float(v) * (1 + math.tanh(math.sqrt(2 / math.pi) * (float(v) + .044715 * float(v) ** 3)))) for v in x]
        np.testing.assert_array_equal(P4.gelu_tanh(x), expected)

    def test_native_text_payload_does_not_fabricate_identity_or_drop_mask(self):
        data = np.zeros((4, 4096), dtype=np.float32)
        payload = {'schemaVersion': 'bernini-p4-native-text-input/0.1', 'dtype': 'float32', 'layout': 'BLC', 'meaning': 'text_hidden_states', 'shape': [1, 4, 4096], 'data': data.reshape(-1).tolist(), 'attentionMask': [1, 1, 0, 1], 'producer': {'module': 'text_encoder', 'sourceCommit': 'a' * 40}, 'modelSha256': 'b' * 64, 'tokenizerSha256': None}
        x, mask, metadata = P4.validate_native_text(payload)
        self.assertEqual(x.shape, (4, 4096))
        self.assertEqual(mask.tolist(), [1, 1, 0, 1])
        self.assertIsNone(metadata['tokenizerSha256'])
        for field, value in [('meaning', 'latent'), ('dtype', 'float64'), ('shape', [1, 3, 4096]), ('attentionMask', [1, 1, 1])]:
            wrong = dict(payload, **{field: value})
            with self.assertRaises(ValueError):
                P4.validate_native_text(wrong)
        with self.assertRaises(ValueError):
            P4.validate_native_text(dict(payload, producer=None))

    def test_full_value_gate_and_private_write(self):
        gate = {'abs': .001, 'rel': .0001}
        result = P4.compare(np.array([0., 2.], dtype=np.float32), np.array([0., 2.], dtype=np.float32), gate)
        self.assertEqual(result['failed'], 0)
        result = P4.compare(np.array([.002, 2.], dtype=np.float32), np.array([0., 2.], dtype=np.float32), gate)
        self.assertEqual(result['failed'], 1)
        with tempfile.TemporaryDirectory(dir='/tmp') as tmp:
            path = Path(tmp) / 'reference.json'
            P4.private_write(path, {'expected': [1.]})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
            with self.assertRaises(ValueError):
                P4.private_write(path, {'expected': [2.]})

    def test_final_f32_patch_rows_and_base_passthrough(self):
        key = 'blocks.0.cross_attn.q.weight'
        data = np.full(5120, .125, dtype='<f4')
        block = {'weightId': key, 'offset': 5120, 'count': 5120, 'fullShape': [5120, 5120], 'binding': {'kind': 'runtime-input', 'name': key}, 'dtype': 'F32', 'sha256': P4.sha(data.tobytes()), 'data': data.tolist()}
        payload = {'schemaVersion': 'bernini-p4-final-f32-patches/0.1', 'side': 'HIGH', 'candidatePlanSHA256': P4.PLAN_SHA256, 'patches': [block]}
        patches, metadata = P4.validate_patches(payload, 'HIGH', P4.load_plan())
        values = np.arange(3 * 5120, dtype=np.float32)
        result = P4.apply_overrides(key, 0, values, patches)
        np.testing.assert_array_equal(result[:5120], values[:5120])
        np.testing.assert_array_equal(result[5120:10240], data)
        np.testing.assert_array_equal(result[10240:], values[10240:])
        self.assertEqual(metadata['inputClass'], 'caller-final-f32-feed-fixture')
        self.assertNotIn('data', metadata['patches'][0])
        for changes in ({'offset': 1}, {'count': 3}, {'sha256': '0' * 64}, {'binding': {'kind': 'hike-parameter', 'name': key}}, {'fullShape': [1, 5120]}):
            with self.assertRaises(ValueError):
                P4.validate_patches(dict(payload, patches=[dict(block, **changes)]), 'HIGH', P4.load_plan())
        with self.assertRaises(ValueError):
            P4.validate_patches(dict(payload, patches=[block, block]), 'HIGH', P4.load_plan())
        with self.assertRaises(ValueError):
            P4.validate_patches(payload, 'LOW', P4.load_plan())

    def test_runtime_cut_binding_covers_mask_fixture_and_native_file(self):
        base = {'savedArtifactSHA256': 'a' * 64, 'conditioningDataSHA256': 'b' * 64, 'conditioningMaskSHA256': 'c' * 64, 'fixtureContractSHA256': 'd' * 64}
        expected = P4.runtime_binding(base)
        self.assertEqual(expected, base)
        with self.assertRaises(ValueError):
            P4.runtime_binding({k: v for k, v in base.items() if k != 'conditioningMaskSHA256'})
        with self.assertRaises(ValueError):
            P4.runtime_binding({k: v for k, v in base.items() if k != 'fixtureContractSHA256'})
        native = {k: v for k, v in base.items() if k != 'fixtureContractSHA256'}
        native['nativeTextArtifactSHA256'] = 'e' * 64
        self.assertEqual(P4.runtime_binding(native), native)
        with self.assertRaises(ValueError):
            P4.runtime_binding(dict(native, fixtureContractSHA256='d' * 64))
        arrays = {key: [0.] * math.prod([4 if n == 'L' else n for n in shape]) for key, shape in P4.ARRAY_SHAPES.items()}
        with tempfile.TemporaryDirectory(dir='/tmp') as tmp:
            path = Path(tmp) / 'runtime.json'
            payload = {'schemaVersion': 'bernini-p4-runtime-arrays/0.1', 'side': 'HIGH', 'candidatePlanSHA256': P4.PLAN_SHA256, 'inputBindings': expected, 'arrays': arrays}
            path.write_text(json.dumps(payload))
            accepted, _ = P4.runtime_cuts(path, 'HIGH', 4, base)
            self.assertEqual(len(accepted), 25)
            for key in ('conditioningMaskSHA256', 'fixtureContractSHA256'):
                wrong = dict(expected, **{key: 'f' * 64})
                path.write_text(json.dumps(dict(payload, inputBindings=wrong)))
                with self.assertRaises(ValueError):
                    P4.runtime_cuts(path, 'HIGH', 4, base)

    def test_vector_chunk_decoder_receipts_match_runtime_keys(self):
        key = 'blocks.0.modulation'
        source = P4.Parameters.__new__(P4.Parameters)
        source.plan = {'parameters': {key: {'fullShape': [1, 6, 5120], 'storageDtype': 'F16', 'selectedElements': [15360, 30720]}}}
        raw = struct.pack('<15360H', *([0x3c00] * 5120 + [0x4000] * 5120 + [0x4200] * 5120))
        source.selection = lambda _: (1000, len(raw))
        source.read = lambda *_: raw
        source.sources, source.patches = {}, []
        source.vector(key)
        for index, offset in enumerate((15360, 20480, 25600)):
            entry = source.sources[key + ':' + str(offset)]
            self.assertEqual(entry['selectedElements'], [offset, offset + 5120])
            self.assertEqual(entry['rawSHA256'], P4.sha(raw[index * 10240:(index + 1) * 10240]))
            values = np.full(5120, index + 1, dtype='<f4')
            self.assertEqual(entry['decodedF32SHA256'], P4.sha(values.tobytes()))
            self.assertEqual(entry['finalF32SHA256'], entry['decodedF32SHA256'])


if __name__ == '__main__':
    unittest.main()
