import test from 'node:test';
import assert from 'node:assert/strict';
import * as pipeline from '../../docs/shared/diffusion-models/diagnostics/resource-observer/pipeline.mjs';

test('executed inventory selects requested modules and new harness, rejecting an unanchored request', () => {
  assert.equal(typeof pipeline.selectExecutedSourceHashes, 'function', 'A separate executed-source inventory is required');
  const candidates = {'docs/runtime.mjs': 'a'.repeat(64), 'tools/old-harness.py': 'b'.repeat(64)};
  const harness = {'tools/resource-browser.py': 'c'.repeat(64)};
  assert.deepEqual(pipeline.selectExecutedSourceHashes(candidates, ['docs/runtime.mjs'], harness), {
    'tools/resource-browser.py': 'c'.repeat(64), 'docs/runtime.mjs': 'a'.repeat(64)
  });
  assert.throws(() => pipeline.selectExecutedSourceHashes(candidates, ['docs/unanchored.mjs'], harness), /Unanchored executed source/);
});

test('cleanup restores observer after a failed owner release and still releases the other owner', async () => {
  assert.equal(typeof pipeline.releaseObservation, 'function', 'Observer restoration must survive owner failure');
  const failure = Error('owner release failed'), calls = [];
  await assert.rejects(pipeline.releaseObservation({prefix: {async dispose() { calls.push('prefix'); throw failure; }},
    downstream: {async dispose() { calls.push('downstream'); }}, observer: {restore() { calls.push('restore'); }}}), error => error === failure);
  assert.deepEqual(calls, ['prefix', 'downstream', 'restore']);
});
