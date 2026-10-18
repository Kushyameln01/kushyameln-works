// Explicit ownership recovery only. This registry never infers external save state.
export const REGISTRY_ROOT = 'vr180-indexed-jobs';
export const RECORD_LIMIT = 1024;
const require = (value, code) => { if (!value) throw Error(code); };
const equal = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
const encoded = value => new TextEncoder().encode(JSON.stringify(value));
const freeze = value => Object.freeze({...value});
const missing = async (root, name) => {
  try { await root.getDirectoryHandle(name); return false; }
  catch (error) { if (error.name === 'NotFoundError') return true; throw error; }
};
function validateIdentity(identity) {
  require(identity?.schema === 1 && identity.format === 'vr180-indexed-registry'
    && typeof identity.operationId === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(identity.operationId)
    && Number.isSafeInteger(identity.inputRevision) && identity.inputRevision >= 0
    && identity.namespace === `${identity.operationId}-r${identity.inputRevision}`
    && typeof identity.ownerToken === 'string' && /^[a-f0-9]{32}$/.test(identity.ownerToken)
    && Object.keys(identity).sort().join(',') === 'format,inputRevision,namespace,operationId,ownerToken,schema', 'REGISTRY_IDENTITY_INVALID');
  return identity;
}
function validateTicket(ticket, identity) {
  require(ticket?.format === 'vr180-private-index-owner' && ticket.schema === 1
    && ['input', 'output'].includes(ticket.kind)
    && ticket.jobId === identity.operationId + (ticket.kind === 'input' ? '-in' : '-out')
    && /^[a-f0-9]{32}$/.test(ticket.ownerToken), 'REGISTRY_TICKET_INVALID');
  require(Object.keys(ticket).sort().join(',') === 'format,jobId,kind,ownerToken,schema', 'REGISTRY_TICKET_FIELDS');
}
async function withLease(locks, name, action) {
  require(typeof locks?.request === 'function', 'REGISTRY_LOCK_UNAVAILABLE');
  return locks.request(name, {mode: 'exclusive', ifAvailable: true}, lock => {
    require(lock, 'REGISTRY_LEASE_BUSY'); return action();
  });
}
async function takeLease(locks, name) {
  let release, ready, reject;
  const held = new Promise(resolve => { release = resolve; });
  const acquired = new Promise((yes, no) => { ready = yes; reject = no; });
  const task = withLease(locks, name, () => { ready(); return held; });
  task.catch(reject); await acquired;
  return async () => { release(); await task; };
}
async function readRecord(directory, name) {
  const file = await (await directory.getFileHandle(name)).getFile();
  require(file.size > 0 && file.size <= RECORD_LIMIT, 'REGISTRY_RECORD_SIZE');
  const bytes = new Uint8Array(await file.arrayBuffer());
  require(bytes.length === file.size && bytes.length <= RECORD_LIMIT, 'REGISTRY_RECORD_SIZE');
  const value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  require(equal(bytes, encoded(value)), 'REGISTRY_RECORD_ENCODING');
  return {value, bytes};
}
async function durableWrite(directory, name, value, handles) {
  const bytes = encoded(value); require(bytes.length <= RECORD_LIMIT, 'REGISTRY_RECORD_SIZE');
  const file = await directory.getFileHandle(name, {create: true});
  require(typeof file.createSyncAccessHandle === 'function', 'REGISTRY_SYNC_HANDLE_UNAVAILABLE');
  const handle = await file.createSyncAccessHandle(); handles.add(handle);
  require(handle.getSize() === 0, 'REGISTRY_RECORD_NOT_EMPTY');
  let writeCalls = 0, readCalls = 0;
  for (let at = 0; at < bytes.length;) {
    const n = handle.write(bytes.subarray(at), {at});
    writeCalls++;
    require(Number.isSafeInteger(n) && n > 0 && n <= bytes.length - at, 'REGISTRY_WRITE_PROGRESS'); at += n;
  }
  handle.flush(); require(handle.getSize() === bytes.length, 'REGISTRY_RECORD_SIZE');
  const observed = new Uint8Array(bytes.length);
  for (let at = 0; at < observed.length;) {
    const n = handle.read(observed.subarray(at), {at});
    readCalls++;
    require(Number.isSafeInteger(n) && n > 0 && n <= observed.length - at, 'REGISTRY_READ_PROGRESS'); at += n;
  }
  require(equal(bytes, observed), 'REGISTRY_HANDLE_READBACK_MISMATCH');
  handle.close(); handles.delete(handle);
  const closed = await readRecord(directory, name);
  require(equal(bytes, closed.bytes), 'REGISTRY_CLOSED_READBACK_MISMATCH');
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', closed.bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
  return {bytes: bytes.length, sha256, persistedJSON: new TextDecoder().decode(closed.bytes),
    flushed: true, closed: true, readbackMatched: true, writeCalls, readCalls};
}
async function readState(directory, identity) {
  const header = await readRecord(directory, 'identity.json');
  validateIdentity(header.value);
  require(equal(encoded(header.value), encoded(identity)), 'REGISTRY_OWNER_MISMATCH');
  const tickets = [];
  const allowed = new Set(['identity.json', 'input.json', 'output.json', `${identity.operationId}-in`, `${identity.operationId}-out`]);
  let count = 0;
  for await (const [name, entry] of directory.entries()) {
    require(++count <= 5 && allowed.has(name), 'REGISTRY_UNKNOWN_ENTRY');
    if (name.endsWith('.json')) {
      require(entry.kind === 'file', 'REGISTRY_ENTRY_TYPE');
      if (name !== 'identity.json') {
        const record = (await readRecord(directory, name)).value;
        require(equal(encoded(record.identity), encoded(identity)), 'REGISTRY_TICKET_IDENTITY');
        validateTicket(record.ticket, identity);
        require(name === record.ticket.kind + '.json' && Object.keys(record).sort().join(',') === 'identity,ticket', 'REGISTRY_TICKET_FIELDS');
        tickets.push(record.ticket);
      }
    } else require(entry.kind === 'directory', 'REGISTRY_ENTRY_TYPE');
  }
  require(tickets.length <= 2, 'REGISTRY_TICKET_LIMIT');
  return tickets;
}
async function removeAfterAbsent(root, directory, identity, locks, removal = {}) {
  const jobs = [`${identity.operationId}-in`, `${identity.operationId}-out`];
  return withLease(locks, `vr180:index-job:${jobs[0]}`, () => withLease(locks, `vr180:index-job:${jobs[1]}`, async () => {
    const tickets = removal.headerRemoved ? [] : await readState(directory, identity);
    if (removal.headerRemoved) for await (const _entry of directory.entries()) throw Error('REGISTRY_UNKNOWN_ENTRY');
    require(await missing(directory, jobs[0]) && await missing(directory, jobs[1]), 'REGISTRY_INDEX_STILL_PRESENT');
    // Validate every record and both job absences before deleting any ticket.
    for (const ticket of tickets) await directory.removeEntry(ticket.kind + '.json');
    if (!removal.headerRemoved) { await directory.removeEntry('identity.json'); removal.headerRemoved = true; }
    await root.removeEntry(identity.namespace);
    return {status: 'complete', identity, tickets: tickets.length, externalSaveState: 'NOT_APPLICABLE'};
  }));
}

export async function createOwnershipRegistry({operationId, inputRevision, storage = globalThis.navigator?.storage,
  locks = globalThis.navigator?.locks, onObservation = () => {}} = {}) {
  const identity = freeze(validateIdentity({format: 'vr180-indexed-registry', schema: 1, operationId, inputRevision,
    namespace: `${operationId}-r${inputRevision}`, ownerToken: [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('')}));
  require(typeof storage?.getDirectory === 'function', 'REGISTRY_OPFS_UNAVAILABLE');
  let root, directory, release, done = false, created = false, headerComplete = false, persistenceFailed = false;
  const handles = new Set(), persisted = new Set(), removal = {};
  const observation = (status, extra = {}) => ({identity, status, ...extra});
  async function closeHandles() {
    const errors = [];
    for (const handle of handles) { try { handle.close(); handles.delete(handle); } catch (error) { errors.push(error); } }
    if (errors.length) throw Object.assign(Error('REGISTRY_HANDLE_CLOSE_FAILED', {cause: errors[0]}), {requiresWorkerTermination: true});
  }
  async function cleanup() {
    if (done) return observation('complete');
    await closeHandles();
    if (created) {
      if (!headerComplete || persistenceFailed) throw Object.assign(Error('REGISTRY_PARTIAL_RECORD_RETAINED'), {requiresWorkerTermination: true});
      await removeAfterAbsent(root, directory, identity, locks, removal);
    }
    if (release) { await release(); release = null; }
    done = true; return observation('complete');
  }
  try {
    release = await takeLease(locks, `vr180:index-registry:${identity.namespace}`);
    root = await (await storage.getDirectory()).getDirectoryHandle(REGISTRY_ROOT, {create: true});
    require(await missing(root, identity.namespace), 'REGISTRY_ALREADY_EXISTS');
    directory = await root.getDirectoryHandle(identity.namespace, {create: true}); created = true;
    onObservation(observation('creating'));
    const proof = await durableWrite(directory, 'identity.json', identity, handles); headerComplete = true;
    onObservation(observation('ready', {ticketCount: 0, ...proof}));
  } catch (cause) {
    const error = new Error(String(cause?.message ?? cause), {cause}); error.name = cause?.name ?? 'Error';
    error.registry = observation('retained'); error.retryCleanup = cleanup;
    if (!created) { await cleanup(); }
    throw error;
  }
  return {identity, directory, cleanup,
    async persist(ticket) {
      validateTicket(ticket, identity); require(!done && !persisted.has(ticket.kind) && persisted.size < 2, 'REGISTRY_TICKET_LIMIT');
      ticket = freeze(ticket);
      const start = performance.now();
      let proof;
      try {
        proof = await durableWrite(directory, ticket.kind + '.json', {identity, ticket}, handles);
        persisted.add(ticket.kind);
      } catch (cause) { persistenceFailed = true; const error = new Error(String(cause?.message ?? cause), {cause}); error.registry = observation('retained'); throw error; }
      onObservation(observation('persisted', {ticket: freeze(ticket), ...proof, ticketCount: persisted.size, durationMs: performance.now() - start}));
    },
  };
}

export async function recoverIndexedJob(identity, {storage = globalThis.navigator?.storage, locks = globalThis.navigator?.locks,
  cleanupOwner = options => import('./indexed/job-owner.mjs').then(m => m.cleanupAbandonedIndexJob(options))} = {}) {
  validateIdentity(identity);
  const removal = {}; let pendingOwnerCleanup;
  const recover = () => withLease(locks, `vr180:index-registry:${identity.namespace}`, async () => {
    if (pendingOwnerCleanup) { await pendingOwnerCleanup(); pendingOwnerCleanup = null; }
    let root, directory;
    try { root = await (await storage.getDirectory()).getDirectoryHandle(REGISTRY_ROOT); directory = await root.getDirectoryHandle(identity.namespace); }
    catch (error) { if (error.name === 'NotFoundError') return {status: 'complete', identity, alreadyAbsent: true, externalSaveState: 'NOT_APPLICABLE'}; throw error; }
    const tickets = removal.headerRemoved ? [] : await readState(directory, identity);
    for (const kind of ['input', 'output']) {
      const ticket = tickets.find(t => t.kind === kind), name = identity.operationId + (kind === 'input' ? '-in' : '-out');
      if (!ticket) require(await missing(directory, name), 'REGISTRY_INDEX_WITHOUT_TICKET');
      else {
        try { await cleanupOwner({root: directory, ...ticket, lockManager: locks}); }
        catch (error) { if (error.retryCleanup) pendingOwnerCleanup = error.retryCleanup; throw error; }
      }
    }
    return removeAfterAbsent(root, directory, identity, locks, removal);
  });
  try { return await recover(); }
  catch (error) { error.retryCleanup = recover; throw error; }
}

export async function listIndexedJobs({storage = globalThis.navigator?.storage, limit = 20} = {}) {
  require(Number.isSafeInteger(limit) && limit >= 1 && limit <= 100, 'REGISTRY_LIST_LIMIT');
  let root;
  try { root = await (await storage.getDirectory()).getDirectoryHandle(REGISTRY_ROOT); }
  catch (error) { if (error.name === 'NotFoundError') return {jobs: [], truncated: false}; throw error; }
  const jobs = []; let truncated = false;
  for await (const [namespace, entry] of root.entries()) {
    if (jobs.length === limit) { truncated = true; break; }
    try {
      require(entry.kind === 'directory', 'REGISTRY_ENTRY_TYPE');
      const directory = await root.getDirectoryHandle(namespace);
      const identity = validateIdentity((await readRecord(directory, 'identity.json')).value);
      require(identity.namespace === namespace, 'REGISTRY_NAMESPACE_MISMATCH');
      const tickets = await readState(directory, identity);
      jobs.push({identity, status: 'pending', ticketCount: tickets.length});
    } catch (error) { jobs.push({namespace, status: 'retained', error: String(error.message)}); }
  }
  return {jobs, truncated};
}
