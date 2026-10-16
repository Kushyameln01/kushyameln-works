# Unity analysis work log

## 2026-10-16 — execution authorized
- User: 計画を実行して. Approved plan 1.0 retained; no scope reduction.
- Read current Sites, original saved workflow, plan and required skills. Isolated checkout at source b5949a7a7f30fc51b2c86aa97771603a53aeccbb. Pages baseline e0b8c9c4411af76e9051baa99a8c2640f7c74e2b.
- Independent audit: PROCEED for resumption, read-only environment inspection and design preparation.
- Static Hike investigation: existing pointer+count ABI, JS arena and fixed compiler/toolchain available. Existing media runtime records are prior evidence, not Unity tests.
- Found Sites/Pages task-set divergence. Proposed environment-specific task registration while retaining identical common scheduler/worker/Unity code. No media publication authorization inferred.
- Product code execution: none. Next: independent minimum ABI/design critique, expected vectors, implementation/build, Sites save and Pages update before dynamic tests.

- Audit PROCEED: environment-specific registration is necessary. ADVISE accepted: compare common source/Unity hashes, not differently bundled artifacts. Browser automation inventory confirms cloud Chrome available; Pages clone UI route will be checked after deployment. No product execution yet.

- Static review found reserved property keys/classId missing from diff, plus quadratic shared-source/parameter lookup. Added expected regression case before correcting diff domains and indexed lookups. No product test executed.
- Second static review: rejected forged source identity fields, restricted source to numeric positions, fixed default coverage provenance, and added computed canonical snapshot SHA-256 independent from caller-supplied file hash. Regression expectations authored first.
- Final minimum review corrections: catch malformed result validation/freezing/size failures before terminal pool mutation; reject as INVALID_RESPONSE with a settled Promise. Added a malformed-response expectation before the fix. Sample-fetch responses now check revision and cannot overwrite newer edits or actions. No execution tests yet.
- Minimum static re-review: no blocking defects. Corrected empty-input provenance label. Static Pages export first invocation used repository root instead of docs and failed directory validation; no files were published or executed by that failed invocation.
- Sites source push failed non-fast-forward after successful static build. No deployment or dynamic run. Opened latest remote 0a90e4dd9c9c8b10492e1759e808468b9862bc95 in a new checkout; integrated Unity changes while preserving all newly published media/paper work. No force push. Cause-informed retry 1; rebuild/archive regenerated.
- Reconciliation reviewed: original 65-line task contract preserved verbatim in Sites registration, including paper async/transfer and existing FT/LBP/alignment behavior. Preserved MAX_MEDIA_INPUT_BYTES re-export. Pages registration still FT-only plus Unity; common sources identical. Static bundle/projection checks passed.
- Concurrent scoped edits introduced a duplicate constant export. Pages bundle compilation correctly failed; the framework build did not parse this static module and source e370798 was pushed, but no Sites version was saved or deployed. Removed the duplicate and added an explicit syntax-only gate for all changed modules. Discarded that archive for publication; rebuilt all projections.
- Sites v55 saved and deployed successfully: source 691e367203867bfc8f7dea6b643bea8da74657df. GitHub commit b39ec02e1161b581859e96593357c352921fcb0a deployed successfully via workflow 38920075812. Verified 59 public blobs and 18 shared/Unity source matches across Sites/Pages before execution.
- Deployed cloud copy: kernel ABI tests 6/6 PASS; minimum SDK cases concurrency 1/2/4, module reuse false/true, module/bundle modes PASS. Existing FT mixture, cancellation isolation/recovery, complete JSON, source provenance, reserved property/classId diff, invalid response settlement PASS. Node v24.19.0, browser UI still NOT VERIFIED.
- Browser route failure: CUA terminal.local:4173 reported ERR_CONNECTION_REFUSED; Python HTTP process remained active, but separate command socket/curl to 127.0.0.1:4173 also refused. No preview security setting changed or browser installed. Alternate cloud browser access to the exact deployed Pages URL under procedure audit before use.

### 1.2 preimplementation review corrections
Audit A1/A2: preserve initial NOT VERIFIED entries as dated history, record minimum browser PASS separately, and label 4.4 ms as Worker compute intervals including JS (WASM-only time not isolated). Technical review: fix delivery-only archive result ownership/transfer and no cross-caller eviction; independent preallocation budgets for diff vectors and Controller owner expansion; JSON Pointer/source offsets, duplicate-key conservative coverage, and Animator/Expression domains documented. No product execution in this revision.

### 1.2 static implementation audit
Found before runtime: delivery-only pool results remain frozen; file SDK originally attempted metadata association on frozen files and buffer release on frozen expansion items. Changed to SDK-owned shallow containers, preserving immutable parsed fields and owned transferred buffers. Corrected combined before/after task budget to8 MiB (each snapshot4 MiB); machine diff paths now JSON Pointers, and expected tests updated before execution.

Preserved complete single-snapshot evidence, not only diagnostics: report.objects retains unknown properties and source positions; report.files retains metadata and unsupported raw documents. Added a requirement expectation before static implementation. Audit corrections also retain container kinds in a separate diff domain and reject forged parser issue/provenance fields.

### Source refresh for full-input revision
Opened current Sites source 70303a7ba15b114b5eef0657cc721430e5aba580 (v56) with the official helper into isolated kushyameln-unity-b2. All task changes copied only after no overlap with newer source changes was verified; concurrent media/server updates and hosting configuration preserved. Dependencies installed by official helper. No product runtime executed.

Technical integration review: clone optional parameterLinks at session start to prevent caller mutation; expose parameter checks/conversions/declarations in UI filter. Added immutable-context expectation. First projection rejected conditional sample URL; literal URLs corrected and revalidated.

Technical final review: check cancellation immediately after progress notification before child analysis; completion notification is terminal. No further blocking integration defects reported.
