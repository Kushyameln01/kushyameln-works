import test from 'node:test';
import assert from 'node:assert/strict';
import {StereoClient} from '../docs/shared/vr180/client.mjs';
class MockWorker {
  static instances = [];
  constructor() { MockWorker.instances.push(this); this.messages = []; }
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(message) { this.onmessage?.({data: message}); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return {promise, resolve}; };
const message = (worker, type, extra = {}) => ({type, operationId: worker.messages[0].operationId,
  inputRevision: worker.messages[0].inputRevision, ...extra});
const ack = (worker, extra = {}) => worker.emit(message(worker, 'cleanup-complete', {requestId: worker.messages.at(-1).requestId, ...extra}));
const dispose = async (client, worker) => { const pending = client.dispose(); ack(worker); await pending; };

test('cancel waits for matching cleanup ack; late success/error from input A cannot replace B', async () => {
  const events = [], removed = [];
  const client = new StereoClient({WorkerClass: MockWorker, onEvent: e => events.push(e), cleanup: async id => removed.push(id)});
  const a = client.run(new Blob(['A']), {}), rejected = assert.rejects(a, {name: 'AbortError'});
  const wa = MockWorker.instances.at(-1); let settled = false; a.catch(() => { settled = true; });
  const stopping = client.cancel(); assert.equal(client.cancel(), stopping);
  assert.equal(wa.messages.at(-1).type, 'cancel'); assert.notEqual(wa.terminated, true);
  assert.throws(() => client.run(new Blob(['B']), {}), /PREVIOUS_JOB_NOT_DISPOSED/);
  wa.emit(message(wa, 'result', {result: {wrong: true}}));
  await tick(); assert.equal(settled, false);
  wa.emit(message(wa, 'cleanup-complete', {requestId: 'old-request'}));
  await tick(); assert.equal(settled, false);
  ack(wa); await stopping; await rejected; assert.equal(wa.terminated, true); assert.deepEqual(removed, []);
  const b = client.run(new Blob(['B']), {}), wb = MockWorker.instances.at(-1);
  wa.emit(message(wa, 'result', {result: {wrong: true}})); wa.emit(message(wa, 'error', {error: 'old'}));
  wb.emit(message(wb, 'result', {result: {correct: true}})); assert.equal((await b).correct, true);
  assert.equal(events.filter(e => e.type === 'result').length, 1); await dispose(client, wb);
});

test('revision mismatch is ignored; a cleaned Worker failure preserves its original receipt', async () => {
  const removed = [], client = new StereoClient({WorkerClass: MockWorker, cleanup: async id => removed.push(id)});
  const pending = client.run(new Blob(), {}), worker = MockWorker.instances.at(-1);
  const diagnostics = {status: 'failed', error: {name: 'Error', message: 'CODEC_UNSUPPORTED'}};
  worker.emit({...message(worker, 'result', {result: {wrong: true}}), inputRevision: 999});
  worker.emit(message(worker, 'error', {error: 'CODEC_UNSUPPORTED', diagnostics, cleanupComplete: true}));
  await assert.rejects(pending, error => error.message === 'CODEC_UNSUPPORTED' && error.diagnostics === diagnostics);
  assert.equal(client.current, null); assert.equal(worker.terminated, true); assert.deepEqual(removed, []);
});

test('retained result releases only after Worker cleanup, without accepting a duplicate terminal response', async () => {
  const client = new StereoClient({WorkerClass: MockWorker});
  const pending = client.run(new Blob(), {}), worker = MockWorker.instances.at(-1);
  worker.emit(message(worker, 'result', {result: {blob: new Blob(['ok'])}})); await pending;
  worker.emit(message(worker, 'error', {error: 'late duplicate'})); assert.equal(client.cleanupPending, false);
  const releasing = client.dispose(); assert.equal(worker.messages.at(-1).type, 'release');
  assert.notEqual(worker.terminated, true); ack(worker); await releasing; assert.equal(worker.terminated, true);
});

test('cleanup failure retains the pending operation and raw diagnostics; explicit retry ignores an old ack', async () => {
  const events = [], client = new StereoClient({WorkerClass: MockWorker, onEvent: e => events.push(e)});
  const pending = client.run(new Blob(), {}), worker = MockWorker.instances.at(-1);
  let settled = false; pending.catch(() => { settled = true; });
  const raw = {status: 'canceled', error: {name: 'AbortError', message: 'Conversion was canceled.'}, cleanup: {status: 'failed'}};
  const stopping = client.cancel(), firstId = worker.messages.at(-1).requestId;
  worker.emit(message(worker, 'error', {error: raw.error.message, diagnostics: raw, cleanupComplete: false}));
  worker.emit(message(worker, 'cleanup-error', {requestId: firstId, error: 'LOCKED', diagnostics: raw}));
  await assert.rejects(stopping, /LOCKED/); await tick();
  assert.equal(settled, false); assert.equal(client.cleanupPending, true); assert.notEqual(worker.terminated, true);
  assert.throws(() => client.run(new Blob(), {}), /PREVIOUS_JOB_NOT_DISPOSED/);
  const retry = client.cancel(), secondId = worker.messages.at(-1).requestId; assert.notEqual(firstId, secondId);
  worker.emit(message(worker, 'cleanup-complete', {requestId: firstId})); await tick(); assert.equal(settled, false);
  ack(worker, {diagnostics: raw}); await retry;
  await assert.rejects(pending, error => error.name === 'AbortError' && error.diagnostics === raw);
  assert.equal(raw.cleanup.status, 'failed'); assert.equal(client.current, null);
  assert.equal(events.find(e => e.type === 'cleanup-error').diagnostics, raw);
});

test('non-cancellation failure also waits through cleanup failure and preserves the original error', async () => {
  const client = new StereoClient({WorkerClass: MockWorker});
  const pending = client.run(new Blob(), {}), worker = MockWorker.instances.at(-1);
  const raw = {status: 'failed', error: {name: 'Error', message: 'OUTPUT_ENCODE_UNSUPPORTED'}};
  worker.emit(message(worker, 'error', {error: raw.error.message, diagnostics: raw, cleanupComplete: false, cleanupError: 'LOCKED'}));
  assert.equal(client.cleanupPending, true);
  const retry = client.cancel(); ack(worker);
  await retry; await assert.rejects(pending, error => error.message === raw.error.message && error.diagnostics === raw);
});

test('synchronous postMessage failure waits for its own fallback deletion', async () => {
  class BadWorker extends MockWorker { postMessage() { throw Error('DATA_CLONE_FAILED'); } }
  const gate = deferred(), removed = [], client = new StereoClient({WorkerClass: BadWorker, cleanup: async id => { removed.push(id); await gate.promise; }});
  const pending = client.run(new Blob(), {}), worker = MockWorker.instances.at(-1);
  const rejection = assert.rejects(pending, /DATA_CLONE_FAILED/);
  assert.equal(worker.terminated, true); assert.notEqual(client.current, null);
  const id = client.current.operationId; gate.resolve(); await rejection;
  assert.deepEqual(removed, [id]); assert.equal(client.current, null);
});

test('abnormal Worker fallback cleanup can be retried and never removes another job', async () => {
  const removed = []; let fail = true;
  const client = new StereoClient({WorkerClass: MockWorker, cleanup: async id => { removed.push(id); if (fail) throw Error('LOCKED'); }});
  const pending = client.run(new Blob(), {}), worker = MockWorker.instances.at(-1), id = client.current.operationId;
  const rejection = assert.rejects(pending, /WORKER_CRASH/);
  worker.onerror({message: 'WORKER_CRASH'}); await tick();
  assert.equal(client.cleanupPending, true); assert.notEqual(client.current, null);
  fail = false; await client.cancel(); await rejection; assert.deepEqual(removed, [id, id]);
});

test('cleanup timeout keeps Worker and processing promise blocked until a new request is acknowledged', async () => {
  const client = new StereoClient({WorkerClass: MockWorker, cleanupTimeoutMs: 10});
  const pending = client.run(new Blob(), {}), worker = MockWorker.instances.at(-1);
  const rejection = assert.rejects(pending, {name: 'AbortError'});
  await assert.rejects(client.cancel(), /CLEANUP_ACK_TIMEOUT/);
  assert.equal(client.cleanupPending, true); assert.notEqual(worker.terminated, true);
  ack(worker); assert.notEqual(client.current, null); // Late ack for expired request.
  const retry = client.cancel(); ack(worker); await retry; await rejection;
});

test('failed codec shutdown is visible, then explicit retry terminates before deleting only its own job', async () => {
  const deletion = deferred(), order = [];
  class TrackedWorker extends MockWorker { terminate() { super.terminate(); order.push('terminate'); } }
  const client = new StereoClient({WorkerClass: TrackedWorker, cleanup: async id => {
    order.push(id); await deletion.promise;
  }});
  const work = client.run(new Blob(), {}), worker = MockWorker.instances.at(-1), id = client.current.operationId;
  const rejected = assert.rejects(work, error => error.name === 'AbortError' && error.diagnostics === original);
  const original = {status: 'canceled', error: {name: 'AbortError', message: 'canceled'},
    cleanup: {status: 'failed', requiresWorkerTermination: true}};
  const stopping = client.cancel();
  worker.emit(message(worker, 'error', {error: 'canceled', diagnostics: original, cleanupComplete: false, requiresWorkerTermination: true}));
  worker.emit(message(worker, 'cleanup-error', {requestId: worker.messages.at(-1).requestId,
    error: 'OUTPUT_CANCEL_FAILED', diagnostics: original, requiresWorkerTermination: true}));
  await assert.rejects(stopping, /OUTPUT_CANCEL_FAILED/);
  assert.deepEqual(order, []); assert.equal(client.cleanupPending, true);
  const retry = client.cancel(); await tick(); assert.deepEqual(order, ['terminate', id]);
  assert.notEqual(client.current, null); deletion.resolve(); await retry; await rejected;
  assert.equal(original.cleanup.status, 'failed'); assert.equal(client.current, null);
});
