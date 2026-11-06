# Adapter review

Scope: `ADAPTER-REVIEW.patch`, exact native Text/VAE closure, Task 1/2 of `development/ai-connection/full-route/PLAN.md`, Text/VAE and Diffusion reports, source-verification JSON, and small Hike browser receipt. Controller/UI excluded. Review source is the adapter package before follow-up fixes. No implementation edits, commits, model loading, broad suite reruns, or NN claims.

## Findings

1. **P2 — Concurrent dispose can leave a recreated native owner alive permanently.** `docs/shared/ai-connection/adapters/text-vae-standalone/management.mjs:76` and `:79`. `dispose()` accepts calls during configuration/recovery, and both paths suspend at queue disposal/closeNative. Configuration then creates a replacement native instance after disposal has performed its last closeNative. Exact no-NN probe using actual native factories with the explicit controlled client seam: `Promise.allSettled([host.configure(configuration), host.dispose()])` returns two fulfilled results; client factory count is 2 and client dispose count is 1. Final inspection reports `disposed:true`, `recoveryRequired:false`, but `queue.disposed:false`. Calling dispose again leaves the dispose count at 1 because of the early return. Minimal fix: serialize retirement/recreation against terminal disposal, mark disposal intent before awaits, and ensure dispose awaits any in-flight lifecycle change and closes the final instance/queue. Cover configure+dispose and recover+dispose with an exact resource-count test.

2. **P2 — Shared input buffers remain caller-owned during queued execution.** `docs/shared/ai-connection/adapters/text-vae-standalone/management.mjs:52`. `structuredClone(input)` preserves shared backing memory for SharedArrayBuffer views. Actual native Text and VAE contracts accept these typed-array inputs, so the queue can validate one input and subsequently execute another after caller mutation. Exact no-NN queued Text probe: request A holds the client; request B submits `tokenIds = new Int32Array(new SharedArrayBuffer(4))` containing 2; caller writes 77 before releasing A. Both complete successfully and the native client observes token IDs `[1,77]`, although submitted IDs were `[1,2]`. VAE tensor data has the same capture mechanism. Minimal fix: capture supported views in independent nonshared buffers before validation/enqueue, preserving types and metadata, or explicitly reject shared backing buffers. Add a caller-mutation test while queued.

3. **P2 — Successful terminal disposal retains all configured local asset bindings.** `docs/shared/ai-connection/adapters/text-vae-standalone/management.mjs:79`. After queue/native cleanup, `config` still holds its files Map indefinitely, while inspect reports `configured:true` and 28 local bindings for the Text fixture. Unlike recover/reconfigure, final disposal needs no retained configuration; Uint8Array assets are already copied by configurationCopy, so these potentially large buffers remain strongly reachable through the disposed manager. Minimal fix: clear `config` and other disposable local binding references only after successful cleanup; preserve references while cleanup is unresolved so recovery/disposal retries remain possible. Assert `configured:false` and zero bindings after successful dispose.

## Verdict

**Spec: CHANGES REQUIRED** for input ownership and terminal resource lifecycle. **Quality: CHANGES REQUIRED** for the reproduced lifecycle race and shared-memory capture hole.

The inspected implementation otherwise uses exact badff7a Text/VAE source and real default factories, keeps ordinary requests free of user-supplied references/gates, forwards native Text mask/normalization and VAE result packets/processing, and delegates mean arithmetic to the fixed real Diffusion owner with existing queue/snapshot handling. The adapter package does not modify existing public Diffusion pins or old normal/P4/LoRA code. Source-verification records list 27 exact Git files, and adapter import independently passed its pinned SOURCE/file digest checks during the probes. The supplied browser receipt establishes only synthetic small-profile Hike normalize/restore with 4 workers created/closed and explicit full-shape rejection. It establishes no actual NN or LoRA full-pipeline acceptance.

## Scoped fix re-review — 2026-11-04

All three findings above are **RESOLVED** in the reviewed revision. Scoped spec/quality verdict: **PASS for these three findings**. This does not replace the pending frozen full-branch review.

Fresh independent no-NN probes using actual native factories and the explicit controlled transport seam verified:

- Concurrent configure+dispose and recover+dispose: the superseded lifecycle operation rejects with TEXT_VAE_DISPOSED; final dispose fulfills; created=1, closed=1; queue.disposed=true; configured=false; localFileBindings=0; recoveryRequired=false. Repeated dispose retains balanced resource counts.
- Queued Text SAB mutation: submitted token 2 remains native token 2 after caller changes its shared view to 77; actual sequence is [1,2].
- VAE SAB mutation before dispatch: submitted 0.125 remains 0.125 after caller changes the original shared buffer to 0.75; native ingress receives a nonshared buffer. The probe intentionally stops at transport ingress without NN.
- Successful terminal disposal clears configured File/asset bindings in both Text and VAE probes.

Read the corresponding mean wrapper change: numerical tensor data is copied to nonshared storage before its descriptor and queued action are created. No arithmetic or native capability changes were introduced. No broad test suites were rerun.

Reviewed SHA-256:

- `docs/shared/ai-connection/adapters/text-vae-standalone/management.mjs`: `137ea6d50f4a66f299b7ded873685685bbf92769f24f3e7e3f619b3a2618caf4`
- `docs/shared/ai-connection/adapters/diffusion-public/normalization.mjs`: `74190dbe67e6d3d59ead7b8dfe638ff4efc2c9ca6ce578d6638362477d67970e`
