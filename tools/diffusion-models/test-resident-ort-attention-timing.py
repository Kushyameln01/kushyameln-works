"""Native-free admission and byte-comparison checks for the diagnostic driver."""
import base64
import contextlib
import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('resident-ort-attention-timing.py')

class DiagnosticDriverTests(unittest.TestCase):
    def driver(self):
        self.assertTrue(SCRIPT.exists(), 'Bounded diagnostic driver implementation required')
        spec = importlib.util.spec_from_file_location('resident_timing_driver', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_execution_without_explicit_after_trial_flag_refuses_before_browser(self):
        module = self.driver()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'result.json'
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit):
                module.main(['--threads', '1', '--output', str(output)])
            self.assertIn('Native/browser execution disabled', stderr.getvalue())
            self.assertFalse(output.exists())

    def test_output_comparison_checks_actual_bytes_not_just_claimed_digests(self):
        module = self.driver()
        def case(raw):
            item = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                    'base64': base64.b64encode(raw).decode()}
            return {'outputs': [{'kind': 'measured', 'index': 0, 'keyStart': 0,
                                 'inputSHA256': {'q': 'same'},
                                 'values': {name: dict(item) for name in ['max', 'denominator', 'context']}}]}
        same = module.compare_case_outputs(case(b'\x00\x01'), case(b'\x00\x01'))
        self.assertTrue(same['equal'])
        self.assertEqual(same['bytesCompared'], 6)
        different = module.compare_case_outputs(case(b'\x00\x01'), case(b'\x00\x81'))
        self.assertFalse(different['equal'])
        self.assertEqual(different['comparisons'][0]['firstMismatchByte'], 1)
        forged = case(b'\x00\x01')
        forged['outputs'][0]['values']['max']['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'digest'):
            module.compare_case_outputs(case(b'\x00\x01'), forged)

    def test_exclusive_report_output_does_not_overwrite(self):
        module = self.driver()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'evidence.json'
            module.write_new_report(path, {'original': True})
            with self.assertRaises(FileExistsError):
                module.write_new_report(path, {'original': False})
            self.assertIn('true', path.read_text())

if __name__ == '__main__':
    unittest.main()
