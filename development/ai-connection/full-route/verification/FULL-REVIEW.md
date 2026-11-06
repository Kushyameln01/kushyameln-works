# Full route review

Spec verdict: **CHANGES REQUIRED**. Quality verdict: **CHANGES REQUIRED**. Four P2 findings below remain in the frozen controller. The previous three adapter findings are resolved, as separately re-probed in ADAPTER-REVIEW.md.

Reviewed FULL-REVIEW.patch and REVIEW-FREEZE.json, PLAN/API, real UI/controller and native factory contracts, focused test source, package/snapshot helpers, reports and latest browser runner. No implementation changes, broad test reruns, commits, subagents, model loading, or NN. Exact controlled probes below exercise the real controller through its explicit control-only factory seam. They establish orchestration behavior only.

## Findings

### 1. P2 — Retain and await owners across controller configuration/disposal

Paths: `docs/shared/ai-connection/operational-management.mjs:150`, `:151`, `:153`, `:155`, `:235`.

configureModule clears `m.adapter` before awaiting previous.dispose(). If disposal fails, that owner is no longer retained anywhere in controller state; the failure occurs outside the try/catch, leaving state `configuring` and observation null. recover then constructs a replacement and final controller disposal never retries the original owner. This loses the only release path for model/Worker resources whose cleanup failed.

Exact probe: configure Text; make its dispose throw once; reconfigure; permit cleanup; recover Text; dispose controller. The original owner remains `closed:false, disposeCalls:1`, while the replacement is closed. The original resource is leaked permanently from the controller's perspective.

The same missing lifecycle coordination permits controller.dispose() to resolve while a preceding createModule is still pending. A probe factory allocates one resource, then awaits a gate. Disposing while that factory waits returns `disposed:true` with resources=1; only releasing the factory gate later closes it. Disposal therefore does not confirm the promised terminal resource barrier.

Minimal fix: retain retiring/creating owners and their lifecycle Promises; serialize same-module configuration/recovery/disposal; retain failed-cleanup owners for explicit retry; controller dispose must await pending factories and final owner cleanup before succeeding. Concurrent replacement must not overtake the previous owner release barrier.

### 2. P2 — Do not clear global quarantine by recovering an unrelated module

Path: `docs/shared/ai-connection/operational-management.mjs:199`.

recover(moduleId) unconditionally rebinds the shared operational queue after recovering only the selected module. It does not remember which owner caused quarantine or verify that owner's cleanup. A failed Text resource can consequently remain live while recovering Mean reports recovered and makes the shared queue reusable.

Exact probe: Text execute rejects RESOURCE_CLEANUP_FAILED and inspect reports recoveryRequired:true. Root queue is quarantined. recover('mean') changes root quarantine to false, while Text remains `disposed:false, failed:true`. No Text disposal or cleanup occurred.

Minimal fix: track the owner(s) responsible for uncertain cleanup/stop and clear the root quarantine only after their confirmed retirement/recovery. An unrelated recovery must either preserve quarantine or explicitly recover all implicated owners.

### 3. P2 — Recheck progress currentness between controller subscribers

Paths: `docs/shared/ai-connection/operational-management.mjs:148`, `:178`.

The adapters now recheck cancellation/configuration between observers, but the controller fans a single native progress callback out through emit without such a check. The first subscriber can synchronously cancel, reconfigure, or dispose; subsequent subscribers still receive that obsolete progress. The entry guard checks r.cancelled but omits the already-aborted queue signal, and r.cancelled is only set later by the cancellation callback.

Exact probe: two controller progress subscribers; the first invokes manager.cancel(event.state.activeTarget). The observed callbacks are `['first','second after cancellation']`. The second receives the same progress after cancellation has begun, violating the API's stated stale-progress suppression boundary.

Minimal fix: pass an invocation/currentness predicate through progress emit, checking signal.aborted, cancellation, module revision and controller lifecycle before each observer. Make cancellation invalidation synchronous where needed. Keep generic non-progress event delivery separately defined.

### 4. P2 — Drop controller-owned model configuration after successful disposal

Path: `docs/shared/ai-connection/operational-management.mjs:235` (configuration capture at `:150`).

Successful controller disposal clears m.adapter but never m.configuration. The controller therefore retains its own File Map and cloned model byte buffers after all native adapters have released theirs. This violates the documented successful-dispose File reference release and can retain large model payloads for the lifetime of the UI/controller.

Exact probe under node --expose-gc: configure with a 4 MiB Uint8Array in files; retain only a WeakRef to the controller's captured copy; dispose; yield and request GC three times. Controller reports disposed:true while all 4,194,304 bytes of that captured model buffer remain reachable. Code inspection identifies the m.configuration reference.

Minimal fix: clear each module configuration only after its owner has successfully retired; preserve it while cleanup is unresolved so retry can still release the owner. Verify zero retained model bindings after successful whole-controller disposal.

## Other reviewed boundaries

- Real defaults and method shapes match the adopted Text/VAE, public Diffusion and mean adapters. Imports resolve within the delivered runtime trees. UI does not introduce a hidden injected service path.
- Route compilation rejects cycles, unresolved refs and invalid external field paths before owner execution. Explicit requirementId binding is additive on an independent tensor; other fields are preserved, and shared requirement identity is delegated to the existing compiler. No management arithmetic, resizing, scheduler or weight mapping was introduced.
- Inputs are captured before queue waits, including SharedArrayBuffer views. Earlier adapter races/asset retention were independently re-probed and are fixed.
- Native tensor export compares original fields after codec roundtrip and refuses field loss. Workspace stores primary payload plus complete native sidecars, arbitrary metadata/binary attachments and distinct auxiliary tensors. Restore creates new authority and requires model reselection. The existing package validates native bytes, metadata and snapshot structure/hash; runtime sessions are not reconstructed.
- UI separates configuration from actual load, exposes owner refusal, keeps explicit 1/4-thread choice and prevents silent fallback, and leaves generationReady/fullImplementationComplete false. Unsupported full-model LoRA consumer remains explicitly absent; no experimental LoRA or full NN acceptance is claimed.
- Latest browser harness includes official Text/VAE manifest capability/missing-asset cases and actual small Hike/native Worker controls. Its fixed-mode source guard checks its own and served bytes against the requested commit. Development receipts are correctly distinguished from pending fixed-source evidence.
- Root reported the environment-complete Node suite as 788/788 PASS, zero failed/skipped; this reviewer did not rerun it. Existing tests do not close the four reproduced cases above. Latest browser development report is 13/13; it is not neural evidence.

## Source boundary

- `docs/shared/ai-connection/operational-management.mjs` SHA-256: `0f75446eec9b8ca55fd4d7be5e21f66938682483bf6697297fba243bd637f2a9`
- `tools/ai-connection/run-operational-browser.mjs` SHA-256: `4f7df71677b5babdfdc2c0bb602fc3b6eb62c608c94642736651d99f531d1a78`
- `docs/ai-connection/modules/main.mjs` SHA-256: `7508804cd37a3290f35d6e7f0e37b9e773a71fa4d41e7d48ece774088ca88cdf`

At the final freeze comparison, all frozen source hashes matched except tools/ai-connection/test-operational-management.mjs, which was being extended for these findings. The reviewed controller/UI/adapter core remained at the frozen hashes. No approval is implied for later fixes without scoped re-review.

## Final scoped re-review addendum — all four findings resolved

**Final spec verdict: PASS for the reviewed implementation scope. Final quality verdict: PASS.** All four P2 findings recorded above are **RESOLVED** in the following fixed source. The initial findings and their reproduction evidence remain unchanged as history. This addendum supersedes their unresolved status; it does not expand acceptance to real NN, the absent full-model LoRA consumer, full-route numerical operation, or generation readiness.

Fixed distribution commit, supplied by root after the reviewed bytes were frozen: `71fdfca480f0a7500798cf4f3beb6364264b8421`.

The scoped re-review read the lifecycle, recovery and observer-currentness changes and independently reran the original exact controlled probes. It did not rerun broad suites or broaden the review. All probes used the real operational controller with its explicit control-only factory seam and performed no NN.

1. **Owner retention and disposal barrier — RESOLVED.** A failed old-owner disposal now leaves that owner reachable with recovery-required state. Recovery retries the original disposal: the original closes on its second disposal call, and the replacement also closes. With a factory held behind a gate after allocating a resource, controller disposal remains pending and does not report disposed; after the factory returns, it closes the resource and completes with zero open resources.
2. **Recovery scope and quarantine — RESOLVED.** Following a Text cleanup failure, recover('mean') rejects with RECOVERY_OWNER_REQUIRED and preserves operational quarantine. Recovering Text disposes the implicated original owner, then clears quarantine. No unrelated recovery can substitute for that release proof.
3. **Progress subscriber currentness — RESOLVED.** In the original two-subscriber probe, the first subscriber cancels the current target. Observed callbacks are now only ['first']; the second subscriber receives no obsolete progress. The implementation rechecks signal, cancellation, module revision and active invocation at each observer boundary.
4. **Controller configuration retention — RESOLVED.** Successful disposal clears every module's retained configuration. Repeating the 4 MiB captured-model-buffer probe under node --expose-gc, with event-loop yields and three GC requests, leaves the captured buffer unreachable through its WeakRef. All configurationRetained flags are false and retained model bytes are zero.

Final reviewed file SHA-256 values (independently read after the scoped probes, and confirmed by root to match the fixed commit):

- `docs/shared/ai-connection/operational-management.mjs`: `0f75446eec9b8ca55fd4d7be5e21f66938682483bf6697297fba243bd637f2a9`
- `tools/ai-connection/test-operational-management.mjs`: `c9698bb337f839d8be9feb5bcd2e0a6906fbeeb9de6d3736089110d25ea34803`

No new review or test execution was performed while writing this addendum. Only this private review record was updated; no repository source or commit was changed.
