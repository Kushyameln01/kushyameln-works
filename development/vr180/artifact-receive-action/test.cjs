'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const { fork, execFileSync } = require('node:child_process');
const { downloadRaw, validateExpected, MAX_ZIP, MAX_CHUNK, safeCode } = require('./raw.cjs');
const { downloadWithChild, removeOwned } = require('./main.cjs');
const { validateInputs } = require('./action.cjs');
const { readJson } = require('./checked.cjs');
let dir;
test.before(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vr180-raw-adapter-')); });
test.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function expectation(data) { return { id: 123, name: 'vr180-seg-service-8mib-12345-1-producer-payload-a-00000', sizeBytes: data.length, digest: 'sha256:' + hash(data) }; }
function mocks(data, changes = {}) {
  const expected = expectation(data), calls = [];
  const a = { databaseId: '123', name: expected.name, size: String(data.length), digest: { value: expected.digest },
    workflowRunBackendId: 'same-run', workflowJobRunBackendId: 'different-producer-job' };
  const stream = Readable.from(changes.chunks || [data]);
  stream.statusCode = changes.status ?? 200;
  stream.headers = changes.headers ?? { 'content-length': String(data.length) };
  const sdk = {
    getBackendIdsFromToken: () => ({ workflowRunBackendId: 'same-run', workflowJobRunBackendId: 'receiver-job' }),
    Int64Value: { create: x => x },
    internalArtifactTwirpClient: () => ({
      ListArtifacts: async req => { calls.push({ operation: 'list', req }); return { artifacts: changes.artifacts ?? [a] }; },
      GetSignedArtifactURL: async req => { calls.push({ operation: 'sign', req }); return { signedUrl: changes.url ?? 'https://example.invalid/blob?secret=never-log' }; },
    }),
    createHttpClient: () => ({ get: async () => { calls.push({ operation: 'http' }); return { message: stream }; }, dispose: () => calls.push({ operation: 'dispose' }) }),
  };
  return { expected, sdk, calls, a, stream };
}
async function run(name, data, changes = {}, writerChange = writer => writer) {
  const m = mocks(data, changes), file = path.join(dir, name), h = await fs.open(file, 'wx');
  try {
    const result = await downloadRaw({ ...m, writer: writerChange(h), deadline: performance.now() + 10000 });
    return { ...m, result, bytes: await fs.readFile(file) };
  } finally { await h.close(); m.stream.destroy(); }
}
test('same-run internal sequence accepts a distinct producer job and preserves all raw bytes', async () => {
  const data = Buffer.alloc(128 * 1024 + 17, 7);
  const r = await run('valid', data, { chunks: [data.subarray(0, 65536), data.subarray(65536)] });
  assert.deepEqual(r.bytes, data); assert.equal(r.result.status, 'RAW_ZIP_VERIFIED');
  assert.equal(r.result.metadata.restWorkflowRunVerified, false); assert.equal(r.result.zipStructureVerified, false);
  assert.deepEqual(r.calls[0], { operation: 'list', req: { workflowRunBackendId: 'same-run', workflowJobRunBackendId: 'receiver-job', idFilter: { value: '123' } } });
  assert.deepEqual(r.calls[1].req, { workflowRunBackendId: 'same-run', workflowJobRunBackendId: 'different-producer-job', name: r.expected.name });
  assert.equal(JSON.stringify(r.result).includes('never-log'), false);
});
test('zero or multiple ListArtifacts matches are refused before signing', async () => {
  for (const [i, artifacts] of [[], [{}, {}]].entries()) {
    const m = mocks(Buffer.alloc(30), { artifacts }), h = await fs.open(path.join(dir, 'multiple-' + i), 'wx');
    try { await assert.rejects(downloadRaw({ ...m, writer: h, deadline: performance.now() + 1000 }), /ARTIFACT_NOT_UNIQUE/); }
    finally { await h.close(); m.stream.destroy(); }
    assert.equal(m.calls.length, 1);
  }
});
test('id name size digest and backend-run differences cannot reach signed download', async () => {
  const data = Buffer.alloc(30), original = mocks(data).a;
  for (const [i, change] of [a => a.databaseId = '124', a => a.databaseId = 123, a => a.name += '-other',
    a => a.size = '31', a => a.digest = undefined, a => a.digest.value = 'sha256:' + '0'.repeat(64),
    a => a.workflowRunBackendId = 'other-run', a => a.workflowJobRunBackendId = ''].entries()) {
    const a = structuredClone(original); change(a);
    await assert.rejects(run('metadata-' + i, data, { artifacts: [a] }), /ARTIFACT_METADATA_MISMATCH|ARTIFACT_RUN_MISMATCH/);
  }
});
test('short writes are retried at the exact explicit file offset', async () => {
  const data = Buffer.alloc(100, 5);
  const r = await run('short-writes', data, {}, h => ({ write: (b, o, n, pos) => h.write(b, o, Math.min(n, 7), pos), sync: () => h.sync(), stat: () => h.stat() }));
  assert.deepEqual(r.bytes, data);
});
test('zero-progress writes fail instead of looping', async () => {
  await assert.rejects(run('zero-write', Buffer.alloc(30), {}, h => ({ write: async () => ({ bytesWritten: 0 }), sync: () => h.sync(), stat: () => h.stat() })), /ZIP_SHORT_WRITE/);
});
test('HTTP status length and encoding are strict, with no automatic extraction', async () => {
  for (const [i, change] of [{ status: 302 }, { headers: { 'content-length': '31' } },
    { headers: { 'content-encoding': 'gzip' } }].entries())
    await assert.rejects(run('http-' + i, Buffer.alloc(30), change), /HTTP_STATUS|HTTP_LENGTH|HTTP_ENCODING/);
});
test('truncated oversized wrong-hash and oversized-chunk responses fail', async () => {
  const data = Buffer.alloc(30);
  await assert.rejects(run('truncated', data, { chunks: [Buffer.alloc(29)] }), /ZIP_TRUNCATED/);
  await assert.rejects(run('overrun', data, { chunks: [Buffer.alloc(31)] }), /ZIP_SIZE_LIMIT/);
  await assert.rejects(run('digest', data, { chunks: [Buffer.alloc(30, 1)] }), /ZIP_HASH_MISMATCH/);
  await assert.rejects(run('chunk', Buffer.alloc(MAX_CHUNK + 1)), /ZIP_CHUNK_LIMIT/);
});
test('signed URL must be HTTPS without credentials and is never returned', async () => {
  for (const [i, url] of ['http://example.invalid/', 'https://name:secret@example.invalid/', 'not a URL'].entries())
    await assert.rejects(run('url-' + i, Buffer.alloc(30), { url }), /SIGNED_URL_INVALID/);
});
test('expired or cancelled call does not invoke SDK metadata', async () => {
  const controller = new AbortController(); controller.abort();
  for (const options of [{ deadline: 0 }, { deadline: performance.now() + 1000, signal: controller.signal }]) {
    const m = mocks(Buffer.alloc(30));
    await assert.rejects(downloadRaw({ ...m, writer: {}, ...options }), /DOWNLOAD_DEADLINE|DOWNLOAD_CANCELLED/);
    assert.equal(m.calls.length, 0); m.stream.destroy();
  }
});
test('idle stream is destroyed and rejects with a safe fixed code', async () => {
  const m = mocks(Buffer.alloc(30)); const stream = new Readable({ read() {} }); stream.statusCode = 200; stream.headers = {};
  m.sdk.createHttpClient = () => ({ get: async () => ({ message: stream }), dispose() {} });
  await assert.rejects(downloadRaw({ ...m, writer: {}, deadline: performance.now() + 1000, idleMs: 10 }), /DOWNLOAD_IDLE/);
  assert.equal(stream.destroyed, true); m.stream.destroy();
});
test('request size cap includes bounded ZIP overhead and safe errors suppress arbitrary SDK text', () => {
  const expected = expectation(Buffer.alloc(30));
  validateExpected({ ...expected, sizeBytes: MAX_ZIP });
  for (const change of [e => e.id = 0, e => e.sizeBytes = MAX_ZIP + 1, e => e.sizeBytes = 1.5,
    e => e.digest = 'a'.repeat(64), e => e.name = '../zip']) {
    const e = { ...expected }; change(e); assert.throws(() => validateExpected(e), /REQUEST_INVALID/);
  }
  assert.equal(safeCode(new Error('https://secret.invalid/?token=SECRET')), 'DOWNLOAD_FAILED');
});
test('parent reserves destination, waits real child close, fsyncs and rereads full bytes', async () => {
  const data = Buffer.alloc(2048, 7), expected = expectation(data), output = path.join(dir, 'parent-good.zip');
  const receipt = await downloadWithChild({ expected, output,
    forkImpl: (_script, args, options) => fork(path.join(__dirname, 'test-child.cjs'), args, options) });
  assert.deepEqual(await fs.readFile(output), data);
  assert.equal(receipt.parentDescriptorClosed, true); assert.equal(receipt.childDescriptorClosed, true);
  assert.equal(receipt.closedFileRereadSHA256, hash(data));
});
test('timeout waits for child exit before removing the exclusively owned file', async () => {
  const output = path.join(dir, 'timeout.zip'), events = [];
  const forkImpl = () => {
    const child = new EventEmitter(); child.send = () => {};
    child.kill = signal => { events.push(signal); setTimeout(() => { events.push('closed'); child.emit('close', null); }, 5); };
    return child;
  };
  await assert.rejects(downloadWithChild({ expected: expectation(Buffer.alloc(30)), output, timeoutMs: 10, forkImpl }), /DOWNLOAD_DEADLINE/);
  assert.deepEqual(events, ['SIGTERM', 'closed']); await assert.rejects(fs.stat(output), /ENOENT/);
});
test('cancelled or failed child cleans owned output; existing output is never replaced', async () => {
  const controller = new AbortController(); controller.abort();
  const expected = expectation(Buffer.alloc(30)), output = path.join(dir, 'cancel.zip');
  await assert.rejects(downloadWithChild({ expected, output, signal: controller.signal }), /DOWNLOAD_CANCELLED/);
  await assert.rejects(fs.stat(output), /ENOENT/);
  await fs.writeFile(output, 'keep');
  await assert.rejects(downloadWithChild({ expected, output }), /EEXIST/);
  assert.equal(await fs.readFile(output, 'utf8'), 'keep');
});
test('cleanup refuses a path replaced with another inode', async () => {
  const file = path.join(dir, 'changed.zip'); await fs.writeFile(file, 'original'); const owned = await fs.stat(file);
  await fs.rename(file, file + '.original'); await fs.writeFile(file, 'foreign');
  await assert.rejects(removeOwned(file, owned), /OUTPUT_CLEANUP_FAILED/);
  assert.equal(await fs.readFile(file, 'utf8'), 'foreign');
});
test('bounded CLI JSON and action inputs reject symlinks oversized files and long-profile activation', async () => {
  const file = path.join(dir, 'request.json'); await fs.writeFile(file, '{"expected":{}}');
  assert.deepEqual(await readJson(file), { expected: {} });
  await fs.symlink(file, file + '.link'); await assert.rejects(readJson(file + '.link'), /REQUEST_FILE_BOUND/);
  await fs.writeFile(file + '.large', Buffer.alloc(16385)); await assert.rejects(readJson(file + '.large'), /REQUEST_FILE_BOUND/);
  assert.equal(validateInputs({ 'INPUT_RECEIPT-JSON': '{}', INPUT_PROFILE: 'service-8mib' }).profile, 'service-8mib');
  assert.throws(() => validateInputs({ 'INPUT_RECEIPT-JSON': '{}', INPUT_PROFILE: 'p5-5gb' }), /ACTION_INPUT_INVALID/);
});
test('real installed fixed SDK exposes the internal calls without invoking a service', () => {
  const sdk = require('./sdk-worker.cjs').installedSdk();
  assert.equal(typeof sdk.internalArtifactTwirpClient, 'function');
  assert.equal(typeof sdk.getBackendIdsFromToken, 'function');
  assert.deepEqual(sdk.Int64Value.create({ value: '123' }), { value: '123' });
});
test('recorded hashes and reconstruction patch reproduce the exact raw adapter', async () => {
  const provenance = JSON.parse(await fs.readFile(path.join(__dirname, 'provenance.json')));
  const sdkRoot = path.resolve(__dirname, '../artifact-transfer-action/node_modules/@actions/artifact');
  for (const [file, digest] of Object.entries(provenance.installedSourceSHA256))
    assert.equal(hash(await fs.readFile(path.join(sdkRoot, file))), digest);
  const raw = await fs.readFile(path.join(__dirname, 'raw.cjs'));
  const patch = path.join(__dirname, 'sdk-download.patch');
  assert.equal(hash(raw), provenance.adaptation.targetSHA256);
  assert.equal(hash(await fs.readFile(patch)), provenance.adaptation.patchSHA256);
  const reconstructed = path.join(dir, 'reconstructed.cjs');
  execFileSync('patch', ['--batch', '--silent', '-o', reconstructed,
    path.join(sdkRoot, provenance.adaptation.source), patch], { timeout: 5000, maxBuffer: 4096 });
  assert.ok((await fs.readFile(reconstructed)).equals(raw));
});
