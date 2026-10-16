import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { buildStereoGeometry } from '../docs/shared/vr180/geometry.mjs';
import * as transform from '../docs/shared/vr180/transform.mjs';
import {
  Input, BlobSource, MP4, EncodedPacketSink, EncodedAudioPacketSource,
  EncodedVideoPacketSource, Output, Mp4OutputFormat, BufferTarget,
} from '../docs/shared/media-basic/vendor/mediabunny.mjs';

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
    // Only this small test uses BufferTarget; production output remains streamed to OPFS.
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
