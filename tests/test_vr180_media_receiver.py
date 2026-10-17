"""Real bounded metadata bytes with mocked codec results; no native media claim."""
import copy
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import time
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
m = load('media_receiver', ROOT/'tools/vr180/receive-media-evidence.py')
f = load('calibration_contract_fixture', ROOT/'development/vr180/p5-receiver-calibration/test_prepare.py')


class MediaReceiverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.manifest, self.original, self.wrapped = f.prepare_fixture(self.root)
        self.manifest['provenance'] = {'generatorScriptPath': m.PREPARE, 'generatorScriptSHA256': self.manifest['sourceSHA256']}
        self.manifest['partCount'] = 2
        for n, file in enumerate(self.manifest['files'], 1): file['parts'] = [{'artifact': {'id': n}}]
        identity = self.manifest['identity']
        self.manifest['evidenceBundle']['artifact'] = {'id': 3,
            'name': f"vr180-seg-{m.PROFILE}-{identity['runId']}-{identity['runAttempt']}-{identity['job']}-evidence",
            'sizeBytes': self.manifest['evidenceBundle']['bytes']+132, 'digest': 'sha256:'+'0'*64}
        self.bundle = self.wrapped/'media/producer-evidence.tar.gz'; self.output = self.root/'recovered'

    def unpack(self, manifest=None):
        return m.unpack_bundle(self.bundle, manifest or self.manifest, self.output, time.time()+30)

    def rewrite_tar(self, mutate):
        rows = []
        with tarfile.open(self.bundle, 'r:gz') as t:
            for entry in t: rows.append((entry, t.extractfile(entry).read()))
        rows = mutate(rows)
        with tarfile.open(self.bundle, 'w:gz') as t:
            for entry, raw in rows: t.addfile(entry, io.BytesIO(raw) if entry.isfile() else None)
        raw = self.bundle.read_bytes()
        self.manifest['evidenceBundle'].update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())

    def test_actual_wrapper_tar_all_refs_empty_logs_and_original_source_bindings(self):
        quality, proof = self.unpack()
        self.assertEqual(quality['mediaVerdict'], 'PASS'); self.assertTrue(proof['allReferencesVerified'])
        self.assertEqual((self.output/'calibration/oracle-logs/input-frames.stderr.log').read_bytes(), b'')
        source = lambda names, commit: {n: hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in names}
        checked = m.validate_original_records(self.output, self.manifest, source)
        self.assertEqual(checked['status'], 'PASS')
        m.validate_generator(self.manifest, source([m.PREPARE, m.CALIBRATION], 'a'*40))

    def test_complete_producer_quality_fail_is_preserved(self):
        with tempfile.TemporaryDirectory() as td:
            manifest, _, out = f.prepare_fixture(Path(td), verdict='FAIL')
            manifest['provenance'] = {'generatorScriptSHA256': manifest['sourceSHA256']}
            quality, _ = m.unpack_bundle(out/'media/producer-evidence.tar.gz', manifest, Path(td)/'received', time.time()+30)
            self.assertEqual(quality['mediaVerdict'], 'FAIL'); self.assertTrue(quality['completeScan'])

    def test_tar_member_change_fails_reference_hash_before_writing(self):
        def mutate(rows):
            for entry, raw in rows:
                if entry.name == 'calibration/environment.json': raw = raw.replace(b'true', b'null')
                yield entry, raw
        self.rewrite_tar(mutate)
        with self.assertRaisesRegex(ValueError, 'QUALITY_REF_BYTES'): self.unpack()
        self.assertFalse(self.output.exists())

    def test_unreferenced_symlink_duplicate_and_traversal_are_rejected(self):
        for name, link in [('foreign.json', False), ('foreign-link', True), ('../escape', False), ('quality-evidence.json', False)]:
            original_bytes = self.bundle.read_bytes(); original_manifest = copy.deepcopy(self.manifest)
            def mutate(rows):
                extra = tarfile.TarInfo(name)
                if link: extra.type = tarfile.SYMTYPE; extra.linkname = 'quality-evidence.json'
                return rows+[(extra, b'')]
            self.rewrite_tar(mutate)
            with self.assertRaises(ValueError): self.unpack()
            self.assertFalse(self.output.exists())
            self.bundle.write_bytes(original_bytes); self.manifest = original_manifest

    def test_compressed_expansion_and_expired_deadline_are_rejected(self):
        raw = gzip.compress(b'\0'*(17*m.MIB+1)); self.bundle.write_bytes(raw)
        self.manifest['evidenceBundle'].update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        with self.assertRaisesRegex(ValueError, 'BUNDLE_EXPANDED_LIMIT'): self.unpack()
        with self.assertRaisesRegex(ValueError, 'MEDIA_RECEIVER_DEADLINE'):
            m.unpack_bundle(self.bundle, self.manifest, self.output, time.time()-1)

    def test_original_media_and_source_cannot_be_relabelled(self):
        self.unpack(); bad = copy.deepcopy(self.manifest); bad['files'][0]['sha256'] = '0'*64
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_MEDIA_BINDING'):
            m.validate_original_records(self.output, bad, lambda *args: {})
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_SOURCE_CLOSURE'):
            m.validate_original_records(self.output, self.manifest, lambda *args: {})

    def test_fresh_complete_quality_fail_is_distinct_from_incomplete_scan(self):
        cal = f.p.load_calibration(); evidence = self.root/'oracle'; evidence.mkdir()
        verified = {'status': 'FAIL', 'completeScan': True, 'frames': 300, 'decodedFramesCompared': 300,
                    'events': {'inputCountByEye': [3,3], 'allFrameFlagsEqual': True},
                    'redFrameIndicesByEye': [[29,30,31],[29,30,31]]}
        for file in self.manifest['files']:
            verified[file['id']+'Bytes'] = file['bytes']; verified[file['id']+'SHA256'] = file['sha256']
        oracle = types.SimpleNamespace(verify_files=lambda *args, **kwargs: verified)
        with patch.object(cal, 'packet_statistics', return_value={'packets': 300, 'completeScan': True}):
            result = m.verify_media(self.wrapped/'media', evidence, time.time()+30, cal, oracle, self.manifest['files'])
            self.assertEqual(result['status'], 'FAIL'); self.assertTrue(result['completeScan'])
        verified['completeScan'] = False
        with self.assertRaisesRegex(ValueError, 'RECEIVER_MEDIA_SCAN_INCOMPLETE'):
            m.verify_media(self.wrapped/'media', evidence, time.time()+30, cal, oracle, self.manifest['files'])

    def test_oracle_bytes_must_match_the_complete_recovery(self):
        evidence = self.root/'oracle'; evidence.mkdir()
        verified = {'status': 'PASS', 'completeScan': True, 'inputBytes': 123, 'inputSHA256': '0'*64}
        oracle = types.SimpleNamespace(verify_files=lambda *args, **kwargs: verified)
        with self.assertRaisesRegex(ValueError, 'ORACLE_RECOVERED_MEDIA_BINDING'):
            m.verify_media(self.wrapped/'media', evidence, time.time()+30, None, oracle, self.manifest['files'])


if __name__ == '__main__': unittest.main()
