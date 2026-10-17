// Non-public prototype. No product import, muxer/demuxer integration or recovery.
export const INDEX_PAGE_BYTES = 64 * 1024;
export const INDEX_BUFFER_LIMIT_BYTES = 8 * 1024 * 1024;
const abortError = () => new DOMException('Index operation canceled.', 'AbortError');
const safe = n => Number.isSafeInteger(n) && n >= 0;
const taskYield = () => new Promise(resolve => setTimeout(resolve, 0));

export function recordByteOffset(index, width) {
  if (!safe(index) || !safe(width) || width === 0) throw Error('INVALID_INDEX_POSITION');
  const value = BigInt(index) * BigInt(width);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('INVALID_INDEX_POSITION');
  return Number(value);
}

export function createIndexBudget(limitBytes = INDEX_BUFFER_LIMIT_BYTES) {
  if (!safe(limitBytes) || limitBytes === 0 || limitBytes > INDEX_BUFFER_LIMIT_BYTES) throw Error('INVALID_BUDGET_LIMIT');
  let usedBytes = 0, peakBytes = 0;
  return Object.freeze({limitBytes, get usedBytes() { return usedBytes; }, get peakBytes() { return peakBytes; },
    reserve(bytes) {
      if (!safe(bytes) || bytes > limitBytes - usedBytes) throw Error('INDEX_BUFFER_BUDGET_EXCEEDED');
      usedBytes += bytes; peakBytes = Math.max(usedBytes, peakBytes);
      let active = true;
      return () => { if (active) { active = false; usedBytes -= bytes; } };
    },
  });
}
const defaultBudget = createIndexBudget(); // One pool shared by stores in this module/Worker.

const blocked = (message, cause) => Object.assign(new Error(message, {cause}), {status: 'BLOCKED'});
async function acquireJobLease(lockManager, jobId) {
  if (typeof lockManager?.request !== 'function') throw blocked('INDEX_JOB_LOCK_UNAVAILABLE: Web Locks is required.');
  let acquired, failed, release;
  const ready = new Promise((resolve, reject) => { acquired = resolve; failed = reject; });
  const held = new Promise(resolve => { release = resolve; });
  // The fixed origin-wide name also conservatively excludes equal job IDs in
  // different caller roots. A caller cannot opt out by choosing a lock namespace.
  const released = Promise.resolve().then(() => lockManager.request(`vr180:index-store:job:${jobId}`,
    {mode: 'exclusive', ifAvailable: true}, lock => {
      if (!lock) { failed(blocked('INDEX_JOB_LOCK_BUSY: Another owner holds this job.')); return; }
      acquired(); return held;
    }));
  released.catch(error => failed(blocked(`INDEX_JOB_LOCK_UNAVAILABLE: ${error.message}`, error)));
  await ready;
  // Await the request promise too: cleanup completion means the lease is released,
  // not merely that its callback has been told it can finish.
  return async () => { release(); await released; };
}

/** One fresh job/table per store, in a caller-owned OPFS namespace.
 * Call in a dedicated Worker. The root/SyncAccessHandle are injectable solely
 * to exercise the same bounded I/O against independent test backends. Tests may
 * inject a LockManager; production requires the origin's native Web Locks.
 */
export async function createIndexStore({root, jobId = globalThis.crypto.randomUUID(), schema,
  budget = defaultBudget, signal, yieldTask = taskYield, lockManager = globalThis.navigator?.locks} = {}) {
  if (!schema || !safe(schema.version) || schema.version === 0 || !safe(schema.recordBytes)
    || !schema.recordBytes || schema.recordBytes > INDEX_PAGE_BYTES || schema.endianness !== 'little') throw Error('INVALID_INDEX_SCHEMA');
  if (typeof jobId !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(jobId)) throw Error('INVALID_INDEX_JOB_ID');
  if (!root?.getDirectoryHandle || !root?.removeEntry || typeof yieldTask !== 'function') throw Error('INDEX_BACKEND_UNAVAILABLE');
  if (!safe(budget?.limitBytes) || budget.limitBytes > INDEX_BUFFER_LIMIT_BYTES || typeof budget.reserve !== 'function') throw Error('INVALID_INDEX_BUDGET');
  const layout = Object.freeze({version: schema.version, recordBytes: schema.recordBytes, endianness: schema.endianness});
  let releasePage = () => {}, releaseLease;
  let page, handle, ownsJob = false, closed = false, deleted = false;
  const closeAndRemove = async () => {
    if (handle && !closed) { handle.close(); closed = true; }
    page = null; releasePage();
    if (ownsJob && !deleted) { await root.removeEntry(jobId, {recursive: true}); deleted = true; }
    if (releaseLease) { await releaseLease(); releaseLease = undefined; }
  };
  try {
    if (signal?.aborted) throw abortError();
    releaseLease = await acquireJobLease(lockManager, jobId);
    if (signal?.aborted) throw abortError();
    releasePage = budget.reserve(INDEX_PAGE_BYTES);
    page = new Uint8Array(INDEX_PAGE_BYTES);
    try { await root.getDirectoryHandle(jobId); throw Error('INDEX_JOB_ALREADY_EXISTS'); }
    catch (error) { if (error.name !== 'NotFoundError') throw error; }
    const directory = await root.getDirectoryHandle(jobId, {create: true}); ownsJob = true;
    const file = await directory.getFileHandle('records.bin', {create: true});
    if (typeof file.createSyncAccessHandle !== 'function') throw Error('SYNC_ACCESS_HANDLE_UNAVAILABLE');
    handle = await file.createSyncAccessHandle();
    if (handle.getSize() !== 0) throw Error('INDEX_FILE_MUST_BE_EMPTY');
    if (signal?.aborted) throw abortError();
  } catch (error) {
    try { await closeAndRemove(); }
    catch (cleanup) { error.cleanupError = cleanup.message; error.retryCleanup = closeAndRemove; }
    throw error;
  }

  let state = 'open', count = 0, extent = 0, cachePage = -1, cacheValid = 0;
  let busy = false, pending = null, disposing = null, closing = false, internalBufferBytes = INDEX_PAGE_BYTES;
  let ioBytesSinceYield = 0, ioCallsSinceYield = 0;
  const controller = new AbortController();
  const stats = {readBytes: 0, writeBytes: 0, readCalls: 0, writeCalls: 0, cacheHits: 0, cacheWriteThroughBytes: 0, yields: 0, flushes: 0,
    observedFileBytes: 0, peakInternalBufferBytes: INDEX_PAGE_BYTES, lastError: null};
  const check = operationSignal => { if (controller.signal.aborted || signal?.aborted || operationSignal?.aborted) throw abortError(); };
  const add = (key, n) => {
    if (!safe(n) || n > Number.MAX_SAFE_INTEGER - stats[key]) throw Error('INDEX_METRIC_OVERFLOW');
    stats[key] += n;
  };
  async function yieldIO(bytes, operationSignal) {
    ioBytesSinceYield += bytes; ioCallsSinceYield++;
    if (ioBytesSinceYield >= INDEX_PAGE_BYTES || ioCallsSinceYield >= 64) {
      ioBytesSinceYield = 0; ioCallsSinceYield = 0; add('yields', 1);
      await yieldTask();
    }
    check(operationSignal);
  }
  function run(work, {mutate = false, operationSignal, borrowed = 0} = {}) {
    if (busy) return Promise.reject(Error('INDEX_BUSY'));
    if (closing || state === 'disposed' || state === 'cleanup-failed' || state === 'failed') return Promise.reject(Error('INDEX_NOT_OPEN'));
    if (mutate && state === 'sealed') return Promise.reject(Error('INDEX_SEALED'));
    let release;
    try { release = budget.reserve(borrowed); } catch (error) { return Promise.reject(error); }
    busy = true;
    const task = (async () => {
      try { check(operationSignal); const result = await work(); check(operationSignal); return result; }
      catch (error) { state = closing ? 'closing' : 'failed'; stats.lastError = error.message; throw error; }
      finally { release(); busy = false; pending = null; }
    })();
    pending = task;
    return task;
  }
  function bufferBytes(bytes, expected) {
    if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer) || bytes.byteLength !== expected) throw Error('INVALID_INDEX_BUFFER');
    // Borrowing a subview still retains its whole backing allocation.
    return bytes.buffer.byteLength;
  }
  async function writeFully(bytes, at, operationSignal) {
    for (let done = 0; done < bytes.length;) {
      check(operationSignal);
      const position = at + done, length = Math.min(bytes.length - done, INDEX_PAGE_BYTES - position % INDEX_PAGE_BYTES);
      const written = handle.write(bytes.subarray(done, done + length), {at: position}); add('writeCalls', 1);
      if (!safe(written) || written > length) throw Error('INVALID_INDEX_WRITE_COUNT');
      if (written === 0) throw Error('INDEX_NO_WRITE_PROGRESS');
      // The synchronous backend has accepted these bytes. Preserve other cached
      // pages, update overlapping bytes, and extend only a contiguous valid prefix.
      // No write-back queue is introduced; failed/canceled operations still poison
      // the store, so partially written records cannot subsequently be read.
      if (cachePage >= 0) {
        const base = recordByteOffset(cachePage, INDEX_PAGE_BYTES);
        const start = Math.max(base, position), end = Math.min(base + INDEX_PAGE_BYTES, position + written);
        if (start < end && start <= base + cacheValid) {
          page.set(bytes.subarray(done + start - position, done + end - position), start - base);
          cacheValid = Math.max(cacheValid, end - base); add('cacheWriteThroughBytes', end - start);
        }
      }
      done += written; add('writeBytes', written); stats.observedFileBytes = Math.max(stats.observedFileBytes, at + done);
      await yieldIO(written, operationSignal);
    }
  }
  async function loadPage(index, operationSignal) {
    if (!safe(index)) throw Error('INVALID_INDEX_POSITION');
    const base = recordByteOffset(index, INDEX_PAGE_BYTES), length = Math.min(INDEX_PAGE_BYTES, extent - base);
    if (length <= 0) throw Error('INDEX_READ_OUT_OF_RANGE');
    if (index === cachePage && cacheValid === length) { add('cacheHits', 1); return; }
    cachePage = -1; cacheValid = 0;
    for (let done = 0; done < length;) {
      check(operationSignal);
      const read = handle.read(page.subarray(done, length), {at: base + done}); add('readCalls', 1);
      if (!safe(read) || read > length - done) throw Error('INVALID_INDEX_READ_COUNT');
      if (read === 0) throw Error('INDEX_NO_READ_PROGRESS');
      done += read; add('readBytes', read); await yieldIO(read, operationSignal);
    }
    cachePage = index; cacheValid = length;
  }
  async function readRecordInto(index, target, operationSignal) {
    const at = recordByteOffset(index, layout.recordBytes);
    if (index >= count) throw Error('INDEX_READ_OUT_OF_RANGE');
    for (let done = 0; done < target.length;) {
      const position = at + done, pageIndex = Math.floor(position / INDEX_PAGE_BYTES), start = position % INDEX_PAGE_BYTES;
      await loadPage(pageIndex, operationSignal);
      const bytes = Math.min(target.length - done, cacheValid - start);
      target.set(page.subarray(start, start + bytes), done); done += bytes;
    }
  }
  function dispose() {
    if (state === 'disposed') return Promise.resolve();
    if (disposing) return disposing;
    closing = true; state = 'closing'; controller.abort();
    const active = pending;
    disposing = (async () => {
      try {
        await active?.catch(() => {}); await closeAndRemove();
        internalBufferBytes = 0; state = 'disposed';
      } catch (error) {
        if (closed) internalBufferBytes = 0;
        state = 'cleanup-failed'; stats.lastError = error.message; throw error;
      } finally { disposing = null; }
    })();
    return disposing;
  }

  return Object.freeze({
    get metrics() { return {state, jobId, schema: layout, count, extent, internalBufferBytes, ...stats,
      budgetReservedBytes: budget.usedBytes, budgetPeakBytes: budget.peakBytes}; },
    async appendRecord(bytes, {signal: operationSignal} = {}) {
      const borrowed = bufferBytes(bytes, layout.recordBytes);
      return run(async () => {
        const end = recordByteOffset(count + 1, layout.recordBytes);
        const index = count; await writeFully(bytes, extent, operationSignal); count++; extent = end; return index;
      }, {mutate: true, operationSignal, borrowed});
    },
    async patchRecord(index, bytes, {signal: operationSignal} = {}) {
      const borrowed = bufferBytes(bytes, layout.recordBytes);
      return run(async () => {
        const at = recordByteOffset(index, layout.recordBytes);
        if (index >= count) throw Error('INDEX_PATCH_OUT_OF_RANGE');
        await writeFully(bytes, at, operationSignal);
      }, {mutate: true, operationSignal, borrowed});
    },
    async readRecord(index, destination, {signal: operationSignal} = {}) {
      const borrowed = bufferBytes(destination, layout.recordBytes);
      return run(() => readRecordInto(index, destination, operationSignal), {operationSignal, borrowed});
    },
    async readPage(index, destination, {signal: operationSignal} = {}) {
      const borrowed = bufferBytes(destination, INDEX_PAGE_BYTES);
      return run(async () => { await loadPage(index, operationSignal); destination.set(page.subarray(0, cacheValid)); return cacheValid; }, {operationSignal, borrowed});
    },
    iterate(visit, {start = 0, end = count, signal: operationSignal} = {}) {
      if (typeof visit !== 'function' || !safe(start) || !safe(end) || start > end || end > count) return Promise.reject(Error('INVALID_INDEX_ITERATION'));
      return run(async () => {
        const release = budget.reserve(layout.recordBytes);
        let record;
        try {
          record = new Uint8Array(layout.recordBytes); internalBufferBytes += layout.recordBytes;
          stats.peakInternalBufferBytes = Math.max(stats.peakInternalBufferBytes, internalBufferBytes);
          for (let index = start; index < end; index++) { check(operationSignal); await readRecordInto(index, record, operationSignal); await visit(record, index); check(operationSignal); }
          return end - start;
        } finally { if (record) internalBufferBytes -= layout.recordBytes; release(); }
      }, {operationSignal});
    },
    seal({expectedCount = count, signal: operationSignal} = {}) {
      return run(async () => {
        if (!safe(expectedCount) || expectedCount !== count || recordByteOffset(count, layout.recordBytes) !== extent
          || handle.getSize() !== extent) throw Error('INDEX_SEAL_EXTENT_MISMATCH');
        handle.flush(); add('flushes', 1); check(operationSignal); state = 'sealed';
        return {jobId, schema: layout, count, extent};
      }, {operationSignal});
    },
    flush({signal: operationSignal} = {}) { return run(async () => { handle.flush(); add('flushes', 1); check(operationSignal); }, {operationSignal}); },
    abort: dispose, dispose,
  });
}
