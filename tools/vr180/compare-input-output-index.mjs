#!/usr/bin/env node
// Private remux integration only. No codec/browser/save-dialog qualification.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream, openAsBlob} from 'node:fs';
import {mkdir, open, readFile, writeFile} from 'node:fs/promises';
import {join, resolve, basename} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import * as original from '../../docs/shared/media-basic/vendor/mediabunny.mjs';
import {createInputIndex} from '../../development/vr180/input-index-prototype/input-index.mjs';
import {createOutputIndex, PROFILE as OUTPUT_PROFILE} from '../../development/vr180/output-index-prototype/output-index.mjs';
import {createIndexBudget} from '../../development/vr180/index-prototype/index-store.mjs';
import {nodeRoot, testLocks} from '../../development/vr180/output-index-prototype/node-backend.mjs';
import {comparePackets} from './compare-output-index.mjs';
import {runtimeProvenance, cleanupAll} from './compare-input-index.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function hashFile(file) { const hash = createHash('sha256'); let bytes = 0;
  for await (const data of createReadStream(file, {highWaterMark: 65536})) { hash.update(data); bytes += data.length; }
  return {bytes, sha256: hash.digest('hex')}; }
async function remux({module, blob, file, backend, lockManager, candidate, fixedMuxerFixture}) {
  const budget = createIndexBudget(); let inputIndex, outputIndex, input, output, handle;
  const counts = {video: 0, audio: 0}; let extent = 0;
  try {
    // Explicitly distinct IDs under one root and one budget. Both are alive
    // during input initialization, so their simultaneous reservations are tested.
    if (candidate) {
      inputIndex = await createInputIndex({source: blob, root: backend.root, lockManager, budget, jobId: 'remux-in', yieldTask: tick,
        sortBytes: 4 * 1024 ** 2 - OUTPUT_PROFILE.sortReservedBytes, fixedMuxerFixture});
      outputIndex = await createOutputIndex({root: backend.root, lockManager, budget, jobId: 'remux-out', yieldTask: tick});
    }
    input = new module.Input({source: new module.BlobSource(blob, {maxCacheSize: 1024 * 1024, useStreamReader: false}), formats: [module.MP4]});
    if (candidate) input._vr180InputIndex = inputIndex;
    const tracks = await input.getTracks(), format = new module.Mp4OutputFormat({fastStart: false});
    if (candidate) format._options.vr180Index = outputIndex;
    handle = await open(file, 'wx');
    output = new module.Output({format, target: new module.StreamTarget(new WritableStream({
      async write({data, position}) { extent = Math.max(extent, position + data.length);
        for (let done = 0; done < data.length;) { const {bytesWritten} = await handle.write(data, done, data.length - done, position + done);
          assert(bytesWritten > 0); done += bytesWritten; }
      },
    }, {highWaterMark: 1}), {chunked: true, chunkSize: 1024 * 1024})});
    output._muxer.creationTime = 3860000000;
    const sources = tracks.map(track => {
      if (track.type === 'video') { const source = new module.EncodedVideoPacketSource('avc'); output.addVideoTrack(source); return source; }
      assert.equal(track.type, 'audio'); const source = new module.EncodedAudioPacketSource('aac'); output.addAudioTrack(source); return source;
    });
    await output.start();
    // Round-robin decode order, preserving each track's original EncodedPacket.
    const sinks = tracks.map(track => new module.EncodedPacketSink(track));
    const configs = await Promise.all(tracks.map(track => track.getDecoderConfig()));
    let packets = await Promise.all(sinks.map(sink => sink.getFirstPacket()));
    const first = tracks.map(() => true);
    while (packets.some(Boolean)) {
      for (let i = 0; i < tracks.length; i++) if (packets[i]) {
        await sources[i].add(packets[i], first[i] ? {decoderConfig: configs[i]} : undefined); first[i] = false;
        counts[tracks[i].type]++; packets[i] = await sinks[i].getNextPacket(packets[i]);
      }
    }
    for (const source of sources) await source.close(); await output.finalize(); await handle.truncate(extent);
    const result = {counts, inputIndex: inputIndex?.metrics, outputIndex: outputIndex?.metrics,
      sameModuleForInputOutputAndPackets: true, sharedBudgetPeakBytes: budget.peakBytes,
      simultaneousSortReservedBytes: candidate ? 4 * 1024 ** 2 : null};
    assert(budget.peakBytes <= 8 * 1024 ** 2);
    return result;
  } finally {
    await cleanupAll([
      async () => { if (output && !['finalized', 'canceled'].includes(output.state)) await output.cancel(); },
      () => input?.dispose(), () => handle?.close(), () => outputIndex?.dispose(), () => inputIndex?.dispose(),
    ]);
    assert.equal(backend.open.size, 0); assert.equal(lockManager.held.size, 0); assert.equal(budget.usedBytes, 0);
  }
}
const {values} = parseArgs({options: {bundle: {type: 'string'}, 'out-dir': {type: 'string'}, file: {type: 'string', multiple: true},
  'fixed-muxer-fixture': {type: 'boolean', default: false}}});
assert(values.bundle && values['out-dir']); const bundle = resolve(values.bundle), out = resolve(values['out-dir']); await mkdir(out);
const fork = await import(pathToFileURL(bundle)), repo = fileURLToPath(new URL('../..', import.meta.url));
const files = values.file?.map(file => resolve(file)) ?? ['stereo180-sbs', 'stereo180-tb', 'stereo360-tb'].map(name => join(repo, 'docs/vr180-studio/fixtures', name + '.mp4'));
assert(files.length <= 12); const cases = [];
for (let i = 0; i < files.length; i++) {
  const blob = await openAsBlob(files[i]); assert(blob.size <= 1024 ** 3);
  const directory = join(out, `case-${i}`); await mkdir(directory);
  const runtimeProvenanceAtStart = await runtimeProvenance();
  const result = {file: basename(files[i]), status: 'FAIL', source: await hashFile(files[i]), runtimeProvenanceAtStart,
    fixedMuxerFixture: values['fixed-muxer-fixture']};
  try {
    const referenceFile = join(directory, 'reference.mp4'), candidateFile = join(directory, 'candidate.mp4');
    const baseline = await remux({module: original, blob, file: referenceFile, candidate: false,
      backend: nodeRoot(join(directory, 'reference-adapter')), lockManager: testLocks()});
    const candidate = await remux({module: fork, blob, file: candidateFile, candidate: true,
      backend: nodeRoot(join(directory, 'candidate-adapter')), lockManager: testLocks(), fixedMuxerFixture: values['fixed-muxer-fixture']});
    assert.deepEqual(candidate.counts, baseline.counts);
    const reference = await hashFile(referenceFile), produced = await hashFile(candidateFile); assert.deepEqual(produced, reference);
    const packets = await comparePackets(referenceFile, candidateFile, Object.values(candidate.counts).reduce((a, b) => a + b, 0));
    Object.assign(result, {status: 'PASS', baseline, candidate, reference, produced, packets, cleanup: {openHandles: 0, heldLocks: 0, reservedBytes: 0}});
  } catch (error) { result.error = error.stack; }
  result.runtimeProvenanceAtEnd = await runtimeProvenance();
  try { assert.deepEqual(result.runtimeProvenanceAtEnd, runtimeProvenanceAtStart, 'Runtime source changed during remux'); }
  catch (error) { result.status = 'FAIL'; result.runtimeProvenanceError = error.stack; }
  cases.push(result); await writeFile(join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
  if (result.status !== 'PASS') break;
}
const report = {schemaVersion: 1, status: cases.length === files.length && cases.every(c => c.status === 'PASS') ? 'PASS' : 'FAIL',
  bundle: await hashFile(bundle), classesMixedWithinRemux: false, backend: 'Node real files/test locks',
  browserExecuted: false, decoded: false, vrMetadataAdded: false, publicFilesChanged: false, cases};
await writeFile(join(out, 'comparison.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
process.stdout.write(JSON.stringify({status: report.status, cases: cases.map(c => ({file: c.file, status: c.status,
  error: c.error, packets: c.packets?.count, budgetPeakBytes: c.candidate?.sharedBudgetPeakBytes}))}) + '\n');
if (report.status !== 'PASS') process.exitCode = 1;
