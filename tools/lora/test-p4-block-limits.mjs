// Actual pinned Hike on explicitly synthetic tensors/base. No original models,
// P4 sessions or independent real-model expectations are loaded here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildPlanV2, validateRegistryV2} from '../../docs/shared/inference/lora/planner-v2.mjs';
import {engine, storage, consumer, CONTRACT, POLICY, HASH} from './v2-fixture.mjs';

const VERSION = 'lora-block-limits/0.1-draft.1';
const limits = (extra = {}) => ({contractVersion: VERSION, offsetUnit: 'elements',
  coordinateSpace: 'original-full-tensor', rowAlignment: 'all-columns',
  maxElements: 81920, maxRows: 4, ...extra});
const selection = {pairId: 'light', noise: 'high'};

function localSource(tensors) {
  let offset = 0;
  const header = {}, chunks = [];
  for (const [name, {shape, values}] of Object.entries(tensors)) {
    const raw = new Uint8Array(values.buffer, values.byteOffset, values.byteLength).slice();
    header[name] = {dtype: 'F32', shape, data_offsets: [offset, offset + raw.length]};
    offset += raw.length; chunks.push(raw);
  }
  const h = new TextEncoder().encode(JSON.stringify(header));
  const bytes = new Uint8Array(8 + h.length + offset);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(h.length), true);
  bytes.set(h, 8); offset = 8 + h.length;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let reads = 0, hashes = 0;
  return {size: bytes.length, get reads() { return reads; }, get hashes() { return hashes; },
    async read(at, count, {signal} = {}) { reads++; signal?.throwIfAborted(); return bytes.slice(at, at + count); },
    async hash() { hashes++; return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join(''); }};
}
function tensors(rows, columns, {kind = 'diff', rank = 1, stem = 'layer'} = {}) {
  if (kind === 'diff') return {[`${stem}.diff`]: {shape: [rows, columns],
    values: Float32Array.from({length: rows * columns}, (_, i) => (Math.floor(i / columns) + 1) / 8)}};
  const down = kind === 'a-b' ? 'lora_A' : 'lora_down', up = kind === 'a-b' ? 'lora_B' : 'lora_up';
  return {[`${stem}.${down}.weight`]: {shape: [rank, columns], values: new Float32Array(rank * columns).fill(1)},
    [`${stem}.${up}.weight`]: {shape: [rows, rank], values: Float32Array.from({length: rows * rank}, (_, i) => (Math.floor(i / rank) + 1) / (rank * 8))}};
}
function registry(rows, columns, blockLimits = limits()) {
  return {contractVersion: CONTRACT, modelHash: HASH, graphHash: HASH, registryVersion: 'synthetic-p4-block-limit',
    side: 'HIGH', executionProfileId: 'SYNTHETIC_NOT_P4_SESSION', loaderPolicyId: POLICY,
    targets: [{key: 'layer.weight', weightId: 'blocks.0.ffn.2.weight', module: 'diffusion_models',
      shape: [rows, columns], dtype: 'F32', layout: 'row-major', parameterRole: 'weight',
      binding: {kind: 'runtime-input', name: 'synthetic-weight'}, transform: {kind: 'identity'}, blockLimits}]};
}
const input = (r, startRow, rowCount) => ({selection, strength: 1, registry: r,
  loaderPolicyId: POLICY, diagnostic: {targets: [{key: 'layer.weight', slice: {startRow, rowCount}}]}});
function provider(log) {
  return {async readBlock(id, offset, count, context) {
    assert.equal(id, 'blocks.0.ffn.2.weight');
    log.push({offset, count, fullShape: [...context.fullShape]});
    return new Float32Array(count).fill(2);
  }};
}
function assertRows(blocks, columns, values) {
  const joined = blocks.flatMap(block => Array.from(block.data));
  assert.equal(joined.length, columns * values.length);
  for (let row = 0; row < values.length; row++)
    assert.ok(joined.slice(row * columns, (row + 1) * columns).every(v => v === values[row]), `Selected original row ${row}`);
}

test('P4 row cap splits five FFN-down diff rows even below the element cap and preserves original offsets', async () => {
  const e = await engine(localSource(tensors(8, 13824))), s = storage(), reads = [];
  try {
    const p = await e.api.plan(input(registry(8, 13824), 2, 5));
    const prepared = await e.api.prepare(p, {sink: s, baseProvider: provider(reads)});
    assert.deepEqual(reads, [{offset: 27648, count: 55296, fullShape: [8, 13824]},
      {offset: 82944, count: 13824, fullShape: [8, 13824]}]);
    assert.deepEqual(s.blocks.map(b => b.slice), [{startRow: 2, rowCount: 4}, {startRow: 6, rowCount: 1}]);
    assertRows(s.blocks, 13824, [2.375, 2.5, 2.625, 2.75, 2.875]);
    assert.equal(p.coverage, 'PARTIAL'); assert.equal(p.completeAdapter, false);
    assert.deepEqual(p.operations[0].fullShape, [8, 13824]);
    assert.deepEqual(p.includedPatches[0].slice, {startRow: 2, rowCount: 5});
    assert.deepEqual(p.excludedRegions.map(r => r.slice), [{startRow: 0, rowCount: 2}, {startRow: 7, rowCount: 1}]);
    await e.api.release(prepared);
  } finally { await e.close(); }
});

test('P4 element cap limits requested32-row diff blocks to16 complete5120-column rows', async () => {
  const e = await engine(localSource(tensors(20, 5120))), s = storage(), reads = [];
  try {
    const p = await e.api.plan(input(registry(20, 5120, limits({maxRows: 32})), 1, 17));
    const prepared = await e.api.prepare(p, {sink: s, baseProvider: provider(reads), blockRows: 32});
    assert.deepEqual(reads.map(({offset, count}) => [offset, count]), [[5120, 81920], [87040, 5120]]);
    assert.deepEqual(s.blocks.map(b => b.slice.rowCount), [16, 1]);
    await e.api.release(prepared);
  } finally { await e.close(); }
});

test('P4 low-rank preparation applies the row cap and reads selected original up rows', async () => {
  const e = await engine(localSource(tensors(8, 13824, {kind: 'down-up'}))), s = storage(), reads = [];
  try {
    const p = await e.api.plan(input(registry(8, 13824), 2, 5));
    const prepared = await e.api.prepare(p, {sink: s, baseProvider: provider(reads)});
    assert.deepEqual(reads.map(({offset, count}) => [offset, count]), [[27648, 55296], [82944, 13824]]);
    assertRows(s.blocks, 13824, [2.375, 2.5, 2.625, 2.75, 2.875]);
    await e.api.release(prepared);
  } finally { await e.close(); }
});

test('P4 A/B rank bound can reduce the native four-row cap without changing coverage', async () => {
  const e = await engine(localSource(tensors(5, 13824, {kind: 'a-b', rank: 128}))), s = storage(), reads = [];
  try {
    const p = await e.api.plan(input(registry(5, 13824), 0, 5));
    const prepared = await e.api.prepare(p, {sink: s, baseProvider: provider(reads)});
    assert.deepEqual(reads.map(({offset, count}) => [offset, count]), [[0, 27648], [27648, 27648], [55296, 13824]]);
    assert.deepEqual(s.blocks.map(b => b.slice.rowCount), [2, 2, 1]);
    assertRows(s.blocks, 13824, [2.125, 2.25, 2.375, 2.5, 2.625]);
    assert.deepEqual(p.operations[0].slice, {startRow: 0, rowCount: 5});
    await e.api.release(prepared);
  } finally { await e.close(); }
});

test('P4 invalid block contracts reject before any source read/hash or provider transaction', async () => {
  const source = localSource(tensors(5, 13824)), e = await engine(source);
  const bad = [null, undefined, limits({contractVersion: 'unknown'}), limits({offsetUnit: 'bytes'}),
    limits({coordinateSpace: 'selected-slice'}), limits({rowAlignment: 'partial-columns'}),
    limits({maxElements: 13823}), limits({maxElements: 0}), limits({maxElements: 81920.5}),
    limits({maxRows: 0}), limits({maxRows: 4.5}), limits({maxRows: Number.MAX_SAFE_INTEGER + 1}),
    limits({unknown: true})];
  try {
    for (const value of bad) {
      const r = registry(5, 13824); r.targets[0].blockLimits = value;
      await assert.rejects(e.api.plan(input(r, 0, 5)), /block|limit|field|coordinate|alignment/i);
    }
    const missing = limits(); delete missing.maxRows;
    await assert.rejects(e.api.plan(input(registry(5, 13824, missing), 0, 5)), /block|limit/i);
    assert.equal(source.reads, 0); assert.equal(source.hashes, 0);
  } finally { await e.close(); }
});

test('P4 full5120x13824 dimensions stay full in the metadata plan while blocks remain an execution cap', () => {
  const r = registry(5120, 13824);
  const p = buildPlanV2({inspection: {tensors: {'layer.diff': {dtype: 'BF16', shape: [5120, 13824]}}},
    registry: r, diagnostic: input(r, 7, 5).diagnostic, sourceSha256: HASH, strength: 1, loaderPolicyId: POLICY});
  assert.deepEqual(p.operations[0].fullShape, [5120, 13824]);
  assert.deepEqual(p.operations[0].slice, {startRow: 7, rowCount: 5});
  assert.equal(p.operations[0].target.blockLimits.maxRows, 4);
  assert.equal(p.completeAdapter, false);
});

test('P4 limits are captured before awaits, change registry identity and invalidate an older plan', async () => {
  const e = await engine(localSource(tensors(8, 13824))), r = registry(8, 13824);
  try {
    const pending = e.api.plan(input(r, 2, 5)); r.targets[0].blockLimits.maxRows = 1;
    const first = await pending;
    assert.equal(first.operations[0].target.blockLimits.maxRows, 4);
    assert.equal(Object.isFrozen(first.operations[0].target.blockLimits), true);
    const second = await e.api.plan(input(registry(8, 13824, limits({maxRows: 3})), 2, 5));
    assert.notEqual(first.registryHash, second.registryHash); assert.notEqual(first.planId, second.planId);
    const staleSink = storage();
    await assert.rejects(e.api.prepare(first, {sink: staleSink, baseProvider: provider([])}), /stale/i);
    assert.equal(staleSink.blocks.length, 0); assert.equal(staleSink.aborted, 0);
    const s = storage(), prepared = await e.api.prepare(second, {sink: s, baseProvider: provider([])});
    const changed = structuredClone(second.registry); changed.targets[0].blockLimits.maxRows = 2;
    const c = consumer(changed);
    await assert.rejects(e.api.stage(prepared, c), /registry|identity/i);
    assert.equal(c.candidate, null); assert.equal(c.commits, 0);
    await e.api.release(prepared);
  } finally { await e.close(); }
});

test('P4 cancellation after bounded base read cannot write and recovery uses a new plan', async () => {
  const e = await engine(localSource(tensors(8, 13824))), s = storage(), reads = [];
  let started, resume;
  const ready = new Promise(resolve => started = resolve), wait = new Promise(resolve => resume = resolve);
  try {
    const p = await e.api.plan(input(registry(8, 13824), 2, 5));
    const bounded = provider(reads);
    const pending = e.api.prepare(p, {sink: s, baseProvider: {async readBlock(...args) {
      const base = await bounded.readBlock(...args); started(); await wait; return base;
    }}});
    await ready; e.api.cancel(); resume();
    await assert.rejects(pending, /cancel|stale|abort/i);
    assert.deepEqual(reads.map(({offset, count}) => [offset, count]), [[27648, 55296]]);
    assert.equal(s.blocks.length, 0); assert.equal(s.aborted, 1);
    const next = await e.api.plan(input(registry(8, 13824), 2, 5)), recovered = storage();
    const prepared = await e.api.prepare(next, {sink: recovered, baseProvider: provider([])});
    assert.deepEqual(recovered.blocks.map(b => b.count), [55296, 13824]);
    await e.api.release(prepared);
  } finally { resume?.(); await e.close(); }
});

test('unextended Q16 registry identity and default prepared schema retain the published v2 behavior', async () => {
  const r = JSON.parse(await fs.readFile(new URL('../../development/ai-connection/evidence/lora-e1/HIGH-registry-correspondence.json', import.meta.url), 'utf8')).connectionRegistry;
  const stem = 'diffusion_model.blocks.0.self_attn.q';
  const values = tensors(5120, 5120, {kind: 'down-up', stem});
  values[`${stem}.diff_b`] = {shape: [5120], values: new Float32Array(5120).fill(0.5)};
  const e = await engine(localSource(values)), s = storage();
  try {
    const p = await e.api.plan({selection, strength: 1, registry: r, loaderPolicyId: POLICY,
      diagnostic: {targets: [{key: `${stem}.weight`, slice: {startRow: 0, rowCount: 16}},
        {key: `${stem}.bias`, slice: {startRow: 0, rowCount: 16}}]}});
    assert.equal(p.registryHash, 'cc6a329b0cffbdf3c2a50914843da33e7d402a815921e206ddf5f8b0fea4c806');
    assert.equal(p.registry.targets.some(t => Object.hasOwn(t, 'blockLimits')), false);
    const prepared = await e.api.prepare(p, {sink: s, baseProvider: {readBlock: async (_, __, n) => new Float32Array(n).fill(2)}});
    assert.deepEqual(s.blocks.map(b => b.count), [81920, 16]);
    assert.equal(Object.hasOwn(prepared.manifest, 'blockLimits'), false);
    assert.equal(Object.hasOwn(prepared.manifest, 'blockContractVersion'), false);
    assert.deepEqual(validateRegistryV2(r), r);
    await e.api.release(prepared);
  } finally { await e.close(); }
});
