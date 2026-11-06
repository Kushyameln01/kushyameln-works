# Diffusion public runtime and original-shape verification plan

**Goal:** Complete the existing D1–D4 scope through the public API/Worker, retaining full target/context geometry and base HIGH3→LOW3 semantics.

**Architecture:** Adapt the existing model/sampler owners into the existing dedicated Worker. Add bounded output-only chunk diagnostics to the same model executor. Improve immutable weight IO and ownership, preserving numerical operations and measuring changes against independent references.

**Tech stack:** Existing JavaScript modules, Hike WASM kernels, ORT WASM, canonical tensor codec; independent NumPy reference only in development.

**Spec:** User continuation request and the full body of `page_1e950f67b0688191bd3f2a1d5b252224`, version 1.0 draft 1; baseline `3aed2f696adf36385b54cfaa5019d447d64984e0`.

## Fixed constraints

- Target `[1,16,21,60,104]`; ordered source→reference_video→reference slots and each frame, actual canonical shape helper, token-axis concatenation and source_id/RoPE.
- Original Euler/simple6/shift5/split3 and CFG1. HIGH public/internal conversion and generated-only restoration exactly once.
- No normal input reference, numerical gate, fixture hash or receipt requirement. No prediction replacement callbacks.
- Existing N5/L3, full40/head/six/HIGH→LOW/restoration/codec evidence retains its original source and scope.
- Keep old 128-token `diagnose`; add chunk diagnostics without giant all-intermediate snapshots.
- Availability of implemented operations is separate from confirmed numerical domains and workflow/generation READY. Do not advertise unverified shape acceptance.
- Unknown original media/context resolution and original mxfp8 compute dtype remain unknown. Request their descriptors asynchronously; continue independent adapter and explicitly named controlled full-shape cases.
- No merge or Pages publication. Push code, evidence, documentation to existing branch/Draft PR.

## Review focus

1. Parent cancellation destroys the Worker and invalidates loaded model session; retry requires reload and ignores delayed responses.
2. Chunk diagnostics preserve operation order, own only bounded copies, release after comparison, and never replace calculated values.
3. Read-ahead stays inside original tensor bytes; physical IO and logical requested/decode extents are distinct.
4. Prepared weights are owned opaque native handles; caller arrays are preserved by default, private transfer is explicit, stale/released/foreign handles fail.
5. Controlled full-shape and real saved L512 are distinct from unresolved original workflow media/prompt/precision.

## Work

- [ ] Public adapter (`api/model-adapter.mjs`, `api/index.mjs`, `api/worker.mjs`): actual paired load, side predict, sample, status, unload, canonical save/read, progress, cancellation and session epochs. Unit tests first; actual Worker tests after source freeze.
- [ ] Runtime (`execution/model-candidate.mjs`): `diagnoseChunks(input,{onChunk,stages,maxRows,stopAfterBlock})`, per-operator/stage timing and bounded actual output chunks. Existing full predict and small diagnose retain their semantics.
- [ ] Weight/ORT ownership (`execution/model-weights.mjs`, `model-read-window.mjs`, `batched-ops.mjs`): explicit bounded read-ahead and prepared weight handles; separate copies observed at the owner from unmeasured native uploads. Compare changed boundaries before adoption.
- [ ] Input/oracle (`tools/diffusion-models/production-reference.py`, production development folder): audit original workflow's unresolved inputs, preserve actual L512 payload/mask/provenance, freeze identities/gates, independently compare all emitted chunks without storing all intermediates.
- [ ] Original-shape staged run: real model prefix→all Q/K/V→all query/key/head attention→cross/FFN for block0, then full40/head, then six updates as earlier stages are accepted. Record first actual blocker with stage, shapes, tokens, source, time/memory/errors; no shape reduction or impossibility claim.
- [ ] Public Worker validation: actual base execution, cancel/reload/retry, HIGH/LOW selection, dispose, canonical file save and actual disk readback. Reuse existing independent tensors and references rather than re-exporting for ACK.
- [ ] Verify changed source boundaries, preserve all unaccepted scopes, update API/PR description and push complete source SHA plus reproducible evidence.

## Current input resolution

The retained original workflow references missing `132123.mp4`, `0000.png` and slot image files. Cap81 does not prove actual source F81; bypass/slot priority is unresolved. Original model names are mxfp8 while retained provided files are scaled E4M3FN. The user confirmed these are unknown and explicitly authorized separate declared cases. Original mxfp8 equivalence remains unconfirmed and is not a standalone completion gate.

An independent controlled full-shape operator case may explicitly declare source F81 and three 848×848 images, no reference_video. Its expected N is 73,947, confirmed by the canonical helper; it is not the original resolved workflow or completion evidence for it. Saved real Text L512 remains all512 rows including its mask; metadata-only normalization declaration must be sourced and logged without numerical re-normalization.

## Execution authorization

The user supplied the implementation scope, order, evidence policy, completion criteria and instruction to proceed. Routine implementation and reversible checks are authorized. Original media/context and original mxfp8 precision remain unconfirmed; the user explicitly authorized separately declared full-target cases and the fixed scaled-FP8/F32 baseline. These unknowns do not block standalone implementation or validation. Do not add another design approval gate.
