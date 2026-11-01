"""Binary cut integrity and full-L512 pure-operation checks; no model reads."""
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest

import numpy as np

PATH = Path(__file__).with_name('run-reference.py')
SPEC = importlib.util.spec_from_file_location('real_text_reference', PATH)
RUN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUN)


class BinaryBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.oracle, cls.plan = RUN.PREPARE.load_oracle()

    def tiny_manifest(self, root):
        oracle = types.SimpleNamespace(
            ARRAY_SHAPES={'text': ['L', 1], 'block': [2, 2]},
            identity=self.oracle.identity,
        )
        arrays = {'text': np.zeros((512, 1), dtype='<f4'), 'block': np.zeros((2, 2), dtype='<f4')}
        arrays['text'][0] = -0.0
        descriptors, identities = RUN.save_arrays(root, arrays, oracle)
        return oracle, arrays, {'arrays': descriptors, 'outputIdentities': identities}

    def test_binary_transport_preserves_negative_zero_and_all_rows(self):
        with tempfile.TemporaryDirectory(dir='/tmp') as tmp:
            root = Path(tmp)
            oracle, arrays, manifest = self.tiny_manifest(root)
            admitted = RUN.load_binary_arrays(root / 'manifest.json', manifest, oracle)
            self.assertEqual(admitted['text'].shape, (512, 1))
            self.assertEqual(admitted['text'].tobytes(), arrays['text'].tobytes())
            self.assertTrue(np.signbit(admitted['text'][0, 0]))
            self.assertEqual((root / 'text.f32').stat().st_mode & 0o777, 0o600)
            self.assertEqual(root.stat().st_mode & 0o777, 0o700)

    def test_corrupted_binary_hash_and_shape_rejected(self):
        with tempfile.TemporaryDirectory(dir='/tmp') as tmp:
            root = Path(tmp)
            oracle, _, manifest = self.tiny_manifest(root)
            for field, value in [('path', '../text.f32'), ('shape', [511, 1]), ('dtype', 'float64'), ('sha256', '0' * 64)]:
                wrong = json.loads(json.dumps(manifest))
                wrong['arrays']['text'][field] = value
                with self.subTest(field=field), self.assertRaises(ValueError):
                    RUN.load_binary_arrays(root / 'manifest.json', wrong, oracle)
            raw = bytearray((root / 'text.f32').read_bytes()); raw[0] ^= 1
            (root / 'text.f32').write_bytes(raw)
            with self.assertRaisesRegex(ValueError, 'SHA256'):
                RUN.load_binary_arrays(root / 'manifest.json', manifest, oracle)

    def test_real512_attention_includes_every_value_and_all40_heads(self):
        q = np.zeros((2, 5120), dtype='<f4')
        k = np.zeros((512, 5120), dtype='<f4')
        v = np.zeros((512, 5120), dtype='<f4')
        v[511] = np.arange(5120, dtype='<f4') + 1
        actual = self.oracle.all_head_attention(q, k, v)
        expected = np.repeat((v[511] / np.float32(512))[None, :], 2, axis=0)
        self.assertEqual(actual.tobytes(), expected.tobytes())
        self.assertNotEqual(actual[:, 39 * 128:].tobytes(), bytes(2 * 128 * 4))

    def test_runtime_native_input_and_output_hash_mutations_rejected(self):
        with tempfile.TemporaryDirectory(dir='/tmp') as tmp:
            root = Path(tmp)
            tiny, _, manifest = self.tiny_manifest(root)
            oracle = types.SimpleNamespace(**vars(tiny), PLAN_SHA256=self.oracle.PLAN_SHA256, read_json=self.oracle.read_json)
            bindings = {'savedArtifactSHA256': 'a' * 64, 'conditioningDataSHA256': 'b' * 64, 'conditioningMaskSHA256': 'c' * 64, 'nativeTextArtifactSHA256': 'd' * 64}
            case = self.plan['cases']['HIGH']
            manifest.update(
                schemaVersion='bernini-p4-real-text-l512-runtime/0.1', side='HIGH',
                candidatePlanSHA256=oracle.PLAN_SHA256, inputBindings=bindings,
                evidence={
                    'schemaVersion': 'bernini-post-self-attention-evidence/0.1',
                    'executionProfileId': self.plan['profileId'], 'side': 'HIGH',
                    'inputHashes': {'residualSHA256': case['residualSHA256'], 'timeAct1SHA256': case['timeAct1SHA256'], 'conditioningSHA256': bindings['conditioningDataSHA256'], 'conditioningMaskSHA256': bindings['conditioningMaskSHA256']},
                    'outputHashes': {key + 'SHA256': value['sha256'] for key, value in manifest['outputIdentities'].items()},
                },
            )
            path = root / 'manifest.json'
            path.write_text(json.dumps(manifest))
            admitted, _, _ = RUN.runtime_cuts(path, 'HIGH', oracle, self.plan, bindings)
            self.assertEqual(set(admitted), {'text', 'block'})
            for category, key in [('inputBindings', 'nativeTextArtifactSHA256'), ('inputBindings', 'conditioningMaskSHA256'), ('inputHashes', 'conditioningSHA256'), ('outputHashes', 'textSHA256')]:
                wrong = json.loads(json.dumps(manifest))
                target = wrong[category] if category == 'inputBindings' else wrong['evidence'][category]
                target[key] = 'f' * 64
                path.write_text(json.dumps(wrong))
                with self.subTest(category=category, key=key), self.assertRaises(ValueError):
                    RUN.runtime_cuts(path, 'HIGH', oracle, self.plan, bindings)

    def test_concrete_contract_has25_fullwidth_arrays_and_unchanged_gates(self):
        shapes = RUN.concrete_shapes(self.oracle)
        self.assertEqual(len(shapes), 25)
        for name in ('textLinear0', 'textGelu', 'textEmbedded', 'qkvK', 'qkvV', 'normK'):
            self.assertEqual(shapes[name], [512, 5120])
        self.assertEqual(shapes['ffnUp'], [2, 13824])
        self.assertEqual(shapes['ffnGelu'], [2, 13824])
        self.assertEqual(shapes['blockOutput'], [2, 5120])
        self.assertEqual(self.plan['gates']['localCut'], {'abs': .001, 'rel': .0001})
        self.assertEqual(self.plan['gates']['composed'], {'abs': .01, 'rel': .001})


if __name__ == '__main__':
    unittest.main()
