# Unity analysis validation

Current state (2026-10-16): minimum structured-JSON roundtrip PASS, including cloud browser download/readback. Revision 1.2 raw-file expansion is NOT RUN.

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

## Minimum browser follow-up — 2026-10-16, current PASS
Cloud Chrome loaded the public HTTPS Pages version b39ec02 after deployment verification. Sample input, analysis, JSON display and download completed. Download: 19,411 bytes, SHA256 `516e13f255adb8b81943a2a378f0d252db1c75ef1d3036425b7f07ac20072ef9`. Before/after/diff/input/completeness matched the Node result. Evidence: `evidence/minimum/browser-full.json`, `browser-receipt.json`, `browser.jpg`. The failed local HTTP route remains a separate limitation. Browser response hashes and full Chrome version are unverified.

Revision 1.2 has only design and hand-authored expectations. No raw-file/parser/archive product runtime tests have run.

## Revision 1.2 static gate — before deployment
Syntax check36 modules PASS. Sites projection136 files PASS; Pages projection66 files PASS. Common shared sources match; Sites and Pages registration/bundles intentionally differ. Product runtime NOT RUN. Static projection rejected one conditional URL expression in sample loading; changed it to two literal asset URLs and rechecked successfully. Independent issue/ownership/container-kind audit PROCEED; final technical integration review pending.

Final prepublication technical review completed. Caller-owned context mutation and progress-callback cancellation boundaries corrected; additional expectations authored. Syntax gate37 modules. No raw product execution yet.
