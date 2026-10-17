// Captures only the muxer's small prefix and final moov, never the mdat body.
// This is a structural inspection source for an uncommitted writer, not an
// independent read-back of the saved file. Uncaptured ranges always fail.
const PREFIX_BYTES = 2048;
const MAX_MOOV_BYTES = 16 * 1024 * 1024;
const check = (value, message) => { if (!value) throw Error(message); };
const safe = value => Number.isSafeInteger(value) && value >= 0;

export function createMuxCapture() {
  const prefix = new Uint8Array(PREFIX_BYTES), present = new Uint8Array(PREFIX_BYTES);
  let moov = null, moovPosition = null, extent = 0, writes = 0, sealed = false;
  function onMoov(data, position) {
    check(!sealed && moov === null, 'DIRECT_MOOV_COUNT_INVALID');
    check(data instanceof Uint8Array && data.byteLength >= 8 && data.byteLength <= MAX_MOOV_BYTES
      && safe(position) && safe(position + data.byteLength), 'DIRECT_MOOV_BUDGET_EXCEEDED');
    const d = new DataView(data.buffer, data.byteOffset, data.byteLength);
    check(d.getUint32(0) === data.byteLength && String.fromCharCode(...data.subarray(4, 8)) === 'moov', 'DIRECT_MOOV_INVALID');
    moov = data.slice(); moovPosition = position;
  }
  function write({position, data}) {
    check(!sealed && data instanceof Uint8Array && safe(position) && safe(position + data.byteLength), 'DIRECT_WRITE_INVALID');
    check(position <= extent, 'DIRECT_WRITE_GAP');
    const end = position + data.byteLength;
    if (position < PREFIX_BYTES) {
      const count = Math.min(end, PREFIX_BYTES) - position;
      prefix.set(data.subarray(0, count), position); present.fill(1, position, position + count);
    }
    extent = Math.max(extent, end); writes++;
  }
  function finish(expectedExtent) {
    check(!sealed && moov && safe(expectedExtent) && extent === expectedExtent
      && moovPosition + moov.byteLength === extent, 'DIRECT_MUX_NOT_FINALIZED');
    sealed = true;
    const movie = new Blob([moov]);
    const movieBytes = moov.byteLength; moov = null;
    let prefixLength = 0;
    while (prefixLength < present.length && present[prefixLength]) prefixLength++;
    const head = new Blob([prefix.subarray(0, prefixLength)]);
    const source = {size: extent, slice(start = 0, end = extent) {
      check(safe(start) && safe(end) && start <= end && end <= extent, 'DIRECT_RANGE_INVALID');
      if (start === end) return new Blob([]);
      // Prefer the final moov over a prefix copy if a tiny file overlaps both.
      if (start >= moovPosition && end <= extent) return movie.slice(start - moovPosition, end - moovPosition);
      if (end <= prefixLength) return head.slice(start, end);
      throw Error('DIRECT_UNCAPTURED_RANGE');
    }};
    return {source, metrics: {muxWrites: writes, muxExtentBytes: extent, capturedPrefixBytes: prefixLength,
      capturedMoovBytes: movieBytes, retainedSourceBytes: prefixLength + movieBytes,
      captureScope: 'acknowledged prefix writes and synchronous moov callback; metadata only; saved file read-back occurs after commit'}};
  }
  return {write, onMoov, finish};
}
