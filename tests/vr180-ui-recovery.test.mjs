import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {OperationScope} from '../docs/shared/vr180/operations.mjs';
import {StereoClient as ActualStereoClient} from '../docs/shared/vr180/client.mjs';

const app = (await readFile(new URL('../docs/vr180-studio/app.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const identity = (operationId = 'ui-job', inputRevision = 1, ownerToken = 'a'.repeat(32)) => ({
  format: 'vr180-indexed-registry', schema: 1, operationId, inputRevision, namespace: `${operationId}-r${inputRevision}`, ownerToken,
});
const row = id => ({identity: id, status: 'pending', ticketCount: 1});
const complete = id => ({status: 'complete', identity: id, externalSaveState: 'NOT_APPLICABLE'});
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

// Run the actual page event handlers with a small DOM/API double. This tests UI state,
// not browser storage, media processing, picker permissions, or registry implementation.
function page({ClientClass} = {}) {
  const elements = new Map();
  class Element {
    constructor(id = '') { this.id = id; this.value = ''; this.textContent = ''; this.checked = false; this.disabled = false; this.children = []; this.handlers = {}; }
    addEventListener(type, handler) { (this.handlers[type] ??= []).push(handler); }
    async change() { for (const handler of this.handlers.change ?? []) await handler(); }
    click() { return this.onclick?.(); }
    append(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this[name] = value; }
    removeAttribute(name) { delete this[name]; }
    pause() {}
    load() {}
  }
  const $ = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
  $('mode').value = 'copy'; $('execution-route').value = 'legacy';
  const deps = {listed: {jobs: [], truncated: false}, recover: async id => complete(id), calls: [], listCalls: 0};
  class StereoClient {
    constructor({onEvent}) { this.onEvent = onEvent; this.current = null; this.cleanupPending = false; this.outputStateUnknown = false; }
    acknowledgeUnknownOutput() {
      this.current = null; this.cleanupPending = false; this.outputStateUnknown = false;
      this.onEvent({type: 'output-unconfirmed-detached', diagnostics: this.diagnostics, internalIndexCleanup: 'pending'});
      return this.diagnostics;
    }
  }
  const context = vm.createContext({OperationScope, StereoClient: ClientClass ?? StereoClient, console, structuredClone, Blob,
    performance: {now: () => 1}, navigator: {storage: {getDirectory() {}}, locks: {request() {}}},
    document: {getElementById: $, createElement: () => new Element(), querySelectorAll: () => []},
    URL: {createObjectURL: () => 'blob:test', revokeObjectURL: () => {}}, setTimeout: () => 1, addEventListener() {},
    listIndexedJobs: async options => { assert.equal(options.limit, 20); deps.listCalls++; return deps.listed; },
    recoverIndexedJob: async id => { deps.calls.push(structuredClone(id)); return deps.recover(id); },
    showSaveFilePicker: async () => ({name: 'saved.mp4', getFile: async () => new Blob()}),
  });
  const state = vm.runInContext(app + '\n;({client, select, get record(){return record;}})', context);
  async function list(jobs) { deps.listed = {jobs, truncated: false}; await $('registry-list').click(); }
  async function select(index, confirm = true) { $('registry-job').value = String(index); await $('registry-job').change(); $('registry-confirm').checked = confirm; await $('registry-confirm').change(); }
  async function detach(receipt) {
    state.client.diagnostics = receipt; state.client.current = {}; state.client.cleanupPending = true; state.client.outputStateUnknown = true;
    state.client.onEvent({type: 'cleanup-error', error: 'DIRECT_SAVE_STATE_UNKNOWN', diagnostics: receipt, internalIndexCleanup: 'pending'});
    await $('cancel').click();
  }
  return {$, deps, state, list, select, detach};
}
function unknownReceipt(id) { return freeze({schemaVersion: 2, operationId: id.operationId, inputRevision: id.inputRevision,
  executionRoute: 'indexed', indexedOwnership: {identity: id, status: 'retained'},
  saveWriteCommitted: null, saveCompleted: false, directSave: {status: 'unknown'},
  internalIndexCleanup: 'pending', output: null, saveAttempts: [{commitState: 'unknown', status: 'unknown'}]}); }

test('same-job explicit cleanup adds a separate observation while unknown save facts and original receipt remain unchanged', async () => {
  const p = page(), id = identity(), original = unknownReceipt(id), before = JSON.stringify(original);
  await p.detach(original); assert.match(p.$('index-cleanup-status').textContent, /未完了/);
  await p.list([row(id)]); await p.select(0); await p.$('registry-recover').click();
  assert.equal(JSON.stringify(original), before); assert.notEqual(p.state.record, original);
  const {internalCleanupRecovery, ...unchanged} = JSON.parse(JSON.stringify(p.state.record));
  assert.deepEqual(unchanged, JSON.parse(before)); assert.equal(internalCleanupRecovery.status, 'complete');
  assert.deepEqual(internalCleanupRecovery.identity, id); assert.equal(internalCleanupRecovery.externalSaveState, 'NOT_APPLICABLE');
  assert(Object.isFrozen(p.state.record.internalCleanupRecovery)); assert(Object.isFrozen(p.state.record.internalCleanupRecovery.identity));
  assert.match(p.$('save-fact').textContent, /不明/); assert.match(p.$('index-cleanup-status').textContent, /清掃は完了/);
  assert.equal(JSON.parse(p.$('diagnostics').textContent).directSave.status, 'unknown');
});

test('other operation, input revision, or known owner does not update the current record or its cleanup display', async () => {
  for (const other of [identity('other'), identity('ui-job', 2), identity('ui-job', 1, 'b'.repeat(32))]) {
    const p = page(), original = unknownReceipt(identity()); await p.detach(original);
    await p.list([row(other)]); await p.select(0); await p.$('registry-recover').click();
    assert.equal(p.state.record, original); assert.equal(p.state.record.internalCleanupRecovery, undefined);
    assert.match(p.$('index-cleanup-status').textContent, /未完了/); assert.match(p.$('save-fact').textContent, /不明/);
  }
});

test('failed job retry survives re-listing and another job can complete without consuming its closure', async () => {
  const p = page(), a = identity('a'), b = identity('b'); let retried = 0;
  p.deps.recover = async id => { if (id.namespace === a.namespace) throw Object.assign(Error('PARTIAL_CLEANUP'), {retryCleanup: async () => { retried++; return complete(a); }}); return complete(id); };
  await p.list([row(a), row(b)]); await p.select(0); await p.$('registry-recover').click();
  assert.equal(p.$('registry-list').disabled, false); assert.equal(p.$('registry-job').disabled, false);
  await p.select(1); assert.equal(p.$('registry-recover').disabled, false); await p.$('registry-recover').click();
  assert.equal(retried, 0); assert.equal(p.deps.calls.length, 2);
  // A partial record remains unselectable; its previously owned retry is a separate row.
  await p.list([{namespace: a.namespace, status: 'retained', error: 'PARTIAL_RECORD'}]);
  assert.equal(p.$('registry-job').children[1].disabled, true); assert.equal(p.$('registry-job').children.length, 3);
  await p.select(1); assert.match(p.$('registry-recover').textContent, /再試行/); await p.$('registry-recover').click();
  assert.equal(retried, 1); assert.equal(p.deps.calls.length, 2);
  assert.equal(p.$('registry-job').children[1].disabled, true); // unknown listed row is retained
});

test('changed owner or any identity field cannot reuse or discard an older closure', async () => {
  const p = page(), original = identity('owner'); let retries = 0;
  p.deps.recover = async () => { throw Object.assign(Error('RETRY'), {retryCleanup: async () => { retries++; return complete(original); }}); };
  await p.list([row(original)]); await p.select(0); await p.$('registry-recover').click();
  for (const changed of [{...original, ownerToken: 'b'.repeat(32)}, {...original, schema: 2}, {...original, extra: true}]) {
    await p.list([row(changed)]); await p.select(0);
    assert.equal(p.$('registry-recover').disabled, true); assert.match(p.$('registry-status').textContent, /所有情報が異なる/);
    await p.$('registry-recover').click(); assert.equal(retries, 0); assert.equal(p.deps.calls.length, 1);
  }
  await p.list([row(original)]); await p.select(0); await p.$('registry-recover').click();
  assert.equal(retries, 1);
});

test('twenty retained closures block only new cleanup and are neither dropped nor replaced on later failure', async () => {
  const p = page(); let existingRetries = 0, replacementRetries = 0, allowSuccess = false;
  p.deps.recover = async id => { throw Object.assign(Error('RETRY'), {retryCleanup: async () => {
    existingRetries++; if (allowSuccess) return complete(id);
    throw Object.assign(Error('STILL_PENDING'), {retryCleanup: async () => { replacementRetries++; return complete(id); }});
  }}); };
  for (let i = 0; i < 20; i++) { await p.list([row(identity(`job${i}`))]); await p.select(0); await p.$('registry-recover').click(); }
  assert.equal(p.deps.calls.length, 20);
  await p.list([row(identity('new'))]); await p.select(0);
  assert.equal(p.$('registry-recover').disabled, true); assert.match(p.$('registry-status').textContent, /20件保持/);
  await p.$('registry-recover').click(); assert.equal(p.deps.calls.length, 20);
  assert.equal(p.$('registry-list').disabled, false); assert.equal(p.$('registry-job').disabled, false);
  await p.select(1); await p.$('registry-recover').click(); assert.equal(existingRetries, 1);
  allowSuccess = true; await p.$('registry-recover').click();
  assert.equal(existingRetries, 2); assert.equal(replacementRetries, 0);
  await p.select(0); assert.equal(p.$('registry-recover').disabled, false); await p.$('registry-recover').click();
  assert.equal(p.deps.calls.length, 21);
});

test('selection and confirmation are both required; unknown records never start cleanup', async () => {
  const p = page(); await p.list([{namespace: 'unowned', status: 'retained'}, row(identity())]);
  assert.equal(p.$('registry-recover').disabled, true); await p.$('registry-recover').click();
  await p.select(0); await p.$('registry-recover').click(); assert.equal(p.deps.calls.length, 0);
  await p.select(1, false); assert.equal(p.$('registry-recover').disabled, true); await p.$('registry-recover').click();
  assert.equal(p.deps.calls.length, 0); await p.select(1, true); await p.$('registry-recover').click();
  assert.equal(p.deps.calls.length, 1);
});

for (const verified of [true, false]) test(`active indexed cleanup retry retains completion after the pending ${verified ? 'verified' : 'committed but unverified'} run rejects`, async () => {
  const workers = [], tick = () => new Promise(resolve => setImmediate(resolve));
  class Worker {
    constructor() { this.messages = []; workers.push(this); }
    postMessage(message) {
      this.messages.push(message);
      if (this.messages[0].settings.mode !== 'inspect') return;
      queueMicrotask(() => this.emit(message.type === 'run' ? {type: 'result', result: {info: {width: 512, height: 256}}}
        : {type: 'cleanup-complete', requestId: message.requestId}));
    }
    emit(message) { this.onmessage?.({data: {operationId: this.messages[0].operationId, inputRevision: this.messages[0].inputRevision, ...message}}); }
    terminate() {}
  }
  class Client extends ActualStereoClient { constructor(options) { super({...options, WorkerClass: Worker}); } }
  const p = page({ClientClass: Client});
  await p.state.select(Object.assign(new Blob(['input']), {name: 'input.mp4'}));
  p.$('mode').value = 'convert'; p.$('execution-route').value = 'indexed'; p.$('confirmed').checked = true;
  await p.$('choose-save').click();
  const running = p.$('run').click(); await tick();
  const worker = workers.at(-1), {operationId, inputRevision, saveAttemptId} = worker.messages[0];
  const id = identity(operationId, inputRevision);
  const original = {schemaVersion: 2, operationId, inputRevision, executionRoute: 'indexed', status: 'failed',
    output: {bytes: 5, sha256: 'saved-hash'}, indexedOwnership: {identity: id, status: 'retained'}, internalIndexCleanup: 'pending',
    directSave: {status: verified ? 'verified' : 'failed'}, saveAttempts: [{id: saveAttemptId, resultOperationId: operationId, inputRevision,
      kind: 'direct', status: verified ? 'verified' : 'failed', commitState: 'committed', verificationState: verified ? 'passed' : 'failed',
      bytes: 5, sha256: 'saved-hash', wholeFileHashCompared: false, metadataHashMatched: verified}]};
  worker.emit({type: 'error', error: 'INDEX_CLOSE_FAILED', cleanupComplete: false, cleanupError: 'INDEX_CLOSE_FAILED', diagnostics: original});
  await tick();
  const before = JSON.stringify(original);
  assert.equal(p.state.client.cleanupPending, true); assert.match(p.$('index-cleanup-status').textContent, /未完了/);
  const canceling = p.$('cancel').click();
  worker.emit({type: 'cleanup-complete', requestId: worker.messages.at(-1).requestId, inputRevision: inputRevision + 1,
    diagnostics: original, internalIndexCleanup: 'complete'});
  assert.equal(p.state.record.internalCleanupRecovery, undefined); assert.equal(p.state.client.cleanupPending, false);
  assert(p.state.client.current); assert.match(p.$('index-cleanup-status').textContent, /未完了/);
  worker.emit({type: 'cleanup-complete', requestId: worker.messages.at(-1).requestId,
    diagnostics: original, internalIndexCleanup: 'complete'});
  await canceling; await running;
  assert.equal(p.state.client.current, null); assert.equal(JSON.stringify(original), before);
  assert.equal(p.state.record.saveCompleted, verified); assert.equal(p.state.record.saveWriteCommitted, true);
  assert.equal(p.state.record.internalIndexCleanup, 'pending');
  assert.equal(p.state.record.internalCleanupRecovery?.status, 'complete');
  assert.deepEqual(JSON.parse(JSON.stringify(p.state.record.internalCleanupRecovery.identity)), id);
  assert.equal(p.state.record.internalCleanupRecovery.externalSaveState, 'NOT_APPLICABLE');
  assert.equal(p.state.record.internalCleanupRecovery.source, 'client-cleanup-complete');
  assert(Object.isFrozen(p.state.record.internalCleanupRecovery)); assert(Object.isFrozen(p.state.record.internalCleanupRecovery.identity));
  assert.match(p.$('save-fact').textContent, verified ? /保存と内容の照合は完了/ : /書き込みは完了.*確認は未完了/);
  assert.match(p.$('index-cleanup-status').textContent, /清掃は完了/);
  assert.equal(JSON.parse(p.$('diagnostics').textContent).internalCleanupRecovery.status, 'complete');
});
