"""Saved-byte/portable preparation checks; no weights, browser, or inference."""
import argparse
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('saved_input_recovery', Path(__file__).with_name('recover-standalone-inputs.py'))
RECOVERY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RECOVERY)


class SavedInputRecoveryTest(unittest.TestCase):
    def test_exact_saved_text_and_both_portable_cases_without_inference(self):
        with tempfile.TemporaryDirectory(prefix='bernini-recovery-test-', dir='/tmp') as temporary:
            root = Path(temporary)
            args = argparse.Namespace(repo=RECOVERY.ROOT, private_root=root / 'receipt-and-source',
                                      full_dir=root / 'full', small_dir=root / 'small',
                                      retained_n5=None, skip_prepare=False)
            receipt = RECOVERY.recover(args)
            self.assertEqual(receipt['restored']['nativeJSON']['sha256'], RECOVERY.NATIVE_SHA)
            self.assertEqual(receipt['restored']['nativeJSON']['bytes'], 8604657)
            self.assertEqual(receipt['packetSource']['blob'], RECOVERY.PACKET_BLOB)
            self.assertEqual(receipt['cases']['full']['totalTokens'], 73947)
            self.assertEqual(receipt['cases']['small']['totalTokens'], 5)
            for case in receipt['cases'].values():
                self.assertTrue(case['equivalentAfterDeclaredPathRebase'])
                self.assertFalse(case['exactOriginalManifestBytes'])
                self.assertFalse(case['numericalModelExecution'])
                for item in [case['manifest'], *case['assets']]:
                    self.assertEqual(Path(item['path']).stat().st_mode & 0o777, 0o600)
            self.assertFalse(receipt['modelsOpened'])
            self.assertFalse(receipt['numericalInferenceExecuted'])
            self.assertFalse(receipt['newTextExport'])
            self.assertEqual(RECOVERY.recover(args), receipt)
            # A conflicting saved value is rejected; recovery must not silently
            # replace caller-owned data or accept only a matching descriptor.
            noise = root / 'full/noise.f32'
            with noise.open('r+b') as destination:
                destination.write(b'\xff')
            with self.assertRaisesRegex(ValueError, 'Saved latent byte identity mismatch'):
                RECOVERY.recover(args)

    def test_conflicting_bytes_and_symlinks_are_not_overwritten(self):
        with tempfile.TemporaryDirectory(prefix='bernini-recovery-ownership-', dir='/tmp') as temporary:
            root = Path(temporary)
            destination = root / 'saved.f32'
            RECOVERY.save_exact(destination, b'original')
            with self.assertRaisesRegex(ValueError, 'Conflicting existing private file'):
                RECOVERY.save_exact(destination, b'replacement')
            self.assertEqual(destination.read_bytes(), b'original')
            alias = root / 'alias.f32'
            alias.symlink_to(destination)
            with self.assertRaisesRegex(ValueError, 'symlink'):
                RECOVERY.save_exact(alias, b'original')

    def test_public_permission_and_nonprivate_location_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix='bernini-recovery-mode-', dir='/tmp') as temporary:
            root = Path(temporary)
            public = root / 'public'
            public.mkdir(mode=0o755)
            os.chmod(public, 0o755)
            with self.assertRaisesRegex(ValueError, 'mode0700'):
                RECOVERY.private_directory(public)
        with self.assertRaisesRegex(ValueError, 'private /tmp'):
            RECOVERY.private_directory(RECOVERY.ROOT / 'private-test')

    def test_missing_fixed_git_object_is_not_reconstructed_from_receipts(self):
        with self.assertRaisesRegex(ValueError, 'Missing fixed Git source'):
            RECOVERY.git_asset(RECOVERY.ROOT, '0000000000000000000000000000000000000000', RECOVERY.PACKET_PATH)


if __name__ == '__main__':
    unittest.main()
