# Exact N2 self-attention residual diagnostic

This independent owner extends the accepted block0 natural N2 context through O projection, time/modulation chunk2 gate, and residual addition from the original full-prefix `arrays.patchHidden`. It preserves the old numerical operator source, profiles, descriptors and receipts; the enclosing build closure adds this new owner. The separate execution profile is `bernini-block0-n2-self-attention-residual-f32-v1`; HIGH schedule1 and LOW schedule3 are independent cases.

```js
import {createSelfAttentionTail} from './stage.mjs';
const owner = await createSelfAttentionTail({file, side, trustedInputs, bridgeBytes, mathBytes});
try {
  const {o, gateProjection, gate, gated, residual, evidence} = await owner.run({
    attention, patchHidden, timeAct1, signal, onProgress
  });
} finally {
  await owner.dispose();
}
```

`attention` and `patchHidden` are compact nonshared finite F32[2,5120] arrays represented as length10240 typed arrays. `timeAct1` is compact nonshared finite F32[5120]. The owner copies all three before its first await. Unknown run fields, alternate side/block/time, production flags, partial views, nonfinite values and numeric admission violations fail closed. `describe()` returns copied metadata; caller outputs own their storage after disposal. Input callbacks observe BUSY before their getters can reenter. Cancellation is checked after every asynchronous boundary. Failed native Tensor/session release retains the original handle, blocks reuse with `RECOVERY_REQUIRED`, and is retried by `recover()`; recovery disposes the owner.

`trustedInputs` has schema `bernini-self-attention-tail-trusted-inputs/0.1`, `side`, `blockIndex:0`, `scheduleIndex:1|3`, `tokens:2`, and these exact nested fields:

- `fullPrefix`: `receiptSHA256`, `artifactSHA256`, `patchHiddenSHA256`, `timeAct1SHA256`.
- `attention`: `receiptSHA256`, `artifactSHA256`, `contextSHA256`, `fullPrefixReceiptSHA256`, `fullPrefixArtifactSHA256`.
- `productionHiddenVerified`, `originalWorkflowInputsVerified`, `originalProductionPrecisionVerified`, `fullBlockVerified`, `modelInference`, `lowIsHighHandoff`: all `false`.
- `load`, `predict`, `sample`: all `NOT_READY`.

The original full-prefix receipt/artifact and array hashes are pinned per side in `trusted.mjs`. The two capture receipts and actual context artifacts are also pinned; the capture harness independently checked their bodies before these IDs were frozen. Actual context bits must additionally equal the old accepted `context-local.actualSHA256`; actual residual/time bits must equal the original receipt stage hashes. The owner does not authenticate arbitrary new artifacts from a caller success boolean or self-consistent hashes. A different artifact requires a separately reviewed trust/profile update.

Only five original parameter keys are registered. O is fullshape[5120,5120] FP8 E4M3 with its own F32 scalar scale and exact `{"format": "float8_e4m3fn"}` configuration, plus F16 output bias. The provider preserves original fullshape[30720,5120] for `time_projection.1.weight` while allowing only rows10240..15359; the original bias and modulation allow only element10240..15359. Reads are limited to16rows/81920decoded values or5120vector values. The old Hike bridge decodes selected values and adds bias; the old dynamic ORT Gemm receives runtime weights and uses one session with SiLU excluded. Header/config reads are counted separately from selected payload bytes. No full-file hash is recomputed.

The import-free pinned Hike kernel computes `gate=f32(modulation_chunk2+gateProjection)`, `gated=f32(o*gate)`, and `residual=f32(patchHidden+gated)`. It adds no1 to the gate. `abs(o)`, `abs(gate)` and `abs(patchHidden)` must be <=1e16. Its multiplication and residual addition remain separate F32 instructions. This is a numerical diagnostic; original torch.addcmul fused/GPU precision parity is unaccepted.

`stats()` and evidence distinguish fixed physical Hike Memory capacity, arena spans, one active ORT session, retained output extents, selected source bytes, and cumulative copy traffic. They leave ORT allocator, GC, File backing and total host peak unknown. The kernel uses a225280byte arena inside its1310720byte Memory; the independent observer identifies the actual native Memories. A session count is not a Memory count. No full resource budget is accepted.

Build with `PYTHONDONTWRITEBYTECODE=1 DIFFUSION_TOOLCHAIN=/workspace/work/diffusion-investigation/toolchain python build.py`. The builder verifies the original pinned compiler/Hike identities and records source, host, builder, runtime, WAT, WASM and ABI identities. Run `node test-math.mjs`, `node test-source.mjs`, `node test-trusted.mjs`, and `node test-stage.mjs`. `test-browser.py` exercises bounded actual native lifecycle failures without completing a tail; the integration harness separately requires all local/composed reference gates before accepting the complete O/gate/residual unit.

Cross-attention, FFN, later blocks/timesteps, original81frame/context/precision, production generation and the full resource budget remain unaccepted. `load/predict/sample=NOT_READY` throughout.
