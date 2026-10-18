"""Boundaries of the independent native-entry evidence checks, without a browser."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

path = Path(__file__).resolve().parents[1]/'tools/vr180/probe-indexed-entry.py'
spec = importlib.util.spec_from_file_location('entry_probe', path)
probe = importlib.util.module_from_spec(spec); spec.loader.exec_module(probe)

def row():
    result = {'operationId': 'test-operation', 'inputRevision': 7, 'registryEvents': []}
    identity = {'format': 'vr180-indexed-registry', 'schema': 1, 'operationId': result['operationId'],
                'inputRevision': 7, 'namespace': 'test-operation-r7', 'ownerToken': 'a'*32}
    raw = json.dumps(identity, separators=(',', ':'))
    result['registryEvents'].append({'status': 'ready', 'identity': identity.copy(), 'ticketCount': 0,
        'persistedJSON': raw, 'sha256': hashlib.sha256(raw.encode()).hexdigest(), 'bytes': len(raw),
        'flushed': True, 'closed': True, 'readbackMatched': True, 'writeCalls': 2, 'readCalls': 3})
    for kind in ('input', 'output'):
        ticket = {'format': 'vr180-private-index-owner', 'schema': 1, 'kind': kind,
                  'jobId': result['operationId']+('-in' if kind == 'input' else '-out'), 'ownerToken': 'b'*32}
        raw = json.dumps({'identity': identity, 'ticket': ticket}, separators=(',', ':'))
        result['registryEvents'].append({'status': 'persisted', 'identity': identity.copy(), 'ticket': ticket,
            'persistedJSON': raw, 'sha256': hashlib.sha256(raw.encode()).hexdigest(), 'bytes': len(raw),
            'flushed': True, 'closed': True, 'readbackMatched': True, 'writeCalls': 2, 'readCalls': 3})
    return result

class EvidenceChecks(unittest.TestCase):
    def test_complete_small_suite_keeps_old_routes_and_same_handle_retry(self):
        cases = probe.cases()
        self.assertEqual(len(cases), 12)
        self.assertEqual(sum(c['settings']['mode'] != 'inspect' and not c.get('expectCancel') and not c.get('expectedError') for c in cases), 9)
        self.assertEqual([c['name'] for c in cases[:4]], ['inspect', 'copy', 'legacy-prepared', 'legacy-direct'])
        self.assertTrue(all('executionRoute' not in c['settings'] for c in cases[:4]))
        self.assertTrue(all(c['settings']['executionRoute'] == 'indexed' for c in cases[4:]))
        self.assertEqual(cases[-2]['handleKey'], cases[-1]['handleKey'])
        self.assertTrue(any(c['settings']['fov'] == 360 and c['settings']['layout'] == 'tb' for c in cases))

    def test_matching_bytes_accept(self):
        self.assertEqual(probe.verify_ownership(row())['status'], 'PASS')

    def test_modified_original_bytes_reject(self):
        data = row(); data['registryEvents'][0]['persistedJSON'] += ' '
        with self.assertRaises(Exception): probe.verify_ownership(data)

    def test_changed_generation_rejects_even_rehashed_bytes(self):
        data = row(); event = data['registryEvents'][1]; event['identity']['inputRevision'] = 6
        raw = json.dumps({'identity': event['identity'], 'ticket': event['ticket']}, separators=(',', ':'))
        event.update(persistedJSON=raw, bytes=len(raw), sha256=hashlib.sha256(raw.encode()).hexdigest())
        with self.assertRaises(Exception): probe.verify_ownership(data)

    def test_missing_duplicate_or_extra_ticket_reject(self):
        data = row()
        for records in [data['registryEvents'][:2], data['registryEvents'][:2]+[data['registryEvents'][1]], data['registryEvents']*2]:
            with self.subTest(count=len(records)), self.assertRaises(Exception):
                probe.verify_ownership({**data, 'registryEvents': records})

    def test_partial_native_lifecycle_reject(self):
        for field in ['flushed', 'closed', 'readbackMatched', 'writeCalls', 'readCalls']:
            data = copy.deepcopy(row()); data['registryEvents'][0][field] = False
            with self.subTest(field=field), self.assertRaises(Exception): probe.verify_ownership(data)

    def test_schema_token_namespace_and_job_identity_reject_even_rehashed(self):
        for field, value in [('format', 'wrong'), ('schema', 2), ('schema', True), ('namespace', 'wrong'), ('ownerToken', 'bad')]:
            data = row()
            for event in data['registryEvents']:
                event['identity'][field] = value
                content = event['identity'] if event['status'] == 'ready' else {'identity': event['identity'], 'ticket': event['ticket']}
                raw = json.dumps(content, separators=(',', ':'))
                event.update(persistedJSON=raw, bytes=len(raw), sha256=hashlib.sha256(raw.encode()).hexdigest())
            with self.subTest(field=field), self.assertRaises(Exception): probe.verify_ownership(data)
        for field, value in [('format', 'wrong'), ('schema', 2), ('schema', True), ('jobId', 'other-in'), ('ownerToken', 'bad')]:
            data = row(); event = data['registryEvents'][1]; event['ticket'][field] = value
            raw = json.dumps({'identity': event['identity'], 'ticket': event['ticket']}, separators=(',', ':'))
            event.update(persistedJSON=raw, bytes=len(raw), sha256=hashlib.sha256(raw.encode()).hexdigest())
            with self.subTest(field=field), self.assertRaises(Exception): probe.verify_ownership(data)

class RecoveryLifecycle(unittest.TestCase):
    def test_actual_browser_scripts_hold_prepared_file_until_matching_finish(self):
        # Execute the actual JS strings with a bounded client/File lifetime
        # stand-in. This checks ordering, not native OPFS or browser support.
        script = """
import assert from 'node:assert/strict';
const run = eval(RUN_SCRIPT), finish = eval(FINISH_SCRIPT);
const events = [], urls = new Map(); let alive = true;
const input = {size: 3}, saved = {size: 5};
globalThis.fetch = async () => ({ok: true, blob: async () => input});
globalThis.File = class {constructor([blob]) {this.size = blob.size;}};
globalThis.URL = {createObjectURL(blob) {urls.set('blob:prepared', blob); return 'blob:prepared';},
 revokeObjectURL(url) {events.push('revoke'); urls.delete(url);}};
const receipt = {schemaVersion: 2, build: 'test', operationId: 'op', inputRevision: 1,
 input: {bytes: 3, sha256: 'input'}, output: {bytes: 5, sha256: 'output'}, saveWriteCommitted: false, saveCompleted: false};
const state = globalThis.__entryProbe = {rows: [], urls: [], names: [], active: null,
 require(ok, message) {assert.ok(ok, message);},
 async sha256Blob(blob) {if (blob === saved) assert.ok(alive, 'prepared file invalid after dispose'); return blob === saved ? 'output' : 'input';}};
state.client = {current: null, cleanupPending: false,
 async run() {events.push('run'); this.current = {operationId: 'op', inputRevision: 1}; return {receipt, blob: saved};},
 async dispose() {events.push('dispose'); alive = false; this.current = null;
  state.active.cleanupEvent = {type: 'cleanup-complete', operationId: 'op', inputRevision: 1};}};
const trial = {name: 'legacy-prepared', source: 'fixture.mp4', settings: {mode: 'convert'}, direct: false};
const pending = await run(trial);
assert.equal(pending.status, 'PASS'); assert.equal(pending.finishState, 'PENDING');
assert.equal(pending.workerHeldAfterRun, true); assert.deepEqual(events, ['run']);
await assert.rejects(finish({operationId: 'other', inputRevision: 1, name: trial.name}), /FINISH_CASE_IDENTITY/);
assert.equal(alive, true);
events.push('download-save-as'); await state.sha256Blob(urls.get('blob:prepared')); events.push('full-file-hash');
const result = await finish({operationId: 'op', inputRevision: 1, name: trial.name, recovery: {status: 'PASS'}});
assert.equal(result.receipt, receipt); assert.equal(result.status, 'PASS');
assert.equal(result.clientReleased, true); assert.equal(result.cleanupIdentityMatched, true);
assert.equal(result.finishState, 'COMPLETE'); assert.equal(state.active, null);
assert.deepEqual(events, ['run', 'download-save-as', 'full-file-hash', 'dispose', 'revoke']);
assert.equal(urls.size, 0);
""".replace('RUN_SCRIPT', json.dumps(probe.RUN_CASE)).replace('FINISH_SCRIPT', json.dumps(probe.FINISH_CASE))
        result = subprocess.run(['node', '--input-type=module'], input=script, text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_finish_waits_for_cancel_and_preserves_rejection_cleanup_checks(self):
        script = """
import assert from 'node:assert/strict';
const finish = eval(FINISH_SCRIPT);
Object.defineProperty(globalThis, 'navigator', {value: {locks: {async query() {return {held: []};}}}});
for (const canceled of [true, false]) {
 const identity = {operationId: 'op', inputRevision: 1, namespace: 'op-r1'};
 const row = {...identity, name: canceled ? 'cancel' : 'reject', inputBytes: 3, inputSHA256: 'input',
  status: canceled ? 'EXPECTED_CANCELLATION' : 'EXPECTED_REJECTION', settings: {executionRoute: 'indexed'},
  expectCancel: canceled, expectedError: canceled ? undefined : 'OUTPUT_PROFILE_UNSUPPORTED',
  registryEvents: canceled ? Array.from({length: 3}, () => ({identity})) : [],
  cleanupEvent: {...identity, type: 'cleanup-complete', internalIndexCleanup: 'complete'},
  receipt: {schemaVersion: 2, operationId: 'op', inputRevision: 1, status: canceled ? 'canceled' : 'failed',
   input: {bytes: 3, sha256: canceled ? 'input' : null}, output: null, saveWriteCommitted: false, saveCompleted: false,
   saveAttempts: [{commitState: canceled ? 'aborted' : 'not-started'}], cleanup: {status: 'complete'},
   internalIndexCleanup: 'complete', error: canceled ? {name: 'AbortError'} : {message: 'OUTPUT_PROFILE_UNSUPPORTED'}}};
 let acknowledge, disposed = 0;
 if (canceled) row.cancelPromise = new Promise(resolve => {acknowledge = () => {row.cancelAcknowledged = true; resolve();};});
 const state = globalThis.__entryProbe = {active: row, activeHandle: {async getFile() {return {size: 0};}},
  require(ok, message) {assert.ok(ok, message);}, client: {current: null, cleanupPending: false,
   async dispose() {if (canceled) assert.equal(row.cancelAcknowledged, true); disposed++;}},
  origin: {async getDirectoryHandle() {throw Object.assign(Error('absent'), {name: 'NotFoundError'});}}};
 const pending = finish({...identity, name: row.name, recovery: {status: 'NOT_REQUIRED'}});
 if (canceled) {assert.equal(disposed, 0); acknowledge();}
 const result = await pending;
 assert.equal(disposed, 1); assert.equal(result.negativeReceiptVerified, true);
 assert.equal(result.registryAbsent, true); assert.equal(result.heldJobLocks, 0);
 assert.equal(result.clientReleased, true); assert.equal(result.cleanupIdentityMatched, true);
 assert.equal(result.status, canceled ? 'EXPECTED_CANCELLATION' : 'EXPECTED_REJECTION');
 assert.equal(state.active, null);
}
""".replace('FINISH_SCRIPT', json.dumps(probe.FINISH_CASE))
        result = subprocess.run(['node', '--input-type=module'], input=script, text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

    def run_fake_host(self, out, root, *, fail_save=False, mismatch=False, fail_finish=False):
        events = []; request_log = []; source = root/'fixture.mp4'; source.write_bytes(b'in!')
        trial = {'name': 'legacy-prepared', 'source': source.name, 'settings': {'mode': 'convert'}, 'direct': False}
        receipt = {'schemaVersion': 2, 'status': 'prepared', 'operationId': 'op', 'inputRevision': 1}
        data = {**trial, 'status': 'PASS', 'executionStatus': 'PASS', 'finishState': 'PENDING', 'build': 'test',
                'operationId': 'op', 'inputRevision': 1, 'workerHeldAfterRun': True, 'urlIndex': 0,
                'inputBytes': 3, 'inputSHA256': hashlib.sha256(b'in!').hexdigest(),
                'bytes': 3, 'sha256': hashlib.sha256(b'out').hexdigest(), 'receipt': receipt}
        report = {'build': 'test', 'cases': [], 'fullOutputsRecovered': 0}
        class Page:
            alive = True
            def evaluate(self, code, argument):
                if code == probe.RUN_CASE:
                    events.append('run'); request_log.append(probe.LEGACY); return copy.deepcopy(data)
                if code == probe.FINISH_CASE:
                    events.append('finish'); self.alive = False
                    if fail_finish: raise RuntimeError('cleanup also failed')
                    final = copy.deepcopy(data); final.update(recovery=argument['recovery'], finishState='COMPLETE',
                        clientReleased=True, cleanupIdentityMatched=True, cleanupEvent={'type': 'cleanup-complete'})
                    if argument['hostError']: final.update(status='FAIL', hostError=argument['hostError'])
                    return final
                events.append('download-click'); assert self.alive
            def expect_download(self, timeout):
                self.value = self; return self
            def __enter__(self): events.append('expect-download'); return self
            def __exit__(self, *_): pass
            def save_as(self, path):
                events.append('save-as'); assert self.alive
                Path(path).write_bytes(b'bad' if mismatch else b'out')
                if fail_save: raise RuntimeError('Download.save_as: canceled')
        page = Page(); original_digest = probe.cloud.digest
        def digest(path):
            if Path(path).name == 'output.mp4':
                events.append('full-file-hash'); self.assertTrue(page.alive)
            return original_digest(path)
        with mock.patch.object(probe.cloud, 'ROOT', root), mock.patch.object(probe.cloud, 'check_recovery_budget'), mock.patch.object(probe.cloud, 'digest', digest):
            try: probe.run_trial(page, trial, report, out, request_log)
            except Exception as error: return report, events, error
        return report, events, None

    def test_host_finishes_only_after_save_as_and_full_disk_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); out = root/'evidence'; out.mkdir()
            report, events, error = self.run_fake_host(out, root)
            self.assertIsNone(error)
            self.assertEqual(events, ['run', 'expect-download', 'download-click', 'save-as', 'full-file-hash', 'finish'])
            self.assertEqual(report['fullOutputsRecovered'], 1)
            final = json.loads((out/'legacy-prepared/trial.json').read_text())
            self.assertEqual(final, report['cases'][0])
            self.assertEqual(final['finishState'], 'COMPLETE')
            self.assertEqual(final['recovery']['status'], 'PASS')

    def test_download_and_hash_failures_still_finish_and_preserve_receipt(self):
        for failure in ('download', 'hash', 'download-and-finish'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); out = root/'evidence'; out.mkdir()
                report, events, error = self.run_fake_host(out, root, fail_save=failure != 'hash',
                    mismatch=failure == 'hash', fail_finish=failure == 'download-and-finish')
                self.assertIsNotNone(error); self.assertEqual(events[-1], 'finish')
                self.assertEqual(report['fullOutputsRecovered'], 0)
                final = report['cases'][0]
                self.assertEqual(final['receipt']['status'], 'prepared')
                self.assertEqual(final['status'], 'FAIL')
                self.assertEqual(final['recovery']['status'], 'FAIL')
                self.assertEqual(json.loads((out/'legacy-prepared/trial.json').read_text()), final)
                raw = (out/'legacy-prepared-failure-traceback.txt').read_text()
                self.assertIn('Recovered complete MP4 differs' if failure == 'hash' else 'Download.save_as: canceled', raw)
                if failure == 'download-and-finish':
                    self.assertIn('Download.save_as: canceled', str(error))
                    self.assertIn('cleanup also failed', final['finishError']['message'])
                    self.assertTrue((out/'legacy-prepared-finish-traceback.txt').is_file())

if __name__ == '__main__': unittest.main()
