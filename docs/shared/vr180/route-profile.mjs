// Unpublished adapter selection. Capacity profiles require separate qualification.
export const INDEXED_PROFILE = Object.freeze({id: 'default', maxOutputBytes: 1024 ** 3,
  maxInputBytes: 1024 ** 3, maxSamples: 100000, maxMetadataBytes: 16 * 1024 ** 2,
  indexBudgetBytes: 8 * 1024 ** 2, requires: Object.freeze(['OPFS', 'SyncAccessHandle', 'Web Locks', 'outputHandle'])});

export function selectExecutionRoute(settings, {outputHandle, inputBytes} = {}) {
  if (settings.executionRoute !== undefined && !['legacy', 'indexed'].includes(settings.executionRoute)) {
    throw Error('EXECUTION_ROUTE_UNSUPPORTED');
  }
  if (settings.outputProfileId !== undefined && settings.outputProfileId !== 'default') throw Error('OUTPUT_PROFILE_UNSUPPORTED');
  if (settings.mode === 'inspect' || settings.mode === 'copy') return {id: 'legacy', profile: null};
  if (settings.executionRoute !== 'indexed') return {id: 'legacy', profile: null};
  if (settings.mode !== 'convert') throw Error('INDEXED_CONVERT_MODE_REQUIRED');
  if (!outputHandle) throw Error('INDEXED_OUTPUT_HANDLE_REQUIRED');
  if (!Number.isSafeInteger(inputBytes) || inputBytes < 0 || inputBytes > INDEXED_PROFILE.maxInputBytes) {
    throw Error('INDEXED_INPUT_LIMIT_EXCEEDED');
  }
  return {id: 'indexed', profile: INDEXED_PROFILE};
}
