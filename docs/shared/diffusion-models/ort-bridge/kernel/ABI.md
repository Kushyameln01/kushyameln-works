# Hike projection bridge ABI

These primitives implement a bounded partial-operation boundary, not a complete
model predictor. `bridge.hike` is compiled with pinned Hike commit
`3c51fde6675f317453919bd505d0e2d0f638e7f1`, WABT normal.

| Export | WASM parameters → result | Operation |
| --- | --- | --- |
| DequantScale | i32,i32,f32,i32,i32 → i32 | E4M3FN q pointer, count, scalar scale, f32 out pointer, capacity |
| AddBias | i32,i32,i32,i32,i32 → i32 | f32 y pointer, bias pointer, count, f32 out pointer, capacity |
| DecodeF16 | i32,i32,i32,i32 → i32 | little-endian IEEE binary16 byte pointer, element count, f32 out pointer, capacity |

Pointers are transient byte addresses in the same Instance's Memory. Host arenas
are disjoint, 4-byte aligned where f32 is used, and caller-owned. Dequant supports
1..81,920 codes, half decoding supports 1..81,920 elements, and add-bias supports
1..16 elements. The E4M3FN NaN codes `0x7f`
and `0xff` are rejected. Scale must remain finite and positive after f32 rounding.
All arithmetic is f32. Signed zero is preserved by multiplying the decoded value
by -1 rather than using the fixed compiler's subtract-from-zero unary path.
`decodeF16(Uint16Array)` copies bit patterns into the arena as explicit
little-endian bytes before invoking real Hike. Finite binary16 values, including
subnormals and negative zero, convert exactly to binary32. Exponent31 (both
infinities and all NaNs) is rejected before any output element is written.

Return 0 means success; -1 means count/capacity failure; -2 means invalid numeric
input, FP8 NaN or nonfinite F16; -3 means nonfinite arithmetic output. Overflow can leave partial
private output: the host discards it and clears its whole 491,648-byte arena before
returning an error. Successful outputs are owned copies; caller arrays are not
mutated or detached. The arena is allocated once beyond the compiler's initial
Memory. No allocator/free bridge or per-iteration declarations are used.
The input arena is 163,840 bytes, shared sequentially by FP8 or half input,
followed by 327,680 bytes of f32 work, 64 bytes of bias and 64 bytes of output.
The fixed instance Memory is 1,572,864 bytes after allocation; this includes
compiler Memory and page rounding. Views are recreated against current
`memory.buffer` after growth. Half input doubled the input arena; it did not
raise the pointwise API limit or change the separate fixed mean kernel.

`hike.mjs` snapshots input WASM bytes before asynchronous hash/compile and checks
the requested SHA-256 against those same bytes. It performs no JS numerical
fallback. `dispose` releases host references and refuses future calculations;
it does not promise immediate OS memory reclamation.

Rebuild with a verified toolchain:

```sh
DIFFUSION_TOOLCHAIN=/workspace/work/diffusion-investigation/toolchain python kernel/build.py
node test-kernel.mjs
node test-half.mjs ../../../../development/ai-connection/half-green.json
```

`build-record.json` records source/compiler/WASM/WAT/runtime hashes and checked
ABI signatures. `node-results.json` contains eight primitive tests and fixed
Memory reuse evidence. `exhaustive-results.json` records 1,016 exact comparisons
covering every finite FP8 code at four scales, including the actual LOW/HIGH
scalar scales. Neither test establishes complete-model execution or original
FP8 scaled-matmul equivalence.
`test-half.mjs` also checks every finite half bit pattern (63,488) against
independent native `DataView.getFloat16`, invalid values, caller ownership,
fixed Memory reuse, raw ABI validation and disposal. Its JavaScript reference
exists only in tests; the production bridge has no numerical fallback.
