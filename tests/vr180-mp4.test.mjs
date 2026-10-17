import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { inspectMp4, tagMp4 } from '../docs/shared/vr180/mp4.mjs';

const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const text = (s) => new TextEncoder().encode(s);
const join = (...parts) => { const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { b.set(p, at); at += p.length; } return b; };
const box = (type, ...parts) => { const p = join(...parts); return join(u32(p.length + 8), text(type), p); };
const full = (type, ...parts) => box(type, u32(0), ...parts);
const V1_ID = Uint8Array.from(Buffer.from('ffcc8263f8554a938814587a02521fdd', 'hex'));
const bounds180 = { top: 0, bottom: 0, left: 0x40000000, right: 0x40000000 };

function metadata({ layout = 2, bounds = bounds180, pose = [0, 0, 0], mesh = false } = {}) {
  return [full('st3d', Uint8Array.of(layout)), box('sv3d', full('svhd', text('independent test\0')),
    box('proj', full('prhd', ...pose.map(n => u32(n * 65536))), mesh ? full('mshp', u32(0), text('raw '), box('mesh', u32(0))) : full('equi', ...Object.values(bounds).map(u32))))];
}

function fixture(options = {}) {
  const { videoType = 'avc1', audio = true, handler = 'vide', metadataBoxes = [], extraTrack = false,
    extraTop = [], extraMoov = [], external = false, sampleEntries = 1, offset64 = false,
    edits = null, audioEdits = null, audioTimescale = 1000, audioDuration = 1000, movieTimescale = 1000,
    colr = null, legacy = null, extraStbl = [], width = 16, height = 8 } = options;
  const ftyp = box('ftyp', text('isom'), u32(0), text('isomiso2avc1mp41'));
  const payload = Uint8Array.from({ length: 19 }, (_, i) => 40 + i);
  const mdat = box('mdat', payload);
  const videoOffset = ftyp.length + 8;
  function track(kind, id) {
    const isVideo = kind === 'vide';
    const tkhd = new Uint8Array(84); const t = new DataView(tkhd.buffer);
    t.setUint32(12, id); [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824].forEach((n, i) => t.setUint32(40 + i * 4, n));
    t.setUint32(76, width * 65536); t.setUint32(80, height * 65536);
    const mdhd = new Uint8Array(24); new DataView(mdhd.buffer).setUint32(12, isVideo ? 1000 : audioTimescale);
    const header = new Uint8Array(isVideo ? 78 : 28); const d = new DataView(header.buffer); d.setUint16(6, 1);
    if (isVideo) { d.setUint16(24, width); d.setUint16(26, height); } else { d.setUint16(16, 2); d.setUint16(18, 16); d.setUint32(24, 48000 * 65536); }
    const desc = (tag, payload) => join(Uint8Array.of(tag, payload.length), payload);
    const aac = desc(3, join(Uint8Array.of(0, 1, 0), desc(4, join(Uint8Array.of(0x40, 0x15), new Uint8Array(11), desc(5, Uint8Array.of(0x11, 0x90)))), desc(6, Uint8Array.of(2))));
    const entry = isVideo ? box(videoType, header, box('avcC', Uint8Array.of(1, 100, 0, 31, 255, 225, 0, 1, 103, 1, 0, 1, 104)), ...metadataBoxes, ...(colr ? [colr] : []), box('pasp', u32(1), u32(1))) : box('mp4a', header, full('esds', aac));
    const count = isVideo ? sampleEntries : 1;
    const off = isVideo ? videoOffset : videoOffset + 12;
    const offsets = offset64 ? full('co64', u32(1), u32(0), u32(off)) : full('stco', u32(1), u32(off));
    const stbl = box('stbl', full('stsd', u32(count), ...Array(count).fill(entry)),
      full('stts', u32(1), u32(1), u32(isVideo ? 1000 : audioDuration)), full('stsc', u32(1), u32(1), u32(1), u32(1)),
      full('stsz', u32(0), u32(1), u32(isVideo ? 12 : 7)), offsets, ...extraStbl);
    const url = box('url ', u32(external ? 0 : 1), ...(external ? [text('https://example.invalid/a\0')] : []));
    const minf = box('minf', full(isVideo ? 'vmhd' : 'smhd', new Uint8Array(isVideo ? 8 : 4)), box('dinf', full('dref', u32(1), url)), stbl);
    const chosenEdits = isVideo ? edits : audioEdits;
    const editbox = chosenEdits ? box('edts', full('elst', u32(chosenEdits.length), ...chosenEdits.flatMap(e => [u32(e.duration), u32(e.time), u32(e.rate ?? 65536)]))) : new Uint8Array();
    return box('trak', box('tkhd', tkhd), editbox, box('mdia', box('mdhd', mdhd), full('hdlr', u32(0), text(isVideo ? handler : kind), new Uint8Array(12)), minf), ...(legacy && isVideo ? [box('uuid', V1_ID, text(legacy))] : []));
  }
  const mvhd = new Uint8Array(100); const m = new DataView(mvhd.buffer); m.setUint32(12, movieTimescale); m.setUint32(20, 65536);
  [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824].forEach((n, i) => m.setUint32(36 + i * 4, n));
  const moov = box('moov', box('mvhd', mvhd), track('vide', 1), ...(audio ? [track('soun', 2)] : []), ...(extraTrack ? [track('meta', 3)] : []), ...extraMoov);
  return new Blob([ftyp, mdat, moov, ...extraTop], { type: 'video/mp4' });
}

// Independent minimal tree reader only used to observe written bytes and offset preservation.
function children(bytes, start = 0, end = bytes.length) {
  const out = []; const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (start < end) { let size = d.getUint32(start), header = 8; if (size === 1) { size = Number(d.getBigUint64(start + 8)); header = 16; } assert(size >= header); assert(start + size <= end); const type = new TextDecoder().decode(bytes.subarray(start + 4, start + 8)); out.push({ type, start, end: start + size, payload: start + header }); start += size; }
  return out;
}
function find(bytes, path) { let a = children(bytes); for (let i = 0; i < path.length; i++) { const b = a.find(x => x.type === path[i]); assert(b, path[i]); if (i === path.length - 1) return b; a = children(bytes, b.payload + (b.type === 'stsd' ? 8 : b.type === 'avc1' ? 78 : 0), b.end); } }
const videoPath = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd', 'avc1'];

test('inspect obtains one avc1 track and optional AAC without requiring spherical metadata', async () => {
  const x = await inspectMp4(fixture());
  assert.deepEqual(x, { width: 16, height: 8, videoCodec: 'avc1', audioCodecs: ['mp4a'], stereoMode: null, projection: null, bounds: null, pose: null, transcodeSafe: true, transcodeIssues: [], sampleCounts: {video: 1, audio: 1, total: 2}, containerMetadataBytes: 1022 });
  assert.deepEqual((await inspectMp4(fixture({ audio: false }))).audioCodecs, []);
});

test('tag writes cropped equi 180, zero pose and SBS/TB st3d in VisualSampleEntry before pasp', async () => {
  for (const [layout, mode, width, height] of [['sbs', 2, 16, 8], ['tb', 1, 8, 16]]) {
    const output = await tagMp4(fixture({ width, height }), { layout }); const x = await inspectMp4(output);
    assert.equal(x.stereoMode, mode); assert.equal(x.projection, 'equi'); assert.deepEqual(x.bounds, bounds180); assert.deepEqual(x.pose, [0, 0, 0]);
    const bytes = new Uint8Array(await output.arrayBuffer()); const entry = find(bytes, videoPath);
    assert.deepEqual(children(bytes, entry.payload + 78, entry.end).map(b => b.type), ['avcC', 'st3d', 'sv3d', 'pasp']);
  }
});

test('append replacement preserves media offsets, bytes and timing/sample tables including co64', async () => {
  for (const offset64 of [false, true]) {
    const input = fixture({ offset64 }); const a = new Uint8Array(await input.arrayBuffer());
    const output = await tagMp4(input, { layout: 'sbs' }); const b = new Uint8Array(await output.arrayBuffer());
    const oldMoov = find(a, ['moov']); const originalMdat = find(a, ['mdat']); const resultMdat = find(b, ['mdat']);
    assert.equal(resultMdat.start, originalMdat.start); assert.deepEqual(b.subarray(resultMdat.start, resultMdat.end), a.subarray(originalMdat.start, originalMdat.end));
    assert.equal(new TextDecoder().decode(b.subarray(oldMoov.start + 4, oldMoov.start + 8)), 'free');
    assert.equal(find(b, ['moov']).start, a.length);
    for (const name of ['stts', 'stsc', 'stsz', offset64 ? 'co64' : 'stco']) {
      const p = ['moov', 'trak', 'mdia', 'minf', 'stbl', name]; const x = find(a, p), y = find(b, p);
      assert.deepEqual(b.subarray(y.start, y.end), a.subarray(x.start, x.end), name);
    }
  }
});

test('tagging twice has one active moov and one metadata pair', async () => {
  const first = await tagMp4(fixture(), { layout: 'sbs' }); const output = await tagMp4(first, { layout: 'sbs' });
  const bytes = new Uint8Array(await output.arrayBuffer()); assert.equal(children(bytes).filter(b => b.type === 'moov').length, 1);
  const entry = find(bytes, videoPath); const a = children(bytes, entry.payload + 78, entry.end);
  assert.equal(a.filter(x => x.type === 'sv3d').length, 1); assert.equal(a.filter(x => x.type === 'st3d').length, 1);
});

test('faststart with an extended-size moov keeps mdat and chunk offsets fixed', async () => {
  const original = new Uint8Array(await fixture().arrayBuffer()); const ftyp = find(original, ['ftyp']), oldMdat = find(original, ['mdat']), oldMoov = find(original, ['moov']);
  const extended = join(u32(1), text('moov'), u32(0), u32(oldMoov.end - oldMoov.start + 8), original.subarray(oldMoov.payload, oldMoov.end));
  const delta = ftyp.end + extended.length - oldMdat.start;
  function moveOffsets(start, end) {
    for (const node of children(extended, start, end)) {
      if (node.type === 'stco') { const d = new DataView(extended.buffer); d.setUint32(node.payload + 8, d.getUint32(node.payload + 8) + delta); }
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(node.type)) moveOffsets(node.payload, node.end);
    }
  }
  moveOffsets(0, extended.length);
  const source = new Blob([original.subarray(ftyp.start, ftyp.end), extended, original.subarray(oldMdat.start, oldMdat.end)]);
  const before = new Uint8Array(await source.arrayBuffer()), after = new Uint8Array(await (await tagMp4(source, { layout: 'sbs' })).arrayBuffer());
  const mdat = find(before, ['mdat']); assert.equal(find(after, ['mdat']).start, mdat.start); assert.deepEqual(after.subarray(mdat.start, mdat.end), before.subarray(mdat.start, mdat.end));
  const free = children(after).find(b => b.type === 'free'); assert.equal(free.start, ftyp.end); assert.equal(free.end - free.start, extended.length);
  assert.equal((await inspectMp4(new Blob([after]))).stereoMode, 2);
});

test('existing 360 metadata is inspectable but cannot be relabeled 180 without pixel conversion', async () => {
  const input = fixture({ metadataBoxes: metadata({ bounds: { top: 0, bottom: 0, left: 0, right: 0 } }), width: 32 });
  assert.equal((await inspectMp4(input)).bounds.left, 0);
  await assert.rejects(tagMp4(input, { layout: 'sbs' }), /180|crop|bounds/i);
});

test('unsupported metadata orientation, mesh and eye order cannot silently be overwritten', async () => {
  await assert.rejects(tagMp4(fixture({ metadataBoxes: metadata({ pose: [10, 0, 0] }) }), { layout: 'sbs' }), /pose|orientation/i);
  await assert.rejects(tagMp4(fixture({ metadataBoxes: metadata({ mesh: true }) }), { layout: 'sbs' }), /mesh/i);
  await assert.rejects(tagMp4(fixture({ metadataBoxes: metadata({ layout: 1 }) }), { layout: 'sbs' }), /layout|stereo/i);
  await assert.rejects(inspectMp4(fixture({ metadataBoxes: metadata({ layout: 4 }) })), /stereo/i);
});

test('equivalent legacy spherical UUID is removed and disagreement is rejected', async () => {
  const legacy = '<rdf:SphericalVideo><GSpherical:ProjectionType>equirectangular</GSpherical:ProjectionType><GSpherical:StereoMode>left-right</GSpherical:StereoMode><GSpherical:FullPanoWidthPixels>16</GSpherical:FullPanoWidthPixels><GSpherical:FullPanoHeightPixels>8</GSpherical:FullPanoHeightPixels><GSpherical:CroppedAreaImageWidthPixels>8</GSpherical:CroppedAreaImageWidthPixels><GSpherical:CroppedAreaImageHeightPixels>8</GSpherical:CroppedAreaImageHeightPixels><GSpherical:CroppedAreaLeftPixels>4</GSpherical:CroppedAreaLeftPixels><GSpherical:CroppedAreaTopPixels>0</GSpherical:CroppedAreaTopPixels></rdf:SphericalVideo>';
  const output = await tagMp4(fixture({ legacy, metadataBoxes: metadata() }), { layout: 'sbs' });
  const bytes = new Uint8Array(await output.arrayBuffer()); const trak = find(bytes, ['moov', 'trak']);
  assert.equal(children(bytes, trak.payload, trak.end).some(b => b.type === 'uuid'), false);
  await assert.rejects(inspectMp4(fixture({ legacy: legacy.replace('left-right', 'top-bottom'), metadataBoxes: metadata() })), /conflict|disagree/i);
});

test('unsafe edit lists prevent transcode but remain byte-preserved for metadata copy', async () => {
  for (const edits of [[{ duration: 1000, time: 0, rate: 32768 }], [{ duration: 100, time: -1 }, { duration: 900, time: 0 }]]) {
    const input = fixture({ edits }); const x = await inspectMp4(input); assert.equal(x.transcodeSafe, false); assert(x.transcodeIssues.some(s => /edit|rate/i.test(s)));
    const output = await tagMp4(input, { layout: 'sbs' }); const a = new Uint8Array(await input.arrayBuffer()), b = new Uint8Array(await output.arrayBuffer());
    const p = ['moov', 'trak', 'edts']; const x1 = find(a, p), y = find(b, p); assert.deepEqual(a.subarray(x1.start, x1.end), b.subarray(y.start, y.end));
  }
});

test('single edit-list trailing trim or extension is not treated as safe transcode', async () => {
  for (const duration of [500, 1100]) {
    const input = fixture({ edits: [{ duration, time: 0 }] });
    const info = await inspectMp4(input); assert.equal(info.transcodeSafe, false); assert(info.transcodeIssues.some(x => /trim|end|duration/i.test(x)));
    assert.equal((await inspectMp4(await tagMp4(input, { layout: 'sbs' }))).transcodeSafe, false);
  }
  assert.equal((await inspectMp4(fixture({ edits: [{ duration: 1000, time: 0 }] }))).transcodeSafe, true);
});

test('AAC leading edit is admitted only when source end and pinned muxer movie ticks are exactly preserved', async () => {
  const safe = { audioTimescale: 48000, audioDuration: 97024, audioEdits: [{ duration: 2000, time: 1024 }] };
  assert.equal((await inspectMp4(fixture(safe))).transcodeSafe, true);
  // Source 1.001 seconds is valid, but 57600 * 1.001 has a fractional tick.
  const fractional = await inspectMp4(fixture({ ...safe, audioDuration: 49072, audioEdits: [{ duration: 1001, time: 1024 }] }));
  assert.equal(fractional.transcodeSafe, false); assert(fractional.transcodeIssues.some(s => /movie|grid|round/i.test(s)));
  // Exact output end alone is insufficient: independently rounded negative half-ticks add one tick.
  const doubleRounding = await inspectMp4(fixture({ audioTimescale: 192000, audioDuration: 384005, audioEdits: [{ duration: 2000, time: 5 }] }));
  assert.equal(doubleRounding.transcodeSafe, false); assert(doubleRounding.transcodeIssues.some(s => /movie|grid|round/i.test(s)));
  const trailing = await inspectMp4(fixture({ ...safe, audioEdits: [{ duration: 1900, time: 1024 }] }));
  assert.equal(trailing.transcodeSafe, false); assert(trailing.transcodeIssues.some(s => /end trim/i.test(s)));
  const delayed = await inspectMp4(fixture({ ...safe, audioEdits: [{ duration: 2000, time: -1 }] }));
  assert.equal(delayed.transcodeSafe, false);
  const videoTrim = await inspectMp4(fixture({ edits: [{ duration: 900, time: 100 }] }));
  assert.equal(videoTrim.transcodeSafe, false); assert(videoTrim.transcodeIssues.some(s => /video edit/i.test(s)));
  const noEditsFractional = await inspectMp4(fixture({ audioTimescale: 48000, audioDuration: 48048 }));
  assert.equal(noEditsFractional.transcodeSafe, false);
});

test('independent real AAC fixtures satisfy the limited edit admission contract', async () => {
  for (const name of ['stereo180-sbs', 'stereo180-tb', 'stereo360-tb']) {
    const bytes = await readFile(new URL(`../docs/vr180-studio/fixtures/${name}.mp4`, import.meta.url));
    const info = await inspectMp4(new Blob([bytes]));
    assert.equal(info.transcodeSafe, true, `${name}: ${info.transcodeIssues.join('; ')}`);
    assert.deepEqual(info.audioCodecs, ['mp4a']);
  }
});

test('unsupported tracks, fragmentation, references, codecs and duplicate entries fail closed', async () => {
  const cases = [
    [fixture({ extraTrack: true }), /track|handler/i], [fixture({ handler: 'meta' }), /track|handler/i],
    [fixture({ videoType: 'hvc1' }), /codec|avc1/i], [fixture({ videoType: 'camm' }), /codec|camm/i],
    [fixture({ extraTop: [box('moof')] }), /fragment|moof/i], [fixture({ extraMoov: [box('mvex')] }), /fragment|mvex/i],
    [fixture({ external: true }), /external|reference|dref/i], [fixture({ sampleEntries: 2 }), /entry|entries|stsd/i],
    [fixture({ extraStbl: [full('saio', u32(0))] }), /offset|saio|unsupported/i],
    [fixture({ metadataBoxes: [...metadata(), ...metadata()] }), /duplicate|multiple|metadata/i],
  ];
  for (const [input, pattern] of cases) await assert.rejects(inspectMp4(input), pattern);
});

test('HDR color metadata is explicitly refused', async () => {
  const nclx = box('colr', text('nclx'), Uint8Array.of(0, 9, 0, 16, 0, 9, 0));
  await assert.rejects(inspectMp4(fixture({ colr: nclx })), /HDR|SDR|color/i);
});

test('malformed sizes, unsafe offsets and dimensions are rejected', async () => {
  await assert.rejects(inspectMp4(new Blob([u32(0), text('mdat')])), /zero|size/i);
  await assert.rejects(inspectMp4(new Blob([u32(20), text('moov'), u32(0)])), /truncat|size|bounds/i);
  const bytes = new Uint8Array(await fixture().arrayBuffer()); const offset = find(bytes, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stco']);
  new DataView(bytes.buffer).setUint32(offset.payload + 8, 1);
  await assert.rejects(inspectMp4(new Blob([bytes])), /offset|mdat/i);
  await assert.rejects(tagMp4(fixture({ width: 17 }), { layout: 'sbs' }), /dimension|square|180/i);
  await assert.rejects(tagMp4(fixture(), { layout: 'bad' }), /layout/i);
});

test('retained small-metadata budget and box-count limit stop hostile metadata', async () => {
  const tooLarge = fixture({extraMoov: [box('udta', box('name', new Uint8Array(16 * 1024 * 1024 + 1)))]});
  let largestRead = 0;
  const spy = { size: tooLarge.size, slice(a, b) { largestRead = Math.max(largestRead, b - a); return tooLarge.slice(a, b); } };
  await assert.rejects(inspectMp4(spy), /budget|16 MiB|limit/i); assert(largestRead <= 1024);
  await assert.rejects(inspectMp4(fixture({ extraMoov: Array.from({ length: 21000 }, () => box('free')) })), /box|count|limit/i);
  let nested = box('free'); for (let i = 0; i < 20; i++) nested = box('udta', nested);
  await assert.rejects(inspectMp4(fixture({ extraMoov: [nested] })), /depth|nesting/i);
});

test('movie orientation and unrecognized sample groups cannot bypass track checks', async () => {
  const a = new Uint8Array(await fixture().arrayBuffer()); const mvhd = find(a, ['moov', 'mvhd']);
  new DataView(a.buffer).setUint32(mvhd.payload + 36, 0);
  await assert.rejects(inspectMp4(new Blob([a])), /movie|orientation|matrix/i);
  await assert.rejects(inspectMp4(fixture({ extraStbl: [full('sgpd', text('seig'), u32(0))] })), /group|seig|unsupported/i);
});

test('metadata scanner never reads mdat payload and observes cancellation', async () => {
  const input = fixture(); const bytes = new Uint8Array(await input.arrayBuffer()); const mdat = find(bytes, ['mdat']);
  const spy = { size: input.size, slice(a, b) { assert(!(a < mdat.end && b > mdat.payload && b - a > 16), 'payload read'); return input.slice(a, b); } };
  await inspectMp4(spy);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(inspectMp4(input, { signal: controller.signal }), e => e.name === 'AbortError');
  await assert.rejects(tagMp4(input, { layout: 'sbs', signal: controller.signal }), e => e.name === 'AbortError');
  const during = new AbortController();
  const cancelOnRead = { size: input.size, slice(a, b) { const part = input.slice(a, b); during.abort(); return part; } };
  await assert.rejects(inspectMp4(cancelOnRead, { signal: during.signal }), e => e.name === 'AbortError');
});

// These are structural fixtures. Their payloads are not decodable H.264 and
// they are never presented as a successful 5–10 GB camera-video conversion.
function blobBox(type, ...parts) {
  const size = parts.reduce((n, p) => n + (p.size ?? p.byteLength), 0) + 8;
  return new Blob([u32(size), text(type), ...parts]);
}
function replaceTree(bytes, node, replacements) {
  if (replacements[node.type]) return replacements[node.type];
  if (!['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(node.type)) return new Blob([bytes.subarray(node.start, node.end)]);
  return blobBox(node.type, ...children(bytes, node.payload, node.end).map(n => replaceTree(bytes, n, replacements)));
}
async function largeTableFixture({samples = 4_194_305, timingRuns = false} = {}) {
  const base = new Uint8Array(await fixture({audio: false}).arrayBuffer()), movie = find(base, ['moov']), ftyp = find(base, ['ftyp']);
  const table = new Uint8Array(samples * (timingRuns ? 8 : 4)), d = new DataView(table.buffer);
  for (let i = 0; i < table.length; i += 4) d.setUint32(i, 1);
  const stsz = timingRuns ? full('stsz', u32(1), u32(samples)) : blobBox('stsz', u32(0), u32(0), u32(samples), table);
  const stts = timingRuns ? blobBox('stts', u32(0), u32(samples), table) : full('stts', u32(1), u32(samples), u32(1));
  const moov = replaceTree(base, movie, {stsz, stts, stsc: full('stsc', u32(1), u32(1), u32(samples), u32(1))});
  const mdat = blobBox('mdat', new Uint8Array(samples));
  return {blob: new Blob([base.subarray(ftyp.start, ftyp.end), mdat, moov]), moov, samples, table};
}
function readSpy(blob, reads) {
  return {size: blob.size, slice(a, b) { const part = blob.slice(a, b); return {
    arrayBuffer() { reads.push({at: a, bytes: b - a}); assert(b - a <= 65536, 'table read must be bounded'); return part.arrayBuffer(); }
  }; }};
}
test('a real stsz table above 16 MiB is scanned and rewritten without a whole-moov read', async () => {
  const {blob, samples, moov, table} = await largeTableFixture(); const reads = [];
  assert(moov.size > 16 * 1024 * 1024);
  const info = await inspectMp4(readSpy(blob, reads));
  assert.equal(info.sampleCounts.video, samples); assert.equal(info.containerMetadataBytes, moov.size);
  assert(reads.length < 500, 'page scan must not read once per sample');
  const result = await tagMp4(blob, {layout: 'sbs'});
  assert.equal((await inspectMp4(result)).stereoMode, 2);
  const prefix = new Uint8Array(await result.slice(0, blob.size - moov.size).arrayBuffer());
  assert.deepEqual(prefix, new Uint8Array(await blob.slice(0, blob.size - moov.size).arrayBuffer()));
  const appended = new Uint8Array(await result.slice(blob.size).arrayBuffer());
  const sizeTable = find(appended, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsz']);
  assert.equal(sizeTable.end - sizeTable.payload, 12 + 4 * samples);
  assert.deepEqual(appended.subarray(sizeTable.payload + 12, sizeTable.end), table);
});

test('large stsz tail and page-boundary corrupt sizes are checked, not skipped', async () => {
  const {blob, moov, samples} = await largeTableFixture();
  const m = new Uint8Array(await moov.arrayBuffer()), stsz = find(m, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsz']);
  for (const sample of [16383, samples - 1]) {
    const at = blob.size - moov.size + stsz.payload + 12 + sample * 4;
    const broken = new Blob([blob.slice(0, at), u32(0xffffffff), blob.slice(at + 4)]);
    await assert.rejects(inspectMp4(broken), /offset\/length|outside mdat/);
  }
});

test('long timing tables yield for cancellation and validate their last run', async () => {
  const {blob, moov, samples} = await largeTableFixture({samples: 2_097_153, timingRuns: true});
  assert(moov.size > 16 * 1024 * 1024);
  const info = await inspectMp4(blob); assert.equal(info.sampleCounts.video, samples);
  const m = new Uint8Array(await moov.arrayBuffer()), stts = find(m, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stts']);
  const lastDuration = blob.size - moov.size + stts.payload + 8 + (samples - 1) * 8 + 4;
  await assert.rejects(inspectMp4(new Blob([blob.slice(0, lastDuration), u32(0), blob.slice(lastDuration + 4)])), /zero-duration/);
  const controller = new AbortController(); let sawTable = false;
  const tableAt = blob.size - moov.size + stts.payload;
  const wrapped = {size: blob.size, slice(a, b) {
    if (!sawTable && a >= tableAt && b - a > 1024) { sawTable = true; setTimeout(() => controller.abort(), 0); }
    return blob.slice(a, b);
  }};
  await assert.rejects(inspectMp4(wrapped, {signal: controller.signal}), e => e.name === 'AbortError');
  assert(sawTable);
});

test('file-range structural adapter crosses 4 GiB with co64 and a 64-bit moov; offsets remain unchanged', async () => {
  const dir = await mkdtemp(pathJoin(tmpdir(), 'vr180-range-'));
  try {
    const base = new Uint8Array(await fixture({audio: false, offset64: true}).arrayBuffer());
    const ftyp = find(base, ['ftyp']), mdat = find(base, ['mdat']), movie = find(base, ['moov']);
    const moovBytes = base.slice(movie.start, movie.end), co64 = find(moovBytes, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'co64']);
    const freeSize = 2 ** 32 + 32, largeMoovSize = movie.end - movie.start + 8 + freeSize;
    const mdatAt = ftyp.end + largeMoovSize;
    new DataView(moovBytes.buffer).setBigUint64(co64.payload + 8, BigInt(mdatAt + 8));
    const header = join(u32(1), text('moov'), u32(1), u32(largeMoovSize - 2 ** 32));
    const freeHeader = join(u32(1), text('free'), u32(1), u32(32));
    const path = pathJoin(dir, 'structural-sparse.mp4'), handle = await open(path, 'w');
    try {
      await handle.write(base.subarray(0, ftyp.end), 0, ftyp.end, 0);
      await handle.write(header, 0, header.length, ftyp.end);
      await handle.write(moovBytes.subarray(8), 0, moovBytes.length - 8, ftyp.end + 16);
      await handle.write(freeHeader, 0, freeHeader.length, ftyp.end + 16 + moovBytes.length - 8);
      await handle.write(base.subarray(mdat.start, mdat.end), 0, mdat.end - mdat.start, mdatAt);
    } finally { await handle.close(); }
    // This runtime's native Blob slices truncate/assert above uint32. Exercise
    // production offset/rewrite logic through actual positioned file reads and
    // a test-only composite adapter. This is not a native-browser Blob test.
    const file = await open(path, 'r');
    class FileRange {
      constructor(start, end) { this.start = start; this.size = end - start; }
      slice(a = 0, b = this.size) { return new FileRange(this.start + a, this.start + b); }
      async arrayBuffer() { assert(this.size <= 65536); const data = new Uint8Array(this.size); const {bytesRead} = await file.read(data, 0, data.length, this.start); assert.equal(bytesRead, data.length); return data.buffer; }
    }
    class Composite {
      constructor(parts) {
        this.parts = parts.map(p => ArrayBuffer.isView(p) ? {
          size: p.byteLength, slice(a = 0, b = p.byteLength) { return new Composite([p.slice(a, b)]); }, async arrayBuffer() { return p.slice().buffer; }
        } : p);
        this.size = this.parts.reduce((n, p) => n + p.size, 0);
      }
      slice(start = 0, end = this.size) {
        const parts = []; let at = 0;
        for (const p of this.parts) { if (start < at + p.size && end > at) parts.push(p.slice(Math.max(start - at, 0), Math.min(end - at, p.size))); at += p.size; }
        return new Composite(parts);
      }
      async arrayBuffer() { assert(this.size <= 65536); const data = new Uint8Array(this.size); let at = 0; for (const p of this.parts) { data.set(new Uint8Array(await p.arrayBuffer()), at); at += p.size; } return data.buffer; }
    }
    const nativeBlob = globalThis.Blob;
    try {
      const input = new FileRange(0, (await file.stat()).size), info = await inspectMp4(input); assert.equal(info.sampleCounts.video, 1);
      globalThis.Blob = Composite;
      const output = await tagMp4(input, {layout: 'sbs'});
      const newHeader = new DataView(await output.slice(input.size, input.size + 16).arrayBuffer());
      assert.equal(newHeader.getUint32(0), 1); assert(newHeader.getBigUint64(8) > 2n ** 32n);
      assert.deepEqual(new Uint8Array(await output.slice(mdatAt, mdatAt + mdat.end - mdat.start).arrayBuffer()), base.subarray(mdat.start, mdat.end));
      assert.equal((await inspectMp4(output)).stereoMode, 2);
    } finally { globalThis.Blob = nativeBlob; await file.close(); }
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('roll/prol maps and sample-dependency lengths retain their validation in paged tables', async () => {
  for (const version of [0, 1, 2]) {
    const group = box('sgpd', u32(version * 2 ** 24), text('roll'), ...(version ? [u32(2)] : []), ...(version === 2 ? [u32(0)] : []), u32(1), Uint8Array.of(255, 255));
    for (const mapVersion of [0, 1]) {
      const mapping = box('sbgp', u32(mapVersion * 2 ** 24), text('roll'), ...(mapVersion ? [u32(0)] : []), u32(1), u32(1), u32(1));
      const source = fixture({extraStbl: [group, mapping, full('sdtp', Uint8Array.of(0))]});
      assert.equal((await inspectMp4(source)).sampleCounts.total, 2);
      assert.equal((await inspectMp4(await tagMp4(source, {layout: 'sbs'}))).stereoMode, 2);
    }
  }
  await assert.rejects(inspectMp4(fixture({extraStbl: [full('sdtp')]})), /sdtp/);
});

test('signed composition offsets are merged across page boundaries and invalid final runs are rejected', async () => {
  const {blob, moov, samples} = await largeTableFixture({samples: 17000});
  const runs = new Uint8Array(samples * 8), d = new DataView(runs.buffer);
  for (let i = 0; i < samples; i++) { d.setUint32(i * 8, 1); d.setInt32(i * 8 + 4, i % 2 ? -1 : 1); }
  const movie = new Uint8Array(await moov.arrayBuffer()), stbl = find(movie, ['moov', 'trak', 'mdia', 'minf', 'stbl']);
  const mapping = blobBox('ctts', u32(2 ** 24), u32(samples), runs);
  const replacement = replaceTree(movie, children(movie)[0], {stbl: blobBox('stbl', movie.subarray(stbl.payload, stbl.end), mapping)});
  const source = new Blob([blob.slice(0, blob.size - moov.size), replacement]);
  assert.equal((await inspectMp4(source)).sampleCounts.video, samples);
  d.setUint32((samples - 1) * 8, 0);
  const brokenReplacement = replaceTree(movie, children(movie)[0], {stbl: blobBox('stbl', movie.subarray(stbl.payload, stbl.end), blobBox('ctts', u32(2 ** 24), u32(samples), runs))});
  await assert.rejects(inspectMp4(new Blob([blob.slice(0, blob.size - moov.size), brokenReplacement])), /invalid ctts sample run/);
});

test('long edit lists keep a bounded set of issues and rewriting a broad tree yields to cancellation', async () => {
  const edits = Array.from({length: 4096}, () => ({duration: 1, time: -1, rate: 0}));
  const info = await inspectMp4(fixture({audio: false, edits}));
  assert.equal(info.transcodeSafe, false); assert.equal(info.transcodeIssues.length, 3);
  const source = fixture({extraMoov: Array.from({length: 1024}, () => box('free'))});
  const controller = new AbortController(), original = globalThis.Blob; let scheduled = false;
  try {
    globalThis.Blob = class extends original {
      constructor(parts, options) { super(parts, options); if (!scheduled) { scheduled = true; setTimeout(() => controller.abort(), 0); } }
    };
    await assert.rejects(tagMp4(source, {layout: 'sbs', signal: controller.signal}), e => e.name === 'AbortError');
    assert(scheduled);
  } finally { globalThis.Blob = original; }
});
