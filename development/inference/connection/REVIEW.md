# connection-1 independent review

Review scope: the working tree on `codex/inference-connection-contract`, based on `a33b311e45a75a6c683242286fef608c7b3770a9`. Product files were read only. No model export, model inference, publication, or push was performed. This report is the reviewer's only repository edit.

## Findings and follow-up status

1. **Resolved — serialization could remove a marker that makes a raw latent invalid.** `docs/shared/inference/vae.mjs:22` correctly rejected a top-level `normalization` marker on either raw posterior means or declared raw generated samples, but the first version of `tensor.mjs` did not validate or retain that marker. Reproduction with a valid-shaped `raw-posterior-mean`, correct VAE hash, finite zero payload, and `normalization:'wan21-comfy-f32-v1'`: direct VAE validation failed with `Raw decoder input cannot carry a normalization marker`; `decodeTensor(await encodeTensor(tensor))` had no marker and passed VAE validation. Shared metadata validation now rejects these contradictory raw markers, as well as a wrong marker on the versioned normalized mean. The new negative regression passes. No numerical normalization changed.

2. **Resolved — sparse frame arrays passed validation but could not be read back.** The initial `Array.some` checks skipped holes. `sourceFrameIndices:[1,,3]` and `sourceFrameTimesSeconds:[0,,.2]` passed `snapshotTensorMetadata` and `encodeTensor`. The snapshot contained `undefined` entries, which JSON converted to `null`; `decodeTensor` rejected the file with `Invalid source frame mapping`. Validation now checks `Array.from` copies, so holes become invalid values before acceptance. Separate sparse-index and sparse-timestamp regressions pass.

3. **Resolved — baseline and final behavior were mixed in documentation.** The original wording described mean-only VAE input and the old writer as current. `DIFFUSION-CONTRACT.md` now labels that table as the `a33b311` baseline, separately describes the implemented consumer, and distinguishes the old writer from the new metadata codec. Final Text/VAE and Diffusion API documents describe the paired declaration contract, producer/decoder identity, context preservation, encode-only input-frame count, manager ownership, storage, transfer/cancellation/configuration, and bounded profile acceptance consistently. The actual Diffusion producer and sampling status remain `NOT_READY`.

## Context continuity follow-up

The initial Diffusion `latent-space/latent-space.mjs` transforms created fresh tensors without `context`. The implementation now copies the validated context into an owned object through both mean operations. The added fixture runs the actual pinned 128-element Hike kernel twice, stores/reads the normalized tensor, verifies context retention and owned copies, and checks raw restoration error ≤2e-6. The numerical kernel and arithmetic did not change; generated samples are still rejected by these mean-only operations. This is a bounded mean/context test, not an actual model pipeline acceptance.

The manager still owns ordered context lists, positive/negative sharing, and association with source media. The final VAE encode validator additionally requires the context index count to equal RGB input F, and its valid/missing-frame fixtures pass. Decode does not impose latent T as the source-frame count. These structural checks do not establish the source-media truth of the declared indices, timestamps, or digest.

## Verified properties

- The legacy fixture serializes byte identically with the old field set and still decodes from Node `Buffer`.
- New metadata snapshots precede asynchronous payload hashing. Data, shape, model identity, mask, tokenizer binding, context arrays, and generated-sample producer declarations are copied for serialization.
- Text API inputs distinguish plain text from explicit ID/mask input and reject mixed modes, invalid IDs, coercible string IDs, invalid mask values, and all-zero masks. Internal masked positions remain in the existing runtime test; trailing compaction behavior is unchanged.
- New Text output identifies the paired tokenizer; the explicit-ID mode does not claim actual tokenization was performed. Conflicting declared tokenizer identity is rejected by the Diffusion conditioning boundary; legacy conditioning without the optional hash remains accepted.
- The generated-sample consumer keeps its own meaning, binds the decoder separately from the producer list, rejects absent/duplicate/foreign producer declarations and wrong restoration ownership/state, and leaves old posterior-mean provenance behavior intact.
- VAE copies context to its result and records latent declarations in evidence. It does not numerically normalize or restore a generated sample. `declaredOnly:true` and `realGenerationVerified:false` accurately limit capabilities.
- No new change was found to shared busy handling, module-local cancellation, configuration cloning, explicit MessagePort transfer, old-response matching, or disposal semantics. These remain within the existing single-executor contract; transport unbinding remains transport only.
- Profile inventory correctly separates the accepted 5×16×16 graph from source-derived F=1, non-square, and 81×480×832 candidates. Its single-tensor byte counts and fixed-graph/cache restrictions do not imply runtime acceptance or peak-memory feasibility.

## Checks run

`node tools/inference/test-connection-contract.mjs`: **9/9 PASS** before the above negative cases were added. The normalization-marker and sparse-array counterexamples were executed independently and reproduced the defects despite that green suite. After the fixes and actual Hike/context fixture, the same script reports **12/12 PASS**. The separate Tensor, controller, external API, Text runtime, and VAE API validation scripts were rerun and passed.

The final source receipt was independently checked with `python3 tools/diffusion-models/build-info.py --check`: **PASS**, `diffusion-models/0.1+164b7cb4b575e60388e7ce66db27cfbaea7057cf3cc46a5362e6f47ed601b3ae`. The replacement generator changes the source receipt only; it does not rebuild model graphs or numerical kernels.

Review readiness: **no important open finding** in the reviewed bounded consumer/schema scope. The final documentation and receipt were reread after the implementation fixes. This is not a full Text → Diffusion sampling → VAE acceptance. Real generated samples, new profiles, original-precision equivalence, and workflow-scale inference remain unverified. This review does not claim the parent's still-running Python/security or SentencePiece browser checks as completed.
