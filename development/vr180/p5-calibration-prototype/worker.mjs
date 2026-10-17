// Reconstructed from recorded source, with subsequent calibration review fixes.
import * as M from '/fork.mjs';
import {FRAME_PROFILE, fillCalibrationFrame} from './frame.mjs';
import {createOutputIndex} from '../output-index-prototype/output-index.mjs';
import {convertStereo} from '../indexed-transform-prototype/transform.mjs';
import {createFileOutput} from '../../../docs/shared/vr180/file-output.mjs';
import {inspectMp4} from '../../../docs/shared/vr180/mp4.mjs';
import {sha256Blob} from '../../../docs/shared/vr180/sha256.mjs';
const MiB = 1024 ** 2, MAX_FILE = 80 * MiB, MAX_PAIR = 120 * MiB;
const require = (ok, message) => { if (!ok) throw Error(message); };
const describe = e => ({name: e.name, message: e.message, status: e.status ?? null});
async function allCleanup(actions) {
  const errors = []; for (const action of actions) try { await action(); } catch (e) { errors.push(e); }
  if (errors.length) throw new AggregateError(errors, errors.map(e => e.message).join('; '));
}
async function absent(root, name) { try { await root.getDirectoryHandle(name); return false; } catch (e) { if (e.name === 'NotFoundError') return true; throw e; } }
async function generate(root, jobId, handle, bitrate) {
  const stats = {frames: 300, fps: 30, seconds: 10, requestedBitrate: bitrate, packets: 0, payloadBytes: 0,
    maxPacketBytes: 0, encoderConfigCandidates: [], droppedEncoderConfigCandidates: 0, actualDecoderConfig: null,
    decoderConfigEvents: 0, selectedEncoderConfigObserved: false, drawMs: 0, nativeMemoryMeasured: false,
    latencyMode: 'realtime', packetTimestampsStrictlyIncreasing: true};
  let previousTimestamp = -Infinity;
  const started = performance.now(); let index, tx, output, writer, source, canvas, cleanupError;
  try {
    const quality = new M.Quality({bitrate, bitrateMode: 'variable'});
    // The unchanged public input profile rejects cslg. Conversion still uses quality mode.
    require(await M.canEncodeVideo('avc', {width: 1024, height: 512, quality, latencyMode: 'realtime'}), 'CALIBRATION_ENCODER_UNSUPPORTED');
    canvas = new OffscreenCanvas(1024, 512); const context = canvas.getContext('2d', {alpha: false, colorSpace: 'srgb'});
    require(context, 'CANVAS_UNAVAILABLE'); const pixels = context.createImageData(1024, 512);
    index = await createOutputIndex({root, jobId, layout: 'sbs'}); tx = await createFileOutput(handle); writer = tx.stream.getWriter();
    const format = new M.Mp4OutputFormat({fastStart: false}); format._options.vr180Index = index;
    output = new M.Output({format, target: new M.StreamTarget(new WritableStream({
      async write(value) { require(value?.data instanceof Uint8Array && Number.isSafeInteger(value.position) && value.position >= 0
        && value.position + value.data.length <= MAX_FILE, 'CALIBRATION_INPUT_FILE_LIMIT'); await writer.write(value); },
      close() { return writer.close(); }, abort(reason) { return writer.abort(reason); },
    }, {highWaterMark: 1}), {chunked: true, chunkSize: MiB})});
    source = new M.CanvasSource(canvas, {codec: 'avc', quality, latencyMode: 'realtime', keyFrameInterval: 2,
      // Fixed upstream calls this before selection. Never report these as selected settings.
      onEncoderConfig(config) { if (stats.encoderConfigCandidates.length < 8) stats.encoderConfigCandidates.push({...config}); else stats.droppedEncoderConfigCandidates++; },
      onEncodedPacket(packet, meta) {
        stats.packets++; stats.payloadBytes += packet.data.length; stats.maxPacketBytes = Math.max(stats.maxPacketBytes, packet.data.length);
        if (meta?.decoderConfig) {
          stats.decoderConfigEvents++;
          if (!stats.actualDecoderConfig) {
            const config = meta.decoderConfig;
            require(typeof config.codec === 'string' && config.codec.length <= 128, 'ACTUAL_DECODER_CODEC_UNAVAILABLE');
            stats.actualDecoderConfig = {source: 'first encoded packet metadata', codec: config.codec,
              codedWidth: config.codedWidth, codedHeight: config.codedHeight, descriptionBytes: config.description?.byteLength ?? 0};
          }
        }
        stats.packetTimestampsStrictlyIncreasing &&= Number.isFinite(packet.timestamp) && packet.timestamp > previousTimestamp;
        previousTimestamp = packet.timestamp;
      },
    });
    output.addVideoTrack(source, {frameRate: 30}); await output.start();
    const addStarted = performance.now();
    for (let frame = 0; frame < 300; frame++) {
      const drawStarted = performance.now(); fillCalibrationFrame(pixels.data, frame); context.putImageData(pixels, 0, 0);
      stats.drawMs += performance.now() - drawStarted; await source.add(frame / 30, 1 / 30);
    }
    stats.addMs = performance.now() - addStarted; source.close(); const finalizeStarted = performance.now(); await output.finalize();
    stats.finalizeMs = performance.now() - finalizeStarted; writer.releaseLock(); writer = null;
    require(stats.packets === 300 && stats.payloadBytes > 0 && stats.packetTimestampsStrictlyIncreasing, 'ENCODED_FRAME_COUNT_OR_REORDER');
    const saved = await tx.commit({expectedBytes: tx.status.extent}); require(saved.committed, 'INPUT_NOT_COMMITTED');
    const file = await handle.getFile(); require(file.size === saved.bytes && file.size <= MAX_FILE, 'INPUT_SNAPSHOT_SIZE');
    stats.bytes = file.size; stats.sha256 = await sha256Blob(file); stats.index = index.metrics;
    stats.requestedTimelinePayloadBitsPerSecond = stats.payloadBytes * 8 / 10;
    stats.elapsedMs = performance.now() - started; stats.submitFramesPerSecond = 300000 / stats.addMs;
    return {file, stats};
  } finally {
    try { await allCleanup([
      async () => { if (output && !['finalized', 'canceled'].includes(output.state)) await output.cancel(); },
      () => { writer?.releaseLock(); writer = null; },
      async () => { if (tx && !tx.status.committed) await tx.abort(); },
      () => index?.dispose(), () => { if (canvas) { canvas.width = 1; canvas.height = 1; } },
    ]); } catch (e) { cleanupError = e; }
    stats.cleanup = {indexReservedBytes: index ? index.metrics.explicitReservedBytes : 0, directoryRemoved: await absent(root, jobId), error: cleanupError ? describe(cleanupError) : null};
    if (cleanupError) throw cleanupError;
  }
}
let unhandled = 0;
self.addEventListener('unhandledrejection', event => { unhandled++; if (unhandled <= 8) self.postMessage({unhandledError: describe(event.reason ?? Error('unknown rejection'))}); });
async function run({namespace, caseName}) {
  const pair = {'32-32': [32000000, 32000000], '48-24': [48000000, 24000000]}[caseName];
  const result = {status: 'FAIL', caseName, files: [], silent: true, frameProfile: FRAME_PROFILE,
    seconds: 10, fps: 30, frames: 300, maxFileBytes: MAX_FILE, maxPairBytes: MAX_PAIR,
    fullHostRecovery: 'PENDING', independentVerification: 'PENDING', publicProduct: false, largeMedia: false};
  try {
    require(pair && /^v-[a-f0-9-]{36}$/.test(namespace), 'CALIBRATION_ARGUMENTS');
    require(isSecureContext && navigator.storage?.getDirectory && navigator.locks?.request, 'NATIVE_CAPABILITY_UNAVAILABLE');
    result.storageBefore = await navigator.storage.estimate();
    require(Number.isFinite(result.storageBefore.quota) && Number.isFinite(result.storageBefore.usage)
      && result.storageBefore.quota - result.storageBefore.usage >= 512 * MiB, 'CALIBRATION_OPFS_QUOTA');
    const origin = await navigator.storage.getDirectory(); require(await absent(origin, namespace), 'NAMESPACE_EXISTS');
    const root = await origin.getDirectoryHandle(namespace, {create: true});
    result.namespaceOwned = true; self.postMessage({namespaceOwned: true});
    const inputHandle = await root.getFileHandle('input.mp4', {create: true});
    const generated = await generate(root, namespace + '-gen', inputHandle, pair[0]); result.generation = generated.stats;
    result.files.push({name: 'input.mp4', bytes: generated.file.size, sha256: generated.stats.sha256, file: generated.file});
    result.inputInspection = await inspectMp4(generated.file); require(result.inputInspection.transcodeSafe, 'GENERATED_INPUT_PUBLIC_GATE_REJECTED');
    const target = await root.getFileHandle('output.mp4', {create: true}); let cleanup, outputState, metrics;
    const aborter = new AbortController(), started = performance.now();
    try {
      const boundedHandle = {getFile: () => target.getFile(), async createWritable() {
        const native = await target.createWritable(); return {
          write(value) { require(value?.type === 'write' && value.data instanceof Uint8Array && Number.isSafeInteger(value.position)
            && value.position >= 0 && value.position + value.data.length <= MAX_FILE, 'CALIBRATION_OUTPUT_FILE_LIMIT'); return native.write(value); },
          truncate(size) { require(Number.isSafeInteger(size) && size >= 0 && size <= MAX_FILE, 'CALIBRATION_OUTPUT_FILE_LIMIT'); return native.truncate(size); },
          close: () => native.close(), abort: reason => native.abort(reason),
        };
      }};
      const outcome = await convertStereo(generated.file, {mode: 'convert', confirmed: true, layout: 'sbs', fov: 180, eyeSize: 512, bitrate: pair[1]},
        {fork: M, indexRoot: root, outputHandle: boundedHandle, jobId: namespace + '-convert', signal: aborter.signal,
          onCleanup: value => { cleanup = value; }, onOutputCreated: value => { outputState = value; },
          onMetrics: value => { metrics = value; }, onProgress: progress => { if (progress.outputBytes > MAX_FILE) aborter.abort(); }});
      result.conversion = {elapsedMs: performance.now() - started, metrics: outcome.metrics, saved: outcome.saved,
        verification: outcome.verification, savedInfo: outcome.savedInfo};
      const file = await target.getFile();
      require(file.size <= MAX_FILE && file.size + generated.file.size <= MAX_PAIR, 'CALIBRATION_PAIR_LIMIT');
      require(outcome.saved.committed && file.size === outcome.saved.bytes && await sha256Blob(file) === outcome.saved.sha256, 'OUTPUT_FULL_REREAD');
      result.files.push({name: 'output.mp4', bytes: file.size, sha256: outcome.saved.sha256, file});
    } finally {
      await cleanup?.(); result.conversionCleanup = {metrics, fileState: outputState?.status ?? null,
        inputDirectoryRemoved: await absent(root, namespace + '-convert-in'), outputDirectoryRemoved: await absent(root, namespace + '-convert-out')};
    }
    require(result.generation.cleanup.directoryRemoved && result.generation.cleanup.indexReservedBytes === 0, 'GENERATOR_CLEANUP');
    require(result.conversionCleanup.inputDirectoryRemoved && result.conversionCleanup.outputDirectoryRemoved
      && result.conversionCleanup.metrics?.indexReservedAfterCleanup === 0, 'CONVERSION_CLEANUP');
    result.heldLocks = (await navigator.locks.query()).held.filter(lock => lock.name.includes(namespace)).length;
    require(result.heldLocks === 0, 'OWNER_LOCK_REMAINS'); result.status = 'READY_FOR_DOWNLOAD';
  } catch (e) { result.error = describe(e); }
  try { result.storageAfter = await navigator.storage.estimate(); }
  catch (e) { result.storageAfterError = describe(e); result.status = 'FAIL'; }
  result.unhandledCount = unhandled;
  if (unhandled) result.status = 'FAIL'; return result;
}
self.onmessage = ({data}) => run(data).then(result => self.postMessage({result}), error => self.postMessage({result: {status: 'FAIL', files: [], error: describe(error)}}));
