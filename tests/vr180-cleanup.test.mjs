import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupConversionResources} from '../docs/shared/vr180/transform.mjs';
import {Output, Mp4OutputFormat, StreamTarget, EncodedVideoPacketSource} from '../docs/shared/media-basic/vendor/mediabunny.mjs';

test('cleanup waits for codec close and writer abort, then permits retrying a failed own-job deletion', async () => {
  let finishCancel, finishAbort, failDelete = true;
  const cancellation = new Promise(resolve => { finishCancel = resolve; });
  const aborted = new Promise(resolve => { finishAbort = resolve; });
  const order = [];
  const cleanup = () => cleanupConversionResources({
    cancelOutput: async () => { await cancellation; order.push('codecs-closed'); },
    abortWriter: async () => { await aborted; order.push('writer-aborted'); },
    removeTemporary: async () => { order.push('own-job-delete'); if (failDelete) throw Error('LOCKED'); },
  });
  const first = cleanup(); const rejected = assert.rejects(first, /LOCKED/);
  finishCancel(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(order, ['codecs-closed']);
  finishAbort(); await rejected;
  assert.deepEqual(order, ['codecs-closed', 'writer-aborted', 'own-job-delete']);
  failDelete = false; await cleanup(); assert.equal(order.at(-1), 'own-job-delete');
});

test('pinned Output.cancel target-close rejection stays rejected; cleanup requests termination instead of concealing it', async () => {
  let closes = 0, aborts = 0, deletes = 0;
  const target = new StreamTarget(new WritableStream({close() { closes++; throw Error('TARGET_CLOSE_FAILED'); }}));
  const output = new Output({format: new Mp4OutputFormat({fastStart: false}), target});
  output.addVideoTrack(new EncodedVideoPacketSource('avc')); await output.start();
  const cleanup = () => cleanupConversionResources({
    cancelOutput: () => output.cancel(), abortWriter: async () => { aborts++; },
    removeTemporary: async () => { deletes++; },
  });
  for (let i = 0; i < 2; i++) {
    await assert.rejects(cleanup(), error => error.requiresWorkerTermination === true && /TARGET_CLOSE_FAILED/.test(error.message));
  }
  assert.equal(output.state, 'canceled'); assert.equal(closes, 1); assert.equal(aborts, 2); assert.equal(deletes, 0);
});
