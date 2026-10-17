"""Registry evidence/parser and harness source contracts, without launching Chrome."""
import base64
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('indexed_registry_probe', ROOT / 'tools/vr180/probe-indexed-conversion.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def observation():
    row = {'operationId': 'trial', 'inputRevision': 1, 'indexDirectoriesRemoved': True,
           'heldJobLocks': 0, 'indexReservedAfterCleanup': 0,
           'registry': {'name': 'registry-trial', 'status': 'REMOVED', 'removed': True, 'persistenceMs': 4.0},
           'indexOwnership': []}
    announcements = []
    for index, kind in enumerate(['input', 'output']):
        ticket = {'format': 'vr180-private-index-owner', 'schema': 1,
                  'jobId': 'trial' + ('-in' if kind == 'input' else '-out'),
                  'ownerToken': str(index + 1) * 32, 'kind': kind}
        raw = json.dumps(ticket, separators=(',', ':')).encode()
        record = {'ticket': ticket, 'persistedJSON': raw.decode(), 'bytes': len(raw),
                  'sha256': hashlib.sha256(raw).hexdigest(), 'status': 'PERSISTED',
                  'flushed': True, 'closed': True, 'readbackMatched': True, 'removed': True,
                  'writeCalls': 1, 'readCalls': 1, 'startedMs': 10.0 + index * 3,
                  'endedMs': 12.0 + index * 3, 'durationMs': 2.0}
        row['indexOwnership'].append(record)
        announcement = {'operationId': 'trial', 'inputRevision': 1, 'registryName': 'registry-trial',
                        'record': copy.deepcopy(record)}
        announcement['record']['removed'] = False  # Message sent before cleanup.
        announcements.append(announcement)
    return {'cases': [row], 'persistedOwnershipAnnouncements': announcements}


class RegistryProbe(unittest.TestCase):
    def test_recovered_physical_json_hash_identity_timing_and_cleanup(self):
        self.assertEqual(len(probe.verify_registry(observation())['records']), 2)
        for field, value in [('persistedJSON', '{}'), ('sha256', '0' * 64), ('closed', False),
                             ('durationMs', -1), ('durationMs', float('nan')), ('readCalls', 0), ('removed', False)]:
            with self.subTest(field=field, value=value):
                altered = observation()
                altered['cases'][0]['indexOwnership'][0][field] = value
                with self.assertRaises(Exception):
                    probe.verify_registry(altered)
        for field, value in [('heldJobLocks', 1), ('indexReservedAfterCleanup', None), ('indexDirectoriesRemoved', False)]:
            with self.subTest(field=field):
                altered = observation(); altered['cases'][0][field] = value
                with self.assertRaises(Exception):
                    probe.verify_registry(altered)
        altered = observation(); altered['persistedOwnershipAnnouncements'][0]['record']['ticket']['ownerToken'] = 'f' * 32
        with self.assertRaisesRegex(Exception, 'acknowledgment identity'):
            probe.verify_registry(altered)

    def test_embedded_javascript_parses_and_local_import_closure_is_complete(self):
        for name in ['WORKER', 'PAGE', 'CLEANUP']:
            text = getattr(probe, name)
            if name != 'WORKER':
                text = '(' + text + ')'
            subprocess.run(['node', '--input-type=module', '--check'], input=text, text=True, check=True, capture_output=True)
        self.assertIn('development/vr180/index-prototype/job-owner.mjs', probe.SOURCES)
        available = {(ROOT / path).resolve() for path in probe.SOURCES}
        for path in available:
            self.assertTrue(path.is_file(), str(path))
            for relative in re.findall(r'''\bfrom\s+['"](\.[^'"]+)['"]''', path.read_text()):
                self.assertIn((path.parent / relative).resolve(), available, (str(path), relative))
        for absolute in re.findall(r'''\bfrom\s+['"](/[^'"]+)['"]''', probe.WORKER):
            self.assertTrue(absolute == '/fork.mjs' or absolute[1:] in probe.SOURCES, absolute)

    def test_existing_small_and_scale_cases_keep_their_boundaries(self):
        small = probe.cases_for('small'); scale = probe.cases_for('scale')
        self.assertEqual([row['name'] for row in small], ['sbs-aac', 'tb-aac', 'sbs-silent', 'tb-silent', 'tb360-aac', 'cancel', 'retry'])
        self.assertEqual([row['name'] for row in scale], ['4k-2s', '4k-12s-cancel', '4k-12s-retry'])
        self.assertEqual(scale[1]['cancelAfterBytes'], 1048576)
        self.assertEqual(scale[1]['handleKey'], scale[2]['handleKey'])
        self.assertEqual(small[-2]['handleKey'], small[-1]['handleKey'])

    def test_real_failure_transport_keeps_full_archive_identity_and_retention_limits(self):
        with tempfile.TemporaryDirectory(prefix='vr180-registry-transport-') as temp:
            root = Path(temp); bundle = root / 'fork.mjs'; bundle.write_text('// no browser started\n')
            output = root / 'result'; log = io.StringIO()
            with patch.dict(os.environ, {'GITHUB_REPOSITORY': 'rejected/test', 'GITHUB_RUN_ID': 'registry', 'GITHUB_RUN_ATTEMPT': '2'}), \
                 patch.object(sys, 'argv', [str(probe.__file__), '--bundle', str(bundle), '--output', str(output)]), contextlib.redirect_stdout(log):
                code = probe.main()
            self.assertEqual(code, 1)
            report = json.loads((output / 'run.json').read_text())
            self.assertEqual(report['runId'], 'registry-indexed-conversion-2')
            self.assertNotEqual(report['status'], 'PASS')
            self.assertIn('registry retention after this temporary browser context closes', report['notVerified'])
            lines = log.getvalue().splitlines()
            begin = [json.loads(line.split(' ', 1)[1]) for line in lines if line.startswith('VR180_EVIDENCE_BEGIN ')]
            end = [json.loads(line.split(' ', 1)[1]) for line in lines if line.startswith('VR180_EVIDENCE_END ')]
            self.assertEqual(len(begin), 1); self.assertEqual(len(end), 1)
            self.assertTrue(begin[0]['complete']); self.assertEqual(begin[0]['runId'], report['runId'])
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
                self.assertEqual(json.load(archive.extractfile('run.json')), report)


if __name__ == '__main__':
    unittest.main()
