# Public model API / Worker adapter

The protocol remains `diffusion-models/0.1`. `load`, `predict`, and `sample`
now delegate to the existing actual Bernini model/sampler owner inside the
API's dedicated Worker. This connection does not establish new numerical
acceptance, original-shape support, production precision, or generation READY.
The execution descriptor and scoped numerical reports remain separate from
route availability.

Normal inputs contain no reference tensors, error gates, validation receipts,
diagnostic callbacks, or payload-hash compatibility conditions. Unknown input
fields are rejected. Model identity, tensor shape/dtype/layout/meaning,
normalization, context order, mask and finite-value checks are owned by the
existing numerical runtime. This adapter performs no numeric tensor conversion.

## Calls

Each operation uses the existing envelope containing `protocolVersion`,
`sessionId`, `jobId`, `inputRevision`, `op`, and `input`.

| Operation | Input | Result |
| --- | --- | --- |
| `load` | `{files:{HIGH:FileOrBlob,LOW:FileOrBlob},resource?:{wasmThreads:1|4}}` | `{loaded,modelSessionId,modelEpoch,models,profile,scheduler,resource,publicWorkerConnected:true,generationReady:false}` |
| `predict` | `{side:'HIGH'|'LOW',shapeRequest,tensors,conditioning,timestep,modelSessionId?}` | `{tensor,execution}`; native `float32` NCTHW flow velocity with meaning `bernini-flow-velocity:v1` |
| `sample` | `{shapeRequest,tensors?,noise,positive,negative,modelSessionId?}` | `{tensor,execution}`; raw generated sample with meaning `wan21-raw-generated-sample:v1` and restored `latentContract` |
| `unload` | `{}` | Awaited logical owner cleanup and final resource counters |
| `modelStatus` | `{}` | Current model session, state and optional native counters/description |
| `saveTensor` | `{tensor}` | `{bytes:Uint8Array,byteLength,sha256,metadata}` encoded by the canonical shared tensor codec |
| `readTensor` | `{file:FileOrBlob}` | `{tensor,byteLength,sha256}` decoded from actual supplied file bytes by that same codec |

`execution` contains operation, model session/epoch, actual numerical profile,
`publicWorkerConnected:true`, `generationReady:false`, and
`originalWorkflowAccepted:false`. These flags do not invent a new acceptance
scope. Diagnostic native run evidence is available separately through
`modelStatus.resources`; it is not required in a request or copied into every
normal output. `nativeCandidateDescription` preserves the internal candidate's
own profile/validation flags; route availability is reported by the adapter,
not inferred from those legacy description fields.

`load` requires the complete original HIGH/LOW pair so the same owner can switch
the `predict.side` and perform internal HIGH3→LOW3 sampling with shared sessions.
Loading while a pair is present returns `MODEL_ALREADY_LOADED`; call `unload`
first. `load` retains immutable files and prepares registries, decoder tables and
sessions; matrix payloads are staged when the existing runtime needs them.
Preparation is transactional. If preparation and its cleanup both fail,
`MODEL_PREPARATION_CLEANUP_FAILED` retains the cleanup capability;
`modelStatus.cleanupRequired` is true, numerical execution returns
`MODEL_CLEANUP_REQUIRED`, and `unload` may be retried. A failed ordinary unload
also retains the owner for retry.

The old `{file}` load form retains header inspection and returns `NOT_READY`
with `MODEL_PAIR_REQUIRED`; its legacy single-Memory inspection reasons are not
a judgment that the staged model cannot run. `inspect` remains header-only.
`predict`/`sample` without a prepared pair return `MODEL_NOT_LOADED`. An optional
`modelSessionId` rejects a stale runtime handle with `STALE_MODEL`; it is not a
tensor identity and is not serialized into saved tensors. Full-model preparation
and P4 preparation are mutually exclusive in one Worker. `releaseP4` is required
before full-model load, and `unload` before `prepareP4`.

`resource.wasmThreads` defaults to `1`. Explicit `4` requires a
cross-origin-isolated Worker with SharedArrayBuffer; otherwise loading returns
`UNSUPPORTED_RESOURCE_CONFIG` without falling back to one thread. Other thread
counts are unsupported. Every paired load starts in a fresh Worker after the
prepared-model/P4 conflict checks, so a previous ORT initialization cannot
silently determine the new profile. After a successful `unload` reply, the host
terminates that Worker realm before a later load. Predicting HIGH/LOW within the
same pair does not recreate the Worker. Four-thread execution is a resource
configuration, not acceptance of additional model shapes. GitHub Pages does not
acquire COOP/COEP headers from this adapter.

## Ownership, progress and cancellation

The host posts inputs without a transfer list, retaining caller tensors and File
ownership. Native owners then take their existing owned snapshots. Output tensor
buffers and encoded bytes are fresh owner outputs and are transferred back from
the Worker. The adapter does not rename raw generated samples to posterior mean,
apply another restoration, compact Text mask rows, or alter model/schedule rules.

```js
const loaded = await api.request(envelope('load', {files:{HIGH, LOW}}));
const modelSessionId = loaded.result.modelSessionId;
const result = await api.request(envelope('sample', {
  shapeRequest, tensors, noise, positive, negative, modelSessionId
}), {onProgress:event => console.log(event.result)});
const saved = await api.request(envelope('saveTensor', {
  tensor:result.result.tensor
}));
// Save saved.result.bytes to a real file, then select that file again:
const readback = await api.request(envelope('readTensor', {file:savedFile}));
await api.request(envelope('unload', {}));
api.dispose();
```

`onProgress` is an optional local observer outside the wire input. Events carry
the same request identity and `status:'progress'`; they never settle a request.
An observer cannot replace numeric output, and its exception does not strand the
active job. A cancellation or newer revision inside an observer prevents stale
events from reaching a replacement job. `subscribeProgress(listener)` returns
an unsubscribe function. `attachDiffusionPort(port, api, {progress:true})`
explicitly enables progress for requests sent through that port, and nothing
after detach. Its default remains terminal replies only. There is no global
window message listener.

The existing host cancellation rule is preserved: cancel terminates the owned
Worker, invalidates its model session, and returns no partial tensor. A retry
must call `load` again; both header/config preparation and model execution can
be retried in a new Worker. `unload` awaits numerical owner cleanup. `dispose`
terminates the Worker realm, including its shared ORT arena. Logical unload does
not promise immediate physical memory return before GC or realm termination.

Canonical save/read has a separate maximum encoded file size of 64 MiB and does
not borrow the 1,048,576-element pointwise limit or a posterior-mean profile.
Shared/noncompact save buffers are rejected. File byte length is checked before
reading. The shared codec preserves raw generated-sample provenance, normalization
state and producer models; runtime handles and diagnostic receipts are not
persistent tensor payload fields.

## Verification scope

The new Node tests exercise adapter state, rollback, ownership, codec, progress,
stale generations and port isolation. Module mocks and MockWorker are explicitly
non-numerical test doubles; they are not evidence of model inference. Numerical
and real public Worker acceptance is recorded by the separately source-pinned
browser runs. Run these lightweight checks with:

```sh
node --experimental-test-module-mocks --test --test-isolation=none \
  docs/shared/diffusion-models/api/test/model-adapter.test.mjs \
  docs/shared/diffusion-models/api/test/model-host.test.mjs
```
