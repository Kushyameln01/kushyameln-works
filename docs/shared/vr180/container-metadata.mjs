// Descriptive container metadata only (meta and udta/cprt or udta/name).
// No timed, geometry, track-reference,
// offset-bearing or unknown metadata is admitted to a new pixel route here.
export const CONTAINER_METADATA_LIMIT = 16 * 1024 * 1024;
// Container headers are emitted as Blob pieces, outside the retained payload budget.
export const CONTAINER_METADATA_MAX_CONTAINER_BYTES = CONTAINER_METADATA_LIMIT + 16 * 20000;
const text = new TextDecoder('utf-8', {fatal: true});
const keyNames = new Set(['title', 'artist', 'album', 'comment', 'description', 'copyright', 'author', 'genre', 'encoder',
  'com.apple.quicktime.title', 'com.apple.quicktime.artist', 'com.apple.quicktime.album',
  'com.apple.quicktime.comment', 'com.apple.quicktime.description', 'com.apple.quicktime.copyright',
  'com.apple.quicktime.author', 'com.apple.quicktime.displayname', 'com.apple.quicktime.genre',
  'com.apple.quicktime.keywords', 'com.apple.quicktime.creationdate', 'com.apple.quicktime.make',
  'com.apple.quicktime.model', 'com.apple.quicktime.software', 'com.apple.quicktime.location.ISO6709']);
const itemNames = new Set(['©nam', '©ART', 'aART', '©alb', '©day', '©too', '©cmt', 'cprt', 'desc', 'ldes', 'keyw', '©gen', 'gnre', 'covr', 'trkn', 'disk']);
const dataTypes = new Set([0, 1, 2, 13, 14, 21, 22, 23, 24]);
const fourcc = (b, p) => String.fromCharCode(...b.subarray(p, p + 4));
const view = b => new DataView(b.buffer, b.byteOffset, b.byteLength);
const fail = message => { throw Error('CONTAINER_METADATA: ' + message); };
const abort = signal => { if (signal?.aborted) throw new DOMException('Metadata transfer canceled.', 'AbortError'); };
function inline(bytes, start = 0, end = bytes.length) {
  const result = [], d = view(bytes);
  while (start < end) {
    if (result.length >= 20000 || end - start < 8) fail('invalid box count/header');
    let size = d.getUint32(start), header = 8;
    if (size === 1) { if (end - start < 16) fail('short extended box'); const n = d.getBigUint64(start + 8); if (n > BigInt(Number.MAX_SAFE_INTEGER)) fail('unsafe box size'); size = Number(n); header = 16; }
    if (size < header || size > end - start) fail('invalid box size');
    result.push({type: fourcc(bytes, start + 4), start, payload: start + header, end: start + size}); start += size;
  }
  return result;
}
/** Safe means descriptive values survive pixel re-encoding without updates.
 * It does not assert that arbitrary text is truthful or that unknown bytes are safe.
 */
export function classifyMetadata({handler, keys = null, items = null}) {
  try {
    if (!['mdta', 'mdir'].includes(handler)) return {safe: false, reason: 'unrecognized handler'};
    let names = null;
    if (handler === 'mdta') {
      if (!keys || keys.length < 8 || view(keys).getUint32(0) !== 0) fail('invalid keys');
      names = inline(keys, 8); if (view(keys).getUint32(4) !== names.length) fail('keys count mismatch');
      for (const key of names) if (key.type !== 'mdta' || !keyNames.has(text.decode(keys.subarray(key.payload, key.end)))) return {safe: false, reason: 'unclassified key semantics'};
    } else if (keys) return {safe: false, reason: 'unexpected keys'};
    for (const item of inline(items ?? new Uint8Array())) {
      if (names ? (view(items).getUint32(item.start + 4) < 1 || view(items).getUint32(item.start + 4) > names.length) : !itemNames.has(item.type)) return {safe: false, reason: 'unclassified item semantics'};
      const values = inline(items, item.payload, item.end);
      if (!values.length || values.some(v => v.type !== 'data' || v.end - v.payload < 8 || !dataTypes.has(view(items).getUint32(v.payload)))) return {safe: false, reason: 'unclassified value representation'};
    }
    return {safe: true, reason: null};
  } catch { return {safe: false, reason: 'unclassified metadata structure'}; }
}
function classifyRaw(bytes) {
  const meta = inline(bytes)[0]; if (meta?.type !== 'meta' || meta.end !== bytes.length) fail('expected one meta');
  const prefix = view(bytes).getUint32(meta.payload) === 0 ? 4 : 0;
  const nodes = inline(bytes, meta.payload + prefix, meta.end);
  const get = type => { const found = nodes.filter(n => n.type === type); if (found.length > 1) fail('duplicate metadata field'); return found[0]; };
  const handler = get('hdlr'), keys = get('keys'), items = get('ilst');
  const kind = handler && handler.end - handler.payload >= 12 ? fourcc(bytes, handler.payload + 8) : null;
  return {prefix, handler: kind, keyed: Boolean(keys), ...classifyMetadata({handler: kind,
    keys: keys ? bytes.subarray(keys.payload, keys.end) : null, items: items ? bytes.subarray(items.payload, items.end) : null})};
}
async function read(source, at, n, signal) {
  abort(signal); if (!Number.isSafeInteger(at + n) || at < 0 || n < 0 || at + n > source.size) fail('read bounds');
  const result = new Uint8Array(await source.slice(at, at + n).arrayBuffer()); abort(signal);
  if (result.length !== n) fail('incomplete read'); return result;
}
async function boxes(source, start, end, state, depth = 0) {
  if (depth > 16) fail('nesting limit'); const result = [];
  while (start < end) {
    if (++state.boxes > 20000 || end - start < 8) fail('box count/header limit');
    const b = await read(source, start, 8, state.signal), d = view(b), type = fourcc(b, 4); let size = d.getUint32(0), header = 8;
    if (size === 1) { if (end - start < 16) fail('short extended box'); const n = view(await read(source, start + 8, 8, state.signal)).getBigUint64(0); if (n > BigInt(Number.MAX_SAFE_INTEGER)) fail('unsafe box size'); size = Number(n); header = 16; }
    if (!size && depth === 0 && type === 'mdat') size = end - start;
    if (size < header || size > end - start) fail('invalid box size');
    result.push({type, start, payload: start + header, end: start + size}); start += size;
  }
  return result;
}
const makeBox = (type, parts) => {
  const length = 8 + parts.reduce((n, p) => n + p.size, 0); if (!Number.isSafeInteger(length) || length > 0xffffffff) fail('container size limit');
  const h = new Uint8Array(8); view(h).setUint32(0, length); for (let i = 0; i < 4; i++) h[4 + i] = type.charCodeAt(i);
  return new Blob([h, ...parts]);
};
async function handlerOf(source, track, state, fields = null) {
  fields ??= await boxes(source, track.payload, track.end, state, 1);
  const mdia = fields.find(n => n.type === 'mdia');
  if (!mdia) fail('missing track media');
  const h = (await boxes(source, mdia.payload, mdia.end, state, 2)).find(n => n.type === 'hdlr');
  if (!h || h.end - h.payload < 12) fail('missing track handler');
  return fourcc(await read(source, h.payload, 12, state.signal), 8);
}
/** Requires the caller's successful inspectMp4 admission. Retains Blob slices,
 * not whole media or JS copies of metadata; one <=16 MiB metadata parse at a time.
 * Reports omission counts only; values and names never enter the receipt.
 */
export async function collectContainerMetadata(source, {signal} = {}) {
  const state = {signal, boxes: 0}, scopes = {movie: [], vide: [], soun: []};
  const report = {retainedContainers: 0, retainedBytes: 0, omittedContainers: 0, omissionReasons: [], scopeCounts: {movie: 0, vide: 0, soun: 0}, peakMetadataParseBytes: 0};
  let checkedBytes = 0;
  async function collect(parent, depth, scope, children = null) {
    const result = [];
    for (const node of children ?? await boxes(source, parent.payload, parent.end, state, depth)) {
      if (node.type === 'meta') {
        const size = node.end - node.start;
        if (checkedBytes + size > CONTAINER_METADATA_LIMIT) {
          // Legacy ISO udta/mdir was already admitted even when its opaque free
          // padding was huge. Keep that admission and disclose its omission,
          // without allocating or reading the oversized payload.
          const legacyPrefix = parent.type === 'udta' && node.end - node.payload >= 4
            && view(await read(source, node.payload, 4, signal)).getUint32(0) === 0;
          const fields = legacyPrefix ? await boxes(source, node.payload + 4, node.end, state, depth + 1) : [];
          const h = fields.find(n => n.type === 'hdlr');
          const kind = h && h.end - h.payload >= 12 ? fourcc(await read(source, h.payload, 12, signal), 8) : null;
          if (!legacyPrefix || kind === 'mdta' || fields.some(n => n.type === 'keys')) fail('metadata transfer budget');
          report.omittedContainers++;
          if (!report.omissionReasons.includes('metadata transfer budget')) report.omissionReasons.push('metadata transfer budget');
          continue;
        }
        checkedBytes += size;
        report.peakMetadataParseBytes = Math.max(report.peakMetadataParseBytes, size);
        const verdict = classifyRaw(await read(source, node.start, size, signal));
        if (verdict.safe) { result.push(source.slice(node.start, node.end)); report.retainedContainers++; report.retainedBytes += size; report.scopeCounts[scope]++; }
        else {
          // New forms have already been rejected by admission. Preserve the
          // legacy ISO udta/mdir acceptance, but never claim its opaque loss as preservation.
          if (parent.type !== 'udta' || verdict.prefix !== 4 || verdict.keyed || verdict.handler === 'mdta') fail('non-descriptive metadata cannot be transferred');
          report.omittedContainers++; if (!report.omissionReasons.includes(verdict.reason)) report.omissionReasons.push(verdict.reason);
        }
      } else if (parent.type === 'udta' && ['cprt', 'name'].includes(node.type)) {
        // These admitted descriptive atoms do not contain media offsets or
        // geometry. Preserve their complete representation, including language
        // codes and duplicate values, without decoding or copying the payload.
        const size = node.end - node.start;
        if (checkedBytes + size > CONTAINER_METADATA_LIMIT) {
          report.omittedContainers++;
          if (!report.omissionReasons.includes('metadata transfer budget')) report.omissionReasons.push('metadata transfer budget');
          continue;
        }
        checkedBytes += size;
        result.push(source.slice(node.start, node.end));
        report.retainedContainers++; report.retainedBytes += size; report.scopeCounts[scope]++;
      } else if (node.type === 'udta') {
        const children = await collect(node, depth + 1, scope); if (children.length) result.push(makeBox('udta', children));
      }
    }
    return result;
  }
  const top = await boxes(source, 0, source.size, state), movies = top.filter(n => n.type === 'moov'); if (movies.length !== 1) fail('one moov required');
  const movie = movies[0], movieChildren = await boxes(source, movie.payload, movie.end, state, 1);
  scopes.movie = await collect(movie, 1, 'movie', movieChildren);
  const seen = new Set();
  for (const track of movieChildren.filter(n => n.type === 'trak')) {
    const trackChildren = await boxes(source, track.payload, track.end, state, 2);
    const kind = await handlerOf(source, track, state, trackChildren); if (!['vide', 'soun'].includes(kind) || seen.has(kind)) fail('unsupported track mapping'); seen.add(kind);
    scopes[kind] = await collect(track, 2, kind, trackChildren);
  }
  const transferBytes = Object.values(scopes).flat().reduce((n, item) => n + item.size, 0);
  if (transferBytes > CONTAINER_METADATA_MAX_CONTAINER_BYTES) fail('metadata transfer container budget');
  report.transferBytes = transferBytes;
  abort(signal); return {scopes, report};
}
/** Merge descriptive scopes into a freshly muxed moov. Sample tables and payload
 * remain Blob ranges; appending the replacement moov does not shift mdat offsets.
 */
export async function transferMetadataToMoov(moov, metadata, {signal} = {}) {
  if (!metadata || !metadata.report.retainedContainers) return moov;
  const state = {signal, boxes: 0}, [movie] = await boxes(moov, 0, moov.size, state);
  if (movie?.type !== 'moov' || movie.end !== moov.size) fail('one output moov required');
  const parts = [], seen = new Set();
  for (const node of await boxes(moov, movie.payload, movie.end, state, 1)) {
    if (node.type !== 'trak') { parts.push(moov.slice(node.start, node.end)); continue; }
    const kind = await handlerOf(moov, node, state);
    if (!['vide', 'soun'].includes(kind) || seen.has(kind)) fail('ambiguous output track mapping'); seen.add(kind);
    parts.push(makeBox('trak', [moov.slice(node.payload, node.end), ...metadata.scopes[kind]]));
  }
  for (const kind of ['vide', 'soun']) if (metadata.scopes[kind].length && !seen.has(kind)) fail('missing output metadata track');
  abort(signal); return makeBox('moov', [...parts, ...metadata.scopes.movie]);
}
export async function transferMetadataToPlan(plan, metadata, options = {}) {
  const append = await transferMetadataToMoov(plan.append, metadata, options);
  return {...plan, append, outputBytes: plan.appendAt + append.size};
}
/** Attach raw bounded containers to the dedicated incremental muxer's tree. */
export function transferMetadataToTree(tree, trackKinds, metadata) {
  if (!metadata?.report.retainedContainers) return;
  if (tree.type !== 'moov') fail('output tree is not moov');
  const tracks = tree.children.filter(n => n?.type === 'trak');
  if (tracks.length !== trackKinds.length || new Set(trackKinds).size !== trackKinds.length) fail('ambiguous indexed track mapping');
  const raw = blob => ({type: 'metadata-raw', vr180Raw: blob});
  tracks.forEach((track, i) => { const kind = trackKinds[i]; if (!['vide', 'soun'].includes(kind)) fail('unknown indexed track mapping'); track.children.push(...metadata.scopes[kind].map(raw)); });
  for (const kind of ['vide', 'soun']) if (metadata.scopes[kind].length && !trackKinds.includes(kind)) fail('missing indexed metadata track');
  tree.children.push(...metadata.scopes.movie.map(raw));
}
/** The ordinary tagger always appends its active moov at EOF. Replace only that
 * final container, so no sample offset changes and no media bytes are re-read.
 */
export async function transferMetadataToTaggedBlob(blob, metadata, {signal} = {}) {
  if (!metadata?.report.retainedContainers) return blob;
  const state = {signal, boxes: 0}, top = await boxes(blob, 0, blob.size, state), movies = top.filter(n => n.type === 'moov');
  if (movies.length !== 1 || movies[0].end !== blob.size) fail('tagged moov must be at EOF');
  const movie = movies[0], replacement = await transferMetadataToMoov(blob.slice(movie.start), metadata, {signal});
  return new Blob([blob.slice(0, movie.start), replacement], {type: 'video/mp4'});
}
