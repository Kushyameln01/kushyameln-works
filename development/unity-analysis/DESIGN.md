# Unity analysis — implementation contract 1.1

User authorized execution of plan 1.0 on 2026-10-16. Plan: https://chatgpt.com/space/page_ec074cd1365081919b03381e94b21e40 . WORKFLOW_PLAN.md was read in full; original chat was available only as excerpts. User's latest test order takes precedence.

## Required outcome
Read-only Unity input -> missing-reference, parameter-type, shared-reference and before/after diagnostics -> evidence-bearing JSON that ChatGPT can recover. Shared browser SDK, real Hike/WASM analysis, existing bounded Worker pool. No auto-repair, input upload, new telemetry, arbitrary code/WASM or Unity Editor runtime claims.

## Current state
Sites source b5949a7a7f30fc51b2c86aa97771603a53aeccbb has compute-media-b2 and existing Worker hosting/D1. Pages main e0b8c9c4411af76e9051baa99a8c2640f7c74e2b has compute-pool-b2 and no media. Work is isolated from /workspace/sites/kushyameln-media. Do not overwrite its pending changes or publish its unpublished features to Pages.

## Smallest useful first gate
Before full parser expansion, provide a typed JSON snapshot containing nodes, references, parameter declarations/uses and source positions. Expected vectors are authored first. Hike computes incoming reference counts, compares allowed type bitmasks, and compares integer-interned property values. IDs/GUIDs remain host strings. Resolve references only against the complete per-snapshot index. Null, external-unprovided, unsupported, ambiguous and confirmed-invalid differ.

Hike ABI: wasm32 scalar, raw *int arrays + explicit int counts/capacities; no slice header. Host-owned, non-overlapping, aligned arena after initial memory. Grow before creating views. No allocator or free import. Hike validates counts and node indices before dereferencing; adapter validates ranges, overflow, capacity, memory identity and independent output. Arena is cleared in finally and Instance references released. Initial limits are explicit prototype bounds, to be revised only with representative observations, not claimed universal Unity limits.

## Shared compute
Keep one pool scheduler and one common worker protocol. Separate task adapters (validation, input/output accounting, kernel preparation/identity, execution). JS-only parse has null instance/kernel metrics and reason. Hike graph/type/diff use verified Unity Module with per-job Instance/Memory. Task registration is deployment-specific: existing FT+media+Unity on Sites, FT+Unity on Pages. Common scheduler/worker source and Unity files must have equal hashes across both projections. Bundles include different registered task sets and therefore have separate hashes; the Pages bundle/import closure must exclude media. Existing media implementation is preserved in its task adapter and never included in the Pages projection. Keep old FT request contract.

## Analysis scope
Initial text adapters: Unity YAML (.controller/.anim/.prefab/.unity/.asset/.mat/.overrideController), .meta, directory, ZIP, unitypackage and versioned JSON. Inventory every file including opaque content. Unknown syntax/components retain evidence and mark coverage incomplete. Signed 64-bit fileID is a string. Duplicated IDs/GUIDs are conflicts, never last-wins. Before/after indices stay separate. Unity rules plus explicit VRChat mapping; don't infer SDK identity from display names. Plain value differences, semantic type constraints, permitted conversions and unknown semantics are separate findings.

## State and output
Session/job/inputRevision/snapshot IDs, input hashes, build and rules/schema versions. Shared SDK accepts caller-owned pool, cancels only owned jobs and releases own terminal results. Old revisions never replace new UI state. Input/expanded/IR/graph/report/Blob owners and limits are independent. Summary is not substituted for full export. status, coverage, diagnostic severity, totalCount/returnedCount/truncated are independent.

## Validation and publication order
1. Requirements, input and expected outputs; static critique against workflow first.
2. Sites provisional source and static build/checks.
3. Save Sites, update GitHub Pages with exact allowlisted additions/changes, verify deployment commit and file hashes.
4. Acquire that exact Pages version in cloud; only now execute product tests (including Node/WASM). Minimum JSON roundtrip and raw pointer write/readback precede large implementation.
5. Expand features with requirement-derived vectors; repeat steps 2–4. Compare one/two/four workers, mixed FT jobs, cancellation/failure/recovery, full JSON roundtrip, second caller and small/medium/large timing. No speedup claim without total-time evidence.

Design changes update this file. Append decisions/failures/audits to WORKLOG.md; evidence/status to VALIDATION.md. Block dependent work if deployment identity or mandatory execution route cannot be established; preserve logs and actual state. No test result is inferred from a build.
