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

### First full-input runtime — Pages 6dc93ea
Parser expectation suite PASS. Core13/14 PASS, one harness fixture error: builtin GUID accidentally had33 characters and correctly failed GUID validation. Corrected expected input to32 characters; product bytes unchanged. Initial red TAP retained; only affected case rerun against the same verified deployed version.

### Full-input completion — 2026-10-16
- Sites v57/source39abed6 and Pages6dc93ea published. Pages workflow38925723680 succeeded before runtime; all66 public blobs verified.
- Parser PASS; initial core13/14 with erroneous33-character fixture GUID, corrected affected case1/1 PASS against unchanged product.
- Minimum and raw SDK matrices each six conditions PASS: workers1/2/4 × module reuse off/on, module/bundle execution, full JSON, direct/ZIP/unitypackage equivalence, FT coexistence, ownership/cancellation/timeout/bad-archive recovery.
- Performance45 synthetic Node runs completed; parallel parse intervals overlap. Largest fixture87,744 bytes/1,024 objects. Worker intervals include JavaScript; no WASM-only or universal speed claim.
- Public HTTPS browser actual before/after ZIP input and141,485-byte JSON readback PASS. Hash/content/input evidence matches Node. Browser version/individual response hashes remain unavailable.
- Primary operator observed cancellation on a bounded longer fixture, Worker-setting stale-result reset, and recovery using actual ZIPs. Initial small-input cancel attempt completed too quickly and is not counted as a cancel pass. Full observations in browser-receipt.json.
- Browser filechooser timeout recovered with one bounded retry; full-page screenshot timeout recovered through ordinary viewport capture. No browser security setting or product byte changed.
- Source reviewer and procedure auditor independently checked deployment/file/output evidence. Their remaining HOLD was stale NOT RUN completion text; updated VALIDATION and browser receipt, preserving historical red/blocked observations. No optional product test cycle added.
- Final records/evidence saved alongside source. Test-graph fixture correction and records are the only post-validation changes; publication must preserve the tested product bytes.
- Final documentation re-audit: PROCEED; record HOLD released after reading VALIDATION, RESULT and browser receipt. No further product edit or test requested.
- Final-record source push rejected normally because remote advanced to7b212c55. Opened a fresh checkout; newer90 media documentation/tool files have zero overlap with the30 Unity record/fixture files. Preserved all newer changes and integrated only Unity records; no force push or product modification.
- GitHub final-record commit b6a8b0231da02ae09ac7f111db4dc33d7c3b0a9a saved30 evidence/document/fixture changes. All158 resulting repository blobs verified before guarded ref update; all66 public product blobs are identical to tested6dc93ea. Follow-up Pages workflow38951930675 is being observed; no new runtime test is necessary for unchanged public bytes.
- Final-record Pages workflow38951930675 succeeded2026-10-16T19:03:15Z. Official Sites rebuild passed136 public files/8 frameworkJS/192 artifact files; shared and Unity public bytes match prior product projection.

## 2026-10-17 — improvement request, revision1.3
- User requests GUID identity repair, lazy full JSON, same-condition stage measurements, then evidence-based batching/Module/memory decisions. No SIMD/FS/JSPI/external logging or universal Editor gate.
- Read exact plan Page, saved full workflow, Tips1.2 (current Library version2)08/09, current DESIGN/VALIDATION/RESULT and source. Independent ZIP not located after bounded Library searches; supplied review/403 claims remain attributed, not newly verified.
- Fresh official source97b07ce, Pagesfe707873. New media publication preserved; do not restore obsolete FT-only registry.
- Independent audit PROCEED for candidate implementation/publication after static gate. Accepted advisory: numerical15%/10% adoption thresholds marked implementation proposals; historical FT-only section labeled.
- Technical reviewer confirmed GUID file-key mismatch and UI JSON duplication. Reviewer suggested eager prettyJSON, but that conflicts with user's lazy formatting requirement; retain compact-size-once and lazy pretty cache instead. No user condition was changed.
- Expected regressions authored before product edits; two bounded Workers handle GUID/UI and measurement harness, root handles instrumentation/integration/publication. Auditor read-only. No product runtime at this checkpoint.

- Static review found duplicate final report serialization introduced by instrumentation; removed it before publication. Retained one 8 MiB limit check, with exact timing exclusions and caller elapsed for adoption. Constructor and finish interval definitions corrected.
- Syntax gate41 modules PASS; Pages106 base public blobs matched, nine intended public changes (including one new cache module), isolated107-file export PASS. Sites static build137 assets/8 generated JS/193 artifact files PASS. No product execution yet.
- Existing paper registry is already in current Pages base. Updated build-only URL allowlist and retired obsolete no-media Pages guard; no task or media product behavior changed. First bundle attempt failed at that stale allowlist and produced no bundle; corrected bounded registry entry and rebuilt successfully.

- Sitesv59/source4f5857c publication succeeded; Pages1a3bd7c workflow38956680734 succeeded19:41:20Z. Verified107 public Git blobs before Codex cloud execution. No claim of individual CDN response-byte capture.
- Regression8/8 PASS, stage114samples PASS. Baseline fresh same-condition data supports bounded parse jobs; Module defaultfalse retained. Auditor independently read evidence and PROCEED, limiting Module inference to analyze(), not compare().
- Memory63/64/65MiB PASS. At64 observed process RSS225.2MiB; main-isolate heap counters and missed transient peak limits retained. Adopt minimal ZIP single-output-buffer candidate; whole-input streaming deferred with rationale.
- TinyFish bounded run4f2e440d completed (30steps). New build and lazy counters observed; filter increment/download bytes not established. Complementary public Chrome DOM observations verified123-row pagination/filter/snapshot cache counts, save-before-display exact full347439byte equality and clear reset. No communication audit claim.
- RTK executable is unavailable on current PATH; used bounded shell output and persisted full logs. No installer or product mechanism added for output compression.

- Stage2 product fixed:8files/256KiB parse groups, parseBatchSize1–8(default8), no resident workers; ZIP single-output-buffer with all checks. Static gate43modules/27-module bundle/exact8public changes/107-file Pages export PASS. Independent reviewer found no blocker. Direct-file timing fixtures isolate batching;1MiB memory entries remain single jobs and isolate ZIP buffer change. Job compute intervals now cover a whole group. New functional expectations9batch+7ZIP cases are not yet executed.
