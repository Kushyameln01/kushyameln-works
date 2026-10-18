// Decimal GB is a route-selection threshold, not an input or output capacity cap.
export const STREAMING_INPUT_THRESHOLD_BYTES = 1_000_000_000;
export const LEGACY_PROFILE = Object.freeze({maxSamples: 100000, maxMetadataBytes: 16 * 1024 ** 2});
export const INDEXED_PROFILE = Object.freeze({id: 'default', maxOutputBytes: null,
  maxInputBytes: null, maxSamples: 10000000, maxMetadataBytes: null,
  retainedMetadataBytes: 16 * 1024 ** 2, indexBudgetBytes: 8 * 1024 ** 2,
  requires: Object.freeze(['OPFS', 'SyncAccessHandle', 'Web Locks', 'outputHandle'])});

export function requiresIndexedConversion({inputBytes, sampleCount, metadataBytes} = {}) {
  if (!Number.isSafeInteger(inputBytes) || inputBytes < 0) throw Error('INPUT_SIZE_INVALID');
  return inputBytes >= STREAMING_INPUT_THRESHOLD_BYTES || sampleCount > LEGACY_PROFILE.maxSamples
    || metadataBytes > LEGACY_PROFILE.maxMetadataBytes;
}

export function selectExecutionRoute(settings, {outputHandle, inputBytes, sampleCount, metadataBytes,
  indexedAvailable = typeof globalThis.navigator?.storage?.getDirectory === 'function'
    && typeof globalThis.navigator?.locks?.request === 'function'} = {}) {
  if (settings.executionRoute !== undefined && !['auto', 'legacy', 'indexed'].includes(settings.executionRoute)) {
    throw Error('EXECUTION_ROUTE_UNSUPPORTED');
  }
  if (settings.outputProfileId !== undefined && settings.outputProfileId !== 'default') throw Error('OUTPUT_PROFILE_UNSUPPORTED');
  if (settings.mode === 'inspect' || settings.mode === 'copy') return {id: 'legacy', profile: null};
  const required = requiresIndexedConversion({inputBytes, sampleCount, metadataBytes});
  const indexed = settings.executionRoute === 'indexed' || required
    || ((!settings.executionRoute || settings.executionRoute === 'auto') && !!outputHandle && indexedAvailable);
  if (!indexed) return {id: 'legacy', profile: LEGACY_PROFILE};
  if (settings.mode !== 'convert') throw Error('INDEXED_CONVERT_MODE_REQUIRED');
  if (!outputHandle) throw Error('INDEXED_OUTPUT_HANDLE_REQUIRED');
  return {id: 'indexed', profile: INDEXED_PROFILE};
}
