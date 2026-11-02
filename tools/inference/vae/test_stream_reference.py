"""Lightweight independent-reference contracts; no Torch/model execution."""
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parent


def load_reference():
    spec = importlib.util.spec_from_file_location('stream_reference', ROOT / 'stream_reference.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class StreamReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reference = load_reference()

    def test_import_does_not_import_tensor_libraries(self):
        code = ("import importlib.util, sys; "
                f"s=importlib.util.spec_from_file_location('reference', {str(ROOT / 'stream_reference.py')!r}); "
                "m=importlib.util.module_from_spec(s); s.loader.exec_module(m); "
                "assert 'torch' not in sys.modules and 'numpy' not in sys.modules")
        subprocess.run([sys.executable, '-c', code], check=True, capture_output=True, text=True)

    def test_source_frame_tail_is_explicit_and_rgb_shape_keeps_actual_f(self):
        expected = {1: (1, 1, 0), 4: (1, 1, 3), 5: (2, 5, 0),
                    80: (20, 77, 3), 81: (21, 81, 0)}
        for frames, (latent, consumed, tail) in expected.items():
            contract = self.reference.frame_contract(frames)
            self.assertEqual(contract, {'inputFrames': frames, 'latentFrames': latent,
                                       'consumedFrames': consumed, 'ignoredTailFrames': tail,
                                       'decodedFrames': consumed})
            case = self.reference.case_by_id(f'source-f{frames}-480x832')
            self.assertEqual(case['rgbShape'], [1, 3, frames, 480, 832])
            self.assertEqual(case['latentShape'], [1, 16, latent, 60, 104])
            self.assertEqual(case['decodeRgbShape'], [1, 3, consumed, 480, 832])

    def test_predeclared_cases_cover_target_and_reference_boundaries(self):
        plan = self.reference.load_plan()
        expected = {'target-f81-480x832', 'diagnostic-f5-16x32',
                    *(f'source-f{f}-480x832' for f in (1, 4, 5, 80, 81)),
                    *(f'reference-f1-{h}x{w}' for h, w in
                      ((16, 16), (16, 848), (848, 16), (848, 848), (16, 32)))}
        self.assertEqual({case['id'] for case in plan['cases']}, expected)
        self.assertEqual(plan['comparisonGate'], self.reference.COMPARISON_GATE)
        self.assertTrue(plan['comparisonGate']['registeredBeforeComparison'])
        for case in plan['cases']:
            self.assertEqual(case, self.reference.case_by_id(case['id']))

    def test_rgb_pattern_is_ncthw_and_exact_binary_float(self):
        shape = [1, 3, 2, 2, 3]
        values = list(self.reference.pattern_values(shape, 'rgb'))
        expected = [((c * 71 + t * 13 + y * 5 + x * 3) % 257 - 128) / 128
                    for c in range(3) for t in range(2) for y in range(2) for x in range(3)]
        self.assertEqual(values, expected)
        self.assertEqual(len(values), 36)
        self.assertEqual(struct.unpack('<36f', struct.pack('<36f', *values)), tuple(expected))
        self.assertEqual(values[12], (71 - 128) / 128)

    def test_raw_latent_has_its_own_pattern_and_normal_input_semantics(self):
        shape = [1, 16, 2, 2, 3]
        values = list(self.reference.pattern_values(shape, 'raw-latent'))
        expected = [((c * 17 + t * 11 + y * 7 + x * 5) % 257 - 128) / 512
                    for c in range(16) for t in range(2) for y in range(2) for x in range(3)]
        self.assertEqual(values, expected)
        self.assertTrue(all(-.25 <= value <= .25 for value in values))
        plan = self.reference.load_plan()
        self.assertEqual(plan['decodeInput']['latentSpace'], 'raw')
        self.assertEqual(plan['decodeInput']['provenance'], 'RAW_LATENT_DECLARED_NORMAL_INPUT')
        self.assertFalse(plan['decodeInput']['derivedFromEncode'])

    def test_invalid_shape_and_case_do_not_silently_round(self):
        for frames in (0, -1, True, 1.5):
            with self.assertRaises(ValueError):
                self.reference.frame_contract(frames)
        for shape in ([1, 3, 1, 16], [2, 3, 1, 16, 16], [1, 3, 0, 16, 16]):
            with self.assertRaises(ValueError):
                list(self.reference.pattern_values(shape, 'rgb'))
        with self.assertRaises(ValueError):
            self.reference.case_by_id('target-f77-480x832')

    def test_fresh_private_output_and_file_hash_contract(self):
        with tempfile.TemporaryDirectory() as root:
            output = Path(root) / 'private'
            self.reference.create_output(output)
            with self.assertRaises(FileExistsError):
                self.reference.create_output(output)
            with self.assertRaises(ValueError):
                self.reference.create_output(Path(root) / 'docs' / 'private')
            path = output / 'values.f32'
            path.write_bytes(struct.pack('<2f', -1., 1.))
            self.assertEqual(self.reference.sha256_file(path),
                             'c1112024d84bac179cfda8df2d45cdb8cb941ec29f75e8cffa61c3b4c46d44a1')

    def test_cgroup_limit_is_real_observation_not_a_fixed_assumption(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / 'memory.max').write_text('17179869184\n')
            (path / 'memory.current').write_text('1048576\n')
            observed = self.reference.read_cgroup_memory(path)
            self.assertEqual(observed['limitBytes'], 17179869184)
            self.assertEqual(observed['currentBytes'], 1048576)
            (path / 'memory.max').write_text('max\n')
            self.assertIsNone(self.reference.read_cgroup_memory(path)['limitBytes'])

    def test_reclaimable_inactive_file_does_not_falsely_trigger_the_guard(self):
        gib, mib = 1024 ** 3, 1024 ** 2
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / 'memory.max').write_text(str(16 * gib))
            (path / 'memory.current').write_text(str(16 * gib - 128 * mib))
            (path / 'memory.stat').write_text(
                f'inactive_file {10 * gib}\nanon {5 * gib}\nshmem {gib}\n')
            memory = self.reference.read_cgroup_memory(path)
            self.assertEqual(memory['inactiveFileBytes'], 10 * gib)
            self.assertEqual(memory['anonBytes'], 5 * gib)
            self.assertEqual(memory['shmemBytes'], gib)
            self.assertEqual(memory['workingSetBytes'], 6 * gib - 128 * mib)
            self.assertFalse(self.reference.memory_guard({'cgroup': memory}, 256 * mib))

    def test_unreclaimable_working_set_and_tmpfs_still_trigger_the_guard(self):
        gib, mib = 1024 ** 3, 1024 ** 2
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / 'memory.max').write_text(str(16 * gib))
            (path / 'memory.current').write_text(str(16 * gib - 128 * mib))
            (path / 'memory.stat').write_text(
                f'inactive_file {64 * mib}\nanon {10 * gib}\nshmem {5 * gib}\n')
            memory = self.reference.read_cgroup_memory(path)
            self.assertEqual(memory['workingSetBytes'], 16 * gib - 192 * mib)
            self.assertTrue(self.reference.memory_guard({'cgroup': memory}, 256 * mib))

    def test_missing_memory_stat_falls_back_to_raw_charge(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / 'memory.max').write_text('1024\n')
            (path / 'memory.current').write_text('1000\n')
            memory = self.reference.read_cgroup_memory(path)
            self.assertIsNone(memory['inactiveFileBytes'])
            self.assertEqual(memory['workingSetBytes'], 1000)
            self.assertTrue(self.reference.memory_guard({'cgroup': memory}, 32))

    def test_vectorized_private_files_match_the_stdlib_pattern_in_ncthw_order(self):
        torch_before = sys.modules.get('torch')
        try:
            import numpy as np
        except ImportError:
            self.skipTest('NumPy optional for the file-layout check; no model dependencies required')
        with tempfile.TemporaryDirectory() as root:
            for kind, shape in [('rgb', [1, 3, 2, 3, 5]), ('raw-latent', [1, 16, 2, 2, 3])]:
                path = Path(root) / (kind + '.f32')
                record = self.reference.write_pattern(path, shape, kind, np)
                expected = list(self.reference.pattern_values(shape, kind))
                self.assertEqual(path.read_bytes(), struct.pack('<' + str(len(expected)) + 'f', *expected))
                self.assertEqual(record['shape'], shape)
                self.assertEqual(record['bytes'], len(expected) * 4)
                self.assertEqual(record['sha256'], self.reference.sha256_file(path))
            # Test noncontiguous source output without importing or constructing Torch.
            array = np.arange(48, dtype=np.float32).reshape(1, 2, 3, 2, 4).transpose(0, 1, 2, 4, 3)
            class ArrayTensor:
                shape = array.shape
                def detach(self): return self
                def cpu(self): return self
                def numpy(self): return array
            path = Path(root) / 'source-output.f32'
            record = self.reference.write_tensor(path, ArrayTensor(), list(array.shape), 'test', np)
            self.assertEqual(path.read_bytes(), array.astype('<f4').tobytes(order='C'))
            self.assertTrue(record['complete'])
        self.assertIs(sys.modules.get('torch'), torch_before)


class SnapshotSourceCacheTests(unittest.TestCase):
    """Source-file/git-blob doubles only; no model, browser or NN execution."""
    REVISION = 'a' * 40

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(ROOT))
        try:
            import accept_stream
            cls.accept = accept_stream
        finally:
            sys.path.pop(0)

    def fixture(self, directory, blobs):
        repo = Path(directory).resolve()
        for relative, raw in blobs.items():
            path = repo / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)
        def fixed(command, **kwargs):
            self.assertEqual(command[:2], ['git', 'show'])
            self.assertEqual(kwargs, {'cwd': repo, 'check': True, 'capture_output': True})
            revision, relative = command[2].split(':', 1)
            self.assertEqual(revision, self.REVISION)
            if relative not in blobs:
                raise subprocess.CalledProcessError(128, command)
            return SimpleNamespace(stdout=blobs[relative])
        return repo, fixed

    def test_dirty_first_read_is_rejected_and_never_preaccepted(self):
        with tempfile.TemporaryDirectory() as directory:
            repo, fixed = self.fixture(directory, {'owner.mjs': b'fixed source'})
            cache = self.accept.SnapshotSourceCache(repo, self.REVISION)
            path = repo / 'owner.mjs'
            path.write_bytes(b'dirty source')
            with mock.patch.object(self.accept.subprocess, 'run', side_effect=fixed):
                with self.assertRaisesRegex(ValueError, 'differs from the specified commit'):
                    cache.read(path)
                self.assertEqual(cache.records, {})
                path.write_bytes(b'fixed source')
                self.assertEqual(cache.read(path), b'fixed source')

    def test_verified_snapshot_survives_later_mutation_and_preserves_original_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            original = b'export const source = "fixed";'
            repo, fixed = self.fixture(directory, {'owner.mjs': original})
            cache = self.accept.SnapshotSourceCache(repo, self.REVISION)
            path = repo / 'owner.mjs'
            with mock.patch.object(self.accept.subprocess, 'run', side_effect=fixed) as git:
                self.assertEqual(cache.read(path), original)
                path.write_bytes(b'export const source = "later worktree edit";')
                self.assertEqual(cache.read(path), original)
                self.assertEqual(git.call_count, 1)
            self.assertEqual(cache.records['owner.mjs'], {
                'path': 'owner.mjs', 'bytes': len(original),
                'sha256': self.accept.hashlib.sha256(original).hexdigest()})

    def test_late_dependency_still_requires_its_own_exact_commit_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            repo, fixed = self.fixture(directory, {'first.mjs': b'first', 'later.mjs': b'later'})
            cache = self.accept.SnapshotSourceCache(repo, self.REVISION)
            with mock.patch.object(self.accept.subprocess, 'run', side_effect=fixed) as git:
                cache.read(repo / 'first.mjs')
                (repo / 'later.mjs').write_bytes(b'new dirty dependency')
                with self.assertRaisesRegex(ValueError, 'differs from the specified commit'):
                    cache.read(repo / 'later.mjs')
                self.assertEqual(set(cache.records), {'first.mjs'})
                (repo / 'later.mjs').write_bytes(b'later')
                self.assertEqual(cache.read(repo / 'later.mjs'), b'later')
                self.assertEqual(git.call_count, 3)

    def test_snapshot_does_not_reopen_deleted_source_or_replaced_symlink(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            original = b'fixed original'
            repo, fixed = self.fixture(directory, {'owner.mjs': original})
            foreign = Path(outside) / 'untrusted.mjs'
            foreign.write_bytes(b'untrusted later bytes')
            path = repo / 'owner.mjs'
            cache = self.accept.SnapshotSourceCache(repo, self.REVISION)
            with mock.patch.object(self.accept.subprocess, 'run', side_effect=fixed) as git:
                cache.read(path)
                path.unlink()
                self.assertEqual(cache.read(path), original)
                path.symlink_to(foreign)
                self.assertEqual(cache.read(path), original)
                self.assertEqual(git.call_count, 1)

    def test_outside_or_model_tensor_file_is_not_cached(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            repo, fixed = self.fixture(directory, {'source.mjs': b'fixed'})
            cache = self.accept.SnapshotSourceCache(repo, self.REVISION)
            foreign = Path(outside) / 'outside.mjs'
            foreign.write_bytes(b'outside')
            with mock.patch.object(self.accept.subprocess, 'run', side_effect=fixed) as git:
                with self.assertRaises(ValueError):
                    cache.read(foreign)
                for suffix in ('.safetensors', '.f32', '.wktensor', '.onnx'):
                    model = repo / ('model' + suffix)
                    model.write_bytes(b'not source')
                    with self.assertRaisesRegex(ValueError, 'Only repository source'):
                        cache.read(model)
                self.assertEqual(cache.records, {})
                self.assertEqual(git.call_count, 0)

    def test_concurrent_http_readers_share_one_verified_immutable_capture(self):
        with tempfile.TemporaryDirectory() as directory:
            original = b'fixed wasm source bytes'
            repo, fixed = self.fixture(directory, {'runtime.wasm': original})
            cache = self.accept.SnapshotSourceCache(repo, self.REVISION)
            path = repo / 'runtime.wasm'
            with mock.patch.object(self.accept.subprocess, 'run', side_effect=fixed) as git:
                with ThreadPoolExecutor(max_workers=4) as readers:
                    results = list(readers.map(lambda _: cache.read(path), range(12)))
                self.assertEqual(results, [original] * 12)
                self.assertEqual(git.call_count, 1)
            self.assertEqual(cache.summary()['cachedSourceFileCount'], 1)
            self.assertEqual(cache.summary()['cachedSourceBytes'], len(original))

    def test_summary_identifies_immutable_host_source_not_later_worktree(self):
        with tempfile.TemporaryDirectory() as directory:
            repo, fixed = self.fixture(directory, {'owner.mjs': b'fixed', 'plan.json': b'{}'})
            cache = self.accept.SnapshotSourceCache(repo, self.REVISION)
            with mock.patch.object(self.accept.subprocess, 'run', side_effect=fixed):
                cache.read(repo / 'owner.mjs')
                cache.read(repo / 'plan.json')
            (repo / 'owner.mjs').write_bytes(b'later edit')
            summary = cache.summary()
            self.assertEqual(summary['executionSourceSha'], self.REVISION)
            self.assertEqual(summary['cachedSourceFileCount'], 2)
            self.assertEqual(summary['cachedSourceBytes'], 7)
            self.assertFalse(summary['currentWorktreeIdentityClaim'])
            self.assertIn('Model files and numerical tensor payloads are not cached', summary['scope'])
            self.assertNotIn('fixed', json.dumps(summary))

    def test_first_read_cannot_follow_foreign_symlink_or_nonfixed_revision(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            repo, fixed = self.fixture(directory, {})
            foreign = Path(outside) / 'foreign.mjs'
            foreign.write_bytes(b'outside')
            (repo / 'owner.mjs').symlink_to(foreign)
            cache = self.accept.SnapshotSourceCache(repo, self.REVISION)
            with mock.patch.object(self.accept.subprocess, 'run', side_effect=fixed) as git:
                with self.assertRaisesRegex(ValueError, 'escapes the repository'):
                    cache.read(repo / 'owner.mjs')
                self.assertEqual(git.call_count, 0)
                self.assertEqual(cache.records, {})
            for revision in ('main', 'a' * 7, 'A' * 40):
                with self.assertRaisesRegex(ValueError, 'full40hex'):
                    self.accept.SnapshotSourceCache(repo, revision)

    def test_missing_committed_blob_does_not_enter_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            repo, fixed = self.fixture(directory, {})
            path = repo / 'uncommitted.mjs'
            path.write_bytes(b'uncommitted source')
            cache = self.accept.SnapshotSourceCache(repo, self.REVISION)
            with mock.patch.object(self.accept.subprocess, 'run', side_effect=fixed):
                with self.assertRaises(subprocess.CalledProcessError):
                    cache.read(path)
                self.assertEqual(cache.records, {})


class WorkerTargetObserverTests(unittest.TestCase):
    """Protocol doubles only; these tests do not claim browser worker visibility."""
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(ROOT))
        try:
            from accept_stream import WorkerTargetObserver
            cls.Observer = WorkerTargetObserver
        finally:
            sys.path.pop(0)

    class CDP:
        def __init__(self, targets=()):
            self.targets = {item['targetId']: dict(item) for item in targets}
            self.handlers = {}
            self.calls = []

        def on(self, event, handler):
            self.handlers[event] = handler

        def send(self, method, params=None):
            self.calls.append((method, params))
            if method == 'Target.getTargets':
                return {'targetInfos': list(self.targets.values())}
            if method == 'Target.setDiscoverTargets':
                return {}
            raise AssertionError('Unexpected CDP method: ' + method)

        def create(self, info):
            self.targets[info['targetId']] = dict(info)
            self.handlers['Target.targetCreated']({'targetInfo': info})

        def change(self, info):
            self.targets[info['targetId']].update(info)
            self.handlers['Target.targetInfoChanged']({'targetInfo': self.targets[info['targetId']]})

        def destroy(self, target_id):
            del self.targets[target_id]
            self.handlers['Target.targetDestroyed']({'targetId': target_id})

    def test_baseline_exclusion_parent_pthread_and_destroyed_targets(self):
        cdp = self.CDP([{'targetId': 'baseline', 'type': 'worker', 'url': 'old-worker.mjs'},
                        {'targetId': 'page', 'type': 'page', 'url': 'http://127.0.0.1/'}])
        observer = self.Observer(cdp).start()
        self.assertEqual(observer.snapshots[0]['workerTargets'], [])
        cdp.create({'targetId': 'parent', 'type': 'worker', 'url': 'http://local/stream_observer_worker.mjs'})
        cdp.create({'targetId': 'pthread', 'type': 'worker', 'url': 'blob:opaque', 'openerId': 'parent'})
        cdp.change({'targetId': 'pthread', 'url': 'http://local/ort-wasm-simd-threaded.mjs'})
        marker = {'boundary': 'cancel-returned', 'atEpochMs': 123}
        observer.snapshot('cancel-returned', marker)
        cdp.destroy('pthread')
        cdp.destroy('parent')
        observer.snapshot('before-browser-close')
        report = observer.report()
        self.assertEqual(report['baselineWorkerTargetIdsExcluded'], ['baseline'])
        self.assertEqual(report['parentTargetsIdentifiedByUrl'], ['parent'])
        self.assertEqual(report['pthreadTargetsIdentifiedByUrl'], ['pthread'])
        self.assertEqual(report['snapshots'][1]['browserMarker'], marker)
        self.assertEqual(len(report['snapshots'][1]['workerTargets']), 2)
        self.assertEqual(report['snapshots'][-1]['workerTargets'], [])
        self.assertTrue(all(item['destroyEventObserved'] for item in report['targets']))
        self.assertEqual(report['targets'][1]['openerId'], 'parent')
        self.assertEqual(sum(event['event'] == 'targetDestroyed' for event in report['events']), 2)
        self.assertIn('does not prove', report['scope'])
        json.dumps(report, allow_nan=False)

    def test_parent_only_does_not_claim_nested_pthread_visibility_or_exit(self):
        cdp = self.CDP()
        observer = self.Observer(cdp).start()
        cdp.create({'targetId': 'parent', 'type': 'worker', 'url': '/inference-worker.mjs'})
        cdp.destroy('parent')
        observer.snapshot('after-cancellation-rejection')
        report = observer.report()
        self.assertEqual(report['status'], 'WORKER_TARGETS_OBSERVED')
        self.assertEqual(report['pthreadVisibility'], 'UNOBSERVABLE_OR_NOT_CREATED')
        self.assertEqual(report['pthreadTargetsIdentifiedByUrl'], [])
        self.assertTrue(report['snapshots'][-1]['snapshotDoesNotPauseRenderer'])

    def test_unclassified_blob_remains_distinct_from_identified_pthread(self):
        cdp = self.CDP()
        observer = self.Observer(cdp).start()
        cdp.create({'targetId': 'blob', 'type': 'worker', 'url': 'blob:http://local/random'})
        observer.snapshot('operation-returned')
        report = observer.report()
        self.assertEqual(report['targets'][0]['classification'], 'unclassified-worker-url')
        self.assertEqual(report['pthreadTargetsIdentifiedByUrl'], [])
        self.assertEqual(report['snapshots'][-1]['workerTargets'][0]['url'], 'blob:http://local/random')

    def test_unavailable_protocol_is_reported_not_inferred_empty_success(self):
        class Unsupported:
            def send(self, *_args):
                raise RuntimeError('Target domain unavailable')
        observer = self.Observer(Unsupported()).start()
        observer.snapshot('before-browser-close')
        report = observer.report()
        self.assertFalse(report['discoveryEnabled'])
        self.assertEqual(report['status'], 'WORKER_TARGETS_UNOBSERVABLE')
        self.assertFalse(report['snapshots'][-1]['querySucceeded'])
        self.assertEqual(len(report['errors']), 2)

    def test_report_is_frozen_before_later_browser_close_events(self):
        cdp = self.CDP()
        observer = self.Observer(cdp).start()
        cdp.create({'targetId': 'parent', 'type': 'worker', 'url': '/inference-worker.mjs'})
        before_close = observer.report()
        cdp.destroy('parent')
        self.assertFalse(before_close['targets'][0]['destroyEventObserved'])
        self.assertTrue(observer.report()['targets'][0]['destroyEventObserved'])
        self.assertNotIn('targetDestroyed', [event['event'] for event in before_close['events']])

    def test_reentrant_protocol_callback_reserves_snapshot_before_send(self):
        cdp = self.CDP()
        observer = self.Observer(cdp).start()
        observer.MAX_SNAPSHOTS = 2
        original_send = cdp.send
        def nested_send(method, params=None):
            if method == 'Target.getTargets':
                observer.snapshot('nested-marker')
            return original_send(method, params)
        cdp.send = nested_send
        observer.snapshot('outer-marker')
        self.assertEqual([item['label'] for item in observer.snapshots], ['browser-ready', 'outer-marker'])
        self.assertEqual(observer.dropped['snapshots'], 1)

    def test_post_operation_settlement_pumps_until_known_parent_and_pthreads_exit(self):
        cdp = self.CDP()
        observer = self.Observer(cdp).start()
        cdp.create({'targetId': 'parent', 'type': 'worker', 'url': '/inference-worker.mjs'})
        for index in range(3):
            cdp.create({'targetId': 'pthread' + str(index), 'type': 'worker',
                        'url': '/ort-wasm-simd-threaded.mjs', 'openerId': 'parent'})
        waits = []
        def pump(milliseconds):
            waits.append(milliseconds)
            for target_id in list(cdp.targets):
                cdp.destroy(target_id)
        settlement = observer.settle('encode:after-operation', pump)
        self.assertEqual(settlement['status'], 'OBSERVED_WORKERS_ABSENT')
        self.assertEqual(settlement['polls'], 2)
        self.assertEqual(len(settlement['initialWorkerTargets']), 4)
        self.assertEqual(settlement['remainingWorkerTargets'], [])
        self.assertEqual(settlement['remainingWorkerTargetCount'], 0)
        self.assertEqual(len(settlement['destroyEventTargetIdsObserved']), 4)
        self.assertEqual(settlement['knownTargetIdsWithoutDestroyEvent'], [])
        self.assertEqual(waits, [50.])
        self.assertGreaterEqual(settlement['durationSeconds'], 0)
        self.assertEqual(observer.snapshots[-1]['label'], 'encode:after-operation:settlement-end')
        self.assertEqual(observer.report()['settlements'][0], settlement)

    def test_settlement_records_already_gone_known_targets_without_waiting(self):
        cdp = self.CDP()
        observer = self.Observer(cdp).start()
        cdp.create({'targetId': 'parent', 'type': 'worker', 'url': '/inference-worker.mjs'})
        cdp.destroy('parent')
        settlement = observer.settle('dispose', lambda _ms: self.fail('No wait needed'))
        self.assertEqual(settlement['status'], 'OBSERVED_WORKERS_ABSENT')
        self.assertEqual(settlement['polls'], 1)
        self.assertEqual(settlement['destroyEventTargetIdsObserved'], ['parent'])
        self.assertEqual(settlement['initialWorkerTargets'], [])

    def test_settlement_deadline_does_not_claim_known_live_target_exit(self):
        cdp = self.CDP()
        observer = self.Observer(cdp).start()
        cdp.create({'targetId': 'parent', 'type': 'worker', 'url': '/inference-worker.mjs'})
        settlement = observer.settle('dispose', lambda _ms: self.fail('Zero-budget probe'), timeout_seconds=0)
        self.assertEqual(settlement['status'], 'KNOWN_WORKERS_STILL_PRESENT_AT_DEADLINE')
        self.assertEqual(settlement['remainingWorkerTargetCount'], 1)
        self.assertEqual(settlement['knownTargetIdsWithoutDestroyEvent'], ['parent'])
        self.assertEqual(settlement['destroyEventTargetIdsObserved'], [])

    def test_settlement_query_failure_is_unobservable_not_empty(self):
        cdp = self.CDP()
        observer = self.Observer(cdp).start()
        def unavailable(*_args):
            raise RuntimeError('CDP unavailable')
        cdp.send = unavailable
        settlement = observer.settle('dispose', lambda _ms: self.fail('No wait after query failure'))
        self.assertEqual(settlement['status'], 'UNOBSERVABLE_QUERY_OR_EVENT_PUMP')
        self.assertFalse(settlement['querySucceeded'])
        self.assertIsNone(settlement['remainingWorkerTargets'])
        self.assertTrue(observer.report()['errors'])

    def test_settlement_absence_without_any_worker_observed_is_unobservable(self):
        observer = self.Observer(self.CDP()).start()
        settlement = observer.settle('preflight', lambda _ms: self.fail('No wait needed'))
        self.assertEqual(settlement['status'], 'UNOBSERVABLE_OR_NO_WORKERS_CREATED')
        self.assertEqual(settlement['knownTargetIdsAtStart'], [])

    def test_settlement_worker_churn_does_not_grow_target_identity_retention(self):
        cdp = self.CDP()
        observer = self.Observer(cdp).start()
        observer.MAX_TARGETS = 1
        cdp.create({'targetId': 'first', 'type': 'worker', 'url': 'blob:first'})
        pumps = []
        def pump(_milliseconds):
            pumps.append(True)
            for target_id in list(cdp.targets):
                cdp.destroy(target_id)
            if len(pumps) == 1:
                cdp.create({'targetId': 'second', 'type': 'worker', 'url': 'blob:second'})
        settlement = observer.settle('bounded-churn', pump)
        self.assertEqual(settlement['status'], 'OBSERVED_WORKERS_ABSENT')
        self.assertEqual(settlement['observedTargetIdsDuringSettlement'], ['first'])
        self.assertEqual(settlement['omittedTargetIdObservations'], 1)

    def test_settlement_limits_are_bounded_and_do_not_grow_receipts(self):
        observer = self.Observer(self.CDP()).start()
        for timeout, interval in [(-1, .05), (61, .05), (10, 0), (10, 2)]:
            with self.assertRaises(ValueError):
                observer.settle('invalid', lambda _ms: None, timeout, interval)
        observer.MAX_SETTLEMENTS = 1
        observer.settle('first', lambda _ms: None)
        result = observer.settle('second', lambda _ms: self.fail('No second poll'))
        self.assertEqual(result['status'], 'UNOBSERVABLE_RETENTION_LIMIT')
        self.assertEqual(len(observer.settlements), 1)
        self.assertEqual(observer.dropped['settlements'], 1)

    def test_target_event_and_snapshot_retention_is_bounded(self):
        cdp = self.CDP()
        observer = self.Observer(cdp)
        observer.MAX_TARGETS, observer.MAX_EVENTS, observer.MAX_SNAPSHOTS = 1, 2, 2
        observer.start()
        for index in range(4):
            cdp.create({'targetId': str(index), 'type': 'worker', 'url': 'blob:' + str(index)})
        for _ in range(4):
            observer.snapshot('bounded')
        report = observer.report()
        self.assertEqual(len(report['targets']), 1)
        self.assertLessEqual(len(report['events']), 2)
        self.assertEqual(len(report['snapshots']), 2)
        self.assertEqual(len(report['snapshots'][-1]['workerTargets']), 1)
        self.assertEqual(report['snapshots'][-1]['omittedWorkerTargets'], 3)
        self.assertGreater(report['dropped']['targets'], 0)
        self.assertGreater(report['dropped']['snapshots'], 0)


if __name__ == '__main__':
    unittest.main()
