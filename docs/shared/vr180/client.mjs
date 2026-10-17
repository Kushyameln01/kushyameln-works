import {bindSaveSummary, createSaveAttempt} from './save-record.mjs';
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
  constructor({WorkerClass = globalThis.Worker, onEvent = () => {}, cleanup = cleanupTemporaryJob, cleanupTimeoutMs = 30000} = {}) {
    this.WorkerClass = WorkerClass; this.onEvent = onEvent; this.cleanup = cleanup;
    this.cleanupTimeoutMs = cleanupTimeoutMs; this.revision = 0; this.current = null;
  }
  get cleanupPending() { return !!this.current?.cleanupPending; }
  get outputStateUnknown() { return !!this.current?.unknownOutput; }
  emit(event) { try { this.onEvent(event); } catch {} }
  run(file, settings, {outputHandle} = {}) {
    if (this.current) throw Error('PREVIOUS_JOB_NOT_DISPOSED');
    const settingsSnapshot = structuredClone(settings);
    const worker = new this.WorkerClass(new URL('./worker.mjs', import.meta.url), {type: 'module'});
    const operationId = crypto.randomUUID(), inputRevision = ++this.revision;
    const saveAttemptId = outputHandle ? crypto.randomUUID() : undefined;
    return new Promise((resolve, reject) => {
      const job = {worker, operationId, inputRevision, resolve, reject, settled: false,
        stopping: false, cleanupPending: false, stop: null, attempt: 0, dead: false, error: null, diagnostics: null, directOutput: !!outputHandle, saveAttemptId, settings: settingsSnapshot, inputBytes: file.size, startedAt: new Date().toISOString()};
      this.current = job;
      worker.onmessage = ({data: message}) => {
        if (this.current !== job || message.operationId !== operationId || message.inputRevision !== inputRevision) return;
        // Structured cloning materializes derived getters; restore schema 2
        // derivation locally without upgrading historical records.
        for (const receipt of [message.diagnostics, message.result?.receipt]) {
          if (receipt?.schemaVersion !== 2) continue;
          if (receipt.operationId !== operationId || receipt.inputRevision !== inputRevision) return;
          try { bindSaveSummary(receipt); }
          catch (cause) { this.workerFailed(job, new Error('INVALID_SAVE_RECEIPT', {cause})); return; }
        }
        if (message.type === 'cleanup-complete' || message.type === 'cleanup-error') {
          if (!job.stop || message.requestId !== job.stop.requestId) return;
          if (message.diagnostics) job.diagnostics ??= message.diagnostics;
          job.requiresWorkerTermination ||= !!message.requiresWorkerTermination;
          if (message.type === 'cleanup-complete') this.completeCleanup(job, message);
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
          if (message.cleanupComplete) this.completeCleanup(job, message);
          else this.cleanupFailed(job, Error(message.cleanupError || 'WORKER_CLEANUP_INCOMPLETE'), message);
        } else if (!job.stopping && !job.settled) {
          if (message.type === 'result') { job.settled = true; job.preparedReceipt = message.result?.receipt ?? null; this.emit(message); resolve(message.result); }
          else this.emit(message);
        }
      };
      worker.onerror = event => this.workerFailed(job, Error(event.message || 'WORKER_FAILED'));
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
  cleanupDeadWorker(job) {
    if (job.directOutput && job.dispatched) {
      const known = job.diagnostics ?? job.preparedReceipt;
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
  cancel() {
    const job = this.current;
    if (!job) return Promise.resolve();
    if (job.stop) return job.stop.promise;
    if (job.requiresWorkerTermination && !job.dead) {
      job.dead = true; job.worker.terminate();
    }
    if (job.dead) return this.cleanupDeadWorker(job);
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
      operationId: job.operationId, inputRevision: job.inputRevision});
    return job.diagnostics;
  }
  dispose() { return this.cancel(); }
}
