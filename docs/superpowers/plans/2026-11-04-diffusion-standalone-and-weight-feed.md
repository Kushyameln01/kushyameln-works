# Diffusion standalone completion and weight feed implementation plan

> **For agentic workers:** Use subagent-driven implementation for the independent tasks. Preserve existing public API and the user-specified stage order.

**Goal:** Close original-target base execution gaps, provide executable full-model completed-F32 weight bindings, then support management adoption without sending experimental LoRA or running the whole product experiment early.

**Architecture:** Keep the existing real public API/Worker and F32 Hike/ORT graph. First remove repeated K/V host packing/validation with immutable prepared tiles, keeping Q128/K256 arithmetic. A separate transactional owner overlays externally completed F32 packages on immutable base readers, pins epochs across predict/all six updates, and invalidates persistent head caches. Explicit MessagePort RPC keeps package functions on their owning side.

**Spec:** Latest user instruction 2026-11-04 JST; actual read of Page page_1e950f67b0688191bd3f2a1d5b252224 (module standalone plan, 1.0 draft 1). User scope/sequence takes precedence over old plan entries. Starting commit ffeeeedb6b57d182a977c3ac02c042ce235fc87a.

## Global constraints

- Stage order: standalone -> management partial -> full connection implementation -> experimental LoRA delivery/whole operation. Independent implementation may run in parallel; do not promote an uncompleted stage.
- Exact target [1,16,21,60,104]; declared source81 and three848sq references remain a separate N73947 case, not guessed original media. Preserve source/reference/slot/frame order.
- Euler/simple6/shift5/split3/CFG1; explicit saved noise; HIGH3 then LOW3; generated-sample restoration exactly once in Diffusion, raw generated contract to VAE.
- Retained scaled FP8/F16 decoded by fixed Hike loader to F32. Original mxfp8 environment remains unconfirmed, not an execution dependency.
- Default ORT1/no-COI and explicit ORT4/COI are separate. No fallback or hidden worker-count increase.
- Normal input compatibility uses structure/meaning/normalization/model/shape/capacity. Reference/gate/detail receipts remain development-only.
- Native base block limit81920 elements/max16rows and raw163840B; pointwise1048576 and old mean64/128 profiles stay separate. Full-model package handling may explicitly split larger legal owner blocks.
- No low-rank arithmetic in Diffusion. Do not send actual LoRA or claim real full-model LoRA success from conforming test packages.
- All-query success is not full40/head/six success. No unsupported/impossible claims from untested work or watchdog expiry.
- Latest manager distribution e1661e561dfb1a4f20544ff48bc375175b5981d1/execution296c18d5f2c878fa42bbb198a706991fc901065f already has real public calls. Latest LoRA standalone contract source6d0c8df4cd4992f26745d2d26394f5e194d2567f. Reuse them, do not rebuild older stubs.

## Review focus

- Captured weight epochs cannot change across40blocks or six HIGH/LOW predictions; old rollback cannot replace a successor.
- Head cache must not retain old effective weights after activate/clear; native modulation/conv5D excluded by logical registry stay genuine base.
- Package release/cancellation/Worker termination must preserve or release the actual retained capability; failed cleanup blocks reuse.
- Prepared KV pool replaces row-major KV stores, never doubles the full3.029GB span; key219/query91 tails and stream boundaries retain every value.
- Management input snapshots/output copies and native ORT uploads are real additional spans; CPU tensors are not declared native zero-copy.

## Task A: Recover and map saved assets

- [x] Restore f76 saved packet and old nativeJSON byte-exactly, without Text inference or receipt-to-value reconstruction.
- [x] Restore saved N5/L3 input; preserve original SHA and packet active3/all512 distinction from the newer all512-active text case.
- [ ] Regenerate exact declared full/small saved cases with unchanged generator; verify previous manifest/contract identities.
- [ ] Publish a portable asset map/holding-run procedure for ordinary API and latest fixed manager runner. Private paths are not recipient ACKs; do not publish model/tensor values.

## Task B: Exact attention storage improvement

**Files:** execution/model-candidate.mjs, batched-ops.mjs, owned-attention-query.mjs, new prepared-KV owner and tests/docs. Head file belongs Task C, sampler/API files Task D.

- [ ] Add failing ownership/layout tests for immutable head-major K/V tile handles built from ordered rows.
- [ ] Prepare compact [40,K<=256,128] pairs once, transfer private completed tiles, reuse across query groups via prepared step.
- [ ] Preserve the existing graph, F32 key recurrence, Q128/K256 and denominator division. Actual CPU/WASM upload remains measured/unknown as appropriate.
- [ ] Replace full row-major K/V arrays with the pool; fallback only for explicitly injected old test ops and label it.
- [ ] Test foreign/stale/range/order, tails219/91, mutation isolation, abort/retry/cleanup failure and resource counter reuse.
- [ ] Run native one-thread/no-COI and explicit4/COI bounded old-bit-parity plus independent F64 gates.
- [ ] Only after this candidate passes, evaluate in-place residual or Hike-built RoPE caching as separately accepted changes; do not silently change numerical tiling.

## Task C: Full-model weight owner

**Files:** new execution/model-weight-feed.mjs and binding/contract helpers, tests, execution/model-head.mjs; copy canonical logical registry modules verbatim from fixed LoRA owner with source hashes, excluding low-rank implementation.

**Interface:** createFullModelWeightFeed({source,registry,side}) returns {describe,baseProvider,source,consumer,capture,clear,stats,dispose}. source is a stable effective reader; capture({operation:true}) pins the active epoch until release. consumer implements lora-standalone/1.0-draft.1 methods. baseProvider reads immutable original source only and returns owned F32.

- [ ] Use actual logical registry1053 rank1/2 targets. Keep native1095 binding descriptor separately; rank3 modulation and rank5 conv are base-only for this logical contract.
- [ ] Split base reads within native caps; package block limit1048576 is not a new native limit.
- [ ] Retain ownedPackage independently; normal validate streams every declared selected F32 range, shape/finite/identity/coverage/complete-plan checks, no NN/reference requirement.
- [ ] Commit validated candidate with epoch/lease receipt; keep rollback/old-read lifetime stable, clear restores original base without subtraction or accumulation.
- [ ] Overlay only declared completed ranges into base blocks; no low-rank calculation or implicit FP8/F32 conversion by LoRA contract.
- [ ] Expose source weightEpoch; invalidate model-head cache when epoch changes. Operation captures block commits/clear during execution; non-operation old leases remain valid through switching.
- [ ] Test conforming synthetic completed source on actual ORT/Hike bounded weight+bias inputs, plus real immutable base small reads. Label scope as binding, not real LoRA inference.

## Task D: Public sampler and package transport

**Files:** model-sampler-candidate.mjs, api/model-adapter.mjs, api/worker.mjs, api/index.mjs, new api weight-port client/server; docs/tests. Avoid Task B/C owned files.

- [ ] Wrap base sources with Task C feed owners; pin both side epochs for a complete sample and one side for predict; release after terminal cleanup.
- [ ] Add public openWeightFeed operation returning an explicitly transferred MessagePort, descriptor and model session binding. No functions in normal wire.
- [ ] Host helper creates {baseProvider,consumer,clear,dispose} matching latest LoRA consumer contract. Duplex RPC supports immutable base reads while Worker awaits external completed F32; avoid using the global busy job queue for those nested base reads.
- [ ] Package functions stay at owner; remote retain/read/release retain independent capabilities. Bound/chunk requests and use ordinary native/source limits; no implicit completed package RAM materialization.
- [ ] Keep main-side isCurrent/signal checks and native transaction metadata/epoch checks; invalidate clients/pending requests on cancel/unload/reload/dispose.
- [ ] Report effective package/epoch in execution metadata while keeping raw tensor meaning/latentContract and base identity roles intact.
- [ ] Test real same-page and explicit-port transactions with conforming package source, candidate failure/rollback/remove/head change, abort/reload/stale handles. Do not call it real LoRA full-model acceptance.

## Task E: Original shape execution and management handoff

**Files:** independent diagnostic/holding runners, public API docs, development/ai-connection/diffusion-standalone-20261104/.

- [ ] Freeze executable sources and preexecution gates before model runs; use a dedicated fixed worktree for long execution while independent binding work continues elsewhere.
- [ ] Extend chunk runner to support complete40/head and sample diagnostics without changing ordinary API inputs; bounded comparison/release, no giant all-intermediate save requirement.
- [ ] Complete all-query original block0 before full40; advance HIGH/LOW complete predict then six updates/raw/save with measured operators/resources/cleanup. Missing stages remain incomplete, not declared impossible.
- [ ] Separately verify default1/no-COI ordinary route and explicit4 route. Reuse existing4-thread N5/L512 math evidence only in its scope.
- [ ] Provide latest management holding runner and assets with exact source/body/schema; numerical unit acceptance and actual manager acceptance remain separate. Whole UI/LoRA experiment is not run before implementation is complete.
- [ ] Update fixed owner/source manifests, API explanation, source-vs-distribution hashes, push existing branch/DraftPR, confirm remote bytes. No merge/Pages publish.

## Execution authorization

This resumes the user-defined implementation and explicit instruction to proceed, with the same public API/math/workflow. Routine engineering choices above are owner choices, not new user requirements or a request to change the algorithm. Do not add a duplicate approval/ACK gate. If actual required resources/artifacts are absent, report exact evidence and continue independent work; do not infer missing source.
