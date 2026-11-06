# Reference host review

Reviewed `tools/lora/standalone-host.mjs`, `tools/lora/test-standalone-host.mjs`, the current standalone SDK context/cleanup path, and the owned package capability contract. This report describes the initial reviewed host before the root agent's fixes. No implementation files were edited by this review.

The supplied `host-green.log` records five passing tests. I did not repeat that suite. I ran only the concrete boundary reproductions in `host-review-repros.mjs`; no original model files, NN execution, or benchmarks were read or run.

## Spec compliance

The host respects the L4 architectural boundary: it imports no Diffusion or manager implementation, uses a separately identified independent dyadic base, streams declared selected coordinates through the owned package, rejects diagnostic expected/gate arguments in normal validation, and retains distinct candidate, active, and captured-read capabilities. Consumer epoch is separate from SDK local revision. The current SDK context now supplies `sdkInstanceId`, `localRevision`, and `transactionId`; the initial transactionId mismatch disappeared when the SDK file was updated during review.

The five small host tests establish control behavior only. They do not establish the separate all-original/all-selected numerical acceptance or saved-package readback; those belong to the full standalone acceptance run.

## Blocking findings

### P1: rollback can overwrite a concurrently committed successor

Initial `rollback()` checks `r.committedAtEpoch === epoch` and `active === r.activated`, then awaits `active.release()` before assigning `active = r.previous`. A successor can publish during that await. The old rollback then overwrites the successor even though its epoch check is no longer true.

Deterministic reproduction: commit A at epoch 1; prepare and validate B at epoch 1; start A rollback without awaiting it; commit B; finish A rollback. An immediately resolved async capability release is enough to expose the race.

Observed output:

```json
{"case":"rollback-await-overwrites-successor","committedEpoch":2,"after":{"disposed":false,"epoch":3,"candidates":1,"readLeases":0,"inFlight":0,"active":false,"activePackageHash":null}}
```

Required outcome: publication/rollback ownership changes and epoch advancement must be atomic with respect to other publication operations. Cleanup may await afterward. An old rollback must never replace B or leave its active lease unreachable.

### P1: failed view cleanup becomes unreachable and disposal cannot retry

Initial captured-view `release()` marks the view released and removes it from `views` before awaiting the underlying lease release. If terminal package/source cleanup fails, subsequent view release immediately returns and the host no longer owns a retry reference. Initial `dispose()` also permanently caches its rejected promise.

Reproduction: capture A, replace it with B, and release A's other owners so the captured view is A's final owner. Make A's terminal cleanup fail once. Dispose the host, retry disposal, then retry the view release.

Observed output:

```json
{"case":"failed-view-release-dispose-cannot-retry","first":"Reference consumer cleanup failed","second":"Reference consumer cleanup failed","a":{"refs":0,"attempts":1,"cleaned":false}}
```

Required outcome: read admission may close immediately, but the failed cleanup capability must remain reachable until release succeeds. Disposal retry must perform the remaining cleanup rather than return the same failed promise.

### P1: disposal does not await captured-read terminal work

Initial `capture().readBlock()` does not register its operation in `inFlight`. Disposal therefore resolves before a delayed captured base read settles. Releasing a lease is insufficient to establish this terminal boundary when another package owner remains alive, and the base-only path has no package lease to wait on.

Observed output:

```json
{"case":"dispose-returns-before-captured-read-terminal","settled":false,"after":{"disposed":true,"epoch":1,"candidates":0,"readLeases":0,"inFlight":0,"active":false,"activePackageHash":null}}
```

The initial `track()` implementation also invokes caller callbacks before adding its terminal promise to `inFlight`. A synchronous `onBeforeBlock` callback can request disposal before its own validation task is visible. Disposal can then attempt candidate cleanup while `r.validating` remains true instead of waiting for the validation terminal state.

Required outcome: publish each stable terminal task before invoking external callbacks; track captured package and base reads; close admission on dispose and await every already admitted operation before reporting terminal disposal.

## Recheck

The root agent was notified of each finding and owns implementation fixes. The narrow reproduction command is:

```sh
node /workspace/work/lora/standalone-task/host-review-repros.mjs
```

Expected after fixes: if B commits successfully it remains active; if rollback wins the atomic boundary first, B may instead reject with a stale epoch. Captured reads must settle before disposal resolves. One failed cleanup must be retryable and reach `cleaned: true`.

## Focused fix recheck — resolved

Re-read the root agent's updated host and the five new boundary tests. The supplied `host-boundaries-green.log` records **10 passing host tests**. I did not repeat that suite or run NN/original-file work. I updated only the external reproduction script so a valid stale-epoch rejection is treated as an atomic rollback win, and so the captured-read probe can release its gate after observing disposal's wait.

Fresh reproduction output:

```json
{"case":"rollback-await-overwrites-successor","rollback":"fulfilled","commit":"rejected","commitError":"Stale reference candidate epoch","after":{"disposed":false,"epoch":2,"candidates":1,"readLeases":0,"inFlight":0,"pendingReleases":0,"active":false,"activePackageHash":null}}
{"case":"dispose-returns-before-captured-read-terminal","returnedEarly":false,"settled":true,"after":{"disposed":true,"epoch":1,"candidates":0,"readLeases":0,"inFlight":0,"pendingReleases":0,"active":false,"activePackageHash":null}}
{"case":"failed-view-release-dispose-cannot-retry","first":"Reference consumer cleanup failed","a":{"refs":0,"attempts":2,"cleaned":true}}
```

All three findings are resolved within the reviewed scope:

- Rollback swaps active ownership and advances epoch before awaiting release, so a concurrent successor cannot pass the old epoch and then be overwritten.
- Failed releases remain owned in `pendingReleases`; captured views remain in `views` until release succeeds. Release attempts coalesce, and a failed disposal clears its cached promise for retry. The formerly stranded final lease now cleans successfully on attempt two.
- Captured package/base reads use the tracked task path. Its stable promise is registered before external callbacks run. The delayed base read reaches terminal state before disposal resolves; the supplied new hook test also confirms synchronous reentrant disposal sees validation's already-published terminal task.

No remaining blocker from the three reported findings. This resolution does not expand the five/ten small host tests into full L4 numerical or persistence acceptance.
