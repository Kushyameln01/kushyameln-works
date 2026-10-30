# Hike projection bridge ABI

These primitives implement a bounded partial-operation boundary, not a complete
model predictor. `bridge.hike` is compiled with pinned Hike commit
`3c51fde6675f317453919bd505d0e2d0f638e7f1`, WABT normal.

| Export | WASM parameters → result | Operation |
| --- | --- | --- |
| DequantScale | i32,i32,f32,i32,i32 → i32 | E4M3FN q pointer, count, scalar scale, f32 out pointer, capacity |
| AddBias | i32,i32,i32,i32,i32 → i32 | f32 y pointer, bias pointer, count, f32 out pointer, capacity |

Pointers are transient byte addresses in the same Instance's Memory. Host arenas
are disjoint, 4-byte aligned where f32 is used, and caller-owned. Dequant supports
1..81,920 codes and add-bias supports 1..16 elements. The E4M3FN NaN codes `0x7f`
and `0xff` are rejected. Scale must remain finite and positive after f32 rounding.
All arithmetic is f32. Signed zero is preserved by multiplying the decoded value
by -1 rather than using the fixed compiler's subtract-from-zero unary path.

Return 0 means success; -1 means count/capacity failure; -2 means invalid numeric
input or FP8 NaN; -3 means nonfinite arithmetic output. Overflow can leave partial
private output: the host discards it and clears its whole 409,728-byte arena before
returning an error. Successful outputs are owned copies; caller arrays are not
mutated or detached. The arena is allocated once beyond the compiler's initial
Memory. No allocator/free bridge or per-iteration declarations are used.

`hike.mjs` snapshots input WASM bytes before asynchronous hash/compile and checks
the requested SHA-256 against those same bytes. It performs no JS numerical
fallback. `dispose` releases host references and refuses future calculations;
it does not promise immediate OS memory reclamation.

Rebuild with a verified toolchain:

```sh
DIFFUSION_TOOLCHAIN=/workspace/work/diffusion-investigation/toolchain python kernel/build.py
node test-kernel.mjs
```

`build-record.json` records source/compiler/WASM/WAT/runtime hashes and checked
ABI signatures. `node-results.json` contains eight primitive tests and fixed
Memory reuse evidence. `exhaustive-results.json` records 1,016 exact comparisons
covering every finite FP8 code at four scales, including the actual LOW/HIGH
scalar scales. Neither test establishes complete-model execution or original
FP8 scaled-matmul equivalence.
