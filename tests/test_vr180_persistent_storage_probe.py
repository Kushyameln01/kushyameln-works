"""Profile ownership, acceptance and real failure transport; no browser launch."""
import base64
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('persistent_probe', ROOT / 'tools/vr180/probe-persistent-storage.py')
probe = importlib.util.module_from_spec(spec); spec.loader.exec_module(probe)
EXPECTED = probe.expected_witness()
NAMESPACE = 'vr180-persist-' + '1' * 32
ORIGIN = 'http://127.0.0.1:1234'


def observation(action):
    return {'status': 'PASS', 'action': action, 'namespace': NAMESPACE,
            'capabilities': {'secureContext': True, 'moduleWorker': True, 'origin': ORIGIN},
            'readback': copy.deepcopy(EXPECTED), 'committed': action == 'write', 'writerClosed': action == 'write',
            'writeCalls': 16 if action == 'write' else 0, 'writtenBytes': 16777216 if action == 'write' else 0,
            'namespaceRemoved': action != 'write', 'before': {'quotaBytes': 10737418240, 'usageBytes': 0,
                                                            'availableBytes': 10737418240, 'persisted': False}}


class PersistentStorageProbe(unittest.TestCase):
    def test_estimate_below_22GB_does_not_reject_complete_small_storage_trial(self):
        for action in ['write', 'restart-read-and-cleanup']:
            row = observation(action)
            probe.validate_observation(row, action, NAMESPACE, EXPECTED)
            compared = probe.estimate_comparison(row['before'])
            self.assertFalse(compared['estimateAtLeastDesign'])
            self.assertFalse(compared['usedAsAcceptanceGate'])
            self.assertEqual(compared['designConcurrentBytes'], 22_000_000_000)
        for change in ['hash', 'commit', 'cleanup', 'read-end']:
            row = observation('write' if change == 'commit' else 'restart-read-and-cleanup')
            if change == 'hash': row['readback']['sha256'] = '0' * 64
            if change == 'commit': row['committed'] = False
            if change == 'cleanup': row['namespaceRemoved'] = False
            if change == 'read-end': row['readback']['endReached'] = False
            with self.subTest(change=change), self.assertRaises(Exception):
                probe.validate_observation(row, row['action'], NAMESPACE, EXPECTED)

    def test_new_owned_profile_only_and_no_cleanup_before_browser_close_or_after_unknown_content(self):
        with tempfile.TemporaryDirectory(prefix='vr180-profile-owner-') as temp:
            parent = Path(temp); existing = parent / 'profile'; existing.mkdir(); (existing / 'personal').write_text('keep')
            owned = probe.create_owned_profile(parent)
            self.assertNotEqual(owned['path'], existing)
            (owned['path'] / 'only-ours').write_bytes(b'x' * 100)
            (owned['path'] / 'external-link').symlink_to(existing, target_is_directory=True)
            measured = probe.profile_snapshot(owned['path'])
            self.assertEqual(measured['logicalFileBytes'], 100); self.assertEqual(measured['symlinksNotFollowed'], 1)
            owned['browserClosed'] = False
            with self.assertRaisesRegex(Exception, 'closure unverified'): probe.cleanup_owned_profile(owned)
            owned['browserClosed'] = True; owned['unknownContent'] = True
            with self.assertRaisesRegex(Exception, 'Unknown namespace'): probe.cleanup_owned_profile(owned)
            owned['unknownContent'] = False
            (owned['container'] / 'unknown').write_text('keep')
            with self.assertRaisesRegex(Exception, 'Unknown profile-container'): probe.cleanup_owned_profile(owned)
            (owned['container'] / 'unknown').unlink()
            self.assertEqual(probe.cleanup_owned_profile(owned)['status'], 'REMOVED')
            self.assertEqual((existing / 'personal').read_text(), 'keep'); self.assertFalse(owned['container'].exists())

    def test_changed_ownership_marker_refuses_cleanup(self):
        with tempfile.TemporaryDirectory(prefix='vr180-profile-owner-') as temp:
            owned = probe.create_owned_profile(temp); marker = owned['container'] / 'owner.json'
            marker.write_text('{}')
            with self.assertRaisesRegex(Exception, 'owner record differs'): probe.cleanup_owned_profile(owned)
            self.assertTrue(owned['path'].is_dir())
            marker.write_text(json.dumps(owned['owner'])); probe.cleanup_owned_profile(owned)

    def test_two_sessions_use_exact_same_owned_profile_and_close_before_relaunch(self):
        with tempfile.TemporaryDirectory(prefix='vr180-profile-session-') as temp:
            owned = probe.create_owned_profile(temp); report = {'sessions': []}; launch_args = []; events = []
            class Browser:
                version = 'fake-contract-only'
                connected = True
                def is_connected(self): return self.connected
            class Page:
                def __init__(self, action): self.action = action; self.listeners = {}
                def set_default_timeout(self, _): pass
                def on(self, name, callback): self.listeners[name] = callback
                def goto(self, *_args, **_kwargs): pass
                def evaluate(self, text, _args=None):
                    if text == probe.PAGE:
                        self.listeners['worker'](types.SimpleNamespace(url=ORIGIN + '/probe-worker.mjs'))
                        return None
                    return observation(self.action)
                def wait_for_function(self, *_args, **_kwargs): pass
            class Context:
                def __init__(self, action): self.action = action; self.browser = Browser()
                def route(self, *_args): pass
                def new_page(self): return Page(self.action)
                def close(self): self.browser.connected = False; events.append('close:' + self.action)
            def launch(**kwargs):
                action = ['write', 'restart-read-and-cleanup'][len(launch_args)]
                if launch_args: self.assertEqual(events[-1], 'close:write')
                launch_args.append(kwargs); events.append('launch:' + action); return Context(action)
            playwright = types.SimpleNamespace(chromium=types.SimpleNamespace(launch_persistent_context=launch))
            for action in ['write', 'restart-read-and-cleanup']:
                probe.run_session(playwright, owned, ORIGIN, NAMESPACE, action, EXPECTED, Path(temp), report)
            self.assertEqual(launch_args[0], launch_args[1]); self.assertEqual(launch_args[0]['user_data_dir'], str(owned['path']))
            self.assertTrue(launch_args[0]['chromium_sandbox']); self.assertNotIn('args', launch_args[0])
            self.assertTrue(all(row['status'] == 'PASS' and row['browserClosed'] for row in report['sessions']))
            probe.cleanup_owned_profile(owned)

    def test_embedded_sources_parse_and_only_required_hash_module_is_served(self):
        subprocess.run(['node', '--input-type=module', '--check'], input=probe.WORKER, text=True, check=True, capture_output=True)
        subprocess.run(['node', '--input-type=module', '--check'], input='(' + probe.PAGE + ')', text=True, check=True, capture_output=True)
        self.assertEqual(probe.SOURCES, ['docs/shared/vr180/sha256.mjs'])
        self.assertTrue((ROOT / probe.SOURCES[0]).is_file())
        self.assertNotIn('navigator.storage.persist()', probe.WORKER)

    def test_unowned_namespace_observation_survives_real_session_finally_and_profile_cleanup(self):
        for reason in ['NAMESPACE_EXISTS', 'WITNESS_NOT_EMPTY', 'UNKNOWN_NAMESPACE_ENTRY', 'TypeMismatchError']:
            with self.subTest(reason=reason), tempfile.TemporaryDirectory(prefix='vr180-profile-unknown-') as temp:
                owned = probe.create_owned_profile(temp)
                foreign = owned['path'] / 'foreign-payload'; foreign.write_text('preserve')
                class Browser:
                    version = 'fake-contract-only'
                    connected = True
                    def is_connected(self): return self.connected
                class Page:
                    def set_default_timeout(self, _): pass
                    def on(self, *_args): pass
                    def goto(self, *_args, **_kwargs): pass
                    def evaluate(self, text, _args=None):
                        if text == probe.PAGE: return None
                        return {'status': 'FAIL', 'action': 'write', 'namespace': NAMESPACE,
                                'error': {'name': 'TypeMismatchError' if reason == 'TypeMismatchError' else 'Error',
                                          'message': 'Existing entry has another type' if reason == 'TypeMismatchError' else reason}}
                    def wait_for_function(self, *_args, **_kwargs): pass
                class Context:
                    def __init__(self): self.browser = Browser()
                    def route(self, *_args): pass
                    def new_page(self): return Page()
                    def close(self): self.browser.connected = False
                playwright = types.SimpleNamespace(chromium=types.SimpleNamespace(launch_persistent_context=lambda **_: Context()))
                report = {'sessions': []}
                with self.assertRaisesRegex(Exception, 'did not pass'):
                    probe.run_session(playwright, owned, ORIGIN, NAMESPACE, 'write', EXPECTED, Path(temp), report)
                self.assertTrue(owned['browserClosed'])
                self.assertTrue(owned['unknownContent'])
                with self.assertRaisesRegex(Exception, 'Unknown namespace'):
                    probe.cleanup_owned_profile(owned)
                self.assertEqual(foreign.read_text(), 'preserve')

    def test_preflight_failure_emits_complete_bounded_archive_without_profile_creation(self):
        with tempfile.TemporaryDirectory(prefix='vr180-persistent-transport-') as temp:
            output = Path(temp) / 'result'; log = io.StringIO()
            with patch.dict(os.environ, {'GITHUB_REPOSITORY': 'rejected/test', 'GITHUB_RUN_ID': 'contract', 'GITHUB_RUN_ATTEMPT': '6'}), \
                 patch.object(sys, 'argv', [str(probe.__file__), '--output', str(output)]), contextlib.redirect_stdout(log):
                code = probe.main()
            self.assertEqual(code, 1); report = json.loads((output / 'run.json').read_text())
            self.assertEqual(report['runId'], 'contract-persistent-storage-6'); self.assertNotEqual(report['status'], 'PASS')
            self.assertEqual(report['profileCleanup']['status'], 'NOT_CREATED'); self.assertEqual(report['sessions'], [])
            self.assertEqual(sorted(path.name for path in Path(temp).iterdir()), ['result'])
            lines = log.getvalue().splitlines()
            begin = [json.loads(line.split(' ', 1)[1]) for line in lines if line.startswith('VR180_EVIDENCE_BEGIN ')]
            end = [json.loads(line.split(' ', 1)[1]) for line in lines if line.startswith('VR180_EVIDENCE_END ')]
            self.assertEqual(len(begin), 1); self.assertEqual(len(end), 1); self.assertTrue(begin[0]['complete'])
            self.assertEqual(begin[0]['runId'], report['runId'])
            chunks = [line.split(' ', 2)[2] for line in lines if line.startswith('VR180_EVIDENCE_CHUNK ')]
            payload = base64.b64decode(''.join(chunks), validate=True)
            self.assertEqual(hashlib.sha256(payload).hexdigest(), begin[0]['sha256']); self.assertEqual(end[0]['sha256'], begin[0]['sha256'])
            with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as archive:
                manifest = json.load(archive.extractfile('manifest.json')); self.assertEqual(manifest['runId'], report['runId'])
                for file in manifest['files']:
                    raw = archive.extractfile(file['name']).read()
                    self.assertEqual(len(raw), file['bytes']); self.assertEqual(hashlib.sha256(raw).hexdigest(), file['sha256'])
                self.assertEqual(json.load(archive.extractfile('run.json')), report)


if __name__ == '__main__':
    unittest.main()
