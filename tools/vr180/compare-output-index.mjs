#!/usr/bin/env node
// Non-public independent comparisons. Requires a reviewed fixed-source fork bundle.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openAsBlob} from 'node:fs';
import {open, readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec = promisify(execFile);
const script = fileURLToPath(import.meta.url);
const originalPath = fileURLToPath(new URL('../../docs/shared/media-basic/vendor/mediabunny.mjs', import.meta.url));
const originalModule = () => import(pathToFileURL(originalPath));
import {createOutputIndex} from '../../development/vr180/output-index-prototype/output-index.mjs';
import {nodeRoot, testLocks} from '../../development/vr180/output-index-prototype/node-backend.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function runtimeProvenance() {
  const paths = ['tools/vr180/compare-output-index.mjs', 'development/vr180/output-index-prototype/output-index.mjs',
    'development/vr180/index-prototype/index-store.mjs', 'development/vr180/index-prototype/job-owner.mjs', 'development/vr180/output-index-prototype/mp4-output-inspect.mjs',
    'development/vr180/output-index-prototype/node-backend.mjs'];
  const root = fileURLToPath(new URL('../../', import.meta.url));
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, digest(await readFile(resolve(root, path)))])));
}
export async function seed() {
  const original = await originalModule();
  const bytes = await readFile(new URL('../../docs/vr180-studio/fixtures/stereo180-sbs.mp4', import.meta.url));
  const input = new original.Input({source: new original.BlobSource(new Blob([bytes])), formats: [original.MP4]});
  try {
    const video = (await input.getTracks()).find(t => t.type === 'video'), sink = new original.EncodedPacketSink(video);
    const key = await sink.getFirstPacket(), delta = await sink.getNextPacket(key), config = await video.getDecoderConfig();
    return {key: key.data.slice(), delta: delta.data.slice(), config: {...config, description: new Uint8Array(config.description).slice()}, fixtureSha256: digest(bytes)};
  } finally { input.dispose(); }
}
export async function generate({module, file, count, pattern, controller, seed: input, onPacket, beforeFinalize}) {
  const handle = await open(file, 'wx'), writes = {calls: 0, bytes: 0, extent: 0, maxBytes: 0, logicalClose: 0};
  const format = new module.Mp4OutputFormat({fastStart: false}); if (controller) format._options.vr180Index = controller;
  const output = new module.Output({format, target: new module.StreamTarget(new WritableStream({
    async write({data, position}) {
      writes.calls++; writes.bytes += data.length; writes.extent = Math.max(writes.extent, position + data.length); writes.maxBytes = Math.max(writes.maxBytes, data.length);
      for (let done = 0; done < data.length;) { const {bytesWritten} = await handle.write(data, done, data.length - done, position + done); assert(bytesWritten > 0); done += bytesWritten; }
    }, close() { writes.logicalClose++; },
  }, {highWaterMark: 1}), {chunked: true, chunkSize: 1024 * 1024})});
  output._muxer.creationTime = 3860000000; // Same fixed clock for byte comparison, not elapsed performance.
  const source = new module.EncodedVideoPacketSource('avc'); output.addVideoTrack(source);
  let snapshot;
  const started = performance.now(), phases = {}, memorySamples = [];
  const memory = phase => { const usage = process.memoryUsage(); memorySamples.push({phase, ...usage}); return usage; };
  memory('beforeOutputStart');
  try {
    await output.start(); phases.startMs = performance.now() - started; const addStarted = performance.now();
    for (let i = 0; i < count; i++) {
      const alternate = pattern === 'alternating-ctts', delta = alternate && i % 2 === 1;
      const timestamp = (alternate ? (i % 2 ? i - 1 : i + 1) : i) / 30;
      await source.add(new module.EncodedPacket(delta ? input.delta : input.key, delta ? 'delta' : 'key', timestamp, 1 / 30), i === 0 ? {decoderConfig: input.config} : undefined);
      await onPacket?.({i, output, source});
      if ((i + 1) % 1000 === 0) memory(`samples:${i + 1}`);
    }
    phases.addMs = performance.now() - addStarted; const closeStarted = performance.now();
    await source.close(); phases.sourceCloseMs = performance.now() - closeStarted; await beforeFinalize?.({output, source});
    memory('beforeFinalize'); const finalizeStarted = performance.now(); await output.finalize();
    phases.finalizeMs = performance.now() - finalizeStarted; const elapsedMs = performance.now() - started;
    memory('afterFinalizeBeforeGC'); globalThis.gc?.(); const retainedAfterFinalize = memory('afterFinalizeWithOutputRetained');
    snapshot = controller?.metrics;
    if (controller) {
      assert(snapshot.metadataClosed); assert.equal(snapshot.verification.sampleCounts.video, count);
      for (const track of output._muxer.trackDatas) {
        for (const name of ['samples', 'finalizedChunks', 'timeToSampleTable', 'compositionTimeOffsetTable', 'compactlyCodedChunkTable', 'timestampProcessingQueue']) assert.equal(track[name].length, 0, name);
        assert.equal(track.currentChunk, null);
      }
      assert(snapshot.budgetPeakBytes <= 8 * 1024 ** 2);
    }
    await handle.truncate(writes.extent);
    return {file, writes, snapshot, inputSamples: count, originalIndexRetained: !controller, elapsedMs, phases,
      memory: {gcAvailable: typeof globalThis.gc === 'function', retainedAfterFinalize, samples: memorySamples,
        sampledPeak: Object.fromEntries(['rss', 'heapUsed', 'external', 'arrayBuffers'].map(key => [key, Math.max(...memorySamples.map(s => s[key]))])),
        note: 'Node process observations; sample maxima are not true peaks. Output and controller remain strongly reachable at final GC; excludes browser/native codec qualification.'}};
  } finally {
    try { if (!['finalized', 'canceled'].includes(output.state)) await output.cancel(); } finally { await handle.close(); }
  }
}
async function hashFile(file) {
  const fd = await open(file, 'r'), b = new Uint8Array(1024 * 1024), hash = createHash('sha256'); let size = 0;
  try { for (;;) { const {bytesRead} = await fd.read(b, 0, b.length, size); if (!bytesRead) break; hash.update(b.subarray(0, bytesRead)); size += bytesRead; } }
  finally { await fd.close(); } return {bytes: size, sha256: hash.digest('hex')};
}
// Uses the unchanged distribution's demuxer and all packet payloads; it does not
// read any prototype IndexStore, table generator or output-index helper.
export async function comparePackets(reference, candidate, expected) {
  const original = await originalModule();
  const inputs = await Promise.all([reference, candidate].map(async file => new original.Input({source: new original.BlobSource(await openAsBlob(file), {maxCacheSize: 1024 * 1024, useStreamReader: false}), formats: [original.MP4]})));
  let count = 0, payloadBytes = 0; const metadata = createHash('sha256'), payload = createHash('sha256');
  try {
    const tracks = await Promise.all(inputs.map(input => input.getTracks())); assert.equal(tracks[0].length, tracks[1].length);
    for (let trackId = 0; trackId < tracks[0].length; trackId++) {
      const sinks = tracks.map(ts => new original.EncodedPacketSink(ts[trackId]));
      let pair = await Promise.all(sinks.map(sink => sink.getFirstPacket()));
      while (pair[0] || pair[1]) {
        assert(pair[0] && pair[1], 'packet missing'); const [a, b] = pair;
        assert.deepEqual([a.timestamp, a.duration, a.type, a.sequenceNumber, a.data.length], [b.timestamp, b.duration, b.type, b.sequenceNumber, b.data.length]);
        assert.deepEqual(a.data, b.data, `payload ${count}`);
        metadata.update(JSON.stringify([trackId, a.timestamp, a.duration, a.type, a.sequenceNumber, a.data.length])); payload.update(b.data);
        count++; payloadBytes += b.data.length; pair = await Promise.all(sinks.map((sink, index) => sink.getNextPacket(pair[index])));
      }
    }
    assert.equal(count, expected); return {count, payloadBytes, metadataSha256: metadata.digest('hex'), payloadSha256: payload.digest('hex'), completeEndReached: true, verifier: 'unchanged Mediabunny 1.61.5 full-packet demux; input indexes remain unbounded'};
  } finally { inputs.forEach(input => input.dispose()); }
}
export async function compareCase({bundle, out, count, pattern, input}) {
  const stem = `${pattern}-${count}`, reference = join(out, `${stem}-reference.mp4`), candidate = join(out, `${stem}-candidate.mp4`);
  const seedFile = join(out, 'seed.json');
  const run = async (fork, file) => {
    const report = join(out, `${stem}-${fork ? 'candidate' : 'reference'}-generation.json`);
    await exec(process.execPath, ['--expose-gc', script, '--child', 'generate', '--bundle', fork ? bundle : originalPath,
      '--file', file, '--seed', seedFile, '--count', String(count), '--pattern', pattern, '--report', report,
      '--index-root', join(out, `${stem}-opfs-adapter`), '--candidate', fork ? 'yes' : 'no'], {maxBuffer: 2 * 1024 ** 2, timeout: 600000});
    return JSON.parse(await readFile(report, 'utf8'));
  };
  const baseline = await run(false, reference), fork = await run(true, candidate);
  const a = await hashFile(reference), b = await hashFile(candidate);
  assert.deepEqual(b, a, 'All file bytes including full sample tables, offsets, durations and payload mapping must match.');
  const packetComparison = await comparePackets(reference, candidate, count);
  return [{stage: 'mux-full-byte-comparison', count, pattern, reference: a, candidate: b, baseline, fork, pass: true},
    {stage: 'original-demux-all-packets', count, pattern, ...packetComparison, pass: true}];
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const {values} = parseArgs({options: {bundle: {type: 'string'}, 'out-dir': {type: 'string'}, counts: {type: 'string', default: '5000,25000,100000'},
    patterns: {type: 'string', default: 'monotonic,alternating-ctts'}, child: {type: 'string'}, file: {type: 'string'}, seed: {type: 'string'},
    count: {type: 'string'}, pattern: {type: 'string'}, report: {type: 'string'}, 'index-root': {type: 'string'}, candidate: {type: 'string'}}});
  if (values.child) {
    const runtimeProvenanceAtStart = await runtimeProvenance();
    assert.equal(values.child, 'generate'); const module = await import(pathToFileURL(resolve(values.bundle)));
    const data = JSON.parse(await readFile(values.seed, 'utf8'));
    const input = {...data, key: Uint8Array.from(data.key), delta: Uint8Array.from(data.delta), config: {...data.config, description: Uint8Array.from(data.config.description)}};
    globalThis.gc?.(); const processBeforeController = process.memoryUsage(), wholeStarted = performance.now();
    const backend = values.candidate === 'yes' ? nodeRoot(values['index-root']) : null, locks = testLocks();
    const controller = backend ? await createOutputIndex({root: backend.root, jobId: 'candidate', lockManager: locks, yieldTask: tick}) : null;
    try {
      const result = await generate({module, file: values.file, count: Number(values.count), pattern: values.pattern, controller, seed: input});
      await controller?.dispose(); assert.equal(locks.held.size, 0); if (backend) assert.equal(backend.open.size, 0);
      const runtimeProvenanceAtEnd = await runtimeProvenance();
      assert.deepEqual(runtimeProvenanceAtEnd, runtimeProvenanceAtStart, 'Runtime source changed during generation');
      await writeFile(values.report, JSON.stringify({...result, runtimeProvenanceAtStart, runtimeProvenanceAtEnd, processBeforeController, initializationAndGenerationMs: performance.now() - wholeStarted, onlyBundleLoaded: resolve(values.bundle), processId: process.pid, node: process.version}, null, 2) + '\n', {flag: 'wx'});
    } finally { await controller?.dispose(); }
  } else {
    assert(values.bundle && values['out-dir'], '--bundle and --out-dir required');
    const out = resolve(values['out-dir']); await mkdir(out); // Refuse to overwrite previous evidence.
    const input = await seed(), results = [];
    await writeFile(join(out, 'seed.json'), JSON.stringify({...input, key: [...input.key], delta: [...input.delta], config: {...input.config, description: [...input.config.description]}}), {flag: 'wx'});
    for (const pattern of values.patterns.split(',')) for (const count of values.counts.split(',').map(Number)) {
      assert(['monotonic', 'alternating-ctts'].includes(pattern)); assert(Number.isSafeInteger(count) && count > 0 && count <= 100000);
      const rows = await compareCase({bundle: resolve(values.bundle), out, count, pattern, input}); results.push(...rows);
      await writeFile(join(out, `${pattern}-${count}.json`), JSON.stringify(rows, null, 2) + '\n'); process.stdout.write(`${pattern} ${count}: complete byte + all-packet comparison PASS\n`);
    }
    await writeFile(join(out, 'comparison.json'), JSON.stringify({schemaVersion: 1, synthetic: true, decoded: false, audioTracks: 0,
      inputForkImplemented: false, backend: 'Node real files; injected test lock manager; not OPFS/Web Locks browser validation',
      runtimeProvenance: await runtimeProvenance(), fixtureSha256: input.fixtureSha256, forkSha256: digest(await readFile(values.bundle)), results}, null, 2) + '\n');
  }
}
