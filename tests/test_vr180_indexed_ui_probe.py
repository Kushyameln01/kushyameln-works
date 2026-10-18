"""Boundaries of UI receipt evidence; does not run a browser or media conversion."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

path = Path(__file__).resolve().parents[1]/'tools/vr180/probe-indexed-ui.py'
spec = importlib.util.spec_from_file_location('ui_probe', path)
probe = importlib.util.module_from_spec(spec); spec.loader.exec_module(probe)


def receipt():
    output = {'bytes': 123, 'sha256': 'b'*64, 'info': {'width': 512, 'height': 256,
        'videoCodec': 'avc1', 'audioCodecs': ['mp4a'], 'stereoMode': 2, 'projection': 'equi'}}
    attempt = {'id': 'save-1', 'kind': 'direct', 'resultOperationId': 'operation', 'inputRevision': 2,
        'commitState': 'committed', 'verificationState': 'passed', 'bytes': 123, 'sha256': 'b'*64,
        'wholeFileHashCompared': False, 'metadataHashMatched': True}
    return {'schemaVersion': 2, 'build': 'candidate', 'operationId': 'operation', 'inputRevision': 2,
        'status': 'saved', 'executionRoute': 'indexed', 'saveWriteCommitted': True, 'saveCompleted': True,
        'savedSize': 123, 'savedSha256': 'b'*64, 'saveAttempts': [attempt], 'output': output,
        'input': {'bytes': 10, 'sha256': 'a'*64},
        'settings': {'mode': 'convert', 'layout': 'tb', 'fov': 360, 'eyeSize': 256, 'bitrate': 2000000,
            'confirmed': True, 'executionRoute': 'indexed'},
        'directSave': {'status': 'verified', 'wholeFileHashCompared': False, 'metadataHashMatched': True,
            'savedObservation': {'jobId': 'operation', 'outputProfileId': 'default', 'committed': True, 'bytes': 123, 'sha256': 'b'*64}},
        'indexedOwnership': {'status': 'complete', 'identity': {'operationId': 'operation', 'inputRevision': 2, 'namespace': 'operation-r2'}}}


class UIEvidenceChecks(unittest.TestCase):
    def verify(self, value, **kwargs):
        return probe.verify_receipt(value, 'candidate', 10, 'a'*64, **kwargs)

    def test_complete_receipt_and_download_preserve_one_saved_observation(self):
        before = receipt(); after = copy.deepcopy(before)
        self.assertEqual(self.verify(before)['status'], 'PASS')
        after['saveAttempts'].append({'id': 'download-1', 'kind': 'download-request', 'resultOperationId': 'operation',
            'inputRevision': 2, 'commitState': 'not-started', 'verificationState': 'not-run'})
        self.assertEqual(self.verify(after, after_download=True, previous=before)['status'], 'PASS')
        self.assertEqual(before, receipt())

    def test_identity_profile_hash_and_boolean_corruption_are_rejected(self):
        mutations = [
            lambda r: r.update(inputRevision=1), lambda r: r.update(schemaVersion=True),
            lambda r: r.update(saveCompleted=1), lambda r: r['saveAttempts'][0].update(inputRevision=1),
            lambda r: r['saveAttempts'][0].update(sha256='c'*64),
            lambda r: r['directSave']['savedObservation'].update(jobId='other'),
            lambda r: r['directSave']['savedObservation'].update(outputProfileId='p5-10gb'),
            lambda r: r['indexedOwnership']['identity'].update(namespace='other-r2'),
            lambda r: r['output'].update(bytes=2**30+1), lambda r: r['output'].update(bytes=True),
            lambda r: r['settings'].update(executionRoute='legacy'),
            lambda r: r['output']['info'].update(audioCodecs=[]),
        ]
        for index, mutate in enumerate(mutations):
            value = receipt(); mutate(value)
            with self.subTest(index=index), self.assertRaises(Exception): self.verify(value)

    def test_download_request_cannot_replace_saved_fact_or_claim_commit(self):
        before = receipt()
        for kind in ('committed-download', 'different-operation', 'changed-previous-attempt'):
            after = copy.deepcopy(before)
            after['saveAttempts'].append({'id': 'download-1', 'kind': 'download-request', 'resultOperationId': 'operation',
                'inputRevision': 2, 'commitState': 'not-started', 'verificationState': 'not-run'})
            if kind == 'committed-download': after['saveAttempts'][1]['commitState'] = 'committed'
            elif kind == 'different-operation': after['saveAttempts'][1]['resultOperationId'] = 'old-operation'
            else: after['saveAttempts'][0]['id'] = 'replacement'
            with self.subTest(kind=kind), self.assertRaises(Exception): self.verify(after, after_download=True, previous=before)

    def test_browser_expressions_parse_without_rewriting_product_code(self):
        sources = [probe.PICKER, probe.CLEANUP_FAULT, probe.SNAPSHOT, probe.READ_SAVED, probe.CHECK_INTERNAL, probe.REMOVE_OWN_OUTPUT]
        script = 'for(const source of '+json.dumps(sources)+')new Function("return ("+source.trim().replace(/;$/, "")+");");'
        result = subprocess.run(['node', '--input-type=module'], input=script, text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_cleanup_recovery_keeps_original_failure_and_save_facts(self):
        before=receipt(); before.update(status='failed',internalIndexCleanup='pending')
        before['indexedOwnership']['status']='retained'
        self.assertEqual(self.verify(before,cleanup_failure=True)['status'],'PASS')
        after=copy.deepcopy(before)
        after['internalCleanupRecovery']={'status':'complete','identity':before['indexedOwnership']['identity'],
                                         'externalSaveState':'NOT_APPLICABLE'}
        self.assertEqual(probe.verify_cleanup_recovery(before,after)['status'],'PASS')
        for mutate in [lambda r:r.update(status='saved'),lambda r:r.update(saveCompleted=False),
                       lambda r:r['internalCleanupRecovery'].update(identity={'operationId':'other'}),
                       lambda r:r['internalCleanupRecovery'].update(externalSaveState='verified'),
                       lambda r:r.update(internalIndexCleanup='complete')]:
            bad=copy.deepcopy(after); mutate(bad)
            with self.assertRaises(Exception):probe.verify_cleanup_recovery(before,bad)


if __name__ == '__main__': unittest.main()
