import {transferAudioDependenciesToPlan} from './audio-dependency.mjs';
import { sha256Blob } from './sha256.mjs';
// Conversion output uses the existing output-only cslg verifier; input admission stays strict.
import { inspectMp4, planMp4Tag } from './indexed/mp4-output-inspect.mjs';
import {transferMetadataToPlan} from './container-metadata.mjs';

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

// Fixed phase names, aggregate-only storage. Callback failures never affect I/O.
// Durations use this execution context's clock; overlapping phases must not be summed.
// requestedBytes is the requested extent, never partial progress on failure/cancel.
function phaseMeasurements(onMeasurement = () => {}) {
  const phases = {};
  const snapshot = () => Object.fromEntries(Object.entries(phases).map(([key, value]) => [key, {...value}]));
  async function measure(phase, bytes, fn) {
    const start = performance.now();
    let status = 'completed';
    try { return await fn(); }
    catch (error) { status = error?.name === 'AbortError' ? 'canceled' : 'failed'; throw error; }
    finally {
      const item = {phase, durationMs: performance.now() - start, requestedBytes: bytes, status};
      const previous = phases[phase];
      phases[phase] = {durationMs: (previous?.durationMs ?? 0) + item.durationMs,
        count: (previous?.count ?? 0) + 1, requestedBytes: (previous?.requestedBytes ?? 0) + bytes,
        status: previous && previous.status !== 'completed' ? previous.status : status};
      try { Promise.resolve(onMeasurement({...item})).catch(() => {}); } catch {}
    }
  }
  return {measure, snapshot};
}

/** A position-aware file transaction. A muxer's stream close does NOT commit the file. */
export async function createFileOutput(handle, { signal, sourceHandle, allowExisting = false, onProgress = () => {}, onCreated, onMeasurement } = {}) {
  const timing = phaseMeasurements(onMeasurement);
  let writer;
  try {
    if (signal?.aborted) throw abortError();
    if (sourceHandle && await handle.isSameEntry(sourceHandle)) throw Error('OUTPUT_IS_INPUT');
    const before = await timing.measure('getFileBefore', 0, () => handle.getFile());
    // With a File-only input we cannot prove identity. Protect all existing nonempty targets.
    if (before.size && (!sourceHandle || !allowExisting)) throw Error('OUTPUT_MUST_BE_NEW_FILE');
    if (signal?.aborted) throw abortError();
    writer = await timing.measure('createWritable', 0, () => handle.createWritable());
  } catch (error) { error.fileTimings = timing.snapshot(); throw withOutputState(error, notStarted); }
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
        await timing.measure('abort', 0, () => writer.abort(reason));
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
      await timing.measure('write', data.byteLength, () => writer.write({ type: 'write', position, data }));
      extent = Math.max(extent, position + data.byteLength);
      check(); onProgress({ phase: 'write', bytes: extent });
    });
  }
  async function truncate(size) {
    check(); sizeCheck(size);
    return run(async () => { await timing.measure('truncate', 0, () => writer.truncate(size)); extent = size; check(); });
  }
  async function commit({ expectedBytes, expectedSha256 = null } = {}) {
    check(); sizeCheck(expectedBytes);
    if (expectedSha256 !== null && !/^[a-f0-9]{64}$/.test(expectedSha256)) throw Error('INVALID_EXPECTED_HASH');
    if (extent !== expectedBytes) throw Error('OUTPUT_SIZE_MISMATCH');
    try {
      return await run(async () => {
        await timing.measure('truncate', 0, () => writer.truncate(expectedBytes)); check();
        state = 'finalizing';
        await timing.measure('close', 0, () => writer.close()); committed = true; state = 'committed';
        if (cancelRequested || signal?.aborted) throw abortError();
        const file = await timing.measure('getFile', 0, () => handle.getFile());
        if (cancelRequested || signal?.aborted) throw abortError();
        if (file.size !== expectedBytes) throw Error('SAVED_SIZE_MISMATCH');
        const sha256 = await timing.measure('savedFileHash', file.size, () => sha256Blob(file, { signal: verificationController.signal, onProgress: progress => onProgress({ phase: 'verify', ...progress }) }));
        if (cancelRequested || signal?.aborted) throw abortError();
        if (expectedSha256 !== null && sha256 !== expectedSha256) throw Error('SAVED_HASH_MISMATCH');
        state = 'verified'; removeListener();
        return { file, bytes: file.size, sha256, committed: true, hashMatched: expectedSha256 !== null, timings: timing.snapshot() };
      });
    } catch (error) {
      if (committed) { state = 'verification-failed'; removeListener(); }
      error.fileTimings = timing.snapshot();
      throw withOutputState(error, snapshot);
    }
  }
  const output = {
    writeAt, truncate, commit, abort,
    get status() { return snapshot(); },
    get timings() { return timing.snapshot(); },
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
    error.fileTimings = timing.snapshot();
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
    error.fileTimings = output.timings;
    throw withOutputState(error, () => output.status);
  }
}

/** Finalize a bounded direct mux transaction before physically committing it.
 * The complete file hash is observed after close; only the replacement metadata
 * has a pre-write expected digest. This does not certify decoded pixel content.
 */
export async function finalizeDirectOutput({output, source, containerMetadata, audioDependencies, outputSampling = 'equal', expectedDimensions}, {signal, onProgress = () => {}, onMeasurement} = {}) {
  const timing = phaseMeasurements(onMeasurement);
  const timings = () => ({...output.timings, ...timing.snapshot()});
  const check = () => { if (signal?.aborted) throw abortError(); };
  try {
    check();
    if (!output.status.muxerClosed || output.status.committed) throw Error('DIRECT_MUX_NOT_CLOSED');
    const plan = await timing.measure('tagPlan', 0, async () => transferAudioDependenciesToPlan(
      await transferMetadataToPlan(await planMp4Tag(source, {layout: 'sbs', sampling: outputSampling, signal}), containerMetadata, {signal}),
      audioDependencies, {signal}));
    if (!Number.isSafeInteger(plan.outputBytes) || plan.outputBytes <= 0) throw Error('OUTPUT_SIZE_INVALID');
    const expectedMetadataHash = await timing.measure('metadataExpectedHash', plan.append.size, () => sha256Blob(plan.append, {signal}));
    check();
    await timing.measure('metadataWrite', plan.append.size + plan.patches.reduce((sum, patch) => sum + patch.data.byteLength, 0), async () => {
      for (const patch of plan.patches) { check(); await output.writeAt(patch.position, patch.data); }
      for (let at = 0; at < plan.append.size; at += COPY_CHUNK_BYTES) {
        check();
        const bytes = new Uint8Array(await plan.append.slice(at, Math.min(at + COPY_CHUNK_BYTES, plan.append.size)).arrayBuffer());
        await output.writeAt(plan.appendAt + at, bytes);
      }
    });
    check(); onProgress({phase: 'saveCommit'});
    const saved = await output.commit({expectedBytes: plan.outputBytes});
    check();
    const actualMetadataHash = await timing.measure('metadataReadback', plan.append.size, () => sha256Blob(saved.file.slice(plan.appendAt), {signal}));
    if (actualMetadataHash !== expectedMetadataHash) throw Error('DIRECT_METADATA_HASH_MISMATCH');
    const info = await timing.measure('savedInspect', 0, () => inspectMp4(saved.file, {signal})); check();
    if (expectedDimensions && (info.width !== expectedDimensions.width || info.height !== expectedDimensions.height)) throw Error('DIRECT_OUTPUT_DIMENSIONS_MISMATCH');
    return {saved, info, timings: timings(), verification: {status: 'verified', saveWriteCommitted: true, saveCompleted: true,
      wholeFileHashCompared: false, metadataHashMatched: true, metadataSHA256: actualMetadataHash,
      metadataOffset: plan.appendAt, metadataBytes: plan.append.size,
      hashNote: 'Whole saved-file SHA-256 observed after commit; final metadata compared with its pre-write SHA-256'}};
  } catch (error) { error.fileTimings = timings(); throw withOutputState(error, () => output.status); }
}
