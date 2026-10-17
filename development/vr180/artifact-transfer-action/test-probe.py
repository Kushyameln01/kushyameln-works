import hashlib
import importlib.util
from pathlib import Path
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location('probe', Path(__file__).resolve().parents[3] / 'tools/vr180/probe-segmented-transfer.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ProbeTests(unittest.TestCase):
    def test_formula_and_file_identity(self):
        text = b'vr180-public-segmented-transfer-2026-10-17\0payload-a\0' + b'1048576'
        expected = hashlib.shake_256(text).digest(65)
        self.assertEqual(probe.block_at('payload-a', 1048576, 65), expected)
        self.assertNotEqual(probe.block_at('payload-b', 1048576, 65), expected)

    def test_partial_last_block_actual_disk_reread(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            record = probe.write_payload(root, 'payload-a', probe.MIB + 17, time.monotonic() + 10)
            data = (root / record['name']).read_bytes()
            expected = probe.block_at('payload-a', 0, probe.MIB) + probe.block_at('payload-a', probe.MIB, 17)
            self.assertEqual(data, expected)
            self.assertEqual(record['sha256'], hashlib.sha256(data).hexdigest())

    def test_existing_source_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'payload-a.bin').write_bytes(b'keep')
            with self.assertRaises(FileExistsError):
                probe.write_payload(root, 'payload-a', 10, time.monotonic() + 10)
            self.assertEqual((root / 'payload-a.bin').read_bytes(), b'keep')

    def test_invalid_blocks_and_deadline(self):
        for args in [('other', 0, 1), ('payload-a', 1, 1), ('payload-a', 0, probe.MIB + 1)]:
            with self.assertRaises(ValueError):
                probe.block_at(*args)
        with self.assertRaisesRegex(ValueError, 'PROBE_DEADLINE'):
            probe.check_time(0)

    def test_only_small_profiles_and_more_than_ten_parts(self):
        self.assertEqual(set(probe.PROFILES), {'service-8mib', 'single-128mib'})
        profile = probe.PROFILES['service-8mib']
        parts = sum((size + profile['partBytes'] - 1) // profile['partBytes'] for size in profile['sizes'])
        self.assertEqual(parts, 16)


if __name__ == '__main__':
    unittest.main()
