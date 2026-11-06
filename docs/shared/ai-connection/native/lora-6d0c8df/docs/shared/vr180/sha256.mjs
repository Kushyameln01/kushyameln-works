// Incremental SHA-256 (FIPS 180-4, sections 5 and 6.2), without external code.
// https://csrc.nist.gov/pubs/fips/180-4/upd1/final
// Intended for content verification; this is not a cryptographic certification.

export const SHA256_CHUNK_BYTES = 1024 * 1024;
const MAX_MESSAGE_BYTES = (1n << 61n) - 1n;
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (word, bits) => (word >>> bits) | (word << (32 - bits));

// Also exposed to verify large counter boundaries without claiming that a
// multi-gigabyte input has actually been hashed. The argument is a byte count.
export function sha256LengthField(byteLength) {
  if (typeof byteLength !== 'bigint' || byteLength < 0n || byteLength > MAX_MESSAGE_BYTES) {
    throw new RangeError('SHA256_BYTE_LENGTH');
  }
  const field = new Uint8Array(8);
  new DataView(field.buffer).setBigUint64(0, byteLength * 8n, false);
  return field;
}

export class Sha256 {
  #state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  #words = new Uint32Array(64);
  #tail = new Uint8Array(64);
  #tailBytes = 0;
  #byteLength = 0n;
  #hex = null;

  get bytesHashed() { return this.#byteLength; }

  update(bytes) {
    if (this.#hex !== null) throw new Error('SHA256_ALREADY_FINALIZED');
    if (!(bytes instanceof Uint8Array)) throw new TypeError('SHA256_EXPECTS_UINT8ARRAY');
    const length = this.#byteLength + BigInt(bytes.byteLength);
    if (length > MAX_MESSAGE_BYTES) throw new RangeError('SHA256_BYTE_LENGTH');
    this.#byteLength = length;
    let offset = 0;
    if (this.#tailBytes) {
      const count = Math.min(64 - this.#tailBytes, bytes.byteLength);
      this.#tail.set(bytes.subarray(0, count), this.#tailBytes);
      this.#tailBytes += count;
      offset = count;
      if (this.#tailBytes === 64) {
        this.#compress(this.#tail, 0);
        this.#tailBytes = 0;
      }
    }
    while (offset + 64 <= bytes.byteLength) {
      this.#compress(bytes, offset);
      offset += 64;
    }
    if (offset < bytes.byteLength) {
      this.#tail.set(bytes.subarray(offset), this.#tailBytes);
      this.#tailBytes += bytes.byteLength - offset;
    }
    return this;
  }

  digestHex() {
    if (this.#hex !== null) return this.#hex;
    this.#tail[this.#tailBytes++] = 0x80;
    if (this.#tailBytes > 56) {
      this.#tail.fill(0, this.#tailBytes);
      this.#compress(this.#tail, 0);
      this.#tailBytes = 0;
    }
    this.#tail.fill(0, this.#tailBytes, 56);
    this.#tail.set(sha256LengthField(this.#byteLength), 56);
    this.#compress(this.#tail, 0);
    this.#hex = Array.from(this.#state, word => word.toString(16).padStart(8, '0')).join('');
    return this.#hex;
  }

  #compress(bytes, offset) {
    const w = this.#words;
    for (let i = 0; i < 16; i++) {
      const at = offset + i * 4;
      w[i] = (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    const state = this.#state;
    let a = state[0], b = state[1], c = state[2], d = state[3];
    let e = state[4], f = state[5], g = state[6], h = state[7];
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choice + K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
}

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('処理を取り消しました', 'AbortError');
}
const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Hash a Blob/File using at most one <=1 MiB input chunk plus fixed hash state.
 * Options: signal (AbortSignal), onProgress({bytesHashed, totalBytes}) (sync),
 * and chunkBytes (1..SHA256_CHUNK_BYTES, default 1 MiB).
 *
 * The source's whole-file arrayBuffer() is never called. A task yield after
 * each chunk allows Worker cancel messages to run; a pending Blob read itself
 * cannot be interrupted, so cancellation is checked immediately after it.
 * All file offsets remain safe integer Numbers; the hash's byte/bit counters
 * use BigInt. No 32-bit coercion is applied to whole-file lengths or offsets.
 */
export async function sha256Blob(blob, { signal, onProgress, chunkBytes = SHA256_CHUNK_BYTES } = {}) {
  if (!blob || typeof blob.slice !== 'function' || !Number.isSafeInteger(blob.size) || blob.size < 0) {
    throw new TypeError('SHA256_EXPECTS_BLOB_WITH_SAFE_SIZE');
  }
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > SHA256_CHUNK_BYTES) {
    throw new RangeError('SHA256_CHUNK_SIZE');
  }
  if (onProgress !== undefined && typeof onProgress !== 'function') throw new TypeError('SHA256_PROGRESS_CALLBACK');
  const totalBytes = blob.size;
  const hash = new Sha256();
  checkAbort(signal);
  onProgress?.({ bytesHashed: 0, totalBytes });
  for (let offset = 0; offset < totalBytes;) {
    checkAbort(signal);
    const end = Math.min(offset + chunkBytes, totalBytes);
    // This block's reference is dropped before the next read and task yield.
    {
      const bytes = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
      checkAbort(signal);
      if (bytes.byteLength !== end - offset) throw new Error('SHA256_SHORT_OR_OVERSIZED_READ');
      hash.update(bytes);
    }
    offset = end;
    onProgress?.({ bytesHashed: offset, totalBytes });
    checkAbort(signal);
    await yieldTask();
  }
  checkAbort(signal);
  return hash.digestHex();
}
