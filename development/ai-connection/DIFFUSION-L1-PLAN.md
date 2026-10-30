# Diffusion A0/F1/L1 Implementation Plan

> Agentic workers: execute assigned tasks against this plan and the attached source documents. Preserve independent module ownership.

**Goal:** Supply retrievable 9023329 source, determine production WASM feasibility, and expose a bounded real-base/F32-weight diagnostic consumer for LoRA.

**Architecture:** Keep native diffusion-models/0.1 and NOT_READY model APIs. Reuse the real 16×5120 runtime-weight Gemm and fixed Hike workspace; add an explicit F32 feed and half decoder. An immutable File-backed provider and owned feed-set transaction describe actual original shape and selected rows, not a full-model initializer.

**Tech Stack:** existing ES modules, Hike pinned compiler, ORT Web WASM 1.24.3, Worker/MessagePort, Node and Chromium/Playwright.

**Spec:** attached Implementation Plan 0.1-draft.1 (A0/F1/L1) and Comprehensive Connection Specification 1.1-draft.1, received 2026-10-31 JST; current user authorizes implementation of those Diffusion portions.

## Constraints

- No full model inference/export, model/LoRA replacement, implicit precision substitution, publication or push.
- Original Euler/simple6/shift5/split3 and HIGH→LOW stay unchanged; prediction/sample NOT_READY.
- Pointwise 1,048,576 and mean-kernel 128 are separate unchanged constraints.
- LoRA owns low-rank arithmetic/planner. New consumer is PARTIAL with a version separate from SDK v1 initializer/boolean contract.
- Reuse existing full-model download/hash receipts; current File checks explicitly distinguish header/ranges from full-file verification.
- Immutable base F8_E4M3 + scalar F32 scale → Hike F32 for selected projection only. F16 bias → Hike F32. This is not original FP8 scaled-matmul equivalence.

## Tasks and verification

1. A0: git archive fixed `9023329b8d803306abcdd9342f24c01ba0df2676`, per-file hashes and source/core/runtime crosswalk. Private archive, no publication.
2. F1: metadata-derived dtype/weight/activation/attention/copy/session budget and supported/blocked/unverified execution units. Reuse rejected whole-Memory evidence.
3. Hike half decode: fail test for missing DecodeF16, implement bounded ABI, test finite half values/subnormal/signed zero/NaN/overflow and arena reuse; regenerate with owner builder.
4. ORT F32 feed: fail tests for missing runF32; implement owned weight/bias/x → real Gemm → Hike bias, preserve existing run and workspace. Verify caller mutation, shape/nonfinite/BUSY/disposal.
5. Base/registry: fail tests for missing provider; pin actual header/model/graph and scale, original full shape/selected rows/binding, bounded owned reads and abort/identity/range guards. Test real HIGH/LOW slices against independent Python expectations.
6. Consumer: fail contract tests; sink checks coverage/overlap/hash and owns copies; candidates copy feed-set, validate actual stage output with scope and expected values, commit checks current/abort, rollback cannot replace newer state; base restore reads immutable provider. Fake stage fixtures are contract-only.
7. Root integration: additive linearProjectionF32 operation and capabilities; regenerate fixed build receipt/source closure; run direct/port/Worker cancellation and existing scoped regression tests. Full-model ready and LoRA-all-target applied remain false.
8. Handoff: document registry/provider/consumer examples, F1 budget, scope, changed files/full commit, original archive hashes, actual-WASM and fixture evidence separately. Package retrievable source without weights.

## Review focus

- Wrong HIGH/LOW/model/graph/registry or selected-slice identity: reject before using bytes.
- Aborted read/write/candidate or late rollback: no mutation of newer active resource.
- Missing/duplicate/overlapping package blocks: reject; release cannot invalidate a copied active feed-set.
- Caller changes arrays during async hashing/ORT: owned snapshots keep input and result deterministic.
- Header identity is not full-file proof; partial graph/FP32 diagnostic is not production FP8 model or LoRA coverage acceptance.
