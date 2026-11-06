# R18 independent review

**Final disposition: PASS for the reviewed management implementation, including exact R17 saved-workspace compatibility. All reviewer/root findings are resolved and narrowly reverified. No open actionable code finding remains in this scope. This is not fixed-release/real-NN/whole-operation acceptance.**

Scope: read-only review of live checkout `/workspace/work/ai-connection/full-route-r17/checkout` against `development/ai-connection/latest-adoption/PLAN.md`, starting at baseline `9fe2c2e`. No repository edits, commits, source mirror edits, broad suite reruns or neural runs were performed by the reviewer. The supplied REVIEW.patch was supplemented by live-file reads because implementation continued during review.

## Initial findings (fixes in progress)

### R1 — P1: revoked feed authority makes LoRA observation throw and interrupts disposal

Paths: `docs/shared/ai-connection/adapters/lora-standalone/adapter.mjs` original `inspect()` near line 34; `docs/shared/ai-connection/operational-management.mjs` `createBoundLora().inspect()` and global `inspect()`; `docs/shared/ai-connection/adapters/diffusion-public/weight-feeds.mjs` scoped consumer.currentEpoch.

The managed feed correctly throws `DIFFUSION_WEIGHT_FEED_STALE` for new authority-dependent calls after invalidation. However, the existing LoRA side `inspect()` called `consumer.currentEpoch()` without handling revocation. Global controller observation recursively called this. Native worker/transport failure, or disposal through the exposed cached client facade, therefore made the controller's `inspect()` throw. Disposal also builds inspection events after releasing the SDK, causing a nominal disposal to throw and retain the adapter for additional retries solely because observation failed.

Focused reproduction used the actual `createManagedWeightFeeds` facade and actual adopted LoRA SDK/coordinator, with a reference backing provider and control-only operational Diffusion factory. Configure Diffusion, admit a HIGH feed carrying the backing logical registry, configure LoRA, then change the feed manager's `isCurrent` predicate to false. Observed:

```
before true
inspect THREW DIFFUSION_WEIGHT_FEED_STALE Weight feed ownership is no longer current
dispose1 THREW AggregateError LoRA SDK disposal requires recovery
dispose2 THREW DIFFUSION_WEIGHT_FEED_STALE Weight feed ownership is no longer current
```

Minimal fix: make observations nonthrowing when consumer authority has ended, report an unavailable epoch and native reason without fabricating a current epoch, keep actual cleanup failures retryable. Reconcile operational binding readiness with actual feed/consumer validity. Operational worker was notified and began a fix during review.

### R2 — P1: ordinary P4 cannot dispatch from the new UI because the required resource allowance is omitted

Paths: `docs/ai-connection/modules/main.mjs:110`, P4 panel in `docs/ai-connection/modules/index.html`, `docs/shared/ai-connection/adapters/normal-p4-owner.mjs:39`.

The UI configures current P4 using only `{modelFile, side}`. Its owner intentionally treats an absent `inputPayloadBudgetBytes` as unknown (`budgetBytes:null`); ordinary structural resource admission then prevents dispatch. There is no corresponding field in the reviewed P4 form, so selecting valid model files and valid canonical Text tensors cannot make the UI P4 route runnable.

Focused actual-owner NN0 reproduction: instantiate `createP4Management({modelFile:new Blob(['query-only']),side:'LOW'})` exactly as the form does; construct the three tensor inputs from `inspectNormalP4CurrentAdoption().inputs`, use L512 and canonical mask; query `postSelfAttention`. Output:

```
{"status":"SUPPORTED","dispatchSupported":false,"reasons":[],"resource":{"status":"available","requiredBytes":8450560,"budgetBytes":null,"occupiedBytes":0}}
```

Minimal fix: expose and forward an explicit logical input payload allowance with its actual scope, or select an authorized default under the existing owner contract. Validate the UI-created configuration against the real P4 owner, not only an injected factory. No model execution is needed for this admission check.

### R3 — P2: successful unload/load discards dedicated retry identifiers for failed feed cleanup

Paths: `docs/shared/ai-connection/operational-management.mjs:234` (`weightFeeds.clear()`), same-side replacement near line 238, `docs/shared/ai-connection/adapters/diffusion-public/adapter.mjs` unload callback (`await weightFeeds.closeAll().catch(()=>{})`).

The underlying Diffusion manager intentionally allows unload to continue after a host package release failure while retaining that package/client and `cleanupRequired` feed metadata for a later retry. The operational controller unconditionally clears its feed registry after successful unload/load. Its `retryCloseWeightFeed(feedId)` first resolves that registry, so the dedicated retry call becomes `WEIGHT_FEED_NOT_FOUND`, and the UI selector loses the failed cleanup entry. The native manager still retains the resource; this is a loss of operational retry access, not proof of a native lease leak. Global owner dispose/recover is a different available recovery path.

Minimal fix: preserve cleanup-only operational entries until the corresponding native manager confirms closure, including across reload and same-side replacement. Keep stale access revoked, preserve the captured old owner for retry, and do not let old cleanup target a replacement feed. Native inspection already supplies the metadata necessary to distinguish successfully closed and cleanup-pending feeds.

## Contract assessment

The principal design is consistent with the requested ownership boundaries. The adopted Text/VAE bootstrap pins 20f640a with its new manifest, lowering support and current codec together; graphBindings remain on result/capability sidecars. Current P4 has a separate adoption module and current canonical conditioning capability. The full-model adapter is not gated by historical P4 rejection.

The dedicated feed route removes the port before ordinary response cloning, keeps raw clients/capabilities private, exposes metadata plus an explicit facade accessor, and invalidates cached admission authority independently of failed cleanup. Its close/retry captures the original feed; same-side replacement waits prior same-generation cleanup; cancellation during handshake awaits native terminal and then closes the admitted feed. The native duplex RPC handles reverse package/base reads independently from the parent invocation queue. No management implementation of LoRA arithmetic or canonical mapping was found in these changes.

The native package implementation retains its own kernel lease; clearing the caller cache and disposing its root kernel handle does not, by itself, invalidate a package lease. Raw unannounced browser MessagePort.close detection is not treated as a defect in the supported manager protocol path: the manager hides raw ports and uses native close/relay terminal messages, with the separately recorded browser evidence.

Initial verdict: code is **not yet sufficient for implementation completion** because R1–R3 are concrete interface/lifecycle/UI gaps. These are separate from pending fixed-source real NN acceptance and holder execution receipts. Existing synthetic/control results and historical owner numerical results do not establish new controller NN acceptance or generation readiness. Review will be updated after narrowly checking the fixes.

## Intermediate R3 verification with actual managed native transport

After the first unload synchronization fix, a focused probe reused only the fixture helper declarations from `test-diffusion-public-weight-feeds.mjs` (no test suite execution), returned its real `createDiffusionPublicManagement` instance through the operational control-only factory, and used actual MessageChannel/native weight client/server. It prepared/committed a package, forced retained package release to fail, unloaded, loaded another model generation, and opened a replacement HIGH feed.

Observed unload now preserves the old entry with `live:false, closed:false, cleanupRequired:true`. However, the subsequent same-side open removed it; `retryCloseWeightFeed(oldFeedId)` still returned `WEIGHT_FEED_NOT_FOUND`. This confirms R3 across reload/replacement with real managed port machinery, rather than only an injected feed descriptor. The operational worker was notified to finish the replacement branch fix. The fresh feed remains live, and manager disposal subsequently releases both after the failure switch is cleared.

## R1–R3 final recheck

All three reviewer findings are resolved in the current controller/UI implementation.

- **R1 fixed:** actual managed-facade + adopted SDK focused probe now returns unavailable epoch metadata; controller LoRA readiness is `BLOCKED`, `dispatchSupported:false`, with `DIFFUSION_WEIGHT_FEED_STALE`. The first global `dispose()` succeeds. The worker also added regressions for the spontaneous invalidation path.
- **R2 fixed:** P4 form now exposes editable `p4-input-budget` defaulting to 16,777,216 bytes, clearly scoped to logical input payload, validates it and forwards `inputPayloadBudgetBytes`. Reviewed browser receipt `operational-browser-dev-4/result.json`: 14/14 PASS; the actual UI/current-native P4 case reports `normalP4DispatchSupported:true`, required logical bytes 8,450,560 and `neuralExecution:false`. This is development-source evidence (`fixedSourceVerified:false`), not an immutable release receipt or NN result.
- **R3 fixed:** the focused actual native MessageChannel repro now retains both entries after unload→load→same-side reopen: old `{live:false,cleanupRequired:true}` and new `{live:true,cleanupRequired:false}`. Retrying old close succeeds and the fresh feed's client remains valid. Successful cleanup removes only the confirmed old entry.

Reviewed hashes at this point:

```
80ec005a2ae7509751073a27debd9d9e6bdabe4ff52a154d0eb5f28e099bb7fd  docs/shared/ai-connection/operational-management.mjs
94b8a4506ceca30ee6dec504734a80a249e928b187e9a12ad23fc66c722e579f  docs/shared/ai-connection/adapters/lora-standalone/adapter.mjs
084c3b6560eac7e826155c7bd86740d778d993537d8313f05be5ddcc4447cb63  docs/ai-connection/modules/main.mjs
4140c4768c8adbb5d0aa73271ffbcc78bc5df1f7778cfa6cae1337d6252bbbbe  docs/ai-connection/modules/index.html
```

Remaining active review item raised by root: pre-admission rejected/late ports still use unannounced local `port.close()` in some Diffusion paths. My prior assessment of supported native close applies to admitted facade disposal and native relay cancellation, not to every pre-admission rejection branch. These branches must send the native protocol terminal packet before local close so browser relay/server bookkeeping does not depend on unsupported remote raw-close detection. Root assigned the correction to the port worker; verification remains pending here.

## Final port rejection and host-cleanup policy recheck

Root's additional rejected-port finding is fixed in current code. `closeUnadoptedWeightPort` sends the adopted `WEIGHT_PORT_PROTOCOL` terminal packet before closing the endpoint. The adapter captures the returned port before checking native reply identity or cloning metadata; identity, cancelled-late-result, wrong-side and metadata failures all use that helper. `adopt()` uses it for stale-model/descriptor rejection and the no-client close fallback. The native client initialization failure path correctly retains the native client's existing `rpc.close()` notification instead of implementing another RPC.

The manager now explicitly separates successful native model unload from retained host package cleanup using `weightFeedCleanupRequired`, `pendingWeightFeedIds`, `hostWeightFeedResourcesReleased` and `cleanupScope`. It consults live native client cleanup observation, keeps exact retry IDs, and blocks new load/numerical/feed admission until pending host cleanup finishes. This deliberate later policy supersedes the earlier production repro that permitted reload while host cleanup was pending; the controller's old-generation retention regression still demonstrates correct ID preservation where old/fresh records coexist.

Reviewer reran only the three changed cases:

```
node --test --test-isolation=none --test-name-pattern='rejected native port|late successful port|unload reports retained host' tools/ai-connection/test-diffusion-public-weight-feeds.mjs
3 tests, 3 pass, 0 fail
```

These cases observe remote protocol-closed packets/server closed state, original late cancellation, and retained host cleanup admission/retry. They do not depend on Node remote port-close events as a substitute for browser semantics.

Current port hashes:

```
74ac0610e1ada5bcbb7b709ff12e0d0f02a541aa1c1bb5d8e0694ec9934f9787  docs/shared/ai-connection/adapters/diffusion-public/adapter.mjs
e137efb1285c4e97a6cce8845ed4581444bcd021752420d75d20aafc4bfbe578  docs/shared/ai-connection/adapters/diffusion-public/weight-feeds.mjs
90aef620c188d2052524ba45e944cfbf695f6b49c433fdcd7fe1648f3d71e590  tools/ai-connection/test-diffusion-public-weight-feeds.mjs
```

No active implementation finding remains in the reviewed code. Port worker's actual browser relay-rejection receipt is the last targeted verification pending for this review; immutable-source release checks and real NN acceptance remain separate root-owned tasks.


## Final disposition

Reviewed the updated `weight-port-browser/result.json` and the exact rejection harness. Actual Chromium 154 uses the adopted native factory and host relay with synthetic Worker storage. All six supported browser cases pass; the rejected identity/side/model cases include independently sessionId/jobId-matched Worker receipts with `serverClosed:true`, followed by a valid replacement and successful disposal. Host-cleanup-after-unload blocks reuse, exact-ID retry settles, and reload succeeds. The seventh case separately confirms the known raw unannounced endpoint-close limit; it is not counted as a supported managed-path failure. No NN or model asset execution occurred.

**PASS for the reviewed management implementation.** No remaining actionable finding was identified in the scoped current source. The code now provides dedicated runtime MessagePort/client/package ownership, cancellation and explicit failed-release retry; operational current Text/codec/P4/LoRA wiring is present, and confirmed UI/resource admission gaps are fixed. The fixed-source release rerun, holder receipt/actual model neural acceptance, trial LoRA/full operation experiment and generation readiness remain separately scoped and are not established by this review. There is no claim that historical results or synthetic storage establish those acceptances.

The controller/UI and port file hashes listed above remained unchanged on the final reread. This report preserves initial findings and intermediate failed probes as review history; their current status is resolved.

## Reopened: R17 saved-workspace compatibility

Root subsequently found an additional compatibility blocker outside the initial same-version roundtrip probes: the exact committed `development/ai-connection/full-route/verification/browser/workspace.zip` contains six artifacts registered under `works:operational-wktensor` / `badff7a/WKTSR001`, source `badff7a436b56207a084c4c770e01490899a576c`, `docs/shared/inference/tensor.mjs`. Its fixed bytes are 297,204, SHA-256 `2ebe7f9ebd334fa02833cfee43c1f5a407a7d0e18ac680536a1cec9fe2fc21bf`. The current restore registry supplies only the new current codec identity, so restoration refuses all six files with `NATIVE_CODEC_UNVERIFIED` despite byte-identical codec implementation. This is an implementation compatibility gap, not a missing NN receipt.

Scoped review is reopened for the proposed exact, source-verified legacy read alias. The current writer identity and all historical saved evidence must remain unchanged; arbitrary codec identities must remain untrusted. Prior R1–R3 and port findings remain resolved.


## R17 compatibility final recheck — PASS

The compatibility correction is limited to `operational-management.mjs` restoration and its focused tests. `readCodecRegistry()` registers exactly the R17 codec ID/version/source identity as a decode-only alias. Before registering, it checks the already verified current tensor source digest and hashes the actual legacy tensor source against `7a15d721b1bab60cdade8723fd1c4d543a142d236cf2e59b63f1ba33ba14ed78`. The tensor implementation is self-contained; no package-directed import, arbitrary fallback or source relabeling is added. The alias is supplied only to `restoreWorkspace`; writer identity remains current20f.

Reviewer independently ran only the two new tests: exact committed R17 restore/rewrite and unknown codec ID/version/pinned-source rejection; **2/2 PASS**. A separate narrow comparison decoded the original ZIP with its pinned badff reader, restored/re-saved through the current host, then decoded the current output: all six artifacts (`input`, `masked-text`, `mean-output`, `restored-mean`, `disk-readback`, `recovered-mean`) exactly preserve tensor payloads and metadata, sourceRecords, snapshots and trace. Profile and explicitly resupplied workspace settings also match. All runtime modules remain unconfigured. Unknown codec identities still fail with `NATIVE_CODEC_UNVERIFIED`.

The committed old archive retains SHA-256 `2ebe7f9ebd334fa02833cfee43c1f5a407a7d0e18ac680536a1cec9fe2fc21bf`; no historical browser evidence file has a Git diff. Final changed-file hashes superseding the earlier operational hash:

```
94c5efccfe52ce1bcdfbf227199b4fa9812c8c13ffdd7a4249be670a2ecc5114  docs/shared/ai-connection/operational-management.mjs
105e28a6628d4b46bab966d8337183702a49d1baa3d3a5111f2d473b8b3aef3f  tools/ai-connection/test-operational-management.mjs
```

**Final disposition restored to PASS for scoped implementation.** All previous findings remain resolved. No broad suite or neural execution was added by the reviewer; fixed-release evidence and actual neural/full-operation acceptance retain their separate pending scope.
