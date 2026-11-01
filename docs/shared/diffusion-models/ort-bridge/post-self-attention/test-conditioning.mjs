import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('./conditioning.mjs').catch(() => ({}));
const MODEL = 'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68';
const TOKENIZER = 'e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458';
const OTHER = 'f'.repeat(64);
function native() {
  const data = new Float32Array(3 * 4096);
  data[0] = 0.125; data[4095] = -0; data[8192] = -0.5;
  return {
    dtype: 'float32', shape: [1, 3, 4096], layout: 'BLC', meaning: 'text_hidden_states',
    data, attentionMask: new Uint8Array([1, 0, 1]), modelSha256: MODEL, tokenizerSha256: TOKENIZER,
    producer: {sourceRef: {commit: 'd2e9e3cba6269464bf556acc73c0b97030f75b5f'}, tokenizer: null},
    evidence: {inputMode: 'token-ids', tokenizer: null}, extension: {names: ['original'], absent: undefined}
  };
}
function fixture() {
  const data = new Float32Array(4 * 4096);
  data[0] = 0.25; data[3 * 4096] = -0.125;
  return {data, shape: [1, 4, 4096], attentionMask: new Uint8Array([1, 1, 0, 1]),
    fixtureId: 'p4-conditioning-contract-test-only-v1',
    sourceRef: {path: 'docs/shared/diffusion-models/ort-bridge/post-self-attention/test-conditioning.mjs'},
    callerEvidence: {production: false}};
}
function required(name) {
  assert.equal(typeof mod[name], 'function', `${name} must exist for the P4 input boundary`);
  return mod[name];
}

// A row-compacting implementation would change L and lose the middle mask position.
test('native capture preserves all BLC rows and owns payload, mask and caller metadata', () => {
  const capture = required('captureP4Conditioning'), input = native(), output = capture(input);
  assert.equal(output.rows, 3);
  assert.deepEqual(output.shape, [1, 3, 4096]);
  assert.deepEqual([...output.attentionMask], [1, 0, 1]);
  assert.equal(output.data[0], 0.125);
  assert.equal(output.data[8192], -0.5);
  assert.ok(Object.is(output.data[4095], -0));
  assert.equal(output.data.length, 12288);
  assert.equal(output.metadata.inputClass, 'native-text-encoder');
  assert.equal(output.metadata.producer.fullProvenance, true);
  assert.deepEqual(output.metadata.verification, {producerAuthenticated: false, realExecutionVerified: false, jointlyAccepted: false});
  assert.equal(output.metadata.nativeTensorMetadata.evidence.tokenizer, null);
  assert.ok(Object.hasOwn(output.metadata.nativeTensorMetadata.extension, 'absent'));
  input.data[0] = 9; input.attentionMask[0] = 0; input.shape[1] = 1;
  input.producer.sourceRef.commit = 'changed'; input.extension.names[0] = 'changed';
  assert.equal(output.data[0], 0.125);
  assert.deepEqual([...output.attentionMask], [1, 0, 1]);
  assert.deepEqual(output.shape, [1, 3, 4096]);
  assert.equal(output.metadata.nativeTensorMetadata.producer.sourceRef.commit, 'd2e9e3cba6269464bf556acc73c0b97030f75b5f');
  assert.deepEqual(output.metadata.nativeTensorMetadata.extension.names, ['original']);
});

// Dropping an identity check would allow another producer to masquerade as the configured one.
test('native capture rejects incompatible tensor semantics, dimensions, mask and identities', () => {
  const capture = required('captureP4Conditioning');
  const changes = [
    x => x.dtype = 'float16', x => x.layout = 'LC', x => x.meaning = 'raw-posterior-mean',
    x => x.shape = [1, 4096, 3], x => x.shape = [1, 0, 4096], x => x.shape = [1, 513, 4096],
    x => x.data = new Float64Array(12288), x => x.data[0] = Infinity,
    x => x.attentionMask = [1, 0, 1], x => x.attentionMask = new Uint8Array([1, 1]),
    x => x.attentionMask = new Uint8Array([0, 0, 0]), x => x.attentionMask[1] = 2,
    x => x.modelSha256 = OTHER, x => delete x.modelSha256, x => x.tokenizerSha256 = OTHER,
    x => x.data[4096] = 0.5
  ];
  for (const change of changes) { const x = native(); change(x); assert.throws(() => capture(x)); }
  assert.throws(() => capture(native(), {expectedModelSha256: 'invalid'}));
  assert.throws(() => capture(native(), {expectedTokenizerSha256: null}));
});

// Inferring a tokenizer from configured expectations would invent provenance for legacy ID inputs.
test('missing tokenizer requires an explicit unknown-provenance policy and stays absent or null', () => {
  const capture = required('captureP4Conditioning');
  for (const missing of ['absent', 'null']) {
    const input = native();
    if (missing === 'absent') delete input.tokenizerSha256; else input.tokenizerSha256 = null;
    assert.throws(() => capture(input), /tokenizer/i);
    const output = capture(input, {expectedTokenizerSha256: TOKENIZER, missingTokenizerPolicy: 'retain-unknown'});
    assert.equal(output.metadata.producer.tokenizerSha256, null);
    assert.equal(output.metadata.producer.tokenizerIdentity, 'unknown');
    assert.equal(output.metadata.producer.fullProvenance, false);
    assert.equal(Object.hasOwn(output.metadata.nativeTensorMetadata, 'tokenizerSha256'), missing === 'null');
    if (missing === 'null') assert.equal(output.metadata.nativeTensorMetadata.tokenizerSha256, null);
    assert.equal(output.metadata.nativeTensorMetadata.evidence.tokenizer, null);
  }
  assert.throws(() => capture({...native(), tokenizerSha256: OTHER}, {missingTokenizerPolicy: 'retain-unknown'}), /tokenizer/i);
});

// Shared, offset and detached input storage would violate the explicit ownership boundary.
test('capture rejects shared, offset and detached payload and mask storage', () => {
  const capture = required('captureP4Conditioning');
  const invalid = [
    x => x.data = new Float32Array(new SharedArrayBuffer(12288 * 4)),
    x => x.data = new Float32Array(new ArrayBuffer((12288 + 1) * 4), 4),
    x => x.attentionMask = new Uint8Array(new SharedArrayBuffer(3)),
    x => x.attentionMask = new Uint8Array(new ArrayBuffer(4), 1),
    x => structuredClone(x.data.buffer, {transfer: [x.data.buffer]}),
    x => structuredClone(x.attentionMask.buffer, {transfer: [x.attentionMask.buffer]})
  ];
  for (const change of invalid) { const x = native(); change(x); assert.throws(() => capture(x)); }
});

// Virtual typed-array properties must not bypass admission or run user code before rejection.
test('capture rejects typed-array subclasses without consulting virtual buffer or finite methods', () => {
  const capture = required('captureP4Conditioning');
  let getters = 0;
  class FakeFloat32 extends Float32Array {
    get buffer() { getters++; return new ArrayBuffer(12288 * 4); }
    some() { return false; }
  }
  class FakeMask extends Uint8Array {
    get buffer() { getters++; return new ArrayBuffer(3); }
    some() { return false; }
    includes() { return true; }
  }
  const x = native(); x.data = new FakeFloat32(12288); x.data[0] = NaN;
  assert.throws(() => capture(x));
  const y = native(); y.attentionMask = new FakeMask([1, 2, 1]);
  assert.throws(() => capture(y));
  assert.equal(getters, 0);
});

// Reusing a caller's fixture buffer or assigning UMT5 identity would mislabel diagnostic evidence.
test('fixture capture keeps a separate producer and snapshots all rows without a model identity', () => {
  const capture = required('captureP4FixtureConditioning'), input = fixture(), output = capture(input);
  assert.equal(output.rows, 4);
  assert.deepEqual(output.shape, [1, 4, 4096]);
  assert.deepEqual([...output.attentionMask], [1, 1, 0, 1]);
  assert.equal(output.data[12288], -0.125);
  assert.equal(output.meaning, 'p4-fixture-text-hidden-states:v1');
  assert.equal(output.metadata.inputClass, 'explicit-fixture');
  assert.equal(output.metadata.producer.owner, 'fixture');
  assert.equal(output.metadata.producer.fullProvenance, false);
  assert.ok(!Object.hasOwn(output, 'modelSha256'));
  assert.ok(!Object.hasOwn(output.metadata.producer, 'modelSha256'));
  input.data[0] = 10; input.sourceRef.path = 'changed'; input.callerEvidence.production = true;
  assert.equal(output.data[0], 0.25);
  assert.equal(output.sourceRef.path, 'docs/shared/diffusion-models/ort-bridge/post-self-attention/test-conditioning.mjs');
  assert.equal(output.metadata.fixtureMetadata.callerEvidence.production, false);
});

test('fixture capture rejects missing source identity and native producer claims', () => {
  const capture = required('captureP4FixtureConditioning');
  for (const change of [x => delete x.fixtureId, x => x.fixtureId = '', x => delete x.sourceRef,
    x => x.sourceRef = null, x => x.sourceRef = '', x => x.sourceRef = {}, x => x.modelSha256 = MODEL,
    x => x.tokenizerSha256 = TOKENIZER]) {
    const x = fixture(); change(x); assert.throws(() => capture(x));
  }
});

// A schema-string-only check would accept forged captures or silently execute modified bytes.
test('runtime snapshot rejects forged captures and changes to captured data, mask or metadata', () => {
  const capture = required('captureP4Conditioning'), snapshot = required('snapshotP4CapturedConditioning');
  assert.throws(() => snapshot({...native(), schemaVersion: 'bernini-p4-conditioning-snapshot/0.1'}));
  for (const change of [x => x.data[0] = 0.5, x => x.attentionMask[1] = 1,
    x => x.shape[1] = 1, x => x.metadata.nativeTensorMetadata.evidence.tokenizer = {},
    x => x.metadata.inputClass = 'explicit-fixture', x => x.rows = 2]) {
    const input = capture(native()); change(input); assert.throws(() => snapshot(input), /captur|chang|mutat/i);
  }
});

test('runtime snapshot returns independent arrays from a recognized unchanged capture', () => {
  const capture = required('captureP4FixtureConditioning'), snapshot = required('snapshotP4CapturedConditioning');
  const input = capture(fixture()), output = snapshot(input);
  assert.equal(output.data[0], 0.25);
  assert.deepEqual([...output.attentionMask], [1, 1, 0, 1]);
  assert.notEqual(output.data.buffer, input.data.buffer);
  assert.notEqual(output.attentionMask.buffer, input.attentionMask.buffer);
  output.data[0] = 100; output.metadata.fixtureMetadata.callerEvidence.production = true;
  const again = snapshot(input);
  assert.equal(again.data[0], 0.25);
  assert.equal(again.metadata.fixtureMetadata.callerEvidence.production, false);
  assert.ok(input.sealBytes >= 65540);
});

// structuredClone alone loses the private input brand used by a later runtime invocation.
test('owned capture clone keeps the runtime brand and isolates later caller changes', () => {
  const capture = required('captureP4FixtureConditioning'), copy = required('cloneP4CapturedConditioning');
  const snapshot = required('snapshotP4CapturedConditioning'), original = capture(fixture());
  const owned = copy(original);
  assert.notEqual(owned.data.buffer, original.data.buffer);
  assert.notEqual(owned.attentionMask.buffer, original.attentionMask.buffer);
  assert.equal(snapshot(owned).data[0], 0.25);
  original.data[0] = 100;
  original.metadata.fixtureMetadata.callerEvidence.production = true;
  assert.equal(snapshot(owned).data[0], 0.25);
  assert.equal(snapshot(owned).metadata.fixtureMetadata.callerEvidence.production, false);
  assert.throws(() => copy(original), /captur|chang|mutat/i);
});

// JSON erases these binary and typed distinctions, which must change the binding bytes.
test('metadata binding encodes binary, mask and producer distinctions without JSON loss', () => {
  const encode = required('p4ConditioningMetadataBytes');
  for (const [a, b] of [
    [{blob: Uint8Array.of(1, 2).buffer}, {blob: Uint8Array.of(1, 3).buffer}],
    [{blob: Uint8Array.of(1)}, {blob: Int8Array.of(1)}],
    [{blob: Uint8Array.of(1)}, {blob: Uint8Array.of(1).buffer}],
    [{mask: Uint8Array.of(1, 0)}, {mask: Uint8Array.of(1, 1)}],
    [{producer: {owner: 'fixture'}}, {producer: {owner: 'text_encoder'}}],
    [{a: undefined}, {a: null}], [{a: -0}, {a: 0}], [{a: 1n}, {a: 1}],
    [{date: new Date(0)}, {date: new Date(1)}],
    [{map: new Map([['a', 1]])}, {map: new Map([['a', 2]])}],
    [{set: new Set(['a'])}, {set: new Set(['b'])}]
  ]) assert.notDeepEqual(encode(a), encode(b));
  const bytes = encode({producer: 'fixture'});
  assert.ok(bytes instanceof Uint8Array);
  assert.match(new TextDecoder().decode(bytes), /bernini-p4-conditioning-metadata\/0\.1/);
  const input = {binary: Uint8Array.of(1, 2)}, out = encode(input);
  out.fill(0);
  assert.deepEqual([...input.binary], [1, 2]);
  assert.notDeepEqual(encode(input), out);
});

// Traversal must assign references canonically so key insertion does not destabilize graph hashes.
test('metadata binding sorts object keys and preserves deterministic cycles and alias topology', () => {
  const encode = required('p4ConditioningMetadataBytes');
  assert.deepEqual(encode({b: 2, a: 1}), encode({a: 1, b: 2}));
  const a = {z: 1}; a.self = a;
  const b = {}; b.self = b; b.z = 1;
  assert.deepEqual(encode(a), encode(b));
  assert.deepEqual(encode(a), encode(a));
  const shared = {x: 1};
  assert.notDeepEqual(encode({a: shared, b: shared}), encode({a: {x: 1}, b: {x: 1}}));
  const buffer = Uint8Array.of(1, 2, 3).buffer;
  assert.notDeepEqual(encode({buffer, view: new Uint8Array(buffer, 1, 1)}),
    encode({buffer: buffer.slice(0), view: new Uint8Array(buffer.slice(0), 1, 1)}));
  const changed = buffer.slice(0); new Uint8Array(changed)[2] = 4;
  assert.notDeepEqual(encode(new Uint8Array(buffer, 0, 1)), encode(new Uint8Array(changed, 0, 1)));
  assert.notDeepEqual(encode(new Map([['a', 1], ['b', 2]])), encode(new Map([['b', 2], ['a', 1]])));
});

// Unsupported values must stop the binding step instead of silently losing their distinguishing fields.
test('metadata binding explicitly rejects unsupported values and accessors', () => {
  const encode = required('p4ConditioningMetadataBytes');
  class Custom { constructor() { this.x = 1; } }
  class CustomBytes extends Uint8Array {}
  const accessor = {}; let reads = 0;
  Object.defineProperty(accessor, 'value', {enumerable: true, get() { reads++; return 1; }});
  for (const value of [new Blob(['x']), new WeakMap(), new Custom(), new CustomBytes([1]),
    new SharedArrayBuffer(1), {f() {}}, {s: Symbol('x')}, accessor]) assert.throws(() => encode(value), /metadata|unsupported|shared|accessor/i);
  assert.equal(reads, 0);
});

// A view-only comparison or one-way graph map would miss changes represented by the binding bytes.
test('capture seals reject backing-byte, RegExp state and metadata alias changes', () => {
  const capture = required('captureP4FixtureConditioning'), snapshot = required('snapshotP4CapturedConditioning');
  const input = fixture(), shared = {x: 1}, buffer = Uint8Array.of(1, 2, 3).buffer;
  input.binary = new Uint8Array(buffer, 1, 1); input.regex = /source/gi; input.aliases = {a: shared, b: shared};
  for (const mutate of [
    x => new Uint8Array(x.metadata.fixtureMetadata.binary.buffer)[2] = 9,
    x => x.metadata.fixtureMetadata.regex.lastIndex = 2,
    x => x.metadata.fixtureMetadata.aliases.b = {x: 1}
  ]) {
    const output = capture(input); mutate(output);
    assert.throws(() => snapshot(output), /captur|chang|mutat/i);
  }
});

test('capture preserves RegExp lastIndex through cyclic object, Map and Set metadata copies', () => {
  const capture = required('captureP4Conditioning'), copy = required('cloneP4CapturedConditioning');
  const input = native(), regex = /source/gi; regex.lastIndex = 3;
  const graph = {regex}; graph.self = graph; graph.map = new Map([[regex, graph]]); graph.set = new Set([regex, graph]);
  input.graph = graph;
  const output = copy(capture(input)), retained = output.metadata.nativeTensorMetadata.graph;
  assert.equal(retained.regex.lastIndex, 3);
  assert.equal(retained.self, retained);
  assert.equal(retained.map.get(retained.regex), retained);
  assert.ok(retained.set.has(retained.regex));
  assert.ok(retained.set.has(retained));
  regex.lastIndex = 7;
  assert.equal(retained.regex.lastIndex, 3);
});

test('capture rejects custom built-in metadata fields before structured cloning can drop them', () => {
  const capture = required('captureP4Conditioning');
  for (const value of [new Map(), new Set(), Uint8Array.of(1), new DataView(new ArrayBuffer(1)),
    new ArrayBuffer(1), new Date(0), /source/g]) {
    value.customEvidence = {source: 'must-not-disappear'};
    const input = native(); input.extra = value;
    assert.throws(() => capture(input), /metadata|unsupported|extra/i);
  }
  const input = native(); input.extra = /source/g; input.extra.lastIndex = {state: 3};
  assert.throws(() => capture(input), /metadata|unsupported|state/i);
});
