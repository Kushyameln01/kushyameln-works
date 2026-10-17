#!/usr/bin/env python3
"""Reconstructed local harness regressions; no WebCodecs/OPFS execution claim."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('calibration_probe_test', HERE/'probe-calibration.py')
probe = importlib.util.module_from_spec(spec); spec.loader.exec_module(probe)

class HarnessTests(unittest.TestCase):
    def executable(self, path, text):
        path.write_text('#!/usr/bin/python3\n'+text); path.chmod(0o700); return path
    def manifest(self, root):
        proof = {'schema': 'vr180-ffmpeg-toolchain-v1', 'source': 'local regression fixture; not official distribution',
                 'packageVersion': 'test-only', 'files': {}}
        for name in ('ffmpeg', 'ffprobe'):
            binary = self.executable(root/name, 'print('+repr(name+' version local-fixture')+')\n')
            proof['files'][name] = {'path': str(binary), 'sha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
                                   'versionFirstLine': name+' version local-fixture'}
        path = root/'toolchain.json'; path.write_text(json.dumps(proof)); return path
    def test_missing_toolchain_emits_failure_with_run_id(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '2'}):
            root = Path(tmp); out = root/'trial'; capture = io.StringIO()
            with contextlib.redirect_stdout(capture):
                code = probe.main(['--bundle', str(root/'missing.mjs'), '--output', str(out), '--case', '32-32',
                                   '--oracle-toolchain', str(root/'missing.json')])
            report = json.loads((out/'evidence/run.json').read_text()); manifest = json.loads((out/'evidence/manifest.json').read_text())
            self.assertEqual(code, 1); self.assertEqual(report['status'], 'BLOCKED')
            self.assertEqual(manifest['runId'], '123-p5-32-32-2')
            self.assertTrue(capture.getvalue().startswith('VR180_EVIDENCE_MANIFEST ')); self.assertLess(len(capture.getvalue()), probe.cloud.LIMIT)
            self.assertFalse(any(e['name'].endswith('.mp4') for e in manifest['files']))
            self.assertFalse(report['mediaArtifactReady']); self.assertEqual(report['calibrationVerdict'], 'NOT_VERIFIED')
    def test_exact_toolchain_and_oracle_path_identity(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ):
            root = Path(tmp); result = probe.require_toolchain(self.manifest(root))
            self.assertEqual(set(result['tools']), {'ffmpeg', 'ffprobe'})
            self.assertEqual(os.environ['PATH'].split(os.pathsep)[0], str(root))
            self.assertEqual(result['tools']['ffmpeg']['version'], 'ffmpeg version local-fixture\n')
            self.assertEqual(result['tools']['ffmpeg']['oraclePath'], str(root/'ffmpeg'))
    def test_verified_alias_does_not_authorize_different_path_binary(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ):
            root = Path(tmp); manifest = self.manifest(root); proof = json.loads(manifest.read_text())
            alias = root/'verified-other-name'; alias.write_bytes((root/'ffmpeg').read_bytes()); alias.chmod(0o700)
            proof['files']['ffmpeg']['path'] = str(alias); manifest.write_text(json.dumps(proof))
            with self.assertRaisesRegex(ValueError, 'Oracle PATH binary differs'): probe.require_toolchain(manifest)
    def test_original_manifest_bytes_keep_linked_package_provenance(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ):
            root = Path(tmp); manifest = self.manifest(root); proof = json.loads(manifest.read_text())
            proof.update(linkedPackages=[{'name': 'fixture', 'version': '1'}], linkedLibraries=[{'path': '/fixture'}], aptPolicy='exact fixture')
            raw = (json.dumps(proof, indent=3)+'\n').encode(); manifest.write_bytes(raw)
            saved = root/'saved.json'; result = probe.require_toolchain(manifest, saved)
            self.assertEqual(saved.read_bytes(), raw); self.assertEqual(result['manifestSHA256'], hashlib.sha256(raw).hexdigest())
    def test_changed_binary_rejected_before_execution(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); manifest = self.manifest(root); (root/'ffmpeg').write_text('changed')
            with patch.object(probe, 'bounded_version', side_effect=AssertionError('must not execute')):
                with self.assertRaisesRegex(ValueError, 'binary differs'): probe.require_toolchain(manifest)
    def test_version_output_is_bounded_while_reading(self):
        with tempfile.TemporaryDirectory() as tmp:
            binary = self.executable(Path(tmp)/'large', 'import os\nos.write(1,b"x"*65536)\n')
            with self.assertRaisesRegex(ValueError, 'output bound'): probe.bounded_version(binary, limit=1024)
    def test_version_timeout_terminates_child(self):
        with tempfile.TemporaryDirectory() as tmp:
            binary = self.executable(Path(tmp)/'slow', 'import time\ntime.sleep(2)\n')
            with self.assertRaisesRegex(TimeoutError, 'deadline'): probe.bounded_version(binary, timeout=.05)
    def test_numpy_wrong_version_blocks_before_oracle_import(self):
        with patch.object(probe.importlib, 'import_module', return_value=SimpleNamespace(__version__='2.3.2')):
            with patch.object(probe, 'load', side_effect=AssertionError('must not import oracle')):
                with self.assertRaisesRegex(probe.cloud.Blocked, '2.3.3'): probe.require_oracle_dependencies()
    def test_numpy_missing_blocks_before_media(self):
        with patch.object(probe.importlib, 'import_module', side_effect=ImportError('fixture')):
            with self.assertRaisesRegex(probe.cloud.Blocked, 'before media'): probe.require_oracle_dependencies()
    def test_numpy_and_oracle_preflight_records_loaded_dependency(self):
        fake_numpy = SimpleNamespace(__version__='2.3.3', __file__=__file__)
        fake_oracle = SimpleNamespace(np=fake_numpy, __file__=__file__)
        with patch.object(probe.importlib, 'import_module', return_value=fake_numpy), patch.object(probe, 'load', return_value=fake_oracle):
            module, proof = probe.require_oracle_dependencies()
            self.assertIs(module, fake_oracle); self.assertTrue(proof['oracleImportedBeforeMedia']); self.assertEqual(proof['numpyVersion'], '2.3.3')
    def test_packet_aggregation_complete_reordered_rational_timeline(self):
        visited = 0
        def records():
            nonlocal visited
            for index in range(300):
                visited += 1; yield {'size': str(100+index), 'pts': str(index ^ 1), 'duration': '1'}
        result = probe.aggregate_packets(records(), '1/30')
        self.assertEqual(visited, 300); self.assertEqual(result['packets'], 300)
        self.assertEqual(result['payloadBytes'], 74850); self.assertEqual(result['maxPacketBytes'], 399)
        self.assertEqual(result['timelineSecondsRational'], '10'); self.assertEqual(result['actualPayloadBitsPerSecond'], 59880)
    def test_packet_aggregation_rejects_over_bound_or_missing_duration(self):
        with self.assertRaisesRegex(ValueError, 'count exceeds'):
            probe.aggregate_packets(({'size': '1', 'pts': str(i), 'duration': '1'} for i in range(301)), '1/30')
        with self.assertRaises(KeyError): probe.aggregate_packets(iter([{'size': '1', 'pts': '0'}]), '1/30')
        with self.assertRaisesRegex(ValueError, 'size/duration'):
            probe.aggregate_packets(iter([{'size': '1', 'pts': '0', 'duration': '0'}]), '1/30')
    def test_expected_event_is_required_even_when_oracle_pair_matches(self):
        good = {'status': 'PASS', 'completeScan': True, 'frames': 300,
                'events': {'inputCountByEye': [3, 3], 'allFrameFlagsEqual': True},
                'redFrameIndicesByEye': [[29, 30, 31], [29, 30, 31]]}
        stats = {'input': {'packets': 300}, 'output': {'packets': 300}}
        self.assertEqual(probe.calibration_verdict(good, stats), 'PASS')
        bad = json.loads(json.dumps(good)); bad['events']['inputCountByEye'] = [0, 0]; bad['redFrameIndicesByEye'] = [[], []]
        self.assertEqual(probe.calibration_verdict(bad, stats), 'FAIL')
        bad = json.loads(json.dumps(good)); bad['redFrameIndicesByEye'][1] = [28, 29, 30]
        self.assertEqual(probe.calibration_verdict(bad, stats), 'FAIL')
    def test_media_pair_maximum_and_rejections(self):
        def entry(name, size): return {'name': name, 'bytes': size, 'sha256': 'a'*64}
        good = [entry('input.mp4', 80*1024**2), entry('output.mp4', 40*1024**2)]
        self.assertEqual(probe.media_entries({'files': good}), good)
        for entries in ([good[0], good[0]], [entry('input.mp4', -1)], [entry('../input.mp4', 1)],
                        [entry('input.mp4', 81*1024**2)], [good[0], entry('output.mp4', 40*1024**2+1)]):
            with self.subTest(entries=entries), self.assertRaises(ValueError): probe.media_entries({'files': entries})
    def test_metadata_transport_excludes_sibling_media(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); meta = root/'evidence'; media = root/'media'; meta.mkdir(); media.mkdir()
            (meta/'report.json').write_text('{}'); (media/'input.mp4').write_bytes(b'LOCAL-ONLY-REGRESSION')
            with contextlib.redirect_stdout(io.StringIO()): self.assertTrue(probe.cloud.emit_evidence(meta, {'runId': 'fixture', 'status': 'FAIL'}))
            manifest = json.loads((meta/'manifest.json').read_text()); self.assertEqual([f['name'] for f in manifest['files']], ['report.json'])
    def test_rss_includes_only_matching_descendants_not_other_job(self):
        rows = {10: (1, 'python', 999), 11: (10, 'node', 999), 12: (11, 'chrome', 10),
                13: (12, 'chrome', 20), 14: (12, 'unrelated-name', 999), 15: (1, 'chrome', 999),
                16: (17, 'chrome', 999), 17: (16, 'chrome', 999)}
        self.assertEqual(probe.descendant_chrome_rss(rows, 10), (30, 2))

if __name__ == '__main__': unittest.main()
