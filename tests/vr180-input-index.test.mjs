import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, openAsBlob, writeFileSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as original from '../docs/shared/media-basic/vendor/mediabunny.mjs';
import {createInputIndex} from '../development/vr180/input-index-prototype/input-index.mjs';
import {createOutputIndex, PROFILE as OUTPUT_PROFILE} from '../development/vr180/output-index-prototype/output-index.mjs';
import {buildPresentationIndex} from '../development/vr180/input-index-prototype/presentation-index.mjs';
import {createIndexBudget, createIndexStore} from '../development/vr180/index-prototype/index-store.mjs';
import {nodeRoot, testLocks} from '../development/vr180/output-index-prototype/node-backend.mjs';
import {cleanupAll, compareInputCase} from '../tools/vr180/compare-input-index.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(t, hooks = {}) {
  const path = mkdtempSync(join(tmpdir(), 'vr180-input-index-')); t.after(() => rmSync(path, {recursive: true, force: true}));
  const backend = nodeRoot(path, hooks), lockManager = testLocks(), budget = createIndexBudget();
  return {path, backend, lockManager, budget,
    options: {root: backend.root, jobId: 'input-job', lockManager, budget, yieldTask: tick}};
}
async function fixture(name = 'stereo180-sbs') { return openAsBlob(new URL(`../docs/vr180-studio/fixtures/${name}.mp4`, import.meta.url)); }
async function initialize(controller, blob) {
  // Controller-only tests deliberately use the unchanged parser. Packet callers
  // in the generated private fork are qualified by compare-input-index separately.
  const input = new original.Input({source: new original.BlobSource(blob, {maxCacheSize: 1024 * 1024, useStreamReader: false}), formats: [original.MP4]});
  try {
    const demuxer = await input._getDemuxer(), slice = await demuxer.reader.requestSlice(0, 8);
    await controller.readMetadata(demuxer, slice.constructor);
    return {input, demuxer};
  } catch (error) { input.dispose(); throw error; }
}

async function manyChunkFixture(count = 6000, withCslg = false) {
  // Test-only small source: repeat one actual AVC key sample by reference. The
  // redundant legal stsc entries force a 12-byte row across byte 65536.
  const bytes = new Uint8Array(await (await fixture()).arrayBuffer()), d = new DataView(bytes.buffer);
  const children = (start, end) => { const nodes = []; for (let at = start; at < end;) {
    const size = d.getUint32(at); assert(size >= 8 && at + size <= end);
    nodes.push({start: at, end: at + size, type: String.fromCharCode(...bytes.subarray(at + 4, at + 8))}); at += size;
  } return nodes; };
  const list = node => children(node.start + 8, node.end), raw = node => bytes.slice(node.start, node.end);
  const one = (node, type) => list(node).find(n => n.type === type);
  const moov = children(0, bytes.length).find(n => n.type === 'moov'), track = one(moov, 'trak');
  const stbl = one(one(one(track, 'mdia'), 'minf'), 'stbl'), stsz = one(stbl, 'stsz'), stco = one(stbl, 'stco');
  const size = d.getUint32(stsz.start + 12) || d.getUint32(stsz.start + 20), offset = d.getUint32(stco.start + 16);
  const u32 = (...values) => { const b = new Uint8Array(values.length * 4), v = new DataView(b.buffer); values.forEach((x, i) => v.setUint32(i * 4, x)); return b; };
  const box = (type, ...parts) => { const b = new Uint8Array(8 + parts.reduce((n, p) => n + p.length, 0)); new DataView(b.buffer).setUint32(0, b.length);
    b.set(new TextEncoder().encode(type), 4); let at = 8; for (const part of parts) { b.set(part, at); at += part.length; } return b; };
  const chunks = new Uint8Array(count * 12), offsets = new Uint8Array(count * 8);
  for (let i = 0; i < count; i++) { chunks.set(u32(i + 1, 1, 1), i * 12); new DataView(offsets.buffer).setBigUint64(i * 8, BigInt(offset)); }
  const newTable = box('stbl', raw(one(stbl, 'stsd')), box('stts', u32(0, 1, count, 512)),
    ...(withCslg ? [box('ctts', u32(0x1000000, 1, count, 0)), box('cslg', u32(0, 0, 0, 0, 0, count * 512))] : []),
    box('stsc', u32(0, count), chunks), box('co64', u32(0, count), offsets), box('stsz', u32(0, size, count)));
  const replace = node => node.start === stbl.start ? newTable : node.type === 'edts' ? null
    : ['trak', 'mdia', 'minf'].includes(node.type) ? box(node.type, ...list(node).map(replace).filter(Boolean)) : raw(node);
  const newMovie = box('moov', raw(one(moov, 'mvhd')), replace(track));
  bytes.set(new TextEncoder().encode('free'), moov.start + 4);
  return {blob: new Blob([bytes, newMovie]), offset, size, count};
}

test('co64 and a 12-byte stsc row crossing 64 KiB preserve every sample mapping', async t => {
  const h = setup(t), expected = await manyChunkFixture(), controller = await createInputIndex({...h.options, source: expected.blob});
  const parsed = await initialize(controller, expected.blob);
  try {
    const track = parsed.demuxer.tracks[0];
    for (let i = 0; i < expected.count; i++) {
      const value = await controller.sampleInfo(track, i);
      assert.equal(value.sampleOffset, expected.offset); assert.equal(value.sampleSize, expected.size);
      assert.equal(value.decodeTimestamp, i * 512); assert.equal(value.presentationTimestamp, i * 512);
      assert.equal(value.chunkSize, expected.size); assert.equal(value.isKeyFrame, true);
    }
    assert.equal(controller.metrics.tableMaxReadBytes, 65536); assert.equal(controller.metrics.sampleCount, expected.count);
  } finally { parsed.input.dispose(); await controller.dispose(); }
  assert.equal(h.backend.open.size, 0); assert.equal(h.budget.usedBytes, 0); assert.equal(h.lockManager.held.size, 0);
});

test('default public parser rejects cslg; explicit fixture mode is labeled', async t => {
  const h = setup(t), {blob} = await manyChunkFixture(4, true);
  const normal = await createInputIndex({...h.options, source: blob});
  try { await assert.rejects(initialize(normal, blob), /cslg/); assert.equal(normal.metrics.validationProfile, 'unchanged-public-parser'); }
  finally { await normal.dispose(); }
  const fixtureOnly = await createInputIndex({...h.options, source: blob, fixedMuxerFixture: true}); let parsed;
  try { parsed = await initialize(fixtureOnly, blob); assert.equal(fixtureOnly.metrics.validationProfile, 'fixed-muxer-fixture-only'); }
  finally { parsed?.input.dispose(); await fixtureOnly.dispose(); }
  assert.equal(h.lockManager.held.size, 0); assert.equal(h.backend.open.size, 0); assert.equal(h.budget.usedBytes, 0);
});

test('comparison cleanup attempts each later owner even if earlier owners fail', async () => {
  const called = [];
  await assert.rejects(cleanupAll([
    () => { called.push('output cancel'); throw Error('CANCEL_FAILURE'); },
    () => { called.push('input dispose'); throw Error('INPUT_FAILURE'); },
    async () => { called.push('output handle close'); throw Error('CLOSE_FAILURE'); },
    async () => { called.push('output index dispose'); throw Error('OUTPUT_INDEX_FAILURE'); },
    async () => { called.push('input index dispose'); },
  ]), error => error instanceof AggregateError && error.errors.length === 4);
  assert.deepEqual(called, ['output cancel', 'input dispose', 'output handle close', 'output index dispose', 'input index dispose']);
});

test('comparison constructor failure after controller creation still disposes its owned job', async t => {
  const h = setup(t), bundle = join(h.path, 'invalid-fork.mjs'), out = join(h.path, 'comparison');
  writeFileSync(bundle, 'export const deliberatelyMissingInput = true;\n');
  const result = await compareInputCase({bundle, out,
    file: fileURLToPath(new URL('../docs/vr180-studio/fixtures/stereo180-sbs.mp4', import.meta.url))});
  assert.equal(result.status, 'FAIL'); assert.match(result.error, /not a constructor/);
  assert.deepEqual(result.cleanup, {openHandles: 0, heldLocks: 0, reservedBytes: 0, disposed: true});
  assert.deepEqual(readdirSync(join(out, 'index-test-adapter')), []);
});

test('all small fixture sample bytes, timing, keys and AAC edit offsets match unchanged demuxer', async t => {
  for (const name of ['stereo180-sbs', 'stereo180-tb', 'stereo360-tb']) {
    const h = setup(t), blob = await fixture(name), controller = await createInputIndex({...h.options, source: blob});
    const baseline = new original.Input({source: new original.BlobSource(blob), formats: [original.MP4]}); let parsed;
    try {
      parsed = await initialize(controller, blob);
      const tracks = await baseline.getTracks(); assert.equal(parsed.demuxer.tracks.length, tracks.length);
      for (let trackNumber = 0; trackNumber < tracks.length; trackNumber++) {
        const track = parsed.demuxer.tracks[trackNumber], sink = new original.EncodedPacketSink(tracks[trackNumber]);
        let packet = await sink.getFirstPacket(), index = 0;
        while (packet) {
          const info = await controller.sampleInfo(track, index);
          assert.equal((info.presentationTimestamp - track.editListOffset) / track.timescale, packet.timestamp);
          assert.equal(info.duration / track.timescale, packet.duration);
          assert.equal(info.isKeyFrame, packet.type === 'key'); assert.equal(info.sampleSize, packet.data.length);
          assert.deepEqual(new Uint8Array(await blob.slice(info.sampleOffset, info.sampleOffset + info.sampleSize).arrayBuffer()), packet.data);
          const middle = packet.timestamp + packet.duration / 2;
          const at = await sink.getPacket(middle), key = await sink.getKeyPacket(middle);
          assert.equal(await controller.sampleIndex(track, middle * track.timescale + track.editListOffset), at.sequenceNumber);
          assert.equal(await controller.sampleIndex(track, middle * track.timescale + track.editListOffset, true), key?.sequenceNumber ?? -1);
          index++; packet = await sink.getNextPacket(packet);
        }
        assert.equal(await controller.sampleInfo(track, index), null);
      }
      assert.equal(parsed.demuxer.moovSlice, null);
      assert(parsed.demuxer.tracks.every(track => track.sampleTable === null && track.sampleTableByteOffset === null));
      assert.equal(controller.metrics.initializationCount, 1); assert(controller.metrics.tableMaxReadBytes <= 65536);
      assert(controller.metrics.metadataMaxReadBytes <= 65536); assert(controller.metrics.budgetPeakBytes <= 8 * 1024 ** 2);
    } finally { baseline.dispose(); parsed?.input.dispose(); await controller.dispose(); }
    assert.equal(h.budget.usedBytes, 0); assert.equal(h.backend.open.size, 0); assert.equal(h.lockManager.held.size, 0);
  }
});

test('external ctts sort merges several generations with stable duplicate-PTS order and inverse', async t => {
  const h = setup(t), stores = new Set(), count = 137, metrics = {};
  const makeStore = async (name, width) => {
    const store = await createIndexStore({root: h.backend.root, jobId: name, schema: {version: 1, recordBytes: width, endianness: 'little'},
      budget: h.budget, lockManager: h.lockManager, yieldTask: tick}); stores.add(store); return store;
  };
  const samples = await makeStore('samples', 64), row = new Uint8Array(64), reference = [];
  try {
    for (let i = 0; i < count; i++) { const pts = (i * 17 % 23) - 12; new DataView(row.buffer).setFloat64(24, pts, true);
      await samples.appendRecord(row); reference.push({pts, id: i}); }
    await samples.seal(); reference.sort((a, b) => a.pts - b.pts || a.id - b.id);
    const result = await buildPresentationIndex({samples, count, makeStore, retireStore: async store => { await store.dispose(); stores.delete(store); },
      budget: h.budget, check() {}, yieldTask: tick, sortBytes: 64, fanIn: 2, metrics});
    const order = new Uint8Array(16), inverse = new Uint8Array(8);
    for (let rank = 0; rank < count; rank++) {
      await result.order.readRecord(rank, order); const view = new DataView(order.buffer);
      assert.deepEqual({pts: view.getFloat64(0, true), id: view.getFloat64(8, true)}, reference[rank]);
      await result.inverse.readRecord(reference[rank].id, inverse); assert.equal(new DataView(inverse.buffer).getFloat64(0, true), rank);
    }
    assert(metrics.sortPasses >= 4); assert.equal(stores.size, 3); assert(h.budget.peakBytes <= 8 * 1024 ** 2);
  } finally { for (const store of stores) await store.dispose(); }
  assert.equal(h.budget.usedBytes, 0);
});

test('cancel inside a later merge generation leaves all files owned for cleanup', async t => {
  const h = setup(t), stores = new Set(), count = 137, metrics = {}, abort = new AbortController();
  const makeStore = async (jobId, recordBytes) => {
    const store = await createIndexStore({root: h.backend.root, jobId, schema: {version: 1, recordBytes, endianness: 'little'},
      budget: h.budget, lockManager: h.lockManager, signal: abort.signal, yieldTask: tick}); stores.add(store); return store;
  };
  const samples = await makeStore('merge-cancel-samples', 64), row = new Uint8Array(64);
  try {
    for (let i = 0; i < count; i++) { new DataView(row.buffer).setFloat64(24, count - i, true); await samples.appendRecord(row); }
    await samples.seal();
    await assert.rejects(buildPresentationIndex({samples, count, makeStore,
      retireStore: async store => { await store.dispose(); stores.delete(store); }, budget: h.budget,
      check() { if (metrics.sortPasses >= 2) abort.abort(); if (abort.signal.aborted) throw new DOMException('cancel', 'AbortError'); },
      yieldTask: tick, sortBytes: 64, fanIn: 2, metrics}), {name: 'AbortError'});
    assert.equal(metrics.sortPasses, 2); assert.equal(metrics.presentationRecords, undefined);
    assert(stores.size >= 2); // sample and current run remain available for disposal.
  } finally { for (const store of stores) await store.dispose(); }
  assert.equal(h.budget.usedBytes, 0); assert.equal(h.lockManager.held.size, 0); assert.equal(h.backend.open.size, 0);
});

test('short reads and writes preserve all sampled fixture records', async t => {
  const h = setup(t, {shortRead: 13, shortWrite: 7}), blob = await fixture();
  const controller = await createInputIndex({...h.options, source: blob}); let parsed;
  try { parsed = await initialize(controller, blob); const track = parsed.demuxer.tracks[0];
    const first = await controller.sampleInfo(track, 0); assert(first.sampleSize > 0);
    assert.equal(await controller.sampleInfo(track, 999999), null);
    assert(controller.metrics.tracks[0].sampleStore.readCalls > 1);
  } finally { parsed?.input.dispose(); await controller.dispose(); }
  assert.equal(h.backend.open.size, 0); assert.equal(h.budget.usedBytes, 0);
});

test('cancel during range/table work releases owned resources, with no partial success', async t => {
  const controllerAbort = new AbortController(); let writes = 0;
  const h = setup(t, {write() { if (++writes === 20) controllerAbort.abort(); }}), blob = await fixture();
  const controller = await createInputIndex({...h.options, source: blob, signal: controllerAbort.signal});
  await assert.rejects(initialize(controller, blob), {name: 'AbortError'}); assert.equal(writes, 20);
  await controller.dispose(); assert.equal(controller.metrics.initialized, false);
  assert.equal(h.lockManager.held.size, 0); assert.equal(h.backend.open.size, 0); assert.equal(h.budget.usedBytes, 0);
});

test('input/output share a budget and disjoint IDs; same ID fails before taking ownership', async t => {
  const h = setup(t), blob = await fixture();
  const input = await createInputIndex({...h.options, source: blob, jobId: 'trial-in',
    sortBytes: 4 * 1024 ** 2 - OUTPUT_PROFILE.sortReservedBytes});
  const output = await createOutputIndex({...h.options, jobId: 'trial-out'});
  try {
    await assert.rejects(createOutputIndex({...h.options, jobId: 'trial-in'}), /OUTPUT_INDEX_LOCK_BUSY/);
    await assert.rejects(createInputIndex({...h.options, source: blob, jobId: 'trial-out'}), /INPUT_INDEX_LOCK_BUSY/);
    assert.equal(h.backend.calls.remove.length, 0); assert.equal(h.lockManager.held.size, 2);
    const parsed = await initialize(input, blob); parsed.input.dispose();
    assert(h.budget.peakBytes <= 8 * 1024 ** 2);
  } finally { await output.dispose(); await input.dispose(); }
  assert.equal(h.lockManager.held.size, 0); assert.equal(h.backend.open.size, 0); assert.equal(h.budget.usedBytes, 0);
});

test('query queue stays at eight and abort cancels all queued packet requests', async t => {
  const h = setup(t), blob = await fixture(), abort = new AbortController();
  const controller = await createInputIndex({...h.options, source: blob, signal: abort.signal});
  const parsed = await initialize(controller, blob);
  try {
    const track = parsed.demuxer.tracks[0];
    const pending = Array.from({length: 8}, (_, i) => controller.sampleInfo(track, i));
    await assert.rejects(controller.sampleInfo(track, 8), /INPUT_INDEX_PENDING_LIMIT/);
    abort.abort();
    const results = await Promise.allSettled(pending);
    assert(results.every(r => r.status === 'rejected' && r.reason.name === 'AbortError'));
    assert.equal(controller.metrics.peakPendingOperations, 8);
  } finally { parsed.input.dispose(); await controller.dispose(); }
  assert.equal(h.backend.open.size, 0); assert.equal(h.budget.usedBytes, 0); assert.equal(h.lockManager.held.size, 0);
});

test('exhausted explicit budget fails without an unbounded memory fallback', async t => {
  const h = setup(t), blob = await fixture(), budget = createIndexBudget(512 * 1024);
  const controller = await createInputIndex({...h.options, source: blob, budget});
  await assert.rejects(initialize(controller, blob), /INDEX_BUFFER_BUDGET_EXCEEDED/);
  assert.equal(controller.metrics.initialized, false); await controller.dispose();
  assert.equal(budget.usedBytes, 0); assert.equal(h.backend.open.size, 0); assert.equal(h.lockManager.held.size, 0);
});

test('cleanup close failure retains owner and a retry closes the same owned job', async t => {
  let failClose = true; const h = setup(t, {close() { if (failClose) throw Error('INJECTED_CLOSE_FAILURE'); }}), blob = await fixture();
  const controller = await createInputIndex({...h.options, source: blob}); const parsed = await initialize(controller, blob); parsed.input.dispose();
  await assert.rejects(controller.dispose(), /INJECTED_CLOSE_FAILURE/);
  await assert.rejects(createInputIndex({...h.options, source: blob}), /INPUT_INDEX_LOCK_BUSY/);
  assert.equal(h.backend.calls.remove.length, 0);
  failClose = false; await controller.dispose(); assert.equal(h.lockManager.held.size, 0); assert.equal(h.budget.usedBytes, 0);
});

test('unavailable native lease blocks before a directory or handle is created', async t => {
  const h = setup(t), blob = await fixture();
  await assert.rejects(createInputIndex({...h.options, source: blob, lockManager: null}), error => error.status === 'BLOCKED');
  assert.equal(h.backend.open.size, 0); assert.equal(h.backend.calls.remove.length, 0);
});
