"""Contract-only synthetic reports/bytes; these are not native media tests."""
import importlib.util
import contextlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import time
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('calibration_wrapper', HERE/'prepare.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def fixture(directory, *, verdict='PASS'):
    """Tiny non-media bytes and explicit test reports, never a native claim."""
    original = directory/'calibration'
    meta, media = original/'evidence', original/'media'
    meta.mkdir(parents=True)
    media.mkdir()
    identity = {'repository': 'Kushyameln01/kushyameln-works', 'commit': 'a'*40,
                'ref': 'refs/heads/codex/vr180-plan-1-2', 'runId': '1234', 'runAttempt': 2,
                'job': p.JOB}
    sources = {name: p.sha((p.ROOT/name).read_bytes()) for name in p.ORIGINAL_SOURCES+[p.SCRIPT]}
    files = []
    for side in ('input', 'output'):
        raw = ('non-media contract fixture '+side).encode()
        (media/(side+'.mp4')).write_bytes(raw)
        files.append({'name': side+'.mp4', 'bytes': len(raw), 'sha256': p.sha(raw)})
    run_id = '1234-p5-32-32-2'
    generation = {'frames': 300, 'packets': 300, 'sha256': files[0]['sha256'],
                  'cleanup': {'directoryRemoved': True, 'indexReservedBytes': 0}}
    conversion = {'saved': {'committed': True, 'bytes': files[1]['bytes'], 'sha256': files[1]['sha256']}}
    observed = {'status': 'READY_FOR_DOWNLOAD', 'caseName': '32-32', 'files': files,
                'frames': 300, 'fps': 30, 'seconds': 10, 'silent': True,
                'heldLocks': 0, 'unhandledCount': 0, 'unhandledErrors': [],
                'generation': generation, 'conversion': conversion,
                'conversionCleanup': {'inputDirectoryRemoved': True, 'outputDirectoryRemoved': True,
                                      'metrics': {'indexReservedAfterCleanup': 0}}}
    verified = {'schema': 'vr180-independent-large-verifier-v1', 'status': verdict, 'completeScan': True,
                'frames': 300, 'mode': 'convert', 'settings': {'layout': 'sbs', 'fov': 180, 'eyeSize': 512},
                'events': {'inputCountByEye': [3, 3], 'allFrameFlagsEqual': verdict == 'PASS'},
                'redFrameIndicesByEye': [[29, 30, 31], [29, 30, 31]],
                'scans': {n: {'endReached': True} for n in p.REQUIRED_SCANS},
                'verifierSHA256': sources['tools/vr180/verify-conversion-large.py']}
    for side, entry in zip(('input', 'output'), files):
        verified[side+'Bytes'], verified[side+'SHA256'] = entry['bytes'], entry['sha256']
    packets = {side: {'packets': 300, 'completeScan': True,
                     'scans': {'video-packets': {'endReached': True}}} for side in ('input', 'output')}
    manifest = {'schema': 'vr180-calibration-media-artifact-v1', 'runId': run_id,
                'checkoutCommit': identity['commit'], 'case': '32-32', 'files': files,
                'independentVerification': verdict, 'completeScan': True, 'calibrationVerdict': verdict,
                'verifierSHA256': verified['verifierSHA256']}
    report = {'schema': 'vr180-p5-ten-second-calibration-v1', 'status': 'READY_FOR_ARTIFACT_RECOVERY',
              'runId': run_id, 'checkoutCommit': identity['commit'], 'case': '32-32',
              'sourceHashesBefore': {n: sources[n] for n in p.ORIGINAL_SOURCES},
              'sourceHashesAfter': {n: sources[n] for n in p.ORIGINAL_SOURCES},
              'harnessSHA256': sources[p.PRODUCER], 'sharedHarnessSHA256': sources['tools/vr180/cloud-validate.py'],
              'frames': 300, 'fps': 30, 'seconds': 10, 'silent': True, 'publicProfileChanged': False,
              'completeCloudMedia': True, 'mediaArtifactReady': True, 'pageErrors': [],
              'cleanup': {'status': 'REMOVED', 'heldLocks': 0}, 'mediaManifest': manifest,
              'packetStatistics': packets, 'browserMetrics': {'generation': generation, 'conversion': conversion},
              'independentVerification': verdict, 'calibrationVerdict': verdict}
    documents = {n: {'testOnly': True} for n in p.REQUIRED-{'manifest.json'}}
    documents.update({'run.json': report, 'browser-observations.json': observed,
                      'independent-verification.json': verified, 'packet-statistics.json': packets})
    for name in ('source-inventory.json', 'private-source-inventory.json'):
        documents[name]['checkoutCommit'] = identity['commit']
    documents['environment.json']['status'] = 'READY'
    documents['fork-build-result.json'].update(status='PASS', variant='combined-input-output',
        baseline={'status': 'PASS', 'comparison': {'identical': True}})
    for name, value in documents.items():
        (meta/name).write_bytes(p.json_bytes(value))
    (meta/'oracle-logs').mkdir()
    (meta/'oracle-logs'/'input-frames.stderr.log').write_bytes(b'')
    (media/'media-manifest.json').write_bytes(p.json_bytes(manifest))
    refresh_inventory(meta, run_id)
    return original, identity, sources


def refresh_inventory(meta, run_id='1234-p5-32-32-2'):
    entries = [{'name': x.relative_to(meta).as_posix(), 'bytes': x.stat().st_size,
                'sha256': p.sha(x.read_bytes())} for x in sorted(meta.rglob('*'))
               if x.is_file() and x.name != 'manifest.json']
    (meta/'manifest.json').write_bytes(p.json_bytes({'schema': 'vr180-evidence-manifest-v1',
        'runId': run_id, 'manifestExcludesItself': True, 'files': entries}))


def update(original, name, mutate):
    path = original/'evidence'/name
    value = p.parsed(path.read_bytes())
    mutate(value)
    path.write_bytes(p.json_bytes(value))
    refresh_inventory(original/'evidence')


def prepare_fixture(directory, *, verdict='PASS'):
    original, identity, sources = fixture(directory, verdict=verdict)
    manifest = p.prepare(original, directory/'wrapped', identity, sources, p.load_calibration(),
                         recheck_sources=lambda: sources, deadline=time.monotonic()+30)
    return manifest, original, directory/'wrapped'


class PrepareTests(unittest.TestCase):
    def test_complete_pass_and_fail_preserve_original_and_all_bundle_entries(self):
        for verdict in ('PASS', 'FAIL'):
            with self.subTest(verdict=verdict), tempfile.TemporaryDirectory() as td:
                manifest, original, out = prepare_fixture(Path(td), verdict=verdict)
                self.assertEqual(manifest['qualityEvidence']['status'], verdict)
                self.assertEqual(manifest['files'][0]['id'], 'input')
                self.assertEqual(manifest['generator']['producerReportRunId'], '1234-p5-32-32-2')
                quality_raw = (out/'media/quality-evidence.json').read_bytes()
                self.assertEqual(quality_raw, (out/'evidence/quality-evidence.json').read_bytes())
                quality = p.parsed(quality_raw)
                refs = {e['path']: e for e in quality['evidence']}
                self.assertEqual(refs['calibration/oracle-logs/input-frames.stderr.log']['bytes'], 0)
                with tarfile.open(out/'media/producer-evidence.tar.gz', 'r:gz') as tar:
                    self.assertEqual(set(tar.getnames()), set(refs)|{'quality-evidence.json'})
                    for member in tar:
                        self.assertTrue(member.isfile())
                        raw = tar.extractfile(member).read()
                        if member.name == 'quality-evidence.json':
                            self.assertEqual(raw, quality_raw)
                        else:
                            self.assertEqual(p.sha(raw), refs[member.name]['sha256'])
                for entry in manifest['files']:
                    self.assertEqual((original/'media'/entry['name']).read_bytes(), (out/'media'/entry['name']).read_bytes())
                for path in (original/'evidence').rglob('*'):
                    if path.is_file():
                        self.assertEqual(path.read_bytes(), (out/'evidence/calibration'/path.relative_to(original/'evidence')).read_bytes())

    def test_original_source_closure_matches_fixed_calibration_dependencies(self):
        c = p.load_calibration()
        expected = sorted(set(c.indexed.SOURCES + ['development/vr180/index-prototype/job-owner.mjs',
            'development/vr180/p5-calibration-prototype/frame.mjs',
            'development/vr180/p5-calibration-prototype/worker.mjs', p.PRODUCER,
            'tools/vr180/probe-output-index.py', 'tools/vr180/probe-indexed-conversion.py',
            'tools/vr180/cloud-validate.py', 'tools/vr180/verify-conversion-large.py', 'tools/vr180/verify-metadata.py']))
        self.assertEqual(p.ORIGINAL_SOURCES, expected)

    def test_old_run_attempt_commit_case_sources_and_verdict_are_rejected(self):
        changes = [lambda x: x.update(runId='1233-p5-32-32-2'),
                   lambda x: x.update(runId='1234-p5-32-32-1'),
                   lambda x: x.update(checkoutCommit='b'*40), lambda x: x.update(case='48-24'),
                   lambda x: x['sourceHashesAfter'].update({p.PRODUCER: '0'*64}),
                   lambda x: x.update(calibrationVerdict='FAIL')]
        for change in changes:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as td:
                directory = Path(td)
                original, identity, sources = fixture(directory)
                update(original, 'run.json', change)
                with self.assertRaises(ValueError):
                    p.prepare(original, directory/'out', identity, sources, p.load_calibration(),
                              recheck_sources=lambda: sources, deadline=time.monotonic()+30)
                self.assertFalse((directory/'out/media/source-manifest.json').exists())

    def test_complete_scan_flag_cannot_override_missing_eof_or_native_cleanup(self):
        cases = [('independent-verification.json', lambda x: x['scans']['actual-rgb'].update(endReached=False)),
                 ('packet-statistics.json', lambda x: x['output'].update(completeScan=False)),
                 ('browser-observations.json', lambda x: x.update(heldLocks=1)),
                 ('browser-observations.json', lambda x: x['conversion']['saved'].update(committed=False))]
        for name, change in cases:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as td:
                directory = Path(td)
                original, identity, sources = fixture(directory)
                update(original, name, change)
                with self.assertRaises(ValueError):
                    p.prepare(original, directory/'out', identity, sources, p.load_calibration(),
                              recheck_sources=lambda: sources, deadline=time.monotonic()+30)
                self.assertFalse((directory/'out').exists())

    def test_unsafe_unknown_empty_missing_or_signed_evidence_rejected(self):
        for case in ('unknown', 'symlink', 'missing', 'manifest-tamper', 'signed-url'):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as td:
                original, _, _ = fixture(Path(td))
                meta = original/'evidence'
                if case == 'unknown':
                    (meta/'extra.bin').write_bytes(b'foreign')
                elif case == 'symlink':
                    (meta/'foreign').symlink_to(original/'media', target_is_directory=True)
                elif case == 'missing':
                    (meta/'environment.json').unlink()
                elif case == 'signed-url':
                    (meta/'environment.json').write_text('{"url":"https://example.invalid/a?sig=secret"}')
                    refresh_inventory(meta)
                else:
                    (meta/'environment.json').write_bytes(b'{}')
                with self.assertRaises(ValueError):
                    p.evidence_inventory(meta)

    def test_copy_hash_failure_rolls_back_only_owned_copies(self):
        with tempfile.TemporaryDirectory() as td:
            directory = Path(td)
            original, identity, sources = fixture(directory)
            target = original/'media/output.mp4'
            target.write_bytes(b'x'*target.stat().st_size)
            with self.assertRaisesRegex(ValueError, 'MEDIA_COPY_HASH_DIFFERS'):
                p.prepare(original, directory/'out', identity, sources, p.load_calibration(),
                          recheck_sources=lambda: sources, deadline=time.monotonic()+30)
            self.assertTrue(target.exists())
            self.assertFalse(any(x.is_file() for x in (directory/'out').rglob('*')))

    def test_source_change_and_deadline_before_publish_leave_no_ready_manifest(self):
        for case in ('source', 'deadline'):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as td:
                directory = Path(td)
                original, identity, sources = fixture(directory)
                def recheck():
                    if case == 'deadline':
                        raise ValueError('WRAPPER_DEADLINE')
                    return {}
                with self.assertRaises(ValueError):
                    p.prepare(original, directory/'out', identity, sources, p.load_calibration(),
                              recheck_sources=recheck, deadline=time.monotonic()+30)
                self.assertFalse(any(x.is_file() for x in (directory/'out').rglob('*')))

    def test_rollback_retains_foreign_inode_and_existing_output(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td)/'owned'
            publications = p.Publications()
            publications.write(path, b'ours')
            # Keep the original inode alive so replacement cannot reuse it.
            path.rename(Path(td)/'old')
            path.write_bytes(b'foreign')
            self.assertEqual(publications.rollback(), {'status': 'HOLD', 'attempted': 1,
                'held': [{'path': str(path), 'reason': 'UNKNOWN_REPLACEMENT'}]})
            self.assertEqual(path.read_bytes(), b'foreign')
            original, identity, sources = fixture(Path(td))
            with self.assertRaisesRegex(ValueError, 'OUTPUT_EXISTS'):
                p.prepare(original, path, identity, sources, p.load_calibration(),
                          recheck_sources=lambda: sources, deadline=time.monotonic()+30)

    def test_deadline_after_manifest_write_rolls_back_ready_marker(self):
        with tempfile.TemporaryDirectory() as td:
            directory = Path(td)
            original, identity, sources = fixture(directory)
            clock = [1.0]
            real_write = p.Publications.write
            def expire_after_manifest(owner, path, raw):
                real_write(owner, path, raw)
                if path.name == 'source-manifest.json':
                    clock[0] = 3.0
            with mock.patch.object(p.time, 'monotonic', side_effect=lambda: clock[0]), \
                 mock.patch.object(p.Publications, 'write', expire_after_manifest):
                with self.assertRaisesRegex(ValueError, 'WRAPPER_DEADLINE'):
                    p.prepare(original, directory/'out', identity, sources, p.load_calibration(),
                              recheck_sources=lambda: sources, deadline=2.0)
            self.assertFalse(any(x.is_file() for x in (directory/'out').rglob('*')))
            self.assertTrue((original/'media/input.mp4').exists())

    def test_unknown_metadata_is_not_adopted_or_deleted_and_copied_raw_cannot_drift(self):
        for case in ('unknown', 'changed'):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as td:
                directory = Path(td)
                original, identity, sources = fixture(directory)
                real_write = p.Publications.write
                def inject(owner, path, raw):
                    real_write(owner, path, raw)
                    if path.name == 'wrapper-provenance.json':
                        target = path.parent/('foreign.json' if case == 'unknown' else 'calibration/environment.json')
                        target.write_bytes(b'{"foreign":true}')
                with mock.patch.object(p.Publications, 'write', inject):
                    with self.assertRaisesRegex(ValueError, 'WRAPPER_UNKNOWN_OR_MISSING_METADATA|WRAPPER_COPIED_METADATA_CHANGED'):
                        p.prepare(original, directory/'out', identity, sources, p.load_calibration(),
                                  recheck_sources=lambda: sources, deadline=time.monotonic()+30)
                self.assertFalse((directory/'out/media/source-manifest.json').exists())
                if case == 'unknown':
                    self.assertEqual((directory/'out/evidence/foreign.json').read_bytes(), b'{"foreign":true}')
                self.assertTrue((original/'evidence/environment.json').exists())

    def test_cleanup_failure_attempts_all_owners_and_preserves_primary_error(self):
        with tempfile.TemporaryDirectory() as td:
            directory = Path(td)
            original, identity, sources = fixture(directory)
            target = original/'media/output.mp4'
            target.write_bytes(b'x'*target.stat().st_size)
            real_unlink = Path.unlink
            attempts = []
            def deny_output(path, *args, **kwargs):
                attempts.append(path.name)
                if path == directory/'out/media/output.mp4':
                    raise PermissionError('injected owner cleanup failure')
                return real_unlink(path, *args, **kwargs)
            with mock.patch.object(Path, 'unlink', deny_output):
                with self.assertRaisesRegex(ValueError, 'MEDIA_COPY_HASH_DIFFERS') as caught:
                    p.prepare(original, directory/'out', identity, sources, p.load_calibration(),
                              recheck_sources=lambda: sources, deadline=time.monotonic()+30)
            self.assertEqual(attempts, ['output.mp4', 'input.mp4'])
            self.assertEqual(caught.exception.wrapperCleanup['status'], 'HOLD')
            self.assertEqual(caught.exception.wrapperCleanup['attempted'], 2)
            self.assertEqual(caught.exception.wrapperCleanup['held'][0]['reason'], 'CLEANUP_FAILED')
            self.assertFalse((directory/'out/media/input.mp4').exists())
            self.assertTrue((directory/'out/media/output.mp4').exists())
            self.assertTrue(target.exists())

    def test_size_bounds_and_json_duplicate_rejected(self):
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_JSON_KEY'):
            p.parsed(b'{"a":1,"a":2}')
        for cap, expected in [(20, 'MEDIA_DESCRIPTOR'), (60, 'MEDIA_PAIR_BOUND')]:
            with self.subTest(cap=cap), tempfile.TemporaryDirectory() as td:
                original, identity, sources = fixture(Path(td))
                with mock.patch.object(p, 'FILE_CAP' if cap == 20 else 'PAIR_CAP', cap):
                    with self.assertRaisesRegex(ValueError, expected):
                        p.validate_calibration(p.evidence_inventory(original/'evidence'),
                            p.parsed((original/'media/media-manifest.json').read_bytes()), identity, sources, p.load_calibration())

    def test_main_wrong_identity_has_bounded_failure_and_no_output(self):
        with tempfile.TemporaryDirectory() as td, mock.patch.dict(p.os.environ, {}, clear=True):
            out = Path(td)/'never-created'
            self.assertEqual(p.main(['--calibration-output', str(Path(td)/'input'), '--output', str(out)]), 1)
            self.assertFalse(out.exists())

    def test_main_reports_cleanup_hold_without_replacing_primary_error(self):
        with tempfile.TemporaryDirectory() as td:
            directory = Path(td)
            original, identity, sources = fixture(directory)
            target = original/'media/output.mp4'
            target.write_bytes(b'x'*target.stat().st_size)
            environment = {'RUNNER_TEMP': td, **{'GITHUB_'+k: str(identity[v]) for k, v in [
                ('REPOSITORY', 'repository'), ('SHA', 'commit'), ('REF', 'ref'),
                ('RUN_ID', 'runId'), ('RUN_ATTEMPT', 'runAttempt'), ('JOB', 'job')]}}
            real_unlink = Path.unlink
            def deny_output(path, *args, **kwargs):
                if path == directory/'out/media/output.mp4':
                    raise PermissionError('injected')
                return real_unlink(path, *args, **kwargs)
            captured = io.StringIO()
            with mock.patch.dict(p.os.environ, environment, clear=True), \
                 mock.patch.object(p, 'source_hashes', return_value=sources), \
                 mock.patch.object(Path, 'unlink', deny_output), contextlib.redirect_stdout(captured):
                self.assertEqual(p.main(['--calibration-output', str(original), '--output', str(directory/'out')]), 1)
            result = json.loads(captured.getvalue())
            self.assertEqual(result['status'], 'FAIL')
            self.assertEqual(result['error'], 'ValueError: MEDIA_COPY_HASH_DIFFERS')
            self.assertEqual(result['cleanup']['status'], 'HOLD')
            self.assertEqual(result['cleanup']['attempted'], 2)
            self.assertEqual(result['cleanup']['heldCount'], 1)
            self.assertEqual(result['cleanup']['held'][0]['reason'], 'CLEANUP_FAILED')
            self.assertFalse(result['mediaArtifactReady'])


if __name__ == '__main__':
    unittest.main()
