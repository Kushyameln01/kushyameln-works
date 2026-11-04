"""NN0 streaming original/executed graph identity checks."""
import hashlib
import importlib.util
import io
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


class GraphRecipeHash(unittest.TestCase):
    def test_changed_metadata_stream_hash_includes_growth_without_writing_graph(self):
        path = HERE / 'norm_graph_recipe.py'
        self.assertTrue(path.is_file(), 'Missing source-preserving norm recipe builder')
        spec = importlib.util.spec_from_file_location('norm_recipe', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        original = bytes([19, 9, 1, 2, 9, 9, 9, 9, 9, 9, 3, 4, 9, 9, 9, 9, 9, 9, 9, 9])
        expected = bytes([22, 9, 10, 11, 12, 9, 9, 9, 9, 9, 9, 20, 21, 22, 23, 9, 9, 9, 9, 9, 9, 9, 9])
        operations = [{'offset': 0, 'beforeHex': '13', 'afterBase64': 'Fg=='},
                      {'offset': 2, 'beforeHex': '0102', 'afterBase64': 'CgsM'},
                      {'offset': 10, 'beforeHex': '0304', 'afterBase64': 'FBUWFw=='}]
        actual_source, actual_execution = module.execution_hashes(io.BytesIO(original), len(original), operations, chunk_bytes=3)
        self.assertEqual(actual_source, hashlib.sha256(original).hexdigest())
        self.assertEqual(actual_execution, hashlib.sha256(expected).hexdigest())


if __name__ == '__main__':
    unittest.main()
