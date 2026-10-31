# Actual-weight QKV operator diagnostic

This module executes actual Bernini block0 Q/K/V weights with an **explicit supplied hidden fixture**, full5120-dimension QK RMSNorm, the fixed core's separate axis/source RoPE matrices and one-head attention over16 declared selected keys. It does not produce an upstream model hidden state, full-sequence QKV, all-head attention, output projection or a model prediction. `productionQKVVerified:false`, `actualModelHiddenVerified:false`, `P5:BLOCKED` remain part of the receipt.

The execution profile is `bernini-block0-qkv5120-norm-rope-selected16-head0-f32-v1`. Its new native identity names this diagnostic only. It does not replace `EXEC-ATTENTION-Q16-ONEHEAD` or any catalog/native identifier.

## Interface and ownership

```js
import {createActualQkvDiagnostic} from './stage.mjs';
const diagnostic = await createActualQkvDiagnostic({
  file: immutableOriginalFile, side:'LOW' // or the separately verified HIGH side
});
const result = await diagnostic.run({
  hidden,    // compact nonshared finite Float32Array(16*5120)
  positions, // compact Float32Array(16*3), T/H/W for each selected token
  sourceIds, // compact Int32Array(16); original source IDs, never slot renumbering
  signal, onProgress
});
await diagnostic.dispose();
```

The fixed target grid is `[21,30,52]`; each explicit integer coordinate must lie within that grid. Coordinates and source IDs retain supplied order and duplicates. The independent candidate includes source0/1/2 and nonzero T/H/W positions. It does not certify that those context streams have been generated or that the16 keys represent all32760 target/context tokens.

The factory verifies the original side's expected file size/header hash, full tensor descriptors and actual scale/config bytes. It reads only one81,920-byte FP8 row tile at a time. Returned weight blocks, biases and norms are owned F32 values decoded by the existing Hike bridge. Omitted model parameters are not read. The expected full model hash inherits the original owner's receipt; this factory does not rehash/authenticate all15.57GB.

`run` acquires BUSY before caller getters, owns all input arrays before its first await, and returns independent arrays: `qkv.{q,k,v}` `[16,5120]`, `norm.{q,k}` `[16,5120]`, `matrices` `[16,64,2,2]`, selected-head `q/k/v` `[16,128]` and `attention` `[16,128]`. Full intermediate arrays are retained intentionally for all-value comparisons and included in resource accounting.

Cancellation is cooperative around each original read/ORT row stage. The current bounded synchronous Hike call may finish. A cancelled run refuses its result; the next call reuses fixed workspaces. Active disposal is rejected: cancel and await first. Disposal attempts all owned resources independently. A failed handle stays owned and new work returns RECOVERY_REQUIRED; `dispose()` or `recover()` retries. A construction error with failed cleanup retains the original error and a local `recover()` callback. Disposal releases only the two owned ORT sessions and four owned Hike instances, not the original caller File or another module. OS release/GC timing is not guaranteed.

## Actual numerical boundary

Each Q/K/V full5120 projection uses320 runtime-input row tiles. Actual ORT1.24.3 F32 Gemm computes `[16,5120] × [16,5120]^T → [16,16]`; existing Hike FP8 decoding and bias addition preserve their profiles. All three full outputs are computed before selecting a head. FP8 storage plus scalar F32 scale is **not** original GPU/scaled_mm/activation-quantization parity.

Q and K use the actual F16 norm weights decoded to F32. Before RMSNorm, this diagnostic admits only projected values with `abs(x)<=1e16`:5120×(1e16)²=5.12e35 leaves ample margin below finite F32, so the reused square-sum cannot overflow. Finite huge values outside this range are refused, not converted to apparently valid zero norms. This is a candidate-only admission repair, not a new gate or a change to the shared Hike kernel. The low-level shared Hike tensor kernel performs rows16, columns5120, epsilon1e-6. Its reuse is a new QK diagnostic acceptance scope, not a claim that the UMT5 Text profile accepts5120. The pinned existing binary is `9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8`; host/source hashes and historical build receipt remain separate from the new RoPE builder. V is neither RMS-normalized nor rotated.

After full Q/K normalization, head0's128 values are selected. The new real Hike RoPE kernel uses FP64 pow/cos/sin primitives, FP32 matrix conversion, T/H/W dimensions44/42/42 and separate full128 source-ID rotation. It composes two2×2 matrices in F32 rather than adding angles. [ABI.md](ABI.md) defines the pinned kernel interface and capacity. Existing stream attention receives only verified postnorm/RoPE selected Q/K and projected V through its current versioned precomputed-source boundary; that schema's provenance label does not establish production activation provenance.

## Reference and gates

The plan and independent recipe are `development/ai-connection/profile-adoption/p4/candidate-plan.json` and `tools/diffusion-models/p4-reference.py`. Gates were fixed before comparison:

| Boundary | Gate |
| --- | --- |
| all raw/decoded weights, biases, norm weights | SHA-256 of every supplied F32 byte agrees with independent decoder |
| full Q/K/V projection | abs1e-4 + rel1e-5 |
| full5120 QK norm | abs1e-4 + rel1e-4 |
| all RoPE matrices | abs2e-6 + rel2e-6 |
| selected-head RoPE application | abs1e-4 + rel1e-4 |
| connected selected16-key attention | abs1e-3 + rel1e-4 |

The formula is `abs(actual-ref) <= absolute + relative*abs(ref)`. Independent projection uses F32 decoded weights with binary64 accumulation then F32 output/bias; norm additionally compares against binary64 mean-square/sqrt. The sequential F32 reduction/sqrt bridge is not an asserted Torch GPU fused-rsqrt implementation.

Generate private references from an authorized original File, then run the browser explicitly:

```sh
python tools/diffusion-models/p4-reference.py --help
python tools/diffusion-models/p4-browser.py \
  --model /private/Bernini_LOW_fp8_e4m3fn_scaled.safetensors \
  --reference /private/reference-LOW.json \
  --output /private/browser-LOW.json
```

The browser gets the original through its local File picker; there is no original model HTTP endpoint. Expected arrays remain in an external private reference file and the local browser evaluation. Public results contain hashes, comparisons, resources and scoped receipts, without raw model weights or private expected arrays.

## Resource scope

The unit retains983,040 B of full QKV and655,360 B of full QK normalized results. Caller/owned hidden together are655,360 B; each decoded weight tile is327,680 B, raw tile81,920 B; base bias/norm parameters102,400 B, with one current20,480 B parameter copy. Named buffers and four fixed Hike Memories are separated from ORT allocator, unreclaimed arrays, metadata and the private reference harness.

The three original FP8 weights total78,643,200 read bytes. Each of960 ORT stages has logical input655,360 B and output1024 B; this is transfer traffic rather than simultaneous live RAM. The reused bridge clears its491,648-byte arena after every operation:16,320 operations produce8,023,695,360 B of arena-clear writes. These writes are reported separately from input/output copies and peak residency. A small tile does not imply a cheap or accepted full-sequence implementation.

P4 receipts record elapsed stage times and observed owned Chromium PSS including constructor/tests/private-reference harness. Unknown ORT/producer allocation remains null. Full32760(+context) sequences, all40 heads/blocks, original compute precision, model input production and the combined full pipeline budget are not established by this unit. `load/predict/sample` remain NOT_READY.
