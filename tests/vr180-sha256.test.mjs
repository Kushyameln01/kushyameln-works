import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { SHA256_CHUNK_BYTES, Sha256, sha256Blob, sha256LengthField } from '../docs/shared/vr180/sha256.mjs';

const text = s => new TextEncoder().encode(s);
const expected = bytes => createHash('sha256').update(bytes).digest('hex');
const pattern = length => Uint8Array.from({ length }, (_, i) => (i * 73 + Math.floor(i / 7)) % 256);
const isAbort = error => error?.name === 'AbortError';

// NIST's one-block/two-block examples, plus empty and million-'a' vectors.
// https://csrc.nist.gov/CSRC/media/Projects/Cryptographic-Standards-and-Guidelines/documents/examples/SHA256.pdf
test('standard SHA-256 vectors, including padding across two blocks', () => {
  for (const [input, hex] of [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ]) assert.equal(new Sha256().update(text(input)).digestHex(), hex);
  const hash = new Sha256(), thousand = new Uint8Array(1000).fill(97);
  for (let i = 0; i < 1000; i++) hash.update(thousand);
  assert.equal(hash.bytesHashed, 1000000n);
  assert.equal(hash.digestHex(), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
});

test('Node crypto matches at padding/block boundaries and arbitrary incremental partitions', () => {
  for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 4097, 65537]) {
    // Nonzero byteOffset catches accidental hashing of a view's whole backing buffer.
    const backing = pattern(length + 19), bytes = backing.subarray(11, 11 + length);
    const hash = new Sha256(), steps = [1, 7, 64, 13, 127];
    for (let at = 0, i = 0; at < bytes.length; i++) {
      const end = Math.min(at + steps[i % steps.length], bytes.length);
      hash.update(bytes.subarray(at, end));
      hash.update(new Uint8Array());
      at = end;
    }
    assert.equal(hash.bytesHashed, BigInt(length));
    assert.equal(hash.digestHex(), expected(bytes), `length ${length}`);
    assert.equal(new Sha256().update(bytes).digestHex(), expected(bytes));
    assert.equal(hash.digestHex(), expected(bytes), 'finalization is repeatable');
    assert.throws(() => hash.update(Uint8Array.of(1)), /ALREADY_FINALIZED/);
  }
});

test('64-bit bit-length encoding crosses 4 GiB without hashing a multi-GB file', () => {
  const cases = [
    [0n, '0000000000000000'],
    [536870912n, '0000000100000000'],
    [4294967295n, '00000007fffffff8'],
    [4294967296n, '0000000800000000'],
    [5000000000n, '00000009502f9000'],
    [10000000000n, '00000012a05f2000'],
    [(1n << 61n) - 1n, 'fffffffffffffff8'],
  ];
  for (const [bytes, hex] of cases) assert.equal(Buffer.from(sha256LengthField(bytes)).toString('hex'), hex);
  for (const invalid of [-1n, 1n << 61n, 1, NaN]) assert.throws(() => sha256LengthField(invalid), /BYTE_LENGTH/);
});

test('Blob hashing reads sequential bounded slices and never the source whole-file buffer', async () => {
  const bytes = pattern(SHA256_CHUNK_BYTES * 2 + 153), blob = new Blob([bytes]);
  const ranges = [], progress = [];
  let wholeReads = 0, pending = 0, peakPending = 0;
  const source = {
    size: blob.size,
    async arrayBuffer() { wholeReads++; throw Error('whole-source read forbidden'); },
    slice(start, end) {
      ranges.push([start, end]);
      assert(end - start <= SHA256_CHUNK_BYTES);
      return { async arrayBuffer() {
        pending++; peakPending = Math.max(peakPending, pending);
        try { return await blob.slice(start, end).arrayBuffer(); }
        finally { pending--; }
      } };
    },
  };
  assert.equal(await sha256Blob(source, { onProgress: p => progress.push(p) }), expected(bytes));
  assert.equal(wholeReads, 0);
  assert.equal(peakPending, 1);
  assert.deepEqual(ranges, [[0, SHA256_CHUNK_BYTES], [SHA256_CHUNK_BYTES, 2 * SHA256_CHUNK_BYTES], [2 * SHA256_CHUNK_BYTES, bytes.length]]);
  assert.deepEqual(progress.map(p => p.bytesHashed), [0, SHA256_CHUNK_BYTES, 2 * SHA256_CHUNK_BYTES, bytes.length]);
  assert(progress.every(p => p.totalBytes === bytes.length));
});

test('small custom chunks retain partial blocks and exact progress, including empty Blob', async () => {
  const bytes = pattern(257), progress = [];
  assert.equal(await sha256Blob(new Blob([bytes]), { chunkBytes: 17, onProgress: p => progress.push(p.bytesHashed) }), expected(bytes));
  assert.deepEqual(progress, [0, ...Array.from({ length: 15 }, (_, i) => (i + 1) * 17), 257]);
  const emptyProgress = [];
  assert.equal(await sha256Blob(new Blob(), { onProgress: p => emptyProgress.push(p) }), expected(new Uint8Array()));
  assert.deepEqual(emptyProgress, [{ bytesHashed: 0, totalBytes: 0 }]);
});

test('pre-aborted signal performs no reads or progress calls', async () => {
  const controller = new AbortController(); controller.abort();
  const source = { size: 1, slice() { throw Error('read after abort'); } };
  await assert.rejects(sha256Blob(source, { signal: controller.signal, onProgress() { throw Error('progress after abort'); } }), isAbort);
});

test('task yielding lets a queued cancellation stop before the next slice', async () => {
  const controller = new AbortController(), reads = [];
  const source = {
    size: 192,
    slice(start, end) {
      reads.push([start, end]);
      // A synchronous/promise-only producer must still allow task-queue work.
      return { arrayBuffer: async () => new ArrayBuffer(end - start) };
    },
  };
  await assert.rejects(sha256Blob(source, {
    signal: controller.signal, chunkBytes: 64,
    onProgress({ bytesHashed }) { if (bytesHashed === 64) setTimeout(() => controller.abort(), 0); },
  }), isAbort);
  assert.deepEqual(reads, [[0, 64]]);
});

test('a separate Node Worker receives cancellation messages while hashing', { timeout: 5000 }, async () => {
  const script = `
    import { parentPort, workerData } from 'node:worker_threads';
    const { sha256Blob } = await import(workerData.module);
    const controller = new AbortController();
    parentPort.on('message', message => { if (message === 'cancel') controller.abort(); });
    let bytesHashed = 0, reads = 0;
    const source = { size: 1024 * 1024, slice(start, end) {
      reads++; return { arrayBuffer: async () => new ArrayBuffer(end - start) };
    } };
    try {
      await sha256Blob(source, { signal: controller.signal, chunkBytes: 1024,
        onProgress(p) { bytesHashed = p.bytesHashed; if (bytesHashed === 1024) parentPort.postMessage({ type: 'progress' }); }
      });
      parentPort.postMessage({ type: 'result', status: 'unexpected-completion' });
    } catch (error) {
      parentPort.postMessage({ type: 'result', status: error.name, bytesHashed, reads, totalBytes: source.size });
    } finally { parentPort.close(); }
  `;
  const worker = new Worker(new URL('data:text/javascript,' + encodeURIComponent(script)), {
    workerData: { module: new URL('../docs/shared/vr180/sha256.mjs', import.meta.url).href },
  });
  try {
    const result = await new Promise((resolve, reject) => {
      worker.on('error', reject);
      worker.on('message', message => {
        if (message.type === 'progress') worker.postMessage('cancel');
        if (message.type === 'result') resolve(message);
      });
      worker.on('exit', code => { if (code !== 0) reject(Error('Hash worker exit ' + code)); });
    });
    assert.equal(result.status, 'AbortError');
    assert(result.bytesHashed >= 1024 && result.bytesHashed < result.totalBytes);
    assert(result.reads < result.totalBytes / 1024);
  } finally { await worker.terminate(); }
});

test('cancellation during an in-flight slice prevents hashing and further reads', async () => {
  const controller = new AbortController(), progress = [];
  let resolveRead, reads = 0;
  const source = {
    size: 128,
    slice() { reads++; return { arrayBuffer: () => new Promise(resolve => { resolveRead = resolve; }) }; },
  };
  const pending = sha256Blob(source, { signal: controller.signal, chunkBytes: 64, onProgress: p => progress.push(p.bytesHashed) });
  controller.abort(); resolveRead(new ArrayBuffer(64));
  await assert.rejects(pending, isAbort);
  assert.equal(reads, 1); assert.deepEqual(progress, [0]);
});

test('large declared size survives progress accounting; cancellation avoids a multi-GB test', async () => {
  const controller = new AbortController(), progress = [], reads = [];
  const source = {
    size: 10000000000,
    slice(start, end) { reads.push([start, end]); return { arrayBuffer: async () => new ArrayBuffer(end - start) }; },
  };
  await assert.rejects(sha256Blob(source, {
    signal: controller.signal, chunkBytes: 64,
    onProgress(p) { progress.push(p); if (p.bytesHashed) controller.abort(); },
  }), isAbort);
  assert.deepEqual(progress, [{ bytesHashed: 0, totalBytes: 10000000000 }, { bytesHashed: 64, totalBytes: 10000000000 }]);
  assert.deepEqual(reads, [[0, 64]]);
});

test('invalid bounds and incomplete reads fail without claiming a digest', async () => {
  for (const chunkBytes of [0, -1, 1.5, SHA256_CHUNK_BYTES + 1, Infinity]) {
    await assert.rejects(sha256Blob(new Blob(['abc']), { chunkBytes }), /CHUNK_SIZE/);
  }
  for (const size of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
    await assert.rejects(sha256Blob({ size, slice() { throw Error('unexpected read'); } }), /SAFE_SIZE/);
  }
  for (const supplied of [0, 2]) {
    await assert.rejects(sha256Blob({ size: 1, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(supplied) }) }), /SHORT_OR_OVERSIZED_READ/);
  }
  await assert.rejects(sha256Blob(new Blob(['x']), { onProgress: true }), /PROGRESS_CALLBACK/);
  await assert.rejects(sha256Blob(new Blob(['x']), { onProgress() { throw Error('caller progress error'); } }), /caller progress error/);
});
