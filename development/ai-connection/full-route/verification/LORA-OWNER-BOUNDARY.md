# LoRA standalone complete weights → full public Diffusion: concrete boundary report

Inspected 2026-11-04. Read-only investigation of `/workspace/work/ai-connection/full-route-r17/checkout`; only this private report was written. No experimental LoRA was obtained, registered or transferred, no model payload was opened, and no NN operation or new mapping/arithmetic implementation was run.

## Result

**The adopted LoRA SDK can produce owned completed F32 blocks, and Diffusion already has a real internal final-F32 weight-source wrapper. The fixed full public Diffusion API cannot connect those two today.** Its public factory, Worker protocol, model adapter and sampler provide no standalone base-provider/consumer binding API. This is an owner API gap, not evidence that LoRA arithmetic or the previously accepted partial connections fail.

A manager-only change cannot make the public `predict`/`sample` owner consume the package through the existing accepted arguments. Do not convert `UNBOUND` into `APPLIED`, use the development reference consumer as proof, or replace the real public runtime with a test injection. Do not fetch/run experimental LoRAs to work around this boundary.

## Frozen sources and authoritative documentation

- LoRA: `6d0c8df4cd4992f26745d2d26394f5e194d2567f`; mirrored under `docs/shared/ai-connection/native/lora-6d0c8df/` (below, **L/**).
- Diffusion: `ffeeeedb6b57d182a977c3ac02c042ce235fc87a`; mirrored under `docs/shared/ai-connection/native/diffusion-ffeeeedb/` (below, **D/**).
- Read `git show ffeeeedb6b57d182a977c3ac02c042ce235fc87a:docs/shared/diffusion-models/api/MODEL_RUNTIME.md`, with line numbering from that Git object. Lines 21–29 list exact model operations/inputs. Lines 40–44 specify complete original HIGH/LOW files and staged matrices. Lines 95–99 specify Worker transport and owned snapshots; lines 126–131 specify termination and reload on cancellation.
- Read `git show 6d0c8df4cd4992f26745d2d26394f5e194d2567f:docs/shared/inference/lora/STANDALONE.md`. Lines 104–128 specify base-provider/consumer duties; lines 130–138 specify package lifetimes. Lines 30–34, 65 and 92 explicitly distinguish standalone coverage from actual Diffusion graph binding. These documents were read from Git, not inferred from management status flags.

## What LoRA actually supplies

`L/docs/shared/inference/lora/standalone-sdk.mjs:18–21` exports synchronous `createLoraStandalone({registry,baseProvider,kernel,cache})`, requiring caller-supplied immutable base `describe/readBlock` and streaming kernel `decode/product/apply`. It does not construct a trained-base provider or a Diffusion consumer.

`L/docs/shared/inference/lora/owned-package.mjs:123–149` verifies the base model/side and stable descriptor, retains source capabilities, and creates a lazy owned package. Its `readBlock(weightId,offset,count,{signal})` reads the immutable base and returns final completed F32 after SDK-owned composition (`:149–169`). Offsets/counts must cover whole rows and respect 1,048,576-element blocks (`:10`, `:147–148`). `blocks` enumerates selected coordinate unions (`:171`); it is not a dense full-model export. A package `retain(ownerId)` creates an independent capability; release of the creator's capability does not free a retained consumer capability (`:173–178`). `save` persists selected LoRA sources plus manifest, not a newly encoded complete original-format model (`:172`).

Stage requires `contractVersion:'lora-standalone/1.0-draft.1'` and consumer methods `describe`, `prepareLoad`, `validate`, `commit`, `rollback` (`L/.../standalone-sdk.mjs:106–123`). It checks matching registry, structured normal-validation receipt, transaction identities, valid ownership, `CONSUMER_APPLIED` and epoch. Correct ownership and an actual publication boundary are necessary; writing these fields into a manager receipt is insufficient.

`L/.../standalone-registry.mjs:15–16` explicitly says logical names do not establish an initializer or runtime program slot. Canonical targets use `weightId:t.key`, original `fullShape` and separate logical binding (`:34–46`).

## Available Diffusion weight operations: a real internal port exists

`D/docs/shared/diffusion-models/execution/model-weights.mjs:48–100` exports `createModelWeightSource` (also `createFullModelWeightSource`, `:124`). It accepts immutable original Blob, HIGH/LOW and decoder/resource options. It authenticates pinned header/size and stages original F16/FP8 decoding. It exposes `describe`, `readRows`, `readVector`, `addBias`, `stats`, `dispose` (`:113–120`). These are internal execution exports, not public protocol operations.

**`createCompletedModelWeightSource({source,completedProvider})` is implemented at `D/.../execution/model-weights.mjs:126–152`.** It:

1. Requires a full-model original source and `completedProvider.readBlock` (`:127–129`).
2. Reads the original selected range, then calls the provider with `{originalKey,weightId,entry,offset,count,fullShape,binding,dtype:'F32',baseValues,signal}` (`:132–137`).
3. Uses a returned compact finite `Float32Array`, or original-base pass-through when return is null/undefined (`:138–144`). It does no completion arithmetic itself.
4. Exposes full-source `readRows/readVector` with completion metadata (`:147–151`). Its description still says `canonicalLoraAdapterExtension:'PENDING'`.

This is a meaningful reusable owner operation. It is **not** a versioned standalone consumer: it lacks `contractVersion`, logical-registry `describe`, `prepareLoad`, normal `validate`, atomic `commit`, `rollback`, epoch and retained-package ownership protocol. Its `dispose` does not dispose the caller's source/provider (`:151`). It cannot by itself justify a successful standalone SDK stage.

`D/.../execution/model-candidate.mjs:43–50` validates the complete 1,095-target original-source identity. Its factory accepts `source` (`:73–84`) and uses that source in the real graph (`:105–116`); thus a correctly completed wrapper could feed this direct candidate. This is a **direct candidate seam**, not a route to the fixed public full-model sampler. Do not use it to claim full public API connection.

## Why the public route cannot reach that port

| Boundary | Actual implementation | Consequence |
| --- | --- | --- |
| Public factory | `D/.../api/index.mjs:18–24,153` returns only `{sessionId,request,cancel,dispose,subscribeProgress}` and privately owns Worker/model state. `:10` lists every accepted operation. | No provider, consumer, original weight reader, or completed-weight bind/commit operation is exposed. |
| Public model load | `D/.../api/model-adapter.mjs:93–106` accepts only `files`, legacy `file`, `resource`; files only HIGH/LOW; resource only wasmThreads. | `completedProvider`, package, source, consumer or LoRA input is rejected. Factory is fixed to the actual Bernini sampler. |
| Predict/sample | `D/.../api/model-adapter.mjs:123–129` accepts only documented tensor/shape/conditioning/session fields. | No late weight override or package-selection hook exists. |
| Worker | `D/.../api/worker.mjs:33–40` dispatches full-model operations to private `createModelAdapter`; `:56–61` handles LoRA separately as weight I/O. | LoRA load/read does not publish weights to the model owner. |
| Sampler | `D/.../execution/model-sampler-candidate.mjs:82–93` expressly provides no source injection; `:227–229` constructs original sources internally and passes them directly into both model candidates. | The existing completed-source wrapper is never installed in public HIGH/LOW predictions or internal HIGH3→LOW3 sampling. |
| Wire transport | `D/.../api/index.mjs:148–149` posts normal structured-clone packets to Worker. Management `adapters/diffusion-public/adapter.mjs:24–35` rejects function/symbol input and clones packets. | A host SDK package containing methods cannot be placed into `input` as an undocumented callback capability. |

The public `loadLora` path is intentionally a different contract: `D/.../api/index.mjs:74–87,99–102,128–134` retains/reads the input LoRA file but reports `loraApplied:false` / `applied:false`; `D/.../api/worker.mjs:56–61` performs only inspect/load/read bytes/tensors. `loadLora` is not a completed-model weight publication path.

The diagnostic `D/.../lora/v2-adapter.mjs:1–5,18–28,41–43` remains one bounded PARTIAL Q slice using `lora-connection/2.0-draft.1`, not the new standalone contract or full public sampler. Its accepted partial scope remains valid.

## Static checks performed, with no model/LoRA I/O

A Node metadata-only probe imported owner registries and compared the original `weightId`/full shape pairs. The standalone canonical registry contains **1,053 targets**; every one matches a Diffusion original target (zero identity/shape mismatches). Diffusion's full set has **1,095**. The remaining 42 are `blocks.0.modulation` through `blocks.39.modulation`, `head.modulation` and `patch_embedding.weight`. This validates a useful name/shape relationship; it does not establish binding, training-base identity or numerical acceptance. A completed-source design must keep untouched originals available; it cannot treat a standalone package as a replacement for all 1,095 parameters.

A no-I/O input-admission probe called `createModelAdapter().execute('load', {[field]:{}})` separately for `completedProvider`, `baseProvider`, `consumer`, `source`, `weights`, `lora`. Every call returned **`INVALID_MODEL_INPUT: Unknown or accessor model load field: <field>`** before any model preparation. A sampler call with `{completedProvider:{}}` returned **`TypeError: Unknown or accessor sampler preparation field`** before I/O. No model load or inference was attempted.

## Current manager adoption and preserved acceptance

`docs/shared/ai-connection/adapters/lora-standalone/native.mjs:7,18–33` pins/authenticates the actual owner closure and exports the SDK plus development-only provider/reference host. The warning at `:31` explicitly excludes real trained-base/model binding.

`adapters/lora-standalone/adapter.mjs:21–26` requires explicit caller provider and conformant consumer. `:14` preserves `graphBinding:'UNBOUND'` and not-ready generation/model operations. `management.mjs:5,18` likewise reports unbound and rejects absent side bindings. `reference.mjs:7–20,28–38,51` uses fake model hashes and an independent development base/reference host for one target. None is a hidden real-model consumer.

Keep SDK adoption, standalone control tests, reference consumer acceptance, and the previous partial v2/P4 numerical/connection acceptance. This report establishes only the missing standalone-completeweights → **current full public model** route, and does not revoke those scopes.

## Exact missing owner API and implementation path

There is no already-existing manager-routing-only solution. The Diffusion owner needs to publish a versioned, real full-model standalone binding capability (names are for the owner to choose), tied to the same Worker/model session that owns `predict` and `sample`. Required behavior is concrete:

1. Expose the immutable original-base descriptor and bounded F32 block reads in standalone `describe/readBlock` coordinates, using the owner's actual decoded original source. Preserve original ownership, side identity, range checks and cancellation. The internal `readRows/readVector` source is available, but the public standalone provider is absent.
2. Expose a real `lora-standalone/1.0-draft.1` consumer with matching logical registry, retained package or independently owned final blocks, full declared-range normal validation, guarded atomic active-package publication, epoch, rollback and release. This consumer must govern the actual model source, not a reference host.
3. Install the existing `createCompletedModelWeightSource` into both sampler-owned model sources, route supported original coordinates to retained completed packages and leave unpatched originals intact. Publish a stable active snapshot for the duration of a prediction/sample. Bind package/registry/side and model session/epoch to the operation; invalidate any cached weights on a package switch (the candidate retains a head cache: `D/.../execution/model-head.mjs:39–54,74–76`; no cache-invalidate method is exposed).
4. Specify Worker transport for owned package data/capabilities. The owner may own the SDK in the same Worker or provide an explicit bounded capability/RPC protocol; raw host methods cannot cross current structured-clone inputs. This transport and lifetime contract must be supplied by the owner, not improvised in management.
5. Expose binding identity/epoch and cleanup state through the real public API so management can route `register/compose/prepare/stage/apply/restoreBase` and block stale/current operations without inventing receipts. Cancellation/unload/reload must release or invalidate bindings consistently with public Worker termination.

After that owner extension is frozen/adopted, management can bind HIGH/LOW side adapters to those owner provider/consumer capabilities and coordinate selection/apply/restore with the existing queue and snapshot machinery. Full route completion must be independently checked before any experimental LoRA transfer or full operation, as instructed. The present task can accurately implement/display a blocked reason and finish unaffected UI/routes; it cannot truthfully advertise this edge as connected from the frozen sources alone.
