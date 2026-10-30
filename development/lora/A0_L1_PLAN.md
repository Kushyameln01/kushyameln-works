# LoRA A0/L1 implementation plan — 2026-10-31 JST

Goal: implement the user-authorized versioned loader/binding/PARTIAL contract while preserving SDK v1. Source: common Page `page_65b303c9bc708191a7e48c78b51c35a7`, full body retrieved at revision 1, document `1.1-draft.1`, especially sections 8–10, 14–15, 18–20; user request in this turn authorizes implementation of A0/L1. Baseline: `029ce9336a61e53bc6172fa4a7b7189b15f2efa0`, existing isolated `feat/lora-hike` worktree; 32 LoRA tests pass.

Architecture: add explicit `lora-connection/2.0-draft.1` native entrypoints beside unmodified SDK v1. Registry discriminates runtime-input, initializer, hike-parameter. PARTIAL is a separate diagnostic input and never a generation-ready result. No dependency on management or Diffusion executors is imported into the native module.

Global constraints: immutable originals/base; no model binary bundled; fixed ComfyUI loader b5a432157de6b8884f81104cd02926adf4d597e4; no guessed scale/variant/binding; explicit row slice only (all columns), transpose/fusion/quantization refused at LoRA boundary; owned F32 input/output blocks. No real base consumer, full-model inference, simultaneous composition, push, or site publication in this scope. Original inventory/hash records are reused, not recalculated. A new runtime loadLora must still verify its file hash.

Review focus: unknown tensors anywhere in an excluded region still reject; mutable caller input during awaits cannot relabel source/scope; row offsets refer to full base; staged/partial never become generation-ready; release/cancel/stale commit must preserve package ownership until copy/lease termination.

## Task 1 — loader, registry and diagnostic planner
- [x] Write failing planner tests and run RED.
- [x] Add `loader-policy.mjs`, `planner-v2.mjs`: `CONTRACT_VERSION='lora-connection/2.0-draft.1'`; `LOADER_POLICY_ID='comfy-lora-b5a4321-linear-diff-v1'`; exported `validateRegistryV2(registry)`, `buildPlanV2({inspection,registry,diagnostic,sourceSha256,strength,loaderPolicyId,alphaValues})`.
- [x] Registry: `{contractVersion,modelHash,graphHash,registryVersion,side:'HIGH'|'LOW',executionProfileId,loaderPolicyId,targets:[{key,weightId,module,shape,dtype:'F32',layout:'row-major',parameterRole:'weight'|'bias',binding:{kind:'runtime-input'|'initializer'|'hike-parameter',name},transform:{kind:'identity'}}]}`. Shape is original full shape. No fake graphInitializer, transpose, quantization, arbitrary transform or target slice. Explicit diagnostic slices below are the only slice support.
- [x] Accept only standard 2D down/up and A/B, scalar alpha, additive .diff/.diff_b, F32/F16/BF16 storage. Fixed policy controls alpha/rank or absent-alpha=1; diff/bias strength only. Reject mixed factor dialects, orphans/conflicts/unknown suffixes, nonfinite scale, non-2D factors; classify ALL original patches before partial selection.
- [x] Diagnostic `{targets:[{key,slice:{startRow,rowCount}}]}` permits 1D or 2D contiguous output rows/all columns. Full plan has no diagnostic; missing mappings reject. Partial plan has coverage PARTIAL, completeAdapter false, original source hash, full shapes, selected slices, included patches, excluded targets and excluded regions. Operation keeps v1-style `kind,downName,upName,alphaName,rank,deltaName,names,target` plus `scale,slice:{startRow,rowCount},fullShape`; excluded descriptors need not have registry bindings but must have validated original shape and supported variant.
- [x] Green tests for multiplier/variant/unsupported transforms, all bindings, exclusions/unknown tensor rejection, full vs partial and element bounds.

## Task 2 — v2 SDK and compatibility boundary
- [x] Write failing tests with real pinned Hike kernel and tiny synthetic nonzero immutable bases. Public factory `createLoraV2({folder,sourceFactory,kernel})`; `sourceFactory(selection)` returns `{size,read,hash}`; selection is `{pairId,noise:'high'|'low'}`.
- [x] Add `sdk-v2.mjs` supporting inspect/plan/prepare/stage/cancel/release/dispose. plan takes registry/loaderPolicyId/diagnostic; source hash is mandatory and binds actual captured source. Revision is SDK-local only. plan invalidates old plans even when new request fails.
- [x] prepare reads full-base element offsets, selected up/diff/bias rows and complete down factor; performs actual Hike calculation and emits binding-tagged owned F32 blocks. Manifest records PARTIAL/FULL, excluded scope, source/build/registry/plan/strength and status PREPARED. Abort checks around bounded Hike calls, provider and sink awaits; prevent overlapping lifecycle operations and releases while in use; cleanup partial sink and retry failed release.
- [x] Structured v2 validation must match plan scope/coverage/hash (boolean is not accepted). Stage transaction uses describe/prepareLoad/validate/commit/rollback; commit must return explicit STAGED or CONSUMER_APPLIED receipt plus independent-copy ownership or a valid lease. No snapshot publication is performed. Partial stays diagnostic even if consumer explicitly used its weights.
- [x] Add explicit v1 registry adapter (initializer only) and consumer validation adapter; preserve existing numeric apiVersion1, boolean validation and source/revision semantics. No silent interpretation of runtime input as initializer or of boolean as scope evidence.
- [x] Green tests for bounds, strength 0/negative, cancellation, stale plans/rollback, consumer failure, copy/lease/prepared lifetime and legacy v1 fixtures.

## Task 3 — state presentation, contracts and handoff
- [x] Add status formatting/connection guard so old v1 panel rejects staging-only/v2 connections and does not label unknown scope as applied. Existing true v1 consumer path stays compatible.
- [x] Commit immutable copy of prior connection v0.1 and original inventory, plus new v2 machine-readable contract, registry example/mapping and v1 difference notes. Include original loader source commit/path/lines. Inventory is reference evidence, never base certification.
- [x] Add module descriptor as external JSON with source archive/hash reference. Roles adapter-source and adapter-weight-transform; consumer application remains fixture-tested/unverified against real Diffusion. Keep management generic descriptor/snapshot separate from Bernini selection profile.
- [x] Run all LoRA fixtures and targeted browser UI verification, inspect diff, independent review/fix as needed. Record verification by scope, resources and Diffusion inputs needed. Commit complete changes locally, create obtainable archive+SHA256 and update the existing private handoff Page with file references; no GitHub/public deployment.

## Progress
- Baseline: 32/32 LoRA tests pass; clean linked worktree.
- Decision: user supplied concrete execution scope and requested implementation; use the approved additive versioned approach without another design approval round.

- Final verification: 74/74 native LoRA fixtures, Chromium12 checks; inventory-only plan fixture; independent review clean after five fixes. No unresolved findings deferred.
- Native v1 sdk/planner/WASM preserved; v2 and explicit adapters added. Common spec hash/snapshot adoption and actual Diffusion consumer remain external, not implemented by assumption.
