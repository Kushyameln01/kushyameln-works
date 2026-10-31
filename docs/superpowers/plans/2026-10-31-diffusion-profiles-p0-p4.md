# Diffusion P0 P2 P4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. The user explicitly requested execution and parallel P4 work; continue within that authorized plan.

**Goal:** Bind Diffusion declarations to the fixed Profile catalog, verify the Rect mean connection, and implement the next actual-weight-backed QKV/norm/RoPE operator boundary without promoting it to full production inference.

**Architecture:** Keep native `diffusion-models/0.1` and independent ES-module ownership. P0 supplies an external declaration/evidence sidecar; P2 uses the existing exact Rect guard/ABI through the real native transport. P4 streams original block0 weights into bounded ORT/Hike computation, preserves full5120 QK normalization, then supplies selected one-head tensors to the existing attention module.

**Tech Stack:** Existing JavaScript ES modules, browser File/Blob, Hike WASM with the pinned compiler, ORT Web WASM1.24.3, Python/NumPy independent references, fixed JSON catalog, existing management capture/package/queue and G1C codec.

**Spec:** Profile catalog/norms/rules `1.0-draft.1` at `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`; execution plan `1.0-draft.1` at `0fb553fd081d3bcbbad4ead7accd165679f77d34`, Page `page_78c30bebe16481918944e621b8c2a02a`. Work begins from Diffusion `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`.

## Global Constraints

- Catalog IDs and native IDs are separate; undefined native IDs remain null. No mandatory catalog fields are inserted into native payloads.
- Compatibility, numeric acceptance and readiness are independent. Missing gate/receipt alone preserves a compatible contract with NOT_VERIFIED/BLOCKED numeric readiness.
- Exact Rect shape `[1,16,1,2,4]` is distinct from F5 `[1,16,2,2,2]`; equal128 element counts do not permit substitution.
- Mean and generated-sample meanings, normalization owners and decoder identities remain separate.
- LoRA mapping is owned by `createDiffusionDiagnosticAdapter` in the LoRA source. Old Diffusion/management adapters remain regression paths, not a second canonical mapping.
- Keep Euler/simple6/shift5/split3, HIGH→LOW and source/reference/slot/frame ordering. No new LoRA default strength or concurrent pair composition.
- Public pointwise1,048,576, internal scheduler4,194,304 and Text conditioning2,097,152 elements are separate operation budgets.
- No original model download/full rehash, full-model NN run, rejected whole-Memory execution, raw payload publication, main merge or Pages deployment in this scoped change.
- P4 lacks actual modulated production hidden states and an accepted original production compute profile. Explicit input fixtures and F32 diagnostic computation must retain that provenance; production QKV/full predict/sample remain unverified until those dependencies and all combined resource gates pass.

## Review Focus

- Same128 element count with different time/spatial axes must fail the incorrect profile, including wrong profile IDs.
- Current kernel bytes/hash/length must be checked independently of the unchanged native API version; reused receipts retain their original source and scope.
- Unknown optional metadata remains in the outer capture/package sidecar; native context allowlists must not silently discard it or be described as arbitrary metadata passthrough.
- QK RMSNorm reduces all5120 channels before head selection; source-id RoPE composes the actual full128 F32 matrices, not added angles or a head-local norm.
- Reentry/cancel/late results and cleanup failures cannot corrupt shared state, restore a foreign epoch or allow premature resource reuse; named live buffers and copy traffic are distinct from observed process Memory.

## Task P0 — Owner declaration and evidence binding

**Files:** `docs/shared/diffusion-models/profiles/`, `development/ai-connection/profile-adoption/p0-*`, received fixed reference bytes, and `tools/diffusion-models/test-p0-*`.

**Consumes:** Fixed catalog, profiles,12 norms and10 rules; actual native API/build, source/kernel bytes, existing scoped receipts.

**Produces:** External JSON binding/evidence sidecar with record/norm IDs, native field paths, owner, source/build/kernel, exact shape/meaning/precision, gate/reference/scope and explicit missing reasons. No new compatibility evaluator or numerical mapping.

- [ ] Add negative checks for stale kernel under the same API, F5/Rect substitution, catalog/native ID confusion and evidence source/scope promotion.
- [ ] Run RED, then implement only structural/integrity validation and the sidecar/generator.
- [ ] Verify copied canonical catalog bytes/hash unchanged. Confirm F5 gate from its own pre-comparison source; otherwise leave its numeric acceptance pending.
- [ ] Regenerate final candidate identity after the owner build closes; keep prior accepted-source evidence separate.
- [ ] Review and commit the complete scoped handoff with exact reproduction commands.

## Task P2 — Rect raw-mean normalization and restoration

**Files:** `tools/diffusion-models/p2-*`, `development/ai-connection/profile-adoption/p2/`; existing native/latent code changes only if a demonstrated boundary bug requires them.

**Consumes:** VAE `855f435120f08eb9e818e51281fc26f0e2633829` actual Rect mean and explicit G1C codec, management `28596717182e48aeb23c719c51b6e593edf4e496` capture/package/queue, native Rect operations with `input:{tensor}`.

**Produces:** A fresh scoped trace of actual mean capture/save/read→native Worker/MessagePort Rect normalize/restore→save/read, with owned results, payload hashes, metadata preservation and terminal cancellation evidence.

- [ ] Reuse the existing original numeric payload/reference after proving its relation to the new VAE file; do not re-export or rerun the VAE NN.
- [ ] Pin independent struct-f32 comparison of every128 normalized/restored value and roundtrip maxAbs≤2e-6 before execution.
- [ ] Exercise wrong F5/Rect IDs/shapes, mean/generated relabeling, frame-order/duplicate retention, outer optional metadata and cancellation/reuse.
- [ ] Run the real browser/native transport test. Keep management candidate adoption, UI/full-session and fresh restored-mean VAE decode acceptance pending when the other owner has not executed them.
- [ ] Recheck the native build ID after final source closure, review and commit the handoff.

## Task P4 — Actual-weight-backed QKV norm RoPE boundary

**Files:** `docs/shared/diffusion-models/ort-bridge/qkv/`, `tools/diffusion-models/p4-*`, `development/ai-connection/profile-adoption/p4/`.

**Consumes:** Immutable original HIGH/LOW File, pinned ComfyUI core `b5a432157de6b8884f81104cd02926adf4d597e4`, selected block0 Q/K/V full weights/biases and norm weights; explicit hidden `[16,5120]`, coordinates/source IDs/headIndex; fixed independent reference and candidate plan.

**Produces:** `createActualQkvDiagnostic({file,side,bridgeBytes,tensorBytes,ropeBytes})`; its `run(input)` returns owned full5120 Q/K/V and normalized Q/K evidence plus selected-head RoPE/attention outputs. The selected16-token diagnostic does not replace the original production token conditions.

- [ ] Before numerical execution, freeze `candidate-plan.json`: original operators/axes/order/precision, all source/kernel bindings, independent reference, retained-buffer/copy/session budget and the following diagnostic gates.
- [ ] Dequantized F32 bytes: strict independent equality. Full Q/K/V projection: abs1e-4＋rel1e-5. Full5120 RMSNorm: abs1e-4＋rel1e-4. RoPE matrix: abs2e-6＋rel2e-6; application: abs1e-4＋rel1e-4. Connected output: abs1e-3＋rel1e-4. These are predeclared diagnostic gates; source-stage reduction/rsqrt/precision differences remain explicit, and excess errors are FAIL without relaxation.
- [ ] Add RED tests for all5120 normalization, nonzero T/H/W and source IDs0/1/2, binding/finite/capacity failures, reentry and cooperative cancellation/cleanup.
- [ ] Implement bounded original-weight row reads and ORT tokenbatch16 projection; reuse verified Hike FP8/F16 decode and full5120 RMSNorm, then real core RoPE and existing one-head stream attention. Do not duplicate low-rank arithmetic or whole-model resident execution.
- [ ] Compare every selected output at each stage against independent NumPy/reference bytes. Measure time, named simultaneous live buffers, input/output/arena copies, all Hike Memories, two active ORT sessions and separately observed owned Chromium PSS.
- [ ] Record the adopted operator scope and exact blockers for actual hidden production provenance, production precision, fullN32760/context65520+, all heads/stages and combined resource budgets. Keep P5/NOT_READY blocked unless every necessary boundary truly passes.
- [ ] Close source/build/kernel identity, independently review and commit.

## Delivery

- [ ] Update owner API/handoff docs and the machine-readable final evidence index; do not modify the fixed canonical catalog to pretend management runtime adoption.
- [ ] Run checks appropriate to changed boundaries; reuse unrelated existing PASS receipts at their original source and scope.
- [ ] Push `codex/diffusion-profile-p0-p4`, create a Draft PR based on `codex/diffusion-e0-e7`, and report the complete SHA, fixed API URL, differences, verification/reproduction and unaccepted dependencies.
