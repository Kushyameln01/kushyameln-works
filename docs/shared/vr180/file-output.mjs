import { sha256Blob } from './sha256.mjs';

const COPY_CHUNK_BYTES = 1024 * 1024;
const abortError = () => new DOMException('保存を取り消しました', 'AbortError');
const sizeCheck = n => {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('INVALID_FILE_POSITION');
};

/** A position-aware file transaction. A muxer's stream close does NOT commit the file. */
export async function createFileOutput(handle, { signal, sourceHandle, allowExisting = false, onProgress = () => {} } = {}) {
  if (signal?.aborted) throw abortError();
  if (sourceHandle && await handle.isSameEntry(sourceHandle)) throw Error('OUTPUT_IS_INPUT');
  const before = await handle.getFile();
  // With a File-only input we cannot prove identity. Protect all existing nonempty targets.
  if (before.size && (!sourceHandle || !allowExisting)) throw Error('OUTPUT_MUST_BE_NEW_FILE');
  if (signal?.aborted) throw abortError();
  const writer = await handle.createWritable();
  const verificationController = new AbortController();
  let state = 'open', extent = 0, pending = null, abortPromise = null, committed = false, cleanupError = null;
  let cancelRequested = signal?.aborted ?? false, muxerClosed = false;
  const snapshot = () => ({ state, extent, committed, muxerClosed, cleanupError: cleanupError?.message ?? null });
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
  signal?.addEventListener('abort', onAbort, { once: true });
  if (cancelRequested) {
    const error = abortError(); error.saveWriteCommitted = false;
    try { await abort(error); }
    catch (cleanup) { error.cleanupError = cleanup.message; error.retryCleanup = () => abort(error); }
    throw error;
  }
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
      error.saveWriteCommitted = committed;
      throw error;
    }
  }
  return {
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
}

/** Stream an already prepared Blob/File, then compare the saved bytes with its full hash. */
export async function saveBlobToFile(blob, handle, { signal, expectedSha256, onProgress = () => {}, ...options } = {}) {
  const hash = expectedSha256 ?? await sha256Blob(blob, { signal, onProgress: p => onProgress({ phase: 'source-hash', ...p }) });
  const output = await createFileOutput(handle, { signal, onProgress, ...options });
  try {
    for (let position = 0; position < blob.size; position += COPY_CHUNK_BYTES) {
      if (signal?.aborted) throw abortError();
      const end = Math.min(position + COPY_CHUNK_BYTES, blob.size);
      const bytes = new Uint8Array(await blob.slice(position, end).arrayBuffer());
      if (bytes.length !== end - position) throw Error('INCOMPLETE_SOURCE_READ');
      await output.writeAt(position, bytes);
    }
    return await output.commit({ expectedBytes: blob.size, expectedSha256: hash });
  } catch (error) {
    try { await output.abort(error); }
    catch (cleanup) {
      error.cleanupError = cleanup.message;
      // Keep the writer reachable for an explicit retry; callers must block
      // another operation until this cleanup succeeds.
      error.retryCleanup = () => output.abort(error);
    }
    error.saveWriteCommitted = output.status.committed;
    throw error;
  }
}
