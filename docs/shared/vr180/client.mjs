import {bindSaveSummary, createSaveAttempt} from './save-record.mjs';
import {listIndexedJobs, recoverIndexedJob} from './ownership-registry.mjs';
import {selectExecutionRoute} from './route-profile.mjs';
export async function cleanupTemporaryJob(id) {
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(id)) throw Error('INVALID_JOB_ID');
  if (!globalThis.navigator?.storage?.getDirectory) return;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('vr180-jobs');
    await dir.removeEntry(id, {recursive: true});
  } catch (error) { if (error.name !== 'NotFoundError') throw error; }
}

const abortError = () => new DOMException('処理を取り消しました', 'AbortError');
export class StereoClient {
  constructor({WorkerClass = globalThis.Worker, onEvent = () => {}, cleanup = cleanupTemporaryJob, cleanupTimeoutMs = 30000,
    cleanupIndexed = recoverIndexedJob, listIndexed = listIndexedJobs} = {}) {
    this.WorkerClass = WorkerClass; this.onEvent = onEvent; this.cleanup = cleanup;
    this.cleanupTimeoutMs = cleanupTimeoutMs; this.revision = 0; this.current = null;
    this.cleanupIndexed = cleanupIndexed; this.listIndexed = listIndexed;
  }
  get cleanupPending() { return !!this.current?.cleanupPending; }
  get outputStateUnknown() { return !!this.current?.unknownOutput; }
  emit(event) { try { this.onEvent(event); } catch {} }
  run(file, settings, {outputHandle} = {}) {
    if (this.current) throw Error('PREVIOUS_JOB_NOT_DISPOSED');
    const settingsSnapshot = structuredClone(settings);
    if (settingsSnapshot.mode === 'convert') {
      settingsSnapshot.executionRoute = selectExecutionRoute(settingsSnapshot, {outputHandle, inputBytes: file.size}).id;
    }
    const workerURL = new URL('./worker.mjs', import.meta.url);
    let worker;
    try { worker = new this.WorkerClass(workerURL, {type: 'module'}); }
    catch (error) {
      error.workerFailure = {phase: 'worker-construction', url: workerURL.href};
      throw error;
    }
    const operationId = crypto.randomUUID(), inputRevision = ++this.revision;
    const saveAttemptId = outputHandle ? crypto.randomUUID() : undefined;
    return new Promise((resolve, reject) => {
      const job = {worker, operationId, inputRevision, resolve, reject, settled: false,
        stopping: false, cleanupPending: false, stop: null, attempt: 0, dead: false, error: null, diagnostics: null, directOutput: !!outputHandle, saveAttemptId, settings: settingsSnapshot, inputBytes: file.size, startedAt: new Date().toISOString()};
      job.indexed = settingsSnapshot.executionRoute === 'indexed' && settingsSnapshot.mode === 'convert';
      this.current = job;
      worker.onmessage = ({data: message}) => {
        if (this.current !== job || message.operationId !== operationId || message.inputRevision !== inputRevision) return;
        job.receivedMessage = true;
        if (message.type === 'indexed-ownership') {
          const identity = message.registry?.identity;
          if (!job.indexed || identity?.operationId !== operationId || identity?.inputRevision !== inputRevision
            || identity.namespace !== `${operationId}-r${inputRevision}`) {
            this.workerFailed(job, Error('INDEXED_REGISTRY_IDENTITY_MISMATCH')); return;
          }
          job.registry = structuredClone(message.registry); this.emit(message); return;
        }
        // Structured cloning materializes derived getters; restore schema 2
        // derivation locally without upgrading historical records.
        for (const receipt of [message.diagnostics, message.result?.receipt]) {
          if (receipt?.schemaVersion !== 2) continue;
          if (receipt.operationId !== operationId || receipt.inputRevision !== inputRevision) return;
          try { bindSaveSummary(receipt); }
          catch (cause) { this.workerFailed(job, new Error('INVALID_SAVE_RECEIPT', {cause})); return; }
        }
        // A pending cancel declines the result as a UI success, but cannot erase
        // a same-generation save observation that actually reached this page.
        if (message.type === 'result' && message.result?.receipt?.schemaVersion === 2
          && message.result.receipt.saveWriteCommitted === true) job.observedSaveReceipt ??= message.result.receipt;
        if (message.type === 'cleanup-complete' || message.type === 'cleanup-error') {
          if (!job.stop || message.requestId !== job.stop.requestId) return;
          if (message.diagnostics) job.diagnostics ??= message.diagnostics;
          job.requiresWorkerTermination ||= !!message.requiresWorkerTermination;
          if (message.type === 'cleanup-complete' && (!job.indexed || message.internalIndexCleanup === 'complete')) this.completeCleanup(job, message);
          else if (message.type === 'cleanup-complete') this.cleanupFailed(job, Error('INDEXED_CLEANUP_UNCONFIRMED'), message);
          else this.cleanupFailed(job, Error(message.error), message);
          return;
        }
        if (message.type === 'error') {
          if (job.settled && !job.stopping) return;
          const wasStopping = job.stopping;
          job.diagnostics ??= message.diagnostics ?? null;
          job.requiresWorkerTermination ||= !!message.requiresWorkerTermination;
          job.error ??= Object.assign(message.diagnostics?.error?.name === 'AbortError' ? abortError() : Error(message.error), {diagnostics: job.diagnostics});
          // A stop request needs its own acknowledgement; old terminal messages
          // cannot settle the operation before that matching cleanup response.
          job.stopping = true;
          if (wasStopping) return;
          if (message.cleanupComplete && (!job.indexed || message.diagnostics?.internalIndexCleanup === 'complete')) this.completeCleanup(job, message);
          else this.cleanupFailed(job, Error(message.cleanupError || 'WORKER_CLEANUP_INCOMPLETE'), message);
        } else if (!job.stopping && !job.settled) {
          if (message.type === 'result') { job.settled = true; job.preparedReceipt = message.result?.receipt ?? null; this.emit(message); resolve(message.result); }
          else this.emit(message);
        }
      };
      worker.onerror = event => this.workerFailed(job, Object.assign(Error(event.message || 'WORKER_FAILED'), {
        workerFailure: {phase: job.receivedMessage ? 'worker-after-message' : 'worker-before-first-message', url: workerURL.href,
          filename: event.filename ?? null, line: event.lineno ?? null, column: event.colno ?? null}}));
      worker.onmessageerror = () => this.workerFailed(job, Object.assign(Error('WORKER_MESSAGE_UNREADABLE'), {
        workerFailure: {phase: 'worker-message', url: workerURL.href}}));
      try { worker.postMessage({type: 'run', file, settings: settingsSnapshot, operationId, inputRevision, outputHandle, saveAttemptId}); job.dispatched = true; }
      catch (error) { this.workerFailed(job, error); }
    });
  }
  completeCleanup(job, message = {}) {
    if (this.current !== job) return;
    const stop = job.stop; clearTimeout(stop?.timer); job.stop = null;
    // The Worker has released its writers/codecs and removed only its own job.
    job.worker.terminate(); this.current = null; job.cleanupPending = false;
    this.emit({...message, type: 'cleanup-complete', operationId: job.operationId, inputRevision: job.inputRevision});
    if (!job.settled) {
      job.settled = true;
      const error = job.error ?? abortError();
      if (job.diagnostics) error.diagnostics = job.diagnostics;
      job.reject(error);
    }
    stop?.resolve();
  }
  cleanupFailed(job, error, message = {}) {
    if (this.current !== job) return;
    const stop = job.stop; clearTimeout(stop?.timer); job.stop = null;
    job.cleanupPending = true;
    // Keep the run promise/current job pending. A cleanup failure does not mean
    // the application can start another job. Original diagnostics stay intact.
    this.emit({...message, type: 'cleanup-error', operationId: job.operationId, inputRevision: job.inputRevision,
      error: String(error.message || error), diagnostics: job.diagnostics});
    stop?.reject(error);
  }
  workerFailed(job, error) {
    if (this.current !== job || job.dead) return;
    job.error ??= error; job.dead = true; job.stopping = true;
    job.worker.terminate();
    // An abnormal Worker failure cannot acknowledge. The narrow main-thread
    // fallback still blocks reuse until its matching job deletion succeeds.
    this.cleanupDeadWorker(job).catch(() => {});
  }
  cleanupDeadWorker(job, {recover = false} = {}) {
    if (job.indexed && job.dispatched) return this.cleanupDeadIndexedWorker(job, recover);
    if (job.directOutput && job.dispatched) {
      const known = job.observedSaveReceipt ?? job.diagnostics ?? job.preparedReceipt;
      if (known?.saveWriteCommitted === true) {
        // An acknowledged commit already closed the writer. Keep the saved
        // file and the original receipt; no rollback or new verification.
        this.completeCleanup(job, {diagnostics: known,
          cleanup: {status: 'complete', scope: 'previously acknowledged closed direct writer; saved file retained'}});
        return Promise.resolve();
      }
      const error = Error('DIRECT_SAVE_STATE_UNKNOWN');
      if (!job.unknownOutput) {
        const receipt = {schemaVersion: 2, operationId: job.operationId, inputRevision: job.inputRevision,
          status: 'failed', error: {name: 'Error', message: error.message}, settings: job.settings,
          input: known?.input ?? {bytes: job.inputBytes, sha256: null, info: null, hashBasis: null}, output: null,
          workerReceipt: known ?? null, saveAttempts: [],
          directSave: {status: 'unknown', reason: 'Worker terminated without acknowledging the direct output writer state'},
          cleanup: {status: 'unconfirmed', error: error.message}};
        receipt.saveAttempts.push(createSaveAttempt(receipt, 'direct', {id: job.saveAttemptId,
          startedAt: job.startedAt, finishedAt: new Date().toISOString(), status: 'unknown', commitState: 'unknown',
          errorCode: error.message, cleanup: {status: 'unconfirmed', errorCode: error.message}}));
        job.diagnostics = bindSaveSummary(receipt);
      }
      job.unknownOutput = true;
      this.cleanupFailed(job, error, {diagnostics: job.diagnostics});
      return Promise.reject(error);
    }
    if (job.fallback) return job.fallback;
    job.fallback = Promise.resolve().then(() => this.cleanup(job.operationId))
      .then(() => this.completeCleanup(job), error => { this.cleanupFailed(job, error); throw error; })
      .finally(() => { job.fallback = null; });
    job.fallback.catch(() => {});
    return job.fallback;
  }
  cleanupDeadIndexedWorker(job, recover) {
    if (job.fallback) return job.fallback;
    const known = job.observedSaveReceipt ?? job.diagnostics ?? job.preparedReceipt;
    if (known?.saveWriteCommitted === true && job.diagnostics && job.diagnostics !== known
      && job.diagnostics.saveWriteCommitted !== true) {
      job.diagnostics = bindSaveSummary({...known, status: 'failed', workerReceipt: job.diagnostics,
        error: {name: job.error?.name ?? 'Error', message: job.error?.message ?? 'WORKER_FAILED'}});
    } else if (!job.diagnostics && known) job.diagnostics = known;
    if (known?.saveWriteCommitted !== true && !job.unknownOutput) {
      const error = 'DIRECT_SAVE_STATE_UNKNOWN';
      const receipt = {schemaVersion: 2, operationId: job.operationId, inputRevision: job.inputRevision,
        status: 'failed', settings: job.settings, executionRoute: 'indexed', error: {name: 'Error', message: error},
        input: known?.input ?? {bytes: job.inputBytes, sha256: null, info: null}, output: null,
        workerReceipt: known ?? null, saveAttempts: [], indexedOwnership: job.registry ?? null,
        internalIndexCleanup: 'pending', cleanup: {status: 'unconfirmed', error},
        directSave: {status: 'unknown', reason: 'Worker disappeared before the external save outcome was acknowledged'}};
      receipt.saveAttempts.push(createSaveAttempt(receipt, 'direct', {id: job.saveAttemptId,
        status: 'unknown', commitState: 'unknown', finishedAt: new Date().toISOString(), errorCode: error}));
      job.diagnostics = bindSaveSummary(receipt); job.unknownOutput = true;
    }
    if (!recover) {
      const error = Error('INDEXED_CLEANUP_REQUIRES_EXPLICIT_RECOVERY');
      this.cleanupFailed(job, error, {internalIndexCleanup: 'pending', registry: job.registry});
      return Promise.reject(error);
    }
    job.fallback = Promise.resolve().then(async () => {
      let identity = job.registry?.identity;
      if (!identity) {
        const listed = await this.listIndexed();
        const namespace = `${job.operationId}-r${job.inputRevision}`;
        const own = listed.jobs.find(row => row.identity?.namespace === namespace || row.namespace === namespace);
        if (own) { if (!own.identity) throw Error('INDEXED_REGISTRY_PARTIAL_RETAINED'); identity = own.identity; }
        else if (listed.truncated) throw Error('INDEXED_REGISTRY_LIST_INCOMPLETE');
      }
      if (identity) {
        if (identity.operationId !== job.operationId || identity.inputRevision !== job.inputRevision) throw Error('INDEXED_REGISTRY_IDENTITY_MISMATCH');
        const result = await (job.retryIndexedCleanup ? job.retryIndexedCleanup() : this.cleanupIndexed(identity));
        if (result?.status !== 'complete') throw Error('INDEXED_CLEANUP_UNCONFIRMED');
        job.retryIndexedCleanup = null;
      }
      job.internalIndexCleanup = 'complete';
      if (job.unknownOutput) {
        // Recovering internal files cannot establish an external writer's outcome.
        const error = Error('DIRECT_SAVE_STATE_UNKNOWN');
        throw error;
      }
      this.completeCleanup(job, {diagnostics: job.diagnostics, internalIndexCleanup: 'complete',
        cleanup: {status: 'complete', scope: 'explicit matching indexed registry recovery; external file retained'}});
    }).catch(error => {
      if (error.retryCleanup) job.retryIndexedCleanup = error.retryCleanup;
      this.cleanupFailed(job, error, {internalIndexCleanup: job.internalIndexCleanup ?? 'pending'}); throw error;
    }).finally(() => { job.fallback = null; });
    job.fallback.catch(() => {}); return job.fallback;
  }
  cancel() {
    const job = this.current;
    if (!job) return Promise.resolve();
    if (job.stop) return job.stop.promise;
    if (job.requiresWorkerTermination && !job.dead) {
      job.dead = true; job.worker.terminate();
    }
    if (job.dead) return this.cleanupDeadWorker(job, {recover: true});
    job.stopping = true; job.cleanupPending = false;
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const requestId = `${job.operationId}-cleanup-${++job.attempt}`;
    job.stop = {promise, resolve, reject, requestId};
    job.stop.timer = setTimeout(() => this.cleanupFailed(job, Error('CLEANUP_ACK_TIMEOUT')), this.cleanupTimeoutMs);
    promise.catch(() => {});
    try {
      job.worker.postMessage({type: job.settled || job.error ? 'release' : 'cancel',
        operationId: job.operationId, inputRevision: job.inputRevision, requestId});
    } catch (error) { this.workerFailed(job, error); }
    return promise;
  }
  acknowledgeUnknownOutput() {
    const job = this.current;
    if (!job?.dead || !job.unknownOutput) throw Error('NO_UNKNOWN_DIRECT_OUTPUT');
    clearTimeout(job.stop?.timer);
    const error = Object.assign(Error('DIRECT_SAVE_STATE_UNKNOWN'), {diagnostics: job.diagnostics});
    job.stop?.reject(error); job.stop = null;
    if (!job.settled) { job.settled = true; job.reject(error); }
    // Explicitly detach an unconfirmed outcome; never emit cleanup-complete.
    this.current = null;
    this.emit({type: 'output-unconfirmed-detached', diagnostics: job.diagnostics,
      operationId: job.operationId, inputRevision: job.inputRevision,
      ...(job.indexed ? {internalIndexCleanup: job.internalIndexCleanup ?? 'pending', retainedOwnership: job.registry ?? null} : {})});
    return job.diagnostics;
  }
  dispose() { return this.cancel(); }
}
