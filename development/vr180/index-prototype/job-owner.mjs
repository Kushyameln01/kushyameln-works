// Private index jobs only. This is cooperative ownership, not an origin security boundary.
import {createIndexBudget, INDEX_BUFFER_LIMIT_BYTES} from './index-store.mjs';

export const OWNER_RECORD_BYTES = 256;
export const OWNER_BUFFER_BYTES = 4096;
export const OWNER_RECORD_NAME = 'owner.bin';
const MAGIC = 'VR180IDXOWNER001';
const blocked = (message, cause) => Object.assign(Error(message, {cause}), {status: 'BLOCKED'});
const abort = () => new DOMException('Index ownership canceled.', 'AbortError');
const token = () => [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
function ticketFor(jobId, ownerToken, kind) {
  if (typeof jobId !== 'string' || typeof ownerToken !== 'string'
    || !/^[A-Za-z0-9_-]{1,64}$/.test(jobId) || !/^[0-9a-f]{32}$/.test(ownerToken)
    || !['input', 'output'].includes(kind)) throw Error('INDEX_OWNER_OPTIONS_INVALID');
  return Object.freeze({format: 'vr180-private-index-owner', schema: 1, jobId, ownerToken, kind});
}
function encode(ticket) {
  const bytes = new Uint8Array(OWNER_RECORD_BYTES), d = new DataView(bytes.buffer);
  for (let i = 0; i < MAGIC.length; i++) bytes[i] = MAGIC.charCodeAt(i);
  d.setUint32(16, 1, true); bytes[20] = ticket.kind === 'input' ? 1 : 2; bytes[21] = ticket.jobId.length;
  for (let i = 0; i < 16; i++) bytes[24 + i] = parseInt(ticket.ownerToken.slice(i * 2, i * 2 + 2), 16);
  for (let i = 0; i < ticket.jobId.length; i++) bytes[40 + i] = ticket.jobId.charCodeAt(i);
  return bytes;
}
const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
async function lease(manager, jobId) {
  if (typeof manager?.request !== 'function') throw blocked('INDEX_OWNER_LOCK_UNAVAILABLE');
  let ok, bad, release;
  const ready = new Promise((r, j) => { ok = r; bad = j; }), held = new Promise(r => { release = r; });
  const released = Promise.resolve().then(() => manager.request(`vr180:index-job:${jobId}`,
    {mode: 'exclusive', ifAvailable: true}, lock => {
      if (!lock) { bad(blocked('INDEX_OWNER_LOCK_BUSY')); return; } ok(); return held;
    }));
  released.catch(error => bad(blocked('INDEX_OWNER_LOCK_UNAVAILABLE', error)));
  await ready; return async () => { release(); await released; };
}
function context({root, jobId, ownerToken, kind, budget = createIndexBudget(), lockManager = globalThis.navigator?.locks, signal}) {
  const ticket = ticketFor(jobId, ownerToken, kind);
  if (!root?.getDirectoryHandle || !root?.removeEntry || typeof budget?.reserve !== 'function'
    || !Number.isSafeInteger(budget.limitBytes) || budget.limitBytes < 1 || budget.limitBytes > INDEX_BUFFER_LIMIT_BYTES)
    throw Error('INDEX_OWNER_BACKEND_INVALID');
  let releaseLease, releaseBuffer = () => {}, directory, owns = false, handle, ownerRemoved = false;
  let directoryRemoved = false, disposing, done = false;
  const check = () => { if (signal?.aborted) throw abort(); };
  async function dispose() {
    if (done) return; if (disposing) return disposing;
    disposing = Promise.resolve().then(async () => {
      if (handle) { handle.close(); handle = null; }
      if (owns && !directoryRemoved) {
        // Keep the recovery record until every child has gone. No array grows
        // with directory size. All cooperating children are closed by the caller.
        for await (const [name] of directory.entries()) {
          if (name !== OWNER_RECORD_NAME) await directory.removeEntry(name, {recursive: true});
        }
        if (!ownerRemoved) {
          try { await directory.removeEntry(OWNER_RECORD_NAME); }
          catch (error) { if (error.name !== 'NotFoundError') throw error; }
          ownerRemoved = true;
        }
        // Non-recursive removal also refuses an unexpectedly nonempty directory.
        await root.removeEntry(jobId); directoryRemoved = true;
      }
      if (releaseLease) { await releaseLease(); releaseLease = null; }
      releaseBuffer(); done = true;
    }).finally(() => { disposing = null; }); return disposing;
  }
  return {ticket, check, dispose,
    async acquire() { check(); releaseLease = await lease(lockManager, jobId); check(); releaseBuffer = budget.reserve(OWNER_BUFFER_BYTES); },
    async create() {
      try { await root.getDirectoryHandle(jobId); throw Error('INDEX_OWNER_JOB_ALREADY_EXISTS'); }
      catch (error) { if (error.name !== 'NotFoundError') throw error; }
      check(); directory = await root.getDirectoryHandle(jobId, {create: true}); owns = true;
      if (typeof directory.entries !== 'function') throw Error('INDEX_OWNER_DIRECTORY_ITERATION_UNAVAILABLE');
      const file = await directory.getFileHandle(OWNER_RECORD_NAME, {create: true});
      if (typeof file.createSyncAccessHandle !== 'function') throw Error('INDEX_OWNER_SYNC_HANDLE_UNAVAILABLE');
      handle = await file.createSyncAccessHandle(); if (handle.getSize() !== 0) throw Error('INDEX_OWNER_RECORD_NOT_EMPTY');
      const expected = encode(ticket), observed = new Uint8Array(OWNER_RECORD_BYTES);
      for (let at = 0; at < expected.length;) {
        check(); const n = handle.write(expected.subarray(at), {at});
        if (!Number.isSafeInteger(n) || n <= 0 || n > expected.length - at) throw Error('INDEX_OWNER_WRITE_PROGRESS'); at += n;
      }
      handle.flush();
      if (handle.getSize() !== expected.length) throw Error('INDEX_OWNER_RECORD_SIZE');
      for (let at = 0; at < observed.length;) {
        check(); const n = handle.read(observed.subarray(at), {at});
        if (!Number.isSafeInteger(n) || n <= 0 || n > observed.length - at) throw Error('INDEX_OWNER_READ_PROGRESS'); at += n;
      }
      if (!equal(expected, observed)) throw Error('INDEX_OWNER_WRITE_MISMATCH');
      handle.close(); handle = null; check(); return directory;
    },
    async validate() {
      check();
      try { directory = await root.getDirectoryHandle(jobId); }
      catch (error) { if (error.name === 'NotFoundError') return false; throw error; }
      if (typeof directory.entries !== 'function') throw blocked('INDEX_OWNER_DIRECTORY_ITERATION_UNAVAILABLE');
      let file;
      try { file = await (await directory.getFileHandle(OWNER_RECORD_NAME)).getFile(); }
      catch (error) { throw blocked('INDEX_OWNER_RECORD_UNAVAILABLE', error); }
      if (file.size !== OWNER_RECORD_BYTES) throw blocked('INDEX_OWNER_RECORD_INVALID');
      const bytes = new Uint8Array(await file.arrayBuffer()); check();
      // Whole-record equality validates magic, schema, role, identity and all
      // reserved bytes. An old/unknown/partial record never authorizes deletion.
      if (!equal(bytes, encode(ticket))) throw blocked('INDEX_OWNER_RECORD_MISMATCH');
      owns = true; return true;
    },
  };
}

/** Caller must close every child handle before dispose. Failed cleanup keeps
 * the same lease and reservation until retry succeeds. A preexisting directory
 * is never adopted. The optional token can be recorded by the caller beforehand.
 */
export async function createOwnedIndexJob(options = {}) {
  const state = context({...options, ownerToken: options.ownerToken ?? token()});
  try {
    await state.acquire(); const directory = await state.create();
    return Object.freeze({directory, ticket: state.ticket, dispose: state.dispose});
  } catch (error) {
    try { await state.dispose(); }
    catch (cleanup) { error.cleanupError = cleanup.message; error.retryCleanup = state.dispose; error.owner = state.ticket; }
    throw error;
  }
}

/** Explicit, one-job recovery only. No scan, TTL, lock steal or token discovery.
 * Missing/damaged records are left untouched. This never resumes conversion or
 * makes a statement about an external output writer's commit/rollback state.
 */
export async function cleanupAbandonedIndexJob(options = {}) {
  const state = context(options); let authorized = false;
  try {
    await state.acquire(); authorized = await state.validate(); await state.dispose();
    return {status: authorized ? 'removed' : 'already-absent', owner: state.ticket};
  } catch (error) {
    if (authorized) { error.retryCleanup = state.dispose; error.owner = state.ticket; }
    else {
      try { await state.dispose(); }
      catch (cleanup) { error.cleanupError = cleanup.message; error.retryCleanup = state.dispose; }
    }
    throw error;
  }
}
