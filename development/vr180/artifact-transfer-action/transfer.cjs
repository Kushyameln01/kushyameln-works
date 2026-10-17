'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');

const MiB = 1024 * 1024;
const MAX_MANIFEST = 256 * 1024;
const MAX_PARTS = 200;
const BLOCK = MiB;
const REPOSITORY = 'Kushyameln01/kushyameln-works';
const SCHEMA = 'vr180-segmented-transfer-v1';
const PROFILES = Object.freeze({
  'service-8mib': Object.freeze({ partBytes: 8 * MiB, fileBytes: [60 * MiB, 60 * MiB], timeoutMs: 600000 }),
  'single-128mib': Object.freeze({ partBytes: 128 * MiB, fileBytes: [128 * MiB], timeoutMs: 300000 }),
});
function requireThat(value, code) { if (!value) throw new Error(code); }
function isHash(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value); }
function deadlineCheck(deadline, signal) {
  requireThat(!signal?.aborted, 'TRANSFER_CANCELLED');
  requireThat(performance.now() < deadline, 'TRANSFER_DEADLINE');
}
function validateIdentity(i) {
  requireThat(i && i.repository === REPOSITORY && /^[0-9a-f]{40}$/.test(i.commit), 'IDENTITY_REPOSITORY_COMMIT');
  requireThat(/^refs\/heads\/codex\/vr180-plan-[A-Za-z0-9._/-]+$/.test(i.ref), 'IDENTITY_BRANCH');
  requireThat(/^[1-9][0-9]{0,19}$/.test(i.runId), 'IDENTITY_RUN');
  requireThat(Number.isSafeInteger(i.runAttempt) && i.runAttempt >= 1 && i.runAttempt <= 50, 'IDENTITY_ATTEMPT');
  requireThat(typeof i.job === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(i.job), 'IDENTITY_JOB');
}
function sameIdentity(a, b) {
  validateIdentity(a); validateIdentity(b);
  for (const key of ['repository', 'commit', 'ref', 'runId', 'runAttempt', 'job']) requireThat(a[key] === b[key], 'IDENTITY_MISMATCH_' + key);
}
function prefix(identity, profile) { return `vr180-seg-${profile}-${identity.runId}-${identity.runAttempt}-${identity.job}`; }
function validateSourceManifest(m, identity) {
  requireThat(m && m.schema === 'vr180-segmented-source-v1' && m.status === 'GENERATED_AND_REREAD', 'SOURCE_SCHEMA_STATUS');
  sameIdentity(m.identity, identity);
  const p = Object.hasOwn(PROFILES, m.profile) ? PROFILES[m.profile] : null;
  requireThat(p, 'PROFILE_NOT_ENABLED');
  requireThat(m.partBytes === p.partBytes && p.partBytes <= 128 * MiB, 'PART_SIZE');
  requireThat(Array.isArray(m.files) && m.files.length === p.fileBytes.length, 'SOURCE_FILE_COUNT');
  let total = 0, parts = 0;
  m.files.forEach((f, index) => {
    const id = index === 0 ? 'payload-a' : 'payload-b';
    requireThat(f && f.id === id && f.name === id + '.bin', 'SOURCE_FILE_NAME');
    requireThat(f.bytes === p.fileBytes[index] && isHash(f.sha256), 'SOURCE_FILE_SIZE_HASH');
    total += f.bytes; parts += Math.ceil(f.bytes / p.partBytes);
  });
  requireThat(m.totalBytes === total && parts <= MAX_PARTS, 'SOURCE_TOTAL_PART_COUNT');
  requireThat(m.generator?.algorithm === 'SHAKE256(seed+NUL+fileId+NUL+decimal-byte-offset)-1MiB-blocks-v1'
    && m.generator.seed === 'vr180-public-segmented-transfer-2026-10-17'
    && m.generator.blockBytes === BLOCK, 'SOURCE_GENERATOR');
  return p;
}
async function readBoundedJson(file) {
  const st = await fs.lstat(file);
  requireThat(st.isFile() && !st.isSymbolicLink() && st.size > 0 && st.size <= MAX_MANIFEST, 'MANIFEST_FILE_BOUND');
  const data = await fs.readFile(file);
  requireThat(data.length === st.size, 'MANIFEST_CHANGED');
  return { data, value: JSON.parse(data.toString('utf8')) };
}
async function writeJson(file, data) {
  const bytes = Buffer.from(JSON.stringify(data, null, 2) + '\n');
  requireThat(bytes.length <= MAX_MANIFEST, 'RECORD_BOUND');
  const h = await fs.open(file, 'wx', 0o600);
  try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
  return { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
async function hashFile(file, expectedBytes, deadline, signal) {
  const h = await fs.open(file, 'r');
  try {
    const st = await h.stat();
    requireThat(st.isFile() && st.size === expectedBytes, 'SOURCE_SIZE_CHANGED');
    const buffer = Buffer.allocUnsafe(BLOCK), hash = crypto.createHash('sha256');
    let offset = 0;
    while (offset < expectedBytes) {
      deadlineCheck(deadline, signal);
      const { bytesRead } = await h.read(buffer, 0, Math.min(BLOCK, expectedBytes - offset), offset);
      requireThat(bytesRead > 0, 'SOURCE_SHORT_READ');
      hash.update(buffer.subarray(0, bytesRead)); offset += bytesRead;
    }
    const after = await h.stat();
    requireThat(after.size === st.size && after.mtimeMs === st.mtimeMs, 'SOURCE_STAT_CHANGED');
    return hash.digest('hex');
  } finally { await h.close(); }
}
async function safeFile(file, sourceRoot) {
  const st = await fs.lstat(file);
  requireThat(st.isFile() && !st.isSymbolicLink() && path.dirname(await fs.realpath(file)) === sourceRoot, 'SOURCE_NOT_OWN_REGULAR');
}
async function writePart(source, destination, offset, length, whole, deadline, signal) {
  const src = await fs.open(source, 'r'); let out;
  try {
    out = await fs.open(destination, 'wx', 0o600);
    const buffer = Buffer.allocUnsafe(BLOCK), hash = crypto.createHash('sha256');
    let cursor = 0;
    while (cursor < length) {
      deadlineCheck(deadline, signal);
      const { bytesRead } = await src.read(buffer, 0, Math.min(BLOCK, length - cursor), offset + cursor);
      requireThat(bytesRead > 0, 'PART_SHORT_READ');
      let written = 0;
      while (written < bytesRead) {
        deadlineCheck(deadline, signal);
        const { bytesWritten } = await out.write(buffer, written, bytesRead - written, cursor + written);
        requireThat(bytesWritten > 0, 'PART_SHORT_WRITE'); written += bytesWritten;
      }
      hash.update(buffer.subarray(0, bytesRead)); whole.update(buffer.subarray(0, bytesRead)); cursor += bytesRead;
    }
    await out.sync();
    return hash.digest('hex');
  } finally {
    const closed = await Promise.allSettled([src.close(), out?.close()]);
    const failure = closed.find(x => x.status === 'rejected');
    if (failure) throw failure.reason;
  }
}
function normalizeReceipt(r, name, maximumBytes) {
  requireThat(r && Number.isSafeInteger(r.id) && r.id > 0 && Number.isSafeInteger(r.size) && r.size > 0 && r.size <= maximumBytes, 'ARTIFACT_RECEIPT_SIZE_ID');
  const digest = typeof r.digest === 'string' ? r.digest.replace(/^sha256:/, '') : '';
  requireThat(isHash(digest), 'ARTIFACT_RECEIPT_DIGEST');
  return { id: r.id, name, sizeBytes: r.size, digest: 'sha256:' + digest };
}
async function diskPreflight(dir, partBytes) {
  const st = await fs.statfs(dir);
  const available = st.bavail * st.bsize;
  const required = 2 * partBytes + 2 * MiB + 256 * MiB;
  requireThat(Number.isSafeInteger(available) && available >= required, 'TRANSFER_DISK_LOW');
  return { freeBytes: available, requiredAdditionalFreeBytes: required, reservationGuaranteed: false,
    sourceFilesAlreadyExist: true, maximumLivePartFiles: 1, archiveMaterializedOnRunner: false };
}
// The official SDK has no public AbortSignal parameter. Isolate one upload in a
// child process: deadline kills its streams and network requests before cleanup.
function uploadWithChild(request, timeoutMs, { signal, forkImpl = fork } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('TRANSFER_CANCELLED')); return; }
    const child = forkImpl(path.join(__dirname, 'sdk-worker.cjs'), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { ...process.env, ACTIONS_ARTIFACT_UPLOAD_CONCURRENCY: '1', ACTIONS_ARTIFACT_UPLOAD_TIMEOUT_MS: '60000' },
    });
    let reply, timeout = false, cancelled = false, killTimer;
    const kill = () => {
      if (killTimer) return;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
    };
    const abort = () => { cancelled = true; kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timeout = true; kill(); }, timeoutMs);
    child.on('message', m => { if (m && m.type === 'result') reply = m.receipt; });
    child.on('error', () => { /* close owns settlement and resource cleanup */ });
    child.on('close', code => {
      clearTimeout(timer); clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      if (cancelled) reject(new Error('TRANSFER_CANCELLED'));
      else if (timeout) reject(new Error('ARTIFACT_UPLOAD_DEADLINE'));
      else if (code !== 0 || !reply) reject(new Error('ARTIFACT_UPLOAD_FAILED'));
      else resolve(reply);
    });
    child.send(request, error => { if (error) kill(); });
  });
}
async function runTransfer({ manifestPath, outputDirectory, identity, provenance, upload = uploadWithChild,
  signal, verifyProvenance = async () => {}, clock = () => performance.now(), diskCheck = diskPreflight }) {
  const started = clock();
  const { data, value: m } = await readBoundedJson(manifestPath);
  const profile = validateSourceManifest(m, identity);
  if (provenance?.generatorScriptSHA256) requireThat(m.sourceSHA256 === provenance.generatorScriptSHA256, 'GENERATOR_SOURCE_HASH_MISMATCH');
  const deadline = performance.now() + profile.timeoutMs;
  const sourceRoot = await fs.realpath(path.dirname(manifestPath));
  for (const file of m.files) await safeFile(path.join(sourceRoot, file.name), sourceRoot);
  await fs.mkdir(outputDirectory, { recursive: false, mode: 0o700 });
  const stage = path.join(outputDirectory, 'stage');
  await fs.mkdir(stage, { mode: 0o700 });
  const artifactPrefix = prefix(identity, m.profile);
  const receipt = { schema: SCHEMA, status: 'INCOMPLETE', identity, profile: m.profile,
    partBytes: profile.partBytes, totalBytes: m.totalBytes, partCount: 0,
    sourceManifestSHA256: crypto.createHash('sha256').update(data).digest('hex'),
    generator: m.generator, files: [], provenance, uploads: { concurrency: 1, compressionLevel: 0,
      retentionDays: 1, maxParts: MAX_PARTS, maxPartBytes: 128 * MiB, partDeadlineMs: 120000,
      totalDeadlineMs: profile.timeoutMs, boundedReadBufferBytes: BLOCK, sdkBufferBytes: 8 * MiB,
      sdkWholeProcessMemoryBoundedByThatBuffer: false },
    notVerified: ['browser/media processing', '5/10GB media capacity', 'OS save dialog', 'VR playback', 'immediate artifact deletion'],
  };
  let completed = false, completionUploadAttempted = false, completionUploaded = false;
  try {
    receipt.disk = await diskCheck(outputDirectory, profile.partBytes);
    const sources = [];
    for (const f of m.files) {
      const source = path.join(sourceRoot, f.name);
      requireThat(await hashFile(source, f.bytes, deadline, signal) === f.sha256, 'SOURCE_HASH_MISMATCH');
      sources.push(source);
    }
    for (let fi = 0; fi < m.files.length; fi++) {
      const f = m.files[fi], whole = crypto.createHash('sha256');
      const item = { ...f, partCount: 0, parts: [] }; receipt.files.push(item);
      for (let offset = 0, index = 0; offset < f.bytes; offset += profile.partBytes, index++) {
        deadlineCheck(deadline, signal);
        const length = Math.min(profile.partBytes, f.bytes - offset);
        const chunk = path.join(stage, 'chunk.bin');
        const partStart = clock();
        const sha256 = await writePart(sources[fi], chunk, offset, length, whole, deadline, signal);
        requireThat(await hashFile(chunk, length, deadline, signal) === sha256, 'PART_REREAD_HASH_MISMATCH');
        const name = `${artifactPrefix}-${f.id}-${String(index).padStart(5, '0')}`;
        const left = Math.floor(deadline - performance.now()); requireThat(left > 0, 'TRANSFER_DEADLINE');
        const response = await upload({ name, file: chunk, rootDirectory: stage }, Math.min(120000, left), { signal });
        const artifact = normalizeReceipt(response, name, length + 2 * MiB);
        // Reread after SDK completion too: do not attest a changed staged file.
        requireThat(await hashFile(chunk, length, deadline, signal) === sha256, 'PART_CHANGED_DURING_UPLOAD');
        const part = { index, offset, length, sha256, artifact, elapsedSeconds: (clock() - partStart) / 1000 };
        item.parts.push(part); item.partCount++; receipt.partCount++;
        requireThat(receipt.partCount <= MAX_PARTS, 'PART_COUNT_BOUND');
        await writeJson(path.join(outputDirectory, `receipt-${String(receipt.partCount).padStart(5, '0')}.json`), part);
        await fs.unlink(chunk);
      }
      requireThat(whole.digest('hex') === f.sha256, 'SOURCE_CHANGED_WHILE_SPLITTING');
    }
    for (let fi = 0; fi < m.files.length; fi++) requireThat(await hashFile(sources[fi], m.files[fi].bytes, deadline, signal) === m.files[fi].sha256, 'SOURCE_CHANGED_AFTER_UPLOAD');
    requireThat((await readBoundedJson(manifestPath)).data.equals(data), 'SOURCE_MANIFEST_CHANGED');
    await verifyProvenance();
    deadlineCheck(deadline, signal);
    receipt.status = 'COMPLETE'; receipt.elapsedSecondsBeforeCompletion = (clock() - started) / 1000;
    const completion = path.join(stage, 'completion.json');
    const record = await writeJson(completion, receipt);
    const name = artifactPrefix + '-complete';
    const left = Math.floor(deadline - performance.now()); requireThat(left > 0, 'TRANSFER_DEADLINE');
    completionUploadAttempted = true;
    const response = await upload({ name, file: completion, rootDirectory: stage }, Math.min(120000, left), { signal });
    const completionArtifact = normalizeReceipt(response, name, MAX_MANIFEST + 2 * MiB);
    completionUploaded = true;
    requireThat(await hashFile(completion, record.bytes, deadline, signal) === record.sha256, 'COMPLETION_CHANGED_DURING_UPLOAD');
    const finalReceipt = { schema: SCHEMA, status: 'COMPLETE_MANIFEST_UPLOADED', identity, profile: m.profile,
      completion: { ...record, artifact: completionArtifact },
      totalBytes: receipt.totalBytes, partCount: receipt.partCount, elapsedSeconds: (clock() - started) / 1000,
      fullHostRecovery: 'PENDING', independentHostValidation: 'PENDING' };
    await fs.copyFile(completion, path.join(outputDirectory, 'completion.json'), fs.constants.COPYFILE_EXCL);
    await writeJson(path.join(outputDirectory, 'upload-result.json'), finalReceipt);
    completed = true;
    return finalReceipt;
  } finally {
    let cleanupFailed = false;
    try { await fs.rm(stage, { recursive: true, force: true }); } catch { cleanupFailed = true; }
    await writeJson(path.join(outputDirectory, 'cleanup-result.json'), {
      schema: SCHEMA, identity, profile: m.profile, status: cleanupFailed ? 'FAILED' : 'STAGE_REMOVED',
      sourceFilesDeleted: false, stageRemoved: !cleanupFailed,
    });
    if (!completed) await writeJson(path.join(outputDirectory, 'incomplete.json'), {
      schema: SCHEMA, status: 'INCOMPLETE', identity, profile: m.profile,
      successfulPartUploads: receipt.partCount,
      completionManifestUploaded: completionUploaded ? true : completionUploadAttempted ? 'UNKNOWN' : false,
      sourceFilesDeleted: false, stageRemoved: !cleanupFailed, reason: 'TRANSFER_DID_NOT_COMPLETE',
    });
    requireThat(!cleanupFailed, 'OWN_STAGE_CLEANUP_FAILED');
  }
}
module.exports = { PROFILES, MAX_MANIFEST, MAX_PARTS, MiB, SCHEMA, validateIdentity,
  validateSourceManifest, normalizeReceipt, prefix, hashFile, writePart, runTransfer, uploadWithChild };
