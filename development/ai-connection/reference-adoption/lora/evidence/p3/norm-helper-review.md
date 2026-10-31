# Receiver P1/P3 norm helper: independent source review

Date: 2026-10-31 UTC. Reviewer: `/root/p0_catalog_audit`. Read-only review; no tests/model execution, model/original reads, product edits or commits.

## Review inputs and stable source identity

Repository worktree `/workspace/work/lora-implementation`:

| File | SHA-256 |
| --- | --- |
| `tools/ai-connection/p3-norm-edge.mjs` | `48b809b368830646871c87693984dd5bc3d86b647e78ea6842cfcf3d246f7287` |
| `tools/ai-connection/test-p3-norm-edge.mjs` | `f7bb3e52fd952d99f12aa3b9a9e5bebe3b0bca774445a397a472ac9e09f00131` |

The initial versions (237 helper lines / 94 fixture lines) were read completely; the changes below were then independently reread. The table records the stable post-fix hashes. Initial source hashing overlapped the author's fixes, so the table must not be interpreted as the hash of the pre-fix helper. Their fixture tests execute the actual management evaluator supplied via `WORKS_P3_NORM_MANAGER_ROOT`; the coordinating agent's original `norm-edge-fixtures.log` records 4/4 PASS with no skips. These are receiver assembly fixtures with deliberately fabricated source/registry/receipt values, explicitly not native or real-base numerical evidence. The reviewer did not rerun them.

Management contract compared: `edda43f9ea69c5b3ab1af3c6eb82295f2912887c`, including `reference-loader.mjs`, `norm-bindings.mjs`, `compatibility.mjs`, adopted/candidate facade, snapshot owner and snapshot manager. Fixed reference bytes are `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`.

## Blocking findings in the initial source

1. **Consumer revision namespace.** `input()` labels its consumer binding as Diffusion but sets `activeBindings.consumer.currentRevision` and `expectedRevision` to SDK `plan.localApplicationRevision`. The SDK local planned generation is not an observed Diffusion consumer epoch. Use an explicit outside binding/revision namespace with provenance and currentness, or an actually observed consumer revision when available. Keep SDK local revisions in `localRevisionBindings` and do not invent a pre-commit consumer application.
2. **Phase currentness.** `postpublication()` clones `checkpointInput`, including cached `activeBindings.valid`. It does not invoke `isCurrent()` again. A callback that becomes false after checkpoint can therefore retain a READY norm result. Refresh currentness for the new phase or explicitly refuse a stale phase. Add a toggle-current negative fixture.
3. **Native state and copy proof.** `postpublication()` checks terminal/release booleans and native plan/source/validation correspondence but does not require stage receipt state/scope/ownership or match the published `nativeStates` ownership. The initial fixture intentionally omits native receipt ownership and still passes. Require actual `CONSUMER_APPLIED`, PARTIAL diagnostic scope, and `independent-copy` native owner identity matching the published step. The real native consumer does not implement a lease branch; do not synthesize one. Add absent/mismatched ownership negatives.

These findings concern the new receiver evidence assembler, not a demonstrated defect in the already pinned native consumer. They were sent to the coordinating agent and helper author before actual receiver execution.

## Checks that agree with the design

- The descriptor now describes **selected Q weight `[16,5120]`**, with full shape and explicit bias bundle metadata, as the artifact passed from LoRA preparation into Diffusion. It does not claim the SDK produces the consumer's 16 output vector. The consumer output shape is separate metadata and numerical evidence.
- Repository spelling is an explicit outer alias. `catalogSourceAlias` accepts only the two known Works spellings, preserves complete commit/path, and does not edit caller/native pins. Returned results retain the original `nativeSourcePins` separately. Dropping SHA fields in the outer source-ref representation does not relabel the retained native pin proof.
- Contract preflight carries N-IDENTITY/N-LOADER/N-MAPPING only. It emits no numeric/transaction/package receipt. A preflight READY result is limited to those selected contract norms; every returned phase retains PARTIAL and `generationReady:false`.
- Preflight checks every selected patch and source dtype visible in the actual inspection, including explicit light Q `diff_b`. It retains native rank/alpha/scale/shape/slice as loader details without recomputing the LoRA formula or inventing a default strength.
- Checkpoint requires an existing native scoped validation receipt with matching plan/source/registry/model/graph/reference/tolerance/Hike identity and an existing independent all-values weight/bias comparison (81,920 and 16 values). Those are separate receipts: Diffusion Q output evidence goes through N-NUMERIC with EXEC-BERNINI-Q16-F32, and LoRA selected weight/bias evidence goes through N-EVIDENCE owner validation. It does not create an EXEC-LORA record or pass a catalog ID as a native profile ID.
- Postpublication requires actual snapshot publication, exact manager snapshot target and native SDK local revisions, matched native phase target, matching native validation, and exact queue invocation identity with original terminal, release, reusable and accepted flags. It adds the N-TRANSACTION delegation only at that phase. No future queue or snapshot receipt is created during preflight/checkpoint.
- N-ARTIFACT is optional and explicitly requires a selected-weight package record. An output-vector package belongs to a separate edge; it cannot be passed as this selected-weight artifact merely because it shares an execution profile. This optional branch has no new acceptance from the four current fixture cases.
- Negative probes preserve known-conflict versus unknown-required-contract versus absent-numeric-evidence classifications. They do not count fixture PASS as real-base acceptance or sum scopes into FULL.

Initial disposition: **changes required before a new actual run may be described as verifying currentness/native-revision/copy correspondence**. Final disposition will be appended after the stable fixes are independently reread.

## Stable-fix follow-up

All three initial findings are **resolved in the stable source whose hashes appear above**:

1. `consumerBinding` now requires a named outside revision namespace, explicit nonempty revision token, manager session and resource owner/binding/generation. A live `readConsumerBinding` must reproduce that selected outside binding. SDK producer revision is marked `native-sdk-input`; the Diffusion-labeled consumer binding no longer receives the SDK local application counter. The original native source pins and SDK local revision fields remain unmodified.
2. `postpublication` calls `activeBindings()` again immediately before the actual evaluator. That refresh calls both currentness callbacks. The added fixture toggles currentness after checkpoint and changes the outside consumer revision token; both cases preserve contract compatibility while blocking readiness with `BINDING_NOT_CURRENT:consumer`.
3. Postpublication requires the actual stage receipt state `CONSUMER_APPLIED`, PARTIAL coverage, diagnostic scope, native `generationReady:false`/`snapshotPublished:false`, and a nonempty `independent-copy` owner. Exactly one publication `nativeStates` entry for the selected step must match both state and ownership. Added negatives refuse missing ownership, a different copy owner, and a lease substitution. Manager session/resource identity is also checked against the selected outside binding.

The helper author reports the focused actual-edda evaluator fixture suite at 5/5 PASS after these fixes. The reviewer independently read the new test code and stable byte hashes, but did not rerun the tests. The original four-test log is historical evidence, not a post-fix five-test log.

Final source-review disposition: **no remaining blocker for committed-source receiver integration execution** within this helper's selected-weight/PARTIAL scope. A real receipt and artifact readback are still required before claiming actual P1/P3 real-base integration; the helper fixtures themselves do not establish it. Optional selected-weight N-ARTIFACT handling, output-vector package handling, lease ownership, full targets, full model/session and generation admission remain outside this source review's new acceptance.
