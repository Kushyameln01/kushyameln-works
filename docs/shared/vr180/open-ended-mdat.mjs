// Close an EOF-sized mdat before appending metadata, without moving samples.
// The >uint32 branch reuses eight bytes from an adjacent disposable box. It
// never inserts bytes into media or rewrites unknown offset-bearing payloads.
const U32_MAX = 0xffffffff;
const safe = n => Number.isSafeInteger(n) && n >= 0;
const require = (value, message) => { if (!value) throw Error(`MP4: ${message}`); };
const aborted = signal => { if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError'); };
const u32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };

/** Called with the bounded parser's validated, contiguous top-level boxes.
 * releaseMovie=true is reserved for the tag writer that copies the complete
 * movie to a new moov and marks the original moov free in the same plan.
 * A demuxing input must keep its live moov and therefore uses false.
 */
export function planOpenEndedMdatHeaders(top, {releaseMovie = false} = {}) {
  let previousEnd = 0;
  for (const n of top) {
    require(safe(n.start) && safe(n.end) && n.start === previousEnd && n.end > n.start
      && [8, 16].includes(n.header) && n.end - n.start >= n.header, 'invalid top-level header plan');
    previousEnd = n.end;
  }
  const open = top.filter(n => n.sizeToEOF);
  if (!open.length) return [];
  const node = open[0];
  require(open.length === 1 && node === top.at(-1) && node.type === 'mdat' && node.header === 8,
    'only the last top-level mdat may use size=0');
  const size = node.end - node.start;
  if (size <= U32_MAX) return [{position: node.start, data: u32(size)}];
  const previous = top.at(-2);
  require(previous && (['free', 'skip'].includes(previous.type) || (releaseMovie && previous.type === 'moov'))
    && previous.end === node.start && previous.end - previous.start >= previous.header + 8,
  'large size=0 mdat requires eight adjacent reusable bytes to preserve sample positions');
  const previousSize = previous.end - previous.start - 8;
  require(safe(size + 8), 'extended mdat size exceeds safe integer range');
  const patches = [];
  if (previous.header === 8) {
    require(previousSize <= U32_MAX, 'invalid preceding 32-bit box size');
    patches.push({position: previous.start, data: u32(previousSize)});
  } else {
    const length = new Uint8Array(8); new DataView(length.buffer).setBigUint64(0, BigInt(previousSize));
    patches.push({position: previous.start + 8, data: length});
  }
  const header = new Uint8Array(16), d = new DataView(header.buffer);
  d.setUint32(0, 1); header.set([109, 100, 97, 116], 4); d.setBigUint64(8, BigInt(size + 8));
  patches.push({position: node.start - 8, data: header});
  return patches;
}

async function scanTop(blob, signal) {
  require(blob && safe(blob.size) && blob.size > 0 && typeof blob.slice === 'function', 'invalid MP4 source');
  const top = []; let at = 0;
  async function read(position, length) {
    aborted(signal); require(position + length <= blob.size, 'truncated top-level box header');
    const b = new Uint8Array(await blob.slice(position, position + length).arrayBuffer());
    aborted(signal); require(b.length === length, 'truncated top-level header read'); return b;
  }
  while (at < blob.size) {
    require(top.length < 20000, 'box count limit exceeded');
    if (!(top.length % 128)) { await new Promise(resolve => setTimeout(resolve, 0)); aborted(signal); }
    const h = await read(at, 8), d = new DataView(h.buffer), type = String.fromCharCode(...h.subarray(4, 8));
    let size = d.getUint32(0), header = 8; const sizeToEOF = size === 0;
    if (sizeToEOF) {
      require(type === 'mdat', 'only the last top-level mdat may use size=0'); size = blob.size - at;
    } else if (size === 1) {
      const ext = new DataView((await read(at + 8, 8)).buffer).getBigUint64(0);
      require(ext <= BigInt(Number.MAX_SAFE_INTEGER), '64-bit value exceeds safe integer range'); size = Number(ext); header = 16;
    }
    require(size >= header && safe(at + size) && size <= blob.size - at, 'invalid top-level box bounds');
    top.push({type, start: at, end: at + size, header, sizeToEOF}); at += size;
  }
  return top;
}

/** Adapter for the fixed demuxer, whose size=0 header reader rejects the file.
 * This does not validate media semantics or permit an otherwise rejected input.
 * It reads headers only and composes Blob slices; no media arrayBuffer is made.
 */
export async function normalizeMp4ForDemuxer(blob, {signal} = {}) {
  aborted(signal);
  const patches = planOpenEndedMdatHeaders(await scanTop(blob, signal));
  if (!patches.length) return blob;
  const parts = []; let cursor = 0;
  for (const patch of patches) {
    require(patch.position >= cursor && patch.position + patch.data.byteLength <= blob.size, 'overlapping normalization patches');
    parts.push(blob.slice(cursor, patch.position), patch.data); cursor = patch.position + patch.data.byteLength;
  }
  parts.push(blob.slice(cursor)); aborted(signal);
  return new Blob(parts, {type: blob.type || 'video/mp4'});
}
