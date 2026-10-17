import {inspectMp4, tagMp4} from './mp4.mjs';
import {sha256Blob} from './sha256.mjs';
const BUILD = 'vr180-b4-range1';
// The current conversion demuxer/muxer retains sample indices and moov bytes.
// Admit bounded inputs before hashing or loading it; paged copy does not need
// these conversion-only limits.
const MAX_CONVERSION_SAMPLES = 100000;
const MAX_CONVERSION_METADATA_BYTES = 16 * 1024 * 1024;
function validate(info, s) {
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
    if (!info.transcodeSafe) throw Error('TIMELINE_NOT_SUPPORTED: ' + info.transcodeIssues.join(', '));
    const counts = info.sampleCounts, metadataBytes = info.containerMetadataBytes;
    const safeCount = n => Number.isSafeInteger(n) && n >= 0;
    if (!counts || ![counts.video, counts.audio, counts.total, metadataBytes].every(safeCount)
      || !Number.isSafeInteger(counts.video + counts.audio) || counts.total !== counts.video + counts.audio) {
      throw Error('CONVERSION_INDEX_INFO_INVALID');
    }
    if (counts.total > MAX_CONVERSION_SAMPLES) {
      throw Error(`CONVERSION_SAMPLE_LIMIT_EXCEEDED: ${counts.total} > ${MAX_CONVERSION_SAMPLES}`);
    }
    if (metadataBytes > MAX_CONVERSION_METADATA_BYTES) {
      throw Error(`CONVERSION_METADATA_LIMIT_EXCEEDED: ${metadataBytes} > ${MAX_CONVERSION_METADATA_BYTES}`);
    }
  }
}

// Tests exercise the actual lifecycle with delayed cleanup, without pretending
// that substituted codec work verifies real browser encoding or OPFS behavior.
export function createWorkerController({postMessage, inspect = inspectMp4, tag = tagMp4,
  loadTransform = () => import('./transform.mjs'), hash = sha256Blob} = {}) {
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
    const {file, settings} = message, clock = performance.now(), timings = {}, events = [];
    let info = null, inputHash = null;
    const mark = async (name, fn) => { const start = performance.now(); try { return await fn(); } finally { timings[name] = performance.now() - start; } };
    const digest = (blob, phase) => hash(blob, {
      signal: job.controller.signal,
      onProgress: ({bytesHashed, totalBytes}) => {
        check();
        send('progress', {progress: {phase, bytesHashed, totalBytes, ratio: totalBytes ? bytesHashed / totalBytes : 1}});
      },
    });
    try {
      info = await mark('inspect', () => inspect(file, {signal: job.controller.signal})); check();
      if (settings.mode === 'inspect') { send('result', {result: {info, build: BUILD}}); return; }
      validate(info, settings);
      inputHash = await mark('inputHash', () => digest(file, 'inputHash')); check();
      let media = file, metrics = null;
      if (settings.mode === 'convert') {
        const {convertStereo} = await mark('transformLoad', loadTransform); check();
        const result = await mark('convert', () => convertStereo(file, settings, {
          signal: job.controller.signal, jobId: job.operationId,
          onCleanup: cleanup => { job.cleanup = cleanup; },
          onProgress: progress => send('progress', {progress}), onMetrics: value => events.push(value),
        }));
        media = result.file; job.cleanup = result.cleanup; metrics = result.metrics; check();
      } else if (settings.mode !== 'copy') throw Error('MODE_UNSUPPORTED');
      const blob = await mark('metadata', () => tag(media, {layout: settings.mode === 'copy' ? settings.layout : 'sbs', signal: job.controller.signal})); check();
      const outputInfo = await mark('outputInspect', () => inspect(blob, {signal: job.controller.signal})); check();
      const outputHash = await mark('outputHash', () => digest(blob, 'outputHash')); check();
      timings.outputPrepared = performance.now() - clock;
      const receipt = {schemaVersion: 1, build: BUILD, operationId: job.operationId, inputRevision: job.inputRevision,
        status: 'prepared', settings, input: {bytes: file.size, sha256: inputHash, info}, output: {bytes: blob.size, sha256: outputHash, info: outputInfo},
        hashNote: 'SHA-256 calculated incrementally for the complete input and prepared output', timings, metrics, events,
        clock: 'performance.now, worker', nativePeakBytes: null,
        audioMetadataCoverage: settings.mode === 'copy' ? 'original audio track boxes preserved' : 'AAC payload, decoder configuration and supported timeline retained; seek-preroll sample groups are not reproduced by the muxer; seek quality unverified',
        saveWriteCommitted: false, saveCompleted: false, downloadRecovered: false, targetVRPlayerVerified: false};
      job.prepared = receipt;
      send('result', {result: {blob, receipt, info: outputInfo}});
    } catch (error) {
      const cleanupComplete = await clean();
      timings.failedAfter = performance.now() - clock;
      const metrics = events.at(-1) ?? null;
      job.diagnostics = {schemaVersion: 1, build: BUILD, operationId: job.operationId, inputRevision: job.inputRevision,
        status: job.controller.signal.aborted ? 'canceled' : 'failed',
        error: {name: error?.name ?? 'Error', message: error?.message || String(error)}, settings,
        input: {bytes: file.size, sha256: inputHash, info}, output: null, timings, metrics,
        capabilities: metrics?.capabilities ?? null, events, clock: 'performance.now, worker',
        cleanup: {status: cleanupComplete ? 'complete' : 'failed', error: job.cleanupError,
          requiresWorkerTermination: !!job.requiresWorkerTermination},
        saveWriteCommitted: false, saveCompleted: false, downloadRecovered: false, targetVRPlayerVerified: false};
      send('error', {error: error?.message || String(error), diagnostics: job.diagnostics, cleanupComplete,
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
        job.diagnostics = {...job.prepared, status: 'canceled', output: null,
          error: {name: 'AbortError', message: 'Conversion was canceled before the result was accepted.'},
          preparedBeforeCancel: job.prepared,
          cleanup: {status: complete ? 'complete' : 'failed', error: job.cleanupError,
            requiresWorkerTermination: !!job.requiresWorkerTermination}};
      }
      send(complete ? 'cleanup-complete' : 'cleanup-error', {
        requestId: message.requestId, error: job.cleanupError, diagnostics: job.diagnostics,
        requiresWorkerTermination: !!job.requiresWorkerTermination,
        cleanup: {status: complete ? 'complete' : 'failed', attempt: job.cleanupAttempts},
      });
    }).catch(error => send('cleanup-error', {requestId: message.requestId, error: String(error), diagnostics: job.diagnostics}));
    return job.stopChain;
  };
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = createWorkerController({postMessage: message => self.postMessage(message)});
}
