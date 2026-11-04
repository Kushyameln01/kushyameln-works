# Task 3: operational controller

Owned files:

- `docs/shared/ai-connection/operational-management.mjs`
- `tools/ai-connection/test-operational-management.mjs`

No commits and no edits to another agent's files. PLAN Task 3 and the root's subsequent native boundary clarifications were applied. Executing-plans and test-driven-development skills were read. Focused tests were written and observed failing before each behavior implementation; some characterization tests cover behavior that had already been implemented during that cycle.

## Public interface

Synchronous `createOperationalManagement({services?})` returns:

- `configureModule('text'|'vae'|'diffusion'|'mean', configuration)` -> `{configured,revision,state,observation}`. Each configuration replaces/disposes the previous adapter rather than reusing model authority.
- `execute({moduleId,operation,input,outputRef?})` -> the complete native management packet, with additive `moduleId`, `outputRef`, and optional full `artifact` record.
- `executeRoute({steps,externalRefs?,finalRefs?,workflowShapeRequest?})` -> `{status:'EXECUTION_COMPLETED',steps:[{stepId,moduleId,outputRef,response}],finalRefs,artifacts:{[ref]:record},plan}`.
- `query({moduleId,operation,input})` -> the real owner response; stale asynchronous queries reject. `moduleId:'lora'` returns an explicit unsupported full-model binding reason.
- `cancel(inspect().activeTarget)` -> existing queue terminal/release report. Exact retired/mismatched targets reject.
- `recover(moduleId?)`, `dispose()`, `inspect()`, `subscribe(listener)`.
- `deriveWorkflow(request)` -> direct delegation to existing `deriveWorkflowShapes` (also named module export).
- `importTensor(ref, File|Blob)` -> complete durable record using latest pinned native codec.
- `saveTensor(ref)` -> Blob after native encode/decode comparison of every original field, including binary bytes/types. Any omitted/changed field rejects `NATIVE_SAVE_METADATA_LOSS`, directing the caller to workspace saving. Unknown metadata is never injected into native bytes.
- `saveWorkspace({workspaceSettings?}={})` -> existing package `{bytes:Uint8Array,manifest,receipt}`.
- `restoreWorkspace(File|Blob|Uint8Array)` -> `{status:'RESTORED',artifactRefs,fileRequirements,workspaceSettings,modelReselectionRequired:true}`.

`inspect()` exposes `disposed`, `restoringWorkspace`, `revision`, `activeTarget`, `modules` keyed by ID, artifact summaries, `lastError`, `lastRoute`, existing queue inspection, `controlTestDouble`, evidence scope, `fullImplementationComplete:false`, `generationReady:false`, and explicit `lora` unsupported reasons. Events are `{kind,value,state:inspect()}`. Progress values are `{moduleId,requestId,progress}`. UI agent was sent these exact shapes.

## Reused authorities and boundaries

Real default factories are imported only when the selected module is configured. Text/VAE use the new standalone owner, Diffusion its existing real public owner, and mean its new owner wrapper. `services:{controlTestOnly:true,createModule}` is an explicitly labeled control-only seam. Production Diffusion configuration cannot hide an injected `api`.

The existing `compilePipeline` performs identity, unresolved reference, topological ordering, duplicate producer and cycle checks before route dispatch. Normal inputs do not require numerical receipts or references. Generic `{$ref,path}` values resolve recursively into independent owned data. External paths are preflighted before the first owner execute. No shape formula, native normalization, model mapping, sampler or LoRA application is implemented here.

An explicit reference may add `requirementId` as a native slot label on an independent tensor copy. The original tensor and every other field remain unchanged. With `workflowShapeRequest`, every such label is passed as `inputBinding.workflowRequirementId` to the existing compiler, which rejects unknown shared requirements before execution. Existing conflicting tensor labels, non-tensor labels and marker attempts to rewrite shape/meaning/normalization reject. This root-requested native slot binding is not a tensor conversion or owner support claim.

A separate existing invocation queue serializes operational work. Each adapter retains its distinct owner queue/resource identity. The parent AbortSignal reaches the child. Cancel freezes the native target once, waits the original child Promise and owner release, and uses explicit owner stop or actual terminal evidence. Preflight with no native target uses the forwarded signal and waits terminal proof. Missing stop/cleanup proof quarantines operational reuse until terminal/disposal/fresh-owner recovery. Step-start and completion observers cannot cause a cancelled result to be published.

Input views backed by SharedArrayBuffer become independent ArrayBuffer snapshots while preserving view types, offsets and graph aliases. Accessors and non-plain native input containers are rejected before cloning can normalize them into accepted packets. Delayed results/progress/query responses cannot cross configuration revisions.

## Persistence

The existing `buildManagementBundle`/`readManagementBundle` and latest badff7a native codec write/read actual tensor bytes and verified metadata. Arbitrary tensor metadata, complete result/execution/snapshot/trace packets, auxiliary distinct tensors, and mean `inputMetadata` remain in workspace sidecars. Primary tensor deduplication records exact object identity paths; native extension objects resembling a placeholder are preserved literally. Native codec framing fields do not replace original tensor metadata on restore.

Workspace restore blocks concurrent new dispatch, verifies the package before retiring adapters, clears all module configuration authority, and requires model reselection. Saved model File and binary buffer configurations are metadata/reselection requirements only; model sessions and File capabilities are never restored. An import or restore completing after disposal cannot repopulate operational state.

## Verification and scope

Focused command: `node tools/ai-connection/test-operational-management.mjs` -> **31 passed, 0 failed**. Log: `/workspace/work/ai-connection/full-route-r17/controller-focused.log`.

Syntax check: `node --check docs/shared/ai-connection/operational-management.mjs` -> passed.

The focused suite includes a real default mean owner capability/refusal integration and actual pinned native codec import/export/workspace operations. Injected factory tests are explicitly control-only and provide no NN or numerical transformation evidence.

Final full documented suite: **761 total, 714 passed, 11 failed, 36 skipped** (the 11 failures below are missing external fixed-source environment inputs). See `/workspace/work/ai-connection/full-route-r17/controller-suite.log`. The existing environment-dependent failures, when no external source roots are configured, are:

1. `P4 delegates native support and rejects unsupported shape before preparation` — missing `NORMAL_P4_NATIVE_SOURCE_ROOT` fixed30e.
2. `request for a different configured model side is rejected before file preparation` — same.
3. `new Text normalization marker is retained and rejected by actual P4 helper` — same.
4. `normal P4 lazily prepares and executes three owned artifacts through shared host` — same.
5. `P4 retains explicit metadata/profile conflicts and checks every named input` — same.
6. `missing service payload budget preserves support but blocks common resources` — same.
7. `P4 cancellation waits original run and old target cannot address a later run` — same.
8. `P4 disposal failure quarantines published success until confirmed recovery` — same.
9. `tools/ai-connection/test-normal-vae-owner.mjs` — missing `NORMAL_VAE_NATIVE_ROOT` fixed498.
10. `tools/ai-connection/test-run-normal-holding.mjs` — missing fixed498/fixed30e/fixed855 source/fixture roots.
11. `real VAE facade routes controlled RGB and mean while target81 stays owner unsupported` — missing fixed498.

No real model NN run was performed by this task. Full-route implementation completion remains false because the fixed full-model LoRA weight binding is absent. No experimental LoRA was requested or received. A native tensor-only file intentionally rejects unknown metadata; workspace is the complete preservation path.

## Final review wave: controller lifecycle and observer corrections

The final reviewer reported four P2 issues after the initial freeze. All were reproduced in new focused tests before implementation:

- A failed previous owner disposal could lose the controller's reference, and manager disposal could finish before a pending configuration factory returned its allocated owner.
- Recovering an unrelated module could clear global quarantine while its responsible native owner still required recovery.
- A progress subscriber could cancel an operation while a later subscriber still received the stale event.
- Successful manager disposal did not clear retained model configuration File/buffer capabilities.

Correction: `serializeLifecycle` now sequences owner factory creation, retirement, configuration replacement, recovery, workspace retirement and manager disposal. `retireOwner` keeps the actual adapter reachable on release failure, marks `recovery-required`, and permits an explicit retry. New adapter creation waits for confirmed previous release. An obsolete factory's returned owner is tracked before its disposal is attempted. Manager `disposed:true` waits for the original pending lifecycle/factory terminal and every retained release; failed manager disposal remains retryable and blocks new configuration. `restoreWorkspace` uses the same retained retirement helper. Successful manager retirement clears configuration.

`recoveryOwners` records the native module IDs responsible for failed cleanup or unconfirmed cancellation. Unrelated recovery rejects `RECOVERY_OWNER_REQUIRED`; rebind is allowed only after implicated owners have been retired and no remaining adapter reports recovery/quarantine. Progress and operation event delivery check the current signal, revision and target before each subscriber; abort stops subsequent delivery immediately.

Current additional inspect fields: `disposing`, `pendingLifecycleOperations`, `recoveryOwners`, and per-module `configurationRetained`.

Focused review-wave verification: **39 passed, 0 failed** with `node tools/ai-connection/test-operational-management.mjs`; log `controller-lifecycle-focused.log`. The eight added regressions cover previous-dispose failure + recover, pending factory disposal barrier, workspace-release failure + retry, unrelated recovery, inter-subscriber stale progress, configuration release, manager disposal retry and superseded pending factory release-failure sequencing. `node --check` passed. Root owns the final full suite with the now-materialized `regression-env.sh`; the earlier missing-source full-suite result above is historical, not the current root acceptance result.

Frozen SHA-256:

- `docs/shared/ai-connection/operational-management.mjs`: `0f75446eec9b8ca55fd4d7be5e21f66938682483bf6697297fba243bd637f2a9`
- `tools/ai-connection/test-operational-management.mjs`: `c9698bb337f839d8be9feb5bcd2e0a6906fbeeb9de6d3736089110d25ea34803`

Scoped validation of these four original P2s was requested from `full_route_review`. No commit was created.

Scoped reviewer result: **PASS for all four original P2s**, with no additional finding in the requested scope. Exact original probes passed, including GC verification that a disposed controller's captured 4 MiB configuration buffer is unreachable. Reviewer verified core SHA-256 `0f75446eec9b8ca55fd4d7be5e21f66938682483bf6697297fba243bd637f2a9`; no source files were changed by the reviewer.
