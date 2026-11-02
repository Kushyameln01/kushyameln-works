# Final standalone LoRA review

Reviewed source: `4a3419c768e2b4b38b081314abe2cfaaeed6b14b` (R1), followed by the narrow R2 cancellation fix in the working tree. Baseline: `86f87f42c8585d823f06810370bc0bd451f3fce3`. Review date: 2026-11-02 UTC. Reviewed R2 SHA-256: `owned-package.mjs` = `848563d336975a57ac326544356fbf294cc75cb855bcddab8b460ea2ecba01b0`; `test-owned-package.mjs` = `b371a76c398c81a33919b28de6b4c1cf1b926b9689297a6264ba7c00cdf9a3c9`.

## Spec-compliance verdict

**Implementation approved within the reviewed scope; the P1 cancellation blocker is resolved by R2.** L1–L3 have the requested standalone architecture and public operations. L4 full numerical acceptance is still running and must not yet be reported as passed. That unfinished run is an evidence limit, not a remaining code defect. R1's private numerical execution source remains R1; R2 has focused cancellation/control validation and is not represented as a fresh full numerical run.

The inspected implementation preserves the intended boundaries:

- The graph-free logical registry and shared classifier cover the four declared source inventories: 1,052 light patches per side and 400 detail patches per side, 2,904 total. The canonical target table moved byte-for-byte from the old Diffusion location, which now reexports it. Source hashes identify bytes; normal registration does not require an inventory/sample allowlist match.
- Logical name/shape matching, standalone support, real graph binding, and training-base identity remain separate. `MAPPING.json` identifies `graphBindings: UNBOUND`, `trainingBaseVerified: false`, and no numerical execution. Its totals are 56,675,676,288 separate-source elements / 226,702,705,152 F32 bytes, with 1,052 composed-union targets and 14,286,919,744 elements per side. These are coverage metadata, not arithmetic proof.
- The new package owns verified sources and independent capabilities, streams complete original-coordinate rows, bounds resident cache entries, rebuilds from immutable base, and applies light before detail with separate F32 operations. Save streams actual payloads before the manifest; reopen verifies payloads and reconstructs fresh local authority. The old small-package and kernel paths are preserved.
- The fixed-side normal SDK exposes register/compose/prepare/stage/apply/restoreBase/save/openPackage/cancel/release/recover/dispose. Normal stage does not accept independent expected outputs, numerical gates, or an NN executor. Candidate identity/currentness, consumer epoch, rollback, cleanup recovery, and active/read package ownership are explicit.
- The independent host and NumPy oracle are development tools, with no Diffusion/management runtime dependency. Full arithmetic cases comprise six single-pair strength 0/±1 cases, two compositions and base restoration per side. Same-consumer reapplication/removal/cancellation/recovery and OPFS fresh-page persistence use tiny fixtures; those fixture results do not claim full original-matrix execution of every controller transition.

## Quality verdict

**Approved after the focused R2 recheck; no important/blocking defect remains in the reviewed scope.** The registry/planner, SDK/consumer transaction paths, package/cache/base/save/reopen paths, strict F32 kernel/build boundary, and acceptance/oracle/transport paths have no further important finding from this review.

### Resolved P1: low-rank factor reads omitted cancellation and could prevent terminal disposal

Location: `docs/shared/inference/lora/owned-package.mjs:133–134`.

The down-factor cache miss calls `readTensor(source, inspection, op.downName)` without `signal`. The up-factor read similarly supplies offsets/counts without `signal`. By contrast, delta reads, source capture, alpha validation and saving propagate cancellation. `readBlock` checks its signal only after the coalesced low-rank computation completes.

A valid retained source may implement an interruptible asynchronous read that needs the supplied AbortSignal to settle. In the affected path it receives `undefined`. Cancellation therefore cannot stop that read, the package remains in use, and SDK stage/dispose cannot reach terminal cleanup. If the read is later released externally, the up-factor read starts even though cancellation has already happened.

Fresh focused reproduction: `/tmp/lora-package-cancel-review.mjs`. It uses a synthetic 12-byte F32 low-rank payload and no original/model reads. Observed:

```json
{"factorReadReceivedSignal":false,"readSettledAfterAbort":false}
{"error":"AbortError","readsStartedAfterAbort":1}
```

Required correction was to supply an effective cancellation mechanism to both factor reads and prevent subsequent factor reads/product work after cancellation, with a defined policy for callers joining a shared cache entry and preserved terminal ownership.

R2 now gives each pending cache computation its own AbortController and active-waiter count. An individual abort withdraws that caller without cancelling live peers; the last caller aborts the computation. Aborted callers still await shared terminal work before releasing their originating source/kernel ownership. The product signal links into the nested down-factor computation; down/up `readTensor` calls receive internal signals, with checks between asynchronous reads and before subsequent decode/product work. Clear invalidates the cache publication epoch while retaining a live pending computation. Replacement callers wait for an already-aborted predecessor's terminal state before retrying.

The focused recheck inspected these changes and ran the nine new cancellation/cache tests only. All nine passed, with zero failures/cancellations/skips. They cover cooperative cold down/up reads, individual and all-waiter aborts for both same-product and shared-factor/different-row work, aborted cache hits, clear during live work and replacement after an aborted predecessor. The original private reproduction now reports:

```json
{"factorReadReceivedSignal":true,"readSettledAfterAbort":false}
{"error":"AbortError","readsStartedAfterAbort":0}
```

Its manual-gate reader intentionally does not listen for abort, so waiting for its externally opened gate is correct terminal ownership. The new cooperative-source tests settle without that manual unblocking. The supplied `R2-cancel-control-green.log` also records 69 passing package/SDK/host tests with no failures/cancellations/skips. `git diff --check` passed. No arithmetic, loader, shape, selected coordinate, kernel binary, oracle or gate changed in the inspected R2 diff.

## Evidence and review scope

Requirements read: `/workspace/work/lora/standalone-task/SPEC.md` common and LoRA L1–L4; `development/lora/standalone/PLAN.md`; `docs/shared/inference/lora/STANDALONE.md`. Scoped diff was materialized privately at `/workspace/work/lora/standalone-task/final-review-diff.txt`, excluding the large generated mapping record. Runtime code, supporting build/verification tools and focused tests were inspected, with independent focused package/kernel and acceptance/oracle reviews.

Fresh metadata checks confirmed the moved canonical table is byte-identical to baseline (`772ca63c3b82bafa7b2345cdda3361679112fcf4a97c79b67564da0fa196217d`) and all 2,904 mapping records have unique keys within their source and retain the declared unbound/unverified/not-executed flags. No source payloads were opened for this review.

Existing supplied evidence was read rather than broadly rerun: `development/lora/standalone/verification/source-node.log` records 228 passed, 0 failed/cancelled/skipped; Python reference tests were reported as eight passing; `tools/lora/kernel/streaming/validation.json` separates component bitwise/NumPy/decode/finite/browser checks from full adapter acceptance. `development/lora/standalone/verification/HOST-REVIEW.md` records resolved atomic rollback, delayed captured-read terminal joining and failed captured-release retry findings; the corrected paths and new boundary tests were inspected.

The actual-source full run at `/workspace/work/lora/standalone-task/full-run-1` and fixed-R browser rerun at `/workspace/work/lora/standalone-task/browser-source-4a3419` were in progress when this review was requested. This report does not assert their success. Earlier HIGH/LOW two-layer pilots remain PARTIAL evidence (872,939,520 values per side), not all-patch acceptance. A successful standalone run would establish arithmetic against the independent dyadic base and the stated consumer/persistence controls; it would not establish real-base comparison, training-base identity, real Diffusion graph application or generation readiness.

No source edits, commits, pushes, NN/model execution, original-payload reads or broad test reruns were performed by this review. The R2 recheck ran only the nine targeted cancellation/cache regressions and the private synthetic reproduction. Neither production NN execution nor another owner's ACK is added as a standalone completion gate.
