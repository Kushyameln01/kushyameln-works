# AI connection API — E0 / E1 / E2 / E3 / E4 / E5

Common contract: `works-module-contract/1.0-draft.1` (existing M1/M2 reused).
Package contract: `works-artifact-package/1.0-draft.1`.
Current norm-required entries below use the execution-plan checkpoint
`0fb553fd081d3bcbbad4ead7accd165679f77d34` and the profile/norm/numerical
catalog `1.0-draft.1`, fixed at
`6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`. Their scoped acceptance and new
owner receipt sources are in
`development/ai-connection/norm-receipt-adoption/RESULT.md`.
The E-series sources and adoption notes below retain their historical scopes.
Sources: integration specification **1.1-draft.1**, execution plan **0.2-draft.2**,
whose current Page bodies were reacquired on 2026-10-31 JST. Uploaded originals
and earlier source receipts remain historical inputs. See
`development/ai-connection/E-RESUME-SOURCE-BASELINE.md` for current owner pins
and `E-RESUME-RESULT.md` for the resumed verification scope.

The subsequent E1 adoption uses LoRA distribution
`0c27874908638afc748ea2455a2779a16736730b` and the exact accepted Diffusion peer
`438972f30242e0a3bc66edb8591f38eaa0fcd384`. See
`development/ai-connection/E1-ADOPT-SOURCE-BASELINE.md` for the new owner diff,
original source evidence and the distinct latest Diffusion candidate.

Management does not modify the native API, kernel, codec, model, precision or
output conditions. Owner kernel changes are adopted by exact version below.
These ES modules import no inference runtime. Clients, resource owners,
revisions, source interpretation, binary data and codecs are explicit inputs.

## External adapters

```js
import {createModuleAdapter} from './adapters/index.mjs';
const adapter = createModuleAdapter({
  kind: 'text-vae', module: 'vae', descriptor, nativeClient: nativeAPI.vae,
  artifactStore, sourceVerified: true,
  binding: {ownerId, bindingRef, sessionId: managerSessionId},
});
const reply = await adapter.invoke({
  requestId, operationId: 'decode', localRevision, input: nativeTensor,
});
```

The direct standalone form above retains native method signatures. A connected
tensor call supplies `edge` (complete M2 arguments) and an `inputHandle` from
`captureNativeTensor`. Before dispatch it checks M2 readiness, exact descriptor
port, operation/owner/binding, and the captured native/store association. An
incompatible edge, unavailable source or not-implemented operation cannot run.

Replies retain request/local revision and native correlation separately, with
`status: ok | error | blocked | unverified | cancelled`. Text/VAE native string
errors retain `rawMessage` with `nativeCode:null`. Diffusion keeps its actual
protocol/build/session/job/inputRevision/op, full raw reply, and native error
code. It rejects mismatched reply identities. IDs cannot be reused per adapter.

LoRA v2 uses the exact retrieved `lora-connection/2.0-draft.1` methods. Its direct
wrapper accepts `nativeArguments` (positional local arguments) and explicit
`nativeRevisionBinding:{sdkInstanceId,inputRevision,applicationRevision}`.
Actual signatures: `plan(input)`, `prepare(plan,{baseProvider,sink,...})`,
`stage(prepared,target,{signal,isCurrent,...})`, `release(prepared)`.
Keep the actual returned local revision separately: a new plan increments native
generation. Native prepared handles are opaque identity objects, not cloned
JSON. No `apply`/`detach` v2 method is invented. Connected tensor positional
mapping remains blocked: weight/consumer mappings must be explicitly designed.

`sourceVerified` defaults false and is a caller's verified receipt assertion,
not a claim made by the wrapper. LoRA2bba907 and Text54bfead actual native
boundaries are tested. Exact Diffusion f522d9aeff313558c4ef83022a340af9a4c21391
was subsequently acquired and pinned separately from core902 and latest83.
Its actual native F32 projection, conditioning, mean128, schedule and Euler run
Hike/ORT in Chromium. Synthetic File registration → actual source adapter →
actual LoRA v2 inspect also passes. No real base/LoRA or full model is implied.
The direct LoRA-to-consumer contracts still differ. The explicit diagnostic
bridge below implements their mapping; real-base/real-LoRA acceptance and owner
adoption remain separate. Latest438's mean64 profile is not silently adopted for
f522, and its non-square128 profile remains unsupported.

### Explicit diagnostic LoRA bridge

This is the earlier management implementation, retained for its pinned regression
scope. The owner-adopted original route below does not stack this bridge on top
of the owner adapter.

Import `createDiagnosticLoraBridge` from `adapters/diagnostic-lora.mjs`.
The version is `works-lora-diagnostic-bridge/0.1-draft.1`. Its inputs are explicit
`nativeTarget`, `nativeBaseProvider`, `loaderPolicyId`, `registryVersion`,
`ownerId`, `sourceRefs:{lora,diffusion}`, independent
`validation:{x,expected,tolerance,referenceId}`, and `isApplicationCurrent`.
It returns the full-shape v2 `registry`, `diagnosticTargets`, `baseProvider`,
`createSink()`, `target`, `mapping` and opaque-handle inspection/finalization.
See [the complete mapping](../../../development/ai-connection/DIAGNOSTIC-LORA-MAPPING.md).

Use the unchanged SDK `plan`, `prepare` and `stage`; after a matching successful
stage receipt call `bridge.finalize(prepared,stageReceipt)`, then
`sdk.release(prepared)`. Native selected-slice offsets, both registry digests,
source/plan/local revisions, included/excluded patches and immutable base bias
pass-through remain explicit. Expected outputs are caller-supplied independent
reference data. Finite native identity serialization follows the acquired native
contract separately from the stricter artifact-package JSON profile. The bridge
supports only the acquired PARTIAL Q projection, independent consumer copies,
and never generation admission. No native SDK/provider/consumer is disposed by it.
Each prepared package has at most one outstanding native candidate. Finalization
requires the matching SDK instance/revisions and exact native candidate validation.
A package returned after abort is released by its sink; uncertain cleanup retains
the handle and blocks reuse until `sink.recover()` succeeds (`recoveryState()`
exposes pending cleanup). A late old stage receipt cannot finalize a new candidate.

### Adopted owner LoRA adapter

```js
import {createAdoptedLoraAdapter} from './adapters/adopted-lora.mjs';
const adapter = createAdoptedLoraAdapter({
  ownerExports, sdk, consumer, baseProvider, sourcePins, resourceBinding,
  isOwnerCurrent: target => ownsThisManagerRevisionAndResource(target),
});
const plan = await adapter.plan(input,{target: planTarget});
const prepared = await adapter.prepare(plan,{target: prepareTarget,onBlock});
const applied = await adapter.stage(prepared,{x,expected,tolerance},{
  target: stageTarget,isCurrent: target => selectionIsCurrent(target),
});
await adapter.finalize(prepared,applied,{target: finalizeTarget});
await adapter.release(prepared,{target: releaseTarget});
const output = await adapter.run({x},{target: runTarget});
```

Management version is `works-adopted-lora/0.1-draft.1`; injected owner factory
`createDiffusionDiagnosticAdapter` is `lora-diffusion-diagnostic-adapter/0.1`.
Source pins separately identify `sdk`, `adapter`, `kernel` and `diffusion`, each
with repository/full commit/path/SHA-256; kernel also has byteLength. All must
match this adoption set. The corrected LoRA Hike WASM is **5051 bytes** /
`3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24`.
Native API version alone cannot replace the actual kernel/build identity. The
caller verifies bytes/Git objects and injects public exports; pin strings alone
do not prove loaded code. No runtime is imported implicitly.

Each `target` supplies `managerSessionId`, `managerRevision`, unique `requestId`
and `resourceBinding:{ownerId,bindingId,resourceGeneration}`. The same plan/
prepared cohort retains all fields except the per-call request ID. Calls serialize
per SDK/facade and opaque plans/prepared handles cannot be cloned. `input` retains
native selection, strength, loader and diagnostic target fields. The owner adapter
supplies the registry and all numerical mapping. `onBlock` receives an owned copy
for comparison before native sink write; observer failure aborts preparation.

Stage returns `{receipt,management}`. `receipt` preserves SDK local revisions,
native receipt namespaces, original source/plan/bundle identity and the actual
consumer's dynamic copy owner ID. `management` binds the exact request/resource
generation, source pins, kernel and local revisions. It does not rename ownership
or publish an E5 snapshot. Only the exact terminal stage envelope can finalize
its candidate history. Failed stages use `recover(prepared,{target})` before
release; failed prepare cleanup can use `recover(undefined,{target})`. The caller
owns SDK/consumer/stage/base disposal.

`restoreBase(reference,{target,isCurrent})` delegates the owner's immutable-base
transaction. Reads after a failed new selection name the prior applied cohort
explicitly; they do not certify the failed selection as current.
`describeBinding()` retains native/connection registry identities and the owner's
excluded target/region and detail bias pass-through evidence.

The genuine File trial is `tools/ai-connection/run-managed-lora-real.mjs --help`.
It checks current full-file base hash/stat evidence and browser runtime LoRA
source hashes, runs the owner's independent Python oracle with predeclared gates,
and compares all 81920 selected weights, 16 bias values and 16 ORT/Hike outputs.
Raw originals and arrays stay outside Git. The E1 adoption result records the
actual executed scope; fixtures alone are not original acceptance or E5/full-model
session acceptance.

The revised product input is a user-selected local `.safetensors` File. The four
historical originals and a whole base-model download are **not** prerequisites.
Drive/ZIP references in `development/ai-connection/REFERENCE-INPUTS.json` are
development evidence, not runtime product sources. The primary control test is
`run-managed-local-files.mjs`: one explicitly selected valid File plus the chosen
unsupported-reference Files, with a labeled synthetic immutable base and actual
native SDK/consumer/ORT/Hike. Existing real20 evidence is independently checked
by `verify-owner-e1.mjs`. The whole-base CLI above remains an optional additional
diagnostic, not the acceptance gate.

`createManagedDiagnosticPackage` in `diagnostic-package.mjs` reuses E4 for the
actual output. Supply `{output,applicationEnvelope,inputIdentity,baseEvidence,
codec}`. A save copy adds `management.outputBinding:{sha256,byteLength:64,
meaning:'works:diagnostic-q-projection:v1',packageHash,epoch}` from the actual
returned run; packageHash must match the native validation feed. The exact original
stage envelope remains the finalization capability. The helper returns
`{manifest,assets,registry}` for E4 write/read with an explicit pinned codec.
It preserves input hash/name/size, application/native evidence, manager/local
revisions, ownership, output bytes and explicit base kind. The original File is
not embedded; `reselectRequired:true` remains recorded. Snapshot is explicitly
null and package completeness does not certify real-base compatibility or E5.

`adapter.cancel({requestId,localRevision})` checks the active target before
calling its owner. An accepted native cancel alone is not release/reuse proof.
`adapter.dispose()` only disposes the wrapper and requires no active call; the
resource owner disposes its native client. See [adapter details](adapters/README.md).

## Owned native snapshots

`createOwnedArtifactStore`, `captureNativeTensor`, `restoreNativeTensor`,
`releaseArtifactHandle`, `exportBinaryAssets` are exported from adapters/index.
Capture takes `{tensor,response,descriptor,extensions?,store,registry?}`.
Native tensor and original response are owned copies. All producers, decoder,
mask, Tokenizer, F=5 frame/time arrays after T=2 compression, unknown metadata
and optional extensions remain available. Strict native fields are unchanged.

Private capture association ties handle, store, native and descriptor refs.
Mixed handles, another store, mutated descriptor, released data and failed
capture allocations are handled explicitly. SharedArrayBuffer-backed snapshots
are rejected; the owner must first copy them into ordinary owned buffers.

Binary metadata is the reserved exact three-key object
`{binaryRef,type,byteLength}`. Export exact view bytes and bind each to an E4
required attachment. Other optional objects merely named binaryRef stay opaque.

## Queue and targeted cancellation

```js
import {createInvocationQueue} from './queue.mjs';
const queue = createInvocationQueue({resourceBindings: [{
  bindingId, ownerId, resourceGeneration, groupId,
  cancel: async target => ({stopped: await ownerStopAndConfirm(target)}),
  afterTerminal: async (target,outcome) => ({reusable: await ownerVerify(target,outcome)}),
  release: async (target,outcome) => ownerRelease(target,outcome),
}]});
const result = queue.enqueue({
  id, requestId, ownerId, resourceBinding: bindingId,
  resourceGeneration, revision, activeToken,
}, async ({signal,target,runChild}) => nativeOperation(signal));
await queue.cancelInvocation(id, {
  bindingId, ownerId, resourceGeneration, requestId, revision, activeToken,
});
```

The exact target is checked immediately before dispatch. The barrier joins owner
cancel acknowledgement, original native Promise terminal, children, terminal
cleanup and release before the next job. Never make an owner callback await the
public queue Promise that itself awaits that callback. A timeout/port close is
not proof that computation stopped. Missing guarantees quarantine the group.
Cancellation before actual dispatch needs no native stop and does not poison the
resource; not-started and confirmed-stopped remain distinct observations.

`runChild(childInvocation,execute)` runs same-group reads inside the parent's
owned slot, with the parent's active token and separate child request ID.
Sibling child reads serialize. Cancelling/disconnecting settles pending child
lanes too; children cannot dispatch after quarantine or resource generation
change. Other owners are never stopped implicitly.

`disconnectResource(target,reason)` requires a current exact invocation target,
or the current owner/binding/generation only when idle. A stale invocation cannot
disconnect the new job. `rebindResource(binding,{verified:true,evidenceRef})`
requires a never-used resourceGeneration and no queued/active operation.
`inspect()` exposes result acceptance, originalTerminal, stopAcknowledged,
calculationStopped, resourceReleased and reusable separately.

## Artifact package

`writeArtifactPackage(manifest,assets,sink)` and
`readArtifactPackage(source,registry)` use explicit async storage:

```js
const receipt = await writeArtifactPackage(manifest, assets, {
  registry, write: async (relativePath,bytes) => saveToFreshFolder(relativePath,bytes),
});
const restored = await readArtifactPackage({
  read: async relativePath => readOwnedBytesOrNull(relativePath),
}, registry);
```

`assets` is Map<safe relative path,Uint8Array>. Sink writes to a fresh destination;
in-place atomic overwrite is not promised. Persisted manifest conforms to
`contracts/package.schema.json`. Every artifact binds required native,
descriptor, evidence, trace, snapshot and extensions files. `files` holds
kind/required/actual byteLength/whole-file SHA-256. The external receipt.json
holds canonical manifest hash; manifest and receipt cannot hash themselves.

`payloadBindings:[{ref,artifactId,nativePath,kind:'decoded-tensor-data'}]` is
required and resolves each descriptor native.payloadRef/tensor.dataRef to that
artifact's decoded native bytes. Optional `binaryBindings` contains
`{binaryRef,path,type,byteLength}` pointing to required attachment files.
Reserved binary markers anywhere in retained manifest/descriptor/sidecars must
resolve; missing references cannot yield complete. Multi-byte binary metadata
currently requires a little-endian host; unsupported hosts are rejected.

Evidence sidecar: `{schemaVersion:1,artifactId,records:[{evidenceId,data}],
absentReason?}`. Nonempty records preserve opaque original native evidence;
empty requires explicit absentReason and yields unverified.
Trace sidecar: `{schemaVersion:1,artifactId,records:[{traceId,data}],absentReason?}`.
Every descriptor transformTraceRef must resolve. Unsupported nativeResponseRef
is rejected; preserve native response JSON in record.data instead. Snapshot is
explicit null when absent, otherwise an M1 snapshot with verified self-excluded
hash. Extensions sidecar exactly retains descriptor extensions.

Registry codecs are explicit trusted public decoders:
`{codecId,codecVersion,sourceRef,decode(bytes)}`. No code is downloaded. Readback
checks all bytes/hashes, native codec, shape/meaning/metadata correspondence,
snapshot/trace/producer/decoder/frame information, required schemas and binary
closure. `record.native` remains codec output; `restoredNative` can add optional
metadata recovered from sidecars. Unknown optional data is preserved, unknown
required interpretation returns unverified. Native-only legacy input is
legacy-incomplete. `complete` certifies package integrity, not authenticity,
training-base compatibility, numeric restoration or generation readiness.

`canonicalize`, `canonicalBytes`, `sha256Bytes`, `hashCanonical` implement JCS
UTF-16 key ordering, UTF-8 and SHA-256 on the stricter artifact JSON profile.
Array order remains significant. Nonfinite/unsafe integer values, lone Unicode
surrogates, sparse arrays, runtime handles and extra array properties reject;
use decimal strings for integers outside the safe range. No Unicode normalization.

## Diagnostic snapshot transactions

```js
import {createSnapshotManager} from './snapshot.mjs';
const manager = createSnapshotManager({managerSessionId,registry});
const token = await manager.stageSnapshot(profile,bindings);
const published = await manager.publishSnapshot(token,{currentBindings});
```

Bindings explicitly include `snapshotId`, increasing `managerRevision`,
`artifactManifestRef`, `evidenceManifestRef`,
`requestedScope:{kind:'diagnostic',scopeId}` and each finite step. Each step binds
`stepId/moduleId/operationId/moduleVersion`, full `sourceRef`, `nativeBuild`,
`implementationState:'implemented'`, native/artifact/model/adapter references,
`localRevisionBindings`, `resourceBinding:{ownerId,bindingId,resourceGeneration}`,
`isCurrent()` and its owner facade. Operation must match the selected profile.
Selected M2 `edges`, if supplied, must satisfy all required diagnostic scopes.
`currentBindings` maps each step ID to explicitly observed local revisions and
resource binding, compared again before publication.
Accepting a newer requested manager revision invalidates the old selection even
if the new profile/operation is rejected before native preparation. Retry uses a
newer revision. Artifact references identify the selected immutable artifacts;
this coordinator does not read or certify the referenced manifest files.

Owner callbacks are local capabilities, not cloned handles:

- `prepare(context)` returns `{candidate,previousSessionReleased}`.
- `validate(candidate,context)` returns `{valid:true,target:context.target,snapshotId,stepId,operationId,
  scope,coverage:'PARTIAL'|'FULL',sourceRef,nativeBuild,evidenceRefs}`.
- `commit(candidate,context)` returns `{target:context.target,state:'STAGED'|'CONSUMER_APPLIED',
  ownership:{kind:'independent-copy'|'lease',ownerId,isValid?}}`.
- `rollback(candidate,context)` and optional `reload(previousSnapshot,context)`
  explicitly confirm `{restored:true}`; `release(candidate,context)` confirms
  `{released:true}` for that owner's candidate resources. Owner cleanup/reload
  must be safe for explicitly retried recovery and must not alter newer resources.

Context binds source/build, operation, step, snapshot/hash, manager session/revision,
local revisions, resource generation and currentness. A transferred consumer owner
requires `allowedConsumerOwners` in the step binding; lease validity is rechecked
after all commits and on `inspect()`. Manager publication is separate from native
STAGED/CONSUMER_APPLIED. The M1 snapshot hash excludes its own field. Historical
`active` metadata can remain after a failed new selection; `selectionCurrent`
reports whether it still matches all current owners/revisions/leases.
The owner facade verifies the completed native transaction before attesting the
immutable `context.target`; it must not merely decorate an unrelated old reply.
The target includes snapshot ID/hash, manager session/revision, step/operation,
resource binding and local revisions, and both validation and commit compare it
exactly. Snapshot IDs are never reused within this manager.

`abortSnapshot(token)` rolls back only that stage. Cleanup is serialized with new
transactions. Failed rollback/reload/release retains recovery and blocks new
transactions until explicit `recover()` succeeds. Replacing a publication retires
old candidate references by release only. If retirement fails, the new publication
remains published with `cleanupRequired:true` and `RECOVERY_REQUIRED`; it is not
rolled back. `dispose()` and recovery retain failed resources until owner-confirmed
release. Native session and Worker lifetime remains the owner's responsibility.

This implementation accepts diagnostic scopes only. `generationReady` always
remains false, including FULL diagnostic coverage. It does not claim E8/E9
generation acceptance. An empty adapter selection needs no LoRA-specific fields.

## Bounded artifact cache

Import `buildArtifactCacheKey` and `createArtifactCache` from `cache.mjs`.
Key version: `works-artifact-cache/1.0-draft.1`. Explicit dimensions are
`modules` (module/native/build/full-source pins), `modelBindings`,
`tokenizerBindings`, `profileRef`, `config`, `inputHashes`, nullable `maskHash`,
`context`, `adapterBindings` and unique revision `dependencies`. Unknown JSON
extensions, including an optional native LoRA selection, are retained and hashed.

`createArtifactCache({maxBytes,ownerId,release})` provides
`put({key,metadata,payload,ownership},readerState)`, `get(key,readerState)`,
`invalidateArtifacts({dependencyId,revision})`, `clear()`, `inspect()` and
`confirmReleased(key,{ownerId,entryId,evidenceRef})`. Reader state explicitly
supplies `readerOwnerId`, `revisionBindings`, `leases`. Copy ownership retains
independent compact bytes; immutable leases require explicit owner/holder/ID/revision
and current observations. Reads return copies. Shared/resizable/detached buffers
and duplicate lease adoption reject. No live module state is read implicitly.

LRU limits account for canonical metadata/key/ownership and retained binary bytes,
including a leased view's whole backing buffer. This is logical retention, not
process peak RAM. Invalidation affects only declared changed dependencies.
Owner release runs once per adopted entry. Failed release retains bytes/accounting;
explicit recovery proof must match the current entry identity so an old proof
cannot release a replacement. Cache ownership and native model ownership differ.
Leased recovery additionally supplies `proof.lease:{leaseId,leaseOwnerId,leaseRevision}`
matching the retained entry. Entry IDs include a cache-instance nonce so proof from
a disposed/recreated cache cannot match a new entry with the same owner and key.

## Reproduction and accepted scope

See `development/ai-connection/E-RESUME-RESULT.md` for current commands, acquired source
commits, logs and remaining edges. Native sources/models are not silently copied
from a different branch. Optional env-based native tests explicitly skip when
the pinned source has not been supplied; final validation used them with no skips.

PARTIAL, PREPARED, STAGED and published manager snapshot are distinct. E5 implements
diagnostic transactions and bounded cache with injected owner fixtures; production
native owner/resource acceptance remains a separate scope. No-LoRA/base paths
need only their selected scopes, not LoRA conditions.
No public deployment or model inference is performed by these new APIs.

## Fixed reference catalog and norm bindings (P0/P1)

`reference-loader.mjs` exports
`await loadReferenceSet({catalogBytes,files,expectedCatalogSha256})`.
`catalogBytes` and each `files:Map<registeredPath,Uint8Array>` value are actual
owned bytes. The caller pins the catalog digest; six required JSON documents are
checked against its lengths, SHA-256 digests, schemas and document versions.
The bundled original is document `1.0-draft.1` at source commit
`6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`, catalog digest
`14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c`.
Optional explanatory documents are not runtime dependencies. No URL, weight or
native module is implicitly loaded. Numerical rule text is retained as evidence,
never evaluated. The original `runtimeIntegrated:false` is preserved.

The frozen result has `catalog`, `catalogSha256`, `profileRecords`, `normRecords`,
`ruleRecords`, `numericalRules`, `contractRefs` and `integrityReceipts`.
Record collections are immutable Map-compatible views with `get/has/size`,
iteration and safe `forEach`; they are deliberately not mutable native Maps.
`isVerifiedReferenceSet(value)` accepts only successful loader results.

The existing `evaluateEdge` accepts optional `referenceContext`. Omitting it
retains the prior API. `norm-bindings.mjs` compiles finite comparison and evidence
requirements into that same evaluator's checks, scope validation and readiness;
it does not return a second compatibility decision. Unknown required contracts
are `UNVERIFIED`; known conflicts are `INCOMPATIBLE`; only existing explicitly
allowed, available versioned adapters can produce `NEEDS_ADAPTER`.

`referenceContext` is an external sidecar; it does not modify native descriptors:

- `referenceSet`, explicit nonempty `normIds`.
- `profileBindings:[{recordId,side,representation}]`, with `side` producer or
  consumer. Representations are `raw-latent`, `rgb-input-unit`, `rgb-decoder-raw`, `text-plain`, `text-ids`,
  `normalized-mean`, or an explicitly selected execution/loader declaration.
  Ambiguous `rgb` requires an explicit known native `meaning`; decoded raw RGB
  is never relabelled as unit input or implicitly transformed. Record IDs stay distinct from native profile IDs and ABI versions.
- `nativeDeclarations:{producer,consumer}` contains copied native declarations.
  Shape uses `nativeProfileId`, `modelSha256`, and Text `tokenizerSha256`;
  token-ID Text additionally declares exact `shape`. Mean normalization uses
  `normalizationRuleId`, `kernelABI`, optional `normalizationState` and loaded
  `kernelDigest`. Execution fields are the finite typed fields listed in
  `norm-bindings.mjs`, not free-form predicates. Unsupported required profile
  bindings remain `UNVERIFIED` (currently RGB affine, generated-sample and Text
  RMSNorm reference bindings; standalone native support is a separate fact).
  The selected `LOAD-COMFY-LINEAR-DIFF` also compares explicit `baseDtype:F32`,
  `outputDtype:F32` and `layout:'row-major'`. Missing declarations are
  `UNVERIFIED`; known conflicts are `INCOMPATIBLE`. No dtype conversion is
  performed by these comparisons.
- `adoptionSetId` selects an unchanged historical catalog entry. Alternatively
  `candidateSet` has schema `works-candidate-set/0.1-draft.1`, `status:'candidate'`,
  unique `candidateSetId`, fixed `sourceRef` and `modules:[{module,sourceRef,kernel?}]`.
  Each `identityBindings` entry declares `side`, `module`, `loadedSourceRef`,
  loaded `kernelDigest` and `byteLength` where a kernel is required. Actual owner
  adapters still enforce their own fixed source guards before execution.
- `numericRequirements:[{scope,recordId,gateRef,referenceRef,ownerSourceRef,kernelDigest}]`
  selects a numeric-execution or applied normalization record. Gate has
  `{sourceRef,sha256,gateId}`; reference has `{sourceRef,sha256}`. These are
  predeclared owner evidence identities, not manager-selected thresholds. Owner
  source must match the selected port and catalog source; kernel must match the
  explicit loaded declaration. Evidence needs the usual artifact/profile,
  both subjects, versions/builds/source commits and exact input shape/dtype plus
  `normBinding:{catalogSha256,...the exact numeric requirement}`. A shape record
  alone cannot stand in for a numeric execution profile. Missing only numeric
  gate/reference/receipt retains contract compatibility, returns `not-verified`
  for that scope and `blocked` readiness.
- `mapping` keeps the public owner factory/version, `duplicateMappingAllowed:false`,
  `regressionOnly:false`, native/connection registry hashes, full shape, selected
  region and source hash. `ownerBinding` and `planBinding` are explicit public
  owner receipts carrying those identities. Old management bridge is regression
  only and must not be stacked on this mapping route.
- `delegations` maps `N-TRANSACTION`, `N-ARTIFACT`, `N-EVIDENCE` to
  `{checker,receiptRef,target,receipt?}`. Checkers are existing `queue.mjs`/`snapshot.mjs`,
  `package.mjs`, and `owner-validation`, respectively. Evidence scope is
  `norm:<normId>` and carries the exact `delegation` plus catalog `normBinding`.
  Transaction compares the current explicit `managerState.target` (manager
  session/revision, resource/native revision bindings, and request or snapshot
  ID). Artifact compares this edge's artifact/profile; the original package
  receipt retains native-file/manifest digests. Package delegation additionally
  supplies the actual E4 `receipt`, equal evidence `packageReceipt`, and an
  evidence ID equal to `receiptRef`; target labels alone cannot replace it. Evidence compares explicit
  `evidenceTarget` and observed `inputConditions` coverage/scope/base/reference.
  These sidecars link results of existing checks; they neither rehash packages
  nor execute another transaction. An unresolved receipt is not a validation
  pass merely because its desired target is repeated in JSON.
- `legacy` requires actual-initializer/FULL/legacy-boolean. `generation` is a
  separate dynamic admission input: native READY, FULL full-model-session and
  accepted full-session/resource evidence are all required. No-LoRA/base edges
  need only their explicitly selected norms. Unknown `requiredFeatures` block
  the dependent edge; opaque optional metadata is retained.

`EdgeDecision.referenceTrace` records catalog identity, applied norm IDs, profile
and source references, integrity receipts, delegated checks, evidence references
and the uppercase classification mapping. Existing `validation` remains
`pass/fail/not-verified`; readiness remains `ready/blocked/failed`.
Caller-supplied evidence is a trust boundary, as in the original evaluator:
structural binding is not authentication of an invented owner result. Use actual
owner/checker receipts and the source-byte guards in the supplied runners.

See `development/ai-connection/reference-adoption/` for source mappings, candidate
pins, scoped results, reproducible commands and unaccepted dependent edges.

## Native LoRA diagnostic snapshot candidate (P3)

`adapters/adopted-lora.mjs` retains `createAdoptedLoraAdapter` and its original
0c/438 source guard. The separate `createCandidateAdoptedLoraAdapter` has version
`works-candidate-adopted-lora/0.1-draft.1`, pins LoRA
`fc2789a0f649e33f15eb13750e6a983b5c52d170` and Diffusion
`5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`, and requires the same actually verified
5,051-byte LoRA kernel. Identical file hashes do not erase different commits.
Both use the public owner factory; no offset mapping or model math is duplicated.

`openStage(prepared,validation,{target,isCurrent,signal?})` exposes a finite
transaction capability: `checkpoint`, `completion`, `commit()`, `abort(reason?)`,
`rollback()`. The original public SDK `stage` reaches native validation, then
waits at its public target's commit callback. `commit()` grants permission and
awaits the original terminal promise; it does not dispatch a second stage.
`cancelCurrent(exactManagerTarget)` calls public SDK cancellation only for that
facade's exact currently active invocation. All SDK/source/consumer lifetimes
remain owned by their existing owners. Unconfirmed restoration retains recovery.

`adapters/snapshot-native-lora.mjs` exports
`createSnapshotNativeLoraOwner({adapter,plan,planTarget,validation,resourceBinding,queue,requestPrefix})`.
It returns the injected snapshot owner's `prepare/validate/commit/rollback/release`
capabilities, plus `acceptOwnership/published` and explicit queue callbacks
`cancelInvocation/afterInvocation/releaseInvocation`. Configure the existing
queue's resource callbacks to call these methods, retaining the exact queue
target. `invocationTarget(candidate)` and `inspect(candidate)` expose only the
outer record for that exact opaque candidate. The original native candidates,
registry pair, validation, stage envelope and ownership IDs remain intact.

Prepare registers an opaque candidate before awaiting the native preparation;
validate awaits its actual checkpoint. This lets snapshot recovery reach a
failed native prepare's retained resources. Commit opens that same invocation's
gate and awaits its queue/native terminal barrier. Manager publication is
separate from SDK `CONSUMER_APPLIED`. After all commits and publication,
`published` finalizes native rollback history and releases the prepared package.
Before publication, failure rolls back the exact original public native target.
Unknown native restoration is never converted into a successful rollback.

The existing snapshot manager adds optional owner hooks:
`acceptOwnership(candidate,receipt,context)` verifies a dynamically assigned copy
owner when it is absent from the static allowed-owner list; exact target,
state/kind and currentness checks still apply. It does not rename that owner.
`published(candidate,context)->{published:true}` runs after publication. A failed
hook blocks reuse with `RECOVERY_REQUIRED`; recovery retries unfinished hooks
and retirement. Disposal retains a failed publication hook's exact candidate.
Owners without these hooks retain the previous behavior.

`createManagedDiagnosticPackage` accepts the separate exact candidate envelope
and optional `snapshot` with its explicit published owner `snapshotTarget`. A provided snapshot must bind the actual manager
session/revision, scope, operation/step, native local revisions, resource, SDK source and kernel build.
E4 retains and validates its real sidecar/hash using the existing package reader.
Native `snapshotPublished:false` stays unchanged; manager snapshot ID/hash are
separate trace fields. Omitting `snapshot` retains the original null sidecar.
PARTIAL, STAGED, published diagnostic snapshot and a complete package never
authorize production generation; `generationReady` remains false.

## Required norm inputs and evidence phases

`evaluateEdge` additionally accepts `requiredNormPolicy:{policyId,requiredNormIds}`.
When supplied, omitted/unverified `referenceContext`, a missing required norm or
an unknown/missing `referenceContext.phase` produces `UNVERIFIED` and blocks
admission. The unchanged standalone form remains available; it is not proof that
a norm-required native entry executed its checks.

Phases are `declaration`, `validated`, `published`. Contract checks run in every
phase. Numeric/normalization/evidence receipts become due at `validated`;
transaction/package receipts become due at `published`. Earlier phases return
`result:'not-verified', pending:true, duePhase` with empty evidence references
for a future scope, even if plausible success/failure JSON is already present.
`referenceTrace.pendingScopeRefs` records these scopes. A missing predeclared
numeric gate/reference/owner/kernel still blocks declaration admission while
retaining the contract-based compatibility result.

Readiness in a phased decision applies only to the requested phase. A ready
declaration allows the declared operation to begin; it is neither numerical
acceptance nor generation readiness. The trace always preserves
`generationReady:false`. Without an explicit phase, legacy evaluation still
checks all required scopes as before.

`norm-execution.mjs` composes the same evaluator inputs under known fixed
policies, captures declarations before asynchronous owner work and controls
phase order. Mandatory entry wrappers own that helper and obtain observations
from their actual public native callbacks. They reject caller-supplied future
receipts and do not expose a public unguarded dispatch method. Model arithmetic,
native transaction execution, package hashing and queue cancellation remain in
their existing owners and implementations.

`createNormExecution({policyId,referenceSet,edgeInput})` uses a known fixed policy
(`lora-q16`, `rect-decode`, or the separate mean policy). `edgeInput.evidence`
must initially be empty; phase/policy fields and future receipt references are
owned by the entry. Declaration values, gates, reference identities, selected
binding IDs/namespaces/expected revisions and evidence scope stay immutable.
Only current observations refresh. A failed validation poisons that execution;
a later PASS cannot rescue its cohort. Publication recovery rechecks the same
retained receipt, without repeating native commit/rollback. Reserved `norm:`
scopes cannot be used as numeric scope names to postpone a numeric failure.

`adapters/norm-required-lora.mjs` exports
`createNormRequiredLoraExecution({adapter,referenceSet,edgeInput,readCurrent,readOwnerEvidence})`.
Construction and `plan(input,{target})` check declaration admission before the
original candidate facade's plan. The original opaque plan is returned.
`createSnapshotOwner({plan,validation,resourceBinding,queue,requestPrefix})`
wraps the existing owner and checks the actual validate checkpoint before the
commit gate. `validation` contains finite owned F32 `x[5120]`, `expected[16]`
and the predeclared tolerance; its expected payload hash is checked before
native prepare. The single Q16 requirement's `referenceRef` includes
`expectedOutputSha256`; `gateRef` includes the original `tolerance`.
`referenceContext.environment` and `evidenceTarget` declare the PARTIAL
diagnostic scope/base/reference before the call. `readCurrent` supplies explicit
live `activeBindings` and `resourceState`. `readOwnerEvidence` is mandatory and
runs only after actual native validation; it supplies the independent selected
weight/bias comparison receipt. The manager checks its binding, count, scope
and reference, and does not perform those numerical comparisons itself.

The returned owner has an automatic `afterPublication` audit. The snapshot
coordinator invokes this only after all native commits, publication finalizers
and previous retirement succeed. Its private-branded global context carries
the actual publication, step receipts and a published-selection predicate;
lookalike JSON cannot act as that capability. Audit failure retains the published
fact and enters `RECOVERY_REQUIRED`. Normal recovery only rechecks the retained
audit. Disposal can still finish owner finalizers/releases when the selection
is permanently stale; disposal does not grant norm acceptance.

`adapters/norm-required-rect.mjs` exports
`createNormRequiredRectAdapter({nativeFactory,descriptor,binding,sourceVerified,artifactStore,ownerLifecycle,executionScope})`.
Its required `run` inputs are a verified reference set, predeclared RGB-output
`edgeInput`, raw Rect mean `inputHandle`, prior encode/mean evidence,
`manifest`, explicit three-file `files:Map`, exact `target`, `readCurrent`,
predeclared `validationSpec`, owner `validateOutput` and E4 `publishOutput`.
`priorInputEvidence` binds an exact `sourceRef`, `modelSha256`, `profileId`,
`context`, `inputPayloadSha256` and `restoredPayloadSha256` to the owned mean.
The separate `encodePayloadSha256` retains the original encode evidence;
restoration is not relabeled as a fresh encode. The owner reference has a
fixed SHA-256 and `atol`, `rtol`, `maxAbs` gates of `2e-5` for all 1536 RGB values.
`target.managerRevision` and `target.localRevisionBindings.localRevision` are
independent; native invoke/cancel uses the latter. `cancel(target)` matches the
exact request/resource/token. The current selection is checked around each
await, validation, publication and storage capability; cancellation or disposal
after native completion still prevents stale adoption. Failed save output
handles are released; partial file/progress receipts stay available as
unadopted evidence. Successful output handles remain caller-owned.

Rect requires only `decoder-body.onnx`, `conv2-weight.f32`, `conv2-bias.f32`
(286,314,451 bytes). Existing encode evidence is reused. No encoder re-export or
encode invocation is required. Native worker stop/terminal/release proof belongs
to the injected owner lifecycle; a cancel boolean alone is insufficient.
Native source/file hashing and actual private assets are required for a real
dispatch claim. Controlled native callbacks test this boundary only.
