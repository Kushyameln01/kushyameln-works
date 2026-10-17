import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFileOutput, saveBlobToFile } from '../docs/shared/vr180/file-output.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function memoryFile(initial = new Uint8Array(), hooks = {}) {
  let saved = initial.slice(), draft, writes = 0, aborts = 0, closes = 0;
  const handle = {
    async isSameEntry(other) { return other === handle; },
    async getFile() { await hooks.getFile?.(closes); return new Blob([hooks.corruptRead && closes ? new Uint8Array(saved.length) : saved]); },
    async createWritable() {
      await hooks.createWritable?.();
      draft = new Uint8Array();
      return {
        async write({ position, data }) {
          writes++; await hooks.write?.(position, data);
          if (position > 16 * 1024 ** 2) return; // Large-offset test records the number without allocating it.
          const next = new Uint8Array(Math.max(draft.length, position + data.length)); next.set(draft); next.set(data, position); draft = next;
        },
        async truncate(n) { const next = new Uint8Array(n); next.set(draft.subarray(0, n)); draft = next; },
        async close() { closes++; await hooks.close?.(); saved = draft.slice(); },
        async abort() { aborts++; await hooks.abort?.(); draft = null; },
      };
    },
    get metrics() { return { writes, aborts, closes, saved }; },
  };
  return handle;
}

test('muxer close retains the transaction; metadata can overwrite positions before commit', async () => {
  const h = memoryFile(), sink = await createFileOutput(h), writer = sink.stream.getWriter();
  await writer.write({ type: 'write', position: 0, data: Uint8Array.of(1, 2, 3, 4) });
  await writer.close();
  assert.equal(h.metrics.closes, 0); assert.equal(sink.status.muxerClosed, true);
  await sink.writeAt(1, Uint8Array.of(9));
  const result = await sink.commit({ expectedBytes: 4, expectedSha256: hash(Uint8Array.of(1, 9, 3, 4)) });
  assert.equal(result.hashMatched, true); assert.equal(h.metrics.closes, 1); assert.equal(sink.status.state, 'verified');
});

test('a canceled muxer can close its wrapper without committing incomplete output', async () => {
  const h = memoryFile(), sink = await createFileOutput(h), writer = sink.stream.getWriter();
  await writer.write({ type: 'write', position: 0, data: Uint8Array.of(1) });
  await writer.close(); await sink.abort();
  assert.equal(h.metrics.closes, 0); assert.equal(h.metrics.aborts, 1); assert.equal(h.metrics.saved.length, 0);
});

test('existing contents and source identity are rejected before opening a writer', async () => {
  const h = memoryFile(Uint8Array.of(7));
  await assert.rejects(createFileOutput(h), /OUTPUT_MUST_BE_NEW_FILE/);
  await assert.rejects(createFileOutput(h, { sourceHandle: h, allowExisting: true }), /OUTPUT_IS_INPUT/);
  assert.equal(h.metrics.writes + h.metrics.closes + h.metrics.aborts, 0);
  assert.deepEqual(h.metrics.saved, Uint8Array.of(7));
});

for (const stage of ['getFile', 'nonempty', 'createWritable']) test(`pre-writer ${stage} rejection reports not-started without abort`, async () => {
  const h = memoryFile(stage === 'nonempty' ? Uint8Array.of(1) : undefined, {
    getFile() { if (stage === 'getFile') throw Error('GET_FILE_DENIED'); },
    createWritable() { throw Error('CREATE_WRITABLE_DENIED'); },
  });
  let notified = false;
  await assert.rejects(saveBlobToFile(new Blob(['input']), h, {onCreated() { notified = true; }}), error =>
    error.saveOutputState?.state === 'not-started' && error.saveOutputState.writerAcquired === false && error.saveWriteCommitted === false);
  assert.equal(notified, false); assert.equal(h.metrics.writes + h.metrics.closes + h.metrics.aborts, 0);
});

test('write rejection with an acknowledged writer abort reports aborted, not not-started or unknown', async () => {
  const h = memoryFile(undefined, {write() { throw Error('WRITE_FAILED'); }});
  await assert.rejects(saveBlobToFile(new Blob(['input']), h), error => error.saveOutputState?.state === 'aborted'
    && error.saveOutputState.writerAcquired === true && error.saveWriteCommitted === false);
  assert.equal(h.metrics.writes, 1); assert.equal(h.metrics.aborts, 1); assert.equal(h.metrics.closes, 0);
});

test('position arithmetic preserves values beyond 4 GiB without allocating a large file', async () => {
  let observed;
  const h = memoryFile(undefined, { write: position => { observed = position; } });
  const sink = await createFileOutput(h), position = 2 ** 32 + 123;
  await sink.writeAt(position, Uint8Array.of(1, 2));
  assert.equal(observed, position); assert.equal(sink.status.extent, position + 2);
  await assert.rejects(sink.writeAt(Number.MAX_SAFE_INTEGER, Uint8Array.of(1)), /INVALID_FILE_POSITION/);
  await sink.abort();
});

test('only one outstanding write is accepted; abort waits for it and never closes', async () => {
  let release;
  const h = memoryFile(undefined, { write: () => new Promise(r => { release = r; }) });
  const sink = await createFileOutput(h), write = sink.writeAt(0, Uint8Array.of(1));
  const rejected = assert.rejects(write, { name: 'AbortError' });
  await assert.rejects(sink.writeAt(1, Uint8Array.of(2)), /CONCURRENT_FILE_OPERATION/);
  const abort = sink.abort(); assert.equal(h.metrics.aborts, 0);
  release(); await rejected; await abort;
  assert.equal(h.metrics.aborts, 1); assert.equal(h.metrics.closes, 0);
});

test('abort failure remains visible and cleanup can be retried', async () => {
  let fail = true;
  const h = memoryFile(undefined, { abort: () => { if (fail) throw Error('LOCKED'); } });
  const sink = await createFileOutput(h);
  await assert.rejects(sink.abort(), /LOCKED/);
  assert.equal(sink.status.state, 'cleanup-failed');
  fail = false; await sink.abort(); assert.equal(sink.status.state, 'aborted');
});

test('cancellation during close records committed bytes without claiming successful verification', async () => {
  const controller = new AbortController();
  const h = memoryFile(undefined, { close: () => controller.abort() });
  const sink = await createFileOutput(h, { signal: controller.signal });
  await sink.writeAt(0, Uint8Array.of(5));
  await assert.rejects(sink.commit({ expectedBytes: 1 }), e => e.name === 'AbortError' && e.saveWriteCommitted === true);
  assert.equal(sink.status.committed, true); assert.equal(sink.status.state, 'verification-failed');
  assert.deepEqual(h.metrics.saved, Uint8Array.of(5));
});

test('size and content mismatches after close cannot become verified success', async () => {
  const h = memoryFile(undefined, { corruptRead: true });
  const sink = await createFileOutput(h); await sink.writeAt(0, Uint8Array.of(5));
  await assert.rejects(sink.commit({ expectedBytes: 1, expectedSha256: hash(Uint8Array.of(5)) }), e => e.message === 'SAVED_HASH_MISMATCH' && e.saveWriteCommitted);
  assert.equal(sink.status.state, 'verification-failed');
});

test('direct abort while committed-file readback is pending prevents verified success', async () => {
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const h = memoryFile(undefined, { getFile: closes => closes && new Promise(resolve => { release = resolve; entered(); }) });
  const sink = await createFileOutput(h); await sink.writeAt(0, Uint8Array.of(5));
  const commit = sink.commit({ expectedBytes: 1 });
  const rejected = assert.rejects(commit, e => e.name === 'AbortError' && e.saveWriteCommitted);
  await waiting; await sink.abort(); release(); await rejected;
  assert.equal(sink.status.state, 'verification-failed'); assert.equal(h.metrics.aborts, 0);
});

test('direct abort during saved-file hashing cancels verification after physical commit', async () => {
  const h = memoryFile(); let sink;
  sink = await createFileOutput(h, { onProgress: p => { if (p.phase === 'verify' && p.bytesHashed > 0) void sink.abort(); } });
  await sink.writeAt(0, new Uint8Array(2 * 1024 ** 2));
  await assert.rejects(sink.commit({ expectedBytes: 2 * 1024 ** 2 }), e => e.name === 'AbortError' && e.saveWriteCommitted);
  assert.equal(sink.status.state, 'verification-failed'); assert.equal(h.metrics.aborts, 0);
});

test('short source reads abort the unfinished transaction before committing', async () => {
  const h = memoryFile();
  await assert.rejects(saveBlobToFile({ size: 2, slice: () => new Blob([Uint8Array.of(1)]) }, h,
    { expectedSha256: hash(Uint8Array.of(1, 2)) }), /INCOMPLETE_SOURCE_READ/);
  assert.equal(h.metrics.closes, 0); assert.equal(h.metrics.aborts, 1);
});

test('a failed copy retains a callable cleanup retry instead of losing its writer', async () => {
  let fail = true;
  const h = memoryFile(undefined, { write: () => { throw Error('WRITE_FAILED'); }, abort: () => { if (fail) throw Error('ABORT_FAILED'); } });
  let failure;
  await assert.rejects(saveBlobToFile(new Blob([Uint8Array.of(3)]), h), e => { failure = e; return e.message === 'WRITE_FAILED'; });
  assert.equal(failure.cleanupError, 'ABORT_FAILED'); assert.equal(typeof failure.retryCleanup, 'function');
  assert.equal(failure.saveOutputState.state, 'cleanup-failed');
  fail = false; await failure.retryCleanup();
  assert.equal(failure.saveOutputState.state, 'aborted');
  assert.equal(h.metrics.aborts, 2); assert.equal(h.metrics.closes, 0);
});

test('cancellation while acquiring a writer preserves a failed cleanup and explicit retry', async () => {
  let entered, release, fail = true;
  const waiting = new Promise(resolve => { entered = resolve; });
  const controller = new AbortController();
  const h = memoryFile(undefined, { createWritable: () => new Promise(resolve => { release = resolve; entered(); }), abort: () => { if (fail) throw Error('ABORT_FAILED'); } });
  let acquired;
  const saving = saveBlobToFile(new Blob([Uint8Array.of(3)]), h, {signal: controller.signal,
    expectedSha256: hash(Uint8Array.of(3)), onCreated: output => { acquired = output; }});
  let failure;
  const rejected = assert.rejects(saving, e => { failure = e; return e.name === 'AbortError' && e.saveWriteCommitted === false; });
  await waiting; controller.abort(); release(); await rejected;
  assert.equal(failure.cleanupError, 'ABORT_FAILED'); assert.equal(typeof failure.retryCleanup, 'function');
  assert.equal(acquired.status.state, 'cleanup-failed'); assert.equal(failure.saveOutputState.writerAcquired, true);
  fail = false; await failure.retryCleanup();
  assert.equal(failure.saveOutputState.state, 'aborted');
  assert.equal(h.metrics.aborts, 2); assert.equal(h.metrics.closes, 0);
});

test('copy reads only bounded slices and saved content matches an independent hash', async () => {
  const bytes = new Uint8Array(2 * 1024 ** 2 + 17).map((_, i) => i % 251), blob = new Blob([bytes]);
  let maxRead = 0;
  const bounded = { size: blob.size, slice(a, b) { maxRead = Math.max(maxRead, b - a); return blob.slice(a, b); }, arrayBuffer() { throw Error('whole-file read'); } };
  const h = memoryFile(), result = await saveBlobToFile(bounded, h, { expectedSha256: hash(bytes) });
  assert(maxRead <= 1024 ** 2); assert.equal(result.sha256, hash(bytes)); assert.equal(result.bytes, bytes.length);
});
