import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOutputIndex, PROFILE} from '../development/vr180/output-index-prototype/output-index.mjs';
import {nodeRoot, testLocks} from '../development/vr180/output-index-prototype/node-backend.mjs';
const tick = () => new Promise(r => setImmediate(r));
function setup(t, hooks = {}) {
  const path = mkdtempSync(join(tmpdir(), 'vr180-output-index-')); t.after(() => rmSync(path, {recursive: true, force: true}));
  const backend = nodeRoot(path, hooks), lockManager = testLocks();
  return {path, backend, lockManager, options: {root: backend.root, jobId: 'job', lockManager, yieldTask: tick}};
}
function fakeMuxer() {
  let position = 48; const writes = [];
  return {writer: {getPos: () => position, target: {}, write(bytes) { writes.push([position, bytes.length]); position += bytes.length; }, async flush() {}}, writes};
}
const track = () => ({type: 'video', timescale: 30000, startTimestampOffset: null, track: {id: 1, source: {_codec: 'avc'}}});
const sample = (timestamp, key = true, data = new Uint8Array(10)) => ({timestamp, duration: 1 / 30, size: data.length, data, type: key ? 'key' : 'delta'});

test('disk timing records are patched across GOP boundaries and preserve decode-order sample identity', async t => {
  const h = setup(t), controller = await createOutputIndex(h.options), muxer = fakeMuxer(), video = track();
  try {
    await controller.register(muxer, video, sample(1 / 30)); await controller.register(muxer, video, sample(0, false));
    await controller.register(muxer, video, sample(3 / 30)); await controller.register(muxer, video, sample(2 / 30, false));
    await controller.closeTrack(video);
    const records = readFileSync(join(h.path, 'job', 'job-t1-samples', 'records.bin')); assert.equal(records.length, 4 * 64);
    const d = new DataView(records.buffer, records.byteOffset, records.byteLength);
    for (let i = 0; i < 4; i++) {
      assert.equal(d.getFloat64(i * 64, true), [1, 0, 3, 2][i] / 30);
      assert.equal(d.getFloat64(i * 64 + 8, true), i / 30); assert.equal(d.getFloat64(i * 64 + 32, true), 1000);
      assert.equal(d.getInt32(i * 64 + 40, true), i % 2 ? -1000 : 1000);
    }
    assert.equal(controller.metrics.peakTimestampSamples, 2); assert.equal(controller.metrics.sampleCount, 4);
    assert(controller.metrics.budgetPeakBytes <= 8 * 1024 ** 2);
  } finally { await controller.dispose(); }
  assert.equal(h.backend.open.size, 0); assert.equal(h.lockManager.held.size, 0);
});

test('chunk byte and reference caps reject without changing the original half-second boundary', async t => {
  for (const mode of ['bytes', 'references']) {
    const h = setup(t), controller = await createOutputIndex(h.options), muxer = fakeMuxer(), video = track();
    try {
      if (mode === 'bytes') await controller.register(muxer, video, sample(0, true, new Uint8Array(PROFILE.maxChunkBytes)));
      else for (let i = 0; i < PROFILE.maxChunkSamples; i++) await controller.register(muxer, video, sample(0, false, new Uint8Array(1)));
      await assert.rejects(controller.register(muxer, video, sample(0, false, new Uint8Array(1))), /CHUNK_LIMIT/);
      assert.equal(muxer.writes.length, 0); assert.equal(controller.metrics.sampleCount, mode === 'bytes' ? 1 : PROFILE.maxChunkSamples);
    } finally { await controller.dispose(); }
    assert.equal(controller.metrics.tracks[0].liveChunkBytes, 0); assert.equal(h.backend.open.size, 0);
  }
});

test('controller cancellation waits for pending timestamp disk reads before owned cleanup', async t => {
  const h = setup(t); let unblock, entered;
  const reached = new Promise(r => { entered = r; }); let pause = false;
  const controller = await createOutputIndex({...h.options, yieldTask: () => pause ? new Promise(r => { unblock = r; entered(); }) : tick()});
  const video = track(), muxer = fakeMuxer();
  await controller.register(muxer, video, sample(1 / 30)); await controller.register(muxer, video, sample(0, false));
  pause = true; const closing = controller.closeTrack(video); const rejected = assert.rejects(closing, {name: 'AbortError'});
  await reached; const disposing = controller.dispose(); assert(h.lockManager.held.size > 0); assert.equal(h.backend.calls.remove.length, 0);
  unblock(); await rejected; await disposing; assert.equal(h.backend.open.size, 0); assert.equal(h.lockManager.held.size, 0);
});

test('cleanup close failure keeps outer ownership and has no cross-job deletion', async t => {
  let failClose = true;
  const h = setup(t, {close(file) { if (failClose && file.endsWith('metadata.bin')) throw Error('SPOOL_CLOSE_FAILED'); }});
  mkdirSync(join(h.path, 'other-job'));
  const controller = await createOutputIndex(h.options);
  await assert.rejects(controller.dispose(), /SPOOL_CLOSE_FAILED/); assert.equal(h.lockManager.held.size, 1);
  await assert.rejects(createOutputIndex(h.options), /LOCK_BUSY/); assert.equal(h.backend.calls.remove.length, 0);
  failClose = false; await controller.dispose(); assert.equal(h.lockManager.held.size, 0);
  assert(!h.backend.calls.remove.includes(join(h.path, 'other-job')));
});

test('unavailable lock never creates a job; an existing job is not removed', async t => {
  const h = setup(t);
  await assert.rejects(createOutputIndex({...h.options, lockManager: null}), error => error.status === 'BLOCKED');
  assert.equal(h.backend.open.size, 0); assert.equal(h.backend.calls.remove.length, 0);
  mkdirSync(join(h.path, 'job'));
  await assert.rejects(createOutputIndex(h.options), /ALREADY_EXISTS/); assert.equal(h.lockManager.held.size, 0);
  assert.equal(h.backend.calls.remove.length, 0);
});


test('borrowed subviews count their backing allocation conservatively before retention', async t => {
  const h = setup(t), controller = await createOutputIndex(h.options), muxer = fakeMuxer(), video = track();
  try {
    const oversized = new Uint8Array(new ArrayBuffer(8 * 1024 ** 2), 17, 6744);
    await assert.rejects(controller.register(muxer, video, sample(0, true, oversized)), /CHUNK_BACKING_LIMIT/);
    assert.equal(controller.metrics.sampleCount, 0);
    const shared = new ArrayBuffer(3 * 1024 ** 2);
    await controller.register(muxer, video, sample(0, true, new Uint8Array(shared, 0, 10)));
    await assert.rejects(controller.register(muxer, video, sample(0, false, new Uint8Array(shared, 20, 10))), /CHUNK_BACKING_LIMIT/);
    assert.equal(controller.metrics.tracks[0].liveChunkBackingBytes, shared.byteLength);
    assert.equal(controller.metrics.tracks[0].liveChunkBytes, 10);
  } finally { await controller.dispose(); }
  assert.equal(controller.metrics.tracks[0].liveChunkBackingBytes, 0);
});
