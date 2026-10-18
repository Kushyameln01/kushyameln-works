// Browser/Node glue only: all magnitude/sign/anchor calculations stay in Hike.
export async function instantiateFtKernel(bytes) {
  // Pin the same reviewed artifact as shared/compute/protocol.mjs. A matching
  // export-name list alone does not identify its ABI or implementation.
  const expectedSha256 = 'b260ac37862014a9ebb3ebb25739283fe2778e638969e757b2fd34769cd989ad';
  const isBuffer = bytes instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer !== 'undefined' && bytes instanceof SharedArrayBuffer);
  if (!isBuffer && !ArrayBuffer.isView(bytes)) throw new TypeError('Expected FT WASM bytes');
  // Own the exact bytes before the first await: caller mutations must not make
  // the digest describe a different image from the one passed to compile.
  const source = ArrayBuffer.isView(bytes)
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes);
  const owned = Uint8Array.from(source);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', owned)),
    value => value.toString(16).padStart(2, '0')).join('');
  if (digest !== expectedSha256) throw new Error('FT WASM digest does not match the reviewed kernel');
  const module = await WebAssembly.compile(owned);
  if (WebAssembly.Module.imports(module).length) throw new Error('Unexpected FT kernel imports');
  const expected = ['FtAnchorComponent', 'FtCrc32Step', 'FtMagnitude', 'FtSignedMagnitude', 'FtValidate'];
  const actual = WebAssembly.Module.exports(module).filter(x => x.kind === 'function').map(x => x.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Unexpected FT kernel exports');
  const { exports: k } = await WebAssembly.instantiate(module, {});
  const integer = value => {
    // WebAssembly otherwise silently truncates fractional/oversized JS inputs.
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) throw new RangeError('Expected i32 integer');
    return value;
  };
  const number = value => {
    if (typeof value !== 'number') throw new TypeError('Expected number');
    return value;
  };
  const finiteResult = value => {
    if (!Number.isFinite(value)) throw new RangeError('Hike rejected an invalid input');
    return value;
  };
  return Object.freeze({
    animatorHash(text) {
      if (typeof text !== 'string') throw new TypeError('Expected parameter string');
      let state = -1;
      for (const byte of new TextEncoder().encode(text)) state = k.FtCrc32Step(state, byte);
      return k.FtCrc32Step(state, -1) >>> 0;
    },
    magnitude(mask, weights) {
      integer(mask);
      if (!Array.isArray(weights) || weights.length < 1 || weights.length > 5) throw new RangeError('Expected 1..5 source weights');
      const padded = [...weights.map(number), ...Array(5 - weights.length).fill(0)];
      const status = k.FtValidate(mask, weights.length, ...padded);
      if (status) throw new RangeError(`Hike input validation failed: ${status}`);
      return finiteResult(k.FtMagnitude(mask, weights.length, ...padded));
    },
    signedMagnitude(magnitude, negative) {
      return finiteResult(k.FtSignedMagnitude(number(magnitude), integer(negative)));
    },
    anchors(nominalMax) {
      number(nominalMax);
      return Array.from({ length: 5 }, (_, i) => ({
        x: finiteResult(k.FtAnchorComponent(i, 0, nominalMax)),
        y: finiteResult(k.FtAnchorComponent(i, 1, nominalMax)),
        value: finiteResult(k.FtAnchorComponent(i, 2, nominalMax)),
      }));
    },
  });
}
