"""Small metadata/mocked-oracle regressions; no GB files or native media claim."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module


helper = load('long_receiver_test', ROOT/'tools/vr180/receive-long-media-evidence.py')
scalar = load('long_scalar_test', ROOT/'development/vr180/p5-long-prototype/oracle.py')


def sha(raw): return hashlib.sha256(raw).hexdigest()
def raw_json(value): return (json.dumps(value, indent=2, sort_keys=True)+'\n').encode()


def fixture(root, profile='p5-5gb', verdict='PASS', module=None):
    p = helper.PROFILES[profile]; frames = 30000 if profile == 'p5-5gb' else 60000
    identity = {'repository': 'Kushyameln01/kushyameln-works', 'commit': 'a'*40,
        'ref': 'refs/heads/codex/vr180-plan-test', 'runId': '123456', 'runAttempt': 1, 'job': 'p5-long-producer'}
    module = module or types.SimpleNamespace(SOURCE_FILES=['docs/shared/vr180/mp4.mjs'], long_oracle=scalar,
        BUNDLE_SOURCE_PATH=helper.BUNDLE_SOURCE)
    hashes = {name: sha(name.encode()) for name in helper.producer_sources(module)}
    files = [{'id': side, 'name': side+'.mp4', 'bytes': p['target']+1000+i, 'sha256': str(i+1)*64}
             for i, side in enumerate(('input', 'output'))]
    events = scalar.expected_events(frames)
    verified = {'status': verdict, 'completeScan': True, 'frames': frames, 'decodedFramesCompared': frames,
        'eyePSNRdB': [33, 34] if verdict == 'PASS' else [25, 26], 'maxPtsErrorSeconds': 0,
        'vrMetadata': {'stereo_mode': 2, 'projection': 'equi'},
        'events': {'allFrameFlagsEqual': True, 'inputCountByEye': [events['countPerEye']]*2,
            'outputCountByEye': [events['countPerEye']]*2, 'inputSequenceSHA256ByEye': [events['sequenceSHA256']]*2,
            'outputSequenceSHA256ByEye': [events['sequenceSHA256']]*2}}
    for f in files: verified[f['id']+'Bytes'] = f['bytes']; verified[f['id']+'SHA256'] = f['sha256']
    stats = {side: {'packets': frames, 'completeScan': True, 'payloadBytes': p['target'],
        'maxPacketBytes': 200000, 'scans': {'video-packets': {'endReached': True}}} for side in ('input', 'output')}
    source = {'before': hashes, 'after': hashes.copy(), 'identity': identity, 'bundleSHA256': 'b'*64}
    source_raw = raw_json(source)
    record = {'schema': 'vr180-p5-long-producer-record-v1', 'status': 'FULL_MEDIA_AND_SCAN_COMPLETED',
        'identity': identity, 'runId': f"123456-{profile}-1", 'profile': profile, 'frames': frames,
        'files': files, 'completeScan': True, 'mediaVerdict': verdict, 'sourceSHA256': hashes[helper.PRODUCER],
        'sourceProvenance': {'path': 'source-provenance.json', 'bytes': len(source_raw), 'sha256': sha(source_raw)}}
    observed = {'schema': 'vr180-p5-long-browser-v1', 'profile': profile, 'status': 'READY_FOR_RUNNER_TRANSFER',
        'files': files, 'generation': {'frames': frames, 'packets': frames, 'fps': 30, 'requestedBitrate': 32000000,
            'sha256': files[0]['sha256'], 'bytes': files[0]['bytes'], 'packetTimestampsStrictlyIncreasing': True,
            'payloadBytes': p['target'], 'maxPacketBytes': 200000}, 'indexDirectoriesRemoved': True,
        'ownerRecordsRemoved': True, 'heldLocks': 0, 'indexReservedAfterCleanup': 0, 'unhandledCount': 0}
    receipts = [{**f, 'fsynced': True, 'closed': True, 'rereadBytes': f['bytes'], 'rereadSHA256': f['sha256']} for f in files]
    documents = {'source-provenance.json': source, 'producer-record.json': record,
        'browser-observations.json': observed, 'browser-lifecycle.json': {'browserClosed': True,
            'namespaceCleanup': {'status': 'REMOVED'}, 'profileCleanup': {'status': 'REMOVED'}},
        'runner-transfer.json': {'browser': {'status': 'PASS'}, 'files': receipts},
        'fork-build-result.json': {'status': 'PASS', 'baseline': {'status': 'PASS', 'comparison': {'identical': True}},
            'variant': 'combined-input-output', 'bundleSha256': 'b'*64},
        'private-source-inventory.json': {'checkoutCommit': identity['commit'], 'files': [
            {'route': '/', 'sha256': 'c'*64}, {'route': '/fork.mjs', 'sha256': 'b'*64}]+
            [{'route': '/'+name, 'sha256': hashes[name]} for name in module.SOURCE_FILES]},
        'oracle-toolchain.json': {'fixtureOnly': True}, 'independent-verification.json': verified,
        'packet-statistics.json': stats}
    root.mkdir(exist_ok=True)
    for name, value in documents.items(): (root/name).write_bytes(raw_json(value))
    log = root/'oracle-logs/ffmpeg.stderr.log'; log.parent.mkdir(); log.write_bytes(b'')
    quality = {'schema': 'vr180-p5-long-quality-evidence-v1', 'profile': profile, 'identity': identity,
        'sourceSHA256': hashes[helper.PRODUCER], 'mediaVerdict': verdict, 'completeScan': True, 'files': files,
        'acceptance': {'mediaVerdict': verdict, 'completeScan': True, 'expectedEvents': events,
            'actualInputPayloadBytes': p['target'], 'targetPayloadBytes': p['target'],
            'actualOutputBytes': files[1]['bytes'], 'outputExceeds4GiB': True}, 'evidence': []}
    manifest = {'schema': 'vr180-segmented-transfer-v1', 'status': 'COMPLETE', 'profile': profile, 'identity': identity,
        'partBytes': 128*helper.MIB, 'totalBytes': sum(f['bytes'] for f in files), 'files': [],
        'provenance': {'generatorScriptPath': helper.PRODUCER, 'generatorScriptSHA256': hashes[helper.PRODUCER]},
        'generator': {'algorithm': 'vr180-long-xorshift32-sbs180-webcodecs-v1', 'seed': 0x1802026,
            'width': 1024, 'height': 512, 'fps': 30, 'silent': True, 'inputRequestedBitrate': 32000000,
            'outputRequestedBitrate': 32000000, 'eventPeriodFrames': 300, 'eventFrameOffsets': [29,30,31],
            'maxFrames': 100000, 'targetPayloadBytes': p['target'], 'frames': frames},
        'evidenceBundle': {'name': 'producer-evidence.tar.gz', 'bytes': 1000, 'sha256': 'd'*64,
            'artifact': {'id': 500, 'name': f'vr180-seg-{profile}-123456-1-p5-long-producer-evidence',
                'sizeBytes': 1200, 'digest': 'sha256:'+'e'*64}}}
    counter = 1
    for f in files:
        count = (f['bytes']+128*helper.MIB-1)//(128*helper.MIB)
        manifest['files'].append({**f, 'partCount': count, 'parts': [{'artifact': {'id': i}} for i in range(counter, counter+count)]})
        counter += count
    manifest['partCount'] = counter-1
    def rebind():
        quality['evidence'] = [{'path': path.relative_to(root).as_posix(), 'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes())}
            for path in sorted(root.rglob('*')) if path.is_file() and path.name != 'quality-evidence.json']
        data = raw_json(quality); (root/'quality-evidence.json').write_bytes(data)
        manifest['qualityEvidence'] = {'name': 'quality-evidence.json', 'bytes': len(data), 'sha256': sha(data),
            'status': verdict, 'completeScan': True}
        manifest['sourceManifestSHA256'] = sha(helper.reconstructed_source_manifest(manifest))
    rebind()
    return types.SimpleNamespace(manifest=manifest, module=module, hashes=hashes, files=files,
        verified=verified, stats=stats, quality=quality, rebind=rebind, root=root)


class LongReceiverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.f = fixture(self.root/'producer')
    def tearDown(self): self.temp.cleanup()
    def original(self, f=None, hashes=None):
        f = f or self.f
        with patch.object(helper, 'long_module', return_value=f.module):
            return helper.validate_original_records(f.root, f.manifest, lambda paths, commit: hashes or f.hashes)
    def test_exact_generator_caps_and_fixed_job_for_both_profiles(self):
        for profile in helper.PROFILES:
            f = self.f if profile == 'p5-5gb' else fixture(self.root/'ten', profile)
            helper.validate_generator(f.manifest, f.hashes)
            for mutate in [lambda m: m['identity'].update(job='other'), lambda m: m['generator'].update(frames=100001),
                lambda m: m['generator'].update(fps=60), lambda m: m['generator'].update(silent=False),
                lambda m: m['generator'].update(targetPayloadBytes=1), lambda m: m['files'][0].update(bytes=helper.PROFILES[profile]['caps'][0]+1),
                lambda m: m['provenance'].update(generatorScriptSHA256='0'*64),
                lambda m: m['evidenceBundle']['artifact'].update(id=1)]:
                m = copy.deepcopy(f.manifest); mutate(m)
                with self.assertRaises(ValueError): helper.validate_generator(m, f.hashes)
    def test_complete_original_pass_and_fail_keep_media_verdict(self):
        self.assertEqual(self.original()['status'], 'PASS')
        f = fixture(self.root/'failed', verdict='FAIL')
        result = self.original(f); self.assertEqual(result['status'], 'FAIL'); self.assertTrue(result['completeScan'])
        self.assertTrue(result['originalSourceManifestSHA256Matched'])
    def test_source_manifest_raw_reconstruction_detects_any_change(self):
        self.f.manifest['sourceManifestSHA256'] = '0'*64
        with self.assertRaisesRegex(ValueError, 'SOURCE_MANIFEST_HASH'): self.original()
    def test_reference_mutation_without_updated_sha_is_rejected(self):
        (self.f.root/'browser-observations.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'REFERENCE_BYTES|REFERENCE_HASH'): self.original()
    def test_run_job_file_and_source_reference_mismatch_even_with_new_reference_hash(self):
        path = self.f.root/'producer-record.json'; original = path.read_bytes()
        for mutate in [lambda r: r.update(runId='old-run'), lambda r: r['identity'].update(job='other'),
            lambda r: r['files'][0].update(sha256='0'*64), lambda r: r['sourceProvenance'].update(sha256='0'*64)]:
            row = json.loads(original); mutate(row); path.write_bytes(raw_json(row)); self.f.rebind()
            with self.assertRaisesRegex(ValueError, 'ORIGINAL_IDENTITY_MEDIA|ORIGINAL_SOURCE_REFERENCE'): self.original()
        path.write_bytes(original); self.f.rebind()
    def test_exact_source_closure_and_before_after_are_required(self):
        hashes = self.f.hashes.copy(); hashes[helper.PRODUCER] = '0'*64
        with self.assertRaisesRegex(ValueError, 'SOURCE_CLOSURE'): self.original(hashes=hashes)
        path = self.f.root/'source-provenance.json'; source = json.loads(path.read_bytes()); source['after'] = {}
        path.write_bytes(raw_json(source)); self.f.rebind()
        with self.assertRaisesRegex(ValueError, 'SOURCE_REFERENCE'): self.original()
    def test_incomplete_original_scan_is_not_complete_quality_fail(self):
        path = self.f.root/'independent-verification.json'; value = json.loads(path.read_bytes()); value['completeScan'] = False
        path.write_bytes(raw_json(value)); self.f.rebind()
        with self.assertRaisesRegex(ValueError, 'SCAN_INCOMPLETE'): self.original()
    def test_producer_quality_fail_is_recomputed_not_trusted(self):
        path = self.f.root/'independent-verification.json'; value = json.loads(path.read_bytes()); value['status'] = 'FAIL'
        path.write_bytes(raw_json(value)); self.f.rebind()
        with self.assertRaisesRegex(ValueError, 'QUALITY_VERDICT'): self.original()
    def test_original_failed_cleanup_or_reread_is_rejected(self):
        path = self.f.root/'browser-lifecycle.json'; value = json.loads(path.read_bytes()); value['browserClosed'] = False
        path.write_bytes(raw_json(value)); self.f.rebind()
        with self.assertRaisesRegex(ValueError, 'BROWSER_CLEANUP'): self.original()
    def run_fresh(self, verified=None, stats=None, snapshot=None, deadline=None):
        evidence = self.root/('fresh-'+str(len(list(self.root.iterdir())))); evidence.mkdir()
        f = self.f; calls = []
        def packets(_oracle, path, logs, budget, frames, cap, input_side):
            side = 'input' if input_side else 'output'; calls.append(('packet', side, budget, frames, cap))
            return copy.deepcopy((stats or f.stats)[side])
        def verify(*args, **kwargs): calls.append(('decode', kwargs['timeout'])); return copy.deepcopy(verified or f.verified)
        module = types.SimpleNamespace(long_oracle=scalar, packet_statistics=packets)
        snapshots = snapshot or [dict.fromkeys(helper.RECEIVER_SOURCES, 'a'*64)]*2
        with patch.object(helper, 'long_module', return_value=module), patch.object(helper, 'check_media_files'), \
             patch.object(helper, 'source_snapshot', side_effect=snapshots):
            value = helper.verify_media(self.root, evidence, deadline or time.time()+20, None,
                types.SimpleNamespace(verify_files=verify), f.files, f.manifest)
        return value, calls, evidence
    def test_fresh_long_oracle_scans_all_packets_then_frames_under_one_deadline(self):
        result, calls, _ = self.run_fresh()
        self.assertEqual(result['status'], 'PASS'); self.assertEqual(result['fixedReceiverSourceFiles'], 19)
        self.assertEqual([x[0] for x in calls], ['packet','packet','decode'])
        self.assertEqual(calls[0][2], calls[1][2]); self.assertLessEqual(calls[2][1], 20)
        self.assertTrue(result['outputExceeds4GiB']); self.assertEqual(result['actualInputPayloadBytes'], 5_000_000_000)
    def test_complete_quality_failure_returns_fail_not_incomplete(self):
        verified = copy.deepcopy(self.f.verified); verified['status'] = 'FAIL'; verified['eyePSNRdB'] = [20,20]
        result, _, _ = self.run_fresh(verified=verified)
        self.assertEqual(result['status'], 'FAIL'); self.assertTrue(result['completeScan'])
        self.assertEqual(result['producerQualityVerdict'], 'PASS')
    def test_input_payload_shortfall_and_periodic_event_corruption_cannot_pass(self):
        stats = copy.deepcopy(self.f.stats); stats['input']['payloadBytes'] = 4_999_999_999
        self.assertEqual(self.run_fresh(stats=stats)[0]['capacityVerdict'], 'FAIL')
        verified = copy.deepcopy(self.f.verified); verified['events']['outputSequenceSHA256ByEye'][1] = '0'*64
        self.assertEqual(self.run_fresh(verified=verified)[0]['qualityVerdict'], 'FAIL')
    def test_incomplete_eof_hash_mismatch_and_source_change_raise(self):
        verified = copy.deepcopy(self.f.verified); verified['completeScan'] = False
        with self.assertRaisesRegex(ValueError, 'SCAN_INCOMPLETE'): self.run_fresh(verified=verified)
        verified = copy.deepcopy(self.f.verified); verified['outputSHA256'] = '0'*64
        with self.assertRaisesRegex(ValueError, 'RECOVERED_HASH'): self.run_fresh(verified=verified)
        with self.assertRaisesRegex(ValueError, 'SOURCE_CHANGED'): self.run_fresh(snapshot=[{'a':'1'}, {'a':'2'}])
    def test_expired_budget_refuses_scan_and_actual_file_gate_refuses_missing(self):
        with self.assertRaisesRegex(ValueError, 'DEADLINE'): self.run_fresh(deadline=time.time()-1)
        with self.assertRaisesRegex(ValueError, 'RECOVERED_FILE_SIZE'): helper.check_media_files(self.root, self.f.files)
    def test_fixed_receiver_source_inventory_has_exact_19_unique_files(self):
        self.assertEqual(len(helper.RECEIVER_SOURCES), 19); self.assertEqual(len(set(helper.RECEIVER_SOURCES)), 19)
        self.assertEqual(set(helper.source_snapshot()), set(helper.RECEIVER_SOURCES))
        self.assertIn(helper.BUNDLE_SOURCE, helper.producer_sources(helper.long_module()))

    def test_actual_producer_publication_bundle_and_original_semantics_metadata_only(self):
        # Real producer publication and tar parsing, normalized metadata only.
        # The GB sizes below are manifest fields; no media is generated/claimed.
        producer = helper.long_module()
        for status in ('PASS', 'FAIL'):
            f = fixture(self.root/status, verdict=status, module=producer)
            (f.root/'quality-evidence.json').unlink(); (f.root/'producer-record.json').unlink()
            media = self.root/(status+'-publication'); media.mkdir()
            source = producer.write_transport_manifests(f.root, media, f.manifest['identity'],
                f.manifest['profile'], f.files, f.manifest['generator']['frames'], f.quality['acceptance'],
                f.hashes[helper.PRODUCER], run_id='123456-p5-5gb-1')
            f.manifest['qualityEvidence'] = source['qualityEvidence']
            f.manifest['evidenceBundle'].update(source['evidenceBundle'])
            f.manifest['evidenceBundle']['artifact']['sizeBytes'] = source['evidenceBundle']['bytes']+200
            raw = (media/'source-manifest.json').read_bytes()
            self.assertEqual(helper.reconstructed_source_manifest(f.manifest), raw)
            f.manifest['sourceManifestSHA256'] = sha(raw)
            helper.validate_generator(f.manifest, f.hashes)
            unpacked = self.root/(status+'-unpacked')
            quality, receipt = helper.unpack_bundle(media/'producer-evidence.tar.gz', f.manifest, unpacked, time.time()+10)
            self.assertEqual(quality['mediaVerdict'], status); self.assertTrue(receipt['allReferencesVerified'])
            result = helper.validate_original_records(unpacked, f.manifest, lambda paths, commit: f.hashes)
            self.assertEqual(result['status'], status)
            self.assertEqual(result['fixedSourceFiles'], len(helper.producer_sources(producer)))
            self.assertEqual((unpacked/'oracle-logs/ffmpeg.stderr.log').stat().st_size, 0)


if __name__ == '__main__': unittest.main()
