# Standalone LoRA API

This is the new `lora-standalone/1.0-draft.1` extension for local light/detail LoRAs, complete logical target mapping, streamed F32 delivery and normal composition control. It accepts a caller-supplied immutable base provider, logical registry and consumer without importing DiffusionModels or management. The existing v1 SDK, v2/Q16 paths and [P4 normal adapter](./NORMAL-TRANSACTIONS.md) retain their separate contracts and accepted scopes.

This document describes the implemented API and its resource/ownership contract. Completed all-target standalone acceptance, separate R1/R2 execution sources and remaining model-integration conditions are recorded in [RESULT.md](../../../../development/lora/standalone/RESULT.md). Standalone FULL coverage does not establish a real Diffusion graph or generation readiness.

## Entrypoints and versions

| Entrypoint | Responsibility |
| --- | --- |
| [standalone-sdk.mjs](./standalone-sdk.mjs): `createLoraStandalone` | One fixed HIGH or LOW side; registration, composition, normal transactions, save/open and cleanup |
| [standalone-registry.mjs](./standalone-registry.mjs): `createBerniniStandaloneRegistry`, `validateStandaloneRegistry` | Canonical logical target names, original full shapes and provider/consumer identity |
| [standalone-planner.mjs](./standalone-planner.mjs): `buildStandalonePlan` | Existing loader classifier, explicit row selection and mapping/coverage metadata |
| [owned-package.mjs](./owned-package.mjs) | Verified source capabilities, lazy owned package, bounded factor/product cache and durable payload |
| [kernel/streaming/host.mjs](./kernel/streaming/host.mjs): `createStreamingKernel` | Bounded Hike WASM decoding, low-rank product and F32 application |
| [bernini-targets.mjs](./bernini-targets.mjs) | The LoRA owner's canonical Bernini logical name/shape table |

The SDK contract is `lora-standalone/1.0-draft.1`; the mapping version is `bernini-comfy-canonical/1.0`; the owned payload version is `lora-owned-package/0.1-draft.1`. `createBerniniStandaloneRegistry` uses registry version `bernini-standalone-targets/1.0`. The former Diffusion logical table reexports the LoRA-owned table so there is one mapping source.

## Mapping scope and compatibility

The declared original set has 1,052 logical patches for each light side and 400 for each detail side: 2,904 across the four originals. [MAPPING.json](../../../../development/lora/standalone/MAPPING.json) records header/alpha mapping evidence separately from numerical execution. Normal input is not authorized by a four-file hash allowlist: source SHA-256 identifies the immutable loaded bytes, while the current header, loader, original full shape and supplied registry determine structural support. A caller can register only the selected original(s) it needs.

Three claims are separate:

| Metadata | Meaning |
| --- | --- |
| `logicalNameShapeMatched:true` | Original logical key and full shape match the selected registry |
| `standaloneTargetSupported:true` | This standalone provider/package/consumer contract can address that logical target |
| `graphBinding:'UNBOUND'`, `trainingBaseVerified:false` | No real Diffusion graph/operator binding or original training-base identity is established |

The registry has `modelHash`, `side`, mapping/loader versions and logical targets; it does not invent a `graphHash`, initializer or runtime slot. Each target contains `key`, `weightId`, `fullShape`, `dtype:'F32'`, `layout:'row-major'`, `parameterRole`, and `logicalBinding:{kind:'logical-weight'|'logical-bias',name}`. Logical binding names address the injected provider/consumer only. Equal shapes, names or a declared model hash do not prove a trained-base match or an existing NN binding.

`createBerniniStandaloneRegistry({modelHash,side,targets?})` supplies canonical weight/bias targets or checks an explicitly supplied subset against the canonical table. `validateStandaloneRegistry` also supports a separately versioned caller logical registry, with unique keys, weight IDs and bindings. Unsupported rank/dimensions, duplicate targets, missing patch mappings and full-shape mismatches reject explicitly. Images, mean tensors and F/H/W are not LoRA ports.

## Local browser File use

The caller selects local `.safetensors` Files through its own browser UI. They remain local; the module does not upload them or require persistent browser registration. Direct File registration does not depend on the legacy complete-pair folder detector or on original filenames. The supplied registry fixes the model side.

```js
import {createLoraStandalone} from './standalone-sdk.mjs';
import {createBerniniStandaloneRegistry} from './standalone-registry.mjs';
import {createStreamingKernel} from './kernel/streaming/host.mjs';
import {createLoraProductCache} from './owned-package.mjs';

const registry = createBerniniStandaloneRegistry({modelHash, side: 'LOW'});
const kernel = await createStreamingKernel();
const cache = createLoraProductCache({maxBytes: 64 * 1024 * 1024});
const sdk = createLoraStandalone({registry, baseProvider, kernel, cache});

await sdk.register({pairId: 'light', file: lightFileInput.files[0], signal,
  onProgress: ({bytesHashed, totalBytes}) => showReadProgress(bytesHashed, totalBytes)});
await sdk.register({pairId: 'detail', file: detailFileInput.files[0], signal});

const applied = await sdk.apply({
  selections: [{pairId: 'light', strength: 1}, {pairId: 'detail', strength: 1}],
  target: consumer, signal, isCurrent: requestCurrent
});
// Strength change, reapplication, or removing one pair creates a fresh composition.
await sdk.apply({selections: [{pairId: 'light', strength: -1}],
  target: consumer, signal, isCurrent: requestCurrent});
await sdk.restoreBase({target: consumer, signal, isCurrent: requestCurrent});
```

`baseProvider`, `consumer`, `signal` and request-current control are supplied by the embedding host. The examples do not imply that the earlier P4 consumer accepts a standalone registry. A real Diffusion consumer needs a separately accepted logical-to-graph/operator binding.

Use separate SDK instances and registries for HIGH and LOW; register that side's selected File(s) with its instance. The module does not schedule the HIGH→LOW transition or create a management-wide snapshot. `pairId` is `light` or `detail`; a composition may contain either pair, both, or an empty selection. Duplicate pair selections and unregistered selected pairs reject.

## Public normal SDK

`createLoraStandalone({registry,baseProvider,kernel,cache?})` is synchronous and requires an explicit streaming kernel. Base, kernel and consumer are caller-owned. `capabilities()` declares the side, operations, pairs, loader variants, block limit, `independentExpectedRequired:false` and `graphBinding:'UNBOUND'`; `inspect()` returns registered source descriptors; `stats()` reports local revision, busy/disposed state, registered/prepared counts and recovery requirement.

| Method | Input / behavior |
| --- | --- |
| `register` | `{pairId,file,signal?,onProgress?}` or `{pairId,source,signal?,onProgress?}`; exactly one File/Blob or retained source; returns `REGISTERED` with source identity and patch count |
| `compose` | `{selections:[{pairId,strength}],targets?,signal?}`; snapshots/sorts the selection and returns a branded local composition plan |
| `prepare` | `(plan,{signal?})`; validates the plan/sources/base and creates a lazy owned `PREPARED` package |
| `stage` | `(prepared,target,{signal?,isCurrent?,validationMode?})`; normal candidate validation and guarded commit |
| `apply` | `{selections,targets?,target,signal?,isCurrent?,validationMode?}`; compose → prepare → stage, then release the SDK's prepared package capability |
| `restoreBase` | `{target,signal?,isCurrent?,validationMode?}`; applies an empty composition from immutable base |
| `save` | `(prepared,{writer,signal?})`; writes actual selected source payload followed by its durable manifest |
| `openPackage` | `{manifest,sources,signal?}`; verifies saved bytes and creates fresh local prepared authority |
| `cancel` | Invalidates the local revision and cooperatively aborts the active operation |
| `release` | `(prepared)`; releases this SDK's prepared capability after terminal work |
| `recover` | `(prepared?)`; retries retained rollback/release/source-cleanup failures |
| `dispose` | Cancels, waits for terminal operations/recovery, and releases SDK registrations/prepared capabilities |

Standalone stage accepts only `validationMode:'normal'`, which is also its default. It does not accept independent expected outputs, numerical gates or a neural executor. Diagnostic references remain in development tools. This differs from v2's optional normal/diagnostic mode extension; it does not change v2's omission/legacy behavior.

An optional `targets` list uses `{key,slice:{startRow,rowCount}}` in original coordinates. The same list applies to every selected source, and each listed patch must exist in each source; omit it for the complete composition union. Full shape is never replaced by the selected shape; each matrix row keeps every input column. Unknown tensors/variants are still classified and rejected rather than silently excluded. With no target list, every logical patch in each selected source is included. With a target list, selected full-coordinate regions and excluded patches/regions remain explicit and `coverage:'PARTIAL'` is retained.

`coverage:'FULL'` / `completeAdapter:true` means complete patch coverage for the selected standalone composition. It does not mean all model tensors are patched, a real graph is bound, full inference was executed, or generation is ready. Empty composition means base-only state, not a fictitious patch. Composition coverage, the exact streamed/computed elements and real model/graph acceptance must be reported separately.

## Loader and composition arithmetic

The loader remains `comfy-lora-b5a4321-linear-diff-v1`, fixed to ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`. It recognizes `linear-down-up`, `linear-a-b`, `additive-diff` and `additive-diff-b`, with BF16/F16/F32 source data. Unknown variants/multipliers, Conv/DoRA/LoHa/LoKr, implicit transpose/fusion and unhandled quantized-base transforms are not given defaults.

For a low-rank patch, `delta = up[out,rank] @ down[rank,in]`. Present alpha uses `scale = strength * alpha/rank`; absent alpha uses `scale = strength` only under that fixed loader policy. Weight/bias differences use `scale = strength`, without alpha/rank scaling. Strength and effective scale must be finite F32-representable values.

Every `readBlock` starts from the immutable base and applies light, then detail, in that fixed order, regardless of request order. Each stage uses separate F32 scale multiplication and base addition. Do not pre-sum both deltas, subtract rounded prior patches, or accumulate onto an already applied package. Removing one pair, changing strength, reapplying and restoring base rebuild from immutable base. Bias is applied only when declared by the selected original patch.

The new [streaming kernel](./kernel/streaming/README.md) uses Hike's LLVM backend and strict WASM SIMD128. Each product output starts at F32 `+0`, accumulates rank terms in ascending order, and uses separate F32 multiply/add without FMA. Decode, product and application execute in Hike WASM; there is no JS/BLAS/WebGPU arithmetic fallback. This is an explicit backend change from the earlier scalar/WABT kernel. Kernel component evidence is separate from all-patch numerical acceptance.

## Immutable base and consumer contract

The provider supplies:

```js
const baseProvider = {
  async describe() { return {modelHash, side, /* optional stable base metadata */}; },
  async readBlock(weightId, offset, count, context) {
    // context: signal, captured base identity, registryHash, fullShape, side.
    // Return an owned, finite Float32Array(count) from immutable original base.
  }
};
```

The captured descriptor must match the registry's model and side; an optional descriptor `registryHash` must match too. Package reads compare the current complete base descriptor with the captured one. Reads use element offsets/counts, whole rows and original full shapes. The provider must preserve its base, honor cancellation, keep required resources alive, and reject invalid identity/ranges. A logical model hash does not substitute for provider ownership or a real original-base numerical test.

The standalone consumer has `contractVersion:'lora-standalone/1.0-draft.1'` and methods `describe`, `prepareLoad`, `validate`, `commit`, `rollback`; it may also expose `releaseCandidate` and `currentEpoch`. `describe()` returns the same logical registry. `prepareLoad(ownedPackage,context)` must retain an independent package capability or copy the required completed bytes before relying on them. A lazy recipe alone is not evidence that every declared output has already been computed.

Normal `validate(candidate,context)` must check the declared selected range's completed F32 values, finite/type/layout/shape conditions, package/range identity and current candidate, without expected outputs or neural inference. It returns a structured receipt with `contractVersion`, `valid:true`, `validationMode:'normal'`, `planId`, `packageHash`, `registryHash`, `coverage` and `scope`. A boolean receipt is rejected. Validation of all declared elements is the consumer's obligation; metadata matching alone does not discharge it.

`commit` must check abort/current immediately before atomic publication and return `CONSUMER_APPLIED`, the same contract/mode/plan/package/registry, a nonnegative integer `epoch`, and valid ownership. Ownership is `{kind:'independent-copy',ownerId}` or `{kind:'lease',ownerId,isValid}`. Optional commit coverage/scope must match if supplied. If `currentEpoch()` exists, the returned epoch must equal it. SDK local revision, external management revision and consumer epoch are different identities.

The context binds `sdkInstanceId`, `localRevision`, fresh `transactionId`, side, plan/package/registry, coverage/scope, normal mode, signal and `isCurrent`. The SDK checks both returned receipts and their captured fields, and rechecks currentness before/after publication. The consumer must enforce equivalent checks at its own publication boundary. `rollback` may restore only its own current publication; an old candidate cannot overwrite a successor. Optional candidate release is a separate terminal cleanup step. A failed rollback/release leaves explicit recovery required and blocks new work.

Registration/replacement, composition, package reopen and cancellation advance the instance's local revision. Older plans/prepared transactions cannot stage as the current selection. An independently retained active package remains a consumer-owned value source until that consumer switches/releases it; changing SDK selection does not silently free its bytes or give an old transaction publication authority.

## Owned package and resource lifetime

`prepare` owns a verified recipe, retained immutable source bytes and, where supported, a kernel lease. It does not allocate every dense final weight or claim they have all been calculated. Its handle exposes `describe()`, `readBlock(weightId,offset,count,{signal?})`, `blocks({blockRows?,signal?})`, `retain(ownerId)`, `isValid()`, `release()`, `stats()` and `save(...)`. Reads produce new owned final F32 blocks; selected ranges receive ordered patches and other coordinates retain original base. `blocks` enumerates the union of selected coordinates, preserving partial last tiles.

File/Blob capture uses an internal slice snapshot and hashes/inspects it once. A generic source must offer `retain(ownerId)` returning `{source:{size,read},isValid,release}`; an unowned bare reader or caller-supplied hash assertion is insufficient. Branded verified source reuse avoids rehashing on every prepare; saved payload reopen performs fresh verification. Source reads are bounded to 16 MiB; capture/save hash streams use 1 MiB chunks.

Each package capability releases independently. Releasing the SDK's prepared capability invalidates that capability's `readBlock`, `blocks`, `describe` and `save`; an independently retained active/read capability remains valid. A lease-owning consumer must retain its own package capability before commit. Thus creator release can complete while its separately retained active package still supplies blocks. This is the owned-package reference contract, not a silent change to v2's prepared-lease release barriers.

The final package release waits for in-flight work, then releases retained sources and kernel lease. The base provider remains caller-owned and must outlive every active/read package lease. A streaming kernel lease can preserve kernel availability after its creator closes; without a retain-capable kernel, the caller must keep the kernel alive itself. SDK disposal does not dispose the caller's consumer, base provider, kernel or supplied cache. Dispose consumers/read leases before their backing base; clear/dispose caller resources after their final use. A cached product never revives an invalid source lease.

Cancellation is cooperative: a bounded synchronous Hike call finishes before the surrounding signal/revision guard stops further work. Concurrent SDK tasks reject `BUSY` until the original operation terminates. Release during stage/save is rejected. `cancel` does not itself prove cleanup or resource reuse. Failed cleanup is retained for `recover`; retry terminal release/disposal after recovery. Failures before a source/package handle is returned can carry `AggregateError.recover()`, which the SDK also retains in its cleanup state.

## Durable save and fresh reopen

The saved package contains its immutable manifest and actual selected `.safetensors` payload(s), not serialized runtime handles. It is a reproducible recipe requiring the same declared immutable base identity, registry and kernel build identity, not a dense model export. The writer must fully consume each source stream before its promise resolves; the package verifies the streamed byte count/hash and publishes the manifest only after all payloads succeed.

```js
const plan = await sdk.compose({selections: [
  {pairId: 'light', strength: 1}, {pairId: 'detail', strength: 1}
]});
const prepared = await sdk.prepare(plan, {signal});
try {
  const savedManifest = await sdk.save(prepared, {signal, writer: {
    async writeSource(name, chunks) {
      const file = await outputDirectory.getFileHandle(name, {create: true});
      const stream = await file.createWritable();
      try { for await (const bytes of chunks) await stream.write(bytes); await stream.close(); }
      catch (error) { await stream.abort(); throw error; }
    },
    async writeManifest(manifest) {
      const file = await outputDirectory.getFileHandle('manifest.json', {create: true});
      const stream = await file.createWritable();
      try { await stream.write(JSON.stringify(manifest)); await stream.close(); }
      catch (error) { await stream.abort(); throw error; }
    }
  }});
} finally { await sdk.release(prepared); }
```

`outputDirectory` is a caller-selected writable directory or an equivalent streaming storage implementation. Use a new output location and treat a missing manifest as an incomplete save; the writer owns partial-file cleanup. Do not collect GB source streams into one in-memory Blob merely to implement a download button. The API does not serialize the base, live consumer, kernel memory or cache.

After selecting the saved files, create a new SDK and reopen through its normal API:

```js
const manifest = JSON.parse(await savedManifestFile.text());
const sources = new Map(savedPayloadFiles.map(file => [file.name, file]));
const reopened = await freshSdk.openPackage({manifest, sources, signal});
try {
  await freshSdk.stage(reopened, freshConsumer, {signal, isCurrent: requestCurrent});
} finally { await freshSdk.release(reopened); }
```

`sources` is a Map or plain object from manifest filename (`source-0.safetensors`, etc.) to a real saved File/Blob or independently retained source. Reopen checks manifest/package integrity, source payload length/hash, original mapping, base identity, registry/side and exact reconstructed manifest, including kernel build identity. Missing, modified, duplicate or substituted payloads reject before consumer preparation. Arbitrary serialized `handle`, instance/revision or transaction fields are rejected; JSON alone cannot restore runtime authority.

The saved `planId`/`packageHash` remain immutable payload identities. The reopened wrapper has the current `sdkInstanceId`, a new `localRevision`, fresh `transactionId` and fresh owned handle. `originPlanId` records the saved plan ID; it is not reused execution authority. `save` requires a current live prepared package and blocks release while writing. Cancellation observed during source streaming stops before the manifest call. The writer owns atomic publication and cancellation of its own in-progress I/O; a rejected save is not a successful durable-save receipt, even if partial files remain.

## Resource formulas and verification scope

Let a matrix have input width `C`, rank `R` and requested tile rows `r`. A final block contains `r*C` F32 elements (`4*r*C` bytes); a raw low-rank product has the same size, while decoded down/up factors contain `R*C` and `r*R` F32 elements. The kernel arena and host copies are separate. Vectors use `C=1`. Direct package reads allow at most 1,048,576 elements (4 MiB) and complete rows. `blocks` accepts `blockRows:1..256` and further limits rows to `floor(1,048,576/C)`; default `blockRows` is 16.

The streaming kernel owns 32 MiB of WASM memory, of which the first 1 MiB is reserved; inputs/output and any retained down factor share the remaining 31 MiB. Oversized operations reject before arena writes. `createLoraProductCache` defaults to 16 MiB and can be explicitly configured, for example to 64 MiB. It stores decoded factors and strength-independent raw products in one bounded LRU, returns private copies, and coalesces concurrent computations. Its resident-entry cap is not a total bound on in-flight computations, temporary copies, Files, browser/GC or process peak.

The mapped four separate-source dense F32 outputs total **226,702,705,152 bytes** (`4 * 56,675,676,288` elements). The composed union is 1,052 targets and 14,286,919,744 elements per side, or **114,295,357,952 bytes** across HIGH and LOW. These are logical output volumes, not resident allocations or proof that those values have been executed. Lazy tile delivery avoids retaining those dense outputs; full acceptance must still actually compute and compare every declared element.

The development [standalone-host.mjs](../../../../tools/lora/standalone-host.mjs) supplies a reference consumer and an independently defined dyadic base, `((fullElementOffset % 17) - 8) / 128`. It has no Diffusion or management dependency and performs normal range/finite/currentness admission. This host is a test tool, not a production model decoder or second canonical mapping. [standalone-reference.py](../../../../tools/lora/standalone-reference.py) supplies independent development expectations/gates; they are not normal SDK inputs.

Report mapping, component kernel verification, full-value arithmetic against the independent base, consumer readback/control/save/reopen, real-base comparison, real Diffusion graph application and generated-result contribution as distinct scopes. Retain earlier Q4/Q16 and P4 evidence at its original scope. Standalone success alone never sets `generationReady:true`, proves a HIGH→LOW model pipeline, or authorizes merge/Pages publication.
