# Unity analysis validation

Current state (2026-10-16): revision 1.2 / product v0.2.0 (`compute-unity-b2`) complete for the documented supported subset. Raw-file, ZIP, unitypackage and structured-JSON validation PASS after Pages deployment; actual public-browser ZIP input, complete JSON download/readback, cancellation, stale-result reset and recovery observed. Detailed current results follow the dated history below.

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

## Full-input execution — current result, 2026-10-16

Publication identity: Sites v57, source `39abed6b11fa9f9e070832dff6c3926c5e3a641b`; Pages `6dc93eafd86caf2bc1418c79bad5fe76e8bf25c3`, workflow `38925723680` succeeded at `2026-10-16T15:39:59Z`. All 66 public files were identified by Git blob SHA and SHA-256 before product runtime. `evidence/full-input/acquisition.json` records this verified deployed copy; public HTTPS browser observations are separate evidence. Static syntax/build gates preceded publication. The later test-fixture correction and final records do not change product bytes.

| Requirement | Current result | Evidence |
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

Independent source review and procedure audit found no product blocker. Their final hold concerned stale completion records only; the current section and browser receipt resolve that documentation issue. No additional product change or optional test cycle was introduced.
