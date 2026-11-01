# N2 Self-Attention O, Gate and Residual Plan

**Goal:** Extend the accepted naturalN2 block0 attention with actual O projection, chunk2 gating and residual addition from the original `patchHidden`.

**Spec:** User requirements1–4. Fixed ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`, `comfy/ldm/wan/model.py` self-attention and block forward. Baseline distribution `caa521ca23d1e32b36775d0a913b0731962c5df4`, numerical runtime `e48021d8da29ef3b3b9e9d6161331c282798b6b3`. Latest remote workbranch matches the baseline at task start.

**Architecture:** Reuse trusted full prefix artifacts' `patchHidden` and `timeAct1`. Their time projection contains only chunks0/1; compute only rows10240..15359 plus bias and modulation chunk2. Existing private artifacts lack actual runtime attention context, so rerun only accepted N2 downstream and save a new context artifact. A new independent tail owner reads actual O/gate ranges using the existing Hike decoder and dynamic ORT Gemm. A dedicated Hike kernel performs modulation+time gate, broadcast multiplication and residual addition. Keep old numerical modules and receipts unchanged.

**Tech Stack:** Browser File/Blob, existing Hike decoder/ORT1.24.3 dynamic Gemm, pinned Hike compiler/WABT, independent Python/NumPy reference, existing resource observer.

## Fixed scope and numerical rules

- Exact natural N2, width5120, block0, HIGH scheduleIndex1 / LOW3; independent side cases, not a HIGH→LOW handoff.
- `O = attention @ W_o.T + bias_o`.
- `timeGate = timeAct1 @ W_time[10240:15360].T + bias_time[10240:15360]`.
- `gate = f32(modulation_chunk2 + timeGate)` broadcast from5120 across2tokens.
- `gated = f32(O * gate)` and `residual = f32(patchHidden + gated)`. Never use post-modulation hidden as residual source or apply scale+1 to gate.
- Explicit F32 separate multiply/add diagnostic. Original torch.addcmul fused/GPU precision parity is unaccepted.
- Storage/fullshape/profile come from actual pinned headers; FP8 O uses its own scalar scale/config, gate projection/modulation are checked as F16. No implicit FP8→production precision substitution.
- Old source, native profile, catalogs and receipts are unchanged; new tail has a separate profile `bernini-block0-n2-self-attention-residual-f32-v1`.
- `load/predict/sample=NOT_READY`; cross attention, FFN, later blocks/timesteps, original81frame/context/precision and full resource budget remain unaccepted.
- No private arrays/weights in Git, no fullmodel run/download/rehash, merge or Pages deploy.

## Precomparison gates

These are fixed before observing new tail outputs. Decoder bytes must match the independent decoder exactly. O projection local gate: abs1e-4+rel1e-5, matching the prior F32 projection envelope. Time-gate projection and gate addition: abs1e-3+rel1e-4, matching the prior time-projection envelope. Local gated/residual outputs: abs1e-3+rel1e-4. Independent-prefix composed O/gated/residual: abs1e-2+rel1e-3. Check every value with `abs(error)<=absolute+relative*abs(reference)` and reject nonfinite values. Do not relax thresholds after comparison.

Tail pointwise input admission requires compact nonshared finite arrays, exact shapes, and |O|/|gate|/|patchHidden|<=1e16 so the separated F32 product/add cannot overflow. Trusted input receipts bind actual context, patchHidden and timeAct1 bits to exact side/block/timestep and previous artifacts. Unknown or conflicting bindings fail closed.

## Independent tasks

1. **Core/artifact inventory and reference:** `development/ai-connection/self-attention-tail/core/` and `tools/diffusion-models/tail-reference.py`. Verify original source, retained full prefix arrays, absent chunk2/actual context, actual key/fullshape/storage/offset/scale. Freeze machine-readable plan and independent local/composed reference recipes before comparisons. Read only missing selected ranges and save private references without overwriting old artifacts.
2. **Runtime:** new `ort-bridge/self-attention-tail/` containing a narrow range-bound provider, Hike source/host/build/registry, tail stage and boundary tests. Reuse decoder/Gemm/cleanup primitives. Export `createSelfAttentionTail({file,side,trustedInputs,bridgeBytes,mathBytes})`; `run({attention,patchHidden,timeAct1,signal,onProgress})` returns owned `{o,gateProjection,gate,gated,residual,evidence}`. Coordinate exact `trustedInputs` schema with the harness. Test basis swap, shape/finite/range/side/time/binding, snapshot/reentry/cancel/cleanup before acceptance.
3. **Integration/resources:** new `diagnostics/self-attention-tail/` and `tools/diffusion-models/tail-browser.py`. Reuse full prefix evidence, produce actual N2 context once per side with old gates, dispose its owner, run tail and compare independent local/composed references. Measure Memory identities, active sessions, source/decoded weight snapshots, retained caller outputs and cumulative copies. Keep unknown allocator/GC/host peak null. Publish only hashes/metrics.
4. **Root delivery:** extend main build closure/receipt verifier for new tail kernel; run changed-boundary tests and native identity regression, independently review new source/receipts, write reuse/new/unaccepted results and fixed SHA index, push workbranch and update Draft PR14. Verify GitHub retrieval.

## Review focus

- patchHidden basis must be pinned independently of the post-modulation hidden and context; a caller's success boolean cannot authenticate it.
- Gate is chunk2, with source fullshape preserved and row/element10240 offsets; chunks0/1 cannot be substituted.
- O has its own FP8 scale/config and output bias; shape5120x5120 is not the old16-row diagnostic target.
- Local references use exact actual runtime input bits; composed references use independent prefix/attention inputs. No reference values are supplied as actual context.
- Numeric multiply/add, owner lifecycle, physical Memory capacity and named host spans are separate facts. Source freezing precedes accepted runs; a source change requires rechecking only affected boundaries.

## Execution record

Core/reference, runtime and integration tasks complete. Both side units pass all8local/composed comparisons,71680values/side, zero failures. Newfocused32tests, native22regression cases and9bounded lifecycle cases pass. Independent review has no remaining blocker. Added private保存replay matches all5accepted output bit hashes and changes no accepted source/metric. Execution source commit `a49aac492cc68e2dd6037e0deb4a6954731a847a`; distribution metadata commit follows. Cross/FFN/allblock/generation remain later and NOT_READY.
