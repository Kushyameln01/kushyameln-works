# Independent diffusion-public review

Scope: read-only review of the new management adapter, native adoption bootstrap,
control tests, and retained-model browser runner against USER-REQUEST.md and the
fixed owner's MODEL_RUNTIME.md. Reviewed 2026-11-02 before commit, based on
76d813cd48930767caa3e4cf8e797996cc5b6798 plus the new untracked implementation.

## Important finding — resolved

**P2 — Progress reaches management listeners after synchronous cancellation.**
`docs/shared/ai-connection/adapters/diffusion-public/adapter.mjs:98` verifies
freshness before calling the request's `onProgress`, then unconditionally emits
the event to subscribed management listeners. If `onProgress` synchronously calls
`manager.cancel(manager.inspect().activeTarget)`, cancellation invalidates the
model before those listeners run. They nevertheless receive the old event. The
same missing recheck applies between subscribed listeners if one cancels.

Read-only injected API reproduction: the sample API invokes a progress callback
with the exact current request/model identities; request `onProgress` calls
`manager.cancel`; a `manager.subscribe` callback records the progress event. The
sample rejects with `INVOCATION_CANCELLED`, but the subscription still records:

```json
[{"kind":"progress","eventModelGeneration":1,"currentModelGeneration":2,"reloadRequired":true,"loaded":false}]
```

This violates the intended stale-progress suppression after observer-triggered
cancellation. Recheck the original request/model freshness after the request
observer and before each subscribed progress observer. No tensor was accepted in
this reproduction.

Resolution independently verified after the focused fix:

- `emit` now accepts an `isCurrent` guard and checks it before each listener;
  `dispatch` passes its full current request/model guard after `onProgress`.
- The original injected reproduction now records zero subscribed progress events
  after local-observer cancellation: `firstCount:0,laterCount:0,reloadRequired:true`.
- Cancellation inside subscriber 1 records `firstCount:1,laterCount:0,reloadRequired:true`;
  subscriber 2 receives no invalidated progress.
- Both requests still reject with `INVOCATION_CANCELLED`; the native model
  session remains invalidated and reload is required.
- Fresh adapter suite: 17 passed, including both focused cancellation cases and
  the missing-predict capability-description case. No new broad review scope was
  opened after this fix.

## Verification and limits

- Initial `node tools/ai-connection/test-diffusion-public-adapter.mjs`: 15 passed;
  focused-fix follow-up: 17 passed.
- `node --test tools/ai-connection/test-diffusion-public-adapter.mjs tools/ai-connection/test-diffusion-public-native.mjs`: both files passed.
- No other critical/important finding in the reviewed request/model lifetime,
  identity, cleanup, result snapshot binding, fixed source adoption, or runner
  control paths.
- This review did not execute the 31 GB HIGH/LOW model pair and establishes no
  one-thread NN/Pages execution acceptance.
