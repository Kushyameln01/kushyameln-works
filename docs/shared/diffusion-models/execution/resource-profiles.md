# CPU weight, attention-query and thread resources

These options change resource ownership and repeated host work. They do not
change the F32 graphs, original model conversion profiles, timestep order,
normalization, accepted full-model shape or generation readiness. Normal
execution does not require independent references or numerical receipts.

## Prepared linear weights

`createBatchedModelOps()` exposes a synchronous owner-local handle:

```js
const handle = ops.prepareLinearWeight({
  weight, columns, inner, ownership: 'take', signal
});
try {
  const {output} = await ops.linearPrepared({x, weightHandle: handle, rows, signal});
} finally {
  ops.releaseLinearWeight(handle);
}
```

`weight` must be a native compact nonshared finite F32 matrix of exact
`[columns, inner]` shape. `copy` is the default and preserves caller storage.
`take` transfers and detaches a private exact backing buffer only after the
normal structural/finite checks. The model stage uses `take` for a newly decoded
private matrix, not for externally retained caller bytes. No model weight key,
full shape, storage/compute dtype or FP8 conversion rule changes.

The opaque handle retains the validated F32 backing bytes and a CPU
`ort.Tensor` across query tiles. Forged, foreign and released handles fail.
The stage releases a handle before forgetting its reference or byte accounting.
A native release failure retains the owner and requires `recover()`/disposal;
release attempts all owned resources. Cancellation cannot interrupt a native
ORT call; it prevents return/commit after the call and cleans temporary owners.

## Owned online-attention query

The optional resource path keeps one Q tile and the graph's online maximum,
denominator and unnormalized numerator as CPU tensors across K/V tiles:

```js
const queryHandle = ops.beginAttentionQuery({
  q, heads: 40, queries, headDim: 128, expectedKeys: totalKeys, signal
});
try {
  for (const {k, v, keys} of keyTiles) {
    await ops.attentionQueryTile({queryHandle, k, v, keys, signal});
  }
  const state = ops.finishAttentionQuery(queryHandle, {signal});
  // state.context / state.denominator is the attention result.
} finally {
  ops.releaseAttentionQuery(queryHandle); // false after successful finish
}
```

Q is snapshotted once. Each K/V tile is snapshotted before the native await.
The graph, H40/D128 layout, Q tile limit128, K tile limit256, key order and
online-softmax recurrence are identical to `attentionTile`. No padding or token
omission is introduced. `expectedKeys` must be completely consumed before
finish; an overflowing tile fails before its payload copy. Finish returns owned
F32 copies and releases the query. A cancelled uncommitted tile retains the old
state for retry; a failed native cleanup keeps reachable owners for recovery.
The stage owner still controls the total count of concurrent prepared weights
and queries; these per-handle limits are not an aggregate memory admission test.

## Explicit ORT thread profiles

`createBatchedModelOps({numThreads: 1})` is the default. The explicit alternative
is `numThreads: 4`, profile `ort-wasm-f32-threads4-coi-v1`. It requires a fresh
realm/Worker with COOP `same-origin`, COEP `require-corp`,
`crossOriginIsolated === true`, `SharedArrayBuffer` and Worker support. The
factory verifies three actual pinned ORT pthread Worker creations before
accepting the first 4-thread session. It refuses an already initialized
incompatible runtime instead of relabelling it as a 4-thread runtime.

The ORT backend/pthread pool lives for the realm. Disposing an ops owner does not
allow a thread-profile switch; recreate the dedicated Worker/realm. Invalid
thread counts, missing isolation, concurrent initialization and an unverified
initialization fail with `UNSUPPORTED_RESOURCE_CONFIG`. Same-profile owners may
reuse the established backend. GitHub Pages remains on default1 unless its
serving environment explicitly provides the required isolation headers.

The F32 Gemm/attention compute profile remains
`f32-ort-gemm-batched-online-softmax-context-matmul-v1`. A controlled independent
F64 comparison accepted 927,744 values per thread mode at the predeclared gate
`abs(error) <= 0.001 + 0.0001 * abs(reference)`; all four result hashes matched
bit for bit between1 and4. Gemm `[128,2048] @ [2048,2048]^T` median was43.955ms
versus17.215ms; H40/Q128/K256/D128 attention was38.740ms versus17.555ms. Those
seven-repeat bounded measurements are not real-QKV, full-sequence, model or
generation acceptance, nor a promised overall speedup.

## Measurements and their limits

`inputCopyBytes` counts owned JavaScript F32 snapshots, not vendor upload.
`runtimeInputSpanBytes` counts every submitted feed span, including a retained
weight/Q/state on each native run. A reused CPU `ort.Tensor` does not establish
zero-copy WASM binding. Physical ORT/WASM copies remain unmeasured.

Prepared-weight/query stats report retained CPU spans and high water marks.
Backing aliases can make span sums differ from physical storage. The maximum
prepared tile remains bounded by the existing `[5120,13824]` matrix limit;
the actual stage/resource configuration must bound the aggregate retained pool.
Thread experiment main-realm WASM observations exclude pthread realms and are
not RSS/PSS measurements.

Timers separately report snapshot validation/copy, weight preparation, native
session runs, outgoing copies, tensor cleanup and owner disposal. A native
session-run timer includes vendor copies/bindings and kernel execution; it is
not pure Gemm/attention CPU time. Source read-window statistics are documented
in [model-read-window.md](model-read-window.md).

Targeted reproducible checks (Playwright, Chromium and NumPy required):

```sh
node --test --test-isolation=none \
  docs/shared/diffusion-models/execution/test-model-read-window.mjs \
  docs/shared/diffusion-models/execution/test-model-weights.mjs \
  docs/shared/diffusion-models/execution/test-owned-attention-query-owner.mjs
PYTHONDONTWRITEBYTECODE=1 python \
  docs/shared/diffusion-models/execution/test-prepared-batched-browser.py \
  --output /tmp/prepared-batched-browser.json
PYTHONDONTWRITEBYTECODE=1 python \
  docs/shared/diffusion-models/execution/test-thread-profile.py \
  --output /tmp/thread-profile.json
```

The runners capture served code bytes, SHA-256, fixture identities and the gate
before native evaluation. They assert captured source bytes stayed unchanged.
No private model payload or Text input is needed for these bounded changed-boundary
tests. Actual model/original-shape acceptance is reported separately.
