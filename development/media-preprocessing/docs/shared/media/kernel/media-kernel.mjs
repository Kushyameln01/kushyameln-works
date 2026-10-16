import { MEDIA_KERNELS } from './registry.mjs';
export { MEDIA_KERNELS };

const MAX_MEMORY_BYTES = 16 * 1024 * 1024;
const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const PAGE_BYTES = 65536;

function registered(variant) {
  if (!Object.hasOwn(MEDIA_KERNELS, variant)) throw new TypeError('Unknown media kernel variant');
  return MEDIA_KERNELS[variant];
}

export function supportsSIMD() {
  // () -> v128, v128.const 0. No instance or live memory is allocated.
  const probe = Uint8Array.of(0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,
    3,2,1,0,10,22,1,20,0,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11);
  try { return WebAssembly.validate(probe); } catch { return false; }
}

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('Media kernel preparation aborted', 'AbortError');
}

export async function prepareMediaKernel({ variant = 'scalar', signal, onCompile, onResponse } = {}) {
  const entry = registered(variant);
  checkAbort(signal);
  const response = await fetch(entry.url, { signal, credentials: 'omit' });
  checkAbort(signal);
  if (!response.ok) throw new Error(`Media kernel fetch failed (${response.status})`);
  onResponse?.(response.headers.get('content-type') ?? '');
  const bytes = await response.arrayBuffer();
  checkAbort(signal);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  checkAbort(signal);
  if (hex !== entry.sha256) throw new Error('Media kernel SHA-256 digest mismatch');
  onCompile?.();
  checkAbort(signal);
  const module = await WebAssembly.compile(bytes);
  checkAbort(signal);
  return module;
}

function validateInput({ data, width, height, stride }) {
  if (!(data instanceof Uint8Array) || !(data.buffer instanceof ArrayBuffer)) {
    throw new TypeError('Media kernel data must be a non-shared Uint8Array');
  }
  // Constructing a view also detects a detached (otherwise zero-length) buffer.
  new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data.byteLength > MAX_INPUT_BYTES) throw new RangeError('Media kernel input exceeds 4 MiB');
  for (const value of [width, height, stride]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Invalid media dimensions or stride');
  }
  if (stride < width) throw new RangeError('Stride must be at least width');
  const inputBytes = stride * height;
  const outputBytes = width * height;
  if (!Number.isSafeInteger(inputBytes) || !Number.isSafeInteger(outputBytes)
      || inputBytes > MAX_INPUT_BYTES || outputBytes > MAX_INPUT_BYTES || data.byteLength < inputBytes) {
    throw new RangeError('Media dimensions exceed the input or arena budget');
  }
  return { data, width, height, stride, inputBytes, outputBytes };
}

export function instantiateMediaKernel(module, { variant = 'scalar' } = {}) {
  registered(variant);
  if (!(module instanceof WebAssembly.Module)) throw new TypeError('Expected a verified WebAssembly.Module');
  const names = WebAssembly.Module.exports(module).map(x => `${x.name}:${x.kind}`).sort();
  if (WebAssembly.Module.imports(module).length || names.join(',') !== 'Lbp3x3:function,memory:memory') {
    throw new TypeError('Unexpected media kernel module ABI');
  }
  let instance = new WebAssembly.Instance(module);
  let memory = instance.exports.memory;
  if (!(memory instanceof WebAssembly.Memory) || instance.exports.Lbp3x3.length !== 6
      || memory.buffer.byteLength > MAX_MEMORY_BYTES || !(memory.buffer instanceof ArrayBuffer)) {
    throw new TypeError('Unexpected media kernel instance ABI');
  }
  // The compiler's stack occupies initial memory. Never place a host arena in it.
  const arenaBase = Math.max(131072, memory.buffer.byteLength);
  const instanceId = `media-${variant}-${crypto.randomUUID()}`;
  let disposed = false, busy = false, liveBytes = 0, runs = 0;

  function run(input) {
    if (disposed) throw new Error('Media kernel is disposed');
    if (busy) throw new Error('Media kernel is already running');
    const { data, width, height, stride, inputBytes, outputBytes } = validateInput(input);
    // Public Memory is for diagnostics, not an input allocator. Accepting its
    // arena as input would conflict with both input immutability and zeroing.
    if (data.buffer === memory.buffer) throw new TypeError('Input must not alias the kernel Memory');
    if (width <= 2 || height <= 2) { runs++; return new Uint8Array(outputBytes); }
    const outputStart = Math.ceil((arenaBase + inputBytes) / 16) * 16;
    const arenaEnd = outputStart + outputBytes;
    if (arenaEnd > MAX_MEMORY_BYTES || memory.buffer.byteLength > MAX_MEMORY_BYTES) {
      throw new RangeError('Media kernel arena exceeds 16 MiB');
    }
    const source = data.subarray(0, inputBytes);
    busy = true;
    let arenaReserved = false;
    try {
      const extraPages = Math.ceil((arenaEnd - memory.buffer.byteLength) / PAGE_BYTES);
      if (extraPages > 0) memory.grow(extraPages);
      liveBytes = arenaEnd - arenaBase;
      arenaReserved = true;
      const bytes = new Uint8Array(memory.buffer);
      bytes.fill(0, arenaBase, arenaEnd);
      bytes.set(source, arenaBase);
      const count = instance.exports.Lbp3x3(arenaBase, outputStart, width, height, stride, width);
      if (count !== (width - 2) * (height - 2)) throw new Error('Media kernel returned an invalid interior count');
      const output = bytes.slice(outputStart, arenaEnd);
      runs++;
      return output;
    } finally {
      if (arenaReserved) new Uint8Array(memory.buffer).fill(0, arenaBase, arenaEnd);
      liveBytes = 0;
      busy = false;
    }
  }

  function dispose() {
    if (busy) throw new Error('Cannot dispose a running media kernel');
    disposed = true;
    instance = null;
    memory = null;
    module = null;
    liveBytes = 0;
  }

  return Object.freeze({ instanceId, get memory() { return memory; }, run, dispose,
    resourceStats: () => ({ disposed, busy, liveBytes, arenaBase, memoryBytes: memory?.buffer.byteLength ?? 0,
      maxMemoryBytes: MAX_MEMORY_BYTES, maxInputBytes: MAX_INPUT_BYTES, runs }) });
}
