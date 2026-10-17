#!/usr/bin/env node
// Private fork comparison; no publishing, browser emulation, or capacity expansion.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openAsBlob, createReadStream} from 'node:fs';
import {mkdir, readFile, writeFile, stat} from 'node:fs/promises';
import {resolve, join, basename} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import * as original from '../../docs/shared/media-basic/vendor/mediabunny.mjs';
import {createInputIndex} from '../../development/vr180/input-index-prototype/input-index.mjs';
import {nodeRoot, testLocks} from '../../development/vr180/output-index-prototype/node-backend.mjs';
const repo = fileURLToPath(new URL('../..', import.meta.url));
const tick = () => new Promise(resolve => setImmediate(resolve));
const hash = () => createHash('sha256');
const sha = bytes => hash().update(bytes).digest('hex');
const valuesOf = packet => packet && [packet.timestamp, packet.duration, packet.type, packet.sequenceNumber, packet.byteLength];
const fileSha = async file => { const digest = hash(); for await (const bytes of createReadStream(file, {highWaterMark: 65536})) digest.update(bytes); return digest.digest('hex'); };
export async function runtimeProvenance() {
  const names = ['development/vr180/input-index-prototype/input-index.mjs', 'development/vr180/input-index-prototype/presentation-index.mjs',
    'development/vr180/index-prototype/index-store.mjs', 'development/vr180/index-prototype/job-owner.mjs', 'development/vr180/output-index-prototype/output-index.mjs',
    'development/vr180/output-index-prototype/mp4-output-inspect.mjs', 'development/vr180/output-index-prototype/node-backend.mjs',
    'docs/shared/vr180/mp4.mjs', 'docs/shared/media-basic/vendor/mediabunny.mjs',
    'tools/vr180/compare-output-index.mjs', 'tools/vr180/compare-input-index.mjs', 'tools/vr180/compare-input-output-index.mjs'];
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await fileSha(join(repo, name))])));
}
export async function cleanupAll(actions) {
  const errors = [];
  for (const action of actions) try { await action(); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'Owned cleanup failed: ' + errors.map(e => e.message).join('; '));
}

export async function compareInputCase({bundle, file, out, sortBytes, fixedMuxerFixture = false}) {
  await mkdir(out, {recursive: false});
  const runtimeProvenanceAtStart = await runtimeProvenance();
  const fork = await import(pathToFileURL(resolve(bundle))), blob = await openAsBlob(file);
  const backend = nodeRoot(join(out, 'index-test-adapter')), lockManager = testLocks();
  const controller = await createInputIndex({source: blob, root: backend.root, jobId: 'input-comparison',
    lockManager, yieldTask: tick, fixedMuxerFixture, ...(sortBytes ? {sortBytes} : {})});
  const inputs = [];
  const result = {schemaVersion: 1, status: 'FAIL', file: basename(file), inputBytes: blob.size,
    classIdentityMixedWithinInput: false,
    decoded: false, browserExecuted: false, publicFilesChanged: false, fixedMuxerFixture, runtimeProvenanceAtStart, tracks: []};
  try {
    // From the first owned controller onward, every fallible preparation is
    // inside cleanup scope, including a bad fork constructor or input hash I/O.
    for (const module of [original, fork]) inputs.push(new module.Input({source: new module.BlobSource(blob,
      {maxCacheSize: 1024 * 1024, useStreamReader: false}), formats: [module.MP4]}));
    inputs[1]._vr180InputIndex = controller;
    Object.assign(result, {inputSha256: await fileSha(file), bundleSha256: sha(await readFile(bundle))});
    const tracks = await Promise.all(inputs.map(input => input.getTracks())); assert.equal(tracks[0].length, tracks[1].length);
    const demuxer = await inputs[1]._getDemuxer();
    assert.equal(demuxer.moovSlice, null); assert(demuxer.tracks.every(t => t.sampleTable === null && t.sampleTableByteOffset === null));
    for (let t = 0; t < tracks[0].length; t++) {
      const pair = tracks.map(list => list[t]); assert.equal(pair[0].type, pair[1].type);
      assert.deepEqual(await pair[1].getDecoderConfig(), await pair[0].getDecoderConfig());
      const sinks = [new original.EncodedPacketSink(pair[0]), new fork.EncodedPacketSink(pair[1])];
      let packets = await Promise.all(sinks.map(sink => sink.getFirstPacket())), count = 0, payloadBytes = 0, seekCount = 0;
      const payload = hash(), metadata = hash(); const declared = controller.metrics.tracks.find(row => row.id === demuxer.tracks[t].id).count;
      while (packets[0] || packets[1]) {
        assert(packets[0] && packets[1], 'missing packet');
        assert.deepEqual(valuesOf(packets[1]), valuesOf(packets[0])); assert.deepEqual(packets[1].data, packets[0].data);
        assert.deepEqual(packets[1].sideData, packets[0].sideData);
        payload.update(packets[1].data); metadata.update(JSON.stringify(valuesOf(packets[1]))); payloadBytes += packets[1].data.length;
        if (count % Math.max(1, Math.ceil(declared / 8)) === 0) {
          const timestamp = packets[0].timestamp + packets[0].duration / 2;
          for (const method of ['getPacket', 'getKeyPacket']) {
            const sought = await Promise.all(sinks.map(sink => sink[method](timestamp, {metadataOnly: true})));
            assert.deepEqual(valuesOf(sought[1]), valuesOf(sought[0])); seekCount++;
          }
          const keys = await Promise.all(sinks.map((sink, i) => sink.getNextKeyPacket(packets[i], {metadataOnly: true})));
          assert.deepEqual(valuesOf(keys[1]), valuesOf(keys[0])); seekCount++;
        }
        count++; packets = await Promise.all(sinks.map((sink, i) => sink.getNextPacket(packets[i])));
      }
      assert.equal(count, declared);
      assert.equal(await pair[1].computeDuration(), await pair[0].computeDuration());
      assert.equal(await pair[1].getDurationFromMetadata(), await pair[0].getDurationFromMetadata());
      const edges = [-Infinity, Infinity];
      for (const timestamp of edges) {
        const sought = await Promise.all(sinks.map(sink => sink.getPacket(timestamp, {metadataOnly: true})));
        assert.deepEqual(valuesOf(sought[1]), valuesOf(sought[0]));
      }
      result.tracks.push({type: pair[0].type, count, payloadBytes, seekCount, completeEndReached: true,
        allPacketPayloadsCompared: true, allPacketMetadataCompared: true,
        payloadSha256: payload.digest('hex'), metadataSha256: metadata.digest('hex')});
    }
    result.metrics = controller.metrics;
    assert.equal(result.metrics.initializationCount, 1);
    assert(result.metrics.budgetPeakBytes <= 8 * 1024 ** 2);
    assert(result.metrics.metadataMaxReadBytes <= 65536 && result.metrics.tableMaxReadBytes <= 65536);
    result.status = 'PASS';
  } catch (error) { result.error = error.stack; }
  finally {
    try { await cleanupAll([...inputs.map(input => () => input.dispose()), () => controller.dispose()]);
      result.cleanup = {openHandles: backend.open.size, heldLocks: lockManager.held.size,
      reservedBytes: controller.metrics.budgetReservedBytes, disposed: controller.metrics.disposed};
      assert.equal(result.cleanup.openHandles, 0); assert.equal(result.cleanup.heldLocks, 0); assert.equal(result.cleanup.reservedBytes, 0);
    } catch (error) { result.status = 'FAIL'; result.cleanupError = error.stack; }
  }
  result.runtimeProvenanceAtEnd = await runtimeProvenance();
  try { assert.deepEqual(result.runtimeProvenanceAtEnd, runtimeProvenanceAtStart, 'Runtime source changed during comparison'); }
  catch (error) { result.status = 'FAIL'; result.runtimeProvenanceError = error.stack; }
  await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
  return result;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const {values} = parseArgs({options: {bundle: {type: 'string'}, 'out-dir': {type: 'string'},
    file: {type: 'string', multiple: true}, 'sort-bytes': {type: 'string'}, 'fixed-muxer-fixture': {type: 'boolean', default: false}}});
  assert(values.bundle && values['out-dir']); const out = resolve(values['out-dir']); await mkdir(out);
  const files = values.file?.map(file => resolve(file)) ?? ['stereo180-sbs', 'stereo180-tb', 'stereo360-tb']
    .map(name => join(repo, 'docs/vr180-studio/fixtures', name + '.mp4'));
  assert(files.length <= 12);
  const results = [];
  for (let i = 0; i < files.length; i++) {
    assert((await stat(files[i])).size <= 1024 ** 3, 'private comparison input limit');
    const result = await compareInputCase({bundle: values.bundle, file: files[i], out: join(out, `case-${i}`),
      sortBytes: values['sort-bytes'] ? Number(values['sort-bytes']) : undefined, fixedMuxerFixture: values['fixed-muxer-fixture']});
    results.push(result); if (result.status !== 'PASS') break;
  }
  const report = {status: results.length === files.length && results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL', results};
  await writeFile(join(out, 'comparison.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  process.stdout.write(JSON.stringify({status: report.status, cases: results.map(r => ({file: r.file, status: r.status, error: r.error, tracks: r.tracks,
    budgetPeakBytes: r.metrics?.budgetPeakBytes, sourceReadBytes: r.metrics?.tableReadBytes}))}) + '\n');
  if (report.status !== 'PASS') process.exitCode = 1;
}
