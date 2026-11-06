# Real module UI work

## Inspection

The existing `docs/ai-connection/` entrypoint is explicitly a tensor-copy control reference. Its `main.mjs` instantiates `createReferenceOwner`, so it cannot be relabelled as actual execution. The existing `lora/` screen uses the actual standalone SDK but attaches development base and consumer resources; its diagnostics and lease controls should remain separate from the new actual Diffusion binding.

## Proposed source scope

- New `docs/ai-connection/modules/index.html`.
- New `docs/ai-connection/modules/main.mjs`.
- New `docs/ai-connection/modules/styles.css`.
- One discoverable navigation link and clearer reference label in `docs/ai-connection/index.html`; preserve all existing control element IDs and behavior.

No owner code, tensor math, mapping, shape adaptation, or numeric transforms belong in these files. No implementation started while waiting for controller interface brief.

## Proposed real UI

1. Route selection and summary: Text Encoder, VAE encode/context input, Diffusion generation, VAE decode, optional LoRA HIGH/LOW. Make the concrete selected whole route readable above the forms. Keep the exact native operation readiness distinct from management state.
2. Text: actual runtime bundle directory, source UMT5 safetensors, prompt, optional token IDs + attention mask JSON. Runtime ownership stays with the controller.
3. VAE: runtime bundle directory, input WKTENSOR, operation selector for standalone use, route checkbox for encode/context + decode output. Bundle manifest/profile determine allowed extents; the UI never fabricates a latent shape.
4. Diffusion: actual HIGH/LOW model safetensors and controller-specified profile/request JSON fields. Text result, VAE contexts, and LoRA complete weights connect through controller-managed records.
5. LoRA: optional HIGH/LOW groups, each with enabled light/detail file and numeric strength. Disabled choices do not require files. SDK composition/complete-weight binding handled by controller.
6. Global configure, capability query, run, cancellation targeting current invocation, rerun, recovery, dispose. Lock edits while a run/configuration is active, invalidate stale configuration on edits.
7. Route/per-step status table, actual errors/reasons, output descriptors, native tensor downloads if supplied, partial/final bundle save, bundle readrestore and explicit original-model-file reselection status.
8. Diagnostics behind details; product flow should avoid development-consumer controls, fake success modes, or implying READY when only control flow passed.

## Needed controller brief

- Export module path and factory name.
- Configuration object fields and actual File input names.
- Query, run, cancel, recover, dispose, subscribe/inspect methods and result shapes.
- Save/readrestore method or bundle helper integration.
- Native tensor/output download contract.
- Exact standalone module selection semantics and valid route combinations.

## Validation plan after implementation

Run syntax checks for UI JS and a local browser control flow with controller-mocked success/cancel/retry/save/restore behavior. Root/native integration tests establish actual module work; UI tests must not claim numeric acceptance.

## Implementation update

Task 4 UI implementation is present in the agreed four source files. Applied the executing-plans skill for this scoped implementation; root owns plan ledger, independent review, browser runner and integration. No commit or subagent dispatch.

- Direct import of production `createOperationalManagement`; no hidden global service injection.
- All four module cards configure/query/execute through controller. Diffusion exposes exact supported modelStatus/predict/sample/unload, with separate explicit load pair and 1/4 thread selector. COI absence rejects a requested 4-thread load and never changes thread count.
- Model folder maps remove exactly the one browser-selected root prefix and preserve all nested segments. A unique root manifest is required. Separate UMT5 source is bound under `manifest.embedding.sourceFile`, as confirmed by Text/VAE owner agent.
- Raw native JSON is parsed only. `$ref` helper supports tensor, tensor.data, result.tensor or whole response (empty path omitted). UI does not create noise arrays or reshape tensors.
- Mean transform is optional. Route builder merely copies user inputs; VAE decode has its own `route-decode-input` defaulting to raw Diffusion output tensor. It never reuses encode input implicitly.
- Models and edit inputs lock during operations. Exact `inspect().activeTarget` supplies cancel. Input revision changes disable retry of older inputs. Model/file changes require new configuration/load as appropriate.
- Tensor outputs can use native-codec save. Workspace bundle saves JSON-only form inputs, route and thread settings via the newly agreed optional controller `workspaceSettings`; restore repopulates those fields while clearing model File selections and invalidating all module configurations.
- Reference screen retains behavior and gains actual-module entrypoint; unsupported LoRA completed-weight consumer is stated prominently and links to separate standalone SDK UI.

## Checks run

1. Private structure check was created first and failed with `real-module UI entrypoint missing` before implementation.
2. `node --check docs/ai-connection/modules/main.mjs` PASS.
3. `python /workspace/work/ai-connection/full-route-r17/check-ui-structure.py` PASS (unique IDs, field labels, control presence, separate navigation, controller methods).
4. Imported actual controller from Node, verified every UI method, actual factory lifecycle/dispose, and false fullImplementationComplete/generationReady plus unsupported LoRA boundary: PASS.

These are structural/interface checks; browser controls and numerical NN acceptance remain separate, delegated by root next.

## Browser runner DOM IDs

- Overall state: `status` (`data-state`), `progress`, `module-list`, `state-details`, `result-details`, `error-details`, `environment`.
- Lifecycle: `cancel`, `retry`, `recover`, `recovery-module` (`''|text|vae|mean|diffusion`), `dispose`.
- Tensor import: `tensor-file`, `tensor-ref` (default `input`), `tensor-import`, `tensor-status`.
- Reference helper: `reference-ref`, `reference-path` (`tensor|tensor.data|result.tensor|''`), `reference-target` (`vae-input|mean-input|diffusion-input|route-json`), `insert-reference`.
- Text: `text-bundle` (directory multiple), `text-source`, `text-files`, `text-configure`, `text-prompt`, `text-tokens`, `text-output` (default `text-output`), `text-query`, `text-run`, `text-state`.
- VAE: `vae-bundle` (directory multiple), `vae-files`, `vae-configure`, `vae-operation` (`encode|decode`), `vae-input`, `vae-output` (default `vae-output`), `vae-query`, `vae-run`, `vae-state`.
- Mean: `mean-configure`, `mean-operation` (`normalizeRawMean|restoreRawMean`), `mean-input` (default `{tensor:{$ref:'vae-output',path:'tensor'}}`), `mean-output` (default `mean-output`), `mean-query`, `mean-run`, `mean-state`.
- Diffusion: `diffusion-high`, `diffusion-low`, `diffusion-threads` (`1|4`), `diffusion-files`, `diffusion-configure`, `diffusion-load`, `diffusion-operation` (`modelStatus|predict|sample|unload`), `diffusion-input`, `diffusion-output`, `diffusion-query`, `diffusion-run`, `diffusion-state`.
- Route: `route-text`, `route-vae-encode`, `route-mean`, `route-diffusion`, `route-vae-decode`, `route-from-forms`, `route-decode-input` (default `{$ref:'diffusion-output',path:'tensor'}`), `route-json`, `route-run`, `step-list`.
- Persistence: `output-list` (li data-artifact-ref + native save button for tensor descriptors), `save-workspace`, `workspace-file`, `saved-state`.

For Mean browser case: import a native tensor as `input`, configure Mean, fill `mean-input` with `{"tensor":{"$ref":"input","path":"tensor"}}`, run. Bundle save download then fresh-page restore should repopulate forms and durable artifacts while all configured module flags remain false and model pickers empty. Native tensor save buttons are within `#output-list [data-artifact-ref="..."]`.

## Root review corrections

- Added explicit `text-manifest` and `vae-manifest` File pickers. Official `prepared-model-manifest.json`, `vae-stream-manifest.json`, and `vae-stream-threads4-manifest.json` can be selected without renaming. Model folders supply assets under preserved manifest-relative paths; root `manifest.json` fallback applies only if no explicit manifest is selected. Manifest changes invalidate module configuration. Readrestore clears manifest File choices too.
- Replaced unconditional cancellation/recovery invalidation with synchronization against actual Diffusion `observation.loaded`, `reloadRequired`, `cleanupRequired`, and explicit selected-model/thread changes. Cancel/recover of Mean or Text no longer disables a healthy loaded Diffusion pair. Native Diffusion Worker termination still requires reload; cleanup-required state asks for explicit unload.
- Cancellation error codes `INVOCATION_CANCELLED`/`CANCELLED` render as cancellation lifecycle, not generic ERROR. A pending cancellation barrier locks controls, and cancellation terminal state remains CANCELLED whether the original execute catch or cancel Promise settles first.
- Native progress unwraps `result`/`progress` envelopes, including Text progress, and displays Diffusion stage/side and zero-based step as one-based `step+1 / steps`. Actual payload remains unchanged in controller diagnostics.
- Added optional blank `reference-requirement` text field. Nonempty input inserts `requirementId` with the `$ref` marker, for shared-shape target/source/reference slot identity. No fake default ID, tensor modification, or numeric/shape derivation is introduced. Native/controller validation uses explicit `workflowShapeRequest` on route JSON.

## Additional verification

`python /workspace/work/ai-connection/full-route-r17/check-ui-lifecycle.py` PASS using production HTML/JS with the controller module intercepted by a clearly CONTROL-ONLY fixture in Chromium. Assertions cover healthy Diffusion retained after Mean cancellation and Mean recovery; Diffusion cancellation requires reload; cancellation terminal/error-details race; native sample progress renders 2/6; explicit official manifest filename plus nested asset paths and renamed UMT5 source binding. This uses synthetic control fixtures and is not NN/numerical acceptance. Local HTTP/Chromium required sandbox escalation; approved auto-review allowed localhost-only check.

The private test initially used `inner_text()` on a closed details error field; corrected the assertion to `text_content()` because hidden detail content is excluded from rendered inner text. Final full test passed.

Actual default-factory browser runner owner separately reported dev04 11/11 PASS (small native Mean and actual API/codec controls, no neural model execution). The browser report remains its authority; this UI report does not expand that scope.

The private Chromium control regression was extended and rerun: blank requirement field emits only `$ref`/`path`, nonblank `source.latent` emits exactly the additional `requirementId`. PASS. The controller agent confirmed shared-plan validation and unchanged metadata/payload on the independent tensor copy.
