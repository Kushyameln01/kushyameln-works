// Text-preserving Unity serialization helpers. No general YAML round trip,
// numeric fileID conversion, disk access, or Unity/ExpressionParameters mutation.
const ID = /^-?(?:0|[1-9][0-9]*)$/;
const GUID = /^[a-fA-F0-9]{32}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function textInput(text) {
  if (typeof text !== 'string' || CONTROL.test(text)) throw new TypeError('Expected Unity text without invalid control characters');
  return text;
}
function fileId(id, nonzero = false) {
  if (typeof id !== 'string' || !ID.test(id) || id === '-0') throw new TypeError('fileID must be a canonical decimal string');
  const n = BigInt(id);
  if (n < -(1n << 63n) || n > (1n << 63n) - 1n || (nonzero && n === 0n)) throw new RangeError('fileID out of signed 64-bit range or unexpectedly null');
  return id;
}
function guid(value) {
  if (typeof value !== 'string' || !GUID.test(value)) throw new TypeError('GUID must contain exactly 32 hexadecimal characters');
  return value;
}
function editsApplied(text, edits) {
  let last = text.length;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (edit.end > last || edit.start < 0 || edit.end < edit.start) throw new Error('Overlapping or invalid text edit');
    text = text.slice(0, edit.start) + edit.value + text.slice(edit.end);
    last = edit.start;
  }
  return text;
}

export function splitUnityDocuments(text) {
  textInput(text);
  const headers = [...text.matchAll(/^---[^\r\n]*(?:\r?\n|$)/gm)];
  if (!headers.length) throw new Error('Missing Unity document header');
  const preamble = text.slice(0, headers[0].index);
  if (!/^(?:\uFEFF)?(?:(?:%YAML 1\.1|%TAG !u! tag:unity3d\.com,2011:|#[^\r\n]*)?\r?\n)*$/.test(preamble)) throw new Error('Unexpected Unity preamble');
  const seen = new Set();
  const documents = headers.map((match, index) => {
    const header = match[0];
    const parsed = /^--- !u!([0-9]+) &(-?[0-9]+)(?: stripped)?\r?\n$/.exec(header);
    if (!parsed) throw new Error('Malformed Unity document header');
    const classId = parsed[1];
    const id = fileId(parsed[2], true);
    if (seen.has(id)) throw new Error(`Duplicate document fileID: ${id}`);
    seen.add(id);
    const start = match.index;
    const end = headers[index + 1]?.index ?? text.length;
    const body = text.slice(start + header.length, end);
    if (!/^[A-Za-z_][A-Za-z_0-9]*:\s*\r?\n/.test(body)) throw new Error(`Missing document root for ${id}`);
    if (body.split(/\r?\n/).slice(1).some(line => line && !/^\s|^#/.test(line))) throw new Error(`Unexpected top-level text in document ${id}`);
    return Object.freeze({ classId, fileId: id, header, body, text: text.slice(start, end), start, end });
  });
  return Object.freeze({ preamble, documents: Object.freeze(documents) });
}

export function joinUnityDocuments(preamble, documents) {
  if (typeof preamble !== 'string' || !Array.isArray(documents)) throw new TypeError('Expected preamble and document array');
  const text = preamble + documents.map(d => typeof d === 'string' ? d : d?.text).map(textInput).join('');
  splitUnityDocuments(text); // reject duplicate IDs or malformed joins
  return text;
}

export function replaceDocumentFileId(documentText, newFileId) {
  fileId(newFileId, true);
  const parsed = splitUnityDocuments(documentText);
  if (parsed.documents.length !== 1) throw new Error('Expected exactly one document');
  const doc = parsed.documents[0];
  const start = doc.start + doc.header.indexOf('&') + 1;
  return editsApplied(documentText, [{ start, end: start + doc.fileId.length, value: newFileId }]);
}

function referenceObject(text, start, end) {
  const body = text.slice(start + 1, end - 1);
  if (!/(?:^|,)\s*(?:fileID|guid)\s*:/.test(body)) return null;
  const values = {}, ranges = {};
  let offset = start + 1;
  for (const piece of body.split(',')) {
    const field = /^(\s*)([A-Za-z_][A-Za-z_0-9]*)(\s*:\s*)(\S(?:.*?\S)?)(\s*)$/.exec(piece);
    if (!field || !['fileID', 'guid', 'type'].includes(field[2]) || own(values, field[2])) throw new Error('Malformed Unity object reference');
    const key = field[2], value = field[4];
    const valueStart = offset + field[1].length + key.length + field[3].length;
    values[key] = value;
    ranges[key] = Object.freeze({ start: valueStart, end: valueStart + value.length });
    offset += piece.length + 1;
  }
  if (!own(values, 'fileID')) throw new Error('GUID reference without fileID');
  fileId(values.fileID);
  if (own(values, 'guid')) {
    guid(values.guid);
    if (!own(values, 'type') || !/^[0-9]+$/.test(values.type)) throw new Error('External reference requires numeric type');
  } else if (own(values, 'type')) throw new Error('Reference type without GUID');
  return Object.freeze({ kind: own(values, 'guid') ? 'external' : 'local', fileId: values.fileID,
    guid: values.guid ?? null, type: values.type ?? null, start, end, text: text.slice(start, end),
    fieldRanges: Object.freeze(ranges) });
}

/** Unity flow or fileID-first flat block references; quoted strings/comments are skipped. */
export function extractReferences(text) {
  textInput(text);
  const references = [];
  const lines = text.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) ?? [];
  const offsets = []; let cursor = 0;
  for (const line of lines) { offsets.push(cursor); cursor += line.length; }
  const flowLines = new Set(), stack = [];
  // Flow references may wrap onto the following line in Unity's own output.
  // Store original offsets so the same field edits preserve both layouts.
  for (const [lineIndex, rawLine] of lines.entries()) {
    const offset = offsets[lineIndex];
    if (stack.length) flowLines.add(lineIndex);
    if (/:\s*[|>][-+0-9]*\s*(?:#.*)?\r?\n?$/.test(rawLine)) throw new Error('Block scalar requires explicit handling before reference rewriting');
    let quote = null;
    for (let i = 0; i < rawLine.length; i++) {
      const c = rawLine[i];
      if (quote === '"') {
        if (c === '\\') { i++; continue; }
        if (c === '"') quote = null;
        continue;
      }
      if (quote === "'") {
        if (c === "'" && rawLine[i + 1] === "'") { i++; continue; }
        if (c === "'") quote = null;
        continue;
      }
      if (c === '#' && (i === 0 || /\s/.test(rawLine[i - 1]))) break;
      // Quotes/braces embedded in a plain scalar are literal characters.
      const prefix = rawLine.slice(0, i).trimEnd();
      const valueStart = !prefix || /[:\[,{\-]$/.test(prefix);
      if ((c === '"' || c === "'") && valueStart) { quote = c; continue; }
      if (c === '{' && valueStart) { stack.push(offset + i); flowLines.add(lineIndex); }
      if (c === '}' && stack.length) {
        const begin = stack.pop();
        const ref = referenceObject(text, begin, offset + i + 1);
        if (ref) references.push(ref);
      }
    }
    if (quote) throw new Error('Unclosed or multiline quoted Unity scalar');
  }
  if (stack.length) throw new Error('Unclosed Unity flow mapping');

  // Some supplied standalone BlendTrees use block-style object references.
  // Accept only a flat fileID-first mapping and retain original text/ranges.
  const blockLines = new Set();
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (flowLines.has(lineIndex) || blockLines.has(lineIndex)) continue;
    const first = /^( +)fileID:( *)(-?[0-9]+) *\r?\n?$/.exec(lines[lineIndex]);
    if (!first) continue;
    const indent = first[1].length;
    let parentIndex = lineIndex - 1;
    while (parentIndex >= 0 && /^\s*(?:#[^\r\n]*)?\s*$/.test(lines[parentIndex])) parentIndex--;
    const previous = lines[parentIndex] ?? '';
    if (!/^ *[A-Za-z_][A-Za-z_0-9]*: *\r?\n$/.test(previous) ||
        previous.match(/^ */)[0].length >= indent) throw new Error('Unsupported block reference parent');
    const parentIndent = previous.match(/^ */)[0].length;
    const values = {}, ranges = {};
    let last = lineIndex;
    for (let j = lineIndex; j < lines.length; j++) {
      // Blank/comment lines do not end a mapping: an ignored later guid would
      // otherwise turn an external reference into an incorrectly remapped local.
      if (/^\s*(?:#[^\r\n]*)?\s*$/.test(lines[j])) continue;
      const childIndent = lines[j].match(/^ */)[0].length;
      if (childIndent <= parentIndent) break;
      if (childIndent !== indent) throw new Error('Nested or inconsistently indented block reference');
      const f = new RegExp(`^( {${indent}})(fileID|guid|type):( *)(\\S+) *\\r?\\n?$`).exec(lines[j]);
      if (!f || own(values, f[2])) throw new Error('Malformed block reference');
      const start = offsets[j] + indent + f[2].length + 1 + f[3].length;
      values[f[2]] = f[4]; ranges[f[2]] = Object.freeze({ start, end: start + f[4].length });
      blockLines.add(j); last = j;
    }
    const inline = '{' + Object.entries(values).map(([k, v]) => `${k}: ${v}`).join(', ') + '}';
    const checked = referenceObject(inline, 0, inline.length);
    const start = offsets[lineIndex], end = offsets[last] + lines[last].length;
    references.push(Object.freeze({ ...checked, start, end, text: text.slice(start, end), fieldRanges: Object.freeze(ranges) }));
  }
  for (const [index, line] of lines.entries()) {
    if (!flowLines.has(index) && !blockLines.has(index) && /^\s*(?:fileID|guid)\s*:/.test(line)) {
      throw new Error('Malformed or unsupported block reference');
    }
  }
  return Object.freeze(references.sort((a, b) => a.start - b.start));
}

function idMap(map = new Map()) {
  if (!(map instanceof Map)) throw new TypeError('fileID mapping must be a Map of strings');
  for (const [from, to] of map) { fileId(from, true); fileId(to, true); }
  return map;
}

/** Emit Unity PPtr fields as same-line flow maps; keep identity as exact strings. */
export function canonicalizeObjectReferences(text) {
  const edits = [];
  for (const ref of extractReferences(text)) {
    const value = ref.kind === 'external'
      ? `{fileID: ${ref.fileId}, guid: ${ref.guid}, type: ${ref.type}}`
      : `{fileID: ${ref.fileId}}`;
    // A reference may be an ordinary flow map, a multiline flow map, a flat
    // block mapping, or a flow map on its own line following the field name.
    const lineStart = text.lastIndexOf('\n', ref.start - 1) + 1;
    const prefix = text.slice(lineStart, ref.start);
    let start = ref.start, replacement = value;
    if (!prefix.trim()) {
      const before = text.slice(0, lineStart);
      const parent = /(^|\n)( *[A-Za-z_][A-Za-z_0-9]*:)[ \t]*\r?\n$/.exec(before);
      if (!parent || parent.index + parent[0].length !== before.length)
        throw new Error('Reference needs a direct field parent for canonical output');
      start = parent.index + parent[1].length + parent[2].length;
      replacement = ' ' + value + (ref.text.endsWith('\n') ? '\n' : '');
    }
    edits.push({ start, end: ref.end, value: replacement });
  }
  return editsApplied(text, edits);
}

export function replaceReferences(text, { localFileIds = new Map(), guidReferences = new Map() } = {}) {
  idMap(localFileIds);
  if (!(guidReferences instanceof Map)) throw new TypeError('GUID mapping must be a Map');
  const external = new Map();
  for (const [from, value] of guidReferences) {
    const key = guid(from).toLowerCase();
    if (external.has(key)) throw new Error('Ambiguous case variants of the same GUID mapping');
    if (typeof value === 'string') external.set(key, { guid: guid(value), fileIds: new Map() });
    else {
      if (!value || typeof value !== 'object') throw new TypeError('Invalid GUID mapping');
      if (Object.keys(value).some(key => !['guid', 'fileIds'].includes(key))) throw new TypeError('Unknown GUID mapping field');
      external.set(key, { guid: value.guid === undefined ? from : guid(value.guid), fileIds: idMap(value.fileIds) });
    }
  }
  const edits = [];
  for (const ref of extractReferences(text)) {
    if (ref.kind === 'local') {
      if (localFileIds.has(ref.fileId)) edits.push({ ...ref.fieldRanges.fileID, value: localFileIds.get(ref.fileId) });
    } else if (external.has(ref.guid.toLowerCase())) {
      const replacement = external.get(ref.guid.toLowerCase());
      if (replacement.guid !== ref.guid) edits.push({ ...ref.fieldRanges.guid, value: replacement.guid });
      if (replacement.fileIds.has(ref.fileId)) edits.push({ ...ref.fieldRanges.fileID, value: replacement.fileIds.get(ref.fileId) });
    }
  }
  return editsApplied(text, edits);
}

function controllerDocument(text, { controllerFileId } = {}) {
  const docs = splitUnityDocuments(text).documents.filter(d => d.classId === '91' && (controllerFileId === undefined || d.fileId === fileId(controllerFileId, true)));
  if (docs.length !== 1 || !docs[0].body.startsWith('AnimatorController:')) throw new Error('Expected one unambiguous AnimatorController document');
  return docs[0];
}

function sequence(text, key, options) {
  const doc = controllerDocument(text, options);
  const fields = [...doc.body.matchAll(/^  ([A-Za-z_][A-Za-z_0-9]*):([^\r\n]*)(\r?\n|$)/gm)];
  const matches = fields.filter(m => m[1] === key);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${key} field`);
  const match = matches[0], index = fields.indexOf(match);
  const base = doc.start + doc.header.length;
  const start = base + match.index, contentStart = start + match[0].length;
  const end = base + (fields[index + 1]?.index ?? doc.body.length);
  const value = match[2].trim();
  if (value !== '' && value !== '[]') throw new Error(`Unsupported ${key} sequence value`);
  const content = text.slice(contentStart, end);
  if (value === '[]' && content.trim()) throw new Error(`Content following empty ${key}`);
  const starts = [...content.matchAll(/^  - /gm)].map(m => m.index);
  if (value === '' && content.trim() && starts.length === 0) throw new Error(`Malformed ${key} sequence`);
  const leading = content.slice(0, starts[0] ?? content.length);
  if (leading.trim()) throw new Error(`Unexpected text before ${key} items`);
  const blocks = starts.map((position, i) => content.slice(position, starts[i + 1] ?? content.length));
  return { doc, key, start, contentStart, end, eol: match[3] || '\n', leading, blocks };
}

/** Decode one scalar without rewriting source text. Empty plain values are allowed. */
export function parseUnityScalar(value) {
  if (typeof value !== 'string') throw new TypeError('Expected Unity scalar text');
  value = value.trim();
  if (!value) return '';
  if (value.startsWith('"')) {
    // Unity uses YAML escapes (not only JSON): e.g. "\\xB1XY" for ±XY.
    // Decode a single quoted scalar while retaining the original item text.
    const match = /^"((?:[^"\\\r\n]|\\[^\r\n])*)"(?:[ \t]+#.*)?$/.exec(value);
    if (!match) throw new Error('Unsupported or malformed quoted Unity scalar');
    const body = match[1];
    const escapes = { '0': '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\x0b',
      f: '\f', r: '\r', e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\',
      N: '\u0085', _: '\u00a0', L: '\u2028', P: '\u2029' };
    let result = '';
    for (let index = 0; index < body.length; index++) {
      const char = body[index];
      if (char !== '\\') { result += char; continue; }
      const escaped = body[++index];
      if (own(escapes, escaped)) { result += escapes[escaped]; continue; }
      const length = { x: 2, u: 4, U: 8 }[escaped];
      if (!length) throw new Error('Unsupported or malformed quoted Unity scalar escape');
      const digits = body.slice(index + 1, index + 1 + length);
      if (digits.length !== length || !/^[0-9a-fA-F]+$/.test(digits)) throw new Error('Malformed Unity scalar hexadecimal escape');
      const codePoint = Number.parseInt(digits, 16);
      if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) throw new Error('Invalid Unicode scalar escape');
      result += String.fromCodePoint(codePoint);
      index += length;
    }
    return result;
  }
  if (value.startsWith("'")) {
    const match = /^'((?:[^'\r\n]|'')*)'(?:[ \t]+#.*)?$/.exec(value);
    if (!match) throw new Error('Malformed single-quoted Unity scalar');
    return match[1].replaceAll("''", "'");
  }
  if (/[\r\n]/.test(value)) throw new Error('Multiline Unity scalar requires explicit handling');
  return value.replace(/\s+#.*$/, '').trimEnd();
}

function blockRecord(text, kind) {
  textInput(text);
  if (!/^  - [A-Za-z_][A-Za-z_0-9]*:/.test(text) || [...text.matchAll(/^  - /gm)].length !== 1) throw new Error('Expected one serialized sequence item');
  if (text.split(/\r?\n/).some((line, i) => i > 0 && line && !/^ {4}|^\s*$/.test(line))) throw new Error('Unexpected indentation in sequence item');
  const fields = {};
  for (const m of text.matchAll(/^(?:  - |    )([A-Za-z_][A-Za-z_0-9]*):([^\r\n]*)/gm)) {
    if (own(fields, m[1])) throw new Error(`Duplicate item field: ${m[1]}`);
    fields[m[1]] = m[2].trim();
  }
  if (!own(fields, 'm_Name')) throw new Error('Item missing m_Name');
  const name = parseUnityScalar(fields.m_Name);
  if (!name || /\p{Cc}/u.test(name)) throw new Error('Invalid item name');
  extractReferences(text); // references must be well-formed even in untouched items
  if (kind === 'layer') {
    for (const key of ['serializedVersion', 'm_StateMachine', 'm_Mask', 'm_Controller']) {
      if (!own(fields, key)) throw new Error(`Layer missing ${key}`);
    }
    if (!/^[0-9]+$/.test(fields.serializedVersion)) throw new Error('Invalid layer serializedVersion');
    for (const key of ['m_StateMachine', 'm_Mask', 'm_Controller']) singleReference(fields[key], key);
  } else {
    for (const key of ['m_Type', 'm_DefaultFloat', 'm_DefaultInt', 'm_DefaultBool', 'm_Controller']) {
      if (!own(fields, key)) throw new Error(`Parameter missing ${key}`);
    }
    if (!['1', '3', '4', '9'].includes(fields.m_Type)) throw new Error('Unsupported Animator parameter type');
    if (!/^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/.test(fields.m_DefaultFloat) || !Number.isFinite(Number(fields.m_DefaultFloat))) throw new Error('Invalid parameter float default');
    if (!/^-?[0-9]+$/.test(fields.m_DefaultInt) || BigInt(fields.m_DefaultInt) < -2147483648n || BigInt(fields.m_DefaultInt) > 2147483647n) throw new Error('Invalid parameter integer default');
    if (!['0', '1'].includes(fields.m_DefaultBool)) throw new Error('Invalid parameter boolean default');
    singleReference(fields.m_Controller, 'parameter controller');
  }
  return Object.freeze({ name, text, fields: Object.freeze(fields) });
}

function uniqueRecords(blocks, kind) {
  const records = blocks.map(b => blockRecord(typeof b === 'string' ? b : b?.text, kind));
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.name)) throw new Error(`Duplicate ${kind} name: ${record.name}`);
    seen.add(record.name);
  }
  return Object.freeze(records);
}

export function extractAnimatorLayers(text, options) {
  return uniqueRecords(sequence(text, 'm_AnimatorLayers', options).blocks, 'layer');
}
export function extractAnimatorParameters(text, options) {
  return uniqueRecords(sequence(text, 'm_AnimatorParameters', options).blocks, 'parameter');
}

function replaceSequence(text, seq, records) {
  const content = records.map(r => r.text).join('');
  if (content === seq.blocks.join('')) return text;
  let replacement = `  ${seq.key}:${records.length ? '' : ' []'}${seq.eol}`;
  if (records.length) replacement += seq.leading + records.map(r => r.text.endsWith('\n') ? r.text : r.text + seq.eol).join('');
  const output = editsApplied(text, [{ start: seq.start, end: seq.end, value: replacement }]);
  sequence(output, seq.key, { controllerFileId: seq.doc.fileId });
  return output;
}

export function replaceAnimatorLayers(text, layers, options) {
  if (!Array.isArray(layers)) throw new TypeError('layers must be an array of blocks');
  return replaceSequence(text, sequence(text, 'm_AnimatorLayers', options), uniqueRecords(layers, 'layer'));
}

function singleReference(value, label) {
  const refs = extractReferences(value);
  if (refs.length !== 1 || refs[0].text !== value) throw new Error(`Invalid ${label} reference`);
  return refs[0];
}
function controllerRef(record) { return singleReference(record.fields.m_Controller, 'parameter controller'); }

/** Compare supported parameter definitions without rewriting their spelling. */
export function assertSameParameterDefinition(a, b) {
  a = blockRecord(typeof a === 'string' ? a : a?.text, 'parameter');
  b = blockRecord(typeof b === 'string' ? b : b?.text, 'parameter');
  const af = a.fields, bf = b.fields;
  let same = a.name === b.name && af.m_Type === bf.m_Type
    && Number(af.m_DefaultFloat) === Number(bf.m_DefaultFloat)
    && BigInt(af.m_DefaultInt) === BigInt(bf.m_DefaultInt) && af.m_DefaultBool === bf.m_DefaultBool;
  const ar = controllerRef(a), br = controllerRef(b);
  same &&= ar.fileId === br.fileId && ar.guid?.toLowerCase() === br.guid?.toLowerCase() && ar.type === br.type;
  const known = new Set(['m_Name', 'm_Type', 'm_DefaultFloat', 'm_DefaultInt', 'm_DefaultBool', 'm_Controller']);
  // Unknown future fields may contain nested data. Require an exact block match
  // rather than treating matching field headers as identical nested definitions.
  if ([...new Set([...Object.keys(af), ...Object.keys(bf)])].some(key => !known.has(key)) && a.text !== b.text) same = false;
  if (!same) throw new Error(`Conflicting Animator parameter definition: ${a.name}`);
  return true;
}

/** Add absent declarations; matching existing declarations are retained verbatim. */
export function appendAnimatorParameters(text, parameters, options) {
  if (!Array.isArray(parameters)) throw new TypeError('parameters must be an array of blocks');
  const seq = sequence(text, 'm_AnimatorParameters', options);
  const existing = uniqueRecords(seq.blocks, 'parameter');
  const incoming = uniqueRecords(parameters, 'parameter');
  const byName = new Map(existing.map(r => [r.name, r]));
  const additions = [];
  for (const item of incoming) {
    const ref = controllerRef(item);
    // Unity source parameters may legitimately retain a null m_Controller
    // (observed in Additive+C_Maho). Preserve it instead of silently binding it.
    if (ref.kind !== 'local' || (ref.fileId !== '0' && ref.fileId !== seq.doc.fileId)) throw new Error(`Parameter controller does not match destination: ${item.name}`);
    if (byName.has(item.name)) assertSameParameterDefinition(byName.get(item.name), item);
    else additions.push(item);
  }
  if (!additions.length) return text;
  return replaceSequence(text, seq, [...existing, ...additions]);
}
