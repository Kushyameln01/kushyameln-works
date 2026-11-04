# Full-model completed-F32 weight connection

This extension uses the existing `diffusion-models/0.1` public owner and dedicated
Worker. It adds `openWeightFeed`; it does not change the tensor, scheduler,
generated-sample restoration, thread admission, or normal numerical validation
contracts. Native numerical acceptance and whole-model real-LoRA acceptance are
separate from the connection implemented here.

## Ordinary same-page use

```js
import {
  createDiffusionModels, createDiffusionWeightClient,
  PROTOCOL_VERSION, BUILD_ID
} from './index.mjs';

const api = createDiffusionModels();
let revision = 0;
async function request(op, input) {
  const reply = await api.request({
    protocolVersion: PROTOCOL_VERSION, buildId: BUILD_ID,
    sessionId: api.sessionId, jobId: crypto.randomUUID(),
    inputRevision: ++revision, op, input
  });
  if (reply.status !== 'ok') throw Object.assign(Error(reply.error.message), reply.error);
  return reply.result;
}

const loaded = await request('load', {
  files: {HIGH, LOW}, resource: {wasmThreads: 1}
});
const opened = await request('openWeightFeed', {
  side: 'HIGH', modelSessionId: loaded.modelSessionId
});
const weights = await createDiffusionWeightClient({
  port: opened.port, binding: opened.binding
});
const controller = new AbortController(), signal = controller.signal;

// createLoraStandalone and its kernel belong to the LoRA owner; Diffusion does
// not implement low-rank products or a second logical-name mapping.
const lora = createLoraStandalone({
  registry: await weights.consumer.describe(),
  baseProvider: weights.baseProvider, kernel: loraKernel
});
// Register/prepare the caller-owned sources through the LoRA owner's API.
// await lora.stage(prepared, weights.consumer, {signal, isCurrent});

const baseIdentity = await weights.baseProvider.describe();
// A read returns independently owned F32 and never modifies the immutable base.
const block = await weights.baseProvider.readBlock(
  'blocks.0.cross_attn.q.weight', 0, 5120,
  {...baseIdentity, fullShape: [5120, 5120], signal}
);

// Existing predict/sample calls consume the active completed-F32 epoch through
// their real reader/operator bindings. They accept no package callbacks.
// await request('sample', canonicalSavedInput);

await weights.clear();        // switch to immutable base, no subtraction
await lora.dispose();         // caller-owned LoRA sources/kernel remain its owner
await weights.dispose();     // clear and release this connection's candidates
await request('unload', {});
api.dispose();
```

For LOW, open a separate explicitly bound port. HIGH and LOW packages are never
silently combined. `resource.wasmThreads` defaults to 1. Explicit 4 requires real
cross-origin isolation and SharedArrayBuffer; no fallback is performed.

`attachDiffusionPort` transfers the returned `result.port` over an explicitly
supplied outer MessagePort. The same `createDiffusionWeightClient` then works in
the receiving realm. There are no global window listeners and no function cloning.

## Public and native contracts

`openWeightFeed` input is `{side:'HIGH'|'LOW', modelSessionId?}`. Output contains
`port:MessagePort`, `protocol:'diffusion-weight-port/1'`,
`binding:{side,modelSessionId,modelEpoch}`, and the native feed descriptor. A
stale model-session request is rejected before a port is created.

The host helper returns `describe`, `baseProvider`, `consumer`, `clear`, `stats`,
`dispose`, `isValid`, synchronous cleanup `inspect`, and the connection `binding`.

* `baseProvider.describe()` returns the immutable model/side/registry/header/file
  and FP8 decode identities. `readBlock(weightId,offset,count,context)` requires
  matching modelHash, side, registryHash, fullShape and optional AbortSignal.
* `consumer` implements `lora-standalone/1.0-draft.1`: `describe`, `prepareLoad`,
  `validate`, `commit`, `rollback`, `releaseCandidate`, `currentEpoch`. Candidate
  objects are local authority, valid only for this connection. The package has
  `describe/readBlock/retain/isValid/release`; its functions remain at its owner.
* Normal validation checks mapping, declared ranges, complete package identity,
  finite F32, transaction consistency and every declared selected value. It does
  not require an independent output, gate, fixed fixture hash or numeric receipt.
* Logical registry source is fixed LoRA
  `6d0c8df4cd4992f26745d2d26394f5e194d2567f`. Its 1053 rank-1/2 logical targets
  bind actual native readers/operators. The native 1095-target descriptor keeps
  rank-3 modulation and rank-5 patch convolution base-only.
* Immutable FP8/F16 storage is decoded by the original Hike source to F32. The
  LoRA package supplies already-completed F32 weight/bias. Diffusion performs no
  low-rank product and no implicit LoRA-side FP8 storage conversion.

Each predict holds its selected side's epoch until terminal cleanup. A sample
holds both side epochs from admission through all HIGH3/LOW3 updates and final
raw restoration. Commit and clear reject `WEIGHT_OPERATION_ACTIVE` during those
holds. Old ordinary read leases retain their previous package independently.
Execution metadata reports `effectiveWeights[side]={epoch,packageHash}`; saved
tensor metadata does not become a live package or model-session handle.

## Ownership, cancellation and resource bounds

The host retains an independent completed-package capability before preparation.
The Worker uses synchronous local reference capabilities over that host lease.
Reads and final release travel through the explicit duplex port. Nested package
reads may call `baseProvider` while the Worker waits: they never reenter the
global inference request queue. Native base reads are serialized by the feed.

The transport accepts at most 1,048,576 F32 elements per block, with at most 16
pending/incoming calls per endpoint. Native reads remain capped at 81,920 elements
and at most 16 rows; the provider splits larger legal row-aligned reads. These
limits do not change pointwise or mean-profile limits. Requests, replies and the
main-realm lifecycle relay copy bounded blocks. The block is also copied when
validating owned F32. These are additional host spans, not a zero-copy claim or
proof of a production memory budget; no complete weight package is materialized.

Per-call AbortSignal sends cancellation and aborts the corresponding remote call.
Rollback/release remain available after that signal is cancelled. A candidate
not admitted by normal validation cannot commit. A failed cleanup remains a
native cleanup obligation and is visible in model resource status.

`clear` and `dispose` during an active model operation reject rather than switch
its weights. Retry after that operation reaches terminal. `dispose` clears active
weights, releases its candidates, closes the port and releases host package
leases. Public cancellation, unload, reload or API disposal invalidates every
associated port, rejects pending calls and releases retained host capabilities.
Worker termination still requires the existing model reload. Another module's
owned LoRA source/kernel is not disposed by Diffusion.

A failed asynchronous host package release remains retained in the client.
`inspect().cleanupRequired` and `retainedPackages` report that local obligation;
`dispose()` waits for in-progress release and retries failed release even after
the port is closed. Disposal does not silently succeed while that cleanup fails.
An unadopted preparation reply is cancelled by its package identity and its
native candidate is rolled back/released. Cleanup can use its original candidate
after admission cancellation; it cannot activate a new candidate.

Unexpected loss of a connection that owns the active package marks the native
model owner as cleanup-required; unload is required before another execution.
The synchronous client `currentEpoch()` is its last observed native epoch, updated
by every reply before caller admission is rechecked; native transaction and
operation guards remain authoritative. Mutation attempts conservatively invalidate
older client ownership receipts, including ambiguous cancelled replies. Receipt
metadata cannot be edited to revive old ownership.

## Verification and limits

```bash
node docs/shared/diffusion-models/api/test/weight-port.test.mjs
node docs/shared/diffusion-models/api/test/model-host.test.mjs
node --experimental-test-module-mocks docs/shared/diffusion-models/api/test/model-adapter.test.mjs
node docs/shared/diffusion-models/execution/test-model-sampler-candidate.mjs
```

The transport tests use the real full-model feed over synthetic conforming
completed F32 and immutable-base reader fixtures. They cover nested reads,
weight/bias consumption, normal validation, epoch guards, removal, old leases,
finite/range/binding rejection, aborted admission cleanup and session closure.
Host/adapter tests explicitly use control doubles. Sampler admission tests use
real Hike and header-only immutable model fixtures; they do not run a neural
model. These are not real-LoRA full-model inference, original-target generation,
management whole-operation, merge or Pages-publication acceptance.
