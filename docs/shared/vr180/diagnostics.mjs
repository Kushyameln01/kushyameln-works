import {getMp4StructuralProfile} from './mp4.mjs';

// Header-only, bounded diagnostics. This is never an admission parser and never
// decodes metadata values, samples, filenames or location tags.
const LIMITS = Object.freeze({boxes: 20000, depth: 16, readBytes: 2 * 1024 * 1024,
  findings: 128, ranges: 128, relatedTrackIds: 16, elapsedMs: 2000});
const ENCRYPTED = new Set(['encv', 'enca', 'sinf', 'tenc', 'senc', 'saiz', 'saio', 'pssh']);
const FRAGMENT = new Set(['mvex', 'moof', 'traf', 'tfhd', 'tfdt', 'trun', 'sidx', 'mfra', 'tfra']);
const FULL = new Set(['mvhd', 'tkhd', 'mdhd', 'hdlr', 'stsd', 'stts', 'ctts', 'stsc', 'stsz', 'stz2',
  'stco', 'co64', 'stss', 'elst', 'dref', 'keys', 'st3d', 'svhd', 'prhd', 'equi', 'tfhd', 'tfdt', 'trun',
  'sidx', 'tfra', 'pssh', 'saiz', 'saio', 'senc']);
const EXTRA_CONTAINERS = new Set(['mvex', 'moof', 'traf', 'mfra', 'sinf', 'schi', 'encv', 'enca']);
// Additional schemas are diagnostic-only and valid only in these locations.
// A familiar fourcc in an arbitrary opaque box does not establish its schema.
const EXTRA_CHILDREN = {
  root: ['moof', 'mfra', 'sidx', 'pssh'], moov: ['mvex', 'pssh'],
  moof: ['mfhd', 'traf'], mvex: ['mehd', 'trex'], traf: ['tfhd', 'tfdt', 'trun', 'sdtp', 'sgpd', 'sbgp', 'saiz', 'saio', 'senc'],
  mfra: ['tfra', 'mfro'], stbl: ['stz2', 'cslg', 'saiz', 'saio', 'senc'],
  stsd: ['encv', 'enca'], avc1: ['sinf', 'clap'], hev1: ['sinf', 'clap'], hvc1: ['sinf', 'clap'],
  mp4a: ['sinf'], encv: ['avcC', 'hvcC', 'sinf'], enca: ['esds', 'sinf'],
  sinf: ['frma', 'schm', 'schi'], schi: ['tenc'], meta: ['iloc'],
};
const fourcc = (bytes, at) => String.fromCharCode(...bytes.subarray(at, at + 4));
const safeType = value => value.replace(/[^\x20-\x7e]/g, ch => '\\x' + ch.charCodeAt(0).toString(16).padStart(2, '0'));

export async function diagnoseMp4(blob, {signal, build = null, operation = 'inspect', operationId = null,
  inputRevision = null} = {}) {
  const profile = getMp4StructuralProfile(), started = performance.now();
  const findings = [], ranges = [];
  let boxes = 0, readBytes = 0, omittedFindings = 0, omittedRanges = 0, stopped = false;
  const abort = () => { if (signal?.aborted) throw new DOMException('Diagnosis cancelled', 'AbortError'); };
  const range = (start, end, path, reason) => {
    if (start >= end) return;
    if (ranges.length < LIMITS.ranges) ranges.push({start, length: end - start, path, reason}); else omittedRanges++;
  };
  const add = (node, code, reason) => {
    if (findings.length >= LIMITS.findings) { omittedFindings++; stopped = true; return; }
    findings.push({code, reason, node});
  };
  async function read(start, size) {
    abort();
    if (performance.now() - started > LIMITS.elapsedMs || readBytes + size > LIMITS.readBytes) {
      stopped = true; throw Error('DIAGNOSIS_BUDGET');
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 0
      || !Number.isSafeInteger(start + size) || start + size > blob.size) throw Error('DIAGNOSIS_BOUNDS');
    readBytes += size;
    const b = new Uint8Array(await blob.slice(start, start + size).arrayBuffer());
    abort(); if (b.length !== size) throw Error('DIAGNOSIS_SHORT_READ'); return b;
  }
  async function walk(start, end, parent, path, inheritedTrack, depth) {
    let at = start;
    const counts = new Map();
    while (at < end) {
      abort();
      if (stopped || boxes >= LIMITS.boxes || depth > LIMITS.depth || performance.now() - started > LIMITS.elapsedMs) {
        stopped = true; range(at, end, path, 'budget'); return;
      }
      const base = {path, start: at, size: end - at, type: null, track: inheritedTrack};
      if (end - at < 8) { add(base, 'TRUNCATED_HEADER', 'Fewer than eight bytes remain in this container.'); range(at, end, path, 'invalid-boundary'); return; }
      let h;
      try { h = await read(at, 8); } catch (e) {
        if (e.name === 'AbortError') throw e;
        add(base, e.message, 'The next header could not be read.'); range(at, end, path, e.message); return;
      }
      const rawType = fourcc(h, 4), type = safeType(rawType), ordinal = counts.get(rawType) ?? 0;
      counts.set(rawType, ordinal + 1);
      const node = {...base, type, path: `${path}/${type}[${ordinal}]`, version: null};
      let size = new DataView(h.buffer).getUint32(0), header = 8;
      boxes++;
      if (size === 1) {
        if (end - at < 16) { add(node, 'TRUNCATED_EXTENDED_SIZE', 'The 64-bit box size is incomplete.'); range(at, end, node.path, 'invalid-boundary'); return; }
        try {
          const ext = new DataView((await read(at + 8, 8)).buffer).getBigUint64(0);
          if (ext > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('UNSAFE_EXTENDED_SIZE');
          size = Number(ext); header = 16;
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          add(node, e.message, 'The extended size cannot be handled safely.'); range(at, end, node.path, 'invalid-boundary'); return;
        }
      } else if (size === 0) {
        if (parent === 'root' && rawType === 'mdat') size = end - at;
        else {
          // Only a top-level mdat may extend to EOF in the processing profile.
          // Never invent a sibling or child inside an unclassified zero box.
          node.size = end - at;
          add(node, 'ZERO_SIZE_UNSUPPORTED', 'Only a last top-level mdat may use size zero.');
          range(at + header, end, node.path, 'size-zero-payload'); return;
        }
      }
      node.size = size;
      if (size < header || !Number.isSafeInteger(at + size) || size > end - at) {
        add(node, 'INVALID_BOX_BOUNDS', 'The declared box exceeds its enclosing range.'); range(at, end, node.path, 'invalid-boundary'); return;
      }
      const payload = at + header, next = at + size;
      if (rawType === 'trak' && parent === 'moov') {
        node.track = {trackId: null, handler: null, sampleEntries: [], relatedTrackIds: [], referencesTruncated: false};
      }
      const permitted = parent === 'tref' || (parent === 'root' ? profile.top : profile.children[parent] ?? []).includes(rawType);
      const knownHere = permitted || (EXTRA_CHILDREN[parent] ?? []).includes(rawType);
      if (parent !== 'tref' && !permitted) add(node,
        ENCRYPTED.has(rawType) ? 'ENCRYPTED_MEDIA' : FRAGMENT.has(rawType) ? 'FRAGMENTED_OR_INDEXED_MEDIA' : 'UNSUPPORTED_STRUCTURE',
        'This box is outside the current processing profile at this location.');
      try {
        if (parent === 'tref') {
          if ((size - header) % 4) add(node, 'INVALID_REFERENCE_ARRAY', 'Track references must contain complete uint32 IDs.');
          else if (node.track) {
            const left = LIMITS.relatedTrackIds - node.track.relatedTrackIds.length;
            const amount = Math.min(size - header, left * 4);
            if (amount) {
              const d = new DataView((await read(payload, amount)).buffer);
              for (let i = 0; i < amount; i += 4) node.track.relatedTrackIds.push({type, targetId: d.getUint32(i)});
            }
            node.track.referencesTruncated ||= amount < size - header;
          }
        } else {
          if (knownHere && FULL.has(rawType) && size - header >= 4) node.version = (await read(payload, 4))[0];
          if (rawType === 'tkhd' && node.track && [0, 1].includes(node.version)) {
            const off = node.version === 1 ? 20 : 12;
            if (size - header >= off + 4) node.track.trackId = new DataView((await read(payload + off, 4)).buffer).getUint32(0);
          }
          if (rawType === 'hdlr' && parent === 'mdia' && node.track && size - header >= 12) node.track.handler = safeType(fourcc(await read(payload + 8, 4), 0));
          if (parent === 'stsd' && node.track && node.track.sampleEntries.length < 16) node.track.sampleEntries.push(type);
          let prefix = profile.prefixes[rawType] ?? (rawType === 'encv' ? 78 : rawType === 'enca' ? 28 : 0);
          const containerType = profile.contextChildren?.[`${parent}/${rawType}`] ?? rawType;
          let container = knownHere && (containerType in profile.children || EXTRA_CONTAINERS.has(rawType));
          // A tref type named tmcd/uuid/moov is an ID array, handled above.
          // Other unknown payloads are never guessed to be child box sequences.
          if (rawType === 'meta' && container) {
            if (size - header < 8) throw Error('TRUNCATED_META');
            const lead = await read(payload, Math.min(12, size - header));
            const d = new DataView(lead.buffer), n = d.getUint32(0);
            if ((n === 1 || (n >= 8 && n <= size - header)) && ['hdlr', 'keys', 'ilst', 'free'].includes(fourcc(lead, 4))) prefix = 0;
            else if (n === 0) { prefix = 4; node.version = 0; }
            else { container = false; add(node, 'META_FORMAT_UNRECOGNIZED', 'The meta layout cannot be identified safely.'); range(payload, next, node.path, 'unknown-meta-layout'); }
          }
          if (container) {
            if (size - header < prefix) throw Error('TRUNCATED_CONTAINER_PREFIX');
            await walk(payload + prefix, next, containerType, node.path, node.track, depth + 1);
          } else if (!permitted) range(payload, next, node.path, 'opaque-unknown-payload');
        }
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        add(node, e.message, 'The recognized structure could not be inspected safely.'); range(payload, next, node.path, e.message);
      }
      at = next;
      if (!(boxes % 128)) { await new Promise(resolve => setTimeout(resolve, 0)); abort(); }
    }
  }
  if (!blob || !Number.isSafeInteger(blob.size) || blob.size <= 0 || typeof blob.slice !== 'function') throw Error('DIAGNOSIS_INPUT_INVALID');
  await walk(0, blob.size, 'root', '', null, 0);
  return {schema: 'vr180-structure-diagnosis-v1', build, operation, operationId, inputRevision,
    inputBytes: blob.size, scope: 'known-container headers; payload semantics not certified',
    processingAllowed: false, scanComplete: !stopped && ranges.length === 0 && omittedRanges === 0,
    limits: LIMITS, observations: {boxes, readBytes, elapsedMs: performance.now() - started},
    findings: findings.map(({node, ...finding}) => { const track = node.track; return {...finding,
      path: node.path, type: node.type, start: node.start, length: node.size, version: node.version ?? null, trackId: track?.trackId ?? null,
      handler: track?.handler ?? null, sampleEntries: track?.sampleEntries ?? [], relatedTracks: track?.relatedTrackIds ?? [],
      referencesTruncated: track?.referencesTruncated ?? false}; }),
    omittedFindings, unscannedRanges: ranges, omittedRanges};
}
