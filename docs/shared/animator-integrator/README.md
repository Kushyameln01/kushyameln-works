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
  name: 'Integrated',
  controllerIds: [catalog.controllers[0].id], // ordered; first owns base metadata
  expressionIds: catalog.expressions.map(x => x.id),
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

Inputs are named `.unitypackage` bytes, or supported Unity text `.controller`, `.anim`, `.asset`, `.mask` files together with their `.meta` files. All source dependencies must be supplied, except obsolete mask-only references replaced by the selected mask and recognized external SDK scripts/Unity built-ins. Unsupported sources/structures fail explicitly. GUID-content conflicts, incompatible same-name parameter definitions and duplicate final layer names block generation. Rename imported layers explicitly when they collide with another imported layer or reserved root name. The prototype does not expose conflict-choice overrides.

The explicit `playable` request selects the output context from Base, Additive, Gesture, Action, FX, Sitting, TPose and IKPose. Supported SDK layer controls must target that same context; cross-Playable mapping remains unsupported. All source Controller layers, declarations and supported subassets are retained. Existing Write Defaults flags remain. Two new Override layers use default states with Write Defaults ON; all final layer weights are 1, and all layers reference the selected unchanged mask. Tree/Clip settings and curves retain their source values; output identities and object references are remapped. The ordered base owns final Controller top-level/importer metadata. Original standalone motion/mask importer fields are retained with remapped identities.

Expressions merge independently of Controller declarations. The central `default-value-rules.mjs` applies exact-name Float/default rules before general conflicts: AlwaysOne=1; `v2/EyeLidLeft`, `v2/EyeLidRight` and `v2/EyeLid`=0.75. Bare `EyeLidLeft`/`EyeLidRight`/`EyeLid`, dot aliases and slash namespaces are not these exact default-rule names; their input types/defaults remain. Only AlwaysOne is added when absent in either domain. Default/type normalization preserves existing Expression flags; a newly added AlwaysOne is unsaved and local (`saved=false`, `networkSynced=false`). No other Controller-only names are added to Expressions. Default/type normalization/addition provenance appears in `report.defaultValueRules`.

Independent Expression synchronization rules in the same module force `networkSynced=true` when a name ends with one ASCII digit (`0`–`9`) or the exact case-sensitive suffix `Negative`. For example, `v2/EyeLidLeft8`, `v2.EyeLidRightNegative`, `Value123` and `Value0` match; `Value8Tail`, `Valuenegative` and `Value８` do not. The synchronization stage itself preserves Saved, type, defaults and all nonmatching synchronization settings; it does not change Animator parameters. They run before Expression conflict comparison: matching entries that differ only in synchronization merge using `true`; other setting conflicts still block generation. The 256-bit synchronization budget applies after normalization. `report.expressionSyncRules={rules,changes}` separately records the rules and actual synchronization changes with source identity; already-synchronized matches require no change record. The module exports `EXPRESSION_SYNC_RULES` and the pure `applyExpressionSyncRules(rows,{sourceId})` function.

Independent Binary Bool registration uses the same `findBinaryParameterSuffixRule(name)` condition as Binary synchronization. Matching Expression parameters become `Bool` before synchronization/range normalization and conflict comparison. Numeric defaults 0/1 are preserved exactly; other numeric defaults are not rounded or reset and block generation with `binary_bool_default`. Existing Bool, Int and Float inputs with the same matching name/default can merge after type normalization; Saved or numeric-default differences still conflict. Unmatched types/defaults stay unchanged. This rule never changes Animator types: Expression Bool and Animator Float/Int may coexist while retaining their respective numeric defaults. `report.expressionBoolRules={rules,changes}` separately records type changes with source identity and suffix rule ID. `applyExpressionBoolRules(rows,{sourceId})` returns `{rows,changes,issues}` for callers that need the pure normalization result.

The independent VRCFT5 range setting is **ON by default for both UI and API**, including callers such as Decode Smooth Builder that omit `request.vrcft5RangeSync`. An explicit `false` retains the BinaryParameters-only behavior. Other supplied values must be booleans. This intentionally changes the default result for documented nonnegative `Negative` parameters; toggling this setting does not disable the separately defined BinaryParameters default, Bool-registration or synchronization rules.

When enabled, the VRCFT5 rule runs after Binary suffix synchronization and before Expression conflicts or synchronization-budget validation. For an exact final `Negative`, it looks up the base parameter in the bundled Current (v5.0) documented range dataset: `[0, positive]` forces `networkSynced=false`; `[negative, positive]` forces `true`; an undocumented name makes no further change. Canonical `v2/Name` and documented slash namespaces such as `Example/Nest/v2/Name` resolve to the same range. `v2.Name` is an explicit compatibility alias, also after a slash namespace. Bare names, arbitrary prefix stripping and Binary digit suffixes are not inferred as documented base names. The footnote markers on `JawClench`/`JawMandibleRaise` are not name digits. Saved, types, defaults, Animator declarations and digit-suffix synchronization remain untouched by this new rule.

The static dataset in `vrcft5-ranges.mjs` contains 124 factual names/min/max records: 97 nonnegative and 27 signed ranges. Sources: [VRCFT5 Parameters](https://docs.vrcft.io/docs/tutorial-avatars/tutorial-avatars-extras/parameters) and [Binary Parameters](https://docs.vrcft.io/docs/tutorial-avatars/tutorial-avatars-extras/parameters/types/binary), retrieved 2026-10-25. The synchronization policy is user supplied; the official source documents parameter ranges and the Negative sign bit. There is no runtime network lookup. `report.vrcft5RangeSync={enabled,source,policy,matches,unmatched,changes}` independently records dataset version/hashes, matching mode/canonical range/source identity and actual post-Binary synchronization changes. Disabled runs keep this section with empty histories. Existing `expressionSyncRules` describes the earlier Binary normalization, even when this later rule overrides its result.

Keep generation's `inputRevision` equal to the imported source revision; request/configuration changes alone do not change it. Importing new sources cancels any active operation. `cancel()` terminates the dedicated Worker; a later generation reloads retained private source copies. Caller buffers remain usable. `dispose()` releases the session. An injectable `workerFactory` follows the browser Worker interface and is useful for tests. The client owns and terminates Workers it creates; it does not create or dispose shared compute pools.

Errors include a message. Integration failures additionally expose `name='IntegrationError'`, `.issues` (`{severity,code,message,...detail}`), and `.report={status:'BLOCKED',issues}`. Cancellation rejects with `AbortError`. Successful reports include input hashes, exact request, final Animator/Expression rows, rule changes, graph/layer mappings, static reference and package roundtrip validation; Unity import/runtime remain `UNVERIFIED`.

External execution commands (current range/Bool-rule tests are authored but not executed in Codex; this update was checked statically only):

```sh
node --test tools/animator-integrator/test-core.mjs tools/animator-integrator/test-client.mjs tools/animator-integrator/test-sync-rules.mjs tools/animator-integrator/test-vrcft5-ranges.mjs tools/animator-integrator/test-binary-bool.mjs
INTEGRATOR_TEMPLATE_PATH=/path/to/recovered/template.json node tools/animator-integrator/test-real-template.mjs
```

The optional recovered-template check uses real motions with explicitly synthetic Controllers, Expressions and Mask. No recovered private template is embedded in the repository.

## External verification

This revision was checked statically only in Codex. Its generation behavior, UI operation and Unity runtime have not been verified. Run the commands above or the following browser checks outside Codex.

Load/select the Controller, Expressions, Mask and two roots, then generate with the independent VRCFT5 range checkbox ON. Inspect the downloaded ExpressionParameters asset and `report.parameters`, using the following expectations. The unknown-name row reflects the existing Binary rule; the new range rule itself makes no change to it.

| Expression name | VRCFT5 range ON (default) | Range OFF: Binary only |
| --- | --- | --- |
| `v2/EyeLidLeftNegative` | Sync OFF | Sync ON |
| `v2/JawXNegative` | Sync ON | Sync ON |
| `v2/UnknownNegative` | Sync ON from Binary | Sync ON |
| `v2/EyeLidLeft8` | Sync ON | Sync ON |
| A name outside both rules | Preserve input sync | Preserve input sync |

Toggle the range checkbox OFF: the old output must become unavailable until regeneration. Regenerate and compare with the Binary-only column. Check the same results through the client API with omitted/true `vrcft5RangeSync` versus explicit false. In both modes, Saved, nonBinary types and numeric defaults must remain, and Binary suffix Expression entries must register as Bool (0/1 defaults only). Every layer must still use weight 1 and the selected Mask. New states must retain Write Defaults ON. Review the independent `report.vrcft5RangeSync` matches/unmatched/changes and reject final synchronization costs above 256 bits.
