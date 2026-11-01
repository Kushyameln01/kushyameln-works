"""Synthetic boundaries for the independent tail oracle; no model or private arrays.

The rounding witness distinguishes a separated F32 multiply/add from a fused
expression. The zero-gate witness distinguishes the original patch residual
from attention or post-modulation hidden, and detects an erroneous scale+one.
"""
import importlib.util
import math
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
import numpy as np

ROOT = Path(__file__).resolve().parents[4]
SPEC = importlib.util.spec_from_file_location(
    'tail_reference', ROOT / 'tools/diffusion-models/tail-reference.py')
ORACLE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ORACLE)
SHAPE = (2, 5120)
F32 = np.float32
REJECTION = (ValueError, AssertionError)


class IndependentTailBoundaryTests(unittest.TestCase):
    def test_finite_array_admission_rejects_missing_extra_and_nonfinite(self):
        admitted = ORACLE.f32_array([0.0] * 10240, SHAPE, 'attention')
        self.assertEqual(admitted.shape, SHAPE)
        self.assertEqual(admitted.dtype, np.dtype('<f4'))
        for count in (10239, 10241):
            with self.subTest(count=count), self.assertRaises(REJECTION):
                ORACLE.f32_array([0.0] * count, SHAPE, 'attention')
        for shape in ((1, 10240), (5120, 2)):
            with self.subTest(shape=shape), self.assertRaises(REJECTION):
                ORACLE.f32_array(np.zeros(shape, dtype='<f4'), SHAPE, 'attention')
        for value in (math.nan, math.inf, -math.inf):
            values = np.zeros(SHAPE, dtype='<f4')
            values[1, 5119] = value
            with self.subTest(value=value), self.assertRaises(REJECTION):
                ORACLE.f32_array(values, SHAPE, 'attention')

    def test_zero_chunk2_gate_preserves_patch_basis_without_scale_plus_one(self):
        o = np.full(SHAPE, 9.0, dtype='<f4')
        patch = np.full(SHAPE, 3.0, dtype='<f4')
        patch[1] = -5.0
        projection = np.full(5120, 0.25, dtype='<f4')
        modulation = np.full(5120, -0.25, dtype='<f4')
        output = ORACLE.finish_tail(o, projection, modulation, patch)
        self.assertEqual(output['gate'].tobytes(), np.zeros(5120, dtype='<f4').tobytes())
        self.assertTrue(np.all(output['gated'] == 0))
        self.assertEqual(output['residual'].tobytes(), patch.tobytes())
        self.assertFalse(np.array_equal(output['residual'], o))

    def test_channel_gate_broadcasts_over_both_natural_tokens(self):
        o = np.ones(SHAPE, dtype='<f4')
        o[1] = -2.0
        projection = np.zeros(5120, dtype='<f4')
        modulation = np.zeros(5120, dtype='<f4')
        modulation[0], modulation[5119] = 0.5, -4.0
        patch = np.zeros(SHAPE, dtype='<f4')
        patch[:, 0] = (10.0, 20.0)
        output = ORACLE.finish_tail(o, projection, modulation, patch)
        self.assertEqual(output['gated'][0, 0], F32(0.5))
        self.assertEqual(output['gated'][1, 0], F32(-1))
        self.assertEqual(output['gated'][0, 5119], F32(-4))
        self.assertEqual(output['gated'][1, 5119], F32(8))
        self.assertEqual(output['residual'][0, 0], F32(10.5))
        self.assertEqual(output['residual'][1, 0], F32(19))
        self.assertTrue(np.all(output['gated'][:, 1:5119] == 0))

    def test_product_is_rounded_before_residual_addition(self):
        # (1+2^-23)*(1-2^-23) = 1-2^-46 exactly. F32 multiplication
        # rounds this to 1 before adding -1; fused arithmetic retains -2^-46.
        a, b = F32(1 + 2**-23), F32(1 - 2**-23)
        o = np.full(SHAPE, a, dtype='<f4')
        projection = np.full(5120, b, dtype='<f4')
        modulation = np.zeros(5120, dtype='<f4')
        patch = np.full(SHAPE, -1.0, dtype='<f4')
        output = ORACLE.finish_tail(o, projection, modulation, patch)
        fused_witness = F32(float(a) * float(b) - 1.0)
        self.assertEqual(fused_witness, F32(-2**-46))
        self.assertNotEqual(fused_witness, F32(0))
        self.assertTrue(np.all(output['gated'] == F32(1)))
        self.assertEqual(output['residual'].tobytes(), np.zeros(SHAPE, dtype='<f4').tobytes())

    def test_pointwise_boundaries_reject_unsafe_or_nonfinite_values(self):
        for field in ('o', 'gate', 'patch'):
            # Nearest F32(1e16) is 10000000272564224, already outside the
            # exact float64 literal contract despite NumPy weak-scalar casts.
            for bad in (F32(1e16), F32(-1e16), F32(1.01e16), F32(-1.01e16), math.nan, math.inf):
                o = np.zeros(SHAPE, dtype='<f4')
                projection = np.zeros(5120, dtype='<f4')
                modulation = np.zeros(5120, dtype='<f4')
                patch = np.zeros(SHAPE, dtype='<f4')
                {'o': o, 'gate': projection, 'patch': patch}[field].flat[-1] = bad
                with self.subTest(field=field, bad=bad), self.assertRaises(REJECTION):
                    ORACLE.finish_tail(o, projection, modulation, patch)

    def test_representable_pointwise_value_below_bound_is_admitted(self):
        safe = np.nextafter(F32(1e16), F32(0))
        self.assertLess(float(safe), 1e16)
        o = np.full(SHAPE, safe, dtype='<f4')
        projection = np.ones(5120, dtype='<f4')
        modulation = np.zeros(5120, dtype='<f4')
        patch = np.full(SHAPE, -safe, dtype='<f4')
        output = ORACLE.finish_tail(o, projection, modulation, patch)
        self.assertTrue(np.all(output['residual'] == 0))

    def test_success_boolean_does_not_authenticate_context_receipt(self):
        context = {'attention': [0] * 10240}
        receipt = {'passed': True, 'side': 'HIGH'}
        with patch.object(ORACLE, 'read_json', side_effect=[(context, 'a' * 64), (receipt, 'b' * 64)]):
            with self.assertRaisesRegex(ValueError, 'Unknown actual context receipt'):
                ORACLE.actual_attention('HIGH', Path('context'), Path('receipt'), {})

    def test_self_consistent_composed_receipt_substitution_is_rejected(self):
        producer = {'passed': True, 'side': 'HIGH', 'artifactSHA256': 'actual', 'referenceSHA256': 'prefix'}
        heads = {'inputArtifactSHA256': 'prefix'}
        forged_receipt = {'referenceSHA256': 'forged-heads'}
        answers = [({}, 'actual'), ({}, 'prefix'), (heads, 'forged-heads'),
                   (producer, ORACLE.PREFIX_RECEIPTS['HIGH']),
                   (forged_receipt, 'c' * 64)]
        with patch.object(ORACLE, 'read_json', side_effect=answers):
            with self.assertRaisesRegex(ValueError, 'Unknown independent composed-head receipt'):
                ORACLE.prefix_inputs('HIGH', Path('actual'), Path('prefix'), Path('heads'))

    def test_e4m3fn_decoder_preserves_storage_special_cases(self):
        known = {0x00: 0.0, 0x01: 2**-9, 0x38: 1.0, 0x40: 2.0,
                 0x7E: 448.0, 0x81: -(2**-9), 0xB8: -1.0, 0xFE: -448.0}
        for bits, expected in known.items():
            with self.subTest(bits=bits):
                self.assertEqual(ORACLE.decode_e4m3fn(bits), expected)
        self.assertEqual(math.copysign(1, ORACLE.decode_e4m3fn(0x80)), -1)
        self.assertTrue(math.isnan(ORACLE.decode_e4m3fn(0x7F)))
        self.assertTrue(math.isnan(ORACLE.decode_e4m3fn(0xFF)))
        self.assertEqual(sum(math.isfinite(ORACLE.decode_e4m3fn(i)) for i in range(256)), 254)

    def test_chunk2_offsets_preserve_original_full_descriptor(self):
        weight = {'dtype': 'F16', 'shape': [30720, 5120],
                  'data_offsets': [2257727008, 2572299808]}
        selected = ORACLE.select_offset(weight, 'time_projection.1.weight',
                                        [30720, 5120], 'F16', row_start=10240, rows=5120)
        self.assertEqual(selected, (2362584608, 52428800))
        bias = {'dtype': 'F16', 'shape': [30720],
                'data_offsets': [2257665568, 2257727008]}
        selected = ORACLE.select_offset(bias, 'time_projection.1.bias',
                                        [30720], 'F16', element_offset=10240, count=5120)
        self.assertEqual(selected, (2257686048, 10240))
        modulation = {'dtype': 'F16', 'shape': [1, 6, 5120],
                      'data_offsets': [52529568, 52591008]}
        selected = ORACLE.select_offset(modulation, 'blocks.0.modulation',
                                        [1, 6, 5120], 'F16', element_offset=10240, count=5120)
        self.assertEqual(selected, (52550048, 10240))
        failures = [
            (weight, [5120, 5120], 'F16', {'row_start': 10240, 'rows': 5120}),
            (weight, [30720, 5120], 'F8_E4M3', {'row_start': 10240, 'rows': 5120}),
            (weight, [30720, 5120], 'F16', {'row_start': 30704, 'rows': 32}),
            (weight, [30720, 5120], 'F16', {'row_start': -16, 'rows': 16}),
            (weight, [30720, 5120], 'F16', {'row_start': 10240, 'rows': 5120, 'count': 5120}),
            ({**weight, 'data_offsets': [2257727008, 2572299806]},
             [30720, 5120], 'F16', {'row_start': 10240, 'rows': 5120}),
            (bias, [30720], 'F16', {'element_offset': 30000, 'count': 5120}),
        ]
        for descriptor, shape, dtype, kwargs in failures:
            with self.subTest(descriptor=descriptor, kwargs=kwargs), self.assertRaises(REJECTION):
                ORACLE.select_offset(descriptor, 'synthetic-invalid', shape, dtype, **kwargs)

    def test_frozen_plan_rejects_even_semantically_irrelevant_byte_change(self):
        source = ORACLE.PLAN.read_bytes()
        with tempfile.TemporaryDirectory(prefix='tail-plan-pin-') as folder:
            altered = Path(folder) / 'altered-plan.json'
            altered.write_bytes(source + b' ')
            with patch.object(ORACLE, 'PLAN', altered), self.assertRaises(REJECTION):
                ORACLE.load_plan()


if __name__ == '__main__':
    unittest.main(verbosity=2)
