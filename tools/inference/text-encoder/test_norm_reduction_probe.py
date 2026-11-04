"""Synthetic F32 reduction checks. No Torch, model, ORT or NN execution."""
import importlib.util
import unittest
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent


class TorchCascadeOrder(unittest.TestCase):
    def target(self):
        path = HERE / 'norm_reduction_probe.py'
        self.assertTrue(path.is_file(), 'Missing source-order RMSNorm probe')
        spec = importlib.util.spec_from_file_location('norm_probe', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_avx512_cascade_preserves_the_source_chunk_and_lane_order(self):
        # Hand-derived for Torch4096/AVX512: chunk0 loses15 unit addends;
        # chunk totals, ILP4 and lane16 addition yield100004080, not100000000.
        values = np.ones((1, 4096), dtype=np.float32)
        values[0, 0] = 100000000.
        result = self.target().torch_cascade_mean_f32(values)
        self.assertEqual(result.dtype, np.dtype('float32'))
        self.assertEqual(float(result[0, 0]), 24415.05859375)

    def test_rows_are_independent_and_no_hidden_width_substitution_is_allowed(self):
        values = np.stack([np.ones(4096, dtype=np.float32), np.arange(1, 4097, dtype=np.float32)])
        result = self.target().torch_cascade_mean_f32(values)
        np.testing.assert_array_equal(result, np.array([[1.], [2048.5]], dtype=np.float32))
        with self.assertRaisesRegex(ValueError, '4096'):
            self.target().torch_cascade_mean_f32(values[:, :2048])


if __name__ == '__main__':
    unittest.main()
