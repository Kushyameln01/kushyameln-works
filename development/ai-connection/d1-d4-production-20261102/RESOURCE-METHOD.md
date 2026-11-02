# Resource accounting method for the declared full-geometry case

This document fixes accounting scopes and exact shape-derived quantities. It
does not supply a new execution measurement or a successful model result.
Actual run receipts, including failures and cleanup, are recorded separately.
The current frozen execution source is
`7cf77c21889d9642e61d9a41d3242a816e24d6be`. No inference was run to prepare this
document.

## Exact case and token population

The [declared input contract](input-contract/README.md) is a separate saved
full-geometry case, not a reconstruction of unknown original media. Its shared
`workflow-shapes.mjs` result is:

| Ordered stream | Latent NCTHW | Patch grid THW | Tokens | source_id |
| --- | --- | --- | ---: | ---: |
| Target | `[1,16,21,60,104]` | `[21,30,52]` | 32,760 | 0 |
| Source | `[1,16,21,60,104]` | `[21,30,52]` | 32,760 | 1 |
| Reference slot0 | `[1,16,1,106,106]` | `[1,53,53]` | 2,809 | 2 |
| Reference slot1 | `[1,16,1,106,106]` | `[1,53,53]` | 2,809 | 3 |
| Reference slot2 | `[1,16,1,106,106]` | `[1,53,53]` | 2,809 | 4 |

`N = 32,760 + 32,760 + 3 × 2,809 = 73,947`. Reference video is explicitly
absent in this case. Every supplied token is a query and a key; all40 heads have
dimension128. Token order, coordinates and source IDs remain attached to their
original stream. Input arrays are deterministic saved F32 values with
`producerVerified=false`, not VAE/media outputs. Real retained Text has512 rows,
with the original512-entry mask retained as metadata. Neither the case nor the
`Hello world` packet is the original prompt/media replay.

At max128 query rows, the full sequence has577 complete groups plus a final
91-row group:578 groups. At max256 key rows it has288 complete groups plus a
219-row tail:289 tiles. Thus one full self-attention has167,042 query-group/key-
tile invocations when using these exact tile extents. These are arithmetic
counts, not completed execution counts or measured time.

## Native host stores and stage cache

Hidden width is5120 and each F32 value occupies4 bytes. One sequence-width
store therefore occupies exactly:

`73,947 × 5,120 × 4 = 1,514,434,560 bytes`.

The native self-attention stage retains block input, full K, full V and a
separate residual output. Its four named stores total
**6,057,738,240 bytes**. These are host ArrayBuffer spans, outside the bounded
WASM operator memories. No full-sequence Q or N×N score matrix is retained.
The individual store is below the existing2GiB per-store planning guard; that
fact does not establish the combined resource budget.

| Native stage | Named sequence stores | Decoded F32 matrix cache |
| --- | --- | --- |
| Prefix patch output | One hidden store | Current stage matrix only |
| Self-attention | Input + K + V + residual output | K/V phase or Q/O phase: two5120² matrices,209,715,200 bytes |
| Cross-attention | One hidden store | Q/O pair; Text K/V are separate512-row stores |
| FFN | One hidden store | All up slices plus down: **566,231,040 bytes** |
| Final head | One hidden store until completion | Head-local weight tiles and target output |

The FFN cache is `2 × 13,824 × 5,120 × 4`. Its largest single matrix is
283,115,520 bytes. Up-weight slices retain the original full inner reduction;
they do not split the13824-wide down reduction into a new numerical operation.
The four-store maximum and maximum FFN cache occur in different stages. Adding
all unrelated stage maxima is a conservative envelope, not a measured
simultaneous live set. Conversely, the four stores or cache alone are not an
exhaustive native memory total.

Cross-attention K and V each require `512 × 5,120 × 4 = 10,485,760 bytes`.
The target output `[1,16,21,60,104]` has2,096,640 values,8,386,560 bytes.
Saved inputs, protected snapshots, Text projections, biases/modulation,
row-layout copies, returned buffers, pending garbage, browser infrastructure
and file-backed pages must be accounted for separately. The model's cache
counter and the ops owner's prepared-weight counter describe the same retained
weight backing; they must not be counted twice as independent allocations.

## Bounded Hike, ORT, staging and copies

Normal model operators run at most128 rows,40 heads and128 dimensions per head;
attention key tiles are at most256 rows. Named F32 spans at these limits are:

| Span | Bytes |
| --- | ---: |
| Q or attention context `[40,128,128]` | 2,621,440 |
| One K or V tile `[40,256,128]` | 5,242,880 |
| Score-shaped tile `[40,128,256]` | 5,242,880 |
| Maximum or denominator `[40,128]`, each | 20,480 |
| FFN expanded128-row tile `[128,13824]` | 7,077,888 |

These are tensor-span formulas, not a claim about ORT's temporary allocation
plan. The graph can hold several scores/probabilities, old/new states and
inputs at once. The owned-query path snapshots Q once and retains CPU ORT Q and
online-state tensors across ordered key tiles. K/V inputs remain owned
snapshots. Old and new state can coexist while a native run completes; final
state copies and division/layout outputs add bounded spans. ORT can still
upload retained CPU tensors on every run. Reusing `ort.Tensor` is not proof of
native WASM zero-copy.

The weight source selects at most81,920 decoded elements/163,840 stored bytes
per block. Its explicit raw read-ahead cache is at most1,048,576 bytes, confined
to one original tensor and separate from selected/decode limits. Hike decoder
and model-math kernels use reusable bounded arenas; model math's maximum
linear span is128×13824, with81920-element pointwise chunks. This is separate
from the public1048576-element pointwise guard and the dedicated64/128-element
posterior-mean profiles. None of those limits is raised to claim full-graph
support. The actual Memory capacities, allocator overhead and retained arenas
come from the run's observations, not these host formulas.

The owner reuses two ORT sessions. Explicit threads4 requires COOP/COEP,
cross-origin isolation, SharedArrayBuffer and a verified fresh ORT realm; it
does not allocate four full model copies by contract. Pthread stacks/runtime
resources and possible shared Memory aliases require observation. Separate
Memory-object identities or per-identity high-water values must not be summed
as an exact physical concurrent peak.

`sourceF32Bytes`, read bytes and copy counters are cumulative traffic.
`inputCopyBytes` counts owned JS snapshots; `runtimeInputSpanBytes` counts every
logical feed span, including retained weights/Q/state submitted again. Neither
measures all ORT internal uploads. Hike snapshot, host→WASM, WASM→host, layout,
diagnostic and HTTP/IPC copies have different scopes. They may overlap or refer
to successive copies of the same values and are not additive peak allocations.

## Independent oracle is an additional process budget

The [pre-execution reference contract](reference/full-declared-preexecution.json)
allows three full memmap backing stores: independent X, K and V. Their exact
backing-file maximum is **4,543,303,680 bytes**. The reference weight cache has
a separate **600,000,000-byte** cap. These numbers are not native model memory
and must not be hidden inside the native four-store/cache budget.

Reference K/V are removed before cross-attention/FFN; X is updated from
independently computed residuals. There is no full reference Q or score store.
F64 attention score and probability tiles each use10,485,760 bytes at
40×128×256; F64 Gemm conversion/output tiles and reference work arrays are
additional. Memmap file size is not resident memory: touched mappings and page
cache affect RSS/PSS/cgroup observations differently. Native and oracle phases
are serialized at comparison callbacks but their stores/processes can coexist.

The Worker emits one owned comparison chunk, at most7,077,888 bytes under the
8MiB transport guard. HTTP and binary IPC may retain additional copies of that
one chunk. The oracle returns scalar error counts/hashes, never replacement
native tensors. Its independent X/K/V cannot be initialized from native
comparison operands. Normal execution does not require this oracle, the
reference gate or detailed receipts.

The full-case gate is fixed before execution at
`abs(error) <= 0.01 + 0.001 × abs(reference)` for all emitted values and complete
declared row coverage. It is distinct from the tighter bounded primitive gates
in the performance receipts. Gate/coverage failures remain failures; memory
capacity or operator timing cannot override them.

## Timing and observation coverage

Candidate stage timers are inclusive wall clocks. Prefix/self/cross/FFN/head
timers include nested operators, layout work and any awaited diagnostic
callback. They must not be summed with their nested operator totals into an
exclusive execution time. Operator `weightReadDecode`, `linear`, `attention`,
`math`, snapshot/layout/host copy and preparation/release timers identify the
current work; source IO/decode timers and ops session-run timers are narrower
but still overlap their caller. Native `session.run` time includes vendor
binding/copies and kernel work, not pure Gemm/attention arithmetic alone.

Chunk `copyMs` and `callbackMs`, and Worker `comparisonMs`, separate comparison
overhead. Callback wall time includes transport, scheduling and the independent
oracle wait. A stage waiting at a comparison callback must not be reported as
native operator compute time. A watchdog is an operational bound, not an
accuracy/performance gate. First failure/current operator/shape, completed rows,
callback coverage and cancellation/disposal state must survive a failed run.

The diagnostic Memory observer is installed in the DedicatedWorker **before**
candidate/ORT/Hike imports or construction. It attributes allowed compiled
module hashes and weakly observes Memory capacities through cleanup, then
restores hooks. Module-byte hashing/copies, periodic samples and callbacks add
diagnostic overhead. Capacities are not allocator live bytes; inaccessible
imports, other realms/pthreads, brief allocations between samples and internal
ORT staging remain explicit coverage limits. Weak reachability or session
disposal does not demonstrate immediate OS reclamation. `performance.memory`
omits most typed-array backing storage and cannot replace OS measurements.

The tracked generic wrapper is
`tools/diffusion-models/observe-process-run.py`, introduced at
`3e68d2fc54c67b16f8a82002f69fa183674a9f14`, separately from the frozen numerical
execution source. It takes a shared-cgroup baseline before child launch, then
samples the child tree with an exec gate still closed before releasing the
runner command. An example invocation is:

```sh
python tools/diffusion-models/observe-process-run.py \
  --output /tmp/new-resource-receipt.json --interval .5 -- COMMAND ARGUMENTS
```

It continues through command exit plus the configured post-cleanup interval
(default1 second), retaining known surviving descendants during that interval.
The intended tree includes the runner, oracle child, Playwright/browser
processes and descendants. Process identities include PID/start ticks; role
labels are heuristics, and a DedicatedWorker/ORT allocator cannot be separated
from its Chromium renderer at this level. PSS-readable counts/completeness and
sample timestamps remain in the receipt. Sampling includes its own elapsed
work; the requested interval is not a guarantee about the largest sample gap.

The wrapper keeps the initial gated sample plus a bounded ring, at most10000
observations. Peak counters cover every sample, including samples later evicted
from the ring; omitted-middle counts are explicit. They are sampled maxima, not
continuous physical peaks. An observer attached only after a prefix retains
that narrower scope and cannot claim a full-lifecycle peak. No measurement from
a codec-only smoke test is promoted to original-shape NN resource evidence.

RSS sums double-count shared resident mappings. PSS apportions those mappings,
including resident mapped file pages; it does not include all unmapped kernel
file cache. Partial PSS readability is partial coverage, not zero usage.
Sampling can miss short-lived processes/peaks. Shared cgroup `memory.current`
includes other workloads, file cache/tmpfs/shmem and kernel charges; its
historical `memory.peak` is not this run's owned peak. When `memory.stat` is
available, retain anonymous/file/shmem/kernel categories separately and note
that shmem/mapped-file fields can be subsets, not extra additive memory. Do not
attribute `cgroup − PSS` entirely to this run's cache or add cgroup current to
process totals. Record cache/filesystem effects separately from native live
spans and reference memmap backing sizes.

## Evidence reuse and acceptance boundary

The earlier N65520 capacity trial held5,367,398,400 bytes of nonzero capacity
stores plus the566,231,040-byte FFN cache and exercised a maximum Gemm tile.
Those stores were not production hidden states. Earlier Q128/K65520 attention
covered selected controlled queries, not all73947 real-model queries/keys. Both
remain valid within their recorded scopes and are not new native execution
evidence for this declared case. N5/L3 full-model/sampler results likewise stay
within that small input and Text scope.

[Performance receipts](performance/README.md) cover28 owner/cache Node tests and
8 fresh-browser groups: raw-read parity, prepared weights, persistent attention
on threads1/4, exact tails, ownership/cancel/recovery and refusal cases. The
controlled independent thread comparison covered927,744 values per mode with
bit-identical outputs; its observed Gemm/attention improvements are bounded
operator results, not original-model/full-sequence speedups. Native physical
copies, combined peaks and production precision are not inferred from them.

New actual receipts must state the exact side/block/timestep, all-query/key/head
coverage, frozen source/input identities, independent comparisons, timing and
process/Memory scopes. A complete block0 diagnostic still does not establish
all40 blocks, final head/unpatchify, a complete public predict, HIGH3→LOW3 six
updates, generated-sample restoration/save/readback, original-media replay or
generation READY. Their resource conditions and acceptance remain separate.
