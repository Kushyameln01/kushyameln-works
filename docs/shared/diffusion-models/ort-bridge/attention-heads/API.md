# Derived N2 all-head boundary (diagnostic v0.1)

`createDerivedQkvHeads({file,side, trustedProducer, ...})` consumes an owned producer snapshot `{hidden:Float32Array(10240),positions:Float32Array(6),sourceIds:Int32Array(2),evidence}`. `trustedProducer` is a separately supplied receipt for this artifact and producer source/build; the browser harness checks the artifact SHA before conversion. Hidden, positions and IDs hashes, expected model/side/block/timestep and the exact grid must match the receipt. Receipt matching binds inputs; it does not authenticate arbitrary caller claims or accept original production inputs.

The core BLC `[1,2,5120]` is lowered to LC `[2,5120]` with implicit batch1 and rows `(t,h,w)=(0,0,0),(0,0,1)`, source0, context absent. Projections read original bounded weight tiles; full5120 Q/K RMSNorm precedes extraction. V has no QK norm or RoPE. Each of40 heads processes exactly2 queries and2 keys through ORT score/exp then the existing Hike streamed recurrence. Output is owned F32 `[2,5120]`, before `self_attn.o`.

`run({...snapshot,signal,onProgress})` locks before getters, copies input before await, rejects active reuse, checks cancellation at each weight/head boundary. Cancel is cooperative, so await completion before `dispose()`. Dispose releases independently owned resources; failed release retains the handle and requires `recover()` before reuse. Prefix resources must be disposed before constructing this boundary. Downstream owns one Gemm and one attention ORT session, not a SiLU session.

`createAllHeadContext().run({q,k,v,signal})` is the lower post-QK-norm/RoPE boundary. Inputs and output are compact F32 `[2,5120]`. One exact-Q2 symbolic-K graph is reused across40 heads, with native Hike `reset(2)`, K2 and no padding. The exact-shape graph is a new module; the accepted old N16/head0 path is unchanged.

Gates and source scope are fixed in `development/ai-connection/qkv-next/expansion/candidate-plan.json`. Local downstream reference consumes actual producer hidden bits; a second composed reference consumes independently calculated prefix hidden. Neither substitutes for the other. Numeric arrays and actual source-derived bits remain private; public results contain hashes and metrics.

`load/predict/sample=NOT_READY`. This scope omits O projection, residual, cross-attention, FFN, later blocks/timesteps, context/production81frame inputs, original production precision, and a combined full-run memory/copy/time acceptance.

The producer receipt must have `schemaVersion:'bernini-hidden-prefix-trusted-receipt/0.1'`, `passed:true`, `artifactSHA256`, `producerSourceSHA256`, and exact `evidence`. This diagnostic admits only HIGH global schedule index1 (`sigma=0.9617158770561218`, `timestep=961.7158813476562`) or LOW index3 (`sigma=0.8333333134651184`, `timestep=833.3333129882812`) from the frozen prefix scope, with noiseScale1 and no context. The old workflow's Euler/simple6steps/shift5/split3 is preserved; these separate side checks do not establish a HIGH→LOW handoff. Production flags must remain false and readiness must remain `NOT_READY`. Runtime IDs, arrays and hashes do not turn a caller-provided receipt into an authenticated origin; receipt trust is supplied by the importing owner.

```js
import {createDerivedQkvHeads} from './stage.mjs';
// First independently verify artifact bytes and the trusted receipt/source closure.
const stage = await createDerivedQkvHeads({
  file: originalModelFile, side: 'LOW', trustedProducer: checkedReceipt
});
try {
  const result = await stage.run({
    hidden: Float32Array.from(checkedArtifact.hidden),
    positions: Float32Array.from(checkedArtifact.positions),
    sourceIds: Int32Array.from(checkedArtifact.sourceIds),
    evidence: checkedArtifact.evidence,
    artifactSHA256: checkedReceipt.artifactSHA256,
    signal: controller.signal
  });
  // result.attention: owned F32 [2,5120], before O projection.
} finally {
  await stage.dispose();
}
```

On abort, await the rejected run before disposal. If cleanup fails, `stats().cleanupPending` is true, native handles remain owned, and `recover()` retries release; reuse is rejected. The manager owns its returned arrays and may discard them after consumption. Source snapshot/copy is intentional and recorded separately from Hike Memory. No GPU/native handle, borrowed native view, or fullmodel session is returned.

Factory construction is awaited and has no cancellation parameter in this diagnostic version. If the manager cancels while construction is pending, it waits for the factory result and disposes that result. `AbortSignal` applies to `run`; a callback cannot interrupt an already active native operator, and cancellation is observed at the next bounded boundary.
