# Owned online-attention query transaction

This is a resource-ownership extension of the existing batched F32 online
attention graph. It does not change the graph, scale, score dtype, tile sizes,
softmax recurrence, context arithmetic, or accepted production-model scope.
The existing `attentionTile` entry remains available.

The batched ops owner exposes these methods:

```js
const query = ops.beginAttentionQuery({
  q, heads: 40, queries, headDim: 128, expectedKeys, signal,
});
try {
  for (const {k, v, keys} of exactKeyTiles) {
    await ops.attentionQueryTile({queryHandle: query, k, v, keys, signal});
  }
  const {max, denominator, context} = ops.finishAttentionQuery(query, {signal});
  // context remains the unnormalized online numerator. The existing math
  // owner performs denominator division after all logical keys are consumed.
} finally {
  ops.releaseAttentionQuery(query);
}
```

`queries` is 1..128 and each `keys` is 1..256. `expectedKeys` is the exact
positive safe integer count of logical keys for this query. A tile that exceeds
the remaining count is rejected before K/V capture. A premature finish leaves
the transaction live. No padding, phantom key, or capacity increase is added.

`begin` makes one finite owned Q snapshot and constructs native CPU tensors for
Q, maximum, denominator and unnormalized numerator. Each tile captures only K
and V. Native result tensors become the next private state after the canonical
finite/shape checks and the strictly positive denominator check. Step results
contain key-count progress, never state arrays. Finish copies the three final
state arrays for the caller and releases the private transaction. The handle is
frozen metadata and is accepted only by its creating owner. Releasing an
already released handle from that owner returns `false`.

Cancellation after a native run and before state commit disposes new outputs
and K/V, retaining the previous state for retry. ORT kernel preemption is not
claimed. Incomplete transactions may be released. A native disposal failure
retains every failed native owner, attempts all other releases, blocks further
numerical work, and requires owner recovery. Recovery also disposes sessions.
The batched ops owner supplies its existing global busy and lifecycle gates.

The helper `createOwnedAttentionQueries` receives the canonical `capture`,
`validateOutput`, `copyOutput` and `run` callbacks from batched ops. Output
validation returns the native data view without copying; copying is confined
to `finish`. Its `disposeAll()` is synchronous, attempts all native tensor
releases, and is safe to await. Failed releases remain discoverable for a
subsequent recovery attempt.

Counters distinguish Q snapshots, K/V snapshots, final outgoing copies and
owned native CPU tensor spans. Tensor spans are logical byte extents: shared
backing aliases and native ORT/WASM copies are not measured. There is no
zero-copy, aggregate WASM-memory, or original-shape execution claim.

Validation sources:

- `test-owned-attention-query-owner.mjs`: Node admission and ownership doubles;
  cancellation, partial preparation, invalid native result, release failure
  and recovery. These are resource tests, not numerical evidence.
- `test-owned-attention-query.mjs`: browser-native H40/Q3/D128, 7 and all 263
  logical keys with tail7, rising maxima, unchanged `attentionTile` bit parity,
  and an independent test-only F64 full-row reference with fixed gate
  `abs <= 0.001 + 0.0001 * abs(reference)`. It also checks native cancellation,
  copy accounting, handle/bound guards and injected native-release recovery.

The browser test does not load model weights. A passing bounded test covers
only this changed resource boundary. Full model, full target/context shape,
all-block prediction and six-update sampling remain separate acceptances.
