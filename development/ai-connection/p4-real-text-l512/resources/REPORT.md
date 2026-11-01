# Actual L512 P4 resource and lifecycle audit

Read-only inspection at commit `27776abb234fc12733c600b1dabd2fdab70e27ae` for N2 block0, HIGH schedule1 and LOW schedule3, real all512 conditioning rows. No WASM/model run, no model payload read/hash/download, no repository edit. `audit.json` records exact reviewed source hashes and a current environment snapshot. `static-estimates.json` is arithmetic from the unchanged loops; no peak-memory, speed or numerical acceptance is inferred.

## Preflight quantities per side

| Quantity | L4 historical path | L512 unchanged path |
|---|---:|---:|
| Matrix weight read tiles | 5,024 | 5,024 |
| Projection ORT calls | 5,024 | 44,704 |
| Attention-score ORT calls | 40 | 320 |
| Selected matrix raw bytes | 524,288,000 | 524,288,000 |
| Selected matrix decoded F32 bytes, before feed copies | 1,488,977,920 | 1,488,977,920 |
| Stage x batch copy traffic | 322,437,120 | 12,973,506,560 |
| Linear weight snapshot traffic | 1,488,977,920 | 13,841,203,200 |
| All linear input snapshot traffic including scores | 1,811,538,240 | 26,825,525,760 |
| Returned25 F32 array bytes | 1,286,144 | 63,709,184 |
| One conditioning data+mask copy | 65,540 | 8,389,120 |
| Bridge full-arena zero-fill writes | 8,205,605,120 | 327,894,800,640 |

The four L-dependent projections (text0, text2, K, V) each retain320 output-weight tiles and change1→32 token batches per tile. Therefore each executes10,240 ORT calls. Weights are read/decoded once per output-weight tile; the final-F32 linear snapshot is copied again for each of the32 batches. The other projections keep their original counts. No inner reduction is split. For all512 rows, all40 attention heads each consume8 logical64-key tiles, exactly320 score calls, with no mask multiplication or dropped padding rows added by this audit.

The hidden write category comes from `ort-bridge/hike.mjs`: each `invoke` clears491,648 bytes, including each per-token bias operation. L512 has666,930 bridge invocations:5,024 matrix decodes +18 vector decodes +661,888 per-row AddBias. Measure actual completed-call delta times fixed arena bytes; report this as zero-fill traffic separately from copies and retained bytes. The existing public metrics filter drops lowercase `calls`, so introduce an explicit diagnostic `bridgeCallCount` field before filtering.

Other precisely derivable omitted traffic at L512: addBias host compact x42,237,952 bytes; compact bias2,799,616 bytes; Hike-per-row output assembly42,237,952 bytes; original F16-to-Uint16 host assembly304,288,768 bytes. Hike input/output copies have existing counters. Conditioning seals, run snapshots, caller data, feed captures, metadata binaries, reference data and export copies are separate allocations: do not sum overlapping aliases as if they were distinct.

## Capacity and retained bytes

Shapes already admit L512: native conditioning `[1,L,4096]`, norm rows1..512, linear token batch1..16, ordinary output rows16, FFN-down output rows4 with intact13824 inner reduction,81920 decoded elements. Max raw tile163,840 bytes, decoded tile327,680 bytes, and L512 x batch327,680 bytes. The maximum input batch is3x the L4 maximum110,592 bytes, but tile bounds and mathematical reductions stay unchanged.

Six returned text/KV arrays each occupy10,485,760 bytes: textLinear0, textGelu, textEmbedded, qkvK, qkvV and normK; together60MiB. Fixed returned arrays add794,624 bytes, giving63,709,184 bytes. The existing known-retained accounting formula, without metadata, gives80,630,784 bytes (76.90MiB): stage-owned input8,450,560 + protected conditioning8,389,120 + outputs63,709,184 + parameter vectors81,920. This is a named-category count, not the full simultaneous live set or a peak: caller/native admission, capture WeakMap seals, feed validation clones, reference, parser strings, hashes, exports, allocator/GC and File backing are outside it.

Fixed source/math/attention Hike capacities sum4,325,376 bytes. Prior L4 P4-alone construction observed21,102,592 distinct WASM capacity bytes, of which16,777,216 was ORT. These are historical observations; L512 must measure its own capacity. Two P4 ORT sessions share one ORT WASM Memory in the prior observation. Session count is not Memory count or allocator usage. An idle old-tail owner would add its own session and Hike workspace and materially changes scope. The new runner's announced P4-alone scope must stay explicit.

Environment snapshot: cgroup max16GiB, current around2–3GiB while other agents work. `/tmp` has about8.6GiB free; `/workspace` only about158MiB. Keep numeric/private artifacts in `/tmp`; do not cache/decode entire matrices or duplicate original models. Exact timestamped values are in `audit.json`. Existing Chromium, Playwright, psutil and numpy are available; Python onnxruntime is absent. No browser was launched for this review.

## Minimal actual measurement design

1. Admit native private input bytes and all binding hashes before any model/native constructor. Freeze the runner + admission/plan + source inventory first. Maintain unchanged stage, kernels, graph shape, tiling, precision profile, sign-zero identities and numerical gates.
2. Install the existing non-owning WASM observer before operator import/construction. Capture admission, before construction, constructed, cancellation settled, numerical progress, numerical complete, disposed, retained-output check and binary export stages. Preserve stage/source/linear/math/attention before/after counters and bounded current progress. Record start/end plus samples, not the sum of per-owner capacity maxima. Observer memory capacities/high-water are sampled physical linear capacities, not allocator live bytes.
3. Expose explicit P4 session creations/active counts, pending tensors, busy/closing flags, source busy state, feed readLeases/inFlight/transactions/packages/candidates/patch bytes. Compare final lease count to its own pre-run baseline, then require zero after feed cleanup. Before/after failed cancellation counters are separate from the successful numerical run counters.
4. A Python psutil monitor thread can sample the launched browser descendant process tree while synchronous Playwright RPC waits. Track `(pid, create_time)` to avoid PID reuse. Sample aggregate RSS at100–250ms, and optionally PSS once per second with `memory_full_info()`. Store each timestamped sum and maximum of concurrent sums. Summed RSS includes shared pages; PSS is proportional and process-tree attribution can omit children that exit between discoveries. Record sampling interval, count, first/last time, process IDs, phase coverage and sampling errors. Continue through export, browser close and descendant termination.
5. Sample cgroup memory.current and memory.events alongside the tree. cgroup memory.peak is historical to the whole session unless explicitly reset, and unrelated agents share this cgroup. Report start/end historical peak and measured max(memory.current) separately. Never rename either as this run's owned or exact peak. VmHWM likewise covers process lifetime, not a reset run scope.
6. Use an asynchronous browser run promise with a bounded status poll or an independent watchdog; no native session.run can be forcibly interrupted by AbortSignal. Cancellation takes effect after the pending native operation returns. A soft abort should allow cleanup to settle; emergency browser/process termination is a distinct outcome, never numerical completion. Avoid retaining per-tile JS arrays or all monitor snapshots. Record failure receipt with last progress and monitor maxima even if the browser dies.
7. Private bounded binary/base64 export avoids all25 arrays becoming millions of boxed JS/Python JSON numbers. Keep exact raw F32 bytes and sign-zero bits; hash per-array bytes and the containing artifact. Account raw buffer copies, base64 expansion/decoding, export wall time, retained output bytes and Python staging separately. Bound base64 string conversion internals too (a262144-byte spread into String.fromCharCode may exceed argument limits); the raw chunk cap alone is insufficient.

## Lifecycle review

- `linear.run` snapshots x/weight synchronously before its first await, owns ORT tensors in a Set, and disposes tensors in `finally`, including AbortSignal after a pending ORT run returns. `dispose` waits active work and releases both sessions. Failed releases retain handles for recovery; absence of disposed sessions cannot be assumed from a thrown cleanup.
- `stage.run` snapshots residual/time/captured conditioning, captures a source read lease, checks its epoch/package on subsequent awaits, releases that lease in `finally`, and clears busy/active state. Stage disposal requests closing, waits the active operation, then disposes its operators. Caller-owned source defaults to preserved and must be separately disposed in the outer runner.
- Source reads check abort before/after Blob arrayBuffer; a cancelled outstanding file read may already have done physical work before its completed-read counters increment. Those counters mean completed logical reads, not guaranteed physical I/O bytes. Original source disposal throws while busy: correct outer cleanup order is stage settled/disposed → leases/transactions settled → feed disposed → raw source disposed.
- Existing focused browser cases check cancellation after pending native work, tensor release, session release and source-lease release. Existing combined harness checks cancellation/reentry, intact Hike workspace, retained outputs after disposal and disposal during a first real tile. No fresh execution was performed here.
- At L512 the onProgress cancellation point after the first weight tile occurs after32 row-batch ORT calls, rather than one at L4. This is expected from unchanged ordering; capture both actual source tile and linear call count. Do not claim instantaneous/native preemption.
- Original `run.mjs` constructs an idle old tail and5 retained outputs, never calls its run; its combined3-session resource scope must not be conflated with P4-alone2-session measurements. Existing `feed.mjs` captures `finalStats` before releasing `oldLease`, so its public final feedOwnership shows readLeases1 even though later cleanup releases it. New receipts must sample after release for a cleanup assertion.

## Interpretation and unresolved evidence

A historical HIGH L4 receipt measured about63.99s numerical stage total (read43.82s, projection linear5.86s, bias0.189s), with1.81GB cumulative linear snapshots. These values cannot predict or accept L512. L512 introduces far more finite-admission scans, snapshots, ORT calls and zero-fill writes. Existing600s browser timeout is not proof of sufficient time. Actual kernel results can differ when ORT batches change4→16 rows, so every frozen independent gate and all25 array comparisons remain required. Static support, budget arithmetic, successful cleanup or low RSS does not substitute for numerical acceptance, and acceptance remains limited to the frozen N2 block0 sides/schedules/conditioning inputs.
