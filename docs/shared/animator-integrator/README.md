# Animator Integrator prototype client

A static-browser, dedicated-Worker API. No Installer is generated. Unity Editor import and runtime behavior are unverified.

```js
import {createAnimatorIntegrator} from './client.mjs';
const session = createAnimatorIntegrator();
const inputRevision = 1; // increase only when source files change
const {catalog, inputHashes} = await session.importSources(
  [{name: file.name, bytes: new Uint8Array(await file.arrayBuffer())}],
  {inputRevision},
);
const result = await session.generate({
  schemaVersion: 1,
  name: 'Integrated', // archive/download name only; source asset names/identities stay
  controllerIds: [catalog.controllers[0].id], // ordered; first is the existing merge destination
  expressionIds: catalog.expressions.map(x => x.id),
  parameterOnlyControllerIds: [], // optional subset of controllerIds after the first; omit only their layers
  maskId: catalog.masks[0].id,
  binaryTreeId: catalog.blendTrees[0].id,
  smoothTreeId: catalog.blendTrees[1].id,
  playable: 'FX', // Base, Additive, Gesture, Action, FX, Sitting, TPose, IKPose
  writeDefaults: true,
  vrcft5RangeSync: true, // optional; omitted=true, explicit false uses BinaryParameters rules only
  layerNames: {}, // optional {'GUID:fileID:sourceLayerIndex': 'Explicit Name'}
}, {inputRevision, onProgress: console.log});
// result: {archive: Uint8Array, report, assetCount}
session.dispose();
```

`catalog.controllers`, `.expressions`, `.blendTrees`, `.masks` contain `{id,name,path,guid,fileId,...}`. IDs are exact `GUID:fileID` strings, including 64-bit fileIDs. Controllers also contain `layers: [{index,name,syncedLayerIndex}]` and `parameters: [{name,type,defaultValue}]`.

Inputs are named `.unitypackage` bytes, or supported Unity text `.controller`, `.anim`, `.asset`, `.mask` files together with their `.meta` files. Standalone names must explicitly supply their original `Assets/...` paths; basenames cannot establish original path provenance and are blocked. Unitypackage input is recommended. All source dependencies must be supplied, except obsolete mask-only references replaced by the selected mask and recognized external SDK scripts/Unity built-ins. Unsupported sources/structures fail explicitly. GUID-content conflicts, incompatible same-name parameter definitions and duplicate final layer names block generation. Rename imported layers explicitly when they collide with another imported layer or reserved root name. The prototype does not expose conflict-choice overrides.

The explicit `playable` request selects the output context from Base, Additive, Gesture, Action, FX, Sitting, TPose and IKPose. Supported SDK layer controls must target that same context; cross-Playable mapping remains unsupported. By default, all source Controller layers, declarations and supported subassets are retained. An explicit `parameterOnlyControllerIds` array omits the Layers of selected additional Controllers from composition while retaining their declarations and supported embedded objects, except verified empty unsynchronized root StateMachines of those omitted layers. It must be a duplicate-free subset of `controllerIds` after the first; the base Controller cannot be selected. Omitted or empty means the existing all-layer behavior. This is not automatic empty-layer pruning; layer controls targeting an omitted Layer still block generation. Decode / Smooth Builder uses this option only for its verified generated empty Registrar layers, producing Base + Binary + Smooth regardless of target count. Existing Write Defaults flags remain. Two new Override layers use default states with Write Defaults ON; all final layer weights are 1, and all layers reference the selected unchanged mask. The first selected Controller and first selected Expression are the existing merge hosts: original GUID, name, main document fileID, metadata and other source documents remain. Only authorized Controller/Expression sections change. `request.name` is the archive name, not an asset rename.

Every supplied Motion, Mask, resource and folder file is retained as a whole input file, including unrelated files and unreferenced embedded Clips/Trees. Original asset/meta bytes, embedded document IDs/order/names and references remain. All output paths are within the requested parent folder `Assets/Merged_DecodeAndSmooth`: the only permitted path change is `Assets/X/Y` → `Assets/Merged_DecodeAndSmooth/X/Y`; already-prefixed paths are not prefixed twice. An existing parent folder retains its GUID/meta. When absent, only this newly requested parent folder receives a new GUID. Input assets never receive new GUIDs, generated filenames or extracted standalone Clip files.

Existing base structural IDs and embedded Motions stay. Additional Controller structural objects are merged into the base, preserving their fileIDs unless they collide; only collisions and the two new State/StateMachine pairs receive unused local IDs. Imported structure references are updated only as needed for that merge. Additional selected Controllers with embedded Motion/Mask/other incompatible contents are blocked with host/object IDs, rather than split or used as alternative external hosts. Additional Expression merge sources with other embedded content are similarly blocked. Empty Expression selection is now blocked because there is no existing destination identity. GUID/path ambiguity, parent relocation collisions and unresolved original references are explicit errors; there is no automatic rename or identity fallback.

`report.preservation` records the parent folder identity/creation status, original→prefixed paths, modified existing hosts, unchanged Motion identities and structural collision mappings. Product assertions compare source file bytes/meta/GUID/path and embedded Motion document text/IDs directly, without normalizing away identity changes. Final checks inspect every retained document and metadata reference. `materialize-preserved.mjs` is Integrator-specific; Composer's generic asset-splitting writer is not called. Its pure `preservedOutputPath(path)` export describes the authorized parent projection.

Expressions merge independently of Controller declarations. The central `default-value-rules.mjs` applies exact-name Float/default rules before general conflicts: AlwaysOne=1; `v2/EyeLidLeft`, `v2/EyeLidRight` and `v2/EyeLid`=0.75. Bare `EyeLidLeft`/`EyeLidRight`/`EyeLid`, dot aliases and slash namespaces are not these exact default-rule names; their input types/defaults remain. Only AlwaysOne is added when absent in either domain. Default/type normalization preserves existing Expression flags; a newly added AlwaysOne is unsaved and local (`saved=false`, `networkSynced=false`). No other Controller-only names are added to Expressions. Default/type normalization/addition provenance appears in `report.defaultValueRules`.

Independent Expression synchronization rules in the same module set `networkSynced=false` for the ASCII suffix `0`, and `true` for suffixes `1`–`9` or the exact case-sensitive suffix `Negative`. For example, `v2/EyeLidLeft8`, `v2.EyeLidRightNegative`, `Value123` and `Value0` match; `Value8Tail`, `Valuenegative` and `Value８` do not. The synchronization stage itself preserves Saved, type, defaults and all nonmatching synchronization settings; it does not change Animator parameters. They run before Expression conflict comparison: matching entries that differ only in synchronization merge using their suffix rule (`false` for `0`, otherwise `true`); other setting conflicts still block generation. The 256-bit synchronization budget applies after normalization. `report.expressionSyncRules={rules,changes}` separately records the rules and actual synchronization changes with source identity; matches already at their required setting need no change record. The module exports `EXPRESSION_SYNC_RULES` and the pure `applyExpressionSyncRules(rows,{sourceId})` function.

Independent Binary Bool registration uses the same `findBinaryParameterSuffixRule(name)` condition as Binary synchronization. Matching Expression parameters become `Bool` before synchronization/range normalization and conflict comparison. Numeric defaults 0/1 are preserved exactly; other numeric defaults are not rounded or reset and block generation with `binary_bool_default`. Existing Bool, Int and Float inputs with the same matching name/default can merge after type normalization; Saved or numeric-default differences still conflict. Unmatched types/defaults stay unchanged. This rule never changes Animator types: Expression Bool and Animator Float/Int may coexist while retaining their respective numeric defaults. `report.expressionBoolRules={rules,changes}` separately records type changes with source identity and suffix rule ID. `applyExpressionBoolRules(rows,{sourceId})` returns `{rows,changes,issues}` for callers that need the pure normalization result.

The independent VRCFT5 range setting is **ON by default for both UI and API**, including callers such as Decode Smooth Builder that omit `request.vrcft5RangeSync`. An explicit `false` retains the BinaryParameters-only behavior. Other supplied values must be booleans. This intentionally changes the default result for documented nonnegative `Negative` parameters; toggling this setting does not disable the separately defined BinaryParameters default, Bool-registration or synchronization rules.

When enabled, the VRCFT5 rule runs after Binary suffix synchronization and before Expression conflicts or synchronization-budget validation. For an exact final `Negative`, it looks up the base parameter in the bundled Current (v5.0) documented range dataset: `[0, positive]` forces `networkSynced=false`; `[negative, positive]` forces `true`; an undocumented name makes no further change. Canonical `v2/Name` and documented slash namespaces such as `Example/Nest/v2/Name` resolve to the same range. `v2.Name` is an explicit compatibility alias, also after a slash namespace. Bare names, arbitrary prefix stripping and Binary digit suffixes are not inferred as documented base names. The footnote markers on `JawClench`/`JawMandibleRaise` are not name digits. Saved, types, defaults, Animator declarations and digit-suffix synchronization remain untouched by this new rule.

The static dataset in `vrcft5-ranges.mjs` contains 124 factual names/min/max records: 97 nonnegative and 27 signed ranges. Sources: [VRCFT5 Parameters](https://docs.vrcft.io/docs/tutorial-avatars/tutorial-avatars-extras/parameters) and [Binary Parameters](https://docs.vrcft.io/docs/tutorial-avatars/tutorial-avatars-extras/parameters/types/binary), retrieved 2026-10-25. The synchronization policy is user supplied; the official source documents parameter ranges and the Negative sign bit. There is no runtime network lookup. `report.vrcft5RangeSync={enabled,source,policy,matches,unmatched,changes}` independently records dataset version/hashes, matching mode/canonical range/source identity and actual post-Binary synchronization changes. Disabled runs keep this section with empty histories. Existing `expressionSyncRules` describes the earlier Binary normalization, even when this later rule overrides its result.

Keep generation's `inputRevision` equal to the imported source revision; request/configuration changes alone do not change it. Importing new sources cancels any active operation. `cancel()` terminates the dedicated Worker; a later generation reloads retained private source copies. Caller buffers remain usable. `dispose()` releases the session. An injectable `workerFactory` follows the browser Worker interface and is useful for tests. The client owns and terminates Workers it creates; it does not create or dispose shared compute pools.

Errors include a message. Integration failures additionally expose `name='IntegrationError'`, `.issues` (`{severity,code,message,...detail}`), and `.report={status:'BLOCKED',issues}`. Cancellation rejects with `AbortError`. Successful reports include input hashes, exact request, final Animator/Expression rows, rule changes, graph/layer mappings, static reference and package roundtrip validation; Unity import/runtime remain `UNVERIFIED`.

Regression commands (generation and archive readback are separate from Unity runtime validation):

```sh
node --test tools/animator-integrator/test-core.mjs tools/animator-integrator/test-client.mjs tools/animator-integrator/test-sync-rules.mjs tools/animator-integrator/test-vrcft5-ranges.mjs tools/animator-integrator/test-binary-bool.mjs tools/animator-integrator/test-preservation.mjs
INTEGRATOR_TEMPLATE_PATH=/path/to/recovered/template.json node tools/animator-integrator/test-real-template.mjs
```

The optional recovered-template check uses real motions with explicitly synthetic Controllers, Expressions and Mask. No recovered private template is embedded in the repository.

## External verification

The initial range/Bool-rule revision was checked statically only. Later follow-ups execute the generation regressions and inspect output archives; Unity runtime remains unverified. Use the commands above and the following browser checks.

Load/select the Controller, Expressions, Mask and two roots, then generate with the independent VRCFT5 range checkbox ON. Inspect the first selected Expression asset at its original relative path under the parent folder and `report.parameters`, using the following expectations. The unknown-name row reflects the existing Binary rule; the new range rule itself makes no change to it.

| Expression name | VRCFT5 range ON (default) | Range OFF: Binary only |
| --- | --- | --- |
| `v2/EyeLidLeftNegative` | Sync OFF | Sync ON |
| `v2/JawXNegative` | Sync ON | Sync ON |
| `v2/UnknownNegative` | Sync ON from Binary | Sync ON |
| `v2/EyeLidLeft8` | Sync ON | Sync ON |
| `v2/EyeLidLeft0` | Sync OFF | Sync OFF |
| A name outside both rules | Preserve input sync | Preserve input sync |

Toggle the range checkbox OFF: the old output must become unavailable until regeneration. Regenerate and compare with the Binary-only column. Check the same results through the client API with omitted/true `vrcft5RangeSync` versus explicit false. In both modes, Saved, nonBinary types and numeric defaults must remain, and Binary suffix Expression entries must register as Bool (0/1 defaults only). Every layer must still use weight 1 and the selected Mask. New states must retain Write Defaults ON. Review the independent `report.vrcft5RangeSync` matches/unmatched/changes and reject final synchronization costs above 256 bits.

External preservation checks must compare every original retained file to its output GUID, exact asset/meta bytes and independently derived parent-prefixed path, including unreferenced files and embedded Clips. Check Controller/Expression names and custom main fileIDs, base State IDs, collision-only imported structure changes, parent folder reuse/new-folder-only GUID issuance, folder roundtrip, and explicit BLOCK cases for incompatible additional hosts, metadata backreferences, missing Expression destination and ambiguous paths. Record the tested source revision and output archive separately from Unity import/runtime results.

Omitted empty roots are matched by source GUID/fileID and layer membership, not by name. No remaining document or metadata reference may target an omitted root; such a reference blocks generation. Nonempty roots and unrelated unconnected objects are preserved. `report.preservation.omittedEmptyStateMachines` records exact omitted identities. Incoming HideFlags remain intact; generated Builder/Registrar graph objects use HideInHierarchy, while main assets and source Motion/Mask visibility remain unchanged.
