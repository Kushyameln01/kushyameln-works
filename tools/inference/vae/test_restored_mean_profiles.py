"""Input gates for the real-browser restored-mean acceptance helper; no NN."""
import unittest
from pathlib import Path
from check_restored_mean import validate_input

ROOT = Path(__file__).resolve().parents[3]


class RestoredMeanProfiles(unittest.TestCase):
    def test_existing_square_default_keeps_64_mean_contract(self):
        record = validate_input(ROOT / 'development/inference/e6/current-peers/restored-still64.wktensor')
        self.assertEqual(record['header']['shape'], [1, 16, 1, 2, 2])

    def test_rect_real_128_mean_uses_exact_rect_profile(self):
        record = validate_input(ROOT / 'development/inference/e6/fixtures/api-recovery.wktensor',
                                profile_id='wan21-raw-f32-1x16x32')
        self.assertEqual(record['header']['shape'], [1, 16, 1, 2, 4])
        self.assertEqual(record['header']['meaning'], 'raw-posterior-mean')

    def test_rect_is_rejected_by_existing_square_profile(self):
        with self.assertRaises(ValueError):
            validate_input(ROOT / 'development/inference/e6/fixtures/api-recovery.wktensor')

    def test_64_mean_is_rejected_by_rect_profile(self):
        with self.assertRaises(ValueError):
            validate_input(ROOT / 'development/inference/e6/current-peers/restored-still64.wktensor',
                           profile_id='wan21-raw-f32-1x16x32')


if __name__ == '__main__':
    unittest.main()
