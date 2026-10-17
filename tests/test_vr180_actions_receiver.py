import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('actions_receiver', ROOT/'tools/vr180/receive-in-actions.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class ActionsReceiverTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.out = self.root/'receiver'
        self.env = {'GITHUB_REPOSITORY': 'Kushyameln01/kushyameln-works', 'GITHUB_SHA': 'a'*40,
                    'GITHUB_REF': 'refs/heads/codex/vr180-plan-1-2', 'GITHUB_RUN_ID': '42',
                    'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_JOB': 'segmented-artifact-receiver', 'RUNNER_TEMP': str(self.root)}
        self.identity = {'repository': self.env['GITHUB_REPOSITORY'], 'commit': 'a'*40,
                         'ref': self.env['GITHUB_REF'], 'runId': '42', 'runAttempt': 1, 'job': 'segmented-artifact-probe'}
        self.profile = 'single-128mib'; self.archives = {}; self.metadata = {'artifacts': []}
        manifest = {'schema': 'vr180-segmented-transfer-v1', 'status': 'COMPLETE', 'identity': self.identity,
          'profile': self.profile, 'partBytes': m.r.MIB//2, 'totalBytes': m.r.MIB, 'partCount': 2,
          'sourceManifestSHA256': 'b'*64, 'provenance': {'sourceHashes': {}},
          'generator': {'seed': 'vr180-public-segmented-transfer-2026-10-17',
            'algorithm': 'SHAKE256(seed+NUL+fileId+NUL+decimal-byte-offset)-1MiB-blocks-v1', 'blockBytes': m.r.MIB}, 'files': []}
        data = hashlib.shake_256(b'vr180-public-segmented-transfer-2026-10-17\0payload-a\x000').digest(m.r.MIB)
        file = {'id': 'payload-a', 'name': 'payload-a.bin', 'bytes': len(data),
                'sha256': hashlib.sha256(data).hexdigest(), 'partCount': 2, 'parts': []}
        prefix = m.r.prefix(manifest)
        for i in range(2):
            block = data[i*m.r.MIB//2:(i+1)*m.r.MIB//2]
            artifact = self.archive(prefix+f'-payload-a-{i:05d}', 'chunk.bin', block)
            file['parts'].append({'index': i, 'offset': i*len(block), 'length': len(block),
                                 'sha256': hashlib.sha256(block).hexdigest(), 'artifact': artifact})
        manifest['files'] = [file]; raw = json.dumps(manifest).encode()
        artifact = self.archive(prefix+'-complete', 'completion.json', raw)
        self.receipt = {'schema': 'vr180-segmented-transfer-v1', 'status': 'COMPLETE_MANIFEST_UPLOADED',
              'profile': self.profile, 'identity': self.identity, 'totalBytes': len(data), 'partCount': 2,
              'completion': {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'artifact': artifact}}
        p = patch.dict(m.r.PROFILES, {self.profile: {'part': m.r.MIB//2, 'files': [('payload-a', 'payload-a.bin', m.r.MIB)]}})
        p.start(); self.addCleanup(p.stop)

    def archive(self, name, entry, raw):
        aid = len(self.archives)+1; path = self.root/f'{aid}.zip'
        with zipfile.ZipFile(path, 'w') as z: z.writestr(entry, raw)
        size, sha = m.r.hash_file(path); self.archives[aid] = path
        artifact = {'id': aid, 'name': name, 'sizeBytes': size, 'digest': 'sha256:'+sha}
        self.metadata['artifacts'].append({'id': aid, 'name': name, 'size_in_bytes': size, 'digest': artifact['digest'],
            'expired': False, 'workflow_run': {'id': 42, 'head_sha': 'a'*40, 'head_branch': 'codex/vr180-plan-1-2'}})
        return artifact

    def execute(self, failure=None):
        def download(artifact, stage, deadline):
            if failure: failure(artifact)
            target = stage/'part.zip'; shutil.copyfile(self.archives[artifact['id']], target)
            return target, {'receipt': {'scope': 'test mock raw transport'}}
        with patch.object(m, 'exact_sources', return_value={}), patch.object(m, 'public_metadata', return_value=self.metadata), \
             patch.object(m, 'download', side_effect=download), patch.object(m.c, 'emit_evidence', return_value=True):
            return m.recover(self.receipt, self.profile, self.out, self.env)[0]

    def test_complete_separate_receiver_checks_every_actual_byte(self):
        result = self.execute()
        self.assertEqual(result['status'], 'PASS_BYTES_ONLY')
        self.assertEqual(result['independentComparedBytes'], m.r.MIB)
        self.assertEqual(result['downloadArtifacts'], 3)
        self.assertEqual(json.loads((self.out/'evidence/recovery.json').read_text())['status'], 'PASS')

    def test_producer_job_and_attempt_cannot_be_replaced_by_receiver(self):
        for key, value in [('job', 'segmented-artifact-receiver'), ('runAttempt', 2), ('commit', 'b'*40)]:
            receipt = copy.deepcopy(self.receipt); receipt['identity'][key] = value
            with self.assertRaisesRegex(ValueError, 'PRODUCER_IDENTITY'):
                m.validate_receipt(receipt, self.profile, self.env)

    def test_wrong_rest_run_rejected_before_payload(self):
        self.metadata['artifacts'][-1]['workflow_run']['id'] = 43
        result = self.execute()
        self.assertEqual(result['status'], 'FAIL'); self.assertFalse((self.out/'media').exists())

    def test_missing_or_timed_out_part_never_passes(self):
        def reject(a):
            if a['id'] == 2: raise ValueError('ADAPTER_DEADLINE')
        result = self.execute(reject)
        self.assertEqual(result['status'], 'FAIL')
        self.assertEqual(json.loads((self.out/'media/recovery.json').read_text())['status'], 'PARTIAL')

    def test_corrupt_part_rejected_before_append(self):
        raw = bytearray(self.archives[1].read_bytes()); raw[60] ^= 1; self.archives[1].write_bytes(raw)
        result = self.execute()
        self.assertEqual(result['status'], 'FAIL'); self.assertEqual((self.out/'media/payload-a.bin').stat().st_size, 0)

    def test_public_rest_fetch_has_no_auth_and_preserves_original_rows(self):
        response = {'total_count': 3, 'artifacts': self.metadata['artifacts']}; requests = []
        def open_mock(request, timeout):
            requests.append(request); return io.BytesIO(json.dumps(response).encode())
        result = m.public_metadata(self.identity, m.time.time()+60, opener=open_mock)
        self.assertEqual(result, response)
        self.assertNotIn('Authorization', requests[0].headers)
        self.assertIn('/runs/42/artifacts?', requests[0].full_url)

    def test_large_profile_not_enabled_by_receipt(self):
        with self.assertRaisesRegex(ValueError, 'SMALL_PROFILE_ONLY'):
            m.validate_receipt(self.receipt, 'p5-10gb', self.env)

    def test_cancellation_waits_for_adapter_group_before_failure_evidence(self):
        from unittest.mock import MagicMock
        process = MagicMock(pid=12345)
        process.wait.side_effect = [ValueError('RECEIVER_CANCELLED'), None]
        stage = self.root/'stage'; stage.mkdir()
        with patch.object(m.subprocess, 'Popen', return_value=process), patch.object(m.os, 'killpg') as kill:
            with self.assertRaisesRegex(ValueError, 'RECEIVER_CANCELLED'):
                m.download(self.receipt['completion']['artifact'], stage, m.time.time()+60)
        kill.assert_called_once_with(12345, signal.SIGTERM)
        self.assertEqual(process.wait.call_count, 2)

    def test_deadline_kills_unresponsive_group_and_waits(self):
        from unittest.mock import MagicMock
        process = MagicMock(pid=12346)
        process.wait.side_effect = [subprocess.TimeoutExpired('adapter', 1), subprocess.TimeoutExpired('adapter', 5), None]
        stage = self.root/'stage'; stage.mkdir()
        with patch.object(m.subprocess, 'Popen', return_value=process), patch.object(m.os, 'killpg') as kill:
            with self.assertRaisesRegex(ValueError, 'ADAPTER_DEADLINE'):
                m.download(self.receipt['completion']['artifact'], stage, m.time.time()+60)
        self.assertEqual([call.args for call in kill.call_args_list], [(12346, signal.SIGTERM), (12346, signal.SIGKILL)])
        self.assertEqual(process.wait.call_count, 3)

    def test_cancellation_handler_raises_once_and_then_allows_cleanup(self):
        restore = m.install_cancellation()
        try:
            handler = signal.getsignal(signal.SIGTERM)
            with self.assertRaisesRegex(m.ReceiverCancelled, 'RECEIVER_CANCELLED'): handler(signal.SIGTERM, None)
            handler(signal.SIGTERM, None)
        finally: restore()


if __name__ == '__main__': unittest.main()
