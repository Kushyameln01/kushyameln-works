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
  layerNames: {}, // optional {'GUID:fileID:sourceLayerIndex': 'Explicit Name'}
}, {inputRevision, onProgress: console.log});
// result: {archive: Uint8Array, report, assetCount}
session.dispose();
```

`catalog.controllers`, `.expressions`, `.blendTrees`, `.masks` contain `{id,name,path,guid,fileId,...}`. IDs are exact `GUID:fileID` strings, including 64-bit fileIDs. Controllers also contain `layers: [{index,name,syncedLayerIndex}]` and `parameters: [{name,type,defaultValue}]`.

Inputs are named `.unitypackage` bytes, or supported Unity text `.controller`, `.anim`, `.asset`, `.mask` files together with their `.meta` files. All source dependencies must be supplied, except obsolete mask-only references replaced by the selected mask and recognized external SDK scripts/Unity built-ins. Unsupported sources/structures fail explicitly. GUID-content conflicts, incompatible same-name parameter definitions and duplicate final layer names block generation. Rename imported layers explicitly when they collide with another imported layer or reserved root name. The prototype does not expose conflict-choice overrides.

The explicit `playable` request selects the output context from Base, Additive, Gesture, Action, FX, Sitting, TPose and IKPose. Supported SDK layer controls must target that same context; cross-Playable mapping remains unsupported. All source Controller layers, declarations and supported subassets are retained. Existing Write Defaults flags remain. Two new Override layers use default states with Write Defaults ON; all final layer weights are 1, and all layers reference the selected unchanged mask. Tree/Clip settings and curves retain their source values; output identities and object references are remapped. The ordered base owns final Controller top-level/importer metadata. Original standalone motion/mask importer fields are retained with remapped identities.

Expressions merge independently of Controller declarations. The central `default-value-rules.mjs` applies exact-name Float/default rules before general conflicts: AlwaysOne=1; EyeLidLeft, EyeLidRight and EyeLid=0.75. Only AlwaysOne is added when absent in either domain. Existing Expression flags remain; a newly added AlwaysOne is unsaved and local (`saved=false`, `networkSynced=false`). No other Controller-only names are added to Expressions. Rule normalization/addition provenance appears in `report.defaultValueRules`.

Keep generation's `inputRevision` equal to the imported source revision; request/configuration changes alone do not change it. Importing new sources cancels any active operation. `cancel()` terminates the dedicated Worker; a later generation reloads retained private source copies. Caller buffers remain usable. `dispose()` releases the session. An injectable `workerFactory` follows the browser Worker interface and is useful for tests. The client owns and terminates Workers it creates; it does not create or dispose shared compute pools.

Errors include a message. Integration failures additionally expose `name='IntegrationError'`, `.issues` (`{severity,code,message,...detail}`), and `.report={status:'BLOCKED',issues}`. Cancellation rejects with `AbortError`. Successful reports include input hashes, exact request, final Animator/Expression rows, rule changes, graph/layer mappings, static reference and package roundtrip validation; Unity import/runtime remain `UNVERIFIED`.

Node checks:

```sh
node --test tools/animator-integrator/test-core.mjs tools/animator-integrator/test-client.mjs
INTEGRATOR_TEMPLATE_PATH=/path/to/recovered/template.json node tools/animator-integrator/test-real-template.mjs
```

The optional recovered-template check uses real motions with explicitly synthetic Controllers, Expressions and Mask. No recovered private template is embedded in the repository.
