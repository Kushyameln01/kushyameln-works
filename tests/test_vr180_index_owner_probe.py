"""The real owner-probe failure path must still produce recoverable evidence."""
import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('owner_probe', ROOT / 'tools/vr180/probe-index-owner.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class OwnerProbeTransport(unittest.TestCase):
    def test_preflight_failure_recovers_complete_real_archive_with_run_attempt_identity(self):
        with tempfile.TemporaryDirectory(prefix='vr180-owner-transport-') as temp:
            output = Path(temp) / 'result'
            log = io.StringIO()
            with patch.dict(os.environ, {'GITHUB_REPOSITORY': 'rejected/test', 'GITHUB_RUN_ID': 'contract', 'GITHUB_RUN_ATTEMPT': '5'}), \
                 patch.object(sys, 'argv', [str(probe.__file__), '--output', str(output)]), contextlib.redirect_stdout(log):
                code = probe.main()
            self.assertEqual(code, 1)
            report = json.loads((output / 'run.json').read_text())
            self.assertEqual(report['runId'], 'contract-index-owner-5')
            self.assertNotEqual(report['status'], 'PASS')
            lines = log.getvalue().splitlines()
            begin = [json.loads(line.split(' ', 1)[1]) for line in lines if line.startswith('VR180_EVIDENCE_BEGIN ')]
            end = [json.loads(line.split(' ', 1)[1]) for line in lines if line.startswith('VR180_EVIDENCE_END ')]
            self.assertEqual(len(begin), 1)
            self.assertEqual(len(end), 1)
            self.assertTrue(begin[0]['complete'])
            self.assertEqual(begin[0]['runId'], report['runId'])
            self.assertEqual(end[0]['runId'], report['runId'])
            chunks = [line.split(' ', 2)[2] for line in lines if line.startswith('VR180_EVIDENCE_CHUNK ')]
            payload = base64.b64decode(''.join(chunks), validate=True)
            self.assertEqual(hashlib.sha256(payload).hexdigest(), begin[0]['sha256'])
            self.assertEqual(end[0]['sha256'], begin[0]['sha256'])
            with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as archive:
                manifest = json.load(archive.extractfile('manifest.json'))
                self.assertEqual(manifest['runId'], report['runId'])
                for file in manifest['files']:
                    raw = archive.extractfile(file['name']).read()
                    self.assertEqual(len(raw), file['bytes'])
                    self.assertEqual(hashlib.sha256(raw).hexdigest(), file['sha256'])
                recovered = json.load(archive.extractfile('run.json'))
                self.assertEqual(recovered, report)


if __name__ == '__main__':
    unittest.main()
