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

test('indexed known commit remains pending until explicit registry recovery; no legacy cleanup shortcut',async()=>{
  const events=[];let recoveries=0;
  const client=new StereoClient({WorkerClass:MockWorker,onEvent:e=>events.push(e),cleanup:async()=>{throw Error('LEGACY_CLEANUP');},
    cleanupIndexed:async()=>{recoveries++;return {status:'complete'};}});
  const run=client.run(new Blob(['input']),{mode:'convert',executionRoute:'indexed'},{outputHandle:{}}),worker=MockWorker.instances.at(-1);
  const {operationId,inputRevision}=worker.messages[0],identity={operationId,inputRevision,namespace:`${operationId}-r${inputRevision}`};
  worker.emit(message(worker,'indexed-ownership',{registry:{identity,status:'persisted'}}));
  const receipt={status:'saved',saveWriteCommitted:true,saveCompleted:true};
  worker.emit(message(worker,'result',{result:{receipt}}));await run;
  worker.onerror({message:'CRASH'});await tick();
  assert.equal(recoveries,0);assert.equal(client.cleanupPending,true);assert.equal(client.outputStateUnknown,false);assert(client.current);
  await client.cancel();assert.equal(recoveries,1);assert.equal(client.current,null);
  assert.equal(events.at(-1).internalIndexCleanup,'complete');assert.equal(receipt.saveCompleted,true);
});
test('indexed unknown external save stays unknown after internal recovery and explicit detach preserves diagnostics',async()=>{
  const client=new StereoClient({WorkerClass:MockWorker,listIndexed:async()=>({jobs:[],truncated:false})});
  const run=client.run(new Blob(['input']),{mode:'convert',executionRoute:'indexed'},{outputHandle:{}}),worker=MockWorker.instances.at(-1);
  worker.onerror({message:'CRASH'});await tick();assert.equal(client.outputStateUnknown,true);
  const record=client.current.diagnostics,before=JSON.stringify(record);
  await assert.rejects(client.cancel(),/DIRECT_SAVE_STATE_UNKNOWN/);assert.equal(client.current.internalIndexCleanup,'complete');
  assert.equal(record.saveWriteCommitted,null);assert.equal(JSON.stringify(record),before);
  const rejected=assert.rejects(run,/DIRECT_SAVE_STATE_UNKNOWN/);client.acknowledgeUnknownOutput();await rejected;
  assert.equal(record.saveWriteCommitted,null);assert.equal(client.current,null);
});
test('indexed ignores stale ownership response and requires an explicit internal cleanup acknowledgement',async()=>{
  const client=new StereoClient({WorkerClass:MockWorker}),run=client.run(new Blob(['a']),{mode:'convert',executionRoute:'indexed'},{outputHandle:{}});
  const worker=MockWorker.instances.at(-1),rejected=assert.rejects(run,{name:'AbortError'});
  worker.emit({...message(worker,'indexed-ownership',{registry:{identity:{operationId:'old'}}}),inputRevision:999});
  assert.equal(client.current.registry,undefined);
  const stopped=client.cancel(),stopRejected=assert.rejects(stopped,/INDEXED_CLEANUP_UNCONFIRMED/);ack(worker);await stopRejected;
  assert.equal(client.cleanupPending,true);const again=client.cancel();ack(worker,{internalIndexCleanup:'complete'});await again;await rejected;
  assert.equal(client.current,null);
});
test('cancelled indexed UI result still preserves its received verified save when the Worker dies before cleanup ack',async()=>{
  const events=[];let recoveries=0;
  const client=new StereoClient({WorkerClass:MockWorker,onEvent:e=>events.push(e),listIndexed:async()=>({jobs:[],truncated:false}),
    cleanupIndexed:async()=>{recoveries++;return {status:'complete'};}});
  const run=client.run(new Blob(['input']),{mode:'convert',executionRoute:'indexed'},{outputHandle:{}}),worker=MockWorker.instances.at(-1);
  const {operationId,inputRevision,saveAttemptId}=worker.messages[0];
  const receipt={schemaVersion:2,operationId,inputRevision,status:'saved',output:{bytes:5,sha256:'saved-hash'},saveAttempts:[{
    id:saveAttemptId,resultOperationId:operationId,inputRevision,kind:'direct',commitState:'committed',verificationState:'passed',
    bytes:5,sha256:'saved-hash',wholeFileHashCompared:false,metadataHashMatched:true}]};
  worker.emit(message(worker,'indexed-ownership',{registry:{identity:{operationId,inputRevision,namespace:`${operationId}-r${inputRevision}`}}}));
  const stop=client.cancel(),stopRejected=assert.rejects(stop,/INDEXED_CLEANUP_REQUIRES_EXPLICIT_RECOVERY/);
  worker.emit(message(worker,'result',{result:{receipt,blob:new Blob(['saved'])}}));
  assert.equal(client.current.settled,false);assert.equal(events.some(e=>e.type==='result'),false);
  worker.onerror({message:'CRASH_AFTER_RESULT'});await stopRejected;await tick();
  assert.equal(client.outputStateUnknown,false);assert.equal(client.current.diagnostics.saveCompleted,true);
  assert.equal(client.current.diagnostics.saveWriteCommitted,true);assert.equal(recoveries,0);
  const rejected=assert.rejects(run,/CRASH_AFTER_RESULT/);await client.cancel();await rejected;
  assert.equal(recoveries,1);assert.equal(client.current,null);assert.equal(receipt.saveCompleted,true);
});
test('a duplicate valid terminal receipt cannot replace the first indexed save observation',async()=>{
  const client=new StereoClient({WorkerClass:MockWorker,listIndexed:async()=>({jobs:[],truncated:false})});
  const run=client.run(new Blob(['input']),{mode:'convert',executionRoute:'indexed'},{outputHandle:{}}),worker=MockWorker.instances.at(-1);
  const {operationId,inputRevision,saveAttemptId}=worker.messages[0];
  const makeReceipt=(bytes,sha256)=>({schemaVersion:2,operationId,inputRevision,status:'saved',output:{bytes,sha256},saveAttempts:[{
    id:saveAttemptId,resultOperationId:operationId,inputRevision,kind:'direct',commitState:'committed',verificationState:'passed',
    bytes,sha256,wholeFileHashCompared:false,metadataHashMatched:true}]});
  const first=makeReceipt(5,'first-hash'),duplicate=makeReceipt(8,'different-hash');
  worker.emit(message(worker,'result',{result:{receipt:first}}));await run;
  worker.emit(message(worker,'result',{result:{receipt:duplicate}}));worker.onerror({message:'AFTER_DUPLICATE'});await tick();
  assert.equal(client.current.diagnostics,first);assert.equal(client.current.diagnostics.savedSha256,'first-hash');
  await client.cancel();assert.equal(client.current,null);
});

test('direct worker death keeps its original receipt, requires explicit detachment, and permits a new job afterwards', async () => {
  const events = [], removed = [], client = new StereoClient({WorkerClass: MockWorker,
    onEvent: e => events.push(e), cleanup: async id => removed.push(id)});
  const handle = {}, run = client.run(new Blob(['input']), {mode: 'convert'}, {outputHandle: handle});
  const worker = MockWorker.instances.at(-1); assert.equal(worker.messages[0].outputHandle, handle);
  const original = {status: 'failed', error: {name: 'Error', message: 'WRITE_FAILED'}, saveWriteCommitted: false, cleanup: {status: 'failed'}};
  worker.emit(message(worker, 'error', {error: 'WRITE_FAILED', diagnostics: original, cleanupComplete: false, cleanupError: 'ABORT_FAILED'}));
  worker.onerror({message: 'WORKER_CRASH'}); await tick();
  assert.equal(client.outputStateUnknown, true); assert.equal(client.cleanupPending, true);
  const record = client.current.diagnostics;
  assert.equal(record.workerReceipt, original); assert.equal(original.error.message, 'WRITE_FAILED');
  assert.equal(record.saveWriteCommitted, null); assert.equal(record.cleanup.status, 'unconfirmed');
  assert.equal(record.schemaVersion, 2); assert.equal(record.saveAttempts.length, 1);
  assert.equal(record.saveAttempts[0].id, worker.messages[0].saveAttemptId);
  assert.equal(record.saveAttempts[0].resultOperationId, record.operationId);
  assert.equal(record.saveAttempts[0].inputRevision, record.inputRevision);
  assert.equal(record.saveAttempts[0].commitState, 'unknown');
  const unknownSnapshot = JSON.stringify(record);
  await assert.rejects(client.cancel(), /DIRECT_SAVE_STATE_UNKNOWN/);
  assert.equal(client.current.diagnostics, record); assert.deepEqual(removed, []);
  const rejection = assert.rejects(run, e => e.message === 'DIRECT_SAVE_STATE_UNKNOWN' && e.diagnostics === record);
  assert.equal(client.acknowledgeUnknownOutput(), record); await rejection;
  assert.equal(JSON.stringify(record), unknownSnapshot); // S06: explicit exit does not resolve unknown.
  assert.equal(client.current, null); assert.equal(events.some(e => e.type === 'cleanup-complete'), false);
  assert.equal(events.at(-1).type, 'output-unconfirmed-detached');
  const next = client.run(new Blob(['next']), {}), nextWorker = MockWorker.instances.at(-1);
  nextWorker.emit(message(nextWorker, 'result', {result: {ok: true}})); await next; await dispose(client, nextWorker);
});

test('a confirmed direct save is never downgraded to unknown after Worker death', async () => {
  const events = [], client = new StereoClient({WorkerClass: MockWorker, onEvent: e => events.push(e)});
  const run = client.run(new Blob(), {}, {outputHandle: {}}), worker = MockWorker.instances.at(-1);
  const receipt = {status: 'saved', saveWriteCommitted: true, saveCompleted: true};
  worker.emit(message(worker, 'result', {result: {receipt, blob: new Blob(['saved'])}})); await run;
  worker.onerror({message: 'LATE_CRASH'}); await tick();
  assert.equal(client.current, null); assert.equal(client.outputStateUnknown, false);
  assert.equal(receipt.saveWriteCommitted, true); assert.equal(receipt.saveCompleted, true);
  assert.equal(events.at(-1).diagnostics, receipt);
  assert.match(events.at(-1).cleanup.scope, /saved file retained/);
});

test('direct handle cloning failure is known not to have started a write', async () => {
  class BadWorker extends MockWorker { postMessage() { throw Error('HANDLE_CLONE_FAILED'); } }
  const client = new StereoClient({WorkerClass: BadWorker, cleanup: async () => {}});
  await assert.rejects(client.run(new Blob(), {}, {outputHandle: {}}), /HANDLE_CLONE_FAILED/);
  assert.equal(client.current, null); assert.equal(client.outputStateUnknown, false);
});

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

test('S07 schema 2: stale input A cannot alter B history and settings are captured before dispatch', async () => {
  const client = new StereoClient({WorkerClass: MockWorker});
  const settings = {mode: 'copy', layout: 'sbs', nested: {confirmed: true}};
  const a = client.run(new Blob(['A']), settings), wa = MockWorker.instances.at(-1);
  settings.layout = 'tb'; settings.nested.confirmed = false;
  assert.equal(wa.messages[0].settings.layout, 'sbs'); assert.equal(wa.messages[0].settings.nested.confirmed, true);
  const recordFor = worker => ({schemaVersion: 2, operationId: worker.messages[0].operationId,
    inputRevision: worker.messages[0].inputRevision, saveAttempts: [], settings: worker.messages[0].settings});
  const receiptA = recordFor(wa);
  wa.emit(message(wa, 'result', {result: {receipt: receiptA}})); await a; await dispose(client, wa);
  const b = client.run(new Blob(['B']), {mode: 'copy'}), wb = MockWorker.instances.at(-1), receiptB = recordFor(wb);
  // A foreign receipt inside a current envelope is also not the current result.
  wb.emit(message(wb, 'result', {result: {receipt: receiptA}}));
  assert.equal(client.current.settled, false);
  wa.emit(message(wa, 'result', {result: {receipt: receiptA}}));
  wb.emit(message(wb, 'result', {result: {receipt: receiptB}}));
  const accepted = await b, before = JSON.stringify(accepted.receipt);
  wa.emit(message(wa, 'error', {diagnostics: receiptA, error: 'LATE_A'}));
  assert.equal(accepted.receipt, receiptB); assert.equal(JSON.stringify(accepted.receipt), before);
  assert.equal(accepted.receipt.saveCompleted, false); assert.equal(accepted.receipt.lastSaveAttemptId, null);
  await dispose(client, wb);
});

test('invalid schema 2 receipt follows Worker failure cleanup and rejects instead of leaving run unsettled', async () => {
  const deletion = deferred(), removed = [];
  const client = new StereoClient({WorkerClass: MockWorker, cleanup: async id => { removed.push(id); await deletion.promise; }});
  const pending = client.run(new Blob(['input']), {mode: 'copy'}), worker = MockWorker.instances.at(-1);
  const rejected = assert.rejects(pending, /INVALID_SAVE_RECEIPT/);
  const {operationId, inputRevision} = worker.messages[0];
  assert.doesNotThrow(() => worker.emit(message(worker, 'result', {result: {receipt: {
    schemaVersion: 2, operationId, inputRevision, saveAttempts: [{id: 'foreign', resultOperationId: 'wrong-result', inputRevision}],
  }}})));
  await tick();
  assert.equal(worker.terminated, true); assert.equal(client.current?.operationId, operationId);
  assert.deepEqual(removed, [operationId]);
  deletion.resolve(); await rejected; assert.equal(client.current, null);
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
