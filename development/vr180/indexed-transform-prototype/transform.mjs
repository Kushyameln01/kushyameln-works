// Private indexed pixel-conversion prototype; generated from the public transform.
// No public worker, vendor bundle, input admission, or supported limit is changed.
import { buildStereoGeometry } from '../../../docs/shared/vr180/geometry.mjs';
import { createFileOutput } from '../../../docs/shared/vr180/file-output.mjs';
import { inspectMp4 } from '../../../docs/shared/vr180/mp4.mjs';
import { inspectMp4 as inspectOutputMp4 } from '../output-index-prototype/mp4-output-inspect.mjs';
import { sha256Blob } from '../../../docs/shared/vr180/sha256.mjs';
import { createIndexBudget } from '../index-prototype/index-store.mjs';
import { createInputIndex } from '../input-index-prototype/input-index.mjs';
import { createOutputIndex, PROFILE } from '../output-index-prototype/output-index.mjs';

const MAX_SAMPLES = 100_000;
const MAX_OUTPUT_BYTES = 1024 ** 3;
const CACHE_BYTES = 1024 ** 2;
const WRITE_CHUNK_BYTES = 1024 ** 2;
const MAX_METADATA_BYTES = 16 * 1024 ** 2;

function abortError() {
  return new DOMException('Conversion was canceled.', 'AbortError');
}

/** Production direct-mux sink; exposed so the pinned muxer can be tested without WebCodecs. */
export async function createDirectMuxDestination(handle, { signal, onWrite = () => {}, onOutputCreated } = {}) {
  const output = await createFileOutput(handle, { signal, onCreated: onOutputCreated });
  const logicalWriter = output.stream.getWriter();
  let logicalClosed = false;
  const stream = new WritableStream({
    async write({ type, position, data }) {
      if (signal?.aborted) throw abortError();
      if (type !== 'write' || !(data instanceof Uint8Array)
          || !Number.isSafeInteger(position) || position < 0
          || !Number.isSafeInteger(position + data.byteLength)
          || position + data.byteLength > MAX_OUTPUT_BYTES) {
        throw new RangeError('Experimental output limit: 1 GiB; invalid or oversized write.');
      }
      await output.writeAt(position, data);
      onWrite(output.status.extent);
    },
    async close() {
      if (logicalClosed) return;
      await logicalWriter.close(); logicalClosed = true; logicalWriter.releaseLock();
    },
    async abort(reason) {
      await output.abort(reason);
      if (!logicalClosed) { logicalClosed = true; logicalWriter.releaseLock(); }
    },
  }, { highWaterMark: 1 });
  return {
    output, stream,
    finish() {
      const status = output.status;
      if (!status.muxerClosed || status.committed || status.state !== 'open') throw Error('DIRECT_MUX_NOT_FINALIZED');
      return {output, extent: status.extent};
    },
  };
}

export async function cleanupConversionResources({cancelOutput, abortWriter, removeTemporary}) {
  let cancellationError, writerError;
  try { await cancelOutput(); } catch (error) { cancellationError = error; }
  try { await abortWriter(); } catch (error) { writerError = error; }
  if (cancellationError) {
    // Pinned Output.cancel() retains its rejected promise. A writer abort alone
    // cannot prove all codecs closed. Report this, then allow an explicit retry
    // to terminate the failed Worker before main-thread deletion of its own job.
    throw Object.assign(new Error('OUTPUT_CANCEL_FAILED: ' + String(cancellationError?.message ?? cancellationError)
      + (writerError ? '; WRITER_ABORT_FAILED: ' + String(writerError?.message ?? writerError) : '')),
    {requiresWorkerTermination: true});
  }
  if (writerError) throw writerError;
  await removeTemporary();
}

/**
 * Preserve AAC packets, including negative timestamps that encode leading trim.
 * Mediabunny 1.61.5: isobmff-demuxer.ts subtracts elst.media_time;
 * isobmff-muxer.ts processTimestamps/finalize and isobmff-boxes.ts edts restore it.
 * Do not discard negative packets or normalize their timestamps to zero.
 * The caller's MP4 inspection must exclude complex edits and trailing trim.
 */
export function createAacPacketCopier(source, decoderConfig) {
  const sampleRate = decoderConfig?.sampleRate;
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0 || !decoderConfig?.description?.byteLength) {
    throw new Error('AAC sample rate or decoder configuration is missing.');
  }
  let firstTicks, endTicks, firstTimestamp, lastTimestamp, lastDuration;
  let packetCount = 0, inFlight = false, finished = false;
  const ticks = (seconds) => {
    const value = seconds * sampleRate, rounded = Math.round(value);
    const tolerance = Math.max(1e-7, Math.abs(value) * Number.EPSILON * 8);
    if (!Number.isFinite(seconds) || !Number.isSafeInteger(rounded) || Math.abs(value - rounded) > tolerance) {
      throw new Error('AAC timing does not lie on the decoder sample grid.');
    }
    return rounded;
  };
  // Exact Math.round(n/d), including negative ties toward positive infinity.
  const roundRatio = (n, d) => n / d + (n % d >= 0n
    ? (2n * (n % d) >= d ? 1n : 0n)
    : (2n * -(n % d) > d ? -1n : 0n));
  return {
    async add(packet) {
      if (finished) throw new Error('AAC copying is already finished.');
      if (inFlight) throw new Error('An AAC packet is already in flight; await add().');
      const start = ticks(packet.timestamp), duration = ticks(packet.duration);
      if (duration <= 0 || !Number.isSafeInteger(start + duration)) throw new Error('AAC packet duration is invalid.');
      if (endTicks !== undefined && start !== endTicks) throw new Error('AAC packet timestamps must be contiguous.');
      if (packetCount === 0 && start > 0) throw new Error('Delayed AAC track starts are not supported in b1.');
      inFlight = true;
      try {
        // Pass the original packet object; no PCM conversion, packet dropping or timestamp rewrite.
        await source.add(packet, packetCount === 0 ? { decoderConfig } : undefined);
        firstTicks ??= start;
        firstTimestamp ??= packet.timestamp;
        endTicks = start + duration;
        lastTimestamp = packet.timestamp;
        lastDuration = packet.duration;
        packetCount++;
      } finally { inFlight = false; }
    },
    finish() {
      if (inFlight) throw new Error('An AAC packet is still in flight.');
      if (!packetCount || endTicks <= 0) throw new Error('The AAC track has no audible timeline.');
      // Pinned muxer uses a fixed movie timescale and separately rounds span and offset.
      // Reject end times that it cannot reproduce exactly, rather than silently moving a boundary.
      const rate = BigInt(sampleRate), movieScale = 57600n;
      const first = BigInt(firstTicks), end = BigInt(endTicks);
      const expectedEnd = end * movieScale;
      const writtenEnd = roundRatio((end - first) * movieScale, rate) + roundRatio(first * movieScale, rate);
      // Also reproduce the muxer's Number arithmetic after its timestamp shift.
      const actualWrittenEnd = Math.round((lastTimestamp - firstTimestamp + lastDuration) * 57600)
        + Math.round(firstTimestamp * 57600);
      if (expectedEnd % rate !== 0n || writtenEnd !== expectedEnd / rate
          || !Number.isSafeInteger(actualWrittenEnd) || BigInt(actualWrittenEnd) !== writtenEnd) {
        throw new Error('AAC edit duration cannot be preserved exactly at the MP4 movie timescale.');
      }
      finished = true;
      return {
        packetCount, sampleRate, leadingTrimSamples: Math.max(0, -firstTicks),
        firstTimestamp: firstTicks / sampleRate, lastEndTimestamp: endTicks / sampleRate,
      };
    },
  };
}

export function validateIndexedAdmission(info, s) {
  if (s.mode !== 'convert') throw Error('INDEXED_CONVERT_MODE_REQUIRED');
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
    if (counts.total > MAX_SAMPLES) {
      throw Error(`CONVERSION_SAMPLE_LIMIT_EXCEEDED: ${counts.total} > ${MAX_SAMPLES}`);
    }
    if (metadataBytes > MAX_METADATA_BYTES) {
      throw Error(`CONVERSION_METADATA_LIMIT_EXCEEDED: ${metadataBytes} > ${MAX_METADATA_BYTES}`);
    }
  }
}


export const inspectSavedOutput = (file, options) => inspectOutputMp4(file, options);

/** Private direct-file pixel route. One supplied combined-fork module owns every media class. */
export async function convertStereo(file, settings, {
  signal, onProgress, onMetrics, jobId, onCleanup, outputHandle, onOutputCreated, fork, indexRoot, onIndexOwnership,
} = {}) {
  const started = performance.now();
  const {Input, BlobSource, MP4, VideoSampleSink, EncodedPacketSink, CanvasSource,
    EncodedAudioPacketSource, Output, Mp4OutputFormat, StreamTarget, Quality, canEncodeVideo} = fork ?? {};
  if (![Input, BlobSource, VideoSampleSink, EncodedPacketSink, CanvasSource, EncodedAudioPacketSource,
    Output, Mp4OutputFormat, StreamTarget, Quality, canEncodeVideo].every(value => typeof value === 'function') || !MP4) {
    throw Error('ONE_COMBINED_FORK_MODULE_REQUIRED');
  }
  if (!outputHandle?.getFile || !outputHandle?.createWritable || !indexRoot?.getDirectoryHandle) {
    throw Error('INDEXED_ROUTE_REQUIRES_OUTPUT_HANDLE_AND_INDEX_ROOT');
  }
  if (onIndexOwnership !== undefined && typeof onIndexOwnership !== 'function') {
    throw new TypeError('onIndexOwnership must be a function when supplied.');
  }
  const checkAbort = () => { if (signal?.aborted) throw abortError(); };
  checkAbort();
  if (!(file instanceof Blob)) throw new TypeError('Input must be a File or Blob.');
  if (!settings || !Number.isSafeInteger(settings.bitrate) || settings.bitrate <= 0) {
    throw new TypeError('bitrate must be a positive integer in bits per second.');
  }
  const chosenSettings = {
    layout: settings.layout, fov: settings.fov,
    eyeSize: settings.eyeSize, bitrate: settings.bitrate,
  };
  const id = jobId ?? globalThis.crypto?.randomUUID();
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(id)) {
    throw new TypeError('Private jobId must contain 1–60 letters, numbers, underscores or hyphens.');
  }
  if (!globalThis.OffscreenCanvas || !globalThis.VideoEncoder || !globalThis.VideoDecoder || !globalThis.WritableStream) {
    throw new Error('This route requires OffscreenCanvas, WebCodecs and WritableStream.');
  }
  const admission = await inspectMp4(file, {signal});
  validateIndexedAdmission(admission, settings);
  checkAbort();
  const budget = createIndexBudget();


  const metrics = {
    jobId: id, settings: chosenSettings, startedAt: new Date().toISOString(),
    inputBytes: file.size, outputBytes: 0, videoFrames: 0, encodedVideoPackets: 0, audioPackets: 0,
    totalSamples: 0, sourceCacheBudgetBytes: CACHE_BYTES,
    outputLimitBytes: MAX_OUTPUT_BYTES, sampleLimit: MAX_SAMPLES,
    writeChunkBytes: WRITE_CHUNK_BYTES, sourceAnalysisMs: null,
    capabilityCheckMs: null, capabilities: null, temporarySetupMs: null, conversionLoopMs: null,
    videoIteratorWaitMs: 0, canvasDrawMs: 0, videoAddWaitMs: 0,
    audioReadMs: 0, audioAddWaitMs: 0, finalizeMs: null, outputPreparationMs: null,
    totalMs: null, firstVideoTimestamp: null, lastVideoEndTimestamp: null,
    firstAudioTimestamp: null, lastAudioEndTimestamp: null, audioTimeline: null,
    storageQuotaBytes: null, storageUsageBytes: null, storageAvailableBytes: null,
    cpuPeakBytes: null, gpuPeakBytes: null, nativePeakBytes: null,
    containerMetadataGrowth: 'private bounded disk input/output indices; unchanged public sample/metadata/output limits',
    metadataPatched: false, status: 'preparing', cleanupError: null,
    outputBackend: 'private-indexed-direct-file', opfsDirectory: null, admission,
    indexSortBytes: {input: 4 * 1024 ** 2 - PROFILE.sortReservedBytes, output: PROFILE.sortReservedBytes},
    indexBudgetBytes: 8 * 1024 ** 2, inputIndex: null, outputIndex: null,
  };
  let input, output, canvas, directDestination, directOutput, inputIndex, outputIndex, result, failure;
  const pendingCleanup = [];
  let videoIterator, heldSample, audioPacket, audioSink, audioSource, audioCopier, videoSource;
  let cancellationPromise;
  let estimatedDuration = null;
  let lastProgressAt = -Infinity;

  const publishMetrics = () => onMetrics?.({ ...metrics });
  const progress = (phase, timestamp = null, force = false) => {
    const now = performance.now();
    if (!force && now - lastProgressAt < 100) return;
    lastProgressAt = now;
    onProgress?.({
      phase, jobId: id, videoFrames: metrics.videoFrames, audioPackets: metrics.audioPackets,
      outputBytes: metrics.outputBytes, timestamp,
      durationEstimate: estimatedDuration,
      ratio: phase === 'complete' ? 1 : (timestamp !== null && estimatedDuration > 0
        ? Math.min(0.99, Math.max(0, timestamp / estimatedDuration)) : null),
    });
  };
  const cancelOutput = () => {
    // Mediabunny 1.61.5 cannot interrupt finalizing. execute() must finish its
    // awaited finalize before the Worker can acknowledge cleanup.
    if (output && !['finalizing', 'finalized'].includes(output.state)) {
      cancellationPromise ??= output.cancel();
    }
    return cancellationPromise ?? Promise.resolve();
  };
  const onAbort = () => {
    input?.dispose();
    // The awaited cleanup path below observes cancellation errors.
    void cancelOutput().catch(() => {});
  };
  const cleanupResources = async () => {
    const errors = [];
    metrics.inputIndexBeforeCleanup ??= inputIndex?.metrics ?? null;
    metrics.outputIndexBeforeCleanup ??= outputIndex?.metrics ?? null;
    try { if (heldSample) { heldSample.close(); heldSample = null; } } catch (error) { errors.push(error); }
    try { input?.dispose(); } catch (error) { error.requiresWorkerTermination = true; errors.push(error); }
    // A failed codec cancel must not skip abort/owned index cleanup. It remains
    // an explicit Worker-termination requirement, never a claim that codecs closed.
    try { await cleanupConversionResources({cancelOutput,
      abortWriter: async () => { if (directOutput) await directOutput.abort(); },
      removeTemporary: async () => {},
    }); } catch (error) { errors.push(error); }
    for (const cleanup of [...pendingCleanup]) {
      try { await cleanup(); pendingCleanup.splice(pendingCleanup.indexOf(cleanup), 1); } catch (error) { errors.push(error); }
    }
    for (const controller of [outputIndex, inputIndex]) {
      try { await controller?.dispose(); } catch (error) { errors.push(error); }
    }
    metrics.inputIndex = inputIndex?.metrics ?? null; metrics.outputIndex = outputIndex?.metrics ?? null;
    metrics.indexReservedAfterCleanup = budget.usedBytes;
    if (errors.length) throw Object.assign(new Error(errors.map(error => error.message).join('; ')),
      {requiresWorkerTermination: errors.some(error => error.requiresWorkerTermination), causes: errors});
  };
  const acquire = async factory => {
    try { return await factory(); }
    catch (error) { if (error.retryCleanup) pendingCleanup.push(error.retryCleanup); throw error; }
  };
  const prepareIndexOwnership = async kind => {
    checkAbort();
    const ownerToken = [...globalThis.crypto.getRandomValues(new Uint8Array(16))]
      .map(value => value.toString(16).padStart(2, '0')).join('');
    const ticket = Object.freeze({format: 'vr180-private-index-owner', schema: 1,
      jobId: `${id}-${kind === 'input' ? 'in' : 'out'}`, ownerToken, kind});
    // The caller may persist this exact ticket before the corresponding job
    // exists. A resolved callback is its acknowledgment, not proof of storage.
    await onIndexOwnership?.(ticket);
    checkAbort();
    return ticket;
  };
  // Register before acquiring resources, so the Worker can retry a failed
  // deletion after convertStereo has rejected and its finally has completed.
  onCleanup?.(cleanupResources);
  const countSample = () => {
    checkAbort();
    if (metrics.totalSamples >= MAX_SAMPLES) throw new RangeError('Experimental limit: 100000 total samples.');
    metrics.totalSamples++;
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    progress('inspect', null, true);
    const analysisStart = performance.now();
    const inputOwnership = await prepareIndexOwnership('input');
    input = new Input({ source: new BlobSource(file, { maxCacheSize: CACHE_BYTES, useStreamReader: false }), formats: [MP4] });
    inputIndex = await acquire(() => createInputIndex({source: file, root: indexRoot, jobId: inputOwnership.jobId, ownerToken: inputOwnership.ownerToken,
      budget, signal, sortBytes: 4 * 1024 ** 2 - PROFILE.sortReservedBytes}));
    input._vr180InputIndex = inputIndex; // Must precede the first getTracks/readMetadata.
    const tracks = await input.getTracks();
    const videos = tracks.filter(track => track.type === 'video');
    const audios = tracks.filter(track => track.type === 'audio');
    if (videos.length !== 1 || audios.length > 1 || tracks.length !== videos.length + audios.length) {
      throw new Error('b1 requires exactly one video track and at most one audio track, without other tracks.');
    }
    const video = videos[0];
    const audio = audios[0];
    const [codec, hdr, rotation, flip, par, width, height] = await Promise.all([
      video.getCodec(), video.hasHighDynamicRange(), video.getRotation(), video.getFlip(),
      video.getPixelAspectRatio(), video.getDisplayWidth(), video.getDisplayHeight(),
    ]);
    checkAbort();
    if (codec !== 'avc') throw new Error('b1 pixel conversion accepts H.264 video only.');
    if (hdr) throw new Error('HDR conversion is not supported in b1.');
    if (rotation !== 0 || flip || !par || par.num !== par.den || par.num <= 0) {
      throw new Error('b1 requires unrotated, unflipped video with square pixels.');
    }
    const geometry = buildStereoGeometry({ width, height, ...chosenSettings });
    estimatedDuration = await input.getDurationFromMetadata();
    let audioConfig;
    if (audio) {
      if (await audio.getCodec() !== 'aac') throw new Error('b1 preserves AAC audio only; audio will not be silently removed.');
      audioConfig = await audio.getDecoderConfig();
      if (!audioConfig?.description?.byteLength) throw new Error('AAC decoder configuration is missing.');
      audioSink = new EncodedPacketSink(audio);
      const readStarted = performance.now();
      audioPacket = await audioSink.getFirstPacket();
      metrics.audioReadMs += performance.now() - readStarted;
      if (!audioPacket) throw new Error('The audio track has no packets.');
    }
    metrics.sourceAnalysisMs = performance.now() - analysisStart;

    const capabilityStart = performance.now();
    const quality = new Quality({ bitrate: chosenSettings.bitrate, bitrateMode: 'variable' });
    metrics.capabilities = {
      input: { codec, width, height, decodable: null },
      output: { codec: 'avc', width: geometry.width, height: geometry.height,
        bitrate: chosenSettings.bitrate, latencyMode: 'quality', encodable: null },
    };
    try {
      metrics.capabilities.input.decodable = await video.canDecode();
      metrics.capabilities.output.encodable = await canEncodeVideo('avc', {
        width: geometry.width, height: geometry.height, quality, latencyMode: 'quality',
      });
    } finally { metrics.capabilityCheckMs = performance.now() - capabilityStart; }
    checkAbort();
    const { decodable } = metrics.capabilities.input, { encodable } = metrics.capabilities.output;
    if (!decodable && !encodable) throw new Error('INPUT_DECODE_AND_OUTPUT_ENCODE_UNSUPPORTED');
    if (!decodable) throw new Error('INPUT_DECODE_UNSUPPORTED');
    if (!encodable) throw new Error('OUTPUT_ENCODE_UNSUPPORTED');

    const outputOwnership = await prepareIndexOwnership('output');
    canvas = new OffscreenCanvas(geometry.width, geometry.height);
    const context = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
    if (!context) throw new Error('A 2D OffscreenCanvas could not be created.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    videoSource = new CanvasSource(canvas, {
      codec: 'avc', quality, latencyMode: 'quality',
      onEncodedPacket() { metrics.encodedVideoPackets++; },
    });
    if (audio) {
      audioSource = new EncodedAudioPacketSource('aac');
      audioCopier = createAacPacketCopier(audioSource, audioConfig);
    }

    const setupStart = performance.now();
    outputIndex = await acquire(() => createOutputIndex({root: indexRoot, jobId: outputOwnership.jobId,
      ownerToken: outputOwnership.ownerToken, budget, signal, layout: 'sbs'}));
    directDestination = await createDirectMuxDestination(outputHandle, {
      signal, onWrite: extent => { metrics.outputBytes = extent; },
      onOutputCreated: acquired => { directOutput = acquired; onOutputCreated?.(acquired); },
    });
    const format = new Mp4OutputFormat({fastStart: false}); format._options.vr180Index = outputIndex;
    output = new Output({format,
      target: new StreamTarget(directDestination.stream, {chunked: true, chunkSize: WRITE_CHUNK_BYTES}),
    });
    output.addVideoTrack(videoSource);
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();
    checkAbort();
    metrics.temporarySetupMs = performance.now() - setupStart;
    metrics.status = 'converting';
    publishMetrics();

    const addAudioPacket = async () => {
      const packet = audioPacket;
      countSample();
      const addStarted = performance.now();
      await audioCopier.add(packet);
      metrics.audioAddWaitMs += performance.now() - addStarted;
      metrics.firstAudioTimestamp ??= packet.timestamp;
      metrics.lastAudioEndTimestamp = packet.timestamp + packet.duration;
      metrics.audioPackets++;
      const readStarted = performance.now();
      audioPacket = await audioSink.getNextPacket(packet);
      metrics.audioReadMs += performance.now() - readStarted;
    };

    const loopStart = performance.now();
    let lastVideoTimestamp = -Infinity;
    videoIterator = new VideoSampleSink(video).samples();
    while (true) {
      checkAbort();
      const nextStarted = performance.now();
      const next = await videoIterator.next();
      metrics.videoIteratorWaitMs += performance.now() - nextStarted;
      if (next.done) break;
      heldSample = next.value;
      try {
        const sample = heldSample;
        if (sample.displayWidth !== width || sample.displayHeight !== height) {
          throw new Error('Video dimensions changed during conversion.');
        }
        if (!Number.isFinite(sample.timestamp) || !Number.isFinite(sample.duration)
            || sample.duration <= 0 || sample.timestamp < lastVideoTimestamp) {
          throw new Error('Video frame timing is invalid or non-monotonic.');
        }
        while (audioPacket && audioPacket.timestamp <= sample.timestamp) await addAudioPacket();
        countSample();
        const drawStarted = performance.now();
        for (const eye of geometry.eyes) {
          sample.draw(context, eye.sx, eye.sy, eye.sw, eye.sh, eye.dx, eye.dy, eye.dw, eye.dh);
        }
        metrics.canvasDrawMs += performance.now() - drawStarted;
        const addStarted = performance.now();
        await videoSource.add(sample.timestamp, sample.duration);
        metrics.videoAddWaitMs += performance.now() - addStarted;
        metrics.firstVideoTimestamp ??= sample.timestamp;
        metrics.lastVideoEndTimestamp = sample.timestamp + sample.duration;
        metrics.videoFrames++;
        lastVideoTimestamp = sample.timestamp;
        progress('convert', sample.timestamp + sample.duration);
      } finally {
        heldSample.close();
        heldSample = null;
      }
    }
    if (metrics.videoFrames === 0) throw new Error('The video track produced no frames.');
    videoSource.close();
    while (audioPacket) await addAudioPacket();
    if (audioCopier) metrics.audioTimeline = audioCopier.finish();
    audioSource?.close();
    metrics.conversionLoopMs = performance.now() - loopStart;
    checkAbort();
    progress('finalize', null, true);
    const finalizeStarted = performance.now();
    await output.finalize();
    metrics.finalizeMs = performance.now() - finalizeStarted;
    checkAbort();
    if (metrics.encodedVideoPackets !== metrics.videoFrames) {
      throw new Error('The encoder did not emit one video packet per submitted frame.');
    }
    const prepareStarted = performance.now();
    const direct = directDestination.finish();
    metrics.outputBytes = direct.extent;
    if (!metrics.outputBytes || metrics.outputBytes > MAX_OUTPUT_BYTES) throw Error('The finalized output size is invalid.');
    const indexed = outputIndex.metrics;
    if (!indexed.metadataClosed || !indexed.verification || indexed.sampleCount !== metrics.totalSamples
      || indexed.verification.sampleCounts.total !== metrics.totalSamples) throw Error('INDEXED_METADATA_NOT_VERIFIED');
    const offset = indexed.moovPosition, metadataBytes = indexed.moovBytes;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(metadataBytes) || metadataBytes <= 0
      || offset + metadataBytes !== metrics.outputBytes
      || metadataBytes > MAX_METADATA_BYTES) throw Error('INDEXED_METADATA_EXTENT_INVALID');
    const expectedMetadataHash = await sha256Blob(outputIndex.metadataSource.slice(offset, metrics.outputBytes), {signal});
    checkAbort();
    const saved = await direct.output.commit({expectedBytes: metrics.outputBytes});
    checkAbort();
    const actualMetadataHash = await sha256Blob(saved.file.slice(offset), {signal});
    if (actualMetadataHash !== expectedMetadataHash) throw Error('INDEXED_SAVED_METADATA_HASH_MISMATCH');
    const savedInfo = await inspectSavedOutput(saved.file, {signal});
    if (savedInfo.stereoMode !== 2 || savedInfo.projection !== 'equi' || savedInfo.width !== geometry.width
      || savedInfo.height !== geometry.height || savedInfo.sampleCounts.total !== metrics.totalSamples) {
      throw Error('INDEXED_SAVED_OUTPUT_INVALID');
    }
    metrics.metadataPatched = true;
    metrics.inputIndex = inputIndex.metrics; metrics.outputIndex = outputIndex.metrics;
    metrics.outputPreparationMs = performance.now() - prepareStarted;
    metrics.totalMs = performance.now() - started;
    metrics.status = 'saved-and-verified';
    checkAbort();
    publishMetrics();
    progress('complete', metrics.lastVideoEndTimestamp, true);
    const info = {
      layout: 'sbs', fov: 180, eyeSize: chosenSettings.eyeSize,
      width: geometry.width, height: geometry.height,
      videoCodec: 'avc', audioCodec: audio ? 'aac' : null,
      requiresMetadataPatch: false, opfsDirectory: null,
    };
    result = {file: saved.file, saved, cleanup: cleanupResources, metrics, info, savedInfo,
      verification: {wholeFileHashCompared: false, savedFileSHA256: saved.sha256, metadataHashMatched: true,
        expectedMetadataHash, metadataOffset: offset, metadataBytes, savedWriteCommitted: true}};
    return result;
  } catch (error) {
    metrics.status = signal?.aborted ? 'canceled' : 'failed';
    metrics.error = signal?.aborted ? 'Conversion was canceled.' : String(error?.message ?? error);
    failure = signal?.aborted && error.name !== 'AbortError' ? Object.assign(abortError(), {cause: error}) : error;
    if (outputHandle) {
      const priorState = error.saveOutputState;
      Object.defineProperty(failure, 'saveOutputState', {enumerable: true, configurable: true,
        get: () => directOutput?.status ?? priorState ?? {state: 'not-started', writerAcquired: false, committed: false}});
      failure.saveWriteCommitted = failure.saveOutputState.committed === true;
      if (error.retryCleanup) failure.retryCleanup = error.retryCleanup;
      if (error.cleanupError) failure.cleanupError = error.cleanupError;
    }
    throw failure;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    const releaseErrors = [];
    try { await cleanupResources(); } catch (error) { releaseErrors.push(error); }
    try { await videoIterator?.return(); } catch { /* Input disposal cancels the decoder. */ }
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    metrics.totalMs = performance.now() - started;
    if (releaseErrors.length) {
      metrics.cleanupError = releaseErrors.map(error => error.message).join('; ');
      const cleanupFailure = failure ?? Error('INDEXED_CLEANUP_FAILED: ' + metrics.cleanupError);
      cleanupFailure.cleanupError = metrics.cleanupError; cleanupFailure.retryCleanup = cleanupResources;
      cleanupFailure.requiresWorkerTermination = releaseErrors.some(error => error.requiresWorkerTermination);
      if (!failure) Object.defineProperty(cleanupFailure, 'saveOutputState', {enumerable: true,
        get: () => directOutput?.status ?? {state: 'not-started', writerAcquired: false, committed: false}});
      cleanupFailure.saveWriteCommitted = directOutput?.status.committed === true;
      if (!failure) throw cleanupFailure;
    }
    try { publishMetrics(); } catch (error) { metrics.metricsCallbackError = String(error?.message ?? error); }
  }
}
