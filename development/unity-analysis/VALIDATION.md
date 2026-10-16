# Unity analysis validation

Current state (2026-10-17 JST / 2026-10-16 UTC): revision 1.3 / product **v0.3.1 (`compute-unity-b4`)**. The deployed candidate passed 24/24 regression cases, the six raw-SDK conditions, 114 stage samples with baseline semantic comparison, and the recorded public-browser checks. Bounded parse batching met the prespecified adoption thresholds. Module reuse remains false by default. RSS benefit is not established. Older v0.2.0 results, including its 45-run performance matrix, are historical and are preserved below.

## Revision 1.3 — current publication and execution gate

Sites v60 / source `4efa8dc07eda382d5b4ca711a9c79f2f36779bf6`. Pages `aa4b92cd9e8f6189ee3ab8e59a86e231513d5486`; workflow `38958327066` was recorded completed/success at `2026-10-16T19:54:45Z`. All 107 public blobs in the cloud copy were identified against that successful deployment commit by Git blob identity and SHA-256 before product execution. This is **not** a capture of every individual CDN/HTTPS response body. Public HTTPS browser operations and downloaded report hashes are separate evidence.

Order followed: write expectations and critique the procedure/design -> static source review, syntax/build/projection checks -> save Sites -> publish Pages and identify its successful commit/files -> execute that identified cloud copy and operate the public browser. A static build was not counted as a product test. No product change was made to resolve the later measurement-harness version comparison failure.

Evidence packaging: Sites/source retains the raw files. GitHub's [evidence guide](evidence/improvements/README.md), [lossless evidence ZIP](evidence/improvements/evidence.zip), [manifest](evidence/improvements/manifest.json) and [performance summary](evidence/improvements/performance-summary.json) provide the records. Large stage/memory/full-report JSON names below refer to entries inside the ZIP; selected small records are also published separately. Existing `evidence/full-input/` and `evidence/minimum/` remain historical evidence.

### Implemented changes and functional evidence

| Change or requirement | Current result | Record in `evidence/improvements/` or its ZIP |
|---|---|---|
| Case-insensitive GUID identity across files/objects/scopes/links; retain raw values and ambiguity | PASS | `regression-b4.tap` |
| Compact UTF-8 size once on acceptance; pretty JSON only on first display/save; filter/page operations reuse the report; reset releases cache | PASS in regression and public browser | `regression-b4.tap`, `browser-b3.json`, `browser-b4.json` |
| Parse jobs bounded to 8 whole files and 256 KiB; larger files stay single; wave <= concurrency and 16 MiB | PASS; ordered identity/full inventory and invalid request/response checks | `regression-b4.tap` |
| ZIP single output buffer; independent output ownership, CRC/actual length, path/collision, count and capacity limits | PASS | `regression-b4.tap` |
| Complete raw file / ZIP / unitypackage equivalence; immutable caller context; second caller; retained FT result; cancel/failure/retry | PASS at 1/2/4 Workers × module reuse off/on (six conditions) | `files-b4.json`, `raw-full-*.json` |
| All three stage fixtures and functional semantics equal baseline | PASS after explicit version-only comparison normalization | `stages-baseline.json`, `stages-candidate.json` |
| Near expanded limit: 63/64 MiB complete, 65 MiB explicit limit error | PASS in baseline and candidate | `memory-baseline.json`, `memory-candidate.json` |

The current regression total is **24/24**: eight GUID/cache cases, nine batching cases and seven ZIP ownership cases. Per-job Worker creation/termination, cancellation and caller isolation remain intact. No resident Worker or whole-input expansion-to-parse streaming was introduced. Snapshot IR (4 MiB), report (8 MiB), expanded input (64 MiB) and pool admission (16 MiB) are separate logical limits, not a process-memory ceiling.

### Stage performance — Node single-snapshot analyze(), not browser timing

Baseline: Pages `1a3bd7ce3791cdd18a0eda7fd569b46e5cdd2b05` / `compute-unity-b3`, analyzer 0.3.0. Candidate: Pages `aa4b92c…` / `compute-unity-b4`, analyzer 0.3.1. Both use Node v24.19.0 and the same synthetic fixtures. Each record contains 114 samples: 90 fresh-pool samples (three inputs × 1/2/4 Workers × reuse off/on × five runs) and 24 same-pool samples (small/manySmall, two Workers, reuse off/on, one initial call plus five repeated calls). Fresh and same-pool groups remain separate.

The adoption metric is caller `outerWallMs`, including fresh pool/analyzer construction and final report validation/freezing. It is not `report.metrics.totalMs`, which ends before final validation/freezing. The following medians use **fresh pools, moduleReuse=false, five runs per condition**, baseline -> candidate in milliseconds:

| Synthetic input | 1 Worker | 2 Workers | 4 Workers |
|---|---:|---:|---:|
| small: 6 files, 2,287 bytes, 8 objects | 505.206 -> 149.164 | 299.083 -> 148.970 | 226.113 -> 168.504 |
| manySmall: 64 files, 13,612 bytes, 128 objects | 4358.029 -> 645.491 | 2399.136 -> 393.724 | 1432.329 -> 240.438 |
| large: 8 files, 89,720 bytes, 1,024 objects | 742.713 -> 254.271 | 441.275 -> 268.006 | 343.455 -> 267.460 |

manySmall improved by 85.188% / 83.589% / 83.213% at 1/2/4 Workers. The prespecified batching criteria (at least 15% manySmall median improvement at 1 and 4 Workers, no more than 10% small median regression, semantic equality and cancel/isolation correctness) passed. These numerical thresholds, including the Module criterion below, were implementation-side proposals fixed before measurement, not user-specified requirements. `parseBatchSize` therefore defaults to 8, with 1 available for single-file jobs. This is a result for these synthetic inputs; it does not establish universal speedup or compare() performance.

Candidate fresh-pool two-Worker reuse off/on medians were small 148.970/172.477 ms and manySmall 393.724/386.598 ms. They do not meet the prespecified 10% improvement on both inputs. **Module reuse stays false by default.** Independent per-job startup sums can exceed wall time because jobs overlap; startup includes import/message scheduling rather than OS-only startup. Compute includes JavaScript, and WASM-only time was not isolated.

The first candidate attempt completed the measurement loop but failed its final cross-version semantic-hash assertion before emitting the samples. Those samples were not recovered; `stages-candidate-initial.stderr` preserves the failure. The product was unchanged. The harness comparison was corrected to normalize only `before.analyzerVersion` and `after.analyzerVersion` to the explicitly supplied baseline version; an absent after remains null. Actual versions and raw semantic hashes remain recorded. No ruleSetVersion, functional value, path or input hash was excluded or normalized. A necessary rerun produced **114/114 PASS**, `comparison.status=PASS`, and matching fixture/comparison-semantic hashes for all three inputs. The first failed attempt is not counted as a successful record.

### Public-browser observations

- **b3 / v0.3.0:** public UI showed 123 findings. Page 51–100, filter and before/after changes increased render count while compact serialization stayed at 1 and pretty serialization at 0. First save created pretty JSON once; subsequent display reused it. The displayed complete text exactly matched the 347,439-byte download, SHA-256 `9d00643c88ff1e3f984da4fb896c12ed2800a806a7b0a089360df7e5e06720af`. Clear reset counts and report ownership. TinyFish separately observed loading/lazy counts but did not establish filter-count increments or downloaded-byte equality; the primary browser record supplies those observations.
- **b4 / v0.3.1:** version/build and settings showed parseBatchSize 8, concurrency 2, moduleReuse false. Public UI completed five jobs including two parse jobs, displaying 8 objects, 3 findings, **2 changes**, 4 shared-reference groups and 1 cycle. The UI's two changes combine file and object changes; the record distinguishes `changedObjects: 1` from `displayedChanges: 2` (the original receipt's `changes: 1` meant only `diff.changes.length`; `diff.fileChanges.length` is also 1). Compact serialization was 1 and pretty 0 on acceptance; display/save produced pretty once. Displayed complete text exactly matched the 129,440-byte download, SHA-256 `45d29de3765e0afe3611918f14710cf8cc26fe85f1967ab842845d965c3e8f7d`. Cancellation showed CANCELLED, and input revision change cleared report/cache/export with no late result returning.

The b3 and b4 UI status values (1225 ms and 556 ms) are individual observations on different inputs and are **not** a browser speed comparison. Render counters/times exclude browser paint. Full browser version and individual response-byte capture are unavailable. Immediately after b4 publication, the first load did not show diagnostic UI; one ordinary reload recovered without an application error being logged. Its cause remains unconfirmed.

### Memory ownership and observation limits

Each 63/64/65 MiB opaque ZIP case ran in a fresh Node process, with fixture creation outside sampling, concurrency 2, moduleReuse false, interval and phase samples, no forced GC. Input compressed hashes matched across versions. At/below 64 MiB, complete opaque inventory/hash preservation passed; at 65 MiB, the explicit expanded-limit error passed. Sampled RSS maxima were:

| Expanded input | Baseline RSS max | Candidate RSS max | Functional outcome |
|---|---:|---:|---|
| 63 MiB | 219.2 MiB | 217.0 MiB | Complete inventory PASS |
| 64 MiB | 225.2 MiB | 224.7 MiB | Complete inventory PASS |
| 65 MiB | — | — | Explicit limit error PASS in both |

Nominal sampling interval was 10 ms; observed maximum gaps were up to 13.6 ms. RSS includes Node worker threads; heap/external/ArrayBuffer counters describe the calling main isolate and omit Worker JS heaps. Short peaks can be missed. Logical retained-byte counters are not allocator measurements. Removing retained ZIP chunk arrays is a source-level ownership change; these observations **do not establish significant RSS improvement, reduced total copied bytes, absence of leaks, browser memory usage, or a 64 MiB process-memory bound**. Full streaming was deferred because it would broaden metadata/index/cancellation ownership changes beyond the measured local issue.

## Final integration after concurrent upstream publication

The final record update encountered a concurrent main change to `9086c48197b6e2391e39265585c15aed4d33c062`. The first guarded mutation returned a GraphQL error; readback established the new head, and no forced update was used. Upstream media-basic publication and preprocessing retirement are preserved. Their paths do not overlap the Unity records/harness changes. Unity analysis sources, UI and WASM remain identical to aa4, but shared registered-tasks and the bundle differ.

After workflow `38960099272` completed successfully at `2026-10-16T20:09:12Z`, the complete Unity runtime dependency subtree (38 Git blobs: compute, FT, unity-analysis and UI) was identified. This is separate from the earlier 107-file full-site identification. The targeted 24 regressions and six raw-SDK conditions, including module/bundle execution and FT/cancel/isolation/recovery, passed on this latest published code. No performance claim is transferred to the changed registry: timings above remain measurements of aa4. The [supplemental ZIP](evidence/improvements/final-integration.zip) contains every integration result and full JSON; the [manifest](evidence/improvements/manifest.json) includes its hashes. The original 72-entry evidence ZIP remains fixed.

The final documentation update preserves all 81 public blobs from upstream 9086. Sites source is reconciled on latest v62 / `bed6d051665e9c8ff32bedc9230fcddbf7cd9aab`, preserving the newer media/server work and applying only nonoverlapping Unity records and the comparison-harness correction.

## Historical validation records

All sections below concern earlier checkpoints. Their test counts, timing values and completion statements apply only to the named older version.

## Initial design baseline — historical, before minimum deployment
State at that time: design preparation; no Unity product test had run.

| Requirement | Status | Evidence still needed |
|---|---|---|
| Four diagnostics and source evidence | NOT VERIFIED | independent fixture expectations and returned complete JSON |
| Hike pointer/array ABI | NOT VERIFIED | static signatures then Pages-after write/process/readback |
| Existing shared pool interoperability | NOT VERIFIED | FT regression/mixed tasks/1,2,4 worker equality |
| Browser input/export/cancel/recovery | NOT VERIFIED | latest Pages cloud browser operations |
| Shared SDK second caller | NOT VERIFIED | independent harness |
| Performance | NOT VERIFIED | cold/warm total and compute timing on representative sizes |
| Source/publication identity | NOT VERIFIED | Sites commit, Pages commit, deployment and file manifest |

Static design review is distinct from execution validation. Full original procedure chat remains unavailable; saved full workflow + latest explicit instruction + approved plan are the implementation basis.

## Minimum execution after deployment — 2026-10-16
Source: Sites v55 / 691e367203867bfc8f7dea6b643bea8da74657df. Pages: b39ec02e1161b581859e96593357c352921fcb0a, deployment workflow 38920075812 succeeded. All 59 public files matched commit blobs before Node execution.
- PASS: Hike array ABI six independent suites, invalid input and recovery, memory grow/view freshness, independent Instances, no aliasing, corrupt hash and abort.
- PASS: SDK concurrency 1/2/4 × module reuse off/on; module and bundle execution; expected four diagnostic outputs; complete JSON; fileID signed64 string; provenance; property-domain regression.
- PASS: existing FT work alongside Unity; cancellation and recovery; malformed response resolves failure.
- Initially NOT VERIFIED: actual browser UI and browser download readback (superseded by the following browser evidence). User-purpose performance and full YAML/meta/archive ingestion remain NOT VERIFIED.
- BLOCKED route (first observation): cloud browser to local verified-copy HTTP endpoint receives connection refused; recorded separately from successful Node evidence.

## Minimum browser follow-up — 2026-10-16, historical PASS
Cloud Chrome loaded the public HTTPS Pages version b39ec02 after deployment verification. Sample input, analysis, JSON display and download completed. Download: 19,411 bytes, SHA256 `516e13f255adb8b81943a2a378f0d252db1c75ef1d3036425b7f07ac20072ef9`. Before/after/diff/input/completeness matched the Node result. Evidence: `evidence/minimum/browser-full.json`, `browser-receipt.json`, `browser.jpg`. The failed local HTTP route remains a separate limitation. Browser response hashes and full Chrome version are unverified.

At this earlier checkpoint revision 1.2 had only design and hand-authored expectations; raw-file/parser/archive runtime tests had not yet run. Superseded by the full-input execution below.

## Revision 1.2 static gate — before deployment
Syntax check36 modules PASS. Sites projection136 files PASS; Pages projection66 files PASS. Common shared sources match; Sites and Pages registration/bundles intentionally differ. Product runtime NOT RUN. Static projection rejected one conditional URL expression in sample loading; changed it to two literal asset URLs and rechecked successfully. Independent issue/ownership/container-kind audit PROCEED; final technical integration review pending.

Final prepublication technical review completed. Caller-owned context mutation and progress-callback cancellation boundaries corrected; additional expectations authored. Syntax gate37 modules. No raw product execution yet.

## Full-input execution — historical v0.2.0 result, 2026-10-16

Publication identity: Sites v57, source `39abed6b11fa9f9e070832dff6c3926c5e3a641b`; Pages `6dc93eafd86caf2bc1418c79bad5fe76e8bf25c3`, workflow `38925723680` succeeded at `2026-10-16T15:39:59Z`. All 66 public files were identified by Git blob SHA and SHA-256 before product runtime. `evidence/full-input/acquisition.json` records this verified deployed copy; public HTTPS browser observations are separate evidence. Static syntax/build gates preceded publication. The later test-fixture correction and final records do not change product bytes.

| Requirement | Result at v0.2.0 | Evidence |
|---|---|---|
| YAML subset, .meta identity, source positions and opaque preservation | PASS for declared expectations | `text.json` |
| Hike ABI, archive and graph expectations | Initial 13/14; corrected fixture case 1/1 PASS | `core.tap`, `graph-guid-correction.tap` |
| Shared pool, structured SDK, module/bundle, 1/2/4 workers × module reuse off/on | All six conditions PASS | `minimum.json`, `minimum-full-*.json` |
| Direct files / ZIP / unitypackage semantic equivalence, raw hashes and full evidence | All six conditions PASS | `files.json`, `raw-full-*.json` |
| Second caller isolation, retained FT result, cancel/timeout/bad-ZIP recovery, immutable context | PASS in recorded raw SDK cases | `files.json` |
| Public HTTPS input and full JSON readback | PASS, actual before/after ZIP selections | `browser-full.json`, `browser-receipt.json`, `browser.jpg` |
| Browser cancellation, result invalidation after Worker change, recovery | Observed PASS by primary operator | `browser-receipt.json` |
| Synthetic performance and parallel intervals | 45 runs; overlapping parse intervals observed | `performance.json` |

The initial core failure was a 33-character builtin GUID in a test fixture. The product correctly rejected it. Only the fixture was corrected to 32 characters, and the affected case was rerun against the same deployed product. The initial red result is retained; this is not an initial 14/14 pass.

Browser output: 141,485 bytes, SHA-256 `778d1c444939b97754262ee275ab15de4bb52b79b2f423dc3f3fc388b2657fa3`. before/after/diff/inputs/completeness and expanded-file hashes match Node results; selected ZIP hashes match actual bytes. Observed result: 8 objects, 3 findings, 2 changes, 4 shared-reference groups, 1 cycle. Missing-local is distinguished from an external asset not supplied. Parameter evidence identifies Float versus Bool/Trigger constraints. Initial browser analysis total was 2716.1 ms; recovery run completed 17 jobs in approximately 1050 ms.

Performance is Node v24.19.0 on synthetic inputs, five runs per size/worker count including first-run cost. Total-time medians (ms):

| Synthetic size | 1 worker | 2 workers | 4 workers |
|---|---:|---:|---:|
| Small | 515.7 | 264.5 | 211.0 |
| Medium | 1179.0 | 656.7 | 397.8 |
| Large (87,744 bytes, 1,024 objects) | 2273.9 | 1287.9 | 813.4 |

Worker compute intervals include JavaScript; WASM-only time was not isolated. These measurements establish this synthetic workload's behavior, not a general speed or large-project guarantee.

### Scope and remaining limits

- Parser supports a strict Unity text/YAML subset. Unsupported syntax and binary/AssetBundle data are retained or reported as opaque/unverified, not interpreted as valid or missing by guesswork.
- AnimatorState active Speed/CycleOffset/Mirror/Time parameter type constraints remain unverified; unknown ownership/StateMachine transition semantics remain explicit. Animator/Expression linkage requires explicit context; no name-only linking.
- Unity Editor/runtime behavior, all Unity/SDK versions, maximum-limit real projects and arbitrary YAML are not validated by these tests.
- Full Chrome version and individual browser HTTP response hashes were unavailable. Browser observations and downloaded hashes supplement, but do not replace, the exact deployed-copy file manifest.
- Initial local HTTP browser route was refused. A file-chooser tool call timed out; a bounded retry recovered. Full-page screenshot timed out; ordinary viewport capture succeeded without browser-security changes.
- Original procedure chat was accessible only through excerpts; the saved full workflow, latest user instructions and approved plan remain the declared compliance basis.

At that v0.2.0 checkpoint, independent source review and procedure audit found no product blocker. Their final hold concerned stale completion records only; the then-current section and browser receipt resolved that documentation issue. No additional product change or optional test cycle was introduced at that checkpoint.
