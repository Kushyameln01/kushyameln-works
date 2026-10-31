# AI connection API — E0 / E1 / E2 / E3 / E4 / E5

Common contract: `works-module-contract/1.0-draft.1` (existing M1/M2 reused).
Package contract: `works-artifact-package/1.0-draft.1`.
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
