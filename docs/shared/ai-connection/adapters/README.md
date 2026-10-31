# E2 external native adapters

These adapters reuse the M1 descriptors and M2 evaluator without importing a
native runtime. The initial transport is local direct ES-module calls. Owner
clients, source verification, revisions, stores and live resource bindings are
explicit inputs. No model parameters, meanings or native wire/build IDs change.

## Acquisition boundary

Text/VAE source **54bfeadbd83f1fea074c503c0e05ec478aba5cfb** was acquired and its
source closure verified. `createTextVaeAdapter` maps the actual public
`text_encoder`/`vae` module methods. Its source remains the native implementation.
The acquired G1C mapping documents exact sample/normalized meanings with `:v1`.

LoRA source **2bba90785292e42a0c7c8756685b0d8b128b2dcf** was initially unavailable through the connector, then acquired by direct Git with network permission. Exact sdk-v2 exports/signatures and original Hike were verified. Its actual plan/prepare/stage/release boundary is exercised using the owner's synthetic nonzero-base fixture, distinct from real LoRA/base joint acceptance. Diffusion core **9023329b8d803306abcdd9342f24c01ba0df2676** was also acquired; its original0.1 schedule/Euler execute real Hike in Chromium. Diffusion **f522d9aeff313558c4ef83022a340af9a4c21391** remains unavailable; the new F32/PARTIAL consumer edge is UNVERIFIED. No signature from that new consumer is invented. LoRA's tensor positional connected-payload mapping is still blocked; native weight/consumer arguments remain explicit local arguments.

`sourceVerified` defaults false. Setting it is an explicit caller assertion after
source/export receipt validation, not verification performed by this module.
Current production claims do not set it for the missing f522 source. A fixture can
set it for a synthetic client only and must retain that fixture scope.

## Public calls

`createModuleAdapter({kind, descriptor, nativeClient, artifactStore, binding,
sourceVerified, ...})` dispatches an explicit kind: `text-vae`, `diffusion`,
`lora-v2`. The three named factories are also exported. Text/VAE additionally
requires `module: 'text_encoder' | 'vae'`. The injected nativeClient is that
logical module's public object, not another module's private executor.

`adapter.invoke({requestId,operationId,input,localRevision,...})` returns a common
envelope with status, native correlation, result or native error. IDs are unique
for the adapter lifetime. No ID is injected into a direct native function that
does not accept it; correlation is retained outside. Native errors retain their
raw message; Text/VAE string errors get no invented native code. A busy owner,
unimplemented descriptor operation or unverified source does not dispatch.

For a connected tensor call pass `edge` (the full M2 inputs) and `inputHandle`.
The adapter re-evaluates readiness, requires consumer owner/binding to match its
binding, and restores the exact captured native tensor. The public handle is
bound to its original store/native/descriptor association; mixed references,
different stores, released data or mutated descriptors are rejected. Direct
standalone capability/configuration calls need no tensor edge.

Diffusion requires `binding.nativeSessionId` and `binding.inputRevision`, separate
from management session/localRevision. Native reply protocol/build/session/job/
revision/op are checked before accepting result; the full raw reply is retained.
Cancellation needs a supplied `cancelOwner(target)` callback using that owner's
actual API; no fictional cancel request is sent.

LoRA calls require explicit `nativeArguments` (local positional arguments) and
`nativeRevisionBinding:{sdkInstanceId,inputRevision,applicationRevision}`.
Functions, signals and native prepared handles stay local; they are not cloned
over a port. No HIGH/LOW case conversion, argument signature, opaque candidate
copy, next registry or returned local revision mapping is guessed from reports.

`adapter.cancel({requestId,localRevision})` only calls the owner for its currently
active matching request. An accepted cancellation is not terminal/release proof:
use E3's owner barrier. `adapter.dispose()` disposes the wrapper only and refuses
an active invocation; the resource owner must stop/release its native module.

## Lossless owned snapshots and persistence

`createOwnedArtifactStore()` owns copies and returns references. Call
`captureNativeTensor({tensor,response,descriptor,extensions?,store,registry?})`
with explicit semantic schema/profile/axes. It keeps original native tensor and
response separately, derives all ordered producer and decoder identities,
retains mask/Tokenizer/context and stores binary metadata as references. Native
strict context/latentContract receive no manager fields. Capture failure rolls
back allocations. `restoreNativeTensor(handle,store)` restores the original;
`releaseArtifactHandle(handle,store)` releases all owned snapshot references.

SharedArrayBuffer-backed snapshots are rejected until the owner first makes an ordinary owned copy.

Binary metadata uses the exact reserved three-field object
`{binaryRef,byteLength,type}`. `exportBinaryAssets(descriptor,store)` materializes
its exact view bytes for E4 required attachment bindings. An arbitrary optional
object merely having a field named binaryRef remains opaque. Bind every emitted
binaryRef in package.binaryBindings, and explicitly bind payload/data refs to
their native file through package.payloadBindings. Do not serialize TypedArrays
into giant tensor JSON. Package decoded native data and metadata restored from
sidecars remain distinguishable.

## Tested scope

`test-adapters.mjs`: owned data retention, ID/revision/error mapping, stale
cancellation, wrong replies, source/operation blocking, M2 rejection, association
integrity, capture rollback. Diffusion/LoRA clients here are declared fixtures.

`test-browser.py --native-root <verified54b-source-root>`: real Chromium,
acquired native codec and API capabilities/string errors, actual native
bindInferencePort host with a bounded fixture endpoint, binary recovery,
sender view detachment and caller input retention. This is a local source
mirror test, not public Pages or model inference acceptance.
