"""Small actual ZIP/tar recovery; HTTP, source checkout and codec are injected."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import os
import signal
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
r = load('complete_receiver', ROOT/'tools/vr180/receive-in-actions.py')
m = load('media_helper_test', ROOT/'tools/vr180/receive-media-evidence.py')
f = load('wrapper_fixture_test', ROOT/'development/vr180/p5-receiver-calibration/test_prepare.py')


class RecoveryPathTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); source, self.original, self.wrapped = f.prepare_fixture(self.root)
        self.manifest = copy.deepcopy(source); self.identity = source['identity']; self.archives = {}; self.rows = []
        self.manifest.update(schema='vr180-segmented-transfer-v1', status='COMPLETE', partCount=2,
            sourceManifestSHA256=hashlib.sha256(json.dumps(source).encode()).hexdigest(), metadataArtifactCount=1)
        sources = ['development/vr180/artifact-transfer-action/'+n for n in r.SENDER_FILES]+[m.PREPARE, m.CALIBRATION]
        self.hashes = lambda names, commit: {n: hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in names}
        self.manifest['provenance'] = {'sourceHashes': self.hashes(sources, self.identity['commit']),
            'generatorScriptPath': m.PREPARE, 'generatorScriptSHA256': source['sourceSHA256']}
        prefix = r.r.prefix(self.manifest)
        for file in self.manifest['files']:
            raw = (self.wrapped/'media'/file['name']).read_bytes()
            a = self.archive(prefix+'-'+file['id']+'-00000', 'chunk.bin', raw)
            file.update(partCount=1, parts=[{'index': 0, 'offset': 0, 'length': len(raw), 'sha256': file['sha256'], 'artifact': a}])
        bundle = self.manifest['evidenceBundle']
        bundle['artifact'] = self.archive(prefix+'-evidence', 'evidence.bin', (self.wrapped/'media'/bundle['name']).read_bytes())
        raw = json.dumps(self.manifest).encode(); a = self.archive(prefix+'-complete', 'completion.json', raw)
        self.receipt = {'schema': 'vr180-segmented-transfer-v1', 'status': 'COMPLETE_MANIFEST_UPLOADED',
            'profile': m.PROFILE, 'identity': self.identity, 'totalBytes': source['totalBytes'], 'partCount': 2,
            'metadataArtifactCount': 1, 'artifactCount': 4,
            'completion': {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'artifact': a}}
        self.env = {'GITHUB_REPOSITORY': self.identity['repository'], 'GITHUB_SHA': self.identity['commit'],
            'GITHUB_REF': self.identity['ref'], 'GITHUB_RUN_ID': self.identity['runId'],
            'GITHUB_RUN_ATTEMPT': str(self.identity['runAttempt']), 'GITHUB_JOB': 'p5-calibration-receiver', 'RUNNER_TEMP': str(self.root)}

    def archive(self, name, entry, raw):
        aid = len(self.archives)+1; path = self.root/f'artifact-{aid}.zip'
        with zipfile.ZipFile(path, 'w') as z: z.writestr(entry, raw)
        size, sha = r.r.hash_file(path); a = {'id': aid, 'name': name, 'sizeBytes': size, 'digest': 'sha256:'+sha}
        self.archives[aid] = path
        self.rows.append({'id': aid, 'name': name, 'size_in_bytes': size, 'digest': a['digest'], 'expired': False,
            'workflow_run': {'id': int(self.identity['runId']), 'head_sha': self.identity['commit'],
                'head_branch': self.identity['ref'].removeprefix('refs/heads/')}})
        return a

    def run_path(self, verdict='PASS', error=None):
        def download(a, stage, deadline):
            path = stage/'part.zip'; shutil.copyfile(self.archives[a['id']], path)
            return path, {'receipt': {'id': a['id'], 'testInjectedTransport': True}}
        with patch.object(r, 'load', return_value=m), patch.object(r, 'exact_sources', side_effect=self.hashes), \
             patch.object(r, 'public_metadata', return_value={'artifacts': self.rows}), patch.object(r, 'download', side_effect=download), \
             patch.object(m, 'prepare_oracle', return_value=(None, None, {'testInjectedOracle': True})), \
             patch.object(m, 'verify_media', side_effect=error, return_value={'status': verdict, 'completeScan': True}), \
             patch.object(r.c, 'emit_evidence', return_value=True):
            return r.recover(self.receipt, m.PROFILE, self.root/'received', self.env)[0]

    def test_four_artifacts_actual_full_recovery_before_media_verdict(self):
        result = self.run_path()
        self.assertEqual(result['status'], 'PASS_COMPLETE_MEDIA')
        self.assertEqual(result['downloadArtifacts'], 4); self.assertEqual(result['dataArtifacts'], 2)
        self.assertIsNone(result['independentComparedBytes'])
        for file in self.manifest['files']:
            self.assertEqual((self.root/'received/media'/file['name']).read_bytes(), (self.wrapped/'media'/file['name']).read_bytes())

    def test_complete_quality_failure_does_not_erase_byte_success(self):
        result = self.run_path(verdict='FAIL')
        self.assertEqual(result['status'], 'COMPLETE_MEDIA_FAIL')
        self.assertEqual(result['fullMediaValidation'], 'FAIL_COMPLETE_SCAN')
        state = json.loads((self.root/'received/evidence/recovery.json').read_text())
        self.assertEqual(state['status'], 'PASS')

    def test_incomplete_media_inspection_never_passes(self):
        result = self.run_path(error=ValueError('RECEIVER_MEDIA_SCAN_INCOMPLETE'))
        self.assertEqual(result['status'], 'FAIL')
        self.assertEqual(result['phase'], 'independent-complete-media-inspection')
        self.assertEqual(len(json.loads((self.root/'received/evidence/downloads.json').read_text())), 4)

    def test_cancellation_is_not_converted_to_complete_quality_failure(self):
        result = self.run_path(error=r.ReceiverCancelled('RECEIVER_CANCELLED'))
        self.assertEqual(result['status'], 'FAIL')
        self.assertEqual(result['reason'], 'RECEIVER_CANCELLED')
        self.assertNotEqual(result['fullMediaValidation'], 'FAIL_COMPLETE_SCAN')

    def test_real_oracle_signal_stops_before_remaining_stages_and_closes_runtime(self):
        oracle = load('real_oracle_cancel', ROOT/'tools/vr180/verify-conversion-large.py')
        stages = []; closed = []; original_close = oracle.Runtime.close
        def close(runtime):
            closed.append(True); return original_close(runtime)
        def cancel(*args): os.kill(os.getpid(), signal.SIGTERM)
        restore = r.install_cancellation()
        try:
            with patch.object(oracle, 'tool_version', return_value='mock'), \
                 patch.object(oracle, 'stream_info', return_value={'streams': [], 'audio': []}), \
                 patch.object(oracle, 'check_metadata', side_effect=cancel), \
                 patch.object(oracle, 'scan_frames', side_effect=lambda *args: stages.append('frames')), \
                 patch.object(oracle, 'scan_packets', side_effect=lambda *args: stages.append('packets')), \
                 patch.object(oracle.Runtime, 'close', close):
                with self.assertRaisesRegex(r.ReceiverCancelled, 'RECEIVER_CANCELLED'):
                    oracle.verify_files(self.wrapped/'media/input.mp4', self.wrapped/'media/output.mp4',
                        layout='sbs', fov=180, eye_size=512, mode='convert', timeout=10, log_dir=self.root/'cancel-logs')
        finally: restore()
        self.assertEqual(stages, []); self.assertEqual(closed, [True])


if __name__ == '__main__': unittest.main()
