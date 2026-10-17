import { sha256Blob } from './sha256.mjs';
import { inspectMp4, planMp4Tag } from './mp4.mjs';

const COPY_CHUNK_BYTES = 1024 * 1024;
const abortError = () => new DOMException('保存を取り消しました', 'AbortError');
const notStarted = () => ({state: 'not-started', writerAcquired: false, committed: false, extent: 0});
// Keep the observation live through explicit cleanup retries; serialization reads
// a snapshot. Absence of a writer is not evidence that writer.abort() succeeded.
function withOutputState(error, snapshot) {
  if (!error || typeof error !== 'object') error = new Error(String(error));
  error.saveWriteCommitted = snapshot().committed === true;
  Object.defineProperty(error, 'saveOutputState', {enumerable: true, configurable: true, get: snapshot});
  return error;
}
const sizeCheck = n => {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('INVALID_FILE_POSITION');
};

/** A position-aware file transaction. A muxer's stream close does NOT commit the file. */
export async function createFileOutput(handle, { signal, sourceHandle, allowExisting = false, onProgress = () => {}, onCreated } = {}) {
  let writer;
  try {
    if (signal?.aborted) throw abortError();
    if (sourceHandle && await handle.isSameEntry(sourceHandle)) throw Error('OUTPUT_IS_INPUT');
    const before = await handle.getFile();
    // With a File-only input we cannot prove identity. Protect all existing nonempty targets.
    if (before.size && (!sourceHandle || !allowExisting)) throw Error('OUTPUT_MUST_BE_NEW_FILE');
    if (signal?.aborted) throw abortError();
    writer = await handle.createWritable();
  } catch (error) { throw withOutputState(error, notStarted); }
  const verificationController = new AbortController();
  let state = 'open', extent = 0, pending = null, abortPromise = null, committed = false, cleanupError = null;
  let cancelRequested = signal?.aborted ?? false, muxerClosed = false;
  const snapshot = () => ({ state, writerAcquired: true, extent, committed, muxerClosed, cleanupError: cleanupError?.message ?? null });
  const check = () => {
    if (cancelRequested || signal?.aborted) throw abortError();
    if (state !== 'open') throw Error('OUTPUT_NOT_OPEN');
  };
  const run = async fn => {
    if (pending) throw Error('CONCURRENT_FILE_OPERATION');
    let release;
    pending = new Promise(resolve => { release = resolve; });
    try { return await fn(); }
    finally { pending = null; release(); }
  };
  const removeListener = () => signal?.removeEventListener('abort', onAbort);
  async function abort(reason = abortError()) {
    cancelRequested = true;
    verificationController.abort();
    if (committed || state === 'aborted') return snapshot();
    if (abortPromise) return abortPromise;
    state = 'aborting';
    abortPromise = (async () => {
      if (pending) await pending;
      if (committed) return snapshot(); // close may already have committed: never claim rollback.
      try {
        await writer.abort(reason);
        state = 'aborted'; cleanupError = null; removeListener();
        return snapshot();
      } catch (error) {
        state = 'cleanup-failed'; cleanupError = error; throw error;
      } finally { abortPromise = null; }
    })();
    return abortPromise;
  }
  function onAbort() { cancelRequested = true; abort().catch(error => { cleanupError = error; }); }
  async function writeAt(position, data) {
    check(); sizeCheck(position);
    if (!(data instanceof Uint8Array)) throw TypeError('OUTPUT_BYTES_REQUIRED');
    sizeCheck(position + data.byteLength);
    return run(async () => {
      await writer.write({ type: 'write', position, data });
      extent = Math.max(extent, position + data.byteLength);
      check(); onProgress({ phase: 'write', bytes: extent });
    });
  }
  async function truncate(size) {
    check(); sizeCheck(size);
    return run(async () => { await writer.truncate(size); extent = size; check(); });
  }
  async function commit({ expectedBytes, expectedSha256 = null } = {}) {
    check(); sizeCheck(expectedBytes);
    if (expectedSha256 !== null && !/^[a-f0-9]{64}$/.test(expectedSha256)) throw Error('INVALID_EXPECTED_HASH');
    if (extent !== expectedBytes) throw Error('OUTPUT_SIZE_MISMATCH');
    try {
      return await run(async () => {
        await writer.truncate(expectedBytes); check();
        state = 'finalizing';
        await writer.close(); committed = true; state = 'committed';
        if (cancelRequested || signal?.aborted) throw abortError();
        const file = await handle.getFile();
        if (cancelRequested || signal?.aborted) throw abortError();
        if (file.size !== expectedBytes) throw Error('SAVED_SIZE_MISMATCH');
        const sha256 = await sha256Blob(file, { signal: verificationController.signal, onProgress: progress => onProgress({ phase: 'verify', ...progress }) });
        if (cancelRequested || signal?.aborted) throw abortError();
        if (expectedSha256 !== null && sha256 !== expectedSha256) throw Error('SAVED_HASH_MISMATCH');
        state = 'verified'; removeListener();
        return { file, bytes: file.size, sha256, committed: true, hashMatched: expectedSha256 !== null };
      });
    } catch (error) {
      if (committed) { state = 'verification-failed'; removeListener(); }
      throw withOutputState(error, snapshot);
    }
  }
  const output = {
    writeAt, truncate, commit, abort,
    get status() { return snapshot(); },
    // Mediabunny finalization/cancel closes this wrapper. Only commit() closes the real writer.
    stream: new WritableStream({
      write({ type, position, data }) {
        if (type !== 'write') throw Error('INVALID_OUTPUT_WRITE');
        return writeAt(position, data);
      },
      close() { muxerClosed = true; },
      abort(reason) { return abort(reason); },
    }, { highWaterMark: 1 }),
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    // Notify the owner immediately after acquisition, including a cancellation
    // that arrived while createWritable() was pending. Cleanup can still retry.
    onCreated?.(output);
    if (cancelRequested || signal?.aborted) throw abortError();
    return output;
  } catch (error) {
    try { await abort(error); }
    catch (cleanup) { error.cleanupError = cleanup.message; error.retryCleanup = () => abort(error); }
    throw withOutputState(error, snapshot);
  }
}

/** Stream an already prepared Blob/File, then compare the saved bytes with its full hash. */
export async function saveBlobToFile(blob, handle, { signal, expectedSha256, onProgress = () => {}, ...options } = {}) {
  let output;
  try {
    const hash = expectedSha256 ?? await sha256Blob(blob, { signal, onProgress: p => onProgress({ phase: 'source-hash', ...p }) });
    output = await createFileOutput(handle, { signal, onProgress, ...options });
    for (let position = 0; position < blob.size; position += COPY_CHUNK_BYTES) {
      if (signal?.aborted) throw abortError();
      const end = Math.min(position + COPY_CHUNK_BYTES, blob.size);
      const bytes = new Uint8Array(await blob.slice(position, end).arrayBuffer());
      if (bytes.length !== end - position) throw Error('INCOMPLETE_SOURCE_READ');
      await output.writeAt(position, bytes);
    }
    return await output.commit({ expectedBytes: blob.size, expectedSha256: hash });
  } catch (error) {
    if (!output) throw error?.saveOutputState ? error : withOutputState(error, notStarted);
    try { await output.abort(error); }
    catch (cleanup) {
      error.cleanupError = cleanup.message;
      // Keep the writer reachable for an explicit retry; callers must block
      // another operation until this cleanup succeeds.
      error.retryCleanup = () => output.abort(error);
    }
    throw withOutputState(error, () => output.status);
  }
}

/** Finalize a bounded direct mux transaction before physically committing it.
 * The complete file hash is observed after close; only the replacement metadata
 * has a pre-write expected digest. This does not certify decoded pixel content.
 */
export async function finalizeDirectOutput({output, source}, {signal, onProgress = () => {}} = {}) {
  const check = () => { if (signal?.aborted) throw abortError(); };
  try {
    check();
    if (!output.status.muxerClosed || output.status.committed) throw Error('DIRECT_MUX_NOT_CLOSED');
    const plan = await planMp4Tag(source, {layout: 'sbs', signal});
    if (plan.outputBytes > 1024 ** 3) throw Error('DIRECT_OUTPUT_LIMIT_EXCEEDED');
    const expectedMetadataHash = await sha256Blob(plan.append, {signal});
    check();
    for (const patch of plan.patches) { check(); await output.writeAt(patch.position, patch.data); }
    for (let at = 0; at < plan.append.size; at += COPY_CHUNK_BYTES) {
      check();
      const bytes = new Uint8Array(await plan.append.slice(at, Math.min(at + COPY_CHUNK_BYTES, plan.append.size)).arrayBuffer());
      await output.writeAt(plan.appendAt + at, bytes);
    }
    check(); onProgress({phase: 'saveCommit'});
    const saved = await output.commit({expectedBytes: plan.outputBytes});
    check();
    const actualMetadataHash = await sha256Blob(saved.file.slice(plan.appendAt), {signal});
    if (actualMetadataHash !== expectedMetadataHash) throw Error('DIRECT_METADATA_HASH_MISMATCH');
    const info = await inspectMp4(saved.file, {signal}); check();
    return {saved, info, verification: {status: 'verified', saveWriteCommitted: true, saveCompleted: true,
      wholeFileHashCompared: false, metadataHashMatched: true, metadataSHA256: actualMetadataHash,
      metadataOffset: plan.appendAt, metadataBytes: plan.append.size,
      hashNote: 'Whole saved-file SHA-256 observed after commit; final metadata compared with its pre-write SHA-256'}};
  } catch (error) { throw withOutputState(error, () => output.status); }
}
