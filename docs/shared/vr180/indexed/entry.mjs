import {createOwnershipRegistry} from '../ownership-registry.mjs';
import {selectExecutionRoute} from '../route-profile.mjs';

export async function convertIndexed(file, settings, {operationId, inputRevision, outputHandle, onCleanup,
  onRegistry, storage = globalThis.navigator?.storage, locks = globalThis.navigator?.locks,
  loadRuntime = () => import('./transform.mjs'), loadFork = () => import('../vendor/mediabunny-indexed.mjs'),
  createRegistry = createOwnershipRegistry, ...options} = {}) {
  selectExecutionRoute({...settings, executionRoute: 'indexed'}, {outputHandle, inputBytes: file.size});
  const check = () => { if (options.signal?.aborted) throw new DOMException('Conversion was canceled.', 'AbortError'); };
  let registry, liveCleanup, pendingCleanup;
  const cleanup = async () => { await liveCleanup?.(); await pendingCleanup?.(); await registry?.cleanup(); };
  onCleanup?.(cleanup);
  try {
    check();
    registry = await createRegistry({operationId, inputRevision, storage, locks, onObservation: onRegistry});
    check();
    const [{convertStereo}, fork] = await Promise.all([loadRuntime(), loadFork()]);
    const result = await convertStereo(file, settings, {...options, fork, indexRoot: registry.directory, outputHandle,
      jobId: operationId, outputProfileId: 'default', onIndexOwnership: ticket => registry.persist(ticket),
      onCleanup: value => { liveCleanup = value; }});
    liveCleanup = result.cleanup ?? liveCleanup;
    // The runtime has already committed and verified the actual saved File.
    // Keep the observation if registry cleanup changes this return into failure.
    try { await cleanup(); }
    catch (cause) { throw Object.assign(new Error(String(cause?.message ?? cause), {cause}), {
      savedObservation: result.savedObservation, requiresWorkerTermination: !!cause?.requiresWorkerTermination}); }
    return {...result, kind: 'indexed-direct-saved', cleanup, registry: {identity: registry.identity, status: 'complete'}};
  } catch (cause) {
    const error = new Error(String(cause?.message ?? cause), {cause}); error.name = cause?.name ?? 'Error';
    for (const key of ['savedObservation', 'saveWriteCommitted', 'fileTimings', 'requiresWorkerTermination']) {
      if (cause?.[key] !== undefined) error[key] = cause[key];
    }
    if (cause?.saveOutputState !== undefined) Object.defineProperty(error, 'saveOutputState', {enumerable: true, get: () => cause.saveOutputState});
    if (!registry && cause?.retryCleanup) pendingCleanup = cause.retryCleanup;
    error.registry = cause?.registry ?? (registry ? {identity: registry.identity, status: 'retained'} : null);
    error.retryCleanup = cleanup;
    throw error;
  }
}
