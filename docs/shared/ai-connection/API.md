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

`evaluateEdge` additionally accepts
`requiredNormPolicy:{policyId,requiredNormIds,requiredProfileBindings?}`.
When supplied, omitted/unverified `referenceContext`, a missing required norm or
an unknown/missing `referenceContext.phase` produces `UNVERIFIED` and blocks
admission. The unchanged standalone form remains available; it is not proof that
a norm-required native entry executed its checks.

The fixed native-entry policies also select mandatory profile bindings. LoRA
requires the producer Comfy/local-source loaders and consumer Q16 execution
record. Rect decode requires the producer Rect RGB-decoder shape record.
Dropping a binding together with its declarations is `UNVERIFIED`; a selected
binding on a different side or with a conflicting representation is
`INCOMPATIBLE`. Duplicate required records are ambiguous and block admission.
These checks use the same evaluator and appear in `referenceTrace`; legacy
calls without that policy remain unchanged. The separate `rect-mean` helper
policy does not certify a native execution entrance.

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
weight/bias comparison receipt. The manager checks its binding, scope and
reference. The owner callback checks comparison counts and numerical values;
the manager does not repeat those comparisons.
Immediately before opening the native commit gate, the same retained validation
receipt is rechecked with explicit live bindings and resource readiness. This
does not repeat owner validation or numerical comparison.

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
Factory completion and configuration each recheck live bindings and RAM through
the same declaration evaluator before native decode can begin.

Rect requires only `decoder-body.onnx`, `conv2-weight.f32`, `conv2-bias.f32`
(286,314,451 bytes). Existing encode evidence is reused. No encoder re-export or
encode invocation is required. Native worker stop/terminal/release proof belongs
to the injected owner lifecycle; a cancel boolean alone is insufficient.
Native source/file hashing and actual private assets are required for a real
dispatch claim. Controlled native callbacks test this boundary only.

## Adopted WKTENSOR storage codec

The VAE owner supplied codec source
`2bdca59ea78580d4fe7a9d31a8de33209b64d029:docs/shared/inference/tensor.mjs`
(8256 bytes, SHA-256
`d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5`),
with distribution evidence
`d8a19f684f75fdf2f772d64754cba9d08b8f5c82`. Explicitly registering that
source in the package registry preserves a supplied valid normalized marker.
The format stays `WKTSR001/schemaVersion1`; no marker or numerical conversion is
inferred. Old writers still lose that marker and E4 rejects their mismatch.

The byte-exact owner implementation is bundled at
`codecs/tensor-2bdca59.mjs`. Management storage uses the shared factory:

```js
import {createAdoptedWktensorCodec} from './codecs/wktensor.mjs';
const codec = createAdoptedWktensorCodec();
const registry = {...schemaRegistry, codecs: [codec]};
const nativeBytes = await codec.encode(tensor);
// Use the same codecId/codecVersion/sourceRef in manifest.artifacts[].codec.
```

`verifyAdoptedWktensorSource(bytes)` checks the actual 8256 bytes and fixed SHA;
the deployment path and original owner sourceRef are distinct. Rect management
and the required Rect Node/browser routes use this codec for input decoding,
cache serialization and E4 writes/readback. Normalized intermediate packages
now preserve their marker and feed the restored owned tensor into the existing
owner restore operation. The old writer mismatch stays a scoped regression.

Both managed LoRA storage scenarios use this codec by default. Supplying the
existing `--codec-root` and `--codec-commit` pair explicitly retains external
codec injection and records that mode/source. The `legacy` LoRA scenario name
does not select an old storage codec. Generic package/diagnostic APIs still
require an explicit trusted codec; they do not silently load a replacement.

Native VAE855/Worker dependencies and historical codec pins stay unchanged.
New persistenceCodecSource/proof records identify the storage implementation
separately. Old unmarked WKT bytes remain readable, and historical package
readers retain their exact original codec registry. Storage adoption does not
certify native model decode, cancellation or production readiness. See
`development/ai-connection/codec-marker-adoption/ADOPTED-RESULT.md` for active
routes, evidence, compatibility and reproduction.

## Formal LoRA owner DATA phase bridge

`adapters/lora-data-phase-bridge.mjs` exports `createLoraDataPhaseBridge`.
This is the formal entry for the owner DATA contract fixed at
`82b21f09cb63926543181b16f0e97ebc6b9fa6be`. The two unchanged owner modules
are bundled under `adapters/lora-data/`. Their source-byte receipt and later
owner handoff evidence commit are separate from native SDK/adapter/kernel
`fc2789a0f649e33f15eb13750e6a983b5c52d170` and consumer
`5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`; those native pins are unchanged.

Before constructing the bridge, call
`verifyLoraAdmissionDataSources({admissionBytes,numericBytes})` on both delivered
source files. The returned runtime-branded proof is required as
`dataSourceVerification`; JSON or a cloned proof cannot substitute for it.

The constructor also requires `adapter`, verified `referenceSet`, immutable
predeclared `edgeInput`, `inspection`, `readCurrent`, `readWeightBiasEvidence`,
`consumerBinding`, `readConsumerBinding` and `readNativeRevisions`.
Use `.plan(input,{target})`, then
`.createSnapshotOwner({plan,validation,resourceBinding,queue,requestPrefix})`
with the existing snapshot coordinator. `.inspect()` retains the raw phase
inputs and management decisions. The inner native execution entry stays private.

`consumerBinding` has its own explicit namespace, revision, managerSessionId
and resourceBinding. `readNativeRevisions` supplies the observed native
`sdkInstanceId`, `localInputRevision` and `localApplicationRevision`, separately
from manager revision and outside-consumer revision. With the fixed native SDK,
management can retain the tuple returned by its public `plan` call; later plan,
cancel or disposal must update or invalidate that observation. An unavailable
observation blocks admission. It is never inferred from manager revision or
read from a native module's private state.

The phase mapping is ordered:

| Owner DATA | Actual management boundary | Required evidence |
| --- | --- | --- |
| `preflightInputs()` | after native plan/public binding, before prepare | Every patch and inspected source dtype; loader declarations plus actual observations, presence and origin paths |
| `checkpointInputs()` | after native validation, before commit | All 81920 selected weight values and 16 bias values independently compared; actual outer owner validation and exact snapshot target; `phaseBinding.bound:true` |
| `postpublicationInputs()` | after coordinator publication and owner cleanup | Branded current publication, actual step/receipt, independent-copy ownership, original queue terminal/release, prepared-resource release |

All compatibility decisions use existing `evaluateEdge`/norm guards. Missing
observations are `UNVERIFIED`; known conflicts are `INCOMPATIBLE`. A matching
contract with numerical evidence not yet due stays compatible and blocked.
The bridge retains owner raw DATA and enriches a separate management input with
predeclared environment/reference identities; it does not change the owner DATA,
recompute model values or invent a future receipt. Source storage precision
(FP8/F16) remains separate from prepared F32 dtype/layout.

Commit rechecks the explicit selection, resource generation, consumer binding
and native revisions. Publication uses a separate active published lifetime,
not the closed staging context. A publication audit failure retains the actual
`SNAPSHOT_PUBLISHED` fact and enters existing recovery; it cannot invent a
rollback after native finalization. No output16 diagnostic package is treated
as selected-weight `N-ARTIFACT` evidence.

The reproducible native joint control is documented in
`development/ai-connection/lora-data-bridge/REPRODUCE.md`. Its source/base are
synthetic; actual pinned SDK/Hike/ORT/consumer execution does not extend the
historical real-file numerical scope or admit a production model session.

## Fixed N2 self-attention tail

This is a separate candidate and direct ES entry, outside both Diffusion RPC
operations and the LoRA DATA bridge. Native execution source is
`a49aac492cc68e2dd6037e0deb4a6954731a847a`; distribution/handoff is
`beffdcb800b629d0b13ff43bbc90e9f74c659152`. The native API version stays
`diffusion-models/0.1`, the owner descriptor schema is
`bernini-self-attention-tail/0.1`, and the profile is
`bernini-block0-n2-self-attention-residual-f32-v1`. HIGH1 and LOW3 are separate
cases. Residual means self-attention-post token hidden; it is not a latent,
posterior mean or sample.

| Native array | F32 shape | Stored layout |
| --- | --- | --- |
| attention, patchHidden (inputs) | [2,5120] | LC |
| timeAct1 (input) | [5120] | C |
| o, gated, residual (outputs) | [2,5120] | LC |
| gateProjection, gate (outputs) | [5120] | C |

`verifyN2TailSource({files:Map})` verifies all 24 pinned accepted-execution
module/WASM/driver byte identities and returns a runtime-branded capability.
`N2_TAIL_FILES` lists exact repository-relative paths, lengths and SHA-256s.
Capture-source archive aliases and saved-output replay sources are recorded
separately. This proof authenticates source bytes, not an injected JavaScript
function's origin or numerical result. The supplied runner imports
`createSelfAttentionTail` from the same verified source root in the same realm.
A cloned/self-labelled capability cannot open the adapter.

The original catalog and all six original reference documents remain unchanged.
The candidate catalog is
`reference/candidates/n2-tail/catalog.v1.json`, fixed by
`N2_TAIL_CATALOG_REF` (SHA-256
`aa492b66fc3775b561bd6535290ebb5eabf7328039c47238e009996bd417943b`,
9589 bytes). It names parent catalog commit6dae/hash149783 explicitly, preserves
all old records and appends dedicated `N-N2-TAIL-SHAPE` and
`N-N2-TAIL-NUMERIC` records. Call `loadReferenceSet` with the explicit
`catalogPath`, actual catalog/file bytes and this external digest.
The default loader path and its existing behavior remain unchanged.
`describeN2TailDeclarations` builds immutable sidecars from explicit native
source/trusted/reference identities. Existing `evaluateEdge` remains the only
judge; missing required declarations/norm implementations are UNVERIFIED and
known conflicts are INCOMPATIBLE. Matching contracts without numerical receipts
stay COMPATIBLE / NOT_VERIFIED / BLOCKED outside phase-specific declarations.

```js
const adapter = createNormRequiredN2TailAdapter({
  nativeFactory: createSelfAttentionTail, verifiedSource,
  binding, artifactStore, readCurrent, validateOutput, publishOutput,
  executionScope: 'actual-fixed-n2-tail'
});
const result = await adapter.run({
  referenceSet, edgeInput, target,
  native: {file, side, trustedInputs, bridgeBytes, mathBytes},
  inputs: {attention, patchHidden, timeAct1},
  validationSpec, diagnosticBudget, signal, onProgress
});
```

The constructor requires explicit owner/session/binding/resource generation,
current-state reader, owned artifact store and owner validator. `publishOutput`
is optional; a selected N-ARTIFACT requirement still requires actual storage.
`target` has manager session/revision/request/token, independent
`localRevisionBindings` metadata and the exact resource binding. This native
owner has no request/revision or commit operation. The adapter never adds
manager fields to native constructor/run arguments and records
`snapshotPublished:false`; it does not invent a native/model-session commit.

The adapter snapshots inputs before queueing. It checks the actual descriptor,
three input hashes, all five output shapes/hashes and native kernel identities.
`trustedInputs` and `N2_TAIL_REFERENCE_REFS` fix the original prefix/attention
receipts, artifact/array hashes, side, block0 and HIGH1/LOW3 schedule. The real
native owner enforces the accepted exact input bits. Arbitrary inputs and LoRA
modified inputs cannot acquire these prior numerical receipts.
Control fixtures use an explicit different executionScope and never report
`actualNumericalAccepted:true`.

`validationSpec` fixes all eight owner comparisons (71680 values per side),
seven parameter checks, reference and original gates before dispatch.
`validateOutput` receives actual inputs/output, inputHashes, outputBinding,
target, full referenceRef/numericRequirement and this validationSpec. Its result
must bind the exact target, three input hashes, all five output hashes, full
side-specific referenceRef, unchanged gates/counts/scope, zero failed values
and `passed:true`. A bare boolean or stale receipt is insufficient. The runner
uses the fixed owner's `common.mjs:compare`; management adds no numerical engine.
Prior accepted output-file hashes are checked separately from a fresh run's
independent local/composed gate comparisons.

`cancel(target)` matches the exact manager target. Cancellation during factory
construction waits the original factory Promise, skips run and releases the
returned owner. Cancellation during run waits that original Promise's terminal
outcome before release. A late old result cannot be adopted. Native release
failure retains the owner/error recovery capability and quarantines the existing
queue. `recover(target)` retries release and ends that owner; it never restores
a reusable native instance. Then `rebind({resourceGeneration})` requires a new,
never-used generation and the next run must construct a fresh owner. An old
cancel cannot target the rebound generation.

`createN2TailOutputPublisher({storage,artifactRef,receiptRef,ownerId,...})` uses
the existing E4 writer/reader and adopted2bd codec. Here artifactRef is the
package base ID; predeclare the principal edge ID as `artifactRef+'#residual'`.
All five outputs become distinct artifacts, retaining name, LC/C shape, native
meaning, source, evidence, validation target and opaque extensions. Native F32
and storage `float32` are explicit metadata spellings of the same bits.
`readN2TailOutputPackage(storage)` verifies all five identities and actual
persisted bits. No automatic cache adoption occurs inside the publisher;
existing E5 may be used after admission with explicit current dependencies.
N2 cache numerical acceptance is not claimed by the storage fixture tests.

Require diagnosticBudget
`{scope:'n2-tail-diagnostic-only',tailHikeCapacityBytes:2883584,ortSharedMemoryCapacityBytes:16777216,maxReturnedOutputBytes:163840,maxElapsedMs}`,
with explicit positive maxElapsedMs. Deadline expiry aborts the operation and
still waits original terminal/release barriers. Known observed capacities and
returned extents must fit these limits. Historical Hike/ORT capacities are
tail-only observations; native `ORTMemoryBytes:null` stays null. The management
runner does not install a new independent Memory observer, so current ORT
Memory capacity/resource acceptance remains separate from numerical acceptance.
Host/GC/allocator/File backing/total peak and full pipeline budgets remain unknown.

`tools/ai-connection/run-norm-required-n2-tail.mjs` verifies source/public
receipts and explicit private asset paths before browser/native dispatch. It
serves only pinned public source over loopback; models enter as local File and
private arrays through CDP. Missing private payloads produce BLOCKED,
nativeCalls0, browserLaunchedfalse and numericalState NOT_VERIFIED. They do not
produce a numerical dry-run success. Retained-asset reproduction and current
unaccepted edges are in
`development/ai-connection/n2-tail-management/REPRODUCE.md` and `RESULT.md`.
Cross-attention, FFN, full blocks, real HIGH-to-LOW, production, arbitrary LoRA
and combined resource budgets stay outside acceptance. Throughout:
`generationReady:false`, `load/predict/sample=NOT_READY`.

### Reconciled holding-environment return

Management reconciled the return at
`508d72cc9036e7f500827465c644b4aed3c5f711` against executed management source
`5c484a8783ab129a2ff3543a98b2537af9888199` and native execution source
`a49aac492cc68e2dd6037e0deb4a6954731a847a`. The accepted scope is the two
independent fixed HIGH1/LOW3 numerical runs, five-output E4 persistence/readback
in the holding environment, and natural-completion terminal/release evidence.
See `development/ai-connection/n2-tail-management/acceptance/RESULT.md`.
Private payload retrieval or numerical rerun in the management environment is
not part of this acceptance. Actual cancellation/recovery faults were not
exercised in the returned successful runs.

The original result is retained unchanged with two disclosed metadata defects:
15 nested public receipt source hashes contain the stage digest, and the public
projection omitted trusted attention hash metadata. Record-level digests were
checked against fixed Git bytes; the attention supplement was independently
bound to fixed export/trusted metadata, actual artifact and input F32 hashes.
This is a documented reconciliation, not an edit of the original result.

The current writer now emits each public receipt's own nested digest and
preserves only the five exact pinned attention hashes inside a same-side
trustedInputs object. Activation arrays and unrecognized attention data remain
omitted. These metadata corrections do not change the historical execution
source, native pins, numerical gates or accepted scope, and are not a new
numerical run. ORT/total memory observations and production readiness remain
unverified with all NOT_READY flags unchanged.

### Joint P2/P3 receiver runners

The fixed N2 admission record is
`development/ai-connection/n2-tail-management/acceptance/ADMISSION.json`.
Its execution catalog, gate, all three inputs, five outputs per side and
reference identities are explicit. This does not expand the historical
HIGH1/LOW3 diagnostic scope or accept an arbitrary downstream module.

`tools/ai-connection/run-joint-rect-management.mjs` composes the existing
managed owner mean route with the mandatory Rect decode adapter. A common
`jointTraceId` and `currentInputLink` bind the newly written/read raw,
marked-normalized and restored E4 packages to the actual selected decode
input, source receipts, model, profile, context and queue release receipts.
Before each mean owner call, the existing `evaluateEdge` compares the static
input declaration without future receipts. Compatible but numerically pending
results authorize only this bounded diagnostic preparation; they do not clear
the blocked numerical acceptance or generation state.
The receiver rechecks this link before native dispatch. Historical encode
evidence remains separate; the historical received RGB is not a current
decode result. `decode` and `cancel-recover` require separate fresh outputs.
Missing decoder assets or current resource input cannot produce NN acceptance.

`tools/ai-connection/run-managed-lora-data-real.mjs` accepts one selected
light/HIGH local `.safetensors` File, the genuine bounded base JSON and
retained independent reference arrays. It uses the adopted formal82b DATA
bridge and the fixed owner adapter/provider. `managed-lora-data-real-declaration.mjs`
builds only outer declarations from actual public owner registries and the
selected source identity; it performs no native planning, mapping or arithmetic.
Declaration, validated and published phases receive their evidence in order.
The selected weight N-ARTIFACT scope and the separately saved consumer output16
package are distinct. Historical all20-case evidence is not a new transaction.

These are development receiver runners. Native APIs, codec and source pins,
product File input, queue/snapshot/cache/package implementations and existing
LoRA bridge scope are preserved. A matching contract with missing numerical
evidence remains COMPATIBLE, validation NOT_VERIFIED and readiness BLOCKED.
Unknown required contracts remain UNVERIFIED. Receiver source acquisition and
actual joint execution are separate receipts. Commands and pending edges are
in `development/ai-connection/p23-joint-acceptance/REPRODUCE.md` and `RESULT.md`.
`generationReady:false` and `load/predict/sample=NOT_READY` remain unchanged.

### P4 cross-attention/FFN receiver boundary (2026-11-02 JST)

`adapters/norm-required-p4-cross-ffn.mjs` adds
`createNormRequiredP4CrossFfnAdapter` around the existing independent owner.
It uses `evaluateEdge`, `createNormExecution`, the invocation queue and E4
persistence. Model arithmetic, storage decoding, projections, normalization,
attention, FFN, parameter identity checks and numerical comparison stay with
owner implementations. This path adds no model formula or LoRA layer mapping.

The fixed native profile is
`bernini-block0-n2-cross-ffn-f32-candidate-v1`. Execution source is
`5744f700e17b23d5c18d32315fb6dfbd7c49089a`, distribution is
`7ee36228030ba3bb544a90b1d4b528702a7bae32`, and
`27776abb234fc12733c600b1dabd2fdab70e27ae` is a separate metadata supplement.
`adapters/p4-cross-ffn/source.mjs` exports `P4_FILES`,
`verifyP4CrossFfnSource({files:Map})` and `isVerifiedP4CrossFfnSource`.
The verifier snapshots actual bytes before its first digest await and brands
only a successful proof. Its closure has 50 build sources plus one separately
pinned owner `common.mjs:compare` source. Build inventory count and additional
comparison source count remain distinct. A boolean or cloned proof cannot
open the adapter. Source verification does not authenticate an injected
function's origin, model payloads or a numerical result; the holding runner
imports the verified owner's ES functions from the same source root and realm.

The independent catalog is
`reference/candidates/p4-cross-ffn/catalog.v1.json`, pinned by `P4_CATALOG_REF`
(SHA-256 `e64e2e338b3a33ab2ea5521df652cb041a9d4033cec5da7e0f18d9c2373e023e`,
9601 bytes). Load its actual six registered files through `loadReferenceSet`
with the explicit catalogPath and external digest. It preserves the historical
parent records and adds `N-P4-SHAPE`, `N-P4-NUMERIC` and their shape/EXEC
records. The historical parent six files, old N2 candidate and accepted P2
contracts and pins remain unchanged.

`adapters/p4-cross-ffn/declarations.mjs` exports P4_PROFILE_ID, P4_POLICY_ID,
P4_SHAPE_RECORD_ID, P4_EXEC_RECORD_ID, P4_PINS, P4_CATALOG_REF, P4_OUTPUTS and
`p4OutputSpecs(textRows)`. The latter accepts integer L=1..512 and returns the
25 named dtype/shape/axes/semantic specifications. The raw native outputs have
no machine nativeMeaning strings. Saved wrappers explicitly use
`works:p4-output:<name>:f32`,
`meaningAuthority:'management-sidecar/owner-named-output'` and
`ownerNativeMeaning:null`. `blockOutput` is block0 hidden. It is not relabeled
Text hidden, VAE latent or a generated sample. `output` aliases blockOutput
and never becomes a 26th saved artifact.

```js
const edgeInput = prepareP4NormInputs({
  referenceSet, managerSourceRef, binding, target,
  conditioningMetadata, savedInputBindings,
  validationSpec, numericRequirement, resourceState, extensions
});
const adapter = createNormRequiredP4CrossFfnAdapter({
  nativeFactory, conditioningClone, conditioningSnapshot,
  conditioningMetadataBytes, verifiedSource, binding, artifactStore,
  executionScope: 'actual-native-text-p4'
});
const result = await adapter.run({
  referenceSet, edgeInput, target,
  inputs: {residual, timeAct1, conditioning}, readCurrent,
  diagnosticBudget, validationSpec, validateOutput, publishOutput,
  signal, onProgress
});
```

prepareP4NormInputs returns the owned edgeInput itself. Source/build/kernel
observations in binding are explicit inputs; missing observations remain null.
conditioningMetadata is a management JSON identity sidecar, separate from the
owner's recognized capture and raw native metadata. P4_TRUSTED_INPUTS fixes the
saved HIGH1/LOW3 residual/timeAct1 receipts and hashes. P4_CONDITIONING_CASES
keeps the L4 explicit fixture separate from the fixed f76 native Text packet,
including all 512 rows, mask positions, model, tokenizer and packet provenance.
The shape function's dynamic L range is not numerical or production acceptance.

The native conditioningClone, conditioningSnapshot and
conditioningMetadataBytes capabilities must come from the same fixed owner
module. The adapter clones a recognized capture synchronously before its first
await; structuredClone of a capture cannot preserve the owner's WeakMap brand.
The fifth input hash uses the owner's exact metadata encoding, not JCS as a
replacement. Residual and timeAct1 remain owned compact F32 arrays. The adapter
passes only `{residual,timeAct1,conditioning,signal,onProgress}` to owner.run.
`nativeFactory({target,signal})` is an outer management factory returning
`{owner,stats,dispose,recover}`. Its target/signal are not added to the native
source/feed/stage constructors. The holding bundle constructs original
source → feed → stage and releases stage → feed → original source.

The P4 policy requires identity, shape, numeric, evidence, transaction and
artifact norms. Declaration, actual validation and actual publication receive
evidence in that order. A prior owner PASS is a separate pre-existing input
cohort declaration; it is never current validated evidence. Unknown required
contracts are UNVERIFIED; known conflicts are INCOMPATIBLE. Matching contracts
with missing numerical references/gate/PASS remain
COMPATIBLE / NOT_VERIFIED / BLOCKED. There is no generated actual Text reference
or gate default. The known fixture gate and reference URI labels identify
exact existing owner source bytes as management sidecars. Native Text must
supply its own pre-execution gate source/hash/bytes and prior owner case, with
matching gate identity/values, reference, input cohort and parameter scope.
Native Text also declares management-sidecar comparisonModes in validationSpec
and the explicitly mapped priorOwnerPass. The supported forms are `['composed']` and
`['local','composed']`, in that order. They are not inferred from available files or added as
native API fields. Missing references for a declared mode keep acceptance
blocked. Undeclared mode metadata is preserved without implying comparison.
Fixture evidence cannot authorize a selected native Text mode after changing
labels or L.

`validateOutput` receives the exact target, five input hashes, 25-output binding,
referenceRef, numericRequirement and predeclared validationSpec. Its receipt
must bind all of them with the unchanged scope/gate/counts and zero failed
values. The holding runner calls the fixed owner common.compare for all 25 outputs
in each declared comparison mode: composed-only requires 25 comparisons,
local+composed requires 50. comparisonCount and total compared-value count bind
the 25 full output extents times the declared mode count; a missing local
reference does not create an extra requirement for a composed-only owner case.
The owner Python verify_parameter_identities function checks 29 selections. No fixture-only
runP4CrossFfn/compare_private execution is substituted for native Text.
`executionScope:'boundary-fixture'` supports controlled boundary validation
without reporting actual numerical acceptance.

`cancel(target)` requires the exact manager target. If construction is pending,
it waits the original factory Promise, skips native run and releases the owner
returned by that original Promise. Run cancellation waits the original run's
terminal outcome; it does not claim to interrupt an active ORT session.run.
Old results cannot be adopted after cancellation or revision change. Failed
release quarantines the retained owner. `recover(target)` retries cleanup and
retires that owner; `rebind({resourceGeneration})` then requires a fresh,
never-used generation and the next run must construct a new native owner.
`inspect()` exposes the retained lifecycle; `dispose()` reports any unresolved
recovery targets. No native model-session commit or current snapshot publication
is invented (`snapshotPublished:false`).

`adapters/p4-cross-ffn/package.mjs` exports
`createP4OutputPublisher({storage,artifactRef,receiptRef,ownerId,textRows,sourceRef,provenance,lineage,extensions})`
and `readP4OutputPackage(storage)`. artifactRef is the package base; the edge
principal is `artifactRef+'#blockOutput'`. The publisher uses the existing E4
writer/reader and adopted2bd codec, writes all 25 artifacts and rereads actual
storage before publication. It preserves evidence, trace, snapshots supplied
as sidecars, multiple producer provenance, input metadata and opaque JSON/binary
extensions. Unsupported non-JSON outer metadata rejects explicitly. Native
metadata graphs that cannot be represented as JSON retain the exact owner
encoding plus hash/length and an explicit opaque representation; that dependent
operational replay remains NOT_VERIFIED. This preservation is not a claim to
reconstruct native capture brands or replay a live owner.

The required diagnosticBudget has scope `p4-n2-diagnostic-only` and explicit
textRows, maxElapsedMs, maxReturnedOutputBytes, maxHikeCapacityBytes,
ortSharedMemoryCapacityBytes, maxRawWeightReadBytes and
maxDecodedWeightTileBytes. Read/tile ceilings are 163840/327680 bytes. Returned
extent is statically `4*(30720*L+198656)` bytes, including 63,709,184 bytes at
L512. Static output size, native capacities, cumulative copy traffic, observed
host RSS and unknown allocator/full-pipeline peak remain separate. L4 resource
observations do not authorize an L512 budget; unmeasured peaks stay null.

`tools/ai-connection/run-norm-required-p4-cross-ffn.mjs` exposes
preflightNormRequiredP4CrossFfn and runNormRequiredP4CrossFfn. Its CLI requires
`--native-root --assets --text --owner-case --diagnostic-budget --device-state
--out --manager-commit`, with optional `--source-git` for the local fixed Git
object checkout. It verifies native/source/codec identities, actual private
asset hashes, current device resource input and the complete management import
closure against the requested full manager commit before dispatch. Inputs and
fresh outputs stay outside repository source roots. It never fetches a model
or regenerates an oracle.

The CLI accepts the fixed native Text packet. Explicit fixture boundary cases
use `norm-required-p4-cross-ffn-browser.mjs:runP4HoldingCase` with their own
owner-provided inputs and references. The `works-p4-owner-case/0.1` document is
a management sidecar, not a claimed native API schema. It carries inputCohort,
norm.numericRequirement/validationSpec, actual priorPass source/hash/length
with explicit receipt JSON-pointer fieldMap, comparisonModes and the selected
private reference descriptors, gate source/fieldMap and the fixed owner
parameterProof export. Each selected reference descriptor carries an explicit
path, SHA-256, byteLength, arraysPointer and parameterIdentitiesPointer. The
cohort uses inputCohortPointer or an explicit inputBindingMap from owner-case
JSON pointers to actual owner-manifest fields; missing identities are not
inferred from filenames. For the actual 994 manifest vocabulary, arraysPointer
is `/arrays` and parameterIdentitiesPointer is `/parameterSources`. The explicit
inputBindingMap covers side, saved artifact SHA-256, and Text data/mask hashes,
shape, model, tokenizer and producer execution. Reference receipt
source/hash/length and private manifest payload hash/length remain separate
identities; the private manifest is not claimed as a public Git blob.

`kind:'owner-binary-f32-manifest'` reads the owner's existing manifest and all
25 sibling `<name>.f32` files without requiring a new export or JSON conversion.
The manifest's exact hash/length must match the declared reference payload;
each array entry must name its complete sibling file, `dtype:'float32'`, exact
L-dependent shape, byte extent and SHA-256. Slices, byteOffset and symlink
substitution are rejected. Files contain little-endian F32 values, retain their
actual bits through the private harness transport, and must be finite. The
fixed owner parameter checker consumes the manifest's parameter identities
and verifies all 29 selections; management adds no parameter arithmetic.
`kind:'management-json-f32-arrays'` remains an optional transport for an
owner-provided JSON payload with the same 25 named extents and bindings.
Only declared comparison modes are loaded. Transport support does not mean
that private reference arrays were received or that an actual P4 PASS exists.
The runner's emitted REPRODUCE.md and
`development/ai-connection/p4-management/REPRODUCE.md` document the descriptors
and cohort mapping. Missing prior/numerical context blocks before private
reference, saved-input or model IO. Null example fields are pending evidence.
Optional lifecycle fields select real progress/lifecycle
cancellation and recovery after an actual release failure; no fault is claimed
when none occurred. Recovery/rebind records whether a new owner run occurred.
Missing actual Text P4 prior PASS, independent references, gate, private assets
or explicit limits yields BLOCKED, nativeCalls0 and browserLaunchedfalse. A
source acquisition ACK or Text encoder/capture receipt cannot replace them.
Throughout this diagnostic boundary: generationReady:false and
load/predict/sample=NOT_READY.

### P3 added-boundary owner return

The existing `tools/ai-connection/run-managed-lora-data-real.mjs` receiver at
`8849891f19124df31847bd691503c2491278eaa8` closes the three added P3 boundaries
through the owner return distributed at
`a80db72feea60b9bd69e292e4716665c6f0ee77f`. The acquired source, receipt and
output16 bindings passed 182 management verification checks; see
`development/ai-connection/p4-management/p3-owner-return/ACCEPTANCE.json` and
`VERIFICATION.json`. The accepted scope remains selected light/HIGH Q16 PARTIAL.
The original dd95/28f/60d six-case evidence remains unchanged and separate from
this 884 execution. Native LoRA DATA, Diffusion, codec and current native APIs
are unchanged.

The owner saved the actual initial-one output16 through the existing E4
writer/reader and adopted2bd codec, then used fresh filesystem reads to verify
its bytes and actual snapshot. Changing bytes returned by a fresh reader
rejects with `ASSET_HASH_MISMATCH`; returning null for the snapshot sidecar
rejects with `REQUIRED_ASSET_MISSING`. These are reader-boundary negative
controls; physical copied negative directories are not claimed. The returned
private package payload readbacks are owner/independent-auditor observations,
while management's receipt acquisition and 186 checks are recorded separately.

The same formal bridge rejects a changed expected payload with
`NORM_REFERENCE_PAYLOAD_MISMATCH` before native prepare, with no corresponding
queue invocation. The focused negative regression in
`tools/ai-connection/test-lora-data-phase-bridge.mjs` is retained. Reproducing
this already supplied owner evidence does not require another local neural
execution. Serialized publication records do not recreate a live publication
brand. Selected-weight N-ARTIFACT, new P4 LoRA mapping/feed integration, other
pairs/sides, full-model sessions and generation remain outside this acceptance;
currentLiveAdmission:false, generationReady:false and
load/predict/sample=NOT_READY remain explicit.
