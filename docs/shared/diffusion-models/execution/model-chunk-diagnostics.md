# Whole-sequence model comparison transport

`createBerniniModelCandidate().diagnoseChunks()` is a development-only,
output-only observer over the same complete numerical graph as `predict()`.
It supports comparison and release in bounded chunks without the legacy
`diagnose()` trace's 128-total-token admission limit. It does not grant a
new supported production shape or complete a public API acceptance test.

```js
const result = await candidate.diagnoseChunks(savedInput, {
  maxRows: 128,
  stopAfterBlock: 0, // diagnostic only; the complete block, including FFN
  stages: [
    'patchHidden', 'postModulated', 'q', 'k', 'v',
    'selfResidual', 'crossK', 'crossV', 'crossQ',
    'crossResidual', 'ffnOutput', 'blockOutput'
  ],
  async onChunk(chunk) {
    // Compare/save the owned clone, then release caller references.
    // Returned values are ignored; this is not a prediction provider.
    await independentComparator.compare(chunk);
  }
});
```

The input remains the ordinary candidate input: canonical `shapeRequest`,
owned/snapshotted latent tensors, canonical Text conditioning, timestep,
optional native `signal` and `onProgress`. Normal prediction does not accept
`onChunk`, `stages`, gates, references, receipts or a block selector.
`predict()` still executes all 40 blocks and the final head by default.
Existing `diagnose(input, {onTrace})` retains its original total-token bound.

`stopAfterBlock` is optional, integer 0..39. It returns a
`diagnostic-block-result` after that block's self-attention, cross-attention,
FFN and `blockOutput` emission. The result has `diagnosticOnly:true`,
`headExecuted:false`, `targetExtractionPerformed:false`, `fullPrediction:false`
and `acceptedProduction:false`. It contains evidence and counts, not a latent
prediction. Without the selector, diagnosis runs through the head and target
unpatchify and returns the ordinary flow-velocity result.

## Chunk schema and ownership

Every event has `schemaVersion:'bernini-model-chunk/1'`,
`tensorKind:'internal-comparison-chunk'`, `name`, `block` (null for prefix/head),
`model:{side,modelSha256}`, `timestep`, `dtype:'float32'`, `layout`, `axes`,
`fullAxes`, `shape`, `fullShape`, `rowAxis`, `columns`, `globalRowStart`,
`rowCount`, `storageElementOffset` and `data`.

`data` is one compact, nonshared, owned F32 clone. It is never a view of an
internal hidden/K/V store. At most 128 rows and 1,769,472 F32 elements
(7,077,888 bytes, the 128x13824 FFN tile) are copied per callback. The element
limit also bounds wide output rows: an NCTHW span with unusually wide W uses
fewer than 128 rows. `maxRows` can reduce the bound, not increase it.
`storageElementOffset = globalRowStart * columns` in the full contiguous
tensor. Metadata and coordinate arrays are separately captured/copied.

Callbacks are awaited sequentially. The producer drops its clone reference
after callback completion. Retaining callback arrays is a caller decision;
the observer cannot bound an external comparator's storage. Callback failures
abort the graph. A native abort races a pending callback so an unresponsive
comparison server does not strand graph resources. That external callback may
finish later, but owns only its independent bounded clone. Cancellation does
not hand it a live internal array.

| Stages | Full shape / layout | Row meaning |
| --- | --- | --- |
| `patchHidden`, `blockInput`, `postModulated`, `oProjection`, `selfResidual`, `crossResidual`, `ffnPostModulated`, `ffnDown`, `ffnOutput`, `blockOutput` | `[1,N,5120]`, BLC | Global concatenated latent token |
| `kProjected`, `kNormalized`, `k`, `v`, `qProjected`, `qNormalized`, `q`, `selfAttention`, `crossQ`, `crossAttention` | `[1,N,40,128]`, BLHD | Token; all 40 heads retained |
| `crossK`, `crossV` | `[1,L,40,128]`, BLHD | Text row, including every supplied row |
| `textEmbedded` | `[1,L,5120]`, BLC | Text row |
| `timeRaw`, `timeAct1` | `[1,5120]`, BC, rowAxis 0 | One complete time vector |
| `timeProjection` | `[1,6,5120]`, BKC | Modulation chunk 0..5, each emitted as one row |
| `ffnUp`, `ffnActivated` | `[1,N,13824]`, BLC | Global latent token |
| `headAll` | `[1,N,64]`, BLC | Complete head patch row, before target selection |
| `prediction` | `[1,16,T,H,W]`, `NCTHW-contiguous-row-span` | Contiguous NCTH storage row of W values |

For token tensors `rowAxis:1`; chunk shapes replace N or L with `rowCount`.
`timeProjection.axes` is `['B','modulationChunk','C']`. Prediction deliberately
has `rowAxis:null`, chunk `shape:[rowCount,W]`, axes
`['linearNCTHRow','W']`, and full axes `['N','C','T','H','W']`. It does not
pretend a channel-major raw latent is a token-major matrix.

Latent-token events include copied `coordinates.positions` (F32, three values
per row) and `coordinates.sourceIds` (I32, one per row), with coordinate axes
T,H,W. These are the actual sequence owner's source IDs/RoPE coordinates,
including its target/source/reference order. Text/time events do not invent
latent coordinates. Identity hashes remain diagnostic identifiers, not normal
content compatibility gates.

`ffnDown` is the raw down-projection including bias; `ffnOutput` is the
subsequent chunk5-gated residual. `selfResidual` adds to the current block
input, not to the post-modulation hidden. `blockOutput` observes the completed
FFN residual state. K/V are emitted before any query/attention row is processed.
Full-sequence comparison of evolving state must keep the relevant stages;
the independent oracle currently requires `k`, `v`, `selfResidual`,
`crossResidual`, `ffnOutput` and `blockOutput`.

## Numerical reuse and new scheduling boundary

All scalar formulas, model-weight keys, FP8 decoder profile, F32 operator
graphs, bias/norm/RoPE order and final native attention division are reused.
K/V now share LN1/modulation per row: both immutable matrices are staged,
then K and V are projected in that row order. This removes a repeated
normalization pass. Two 5120-square weights occupy 209,715,200 bytes, the
same cache bound already required by Q/O. The FFN maximum remains unchanged.
This changes scheduling and therefore requires real-model chunk comparison;
old small-case success is not claimed as new full-shape numerical evidence.

When supplied operators support prepared weights, the candidate transfers its
private completed matrix into an opaque owner handle once, reuses its CPU ORT
Tensor, and releases the handle at the stage boundary. Borrowed operator
doubles without all three prepared methods retain the old linear path.

When all four persistent attention-query methods are present, the candidate
holds Q and the online-attention state in their CPU ORT tensors across the
same ordered key tiles. K/V are still copied per tile. The owner validates the
exact consumed key count; finish copies the final state and releases the
handle. An idempotent release in `finally` covers failures and cancellation.
Without these methods the original `attentionTile` state path remains.
No native WASM zero-copy or persistent native weight-residency claim follows
from either CPU ownership optimization.

Retained-weight release failure or a native operator cleanup-pending state
fences another candidate run. Call `recover()`/`dispose()` to retry cleanup;
borrowed operators remain their caller's responsibility. A candidate never
silently starts a second stage above a retained failed-cleanup cache.

## Timing and resource interpretation

Progress events and live `stats().timing` report the active operator, its
weight/row coordinates, elapsed time and inclusive totals. `stats().lastFailure`
records the first failing execution context; `timing.firstFailure` records
the innermost observed failing operator. Native cancellation reasons, including
falsy thrown values, count as failures. Chunk statistics include pending
stage/row, copied bytes, callback wait time and maximum emitted elements.

Timing categories include `stage.prefix`, `stage.selfAttention`,
`stage.crossAttention`, `stage.ffn`, `stage.head`, `weightReadDecode`,
`weightPrepare`, `weightRelease`, `linear`, `attention`, `attentionPrepare`,
`attentionFinish`, `attentionRelease`, `math`, `inputSnapshot`, `snapshotCopy`,
`hostCopy` and `layoutCopy`. Nested categories overlap and must not be summed
into an exclusive total. Candidate `weightReadDecode` includes the whole
source call; source statistics separately identify available I/O/decode data.
Callback wait time belongs to development observation, not pure native compute.
Run evidence precedes cleanup; final candidate statistics include cleanup.

Operator timing deltas separately report session.run, JS input snapshot,
output copy and cleanup time when supplied by the owner. `inputCopyBytes`
counts the owner's measured JS snapshots; `runtimeInputSpanBytes` counts
logical feed spans, including reused prepared weights. Neither measures native
ORT/WASM copies. These named copy counters do not pretend to account for all
JavaScript slices, GC retention, ORT allocators or worker memories. External
start-to-cleanup RSS/PSS and WASM/session accounting are still required.

Admission retains a conservative 90,000-token host-allocation planning cap,
four F32 hidden stores, and less than 2 GiB per hidden store. It is not a
numerical or aggregate resource acceptance. For the separately declared
73,947-token full-shape case, one store is 1,514,434,560 bytes and four stores
are 6,057,738,240 bytes, before weights, Text, diagnostic/reference storage,
operator temporaries, WASM heaps, pthread realms and copy/GC overlap.
Changing a cap alone cannot establish execution support.

## Targeted non-model checks

```sh
node --test --test-isolation=none \
  docs/shared/diffusion-models/execution/test-model-chunk-*.mjs \
  docs/shared/diffusion-models/execution/test-model-candidate.mjs \
  docs/shared/diffusion-models/execution/test-model-signal-cleanup.mjs
```

These tests verify protocol admission, exact shape/offset/coordinate copies,
bounded callbacks, replacement rejection, cancellation, failure localization
and cleanup fencing. They do not execute model inference or accept a new
shape. Numerical evidence and full start-to-cleanup resource receipts belong
to the production-case validation artifacts.
