# LoRA A0/L1 result — implementation in progress

Date: 2026-10-31 JST。Common source: `Kushyameln Works AI推論モジュール 総合接続仕様書 Draft` `1.1-draft.1`、Page `page_65b303c9bc708191a7e48c78b51c35a7`、sequence 1。本文を取得して確認した。URL存在確認だけではない。

このファイルはrootによる実装・試験・review・commit完了後の追記を待つdraftである。未記入の試験や実base接続を合格と扱わない。

## Source and retrievable handoff

- Baseline full commit: `029ce9336a61e53bc6172fa4a7b7189b15f2efa0`。
- Implementation full commit: `89b489c6f2595ebff8836fe90b18fc94e3ea086b`. A later documentation-only commit fixes this receipt and descriptor; its complete delivery commit is in the external handoff receipt.
- Obtainable source archive and SHA-256: private handoff Page https://chatgpt.com/space/page_4988393f36e88191bcf7c0823139d1f3 and its external receipt.
- Native contract: `lora-connection/2.0-draft.1`。
- Contract path: `development/lora/contracts/connection-contract-v2.json`。
- API/change notes: `docs/shared/inference/lora/CONNECTION_V2.md`。
- Logical mapping: `development/lora/contracts/registry-correspondence-v2.json`。
- Binding examples: `development/lora/contracts/registry-binding-examples-v2.json`、status `DIAGNOSTIC_FIXTURE_NOT_REAL_GRAPH`。

The archive/receipt must bind the complete source commit, paths, byte sizes and file hashes. It must contain no original model binaries. No environment-only absolute path counts as a shared retrieval source.

## Original evidence retained

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `contracts/connection-contract-v0.1.json` | 18858 | `f00b469cb32dd620a292007178feb10b135ddb4022a934df38876b754ee579e6` |
| `contracts/original-inventory.json` | 495806 | `97229d6ea17738dc983fa898a38e771a784aeafff9513734c5af0ba0250c23b3` |

Both are byte-identical copies of the previous artifacts. This task does not repeat original payload inventory or the four whole-file hash calculations. A newly performed runtime loadLora must still perform its required whole-file hash verification.

## Loader, variants and binding

Fixed loader policy `comfy-lora-b5a4321-linear-diff-v1` refers to ComfyUI full commit `b5a432157de6b8884f81104cd02926adf4d597e4`。Standard 2D `linear-down-up` and `linear-a-b`, `additive-diff`, `additive-diff-b` only. Explicit alpha uses alpha/rank; missing alpha uses scale1 only under this policy; diff/bias use strength×delta. Finite zero and negative strength/alpha are distinct from absence. Transpose/fused/Conv/derived/quantized representations and unknown variants do not acquire defaults.

Bindings are runtime-input, initializer, hike-parameter. V2 never writes runtime input names into graphInitializer. Full logical shape remains intact; the only diagnostic slice is contiguous output rows with all columns. Real graph registry/provider/consumer acceptance is pending.

## PARTIAL reference scope

Single logical projection `diffusion_model.blocks.0.self_attn.q.weight` has original full shape `[5120,5120]`, selected rows `[0,16)`, all5120 columns. Light additionally includes the explicitly selected Q `.diff_b[0:16]` if bias is part of the diagnostic. Its alpha is128/rank128. All201 light `.diff` lie outside this scope. Detail uses rank64 A/B with missing alpha under the fixed policy.

Light's two included patches exclude1050 other patches; detail's one included patch excludes399 others. Rows/indices `[16,5120)` of each selected target also remain excluded. Runtime plan records exact included/excluded descriptors and original source hash. Coverage stays PARTIAL and completeAdapter=false. Unknown tensors anywhere still reject.

## Verification by scope

| Scope | State | Evidence/limit |
| --- | --- | --- |
| Existing SDK v1 baseline | PASS before changes | 32/32 LoRA tests on baseline, root-run |
| Header interpretation and retained whole hashes | Existing evidence reused | No original reread/rehash in this task |
| V2 loader/planner rejection and scale fixtures | PASS | 12 planner fixtures; fixed loader subset, all bindings, FULL/PARTIAL and unknown-tensor rejection |
| V2 Hike preparation on synthetic immutable base | PASS | 16 SDK fixtures use actual pinned Hike and tiny nonzero F32 bases. Distinct from prior real-adapter/synthetic-zero-base slice evidence |
| V1 compatibility fixture | PASS | Original v1 tests unchanged; 9 explicit adapter fixtures include actual v2→v1 Hike prepare/stage/rollback/copy |
| Cancellation/stale plan/ownership fixture | PASS | SDK tests cover cooperative abort, local invalidation, structured scope, copy/lease, retained failed rollback/abort/release |
| State presentation and browser | PASS | 5 state fixtures and Chromium12 checks; old panel refuses declared staging/v2 and uses neutral completion |
| Real base block comparison | NOT VERIFIED / BLOCKED | Real Diffusion registry/provider/consumer not yet accepted |
| Real session application | NOT VERIFIED | Test consumer is not a real model session |
| Generated-output contribution | NOT VERIFIED | No generated output in A0/L1 |
| L2 full-target acceptance | DEFERRED | Light and detail separately after consumer receipt |
| Full inference/composition/public deployment | OUT OF SCOPE | No automatic addition |

Fresh commands: `node --test tools/lora/test-*.mjs` → 74/74 PASS; `node tools/lora/test-panel.cjs` → Chromium12 PASS; `node tools/lora/check-inventory-plan-v2.mjs` → all four logical inventory plans pass; `git diff --check` clean. These scopes are separate and are not summed into a model-acceptance score. Portable details are in `A0_L1_VERIFICATION.json`, `a0-l1-tests.log`, `a0-l1-browser.json`, and `A0_L1_REVIEW.md`.

The numeric SDK v1 and planner source files and pinned WASM are unchanged. The old panel text changed to report consumer transaction completion and one-side detach without claiming management snapshot publication. Native v2 metadata hashing is a separate recursive sorted-key JSON identity; it is not a claim of adopted management JCS or snapshot hashing.

## Resource and management boundary

Base is immutable; strength changes rebuild from it. Prepared handle retains necessary bytes through consumer validation/commit. Independent copy or a valid ownership lease is required; release is blocked while the lease remains active, and failed release remains retryable. Rollback failure retains package under RECOVERY_REQUIRED until explicit recover succeeds. Failed sink.abort cleanup is also retained and recover()/dispose retries it; fresh transactions are blocked while that cleanup remains. Cancellation is cooperative after bounded Hike and async boundaries.

SDK-local revisions are not managerRevision or Diffusion transport inputRevision. HIGH/LOW use separate instances; management maps them to one immutable snapshot. Source registration, PREPARED, STAGED, CONSUMER_APPLIED and management SNAPSHOT_PUBLISHED are distinct. Native SDK publishes no snapshot and reports generationReady=false. Light/detail are selection alternatives, not simultaneously composed.

## Inputs still required from Diffusion

1. Retrievable full source commit/build and adopted native consumer contract.
2. Actual graph binding registry with original shapes and selected-slice maps.
3. Immutable owned F32 baseProvider, base payload identity, FP8 scale/decode execution profile.
4. Sink's actual package/feed format and hash/completeness rules.
5. Scope-bearing real consumer validation and independent numeric tolerance.
6. Commit/rollback authority, current revision check, recovery and copy/lease release semantics.

Management owns profile readiness, native request/cancel binding, queue order including child source reads, both-side snapshot publication, canonical snapshot hashing and saved artifact metadata. Unknown alias A/B is not assigned to light/detail. No bilateral consumer agreement is invented by this local implementation.
