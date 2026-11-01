"""Owner math, sparse coordinates and byte-overlay tests; no original model reads."""
import importlib.util
from pathlib import Path
import tempfile
import types
import unittest

import numpy as np

PATH = Path(__file__).with_name('lora-reference.py')
SPEC = importlib.util.spec_from_file_location('real_l512_lora_reference', PATH)
REF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REF)


class LoraReferenceBoundaries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.owner, cls.transport = REF.modules()
        cls.core, cls.plan = cls.transport.PREPARE.load_oracle()

    def test_owner_independent_math_is_imported_and_f64_weight_f32_bias(self):
        down = np.array([[1, 2, 3], [4, 5, 6]], dtype='<f4')
        up = np.array([[1, 2], [3, 4]], dtype='<f4')
        base = np.zeros((2, 3), dtype='<f4')
        result = self.owner.merge_reference(base, down, up, 1, 2)
        self.assertEqual(result.dtype, np.dtype('float64'))
        np.testing.assert_array_equal(result, np.array([[9, 12, 15], [19, 26, 33]], dtype=np.float64))
        bias = self.owner.bias_reference(np.array([1, 2], dtype='<f4'), np.array([.25, -.5], dtype='<f4'), 1)
        self.assertEqual(bias.dtype, np.dtype('<f4'))
        self.assertEqual(bias.tobytes(), np.array([1.25, 1.5], dtype='<f4').tobytes())
        self.assertEqual(REF.STRENGTH, 1)

    def test_A_sparse_patch_has_original_fullshape_and_exact_selected_ranges(self):
        weight = np.full((4, 5120), .125, dtype=np.float64)
        weight[0, 0] = -0.0
        bias = np.full(4, .25, dtype='<f4')
        payload = REF.patch_payload(self.owner, weight, bias, self.core.PLAN_SHA256)
        patches, _ = self.core.validate_patches(payload, 'LOW', self.plan)
        self.assertEqual([(p['key'], p['offset'], p['count']) for p in patches], [(self.owner.WEIGHT_ID, 0, 20480), (self.owner.BIAS_ID, 0, 4)])
        self.assertTrue(np.signbit(patches[0]['data'][0]))
        self.assertEqual(payload['patches'][0]['fullShape'], [5120, 5120])
        self.assertEqual(payload['patches'][1]['fullShape'], [5120])

    def test_actual_A_numeric_gate_does_not_assume_rounded_bit_equality(self):
        expected = np.array([1.00000001, -2.00000001], dtype=np.float64)
        actual = expected.astype('<f4')
        self.assertEqual(REF.a_comparison(actual, expected, self.owner.GATES['weight'])['failed'], 0)
        self.assertEqual(REF.a_comparison(actual + np.float32(.1), expected, self.owner.GATES['weight'])['failed'], 2)
        self.assertEqual(REF.a_comparison(np.array([1.], dtype='<f4'), np.array([1.0001]), self.owner.GATES['bias'])['failed'], 1)

    def test_streamed_SDK_overlay_uses_all_original_columns_and_preserves_unpatched_rows(self):
        key = self.owner.WEIGHT_ID
        raw = bytes([56] * 8 + [184] * 8)
        original = self.core.decode_fp8(raw, np.float32(.5))
        replacement = np.array([-0., 3., 4., 5.], dtype='<f4')
        patches = [{'key': key, 'offset': 0, 'count': 4, 'data': replacement}]
        source = types.SimpleNamespace(plan={'parameters': {key: {'fullShape': [4, 4], 'selectedRows': [0, 4], 'tileRows': 2}}}, scales={key: np.float32(.5)}, selection=lambda _: (100, 16), read=lambda offset, count: raw[offset - 100:offset - 100 + count])
        result = REF.streamed_weight_overlay(self.core, source, key, patches, {})
        expected = original.copy(); expected[:4] = replacement
        self.assertEqual(result['rawSHA256'], self.owner.sha(raw))
        self.assertEqual(result['decodedF32SHA256'], self.owner.sha(original.tobytes()))
        self.assertEqual(result['finalF32SHA256'], self.owner.sha(expected.tobytes()))
        self.assertNotEqual(result['finalF32SHA256'], result['decodedF32SHA256'])

    def test_immutable_original_proof_rejects_raw_decoded_or_selection_changes(self):
        record = {'originalKey': 'q', 'fullShape': [4, 4], 'storageDtype': 'F8_E4M3', 'absoluteByteOffset': 100, 'selectedRawBytes': 16, 'rawSHA256': 'a' * 64, 'decodedF32SHA256': 'b' * 64, 'finalF32SHA256': 'c' * 64}
        baseline = {'q': record}
        changed = {'q': dict(record, finalF32SHA256='d' * 64)}
        self.assertTrue(REF.immutable_source_proof(changed, baseline)['allImmutableOriginalRawAndDecodedIdentitiesEqual'])
        for field in ('rawSHA256', 'decodedF32SHA256', 'absoluteByteOffset', 'selectedRawBytes'):
            with self.subTest(field=field), self.assertRaises(ValueError):
                REF.immutable_source_proof({'q': dict(record, **{field: 'changed'})}, baseline)

    def test_real_input_binding_reuses_all512_rows_and_actual_LOW3_saved_bits(self):
        _, plan, inputs, text, bindings, _ = self.transport.load_inputs('LOW', REF.NATIVE_TEXT, REF.SAVED_TAIL)
        self.assertEqual(text.shape, (512, 4096))
        self.assertEqual(self.core.identity(inputs['residual'])['sha256'], plan['cases']['LOW']['residualSHA256'])
        self.assertEqual(self.core.identity(inputs['timeAct1'])['sha256'], plan['cases']['LOW']['timeAct1SHA256'])
        self.assertEqual(bindings['nativeTextArtifactSHA256'], self.transport.NATIVE_SHA256)
        self.assertEqual(self.owner.GATES['projection'], {'absolute': .01, 'relative': .001})


if __name__ == '__main__':
    unittest.main()
