import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerController} from '../docs/shared/vr180/worker.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return {promise, resolve}; };
const abortError = () => new DOMException('Conversion was canceled.', 'AbortError');
const input = new Blob(['synthetic input']);
const settings = {mode: 'convert', layout: 'sbs', fov: 180, eyeSize: 256, bitrate: 2000000, confirmed: true};
const info = {width: 512, height: 256, transcodeSafe: true, transcodeIssues: []};
function harness(convertStereo) {
  const messages = [];
  const receive = createWorkerController({postMessage: message => messages.push(message), inspect: async () => info,
    tag: async blob => blob, hash: async () => 'test-hash', loadTransform: async () => ({convertStereo})});
  const send = (type, extra = {}) => receive({data: {type, operationId: 'this-job', inputRevision: 7, ...extra}});
  return {messages, send, run: () => send('run', {file: input, settings}),
    stop: (requestId, extra = {}) => send('cancel', {requestId, ...extra})};
}

test('cooperative cancellation waits for conversion unwind and cleanup before matching acknowledgement', async () => {
  const entered = deferred(), unwound = deferred(), deletion = deferred(), order = [];
  const h = harness(async (file, config, {signal, onCleanup}) => {
    onCleanup(async () => { order.push('cleanup'); await deletion.promise; order.push('deleted'); });
    entered.resolve(); await unwound.promise;
    assert.equal(signal.aborted, true); order.push('writer-codec-released'); throw abortError();
  });
  const work = h.run(); await entered.promise;
  const stop = h.stop('cleanup-1'); await tick(); assert.deepEqual(h.messages, []);
  unwound.resolve(); await tick(); assert.deepEqual(order, ['writer-codec-released', 'cleanup']);
  assert.deepEqual(h.messages, []); deletion.resolve(); await work; await stop;
  assert.deepEqual(order, ['writer-codec-released', 'cleanup', 'deleted']);
  assert.deepEqual(h.messages.map(m => m.type), ['error', 'cleanup-complete']);
  const [failure, ack] = h.messages;
  assert.equal(failure.diagnostics.status, 'canceled'); assert.equal(failure.cleanupComplete, true);
  assert.equal(ack.requestId, 'cleanup-1'); assert.equal(ack.operationId, 'this-job'); assert.equal(ack.inputRevision, 7);
  assert.equal(ack.diagnostics, failure.diagnostics); assert.equal(ack.diagnostics.build, 'vr180-b2-cancel1');
});

test('failed deletion remains retryable without replacing the original canceled receipt', async () => {
  const entered = deferred(), aborted = deferred(); let attempts = 0;
  const h = harness(async (file, config, {signal, onCleanup}) => {
    onCleanup(async () => { if (++attempts === 1) throw Error('OPFS_LOCKED'); });
    signal.addEventListener('abort', () => aborted.resolve(), {once: true}); entered.resolve();
    await aborted.promise; throw abortError();
  });
  const work = h.run(); await entered.promise; await h.stop('cleanup-1'); await work;
  assert.equal(attempts, 1); assert.deepEqual(h.messages.map(m => m.type), ['error', 'cleanup-error']);
  const original = h.messages[0].diagnostics, serialized = JSON.stringify(original);
  assert.equal(original.cleanup.status, 'failed'); assert.equal(original.cleanup.error, 'OPFS_LOCKED');
  await h.stop('cleanup-2'); assert.equal(attempts, 2);
  const ack = h.messages.at(-1); assert.equal(ack.type, 'cleanup-complete'); assert.equal(ack.requestId, 'cleanup-2');
  assert.equal(ack.diagnostics, original); assert.equal(JSON.stringify(original), serialized);
  assert.deepEqual(ack.cleanup, {status: 'complete', attempt: 2});
});

test('a codec failure reports its original error only after cleanup has finished', async () => {
  const started = deferred(), deletion = deferred();
  const h = harness(async (file, config, {onCleanup}) => {
    onCleanup(async () => { started.resolve(); await deletion.promise; }); throw Error('OUTPUT_ENCODE_UNSUPPORTED');
  });
  const work = h.run(); await started.promise; assert.deepEqual(h.messages, []);
  deletion.resolve(); await work;
  assert.equal(h.messages.length, 1); assert.equal(h.messages[0].error, 'OUTPUT_ENCODE_UNSUPPORTED');
  assert.equal(h.messages[0].diagnostics.status, 'failed'); assert.equal(h.messages[0].cleanupComplete, true);
});

test('prepared output remains retained until release; foreign job or revision cannot delete it', async () => {
  const deletion = deferred(); let attempts = 0;
  const h = harness(async () => ({file: input, metrics: {}, cleanup: async () => { attempts++; await deletion.promise; }}));
  await h.run(); const prepared = h.messages[0].result.receipt, serialized = JSON.stringify(prepared);
  assert.equal(prepared.status, 'prepared'); assert.equal(attempts, 0);
  h.stop('foreign-job', {operationId: 'another-job'}); h.stop('foreign-revision', {inputRevision: 8});
  await tick(); assert.equal(attempts, 0);
  const release = h.send('release', {requestId: 'release-1'}); await tick();
  assert.equal(attempts, 1); assert.equal(h.messages.length, 1);
  deletion.resolve(); await release;
  assert.equal(h.messages.at(-1).type, 'cleanup-complete'); assert.equal(h.messages.at(-1).requestId, 'release-1');
  assert.equal(JSON.stringify(prepared), serialized);
});

test('cancellation during uninterruptible finalization waits and never publishes the completed output', async () => {
  const entered = deferred(), finalized = deferred(), order = [];
  const h = harness(async (file, config, {onCleanup}) => {
    const cleanup = async () => { order.push('cleanup'); }; onCleanup(cleanup); entered.resolve();
    await finalized.promise; order.push('finalized'); return {file: input, metrics: {}, cleanup};
  });
  const work = h.run(); await entered.promise; const stop = h.stop('finalizing-cancel');
  await tick(); assert.deepEqual(order, []); assert.deepEqual(h.messages, []);
  finalized.resolve(); await work; await stop;
  assert.deepEqual(order, ['finalized', 'cleanup']); assert.equal(h.messages.some(m => m.type === 'result'), false);
  assert.equal(h.messages[0].diagnostics.status, 'canceled'); assert.equal(h.messages.at(-1).type, 'cleanup-complete');
});

test('a result/cancel message race retains prepared data and emits a separate raw cancellation receipt', async () => {
  const h = harness(async () => ({file: input, metrics: {}, cleanup: async () => {}}));
  await h.run(); const prepared = h.messages[0].result.receipt, serialized = JSON.stringify(prepared);
  await h.stop('late-cancel');
  const ack = h.messages.at(-1);
  assert.equal(ack.type, 'cleanup-complete'); assert.equal(ack.diagnostics.status, 'canceled');
  assert.equal(ack.diagnostics.output, null); assert.equal(ack.diagnostics.preparedBeforeCancel, prepared);
  assert.equal(JSON.stringify(prepared), serialized);
});

test('uncertain codec shutdown is exposed in both raw diagnostics and cleanup acknowledgement', async () => {
  const entered = deferred(), aborted = deferred();
  const h = harness(async (file, config, {signal, onCleanup}) => {
    onCleanup(async () => { throw Object.assign(Error('OUTPUT_CANCEL_FAILED'), {requiresWorkerTermination: true}); });
    signal.addEventListener('abort', () => aborted.resolve(), {once: true}); entered.resolve();
    await aborted.promise; throw abortError();
  });
  const work = h.run(); await entered.promise; await h.stop('cleanup-1'); await work;
  assert.equal(h.messages[0].diagnostics.cleanup.requiresWorkerTermination, true);
  assert.equal(h.messages[0].requiresWorkerTermination, true);
  assert.equal(h.messages.at(-1).requiresWorkerTermination, true);
  assert.equal(h.messages.at(-1).type, 'cleanup-error');
});
