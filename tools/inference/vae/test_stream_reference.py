"""Lightweight independent-reference contracts; no Torch/model execution."""
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent


def load_reference():
    spec = importlib.util.spec_from_file_location('stream_reference', ROOT / 'stream_reference.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class StreamReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reference = load_reference()

    def test_import_does_not_import_tensor_libraries(self):
        code = ("import importlib.util, sys; "
                f"s=importlib.util.spec_from_file_location('reference', {str(ROOT / 'stream_reference.py')!r}); "
                "m=importlib.util.module_from_spec(s); s.loader.exec_module(m); "
                "assert 'torch' not in sys.modules and 'numpy' not in sys.modules")
        subprocess.run([sys.executable, '-c', code], check=True, capture_output=True, text=True)

    def test_source_frame_tail_is_explicit_and_rgb_shape_keeps_actual_f(self):
        expected = {1: (1, 1, 0), 4: (1, 1, 3), 5: (2, 5, 0),
                    80: (20, 77, 3), 81: (21, 81, 0)}
        for frames, (latent, consumed, tail) in expected.items():
            contract = self.reference.frame_contract(frames)
            self.assertEqual(contract, {'inputFrames': frames, 'latentFrames': latent,
                                       'consumedFrames': consumed, 'ignoredTailFrames': tail,
                                       'decodedFrames': consumed})
            case = self.reference.case_by_id(f'source-f{frames}-480x832')
            self.assertEqual(case['rgbShape'], [1, 3, frames, 480, 832])
            self.assertEqual(case['latentShape'], [1, 16, latent, 60, 104])
            self.assertEqual(case['decodeRgbShape'], [1, 3, consumed, 480, 832])

    def test_predeclared_cases_cover_target_and_reference_boundaries(self):
        plan = self.reference.load_plan()
        expected = {'target-f81-480x832',
                    *(f'source-f{f}-480x832' for f in (1, 4, 5, 80, 81)),
                    *(f'reference-f1-{h}x{w}' for h, w in
                      ((16, 16), (16, 848), (848, 16), (848, 848), (16, 32)))}
        self.assertEqual({case['id'] for case in plan['cases']}, expected)
        self.assertEqual(plan['comparisonGate'], self.reference.COMPARISON_GATE)
        self.assertTrue(plan['comparisonGate']['registeredBeforeComparison'])
        for case in plan['cases']:
            self.assertEqual(case, self.reference.case_by_id(case['id']))

    def test_rgb_pattern_is_ncthw_and_exact_binary_float(self):
        shape = [1, 3, 2, 2, 3]
        values = list(self.reference.pattern_values(shape, 'rgb'))
        expected = [((c * 71 + t * 13 + y * 5 + x * 3) % 257 - 128) / 128
                    for c in range(3) for t in range(2) for y in range(2) for x in range(3)]
        self.assertEqual(values, expected)
        self.assertEqual(len(values), 36)
        self.assertEqual(struct.unpack('<36f', struct.pack('<36f', *values)), tuple(expected))
        self.assertEqual(values[12], (71 - 128) / 128)

    def test_raw_latent_has_its_own_pattern_and_normal_input_semantics(self):
        shape = [1, 16, 2, 2, 3]
        values = list(self.reference.pattern_values(shape, 'raw-latent'))
        expected = [((c * 17 + t * 11 + y * 7 + x * 5) % 257 - 128) / 512
                    for c in range(16) for t in range(2) for y in range(2) for x in range(3)]
        self.assertEqual(values, expected)
        self.assertTrue(all(-.25 <= value <= .25 for value in values))
        plan = self.reference.load_plan()
        self.assertEqual(plan['decodeInput']['latentSpace'], 'raw')
        self.assertEqual(plan['decodeInput']['provenance'], 'RAW_LATENT_DECLARED_NORMAL_INPUT')
        self.assertFalse(plan['decodeInput']['derivedFromEncode'])

    def test_invalid_shape_and_case_do_not_silently_round(self):
        for frames in (0, -1, True, 1.5):
            with self.assertRaises(ValueError):
                self.reference.frame_contract(frames)
        for shape in ([1, 3, 1, 16], [2, 3, 1, 16, 16], [1, 3, 0, 16, 16]):
            with self.assertRaises(ValueError):
                list(self.reference.pattern_values(shape, 'rgb'))
        with self.assertRaises(ValueError):
            self.reference.case_by_id('target-f77-480x832')

    def test_fresh_private_output_and_file_hash_contract(self):
        with tempfile.TemporaryDirectory() as root:
            output = Path(root) / 'private'
            self.reference.create_output(output)
            with self.assertRaises(FileExistsError):
                self.reference.create_output(output)
            with self.assertRaises(ValueError):
                self.reference.create_output(Path(root) / 'docs' / 'private')
            path = output / 'values.f32'
            path.write_bytes(struct.pack('<2f', -1., 1.))
            self.assertEqual(self.reference.sha256_file(path),
                             'c1112024d84bac179cfda8df2d45cdb8cb941ec29f75e8cffa61c3b4c46d44a1')

    def test_cgroup_limit_is_real_observation_not_a_fixed_assumption(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / 'memory.max').write_text('17179869184\n')
            (path / 'memory.current').write_text('1048576\n')
            observed = self.reference.read_cgroup_memory(path)
            self.assertEqual(observed['limitBytes'], 17179869184)
            self.assertEqual(observed['currentBytes'], 1048576)
            (path / 'memory.max').write_text('max\n')
            self.assertIsNone(self.reference.read_cgroup_memory(path)['limitBytes'])

    def test_reclaimable_inactive_file_does_not_falsely_trigger_the_guard(self):
        gib, mib = 1024 ** 3, 1024 ** 2
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / 'memory.max').write_text(str(16 * gib))
            (path / 'memory.current').write_text(str(16 * gib - 128 * mib))
            (path / 'memory.stat').write_text(
                f'inactive_file {10 * gib}\nanon {5 * gib}\nshmem {gib}\n')
            memory = self.reference.read_cgroup_memory(path)
            self.assertEqual(memory['inactiveFileBytes'], 10 * gib)
            self.assertEqual(memory['anonBytes'], 5 * gib)
            self.assertEqual(memory['shmemBytes'], gib)
            self.assertEqual(memory['workingSetBytes'], 6 * gib - 128 * mib)
            self.assertFalse(self.reference.memory_guard({'cgroup': memory}, 256 * mib))

    def test_unreclaimable_working_set_and_tmpfs_still_trigger_the_guard(self):
        gib, mib = 1024 ** 3, 1024 ** 2
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / 'memory.max').write_text(str(16 * gib))
            (path / 'memory.current').write_text(str(16 * gib - 128 * mib))
            (path / 'memory.stat').write_text(
                f'inactive_file {64 * mib}\nanon {10 * gib}\nshmem {5 * gib}\n')
            memory = self.reference.read_cgroup_memory(path)
            self.assertEqual(memory['workingSetBytes'], 16 * gib - 192 * mib)
            self.assertTrue(self.reference.memory_guard({'cgroup': memory}, 256 * mib))

    def test_missing_memory_stat_falls_back_to_raw_charge(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / 'memory.max').write_text('1024\n')
            (path / 'memory.current').write_text('1000\n')
            memory = self.reference.read_cgroup_memory(path)
            self.assertIsNone(memory['inactiveFileBytes'])
            self.assertEqual(memory['workingSetBytes'], 1000)
            self.assertTrue(self.reference.memory_guard({'cgroup': memory}, 32))

    def test_vectorized_private_files_match_the_stdlib_pattern_in_ncthw_order(self):
        torch_before = sys.modules.get('torch')
        try:
            import numpy as np
        except ImportError:
            self.skipTest('NumPy optional for the file-layout check; no model dependencies required')
        with tempfile.TemporaryDirectory() as root:
            for kind, shape in [('rgb', [1, 3, 2, 3, 5]), ('raw-latent', [1, 16, 2, 2, 3])]:
                path = Path(root) / (kind + '.f32')
                record = self.reference.write_pattern(path, shape, kind, np)
                expected = list(self.reference.pattern_values(shape, kind))
                self.assertEqual(path.read_bytes(), struct.pack('<' + str(len(expected)) + 'f', *expected))
                self.assertEqual(record['shape'], shape)
                self.assertEqual(record['bytes'], len(expected) * 4)
                self.assertEqual(record['sha256'], self.reference.sha256_file(path))
            # Test noncontiguous source output without importing or constructing Torch.
            array = np.arange(48, dtype=np.float32).reshape(1, 2, 3, 2, 4).transpose(0, 1, 2, 4, 3)
            class ArrayTensor:
                shape = array.shape
                def detach(self): return self
                def cpu(self): return self
                def numpy(self): return array
            path = Path(root) / 'source-output.f32'
            record = self.reference.write_tensor(path, ArrayTensor(), list(array.shape), 'test', np)
            self.assertEqual(path.read_bytes(), array.astype('<f4').tobytes(order='C'))
            self.assertTrue(record['complete'])
        self.assertIs(sys.modules.get('torch'), torch_before)


if __name__ == '__main__':
    unittest.main()
