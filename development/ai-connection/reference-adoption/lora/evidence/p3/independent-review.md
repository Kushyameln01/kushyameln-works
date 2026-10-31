# Independent readback: actual managed light/HIGH PARTIAL receiver

2026-10-31 UTC. Reviewer `/root/p0_catalog_audit`, with separate receipt-consistency subreview `/root/p0_catalog_audit/actual_phase_audit`.

**PASS within the selected scope; no blocker found.** This review reran no browser, SDK, Hike, ORT or model operation. It did not open or hash the original `.safetensors`, the raw base artifact, or any full model. It read only the already saved selected diagnostic artifacts, retained independent arrays/metadata and immutable Git source blobs. No worktree/product edits or commits were made.

## Evidence identity

| Item | Fixed identity |
| --- | --- |
| Executed receiver | `25e5b56feeb070594110bb292d9de21e4e234f0a` |
| Management | `edda43f9ea69c5b3ab1af3c6eb82295f2912887c` |
| LoRA owner | `fc2789a0f649e33f15eb13750e6a983b5c52d170` |
| Diffusion owner | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` |
| Trial result | `run-1/result.json`, 4,683,224 bytes; SHA-256 `f67a2a7533e45647e69122d0443d0f7378f5198135f98fe46d1e1808d2967c7c` |
| Reused independent reference | `0c27874908638afc748ea2455a2779a16736730b:development/ai-connection/evidence/lora-e1/HIGH-reference.json`; SHA-256 `2fe56045248bf75c3c2e63a310a56546288dd0b3a34c19cafc0e5ee9fc2c782d` |
| Reused predeclared gates | Same commit, `HIGH-gates.json`; SHA-256 `e435071fa955d66afee0f5a01d0b2f63e123bcf30d5982fe7bcba01da4513511` |
| Bounded base metadata | 709,364 bytes; SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`; five HIGH original ranges, no new full-file hash |

The trial's source is one local light/HIGH original, hash `9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945`, verified by the browser on this source load. The reviewer checked its reported identity/reference correspondence without reopening the original. Whole-hash cache use is confined to the same captured immutable browser File. No other original is a prerequisite of this trial.

## All selected numerical artifacts

All **26 files** in `run-1/actual` were read and matched their recorded byte length and SHA-256. Nine selected independent reference arrays were read and matched the hashes and lengths in the immutable accepted reference JSON. The reference JSON, gates and historical receipt themselves were compared byte for byte with their fixed Git blobs.

| Published case | Strength | Weight max absolute error | Bias error | Output max absolute error |
| --- | ---: | ---: | ---: | ---: |
| initial-zero | 0 | 0 | 0 | `1.3969838619232178e-9` |
| initial-one | 1 | `3.72290287486976e-9` | 0 | `7.450580596923828e-9` |
| initial-negative | -1 | `3.72290287486976e-9` | 0 | `7.450580596923828e-9` |
| reapply-one | 1 | `3.72290287486976e-9` | 0 | `7.450580596923828e-9` |
| validation-recovery | 1 | `3.72290287486976e-9` | 0 | `7.450580596923828e-9` |
| cancel-recovery | 1 | `3.72290287486976e-9` | 0 | `7.450580596923828e-9` |

The six published cases independently compare **491,520 weights, 96 bias values and 96 raw consumer-output values**. These counts are not combined with the old owner20 or manager fixture8 acceptance counts. Weight gate remains `abs≤1e-5+1e-4*abs(reference)`, bias remains exact numerical F32 equality, and output gate remains `abs≤1e-6+1e-5*abs(reference)`. Thresholds were not derived from the newly observed errors.

The uncommitted cancelled-checkpoint candidate has two additional saved files: **81,920 weights and 16 bias values**, strength -1. They independently pass the same declared gates, with weight maximum `3.72290287486976e-9` and zero bias error. They are **not a seventh published application**. There is no persisted candidate output artifact to add to the raw candidate-output comparison count.

Four separate lifecycle records persist another **64 output values**: after wrong-reference rejection, after cancellation, after source release, and after immutable-base restoration. They all independently pass the corresponding retained positive/base reference gate. Their preserved/restored outputs do not constitute additional model-application cases. All 96 published actual/expected values and all 64 lifecycle values are retained in `independent-readback.json`.

Strength zero's captured F32 weight/bias bytes equal the retained immutable base arrays exactly. All positive repeated/recovery W/b/output artifacts are byte identical to the first positive application. This corroborates immutable-base reconstruction without cumulative re-addition. No new bias bit-equality acceptance rule is inferred from incidental byte equality.

For each successful case, this review reconstructed the native `bernini-runtime-feed-set/0.1` package hash from **all actual saved W/b bytes** and the exact native model/graph/registry/side/PARTIAL metadata. It equals the real consumer validation receipt's package hash. The queued base-restore package hash likewise reconstructs from the exact retained F32 base arrays. This binds the compared arrays to the native consumer package; it does not merely accept arrays returned by a preparation helper.

All six scope JSON files retain full Q `[5120,5120]`, leading 16 selected rows and all 5,120 columns, full bias `[5120]` with selected16, explicit `linear-down-up` Q and `additive-diff-b` Q bias, 1,050 excluded targets, and excluded rows `[16,5120)`. They remain PARTIAL and `completeAdapter:false`.

## Source, P1 phases and native transaction correspondence

All **49 loaded source records**, totalling 13,527,663 bytes, were independently compared with their exact complete-commit Git blobs, lengths and SHA-256 hashes. This includes receiver code, management loader/evaluator/norm/transaction code, LoRA kernel and owner adapter, Diffusion bounded provider/consumer, Hike and vendored ORT. No old management diagnostic bridge was loaded. The active LoRA kernel remains the corrected 5,051-byte `3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24` artifact.

The separate phase subreview completed 59 recorded consistency/source-wiring checks with no blocker. It confirms:

- Preflight checks only current contract/source/header/loader/mapping declarations. Checkpoint uses the actual owner-validation receipt and separate all-selected weight/bias evidence. N-TRANSACTION is added only after actual publication, queue termination and release. No future receipt is inserted into preflight or snapshot bindings.
- All actual phase decisions are COMPATIBLE/ready within their requested phase scope. Missing-receipt, altered graph/source/selected region, old-kernel, unknown-required and missing-policy probes retain the expected classifications. These are real captured-boundary mutation probes, not new inference runs.
- Native source pins retain their complete URL/commit/path/hash values; the short catalog repository name is an explicit outer alias only. The artifact is selected weights `[16,5120]`; the 16-value projection belongs to the actual Diffusion consumer. LoRA merge evidence N-EVIDENCE and Diffusion projection N-NUMERIC are not conflated.
- Snapshot target, native facade phase target, resource owner/binding/generation, SDK instance/local revisions and exact queue invocation/token correspond for every case. SDK counters are not used as common manager revision or consumer epoch. For example, cancel recovery has manager revision `1008`, SDK local revisions `9`, and consumer epoch `7`; its subsequent base restoration advances the native epoch independently.
- Every successful native receipt remains `snapshotPublished:false` and `generationReady:false` under PARTIAL `CONSUMER_APPLIED`. Actual manager publication is a distinct diagnostic snapshot. Each published native state retains the exact dynamic `independent-copy` owner ID; it is not renamed to the manager resource owner. Candidate history/prepared storage are released after manager publication, and the actual consumer runs afterward.

## Failure, cancellation, recovery and restoration

The old manager request is specifically refused with `TARGET_MISMATCH`; the wrong independent reference exposes `NATIVE_VALIDATION_MISMATCH`; released source capability produces `SOURCE_BINDING_UNAVAILABLE`. The wrong-reference and cancellation paths preserve prior native output, leave the previous snapshot uncurrent and recover before later successful application.

The actual checkpoint cancellation receipt requires stop confirmation, original Promise terminal, resource release, reusable state and no quarantine. Its exact target is corroborated by the execution-commit call to `owner.invocationTarget(candidate)` and the matching terminal queue record; the reply itself does not embed another copy of that target. The cancelled candidate stays unpublished. This is cooperative stopping after bounded native work, not preemptive interruption.

Immutable-base restore is dispatched through the same queue with explicit native phase target, queue request/token and SDK local revision binding. Before native bytes change, the existing snapshot is made uncurrent. The real restore Promise terminates before owner after-terminal and queue release; restoration's native receipt does not claim a new manager snapshot. The historical snapshot remains present and uncurrent after all sixteen base-output values pass. Source release independently demonstrates that the active session's copy survives removal of source/prepared/history capabilities. No lease branch is invented.

No page/server/cleanup error, private original/base input HTTP request, or input stat change was recorded. The comparison-buffer resource accounting expressly excludes native/ORT/RSS/device/full-model budgets; this diagnostic result is not a whole-model resource admission.

## Reproduction and limits

`python /workspace/work/lora/p3-resume/independent_readback.py` only rechecks already saved evidence, retained selected arrays and Git blobs. It does not rerun inference or read the original/full model/raw base artifact. It records 354 artifact/source/numerical assertions plus the separately recorded 59 phase checks.

Output: `independent-readback.json`, 79,751 bytes, SHA-256 `bd6f137e04ed5ad6d83d6e03776a441a72e368efd2e6ee1411290d17eb46b846`. The private readback script SHA-256 is `ec4daf7432786725a94349b6a411374953934759e815f4b265501b8f5a195201`.

Individual SDK write-observer records were not separately persisted in published case records; this review instead reconstructs the complete native W/b package hash. The postpublication currentness refresh is source-inspected and all six actual decisions pass, with stale-toggle behavior covered by the earlier evaluator fixtures; this actual record contains no separate late-binding-change rejection trial. No new current whole-base hash or original hash by the reviewer is claimed.

This acceptance is **one light/HIGH original and one bounded actual-base Q/bias PARTIAL receiver connection with P1 phase hooks and diagnostic snapshot transaction**. It does not accept another pair/side afresh, two-pair composition, full targets, full model/session, lease/rebind, E4 package, generated output or generation admission.
