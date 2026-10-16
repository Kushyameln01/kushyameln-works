import {
  Input, BlobSource, MP4, VideoSampleSink, EncodedPacketSink,
  CanvasSource, EncodedAudioPacketSource, Output, Mp4OutputFormat,
  StreamTarget, Quality, canEncodeVideo,
} from '../media-basic/vendor/mediabunny.mjs';
import { buildStereoGeometry } from './geometry.mjs';

const MAX_SAMPLES = 100_000;
const MAX_OUTPUT_BYTES = 1024 ** 3;
const CACHE_BYTES = 1024 ** 2;
const WRITE_CHUNK_BYTES = 1024 ** 2;
const OPFS_ROOT = 'vr180-jobs';

function abortError() {
  return new DOMException('Conversion was canceled.', 'AbortError');
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

/**
 * b1 pixel route. The caller must first require inspectMp4(...).transcodeSafe;
 * this module additionally checks the actual decoder track properties.
 * The returned OPFS File remains available until cleanup() is awaited.
 * VR metadata is deliberately left to the independent MP4 patcher.
 */
export async function convertStereo(file, settings, {
  signal, onProgress, onMetrics, jobId,
} = {}) {
  const started = performance.now();
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
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(id)) {
    throw new TypeError('jobId must contain 1–96 letters, numbers, underscores or hyphens.');
  }
  if (!globalThis.navigator?.storage?.getDirectory || !globalThis.OffscreenCanvas
      || !globalThis.VideoEncoder || !globalThis.VideoDecoder || !globalThis.WritableStream) {
    throw new Error('This route requires OPFS, OffscreenCanvas, WebCodecs and WritableStream.');
  }

  const metrics = {
    jobId: id, settings: chosenSettings, startedAt: new Date().toISOString(),
    inputBytes: file.size, outputBytes: 0, videoFrames: 0, encodedVideoPackets: 0, audioPackets: 0,
    totalSamples: 0, sourceCacheBudgetBytes: CACHE_BYTES,
    outputLimitBytes: MAX_OUTPUT_BYTES, sampleLimit: MAX_SAMPLES,
    writeChunkBytes: WRITE_CHUNK_BYTES, sourceAnalysisMs: null,
    capabilityCheckMs: null, temporarySetupMs: null, conversionLoopMs: null,
    videoIteratorWaitMs: 0, canvasDrawMs: 0, videoAddWaitMs: 0,
    audioReadMs: 0, audioAddWaitMs: 0, finalizeMs: null, outputPreparationMs: null,
    totalMs: null, firstVideoTimestamp: null, lastVideoEndTimestamp: null,
    firstAudioTimestamp: null, lastAudioEndTimestamp: null, audioTimeline: null,
    storageQuotaBytes: null, storageUsageBytes: null, storageAvailableBytes: null,
    cpuPeakBytes: null, gpuPeakBytes: null, nativePeakBytes: null,
    containerMetadataGrowth: 'O(total samples); media buffers are streamed',
    metadataPatched: false, status: 'preparing', cleanupError: null,
    opfsDirectory: `${OPFS_ROOT}/${id}`,
  };
  let input, output, canvas, storageWriter, root, temporaryDirectory;
  let videoIterator, heldSample, audioPacket, audioSink, audioSource, audioCopier, videoSource;
  let temporaryCreated = false;
  let storageClosed = false;
  let succeeded = false;
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
    if (output && output.state !== 'finalized') {
      cancellationPromise ??= output.cancel();
    }
    return cancellationPromise ?? Promise.resolve();
  };
  const onAbort = () => {
    input?.dispose();
    // The awaited cleanup path below observes cancellation errors.
    void cancelOutput().catch(() => {});
  };
  const removeTemporary = async () => {
    if (!temporaryCreated) return;
    try {
      await root.removeEntry(id, { recursive: true });
      temporaryCreated = false;
    } catch (error) {
      if (error.name !== 'NotFoundError') throw error;
      temporaryCreated = false;
    }
  };
  const countSample = () => {
    checkAbort();
    if (metrics.totalSamples >= MAX_SAMPLES) throw new RangeError('Experimental limit: 100000 total samples.');
    metrics.totalSamples++;
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    progress('inspect', null, true);
    const analysisStart = performance.now();
    input = new Input({ source: new BlobSource(file, { maxCacheSize: CACHE_BYTES }), formats: [MP4] });
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
    const canDecode = await video.canDecode();
    const canEncode = await canEncodeVideo('avc', {
      width: geometry.width, height: geometry.height, quality, latencyMode: 'quality',
    });
    checkAbort();
    if (!canDecode || !canEncode) throw new Error('This browser cannot decode the input or encode the requested H.264 dimensions.');
    metrics.capabilityCheckMs = performance.now() - capabilityStart;

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
    if (navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      metrics.storageQuotaBytes = Number.isFinite(estimate.quota) ? estimate.quota : null;
      metrics.storageUsageBytes = Number.isFinite(estimate.usage) ? estimate.usage : null;
      if (metrics.storageQuotaBytes !== null && metrics.storageUsageBytes !== null) {
        metrics.storageAvailableBytes = Math.max(0, estimate.quota - estimate.usage);
        if (metrics.storageAvailableBytes < WRITE_CHUNK_BYTES) throw new Error('Insufficient estimated OPFS space to start conversion.');
      }
    }
    root = await (await navigator.storage.getDirectory()).getDirectoryHandle(OPFS_ROOT, { create: true });
    try {
      await root.getDirectoryHandle(id);
      throw new Error('The job temporary directory already exists; use a new jobId.');
    } catch (error) {
      if (error.name !== 'NotFoundError') throw error;
    }
    checkAbort();
    temporaryDirectory = await root.getDirectoryHandle(id, { create: true });
    temporaryCreated = true;
    const outputHandle = await temporaryDirectory.getFileHandle('converted.mp4', { create: true });
    storageWriter = await outputHandle.createWritable();
    const writable = new WritableStream({
      async write({ type, position, data }) {
        checkAbort();
        if (type !== 'write' || !Number.isSafeInteger(position) || position < 0
            || !Number.isSafeInteger(position + data.byteLength)
            || position + data.byteLength > MAX_OUTPUT_BYTES) {
          throw new RangeError('Experimental output limit: 1 GiB; invalid or oversized write.');
        }
        await storageWriter.write({ type: 'write', position, data });
        metrics.outputBytes = Math.max(metrics.outputBytes, position + data.byteLength);
      },
      async close() {
        if (storageClosed) return;
        await storageWriter.close();
        storageClosed = true;
      },
      async abort(reason) {
        if (storageClosed) return;
        await storageWriter.abort(reason);
        storageClosed = true;
      },
    }, { highWaterMark: 1 });
    output = new Output({
      format: new Mp4OutputFormat({ fastStart: false }),
      target: new StreamTarget(writable, { chunked: true, chunkSize: WRITE_CHUNK_BYTES }),
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
    const resultFile = await outputHandle.getFile();
    if (!resultFile.size || resultFile.size > MAX_OUTPUT_BYTES) throw new Error('The finalized output size is invalid.');
    metrics.outputBytes = resultFile.size;
    metrics.outputPreparationMs = performance.now() - prepareStarted;
    metrics.totalMs = performance.now() - started;
    metrics.status = 'converted-awaiting-metadata';
    checkAbort();
    publishMetrics();
    progress('complete', metrics.lastVideoEndTimestamp, true);
    const info = {
      layout: 'sbs', fov: 180, eyeSize: chosenSettings.eyeSize,
      width: geometry.width, height: geometry.height,
      videoCodec: 'avc', audioCodec: audio ? 'aac' : null,
      requiresMetadataPatch: true, opfsDirectory: metrics.opfsDirectory,
    };
    succeeded = true;
    return { file: resultFile, cleanup: removeTemporary, metrics: { ...metrics }, info };
  } catch (error) {
    metrics.status = signal?.aborted ? 'canceled' : 'failed';
    metrics.error = signal?.aborted ? 'Conversion was canceled.' : String(error?.message ?? error);
    throw signal?.aborted ? abortError() : error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    heldSample?.close();
    input?.dispose();
    try { await videoIterator?.return(); } catch { /* Input disposal already canceled the decoder. */ }
    if (!succeeded) {
      try { await cancelOutput(); } catch (error) { metrics.cancelError = String(error?.message ?? error); }
      if (storageWriter && !storageClosed) {
        try { await storageWriter.abort(); storageClosed = true; }
        catch (error) { metrics.storageCloseError = String(error?.message ?? error); }
      }
      try { await removeTemporary(); }
      catch (error) { metrics.cleanupError = String(error?.message ?? error); }
      metrics.totalMs = performance.now() - started;
      // Reporting must not replace the original failure or skip canvas release.
      try { publishMetrics(); }
      catch (error) { metrics.metricsCallbackError = String(error?.message ?? error); }
    }
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
