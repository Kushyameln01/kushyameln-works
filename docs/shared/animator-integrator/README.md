# Animator Integrator(VRCFT5) client

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
  vrcft5RangeSync: true, // optional; omit or true. false is rejected: VRCFT5 rules are required.
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

Expressions merge independently of Controller declarations, with two explicit additions: `AlwaysOne` and selected Animator declarations matching `Smooth/…_Function`. The VRCFT5 policy is fixed for the UI and API. `request.vrcft5RangeSync` may be omitted or `true`; `false` and other values are explicit errors. This replaces the previous optional range setting.

`expression-rules.mjs` applies the following Expression registration rules before conflicts, Bool validation and synchronization-budget checks. Matching is case-sensitive.

| Target | Result |
| --- | --- |
| Prefix `Decode/`, `Function/`, `Proxy/` | Exclude from Expression registration |
| Prefix `Smooth/` and suffix `_Function` | Retain with Sync OFF; if absent, add from a selected Animator declaration using its type/default and Saved OFF |
| Other prefix `Smooth/` | Exclude |
| ASCII final `0` | Exclude |
| Final `Negative`, documented nonnegative base range | Exclude |
| Final `Negative`, documented signed base range | Bool, Sync ON; preserve numeric default 0/1 |
| Final `Negative`, undocumented base range | Preserve input type, default, Saved and Sync without Binary normalization |
| Left/right EyeLid binary suffix `1`, `2`, `4`, `8` | Bool, Sync ON; defaults 0, 0, 1, 1 respectively |
| Other ASCII final `1`–`9` | Bool, Sync ON; preserve numeric default 0/1 |
| Other names | Preserve input settings, subject to the exact default rules below |

Prefix exclusions take precedence over suffix rules. Excluded input rows are removed even if already registered; their conflicting settings or non-Bool defaults do not block generation. These rules do not delete or rewrite Animator declarations, BlendTrees or Clips. Existing Saved flags are preserved for retained rows. Existing Smooth controls keep their Expression type/default/Saved; only Sync changes. Missing Smooth controls are copied from selected Controllers only, including explicitly parameter-only selections. Conflicting selected Animator definitions still block generation. No other Controller-only names are added except AlwaysOne. A Smooth control is a user-adjustable parameter; the page does not add a separate rule-toggle checkbox.

The central `default-value-rules.mjs` retains the exact-name Float/default rules for both domains: `AlwaysOne`=1; `v2/EyeLidLeft`, `v2/EyeLidRight`, `v2/EyeLid`=0.75. Only AlwaysOne is ensured when missing in both domains. A newly added AlwaysOne is Saved OFF and Sync OFF. Float EyeLid aliases are not normalized. In contrast, the new EyeLid **Binary Expression** default rule accepts the canonical range lookup aliases described below. Its 4/8 defaults represent 0.25 + 0.5 = 0.75, while 1/2 must be 0. The matching Animator Binary defaults remain unchanged.

Remaining Binary Bool rows must have numeric defaults 0 or 1; other values block generation with `binary_bool_default` rather than being rounded. Compatible types merge after Bool normalization; Saved/default conflicts still block generation. Expression Bool and Animator Float/Int may coexist. The final Expression synchronization cost must not exceed 256 bits.

Range lookup uses the bundled Current (v5.0) dataset: 124 names/min/max records, with 97 nonnegative and 27 signed ranges. Canonical `v2/Name`, explicit dot alias `v2.Name`, and either after a slash namespace resolve to the same range. Bare names and arbitrary prefix stripping are not inferred. Footnote markers on `JawClench`/`JawMandibleRaise` are not name digits. Sources: [VRCFT5 Parameters](https://docs.vrcft.io/docs/tutorial-avatars/tutorial-avatars-extras/parameters) and [Binary Parameters](https://docs.vrcft.io/docs/tutorial-avatars/tutorial-avatars-extras/parameters/types/binary), retrieved 2026-10-25. The registration policy is user supplied; the official sources document ranges and binary weights. There is no runtime network lookup.

Reports distinguish the rules and source identities:

- `expressionRegistrationRules={rules,exclusions,changes}` records omitted rows, Smooth changes/additions and EyeLid Binary defaults. Exclusions have `after:null`; added Smooth rows have `sourceDomain:'animator'`.
- `expressionSources` includes excluded rows as `normalized:null, action:'exclude'`, and added Smooth rows as `original:null, action:'add'`.
- `defaultValueRules`, `expressionBoolRules` and `expressionSyncRules` record their respective actual changes. Binary synchronization reports apply only to rows that survive classification.
- `vrcft5RangeSync={enabled:true,source,policy,matches,unmatched,changes}` records dataset provenance and Negative registration decisions. Matches use `registration:'exclude'|'retain'`; unknown names appear in `unmatched`.

The old standalone suffix/range helper exports remain available for compatibility, but the Integrator pipeline uses `applyVrcft5ExpressionRules` and does not expose the old range-disable behavior.

Keep generation's `inputRevision` equal to the imported source revision; request/configuration changes alone do not change it. Importing new sources cancels any active operation. `cancel()` terminates the dedicated Worker; a later generation reloads retained private source copies. Caller buffers remain usable. `dispose()` releases the session. An injectable `workerFactory` follows the browser Worker interface and is useful for tests. The client owns and terminates Workers it creates; it does not create or dispose shared compute pools.

Errors include a message. Integration failures additionally expose `name='IntegrationError'`, `.issues` (`{severity,code,message,...detail}`), and `.report={status:'BLOCKED',issues}`. Cancellation rejects with `AbortError`. Successful reports include input hashes, exact request, final Animator/Expression rows, rule changes, graph/layer mappings, static reference and package roundtrip validation; Unity import/runtime remain `UNVERIFIED`.

Regression commands (generation and archive readback are separate from Unity runtime validation):

```sh
node --test tools/animator-integrator/test-core.mjs tools/animator-integrator/test-client.mjs tools/animator-integrator/test-sync-rules.mjs tools/animator-integrator/test-vrcft5-ranges.mjs tools/animator-integrator/test-binary-bool.mjs tools/animator-integrator/test-preservation.mjs tools/animator-integrator/test-expression-registration.mjs
INTEGRATOR_TEMPLATE_PATH=/path/to/recovered/template.json node tools/animator-integrator/test-real-template.mjs
```

The optional recovered-template check uses real motions with explicitly synthetic Controllers, Expressions and Mask. No recovered private template is embedded in the repository.

## External verification

Load/select Controllers, Expressions, Mask and the two roots, then generate. Confirm that the VRCFT5 name and always-visible exception table appear without selecting inputs. Inspect the saved Expression asset and `report.parameters` against the registration table above. In particular, check omitted internal/zero/nonnegative-Negative rows, unchanged unknown Negative, local Smooth controls both existing and newly added, and both EyeLid Binary default combinations.

The API must accept omitted/true `vrcft5RangeSync` and reject false explicitly. Every layer must retain weight 1 and the selected Mask; new states retain Write Defaults ON. Review exclusions and source histories separately from final rows, and reject synchronization costs above 256 bits. Changing inputs or configuration invalidates the previous download until regeneration.

External preservation checks must compare every original retained file to its output GUID, exact asset/meta bytes and independently derived parent-prefixed path, including unreferenced files and embedded Clips. Check Controller/Expression names and custom main fileIDs, base State IDs, collision-only imported structure changes, parent folder reuse/new-folder-only GUID issuance, folder roundtrip, and explicit BLOCK cases for incompatible additional hosts, metadata backreferences, missing Expression destination and ambiguous paths. Record the tested source revision and output archive separately from Unity import/runtime results.

Omitted empty roots are matched by source GUID/fileID and layer membership, not by name. No remaining document or metadata reference may target an omitted root; such a reference blocks generation. Nonempty roots and unrelated unconnected objects are preserved. `report.preservation.omittedEmptyStateMachines` records exact omitted identities. Incoming HideFlags remain intact; generated Builder/Registrar graph objects use HideInHierarchy, while main assets and source Motion/Mask visibility remain unchanged.
