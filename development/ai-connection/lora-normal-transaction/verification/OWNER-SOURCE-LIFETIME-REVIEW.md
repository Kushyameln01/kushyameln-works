# Owner source lifetime review

Reviewed source: `48ff155988d995fc2569e495c8d8820273bd472c`, `docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs`, `source.mjs`, and `execution/p4.mjs`. This review changed no repository source.

## Observed boundary

Native `validate` checks the retained private F32 package, declared ranges, identity and transaction epoch; `commit` requires private `admittedAtEpoch` and rechecks abort/current/epoch. Neither operation independently re-reads the externally supplied base source descriptor or disposal state. A synthetic mutable-source harness reproduced three cases: disposal before validation, disposal after validation, and a changed `source.describe().modelHash`. Native validation and commit succeeded in all three; unselected-base reads failed after disposal. The returned `immutableBasePreserved:true` describes the patch operation preserving the base, not an independent lifetime guarantee for an arbitrary caller source.

## Actual execution owner guarantee

`createBerniniP4Execution` privately creates the immutable `createP4WeightSource`, exposes the feed rather than the underlying source, and closes stage → feed → source. Its `closing` flag is set before cleanup; source disposal happens last. Binding `isCurrent` to owner `disposed === false && closing === false` therefore rejects a transaction once owner shutdown begins. The real source descriptor is fixed after construction, and its `describe`/read methods reject after disposal.

## Callback used for the current manual-source transaction

The runner must retain its original source and bind `isOwnerCurrent` to all of: the managing request remains current; `source.stats().disposed === false`; and a canonical comparison of `source.describe()` against the captured original descriptor succeeds. Exceptions mean false. The callback must be checked throughout the adapter transaction and immediately before native commit. Cleanup releases candidate/package/leases and the feed before disposing the original source. This callback verifies liveness and descriptor continuity; it does not prove training-base compatibility from caller metadata.

## Evidence scope and remaining limitation

Reproduction: `/tmp/owner48ff-admission-review.mjs`; result: `/workspace/work/lora/p4-adapter-task/owner48ff-admission-review.json`. These are three synthetic source-control observations: no original model/LoRA file was opened, no full-file hash was computed, and no model operator or inference was run. They do not replace owner numerical evidence. The unpushed native `/0.2` proposal and its 18 tests were superseded; their results are not acceptance evidence for owner `48ff`.

Arbitrary mutable/custom sources whose owner does not preserve the descriptor and lifetime are not independently guaranteed by the native feed. Such sources require the above owner callback/lease responsibility or a future explicit native source-lifetime contract. No native fork was added for this review.
