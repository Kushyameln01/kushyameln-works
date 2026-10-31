# AI connection API — E0 / E2 / E3 / E4

Common contract: `works-module-contract/1.0-draft.1` (existing M1/M2 reused).
Package contract: `works-artifact-package/1.0-draft.1`.
Sources: integration specification **1.1-draft.1**, execution plan **0.2-draft.1**,
read from their current Pages and both attachments on 2026-10-31 JST.
See `development/ai-connection/E0-SOURCE-BASELINE.md` for acquisition receipts.

No native API, numerical kernel, codec, model, precision or output condition is
changed. These ES modules import no inference runtime. Clients, resource owners,
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
boundaries are tested; Diffusion902 original 0.1 schedule/Euler run real Hike in
Chromium. **f522d9a remains unavailable**, so the new F32/PARTIAL consumer edge
is UNVERIFIED. Original 0.1 is not substituted for that new consumer.

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

## Reproduction and accepted scope

See `development/ai-connection/E-RESULT.md` for complete commands, acquired source
commits, logs and remaining edges. Native sources/models are not silently copied
from a different branch. Optional env-based native tests explicitly skip when
the pinned source has not been supplied; final validation used them with no skips.

PARTIAL, PREPARED, STAGED and published manager snapshot are distinct. The E5
tests only prepare state gates; they implement no snapshot/cache publication
engine. No-LoRA/base paths need only their selected scopes, not LoRA conditions.
No public deployment or model inference is performed by these new APIs.
