'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const { validateExpected, safeCode } = require('./raw.cjs');
const { need, readJson, checkedEnvironment } = require('./checked.cjs');
async function reread(file, expected, deadline) {
  const h = await fs.open(file, 'r');
  try {
    need((await h.stat()).size === expected.sizeBytes, 'OUTPUT_CHANGED');
    let bytes = 0; const buffer = Buffer.allocUnsafe(1024 * 1024), sha = crypto.createHash('sha256');
    while (bytes < expected.sizeBytes) {
      need(performance.now() < deadline, 'DOWNLOAD_DEADLINE');
      const result = await h.read(buffer, 0, Math.min(buffer.length, expected.sizeBytes - bytes), bytes);
      need(result.bytesRead > 0, 'ZIP_TRUNCATED'); sha.update(buffer.subarray(0, result.bytesRead)); bytes += result.bytesRead;
    }
    need('sha256:' + sha.digest('hex') === expected.digest, 'ZIP_HASH_MISMATCH');
  } finally { await h.close(); }
}
async function removeOwned(file, owned) {
  const st = await fs.lstat(file).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  if (!st) return;
  need(st.isFile() && !st.isSymbolicLink() && st.dev === owned.dev && st.ino === owned.ino, 'OUTPUT_CLEANUP_FAILED');
  await fs.unlink(file);
}
function childDownload(expected, fd, timeoutMs, { signal, forkImpl = fork } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('DOWNLOAD_CANCELLED')); return; }
    const child = forkImpl(path.join(__dirname, 'sdk-worker.cjs'), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc', fd], env: process.env,
    });
    let reply, failure, timedOut = false, cancelled = false, killTimer;
    const kill = () => { if (killTimer) return; child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); };
    const abort = () => { cancelled = true; kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    child.on('message', m => {
      if (m?.type === 'result') reply = m.receipt;
      if (m?.type === 'failure') failure = safeCode({ message: m.code });
    });
    child.on('error', () => {}); // settle only after close: no live writer at cleanup
    child.on('close', code => {
      clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort);
      if (cancelled) reject(new Error('DOWNLOAD_CANCELLED'));
      else if (timedOut) reject(new Error('DOWNLOAD_DEADLINE'));
      else if (code !== 0 || !reply) reject(new Error(failure || 'DOWNLOAD_FAILED'));
      else resolve(reply);
    });
    child.send({ expected, timeoutMs }, error => { if (error) kill(); });
  });
}
async function downloadWithChild({ expected, output, signal, timeoutMs = 120000, forkImpl = fork }) {
  expected = validateExpected(expected); need(timeoutMs > 0 && timeoutMs <= 120000, 'REQUEST_INVALID');
  const deadline = performance.now() + timeoutMs;
  // Parent reserves the inode before starting the child and retains its owner
  // handle until child exit. A timeout never guesses ownership from a path.
  const handle = await fs.open(output, 'wx', 0o600);
  let owned, closed = false, success = false;
  try {
    owned = await handle.stat();
    const receipt = await childDownload(expected, handle.fd, timeoutMs, { signal, forkImpl });
    need(receipt.status === 'RAW_ZIP_VERIFIED' && receipt.bytes === expected.sizeBytes
      && receipt.digest === expected.digest && receipt.childDescriptorClosed === true && receipt.fsynced === true, 'OUTPUT_CHANGED');
    need(performance.now() < deadline && !signal?.aborted, 'DOWNLOAD_DEADLINE');
    await handle.sync(); await handle.close(); closed = true;
    const st = await fs.lstat(output);
    need(st.isFile() && !st.isSymbolicLink() && st.dev === owned.dev && st.ino === owned.ino, 'OUTPUT_CHANGED');
    await reread(output, expected, deadline);
    need(performance.now() < deadline && !signal?.aborted, 'DOWNLOAD_DEADLINE');
    success = true;
    return { ...receipt, parentDescriptorClosed: true, closedFileRereadSHA256: expected.digest.slice(7),
      outputBytes: st.size, elapsedMs: timeoutMs - (deadline - performance.now()) };
  } finally {
    try { if (!closed) await handle.close(); }
    finally { if (!success && owned) await removeOwned(output, owned); }
  }
}
async function main(argv = process.argv.slice(2)) {
  need(argv.length === 4 && argv[0] === '--request' && argv[2] === '--output', 'REQUEST_INVALID');
  const checked = await checkedEnvironment(process.env);
  const requestFile = path.resolve(argv[1]), output = path.resolve(argv[3]);
  need(path.isAbsolute(argv[1]) && path.isAbsolute(argv[3]), 'REQUEST_INVALID');
  for (const file of [requestFile, output]) {
    const parent = await fs.realpath(path.dirname(file)); need(parent.startsWith(checked.temp + path.sep), 'REQUEST_INVALID');
  }
  const request = await readJson(requestFile); need(request && Object.keys(request).length === 1, 'REQUEST_INVALID');
  const expected = validateExpected(request.expected);
  need(['service-8mib', 'single-128mib', 'p5-receiver-calibration32', 'p5-5gb', 'p5-10gb'].some(profile =>
    expected.name.startsWith(`vr180-seg-${profile}-${checked.context.runId}-${checked.context.runAttempt}-`)), 'REQUEST_INVALID');
  const controller = new AbortController(), abort = () => controller.abort();
  process.on('SIGTERM', abort); process.on('SIGINT', abort);
  try {
    const receipt = await downloadWithChild({ expected, output, signal: controller.signal });
    await checked.verify();
    console.log(JSON.stringify({ ...receipt, runnerContext: checked.context, provenance: checked.provenance }));
  } finally { process.off('SIGTERM', abort); process.off('SIGINT', abort); }
}
if (require.main === module) main().catch(e => { console.error(safeCode(e)); process.exitCode = 1; });
module.exports = { reread, removeOwned, childDownload, downloadWithChild, main };
