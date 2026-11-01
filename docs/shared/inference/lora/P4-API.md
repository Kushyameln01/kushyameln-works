# P4 canonical LoRA adapter API

`diffusion-p4-adapter.mjs` connects SDK v2 final-F32 patches to the separately owned P4 sparse weight feed. It adds the P4 mapping; the Q16 diagnostic adapter, SDK v1 and existing management bridge remain separate. This document specifies the interface. Actual original-base/operator numerical acceptance belongs to a separately pinned execution receipt; the control fixtures below do not establish it.

## Versions and identities

| Contract | Version / fixed identity |
| --- | --- |
| Adapter export `P4_ADAPTER_VERSION` | `lora-diffusion-p4-adapter/0.1-draft.1` |
| SDK connection `contractVersion` | `lora-connection/2.0-draft.1` |
| SDK `registry.registryVersion` | `lora-diffusion-p4-adapter/0.1-draft.1` |
| Native feed `registry().schemaVersion` | `bernini-p4-f32-feed-registry/0.1` |
| Native immutable source schema | `bernini-p4-original-weights/0.1` |
| Native validation receipt | `bernini-p4-f32-feed-validation/0.1` |
| Optional target `blockLimits.contractVersion` | `lora-block-limits/0.1-draft.1` |
| Native profile | `bernini-block0-n2-cross-ffn-f32-candidate-v1` |
| Native API source | `7ee36228030ba3bb544a90b1d4b528702a7bae32` |
| Dynamic linear graph SHA-256 | `9c3bbaf2488a763ab56a96a8f5ddfc65510bf197799ed83b9f6ead512cf7a52e` |

The native source is [weights.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs), with [source.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/ort-bridge/post-self-attention/source.mjs), [conditioning.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs) and [stage.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs). Those owner implementations are injected, not copied, clipped or rewritten here. The caller must verify the actual loaded source pins. A structurally matching registry is not a proof of the producer's code or raw model bytes.

The native and connection registry hashes are different canonical metadata identities. The adapter validates the native registry digest, fixed profile/graph/side/model/header/size identities, all original source entries, target descriptors, gate and resource limits, then builds the SDK registry. HIGH and LOW have separate model/header identities. `original.fullFileSHA256Verified:false` and `fullFileHashRecomputed:false` remain unchanged: the model hash is an expected original identity, not a newly computed whole-base hash. A file name or equal shape does not establish compatibility.

A current SDK containing the optional block-limits extension is required. Its changed source must receive its own full commit/hash; do not label changed SDK bytes as the historical `fc2789a0f649e33f15eb13750e6a983b5c52d170` SDK.

## Factory and caller-owned native resources

```js
import {createDiffusionP4Adapter} from './diffusion-p4-adapter.mjs';

const adapter = createDiffusionP4Adapter({
  consumer: feed,                    // actual native createP4WeightFeed result
  baseProvider: feed.baseProvider,   // default; immutable original F32 provider
  isOwnerCurrent: resourceCurrent,   // resource lifetime, not SDK generation
  cloneConditioning: cloneP4CapturedConditioning,
  run: async (candidateSource, input) => {
    const stage = await createPostSelfAttention({source: candidateSource});
    try { return await stage.run(input); }
    finally { await stage.dispose(); }
  }
});
```

`createP4WeightFeed`, `createPostSelfAttention` and `cloneP4CapturedConditioning` come from the fixed native owner source. The caller owns the feed, immutable source, SDK, injected Hike kernel and operator resources. This adapter has no dispose method and does not dispose them. Dispose the operator and wait for terminal work before disposing its feed/source.

The injected `run(source,input)` must execute the agreed operator over the provided candidate or captured active source. It receives only native input fields `residual`, `timeAct1`, `conditioning`, and `signal`. `isCurrent` is checked at the adapter/native transaction boundaries; it is not inserted into `stage.run` input. Native P4 rejects unknown input keys. A wrapper can add the native `onProgress` callback explicitly.

## Slots, coordinates and storage boundary

Every SDK target key is `diffusion_model.` plus the native `weightId` below. Each target keeps its full original shape. Native `binding.name` and `operatorBinding.programSlot` equal the native `weightId`; none is a graph initializer. Matrix slots use `runtime-input` and the owner's dynamic linear graph input `weight`. Bias slots use `hike-parameter`, the owner's `AddBias` export and parameter `bias`.

| Native weightId / binding.name | Full shape | Original storage | Actual execution binding | Native maximum rows per block |
| --- | --- | --- | --- | ---: |
| `blocks.0.cross_attn.q.weight` | `[5120,5120]` | `F8_E4M3` | runtime-input; dynamic linear `weight` | 16 |
| `blocks.0.cross_attn.q.bias` | `[5120]` | `F16` | hike-parameter; `AddBias.bias` | — |
| `blocks.0.cross_attn.k.weight` | `[5120,5120]` | `F8_E4M3` | runtime-input; dynamic linear `weight` | 16 |
| `blocks.0.cross_attn.k.bias` | `[5120]` | `F16` | hike-parameter; `AddBias.bias` | — |
| `blocks.0.cross_attn.v.weight` | `[5120,5120]` | `F8_E4M3` | runtime-input; dynamic linear `weight` | 16 |
| `blocks.0.cross_attn.v.bias` | `[5120]` | `F16` | hike-parameter; `AddBias.bias` | — |
| `blocks.0.cross_attn.o.weight` | `[5120,5120]` | `F16` | runtime-input; dynamic linear `weight` | 16 |
| `blocks.0.cross_attn.o.bias` | `[5120]` | `F16` | hike-parameter; `AddBias.bias` | — |
| `blocks.0.ffn.0.weight` | `[13824,5120]` | `F8_E4M3` | runtime-input; dynamic linear `weight` | 16 |
| `blocks.0.ffn.0.bias` | `[13824]` | `F16` | hike-parameter; `AddBias.bias` | — |
| `blocks.0.ffn.2.weight` | `[5120,13824]` | `F8_E4M3` | runtime-input; dynamic linear `weight` | 4 |
| `blocks.0.ffn.2.bias` | `[5120]` | `F16` | hike-parameter; `AddBias.bias` | — |
| `text_embedding.0.weight` (optional) | `[5120,4096]` | `F16` | runtime-input; dynamic linear `weight` | 16 |
| `text_embedding.0.bias` (optional) | `[5120]` | `F16` | hike-parameter; `AddBias.bias` | — |
| `text_embedding.2.weight` (optional) | `[5120,5120]` | `F16` | runtime-input; dynamic linear `weight` | 16 |
| `text_embedding.2.bias` (optional) | `[5120]` | `F16` | hike-parameter; `AddBias.bias` | — |

The default native registry has all 12 cross-attention/FFN slots. `createP4WeightFeed({source,includeTextEmbedding:true})` adds the entire optional four-slot group; the adapter accepts the complete 12- or 16-slot native descriptor, not an arbitrary shortened registry. The operator of each matrix/bias is its original stem (for example `blocks.0.ffn.2`). Original norm/time/modulation parameters remain the native owner's immutable pass-through; they are not additional LoRA slots.

Native original `F16` or scalar-scaled E4M3FN is decoded by the original Hike provider to F32. FP8 entries retain their scale/profile/config/source digests. SDK base blocks and final patches are **F32 row-major**, not raw FP8. The adapter does not apply an extra quantization, transpose, clamp, clipping or inner-dimension split. In particular FFN-down retains all 13,824 input columns. This boundary does not certify arbitrary quantized bases or original production-precision equivalence.

`offset` and `count` always mean elements in the original full tensor. A diagnostic `slice:{startRow,rowCount}` selects complete rows. Matrix offset is `startRow * fullShape[1]`; vector offset is `startRow`. Slices are not rebased to zero and their shapes are never substituted for full layer shapes. Native `sink.begin` receives `patches:[{weightId,offset,count}]` for every entire selected operation. Unselected targets and unselected rows use **immutable original base**, not the prior application. A bias is patched only when it is an explicit selected source patch; omitted bias remains base pass-through.

Selected patch bytes are summed before native transaction/base reads and must be at most **16,777,216 bytes (16 MiB)**. Each block is at most 81,920 F32 elements, with complete input columns and the native row cap. SDK targets carry:

```js
blockLimits: {
  contractVersion: 'lora-block-limits/0.1-draft.1',
  offsetUnit: 'elements',
  coordinateSpace: 'original-full-tensor',
  rowAlignment: 'all-columns',
  maxElements: 81920,
  maxRows: 4 // FFN-down; 16 for other matrices, 81920 for vector element blocks
}
```

The SDK also retains its existing `blockRows` and rank/workspace constraints, so an actual block may be smaller than these maxima. Without `blockLimits`, existing SDK plans keep their prior structure and block choice. Native aggregate retention/package/candidate/read-lease/transaction limits are unchanged; the 16 MiB selected-patch cap is not a total process or ORT memory budget.

## Planning, sink and consumer target

`adapter.registry` is the SDK registry; `adapter.baseProvider.readBlock(weightId,offset,count,context)` explicitly translates connection identity to native identity and reads immutable original F32 blocks. It checks original full shape, signal and resource ownership. It never reads from the active patched feed.

Use actual SDK `plan` with `selection`, `strength`, `registry:adapter.registry`, the fixed loader policy and explicit diagnostic targets. Only `coverage:'PARTIAL'`, `completeAdapter:false`, `scope:'diagnostic-projection'` plans are accepted. Whole-header validation remains the SDK planner's job: unknown tensors/variants are not excused by diagnostic exclusion. Included patches, excluded targets and excluded regions remain in the plan and prepared manifest. Pair IDs come from the selected input; this adapter does not require the historical four originals or hard-code light/detail as the only pair IDs.

The loader is `comfy-lora-b5a4321-linear-diff-v1`, fixed to ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`. Supported variants are `linear-down-up`, `linear-a-b`, `additive-diff`, `additive-diff-b`, with source BF16/F16/F32 as accepted by the SDK. Factors use `up[out,rank] @ down[rank,in]`; a present alpha uses `strength * alpha/rank`. An absent alpha uses `strength * 1` only under this fixed policy. Additive weight/bias differences use `strength * delta`; no alpha/rank multiplier. Unknown variant/multiplier, Conv/DoRA/LoHa/LoKr or implicit fusion/transpose is not given a default. See [loader-policy.mjs](./loader-policy.mjs).

| Method | Result / requirements |
| --- | --- |
| `createSink(plan)` | SDK sink with `begin/writeBlock/finish/abort/release`. Declares all selected native ranges, owns input block copies before awaits, validates manifest/hash/write coverage, and obtains an opaque native package handle. |
| `targetForPlan(plan,validationSpec)` | SDK v2 target with `describe/prepareLoad/validate/commit/rollback`. Validation inputs are captured synchronously. FULL or wrong registry/source/slice plans reject. |
| `finalize(plan)` | Releases that plan's native candidates/rollback history. Call only after the caller's final acceptance/publication; it does not release the active feed. |
| `restoreBase(validationSpec)` | Native immutable `prepareBase → validate → commit`, followed by candidate release. Returns `application:'IMMUTABLE_BASE'`, not a manager snapshot publication. |
| `run(input,{signal,isCurrent})` | Captures an active native source lease; calls injected operator, checks compact finite F32 output length10,240 and exact lease profile/graph/package/epoch evidence; releases the lease in `finally`. Returned output is copied. |
| `describeBinding()` | Frozen native/connection registries and hashes, adapter/native contract version, coordinate/ownership/metadata limits and false generation flag. It is metadata, not proof of an actual loaded graph/operator execution. |

`target.validate` wraps the actual scoped native receipt as SDK `{contractVersion,valid,coverage,scope,planId,registryHash,sourceSha256,evidence}`. The wrapper preserves the native receipt, native registry hash and explicit outer application binding. A boolean validate result is refused. `commit` returns `CONSUMER_APPLIED` only after the native feed atomically commits a validated candidate and supplies the exact native identity/package/positive-epoch receipt. It still returns no manager publication or generation acceptance.

SDK v1 remains unchanged. Its existing adapter is initializer/FULL-only and rejects this PARTIAL/runtime-input route. Do not rename a runtime input to `graphInitializer` or relabel coverage to pass through v1.

## Validation input, currentness and cancellation

```js
const validationSpec = {
  input: {
    residual: new Float32Array(10240),
    timeAct1: new Float32Array(5120),
    conditioning: recognizedCapturedConditioning
  },
  expected: independentExpectedF32, // compact finite F32[10240]
  expectedSHA256: independentExpectedSha256,
  referenceId: fixedReferenceId,
  gateId: 'p4-cross-ffn-composed-f32-v1',
  tolerance: {absolute: 0.01, relative: 0.001},
  applicationBinding: null // or explicit plain JSON outer target metadata
};
```

No default or newly computed oracle is supplied by the adapter. Tolerance must exactly match the native frozen composed-stage gate; the reference must contain all 10,240 outputs. The native validator checks expected bytes/hash, actual operator profile/graph/feed package/prepared epoch, input/conditioning digests and numerical gate before commit. Input/expected F32 arrays and recognized conditioning are copied before the first await. A caller cannot mutate them into different validation data after target creation.

The three revision domains remain separate:

1. SDK `sdkInstanceId/localInputRevision/localApplicationRevision` identify the local plan/prepared transaction; a new plan or SDK cancel invalidates old plans.
2. Optional `applicationBinding` is caller-supplied outer selection/snapshot/resource metadata, copied into evidence or explicitly null. It is not derived from SDK counters and does not itself publish or validate a management profile.
3. Native feed epoch/package identify the actual P4 application and captured source lease. Native candidate prepared/committed epochs decide stale commit and rollback.

The SDK and adapter check abort/current before native calls; native commit repeats its own guard and epoch checks at the actual switch. `isOwnerCurrent` means resource lifetime/cleanup authority. A cancelled or superseded SDK selection must not remove the resource owner's authority to clean up its candidate. Cleanup rollback uses that resource authority, while the native epoch/feed checks prevent an old candidate from replacing a newer active feed. If the resource owner itself is superseded, rollback cannot switch its old feed.

Cancellation is cooperative. A bounded synchronous Hike call or already dispatched operator call reaches its actual terminal boundary first. Signal is passed into the actual stage; native validation/current guards run again before success/commit. Wait for the original Promise and cleanup before reuse or disposal. The adapter does not implement a management queue, stop confirmation or snapshot publication; those receipts require the caller's real queue/coordinator.

## Buffer lifetime and conditioning limits

Native `sink.writeBlock` makes owned final-F32 copies. `prepareLoad` copies block records and retains those existing private backing buffers; it does **not** make a second numeric copy. Package, candidate/history, active feed and internal read leases retain the private blocks. Therefore SDK ownership is `independent-copy` relative to SDK prepared/source bytes. Releasing the prepared handle or finalizing candidate history does not clear an active feed. Changing strength or removing LoRA reconstructs from the immutable base; no re-addition to patched weights or rounded-delta subtraction occurs.

The native internal read lease is not an SDK `ownership.kind:'lease'`. Do not infer that SDK prepared release is gated by a consumer lease. Native aggregate retention counts its private buffer references separately. A failed/aborted stage is rolled back; stale cleanup retires only its candidate/history and cannot overwrite a successor. Full operator/feed/source disposal is caller-owned.

Use the injected synchronous native `cloneP4CapturedConditioning`. `structuredClone` alone destroys the native private recognition brand and is not a substitute. Adapter0.1 accepts **plain finite acyclic JSON conditioning metadata only**: plain objects/arrays, string/boolean/null and finite numbers. It explicitly rejects typed/shared binary metadata, cycles, Map/Set/Date/RegExp, accessors/symbol metadata and unsupported values with `UNSUPPORTED_CONDITIONING_METADATA` at target/reference capture, before preparation. It does not drop or normalize those values. This restriction avoids the existing SDK receipt freeze's limitations without changing SDK v1 or native P2/conditioning/codec APIs. The native owner supports a wider metadata domain; that wider domain and new actual Text-producer integration are not accepted by this adapter version.

## Verification and acceptance boundary

`tools/lora/test-p4-adapter.mjs` uses the actual fixed native weight-feed and conditioning modules with a synthetic original-source and fake forward. It reads no original model and executes no NN. It checks registry/binding/shape/hash/profile rejection, full-coordinate FFN-down blocks, loader-scaled Hike preparation, strength0/±1/reapply, missing declared coverage, input mutation, boolean/numerical validation failure, abort and direct SDK cancellation, old-plan rejection, native epochs/old rollback, prepared lifetime/copy ownership, base restoration, output lease evidence and unsupported metadata. The related SDK/planner/v1/block-limit fixtures run separately from any actual original-base/operator trial.

Runtime file/source hashes, real LoRA/reference identities, original base slices, operator output comparison, management adoption, and generation contribution need separate receipts. This document does not declare those outcomes. PARTIAL remains PARTIAL; full model, other pair/side combinations, simultaneous two-pair composition, SDK leases, selected-weight E4 and generation require their own acceptance. No merge or public deployment is implied.
