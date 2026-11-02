"""Tiny-file prefix derivation contracts; no model, Torch, ONNX or WASM."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent


def load_tool():
    spec = importlib.util.spec_from_file_location('derive_stream_prefix', ROOT / 'derive_stream_prefix.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PrefixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tool = load_tool()

    def test_prefix_repackages_time_inside_every_channel(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            values = list(range(60))
            source = root / 'parent.f32'
            source.write_bytes(struct.pack('<60f', *values))
            target = root / 'prefix.f32'
            result = self.tool.extract_axis2(source, [1, 2, 5, 2, 3], target, [1, 2, 2, 2, 3])
            expected = values[:12] + values[30:42]
            self.assertEqual(target.read_bytes(), struct.pack('<24f', *expected))
            self.assertNotEqual(target.read_bytes(), source.read_bytes()[:96])
            self.assertEqual(result['shape'], [1, 2, 2, 2, 3])
            self.assertEqual(result['sha256'], hashlib.sha256(target.read_bytes()).hexdigest())
            self.assertEqual(result['derivation']['axis'], 2)
            self.assertEqual(result['derivation']['channels'][1]['sourceOffsetBytes'], 120)

    def test_spatial_crop_extension_and_flattened_prefix_are_not_allowed(self):
        for shape in ([1, 2, 2, 1, 3], [1, 2, 6, 2, 3], [1, 1, 2, 2, 3], [2, 2, 2, 2, 3]):
            with self.assertRaises(ValueError):
                self.tool.axis2_ranges([1, 2, 5, 2, 3], shape)

    def test_incomplete_source_tails_keep_literal_input_frames(self):
        for frames, latent, consumed in [(4, 1, 1), (80, 20, 77)]:
            case = self.tool.case_by_id(f'source-f{frames}-480x832')
            self.assertEqual(case['rgbShape'][2], frames)
            self.assertEqual(case['latentShape'][2], latent)
            self.assertEqual(case['decodeRgbShape'][2], consumed)
            self.assertEqual(self.tool.frame_contract(frames)['ignoredTailFrames'], 3)

    def test_f1_bridge_compares_every_channel_and_the_last_element(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            parent = root / 'parent.f32'
            parent.write_bytes(struct.pack('<60f', *[x / 256 for x in range(60)]))
            direct = root / 'direct.f32'
            selected = [x / 256 for x in list(range(6)) + list(range(30, 36))]
            direct.write_bytes(struct.pack('<12f', *selected))
            result = self.tool.compare_prefix(parent, [1, 2, 5, 2, 3], direct, [1, 2, 1, 2, 3], self.tool.COMPARISON_GATE)
            self.assertTrue(result['passed'])
            self.assertEqual(result['elements'], 12)
            selected[-1] += .01
            direct.write_bytes(struct.pack('<12f', *selected))
            result = self.tool.compare_prefix(parent, [1, 2, 5, 2, 3], direct, [1, 2, 1, 2, 3], self.tool.COMPARISON_GATE)
            self.assertFalse(result['passed'])
            self.assertEqual(result['firstFailedElement'], 11)

    def test_partial_or_unpinned_parent_report_is_rejected_before_tensor_access(self):
        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch) / 'reference-report.json'
            path.write_text(json.dumps({'status': 'RUNNING'}))
            with self.assertRaisesRegex(ValueError, 'SHA256'):
                self.tool.read_accepted_report(path.parent, '0' * 64)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError, 'completed'):
                self.tool.read_accepted_report(path.parent, digest)

    def test_native_report_metadata_requires_pinned_source_model_and_declared_pattern(self):
        plan = self.tool.load_plan()
        case = self.tool.case_by_id('target-f81-480x832')
        report = {'status': 'REFERENCE_WRITTEN', 'case': case,
                  'comparisonGate': self.tool.COMPARISON_GATE,
                  'model': {'sha256': self.tool.MODEL_SHA256, 'verified': True, 'executionDtype': 'float32'},
                  'source': {'sha256': self.tool.SOURCE_SHA256, 'commit': self.tool.SOURCE_COMMIT, 'verified': True},
                  'strictLoad': {'keys': 194, 'missing': [], 'unexpected': []},
                  'predeclaredPlan': {'sha256': self.tool.sha256_file(self.tool.PLAN_PATH)}}
        self.tool.validate_native_metadata(report, case['id'])
        for field, key in [('model', 'sha256'), ('source', 'sha256')]:
            bad = json.loads(json.dumps(report));bad[field][key] = '0' * 64
            with self.assertRaises(ValueError):
                self.tool.validate_native_metadata(bad, case['id'])
        changed = json.loads(json.dumps(plan));changed['encodeInput']['pattern'] = 'different'
        with self.assertRaises(ValueError):
            self.tool.validate_pattern_declaration(changed)

    def test_coordinate_pattern_hash_matches_literal_little_endian_values(self):
        try:
            import numpy as np
        except ImportError:
            self.skipTest('NumPy optional for tiny pattern-hash check')
        for shape, kind in [([1, 3, 2, 2, 3], 'rgb'), ([1, 16, 2, 2, 3], 'raw-latent')]:
            values = list(self.tool.pattern_values(shape, kind))
            expected = hashlib.sha256(struct.pack('<' + str(len(values)) + 'f', *values)).hexdigest()
            self.assertEqual(self.tool.pattern_sha256(shape, kind), expected)


if __name__ == '__main__':
    unittest.main()
