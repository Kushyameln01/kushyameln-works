// AAC is copied without decoding. Sample dependencies belong to that unchanged
// sample sequence, never to the newly encoded video. Requires inspectMp4 admission.
// Derived from the existing 10M-entry limit: 16-byte header + v1 sbgp + rows.
export const AUDIO_DEPENDENCY_MAX_BOX_BYTES = 80000032;
export const AUDIO_DEPENDENCY_PAGE = 64 * 1024;
const RESERVATION = 8 * AUDIO_DEPENDENCY_PAGE;
const TYPES = new Set(['sdtp', 'sgpd', 'sbgp']);
const fail = message => { throw Error('AUDIO_DEPENDENCY: ' + message); };
const check = value => { if (!value) fail('invalid or inconsistent sample metadata'); };
const abort = signal => { if (signal?.aborted) throw new DOMException('AAC dependency transfer canceled.', 'AbortError'); };
const view = b => new DataView(b.buffer, b.byteOffset, b.byteLength);
const fourcc = (b, at) => String.fromCharCode(...b.subarray(at, at + 4));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const states = new WeakMap();

function reader(source, signal) {
  let page = null, pageAt = -1;
  async function read(at, length) {
    abort(signal); check(Number.isSafeInteger(at) && Number.isSafeInteger(length) && at >= 0 && length >= 0
      && length <= AUDIO_DEPENDENCY_PAGE && Number.isSafeInteger(at + length) && at + length <= source.size);
    if (!page || at < pageAt || at + length > pageAt + page.length) {
      pageAt = at;
      // Read only the requested metadata region. Metadata-only output sources
      // intentionally cannot expose neighboring mdat bytes.
      page = new Uint8Array(await source.slice(at, at + length).arrayBuffer()); abort(signal);
      check(page.length === length);
    }
    return page.subarray(at - pageAt, at - pageAt + length);
  }
  return {source, signal, read, clear() { page = null; pageAt = -1; }};
}
async function children(r, start, end, state, top = false) {
  const out = [];
  while (start < end) {
    if (++state.boxes > 20000 || end - start < 8) fail('box/header limit');
    const b = await r.read(start, 8), d = view(b); let size = d.getUint32(0), header = 8;
    const type = fourcc(b, 4);
    if (size === 1) { check(end - start >= 16); const n = view(await r.read(start + 8, 8)).getBigUint64(0);
      check(n <= BigInt(Number.MAX_SAFE_INTEGER)); size = Number(n); header = 16; }
    if (size === 0 && top && type === 'mdat' && end === r.source.size) size = end - start;
    check(size >= header && size <= end - start);
    out.push({type, start, payload: start + header, end: start + size}); start += size;
  }
  return out;
}
function one(nodes, type, required = true) {
  const found = nodes.filter(n => n?.type === type); check(found.length <= 1 && (!required || found.length === 1)); return found[0];
}
async function audioTrack(r) {
  const state = {boxes: 0}, movie = one(await children(r, 0, r.source.size, state, true), 'moov');
  let audio = null;
  for (const track of (await children(r, movie.payload, movie.end, state)).filter(n => n.type === 'trak')) {
    const trackChildren = await children(r, track.payload, track.end, state), mdia = one(trackChildren, 'mdia');
    const mediaChildren = await children(r, mdia.payload, mdia.end, state), hdlr = one(mediaChildren, 'hdlr');
    check(hdlr.end - hdlr.payload >= 12);
    if (fourcc(await r.read(hdlr.payload, 12), 8) !== 'soun') continue;
    if (audio) fail('more than one audio track');
    const minf = one(mediaChildren, 'minf'), stbl = one(await children(r, minf.payload, minf.end, state), 'stbl');
    audio = {movie, track, mdia, minf, stbl, trackChildren, mediaChildren,
      tables: await children(r, stbl.payload, stbl.end, state)};
  }
  return audio;
}
async function paged(r, node, minimum = 4, versions = [0]) {
  check(node && node.end - node.payload >= minimum);
  const head = await r.read(node.payload, minimum), version = head[0];
  check(versions.includes(version)); // Keep the parser's existing admission; preserve reserved bytes.
  let page = null, pageAt = -1;
  return {length: node.end - node.payload, version, head: head.slice(), async at(offset, n) {
    check(offset >= 0 && n >= 0 && offset + n <= node.end - node.payload && n <= AUDIO_DEPENDENCY_PAGE);
    if (!page || offset < pageAt || offset + n > pageAt + page.length) {
      pageAt = offset; page = await r.read(node.payload + offset, Math.min(AUDIO_DEPENDENCY_PAGE, node.end - node.payload - offset));
    }
    return view(page.subarray(offset - pageAt, offset - pageAt + n));
  }};
}
async function descriptions(r, a) {
  const stsd = one(a.tables, 'stsd'); check(stsd.end - stsd.payload >= 8);
  const h = view(await r.read(stsd.payload, 8)); check(h.getUint32(0) === 0 && h.getUint32(4) === 1);
  const entries = await children(r, stsd.payload + 8, stsd.end, {boxes: 0});
  check(entries.length === 1 && entries[0].type === 'mp4a'); const entry = entries[0];
  check(entry.end - entry.payload >= 28);
  const head = view(await r.read(entry.payload, 28)); check(head.getUint16(8) === 0);
  const channels = head.getUint16(16), sampleRate = head.getUint32(24) / 65536;
  const esds = one(await children(r, entry.payload + 28, entry.end, {boxes: 0}), 'esds');
  const hds = await r.read(esds.payload, 4); check(view(hds).getUint32(0) === 0);
  let at = esds.payload + 4;
  async function descriptor(end) {
    check(at < end); const tag = (await r.read(at++, 1))[0]; let size = 0, done = false;
    for (let i = 0; i < 4; i++) { check(at < end); const n = (await r.read(at++, 1))[0]; size = size * 128 + (n & 127); if (!(n & 128)) { done = true; break; } }
    check(done && at + size <= end); return {tag, end: at + size};
  }
  const es = await descriptor(esds.end); check(es.tag === 3 && at + 3 <= es.end); at += 2; const flags = (await r.read(at++, 1))[0];
  if (flags & 128) at += 2;
  if (flags & 64) { check(at < es.end); at += 1 + (await r.read(at, 1))[0]; }
  if (flags & 32) at += 2;
  const config = await descriptor(es.end); check(config.tag === 4 && at + 13 <= config.end && (await r.read(at, 1))[0] === 0x40); at += 13;
  const asc = await descriptor(config.end); check(asc.tag === 5 && asc.end - at >= 2);
  return {channels, sampleRate, description: r.source.slice(at, asc.end)};
}
async function sampleTable(r, a) {
  const mdhd = one(a.mediaChildren, 'mdhd'), mh = await r.read(mdhd.payload, Math.min(32, mdhd.end - mdhd.payload));
  check(mh[0] === 0 || mh[0] === 1); const timescale = view(mh).getUint32(mh[0] ? 20 : 12); check(timescale > 0);
  const stsz = one(a.tables, 'stsz', false), stz2 = one(a.tables, 'stz2', false); check(Boolean(stsz) !== Boolean(stz2));
  const sizes = await paged(r, stsz ?? stz2, 12), sh = view(sizes.head), count = sh.getUint32(8);
  check(count > 0 && count <= 10000000); const fixed = stsz ? sh.getUint32(4) : 0, bits = stz2 ? sizes.head[7] : 32;
  if (stz2) check(sizes.head[4] === 0 && sizes.head[5] === 0 && sizes.head[6] === 0 && [4, 8, 16].includes(bits));
  check(sizes.length === 12 + (fixed ? 0 : Math.ceil(count * bits / 8)));
  async function size(i) { if (fixed) return fixed; const d = await sizes.at(12 + Math.floor(i * bits / 8), bits === 4 ? 1 : bits / 8);
    return bits === 4 ? (i % 2 ? d.getUint8(0) & 15 : d.getUint8(0) >>> 4) : bits === 8 ? d.getUint8(0) : bits === 16 ? d.getUint16(0) : d.getUint32(0); }
  async function runs(type) { const node = one(a.tables, type, false); if (!node) return null;
    const p = await paged(r, node, 8, type === 'ctts' ? [0, 1] : [0]), n = view(p.head).getUint32(4); check(n > 0 && n <= count && p.length === 8 + n * 8);
    return {p, n, index: 0, left: 0, value: 0}; }
  const delta = await runs('stts'), composition = await runs('ctts'); check(delta); let ordinal = 0, dts = 0;
  async function advance(run) {
    if (!run) return 0;
    if (!run.left) { check(run.index < run.n); const d = await run.p.at(8 + 8 * run.index++, 8);
      run.left = d.getUint32(0); run.value = run.p.version ? d.getInt32(4) : d.getUint32(4); check(run.left > 0); }
    run.left--; return run.value;
  }
  return {count, timescale, async next() {
    check(ordinal < count); const duration = await advance(delta), offset = await advance(composition); check(duration > 0);
    const result = {size: await size(ordinal), pts: dts + offset, duration}; dts += duration; ordinal++;
    check(Number.isSafeInteger(dts));
    if (ordinal === count) for (const run of [delta, composition]) if (run) check(run.left === 0 && run.index === run.n);
    return result;
  }};
}
async function validateDependencies(r, a, count) {
  const raw = a.tables.filter(n => TYPES.has(n.type)); check(new Set(raw.map(n => n.type)).size === raw.length);
  const bytes = raw.reduce((n, p) => n + p.end - p.start, 0);
  const dependency = one(raw, 'sdtp', false); if (dependency) check((await paged(r, dependency)).length === count + 4);
  const group = one(raw, 'sgpd', false), mapping = one(raw, 'sbgp', false); let groupType = null, descriptions = 0;
  if (group) {
    const p = await paged(r, group, 12, [0, 1, 2]); groupType = fourcc(p.head, 4); check(['roll', 'prol'].includes(groupType));
    let at = p.version === 2 ? 16 : p.version === 1 ? 12 : 8;
    const length = p.version ? view(p.head).getUint32(8) : 2;
    descriptions = (await p.at(at, 4)).getUint32(0); at += 4; check(descriptions <= 10000000);
    // v2 default_sample_description_index stays byte-for-byte; this helper
    // does not introduce a stricter admission policy than inspectMp4.
    for (let i = 0; i < descriptions; i++) {
      if (!(i % 2048)) { await tick(); abort(r.signal); }
      let n = length; if (!n) { n = (await p.at(at, 4)).getUint32(0); at += 4; }
      check(n === 2 && at + n <= p.length); at += n;
    }
    check(at === p.length);
  }
  if (mapping) {
    const p = await paged(r, mapping, 12, [0, 1]); check(fourcc(p.head, 4) === groupType);
    const at = p.version ? 12 : 8, n = (await p.at(at, 4)).getUint32(0); check(n <= 10000000 && p.length === at + 4 + n * 8);
    let total = 0;
    for (let i = 0; i < n; i++) { if (!(i % 2048)) { await tick(); abort(r.signal); }
      const d = await p.at(at + 4 + i * 8, 8); total += d.getUint32(0); check(d.getUint32(4) <= descriptions && total <= count); }
    check(total === count);
  }
  return {raw, bytes};
}
function get(deps) { const s = states.get(deps); if (!s || s.disposed) fail('dependency state unavailable'); abort(s.signal); return s; }
function ticks(seconds, rate) { const n = seconds * rate, rounded = Math.round(n); check(Number.isFinite(seconds)
  && Number.isSafeInteger(rounded) && Math.abs(n - rounded) <= Math.max(1e-7, Math.abs(n) * Number.EPSILON * 8)); return rounded; }
function rescale(value, from, to) { const n = BigInt(value) * BigInt(to); check(n % BigInt(from) === 0n);
  const result = Number(n / BigInt(from)); check(Number.isSafeInteger(result)); return result; }

/** Original table bytes stay Blob slices; a fixed eight-page reservation covers
 * the size/timing cursors and serialized output inspection. No media read/hash. */
export async function collectAudioDependencies(source, {signal, budget} = {}) {
  abort(signal); const release = budget?.reserve(RESERVATION) ?? (() => {}), r = reader(source, signal);
  try {
    const audio = await audioTrack(r);
    if (!audio || !audio.tables.some(n => TYPES.has(n.type))) { r.clear(); release(); return null; }
    const table = await sampleTable(r, audio), configuration = await descriptions(r, audio), raw = await validateDependencies(r, audio, table.count);
    const report = {retainedBoxes: raw.raw.length, retainedBytes: raw.bytes, inputSamples: table.count,
      copiedSamples: 0, outputSamples: 0, packetOrdinalChecked: false, sampleMetadataVerified: false,
      payloadComparison: 'independent-test-only', seekPlaybackVerified: false, reservedBytes: RESERVATION};
    const deps = {report, dispose() { const s = states.get(deps); if (s && !s.disposed) { s.disposed = true; s.cursor = null; r.clear(); release(); } }};
    states.set(deps, {signal, reader: r, audio, configuration, count: table.count,
      raw: raw.raw.map(n => source.slice(n.start, n.end)), cursor: table, disposed: false, started: false, finished: false});
    return deps;
  } catch (error) { r.clear(); release(); throw error; }
}
/** Wrap only the source passed to createAacPacketCopier. Its existing contiguous
 * timing/movie-end checks remain authoritative. No packet object/data mutation. */
export function createAudioDependencyPassthrough(deps, source, decoderConfig) {
  if (!deps) return {add: (...args) => source.add(...args), finish() {}};
  const s = get(deps); check(!s.started); s.started = true;
  const description = decoderConfig?.description;
  const bytes = description instanceof ArrayBuffer ? new Uint8Array(description)
    : ArrayBuffer.isView(description) ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength) : null;
  check(bytes && bytes.byteLength === s.configuration.description.size);
  check(typeof decoderConfig.codec === 'string' && decoderConfig.codec.startsWith('mp4a.')
    && Number.isSafeInteger(decoderConfig.sampleRate) && decoderConfig.sampleRate > 0
    && Number.isSafeInteger(decoderConfig.numberOfChannels) && decoderConfig.numberOfChannels > 0);
  s.config = {sampleRate: decoderConfig.sampleRate, channels: decoderConfig.numberOfChannels, description: bytes};
  let count = 0, firstPts = null, firstTicks = null, endTicks = null, inFlight = false, failed = false;
  return {async add(packet, metadata) {
    get(deps); check(!inFlight && !failed && !s.finished && count < s.count); inFlight = true;
    try {
      check(packet.sequenceNumber === count);
      const sample = await s.cursor.next(), start = ticks(packet.timestamp, s.config.sampleRate), duration = ticks(packet.duration, s.config.sampleRate);
      firstPts ??= sample.pts; firstTicks ??= start;
      check(sample.size === packet.byteLength && duration === rescale(sample.duration, s.cursor.timescale, s.config.sampleRate)
        && start - firstTicks === rescale(sample.pts - firstPts, s.cursor.timescale, s.config.sampleRate)
        && (endTicks === null || start === endTicks));
      if (!count) { check(metadata?.decoderConfig === decoderConfig); await compareDescription(s.configuration.description, s.config.description, s.signal); }
      await source.add(packet, metadata); get(deps); endTicks = start + duration; count++; deps.report.copiedSamples = count;
    } catch (error) { failed = true; throw error; } finally { inFlight = false; }
  }, finish(timeline) {
    get(deps); check(!inFlight && !failed && !s.finished && count === s.count && timeline?.packetCount === count
      && timeline.sampleRate === s.config.sampleRate && ticks(timeline.firstTimestamp, s.config.sampleRate) === firstTicks
      && ticks(timeline.lastEndTimestamp, s.config.sampleRate) === endTicks);
    s.finished = true; s.firstTicks = firstTicks; s.endTicks = endTicks; s.cursor = null; s.reader.clear(); deps.report.packetOrdinalChecked = true;
  }};
}
async function compareDescription(blob, bytes, signal) {
  check(blob.size === bytes.length);
  for (let at = 0; at < blob.size; at += AUDIO_DEPENDENCY_PAGE) { abort(signal);
    const part = new Uint8Array(await blob.slice(at, at + AUDIO_DEPENDENCY_PAGE).arrayBuffer()); abort(signal);
    check(equal(part, bytes.subarray(at, at + part.length)));
  }
}
async function firstOutputTick(r, a, timescale, rate, endTicks) {
  const edts = one(a.trackChildren, 'edts', false); if (!edts) return 0;
  const elst = one(await children(r, edts.payload, edts.end, {boxes: 0}), 'elst'), p = await paged(r, elst, 8, [0, 1]);
  check(view(p.head).getUint32(4) === 1 && p.length === (p.version ? 28 : 20));
  const d = await p.at(8, p.length - 8), mediaTime = p.version ? d.getBigInt64(8) : BigInt(d.getInt32(4));
  check(mediaTime >= 0n && mediaTime <= BigInt(Number.MAX_SAFE_INTEGER) && d.getInt16(p.version ? 16 : 8) === 1 && d.getInt16(p.version ? 18 : 10) === 0);
  const duration = p.version ? d.getBigUint64(0) : BigInt(d.getUint32(0));
  const mvhd = one(await children(r, a.movie.payload, a.movie.end, {boxes: 0}), 'mvhd');
  const mh = await r.read(mvhd.payload, Math.min(32, mvhd.end - mvhd.payload)); check(mh[0] === 0 || mh[0] === 1);
  const movieScale = view(mh).getUint32(mh[0] ? 20 : 12); check(movieScale > 0 && duration * BigInt(rate) === BigInt(endTicks) * BigInt(movieScale));
  return -rescale(Number(mediaTime), timescale, rate);
}
/** Checks output AAC sample metadata, not compressed payload bytes. Call before
 * commit (metadata-only sources are sufficient), also after indexed serialization. */
export async function verifyAudioDependencyOutput(source, deps, {signal} = {}) {
  if (!deps) return;
  const s = get(deps); check(s.finished); const r = reader(source, signal ?? s.signal);
  try {
    const a = await audioTrack(r); check(a); const config = await descriptions(r, a);
    check(config.sampleRate === s.config.sampleRate && config.channels === s.config.channels);
    await compareDescription(s.configuration.description, s.config.description, signal ?? s.signal);
    await compareDescription(config.description, s.config.description, signal ?? s.signal);
    const input = await sampleTable(s.reader, s.audio), output = await sampleTable(r, a);
    check(output.count === s.count);
    const editTick = await firstOutputTick(r, a, output.timescale, s.config.sampleRate, s.endTicks);
    let firstIn = null, firstOut = null;
    for (let i = 0; i < s.count; i++) {
      if (!(i % 2048)) { await tick(); abort(signal); get(deps); }
      const x = await input.next(), y = await output.next(); firstIn ??= x.pts; firstOut ??= y.pts;
      if (!i) check(editTick + rescale(firstOut, output.timescale, s.config.sampleRate) === s.firstTicks);
      check(x.size === y.size && rescale(x.duration, input.timescale, s.config.sampleRate) === rescale(y.duration, output.timescale, s.config.sampleRate)
        && rescale(x.pts - firstIn, input.timescale, s.config.sampleRate) === rescale(y.pts - firstOut, output.timescale, s.config.sampleRate));
    }
    abort(signal); get(deps); deps.report.outputSamples = output.count; deps.report.sampleMetadataVerified = true;
  } finally { r.clear(); s.reader.clear(); }
}
function box(type, parts) {
  const size = 8 + parts.reduce((n, p) => n + p.size, 0); check(Number.isSafeInteger(size) && size <= 0xffffffff);
  const h = new Uint8Array(8); view(h).setUint32(0, size); for (let i = 0; i < 4; i++) h[4 + i] = type.charCodeAt(i); return new Blob([h, ...parts]);
}
async function transferMoov(moov, deps, options) {
  if (!deps) return moov; await verifyAudioDependencyOutput(moov, deps, options);
  const s = get(deps), r = reader(moov, options.signal ?? s.signal), a = await audioTrack(r);
  try {
    if (a.tables.some(n => TYPES.has(n.type))) fail('output already has audio dependency boxes');
    let replacement = box('stbl', [moov.slice(a.stbl.payload, a.stbl.end), ...s.raw]);
    for (const [parent, child] of [[a.minf, a.stbl], [a.mdia, a.minf], [a.track, a.mdia], [a.movie, a.track]])
      replacement = box(parent.type, [moov.slice(parent.payload, child.start), replacement, moov.slice(child.end, parent.end)]);
    return replacement;
  } finally { r.clear(); }
}
export async function transferAudioDependenciesToPlan(plan, deps, options = {}) {
  if (!deps) return plan; const append = await transferMoov(plan.append, deps, options); return {...plan, append, outputBytes: plan.appendAt + append.size};
}
export async function transferAudioDependenciesToTaggedBlob(source, deps, options = {}) {
  if (!deps) return source; const s = get(deps), r = reader(source, options.signal ?? s.signal);
  try { const a = await audioTrack(r); check(a && a.movie.end === source.size);
    const moov = await transferMoov(source.slice(a.movie.start), deps, options); return new Blob([source.slice(0, a.movie.start), moov], {type: 'video/mp4'});
  } finally { r.clear(); }
}
/** Count is the dedicated muxer's actual registered audio count. Metadata is
 * verified again from its serialized source before the caller commits output. */
export function transferAudioDependenciesToTree(tree, trackKinds, deps, {audioCount} = {}) {
  if (!deps) return;
  const s = get(deps); check(s.finished && audioCount === s.count && tree.type === 'moov');
  const tracks = tree.children.filter(n => n?.type === 'trak');
  check(tracks.length === trackKinds.length && trackKinds.filter(k => k === 'soun').length === 1);
  let node = tracks[trackKinds.indexOf('soun')]; for (const type of ['mdia', 'minf', 'stbl']) node = one(node.children ?? [], type);
  if (node.children.some(n => n && (TYPES.has(n.type) || n.vr180AudioDependency))) fail('output already has audio dependency boxes');
  node.children.push(...s.raw.map(blob => ({type: 'audio-dependency-raw', vr180AudioDependency: true, vr180Raw: blob})));
}
