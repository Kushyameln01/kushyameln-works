'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const { PROFILES, MiB, MAX_QUALITY, validateSourceManifest, validateQualityEvidence, readBoundedJson,
  normalizeReceipt, prefix, hashFile, runTransfer, uploadWithChild } = require('./transfer.cjs');
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

test('profiles reject unknown profiles and identity/name/size/hash mismatches', () => {
  assert.equal(validateSourceManifest(manifest, identity).partBytes, 8 * MiB);
  for (const change of [m => m.profile = 'unimplemented', m => m.files[0].name = '../source.bin',
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

// These are deliberately tiny arbitrary bytes, not valid or qualified media.
// The transport must recover complete media FAIL evidence as well as PASS.
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function makeLongFixture(name, profile = 'p5-5gb', verdict = 'FAIL') {
  const directory = path.join(base, name); await fs.mkdir(directory);
  const files = [];
  for (const [i, id] of ['input', 'output'].entries()) {
    const bytes = Buffer.alloc(1024 + i, 40 + i);
    await fs.writeFile(path.join(directory, id + '.mp4'), bytes);
    files.push({ id, name: id + '.mp4', bytes: bytes.length, sha256: sha(bytes) });
  }
  const sourceSHA256 = 'c'.repeat(64);
  const quality = { schema: 'vr180-p5-long-quality-evidence-v1', identity, profile, files,
    sourceSHA256, mediaVerdict: verdict, completeScan: true,
    evidence: [{ path: 'quality-report.json', bytes: 100, sha256: 'd'.repeat(64) }] };
  const qualityData = Buffer.from(JSON.stringify(quality));
  const value = { schema: 'vr180-segmented-source-v1', status: 'GENERATED_AND_REREAD', identity,
    profile, partBytes: 128 * MiB, totalBytes: files.reduce((n, f) => n + f.bytes, 0), files, sourceSHA256,
    generator: { algorithm: 'vr180-long-xorshift32-sbs180-webcodecs-v1', seed: 0x1802026,
      width: 1024, height: 512, fps: 30, silent: true, inputRequestedBitrate: 32000000,
      outputRequestedBitrate: 32000000, eventPeriodFrames: 300, eventFrameOffsets: [29, 30, 31],
      maxFrames: 100000, targetPayloadBytes: PROFILES[profile].targetPayloadBytes, frames: 1 },
    qualityEvidence: { name: 'quality-evidence.json', bytes: qualityData.length,
      sha256: sha(qualityData), status: verdict, completeScan: true } };
  const manifestPath = path.join(directory, 'source-manifest.json');
  const qualityPath = path.join(directory, 'quality-evidence.json');
  await fs.writeFile(manifestPath, JSON.stringify(value)); await fs.writeFile(qualityPath, qualityData);
  return { value, quality, qualityPath, manifestPath,
    provenance: { unitTest: true, generatorScriptPath: PROFILES[profile].producer, generatorScriptSHA256: sourceSHA256 } };
}
test('long profiles have explicit size caps, immutable part size, deadlines and fixed producer path', async () => {
  for (const name of ['p5-5gb', 'p5-10gb']) {
    const f = await makeLongFixture('caps-' + name, name), p = validateSourceManifest(f.value, identity);
    assert.equal(p.partBytes, 128 * MiB);
    assert.equal(p.timeoutMs, name === 'p5-5gb' ? 1200000 : 1800000);
    assert.equal(p.producer, 'development/vr180/p5-long-prototype/probe-long.py');
    const cap = structuredClone(f.value);
    cap.files.forEach((file, i) => { file.bytes = p.fileCaps[i]; });
    cap.totalBytes = cap.files.reduce((n, file) => n + file.bytes, 0);
    assert.equal(validateSourceManifest(cap, identity), p);
    for (const change of [m => m.files[0].bytes = 0, m => m.files[0].bytes = p.fileCaps[0] + 1,
      m => m.files[1].bytes = p.fileCaps[1] + 1, m => m.files[0].bytes = 1.5,
      m => m.files[0].id = 'output', m => m.files[0].name = '../input.mp4', m => m.partBytes = 8 * MiB]) {
      const copy = structuredClone(f.value); change(copy); assert.throws(() => validateSourceManifest(copy, identity));
    }
    f.value.producer = '/tmp/attacker.py';
    assert.equal(validateSourceManifest(f.value, identity).producer, p.producer);
  }
});
test('long generator descriptors reject silent, sample, geometry and requested bitrate changes', async () => {
  const f = await makeLongFixture('generator-long');
  for (const change of [g => g.frames = 0, g => g.frames = 100001, g => g.frames = 1.5,
    g => g.fps = 60, g => g.silent = false, g => g.width = 2048, g => g.maxFrames++,
    g => g.inputRequestedBitrate++, g => g.outputRequestedBitrate--, g => g.targetPayloadBytes++,
    g => g.eventFrameOffsets = [29, 30], g => g.eventFrameOffsets = [29, 30, 32],
    g => g.eventPeriodFrames++, g => g.algorithm = 'other', g => g.seed++]) {
    const m = structuredClone(f.value); change(m.generator);
    assert.throws(() => validateSourceManifest(m, identity), /SOURCE_LONG_GENERATOR/);
  }
});
test('quality descriptors and bounded correspondence reject incomplete or unrelated evidence', async () => {
  const f = await makeLongFixture('quality-contract');
  validateQualityEvidence(f.quality, f.value);
  for (const change of [q => q.bytes = MAX_QUALITY + 1, q => q.bytes = 0, q => q.sha256 = 'bad',
    q => q.completeScan = false, q => q.status = 'UNKNOWN', q => q.name = '../quality-evidence.json']) {
    const m = structuredClone(f.value); change(m.qualityEvidence);
    assert.throws(() => validateSourceManifest(m, identity), /QUALITY_DESCRIPTOR/);
  }
  for (const change of [q => q.schema = 'other', q => q.profile = 'p5-10gb',
    q => q.identity.runAttempt++, q => q.sourceSHA256 = 'a'.repeat(64), q => q.mediaVerdict = 'PASS',
    q => q.completeScan = false, q => q.files[0].sha256 = 'b'.repeat(64),
    q => q.files.reverse(), q => q.files.pop(), q => q.evidence = [],
    q => q.evidence = Array(257).fill(q.evidence[0]), q => q.evidence.push(q.evidence[0]),
    q => q.evidence[0].path = '../quality.json', q => q.evidence[0].path = '/tmp/quality.json',
    q => q.evidence[0].path = 'dir\\quality.json', q => q.evidence[0].bytes = 0]) {
    const q = structuredClone(f.quality); change(q); assert.throws(() => validateQualityEvidence(q, f.value));
  }
});
test('complete FAIL evidence is recoverable and binds exact quality bytes without claiming media PASS', async () => {
  const f = await makeLongFixture('failed-media'), seen = [];
  const result = await runTransfer(args('failed-media-transfer', { ...f, upload: mockUpload(seen) }));
  assert.equal(result.status, 'COMPLETE_MANIFEST_UPLOADED'); assert.equal(result.partCount, 2);
  assert.deepEqual(seen.at(-1).completion.qualityEvidence, f.value.qualityEvidence);
  assert.equal(seen.at(-1).completion.qualityEvidence.status, 'FAIL');
  assert.equal(result.fullHostRecovery, 'PENDING');
  assert.equal(seen[0].name, prefix(identity, 'p5-5gb') + '-input-00000');
  assert.equal(seen[1].name, prefix(identity, 'p5-5gb') + '-output-00000');
  assert.equal(await fs.readFile(f.qualityPath, 'utf8'), JSON.stringify(f.quality));
});
test('10GB transport profile accepts complete PASS evidence but still awaits host recovery', async () => {
  const f = await makeLongFixture('pass-media', 'p5-10gb', 'PASS'), seen = [];
  const result = await runTransfer(args('pass-media-transfer', { ...f, upload: mockUpload(seen) }));
  assert.equal(seen.at(-1).completion.qualityEvidence.status, 'PASS');
  assert.equal(seen.at(-1).completion.uploads.totalDeadlineMs, 1800000);
  assert.equal(result.independentHostValidation, 'PENDING');
});
test('long transfer rejects missing, wrong-path or wrong-hash producer provenance before upload', async () => {
  const f = await makeLongFixture('bad-producer');
  for (const [i, provenance] of [{}, { ...f.provenance, generatorScriptPath: '/tmp/probe-long.py' },
    { ...f.provenance, generatorScriptSHA256: 'b'.repeat(64) }].entries()) {
    await assert.rejects(runTransfer(args('producer-' + i, { ...f, provenance,
      upload: async () => assert.fail('must not upload') })), /PRODUCER_PROVENANCE|SOURCE_HASH_MISMATCH/);
  }
});
test('changed quality bytes are rejected before any upload', async () => {
  const f = await makeLongFixture('bad-quality-bytes');
  await fs.appendFile(f.qualityPath, ' ');
  await assert.rejects(runTransfer(args('bad-quality-transfer', { ...f,
    upload: async () => assert.fail('must not upload') })), /QUALITY_RAW_HASH_SIZE/);
});
test('quality changed after data upload prevents a completion artifact', async () => {
  const f = await makeLongFixture('quality-mutation'), seen = [], upload = mockUpload(seen);
  await assert.rejects(runTransfer(args('quality-mutation-transfer', { ...f, upload: async request => {
    const receipt = await upload(request);
    if (seen.length === 2) await fs.appendFile(f.qualityPath, ' ');
    return receipt;
  } })), /QUALITY_CHANGED_DURING_TRANSFER/);
  assert.equal(seen.length, 2); assert.equal(seen.some(x => x.name.endsWith('-complete')), false);
});
test('bounded metadata read rejects oversized and symbolic-link quality files', async () => {
  const file = path.join(base, 'oversized.json'), link = path.join(base, 'linked.json');
  await fs.writeFile(file, Buffer.alloc(MAX_QUALITY + 1));
  await assert.rejects(readBoundedJson(file, MAX_QUALITY), /MANIFEST_FILE_BOUND/);
  await fs.symlink(source.manifestPath, link);
  await assert.rejects(readBoundedJson(link, MAX_QUALITY), /MANIFEST_FILE_BOUND/);
});
test('actual long producer manifest bytes pass sender correspondence with a complete FAIL fixture', async () => {
  const root = path.resolve(__dirname, '../../..');
  const directory = path.join(base, 'actual-producer-contract');
  const media = path.join(directory, 'media'), meta = path.join(directory, 'evidence');
  await fs.mkdir(media, { recursive: true }); await fs.mkdir(meta);
  const files = [];
  for (const id of ['input', 'output']) {
    const bytes = Buffer.from('contract fixture only: ' + id);
    await fs.writeFile(path.join(media, id + '.mp4'), bytes);
    files.push({ id, name: id + '.mp4', bytes: bytes.length, sha256: sha(bytes) });
  }
  const script = `import hashlib, importlib.util, json, pathlib, sys
root,meta,media=map(pathlib.Path,sys.argv[1:4])
producer=root/'development/vr180/p5-long-prototype/probe-long.py'
spec=importlib.util.spec_from_file_location('sender_contract_producer',producer)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
for name in ['browser-observations.json','browser-lifecycle.json','runner-transfer.json','private-source-inventory.json','fork-build-result.json','oracle-toolchain.json','independent-verification.json','packet-statistics.json','source-provenance.json']:
 (meta/name).write_text('{"contractFixtureOnly":true}')
module.write_transport_manifests(meta,media,json.loads(sys.argv[4]),'p5-5gb',json.loads(sys.argv[5]),1,
 {'mediaVerdict':'FAIL','completeScan':True},hashlib.sha256(producer.read_bytes()).hexdigest())
`;
  execFileSync('python', ['-c', script, root, meta, media, JSON.stringify(identity), JSON.stringify(files)],
    { timeout: 10000, maxBuffer: 64 * 1024 });
  const manifestPath = path.join(media, 'source-manifest.json');
  const m = (await readBoundedJson(manifestPath)).value;
  const q = await readBoundedJson(path.join(media, 'quality-evidence.json'), MAX_QUALITY);
  validateSourceManifest(m, identity); validateQualityEvidence(q.value, m);
  assert.ok(q.data.equals(await fs.readFile(path.join(meta, 'quality-evidence.json'))));
  const seen = [];
  await runTransfer(args('actual-producer-transfer', { manifestPath,
    provenance: { generatorScriptPath: PROFILES[m.profile].producer, generatorScriptSHA256: m.sourceSHA256 },
    upload: mockUpload(seen) }));
  assert.equal(seen.length, 3);
  assert.deepEqual(seen.at(-1).completion.qualityEvidence, m.qualityEvidence);
  assert.equal(seen.at(-1).completion.qualityEvidence.status, 'FAIL');
});

async function makeCalibrationFixture(name) {
  const f = await makeLongFixture(name), p = PROFILES['p5-receiver-calibration32'];
  f.identity = { ...identity, job: 'p5-receiver-calibration' };
  f.value.profile = f.quality.profile = 'p5-receiver-calibration32';
  f.value.identity = f.quality.identity = f.identity;
  f.value.generator = { algorithm: 'vr180-fixed300-sbs180-webcodecs-calibration-v1', seed: 0x1802026,
    width: 1024, height: 512, fps: 30, frames: 300, silent: true,
    inputRequestedBitrate: 32000000, outputRequestedBitrate: 32000000, eventFrameIndices: [29, 30, 31],
    producerPath: p.originalProducer, producerSHA256: 'e'.repeat(64),
    producerReportRunId: `${f.identity.runId}-p5-32-32-${f.identity.runAttempt}` };
  f.provenance.generatorScriptPath = p.producer;
  f.provenance.sourceHashes = { [p.originalProducer]: f.value.generator.producerSHA256 };
  // Deliberately opaque bytes: tar structure is the independent receiver's job.
  const bundle = Buffer.from('opaque producer evidence bundle contract fixture\n');
  f.bundlePath = path.join(path.dirname(f.manifestPath), 'producer-evidence.tar.gz');
  await fs.writeFile(f.bundlePath, bundle);
  f.value.evidenceBundle = { name: 'producer-evidence.tar.gz', bytes: bundle.length, sha256: sha(bundle) };
  const quality = Buffer.from(JSON.stringify(f.quality));
  f.value.qualityEvidence.bytes = quality.length; f.value.qualityEvidence.sha256 = sha(quality);
  await fs.writeFile(f.qualityPath, quality); await fs.writeFile(f.manifestPath, JSON.stringify(f.value));
  return f;
}
test('calibration profile fixes pair/file caps, producer job and exact 300-frame descriptor', async () => {
  const f = await makeCalibrationFixture('calibration-caps');
  assert.equal(validateSourceManifest(f.value, f.identity).timeoutMs, 600000);
  for (const change of [m => m.files[0].bytes = 80 * MiB + 1,
    m => { m.files[0].bytes = 80 * MiB; m.files[1].bytes = 80 * MiB; m.totalBytes = 160 * MiB; },
    m => m.generator.frames = 299, m => m.generator.fps = 60, m => m.generator.silent = false,
    m => m.generator.inputRequestedBitrate++, m => m.generator.outputRequestedBitrate--,
    m => m.generator.producerPath = '/tmp/fake.py', m => m.generator.producerSHA256 = 'bad',
    m => m.generator.producerReportRunId = 'previous-run', m => m.generator.eventFrameIndices = [29, 30],
    m => delete m.evidenceBundle, m => m.evidenceBundle.bytes = 8 * MiB + 1,
    m => m.evidenceBundle.name = '../bundle.tar.gz', m => m.evidenceBundle.sha256 = 'bad']) {
    const m = structuredClone(f.value); change(m); assert.throws(() => validateSourceManifest(m, f.identity));
  }
  const m = structuredClone(f.value); m.identity.job = 'other-producer';
  assert.throws(() => validateSourceManifest(m, m.identity), /SOURCE_PRODUCER_JOB/);
});
test('calibration uploads two media artifacts, one opaque evidence artifact, then completion', async () => {
  const f = await makeCalibrationFixture('calibration-success'), seen = [];
  const result = await runTransfer(args('calibration-upload', { ...f, upload: mockUpload(seen) }));
  assert.equal(seen.length, 4); assert.equal(result.partCount, 2);
  assert.equal(result.totalBytes, f.value.totalBytes); assert.equal(result.metadataArtifactCount, 1); assert.equal(result.artifactCount, 4);
  assert.equal(path.basename(seen[2].file), 'evidence.bin'); assert.equal(seen[2].name, prefix(f.identity, f.value.profile) + '-evidence');
  const completion = seen[3].completion;
  assert.equal(completion.partCount, 2); assert.equal(completion.files.length, 2); assert.equal(completion.metadataArtifactCount, 1);
  assert.deepEqual({ ...completion.evidenceBundle, artifact: undefined }, { ...f.value.evidenceBundle, artifact: undefined });
  assert.equal(completion.evidenceBundle.artifact.name, seen[2].name);
  assert.equal(completion.qualityEvidence.status, 'FAIL');
  await fs.stat(f.bundlePath); await assert.rejects(fs.stat(path.join(base, 'calibration-upload/stage')), /ENOENT/);
});
test('original generator hash must match separately attested source, not wrapper sourceSHA', async () => {
  const f = await makeCalibrationFixture('calibration-producer-hash');
  f.provenance.sourceHashes[PROFILES[f.value.profile].originalProducer] = f.value.sourceSHA256;
  await assert.rejects(runTransfer(args('calibration-hash-refusal', { ...f,
    upload: async () => assert.fail('must not upload') })), /ORIGINAL_PRODUCER_HASH_MISMATCH/);
});
test('missing or changed source bundle fails before media uploads', async () => {
  for (const missing of [false, true]) {
    const f = await makeCalibrationFixture('bundle-preflight-' + missing);
    if (missing) await fs.unlink(f.bundlePath); else {
      const bytes = await fs.readFile(f.bundlePath); bytes[0] ^= 255; await fs.writeFile(f.bundlePath, bytes);
    }
    await assert.rejects(runTransfer(args('bundle-preflight-output-' + missing, { ...f,
      upload: async () => assert.fail('must not upload') })), /EVIDENCE_BUNDLE_SOURCE_HASH|ENOENT/);
  }
});
test('staged bundle mutation prevents completion and records the observed upload', async () => {
  const f = await makeCalibrationFixture('bundle-staged-mutation'), seen = [], upload = mockUpload(seen);
  await assert.rejects(runTransfer(args('bundle-staged-output', { ...f, upload: async request => {
    const receipt = await upload(request);
    if (request.name.endsWith('-evidence')) {
      const data = await fs.readFile(request.file); data[0] ^= 255; await fs.writeFile(request.file, data);
    }
    return receipt;
  } })), /EVIDENCE_BUNDLE_CHANGED_DURING_UPLOAD/);
  assert.equal(seen.length, 3);
  const failure = JSON.parse(await fs.readFile(path.join(base, 'bundle-staged-output/incomplete.json')));
  assert.equal(failure.evidenceBundleArtifactUploaded, true); assert.equal(failure.completionManifestUploaded, false);
});
test('original bundle and quality mutations during evidence upload are detected before completion', async () => {
  for (const which of ['bundle', 'quality']) {
    const f = await makeCalibrationFixture('late-evidence-' + which), seen = [], upload = mockUpload(seen);
    await assert.rejects(runTransfer(args('late-evidence-output-' + which, { ...f, upload: async request => {
      const receipt = await upload(request);
      if (request.name.endsWith('-evidence')) {
        const file = which === 'bundle' ? f.bundlePath : f.qualityPath;
        const data = await fs.readFile(file); data[0] ^= 1; await fs.writeFile(file, data);
      }
      return receipt;
    } })), /EVIDENCE_BUNDLE_CHANGED_AFTER_UPLOAD|Unexpected token|JSON|QUALITY_CHANGED/);
    assert.equal(seen.length, 3);
  }
});
test('evidence timeout records unknown presence and never emits completion', async () => {
  const f = await makeCalibrationFixture('evidence-timeout'), seen = [], upload = mockUpload(seen);
  await assert.rejects(runTransfer(args('evidence-timeout-output', { ...f, upload: async request => {
    if (request.name.endsWith('-evidence')) throw Error('ARTIFACT_UPLOAD_DEADLINE'); return upload(request);
  } })), /ARTIFACT_UPLOAD_DEADLINE/);
  const failure = JSON.parse(await fs.readFile(path.join(base, 'evidence-timeout-output/incomplete.json')));
  assert.equal(seen.length, 2); assert.equal(failure.successfulPartUploads, 2);
  assert.equal(failure.evidenceBundleArtifactUploaded, 'UNKNOWN'); assert.equal(failure.completionManifestUploaded, false);
});
test('calibration preserves zero-byte stderr evidence references without relaxing long profile rules', async () => {
  const f = await makeCalibrationFixture('empty-calibration-ref');
  f.quality.evidence.push({ path: 'oracle-logs/ffmpeg.stderr.log', bytes: 0, sha256: sha(Buffer.alloc(0)) });
  validateQualityEvidence(f.quality, f.value);
  f.quality.evidence.at(-1).bytes = -1;
  assert.throws(() => validateQualityEvidence(f.quality, f.value), /QUALITY_EVIDENCE_ENTRY/);
  const long = await makeLongFixture('empty-long-ref');
  long.quality.evidence[0].bytes = 0;
  assert.throws(() => validateQualityEvidence(long.quality, long.value), /QUALITY_EVIDENCE_ENTRY/);
});
