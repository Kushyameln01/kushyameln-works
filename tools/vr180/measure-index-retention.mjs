#!/usr/bin/env node
// Measurement only. Does not alter application limits, vendor code, or codec settings.
// Parent process launches one fresh --expose-gc Node process per case/stage.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { availableParallelism, platform, arch, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  Input, BlobSource, MP4, EncodedPacketSink, EncodedPacket,
  EncodedVideoPacketSource, Output, Mp4OutputFormat, StreamTarget,
} from '../../docs/shared/media-basic/vendor/mediabunny.mjs';

const script = fileURLToPath(import.meta.url), repo = resolve(dirname(script), '../..');
const fixturePath = resolve(repo, 'docs/vr180-studio/fixtures/stereo180-sbs.mp4');
const CACHE_BYTES = 1024 ** 2, WRITE_CHUNK_BYTES = 1024 ** 2;
const { values: options } = parseArgs({options: {
  'out-dir': {type: 'string'}, counts: {type: 'string', default: '5000,25000,100000'},
  child: {type: 'string'}, samples: {type: 'string'}, pattern: {type: 'string'}, file: {type: 'string'},
}});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const tick = () => new Promise(resolveTick => setImmediate(resolveTick));
const elapsed = start => performance.now() - start;

async function snapshot(phase, start, extra = {}) {
  assert.equal(typeof globalThis.gc, 'function', 'Child must run with --expose-gc');
  const operationMs = elapsed(start), gcStart = performance.now();
  // Finish pending microtasks and give transient objects two explicit GC opportunities.
  await tick(); globalThis.gc(); await tick(); globalThis.gc();
  const gcPauseMs = elapsed(gcStart), memory = process.memoryUsage();
  return {phase, operationMs, gcPauseMs, memory, ...extra};
}

async function loadSeed() {
  const bytes = await readFile(fixturePath);
  const input = new Input({source: new BlobSource(new Blob([bytes])), formats: [MP4]});
  try {
    const video = (await input.getTracks()).find(track => track.type === 'video');
    const packets = new EncodedPacketSink(video), packet = await packets.getFirstPacket();
    assert.equal(packet.type, 'key');
    const delta = await packets.getNextPacket(packet); assert.equal(delta.type, 'delta');
    const config = await video.getDecoderConfig();
    return {data: packet.data.slice(), deltaData: delta.data.slice(), config: {...config, description: new Uint8Array(config.description).slice()},
      evidence: {fixture: 'docs/vr180-studio/fixtures/stereo180-sbs.mp4', fixtureSha256: hash(bytes),
        packetBytes: packet.data.byteLength, packetSha256: hash(packet.data), packetType: packet.type,
        deltaPacketBytes: delta.data.byteLength, deltaPacketSha256: hash(delta.data), deltaPacketType: delta.type}};
  } finally { input.dispose(); }
}

function muxIndex(output) {
  const tracks = output._muxer.trackDatas; // Read-only instrumentation of pinned 1.61.5 internals.
  assert(Array.isArray(tracks));
  return tracks.map(track => ({
    samples: track.samples.length, chunks: track.finalizedChunks.length,
    chunkSampleReferences: track.finalizedChunks.reduce((n, chunk) => n + chunk.samples.length, 0),
    pendingChunkSamples: track.currentChunk?.samples.length ?? 0,
    samplesStillHoldingPayload: track.samples.reduce((n, sample) => n + (sample.data !== null ? 1 : 0), 0),
    timingRuns: track.timeToSampleTable.length, compositionRuns: track.compositionTimeOffsetTable.length,
    sampleToChunkRuns: track.compactlyCodedChunkTable.length,
    timestampProcessingQueue: track.timestampProcessingQueue.length,
  }));
}

async function mux(samples, pattern, file = null, measure = true) {
  const seed = await loadSeed(), handle = file ? await open(file, 'wx') : null;
  const writes = {calls: 0, bytes: 0, extent: 0, maxWriteBytes: 0, backwardWrites: 0, closeCalls: 0};
  let moovBytes = null, moovPosition = null, mediaPayloadBytes = 0;
  const output = new Output({
    format: new Mp4OutputFormat({fastStart: false, onMoov(data, position) {
      // Enables the same library tracking path as direct output, but only numbers
      // are retained here. No production capture clone or all-media buffer.
      moovBytes = data.byteLength; moovPosition = position;
    }}),
    target: new StreamTarget(new WritableStream({
      async write({type, position, data}) {
        assert.equal(type, 'write'); assert(Number.isSafeInteger(position) && position >= 0);
        writes.calls++; writes.bytes += data.byteLength;
        writes.maxWriteBytes = Math.max(writes.maxWriteBytes, data.byteLength);
        if (position < writes.extent) writes.backwardWrites++;
        if (handle) {
          let offset = 0;
          while (offset < data.byteLength) {
            const {bytesWritten} = await handle.write(data, offset, data.byteLength - offset, position + offset);
            assert(bytesWritten > 0); offset += bytesWritten;
          }
        }
        writes.extent = Math.max(writes.extent, position + data.byteLength);
      },
      close() { writes.closeCalls++; },
    }, {highWaterMark: 1}), {chunked: true, chunkSize: WRITE_CHUNK_BYTES}),
  });
  const source = new EncodedVideoPacketSource('avc'); output.addVideoTrack(source);
  const phases = [], begun = performance.now();
  try {
    await output.start();
    if (measure) phases.push(await snapshot('mux-created-before-packets', begun, {indices: muxIndex(output)}));
    let start = performance.now();
    for (let i = 0; i < samples; i++) {
      const timestamp = (pattern === 'alternating-ctts' ? (i % 2 ? i - 1 : i + 1) : i) / 30;
      // Real packet bytes are repeated; timestamps/order are deliberately
      // synthetic. This is an index workload, not validated camera footage.
      const isDelta = pattern === 'alternating-ctts' && i % 2 === 1;
      const data = isDelta ? seed.deltaData : seed.data;
      const packet = new EncodedPacket(data, isDelta ? 'delta' : 'key', timestamp, 1 / 30);
      await source.add(packet, i === 0 ? {decoderConfig: seed.config} : undefined);
      mediaPayloadBytes += data.byteLength;
    }
    await source.close();
    if (measure) phases.push(await snapshot('mux-after-packets-before-finalize', start, {indices: muxIndex(output), writes: {...writes}}));
    start = performance.now(); await output.finalize();
    const indices = muxIndex(output);
    assert.equal(indices[0].samples, samples); assert.equal(indices[0].samplesStillHoldingPayload, 0);
    if (measure) phases.push(await snapshot('mux-finalized-index-retained', start, {indices, writes: {...writes}}));
    if (handle) await handle.truncate(writes.extent);
    return {kind: measure ? 'mux-retention' : 'fixture-generation', samples, pattern, seed: seed.evidence,
      synthetic: true, decoded: false, audioTracks: 0, fileBytes: writes.extent, moovBytes, moovPosition,
      mediaPayloadBytes, indexSource: 'read-only pinned _muxer.trackDatas',
      target: handle ? 'positioned file writes' : 'StreamTarget discard/count, no retained media output',
      cacheBytes: CACHE_BYTES, writeChunkBytes: WRITE_CHUNK_BYTES,
      onMoov: 'library tracking enabled; callback retains length/position only, not bytes',
      writes, phases, totalMs: elapsed(begun)};
  } finally {
    if (!['finalized', 'canceled'].includes(output.state)) await output.cancel();
    await handle?.close();
  }
}

async function scanTop(file) {
  const handle = await open(file, 'r');
  try {
    const {size} = await handle.stat(), boxes = []; let position = 0;
    while (position < size) {
      const header = new Uint8Array(16);
      const {bytesRead} = await handle.read(header, 0, Math.min(16, size - position), position);
      assert(bytesRead >= 8);
      const view = new DataView(header.buffer), type = String.fromCharCode(...header.subarray(4, 8));
      const large = view.getUint32(0) === 1, bytes = large ? Number(view.getBigUint64(8)) : view.getUint32(0);
      assert(Number.isSafeInteger(bytes) && bytes >= (large ? 16 : 8) && position + bytes <= size);
      boxes.push({type, start: position, payload: position + (large ? 16 : 8), end: position + bytes});
      position += bytes;
    }
    return {size, boxes};
  } finally { await handle.close(); }
}

function demuxIndex(video) {
  const track = video._backing.internalTrack, table = track.sampleTable, moov = track.demuxer.moovSlice;
  assert(moov?.bytes instanceof Uint8Array);
  return {moovSliceViewBytes: moov.end - moov.start, moovBackingBytes: moov.bytes.buffer.byteLength,
    arrays: table ? Object.fromEntries(Object.entries(table).filter(([, value]) => Array.isArray(value) || value === null)
      .map(([name, value]) => [name, Array.isArray(value) ? value.length : null])) : null};
}

async function demux(samples, pattern, file) {
  const top = await scanTop(file), reads = {calls: 0, bytes: 0, maxReadBytes: 0, moovOverlapBytes: 0, mdatPayloadOverlapBytes: 0};
  const blob = await openAsBlob(file); // Native disk-backed Blob, no readFile of the generated media.
  const source = new BlobSource(blob, {maxCacheSize: CACHE_BYTES, useStreamReader: false});
  source.on('read', ({start, end}) => {
    reads.calls++; reads.bytes += end - start; reads.maxReadBytes = Math.max(reads.maxReadBytes, end - start);
    for (const box of top.boxes) {
      if (box.type === 'moov') reads.moovOverlapBytes += Math.max(0, Math.min(end, box.end) - Math.max(start, box.start));
      if (box.type === 'mdat') reads.mdatPayloadOverlapBytes += Math.max(0, Math.min(end, box.end) - Math.max(start, box.payload));
    }
  });
  const input = new Input({source, formats: [MP4]}), phases = [], begun = performance.now();
  try {
    phases.push(await snapshot('demux-created-before-metadata', begun, {reads: {...reads}}));
    let start = performance.now();
    const tracks = await input.getTracks(), video = tracks.find(track => track.type === 'video');
    assert.equal(tracks.length, 1); assert(video);
    phases.push(await snapshot('demux-metadata-retained', start, {indices: demuxIndex(video), reads: {...reads}}));
    const sink = new EncodedPacketSink(video);
    start = performance.now();
    const first = await sink.getFirstPacket({metadataOnly: true}), last = await sink.getPacket(Infinity, {metadataOnly: true});
    assert(first?.isMetadataOnly && last?.isMetadataOnly);
    const indices = demuxIndex(video);
    assert.equal(indices.arrays.sampleSizes, samples);
    if (pattern === 'alternating-ctts') assert.equal(indices.arrays.presentationTimestamps, samples);
    phases.push(await snapshot('demux-sample-index-retained', start, {indices, reads: {...reads}}));
    const moov = top.boxes.find(box => box.type === 'moov');
    return {kind: 'demux-retention', samples, pattern, synthetic: true, decoded: false, audioTracks: 0,
      fileBytes: top.size, moovBytes: moov.end - moov.start, top: top.boxes,
      source: 'Node openAsBlob disk-backed Blob -> unmodified BlobSource; useStreamReader:false',
      sourceDifferenceFromChrome: 'arrayBuffer range path selected explicitly; no claim about Chrome prefetch/native memory',
      cacheBytes: CACHE_BYTES, reads, indexSource: 'read-only pinned video._backing.internalTrack',
      phases, totalMs: elapsed(begun)};
  } finally { input.dispose(); }
}

async function child() {
  const samples = Number(options.samples), pattern = options.pattern;
  assert(Number.isSafeInteger(samples) && samples > 0 && samples <= 100000, 'Measurement count must remain <= 100000');
  assert(['monotonic', 'alternating-ctts'].includes(pattern));
  let result;
  if (options.child === 'mux') result = await mux(samples, pattern);
  else if (options.child === 'generate') result = await mux(samples, pattern, resolve(options.file), false);
  else if (options.child === 'demux') result = await demux(samples, pattern, resolve(options.file));
  else throw Error('Unknown child stage');
  process.stdout.write(JSON.stringify({schemaVersion: 1, pid: process.pid, node: process.version,
    timestamp: new Date().toISOString(), ...result}) + '\n');
}

function memoryDelta(row) {
  const first = row.phases[0].memory, last = row.phases.at(-1).memory;
  return Object.fromEntries(['heapUsed', 'external', 'arrayBuffers', 'rss'].map(key => [key, last[key] - first[key]]));
}

async function parent() {
  assert(options['out-dir'], 'Use --out-dir for evidence output');
  const out = resolve(options['out-dir']), fixtureDir = resolve(out, 'fixtures');
  await mkdir(fixtureDir, {recursive: true});
  const counts = options.counts.split(',').map(Number);
  assert(counts.length && counts.every(n => Number.isSafeInteger(n) && n > 0 && n <= 100000));
  const results = [], generated = [], start = performance.now();
  async function run(stage, samples, pattern, file) {
    const name = `${stage}-${pattern}-${samples}`;
    const args = ['--expose-gc', script, '--child', stage, '--samples', String(samples), '--pattern', pattern];
    if (file) args.push('--file', file);
    const run = spawnSync(process.execPath, args, {cwd: repo, encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 ** 2});
    await writeFile(resolve(out, `${name}.stderr.txt`), run.stderr ?? '');
    if (run.status !== 0 || run.error) {
      await writeFile(resolve(out, `${name}.failure.json`), JSON.stringify({status: run.status, signal: run.signal,
        error: run.error?.message ?? null, stdout: run.stdout}, null, 2) + '\n');
      throw Error(`${name} failed: ${run.error?.message ?? run.stderr}`);
    }
    const row = JSON.parse(run.stdout);
    if (row.phases.length) row.retainedDeltaBytes = memoryDelta(row);
    await writeFile(resolve(out, `${name}.json`), JSON.stringify(row, null, 2) + '\n');
    process.stdout.write(`${name}: ${row.phases.length ? JSON.stringify(row.retainedDeltaBytes) : `${row.fileBytes} bytes on disk`}\n`);
    return row;
  }
  for (const pattern of ['monotonic', 'alternating-ctts']) {
    for (const samples of counts) {
      results.push(await run('mux', samples, pattern));
      const file = resolve(fixtureDir, `${pattern}-${samples}.mp4`);
      generated.push(await run('generate', samples, pattern, file));
      results.push(await run('demux', samples, pattern, file));
    }
  }
  const vendorPath = resolve(repo, 'docs/shared/media-basic/vendor/mediabunny.mjs');
  const report = {schemaVersion: 1, timestamp: new Date().toISOString(),
    baselineCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(),
    scriptSha256: hash(await readFile(script)), mediabunnyVersion: '1.61.5', vendorSha256: hash(await readFile(vendorPath)),
    command: ['node', 'tools/vr180/measure-index-retention.mjs', '--out-dir', out, '--counts', options.counts],
    environment: {node: process.version, platform: platform(), arch: arch(), cpusAvailable: availableParallelism(),
      machineMemoryBytes: totalmem(), execArgv: ['--expose-gc']},
    methods: ['Fresh process per stage and case; packet count <= current 100000 limit.',
      'Real first key packet repeated with synthetic 30 Hz metadata; alternating-ctts repeats the real key/delta pair with neighboring PTS swapped. No decoding.',
      'Output discards streamed media after counting; separate generator streams the same workload to disk.',
      'Input uses disk-backed BlobSource, 1 MiB cache, explicit range path, metadata-only first/last packet lookup.',
      'Retained snapshots follow two explicit GC cycles; temporary finalization peaks are not captured.',
      'Internal array lengths are observed read-only in pinned 1.61.5; no private method or product limit is modified.',
      'external contains arrayBuffers: do not add them; RSS is process memory, not whole-system/CPU/GPU memory.',
      'One run per point; JIT, allocator, GC and OS caching affect differences. No Chrome/VR/60fps/5GB conclusion.'],
    generated, results, totalMs: elapsed(start)};
  await writeFile(resolve(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
}

try { if (options.child) await child(); else await parent(); }
catch (error) { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; }
