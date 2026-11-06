# LoRA standalone management connection r15 audit

Initial conclusion: PROCEED for implementation. Read-only goal/procedure audit; implementation and publishing remain root/worker responsibilities.

Management baseline directly verified: `92942230fbefe6ff727ba0b6f78f59591c46756e`; clean at initial review. LoRA distribution `6d0c8df4cd4992f26745d2d26394f5e194d2567f` exists locally as a fixed Git object. Read OWNER-API.md and OWNER-RESULT.md in full. Saved bodies match their fixed Git objects except one additional trailing LF per file; do not treat their transformed file sizes/hashes as raw remote-source acquisition identities.

Latest exact user text has not yet been supplied to this child or saved in this directory. Until it is, scope is explicitly based on root's assigned task, corroborated by the owner's actual API and result; direct user-source confirmation remains open and does not stop independent implementation.

## Goal and boundaries

Connect the new lora-standalone normal SDK through management, preserving the old v2 diagnostic bridge as a regression-only separate contract. Real SDK/Hike arithmetic with a conformant provider/consumer is required; actual full Bernini NN, every original, other-owner completion/ACK are not new gates. Management must not duplicate SDK mapping/arithmetic.

One SDK/registry fixes one HIGH or LOW side; both-side aggregate success requires both outcomes, and a failed side cannot become whole-batch success. Unselected pairs require neither registration nor known file-hash matching. Compose supports either/both/empty selections, rebuilt from immutable base, not accumulated onto prior weights. No image mean/F/H/W LoRA ports or independent expected/gate inputs belong on this normal path.

Actual API ownership/control requirements:

- PREPARED is a lazy owned recipe; FULL coverage is not already-computed dense output, graph binding or generation readiness. Normal consumer must actually validate all declared selected F32 ranges and currentness.
- SDK local revision, fresh transactionId, consumer epoch, management request/revision/resource generation are distinct identities. Keep manager metadata outside strict native arguments/context.
- Cooperatively cancelled bounded Hike work must reach original terminal before reuse. SDK.cancel alone proves no cleanup; failed rollback/release blocks work until recover.
- SDK prepared, consumer active and read leases are separate. Creator release may complete while independent active capability remains valid. Base/provider and caller-owned kernel/cache must outlive their remaining leases; SDK disposal does not own their disposal.
- save must stream actual payload, verify count/hash and publish manifest only after source streams fully consumed. Missing manifest means incomplete save. Do not collect potentially GB source streams in one Blob/download buffer.
- open requires new SDK authority, actual saved payload verification, same declared base/registry/kernel identities and fresh transaction; save JSON must never revive old handles/revisions. Fresh open must be followed by real stage/application, not only manifest parsing.

## Initial architecture observation

Existing adopted-lora.mjs explicitly requires SDKv2 PARTIAL diagnostics, independent reference and diagnostic target registry. It should not be silently repinned or generalized into new standalone acceptance.

Existing normal-operation and management-host primarily accept tensor payloads and structured-clone results. Standalone branded plans/prepared/leases must remain inside an outer owner adapter instead of pretending to be tensor values or serialized authority. Reuse common queue/snapshot control rather than implementing a parallel coordinator. The design should explain how JSON/native receipts and private runtime capabilities remain separate.

No implementation source/evidence has yet been accepted by this audit. Final checkpoints: real SDK/Hike management dispatch; exact side/target/revision/transaction/epoch/ownership binding; side failure aggregate; cancel/recovery barriers; independent active/read lease survival and final cleanup; streamed actual-file save/fresh SDK reopen+reapply; legacy bridge regression; declared source/verification scope/resource limits remain distinct from real NN generation.

## Design milestone

Read latest exact user requirements from USER-REQUEST.md (links expanded to fixed commit/path, body requirements preserved). Direct-request confirmation is now closed. Read persistent implementation PLAN.md under development/ai-connection/lora-standalone. Scope is consistent with the direct request: management to real SDK/Hike and conformant provider/consumer first; no real Diffusion/full-original/ACK wait.

The added single-side control adapter uses the existing queue/evaluateEdge/normal snapshot with an explicitly declared adapter-control artifact. It retains real branded native handles internally and snapshots independently copied operation metadata only. This avoids tensor/mean/shape-port fabrication. SDK arithmetic and mapping remain authoritative; reference provider/consumer delegates complete F32/range validation to the pinned owner reference host. Separate-side coordinator is selection/aggregate state management, not a second numerical engine or queue.

HIGH success followed by LOW failure is explicitly BATCH_FAILED/accepted=false/recoveryRequired. An explicit recovery calls SDK recovery and fresh restoreBase per requested side and records BASE_RECOVERED as a separate transaction. This is acceptable recovery semantics and must not be described as atomic rollback to the prior two-side state.

Directory/OPFS storage streams each source directly to a writable destination, waits for close before manifest, and does not collect source payloads into one Blob. Optional management sidecar is plain JSON with a separate 1 MiB budget; persistent metadata is not restored runtime authority. Fresh SDK open+stage remains a required final evidence case.

Two concrete review notes were sent to root for the stable implementation:

1. publicationDiverged is advertised as recoveryRequired but at this checkpoint is not included in live/query/terminal reuse guards; recover clears it while returning compensationRequired. The implementation/test must keep partial native publication from being mistaken for a recovered current selection before explicit compensating acceptance. Snapshot rollback's restored:true refers to copied management receipt state only and must not imply native model rollback.
2. compose/prepare/save/open/release synthesize state acknowledgements under a nativeReceipt key, unlike SDK stage/apply's actual receipt. API/reporting must identify synthetic management acknowledgements separately from unmodified owner receipts.

No test counts accepted yet by this audit for this milestone; source is evolving and no final fixed-source browser evidence has been reviewed.

## Pre-freeze completion-scope review

Conclusion: PROCEED to freeze the management source and perform the fixed-source browser acceptance. Both previously identified design notes are resolved in current source/API.

- publicationDiverged remains set through SDK recover. query is BLOCKED with COMPENSATION_REQUIRED; register/open/save are refused. Only an accepted fresh stage/apply/restoreBase clears divergence. Source and an actual native commit→delayed candidate-cleanup→target cancel test confirm that resource recovery is not mislabeled as publication compensation.
- Synthetic state summaries now use managementAcknowledgement. Actual SDK REGISTERED and CONSUMER_APPLIED stay under nativeReceipt. API.md explicitly distinguishes them, states snapshot rollback covers copied management receipt state only, and does not claim it restores a native model publication.
- Failed disposal records disposalPending and blocks new mutations; SDK recover can run even after queue closure, followed by disposal retry. It does not reopen that instance for normal reuse.

The auditor directly ran the five new Node suites with `--test --test-isolation=none`: 28/28 PASS, no failures/skips. Coverage includes real SDK File registration and Hike arithmetic, pair changes/reapply/base restore, opaque authority, exact target cancellation/original terminal, duplicate request protection, failed native cleanup/recovery, divergence compensation, disposal retry, side-local choices, HIGH-success/LOW-failure aggregate and fresh base recovery, streaming directory semantics, fresh-instance payload open/stage, and active/read lease survival/final cleanup. These 28 are new connection tests; historical 689/14 management results are not recounted as them.

Read development browser dev-05/result.json: 14/14 PASS, actual-new-LoRA-SDK-Hike-management-control, explicit synthetic local File + owner-conformant independent-base/reference consumer scope, source/browser errors empty. It is development=true and remains development evidence until fixed-source execution. Browser includes actual File controls and fresh page OPFS reopen/reapply, keeps separate side SDKs, and verifies terminal leases/backing cleanup.

Read root's OWNER-EVIDENCE-VERIFIED.json: 83 manifest entries, 6,444,720 bytes, all bytes/hash matched; adopted runtime+reference host equal owner R2, and R1→adopted difference restricted to owned-package terminal fix with arithmetic/mapping/kernel unchanged. It correctly declares rawOriginalsAcquired:false and retains full-patch numerical evidence at original owner scope. The auditor did not rerun that all-patch numerical workload and does not claim the management one-row fixture is a full-original numerical rerun.

API/REPRODUCE identify the exact full [5120,5120] canonical target, one selected original-coordinate row/all 5120 columns, F32 rank1 development safetensors and independent dyadic base, and separate PARTIAL connection evidence from logical FULL/real graph readiness. Needed real Diffusion graph/operator binding, genuine base provider, standalone consumer and model/session/generation validation remain explicit future joint edges rather than blockers for the requested management connection. No additional NN/full-original/ACK gate has been introduced.

Final remaining audit checkpoint: fixed execution SHA, fixed-source real browser acquisition/bytes/hash and final distribution record. Keep generationReady=false/graphBinding=UNBOUND; OS RSS/total peak unmeasured unless measured evidence is added. Merge and Pages status remain separate.

## Bounded known-boundary correction review

Read the independent REVIEW.md for the three cancellation/publication findings and their exact follow-up reproducers. Verified current adapter is 24,843 bytes, SHA-256 `52e3ea4f887951c9b5d6f40dd07a8ddd087b42cec2875527ee58f46ee77f1a28`, matching the reviewed source. Read the updated new-connection suite log: 31/31 PASS, no failures/skips (original 28 plus three regression cases). This checkpoint did not expand the exploration scope or rerun independent numerical arithmetic.

The corrections preserve the intended procedure/authority boundaries:

1. Undispatched cancellation resolves its native-terminal placeholder only when the existing queue reports notStarted=true. It does not fabricate a native stop acknowledgement, and permits original cleanup/successor/disposal to terminate.
2. The narrow consumer observation facade uses Reflect.apply with the original consumer receiver and exact native arguments/results. It observes commit attempt/return only; native SDK and consumer retain receipt/F32 validation and rollback responsibilities. Uncertain publication after a commit attempt remains BLOCKED pending fresh compensation, even if SDK stage rejects after candidate release.
3. actionFinished and accepted are separate. accepted is set only after existing queue confirms originalTerminal, resourceReleased, reusable and resultAccepted. Cancellation after action completion cannot become adopted management success.

These are required cancellation/ownership boundary fixes within the authorized work, not new scope or an arithmetic implementation change. The owner native closure/pins remain unchanged. Working-source review conclusion remains PROCEED to commit/fixed-source browser and full regression validation. Report the new 31 connection tests separately from historical 689 regressions and from the new versus legacy Chromium suites. Do not call uncertain publication a rollback or clear it merely on SDK recovery. No additional purpose/procedure blocker found in the bounded review.

## Final fixed-source goal/reporting audit

Conclusion: PROCEED; the requested management→real standalone SDK/Hike→conformant development provider/consumer connection may be reported complete in its declared PARTIAL connection input domain. Fixed execution source is `9a5a3574e25b4c352d7483ff1811d14c256dab10`; repository HEAD directly matched this SHA at review. Final evidence/distribution SHA remains separate and is being assembled by root.

Independently read `browser/fixed-9a5a3574/result.json`: development=false, fixedSourceVerified=true, 14/14 PASS, no source/browser errors; actual-new-LoRA-SDK-Hike-management-control scope explicitly excludes real Diffusion graph, trained-base verification, full-original numerical rerun and generation READY. Independently read all 36 acquired source/runner files from the current checkout and compared actual bytes/SHA-256 against the receipt; zero mismatches. Fixed adapter remains the independently reviewed 24,843-byte / 52e3ea… source.

Independently read `old-browser-fixed-9a5a3574/result.json`: separate legacy standalone management control regression, 14/14 PASS, 28 acquired files, development=false/fixedSourceVerified=true, no source/browser errors. Actual bytes/hashes for its 28 source files also match; these are legacy regression cases, not new SDK connection evidence.

Read root-executed fixed suite logs: FIXED-CONNECTION-SUITE.log 31/31 PASS; FULL-REGRESSION.log 720/720 PASS, no failure/cancel/skip. Report the partition 689 historical regressions + 31 new connection tests, not 720 new SDK tests. The auditor earlier directly executed the original 28 suites and reviewed the independent exact three-boundary reproducers, but did not redundantly rerun the full regression workload.

Read REMOTE-ACQUISITION.json: root fetched seven selected fixed GitHub API/code/UI/runner/WASM files at the execution commit, all exactMatch=true with path/bytes/hash/gitBlob recorded. This closes fixed-source acquisition evidence without requiring another owner's personal ACK or rerunning inference for acquisition.

Resource scope is precise: LOW was explicitly disposed before reload (consumer/read/in-flight/pending active state zero, kernel memory/leases/cache zero); the new HIGH SDK after reload was explicitly finalized to the same zero/closed resources. A live read lease demonstrably retained base/kernel after SDK creator disposal. Do not claim the pre-reload HIGH page's asynchronous pagehide disposal was fully observed; its resource zero was not measured there. Node lease tests and reviewer exact reproducers show terminal caller cleanup separately. OS RSS/whole-browser peak remain unmeasured; source/row byte volumes and kernel capacities are not process RAM measurements.

The existing `normal-p4-owner.mjs` still rejects targetRefs with NORMAL_P4_LORA_ROUTE_NOT_AVAILABLE. This is an explicit unclosed real-Diffusion route, not a reason to withhold the requested management-to-reference-consumer connection acceptance. Final RESULT must name the remaining canonical logical→real graph/operator binding, genuine model base provider, standalone-conformant real consumer/model session and generation verification. graphBinding=UNBOUND, trainingBaseVerified=false and generationReady=false remain. Old bridge/pin and old P4 base-path behavior are not generalized or silently replaced.

Final report may distinguish completed local File registration/selection/compose/apply/removal/reapply/base recovery/cancel/recover/lease/stream-save/fresh-open+stage from unaccepted real model integration, reuse owner all-patch numerical evidence only at its fixed scope, and separate distribution/execution/owner source SHAs. Merge and Pages status are separate. No remaining purpose/procedure blocker found. RESULT.md wording itself was not yet on disk at this checkpoint and should follow these bounded claims.
