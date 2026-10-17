"""Bounded evidence publication tests; no browser or actual media generation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('long_bundle_probe', ROOT/'development/vr180/p5-long-prototype/probe-long.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
bundle = probe.evidence_bundle
IDENTITY = {'repository': 'Kushyameln01/kushyameln-works', 'commit': '1'*40,
            'ref': 'refs/heads/codex/vr180-plan-1-2', 'runId': '123', 'runAttempt': 2, 'job': 'p5-long'}


def fixture(base):
    meta, media = base/'evidence', base/'media'
    meta.mkdir()
    media.mkdir()
    for name in bundle.ROOT_NAMES|bundle.OPTIONAL_ROOT_NAMES:
        (meta/name).write_bytes(b'{"testOnly":true}\n')
    logs = meta/'oracle-logs'
    logs.mkdir()
    (logs/'empty.stderr.log').write_bytes(b'')
    (logs/'diagnostic.stderr.log').write_bytes(b'a bounded diagnostic\n')
    files = []
    for side in ('input', 'output'):
        raw = ('non-media contract fixture '+side).encode()
        (media/(side+'.mp4')).write_bytes(raw)
        files.append({'id': side, 'name': side+'.mp4', 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
    return meta, media, files


def publish(meta, media, files, **kwargs):
    return probe.write_transport_manifests(meta, media, IDENTITY, 'p5-5gb', files, 300,
        {'completeScan': True, 'mediaVerdict': kwargs.pop('verdict', 'FAIL')}, '2'*64,
        run_id=kwargs.pop('run_id', '123-p5-5gb-2'), **kwargs)


class BundleTests(unittest.TestCase):
    def test_both_quality_verdicts_all_raw_entries_empty_logs_and_identity_are_bound(self):
        for verdict in ('PASS', 'FAIL'):
            with self.subTest(verdict=verdict), tempfile.TemporaryDirectory() as temp:
                meta, media, files = fixture(Path(temp))
                original = {path.relative_to(meta).as_posix(): path.read_bytes() for path in meta.rglob('*') if path.is_file()}
                media_stamps = {p.name: (p.stat().st_ino, p.read_bytes()) for p in media.iterdir()}
                manifest = publish(meta, media, files, verdict=verdict)
                raw = (media/'producer-evidence.tar.gz').read_bytes()
                self.assertEqual(manifest['evidenceBundle'], {'name': 'producer-evidence.tar.gz',
                    'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
                self.assertEqual(set(manifest), {'schema', 'status', 'identity', 'profile', 'partBytes', 'totalBytes',
                    'files', 'sourceSHA256', 'generator', 'qualityEvidence', 'evidenceBundle'})
                quality_raw = (meta/'quality-evidence.json').read_bytes()
                self.assertEqual(quality_raw, (media/'quality-evidence.json').read_bytes())
                quality = json.loads(quality_raw)
                self.assertEqual(quality['mediaVerdict'], verdict)
                refs = {entry['path']: entry for entry in quality['evidence']}
                self.assertEqual(refs['oracle-logs/empty.stderr.log']['bytes'], 0)
                with tarfile.open(media/'producer-evidence.tar.gz', 'r:gz') as archive:
                    self.assertEqual(set(archive.getnames()), set(refs)|{'quality-evidence.json'})
                    for member in archive:
                        self.assertTrue(member.isfile())
                        data = archive.extractfile(member).read()
                        expected = manifest['qualityEvidence'] if member.name == 'quality-evidence.json' else refs[member.name]
                        self.assertEqual(len(data), expected['bytes'])
                        self.assertEqual(hashlib.sha256(data).hexdigest(), expected['sha256'])
                        if member.name in original:
                            self.assertEqual(data, original[member.name])
                record = json.loads((meta/'producer-record.json').read_bytes())
                self.assertEqual(record['runId'], '123-p5-5gb-2')
                self.assertEqual(record['identity'], IDENTITY)
                self.assertEqual(record['profile'], 'p5-5gb')
                self.assertEqual(record['files'], files)
                self.assertEqual(record['mediaVerdict'], verdict)
                self.assertEqual(record['sourceProvenance'], refs['source-provenance.json'])
                for name, (inode, data) in media_stamps.items():
                    self.assertEqual((media/name).stat().st_ino, inode)
                    self.assertEqual((media/name).read_bytes(), data)

    def test_unknown_entries_and_symlinks_are_refused_without_deletion(self):
        for kind in ('file', 'directory', 'symlink', 'signed-url'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temp:
                meta, media, files = fixture(Path(temp))
                foreign = meta/'foreign.json'
                if kind == 'file':
                    foreign.write_bytes(b'foreign')
                elif kind == 'directory':
                    foreign.mkdir()
                elif kind == 'symlink':
                    foreign.symlink_to(media/'input.mp4')
                else:
                    foreign = meta/'oracle-logs/diagnostic.stderr.log'
                    foreign.write_text('https://example.invalid/blob?sig=secret')
                with self.assertRaises(ValueError):
                    publish(meta, media, files)
                self.assertTrue(foreign.exists())
                self.assertFalse((media/'source-manifest.json').exists())
                self.assertTrue((media/'input.mp4').exists())

    def test_reference_raw_changed_after_snapshot_cannot_be_relabelled(self):
        with tempfile.TemporaryDirectory() as temp:
            meta, media, files = fixture(Path(temp))
            real_write = probe.write_owned_publication
            def change_after_record(path, data, publications, deadline):
                real_write(path, data, publications, deadline)
                if path.name == 'producer-record.json':
                    (meta/'source-provenance.json').write_bytes(b'changed original record')
            with patch.object(probe, 'write_owned_publication', side_effect=change_after_record):
                with self.assertRaisesRegex(ValueError, 'SOURCE_CHANGED') as caught:
                    publish(meta, media, files)
            self.assertEqual(caught.exception.publicationCleanup['status'], 'REMOVED')
            self.assertFalse((media/'source-manifest.json').exists())
            self.assertFalse((media/'producer-evidence.tar.gz').exists())
            self.assertEqual((meta/'source-provenance.json').read_bytes(), b'changed original record')

    def test_limits_apply_before_artifact_becomes_ready(self):
        for name, maximum in [('FILE_CAP', 8), ('RAW_CAP', 131080), ('MAX_ENTRIES', 8), ('COMPRESSED_CAP', 40), ('TAR_CAP', 100)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                meta, media, files = fixture(Path(temp))
                with patch.object(bundle, name, maximum):
                    with self.assertRaises(ValueError):
                        publish(meta, media, files)
                self.assertFalse((media/'source-manifest.json').exists())
                self.assertFalse((media/'producer-evidence.tar.gz').exists())
                self.assertTrue((meta/'source-provenance.json').exists())

    def test_archive_fsync_failure_preserves_primary_and_cleanup_tries_every_owner(self):
        with tempfile.TemporaryDirectory() as temp:
            meta, media, files = fixture(Path(temp))
            count = 0
            real_fsync, real_unlink = probe.os.fsync, Path.unlink
            attempts = []
            def fail_archive_sync(fd):
                nonlocal count
                count += 1
                if count == 4:
                    raise OSError('INJECTED_ARCHIVE_FSYNC')
                real_fsync(fd)
            def hold_archive(path, *args, **kwargs):
                attempts.append(path.name)
                if path == media/'producer-evidence.tar.gz':
                    raise PermissionError('INJECTED_HOLD')
                return real_unlink(path, *args, **kwargs)
            with patch.object(probe.os, 'fsync', side_effect=fail_archive_sync), patch.object(Path, 'unlink', hold_archive):
                with self.assertRaisesRegex(OSError, 'INJECTED_ARCHIVE_FSYNC') as caught:
                    publish(meta, media, files)
            self.assertEqual(caught.exception.publicationCleanup['status'], 'HOLD')
            self.assertCountEqual(attempts, ['producer-record.json', 'quality-evidence.json', 'quality-evidence.json', 'producer-evidence.tar.gz'])
            self.assertFalse((meta/'producer-record.json').exists())
            self.assertFalse((media/'quality-evidence.json').exists())
            self.assertTrue((media/'producer-evidence.tar.gz').exists())
            self.assertFalse((media/'source-manifest.json').exists())

    def test_cancel_during_bundle_and_deadline_after_manifest_remove_owned_publications(self):
        for case in ('cancel', 'deadline'):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temp:
                meta, media, files = fixture(Path(temp))
                clock = [1.0]
                real_read, real_write = bundle.read_raw, probe.write_owned_publication
                def cancel_archive(path, deadline, cap=bundle.FILE_CAP):
                    if case == 'cancel' and path.name == 'producer-record.json':
                        raise probe.cloud.Deadline('INJECTED_CANCEL_DURING_BUNDLE')
                    return real_read(path, deadline, cap)
                def late_deadline(path, data, publications, deadline):
                    real_write(path, data, publications, deadline)
                    if case == 'deadline' and path.name == 'source-manifest.json':
                        clock[0] = 3.0
                with patch.object(bundle, 'read_raw', side_effect=cancel_archive), \
                     patch.object(probe, 'write_owned_publication', side_effect=late_deadline), \
                     patch.object(probe.time, 'monotonic', side_effect=lambda: clock[0]):
                    with self.assertRaises((probe.cloud.Deadline, TimeoutError)) as caught:
                        publish(meta, media, files, deadline=2.0)
                self.assertEqual(caught.exception.publicationCleanup['status'], 'REMOVED')
                self.assertEqual({path.name for path in media.iterdir()}, {'input.mp4', 'output.mp4'})
                self.assertFalse((meta/'producer-record.json').exists())

    def test_unknown_publication_replacement_is_held_without_skipping_other_cleanup(self):
        with tempfile.TemporaryDirectory() as temp:
            meta, media, files = fixture(Path(temp))
            real_create = bundle.create_bundle
            def replace_then_fail(*args):
                value = real_create(*args)
                path = media/'producer-evidence.tar.gz'
                path.rename(media/'old-inode-for-test')
                path.write_bytes(b'unknown replacement')
                raise RuntimeError('INJECTED_POST_BUNDLE_FAILURE')
            with patch.object(bundle, 'create_bundle', side_effect=replace_then_fail):
                with self.assertRaisesRegex(RuntimeError, 'INJECTED_POST_BUNDLE_FAILURE') as caught:
                    publish(meta, media, files)
            self.assertEqual(caught.exception.publicationCleanup['status'], 'HOLD')
            self.assertEqual((media/'producer-evidence.tar.gz').read_bytes(), b'unknown replacement')
            self.assertFalse((meta/'producer-record.json').exists())
            self.assertFalse((media/'source-manifest.json').exists())

    def test_original_long_run_identity_and_dependency_closure_are_explicit(self):
        with tempfile.TemporaryDirectory() as temp:
            meta, media, files = fixture(Path(temp))
            with self.assertRaisesRegex(Exception, 'PRODUCER_RECORD_RUN_ID'):
                publish(meta, media, files, run_id='123-p5-32-32-2')
            self.assertFalse((media/'source-manifest.json').exists())
        source = (ROOT/probe.SCRIPT_PATH).read_text()
        self.assertIn('SCRIPT_PATH,BUNDLE_SOURCE_PATH,', source)
        self.assertEqual(probe.BUNDLE_SOURCE_PATH, 'development/vr180/p5-long-prototype/evidence-bundle.py')


if __name__ == '__main__':
    unittest.main()
