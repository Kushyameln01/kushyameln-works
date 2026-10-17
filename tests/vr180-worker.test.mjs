import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createWorkerController} from '../docs/shared/vr180/worker.mjs';
import {createFileOutput} from '../docs/shared/vr180/file-output.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return {promise, resolve}; };
const abortError = () => new DOMException('Conversion was canceled.', 'AbortError');
const input = new Blob(['synthetic input']);
const settings = {mode: 'convert', layout: 'sbs', fov: 180, eyeSize: 256, bitrate: 2000000, confirmed: true};
const info = {width: 512, height: 256, transcodeSafe: true, transcodeIssues: [],
  sampleCounts: {video: 60, audio: 95, total: 155}, containerMetadataBytes: 2048};
function harness(convertStereo) {
  const messages = [];
  const receive = createWorkerController({postMessage: message => messages.push(message), inspect: async () => info,
    tag: async blob => blob, hash: async () => 'test-hash', loadTransform: async () => ({convertStereo})});
  const send = (type, extra = {}) => receive({data: {type, operationId: 'this-job', inputRevision: 7, ...extra}});
  return {messages, send, run: () => send('run', {file: input, settings}),
    stop: (requestId, extra = {}) => send('cancel', {requestId, ...extra})};
}

test('direct Worker path finalizes the supplied transaction once and preserves observed-hash semantics', async () => {
  const messages = [], destination = {}, output = {status: {committed: false}}, direct = {output, source: {}, metrics: {capturedMoovBytes: 2048}};
  let finalizes = 0, cleaned = 0;
  const receiptInfo = {...info, projection: 'equi'}, savedFile = new Blob(['saved']);
  const receive = createWorkerController({postMessage: m => messages.push(m), inspect: async () => info,
    tag: async () => { throw Error('DUPLICATE_METADATA'); }, hash: async blob => { assert.equal(blob, input); return 'input-hash'; },
    loadTransform: async () => ({convertStereo: async (file, config, options) => {
      assert.equal(options.outputHandle, destination); return {direct, metrics: {}, cleanup: async () => { cleaned++; }};
    }}), finalizeDirect: async value => {
      assert.equal(value, direct); finalizes++; output.status.committed = true;
      return {saved: {file: savedFile, sha256: 'saved-hash'}, info: receiptInfo,
        timings: {close: {durationMs: 1, count: 1, requestedBytes: 5, status: 'completed'}},
        verification: {status: 'verified', wholeFileHashCompared: false, metadataHashMatched: true}};
    }});
  await receive({data: {type: 'run', operationId: 'direct-job', inputRevision: 3, file: input, settings, outputHandle: destination}});
  const r = messages[0].result;
  assert.equal(finalizes, 1); assert.equal(cleaned, 0); assert.equal(r.blob, savedFile);
  assert.equal(r.receipt.status, 'saved'); assert.equal(r.receipt.saveCompleted, true);
  assert.equal(r.receipt.saveWriteCommitted, true); assert.equal(r.receipt.directSave.wholeFileHashCompared, false);
  assert.equal(r.receipt.savedSha256, 'saved-hash');
  assert.equal(r.receipt.schemaVersion, 2); assert.equal(r.receipt.saveAttempts.length, 1);
  assert.equal(r.receipt.saveAttempts[0].resultOperationId, 'direct-job');
  assert.equal(r.receipt.saveAttempts[0].inputRevision, 3);
  assert.equal(r.receipt.saveAttempts[0].kind, 'direct');
  assert.equal(r.receipt.saveAttempts[0].hashBasis, 'post-commit-observed');
  assert.equal(r.receipt.output.hashBasis, 'post-commit-observed');
  assert.equal(r.receipt.saveAttempts[0].timings.filePhases.close.status, 'completed');
  assert.deepEqual(r.receipt.timings.filePhases, r.receipt.saveAttempts[0].timings.filePhases);
  await receive({data: {type: 'cancel', operationId: 'direct-job', inputRevision: 3, requestId: 'late'}});
  const late = messages.at(-1).diagnostics;
  assert.equal(late.saveCompleted, true); assert.equal(late.saveWriteCommitted, true);
  assert.equal(late.preparedBeforeCancel, r.receipt); assert.equal(cleaned, 1);
});

test('direct Worker failure after physical commit reports retained bytes and failed verification', async () => {
  const messages = [], output = {status: {committed: false}}; let cleaned = false;
  const receive = createWorkerController({postMessage: m => messages.push(m), inspect: async () => info,
    hash: async () => 'hash', loadTransform: async () => ({convertStereo: async () => ({
      direct: {output}, metrics: {}, cleanup: async () => { cleaned = true; },
    })}), finalizeDirect: async () => { output.status.committed = true; throw Error('DIRECT_METADATA_HASH_MISMATCH'); }});
  await receive({data: {type:'run', operationId:'direct-fail', inputRevision:4, file:input, settings, outputHandle:{}}});
  assert.equal(cleaned, true); assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'error'); assert.equal(messages[0].diagnostics.saveWriteCommitted, true);
  assert.equal(messages[0].diagnostics.saveCompleted, false); assert.equal(messages[0].diagnostics.output, null);
  assert.equal(messages[0].diagnostics.directSave.status, 'failed');
  assert.equal(messages[0].diagnostics.saveAttempts[0].commitState, 'committed');
  assert.equal(messages[0].diagnostics.saveAttempts[0].verificationState, 'failed');
  assert.equal(messages[0].diagnostics.saveAttempts[0].sha256, null);
});

test('metric event history is bounded while the latest diagnostic is retained', async () => {
  const h = harness(async (_file, _settings, options) => {
    const mutable = {step: 0};
    for (let step = 0; step < 100; step++) { mutable.step = step; options.onMetrics(mutable); }
    mutable.step = 999;
    return {file: input, metrics: {final: true}, cleanup: async () => {}};
  });
  await h.run();
  const receipt = h.messages.at(-1).result.receipt;
  assert.deepEqual(receipt.eventLog, {limit: 8, retained: 8, dropped: 92});
  assert.deepEqual(receipt.events.map(x => x.step), [92, 93, 94, 95, 96, 97, 98, 99]);
});

test('direct codec rejection before acquiring a writer is not an aborted save', async () => {
  const messages = [];
  const receive = createWorkerController({postMessage: m => messages.push(m), inspect: async () => info,
    hash: async () => 'input-hash', loadTransform: async () => ({convertStereo: async () => { throw Error('OUTPUT_ENCODE_UNSUPPORTED'); }})});
  await receive({data: {type: 'run', operationId: 'pre-writer-codec', inputRevision: 8, file: input, settings, outputHandle: {}}});
  const receipt = messages[0].diagnostics;
  assert.equal(receipt.saveAttempts[0].commitState, 'not-started');
  assert.equal(receipt.saveWriteCommitted, false); assert.equal(receipt.saveCompleted, false);
});

for (const stage of ['getFile', 'nonempty', 'createWritable', 'write', 'abort']) test(`direct Worker uses actual writer state after ${stage} rejection`, async () => {
  const messages = [], calls = {acquired: 0, writes: 0, aborts: 0};
  const handle = {
    async getFile() { if (stage === 'getFile') throw Error('GET_FILE_DENIED'); return new Blob(stage === 'nonempty' ? ['old'] : []); },
    async createWritable() {
      if (stage === 'createWritable') throw Error('CREATE_WRITABLE_DENIED');
      calls.acquired++;
      return {async write() { calls.writes++; throw Error('WRITE_FAILED'); },
        async abort() { calls.aborts++; if (stage === 'abort') throw Error('ABORT_FAILED'); }};
    },
  };
  const receive = createWorkerController({postMessage: m => messages.push(m), inspect: async () => info, hash: async () => 'input-hash',
    loadTransform: async () => ({convertStereo: async (file, config, options) => {
      let output;
      options.onCleanup(async () => { if (output) await output.abort(); });
      output = await createFileOutput(options.outputHandle, {signal: options.signal,
        onCreated: acquired => { output = acquired; options.onOutputCreated(acquired); }});
      await output.writeAt(0, Uint8Array.of(1));
    }})});
  await receive({data: {type: 'run', operationId: 'writer-state', inputRevision: 5, file: input, settings, outputHandle: handle}});
  const receipt = messages[0].diagnostics;
  const expected = stage === 'write' ? 'aborted' : stage === 'abort' ? 'unknown' : 'not-started';
  assert.equal(receipt.saveAttempts[0].commitState, expected);
  assert.equal(receipt.saveWriteCommitted, expected === 'unknown' ? null : false);
  assert.equal(receipt.saveCompleted, false);
  assert.equal(calls.acquired, ['write', 'abort'].includes(stage) ? 1 : 0);
  assert.equal(calls.aborts, calls.acquired);
  assert.equal(receipt.directSave.outputState.writerAcquired, !!calls.acquired);
});

test('direct verification completed before a queued cancel keeps its successful observation in diagnostics', async () => {
  const closePhase = {durationMs: 1, count: 1, requestedBytes: 5, status: 'completed'};
  const finalizerPhases = {tagPlan: {...closePhase, requestedBytes: 0}, metadataWrite: {...closePhase}};
  const messages = [], output = {status: {committed: false}, timings: {close: closePhase}}, saved = new Blob(['saved']);
  let stopping;
  const receive = createWorkerController({postMessage: m => messages.push(m), inspect: async () => info,
    hash: async () => 'input-hash', loadTransform: async () => ({convertStereo: async () => ({direct: {output}, cleanup: async () => {}})}),
    finalizeDirect: async () => {
      output.status.committed = true;
      stopping = receive({data: {type: 'cancel', operationId: 'cancel-after-verified', inputRevision: 8, requestId: 'stop-1'}});
      return {saved: {file: saved, sha256: 'saved-hash'}, info, timings: {...finalizerPhases, ...output.timings},
        verification: {status: 'verified', wholeFileHashCompared: false, metadataHashMatched: true}};
    }});
  await receive({data: {type: 'run', operationId: 'cancel-after-verified', inputRevision: 8,
    file: input, settings, outputHandle: {}, saveAttemptId: 'chosen-direct-attempt'}});
  await stopping;
  const diagnostics = messages.find(m => m.type === 'error').diagnostics;
  assert.equal(diagnostics.status, 'canceled'); assert.equal(diagnostics.output, null);
  assert.equal(diagnostics.saveCompleted, true); assert.equal(diagnostics.saveWriteCommitted, true);
  assert.equal(diagnostics.savedSha256, 'saved-hash'); assert.equal(diagnostics.directSave.status, 'verified');
  assert.equal(diagnostics.saveAttempts[0].id, 'chosen-direct-attempt');
  assert.equal(diagnostics.saveAttempts[0].verificationState, 'passed');
  for (const receipt of [diagnostics, diagnostics.preparedBeforeCancel]) {
    assert.deepEqual(receipt.timings.filePhases, {...finalizerPhases, ...output.timings});
    assert.deepEqual(receipt.saveAttempts[0].timings.filePhases, receipt.timings.filePhases);
  }
});

test('cooperative cancellation waits for conversion unwind and cleanup before matching acknowledgement', async () => {
  const entered = deferred(), unwound = deferred(), deletion = deferred(), order = [];
  const h = harness(async (file, config, {signal, onCleanup}) => {
    onCleanup(async () => { order.push('cleanup'); await deletion.promise; order.push('deleted'); });
    entered.resolve(); await unwound.promise;
    assert.equal(signal.aborted, true); order.push('writer-codec-released'); throw abortError();
  });
  const work = h.run(); await entered.promise;
  const stop = h.stop('cleanup-1'); await tick(); assert.deepEqual(h.messages, []);
  unwound.resolve(); await tick(); assert.deepEqual(order, ['writer-codec-released', 'cleanup']);
  assert.deepEqual(h.messages, []); deletion.resolve(); await work; await stop;
  assert.deepEqual(order, ['writer-codec-released', 'cleanup', 'deleted']);
  assert.deepEqual(h.messages.map(m => m.type), ['error', 'cleanup-complete']);
  const [failure, ack] = h.messages;
  assert.equal(failure.diagnostics.status, 'canceled'); assert.equal(failure.cleanupComplete, true);
  assert.equal(ack.requestId, 'cleanup-1'); assert.equal(ack.operationId, 'this-job'); assert.equal(ack.inputRevision, 7);
  assert.equal(ack.diagnostics, failure.diagnostics); assert.equal(ack.diagnostics.build, 'vr180-b7-phases1');
});

test('failed deletion remains retryable without replacing the original canceled receipt', async () => {
  const entered = deferred(), aborted = deferred(); let attempts = 0;
  const h = harness(async (file, config, {signal, onCleanup}) => {
    onCleanup(async () => { if (++attempts === 1) throw Error('OPFS_LOCKED'); });
    signal.addEventListener('abort', () => aborted.resolve(), {once: true}); entered.resolve();
    await aborted.promise; throw abortError();
  });
  const work = h.run(); await entered.promise; await h.stop('cleanup-1'); await work;
  assert.equal(attempts, 1); assert.deepEqual(h.messages.map(m => m.type), ['error', 'cleanup-error']);
  const original = h.messages[0].diagnostics, serialized = JSON.stringify(original);
  assert.equal(original.cleanup.status, 'failed'); assert.equal(original.cleanup.error, 'OPFS_LOCKED');
  await h.stop('cleanup-2'); assert.equal(attempts, 2);
  const ack = h.messages.at(-1); assert.equal(ack.type, 'cleanup-complete'); assert.equal(ack.requestId, 'cleanup-2');
  assert.equal(ack.diagnostics, original); assert.equal(JSON.stringify(original), serialized);
  assert.deepEqual(ack.cleanup, {status: 'complete', attempt: 2});
});

test('a codec failure reports its original error only after cleanup has finished', async () => {
  const started = deferred(), deletion = deferred();
  const h = harness(async (file, config, {onCleanup}) => {
    onCleanup(async () => { started.resolve(); await deletion.promise; }); throw Error('OUTPUT_ENCODE_UNSUPPORTED');
  });
  const work = h.run(); await started.promise; assert.deepEqual(h.messages, []);
  deletion.resolve(); await work;
  assert.equal(h.messages.length, 1); assert.equal(h.messages[0].error, 'OUTPUT_ENCODE_UNSUPPORTED');
  assert.equal(h.messages[0].diagnostics.status, 'failed'); assert.equal(h.messages[0].cleanupComplete, true);
});

test('prepared output remains retained until release; foreign job or revision cannot delete it', async () => {
  const deletion = deferred(); let attempts = 0;
  const h = harness(async () => ({file: input, metrics: {}, cleanup: async () => { attempts++; await deletion.promise; }}));
  await h.run(); const prepared = h.messages[0].result.receipt, serialized = JSON.stringify(prepared);
  assert.equal(prepared.status, 'prepared'); assert.equal(attempts, 0);
  h.stop('foreign-job', {operationId: 'another-job'}); h.stop('foreign-revision', {inputRevision: 8});
  await tick(); assert.equal(attempts, 0);
  const release = h.send('release', {requestId: 'release-1'}); await tick();
  assert.equal(attempts, 1); assert.equal(h.messages.length, 1);
  deletion.resolve(); await release;
  assert.equal(h.messages.at(-1).type, 'cleanup-complete'); assert.equal(h.messages.at(-1).requestId, 'release-1');
  assert.equal(JSON.stringify(prepared), serialized);
});

test('cancellation during uninterruptible finalization waits and never publishes the completed output', async () => {
  const entered = deferred(), finalized = deferred(), order = [];
  const h = harness(async (file, config, {onCleanup}) => {
    const cleanup = async () => { order.push('cleanup'); }; onCleanup(cleanup); entered.resolve();
    await finalized.promise; order.push('finalized'); return {file: input, metrics: {}, cleanup};
  });
  const work = h.run(); await entered.promise; const stop = h.stop('finalizing-cancel');
  await tick(); assert.deepEqual(order, []); assert.deepEqual(h.messages, []);
  finalized.resolve(); await work; await stop;
  assert.deepEqual(order, ['finalized', 'cleanup']); assert.equal(h.messages.some(m => m.type === 'result'), false);
  assert.equal(h.messages[0].diagnostics.status, 'canceled'); assert.equal(h.messages.at(-1).type, 'cleanup-complete');
});

test('a result/cancel message race retains prepared data and emits a separate raw cancellation receipt', async () => {
  const h = harness(async () => ({file: input, metrics: {}, cleanup: async () => {}}));
  await h.run(); const prepared = h.messages[0].result.receipt, serialized = JSON.stringify(prepared);
  await h.stop('late-cancel');
  const ack = h.messages.at(-1);
  assert.equal(ack.type, 'cleanup-complete'); assert.equal(ack.diagnostics.status, 'canceled');
  assert.equal(ack.diagnostics.output, null); assert.equal(ack.diagnostics.preparedBeforeCancel, prepared);
  assert.equal(JSON.stringify(prepared), serialized);
});

test('uncertain codec shutdown is exposed in both raw diagnostics and cleanup acknowledgement', async () => {
  const entered = deferred(), aborted = deferred();
  const h = harness(async (file, config, {signal, onCleanup}) => {
    onCleanup(async () => { throw Object.assign(Error('OUTPUT_CANCEL_FAILED'), {requiresWorkerTermination: true}); });
    signal.addEventListener('abort', () => aborted.resolve(), {once: true}); entered.resolve();
    await aborted.promise; throw abortError();
  });
  const work = h.run(); await entered.promise; await h.stop('cleanup-1'); await work;
  assert.equal(h.messages[0].diagnostics.cleanup.requiresWorkerTermination, true);
  assert.equal(h.messages[0].requiresWorkerTermination, true);
  assert.equal(h.messages.at(-1).requiresWorkerTermination, true);
  assert.equal(h.messages.at(-1).type, 'cleanup-error');
});

// Stub only the work behind validation. These tests establish admission order,
// not that the browser can convert 100000 samples or a 16 MiB moov.
async function runWithIndexInfo(indexInfo, mode = 'convert') {
  const messages = [], calls = {hash: 0, loadTransform: 0, convert: 0, tag: 0};
  const receive = createWorkerController({
    postMessage: message => messages.push(message),
    inspect: async () => ({...info, ...indexInfo}),
    hash: async () => { calls.hash++; return 'test-hash'; },
    tag: async file => { calls.tag++; return file; },
    loadTransform: async () => {
      calls.loadTransform++;
      return {convertStereo: async file => {
        calls.convert++; return {file, metrics: {}, cleanup: async () => {}};
      }};
    },
  });
  await receive({data: {type: 'run', operationId: 'index-job', inputRevision: 13,
    file: input, settings: {...settings, mode}}});
  return {messages, calls};
}
function assertIndexRejected({messages, calls}, expectedError) {
  assert.deepEqual(calls, {hash: 0, loadTransform: 0, convert: 0, tag: 0});
  assert.deepEqual(messages.map(message => message.type), ['error']);
  const failure = messages[0];
  assert.equal(failure.error, expectedError);
  assert.equal(failure.operationId, 'index-job');
  assert.equal(failure.inputRevision, 13);
  assert.equal(failure.diagnostics.build, 'vr180-b7-phases1');
  assert.equal(failure.diagnostics.status, 'failed');
  assert.equal(failure.diagnostics.input.sha256, null);
  assert.equal(failure.diagnostics.output, null);
  assert.equal(failure.cleanupComplete, true);
  assert.equal('inputHash' in failure.diagnostics.timings, false);
  assert.equal('transformLoad' in failure.diagnostics.timings, false);
}

test('conversion admits exactly 100000 combined samples and 16 MiB metadata before hashing', async () => {
  const {messages, calls} = await runWithIndexInfo({
    sampleCounts: {video: 40000, audio: 60000, total: 100000}, containerMetadataBytes: 16 * 1024 * 1024,
  });
  assert.deepEqual(calls, {hash: 2, loadTransform: 1, convert: 1, tag: 1});
  assert.deepEqual(messages.map(message => message.type), ['result']);
  assert.equal(messages[0].result.receipt.status, 'prepared');
});

test('conversion rejects one sample or metadata byte above its budget before hashing or loading the transform', async () => {
  assertIndexRejected(await runWithIndexInfo({sampleCounts: {video: 40000, audio: 60001, total: 100001}}),
    'CONVERSION_SAMPLE_LIMIT_EXCEEDED: 100001 > 100000');
  assertIndexRejected(await runWithIndexInfo({containerMetadataBytes: 16 * 1024 * 1024 + 1}),
    'CONVERSION_METADATA_LIMIT_EXCEEDED: 16777217 > 16777216');
});

test('conversion requires safe nonnegative integer counts and metadata bytes before downstream work', async t => {
  const invalidValues = [undefined, null, '1', -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1];
  for (const field of ['video', 'audio', 'total', 'containerMetadataBytes']) {
    for (const value of invalidValues) {
      await t.test(`${field}: ${String(value)}`, async () => {
        const indexInfo = field === 'containerMetadataBytes' ? {[field]: value}
          : {sampleCounts: {...info.sampleCounts, [field]: value}};
        assertIndexRejected(await runWithIndexInfo(indexInfo), 'CONVERSION_INDEX_INFO_INVALID');
      });
    }
  }
  for (const [name, sampleCounts] of [
    ['missing counts', undefined], ['null counts', null],
    ['inconsistent total', {video: 60, audio: 95, total: 154}],
    ['unsafe sum', {video: Number.MAX_SAFE_INTEGER, audio: 1, total: Number.MAX_SAFE_INTEGER}],
  ]) {
    await t.test(name, async () => {
      assertIndexRejected(await runWithIndexInfo({sampleCounts}), 'CONVERSION_INDEX_INFO_INVALID');
    });
  }
  // This admission guard accepts zero; the real parser is responsible for
  // rejecting missing video samples and structurally invalid containers.
  const {messages} = await runWithIndexInfo({sampleCounts: {video: 0, audio: 0, total: 0}, containerMetadataBytes: 0});
  assert.equal(messages[0].type, 'result');
});

test('copy does not apply conversion sample or metadata limits', async () => {
  for (const indexInfo of [
    {sampleCounts: {video: 40000, audio: 60001, total: 100001}, containerMetadataBytes: 16 * 1024 * 1024 + 1},
    {sampleCounts: undefined, containerMetadataBytes: undefined},
  ]) {
    const {messages, calls} = await runWithIndexInfo(indexInfo, 'copy');
    assert.deepEqual(calls, {hash: 2, loadTransform: 0, convert: 0, tag: 1});
    assert.deepEqual(messages.map(message => message.type), ['result']);
    assert.equal(messages[0].result.receipt.status, 'prepared');
  }
});

// Valid synthetic MP4 plus an inert top-level free box. This exercises actual
// inspection/tagging/hashing; extra bytes are not representative camera media.
class NoWholeReadBlob extends Blob {
  arrayBuffer() { throw Error('Whole input arrayBuffer is forbidden'); }
}
async function paddedFixture(paddingBytes) {
  const media = await readFile(new URL('../docs/vr180-studio/fixtures/stereo180-sbs.mp4', import.meta.url));
  const header = new Uint8Array(8);
  new DataView(header.buffer).setUint32(0, paddingBytes + header.byteLength);
  header.set(new TextEncoder().encode('free'), 4);
  const padding = new Uint8Array(paddingBytes);
  const sha256 = createHash('sha256').update(media).update(header).update(padding).digest('hex');
  return {file: new NoWholeReadBlob([media, header, padding], {type: 'video/mp4'}), sha256};
}
async function nodeBlobHash(blob) {
  const hash = createHash('sha256');
  for await (const chunk of blob.stream()) hash.update(chunk);
  return hash.digest('hex');
}
function copyRun(file, options = {}) {
  return {data: {type: 'run', operationId: 'hash-job', inputRevision: 11,
    file, settings: {...settings, mode: 'copy', ...options}}};
}
const hashCancel = requestId => ({data: {type: 'cancel', operationId: 'hash-job', inputRevision: 11, requestId}});

test('actual worker controller hashes all input/output bytes above the former 16 MiB cutoff', async () => {
  const {file, sha256} = await paddedFixture(16 * 1024 * 1024), messages = [];
  assert(file.size > 16 * 1024 * 1024);
  const receive = createWorkerController({postMessage: message => messages.push(message)});
  await receive(copyRun(file));
  assert.equal(messages.some(message => message.type === 'error'), false);
  const result = messages.find(message => message.type === 'result').result;
  const receipt = result.receipt;
  assert.equal(receipt.build, 'vr180-b7-phases1');
  assert.equal(receipt.input.sha256, sha256);
  assert.equal(receipt.output.sha256, await nodeBlobHash(result.blob));
  assert.match(receipt.output.sha256, /^[0-9a-f]{64}$/);
  assert.equal(receipt.status, 'prepared');
  assert.equal(receipt.saveWriteCommitted, false);
  assert.equal(receipt.saveCompleted, false);
  assert.equal(receipt.downloadRecovered, false);
  assert.doesNotMatch(receipt.hashNote, /16MiB|null/);
  for (const [phase, bytes] of [['inputHash', file.size], ['outputHash', result.blob.size]]) {
    const progress = messages.filter(m => m.type === 'progress' && m.progress.phase === phase).map(m => m.progress);
    assert(progress.length > 2);
    assert.deepEqual(progress[0], {phase, bytesHashed: 0, totalBytes: bytes, ratio: 0});
    assert.deepEqual(progress.at(-1), {phase, bytesHashed: bytes, totalBytes: bytes, ratio: 1});
    for (let i = 1; i < progress.length; i++) {
      assert(progress[i].bytesHashed > progress[i - 1].bytesHashed);
      assert.equal(progress[i].totalBytes, bytes);
      assert.equal(progress[i].ratio, progress[i].bytesHashed / bytes);
    }
  }
  assert(messages.every(m => m.operationId === 'hash-job' && m.inputRevision === 11));
  await receive({data: {type: 'release', operationId: 'hash-job', inputRevision: 11, requestId: 'release-hash'}});
  assert.equal(messages.at(-1).type, 'cleanup-complete');
});

test('cancel during actual input hashing leaves its unfinished hash null and acknowledges cleanup', async () => {
  const {file} = await paddedFixture(3 * 1024 * 1024), messages = [];
  let stop, tagCalls = 0;
  const receive = createWorkerController({
    tag: async () => { tagCalls++; throw Error('tagging must not start'); },
    postMessage: message => {
      messages.push(message);
      if (!stop && message.type === 'progress' && message.progress.phase === 'inputHash' && message.progress.bytesHashed > 0) {
        stop = new Promise(resolve => setTimeout(() => resolve(receive(hashCancel('input-hash-cancel'))), 0));
      }
    },
  });
  await receive(copyRun(file)); await stop;
  const failure = messages.find(m => m.type === 'error'), ack = messages.at(-1);
  assert.equal(tagCalls, 0);
  assert.equal(messages.some(m => m.type === 'result'), false);
  assert.equal(failure.diagnostics.status, 'canceled');
  assert.equal(failure.diagnostics.error.name, 'AbortError');
  assert.equal(failure.diagnostics.input.sha256, null);
  assert.equal(failure.diagnostics.output, null);
  assert.equal(failure.diagnostics.cleanup.status, 'complete');
  assert.equal(ack.type, 'cleanup-complete');
  assert.equal(ack.requestId, 'input-hash-cancel');
  assert.equal(ack.diagnostics, failure.diagnostics);
  const progress = messages.filter(m => m.type === 'progress').map(m => m.progress);
  assert(progress.every(p => p.phase === 'inputHash'));
  assert(progress.at(-1).bytesHashed > 0 && progress.at(-1).bytesHashed < file.size);
});

test('cancel during actual output hashing retains completed input hash and waits for cleanup', async () => {
  const {file, sha256} = await paddedFixture(3 * 1024 * 1024), messages = [];
  const cleanupStarted = deferred(), deleted = deferred();
  let stop, cleanupCalls = 0;
  const cleanup = async () => { cleanupCalls++; cleanupStarted.resolve(); await deleted.promise; };
  const receive = createWorkerController({
    // Only codec/resource work is substituted. Inspection, tagging and both
    // hashes are production code; this does not verify browser codecs or OPFS.
    loadTransform: async () => ({convertStereo: async (_file, _settings, {onCleanup}) => {
      onCleanup(cleanup); return {file, cleanup, metrics: {test: 'substituted-codec-work'}};
    }}),
    postMessage: message => {
      messages.push(message);
      if (!stop && message.type === 'progress' && message.progress.phase === 'outputHash' && message.progress.bytesHashed > 0) {
        stop = new Promise(resolve => setTimeout(() => resolve(receive(hashCancel('output-hash-cancel'))), 0));
      }
    },
  });
  const work = receive(copyRun(file, {mode: 'convert'}));
  await cleanupStarted.promise;
  assert.equal(messages.some(m => ['error', 'cleanup-complete', 'result'].includes(m.type)), false);
  deleted.resolve(); await work; await stop;
  const failure = messages.find(m => m.type === 'error'), ack = messages.at(-1);
  assert.equal(cleanupCalls, 1);
  assert.equal(failure.diagnostics.status, 'canceled');
  assert.equal(failure.diagnostics.input.sha256, sha256);
  assert.equal(failure.diagnostics.output, null);
  assert.equal(failure.diagnostics.cleanup.status, 'complete');
  assert.equal(ack.type, 'cleanup-complete');
  assert.equal(ack.requestId, 'output-hash-cancel');
  assert.equal(ack.diagnostics, failure.diagnostics);
  assert.equal(messages.some(m => m.type === 'result'), false);
  const progress = messages.filter(m => m.type === 'progress' && m.progress.phase === 'outputHash').map(m => m.progress);
  assert(progress.at(-1).bytesHashed > 0 && progress.at(-1).bytesHashed < progress.at(-1).totalBytes);
});

test('inspection/settings rejection occurs before hashing and leaves diagnostics hash null', async () => {
  const {file} = await paddedFixture(0);
  for (const message of [copyRun(new Blob(['not an MP4'])), copyRun(file, {confirmed: false})]) {
    const messages = [];
    const receive = createWorkerController({postMessage: value => messages.push(value), hash: async () => { throw Error('HASH_MUST_NOT_RUN'); }});
    await receive(message);
    assert.deepEqual(messages.map(m => m.type), ['error']);
    assert.equal(messages[0].diagnostics.status, 'failed');
    assert.equal(messages[0].diagnostics.input.sha256, null);
    assert.equal(messages[0].diagnostics.output, null);
    assert.doesNotMatch(messages[0].error, /HASH_MUST_NOT_RUN/);
    assert.equal('inputHash' in messages[0].diagnostics.timings, false);
  }
  const messages = [];
  const receive = createWorkerController({postMessage: value => messages.push(value), hash: async () => { throw Error('HASH_MUST_NOT_RUN'); }});
  await receive(copyRun(file, {mode: 'inspect'}));
  assert.deepEqual(messages.map(m => m.type), ['result']);
  assert.equal(messages[0].result.build, 'vr180-b7-phases1');
  assert.equal(messages[0].result.receipt, undefined);
});
