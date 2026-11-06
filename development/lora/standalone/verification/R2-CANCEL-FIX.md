# R2 cold-factor cancellation control fix

The all-selected numerical run remains pinned to its original R1 execution source `4a3419` and private runtime copies. This change touches the owned-package cancellation/control path and regression tests only. No kernel arithmetic, loader multiplier, dtype, shape, selected coordinate, gate, source payload, or running private copy was changed.

The original cold low-rank path omitted cancellation signals on down/up factor reads. A cooperative generic reader waiting for an abort event could therefore remain pending forever; after a manually unblocked down read, the old path could start the up read after cancellation.

`createLoraProductCache().getOrCompute(key, compute, {signal})` now owns one AbortController per pending computation and counts its active waiters. `compute` receives that controller's signal. An individual cancellation withdraws only that waiter. The controller aborts when its last active waiter cancels. An aborted waiter still joins the shared computation's terminal state, then throws its own caller signal reason, preserving its originating source/kernel leases until other waiters finish.

Product computation links its signal into the nested down-factor cache request. Down and up `readTensor` calls receive the appropriate internal signal, with checks after each asynchronous boundary, between down/up, and before Hike decode/product calls. Cache hits check caller cancellation before copying. Cache clear preserves live pending computations and only invalidates their publication epoch. New callers arriving after all prior waiters cancelled wait for the aborted operation to terminate before starting replacement work for that key.

Regression evidence:

- Before the fix, cold down cancellation, cold up cancellation, and all-waiter cancellation tests timed out at 1.5 seconds.
- After the fix, cooperative cold readers terminate from their signal without manual unblocking; no up read or product follows a cancelled down read.
- One cancelled waiter leaves a live shared waiter intact and retains its originating package until computation terminates.
- Cancelling all same-product waiters, or all distinct-row products sharing a down factor, produces exactly one source abort and leaves no pending computation, source lease, or kernel lease.
- Live computation survives cache clear without duplication or stale recaching; a valid replacement request waits for an aborted predecessor's terminal state.

Fresh command:

```sh
node --test tools/lora/test-owned-package.mjs tools/lora/test-standalone-sdk.mjs tools/lora/test-standalone-host.mjs
```

Result: **69 passed, zero failed/cancelled** (package 33, SDK 26, host 10). Full output is `R2-cancel-control-green.log`. Syntax and whitespace checks also passed. The original focused review repro now sees a factor-read signal and starts zero reads after abort; its deliberately noncooperative manual gate still must reach terminal before the caller settles.

The final reviewer approved the focused R2 recheck: all nine new targeted regressions passed, the original reproduction now receives a factor signal and starts zero follow-on reads after cancellation, and no new important defect was found. `FINAL-REVIEW.md` records resolution and exact reviewed working-tree hashes. This note does not claim a new full all-selected numerical execution for R2. No commit or push was performed by the package worker.
