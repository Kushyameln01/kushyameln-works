import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createFileOutput, finalizeDirectOutput} from '../docs/shared/vr180/file-output.mjs';
import {createMuxCapture} from '../docs/shared/vr180/mux-capture.mjs';
import {inspectMp4, tagMp4} from '../docs/shared/vr180/mp4.mjs';

// Move the fixed fixture's moov to the tail and adjust its chunk addresses.
// Sample bytes and all time tables stay identical; no production rewriter is used.
async function muxFixture() {
  const original = await readFile(new URL('../docs/vr180-studio/fixtures/stereo180-sbs.mp4', import.meta.url));
  const ftypEnd = original.readUInt32BE(0), movieBytes = original.readUInt32BE(ftypEnd);
  assert.equal(original.toString('ascii', ftypEnd + 4, ftypEnd + 8), 'moov');
  const moov = Buffer.from(original.subarray(ftypEnd, ftypEnd + movieBytes));
  const containers = new Set(['moov','trak','mdia','minf','stbl']);
  function patch(start, end) {
    for (let at = start; at < end;) {
      const n = moov.readUInt32BE(at), type = moov.toString('ascii', at + 4, at + 8);
      assert(n >= 8 && at + n <= end);
      if (containers.has(type)) patch(at + 8, at + n);
      if (type === 'stco') for (let i = 0; i < moov.readUInt32BE(at + 12); i++) moov.writeUInt32BE(moov.readUInt32BE(at + 16 + i * 4) - movieBytes, at + 16 + i * 4);
      at += n;
    }
  }
  patch(0, moov.length);
  const body = Buffer.concat([original.subarray(0, ftypEnd), original.subarray(ftypEnd + movieBytes)]);
  return {bytes: Buffer.concat([body, moov]), moov, position: body.length};
}
function handleMock(hooks = {}) {
  let saved = new Uint8Array(), draft, closes = 0, aborts = 0;
  return {
    async getFile() { return new Blob([saved]); },
    async createWritable() { draft = new Uint8Array(); return {
      async write({position, data}) { const next = new Uint8Array(Math.max(draft.length, position + data.length)); next.set(draft); next.set(data, position); draft = next; },
      async truncate(n) { const next = new Uint8Array(n); next.set(draft.subarray(0,n)); draft = next; },
      async close() { closes++; saved = draft.slice(); hooks.afterClose?.(saved); },
      async abort() { aborts++; draft = null; },
    }; },
    get stats() { return {closes, aborts, saved: saved.length}; },
  };
}
async function transaction(fixture, handle, signal) {
  const output = await createFileOutput(handle, {signal}), capture = createMuxCapture();
  // Callback can precede or follow the target's async write acknowledgement.
  for (let at = 0; at < fixture.bytes.length; at += 512) {
    const data = fixture.bytes.subarray(at, at + 512);
    await output.writeAt(at, data); capture.write({position: at, data});
  }
  capture.onMoov(fixture.moov, fixture.position);
  const writer = output.stream.getWriter(); await writer.close();
  return {output, ...capture.finish(output.status.extent)};
}

test('direct finalization patches VR metadata before physical close, then checks saved metadata', async () => {
  const fixture = await muxFixture(), handle = handleMock(), direct = await transaction(fixture, handle);
  assert.equal(handle.stats.closes, 0); assert.equal(direct.output.status.muxerClosed, true);
  assert.throws(() => direct.source.slice(4096, 4100), /DIRECT_UNCAPTURED_RANGE/);
  const before = await inspectMp4(direct.source);
  const result = await finalizeDirectOutput(direct);
  for (const phase of ['tagPlan', 'metadataExpectedHash', 'metadataWrite', 'truncate', 'close', 'getFile', 'savedFileHash', 'metadataReadback', 'savedInspect']) {
    assert.equal(result.timings[phase].status, 'completed');
    assert(result.timings[phase].durationMs >= 0);
  }
  assert.equal(result.timings.savedFileHash.requestedBytes, result.saved.bytes);
  const expected = await tagMp4(new Blob([fixture.bytes]), {layout:'sbs'});
  assert.deepEqual(new Uint8Array(await result.saved.file.arrayBuffer()), new Uint8Array(await expected.arrayBuffer()));
  assert.equal(result.saved.sha256, createHash('sha256').update(new Uint8Array(await expected.arrayBuffer())).digest('hex'));
  assert.equal(result.saved.hashMatched, false); assert.equal(result.verification.wholeFileHashCompared, false);
  assert.equal(result.verification.metadataHashMatched, true); assert.equal(result.info.projection, 'equi');
  assert.deepEqual(result.info.sampleCounts, before.sampleCounts); assert.equal(handle.stats.closes, 1);
  await direct.output.abort(); assert.equal(handle.stats.saved, expected.size); // Never rolls back a committed output.
});

test('direct cancellation before commit leaves no saved bytes', async () => {
  const controller = new AbortController(), handle = handleMock();
  const direct = await transaction(await muxFixture(), handle, controller.signal);
  controller.abort();
  await assert.rejects(finalizeDirectOutput(direct, {signal: controller.signal}), e => e.name === 'AbortError' && e.saveWriteCommitted === false);
  await direct.output.abort(); assert.equal(handle.stats.closes, 0); assert.equal(handle.stats.saved, 0);
});

test('direct cancellation during physical close preserves the committed-state warning', async () => {
  const controller = new AbortController(), handle = handleMock({afterClose: () => controller.abort()});
  const direct = await transaction(await muxFixture(), handle, controller.signal);
  await assert.rejects(finalizeDirectOutput(direct, {signal: controller.signal}), e => e.name === 'AbortError' && e.saveWriteCommitted === true);
  await direct.output.abort(); assert.equal(handle.stats.closes, 1); assert(handle.stats.saved > 0);
});

test('metadata corruption after close cannot become a successful direct save', async () => {
  const handle = handleMock({afterClose: saved => { saved[saved.length - 1] ^= 1; }});
  const direct = await transaction(await muxFixture(), handle);
  await assert.rejects(finalizeDirectOutput(direct), e => e.message === 'DIRECT_METADATA_HASH_MISMATCH' && e.saveWriteCommitted === true);
  assert.equal(handle.stats.closes, 1); assert(handle.stats.saved > 0);
});

test('capture refuses missing metadata, sparse writes and duplicate or oversized metadata callbacks', async () => {
  const a = createMuxCapture(); assert.throws(() => a.finish(0), /DIRECT_MUX_NOT_FINALIZED/);
  assert.throws(() => a.write({position: 10, data: Uint8Array.of(1)}), /DIRECT_WRITE_GAP/);
  const f = await muxFixture(), b = createMuxCapture(); b.onMoov(f.moov, f.position);
  assert.throws(() => b.onMoov(f.moov, f.position), /DIRECT_MOOV_COUNT_INVALID/);
  assert.throws(() => createMuxCapture().onMoov(new Uint8Array(16 * 1024 ** 2 + 1), 0), /DIRECT_MOOV_BUDGET_EXCEEDED/);
});
