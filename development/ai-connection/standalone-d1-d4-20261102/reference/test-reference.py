"""Analytic/format checks only. Running these does not execute a model block."""
import importlib.util
import json
import math
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[4]
SPEC = importlib.util.spec_from_file_location('standalone_reference', ROOT / 'tools/diffusion-models/standalone-reference.py')
reference = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(reference)


class NumericalContract(unittest.TestCase):
    def test_e4m3fn_analytic_codes_and_own_scale(self):
        expected = {0: 0, 1: 2**-9, 7: 7*2**-9, 8: 2**-6, 56: 1, 64: 2, 126: 448, 128: -0.0, 184: -1, 254: -448}
        for code, value in expected.items():
            self.assertEqual(reference.decode_e4m3fn(code), value)
        self.assertTrue(math.isnan(reference.decode_e4m3fn(127)))
        self.assertTrue(math.isnan(reference.decode_e4m3fn(255)))
        np.testing.assert_array_equal(reference.decode(bytes([56, 184, 126]), 'F8_E4M3', np.float32(.25)), [.25, -.25, 112])
        with self.assertRaises(ValueError):
            reference.decode(bytes([127]), 'F8_E4M3', np.float32(1))
        for scale in (0, -1, math.inf, math.nan):
            with self.assertRaises(ValueError):
                reference.decode(bytes([56]), 'F8_E4M3', scale)

    def test_binary16_endian_subnormal_and_signed_zero(self):
        codes = np.asarray([0, 32768, 1, 15360, 49152, 31743], dtype='<u2')
        values = reference.decode(codes.tobytes(), 'F16')
        np.testing.assert_array_equal(values, [0, -0.0, 2**-24, 1, -2, 65504])
        self.assertTrue(np.signbit(values[1]))
        with self.assertRaises(ValueError):
            reference.decode(b'\x00\x7c', 'F16')

    def test_norms_reduce_full_feature_width(self):
        x = np.asarray([[1, 3, 1, 3]], dtype='<f4')
        expected = np.asarray([[-1, 1, -1, 1]], dtype='<f4') / np.float32(math.sqrt(1 + 1e-6))
        np.testing.assert_allclose(reference.layer_norm(x), expected, atol=1e-7, rtol=0)
        np.testing.assert_array_equal(reference.layer_norm(np.ones((2, 5120), dtype='<f4')), np.zeros((2, 5120), dtype='<f4'))
        expected_rms = np.asarray([[1, 3, 1, 3]], dtype=np.float64) / math.sqrt(5 + 1e-6)
        np.testing.assert_array_equal(reference.rms_norm(x, np.ones(4, dtype='<f4')), expected_rms.astype('<f4'))
        affine = reference.layer_norm(x, np.asarray([2, 2, 2, 2], dtype='<f4'), np.asarray([3, 3, 3, 3], dtype='<f4'))
        np.testing.assert_array_equal(affine, np.add(np.multiply(reference.layer_norm(x), np.float32(2), dtype=np.float32), np.float32(3), dtype=np.float32))

    def test_modulation_and_gates_use_source_chunks_without_gate_plus_one(self):
        normalized = np.asarray([[2, -2]], dtype='<f4')
        np.testing.assert_array_equal(reference.modulate(normalized, [3, 4], [.5, -1]), [[6, 4]])
        np.testing.assert_array_equal(reference.gate_residual([[1, 2]], [[3, 4]], [0, -2]), [[1, -6]])
        np.testing.assert_array_equal(reference.silu(np.zeros(3, dtype='<f4')), [0, 0, 0])
        np.testing.assert_array_equal(reference.gelu(np.zeros(3, dtype='<f4')), [0, 0, 0])
        self.assertTrue(np.isfinite(reference.silu([-10000, 10000])).all())

    def test_time_sinusoid_order_and_zero(self):
        zero = reference.sinusoidal(0)
        np.testing.assert_array_equal(zero[:, :128], np.ones((1, 128), dtype='<f4'))
        np.testing.assert_array_equal(zero[:, 128:], np.zeros((1, 128), dtype='<f4'))
        value = reference.sinusoidal(750)
        self.assertEqual(value[0, 0], np.float32(math.cos(750)))
        self.assertEqual(value[0, 128], np.float32(math.sin(750)))
        for invalid in (-1, 1001, math.inf):
            with self.assertRaises(ValueError):
                reference.sinusoidal(invalid)

    def test_attention_all40_heads_global_keys_and_no_mask_application(self):
        q = np.zeros((2, 5120), dtype='<f4')
        k = np.zeros((3, 5120), dtype='<f4')
        v = np.empty((3, 5120), dtype='<f4')
        v[0], v[1], v[2] = 1, 5, 12
        # The nonzero middle key is retained even when a fixture labels mask0.
        np.testing.assert_array_equal(reference.attention(q, k, v), np.full((2, 5120), 6, dtype='<f4'))
        v[:, -1] = [2, 7, 21]
        result = reference.attention(q, k, v)
        self.assertEqual(result[0, -1], np.float32(10))
        self.assertEqual(result[1, 0], np.float32(6))

    def test_rope_identity_and_independent_source_id_rotation(self):
        positions = np.zeros((2, 3), dtype='<f4')
        rotations = reference.rotation_matrices(positions, [0, 1])
        np.testing.assert_array_equal(rotations[0], np.broadcast_to(np.eye(2, dtype='<f4'), (64, 2, 2)))
        vector = np.zeros((2, 5120), dtype='<f4')
        vector[:, ::2] = 1
        transformed = reference.apply_rope(vector, rotations)
        np.testing.assert_array_equal(transformed[0], vector[0])
        self.assertEqual(transformed[1, 0], np.float32(math.cos(1)))
        self.assertEqual(transformed[1, 1], np.float32(math.sin(1)))
        np.testing.assert_array_equal(transformed[1, :128], transformed[1, -128:])
        self.assertNotEqual(transformed[1, 2], transformed[1, 0])

    def test_patch_channel_order_and_pixel_last_head_unpatch(self):
        data = np.arange(128, dtype='<f4').reshape(1, 16, 1, 2, 4)
        patches, positions, ids = reference.patch_rows([{'shape': list(data.shape), 'data': data.reshape(-1)}])
        np.testing.assert_array_equal(patches[0, :8], [0, 1, 4, 5, 8, 9, 12, 13])
        np.testing.assert_array_equal(patches[1, :4], [2, 3, 6, 7])
        np.testing.assert_array_equal(positions, [[0, 0, 0], [0, 0, 1]])
        self.assertEqual(ids, [0, 0])
        pixel_last = patches.reshape(2, 16, 1, 2, 2).transpose(0, 2, 3, 4, 1).reshape(2, 64)
        context_tail = np.full((3, 64), -123, dtype='<f4')
        np.testing.assert_array_equal(reference.unpatch_target(np.concatenate([pixel_last, context_tail]), list(data.shape)), data)

    def test_fixture_is_explicit_n5_l3_and_all_nonzero_rows_are_admitted(self):
        fixture = reference.controlled_fixture()
        patches, positions, ids = reference.patch_rows(fixture['tensors'])
        self.assertEqual(patches.shape, (5, 64))
        self.assertEqual(ids, [0, 0, 1, 1, 2])
        np.testing.assert_array_equal(positions, [[0, 0, 0], [0, 0, 1], [0, 0, 0], [0, 0, 1], [0, 0, 0]])
        self.assertEqual(fixture['conditioning']['shape'], [1, 3, 4096])
        self.assertEqual(fixture['conditioning']['attentionMask'], [1, 1, 1])
        self.assertTrue(np.any(np.asarray(fixture['conditioning']['data']).reshape(3, 4096)[1]))
        self.assertFalse(fixture['producerVerified'])
        mean = reference.f32(fixture['construction']['controlledRawMean'])
        noise = reference.f32(fixture['construction']['explicitNoise'])
        np.testing.assert_array_equal(reference.f32(fixture['tensors'][0]['data']), np.add(mean, np.multiply(noise, np.float32(.75), dtype=np.float32), dtype=np.float32))

    def test_fixed_native_trace_population_and_private_tmp_directory(self):
        shapes = reference.trace_shapes()
        self.assertEqual(len(shapes), 47)
        self.assertEqual(shapes['block39Output'], [1, 5, 5120])
        self.assertEqual(shapes['headAll'], [1, 5, 64])
        self.assertEqual(shapes['prediction'], [1, 16, 1, 2, 4])
        with self.assertRaises(ValueError):
            reference.private_write(Path('/tmp/standalone-reference-disallowed-parent.json'), {})

    def test_comparison_uses_composed_absolute_plus_relative_per_value(self):
        result = reference.compare_arrays([.009, 100.109, 2], [0, 100, 0])
        self.assertEqual(result['failed'], 1)
        self.assertEqual(result['elements'], 3)
        self.assertEqual(result['gate'], {'abs': .01, 'rel': .001})
        self.assertEqual(reference.compare_arrays([0], [0])['failed'], 0)
        with self.assertRaises(ValueError):
            reference.compare_arrays([0, 1], [0])

    def test_saved_comparison_rejects_truncated_pair_even_with_matching_receipt(self):
        contract, contract_hash = reference.read_json(reference.EVIDENCE / 'contract.json')
        bindings = {'profileId': reference.PROFILE, 'side': 'HIGH', 'fixtureSHA256': contract['fixtureSHA256'], 'contractSHA256': contract_hash, 'coreSourceSHA256': reference.CORE_SHA256, 'previouslyVerifiedModelSHA256': reference.MODELS['HIGH'][1], 'headerSHA256': reference.MODELS['HIGH'][2], 'gate': reference.GATE}
        truncated = {'schemaVersion': 'bernini-standalone-full40-reference/0.1', **bindings, 'arrays': {}, 'arrayIdentities': {}}
        with tempfile.TemporaryDirectory(prefix='standalone-reference-comparison-test-') as directory:
            folder = Path(directory)
            expected_path, receipt_path, actual_path = (folder / name for name in ('expected.json', 'receipt.json', 'actual.json'))
            expected_path.write_text(json.dumps(truncated))
            receipt_path.write_text(json.dumps({'schemaVersion': 'bernini-standalone-full40-reference-receipt/0.1', **bindings, 'referenceSHA256': reference.sha(expected_path.read_bytes()), 'referenceBytes': expected_path.stat().st_size, 'arrayIdentities': {}}))
            actual_path.write_text(json.dumps({**bindings, 'arrays': {}}))
            args = SimpleNamespace(reference=expected_path, reference_receipt=receipt_path, contract=reference.EVIDENCE / 'contract.json', candidate=actual_path, output=folder / 'result.json')
            with self.assertRaisesRegex(ValueError, 'fixed47'):
                reference.compare_saved(args)
            self.assertFalse(args.output.exists())

    def test_frozen_contract_matches_exact_fixture_and_core_without_inference(self):
        fixture, contract, _ = reference.load_fixture(Path('/workspace/work/diffusion-private-hidden/standalone-n5-l3-input.json'), reference.EVIDENCE / 'contract.json')
        self.assertEqual(contract['traceShapes'], reference.trace_shapes())
        self.assertEqual(contract['gate'], {'abs': .01, 'rel': .001})
        self.assertFalse(contract['scope']['required81FrameWorkflowVerified'])
        self.assertEqual(fixture['conditioning']['attentionMask'], [1, 1, 1])


class OriginalHeadersOnly(unittest.TestCase):
    def test_exact_full40_registry_and_small_original_scale_profile(self):
        self.assertEqual(len(reference.expected_specs()), 1815)
        for side, model in reference.MODELS.items():
            source = reference.Parameters(Path('/workspace/work/retained/bernini') / model[0], side)
            try:
                self.assertEqual(source.header['blocks.39.ffn.2.weight']['shape'], [5120, 13824])
                self.assertEqual(source.header['head.head.weight']['shape'], [64, 5120])
                scale = source.scale('blocks.0.self_attn.q.weight')
                self.assertTrue(np.isfinite(scale) and scale > 0)
                vector = source.whole_small('head.head.bias')
                self.assertEqual(vector.shape, (64,))
                self.assertEqual(source.tiles, 0)
                self.assertLess(source.payload_read, 1024)
                self.assertEqual(source.total_read, 8 + reference.HEADER_BYTES + source.payload_read)
            finally:
                source.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
