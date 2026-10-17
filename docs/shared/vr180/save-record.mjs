// schema 2: attempts are the canonical save observations. Top-level fields are
// derived getters locally and derived snapshots when structured-cloned/exported.
// Historical schema 1 records are not upgraded or assigned new meanings here.
const summaryKeys = ['saveWriteCommitted', 'saveCompleted', 'savedSize', 'savedSha256', 'saveObservedAt',
  'lastSaveAttemptId', 'lastVerifiedSaveAttemptId', 'saveApiMs', 'savePermissionWaitMs', 'downloadRequestedAt'];
const kinds = ['direct', 'prepared-copy', 'download-request'];
const commitStates = ['not-started', 'pending', 'committed', 'aborted', 'unknown'];
const verificationStates = ['not-run', 'running', 'passed', 'failed', 'canceled'];

function checkRecord(receipt) {
  if (receipt?.schemaVersion !== 2 || typeof receipt.operationId !== 'string' || !receipt.operationId
    || !Number.isSafeInteger(receipt.inputRevision) || receipt.inputRevision < 0 || !Array.isArray(receipt.saveAttempts)) {
    throw Error('INVALID_SAVE_RECORD');
  }
}
function checkAttempt(receipt, attempt) {
  if (typeof attempt.id !== 'string' || !attempt.id || attempt.resultOperationId !== receipt.operationId
    || attempt.inputRevision !== receipt.inputRevision) throw Error('SAVE_ATTEMPT_IDENTITY_MISMATCH');
  if (!kinds.includes(attempt.kind) || !commitStates.includes(attempt.commitState)
    || !verificationStates.includes(attempt.verificationState)) throw Error('INVALID_SAVE_OBSERVATION');
  const previous = receipt.preparedBeforeCancel;
  const output = receipt.output ?? (previous?.schemaVersion === 2 && previous.operationId === receipt.operationId
    && previous.inputRevision === receipt.inputRevision ? previous.output : null);
  if (attempt.verificationState === 'passed' && (attempt.commitState !== 'committed'
    || !Number.isSafeInteger(attempt.bytes) || attempt.bytes < 0 || typeof attempt.sha256 !== 'string' || !attempt.sha256
    || attempt.bytes !== output?.bytes || attempt.sha256 !== output?.sha256
    || (attempt.kind === 'prepared-copy' && attempt.wholeFileHashCompared !== true)
    || (attempt.kind === 'direct' && (attempt.wholeFileHashCompared !== false || attempt.metadataHashMatched !== true))
    || attempt.kind === 'download-request')) throw Error('INVALID_SAVE_VERIFICATION');
}

export function createSaveAttempt(receipt, kind, observation = {}) {
  checkRecord(receipt);
  const attempt = {id: crypto.randomUUID(), resultOperationId: receipt.operationId, inputRevision: receipt.inputRevision, kind,
    commitState: 'not-started', verificationState: 'not-run', bytes: null, sha256: null, hashBasis: null,
    wholeFileHashCompared: false, metadataHashMatched: null, startedAt: new Date().toISOString(), finishedAt: null,
    timings: {}, errorCode: null, cleanup: null, ...observation};
  checkAttempt(receipt, attempt);
  if (receipt.saveAttempts.some(previous => previous.id === attempt.id)) throw Error('DUPLICATE_SAVE_ATTEMPT_ID');
  return attempt;
}

export function summarizeSaves(receipt) {
  checkRecord(receipt);
  let committed = false, unknown = false, verified = null, download = null;
  const ids = new Set();
  for (const attempt of receipt.saveAttempts) {
    checkAttempt(receipt, attempt);
    if (ids.has(attempt.id)) throw Error('DUPLICATE_SAVE_ATTEMPT_ID');
    ids.add(attempt.id);
    committed ||= attempt.commitState === 'committed';
    unknown ||= attempt.commitState === 'unknown';
    if (attempt.verificationState === 'passed') verified = attempt;
    if (attempt.kind === 'download-request') download = attempt;
  }
  return {saveWriteCommitted: committed ? true : unknown ? null : false, saveCompleted: !!verified,
    savedSize: verified?.bytes ?? null, savedSha256: verified?.sha256 ?? null, saveObservedAt: verified?.finishedAt ?? null,
    lastSaveAttemptId: receipt.saveAttempts.at(-1)?.id ?? null, lastVerifiedSaveAttemptId: verified?.id ?? null,
    saveApiMs: verified?.timings?.saveApiMs ?? null, savePermissionWaitMs: verified?.timings?.permissionWaitMs ?? null,
    downloadRequestedAt: download?.startedAt ?? null};
}

export function bindSaveSummary(receipt) {
  summarizeSaves(receipt); // Reject malformed observations before installing getters.
  for (const key of summaryKeys) Object.defineProperty(receipt, key, {
    enumerable: true, configurable: true, get: () => summarizeSaves(receipt)[key],
  });
  return receipt;
}
