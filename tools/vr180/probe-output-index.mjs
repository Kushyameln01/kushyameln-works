#!/usr/bin/env node
// Private local fault and small audio/VR regressions. Uses ONE candidate bundle.
import assert from 'node:assert/strict';
import {openAsBlob, createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {mkdir, open, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {createOutputIndex} from '../../development/vr180/output-index-prototype/output-index.mjs';
import {nodeRoot, testLocks} from '../../development/vr180/output-index-prototype/node-backend.mjs';
import {inspectMp4} from '../../development/vr180/output-index-prototype/mp4-output-inspect.mjs';
import {generate, runtimeProvenance} from './compare-output-index.mjs';
const {values} = parseArgs({options: {bundle: {type: 'string'}, 'out-dir': {type: 'string'}, reference: {type: 'boolean', default: false}}});
async function fingerprint(file) {
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(file,{highWaterMark:1024*1024})){hash.update(chunk);bytes+=chunk.length;}
  return {path:resolve(file),bytes,sha256:hash.digest('hex')};
}
async function provenance() { return {runtime:await runtimeProvenance(),
  files:await Promise.all([process.argv[1],values.bundle,'docs/vr180-studio/fixtures/stereo180-sbs.mp4',
    'docs/vr180-studio/fixtures/stereo180-tb.mp4'].map(fingerprint))}; }
const startedProvenance=await provenance();
assert(values.bundle && values['out-dir']); const M = await import(pathToFileURL(resolve(values.bundle)));
const out = resolve(values['out-dir']); await mkdir(out); const tick = () => new Promise(r => setImmediate(r));
const fixture = resolve('docs/vr180-studio/fixtures/stereo180-sbs.mp4');
const seedInput = new M.Input({source: new M.BlobSource(await openAsBlob(fixture)), formats: [M.MP4]});
let seed;
try { const video = (await seedInput.getTracks()).find(t => t.type === 'video'), sink = new M.EncodedPacketSink(video), key = await sink.getFirstPacket(), delta = await sink.getNextPacket(key);
  seed = {key: key.data.slice(), delta: delta.data.slice(), config: await video.getDecoderConfig()};
} finally { seedInput.dispose(); }
const results = [];
for (const mode of values.reference ? [] : ['partial-write', 'zero-write', 'disk-full', 'close-failure', 'finalize-cancel', 'metadata-scan-dispose', 'remove-retry']) {
  const aborter = new AbortController(); let metadataSlices = 0, scanDisposal; let rejectClose = mode === 'close-failure', rejectRemove = mode === 'remove-retry';
  const backend = nodeRoot(join(out, `${mode}-root`), {
    write(file, bytes, at) {
      if (!file.endsWith('metadata.bin')) return;
      if (mode === 'zero-write') return 0;
      if (mode === 'disk-full' && at >= 100) throw Error('SPOOL_DISK_FULL');
      if (mode === 'finalize-cancel') aborter.abort();
    },
    getFile(file, blob) {
      if (mode !== 'metadata-scan-dispose' || !file.endsWith('metadata.bin')) return blob;
      return {size: blob.size, slice(start, end) { metadataSlices++; if (metadataSlices === 1) scanDisposal = controller.dispose(); return blob.slice(start, end); }};
    },
    shortWrite: mode === 'partial-write' ? 7 : undefined,
    close(file) { if (file.endsWith('metadata.bin') && rejectClose) throw Error('SPOOL_CLOSE_FAILURE'); },
    remove(file) { if (file.endsWith('/job') && rejectRemove) throw Error('JOB_REMOVE_FAILURE'); },
  });
  const locks = testLocks(), controller = await createOutputIndex({root: backend.root, jobId: 'job', signal: aborter.signal, lockManager: locks, yieldTask: tick});
  try {
  let completed = false, error = null, observedMuxer;
  try {
    await generate({module: M, file: join(out, `${mode}.mp4`), count: 4, pattern: 'monotonic', controller, seed,
      beforeFinalize({output}) { observedMuxer = output._muxer; }}); completed = true;
  } catch (failure) { error = {name: failure.name, message: failure.message}; }
  if (['partial-write', 'remove-retry'].includes(mode)) assert(completed); else assert(!completed, mode);
  if (['finalize-cancel', 'metadata-scan-dispose'].includes(mode)) assert.equal(error.name, 'AbortError');
  if (mode === 'metadata-scan-dispose') { await scanDisposal; assert.equal(metadataSlices, 1, 'parser must stop at its first cancellation check'); }
  if (mode === 'zero-write') assert.match(error.message, /SPOOL_NO_PROGRESS/);
  if (mode === 'disk-full') assert.match(error.message, /SPOOL_DISK_FULL/);
  if (mode === 'close-failure') { assert.match(error.message, /SPOOL_CLOSE_FAILURE/); assert(locks.held.size > 0); rejectClose = false; }
  // An exception inside the adapter must not leave the upstream mutex acquired.
  const release = await Promise.race([observedMuxer.mutex.acquire(), new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('MUX_MUTEX_LEAK')), 1000); timer.unref(); })]); release();
  const beforeCleanup = controller.metrics;
  if (mode === 'remove-retry') {
    await assert.rejects(controller.dispose(), /JOB_REMOVE_FAILURE/); assert.equal(locks.held.size, 1); rejectRemove = false;
  }
  await controller.dispose(); assert.equal(locks.held.size, 0); assert.equal(backend.open.size, 0);
  results.push({mode, completed, error, beforeCleanup, metadataSlices, noHandlesOrLeasesAfterCleanup: true, mutexReleased: true,
    boundary: 'Node test files only; no external browser commit was performed'});
  } finally { rejectClose = false; rejectRemove = false; await controller.dispose(); }
}

// Small remux regression exercises candidate H.264/AAC configuration and original
// packet payloads. This is not a decode/encode or headset acceptance test.
for (const layout of ['sbs', 'tb']) for (const audio of [false, true]) {
  const inputFile = resolve(`docs/vr180-studio/fixtures/stereo180-${layout}.mp4`);
  const input = new M.Input({source: new M.BlobSource(await openAsBlob(inputFile)), formats: [M.MP4]});
  let controller;
  try {
  const backend = nodeRoot(join(out, `small-${layout}-${audio}-root`)), locks = testLocks();
  controller = values.reference ? null : await createOutputIndex({root: backend.root, jobId: 'job', layout, lockManager: locks, yieldTask: tick});
  const file = join(out, `small-${layout}-${audio}.mp4`), fd = await open(file, 'wx'); let extent = 0;
  const format = new M.Mp4OutputFormat({fastStart: false}); if (controller) format._options.vr180Index = controller;
  const output = new M.Output({format, target: new M.StreamTarget(new WritableStream({async write({data, position}) {
    for (let done = 0; done < data.length;) { const {bytesWritten} = await fd.write(data, done, data.length - done, position + done); assert(bytesWritten > 0); done += bytesWritten; }
    extent = Math.max(extent, position + data.length);
  }}), {chunked: true, chunkSize: 1024 * 1024})});
  let expectedCount = 0;
  try {
    const tracks = (await input.getTracks()).filter(t => audio || t.type === 'video'), states = [];
    for (const track of tracks) {
      const source = track.type === 'video' ? new M.EncodedVideoPacketSource('avc') : new M.EncodedAudioPacketSource('aac');
      if (track.type === 'video') output.addVideoTrack(source); else output.addAudioTrack(source);
      const sink = new M.EncodedPacketSink(track); states.push({source, sink, next: await sink.getFirstPacket(), config: await track.getDecoderConfig(), first: true});
    }
    await output.start();
    for (;;) {
      let state = null; for (const candidate of states) if (candidate.next && (!state || candidate.next.timestamp < state.next.timestamp)) state = candidate;
      if (!state) break; const packet = state.next;
      await state.source.add(packet, state.first ? {decoderConfig: state.config} : undefined); state.first = false; expectedCount++;
      state.next = await state.sink.getNextPacket(packet);
    }
    for (const state of states) await state.source.close(); await output.finalize(); await fd.truncate(extent);
  } finally { try { if (!['finalized', 'canceled'].includes(output.state)) await output.cancel(); } finally { try { await fd.close(); } finally { input.dispose(); } } }
  const info = await inspectMp4(await openAsBlob(file)); if (controller) { assert.equal(info.stereoMode, layout === 'sbs' ? 2 : 1); assert.equal(info.projection, 'equi'); } assert.equal(info.audioCodecs.length, +audio);
  assert.equal(info.sampleCounts.total, expectedCount);
  // Same candidate bundle demuxes input/output in this process; no mixed classes.
  const sources = await Promise.all([inputFile, file].map(async name => new M.Input({source: new M.BlobSource(await openAsBlob(name)), formats: [M.MP4]})));
  let compared = 0;
  try {
    const pairs = await Promise.all(sources.map(async source => (await source.getTracks()).filter(t => audio || t.type === 'video')));
    for (let index = 0; index < pairs[0].length; index++) {
      const sinks = pairs.map(tracks => new M.EncodedPacketSink(tracks[index])); let packets = await Promise.all(sinks.map(sink => sink.getFirstPacket()));
      while (packets[0] || packets[1]) { assert(packets[0] && packets[1]);
        const [a, b] = packets; assert.equal(a.type, b.type); assert(Math.abs(a.timestamp - b.timestamp) <= 0.001);
        assert(Math.abs(a.duration - b.duration) <= 0.001); assert.deepEqual(a.data, b.data); compared++;
        packets = await Promise.all(sinks.map((sink, i) => sink.getNextPacket(packets[i])));
      }
    }
  } finally { sources.forEach(source => source.dispose()); }
  assert.equal(compared, expectedCount); const metrics = controller?.metrics;
  await controller?.dispose(); assert.equal(locks.held.size, 0); assert.equal(backend.open.size, 0);
  results.push({mode: 'small-remux', layout, audio, file, bytes: extent, compared, info, metrics, decoded: false,
    verifier: 'same candidate bundle, unchanged demuxer; independent fixed-original check still required for small regressions'});
  } finally { try { input.dispose(); } finally { await controller?.dispose(); } }
}
const endedProvenance=await provenance();assert.deepEqual(endedProvenance,startedProvenance,'Executed source/fixtures changed');
const outputFingerprints=await Promise.all(results.filter(row=>row.mode==='small-remux').map(row=>fingerprint(row.file)));
await writeFile(join(out, 'probe.json'), JSON.stringify({schemaVersion: 1, runtimeProvenance: await runtimeProvenance(),
  startedProvenance,endedProvenance,outputFingerprints,reference:values.reference,
  onlyBundleLoaded: resolve(values.bundle), results}, null, 2) + '\n');
console.log(JSON.stringify({pass: results.length, cases: results.map(row => row.mode)}));
