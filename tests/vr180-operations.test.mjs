import test from 'node:test';
import assert from 'node:assert/strict';
import {OperationScope} from '../docs/shared/vr180/operations.mjs';
const deferred = () => {let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve};};
test('cancellation during cleanup prevents subsequent Worker creation', async () => {
  const scope = new OperationScope(), op = scope.begin('prepare'), cleanup = deferred();
  let workers = 0;
  const task = (async () => {await cleanup.promise; scope.check(op); workers++;})();
  const rejection = assert.rejects(task, {name: 'AbortError'});
  scope.cancel(); cleanup.resolve(); await rejection; assert.equal(workers, 0);
});
test('fetch completion after cancellation cannot select its file', async () => {
  const scope = new OperationScope(), op = scope.begin('prepare'), response = deferred();
  let selected = false;
  const task = (async () => {await response.promise; scope.check(op); selected = true;})();
  const rejection = assert.rejects(task, {name: 'AbortError'});
  scope.cancel(); assert.equal(op.controller.signal.aborted, true);
  response.resolve(); await rejection; assert.equal(selected, false);
});
test('save picker blocks second operation; stale completion cannot clear new state', () => {
  const scope = new OperationScope(), save = scope.begin('save');
  assert.throws(() => scope.begin('save'), /OPERATION_IN_PROGRESS/);
  assert.throws(() => scope.begin('prepare'), /OPERATION_IN_PROGRESS/);
  scope.cancel(); assert.throws(() => scope.check(save), {name: 'AbortError'});
  scope.finish(save); const next = scope.begin('prepare');
  assert.equal(scope.finish(save), false); assert.equal(scope.current, next);
});
