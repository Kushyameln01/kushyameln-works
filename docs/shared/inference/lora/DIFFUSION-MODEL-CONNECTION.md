# LoRA → Diffusion model source connection

Contract `lora-diffusion-model/1.0-draft.1` adds a canonical adapter for the full-model original-weight port. Existing standalone SDK, mapping, loader, low-rank/diff/bias calculation and Hike kernels remain unchanged. This adapter does not require independent expected outputs, gates, neural inference or detailed diagnostic receipts in a normal transaction.

The fixed receiving owner is Diffusion `ffeeeedb6b57d182a977c3ac02c042ce235fc87a`, with `createCompletedModelWeightSource` in `execution/model-weights.mjs` and the direct `createBerniniModelCandidate({source,...})` constructor. Management `e1661e561dfb1a4f20544ff48bc375175b5981d1` already supplies `createLoraManagementSide` and the standalone SDK adoption. The currently published Worker `load`/internal sampler still creates base sources from model Files; it has no completed-provider injection route. The following direct source path is implemented; adoption into that public sampler is a separate integration change.

## Actual construction and call order

```js
const source = await createModelWeightSource({file: modelFile, side}); // Diffusion owner
const connection = await createDiffusionModelLoraAdapter({
  source, createCompletedModelWeightSource
});
const control = await createLoraManagementSide({
  side, registry: connection.registry, baseProvider: connection.baseProvider,
  consumer: connection.consumer, kernel, cache
});
await control.register({pairId:'light', file: selectedLocalLoraFile});
await control.apply({selections:[{pairId:'light',strength:1}]});
const model = await createDiffusionLoraModelSession({
  adapter: connection, createModel: createBerniniModelCandidate
});
try {
  const prediction = await model.predict(nativePredictionInput);
  // The prediction retains the Diffusion owner's dtype/shape/meaning.
} finally { await model.dispose(); }
// Dispose the old session before reusing cached model weights for a new epoch.
await control.apply({selections:[{pairId:'light',strength:-1}]});
// Create a new source-bound model session for the new epoch.
await control.restoreBase({});
await control.dispose();             // management queue and SDK ownership
await connection.dispose();          // candidate/active feed creator ownership
// Release all independently captured sessions/views before their backing owners.
cache.clear(); kernel.dispose(); source.dispose();
```

`nativePredictionInput`, graphs, tensor semantics and image F/H/W remain the Diffusion owner's API. LoRA does not calculate shapes, mean tensors, normalization, scheduler steps, or neural operators. Normal LoRA stage does not call `createModel` or `predict`. A caller may use the source adapter without the session convenience helper or management.

## Adapter and bindings

`createDiffusionModelLoraAdapter({source,createCompletedModelWeightSource})` is async. It accepts the immutable full-model `describe/readRows/readVector/stats` owner and its real synchronous completed-source factory. It returns:

| Field/method | Contract |
| --- | --- |
| `registry` | Strict standalone logical registry; source model/side and all 1,053 eligible original key/full shapes |
| `baseProvider.describe/readBlock` | Immutable original F32 source, element offsets/counts; complete matrix columns, no applied feed as a base |
| `consumer` | Existing standalone `describe/prepareLoad/validate/commit/rollback/releaseCandidate/currentEpoch` contract |
| `captureSource()` | Fixed-epoch `{source,epoch,packageHash,description,isValid,release}`; `source` is the real completed owner port |
| `describeBindings()` | Separate LoRA→native binding table; actual storage/compute dtype, original shape/range, operator, native block limits, excluded original targets |
| `currentEpoch()` / `stats()` | Native feed epoch, active package, candidates/read leases/pending work/cleanup and measured operation counts |
| `dispose()` | Stop new consumer/capture work, wait terminal operations and release candidate/active ownership; independently retained views remain caller-owned |

The model owner has 1,095 original targets. Exactly 406 2D matrices use `runtime-input` and 647 1D vectors use `hike-parameter`. The 42 remaining targets (40 block modulations, head modulation, patch embedding Conv weight) pass through immutable base. They are not legal patches in the existing 2,904-source-patch scope. `initializer`, implicit transpose/flatten, unknown binding/parameter, unknown dtype or FP8 scale/profile are refused. Native binding metadata is not inserted into `graphInitializer` or the strict standalone registry.

The four original source mappings are joined separately to this table. A complete selected source can retain standalone `coverage:'FULL'`; that means every patch in that selected source, not every model tensor changed or a complete NN accepted. Explicit slices remain `PARTIAL` with original full shape and exclusions intact. A new user selects only the required pair/side File(s); this API has no all-four-file or known-payload-hash admission gate. Key/shape compatibility does not prove training-base identity.

Base storage F16/scalar-scaled E4M3FN decode belongs to Diffusion. The completed callback returns final F32 from the existing owned package. It is neither a delta nor a value to rescale. The owner currently reads base before this callback, while the unchanged package reads its immutable base again; this can double selected base I/O. The adapter serializes original-source reads and splits at the actual 81,920-element / per-target row bound. A 75-row FFN-down package tile splits into 15 native 5-row reads; no input columns are dropped. The package retains its 1,048,576-element maximum.

## Normal validation and publication

Prepare retains its own package capability and checks package version/loader/order/kernel identity, canonical package integrity, base identity and strict registry. Validate enumerates every declared full-coordinate range, reads completed finite compact F32 blocks, checks current context/epoch and returns structured normal admission. Expected/gate/reference/run arguments are rejected. Commit rechecks source identity, signal, request currentness and native epoch immediately before synchronous publication. SDK local revision, management revision and native epoch are distinct namespaces; equal numbers do not make them one revision.

Commit returns standalone `CONSUMER_APPLIED` with independently retained lease ownership, meaning the F32 feed is published. It does not mean a model prediction ran. A late/old candidate cannot roll back a successor. Predecessor ownership is retained until candidate cleanup; release failures are retried rather than losing handles. A loss of restoration capability is surfaced as publication divergence instead of a false restored receipt.

A capture freezes epoch/package and independently retains bytes/kernel dependencies. Its source can read old weights after later publication or prepared/SDK/adapter creator disposal. `release()` stops new reads, joins existing read promises, disposes the completed wrapper, then releases its package capability. The original base owner remains caller-owned and must outlive those reads. A captured source's `dispose()` is deliberately refused; release its owning capture after the native model terminal instead.

## Source-bound native session lifetime

`createDiffusionLoraModelSession({adapter,createModel,options?})` calls the actual per-side model constructor with the captured source. Optional constructor fields are `math`, `ops`, `mathWasmBytes`, `numThreads`, `signal`; file/side/decoder/source alternatives are refused. `predict`, `describe`, `stats`, `dispose`, `recover` form the wrapper API. It checks epoch before and after async preparation/prediction so cached head/weights are never silently reused for a new selection. Dispose cancels/joins prediction, awaits native disposal, and only then releases the source lease. Shared caller-supplied math/ops retain their native ownership rules.

One owner limitation is explicit: the fixed native constructor throws AggregateError without a retry handle when both preparation and its private cleanup fail. The wrapper preserves the source capability in `error.connectionResource` and refuses to certify native cleanup. `recover()` works when the error provides a real recovery capability; otherwise it reports `NATIVE_RECOVERY_UNAVAILABLE`. After the backing source actually reports disposed, `releaseAfterSourceDisposal()` can end connector-owned lease resources while still reporting `nativeCleanupUnconfirmed:true`. This does not recover unknown ORT/native resources or establish whole-operation success.

## Management and public sampler adoption boundary

The existing management adapter receives `registry/baseProvider/consumer/kernel/cache` directly. File registration, selections/strength/side and transaction operations remain there. Its copied snapshot receipt is distinct from native feed ownership and neural output. No old v2/Q16/P4 bridge is stacked onto this path.

For the full public sampler, Diffusion must keep raw original sources separately, construct the selected side's LoRA connection/SDK in the model-owning realm, apply via this consumer, and pass each capture's `source` to the existing `createBerniniModelCandidate`. It must dispose models before releasing captures, then release connection/SDK/kernel, then raw sources. Replacing its raw-source array with a capture and calling the old `.dispose()` loop is incorrect. Its strict public load payload/Worker dispatch, source build inventory and management route need corresponding explicit adoption; callbacks/handles cannot be structured-cloned as JSON. This is a concrete remaining implementation boundary, not a declared implemented export or a success inferred from port tests.

Experimental LoRA originals remain local until whole-connection implementation completion is notified. Verification inputs are generated small Files and fixed owner code; existing all-2,904 arithmetic evidence is reused. Full model/81frame sampling, VAE decode/save and whole-operation success are not accepted by this document. [Results and reproducibility](../../../../development/lora/model-connection/RESULT.md) record each scope separately.
