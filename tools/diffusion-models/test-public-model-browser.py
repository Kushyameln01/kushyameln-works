"""Host transport/allowlist tests only; no browser or model runtime is imported."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('public_model_browser', Path(__file__).with_name('public-model-browser.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PrivateTransport(unittest.TestCase):
    def test_sink_is_exclusive_private_exact_and_rejects_unknown_name(self):
        with tempfile.TemporaryDirectory(prefix='public-worker-test-') as parent:
            output = Path(parent) / 'values'
            sink = MODULE.OutputSink(output)
            data = b'\x00\x00\x00\x80'
            result = sink.write('tensor.f32', data, MODULE.sha(data))
            self.assertEqual((output / 'tensor.f32').read_bytes(), data)
            self.assertEqual((output / 'tensor.f32').stat().st_mode & 0o777, 0o600)
            self.assertTrue(result['actualFileHostReadback'])
            with self.assertRaises(FileExistsError):
                sink.write('tensor.f32', data, MODULE.sha(data))
            with self.assertRaisesRegex(ValueError, 'Unregistered'):
                sink.write('../escape', data, MODULE.sha(data))
            with self.assertRaisesRegex(ValueError, 'SHA256'):
                sink.write('tensor.wktensor', data, '0' * 64)

    def test_private_values_cannot_be_saved_inside_git_checkout(self):
        with self.assertRaisesRegex(ValueError, 'outside repository'):
            MODULE.private_path(MODULE.ROOT / 'generated-sample.f32')


if __name__ == '__main__':
    unittest.main()
