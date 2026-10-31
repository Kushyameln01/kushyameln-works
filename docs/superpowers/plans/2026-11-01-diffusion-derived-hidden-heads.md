# Diffusion Derived Hidden and Query Head Expansion Plan

> **For agentic workers:** Use the existing subagent execution/review workflow. The user requested implementation and staged validation; preserve prior accepted scopes and proceed within that scope.

**Goal:** Deliver a registration-ready QKV profile, compute a source-traceable block0/timestep post-modulation hidden tensor, and verify all queries/heads at its exact small shape plus separate original-shape resource conditions.

**Architecture:** Keep the fixed N16/head0 diagnostic and old manager adoption unchanged. The new prefix starts from the actual VAE855 Rect raw mean, explicit caller noise and the fixed scheduler, then runs original-weight patch/time/block0-modulation operators at natural N2. An independently validated artifact freezes the actual derived hidden bits before new N2 QKV/all40-head attention consumes them. Full-sequence planning and allocation probes are distinct from model numerical acceptance.

**Tech Stack:** Existing browser File/Blob, Hike WASM, ORT Web WASM1.24.3, ES modules, Python/NumPy independent references and fixed catalog JSON.

**Spec:** User requirements1–3; Profile catalog `1.0-draft.1` at `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`, execution plan `0fb553fd081d3bcbbad4ead7accd165679f77d34`. Baseline handoff `621796a2cb5266a4c8ea7abc2f676322836360c5` / runtime `8cdfd3f5f7db0cd66762e78f09c209fb5b27366b`. Relevant Page bodies were re-read before work; fixed core is ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`.

## Global Constraints

- Never relabel the explicit N16 hidden fixture as production input. Original81frame/480×832/latent `[1,16,21,60,104]`, original media/noise and production compute precision remain separate acceptance conditions.
- Exact Rect mean is `[1,16,1,2,4]`. Its patch stride/kernel `(1,2,2)` yields grid `[1,1,2]`, naturally2 tokens; no padding/repetition to16.
- HIGH global schedule index1 and LOW global index3 are independent small diagnostic cases. The LOW input is not an actual HIGH→LOW sample handoff.
- Noise128 and noiseScale are explicit inputs. No new native default, hidden PRNG or workflow substitution.
- Distinguish model-operator-derived hidden from original-production-input verification. Freeze model/block/timestep/sigma/coordinates/input hashes/source/precision and the exact hidden payload hash.
- Q/K normalize all5120 dimensions before head selection. All40 heads and all2 queries stop at attention context before O projection/full block.
- Sinusoidal timestep encoding uses F32 exponent/frequency/phase with documented F64 primitive bridges; this differs from RoPE's F64 frequency convention. Do not reuse the wrong rule.
- Keep full-model `load/predict/sample=NOT_READY`. No all-head small-shape PASS, allocation-only probe or schema check can enable generation.
- Keep original catalog/old records/manager adoption intact. Registration proposals and runtime adoption are different states; no Page/canonical-catalog mutation is implied.
- No raw weights/private numerical arrays in Git, no full original rehash/download, no full NN run, no main merge or Pages deploy.

## Review Focus

- Forged source/build/schema/precision/gate metadata cannot pass registration integrity by being self-consistent; check actual fixed code/kernel/receipt bytes.
- Prefix artifacts bind exact post-modulation bytes and real block0/timestep execution, not a caller's boolean or a reused N16 fixture.
- Scalar Bernini timestep modulation broadcasts; WAN22 out_dim48/per-token timestep and dense6N expansion are not this model's rule.
- New exactN2 graph/host/ABI behavior has no padded queries/keys; old N16 API and scope are not silently widened.
- Cancellation, reentry, resource cleanup failure/retry and allocator unknowns remain explicit across prefix→artifact→QKV→head phases; copy traffic is not live RAM.

## Task1 — QKV registration proposal

**Files:** `profiles/registration-*`, `development/ai-connection/qkv-next/registration/`, `tools/diffusion-models/*qkv-registration*`.

**Consumes:** Canonical6dae7JSON and prior N16 QKV source/build/gates/receipts.

**Produces:** Data-only proposal plus candidate catalog preview, numeric/admission/normalization/rule references, a separate candidate adoption entry and structural/integrity validation. Old18profiles/10rules/12norm and manager entry remain byte-equivalent by record.

- [x] Write negative cases for old-entry replacement, source/build/schema forgery, gate/precision promotion, same-count shape exchange and proposal/adoption confusion.
- [x] Implement deterministic apply/generation with actual source anchors; do not copy the baseline validator's hardcoded record counts as acceptance of the new version.
- [x] Validate the new candidate structure/hash/ref graph, preserve runtimeIntegrated=false and document outstanding registration/manager adoption.
- [x] Review and commit with reproduction commands.

## Task2 — Actual model-operator-derived prefix

**Files:** `ort-bridge/block-hidden/`, `tools/diffusion-models/hidden-*`, `development/ai-connection/qkv-next/hidden-core/` and `hidden-runtime/`.

**Consumes:** Actual VAE855 Rect mean plus explicit noise128/noiseScale1; fixed schedule HIGH index1 or LOW index3; bounded actual F16 prefix parameters. Needed raw parameter bytes160,634,880 per side, maximum selected-weight read163,840; original header181,280 is counted separately.

**Produces:** Natural hidden `[2,5120]`, coordinates `(0,0,0),(0,0,1)`, sourceId0, block0 and exact scalar timestep evidence; private artifact with owned F32 bytes and an independent prefix acceptance receipt. Shared `source.mjs`/`linear.mjs` provide bounded original reads and symbolic M/K/N Gemm for prefix/downstream, without changing old N16 modules.

- [x] Freeze source equations/shape/storage/compute/admission/gates before comparisons. Projection of only first2 time chunks is justified because post-modulation self-attention input needs shift/scale; remaining chunks/full block stay unaccepted.
- [x] Strict F32 bytes for normalization/noise/patch extraction/decodedF16; time sinusoid abs2e-6＋rel2e-6; patch/time0 linear and timeAct0 abs1e-4＋rel1e-5; time2/timeAct1/timeProjection/shiftScale abs1e-3＋rel1e-4; LayerNorm abs1e-4＋rel1e-4; post-hidden abs1e-3＋rel1e-4. These are new diagnostic gates, not original Torch/GPU acceptance.
- [x] Use ORT F32 Sigmoid→Mul SiLU with finite abs≤1e6 input and finite output. Hike handles F32 time encoding, non-affine full5120 two-pass LayerNorm with abs≤1e16 input, shift/scale and modulation. Record F64 math bridges and fused/addcmul/ck differences.
- [x] Add RED shape/provenance/coordinate/timestep/finite/overflow/ownership/cancel/reentry/cleanup cases, implement exact small operators and compare every output independently.
- [x] Freeze actual post-hidden artifacts outside Git, binding input/model/block/timestep/coordinates/source/precision/hash; publish only recipes/hashes/metrics.

## Task3 — ExactN2 all-query/all-head boundary

**Files:** `ort-bridge/attention-heads/`, `tools/diffusion-models/head-*`, `development/ai-connection/qkv-next/expansion/`.

**Consumes:** Frozen actual-derived hidden artifact and trusted expected receipt/digest, same-side original QKV/norm weights, exactN2 grid/provenance.

**Produces:** Full QKV `[2,5120]`, full5120 Q/K norm, all40 heads' exact2-query/2-key attention context `[2,5120]`, source-bound acceptance and ownership/resource evidence. This stops before O projection and residual/cross/FFN/full block.

- [x] Build independent local oracle from the exact runtime-produced hidden bits. Preserve separate composed oracle from the independent prefix hidden reference.
- [x] Predeclare local gates: projection1e-4＋rel1e-5; norm/apply1e-4＋rel1e-4; RoPE matrices2e-6＋rel2e-6; all-head attention1e-3＋rel1e-4. New composed end-to-end gate1e-2＋rel1e-3. No thresholds are changed after observing errors.
- [x] Implement exactN2 graph/host using existing rows-capable Hike ABI with explicit tests, no padded queries/keys; preserve the old N16 entry.
- [x] Verify all outputs, head placement, shared workspace reuse, input retention, provenance failures, cancellation and failed cleanup recovery.
- [x] Bind prefix and downstream stages through actual artifact payload hashes; avoid boolean-only provenance claims and classify original production input/precision as unverified.

## Task4 — Original-shape phase budgets and capacity probes

**Files:** resource planner/probe under the expansion area and `tools/diffusion-models/*head-budget*`.

**Consumes:** Actual hidden5120/head40 dimensions, scalar-t modulation, chunk capacities, original N32760 and illustrative context N65520, observed runtime components and explicit unknowns.

**Produces:** Phase liveness/staging/copy/session plan and separate allocation-only receipts. FullKV2H＋hiddenH named storage is2,012,774,400 bytes at32760 and4,025,548,800 at65520. Per-head KV saves capacity but causes full5120 K-norm/recomputation tradeoffs; record those dependencies.

- [x] Test dimension/arithmetic/phase ownership, old-new overlap, unknown ORT/GC/producer quantities and no-generation-promotion cases.
- [x] Model cache-build barrier before in-place hidden updates, serial vs overlapping sessions, bounded weight chunks, copy traffic and unimplemented FFN/output stages independently.
- [x] Under the16GiB cgroup, probe target3H with nonzero touches and observed held PSS, then close the owned browser and verify release. Only then probe the context case if measured headroom permits. Do not allocate rejected full scores/weights or use disk as an unmeasured escape.
- [x] Label these as host capacity probes, not model numerical/all-query acceptance or a complete pipeline RAM bound.

## Delivery

- [x] Close new runtime source/build/kernel identities, preserving old-source receipt scopes; run only changed-boundary checks plus necessary regressions.
- [x] Record registration packet, source/precision equations, derived hidden provenance, all-head exact-shape results, budgets, reproductions and missing original-production dependencies.
- [x] Push `codex/diffusion-derived-hidden-heads`, create a Draft PR based on `codex/diffusion-profile-p0-p4`, independently fetch the fixed result, and report full commits/API/result URLs.

Execution result: `development/ai-connection/qkv-next/RESULT.md`; runtime code commit `e48021d8da29ef3b3b9e9d6161331c282798b6b3`; Draft PR https://github.com/Kushyameln01/kushyameln-works/pull/14. Check marks cover the staged diagnostic/contract/capacity tasks, not the explicitly unaccepted production graph.
