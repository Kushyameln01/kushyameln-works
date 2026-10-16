# Unity data analysis — shared browser SDK

Read-only local analysis of serialized Unity data. Four outputs: unresolved/missing references, parameter constraints, incoming shared references, and before/after differences. Hike/WASM performs the incoming-count, type-mask and diff-vector operations in the existing bounded compute pool. JavaScript parses and indexes the input. Neither mode runs Unity or uploads input.

## Browser
Open `../../unity-analyzer/`. Select files or a folder, including `.meta` files, or a ZIP / unitypackage. Optional second selection enables comparison. The sample includes synthetic Controller, shared BlendTree/Clip, missing references and one renamed state. Display filters/pagination never remove data from the JSON download. Compact byte size is computed once per accepted report; full pretty JSON is generated only on the first display/save and reused. Local UI diagnostics contain counters and elapsed intervals, without external collection.

## Shared use
```js
import {createUnityFileAnalyzer} from './file-sdk.mjs';
const analyzer = createUnityFileAnalyzer({pool: existingPool, concurrency: 2});
const pending = analyzer.compare(beforeFiles, afterFiles, {inputRevision: 3});
const report = await pending;
// cancel only this caller's jobs: analyzer.cancel(pending.sessionId)
analyzer.dispose(); // caller-owned pool stays alive
```
Inputs are browser File objects or `{path,bytes:Uint8Array}`. `analyze(files)` handles a single selection. `sdk.mjs` accepts `unity-analysis-snapshot/1` JSON with `files:[{path,guid?,objects:[{fileId,classId,properties,references?,parameters?,parameterUses?}]}]`; compare accepts two snapshots. fileID must be a signed64 decimal **string**. See `example.json`.

File ingestion uses actual byte SHA256 hashes in `report.ingestion`; JSON snapshot inputs are hashed as canonical JSON and their supplied content hashes remain unverified claims. Reports include build/parser/rules/kernel identity, job receipts, coverage and full counts. No report is truncated to fit a budget. Delivery-only parse/expansion results bypass pool retention, so `getResult` is unavailable for those stages; consume their Promise result. Other pool tasks retain the existing behavior.

## Interpretation
- `missing-local` / `missing-target-object`: confirmed absent only inside a provided, completely parsed target. `external-unprovided`, `unparsed-target`, `builtin-unverified`, `ambiguous` are unverified, not proof of a broken project. fileID 0 is null.
- Shared references list every incoming source. They do not imply a defect. Cycles are strongly connected components; they do not enumerate every elementary cycle or imply a runtime error.
- Animator rules follow Controller ownership through resolved serialized containment/motion references, including external shared BlendTrees. Unknown ownership or use semantics remains unknown. Same-name declarations alone never establish ownership.
- VRChat Expression parameters require recognized script GUID/fileID. Explicit `parameterLinks:[{expression:{assetId,fileId},controller:{assetId,fileId}}]` on a snapshot provides association. File SDK takes `options.parameterLinks.before/after`. Int/Float/Bool mismatches may be permitted conversions, recorded separately; no AvatarDescriptor attachment is inferred. Conversion basis: https://creators.vrchat.com/avatars/animator-parameters/#mismatched-parameter-type-conversion .
- Diff identities normalize valid GUID case consistently for files, objects and explicit scopes; original properties, paths and hashes remain unchanged. Identities use GUID/fileID; absent GUID uses a labeled provisional path/fileID. Files can be added/removed/renamed/changed; ambiguous identities are listed separately. Object values use JSON Pointer paths. Unknown components remain structurally visible without runtime semantics.

## Input coverage and limits
Text extensions: `.controller`, `.anim`, `.prefab`, `.unity`, `.asset`, `.mat`, `.overrideController`, `.meta`. The bounded YAML subset covers Unity document headers, maps, sequences, flow maps/sequences and quoted/plain scalar strings. Unsupported tags, aliases, directives, block scalars and malformed/duplicate mappings are reported as incomplete coverage. Binary/unknown assets are inventoried with hashes; no AssetBundle/binary Unity object decoding is claimed. Duplicate fileIDs/GUIDs remain conflicts. Source offsets use UTF-16 code units, zero-based/end-exclusive; line/column are one-based.

Prototype limits per snapshot: raw selection32 MiB; one file/archive16 MiB; expanded64 MiB; 2048 input/expanded files; text4 MiB; normalized snapshot4 MiB; complete report8 MiB; 65536 objects; 262144 references/diff pairs/owner contexts; graph traversal2000000 steps. Before/after normalized task combined budget8 MiB. Exceeding a limit produces a named failure. Peak temporary/string memory is additional to these logical limits. ZIP64, encrypted/special-entry ZIP, links and malformed packages are rejected. Existing FT's package limit is unchanged.

`computeMs` is the Worker execution interval including JavaScript. It is not WASM-only duration. Worker concurrency is 1–4; separate file parsing can overlap, global analyses wait for complete input indexing. Cancellation, deadlines and input revisions prevent stale UI results. Module caching is optional; no general speedup is promised.

## Ingestion scheduling and local timing
`parseBatchSize` defaults to8 (integer1–8). Small files share one parse job up to8 files and256 KiB total; a larger file uses the existing individual job. Set1 for the earlier per-file scheduling. Each wave admits at most the selected concurrency and16 MiB of input. Workers are still created/terminated per job; no persistent Worker or shared Instance is introduced. Module reuse remains opt-in (`moduleReuse:false` by default).

`metrics.stages` separates input snapshot/read/hash, expansion, parsing, metadata validation, analysis and report construction. Per-job construction/startup/module/instantiate/host intervals have distinct meanings; overlapping and nested intervals must not be summed into total wall time. `totalMs` ends before the last complete-report byte check and freeze; measure caller elapsed for end-to-end comparisons. Process RSS observations in development evidence are Node cloud measurements, not browser memory ceilings. ZIP expansion writes chunks into one bounded output buffer per entry and retains all validated files for complete indexing.
