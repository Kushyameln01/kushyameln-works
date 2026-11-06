# Diffusion operational investigation — 2026-11-04 UTC

Initial scope: read-only source inspection, bounded known-path asset discovery, fixed-source integrity, focused Node checks. Subsequent authorized implementation adds only the mean management service and focused tests described below. No downloads, model loading, NN, LoRA transfer, full experiment, or commits were performed. Checkout: `/workspace/work/ai-connection/full-route-r17/checkout`, starting `e1661e5`, branch `codex/management-full-route`.

## Ready for actual UI wiring

Use `docs/shared/ai-connection/adapters/diffusion-public/adapter.mjs` export `createDiffusionPublicManagement()`. Omit `api` and `environment`; the ordinary path uses actual adopted `createDiffusionModels`, real dedicated Worker, and native model owner. Providing `api` is a control seam and marks `controlTestDouble:true`.

- `load({files:{HIGH,LOW},resource:{wasmThreads:1},requestId?,signal?,onProgress?})`: actual immutable File/Blob pair, default thread count 1. 4 requires real COI and SAB and has no fallback. Full pair must be retained after successful request termination; request release does not unload weights.
- `modelStatus`, `unload`, `dispose`: real state/resource/lifecycle calls. `unload` ends the model Worker; next load creates a replacement Worker. Same API instance can reload. `dispose` is final.
- `predict({input:{side:'HIGH'|'LOW',shapeRequest,tensors,conditioning,timestep,modelSessionId?},...options})`.
- `sample({input:{shapeRequest,tensors?,noise,positive,negative,modelSessionId?},...options})`.
- `saveTensor({tensor,...options})` returns canonical `bytes:Uint8Array`, byteLength, sha256, metadata. UI must download/write these bytes. `readTensor({file,...options})` reads the actual selected File/Blob, not the existing memory tensor. A fresh disk File selection is needed to evidence disk readback.
- `restoreArtifact(artifactId)` creates independent tensor copy; `releaseArtifact` releases it.
- `cancel(manager.inspect().activeTarget)` requires the complete current target and waits for original terminal. Actual active native cancel terminates its Worker, clears loaded session, sets reloadRequired. Retry needs paired load, not status-only recovery. Old modelSessionId must fail. Aborting queued work before dispatch does not terminate a healthy model.

Success returns `{status:'EXECUTION_COMPLETED',result,...result,normalExecution,snapshot?,artifactRecord?,nativeReply,target,terminal,...flags}`. `inspect()` exposes loaded/cleanupRequired/reloadRequired and exact activeTarget. Render current flags, not stale lastStatus. Progress callback gets native envelope; `event.result` is progress body and includes session/epoch. For sample use `stage:'step-complete'`, `step` 0..5, `steps:6`, `side`; inner model stage is `event.result.model.stage`. Before terminal, cancel must use currently observed target rather than retained earlier target.

## Tensor and latent behavior

Native canonical `deriveWorkflowShapes(shapeRequest)` determines target/context requirements and order. Do not pad, resize, reorder, pack, or rename tensors in management. Native runtime performs exact numeric validation; manager.query is structural admission, not numerical acceptance.

- Latents are compact nonshared finite `Float32Array`, NCTHW `[1,16,T,H,W]`, exact requirementId and canonical order. Target input meaning is `bernini-generated-model-latent:v1`, normalization `wan21-comfy-f32-v1`; target must not carry posterior-mean profile or latentContract. Context inputs can be canonical normalized posterior means; native owner also accepts explicitly raw posterior-mean input under its own validation/normalization rules.
- `noise` is explicit compact nonshared finite F32 with target element count; no RNG/seed port. If contexts exist, provide exact target plus ordered context tensors. Omitting tensors yields zero target only for no-context shapes.
- Conditioning must preserve native Text metadata, `float32`, BLC `[1,L,4096]` (1<=L<=512), compact F32 data, compact Uint8Array attentionMask length L, mask 0/1 with active row, exact Text model/tokenizer identities. Canonical sampler requires `umt5-final-rmsnorm-f32-v1`. Preserve all 512 rows for L512. Positive and negative are separate owned packets. CFG is fixed 1: negative is structurally validated but negative NN pass is skipped.
- Scheduler is fixed Euler/simple6/shift5/split3, HIGH3 then LOW3. No scheduler/settings port exists.
- Predict output is `float32` NCTHW `bernini-flow-velocity:v1`.
- Sample output is `float32` NCTHW `wan21-raw-generated-sample:v1`. Its latentContract is generated-sample / raw, exact VAE and producer identities, normalization `wan21-comfy-f32-v1`, state restored, owner diffusion_models. Do not apply posterior-mean restoration again or change its meaning. Preserve execution separately as sidecar.
- Canonical codec is WKTSR001 with 64MiB encoded-file cap. save/read preserve sample metadata and latentContract; runtime handles/receipts are not tensor payload.

## Fresh source/check results

`native.mjs` successfully imported and verified SOURCE.json plus all 150 adopted files, totaling 14,330,041 B; owner build inventory count 144. Source pin `ffeeeedb6b57d182a977c3ac02c042ce235fc87a`; build `diffusion-models/0.1+9c5d8d18e9a7b046d7768c8c32ca6a48eaa084c900e916d59d63e735ebeb2a20`.

Adoption retains nested original `docs/shared/...`, `tools/...`, and development paths. An additional literal-reference check inspected 246 relative import/new-URL references in manifest MJS files: 0 missing files. This is static source integrity, not an NN run or complete dynamic-reference proof.

Executed `node --test --test-isolation=none tools/ai-connection/test-diffusion-public-adapter.mjs tools/ai-connection/test-diffusion-public-native.mjs`: **19/19 PASS**, 0 failed/skipped. This is management control/native source testing, not actual NN acceptance.

No focused adapter bug requiring changes was identified in this investigation.

## Actual assets still unavailable

Bounded `rg --files --hidden` search under `/workspace/work` and `/tmp` excluding .git/node_modules, known-path stat checks, and large-file metadata search under `/workspace` and `/tmp` found no complete required HIGH/LOW pair or original N5 input manifest. No holder connection was found in those bounded local inputs. This does not establish global absence or access to an external holder.

Required complete originals are 15,574,833,216 bytes each:

- HIGH `Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors`, declared SHA `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52`.
- LOW `Bernini_LOW_fp8_e4m3fn_scaled.safetensors`, declared SHA `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3`.

`/workspace/retained/bernini` absent; `/tmp/d1-d4-real-l512-n5-inputs/inputs.json` absent; `/workspace/diffusion-private-hidden` absent; `/tmp/p4-real-text-l512` absent. The single 13,828,899,376 B `/workspace/work/ai-connection/e1-adopt/inputs/base-cache/wan2.2_bernini_r_high_noise_fp8_scaled.safetensors.part` is incomplete and cannot stand in for either original. Existing 1,244,141,856 B Bernini Light HIGH/LOW files are LoRAs, not base models.

Real saved L512 Text packet still available at `/workspace/work/ai-connection/p4-r11/runner/plain-conditioning.wktensor`: freshly observed 8,390,054 B and SHA `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9`. It alone does not replace N5 target/context/noise values or base models. Existing `ASSET-AVAILABILITY.md` records input manifest contract and owner non-NN small-input preparation route; no regeneration occurred here.

Actual acceptance remains blocked at complete pair load -> native predict/sample -> actual NN cancel -> Worker close/reload -> sample completion -> actual generated output disk save/fresh File readback -> pair unload/dispose. No actual pair/NN operations were attempted. Existing control11 and Node19 evidence does not close this boundary, and old 4-thread COI numerical results do not establish current one-thread no-COI management execution.

## Current LoRA owner boundary

The adopted public model adapter's strict load fields are files/file/resource; strict predict/sample fields are those listed above. Its actual full sampler's options also have no LoRA SDK provider/consumer port. It does not expose `lora-standalone/1.0-draft.1` baseProvider/consumer from the loaded pair. Unknown fields are rejected.

The native API includes legacy `loadLora/listLoras/readLora/readLoraSource/unloadLora` byte/source binding operations marked applied:false. The adopted `lora/v2-adapter.mjs` is explicitly `lora-connection/2.0-draft.1`, PARTIAL 16-row Q diagnostic projection requiring reference/tolerance; it is not current standalone full model application.

Consequently management must not attach standalone SDK plans to public full sample by inventing key maps or claiming these byte/diagnostic APIs are a full consumer. Native Diffusion owner must provide a conforming current standalone base provider, registry identity/shape contract, consumer prepare/validate/commit/rollback/lifecycle and actual graph-bound use, or return an updated public owner contract. Mapping, arithmetic, base decode and graph application stay with owners. No LoRA transfer or experiment is needed to establish this missing API boundary.


## Authorized mean normalization runtime addition

Added only `docs/shared/ai-connection/adapters/diffusion-public/normalization.mjs` and `tools/ai-connection/test-diffusion-public-normalization.mjs`. The service reuses unchanged `createNormalDiffusionOwner`, `createNormalRequestDescriptor`, and `createNormalOperationAdapter` with this adopted native module, explicit current sourceRef, and the adopted tree's interop/latent namespaces. It performs no tensor arithmetic or schema mapping. The independent real factory has a distinct API session and no model weights.

API: `await createDiffusionMeanManagement({managerSessionId?})`; `execute({operation:'normalizeRawMean'|'restoreRawMean',input:{tensor},signal?,onProgress?,requestId?})`; `query({operation,input})`; `cancel(inspect().activeTarget)`; `inspect()`; `dispose()`. Native mean owner currently emits no progress events. Successful results expose native `tensor`, complete native `result` (with owner evidence restored from its retained diagnostics), actual normal snapshot/target/terminal, and `inputMetadata` sidecar. Native output tensor fields are not invented. Preserve source frame/time/processing/evidence extensions via `inputMetadata` when native mean output omits them. Unsupported shapes return the native-owner support response/reasons unchanged (including OWNER_SHAPE_UNSUPPORTED), not an inferred full-shape capability.

An actual browser concurrent-call probe exposed an existing reused host/owner race: releasing request A's API allows queued B's support query to replace the session before A's result adoption, yielding NORMAL_STALE. The new wrapper sequences execute/query through adoption and diagnostic copy so API session replacement happens only afterward; existing common/old pinned files were not modified. Caller tensors are captured before that wait. Disposal immediately closes the reused host and rejects pending wrapper actions.

Fresh verification after this fix: 30/30 Node tests passed across public adapter/native/new mean service/existing normal owner; git diff --check clean. Actual loopback headless Chromium at COI:false executed adopted Worker + Hike normalization and restoration of synthetic rectangular raw128 `[1,16,1,2,4]`, preserved caller values/metadata sidecar, rejected `[1,16,21,60,104]` with OWNER_SHAPE_UNSUPPORTED, and completed two concurrent caller requests with valid original terminals. 4 actual Workers created and 4 physical closes observed. This is real Hike small-profile operation, with synthetic values; no NN or full/81 acceptance. Private reproducible harness `/workspace/work/ai-connection/full-route-r17/verify-diffusion-mean.mjs`; receipt `/workspace/work/ai-connection/full-route-r17/diffusion-mean-browser.json`.
