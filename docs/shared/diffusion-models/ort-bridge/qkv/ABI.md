# Source-aware RoPE diagnostic ABI

This Hike kernel implements only the RoPE matrix/application part of the bounded QKV operator diagnostic. It does not produce a model hidden state, QKV projection, RMSNorm, a whole attention block or a generated sample. The candidate's activation source and original production compute precision remain separate acceptance conditions.

## Fixed numeric recipe

ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` Wan/Flux core uses T/H/W RoPE dimensions44/42/42 for a128-wide head. Pair indices0..21 use T/dim44,22..42 use H/dim42,43..63 use W/dim42. For axis-local pair i, this diagnostic evaluates f64 exponent `2*i/dim`, omega `1/pow(10000,exponent)`, and angle `f64(position_f32)*omega`. The core's f64 linspace frequency construction is independently compared before accepting this diagnostic; equivalent real formulas do not certify backend bit equivalence.

The only host imports are fixed f64 mathematical primitives `env.cos(f64)->f64`, `env.sin(f64)->f64`, and `env.pow(f64,f64)->f64`, bound to ECMAScript `Math.cos/sin/pow`. All model indexing, f64-to-f32 boundaries, f32 matrix multiplication and vector application execute in Hike. There is no model-math fallback implemented in JavaScript.

Each axis matrix is f32 `[[cos(angle),-sin(angle)],[sin(angle),cos(angle)]]`. A nonzero native source_id creates a **separate** full128 rotation using pair0..63/dim128, converts that matrix to f32, then multiplies `axisMatrix @ sourceMatrix` using separate f32 products and sums. Source0 skips the extra composition, matching the core branch. Angle addition is not substituted. Application computes each output pair with two f32 products and one f32 sum per component.

Source IDs are explicit caller-supplied native coordinates; this operator does not infer them from management slots or insert an empty context stream. The accepted sourceIds are Int32 values0..16,777,216, which remain exact through the source's f32 conversion. The tested candidate uses source0/1/2 and explicit nonzero T/H/W positions. Acceptance of input bounds is not a production-input provenance proof.

## Exports and memory

| export | parameters → status |
| --- | --- |
| Build | positionsPtr, sourceIdsPtr, rows, matrixOutPtr, capacity → i32 |
| Apply | valuesPtr, matricesPtr, rows, vectorOutPtr, capacity → i32 |

All pointers are byte addresses in this instance's Memory only, aligned4 bytes and host-owned in disjoint arenas. `Build` accepts rows1..16, three f32 coordinates and one i32 source ID per row, and emits256 f32 values per row. Capacity must be at least rows×256 and at most4096. `Apply` accepts128 f32 values and256 f32 matrix values per row, and emits128 f32 values per row, with capacity at least rows×128 and at most2048.

Status0 succeeds; -1 rejects shape/capacity; -2 rejects nonfinite input or invalid source ID; -3 rejects nonfinite arithmetic/output. A -3 path may have written earlier pairs. The host never exposes a failed output and clears the entire arena on every success/error path.

The same-realm host `createQkvRope({wasmBytes?})` exposes:

```js
const matrices = rope.matrix({positions: Float32Array(48), sourceIds: Int32Array(16)});
const output = rope.apply({values: Float32Array(2048), matrices});
const evidence = rope.stats();
rope.dispose();
```

Host tensors must be finite, compact and nonshared; sourceIds have the exact integer type/range. All inputs and outputs are owned snapshots. BUSY is acquired before destructuring/getters; reentrant operations and active disposal are refused. Operations are synchronous bounded calls; the parent runtime performs cooperative cancellation around them. No pointer, function or AbortSignal is serialized as a MessagePort payload.

The fixed arena is33,024 bytes: positions192, source IDs64, matrix16,384, values8,192, output8,192. Construction grows Memory once and recreates views; calls reuse it without growth. The pinned compiler's Memory becomes1,114,112 bytes. Arena bytes are part of that Memory, not an additional resident allocation.

One matrix call owns256 snapshot bytes, copies256 bytes into WASM and copies16,384 output bytes back. One apply call owns24,576 snapshot bytes, copies24,576 bytes into WASM and copies8,192 output bytes back. Counters separate snapshot traffic, WASM input and output copies. Original caller buffers, kernel/compiled module, metadata, garbage not yet collected and parent sessions add separately; these counters are not a total process/RSS peak.

## Builder and validation

The owner builder pins Hike `3c51fde6675f317453919bd505d0e2d0f638e7f1`, compiler SHA-256 `fb4588cba306b8dded91ad02735254681eaca08fa997f55919185cd607e89b26`, WABT1.0.39 normal. It checks exact imports/ABI, records source/host/builder/WASM/WAT/runtime digests and normalizes generated runtime trailing whitespace. The host verifies the shipped WASM hash before compiling and accepts only the three specified imports.

The gates were fixed before runtime comparison: matrix `abs2e-6+rel2e-6`, applied selected vectors `abs1e-4+rel1e-4`. Unit tests verify all matrix/vector outputs and native refusal/ownership/BUSY/reuse. The P4 independent Python reference and full connected operator receipts define the model-comparison scope separately. These gates do not establish original GPU precision, actual production activations, allquery/allhead execution or P5 readiness.

The independent NumPy f64-linspace/power/trig oracle also matches all4096 matrix values and both selected Q/K application arrays (2048 values each) exactly in the recorded LOW case. The apply inputs in this isolated check are the oracle's full5120 norm arrays; the parent connected test must independently verify the actual runtime QKV/norm stages. Results contain only counts/error metrics/hashes, not the private oracle arrays.

```sh
DIFFUSION_TOOLCHAIN=/path/to/pinned-toolchain python docs/shared/diffusion-models/ort-bridge/qkv/build.py
node --test --test-isolation=none docs/shared/diffusion-models/ort-bridge/qkv/test-rope.mjs
node docs/shared/diffusion-models/ort-bridge/qkv/test-rope-reference.mjs /private/reference-LOW.json /path/to/metadata-result.json
```
