/** Synchronous P4 input capture. Validation/copy only; no model arithmetic. */
const MODEL = 'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68';
const TOKENIZER = 'e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458';
const SCHEMA = 'bernini-p4-conditioning-snapshot/0.1';
const SHA256 = /^[0-9a-f]{64}$/;
const captures = new WeakMap();
const fail = message => { throw new TypeError(message); };
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedSlot = name => Object.getOwnPropertyDescriptor(typedArrayPrototype, name).get;
const bufferSlot = typedSlot('buffer'), lengthSlot = typedSlot('length');
const offsetSlot = typedSlot('byteOffset'), byteLengthSlot = typedSlot('byteLength');
const dataViewBufferSlot = Object.getOwnPropertyDescriptor(DataView.prototype, 'buffer').get;
function viewBuffer(value) {
  try { return bufferSlot.call(value); }
  catch { return dataViewBufferSlot.call(value); }
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} object required`);
}

// Do not silently drop symbolic fields, execute accessors, or retain shared metadata.
function safeMetadata(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer) fail('Shared conditioning metadata is unsupported');
  const proto = Object.getPrototypeOf(value), ownKeys = () => Reflect.ownKeys(value);
  if (ArrayBuffer.isView(value)) {
    if (typedKinds.has(proto)) {
      // Native indexed slots cannot be deleted; any additional key is custom metadata.
      if (ownKeys().length !== lengthSlot.call(value)) fail('Unsupported extra typed-array metadata property');
    } else if (proto !== DataView.prototype || ownKeys().length) fail('Unsupported typed-array metadata subclass or extra field');
    safeMetadata(viewBuffer(value), seen); return;
  }
  if (proto === ArrayBuffer.prototype || proto === Date.prototype) {
    if (ownKeys().length) fail('Unsupported extra built-in metadata property');
    return;
  }
  if (proto === RegExp.prototype) {
    if (ownKeys().some(key => key !== 'lastIndex')) fail('Unsupported extra RegExp metadata property');
    const state = Object.getOwnPropertyDescriptor(value, 'lastIndex').value;
    if (state !== null && ['object', 'function', 'symbol'].includes(typeof state)) fail('Unsupported object RegExp metadata state');
    return;
  }
  if (proto === Map.prototype || proto === Set.prototype) {
    if (ownKeys().length) fail('Unsupported extra Map/Set metadata property');
    if (proto === Map.prototype) for (const [key, item] of Map.prototype.entries.call(value)) { safeMetadata(key, seen); safeMetadata(item, seen); }
    else for (const item of Set.prototype.values.call(value)) safeMetadata(item, seen);
    return;
  }
  if (proto !== Object.prototype && proto !== null && proto !== Array.prototype) fail('Unsupported metadata object type');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') fail('Symbol conditioning metadata is unsupported');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor.get || descriptor.set) fail('Conditioning metadata accessors are unsupported');
    if (!descriptor.enumerable && !(proto === Array.prototype && key === 'length')) fail('Unsupported nonenumerable metadata property');
    safeMetadata(descriptor.value, seen);
  }
}

function repairRegExpState(source, target, seen = new WeakSet()) {
  if (!source || typeof source !== 'object' || seen.has(source)) return;
  seen.add(source);
  const proto = Object.getPrototypeOf(source);
  if (proto === RegExp.prototype) { target.lastIndex = source.lastIndex; return; }
  if (ArrayBuffer.isView(source) || proto === ArrayBuffer.prototype || proto === Date.prototype) return;
  if (proto === Map.prototype) {
    const copies = Map.prototype.entries.call(target);
    for (const [key, item] of Map.prototype.entries.call(source)) {
      const [copyKey, copyItem] = copies.next().value;
      repairRegExpState(key, copyKey, seen); repairRegExpState(item, copyItem, seen);
    }
    return;
  }
  if (proto === Set.prototype) {
    const copies = Set.prototype.values.call(target);
    for (const item of Set.prototype.values.call(source)) repairRegExpState(item, copies.next().value, seen);
    return;
  }
  for (const key of Object.keys(source)) repairRegExpState(source[key], target[key], seen);
}

function clone(value) {
  safeMetadata(value);
  try { const copied = structuredClone(value); repairRegExpState(value, copied); return copied; }
  catch { fail('Conditioning metadata must be structured-cloneable'); }
}

function compact(value, Type, length, label) {
  if (!value || Object.getPrototypeOf(value) !== Type.prototype) fail(`Expected native compact nonshared ${label}`);
  const buffer = bufferSlot.call(value);
  if (!(buffer instanceof ArrayBuffer) || offsetSlot.call(value) !== 0 ||
      byteLengthSlot.call(value) !== buffer.byteLength || lengthSlot.call(value) !== length) fail(`Expected compact nonshared ${label}`);
}

function payload(input) {
  record(input, 'Conditioning');
  safeMetadata(input);
  const shape = input.shape;
  if (!Array.isArray(shape) || shape.length !== 3 || shape[0] !== 1 || shape[2] !== 4096 ||
      !Number.isSafeInteger(shape[1]) || shape[1] < 1 || shape[1] > 512) fail('Expected conditioning BLC shape [1,L,4096], 1<=L<=512');
  const rows = shape[1], data = input.data, attentionMask = input.attentionMask;
  compact(data, Float32Array, rows * 4096, 'F32 conditioning data');
  compact(attentionMask, Uint8Array, rows, 'Uint8Array conditioning mask');
  const ownedData = new Float32Array(data), ownedMask = new Uint8Array(attentionMask);
  if (ownedData.some(value => !Number.isFinite(value))) fail('Conditioning values must be finite');
  if (ownedMask.some(value => value !== 0 && value !== 1) || !ownedMask.includes(1)) fail('Conditioning mask requires 0/1 values and an active position');
  return {data: ownedData, rows, attentionMask: ownedMask, shape: [1, rows, 4096]};
}

function metadataExcept(input, excluded) {
  return clone(Object.fromEntries(Object.keys(input).filter(key => !excluded.includes(key)).map(key => [key, input[key]])));
}

function bufferBytes(value, objects = new WeakSet(), buffers = new Set()) {
  if (!value || typeof value !== 'object' || objects.has(value)) return 0;
  objects.add(value);
  if (value instanceof ArrayBuffer) { if (buffers.has(value)) return 0; buffers.add(value); return value.byteLength; }
  if (ArrayBuffer.isView(value)) return bufferBytes(viewBuffer(value), objects, buffers);
  if (value instanceof Map) return [...value].reduce((sum, [key, item]) => sum + bufferBytes(key, objects, buffers) + bufferBytes(item, objects, buffers), 0);
  if (value instanceof Set) return [...value].reduce((sum, item) => sum + bufferBytes(item, objects, buffers), 0);
  return Object.values(value).reduce((sum, item) => sum + bufferBytes(item, objects, buffers), 0);
}

function same(a, b, seen = new WeakMap(), reverse = new WeakMap()) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (seen.has(a) || reverse.has(b)) return seen.get(a) === b && reverse.get(b) === a;
  seen.set(a, b); reverse.set(b, a);
  const proto = Object.getPrototypeOf(a);
  if (proto === ArrayBuffer.prototype) {
    if (arrayBufferLength.call(a) !== arrayBufferLength.call(b)) return false;
    const x = new Uint8Array(a), y = new Uint8Array(b);
    return x.every((value, index) => value === y[index]);
  }
  if (ArrayBuffer.isView(a)) {
    const offset = proto === DataView.prototype ? dataViewOffset : offsetSlot;
    const length = proto === DataView.prototype ? dataViewLength : byteLengthSlot;
    return offset.call(a) === offset.call(b) && length.call(a) === length.call(b) && same(viewBuffer(a), viewBuffer(b), seen, reverse);
  }
  if (proto === Date.prototype) return Object.is(Date.prototype.getTime.call(a), Date.prototype.getTime.call(b));
  if (proto === RegExp.prototype) return regexpSource.call(a) === regexpSource.call(b) && regexpFlags.call(a) === regexpFlags.call(b) && same(a.lastIndex, b.lastIndex, seen, reverse);
  if (proto === Map.prototype) return same([...Map.prototype.entries.call(a)], [...Map.prototype.entries.call(b)], seen, reverse);
  if (proto === Set.prototype) return same([...Set.prototype.values.call(a)], [...Set.prototype.values.call(b)], seen, reverse);
  const keys = Object.keys(a), other = Object.keys(b);
  return keys.length === other.length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key], seen, reverse));
}

function seal(value) {
  value.schemaVersion = SCHEMA;
  value.sealBytes = bufferBytes(value);
  captures.set(value, clone(value));
  return value;
}

export function captureP4Conditioning(tensor, {
  expectedModelSha256 = MODEL, expectedTokenizerSha256 = TOKENIZER, missingTokenizerPolicy = 'reject'
} = {}) {
  const owned = payload(tensor);
  if (tensor.dtype !== 'float32' || tensor.layout !== 'BLC' || tensor.meaning !== 'text_hidden_states') fail('Expected native Text float32 BLC text_hidden_states');
  if (!SHA256.test(expectedModelSha256) || !SHA256.test(expectedTokenizerSha256)) fail('Expected model/tokenizer SHA256 binding required');
  if (tensor.modelSha256 !== expectedModelSha256) fail('Text model identity does not match configured binding');
  if (!['reject', 'retain-unknown'].includes(missingTokenizerPolicy)) fail('Explicit missing tokenizer policy required');
  const missing = tensor.tokenizerSha256 === undefined || tensor.tokenizerSha256 === null;
  if (missing && missingTokenizerPolicy === 'reject') fail('Missing Text tokenizer provenance');
  if (!missing && tensor.tokenizerSha256 !== expectedTokenizerSha256) fail('Text tokenizer identity does not match configured binding');
  for (let row = 0; row < owned.rows; row++) {
    if (!owned.attentionMask[row] && owned.data.subarray(row * 4096, (row + 1) * 4096).some(value => value !== 0)) fail('Native Text masked hidden rows must be zero');
  }
  return seal({...owned, dtype: 'float32', layout: 'BLC', meaning: 'text_hidden_states',
    modelSha256: tensor.modelSha256,
    ...(Object.hasOwn(tensor, 'tokenizerSha256') ? {tokenizerSha256: tensor.tokenizerSha256} : {}),
    metadata: {
      inputClass: 'native-text-encoder',
      verification: {producerAuthenticated: false, realExecutionVerified: false, jointlyAccepted: false},
      producer: {owner: 'text_encoder', modelSha256: tensor.modelSha256, modelIdentity: 'matched',
        tokenizerSha256: missing ? null : tensor.tokenizerSha256, tokenizerIdentity: missing ? 'unknown' : 'matched',
        fullProvenance: !missing, missingTokenizerPolicy},
      nativeTensorMetadata: metadataExcept(tensor, ['data', 'shape', 'attentionMask'])
    }
  });
}

export function captureP4FixtureConditioning(input) {
  const owned = payload(input);
  if (typeof input.fixtureId !== 'string' || !input.fixtureId.trim()) fail('Explicit fixtureId required');
  if (!input.sourceRef || (typeof input.sourceRef !== 'string' && typeof input.sourceRef !== 'object') ||
      (typeof input.sourceRef === 'string' && !input.sourceRef.trim()) ||
      (typeof input.sourceRef === 'object' && (Array.isArray(input.sourceRef) || !Object.keys(input.sourceRef).length))) fail('Explicit fixture sourceRef required');
  if (Object.hasOwn(input, 'modelSha256') || Object.hasOwn(input, 'tokenizerSha256')) fail('Fixture cannot claim native Text model/tokenizer identity');
  return seal({...owned, dtype: 'float32', layout: 'BLC', meaning: 'p4-fixture-text-hidden-states:v1',
    fixtureId: input.fixtureId, sourceRef: clone(input.sourceRef), metadata: {
      inputClass: 'explicit-fixture',
      verification: {producerAuthenticated: false, realExecutionVerified: false, jointlyAccepted: false},
      producer: {owner: 'fixture', fixtureId: input.fixtureId, sourceRef: clone(input.sourceRef), fullProvenance: false},
      fixtureMetadata: metadataExcept(input, ['data', 'shape', 'attentionMask', 'fixtureId', 'sourceRef'])
    }
  });
}

/** Call before the runtime's first await. Private recognition is not producer authentication. */
export function snapshotP4CapturedConditioning(capture) {
  const protectedCopy = captures.get(capture);
  if (!protectedCopy) fail('Unrecognized P4 conditioning capture; use an explicit capture entrypoint');
  let unchanged = false;
  try { safeMetadata(capture); unchanged = same(capture, protectedCopy); } catch { /* fail closed */ }
  if (!unchanged) fail('P4 conditioning capture was changed after capture');
  return clone(protectedCopy);
}

/** An owned, still-recognized capture for an async feed transaction. */
export function cloneP4CapturedConditioning(capture) {
  return seal(snapshotP4CapturedConditioning(capture));
}

const METADATA_ENCODING = 'bernini-p4-conditioning-metadata/0.1';
const arrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const arrayBufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
const dataViewOffset = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteOffset').get;
const dataViewLength = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength').get;
const regexpSource = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source').get;
const regexpFlags = Object.getOwnPropertyDescriptor(RegExp.prototype, 'flags').get;
const typedKinds = new Map(['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array',
  'Uint16Array', 'Int32Array', 'Uint32Array', 'Float16Array', 'Float32Array',
  'Float64Array', 'BigInt64Array', 'BigUint64Array'].filter(name => typeof globalThis[name] === 'function')
  .map(name => [globalThis[name].prototype, name]));
const hexByte = Array.from({length: 256}, (_, value) => value.toString(16).padStart(2, '0'));

/**
 * Private binding encoding, not JCS or a common artifact format. The JSON here
 * contains only our own type tags/primitives, never a caller's toJSON methods.
 * Object keys sort by UTF-16 code units; Map/Set retain iteration order. Graph
 * references preserve cycles/aliases, including a view's complete backing buffer.
 * Unsupported objects fail explicitly before their information can be dropped.
 */
export function p4ConditioningMetadataBytes(metadata) {
  const ids = new WeakMap(); let nextId = 0;
  function properties(value, permittedNonenumerable = new Set()) {
    const entries = [];
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') fail('Unsupported symbol metadata key');
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (d.get || d.set) fail('Metadata accessors are unsupported');
      if (permittedNonenumerable.has(key)) continue;
      if (!d.enumerable) fail('Unsupported nonenumerable metadata property');
      entries.push([key, d.value]);
    }
    return entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  }
  function noExtra(value, permitted = new Set()) {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !permitted.has(key)) fail('Unsupported extra metadata property');
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (d.get || d.set) fail('Metadata accessors are unsupported');
    }
  }
  function number(value) {
    if (Object.is(value, -0)) return ['number', '-0'];
    if (Number.isNaN(value)) return ['number', 'NaN'];
    if (value === Infinity) return ['number', '+Infinity'];
    if (value === -Infinity) return ['number', '-Infinity'];
    return ['number', value];
  }
  function encode(value) {
    if (value === null) return ['null'];
    switch (typeof value) {
      case 'undefined': return ['undefined'];
      case 'boolean': return ['boolean', value];
      case 'string': return ['string', value];
      case 'number': return number(value);
      case 'bigint': return ['bigint', value.toString(10)];
      case 'object': break;
      default: fail('Unsupported metadata value');
    }
    if (ids.has(value)) return ['reference', ids.get(value)];
    const id = nextId++; ids.set(value, id);
    const proto = Object.getPrototypeOf(value);
    if (proto === ArrayBuffer.prototype) {
      noExtra(value);
      if (arrayBufferResizable?.call(value)) fail('Resizable metadata buffers are unsupported');
      let bytes;
      try { bytes = new Uint8Array(value, 0, arrayBufferLength.call(value)); }
      catch { fail('Detached metadata buffers are unsupported'); }
      const chunks = [];
      for (let start = 0; start < bytes.length; start += 4096) {
        let chunk = '';
        for (let i = start; i < Math.min(start + 4096, bytes.length); i++) chunk += hexByte[bytes[i]];
        chunks.push(chunk);
      }
      return ['ArrayBuffer', id, bytes.length, chunks.join('')];
    }
    if (typedKinds.has(proto)) {
      const length = lengthSlot.call(value);
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length) fail('Unsupported extra typed-array metadata property');
      }
      return ['TypedArray', id, typedKinds.get(proto), offsetSlot.call(value), length, encode(bufferSlot.call(value))];
    }
    if (proto === DataView.prototype) {
      noExtra(value);
      return ['DataView', id, dataViewOffset.call(value), dataViewLength.call(value), encode(dataViewBufferSlot.call(value))];
    }
    if (proto === Date.prototype) { noExtra(value); return ['Date', id, number(Date.prototype.getTime.call(value))]; }
    if (proto === RegExp.prototype) {
      noExtra(value, new Set(['lastIndex']));
      return ['RegExp', id, regexpSource.call(value), regexpFlags.call(value), encode(Object.getOwnPropertyDescriptor(value, 'lastIndex').value)];
    }
    if (proto === Map.prototype) {
      noExtra(value);
      return ['Map', id, Array.from(Map.prototype.entries.call(value), ([key, item]) => [encode(key), encode(item)])];
    }
    if (proto === Set.prototype) { noExtra(value); return ['Set', id, Array.from(Set.prototype.values.call(value), encode)]; }
    if (proto === Array.prototype) {
      return ['Array', id, value.length, properties(value, new Set(['length'])).map(([key, item]) => [key, encode(item)])];
    }
    if (proto === Object.prototype || proto === null) {
      return ['Object', id, proto === null ? 'null-prototype' : 'object-prototype', properties(value).map(([key, item]) => [key, encode(item)])];
    }
    fail('Unsupported metadata object type or shared buffer');
  }
  return new TextEncoder().encode(JSON.stringify([METADATA_ENCODING, encode(metadata)]));
}
