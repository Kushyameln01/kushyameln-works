import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { buildStereoGeometry } from '../docs/shared/vr180/geometry.mjs';
import { inspectMp4 } from '../docs/shared/vr180/mp4.mjs';
import { createFileOutput } from '../docs/shared/vr180/file-output.mjs';
import { createMuxCapture } from '../docs/shared/vr180/mux-capture.mjs';
import * as transform from '../docs/shared/vr180/transform.mjs';
import {
  Input, BlobSource, MP4, EncodedPacketSink, EncodedAudioPacketSource,
  EncodedVideoPacketSource, Output, Mp4OutputFormat, BufferTarget, StreamTarget,
} from '../docs/shared/media-basic/vendor/mediabunny.mjs';

test('actual conversion catch retains acquired writer state when cancellation wraps another error', async () => {
  // Execute the production conversion body with substituted codecs/DOM. This
  // exercises ownership and error propagation, not browser codec capability.
  const source = (await readFile(new URL('../docs/shared/vr180/transform.mjs', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from [^\n]*;\n/gm, '').replace(/^export /gm, '');
  const video = {type: 'video', getCodec: async () => 'avc', hasHighDynamicRange: async () => false,
    getRotation: async () => 0, getFlip: async () => false, getPixelAspectRatio: async () => ({num: 1, den: 1}),
    getDisplayWidth: async () => 512, getDisplayHeight: async () => 256, canDecode: async () => true};
  const context = vm.createContext({Blob, DOMException, AbortController, WritableStream, performance,
    createFileOutput, createMuxCapture, buildStereoGeometry,
    Input: class { async getTracks() { return [video]; } async getDurationFromMetadata() { return 1; } dispose() {} },
    BlobSource: class {}, MP4: {}, Quality: class {}, CanvasSource: class {}, canEncodeVideo: async () => true,
    VideoEncoder: class {}, VideoDecoder: class {},
    OffscreenCanvas: class { constructor(width, height) { this.width = width; this.height = height; } getContext() { return {}; } },
  });
  new vm.Script(source, {filename: 'docs/shared/vr180/transform.mjs'}).runInContext(context);
  const controller = new AbortController();
  let failAbort = true, aborts = 0, cleanup, acquired, failure;
  const handle = {getFile: async () => new Blob(), createWritable: async () => ({
    async abort() { aborts++; if (failAbort) throw Error('ABORT_FAILED'); },
  })};
  await assert.rejects(context.convertStereo(new Blob(['input']), {layout: 'sbs', fov: 180, eyeSize: 256, bitrate: 2000000}, {
    signal: controller.signal, jobId: 'ownership-test', outputHandle: handle, onCleanup: fn => { cleanup = fn; },
    onOutputCreated: output => { acquired = output; controller.abort(); throw Error('OWNER_CALLBACK_FAILED'); },
  }), error => { failure = error; return error.name === 'AbortError'; });
  assert.equal(failure.cause.message, 'OWNER_CALLBACK_FAILED');
  assert.equal(failure.saveOutputState.state, 'cleanup-failed');
  assert.equal(failure.saveOutputState.writerAcquired, true); assert.equal(acquired.status.committed, false);
  assert.equal(aborts, 1);
  failAbort = false; await cleanup();
  assert.equal(failure.saveOutputState.state, 'aborted'); assert.equal(aborts, 2);
});

test('180 SBS keeps the complete left and right views while downscaling equally', () => {
  const result = buildStereoGeometry({ width: 800, height: 400, layout: 'sbs', fov: 180, eyeSize: 200 });
  assert.deepEqual(result, {
    width: 400, height: 200,
    eyes: [
      { sx: 0, sy: 0, sw: 400, sh: 400, dx: 0, dy: 0, dw: 200, dh: 200 },
      { sx: 400, sy: 0, sw: 400, sh: 400, dx: 200, dy: 0, dw: 200, dh: 200 },
    ],
  });
});

test('180 top-bottom puts the upper left-eye image on the left without rotating it', () => {
  const result = buildStereoGeometry({ width: 400, height: 800, layout: 'tb', fov: 180, eyeSize: 400 });
  assert.deepEqual(result.eyes, [
    { sx: 0, sy: 0, sw: 400, sh: 400, dx: 0, dy: 0, dw: 400, dh: 400 },
    { sx: 0, sy: 400, sw: 400, sh: 400, dx: 400, dy: 0, dw: 400, dh: 400 },
  ]);
  assert.equal(result.width, 800);
  assert.equal(result.height, 400);
});

test('360 SBS crops the central 180 degrees of each eye, not the center of the packed frame', () => {
  const result = buildStereoGeometry({ width: 1600, height: 400, layout: 'sbs', fov: 360, eyeSize: 400 });
  assert.deepEqual(result.eyes, [
    { sx: 200, sy: 0, sw: 400, sh: 400, dx: 0, dy: 0, dw: 400, dh: 400 },
    { sx: 1000, sy: 0, sw: 400, sh: 400, dx: 400, dy: 0, dw: 400, dh: 400 },
  ]);
});

test('360 top-bottom preserves both vertical poles and selects each front hemisphere', () => {
  const result = buildStereoGeometry({ width: 800, height: 800, layout: 'tb', fov: 360, eyeSize: 400 });
  assert.deepEqual(result.eyes, [
    { sx: 200, sy: 0, sw: 400, sh: 400, dx: 0, dy: 0, dw: 400, dh: 400 },
    { sx: 200, sy: 400, sw: 400, sh: 400, dx: 400, dy: 0, dw: 400, dh: 400 },
  ]);
});

test('the user-confirmed projection is not inferred from frame aspect ratio', () => {
  const result = buildStereoGeometry({ width: 1200, height: 400, layout: 'sbs', fov: 180, eyeSize: 200 });
  assert.equal(result.eyes[0].sw, 600);
  assert.equal(result.eyes[1].sx, 600);
});

test('invalid geometry is rejected before a canvas or output file is created', () => {
  const valid = { width: 800, height: 400, layout: 'sbs', fov: 180, eyeSize: 200 };
  for (const change of [
    { layout: 'mono' }, { fov: 90 }, { width: 801 },
    { width: 0 }, { height: NaN }, { height: 1.5 },
    { eyeSize: 0 }, { eyeSize: 201 }, { eyeSize: 402 },
    { layout: 'tb', height: 401 },
  ]) {
    assert.throws(() => buildStereoGeometry({ ...valid, ...change }), undefined, JSON.stringify(change));
  }
});

const aacConfig = { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 1, description: Uint8Array.of(0x11, 0x88) };
const audioPacket = (start, duration) => ({ timestamp: start / 48000, duration: duration / 48000, data: Uint8Array.of(1) });

test('AAC copying retains negative priming timestamps and supplies configuration only once', async () => {
  const calls = [];
  const copier = transform.createAacPacketCopier({ add: async (...args) => calls.push(args) }, aacConfig);
  const priming = audioPacket(-1024, 1024), audible = audioPacket(0, 96000);
  await copier.add(priming); await copier.add(audible);
  const timeline = copier.finish();
  assert.equal(calls[0][0], priming);
  assert.equal(calls[0][0].timestamp, -1024 / 48000);
  assert.equal(calls[0][1].decoderConfig, aacConfig);
  assert.equal(calls[1][0], audible);
  assert.equal(calls[1][1], undefined);
  assert.deepEqual(timeline, { packetCount: 2, sampleRate: 48000, leadingTrimSamples: 1024, firstTimestamp: -1024 / 48000, lastEndTimestamp: 2 });
  await assert.rejects(copier.add(audioPacket(96000, 1024)), /finished/);
});

test('AAC passthrough refuses sample rounding, gaps and MP4 edit-duration rounding', async () => {
  const source = { add: async () => {} };
  for (const packet of [audioPacket(0.5, 1024), audioPacket(0, 1023.5)]) {
    const copier = transform.createAacPacketCopier(source, aacConfig);
    await assert.rejects(copier.add(packet), /sample grid/);
  }
  for (const start of [1023, 1025]) {
    const copier = transform.createAacPacketCopier(source, aacConfig);
    await copier.add(audioPacket(0, 1024));
    await assert.rejects(copier.add(audioPacket(start, 1024)), /contiguous/);
  }
  const copier = transform.createAacPacketCopier(source, aacConfig);
  await copier.add(audioPacket(-1024, 1024)); await copier.add(audioPacket(0, 48048));
  assert.throws(() => copier.finish(), /movie timescale/); // 1.001 s cannot be represented at 57600 Hz.
});

test('AAC add is awaited and a second in-flight packet is refused', async () => {
  let release;
  const copier = transform.createAacPacketCopier({ add: () => new Promise(resolve => { release = resolve; }) }, aacConfig);
  const pending = copier.add(audioPacket(0, 96000));
  await assert.rejects(copier.add(audioPacket(96000, 1024)), /in flight/);
  assert.throws(() => copier.finish(), /in flight/);
  release(); await pending;
  assert.equal(copier.finish().packetCount, 1);
});

function external(command, args, input) {
  const result = spawnSync(command, args, { input, maxBuffer: 16 * 1024 ** 2 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr?.toString());
  return result.stdout;
}

function probeAudio(bytes) {
  return JSON.parse(external('ffprobe', [
    '-v', 'error', '-i', 'pipe:0', '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,time_base,start_pts,start_time,duration_ts,duration',
    '-show_packets', '-show_entries', 'packet=pts,dts,duration,side_data_list,data_hash',
    '-show_data_hash', 'sha256', '-of', 'json',
  ], bytes));
}

for (const name of ['stereo180-tb', 'stereo180-sbs', 'stereo360-tb']) {
  test(`${name}: production AAC copier preserves all packets, priming, duration and decoded PCM`, async () => {
    // Independent FFmpeg fixtures and decoders exercise the actual pinned MP4 muxer.
    // Only this small test uses BufferTarget; production media output is streamed.
    const original = await readFile(new URL(`../docs/vr180-studio/fixtures/${name}.mp4`, import.meta.url));
    const input = new Input({ source: new BlobSource(new Blob([original])), formats: [MP4] });
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target });
    try {
      const tracks = await input.getTracks();
      const video = tracks.find(track => track.type === 'video');
      const audio = tracks.find(track => track.type === 'audio');
      const videoSource = new EncodedVideoPacketSource('avc');
      const audioSource = new EncodedAudioPacketSource('aac');
      output.addVideoTrack(videoSource); output.addAudioTrack(audioSource);
      const videoConfig = await video.getDecoderConfig();
      const copier = transform.createAacPacketCopier(audioSource, await audio.getDecoderConfig());
      const audioSink = new EncodedPacketSink(audio), videoSink = new EncodedPacketSink(video);
      let audioPacket = await audioSink.getFirstPacket(), videoPacket = await videoSink.getFirstPacket(), first = true;
      await output.start();
      const addAudio = async () => { await copier.add(audioPacket); audioPacket = await audioSink.getNextPacket(audioPacket); };
      while (videoPacket) {
        while (audioPacket && audioPacket.timestamp <= videoPacket.timestamp) await addAudio();
        await videoSource.add(videoPacket, first ? { decoderConfig: videoConfig } : undefined);
        first = false; videoPacket = await videoSink.getNextPacket(videoPacket);
      }
      videoSource.close();
      while (audioPacket) await addAudio();
      const timeline = copier.finish(); audioSource.close();
      await output.finalize();
      const converted = Buffer.from(target.buffer);
      const before = probeAudio(original), after = probeAudio(converted);
      assert.equal(timeline.leadingTrimSamples, 1024);
      assert.equal(timeline.packetCount, 95);
      assert.equal(before.packets[0].pts, -1024);
      assert.equal(before.packets[0].side_data_list[0].skip_samples, 1024);
      assert.deepEqual(after.packets, before.packets, 'every encoded payload hash, PTS/DTS, duration and skip-sample entry');
      assert.deepEqual(after.streams, before.streams, 'audible start and duration');
      const decode = bytes => external('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-map', '0:a:0', '-f', 's16le', 'pipe:1'], bytes);
      const beforePcm = decode(original), afterPcm = decode(converted);
      assert(beforePcm.some(byte => byte !== 0), 'fixture contains non-silent test tones');
      assert.deepEqual(afterPcm, beforePcm, 'decoded PCM including exact onset positions and tail');
    } finally {
      input.dispose();
      if (output.state !== 'finalized') await output.cancel();
    }
  });
}

// A transaction-shaped test double, not evidence of native file-system or
// WebCodecs behavior. The tests below use the real pinned MP4 muxer/sink.
function directHandle(hooks = {}) {
  let saved = new Uint8Array(), draft = new Uint8Array(), writes = 0, closes = 0, aborts = 0;
  const handle = {
    async getFile() { return new Blob([saved]); },
    async createWritable() {
      return {
        async write({position, data}) {
          writes++; await hooks.write?.(position, data);
          const next = new Uint8Array(Math.max(draft.length, position + data.length));
          next.set(draft); next.set(data, position); draft = next;
        },
        async truncate(size) { const next = new Uint8Array(size); next.set(draft.subarray(0, size)); draft = next; },
        async close() { closes++; saved = draft.slice(); },
        async abort() { aborts++; await hooks.abort?.(); draft = new Uint8Array(); },
      };
    },
    get counts() { return {writes, closes, aborts}; },
  };
  return handle;
}
async function remuxToDirect(sink, {cancel = false} = {}) {
  const bytes = await readFile(new URL('../docs/vr180-studio/fixtures/stereo180-sbs.mp4', import.meta.url));
  // Generate a small, valid no-B-frame stream for the sink test. Remuxing the
  // original B-frame stream introduces cslg, which the production parser
  // intentionally rejects. No production codec/metadata scope is expanded.
  const noBFrames = external('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-map', '0:v:0', '-an',
    '-c:v', 'libx264', '-bf', '0', '-preset', 'ultrafast', '-movflags', 'frag_keyframe+empty_moov',
    '-f', 'mp4', 'pipe:1'], bytes);
  const input = new Input({source: new BlobSource(new Blob([noBFrames])), formats: [MP4]});
  const output = new Output({
    format: new Mp4OutputFormat({fastStart: false, onMoov: sink.onMoov}),
    target: new StreamTarget(sink.stream, {chunked: true, chunkSize: 1024 ** 2}),
  });
  try {
    const video = (await input.getTracks()).find(track => track.type === 'video');
    const source = new EncodedVideoPacketSource('avc'); output.addVideoTrack(source);
    const packets = new EncodedPacketSink(video), config = await video.getDecoderConfig();
    let packet = await packets.getFirstPacket(), first = true;
    await output.start();
    while (packet) {
      await source.add(packet, first ? {decoderConfig: config} : undefined); first = false;
      if (cancel) { await output.cancel(); return; }
      packet = await packets.getNextPacket(packet);
    }
    source.close(); await output.finalize();
  } finally {
    input.dispose();
    if (!['finalized', 'canceled'].includes(output.state)) await output.cancel();
  }
}

test('production direct sink accepts pinned muxer header rewrites and retains an uncommitted metadata source', async () => {
  const handle = directHandle(), observed = [];
  const sink = await transform.createDirectMuxDestination(handle, {onWrite: extent => observed.push(extent)});
  await remuxToDirect(sink);
  assert.equal(handle.counts.closes, 0);
  assert.equal((await handle.getFile()).size, 0);
  assert.equal(sink.output.status.muxerClosed, true);
  assert.equal(sink.output.status.committed, false);
  const direct = sink.finish();
  const info = await inspectMp4(direct.source);
  assert.deepEqual(info.sampleCounts, {video: 60, audio: 0, total: 60});
  assert(direct.metrics.capturedPrefixBytes <= 2048);
  assert(direct.metrics.capturedMoovBytes < 16 * 1024 ** 2);
  assert(direct.metrics.retainedSourceBytes < direct.source.size);
  assert.equal(observed.at(-1), direct.source.size);
  for (let i = 1; i < observed.length; i++) assert(observed[i] >= observed[i - 1]);
  assert.throws(() => direct.source.slice(4096, 4100), /DIRECT_UNCAPTURED_RANGE/);
  // Explicit caller commit is exercised without claiming a VR metadata patch.
  const saved = await direct.output.commit({expectedBytes: direct.source.size, expectedSha256: null});
  assert.equal(saved.hashMatched, false); assert.equal(handle.counts.closes, 1);
  assert.deepEqual(await inspectMp4(saved.file), info);
  const committed = new Uint8Array(await saved.file.arrayBuffer());
  await direct.output.abort();
  assert.equal(handle.counts.aborts, 0);
  assert.deepEqual(new Uint8Array(await (await handle.getFile()).arrayBuffer()), committed);
});

test('pinned muxer cancellation closes the direct wrapper without committing the destination', async () => {
  const handle = directHandle(), sink = await transform.createDirectMuxDestination(handle);
  await remuxToDirect(sink, {cancel: true});
  assert.equal(sink.output.status.muxerClosed, true);
  assert.equal(handle.counts.closes, 0);
  assert.throws(() => sink.finish(), /DIRECT_MUX_NOT_FINALIZED/);
  await sink.output.abort();
  assert.equal(handle.counts.aborts, 1);
  assert.equal((await handle.getFile()).size, 0);
});

test('direct mux sink rejects oversized and malformed writes before touching the physical writer', async () => {
  for (const message of [
    {type: 'write', position: 1024 ** 3, data: Uint8Array.of(1)},
    {type: 'write', position: -1, data: Uint8Array.of(1)},
    {type: 'write', position: 0.5, data: Uint8Array.of(1)},
    {type: 'write', position: 0, data: [1]},
    {type: 'truncate', position: 0, data: Uint8Array.of(1)},
  ]) {
    const handle = directHandle(), sink = await transform.createDirectMuxDestination(handle);
    await assert.rejects(sink.stream.getWriter().write(message), /1 GiB|invalid/);
    assert.equal(handle.counts.writes, 0); assert.equal(handle.counts.closes, 0);
    await sink.output.abort();
  }
});

test('direct mux write failure cannot produce a prepared source and abort can be retried', async () => {
  let failAbort = true;
  const handle = directHandle({write: () => { throw Error('DISK_WRITE_FAILED'); },
    abort: () => { if (failAbort) throw Error('DISK_ABORT_FAILED'); }});
  const sink = await transform.createDirectMuxDestination(handle), writer = sink.stream.getWriter();
  await assert.rejects(writer.write({type: 'write', position: 0, data: Uint8Array.of(1)}), /DISK_WRITE_FAILED/);
  assert.equal(sink.output.status.extent, 0);
  assert.throws(() => sink.finish(), /DIRECT_MUX_NOT_FINALIZED/);
  await assert.rejects(sink.output.abort(), /DISK_ABORT_FAILED/);
  assert.equal(sink.output.status.state, 'cleanup-failed');
  failAbort = false; await sink.output.abort();
  assert.equal(sink.output.status.state, 'aborted');
  assert.deepEqual(handle.counts, {writes: 1, closes: 0, aborts: 2});
});

test('cancel during a direct write waits for that write and prevents completion or physical close', async () => {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const controller = new AbortController(), handle = directHandle({write: async () => {
    entered(); await new Promise(resolve => { release = resolve; });
  }});
  let progressCalls = 0;
  const sink = await transform.createDirectMuxDestination(handle, {signal: controller.signal, onWrite: () => { progressCalls++; }});
  const work = sink.stream.getWriter().write({type: 'write', position: 0, data: Uint8Array.of(1)});
  const rejected = assert.rejects(work, {name: 'AbortError'});
  await started; controller.abort();
  assert.equal(handle.counts.aborts, 0); release();
  await rejected; await sink.output.abort();
  assert.equal(progressCalls, 0);
  assert.deepEqual(handle.counts, {writes: 1, closes: 0, aborts: 1});
  assert.throws(() => sink.finish(), /DIRECT_MUX_NOT_FINALIZED/);
});
