"""Receipt admission tests only; these do not execute a browser or a codec."""
import copy
import importlib.util
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vr180_cloud_validate', ROOT / 'tools/vr180/cloud-validate.py')
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)


class DirectReceiptAdmission(unittest.TestCase):
    def setUp(self):
        self.fixture = ROOT / 'docs/vr180-studio/fixtures/stereo360-tb.mp4'
        settings = {'mode': 'convert', 'layout': 'tb', 'fov': 360, 'eyeSize': 256,
                    'bitrate': 2000000, 'confirmed': True}
        self.record = {'inputSHA256': harness.FIXTURES['stereo360-tb'], 'expectedSettings': settings,
                       'expectedInputRevision': 1, 'downloadRecovered': False}
        self.receipt = {'build': harness.BUILD, 'status': 'saved',
                        'operationId': '00000000-0000-4000-8000-000000000001', 'inputRevision': 1,
                        'settings': settings, 'input': {'bytes': self.fixture.stat().st_size,
                                                      'sha256': self.record['inputSHA256']},
                        'output': {'bytes': 100, 'sha256': 'a' * 64}, 'savedSize': 100,
                        'savedSha256': 'a' * 64, 'saveWriteCommitted': True, 'saveCompleted': True,
                        'downloadRecovered': False,
                        'directSave': {'status': 'verified', 'saveWriteCommitted': True,
                                       'saveCompleted': True, 'metadataHashMatched': True,
                                       'wholeFileHashCompared': False}}
        self.observed = {'resultIsFile': True, 'saved': {'bytes': 100, 'returnedBytes': 100,
                         'webCryptoSHA256': 'a' * 64, 'returnedWebCryptoSHA256': 'a' * 64,
                         'rawBytesEqual': True}}

    def validate(self):
        harness.validate_direct_receipt(self.receipt, self.record, self.fixture, self.observed)

    def test_post_commit_observations_do_not_change_receipt_or_claim_download(self):
        original = copy.deepcopy(self.receipt)
        self.validate()
        self.assertEqual(self.receipt, original)
        self.assertFalse(self.record['downloadRecovered'])
        self.assertFalse(self.receipt['directSave']['wholeFileHashCompared'])

    def test_prepared_or_uncommitted_is_not_saved(self):
        for field, value in [('status', 'prepared'), ('saveWriteCommitted', False), ('saveCompleted', False)]:
            with self.subTest(field=field):
                original = self.receipt[field]
                self.receipt[field] = value
                with self.assertRaises(ValueError):
                    self.validate()
                self.receipt[field] = original

    def test_each_readback_hash_must_agree(self):
        for field in ['webCryptoSHA256', 'returnedWebCryptoSHA256']:
            with self.subTest(field=field):
                self.observed['saved'][field] = 'b' * 64
                with self.assertRaises(ValueError):
                    self.validate()
                self.observed['saved'][field] = 'a' * 64

    def test_saved_length_and_actual_file_required(self):
        self.receipt['savedSize'] = 99
        with self.assertRaises(ValueError):
            self.validate()
        self.receipt['savedSize'] = 100
        self.observed['resultIsFile'] = False
        with self.assertRaises(ValueError):
            self.validate()

    def test_metadata_verification_is_required(self):
        self.receipt['directSave']['metadataHashMatched'] = False
        with self.assertRaises(ValueError):
            self.validate()

    def test_stale_receipt_is_not_admitted_for_retry(self):
        self.record['expectedInputRevision'] = 2
        with self.assertRaises(ValueError):
            self.validate()


if __name__ == '__main__':
    unittest.main()
