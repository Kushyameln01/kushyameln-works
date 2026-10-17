import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {OperationScope} from '../docs/shared/vr180/operations.mjs';
import * as saveRecord from '../docs/shared/vr180/save-record.mjs';
import {saveBlobToFile as actualSaveBlobToFile} from '../docs/shared/vr180/file-output.mjs';

const appSource = (await readFile(new URL('../docs/vr180-studio/app.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
const abortError = () => new DOMException('Picker canceled', 'AbortError');
const digest = 'a'.repeat(64);
function fixture(direct = false) {
  const receipt = {schemaVersion: 2, operationId: 'generation-A', inputRevision: 4, settings: {mode: direct ? 'convert' : 'copy', layout: 'sbs', fov: 180},
    input: {bytes: 5, sha256: 'b'.repeat(64)}, output: {bytes: 5, sha256: digest, hashBasis: direct ? 'post-commit-observed' : 'prepared-output'},
    saveAttempts: [], saveCompleted: direct, saveWriteCommitted: direct, savedSize: direct ? 5 : null, savedSha256: direct ? digest : null,
    directSave: direct ? {status: 'verified', wholeFileHashCompared: false, metadataHashMatched: true} : null};
  if (direct) receipt.saveAttempts.push({id: 'original-direct', resultOperationId: receipt.operationId, inputRevision: receipt.inputRevision,
    kind: 'direct', commitState: 'committed', verificationState: 'passed', bytes: 5, sha256: digest, hashBasis: 'post-commit-observed',
    metadataHashMatched: true, wholeFileHashCompared: false, startedAt: '2026-10-17T00:00:00Z', finishedAt: '2026-10-17T00:00:01Z', timings: {}, cleanup: null, errorCode: null});
  return {blob: new Blob(['saved']), info: {width: 512, height: 256}, receipt};
}

// Execute the complete production app body and its actual onclick callbacks.
// DOM, picker and save backend are substitutes: these are UI state regressions,
// not evidence that an OS picker or a browser's filesystem saved a real file.
async function appHarness({generated = fixture(), pick = async () => ({getFile: async () => new Blob()}), save} = {}) {
  const elements = new Map(), listeners = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {value: ({mode: 'copy', layout: 'sbs', fov: '180', size: '256'})[id] ?? '', checked: true,
      hidden: false, disabled: false, files: [], textContent: '', setAttribute() {}, removeAttribute() {}, pause() {}, load() {},
      addEventListener(type, callback) { listeners.set(`${id}:${type}`, callback); }, click(event = {preventDefault() {}}) { return this.onclick?.(event); }});
    return elements.get(id);
  };
  const calls = {save: 0, run: 0};
  class Client {
    cleanupPending = false;
    async dispose() {}
    async run(file, settings) { calls.run++; return settings.mode === 'inspect' ? {info: generated.info} : generated; }
  }
  const context = vm.createContext({StereoClient: Client, OperationScope, Blob, DOMException, performance, crypto: webcrypto,
    navigator: {userAgent: 'Node mock DOM'}, URL: {createObjectURL: () => 'blob:test', revokeObjectURL() {}},
    document: {getElementById: element, querySelectorAll: () => [], createElement: () => element('temporary-anchor')},
    showSaveFilePicker: (...args) => pick(...args), addEventListener() {}, setTimeout() {},
    saveBlobToFile: async (...args) => { calls.save++; return save ? save(...args) : {bytes: 5, sha256: digest, committed: true, hashMatched: true}; }});
  Object.assign(context, saveRecord);
  new vm.Script(appSource, {filename: 'docs/vr180-studio/app.mjs'}).runInContext(context);
  element('file').files = [Object.assign(new Blob(['input']), {name: 'input.mp4'})];
  listeners.get('file:change')(); await tick();
  element('confirmed').checked = true;
  await element('run').onclick();
  return {element, context, calls, receipt: generated.receipt, generated};
}

test('S02 actual save event: saved success survives an additional picker cancel with no extra write', async () => {
  let picks = 0;
  const h = await appHarness({pick: async () => { if (++picks === 2) throw abortError(); return {getFile: async () => new Blob()}; }});
  await h.element('save').onclick();
  assert.equal(h.receipt.saveCompleted, true);
  const original = JSON.stringify(h.receipt.saveAttempts[0]);
  await h.element('save').onclick();
  assert.equal(h.calls.save, 1);
  assert.equal(h.receipt.saveCompleted, true);
  assert.equal(h.receipt.saveWriteCommitted, true);
  assert.equal(h.receipt.savedSha256, digest);
  assert(h.receipt.saveAttempts.at(-1).timings.permissionWaitMs >= 0);
  assert.equal(JSON.stringify(h.receipt.saveAttempts[0]), original);
});

test('S03 actual save event: a direct saved result survives an additional picker cancel', async () => {
  const h = await appHarness({generated: fixture(true), pick: async () => { throw abortError(); }});
  const rawDirect = JSON.stringify(h.receipt.directSave), original = JSON.stringify(h.receipt.saveAttempts[0]);
  await h.element('save').onclick();
  assert.equal(h.calls.save, 0);
  assert.equal(h.receipt.saveCompleted, true);
  assert.equal(h.receipt.saveWriteCommitted, true);
  assert.equal(h.receipt.savedSha256, digest);
  assert.equal(JSON.stringify(h.receipt.directSave), rawDirect);
  assert.equal(JSON.stringify(h.receipt.saveAttempts[0]), original);
});

test('S01 actual save event: first verified copy has its own identity and generation settings', async () => {
  const h = await appHarness(), settings = JSON.stringify(h.receipt.settings);
  h.element('layout').value = 'tb'; // Saving never rebuilds generation settings from the DOM.
  await h.element('save').onclick();
  const [attempt] = h.receipt.saveAttempts;
  assert.equal(h.receipt.saveAttempts.length, 1);
  assert.match(attempt.id, /^[a-f0-9-]{36}$/);
  assert.equal(attempt.resultOperationId, h.receipt.operationId);
  assert.equal(attempt.inputRevision, h.receipt.inputRevision);
  assert.equal(attempt.kind, 'prepared-copy');
  assert.equal(attempt.commitState, 'committed');
  assert.equal(attempt.verificationState, 'passed');
  assert.equal(attempt.wholeFileHashCompared, true);
  assert.equal(attempt.hashBasis, 'prepared-output-compared');
  assert.equal(attempt.bytes, h.receipt.output.bytes);
  assert.equal(attempt.sha256, h.receipt.output.sha256);
  assert.equal(JSON.stringify(h.receipt.settings), settings);
  assert.equal(h.receipt.lastSaveAttemptId, attempt.id);
  assert.equal(h.receipt.lastVerifiedSaveAttemptId, attempt.id);
  assert.equal(h.receipt.saveObservedAt, attempt.finishedAt);
  assert.ok(attempt.timings.saveApiMs >= 0);
});

test('S03 actual save event: additional write failure retains the original direct observation', async () => {
  const calls = {write: 0, abort: 0};
  const handle = {getFile: async () => new Blob(), createWritable: async () => ({
    async write() { calls.write++; throw Error('WRITE_FAILED'); },
    async abort() { calls.abort++; },
  })};
  const h = await appHarness({generated: fixture(true), pick: async () => handle, save: actualSaveBlobToFile});
  const direct = JSON.stringify(h.receipt.directSave), original = JSON.stringify(h.receipt.saveAttempts[0]);
  await h.element('save').onclick();
  assert.equal(h.receipt.saveAttempts.at(-1).timings.filePhases.write.status, 'failed');
  assert.equal(h.receipt.saveAttempts.at(-1).timings.filePhases.abort.status, 'completed');
  assert.equal(h.receipt.saveCompleted, true);
  assert.equal(h.receipt.savedSha256, digest);
  assert.equal(h.receipt.lastVerifiedSaveAttemptId, 'original-direct');
  assert.equal(h.receipt.saveAttempts[1].commitState, 'aborted');
  assert.equal(h.receipt.saveAttempts[1].errorCode, 'WRITE_FAILED');
  assert.deepEqual(calls, {write: 1, abort: 1});
  assert.equal(JSON.stringify(h.receipt.directSave), direct);
  assert.equal(JSON.stringify(h.receipt.saveAttempts[0]), original);
  assert.match(h.element('save-status').textContent, /前回の保存・照合は完了/);
});

test('S04 actual save event: cancel before first save does not invent a saved result and can retry', async () => {
  let picks = 0;
  const h = await appHarness({pick: async () => { if (++picks === 1) throw abortError(); return {getFile: async () => new Blob()}; }});
  await h.element('save').onclick();
  assert.equal(h.calls.save, 0); assert.equal(h.receipt.saveWriteCommitted, false); assert.equal(h.receipt.saveCompleted, false);
  assert.equal(h.receipt.savedSha256, null); assert.equal(h.receipt.saveAttempts[0].commitState, 'not-started');
  assert.equal(h.element('save').disabled, false);
  await h.element('save').onclick();
  assert.equal(h.calls.save, 1); assert.equal(h.receipt.saveCompleted, true);
  assert.notEqual(h.receipt.saveAttempts[0].id, h.receipt.saveAttempts[1].id);
});

for (const stage of ['getFile', 'nonempty', 'createWritable']) test(`pre-writer ${stage} rejection remains not-started in the actual save event`, async () => {
  const calls = {getFile: 0, createWritable: 0, write: 0, abort: 0};
  const handle = {
    async getFile() {
      if (++calls.getFile > 1 && stage === 'getFile') throw Error('GET_FILE_DENIED');
      return new Blob(calls.getFile > 1 && stage === 'nonempty' ? ['existing'] : []);
    },
    async createWritable() { calls.createWritable++; throw Error('CREATE_WRITABLE_DENIED'); },
  };
  const h = await appHarness({pick: async () => handle, save: actualSaveBlobToFile});
  await h.element('save').onclick();
  assert.equal(h.receipt.saveAttempts[0].commitState, 'not-started');
  assert.equal(h.receipt.saveWriteCommitted, false); assert.equal(h.receipt.saveCompleted, false);
  assert.equal(calls.write, 0); assert.equal(calls.abort, 0);
  assert.equal(calls.createWritable, stage === 'createWritable' ? 1 : 0);
});

for (const canceled of [false, true]) test(`S05 actual save event: post-close verification ${canceled ? 'cancel' : 'failure'} retains commit`, async () => {
  const h = await appHarness({save: async () => { throw Object.assign(canceled ? abortError() : Error('SAVED_HASH_MISMATCH'), {saveWriteCommitted: true}); }});
  await h.element('save').onclick();
  const [attempt] = h.receipt.saveAttempts;
  assert.equal(attempt.commitState, 'committed');
  assert.equal(attempt.verificationState, canceled ? 'canceled' : 'failed');
  assert.equal(h.receipt.saveWriteCommitted, true); assert.equal(h.receipt.saveCompleted, false);
  assert.equal(h.receipt.savedSha256, null); assert.equal(h.receipt.savedSize, null);
  assert.equal(h.element('save').disabled, false);
  assert.match(h.element('save-status').textContent, /書き込みは完了/);
});

test('S08 actual save/cancel events: failed cleanup blocks another save until explicit retry succeeds', async () => {
  let saves = 0, retries = 0;
  const h = await appHarness({save: async () => {
    if (++saves === 1) throw Object.assign(Error('WRITE_FAILED'), {saveWriteCommitted: false, cleanupError: 'ABORT_FAILED', retryCleanup: async () => {
      if (++retries === 1) throw Error('STILL_LOCKED');
      return {state: 'aborted', committed: false};
    }});
    return {bytes: 5, sha256: digest, hashMatched: true};
  }});
  await h.element('save').onclick();
  const attempt = h.receipt.saveAttempts[0];
  assert.equal(attempt.cleanup.status, 'failed'); assert.equal(attempt.commitState, 'unknown');
  assert.equal(h.element('save').disabled, true); assert.equal(h.element('run').disabled, true);
  await h.element('save').onclick(); assert.equal(saves, 1);
  await h.element('cancel').onclick(); assert.equal(attempt.cleanup.status, 'failed');
  assert.equal(h.element('save').disabled, true);
  await h.element('cancel').onclick();
  assert.equal(attempt.cleanup.status, 'complete'); assert.equal(attempt.cleanup.errorCode, 'ABORT_FAILED');
  assert.equal(attempt.commitState, 'aborted'); assert.ok(attempt.cleanup.retrySucceededAt);
  assert.equal(h.element('save').disabled, false);
  await h.element('save').onclick(); assert.equal(saves, 2); assert.equal(h.receipt.saveCompleted, true);
});

test('download request is a separate attempt and never proves a completed save', async () => {
  const h = await appHarness();
  h.element('download').onclick({preventDefault() { assert.fail('valid download was blocked'); }});
  assert.equal(h.receipt.saveAttempts[0].kind, 'download-request');
  assert.equal(h.receipt.saveAttempts[0].commitState, 'not-started');
  assert.equal(h.receipt.saveCompleted, false); assert.equal(h.receipt.saveWriteCommitted, false);
  assert.equal(h.receipt.downloadRequestedAt, h.receipt.saveAttempts[0].startedAt);
});

test('schema 2 summaries derive from same-result observations; foreign identities and legacy records are rejected', () => {
  const receipt = saveRecord.bindSaveSummary(fixture(true).receipt);
  assert.throws(() => { receipt.saveCompleted = false; }, TypeError);
  const extra = saveRecord.createSaveAttempt(receipt, 'prepared-copy', {status: 'canceled'});
  receipt.saveAttempts.push(extra);
  const serialized = JSON.parse(JSON.stringify(receipt));
  assert.equal(serialized.saveCompleted, true);
  assert.equal(serialized.lastSaveAttemptId, extra.id);
  assert.equal(serialized.lastVerifiedSaveAttemptId, 'original-direct');
  assert.throws(() => saveRecord.createSaveAttempt(receipt, 'prepared-copy', {inputRevision: 999}), /IDENTITY_MISMATCH/);
  assert.throws(() => saveRecord.createSaveAttempt(receipt, 'prepared-copy', {resultOperationId: 'other'}), /IDENTITY_MISMATCH/);
  assert.throws(() => saveRecord.createSaveAttempt(receipt, 'direct', {id: 'original-direct'}), /DUPLICATE/);
  receipt.saveAttempts.push({...extra, id: 'foreign', resultOperationId: 'B'});
  assert.throws(() => saveRecord.summarizeSaves(receipt), /IDENTITY_MISMATCH/);
  assert.throws(() => saveRecord.bindSaveSummary({schemaVersion: 1, saveCompleted: true}), /INVALID_SAVE_RECORD/);
});

test('summary rejects passing verification without its commit/comparison evidence', () => {
  const receipt = fixture().receipt;
  assert.throws(() => saveRecord.createSaveAttempt(receipt, 'prepared-copy', {
    commitState: 'committed', verificationState: 'passed', bytes: 5, sha256: digest, wholeFileHashCompared: false,
  }), /INVALID_SAVE_VERIFICATION/);
  assert.throws(() => saveRecord.createSaveAttempt(receipt, 'direct', {
    commitState: 'unknown', verificationState: 'passed', bytes: 5, sha256: digest, metadataHashMatched: true,
  }), /INVALID_SAVE_VERIFICATION/);
  for (const [field, value] of [['bytes', 6], ['sha256', 'c'.repeat(64)]]) {
    const direct = fixture(true).receipt;
    direct.saveAttempts[0][field] = value;
    assert.throws(() => saveRecord.summarizeSaves(direct), /INVALID_SAVE_VERIFICATION/);
  }
  const missing = fixture(true).receipt;
  missing.output = null;
  assert.throws(() => saveRecord.summarizeSaves(missing), /INVALID_SAVE_VERIFICATION/);
  missing.preparedBeforeCancel = {...fixture(true).receipt, operationId: 'other-result'};
  assert.throws(() => saveRecord.summarizeSaves(missing), /INVALID_SAVE_VERIFICATION/);
  missing.preparedBeforeCancel = fixture(true).receipt;
  assert.equal(saveRecord.summarizeSaves(missing).saveCompleted, true);
});
