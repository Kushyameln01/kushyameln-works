import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync, existsSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOwnedIndexJob, cleanupAbandonedIndexJob, OWNER_RECORD_BYTES, OWNER_BUFFER_BYTES} from '../development/vr180/index-prototype/job-owner.mjs';
import {createIndexBudget} from '../development/vr180/index-prototype/index-store.mjs';
import {createInputIndex} from '../development/vr180/input-index-prototype/input-index.mjs';
import {createOutputIndex} from '../development/vr180/output-index-prototype/output-index.mjs';
import {nodeRoot, testLocks} from '../development/vr180/output-index-prototype/node-backend.mjs';
const ownerToken = '71831532b36e423197709fdb8e930a83';
function setup(t, hooks = {}) {
  const path = mkdtempSync(join(tmpdir(), 'vr180-index-owner-')); t.after(() => rmSync(path, {recursive: true, force: true}));
  const backend = nodeRoot(path, hooks), lockManager = testLocks(), budget = createIndexBudget();
  return {path, backend, lockManager, budget,
    options: {root: backend.root, jobId: 'owned-job', ownerToken, kind: 'output', lockManager, budget}};
}
async function recordedFixture(h) {
  // A closed-record fixture, not a simulation of native browser termination.
  const job = await createOwnedIndexJob(h.options), bytes = readFileSync(join(h.path, 'owned-job', 'owner.bin'));
  await job.dispose(); mkdirSync(join(h.path, 'owned-job')); writeFileSync(join(h.path, 'owned-job', 'owner.bin'), bytes);
  writeFileSync(join(h.path, 'owned-job', 'data.bin'), 'only this job'); h.backend.calls.remove.length = 0; return bytes;
}
function zero(h) { assert.equal(h.budget.usedBytes, 0); assert.equal(h.backend.open.size, 0); assert.equal(h.lockManager.held.size, 0); }

test('fresh owner record is fixed, read back, short-I/O safe and budgeted until disposal', async t => {
  const h = setup(t, {shortRead: 7, shortWrite: 5}), job = await createOwnedIndexJob(h.options);
  assert.deepEqual(job.ticket, {format: 'vr180-private-index-owner', schema: 1, jobId: 'owned-job', ownerToken, kind: 'output'});
  const bytes = readFileSync(join(h.path, 'owned-job', 'owner.bin'));
  assert.equal(bytes.length, OWNER_RECORD_BYTES); assert.equal(bytes.subarray(0, 16).toString(), 'VR180IDXOWNER001');
  assert.equal(h.backend.open.size, 0); assert(h.backend.calls.reads > 1 && h.backend.calls.writes > 1);
  assert.equal(h.budget.usedBytes, OWNER_BUFFER_BYTES); assert.equal(h.lockManager.held.size, 1);
  await job.dispose(); await job.dispose(); zero(h); assert.deepEqual(readdirSync(h.path), []);
});

test('live owner blocks explicit cleanup and competing create without touching either job', async t => {
  const h = setup(t), job = await createOwnedIndexJob(h.options); mkdirSync(join(h.path, 'other'));
  try {
    await assert.rejects(cleanupAbandonedIndexJob(h.options), e => e.status === 'BLOCKED' && /LOCK_BUSY/.test(e.message));
    await assert.rejects(createOwnedIndexJob(h.options), /LOCK_BUSY/);
    assert.equal(h.backend.calls.remove.length, 0); assert.equal(h.budget.usedBytes, OWNER_BUFFER_BYTES);
    assert.equal(readFileSync(join(h.path, 'owned-job', 'owner.bin')).length, OWNER_RECORD_BYTES);
  } finally { await job.dispose(); }
  zero(h); assert.deepEqual(readdirSync(h.path), ['other']);
});

test('explicit matching recovery removes only its job; absence is idempotent and same ID can be created anew', async t => {
  const h = setup(t); await recordedFixture(h); mkdirSync(join(h.path, 'other'));
  assert.equal((await cleanupAbandonedIndexJob(h.options)).status, 'removed'); zero(h);
  assert.equal((await cleanupAbandonedIndexJob(h.options)).status, 'already-absent'); zero(h);
  const job = await createOwnedIndexJob({...h.options, ownerToken: 'ffffffffffffffffffffffffffffffff'});
  assert.notEqual(job.ticket.ownerToken, ownerToken); await job.dispose(); zero(h);
  assert.deepEqual(readdirSync(h.path), ['other']);
});

test('unknown, damaged, oversized, token/role/job mismatched records never authorize deletion', async t => {
  for (const variant of ['missing', 'truncated', 'oversized', 'schema', 'reserved', 'token', 'role', 'job']) {
    const h = setup(t), original = await recordedFixture(h), file = join(h.path, 'owned-job', 'owner.bin');
    if (variant === 'missing') rmSync(file);
    else if (variant === 'truncated') writeFileSync(file, original.subarray(0, 200));
    else if (variant === 'oversized') writeFileSync(file, Buffer.alloc(5000));
    else {
      const bytes = Buffer.from(original), position = {schema: 16, reserved: 255, token: 24, role: 20, job: 40}[variant];
      bytes[position] ^= 1; writeFileSync(file, bytes);
    }
    await assert.rejects(cleanupAbandonedIndexJob(h.options), e => e.status === 'BLOCKED' && /RECORD_/.test(e.message));
    assert.equal(h.backend.calls.remove.length, 0); assert(existsSync(join(h.path, 'owned-job', 'data.bin'))); zero(h);
  }
});

test('recovery deletion failure preserves record and lease for retry, without admitting another owner', async t => {
  let rejectDelete = false;
  const h = setup(t, {remove(path) { if (rejectDelete && path.endsWith('data.bin')) throw Error('DELETE_REFUSED'); }});
  await recordedFixture(h); rejectDelete = true; let error;
  await assert.rejects(cleanupAbandonedIndexJob(h.options), e => { error = e; return e.message === 'DELETE_REFUSED'; });
  assert.equal(typeof error.retryCleanup, 'function'); assert(existsSync(join(h.path, 'owned-job', 'owner.bin')));
  assert.equal(h.budget.usedBytes, OWNER_BUFFER_BYTES); assert.equal(h.lockManager.held.size, 1);
  await assert.rejects(cleanupAbandonedIndexJob(h.options), /LOCK_BUSY/);
  rejectDelete = false; await error.retryCleanup(); zero(h); assert.deepEqual(readdirSync(h.path), []);
});

test('final empty-directory removal failure is retryable only by the still-held owner', async t => {
  let rejectDelete = false;
  const h = setup(t, {remove(path) { if (rejectDelete && path === join(h.path, 'owned-job')) throw Error('DIRECTORY_REFUSED'); }});
  await recordedFixture(h); rejectDelete = true; let error;
  await assert.rejects(cleanupAbandonedIndexJob(h.options), e => { error = e; return /DIRECTORY_REFUSED/.test(e.message); });
  assert.deepEqual(readdirSync(join(h.path, 'owned-job')), []); assert.equal(h.lockManager.held.size, 1);
  rejectDelete = false; await error.retryCleanup(); zero(h);
  // A fresh process cannot prove ownership of such a record-less directory.
  mkdirSync(join(h.path, 'owned-job')); h.backend.calls.remove.length = 0;
  await assert.rejects(cleanupAbandonedIndexJob(h.options), /RECORD_UNAVAILABLE/);
  assert.equal(h.backend.calls.remove.length, 0); zero(h);
});

test('constructor write/flush/cancellation failures clean up; a close failure keeps retry ownership', async t => {
  for (const failure of ['zero', 'disk-full', 'flush', 'cancel', 'close']) {
    let fail = true; const cancel = new AbortController();
    const h = setup(t, {
      write() { if (failure === 'zero') return 0; if (failure === 'disk-full') throw Error('DISK_FULL'); },
      flush() { if (failure === 'flush') throw Error('FLUSH_FAILED'); if (failure === 'cancel') cancel.abort(); },
      close() { if (failure === 'close' && fail) throw Error('CLOSE_FAILED'); },
    });
    let error; await assert.rejects(createOwnedIndexJob({...h.options, signal: cancel.signal}), e => { error = e; return true; });
    if (failure === 'close') {
      assert.equal(typeof error.retryCleanup, 'function'); assert.equal(h.lockManager.held.size, 1); assert.equal(h.backend.open.size, 1);
      fail = false; await error.retryCleanup();
    }
    zero(h); assert.deepEqual(readdirSync(h.path), []);
  }
});

test('lock and budget unavailable or preexisting unowned directories cannot be adopted or deleted', async t => {
  const h = setup(t);
  await assert.rejects(createOwnedIndexJob({...h.options, lockManager: null}), e => e.status === 'BLOCKED'); zero(h);
  await assert.rejects(createOwnedIndexJob({...h.options, budget: createIndexBudget(1024)}), /BUDGET_EXCEEDED/); zero(h);
  mkdirSync(join(h.path, 'owned-job'));
  await assert.rejects(createOwnedIndexJob(h.options), /ALREADY_EXISTS/); zero(h);
  assert.equal(h.backend.calls.remove.length, 0); assert.deepEqual(readdirSync(h.path), ['owned-job']);
});

test('both controllers expose durable identities, share the budget and retain cross-role exclusion', async t => {
  const h = setup(t), source = new Blob([new Uint8Array(1)]);
  const input = await createInputIndex({...h.options, source, jobId: 'trial-in'});
  const output = await createOutputIndex({...h.options, jobId: 'trial-out'});
  try {
    assert.equal(input.owner.kind, 'input'); assert.equal(output.owner.kind, 'output');
    assert.equal(input.owner.ownerToken, ownerToken); assert.equal(output.owner.ownerToken, ownerToken);
    assert.equal(h.lockManager.held.size, 2); assert(h.budget.usedBytes <= h.budget.limitBytes);
    await assert.rejects(createOutputIndex({...h.options, jobId: 'trial-in'}), /LOCK_BUSY/);
    assert.equal(h.backend.calls.remove.length, 0);
  } finally { await input.dispose(); await output.dispose(); }
  zero(h); assert.deepEqual(readdirSync(h.path), []);
});

test('controller constructor owner-close failures retain their retry cleanup and release all resources on retry', async t => {
  for (const kind of ['input', 'output']) {
    let fail = true; const h = setup(t, {close(path) { if (fail && path.endsWith('owner.bin')) throw Error('OWNER_CLOSE_FAILED'); }});
    let error;
    await assert.rejects((kind === 'input' ? createInputIndex : createOutputIndex)({...h.options, source: new Blob([new Uint8Array(1)])}), e => { error = e; return /OWNER_CLOSE_FAILED/.test(e.message); });
    assert.equal(h.lockManager.held.size, 1); assert.equal(h.backend.open.size, 1); assert.equal(typeof error.retryCleanup, 'function');
    fail = false; await error.retryCleanup(); zero(h); assert.deepEqual(readdirSync(h.path), []);
  }
});
