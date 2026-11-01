# Normal execution implementation plan

> Agent workers use the existing project execution workflow and tests before implementation.

**Goal:** Known owner-supported shapes execute normally without diagnostic inputs; unsupported shapes stop with owner reasons.

**Architecture:** One shared metadata-only workflow shape source. Explicit owner facade plus existing evaluateEdge/queue/snapshot. Diagnostic entrypoints remain separate and unchanged.

**Tech stack:** Existing ES modules, Node24 tests, Chromium dedicated-worker actual native Hike.

**Spec:** `development/ai-connection/normal-execution/SPEC.md` and the user's current request.

## Constraints and review focus

- No normal request requires source/build/kernel evidence, independent reference, numerical gate/prior PASS or E4.
- No manager profile allowlist, tensor math or layer mapping. Shape equations alone never grant execution.
- Real supply/order and unresolved context metadata must not create invented frames/source IDs.
- Queue wraps the complete transaction; do not enqueue a child onto its own blocked parent lane.
- Configuration change/cancel/late result/release failure must invalidate adoption and preserve terminal barrier.
- Existing diagnostic branches and standalone native APIs preserve their old behavior/scope.

## Task 1 shared shape source — workflow_slots

Create workflow-shapes.mjs, test-workflow-shapes.mjs. Consume explicit geometry and supplied metadata. Produce deriveWorkflowShapes(input), parseBerniniWorkflowShapeRequest({workflow,media,geometry}), BERNINI_WORKFLOW_RULE_ID.

- [x] RED source F/min cap, source area/center, editor848 ties-even16, latent/patch/context/source_id/concat tests.
- [x] GREEN same pure source, no Profile acceptance or tensor operation. Unknown/absent/overflow handled explicitly.
- [x] Fixed-source correspondence independently reviewed; source-map document records scope.

## Task 2 normal snapshot — p4_norm

Modify snapshot.mjs; create test-snapshot-normal.mjs. Normal selected step includes internalcapabilityRef and normal edges. Structural validate echoes capabilityRef, snapshot target, operation/source/build. Normal commit EXECUTION_COMPLETED with owned copy/lease. Do not narrow common schema.

- [x] RED normal scope; exact capability/owner/op binding and delayed stale ack tests.
- [x] Add normal branch and preserve diagnostic branch.
- [x] Related111 tests PASS; root final suite remains separate.

Additional binding task: create `adapters/workflow-normal-requests.mjs` and its focused tests. Copy only missing geometry from the one shared plan; reject explicit contradictions without owner query. Preserve owner responses, unknown dependencies and absent optional inputs separately. Integrate actual helper→owner query in the normal runner.

## Task 3 normal host and concrete owner — p4_candidate

Create adapters/normal-operation.mjs and adapters/normal-diffusion-owner.mjs plus focused tests. Use SPEC protocol and coordinate final field names with runner. Internal source/build/session observation; no caller sourceVerified/ref/gate. Support capability-derived from native owner and actual constraints. Host binds query to current generation and creates normal snapshot, invokes native inside one queue transaction, returns only after terminal/release. Optional diagnostic native details stay outside normal request.

- [x] RED supported execution without numerical inputs, unsupported owner reason, owner response/request mismatch, stale configure, cancel A/B, release failure/recover, no E4 requirement.
- [x] GREEN generic host plus actual Diffusion mean facade; no copied profile values or mathematical functions.
- [x] Focused integration tests with actual generic core; preserve existing diagnostics.

## Task 4 actual normal native runner — p4_runner

Create run-normal-operation.mjs and browser companion, focused tests, reproduction. Bootstrap fixed5f source/actual namespace and real browser Worker. Call normal API with actual Rect mean data; perform normalize→restore without references/gates/E4. Collect lifecycle separately. Diagnostic comparison imports retained numerical reference/owner comparator outside normal entry.

- [x] RED missing/corrupt owner source, known supported ordinary descriptor and unsupported shape, cancellation/disposal.
- [x] GREEN fixed runner with actual resource/lifecycle observation and no full-model claim.
- [x] After source4667 commit, real normal roundtrip and separate numerical diagnosis completed once; receipts preserved. Cancel observer fix tested and real cancellation accepted at sourcef1dceb9.

## Task 5 root integration and review

- [x] Match shared helper to controlled retained P2 metadata and normal owner requests; original workflow media remains unknown.
- [x] Independent review of changed core/host/shape boundaries and actual native normal/diagnostic/cancellation receipts.
- [x] Full existing AI regression with explicit native roots: final576/576 PASS, FAIL/SKIP 0; 162 files unchanged during tests.
- [x] Execution sources4667/f1dceb9 frozen and pushed; fixed native verification complete. Normal, numerical diagnostic and cancellation proof are separate; API/limits/reproduction/result are recorded.

Release actions (final evidence distribution and Draft PR metadata) are recorded in the GitHub PR and final delivery reply. Recipient download acknowledgments remain a separate state from the sender's verified GitHub retrieval.

## Task 6 concrete workflow owners after scope audit

The accepted mean route is retained; it does not alone close known workflow RGB/latent requirements. Actual new owner APIs are available and must be bound, not described as absent.

- [x] lora_return: receive VAE498 source/index/production closure; implement normal VAE facade and explicit descriptor helper with actual capabilities, configuration invalidation and lifecycle.
- [x] p4_candidate: receive Diffusion527/30e source/inventory; add named-input host and normal P4 facade delegated to actual support/run, preserving old scalar path.
- [x] p4_norm: route shared known RGB/latent requirements to explicit normal owners without role-to-native-meaning inference or copied geometry.
- [x] p4_runner: prepare holding-environment normal runners with real source/asset preflight and ordinary descriptors; keep existing normal4667/cancelf1 evidence unchanged.
- [ ] root: verify changed boundaries, publish API/source/results and source acquisition ACKs; distinguish missing private assets and pending joint execution from unsupported shape or numerical failure.
