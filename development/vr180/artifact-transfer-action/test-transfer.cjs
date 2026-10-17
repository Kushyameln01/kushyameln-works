'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { PROFILES, MiB, validateSourceManifest, normalizeReceipt, prefix, hashFile, runTransfer, uploadWithChild } = require('./transfer.cjs');
const identity = { repository: 'Kushyameln01/kushyameln-works', commit: 'a'.repeat(40),
  ref: 'refs/heads/codex/vr180-plan-test', runId: '123456789', runAttempt: 1, job: 'segmented_transfer' };
const generator = { seed: 'vr180-public-segmented-transfer-2026-10-17',
  algorithm: 'SHAKE256(seed+NUL+fileId+NUL+decimal-byte-offset)-1MiB-blocks-v1', blockBytes: MiB };
let base, source, manifest;
async function makeSource(profile, directory) {
  await fs.mkdir(directory);
  const p = PROFILES[profile], files = [];
  for (let index = 0; index < p.fileBytes.length; index++) {
    const id = index === 0 ? 'payload-a' : 'payload-b', bytes = p.fileBytes[index], sha = crypto.createHash('sha256');
    const file = await fs.open(path.join(directory, id + '.bin'), 'wx');
    try {
      for (let offset = 0; offset < bytes; offset += MiB) {
        const b = crypto.createHash('shake256', { outputLength: Math.min(MiB, bytes - offset) })
          .update(generator.seed + '\0' + id + '\0' + offset).digest();
        await file.writeFile(b); sha.update(b);
      }
    } finally { await file.close(); }
    files.push({ id, name: id + '.bin', bytes, sha256: sha.digest('hex') });
  }
  const value = { schema: 'vr180-segmented-source-v1', status: 'GENERATED_AND_REREAD', identity,
    profile, partBytes: p.partBytes, totalBytes: p.fileBytes.reduce((a, b) => a + b, 0), files, generator };
  const manifestPath = path.join(directory, 'source-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(value));
  return { manifestPath, value };
}
function args(name, extra = {}) { return { manifestPath: source.manifestPath, outputDirectory: path.join(base, name),
  identity, provenance: { unitTest: true }, ...extra }; }
function mockUpload(seen) { return async request => {
  const bytes = await fs.readFile(request.file);
  seen.push({ ...request, bytes: bytes.length, completion: path.basename(request.file) === 'completion.json' ? JSON.parse(bytes) : undefined });
  return { id: seen.length, size: bytes.length + 150, digest: crypto.createHash('sha256').update(bytes).digest('hex') };
}; }
test.before(async () => { base = await fs.mkdtemp(path.join(os.tmpdir(), 'vr180-segment-tests-')); source = await makeSource('service-8mib', path.join(base, 'sources')); manifest = source.value; });
test.after(async () => { await fs.rm(base, { recursive: true, force: true }); });

test('profiles reject unimplemented large media and identity/name/size/hash mismatches', () => {
  assert.equal(validateSourceManifest(manifest, identity).partBytes, 8 * MiB);
  for (const change of [m => m.profile = 'p5-5gb', m => m.files[0].name = '../source.bin',
    m => m.files[0].bytes++, m => m.files[0].sha256 = '0', m => m.partBytes = 129 * MiB,
    m => m.identity.commit = 'b'.repeat(40), m => m.totalBytes++, m => m.files.push(m.files[0])]) {
    const value = structuredClone(manifest); change(value); assert.throws(() => validateSourceManifest(value, identity));
  }
});
test('successful service trial uploads 16 ordered real parts then one manifest', async () => {
  const seen = [], result = await runTransfer(args('success', { upload: mockUpload(seen) }));
  assert.equal(seen.length, 17); assert.equal(result.partCount, 16);
  assert.equal(result.status, 'COMPLETE_MANIFEST_UPLOADED');
  const completion = seen.at(-1).completion;
  assert.equal(completion.status, 'COMPLETE'); assert.equal(completion.totalBytes, 120 * MiB);
  assert.equal(seen.at(-1).name, prefix(identity, 'service-8mib') + '-complete');
  for (const file of completion.files) {
    assert.equal(file.partCount, 8); assert.equal(file.parts.length, 8);
    file.parts.forEach((part, index) => {
      assert.equal(part.index, index); assert.equal(part.offset, index * 8 * MiB);
      assert.equal(part.length, index === 7 ? 4 * MiB : 8 * MiB);
      assert.match(part.artifact.digest, /^sha256:[0-9a-f]{64}$/);
    });
  }
  await assert.rejects(fs.stat(path.join(base, 'success/stage')));
  for (const file of manifest.files) assert.equal((await fs.stat(path.join(path.dirname(source.manifestPath), file.name))).size, file.bytes);
});
test('single 128 MiB trial retains exact byte bound and one data artifact', async () => {
  const single = await makeSource('single-128mib', path.join(base, 'single-source'));
  const seen = [];
  const result = await runTransfer(args('single-result', { manifestPath: single.manifestPath, upload: mockUpload(seen) }));
  assert.equal(result.partCount, 1); assert.equal(seen[0].bytes, 128 * MiB); assert.equal(seen.length, 2);
});
test('upload error keeps originals, removes owned stage and emits no completion', async () => {
  const seen = [], upload = mockUpload(seen);
  await assert.rejects(runTransfer(args('failed-upload', { upload: async request => {
    if (seen.length === 2) throw new Error('INJECTED_UPLOAD'); return upload(request);
  } })), /INJECTED_UPLOAD/);
  const result = JSON.parse(await fs.readFile(path.join(base, 'failed-upload/incomplete.json')));
  assert.equal(result.successfulPartUploads, 2); assert.equal(result.completionManifestUploaded, false);
  assert.equal(seen.some(x => x.name.endsWith('-complete')), false);
  await assert.rejects(fs.stat(path.join(base, 'failed-upload/stage')));
  await fs.stat(path.join(path.dirname(source.manifestPath), 'payload-a.bin'));
});
test('source hash mismatch stops before any artifact and does not remove source', async () => {
  const wrong = structuredClone(manifest); wrong.files[0].sha256 = '0'.repeat(64);
  const wrongPath = path.join(path.dirname(source.manifestPath), 'wrong-manifest.json');
  await fs.writeFile(wrongPath, JSON.stringify(wrong)); let calls = 0;
  await assert.rejects(runTransfer(args('wrong-hash', { manifestPath: wrongPath, upload: async () => { calls++; } })), /SOURCE_HASH_MISMATCH/);
  assert.equal(calls, 0);
});
test('post-upload staged chunk mutation is rejected without completion', async () => {
  await assert.rejects(runTransfer(args('chunk-mutation', { upload: async request => {
    const st = await fs.stat(request.file), h = await fs.open(request.file, 'r+');
    try { await h.write(Buffer.from([0]), 0, 1, 0); } finally { await h.close(); }
    return { id: 1, size: st.size + 150, digest: 'a'.repeat(64) };
  } })), /PART_CHANGED_DURING_UPLOAD/);
});
test('provenance failure after all parts prevents completion upload', async () => {
  const seen = [];
  await assert.rejects(runTransfer(args('provenance-failed', { upload: mockUpload(seen),
    verifyProvenance: async () => { throw new Error('SOURCE_CHANGED'); } })), /SOURCE_CHANGED/);
  assert.equal(seen.length, 16); assert.equal(seen.some(x => x.name.endsWith('-complete')), false);
});
test('changed source after upload is caught by final full reread', async () => {
  const file = path.join(path.dirname(source.manifestPath), 'payload-a.bin');
  const handle = await fs.open(file, 'r+');
  const original = Buffer.alloc(1); await handle.read(original, 0, 1, 0);
  const seen = [], upload = mockUpload(seen);
  try {
    await assert.rejects(runTransfer(args('original-mutated', { upload: async request => {
      const result = await upload(request);
      if (seen.length === 16) await handle.write(Buffer.from([original[0] ^ 255]), 0, 1, 0);
      return result;
    } })), /SOURCE_CHANGED_AFTER_UPLOAD/);
    assert.equal(seen.length, 16);
  } finally { await handle.write(original, 0, 1, 0); await handle.close(); }
});
test('completion timeout is recorded unknown rather than falsely absent', async () => {
  const seen = [], mock = mockUpload(seen);
  await assert.rejects(runTransfer(args('completion-unknown', { upload: async request => {
    if (request.name.endsWith('-complete')) throw new Error('ARTIFACT_UPLOAD_DEADLINE'); return mock(request);
  } })), /ARTIFACT_UPLOAD_DEADLINE/);
  const result = JSON.parse(await fs.readFile(path.join(base, 'completion-unknown/incomplete.json')));
  assert.equal(result.completionManifestUploaded, 'UNKNOWN');
});
test('pre-existing output directory is never overwritten or deleted', async () => {
  const directory = path.join(base, 'existing'); await fs.mkdir(directory); await fs.writeFile(path.join(directory, 'sentinel'), 'keep');
  await assert.rejects(runTransfer(args('existing', { upload: async () => assert.fail('must not upload') })), /EEXIST/);
  assert.equal(await fs.readFile(path.join(directory, 'sentinel'), 'utf8'), 'keep');
});
test('disk refusal makes no upload and removes only newly owned stage', async () => {
  await assert.rejects(runTransfer(args('disk-refusal', { diskCheck: async () => { throw new Error('TRANSFER_DISK_LOW'); },
    upload: async () => assert.fail('must not upload') })), /TRANSFER_DISK_LOW/);
  await assert.rejects(fs.stat(path.join(base, 'disk-refusal/stage')));
});
test('malformed or oversized SDK receipts are rejected', () => {
  for (const receipt of [{ id: 0, size: 10, digest: 'a'.repeat(64) },
    { id: 1, size: 1001, digest: 'a'.repeat(64) }, { id: 1, size: 20, digest: 'bad' }])
    assert.throws(() => normalizeReceipt(receipt, 'part', 1000));
});
test('read loop obeys an expired deadline', async () => {
  await assert.rejects(hashFile(path.join(path.dirname(source.manifestPath), 'payload-a.bin'), 60 * MiB, 0), /TRANSFER_DEADLINE/);
});
test('pre-cancelled transfer has no upload and removes own stage', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runTransfer(args('cancelled', { signal: controller.signal, upload: async () => assert.fail('must not upload') })), /TRANSFER_CANCELLED/);
  await assert.rejects(fs.stat(path.join(base, 'cancelled/stage')));
});
test('upload child timeout waits for termination before rejection', async () => {
  const calls = [];
  const forkImpl = () => {
    const child = new EventEmitter(); child.send = () => {};
    child.kill = signal => { calls.push(signal); setImmediate(() => child.emit('close', null)); }; return child;
  };
  await assert.rejects(uploadWithChild({}, 5, { forkImpl }), /ARTIFACT_UPLOAD_DEADLINE/);
  assert.deepEqual(calls, ['SIGTERM']);
});
test('upload child cancellation terminates active SDK process', async () => {
  const controller = new AbortController(), calls = [];
  const forkImpl = () => {
    const child = new EventEmitter(); child.send = () => setImmediate(() => controller.abort());
    child.kill = signal => { calls.push(signal); setImmediate(() => child.emit('close', null)); }; return child;
  };
  await assert.rejects(uploadWithChild({}, 10000, { forkImpl, signal: controller.signal }), /TRANSFER_CANCELLED/);
  assert.deepEqual(calls, ['SIGTERM']);
});
