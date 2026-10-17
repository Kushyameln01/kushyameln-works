import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerController} from '../docs/shared/vr180/worker.mjs';

const limit = 1024 ** 3;
const info = {width: 512, height: 256, transcodeSafe: true, transcodeIssues: [],
  sampleCounts: {video: 60, audio: 0, total: 60}, containerMetadataBytes: 2048};
async function run(size, mode = 'convert') {
  const messages = [], input = new Blob(['input']);
  let inspectedOutputs = 0, hashedOutputs = 0, cleaned = 0;
  const receive = createWorkerController({postMessage: m => messages.push(m),
    inspect: async value => { if (value !== input) inspectedOutputs++; return info; },
    tag: async () => ({size}),
    hash: async value => { if (value !== input) hashedOutputs++; return 'hash'; },
    loadTransform: async () => ({convertStereo: async () => ({file: new Blob(['mux']),
      metrics: {}, cleanup: async () => { cleaned++; }})})});
  await receive({data: {type:'run', operationId:'output-limit', inputRevision:1, file:input,
    settings:{mode, layout:'sbs', fov:180, eyeSize:256, bitrate:2000000, confirmed:true}}});
  return {message:messages.at(-1), inspectedOutputs, hashedOutputs, cleaned};
}
for (const size of [limit - 1, limit]) test(`final tagged conversion size ${size} is admitted`, async () => {
  const r = await run(size);
  assert.equal(r.message.type, 'result'); assert.equal(r.message.result.receipt.output.bytes, size);
  assert.equal(r.inspectedOutputs, 1); assert.equal(r.hashedOutputs, 1);
});
test('final metadata growth past 1GiB rejects before output inspection/hash and cleans temporary media', async () => {
  const r = await run(limit + 1);
  assert.equal(r.message.type, 'error'); assert.match(r.message.error, /CONVERSION_OUTPUT_LIMIT_EXCEEDED/);
  assert.equal(r.inspectedOutputs, 0); assert.equal(r.hashedOutputs, 0); assert.equal(r.cleaned, 1);
});
test('copy does not inherit the conversion-only final output limit', async () => {
  const r = await run(limit + 1, 'copy');
  assert.equal(r.message.type, 'result'); assert.equal(r.message.result.receipt.output.bytes, limit + 1);
});
