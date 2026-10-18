import {transferAudioDependenciesToTaggedBlob} from './audio-dependency.mjs';
import {inspectMp4 as inspectOutputMp4, tagMp4 as tagOutputMp4} from './indexed/mp4-output-inspect.mjs';
import {transferMetadataToTaggedBlob} from './container-metadata.mjs';
import {inspectMp4, tagMp4} from './mp4.mjs';
import {diagnoseMp4} from './diagnostics.mjs';
import {sha256Blob} from './sha256.mjs';
import {finalizeDirectOutput} from './file-output.mjs';
import {bindSaveSummary, createSaveAttempt} from './save-record.mjs';
import {selectExecutionRoute, LEGACY_PROFILE, INDEXED_PROFILE} from './route-profile.mjs';
const BUILD = 'vr180-b14-mp4-compatibility-r6';
// Legacy indices stay bounded by admission. Indexed tables use disk pages;
// retained small metadata, sorting and ownership budgets are enforced separately.
function validate(info, s, route) {
  if (!s.confirmed) throw Error('CONFIRM_PROJECTION_AND_EYES');
  if (!['sbs', 'tb'].includes(s.layout) || ![180, 360].includes(s.fov)) throw Error('INPUT_SETTINGS_UNSUPPORTED');
  if (info.projection === 'mesh') throw Error('CAMERA_MESH_NOT_SUPPORTED_YET');
  if (info.pose?.some(x => x !== 0)) throw Error('DIRECTION_METADATA_NOT_SUPPORTED');
  const expected = s.layout === 'sbs' ? 2 : 1;
  if (info.stereoMode !== null && info.stereoMode !== undefined && info.stereoMode !== expected) throw Error('STEREO_METADATA_CONFLICT');
  if (info.bounds) {
    const b = info.bounds, want = s.fov === 180 ? 0x40000000 : 0;
    if (b.top !== 0 || b.bottom !== 0 || b.left !== want || b.right !== want) throw Error('FOV_METADATA_CONFLICT');
  }
  const ew = info.width / (s.layout === 'sbs' ? 2 : 1), eh = info.height / (s.layout === 'tb' ? 2 : 1);
  if (!Number.isInteger(ew) || !Number.isInteger(eh) || ew / eh !== s.fov / 180) throw Error('EYE_DIMENSIONS_AND_FOV_CONFLICT');
  if (s.mode === 'copy' && s.fov !== 180) throw Error('COPY_REQUIRES_180_DEGREES');
  if (s.mode === 'convert') {
    const profile = route.id === 'indexed' ? INDEXED_PROFILE : LEGACY_PROFILE;
    if (info.hasTrackReferences || info.hasChapterList) throw Error('TRACK_REFERENCES_COPY_ONLY');
    if (!info.transcodeSafe) throw Error('TIMELINE_NOT_SUPPORTED: ' + info.transcodeIssues.join(', '));
    const counts = info.sampleCounts, metadataBytes = info.containerMetadataBytes;
    const safeCount = n => Number.isSafeInteger(n) && n >= 0;
    if (!counts || ![counts.video, counts.audio, counts.total, metadataBytes].every(safeCount)
      || !Number.isSafeInteger(counts.video + counts.audio) || counts.total !== counts.video + counts.audio) {
      throw Error('CONVERSION_INDEX_INFO_INVALID');
    }
    if (counts.total > profile.maxSamples) {
      throw Error(`CONVERSION_SAMPLE_LIMIT_EXCEEDED: ${counts.total} > ${profile.maxSamples}`);
    }
    if (profile.maxMetadataBytes !== null && metadataBytes > profile.maxMetadataBytes) {
      throw Error(`CONVERSION_METADATA_LIMIT_EXCEEDED: ${metadataBytes} > ${profile.maxMetadataBytes}`);
    }
  }
}

// Tests exercise the actual lifecycle with delayed cleanup, without pretending
// that substituted codec work verifies real browser encoding or OPFS behavior.
export function createWorkerController({postMessage, inspect = inspectMp4, tag = tagMp4, inspectOutput = inspectOutputMp4, tagOutput = tagOutputMp4, diagnose = diagnoseMp4,
  loadTransform = () => import('./transform.mjs'), loadIndexed = () => import('./indexed/entry.mjs'),
  hash = sha256Blob, finalizeDirect = finalizeDirectOutput} = {}) {
  let job = null;
  const send = (type, extra) => postMessage({type, operationId: job.operationId, inputRevision: job.inputRevision, ...extra});
  const check = () => { if (job.controller.signal.aborted) throw new DOMException('Conversion was canceled.', 'AbortError'); };
  async function clean() {
    job.cleanupAttempts++;
    try { await job.cleanup?.(); job.cleanup = null; job.cleanupError = null; return true; }
    catch (error) {
      job.cleanupError = String(error?.message ?? error);
      job.requiresWorkerTermination ||= !!error?.requiresWorkerTermination;
      return false;
    }
  }
  async function execute(message) {
    const {file, outputHandle} = message, settings = structuredClone(message.settings), clock = performance.now(), timings = {}, events = [];
    const eventLimit = 8;
    let eventsDropped = 0;
    const collectMetrics = value => {
      try {
        const snapshot = structuredClone(value);
        if (events.length === eventLimit) { events.shift(); eventsDropped++; }
        events.push(snapshot);
      } catch { eventsDropped++; }
    };
    const eventLog = () => ({limit: eventLimit, retained: events.length, dropped: eventsDropped});
    const identity = {schemaVersion: 2, operationId: job.operationId, inputRevision: job.inputRevision, saveAttempts: []};
    const directAttempt = outputHandle ? createSaveAttempt(identity, 'direct', {id: message.saveAttemptId ?? crypto.randomUUID()}) : null;
    if (directAttempt) identity.saveAttempts.push(directAttempt);
    let info = null, inputHash = null, inspectionFailed = false, route = {id: settings.executionRoute === 'indexed' && settings.mode === 'convert' ? 'indexed' : 'legacy'};
    job.executionRoute = route.id;
    const applySavedObservation = observation => {
      const v = observation?.verification, sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
      if (route.id !== 'indexed' || !directAttempt || observation?.jobId !== job.operationId
        || observation.outputProfileId !== 'default' || observation.committed !== true
        || !Number.isSafeInteger(observation.bytes) || observation.bytes <= 0
        || !sha(observation.sha256) || v?.wholeFileHashCompared !== false || v?.metadataHashMatched !== true
        || v.savedWriteCommitted !== true || v.savedFileSHA256 !== observation.sha256
        || !sha(v.expectedMetadataHash) || v.expectedMetadataHash !== v.actualMetadataHash
        || !Number.isSafeInteger(v.metadataOffset) || v.metadataOffset < 0
        || !Number.isSafeInteger(v.metadataBytes) || v.metadataBytes <= 0
        || !Number.isSafeInteger(v.metadataOffset + v.metadataBytes)
        || v.metadataOffset + v.metadataBytes !== observation.bytes || observation.savedInfo?.stereoMode !== 2
        || observation.savedInfo?.projection !== 'equi' || observation.savedInfo.width !== settings.eyeSize * 2
        || observation.savedInfo.height !== settings.eyeSize || observation.savedInfo.sampleCounts?.total !== info?.sampleCounts?.total
        || !Number.isFinite(Date.parse(observation.observedAt))) {
        throw Error('INDEXED_SAVED_OBSERVATION_INVALID');
      }
      if (job.savedObservation) {
        if (JSON.stringify(job.savedObservation) !== JSON.stringify(observation)) throw Error('INDEXED_SAVED_OBSERVATION_CHANGED');
        return;
      }
      job.savedObservation = structuredClone(observation);
      job.indexedOutput = {bytes: observation.bytes, sha256: observation.sha256, info: observation.savedInfo, hashBasis: 'post-commit-observed'};
      job.directSave = {...v, status: 'verified', savedObservation: job.savedObservation};
      timings.filePhases = observation.timings?.filePhases ?? null;
      timings.indexedSaveObservation = observation.timings;
      directAttempt.timings.filePhases = timings.filePhases;
      Object.assign(directAttempt, {status: 'verified', commitState: 'committed', verificationState: 'passed',
        bytes: observation.bytes, sha256: observation.sha256, hashBasis: 'post-commit-observed', wholeFileHashCompared: false,
        metadataHashMatched: true, finishedAt: observation.observedAt});
    };
    const mark = async (name, fn) => { const start = performance.now(); try { return await fn(); } finally { timings[name] = performance.now() - start; } };
    const digest = (blob, phase) => hash(blob, {
      signal: job.controller.signal,
      onProgress: ({bytesHashed, totalBytes}) => {
        check();
        send('progress', {progress: {phase, bytesHashed, totalBytes, ratio: totalBytes ? bytesHashed / totalBytes : 1}});
      },
    });
    try {
      route = selectExecutionRoute(settings, {outputHandle, inputBytes: file.size}); job.executionRoute = route.id;
      try { info = await mark('inspect', () => inspect(file, {signal: job.controller.signal})); }
      catch (error) { inspectionFailed = true; throw error; }
      check();
      if (settings.mode === 'inspect') { send('result', {result: {info, build: BUILD}}); return; }
      validate(info, settings, route);
      inputHash = await mark('inputHash', () => digest(file, 'inputHash')); check();
      if (outputHandle && settings.mode !== 'convert') throw Error('DIRECT_OUTPUT_MODE_UNSUPPORTED');
      let media = file, metrics = null, direct = null, indexedResult = null, containerMetadata = null, audioDependencies = null;
      if (settings.mode === 'convert') {
        const module = await mark('transformLoad', route.id === 'indexed' ? loadIndexed : loadTransform); check();
        const convertStereo = route.id === 'indexed' ? module.convertIndexed : module.convertStereo;
        const result = await mark('convert', () => convertStereo(file, settings, {
          signal: job.controller.signal, jobId: job.operationId, operationId: job.operationId, inputRevision: job.inputRevision, outputHandle,
          onRegistry: observation => { job.registry = structuredClone(observation); send('indexed-ownership', {registry: job.registry}); },
          onCleanup: cleanup => { job.cleanup = cleanup; },
          onOutputCreated: output => { job.directOutput = output; directAttempt.commitState = 'pending'; },
          onProgress: progress => send('progress', {progress}), onMetrics: collectMetrics,
        }));
        media = result.file; containerMetadata = result.containerMetadata ?? null; audioDependencies = result.audioDependencies ?? null; job.cleanup = result.cleanup; metrics = result.metrics;
        if (route.id === 'indexed') {
          if (result.kind !== 'indexed-direct-saved' || result.direct || !outputHandle) throw Error('INDEXED_OUTPUT_RESULT_MISMATCH');
          applySavedObservation(result.savedObservation);
          if (media?.size !== job.indexedOutput.bytes) throw Error('INDEXED_SAVED_FILE_SIZE_MISMATCH');
          indexedResult = result; job.registry = result.registry;
        } else {
          direct = result.direct ?? null; job.directOutput = direct?.output ?? job.directOutput ?? null;
          if (Boolean(outputHandle) !== Boolean(direct)) throw Error('DIRECT_OUTPUT_RESULT_MISMATCH');
        }
        check();
      } else if (settings.mode !== 'copy') throw Error('MODE_UNSUPPORTED');
      let blob, outputInfo, outputHash, directSave = null;
      if (indexedResult) {
        blob = indexedResult.file; outputInfo = job.indexedOutput.info; outputHash = job.indexedOutput.sha256;
        directSave = job.directSave;
      } else if (direct) {
        const finalized = await mark('directFinalizeAndSave', () => finalizeDirect(direct, {
          signal: job.controller.signal, onProgress: progress => send('progress', {progress}),
        }));
        blob = finalized.saved.file; outputInfo = finalized.info; outputHash = finalized.saved.sha256;
        directSave = {...finalized.verification, capture: direct.metrics};
        timings.filePhases = finalized.timings ?? null;
        directAttempt.timings.filePhases = timings.filePhases;
        job.directSave = structuredClone(directSave);
        Object.assign(directAttempt, {status: 'verified', commitState: 'committed', verificationState: 'passed',
          bytes: blob.size, sha256: outputHash, hashBasis: 'post-commit-observed', wholeFileHashCompared: false,
          metadataHashMatched: directSave.metadataHashMatched === true, finishedAt: new Date().toISOString()});
      } else {
        blob = await mark('metadata', async () => transferAudioDependenciesToTaggedBlob(
          await transferMetadataToTaggedBlob(
            await (settings.mode === 'convert' ? tagOutput : tag)(media, {layout: settings.mode === 'copy' ? settings.layout : 'sbs', signal: job.controller.signal}),
            containerMetadata, {signal: job.controller.signal}), audioDependencies, {signal: job.controller.signal})); check();
        if (!Number.isSafeInteger(blob.size) || blob.size <= 0) throw Error('OUTPUT_SIZE_INVALID');
        outputInfo = await mark('outputInspect', () => (settings.mode === 'convert' ? inspectOutput : inspect)(blob, {signal: job.controller.signal})); check();
        outputHash = await mark('outputHash', () => digest(blob, 'outputHash')); check();
      }
      timings.outputPrepared = performance.now() - clock;
      const receipt = bindSaveSummary({...identity, build: BUILD,
        status: direct || indexedResult ? 'saved' : 'prepared', settings, input: {bytes: file.size, sha256: inputHash, info, hashBasis: 'whole-input'},
        output: {bytes: blob.size, sha256: outputHash, info: outputInfo, hashBasis: direct || indexedResult ? 'post-commit-observed' : 'prepared-output'},
        hashNote: direct || indexedResult ? 'Input SHA-256 calculated incrementally; whole output SHA-256 observed from the committed file, not compared with a pre-write whole-file hash' : 'SHA-256 calculated incrementally for the complete input and prepared output', timings, metrics, events,
        executionRoute: route.id, ...(route.id === 'indexed' ? {indexedOwnership: job.registry} : {}),
        clock: 'performance.now, worker', nativePeakBytes: null, eventLog: eventLog(),
        containerMetadataTransfer: settings.mode === 'convert' ? (metrics?.containerMetadataTransfer ?? null) : null,
        audioDependencyTransfer: settings.mode === 'convert' ? (metrics?.audioDependencyTransfer ?? null) : null,
        audioMetadataCoverage: settings.mode === 'copy' ? 'original audio track boxes preserved' : 'AAC payload, decoder configuration and supported timeline retained; source roll/prol/sdtp are retained only when audioDependencyTransfer confirms sample metadata verification; seek quality unverified',
        directSave, downloadRecovered: false, targetVRPlayerVerified: false});
      job.prepared = receipt; check();
      send('result', {result: {blob, receipt, info: outputInfo}});
    } catch (error) {
      if (error?.savedObservation) {
        try { applySavedObservation(error.savedObservation); }
        catch (cause) { error = new Error('INDEXED_SAVED_OBSERVATION_INVALID', {cause}); }
      }
      if (error?.registry) job.registry = error.registry;
      const cleanupComplete = await clean();
      timings.failedAfter = performance.now() - clock;
      if (outputHandle) timings.filePhases = {...timings.filePhases, ...error.fileTimings, ...job.directOutput?.timings};
      const metrics = events.at(-1) ?? null;
      const outputState = job.directOutput?.status ?? error.saveOutputState ?? {state: 'not-started', writerAcquired: false, committed: false};
      const committed = outputState.committed === true || error.saveWriteCommitted === true;
      if (directAttempt && directAttempt.verificationState !== 'passed') {
        directAttempt.timings.filePhases = timings.filePhases;
        Object.assign(directAttempt, {status: job.controller.signal.aborted ? 'canceled' : 'failed',
          commitState: committed ? 'committed' : outputState.state === 'not-started' ? 'not-started' : outputState.state === 'aborted' ? 'aborted' : 'unknown',
          verificationState: committed ? job.controller.signal.aborted ? 'canceled' : 'failed' : 'not-run',
          errorCode: error?.message || String(error), finishedAt: new Date().toISOString(),
          cleanup: {status: cleanupComplete ? 'complete' : 'failed', errorCode: job.cleanupError}});
      }
      let structureDiagnostics = null;
      if (inspectionFailed && !job.controller.signal.aborted) {
        try {
          structureDiagnostics = await mark('structureDiagnosis', () => diagnose(file, {signal: job.controller.signal,
            build: BUILD, operation: settings.mode, operationId: job.operationId, inputRevision: job.inputRevision}));
        } catch (diagnosisError) {
          // Preserve the original parser failure even when diagnosis is canceled or limited.
          structureDiagnostics = {status: diagnosisError?.name === 'AbortError' ? 'canceled' : 'unavailable',
            processingAllowed: false, errorCode: diagnosisError?.message ?? String(diagnosisError)};
        }
      }
      timings.failedAfter = performance.now() - clock;
      job.diagnostics = bindSaveSummary({...identity, build: BUILD,
        status: job.controller.signal.aborted ? 'canceled' : 'failed',
        error: {name: error?.name ?? 'Error', message: error?.message || String(error)}, settings,
        input: {bytes: file.size, sha256: inputHash, info, hashBasis: inputHash ? 'whole-input' : null}, output: job.indexedOutput ?? null, timings, metrics,
        executionRoute: route.id, ...(route.id === 'indexed' ? {indexedOwnership: job.registry, internalIndexCleanup: cleanupComplete ? 'complete' : 'pending'} : {}),
        ...(job.prepared ? {preparedBeforeCancel: job.prepared} : {}),
        capabilities: metrics?.capabilities ?? null, structureDiagnostics, events, eventLog: eventLog(), clock: 'performance.now, worker',
        cleanup: {status: cleanupComplete ? 'complete' : 'failed', error: job.cleanupError,
          requiresWorkerTermination: !!job.requiresWorkerTermination},
        directSave: job.directSave ?? (outputHandle ? {status: 'failed', outputState,
          wholeFileHashCompared: false} : null),
        downloadRecovered: false, targetVRPlayerVerified: false});
      send('error', {error: error?.message || String(error), diagnostics: job.diagnostics, cleanupComplete,
        ...(route.id === 'indexed' ? {internalIndexCleanup: cleanupComplete ? 'complete' : 'pending'} : {}),
        cleanupError: job.cleanupError, requiresWorkerTermination: !!job.requiresWorkerTermination});
    }
  }
  return ({data: message}) => {
    if (message.type === 'run') {
      if (job) return;
      job = {operationId: message.operationId, inputRevision: message.inputRevision, controller: new AbortController(),
        cleanup: null, cleanupError: null, cleanupAttempts: 0, stopChain: Promise.resolve(), diagnostics: null, prepared: null, done: false};
      job.task = execute(message).finally(() => { job.done = true; });
      return job.task;
    }
    if (!job || !['cancel', 'release'].includes(message.type)
      || message.operationId !== job.operationId || message.inputRevision !== job.inputRevision || typeof message.requestId !== 'string') return;
    job.controller.abort();
    const waitingForTask = !job.done;
    job.stopChain = job.stopChain.then(async () => {
      await job.task; // Includes writer/codec shutdown; finalizing must finish.
      // Preserve the first cleanup failure; another explicit request retries it.
      const complete = waitingForTask && job.cleanupError ? false : job.cleanup === null ? true : await clean();
      // The output can have finished in the Worker just before the page's cancel
      // message arrives. Preserve that prepared receipt and create a separate
      // cancellation record for the response the page deliberately discarded.
      if (message.type === 'cancel' && !job.diagnostics && job.prepared) {
        job.diagnostics = bindSaveSummary({...job.prepared, status: 'canceled', output: null,
          error: {name: 'AbortError', message: 'Conversion was canceled before the result was accepted.'},
          preparedBeforeCancel: job.prepared,
          cleanup: {status: complete ? 'complete' : 'failed', error: job.cleanupError,
            requiresWorkerTermination: !!job.requiresWorkerTermination}});
      }
      send(complete ? 'cleanup-complete' : 'cleanup-error', {
        requestId: message.requestId, error: job.cleanupError, diagnostics: job.diagnostics,
        requiresWorkerTermination: !!job.requiresWorkerTermination,
        cleanup: {status: complete ? 'complete' : 'failed', attempt: job.cleanupAttempts},
        ...(job.executionRoute === 'indexed' ? {internalIndexCleanup: complete ? 'complete' : 'pending'} : {}),
      });
    }).catch(error => send('cleanup-error', {requestId: message.requestId, error: String(error), diagnostics: job.diagnostics}));
    return job.stopChain;
  };
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = createWorkerController({postMessage: message => self.postMessage(message)});
}
