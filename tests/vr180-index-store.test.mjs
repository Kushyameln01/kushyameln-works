import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync, openSync, readSync, writeSync, fsyncSync, fstatSync, closeSync, rmSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createIndexStore, createIndexBudget, recordByteOffset, INDEX_PAGE_BYTES as PAGE} from '../development/vr180/index-prototype/index-store.mjs';

const schema = {version: 1, recordBytes: 24, endianness: 'little'};
const tick = () => new Promise(resolve => setImmediate(resolve));
// Test-only equivalent of exclusive ifAvailable Web Locks. Production has no fallback.
function mockLockManager() {
  const held = new Map(), calls = [];
  return {held, calls,
    request(name, options, callback) {
      assert.deepEqual(options, {mode: 'exclusive', ifAvailable: true});
      calls.push(name);
      return Promise.resolve().then(async () => {
        if (held.has(name)) return callback(null);
        const lock = {name, mode: 'exclusive'}; held.set(name, lock);
        try { return await callback(lock); } finally { assert.equal(held.get(name), lock); held.delete(name); }
      });
    },
  };
}
function temporaryRoot(t, hooks = {}) {
  const path = mkdtempSync(join(tmpdir(), 'vr180-index-'));
  t.after(() => rmSync(path, {recursive: true, force: true}));
  const calls = {read: 0, write: 0, close: 0, remove: [], maxIO: 0};
  const directory = dir => ({
    async getDirectoryHandle(name, {create = false} = {}) {
      const child = join(dir, name);
      if (!existsSync(child)) { if (!create) throw new DOMException('missing', 'NotFoundError'); mkdirSync(child); }
      return directory(child);
    },
    async getFileHandle(name, {create = false} = {}) {
      const file = join(dir, name);
      if (!existsSync(file) && create) writeFileSync(file, '');
      return {async createSyncAccessHandle() {
        const fd = openSync(file, 'r+');
        return {
          getSize() { hooks.getSize?.(); return fstatSync(fd).size; },
          read(target, {at}) { calls.read++; calls.maxIO = Math.max(calls.maxIO, target.byteLength); const n = hooks.read?.(target, at); return n ?? readSync(fd, target, 0, Math.min(target.byteLength, hooks.shortRead ?? Infinity), at); },
          write(source, {at}) { calls.write++; calls.maxIO = Math.max(calls.maxIO, source.byteLength); const n = hooks.write?.(source, at); return n ?? writeSync(fd, source, 0, Math.min(source.byteLength, hooks.shortWrite ?? Infinity), at); },
          flush() { hooks.flush?.(); fsyncSync(fd); },
          close() { calls.close++; hooks.close?.(); closeSync(fd); },
        };
      }};
    },
    async removeEntry(name, options) { calls.remove.push(name); hooks.remove?.(); rmSync(join(dir, name), {recursive: !!options?.recursive}); },
  });
  return {root: directory(path), path, calls, lockManager: mockLockManager()};
}

test('real temporary file: append, page-crossing patch/read, seal and bounded iteration', async t => {
  const h = temporaryRoot(t, {shortRead: 17, shortWrite: 7}), budget = createIndexBudget();
  const store = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'table-a', schema, budget, yieldTask: tick});
  const record = new Uint8Array(24), count = Math.ceil(PAGE / 24) + 3;
  for (let i = 0; i < count; i++) { new DataView(record.buffer).setUint32(0, i, true); await store.appendRecord(record); }
  record.fill(0xee); await store.patchRecord(2730, record); // Starts at 65520 and crosses the page boundary.
  const read = new Uint8Array(24); await store.readRecord(2730, read); assert.deepEqual(read, record);
  const page = new Uint8Array(PAGE); assert.equal(await store.readPage(1, page), count * 24 - PAGE);
  const sealed = await store.seal({expectedCount: count}); assert.equal(sealed.extent, count * 24);
  await assert.rejects(store.appendRecord(record), /SEALED/);
  let visited = 0;
  await store.iterate(async (bytes, index) => { assert.equal(bytes.length, 24); assert.equal(index, visited++); if (index !== 2730) assert.equal(new DataView(bytes.buffer, bytes.byteOffset, 24).getUint32(0, true), index); });
  assert.equal(visited, count); assert(h.calls.maxIO <= PAGE); assert(store.metrics.yields > 0);
  assert.equal(store.metrics.internalBufferBytes, PAGE); assert(budget.peakBytes <= 3 * PAGE);
  assert.equal(statSync(join(h.path, 'table-a', 'records.bin')).size, count * 24);
  t.diagnostic(`real file: ${count} records / ${count * 24} bytes; peak reservations ${budget.peakBytes}; maximum I/O request ${h.calls.maxIO}`);
  await store.dispose(); assert.equal(budget.usedBytes, 0); assert.equal(existsSync(join(h.path, 'table-a')), false);
});

test('budget reservation precedes allocation and borrowed backing buffers are accounted', async t => {
  const h = temporaryRoot(t), budget = createIndexBudget(PAGE * 2);
  const store = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'budget', schema, budget});
  assert.equal(budget.usedBytes, PAGE);
  await assert.rejects(store.appendRecord(new Uint8Array(new ArrayBuffer(PAGE * 2), 0, 24)), /BUFFER_BUDGET/);
  assert.equal(h.calls.write, 0); assert.equal(budget.usedBytes, PAGE);
  await store.dispose(); assert.equal(budget.usedBytes, 0);
  assert.throws(() => createIndexBudget(8 * 1024 ** 2 + 1), /BUDGET_LIMIT/);
  for (const recordBytes of [0, -1, 0.5, PAGE + 1, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'invalid', schema: {...schema, recordBytes}}), /SCHEMA/);
  }
  assert.equal(existsSync(join(h.path, 'invalid')), false);
});

test('multiple stores draw from one explicit budget and release independently', async t => {
  const h = temporaryRoot(t), budget = createIndexBudget(3 * PAGE);
  const a = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'a', schema, budget});
  const b = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'b', schema, budget});
  assert.equal(budget.usedBytes, 2 * PAGE);
  await assert.rejects(a.appendRecord(new Uint8Array(new ArrayBuffer(2 * PAGE), 0, 24)), /BUFFER_BUDGET/);
  await a.dispose(); assert.equal(budget.usedBytes, PAGE);
  await b.appendRecord(new Uint8Array(new ArrayBuffer(2 * PAGE), 0, 24));
  assert.equal(budget.peakBytes, 3 * PAGE);
  await b.dispose(); assert.equal(budget.usedBytes, 0);
});

test('short I/O makes progress, zero reads/writes and disk-full fail explicitly', async t => {
  for (const mode of ['zero-write', 'disk-full', 'zero-read']) {
    const h = temporaryRoot(t, {write: mode === 'zero-write' ? () => 0 : mode === 'disk-full' ? () => { throw Error('DISK_FULL'); } : undefined,
      read: mode === 'zero-read' ? () => 0 : undefined});
    const store = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: mode, schema});
    if (mode === 'zero-read') { await store.appendRecord(new Uint8Array(24)); await assert.rejects(store.readRecord(0, new Uint8Array(24)), /NO_READ_PROGRESS/); }
    else await assert.rejects(store.appendRecord(new Uint8Array(24)), mode === 'zero-write' ? /NO_WRITE_PROGRESS/ : /DISK_FULL/);
    assert.equal(store.metrics.state, 'failed'); await store.dispose();
  }
});

test('disk-full after a partial write never advances the logical record count', async t => {
  const h = temporaryRoot(t, {shortWrite: 7, write(bytes, at) { if (at >= 7) throw Error('DISK_FULL_AFTER_PARTIAL_WRITE'); }});
  const store = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'partial-full', schema});
  await assert.rejects(store.appendRecord(new Uint8Array(24)), /DISK_FULL_AFTER_PARTIAL_WRITE/);
  assert.equal(store.metrics.count, 0); assert.equal(store.metrics.extent, 0); assert.equal(store.metrics.observedFileBytes, 7);
  assert.equal(statSync(join(h.path, 'partial-full', 'records.bin')).size, 7);
  await assert.rejects(store.seal(), /INDEX_NOT_OPEN/); await store.dispose();
});

test('concurrent operations do not queue buffers, and disposal waits for canceled I/O', async t => {
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const h = temporaryRoot(t, {shortWrite: 1});
  const store = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'cancel', schema: {...schema, recordBytes: PAGE},
    yieldTask: () => new Promise(resolve => { release = resolve; entered(); })});
  const writing = store.appendRecord(new Uint8Array(PAGE));
  const rejected = assert.rejects(writing, {name: 'AbortError'});
  await waiting;
  await assert.rejects(store.appendRecord(new Uint8Array(PAGE)), /INDEX_BUSY/);
  const disposing = store.dispose(); assert.equal(h.calls.close, 0); assert.equal(h.calls.remove.length, 0);
  release(); await rejected; await disposing;
  assert.equal(h.calls.close, 1); assert.deepEqual(h.calls.remove, ['cancel']);
});

test('cleanup retries retain close ownership and delete only this newly-created job', async t => {
  let failClose = true, failRemove = true;
  const h = temporaryRoot(t, {close() { if (failClose) throw Error('CLOSE_FAILED'); }, remove() { if (failRemove) throw Error('REMOVE_FAILED'); }});
  mkdirSync(join(h.path, 'other-job')); writeFileSync(join(h.path, 'other-job', 'keep'), 'original');
  const budget = createIndexBudget(), store = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'mine', schema, budget});
  await assert.rejects(store.dispose(), /CLOSE_FAILED/); assert.equal(h.calls.remove.length, 0); assert.equal(budget.usedBytes, PAGE);
  failClose = false; await assert.rejects(store.dispose(), /REMOVE_FAILED/); assert.equal(budget.usedBytes, 0);
  failRemove = false; await store.dispose(); assert.equal(h.calls.close, 2); assert(existsSync(join(h.path, 'other-job', 'keep')));
  await assert.rejects(createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'other-job', schema}), /JOB_ALREADY_EXISTS/);
  assert(existsSync(join(h.path, 'other-job', 'keep')));
});

test('seal checks exact count/extent and flush failure cannot become sealed', async t => {
  const h = temporaryRoot(t), store = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'count-mismatch', schema});
  await store.appendRecord(new Uint8Array(24));
  await assert.rejects(store.seal({expectedCount: 2}), /SEAL_EXTENT_MISMATCH/);
  assert.equal(store.metrics.state, 'failed'); await store.dispose();
  const broken = temporaryRoot(t, {flush() { throw Error('FLUSH_FAILED'); }});
  const other = await createIndexStore({root: broken.root, lockManager: broken.lockManager, jobId: 'flush-failure', schema});
  await assert.rejects(other.seal(), /FLUSH_FAILED/);
  assert.equal(other.metrics.state, 'failed'); await other.dispose();
});

test('iteration awaits each callback and a per-operation abort returns before the next record', async t => {
  const h = temporaryRoot(t), store = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'iteration-cancel', schema});
  for (let i = 0; i < 3; i++) await store.appendRecord(new Uint8Array(24));
  const controller = new AbortController(); let visited = 0;
  await assert.rejects(store.iterate(async () => { visited++; await tick(); controller.abort(); }, {signal: controller.signal}), {name: 'AbortError'});
  assert.equal(visited, 1); assert.equal(store.metrics.internalBufferBytes, PAGE);
  assert.equal(store.metrics.budgetReservedBytes, PAGE); await store.dispose();
});

test('safe integer position validation and simulated I/O beyond 4 GiB without allocating that payload', async () => {
  assert.equal(recordByteOffset(65536, PAGE), 2 ** 32);
  assert.throws(() => recordByteOffset(Number.MAX_SAFE_INTEGER, 2), /POSITION/);
  for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => recordByteOffset(value, 24), /POSITION/);
  let size = 0, lastPosition = 0, removed = false;
  const handle = {getSize: () => size, write(bytes, {at}) { lastPosition = at; size = Math.max(size, at + bytes.length); return bytes.length; },
    read(bytes, {at}) { lastPosition = at; bytes.fill(0); return Math.min(bytes.length, size - at); }, flush() {}, close() {}};
  const root = {async getDirectoryHandle(name, options) { if (!options?.create) throw new DOMException('missing', 'NotFoundError');
    return {async getFileHandle() { return {async createSyncAccessHandle() { return handle; }}; }}; }, async removeEntry() { removed = true; }};
  const store = await createIndexStore({root, lockManager: mockLockManager(), jobId: 'simulated-large-offset', schema: {...schema, recordBytes: PAGE}, yieldTask: async () => {}});
  const buffer = new Uint8Array(PAGE);
  for (let i = 0; i <= 65536; i++) await store.appendRecord(buffer);
  assert.equal(lastPosition, 2 ** 32); assert.equal(store.metrics.extent, 2 ** 32 + PAGE);
  await store.patchRecord(65536, buffer); assert.equal(lastPosition, 2 ** 32);
  await store.readRecord(65536, buffer); assert.equal(lastPosition, 2 ** 32);
  await store.seal({expectedCount: 65537}); await store.dispose(); assert.equal(removed, true);
});


test('negative page index is rejected before the cache sentinel can match', async t => {
  const h = temporaryRoot(t), store = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'negative-page', schema});
  try {
    await assert.rejects(store.readPage(-1, new Uint8Array(PAGE)), /INVALID_INDEX_POSITION/);
    assert.equal(h.calls.read, 0); assert.equal(store.metrics.cacheHits, 0);
  } finally { await store.dispose(); }
});

test('same-origin creation race rejects the loser without touching the winner job', async t => {
  const h = temporaryRoot(t), lockManager = h.lockManager;
  const observer = () => {
    const calls = {directory: 0, remove: 0};
    return {calls, root: {
      getDirectoryHandle(...args) { calls.directory++; return h.root.getDirectoryHandle(...args); },
      removeEntry(...args) { calls.remove++; return h.root.removeEntry(...args); },
    }};
  };
  const owners = [observer(), observer()];
  const results = await Promise.allSettled(owners.map(({root}) => createIndexStore({root, lockManager, jobId: 'raced-job', schema})));
  t.after(() => Promise.allSettled(results.filter(r => r.status === 'fulfilled').map(r => r.value.dispose())));
  assert.deepEqual(results.map(r => r.status).sort(), ['fulfilled', 'rejected']);
  const winnerIndex = results.findIndex(r => r.status === 'fulfilled'), loserIndex = 1 - winnerIndex;
  const store = results[winnerIndex].value;
  assert.equal(results[loserIndex].reason.status, 'BLOCKED');
  assert.match(results[loserIndex].reason.message, /INDEX_JOB_LOCK_BUSY/);
  assert.deepEqual(owners[loserIndex].calls, {directory: 0, remove: 0});
  assert.equal(lockManager.held.size, 1);
  const bytes = new Uint8Array(24).fill(23), output = new Uint8Array(24);
  await store.appendRecord(bytes); await store.readRecord(0, output); assert.deepEqual(output, bytes);
  await store.dispose(); assert.equal(lockManager.held.size, 0);
  const next = await createIndexStore({root: h.root, lockManager, jobId: 'raced-job', schema});
  await next.appendRecord(bytes); await next.dispose(); assert.equal(lockManager.held.size, 0);
});

test('a failed close or remove retains the lease until cleanup succeeds', async t => {
  let failClose = true, failRemove = true;
  const h = temporaryRoot(t, {close() { if (failClose) throw Error('CLOSE_FAILED'); }, remove() { if (failRemove) throw Error('REMOVE_FAILED'); }});
  const options = {root: h.root, lockManager: h.lockManager, jobId: 'cleanup-lease', schema};
  const store = await createIndexStore(options);
  t.after(async () => { failClose = false; failRemove = false; await store.dispose(); });
  await assert.rejects(store.dispose(), /CLOSE_FAILED/);
  assert.equal(h.lockManager.held.size, 1); assert.equal(h.calls.remove.length, 0);
  await assert.rejects(createIndexStore(options), /INDEX_JOB_LOCK_BUSY/);
  failClose = false; await assert.rejects(store.dispose(), /REMOVE_FAILED/);
  assert.equal(h.lockManager.held.size, 1); assert.deepEqual(h.calls.remove, ['cleanup-lease']);
  await assert.rejects(createIndexStore(options), /INDEX_JOB_LOCK_BUSY/);
  assert.deepEqual(h.calls.remove, ['cleanup-lease']);
  failRemove = false; await store.dispose(); assert.equal(h.lockManager.held.size, 0);
  const next = await createIndexStore(options); await next.dispose();
});

test('existing jobs release the lease without removal; unavailable locks block before filesystem work', async t => {
  const h = temporaryRoot(t), options = {root: h.root, lockManager: h.lockManager, jobId: 'existing-lease', schema};
  mkdirSync(join(h.path, 'existing-lease'));
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(createIndexStore(options), /JOB_ALREADY_EXISTS/);
    assert.equal(h.lockManager.held.size, 0); assert.equal(h.calls.remove.length, 0);
  }
  for (const lockManager of [null, {request() { throw new DOMException('disabled', 'SecurityError'); }},
    {request() { return Promise.reject(new DOMException('disabled', 'SecurityError')); }}]) {
    await assert.rejects(createIndexStore({...options, jobId: 'unavailable-lock', lockManager}), error => error.status === 'BLOCKED' && /INDEX_JOB_LOCK_UNAVAILABLE/.test(error.message));
  }
  assert.equal(existsSync(join(h.path, 'unavailable-lock')), false); assert.equal(h.calls.remove.length, 0);
});

test('initialization cancellation keeps its lease while retryCleanup is required', async t => {
  let failRemove = true;
  const controller = new AbortController();
  const h = temporaryRoot(t, {getSize() { controller.abort(); }, remove() { if (failRemove) throw Error('REMOVE_FAILED'); }});
  const options = {root: h.root, lockManager: h.lockManager, jobId: 'init-cancel-lease', schema};
  let failure;
  await assert.rejects(createIndexStore({...options, signal: controller.signal}), error => {
    failure = error; return error.name === 'AbortError' && error.cleanupError === 'REMOVE_FAILED' && typeof error.retryCleanup === 'function';
  });
  assert.equal(h.lockManager.held.size, 1); assert.equal(h.calls.close, 1);
  await assert.rejects(createIndexStore(options), /INDEX_JOB_LOCK_BUSY/);
  assert.deepEqual(h.calls.remove, ['init-cancel-lease']);
  failRemove = false; await failure.retryCleanup();
  assert.equal(h.lockManager.held.size, 0); assert.equal(h.calls.close, 1);
  const next = await createIndexStore(options); await next.dispose();
});


test('sequential append/read/patch retains bounded read I/O while disk records remain exact', async t => {
  const h = temporaryRoot(t), width = 64, count = 4096;
  const store = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'write-through', schema: {...schema, recordBytes: width}, yieldTask: tick});
  const bytes = new Uint8Array(width), result = new Uint8Array(width), d = new DataView(bytes.buffer);
  try {
    for (let index = 0; index < count; index++) {
      d.setUint32(0, index, true); d.setUint32(4, 0, true); await store.appendRecord(bytes);
      await store.readRecord(index, result); assert.deepEqual(result, bytes);
      d.setUint32(4, index + 1, true); await store.patchRecord(index, bytes);
      await store.readRecord(index, result); assert.deepEqual(result, bytes);
    }
    const disk = readFileSync(join(h.path, 'write-through', 'records.bin')), v = new DataView(disk.buffer, disk.byteOffset, disk.length);
    for (let index = 0; index < count; index++) { assert.equal(v.getUint32(index * width, true), index); assert.equal(v.getUint32(index * width + 4, true), index + 1); }
    assert(store.metrics.readBytes <= count * width, `read amplification: ${store.metrics.readBytes} > ${count * width}`);
  } finally { await store.dispose(); }
});

test('partial cached-page patch canceled during short I/O cannot be read as a completed update', async t => {
  let pause = false, entered, release;
  const reached = new Promise(r => { entered = r; }), aborter = new AbortController();
  const h = temporaryRoot(t, {shortWrite: 1});
  const store = await createIndexStore({root: h.root, lockManager: h.lockManager, jobId: 'cached-cancel', schema: {...schema, recordBytes: PAGE},
    yieldTask: () => pause ? new Promise(r => { release = r; entered(); }) : tick()});
  await store.appendRecord(new Uint8Array(PAGE)); await store.readPage(0, new Uint8Array(PAGE));
  pause = true; const patch = store.patchRecord(0, new Uint8Array(PAGE).fill(77), {signal: aborter.signal});
  const rejected = assert.rejects(patch, {name: 'AbortError'}); await reached; aborter.abort(); release(); await rejected;
  await assert.rejects(store.readPage(0, new Uint8Array(PAGE)), /INDEX_NOT_OPEN/);
  const disk = readFileSync(join(h.path, 'cached-cancel', 'records.bin')); assert.equal(disk[0], 77); assert.equal(disk[64], 0);
  await store.dispose();
});
