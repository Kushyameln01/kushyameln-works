import {planOpenEndedMdatHeaders} from './open-ended-mdat.mjs';
// Range-based, non-fragmented AVC/HEVC + AAC inspection and metadata-only tagging.
// Spherical V2 layout follows google/spatial-media commit 2308497c39bb604a7c3ba56ac17e302f2b1b6a96.
// This is deliberately a restrictive container parser, not a general MP4 repair tool or decoder.
import {classifyMetadata} from './container-metadata.mjs';
const SMALL_METADATA_LIMIT = 16 * 1024 * 1024;
const TABLE_PAGE_BYTES = 64 * 1024;
const BOX_LIMIT = 20000;
const DEPTH_LIMIT = 16;
const V1_UUID = 'ffcc8263f8554a938814587a02521fdd';
const HALF_SPHERE = Object.freeze({ top: 0, bottom: 0, left: 0x40000000, right: 0x40000000 });
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
const IDENTITY_MATRIX = [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824];
const fail = (message) => { throw new Error(`MP4: ${message}`); };
const check = (condition, message) => { if (!condition) fail(message); };
function abort(signal) { if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError'); }
function fourcc(bytes, at) { return String.fromCharCode(...bytes.subarray(at, at + 4)); }
function u32(n) { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, n); return a; }
function box(type, ...parts) {
  const length = 8 + parts.reduce((n, p) => n + p.byteLength, 0);
  check(length <= SMALL_METADATA_LIMIT, 'new metadata exceeds 0.016777216 GB budget');
  const out = new Uint8Array(length); new DataView(out.buffer).setUint32(0, length); out.set(enc.encode(type), 4); let at = 8;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}
function fullBox(type, ...parts) { return box(type, u32(0), ...parts); }
function integer64(view, at, signed = false) {
  const n = signed ? view.getBigInt64(at) : view.getBigUint64(at);
  check(n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER), '64-bit value or offset exceeds safe integer range');
  return Number(n);
}
async function read(blob, start, length, signal) {
  abort(signal);
  check(Number.isSafeInteger(start) && Number.isSafeInteger(length) && length >= 0 && start >= 0 && Number.isSafeInteger(start + length) && start + length <= blob.size, 'truncated box read');
  const bytes = new Uint8Array(await blob.slice(start, start + length).arrayBuffer());
  abort(signal); check(bytes.length === length, 'truncated Blob read'); return bytes;
}
function countBox(context, depth) {
  check(depth <= DEPTH_LIMIT, 'box nesting depth limit exceeded');
  check(++context.count <= BOX_LIMIT, 'box count limit exceeded');
  if (!(context.count % 256)) abort(context.signal);
}

const allowed = {
  moov: new Set(['mvhd', 'trak', 'udta', 'meta', 'free', 'skip', 'uuid']),
  trak: new Set(['tkhd', 'mdia', 'edts', 'tref', 'udta', 'meta', 'free', 'skip', 'uuid']),
  tref: new Set(), // Child fourcc values name reference types, not ordinary boxes.
  mdia: new Set(['mdhd', 'hdlr', 'minf', 'elng', 'free']),
  minf: new Set(['vmhd', 'smhd', 'nmhd', 'gmhd', 'dinf', 'stbl', 'free']),
  gmhd: new Set(['gmin', 'text', 'tmcd']),
  'tmcd-media': new Set(['tcmi']), // gmhd/tmcd only; stsd/tmcd is a sample-entry leaf.
  dinf: new Set(['dref']), dref: new Set(['url ']), edts: new Set(['elst']),
  stbl: new Set(['stsd', 'stts', 'ctts', 'cslg', 'stsc', 'stsz', 'stz2', 'stco', 'co64', 'stss', 'sdtp', 'sgpd', 'sbgp', 'free']),
  stsd: new Set(['avc1', 'hev1', 'hvc1', 'mp4a', 'text', 'tx3g', 'tmcd', 'tc64']),
  avc1: new Set(['avcC', 'pasp', 'colr', 'btrt', 'st3d', 'sv3d', 'uuid', 'free']),
  hev1: new Set(['hvcC', 'pasp', 'colr', 'mdcv', 'clli', 'fiel', 'btrt', 'st3d', 'sv3d', 'uuid', 'free']),
  hvc1: new Set(['hvcC', 'pasp', 'colr', 'mdcv', 'clli', 'fiel', 'btrt', 'st3d', 'sv3d', 'uuid', 'free']),
  mp4a: new Set(['esds', 'btrt', 'free']),
  sv3d: new Set(['svhd', 'proj']), proj: new Set(['prhd', 'equi', 'mshp']),
  udta: new Set(['meta', 'udta', 'uuid', 'cprt', 'name', 'chpl', 'free', 'skip']),
  meta: new Set(['hdlr', 'keys', 'ilst', 'free']),
};
const prefixes = { stsd: 8, dref: 8, avc1: 78, hev1: 78, hvc1: 78, mp4a: 28 };
const acceptedTop = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'uuid']);
const structuralProfile = Object.freeze({
  children: Object.freeze(Object.fromEntries(Object.entries(allowed).map(([key, value]) => [key, Object.freeze([...value])]))),
  prefixes: Object.freeze({...prefixes}), top: Object.freeze([...acceptedTop]),
  metaPrefixes: Object.freeze([0, 4]),
  contextChildren: Object.freeze({'gmhd/tmcd': 'tmcd-media'}),
  opaqueContexts: Object.freeze(['tref/*', 'stsd/tmcd', 'stsd/tc64', 'meta/ilst', 'meta/keys']),
});
/** Structural diagnostic hints only. Inspection/tagging still perform semantic validation. */
export function getMp4StructuralProfile() { return structuralProfile; }
const pagedTypes = new Set(['stts', 'ctts', 'stsc', 'stsz', 'stz2', 'stco', 'co64', 'stss', 'sdtp', 'sgpd', 'sbgp', 'elst']);
const opaqueTypes = new Set(['free', 'skip', 'wide']);
async function yieldToCancel(signal) {
  await new Promise(resolve => setTimeout(resolve, 0)); abort(signal);
}
async function metaPrefix(blob, start, end, signal) {
  check(end - start >= 4, 'truncated meta format');
  const head = await read(blob, start, Math.min(8, end - start), signal);
  // ISO FullBox v0/flags0 and QuickTime's child-first form are explicit,
  // disjoint layouts. Never scan unknown payloads in search of an hdlr marker.
  if (new DataView(head.buffer).getUint32(0) === 0) return 4;
  check(head.length === 8 && allowed.meta.has(fourcc(head, 4)), 'unsupported meta format/version/flags');
  return 0;
}
async function parseChildren(blob, start, end, parent, context, depth = 1) {
  const nodes = [];
  while (start < end) {
    countBox(context, depth); check(end - start >= 8, 'truncated child box header');
    if (!(context.count % 256)) await yieldToCancel(context.signal);
    const h = await read(blob, start, 8, context.signal), view = new DataView(h.buffer);
    const type = fourcc(h, 4); let size = view.getUint32(0), header = 8;
    check(size !== 0, 'zero-size boxes are unsupported');
    if (size === 1) { check(end - start >= 16, 'truncated extended box size'); const ext = await read(blob, start + 8, 8, context.signal); size = integer64(new DataView(ext.buffer), 0); header = 16; }
    check(size >= header && size <= end - start, `invalid size/bounds for ${type}`);
    check(parent === 'tref' || allowed[parent]?.has(type), `unsupported ${type} box in ${parent}; unknown codecs, fragments or offsets are not preserved`);
    const node = { type, start, end: start + size, header, payload: start + header, blob, signal: context.signal, bytes: null, children: null };
    if (parent === 'tref') {
      // Reference types have an array of uint32 track IDs, even when their name
      // coincides with a container/uuid fourcc. Validate in pages after all track
      // IDs are known; never retain a potentially large per-reference JS array.
      check((size - header) % 4 === 0, `invalid tref ${type} track ID array size`);
      node.trackReference = true;
    } else if (allowed[type] || (type === 'tmcd' && parent === 'gmhd')) {
      const childPolicy = type === 'tmcd' && parent === 'gmhd' ? 'tmcd-media' : type;
      const prefix = type === 'meta' ? await metaPrefix(blob, node.payload, node.end, context.signal) : prefixes[type] ?? 0;
      check(size - header >= prefix, `truncated ${type} entry`);
      node.bytes = await read(blob, node.payload, prefix, context.signal);
      if (type === 'mp4a') check(new DataView(node.bytes.buffer).getUint16(8) === 0, 'unsupported mp4a sample entry version');
      node.childStart = node.payload + prefix;
      node.children = await parseChildren(blob, node.childStart, node.end, childPolicy, context, depth + 1);
      if (type === 'meta') {
        await checkMetadata(node, context, depth + 1, parent);
        node.preserveWhole = true;
        // Keep the previous ISO udta/meta conversion admission unchanged. Its
        // metadata preservation is a separate open issue. Newly admitted forms
        // must not silently lose their metadata in the current pixel writer.
        node.metadataCopyOnly = (Boolean(node.keyedMetadata) || prefix === 0 || parent !== 'udta') && !node.metadataTransferSafe;
      }
    } else if (!pagedTypes.has(type) && !opaqueTypes.has(type)) {
      context.retainedBytes += size - header;
      check(context.retainedBytes <= SMALL_METADATA_LIMIT, 'small metadata exceeds 0.016777216 GB retained-byte budget');
      node.bytes = await read(blob, node.payload, size - header, context.signal);
    }
    if (type === 'uuid' && !node.trackReference) {
      check(size - header >= 16, 'truncated uuid');
      const id = Array.from(node.bytes.subarray(0, 16), x => x.toString(16).padStart(2, '0')).join('');
      check(id === V1_UUID, 'unsupported unknown UUID metadata'); node.legacy = true;
    }
    nodes.push(node); start += size;
  }
  return nodes;
}
function nodes(parent, type) { return parent.children.filter(n => n.type === type); }
function one(parent, type, required = true) {
  const a = nodes(parent, type); check(a.length <= 1, `duplicate/multiple ${type} boxes`);
  check(!required || a.length === 1, `missing ${type} box`); return a[0] ?? null;
}
function body(node, minimum = 0) {
  check(node?.bytes && node.bytes.byteLength >= minimum, `truncated ${node?.type ?? 'required'} payload`);
  return new DataView(node.bytes.buffer, node.bytes.byteOffset, node.bytes.byteLength);
}
function full(node, versions = [0], minimum = 4, flagsZero = false) {
  const d = body(node, minimum); check(versions.includes(d.getUint8(0)), `unsupported ${node.type} version`);
  if (flagsZero) check((d.getUint32(0) & 0xffffff) === 0, `unsupported ${node.type} flags`);
  return d;
}
async function inlineBoxes(bytes, start, end, context, depth, consume) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (start < end) {
    countBox(context, depth);
    if (!(context.count % 256)) await yieldToCancel(context.signal);
    check(end - start >= 8, 'truncated metadata item header');
    let size = view.getUint32(start), header = 8;
    check(size !== 0, 'zero-size metadata item is unsupported');
    if (size === 1) {
      check(end - start >= 16, 'truncated extended metadata item');
      size = integer64(view, start + 8); header = 16;
    }
    check(size >= header && size <= end - start, 'invalid metadata item size/bounds');
    await consume({start, end: start + size, payload: start + header, type: fourcc(bytes, start + 4)}, view);
    start += size;
  }
}
async function checkMetadata(meta, context, depth, parent) {
  const handler = one(meta, 'hdlr', false), keys = one(meta, 'keys', false), items = one(meta, 'ilst', false);
  const kind = handler ? (full(handler, [0], 12, true), fourcc(handler.bytes, 8)) : null;
  meta.metadataTransferSafe = classifyMetadata({handler: kind, keys: keys?.bytes ?? null, items: items?.bytes ?? null}).safe;
  if (meta.childStart === meta.payload || parent !== 'udta') check(handler && ['mdta', 'mdir'].includes(kind), 'unsupported meta handler in newly supported format');
  if (!keys && kind !== 'mdta') return; // Retain the existing, opaque iTunes metadata path.
  check(kind === 'mdta', 'keys metadata requires an mdta handler');
  check(keys, 'missing keys table for mdta metadata');
  const d = full(keys, [0], 8, true), count = d.getUint32(4); let at = 8;
  check(count <= BOX_LIMIT && count <= Math.floor((d.byteLength - 8) / 8), 'invalid keys entry count');
  for (let i = 0; i < count; i++) {
    countBox(context, depth);
    if (!(context.count % 256)) await yieldToCancel(context.signal);
    check(at + 8 <= d.byteLength, 'truncated keys entry');
    const size = d.getUint32(at);
    check(size >= 8 && size <= d.byteLength - at, 'invalid keys entry size');
    check(fourcc(keys.bytes, at + 4) === 'mdta', 'unsupported keys namespace');
    // Keep the original name bytes, including duplicate names and order. No
    // string conversion, sorting or deduplication is part of a copy operation.
    at += size;
  }
  check(at === d.byteLength, 'keys count/size mismatch');
  let itemCount = 0, valueCount = 0;
  if (items) await inlineBoxes(items.bytes, 0, items.bytes.length, context, depth, async (item, view) => {
    const index = view.getUint32(item.start + 4);
    check(index > 0 && index <= count, 'ilst key index is outside keys table');
    let values = 0;
    await inlineBoxes(items.bytes, item.payload, item.end, context, depth + 1, async value => {
      check(value.type === 'data', `unsupported ${value.type} metadata item child`);
      check(value.end - value.payload >= 8, 'truncated metadata data type/locale');
      // The 32-bit type indicator, locale and value remain bytes. Unknown data
      // types, multiple values and empty values are never guessed as UTF-8.
      values++; valueCount++;
    });
    check(values > 0, 'metadata item has no data value'); itemCount++;
  });
  meta.keyedMetadata = {keyCount: count, itemCount, valueCount, format: meta.childStart === meta.payload ? 'quicktime' : 'fullbox'};
}
// Each table caches one 64 KiB page; active row views can briefly retain a prior
// page. No table-sized buffer or per-sample array is constructed.
async function paged(node, versions = [0], minimum = 4) {
  check(node && node.end - node.payload >= minimum, `truncated ${node?.type ?? 'required'} payload`);
  const length = node.end - node.payload;
  let page = null, pageAt = -1;
  async function view(at, size) {
    abort(node.signal);
    check(Number.isSafeInteger(at) && Number.isSafeInteger(size) && at >= 0 && size >= 0 && size <= TABLE_PAGE_BYTES && at + size <= length, `truncated ${node.type} table read`);
    if (!page || at < pageAt || at + size > pageAt + page.byteLength) {
      page = null;
      await yieldToCancel(node.signal);
      page = await read(node.blob, node.payload + at, Math.min(TABLE_PAGE_BYTES, length - at), node.signal); pageAt = at;
    }
    return new DataView(page.buffer, page.byteOffset + at - pageAt, size);
  }
  const first = await view(0, minimum), head = new DataView(first.buffer.slice(first.byteOffset, first.byteOffset + minimum)), version = head.getUint8(0);
  check(versions.includes(version), `unsupported ${node.type} version`);
  return { length, version, view, head };
}
async function exactTable(node, stride, versions = [0]) {
  const p = await paged(node, versions, 8), count = p.head.getUint32(4);
  check(8 + count * stride === p.length, `invalid ${node.type} entry count/size`);
  return { ...p, count, row: i => { check(i >= 0 && i < count, `invalid ${node.type} entry index`); return p.view(8 + i * stride, stride); } };
}
function visit(node, fn) { fn(node); for (const child of node.children ?? []) visit(child, fn); }

async function checkTrackReferences(tracks, issues, signal) {
  const ids = new Set();
  for (const track of tracks) {
    const header = full(one(track, 'tkhd'), [0, 1], 84);
    const id = header.getUint32(header.getUint8(0) ? 20 : 12);
    check(id !== 0 && !ids.has(id), 'invalid/duplicate track ID'); ids.add(id); track.trackId = id;
    track.enabled = Boolean(header.getUint32(0) & 1);
  }
  let referenceCount = 0, hasTrackReferences = false;
  const chapterTargets = new Set();
  for (const track of tracks) {
    const refs = one(track, 'tref', false); if (!refs) continue;
    hasTrackReferences = true;
    // A pixel conversion replaces tracks and IDs. Until that path can preserve
    // these relationships, only the unchanged-track metadata copy is admitted.
    issues.add('Track references are preserved by metadata-only copy; pixel conversion cannot preserve them.');
    const types = new Set();
    for (const ref of refs.children) {
      check(!types.has(ref.type), `duplicate tref ${ref.type} reference type`); types.add(ref.type);
      for (let at = ref.payload; at < ref.end; at += TABLE_PAGE_BYTES) {
        await yieldToCancel(signal);
        const bytes = await read(ref.blob, at, Math.min(TABLE_PAGE_BYTES, ref.end - at), signal);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < bytes.length; i += 4) {
          const target = view.getUint32(i);
          // Zero is the specified empty reference, not a missing target track.
          check(target === 0 || ids.has(target), `tref ${ref.type} references missing track ID ${target}`);
          if (target && ref.type === 'chap' && track.enabled) chapterTargets.add(target);
          referenceCount++;
        }
      }
    }
  }
  return {referenceCount, chapterTargets, hasTrackReferences};
}

function checkChapterTrack(track, minf, entry, references) {
  check(references.chapterTargets.has(track.trackId) && !track.enabled,
    'text tracks must be disabled chapter tracks referenced by an enabled track');
  check(['text', 'tx3g'].includes(entry.type), 'unsupported chapter sample entry');
  // Chapter names/formatting are not decoded or rewritten. This includes the
  // FFmpeg chapter 'text' entry (a 51-byte payload using a timed-text header).
  // The common data-reference field was checked against self-contained dref.
  body(entry, entry.type === 'tx3g' ? 38 : 51);
  const nullHeader = one(minf, 'nmhd', false), generic = one(minf, 'gmhd', false);
  check(Boolean(nullHeader) !== Boolean(generic), 'missing/duplicate chapter media header');
  check(!one(minf, 'vmhd', false) && !one(minf, 'smhd', false), 'invalid chapter media header');
  if (nullHeader) check(full(nullHeader, [0], 4, true).byteLength === 4, 'invalid nmhd');
  if (generic) {
    check(full(one(generic, 'gmin'), [0], 16).byteLength === 16, 'invalid gmin');
    const matrix = one(generic, 'text', false);
    if (matrix) check(body(matrix, 36).byteLength === 36, 'invalid chapter text matrix');
  }
}

function checkTimecodeTrack(minf, entry) {
  // Apple TN2174: tmcd and tc64 differ in sample width, not in their sample
  // entry. A timecode track is valid without a tref/tmcd association.
  check(['tmcd', 'tc64'].includes(entry.type), 'unsupported timecode sample entry');
  const d = body(entry, 26), flags = d.getUint32(12);
  check([...entry.bytes.subarray(0, 6)].every(n => n === 0) && d.getUint32(8) === 0 && d.getUint8(25) === 0, 'unsupported timecode reserved fields');
  check((flags & ~15) === 0, 'unsupported timecode flags');
  const timescale = d.getInt32(16), frameDuration = d.getInt32(20), numFrames = d.getUint8(24);
  check(timescale > 0 && frameDuration > 0 && numFrames > 0, 'invalid timecode frame timing');
  // TN2174 omits the source reference (26 bytes). FFmpeg writes a zero uint16
  // trailer (28 bytes); QuickTime may instead append one bounded name atom.
  if (d.byteLength !== 26 && !(d.byteLength === 28 && d.getUint16(26) === 0)) {
    check(d.byteLength >= 38 && d.getUint32(26) === d.byteLength - 26 && fourcc(entry.bytes, 30) === 'name', 'unsupported timecode source reference');
    check(d.getUint16(34) === d.byteLength - 38, 'invalid timecode source name length');
  }
  const nullHeader = one(minf, 'nmhd', false), generic = one(minf, 'gmhd', false);
  check(Boolean(nullHeader) !== Boolean(generic), 'timecode track needs one nmhd or gmhd media header');
  check(!one(minf, 'vmhd', false) && !one(minf, 'smhd', false), 'timecode track has a video/audio media header');
  if (nullHeader) check(full(nullHeader, [0], 4, true).byteLength === 4, 'invalid timecode nmhd');
  if (generic) {
    check(full(one(generic, 'gmin'), [0], 16, true).byteLength === 16, 'invalid timecode gmin');
    const text = one(generic, 'text', false);
    if (text) check(body(text, 36).byteLength === 36, 'invalid timecode text matrix');
    const media = one(generic, 'tmcd'), info = one(media, 'tcmi'), t = full(info, [0], 25, true);
    check(t.getUint16(10) === 0 && t.byteLength === 25 + t.getUint8(24), 'invalid timecode tcmi/font name');
  }
  return {flags, timescale, frameDuration, numFrames, sampleBytes: entry.type === 'tc64' ? 8 : 4};
}

function checkChapterList(node) {
  const d = full(node, [0, 1], 5, true);
  let at = d.getUint8(0) === 1 ? 8 : 4;
  check(at < d.byteLength, 'truncated chpl chapter count');
  const count = d.getUint8(at++);
  for (let i = 0; i < count; i++) {
    check(at + 9 <= d.byteLength, 'truncated chpl chapter');
    const length = d.getUint8(at + 8); at += 9;
    check(at + length <= d.byteLength, 'truncated chpl chapter name'); at += length;
  }
  check(at === d.byteLength, 'invalid chpl chapter list size');
}

function checkAvc(entry) {
  const node = one(entry, 'avcC'); const d = body(node, 7);
  check(d.getUint8(0) === 1 && [66, 77, 88, 100].includes(d.getUint8(1)), 'unsupported H.264 profile; only 8-bit SDR avc1 is supported');
  check((d.getUint8(4) & 3) !== 2, 'unsupported avcC NAL length');
  let at = 6;
  function units(count) {
    check(count > 0, 'missing avcC parameter sets');
    for (let i = 0; i < count; i++) { check(at + 2 <= d.byteLength, 'truncated avcC parameter set'); const size = d.getUint16(at); at += 2; check(size > 0 && at + size <= d.byteLength, 'truncated avcC parameter set'); at += size; }
  }
  units(d.getUint8(5) & 31); check(at < d.byteLength, 'missing avcC PPS'); units(d.getUint8(at++));
  if (at < d.byteLength) {
    check(d.getUint8(1) === 100 && at + 4 <= d.byteLength, 'unsupported avcC extension');
    check((d.getUint8(at) & 3) === 1 && (d.getUint8(at + 1) & 7) === 0 && (d.getUint8(at + 2) & 7) === 0, 'unsupported H.264 chroma/bit depth; SDR 8-bit 4:2:0 required');
    const count = d.getUint8(at + 3); at += 4; if (count) units(count);
  }
  check(at === d.byteLength, 'unrecognized avcC trailing data');
  checkVideoPresentation(entry);
}

// Validate the HEVCDecoderConfigurationRecord without rewriting parameter sets.
// hev1 may also carry parameter sets in samples; those samples remain untouched.
function checkHevc(entry) {
  const d = body(one(entry, 'hvcC'), 23);
  check(d.getUint8(0) === 1, 'unsupported hvcC configuration version');
  check((d.getUint8(21) & 3) !== 2, 'unsupported hvcC NAL length');
  let at = 23;
  const types = new Set();
  for (let i = 0; i < d.getUint8(22); i++) {
    check(at + 3 <= d.byteLength, 'truncated hvcC NAL array');
    const flags = d.getUint8(at++), type = flags & 63, count = d.getUint16(at); at += 2;
    check(!(flags & 64) && !types.has(type), 'invalid/duplicate hvcC NAL array'); types.add(type);
    for (let j = 0; j < count; j++) {
      check(at + 2 <= d.byteLength, 'truncated hvcC NAL unit length');
      const size = d.getUint16(at); at += 2;
      check(size >= 2 && at + size <= d.byteLength, 'truncated hvcC NAL unit');
      check(!(d.getUint8(at) & 128) && ((d.getUint8(at) >> 1) & 63) === type
        && (d.getUint8(at + 1) & 7) !== 0, 'invalid hvcC NAL unit header');
      at += size;
    }
  }
  check(at === d.byteLength, 'unrecognized hvcC trailing data');
  const mdcv = one(entry, 'mdcv', false), clli = one(entry, 'clli', false);
  if (mdcv) check(body(mdcv, 24).byteLength === 24, 'invalid mdcv color metadata');
  if (clli) check(body(clli, 4).byteLength === 4, 'invalid clli color metadata');
  const fiel = one(entry, 'fiel', false);
  let interlaced = false;
  if (fiel) {
    const field = body(fiel, 2);
    check(field.byteLength === 2 && [1, 2].includes(field.getUint8(0)), 'invalid fiel field metadata');
    interlaced = field.getUint8(0) === 2;
  }
  return {profile: d.getUint8(1) & 31, bitDepthLuma: 8 + (d.getUint8(17) & 7),
    bitDepthChroma: 8 + (d.getUint8(18) & 7), interlaced,
    hdrOrWideGamut: checkVideoPresentation(entry, {preserveColor: true}) || !!mdcv || !!clli};
}

function checkVideoPresentation(entry, {preserveColor = false} = {}) {
  const pasp = one(entry, 'pasp', false);
  if (pasp) { const p = body(pasp, 8); check(p.getUint32(0) > 0 && p.getUint32(0) === p.getUint32(4), 'unsupported non-square pixel aspect ratio'); }
  const colr = one(entry, 'colr', false);
  if (colr) {
    const c = body(colr, 10); const type = fourcc(colr.bytes, 0);
    check(['nclx', 'nclc'].includes(type), 'unsupported color profile; SDR cannot be established');
    check(c.byteLength >= (type === 'nclx' ? 11 : 10), 'truncated color metadata');
    const hdrOrWideGamut = [9, 10, 11, 12].includes(c.getUint16(4)) || [16, 18].includes(c.getUint16(6));
    check(preserveColor || !hdrOrWideGamut, 'HDR/wide-gamut color is outside the SDR scope');
    return hdrOrWideGamut;
  }
  return false;
}

function checkAac(entry) {
  const esds = one(entry, 'esds'); const d = full(esds, [0], 6); let at = 4;
  function descriptor(end) {
    check(at < end, 'truncated esds descriptor'); const tag = d.getUint8(at++); let size = 0, done = false;
    for (let i = 0; i < 4; i++) { check(at < end, 'truncated esds length'); const b = d.getUint8(at++); size = size * 128 + (b & 127); if (!(b & 128)) { done = true; break; } }
    check(done && at + size <= end, 'invalid esds descriptor size'); return { tag, end: at + size };
  }
  const es = descriptor(d.byteLength); check(es.tag === 3 && at + 3 <= es.end, 'missing AAC ES descriptor');
  at += 2; const flags = d.getUint8(at++);
  if (flags & 0x80) at += 2;
  if (flags & 0x40) { check(at < es.end, 'truncated esds URL'); at += 1 + d.getUint8(at); }
  if (flags & 0x20) at += 2;
  const config = descriptor(es.end);
  check(config.tag === 4 && at + 13 <= config.end && d.getUint8(at) === 0x40, 'mp4a codec is not supported MPEG-4 AAC');
  at += 13; const asc = descriptor(config.end);
  check(asc.tag === 5 && at + 2 <= asc.end, 'missing AAC AudioSpecificConfig');
  check([2, 5, 29].includes(d.getUint8(at) >>> 3), 'unsupported AAC audio object type');
}

function projection(entry) {
  const result = { stereoMode: null, projection: null, bounds: null, pose: null };
  const st3d = one(entry, 'st3d', false);
  if (st3d) { const d = full(st3d, [0], 5, true); const mode = d.getUint8(4); check(mode <= 2, 'unsupported stereo mode/eye order'); result.stereoMode = mode; }
  const sv3d = one(entry, 'sv3d', false); if (!sv3d) return result;
  const svhd = one(sv3d, 'svhd'); const header = full(svhd, [0], 5, true);
  check(header.getUint8(header.byteLength - 1) === 0, 'svhd source is not null terminated');
  const proj = one(sv3d, 'proj'), prhd = one(proj, 'prhd'); const pose = full(prhd, [0], 16, true);
  result.pose = [4, 8, 12].map(i => pose.getInt32(i) / 65536);
  check(Math.abs(result.pose[0]) <= 180 && Math.abs(result.pose[1]) <= 90 && Math.abs(result.pose[2]) <= 180, 'invalid projection pose');
  const equi = one(proj, 'equi', false), mesh = one(proj, 'mshp', false);
  check(Boolean(equi) !== Boolean(mesh), 'missing or conflicting projection metadata');
  if (mesh) { full(mesh, [0], 12, true); result.projection = 'mesh'; return result; }
  const d = full(equi, [0], 20, true);
  result.projection = 'equi'; result.bounds = { top: d.getUint32(4), bottom: d.getUint32(8), left: d.getUint32(12), right: d.getUint32(16) };
  const b = result.bounds; check(b.top + b.bottom < 0xffffffff && b.left + b.right < 0xffffffff, 'invalid equirectangular bounds');
  return result;
}

function legacyProjection(node) {
  const xml = dec.decode(node.bytes.subarray(16));
  check(!/<!DOCTYPE|<!ENTITY/i.test(xml), 'unsupported legacy spherical XML entities');
  function value(name) {
    const pattern = new RegExp(`<(?:(?:[\\w.-]+):)?${name}\\b[^>]*>\\s*([^<]*?)\\s*</(?:(?:[\\w.-]+):)?${name}\\s*>`, 'g');
    const matches = [...xml.matchAll(pattern)]; check(matches.length <= 1, 'duplicate legacy spherical metadata field'); return matches[0]?.[1] ?? null;
  }
  check(value('ProjectionType') === 'equirectangular', 'unsupported legacy spherical projection');
  const layout = value('StereoMode'); const mode = { mono: 0, 'top-bottom': 1, 'left-right': 2 }[layout];
  check(mode !== undefined, 'unsupported or missing legacy stereo metadata');
  const names = ['FullPanoWidthPixels', 'FullPanoHeightPixels', 'CroppedAreaImageWidthPixels', 'CroppedAreaImageHeightPixels', 'CroppedAreaLeftPixels', 'CroppedAreaTopPixels'];
  const strings = names.map(value); let bounds = { top: 0, bottom: 0, left: 0, right: 0 };
  if (strings.some(x => x !== null)) {
    check(strings.every(x => x !== null && /^\d+$/.test(x)), 'incomplete legacy crop metadata');
    const [w, h, cw, ch, left, top] = strings.map(Number);
    check([w, h, cw, ch, left, top].every(Number.isSafeInteger) && w > 0 && h > 0 && cw > 0 && ch > 0 && left + cw <= w && top + ch <= h, 'invalid legacy crop bounds');
    const scale = 4294967296;
    bounds = { top: Math.round(top / h * scale), bottom: Math.round((h - top - ch) / h * scale), left: Math.round(left / w * scale), right: Math.round((w - left - cw) / w * scale) };
  }
  const pose = ['PoseHeadingDegrees', 'PosePitchDegrees', 'PoseRollDegrees'].map(name => { const s = value(name); const n = s === null ? 0 : Number(s); check(Number.isFinite(n), 'invalid legacy pose'); return n; });
  return { stereoMode: mode, projection: 'equi', bounds, pose };
}
function sameMetadata(a, b) {
  return a.stereoMode === b.stereoMode && a.projection === b.projection && ['top', 'bottom', 'left', 'right'].every(k => a.bounds?.[k] === b.bounds?.[k]) && a.pose?.every((v, i) => v === b.pose?.[i]);
}

async function checkTables(stbl, mdats, signal, expectedSampleBytes = null) {
  const stsz = one(stbl, 'stsz', false), stz2 = one(stbl, 'stz2', false);
  check(Boolean(stsz) !== Boolean(stz2), 'expected exactly one stsz or stz2 sample size table');
  const sizes = await paged(stsz ?? stz2, [0], 12), constant = stsz ? sizes.head.getUint32(4) : 0;
  const samples = sizes.head.getUint32(8), fieldBits = stz2 ? sizes.head.getUint8(7) : 32;
  if (stz2) {
    check(sizes.head.getUint32(0) === 0 && (sizes.head.getUint32(4) >>> 8) === 0, 'unsupported stz2 flags/reserved fields');
    check([4, 8, 16].includes(fieldBits), 'unsupported stz2 field_size');
  }
  check(samples > 0 && samples <= 10000000, 'sample count limit exceeded or empty video/audio track');
  check(sizes.length === 12 + (constant ? 0 : Math.ceil(samples * fieldBits / 8)), `invalid ${stz2 ? 'stz2' : 'stsz'} size table`);
  if (constant && expectedSampleBytes !== null) check(constant === expectedSampleBytes, 'invalid timecode sample width');
  const co = one(stbl, 'stco', false), co64 = one(stbl, 'co64', false);
  check(Boolean(co) !== Boolean(co64), 'missing or duplicate chunk offset tables');
  const offsets = await exactTable(co ?? co64, co ? 4 : 8);
  check(offsets.count > 0 && offsets.count <= samples, 'empty/excessive chunk offset table');
  const chunks = await exactTable(one(stbl, 'stsc'), 12);
  check(chunks.count > 0 && chunks.count <= offsets.count, 'empty/excessive stsc table');
  let previous = 0;
  for (let i = 0; i < chunks.count; i++) {
    if (!(i % 2048)) await yieldToCancel(signal);
    const d = await chunks.row(i), first = d.getUint32(0), per = d.getUint32(4), description = d.getUint32(8);
    check(first > previous && first <= offsets.count && (i || first === 1) && per > 0 && description === 1, 'unsupported stsc chunk/sample description'); previous = first;
  }
  let sample = 0, entry = 0, chunk = await chunks.row(0), next = chunks.count > 1 ? await chunks.row(1) : null;
  for (let i = 0; i < offsets.count; i++) {
    if (!(i % 2048)) await yieldToCancel(signal);
    if (next && next.getUint32(0) <= i + 1) { chunk = next; entry++; next = entry + 1 < chunks.count ? await chunks.row(entry + 1) : null; }
    const per = chunk.getUint32(4); check(sample + per <= samples, 'chunk sample count exceeds sample size table');
    let length = constant * per;
    if (!constant) {
      for (let at = sample; at < sample + per;) {
        // Keep every read within one table page, including odd nibble starts.
        // The unused low nibble after an odd sample count is never a sample.
        const byteAt = Math.floor(at * fieldBits / 8), bitAt = (at * fieldBits) % 8;
        const count = Math.min(16384, Math.floor((TABLE_PAGE_BYTES * 8 - bitAt) / fieldBits), sample + per - at);
        if (count === 16384) await yieldToCancel(signal);
        const d = await sizes.view(12 + byteAt, Math.ceil((bitAt + count * fieldBits) / 8));
        for (let j = 0; j < count; j++) {
          const offset = bitAt + j * fieldBits, byte = Math.floor(offset / 8);
          const size = fieldBits === 4 ? (d.getUint8(byte) >>> (offset % 8 === 0 ? 4 : 0)) & 15
            : fieldBits === 8 ? d.getUint8(byte) : fieldBits === 16 ? d.getUint16(byte) : d.getUint32(byte);
          if (expectedSampleBytes !== null) check(size === expectedSampleBytes, 'invalid timecode sample width');
          length += size;
        }
        at += count;
      }
    }
    const d = await offsets.row(i), offset = co ? d.getUint32(0) : integer64(d, 0);
    check(Number.isSafeInteger(offset + length) && mdats.some(m => offset >= m.payload && offset + length <= m.end), 'sample chunk offset/length lies outside mdat');
    sample += per;
  }
  check(sample === samples, 'chunk sample count does not match sample size table');
  let decodeRuns, compositionRuns = null, leastOffset = Infinity, greatestOffset = -Infinity;
  for (const type of ['stts', 'ctts']) {
    const node = one(stbl, type, type === 'stts'); if (!node) continue;
    const table = await exactTable(node, 8, type === 'ctts' ? [0, 1] : [0]); let count = 0;
    check(table.count <= samples, `${type} excessive run count`);
    for (let i = 0; i < table.count; i++) {
      if (!(i % 2048)) await yieldToCancel(signal);
      const d = await table.row(i), n = d.getUint32(0); check(n > 0, `invalid ${type} sample run`); count += n;
      if (type === 'stts') check(d.getUint32(4) > 0, 'zero-duration samples are unsupported');
      else { const offset = table.version ? d.getInt32(4) : d.getUint32(4); leastOffset = Math.min(leastOffset, offset); greatestOffset = Math.max(greatestOffset, offset); }
    }
    check(count === samples, `${type} timing count does not match samples`);
    if (type === 'stts') decodeRuns = table; else compositionRuns = table;
  }
  const sync = one(stbl, 'stss', false);
  if (sync) {
    const t = await exactTable(sync, 4); check(t.count <= samples, 'excessive stss sync samples'); let prev = 0;
    for (let i = 0; i < t.count; i++) {
      if (!(i % 2048)) await yieldToCancel(signal);
      const n = (await t.row(i)).getUint32(0); check(n > prev && n <= samples, 'invalid stss sync samples'); prev = n;
    }
  }
  const dependency = one(stbl, 'sdtp', false);
  if (dependency) { const p = await paged(dependency); check(p.length === samples + 4, 'invalid sdtp sample count'); }
  const groups = one(stbl, 'sgpd', false), mapping = one(stbl, 'sbgp', false); let descriptionCount = 0, groupingType = null;
  if (groups) {
    const p = await paged(groups, [0, 1, 2], 12); groupingType = fourcc(new Uint8Array(p.head.buffer), 4);
    check(['roll', 'prol'].includes(groupingType), `unsupported ${groupingType} sample group`);
    let at = p.version === 2 ? 16 : p.version === 1 ? 12 : 8;
    const defaultLength = p.version ? p.head.getUint32(8) : 2; descriptionCount = (await p.view(at, 4)).getUint32(0); at += 4;
    check(descriptionCount <= 10000000, 'sample group description count limit exceeded');
    for (let i = 0; i < descriptionCount; i++) {
      if (!(i % 2048)) await yieldToCancel(signal);
      let length = defaultLength;
      if (!length) { length = (await p.view(at, 4)).getUint32(0); at += 4; }
      check(length === 2 && at + length <= p.length, 'unsupported roll sample group description'); at += length;
    }
    check(at === p.length, 'sample group description size mismatch');
  }
  if (mapping) {
    const p = await paged(mapping, [0, 1], 12), type = fourcc(new Uint8Array(p.head.buffer), 4);
    check(type === groupingType, 'unknown sample group mapping'); const at = p.version ? 12 : 8;
    const count = (await p.view(at, 4)).getUint32(0);
    check(count <= 10000000 && at + 4 + count * 8 === p.length, 'sample group map size/count mismatch'); let mapped = 0;
    for (let i = 0; i < count; i++) {
      if (!(i % 2048)) await yieldToCancel(signal);
      const d = await p.view(at + 4 + i * 8, 8); mapped += d.getUint32(0); check(d.getUint32(4) <= descriptionCount, 'unsupported sample group index');
    }
    check(mapped === samples, 'sample group count mismatch');
  }
  // Merge timing runs without retaining a per-sample timeline.
  let di = 0, ci = 0, remainingD = 0, remainingC = 0, consumed = 0, dts = 0, minPts = Infinity, maxEnd = -Infinity, loops = 0;
  let duration = 0, offset = 0;
  while (consumed < samples) {
    if (!(loops++ % 2048)) await yieldToCancel(signal);
    if (!remainingD) { const d = await decodeRuns.row(di); remainingD = d.getUint32(0); duration = d.getUint32(4); }
    if (!remainingC) {
      if (compositionRuns) { const d = await compositionRuns.row(ci); remainingC = d.getUint32(0); offset = compositionRuns.version ? d.getInt32(4) : d.getUint32(4); }
      else remainingC = samples;
    }
    const count = Math.min(remainingD, remainingC);
    minPts = Math.min(minPts, dts + offset); maxEnd = Math.max(maxEnd, dts + count * duration + offset);
    dts += count * duration; consumed += count; remainingD -= count; remainingC -= count;
    if (!remainingD) di++; if (!remainingC) ci++;
  }
  check(Number.isSafeInteger(dts) && Number.isSafeInteger(minPts) && Number.isSafeInteger(maxEnd), 'timing exceeds safe integer range');
  // Admit only the exact v0 summary already emitted by the pinned muxer with
  // signed composition offsets. Do not interpret cslg as an additional timeline
  // shift: every field must agree with the complete stts/ctts scan above.
  // Unsigned-ctts/other QuickTime conventions require their own timeline rules.
  const cslg = one(stbl, 'cslg', false);
  if (cslg) {
    const d = full(cslg, [0], 24, true);
    check(d.byteLength === 24, 'invalid cslg payload size');
    check(compositionRuns?.version === 1, 'cslg input requires signed ctts version 1');
    const expected = [Math.max(-leastOffset, 0), leastOffset, greatestOffset, minPts, maxEnd];
    for (let i = 0; i < expected.length; i++) check(expected[i] >= -2147483648 && expected[i] <= 2147483647
      && d.getInt32(4 + i * 4) === expected[i], 'cslg summary disagrees with complete timing tables');
  }
  return { minPts, maxEnd, samples };
}

function audioMovieEndpointFits(timeline, mediaTime, mediaTimescale) {
  // Pinned Mediabunny 1.61.5 uses 57600 movie ticks and rounds span/offset separately.
  // Exact Math.round for rational values: negative half-ties go toward positive infinity.
  const roundRatio = (n, d) => n / d + (n % d >= 0n
    ? (2n * (n % d) >= d ? 1n : 0n)
    : (2n * -(n % d) > d ? -1n : 0n));
  const scale = 57600n, rate = BigInt(mediaTimescale);
  const first = BigInt(timeline.minPts) - BigInt(mediaTime);
  const end = BigInt(timeline.maxEnd) - BigInt(mediaTime);
  if (first > 0n || end <= 0n || end * scale % rate !== 0n) return false;
  const span = roundRatio((end - first) * scale, rate), offset = roundRatio(first * scale, rate);
  if (span + offset !== end * scale / rate) return false;
  // Also reject unusually large/pathological values where the actual Number rounding differs.
  const numericSpan = Math.round((timeline.maxEnd - timeline.minPts) / mediaTimescale * 57600);
  const numericOffset = Math.round((timeline.minPts - mediaTime) / mediaTimescale * 57600);
  return Number.isSafeInteger(numericSpan) && Number.isSafeInteger(numericOffset)
    && BigInt(numericSpan) === span && BigInt(numericOffset) === offset;
}

async function checkEdits(track, issues, timeline, movieTimescale, mediaTimescale, kind) {
  const edts = one(track, 'edts', false);
  if (!edts) {
    if (kind === 'soun' && (timeline.minPts !== 0 || !audioMovieEndpointFits(timeline, 0, mediaTimescale))) {
      issues.add('AAC start/end cannot be preserved exactly on the pinned MP4 movie time grid.');
    }
    return;
  }
  const elst = one(edts, 'elst'), p = await paged(elst, [0, 1], 8); const version = p.version, count = p.head.getUint32(4), stride = version ? 20 : 12;
  check(p.length === 8 + count * stride && count > 0 && count <= 10000000, 'invalid elst edit list');
  if (count !== 1) issues.add('Complex edit list requires an independently verified timeline conversion.');
  for (let i = 0; i < count; i++) {
    if (!(i % 2048)) await yieldToCancel(elst.signal);
    const d = await p.view(8 + i * stride, stride), at = 0;
    const duration = version ? integer64(d, at) : d.getUint32(at);
    const time = version ? integer64(d, at + 8, true) : d.getInt32(at + 4);
    const rate = d.getInt32(at + (version ? 16 : 8));
    if (time < 0) issues.add('Empty/dwell edit list is not supported for transcoding.');
    if (rate !== 65536) issues.add('Non-1.0 edit rate is not supported for transcoding.');
    if (count === 1 && time >= 0 && rate === 65536) {
      if (BigInt(duration) * BigInt(mediaTimescale) !== BigInt(timeline.maxEnd - time) * BigInt(movieTimescale)) {
        issues.add('Edit-list end trim/extension is not preserved by the current transcode timeline.');
      }
      if (kind === 'soun') {
        if (!audioMovieEndpointFits(timeline, time, mediaTimescale)) {
          issues.add('AAC edit endpoint or span/offset rounding cannot be preserved exactly on the pinned MP4 movie time grid.');
        }
      } else if (time !== timeline.minPts) {
        issues.add('Leading video edit trim requires independently verified presentation boundaries.');
      }
    }
  }
}

async function parse(blob, { signal } = {}) {
  abort(signal); check(blob && Number.isSafeInteger(blob.size) && blob.size > 0 && typeof blob.slice === 'function', 'a non-empty Blob is required');
  const context = { count: 0, signal, retainedBytes: 0 }, top = []; let at = 0, budget = 0;
  while (at < blob.size) {
    countBox(context, 0); check(blob.size - at >= 8, 'truncated top-level box header');
    if (!(context.count % 256)) await yieldToCancel(signal);
    const h = await read(blob, at, 8, signal); const d = new DataView(h.buffer); const type = fourcc(h, 4); let size = d.getUint32(0), header = 8;
    const sizeToEOF = size === 0;
    if (sizeToEOF) { check(type === 'mdat', 'only the last top-level mdat may use size=0'); size = blob.size - at; }
    if (size === 1) { check(blob.size - at >= 16, 'truncated extended size'); const ext = await read(blob, at + 8, 8, signal); size = integer64(new DataView(ext.buffer), 0); header = 16; }
    check(size >= header && size <= blob.size - at, `truncated/invalid ${type} box size`);
    check(acceptedTop.has(type), `unsupported ${type} top-level box (fragmented or offset-dependent MP4)`);
    if (type === 'moov' || type === 'uuid') { budget += size; check(Number.isSafeInteger(budget), 'metadata size exceeds safe integer range'); }
    top.push({ type, start: at, end: at + size, header, payload: at + header, sizeToEOF }); at += size;
  }
  check(top.filter(n => n.type === 'ftyp').length === 1, 'expected one MP4 ftyp box');
  const fileType = top.find(n => n.type === 'ftyp'); const typeLength = fileType.end - fileType.payload;
  check(typeLength >= 8 && typeLength <= 1024 && typeLength % 4 === 0, 'unsupported ftyp size');
  const brands = await read(blob, fileType.payload, typeLength, signal);
  const brandNames = [fourcc(brands, 0)]; for (let i = 8; i < brands.length; i += 4) brandNames.push(fourcc(brands, i));
  check(brandNames.some(n => ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'hev1', 'hvc1', 'M4V '].includes(n)), 'unsupported non-MP4 file brand');
  const movies = top.filter(n => n.type === 'moov'); check(movies.length === 1, 'expected one active moov box');
  const mdats = top.filter(n => n.type === 'mdat'); check(mdats.length > 0, 'missing mdat');
  const oldMovie = movies[0], movie = { ...oldMovie, blob, signal, bytes: new Uint8Array(), childStart: oldMovie.payload };
  movie.children = await parseChildren(blob, movie.payload, movie.end, 'moov', context);
  const mvhd = full(one(movie, 'mvhd'), [0, 1], 100);
  check(mvhd.byteLength >= (mvhd.getUint8(0) ? 112 : 100), 'truncated mvhd');
  const movieTimescale = mvhd.getUint32(mvhd.getUint8(0) ? 20 : 12); check(movieTimescale > 0, 'invalid movie timescale');
  const movieMatrix = mvhd.getUint8(0) ? 48 : 36;
  check(IDENTITY_MATRIX.every((n, i) => mvhd.getInt32(movieMatrix + i * 4) === n), 'movie orientation/matrix transform is unsupported');
  const tracks = nodes(movie, 'trak'); check(tracks.length >= 1 && tracks.length <= 16, 'track count limit exceeded (16)');
  let video = null; const audioCodecs = [], auxiliaryTracks = [], issues = new Set(), legacy = [], sampleCounts = { video: 0, audio: 0, total: 0 };
  // The fixed demuxer needs explicit sizes. A small EOF mdat can be normalized
  // in place; a large one needs adjacent free/skip bytes because its live moov
  // cannot be shortened. Copy may reuse a moov that it replaces in full.
  const hasOpenEndedMdat = top.some(n => n.sizeToEOF);
  if (hasOpenEndedMdat) {
    try { planOpenEndedMdatHeaders(top); }
    catch { issues.add('Large size=0 mdat cannot be normalized for pixel conversion without moving media; adjacent free/skip bytes are required.'); }
  }
  const references = await checkTrackReferences(tracks, issues, signal);
  if (mvhd.getInt32(mvhd.getUint8(0) ? 32 : 20) !== 65536) issues.add('Non-1.0 movie playback rate is not supported for transcoding.');
  let hasChapterList = false, hasKeyedMetadata = false, metadataCopyOnly = false;
  visit(movie, n => {
    if (n.legacy) legacy.push(n);
    if (n.type === 'meta') {
      hasKeyedMetadata ||= Boolean(n.keyedMetadata);
      metadataCopyOnly ||= Boolean(n.metadataCopyOnly);
      if (n.metadataCopyOnly) issues.add('Container metadata has unclassified semantics; metadata-only copy preserves it, but pixel conversion cannot preserve it.');
    }
    if (n.type === 'chpl' && !n.trackReference) {
      checkChapterList(n); hasChapterList = true;
      issues.add('Chapter lists are preserved by metadata-only copy; pixel conversion cannot preserve them.');
    }
  });
  for (const t of top.filter(n => n.type === 'uuid')) {
    const parsed = await parseChildren(blob, t.start, t.end, 'moov', context); check(parsed.length === 1 && parsed[0].legacy, 'unsupported top UUID'); legacy.push(parsed[0]);
  }
  for (const track of tracks) {
    const tkhd = full(one(track, 'tkhd'), [0, 1], 84), matrixAt = tkhd.getUint8(0) ? 52 : 40;
    check(tkhd.byteLength >= matrixAt + 44, 'truncated track matrix');
    check(IDENTITY_MATRIX.every((n, i) => tkhd.getInt32(matrixAt + i * 4) === n), 'track rotation/orientation transform is unsupported');
    const mdia = one(track, 'mdia'), hdlr = one(mdia, 'hdlr'); full(hdlr, [0], 12);
    const kind = fourcc(hdlr.bytes, 8); check(['vide', 'soun', 'text', 'tmcd'].includes(kind), `unsupported ${kind} handler/data/camm track`);
    const mdhd = full(one(mdia, 'mdhd'), [0, 1], 24); check(mdhd.byteLength >= (mdhd.getUint8(0) ? 36 : 24), 'truncated mdhd');
    const mediaTimescale = mdhd.getUint32(mdhd.getUint8(0) ? 20 : 12); check(mediaTimescale > 0, 'invalid media timescale');
    const minf = one(mdia, 'minf'), dinf = one(minf, 'dinf'), dref = one(dinf, 'dref'); const ref = full(dref, [0], 8, true);
    check(ref.getUint32(4) === 1 && dref.children.length === 1, 'only one self-contained dref is supported');
    const url = one(dref, 'url '); const u = full(url, [0], 4); check(u.getUint32(0) === 1 && u.byteLength === 4, 'external data reference/dref is unsupported');
    const stbl = one(minf, 'stbl'), stsd = one(stbl, 'stsd'); const sampleDescriptions = full(stsd, [0], 8, true);
    check(sampleDescriptions.getUint32(4) === 1 && stsd.children.length === 1, 'duplicate/multiple sample entries in stsd are unsupported');
    const entry = stsd.children[0], e = body(entry, kind === 'vide' ? 78 : kind === 'soun' ? 28 : 8); check(e.getUint16(6) === 1, 'unsupported sample data reference');
    let timecode = null;
    if (kind !== 'tmcd') {
      const generic = one(minf, 'gmhd', false);
      check(!generic || !one(generic, 'tmcd', false), 'timecode media information on a non-timecode track');
    }
    if (kind === 'vide') {
      check(!video && ['avc1', 'hev1', 'hvc1'].includes(entry.type), 'only one AVC/HEVC video codec track is supported');
      const codecInfo = entry.type === 'avc1' ? (checkAvc(entry), null) : checkHevc(entry);
      if (codecInfo?.hdrOrWideGamut) issues.add('HDR/wide-gamut conversion is outside the SDR scope; metadata-only copy preserves color.');
      if (codecInfo?.interlaced) issues.add('Interlaced conversion requires a deinterlacing step; metadata-only copy preserves fields.');
      const width = e.getUint16(24), height = e.getUint16(26); check(width > 0 && height > 0, 'invalid video dimensions');
      video = { width, height, entry, codecInfo, ...projection(entry) };
    } else if (kind === 'soun') {
      check(entry.type === 'mp4a' && audioCodecs.length === 0, 'only zero/one mp4a AAC audio track is supported'); checkAac(entry); audioCodecs.push(entry.type);
      let hasLegacy = false; visit(track, n => { hasLegacy ||= Boolean(n.legacy); }); check(!hasLegacy, 'spherical metadata on audio track is unsupported');
    } else if (kind === 'text') {
      checkChapterTrack(track, minf, entry, references);
      let hasLegacy = false; visit(track, n => { hasLegacy ||= Boolean(n.legacy); }); check(!hasLegacy, 'spherical metadata on chapter track is unsupported');
      // Keep the entire auxiliary trak byte-for-byte when adding VR metadata.
      track.preserveWhole = true;
      issues.add('Chapter tracks are preserved by metadata-only copy; pixel conversion cannot preserve them.');
    } else {
      timecode = checkTimecodeTrack(minf, entry);
      let hasLegacy = false; visit(track, n => { hasLegacy ||= Boolean(n.legacy); }); check(!hasLegacy, 'spherical metadata on timecode track is unsupported');
      track.preserveWhole = true;
      issues.add('Timecode tracks are preserved by metadata-only copy; pixel conversion cannot preserve their timeline and track IDs.');
    }
    const timeline = await checkTables(stbl, mdats, signal, timecode?.sampleBytes ?? null); await checkEdits(track, issues, timeline, movieTimescale, mediaTimescale, kind);
    if (kind === 'text') auxiliaryTracks.push({trackId: track.trackId, kind: 'chapter', codec: entry.type, samples: timeline.samples});
    else if (kind === 'tmcd') auxiliaryTracks.push({trackId: track.trackId, kind: 'timecode', codec: entry.type, samples: timeline.samples, ...timecode});
    else sampleCounts[kind === 'vide' ? 'video' : 'audio'] = timeline.samples;
    sampleCounts.total += timeline.samples;
  }
  check(video, 'missing AVC/HEVC video track'); check(legacy.length <= 1, 'duplicate legacy spherical metadata');
  if (legacy.length) {
    const old = legacyProjection(legacy[0]);
    if (video.projection) check(sameMetadata(video, old), 'legacy/V2 spherical metadata conflict or disagreement');
    else {
      check(video.stereoMode === null || video.stereoMode === old.stereoMode, 'legacy/V2 stereo conflict'); Object.assign(video, old);
    }
  }
  if (video.projection === 'mesh') issues.add('Mesh projection is outside the b1 pixel-transform scope.');
  if (video.pose?.some(n => n !== 0)) issues.add('Non-zero projection pose requires a verified orientation transform.');
  abort(signal);
  return { blob, top, movie, oldMovie, video, signal, info: { width: video.width, height: video.height, videoCodec: video.entry.type,
    ...(video.codecInfo ? {videoCodecDetails: video.codecInfo} : {}), audioCodecs, auxiliaryTracks, stereoMode: video.stereoMode, projection: video.projection, bounds: video.bounds, pose: video.pose, transcodeSafe: issues.size === 0, transcodeIssues: [...issues], sampleCounts, hasTrackReferences: references.hasTrackReferences, trackReferenceCount: references.referenceCount, hasChapterList, hasKeyedMetadata, metadataCopyOnly, hasOpenEndedMdat, containerMetadataBytes: budget } };
}

/** Scan all structural tables with bounded reads. Does not decode samples or certify headset compatibility. */
export async function inspectMp4(blob, options = {}) { return (await parse(blob, options)).info; }

/** Plan metadata-only writes. The source needs readable container ranges, not sample payloads. */
export async function planMp4Tag(blob, { layout, signal } = {}) {
  check(layout === 'sbs' || layout === 'tb', 'layout must be sbs or tb');
  const parsed = await parse(blob, { signal }); const { video, movie, top } = parsed; const mode = layout === 'sbs' ? 2 : 1;
  check(video.projection !== 'mesh', 'mesh projection cannot be relabeled equirectangular');
  check(!video.pose?.some(n => n !== 0), 'non-zero projection pose/orientation cannot be overwritten');
  check(video.stereoMode === null || video.stereoMode === mode, 'existing stereo layout conflicts with requested layout');
  check(!video.bounds || Object.keys(HALF_SPHERE).every(k => video.bounds[k] === HALF_SPHERE[k]), 'existing crop bounds are not 180x180; pixel transformation is required');
  check(layout === 'sbs' ? video.width === video.height * 2 : video.height === video.width * 2, '180-degree stereo dimensions require square per-eye images');
  const stereo = fullBox('st3d', Uint8Array.of(mode));
  const spherical = box('sv3d', fullBox('svhd', enc.encode('Kushyameln Works VR180 b1\0')),
    box('proj', fullBox('prhd', u32(0), u32(0), u32(0)), fullBox('equi', ...Object.values(HALF_SPHERE).map(u32))));
  let rewrittenNodes = 0;
  async function rewrite(node) {
    if (!(rewrittenNodes++ % 256)) await yieldToCancel(signal);
    abort(signal);
    if (node.legacy) return null;
    if (!node.children || node.type === 'tref' || node.preserveWhole) return blob.slice(node.start, node.end);
    let children = node.children;
    if (node === video.entry) children = children.filter(n => n.type !== 'st3d' && n.type !== 'sv3d');
    const parts = [blob.slice(node.payload, node.childStart)];
    for (const child of children) { const value = await rewrite(child); if (value) parts.push(value); if (node === video.entry && child.type === (video.entry.type === 'avc1' ? 'avcC' : 'hvcC')) parts.push(stereo, spherical); }
    const contentBytes = parts.reduce((n, p) => n + (p.size ?? p.byteLength), 0);
    const header = contentBytes + 8 > 0xffffffff ? 16 : 8, size = contentBytes + header;
    check(Number.isSafeInteger(size), 'rewritten box size exceeds safe integer range');
    const h = new Uint8Array(header), d = new DataView(h.buffer);
    d.setUint32(0, header === 16 ? 1 : size); h.set(enc.encode(node.type), 4);
    if (header === 16) d.setBigUint64(8, BigInt(size));
    return new Blob([h, ...parts]);
  }
  const replacement = await rewrite(movie); abort(signal);
  const patches = top.filter(n => n.type === 'moov' || n.type === 'uuid')
    .map(node => ({position: node.start + 4, data: enc.encode('free')}));
  patches.push(...planOpenEndedMdatHeaders(top, {releaseMovie: true}));
  patches.sort((a, b) => a.position - b.position);
  for (let i = 0; i < patches.length; i++) check(patches[i].position >= (i ? patches[i - 1].position + patches[i - 1].data.byteLength : 0)
    && patches[i].position + patches[i].data.byteLength <= blob.size, 'overlapping or out-of-range metadata patches');
  check(Number.isSafeInteger(blob.size + replacement.size), 'tagged output exceeds safe integer range');
  return {patches, append: replacement, appendAt: blob.size, outputBytes: blob.size + replacement.size};
}

/** Tag an already cropped 180x180-per-eye stereo sample stream, retaining every sample and timestamp. */
export async function tagMp4(blob, options = {}) {
  const plan = await planMp4Tag(blob, options);
  // Replaced movies become free. EOF mdat headers are made explicit while all
  // sample payload positions remain unchanged (the header may grow backwards).
  const pieces = []; let cursor = 0;
  for (const patch of plan.patches) {
    pieces.push(blob.slice(cursor, patch.position), patch.data); cursor = patch.position + patch.data.byteLength;
  }
  pieces.push(blob.slice(cursor), plan.append); abort(options.signal);
  return new Blob(pieces, { type: 'video/mp4' });
}
