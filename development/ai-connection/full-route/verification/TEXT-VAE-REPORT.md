# Latest Text/VAE adoption investigation

Distribution source: `badff7a436b56207a084c4c770e01490899a576c`, repository `Kushyameln01/kushyameln-works`. Management baseline inspected: `e1661e561dfb1a4f20544ff48bc375175b5981d1`. Investigation used Git bytes and existing management code; no NN, export, model download, or model-payload read.

## Recommended integration interface

Adopt the actual source tree under `docs/shared/ai-connection/native/text-vae-badff7a/`, preserving its internal `docs/shared/inference` and `docs/shared/vr180` paths. Expose ordinary operations in `adapters/text-vae-standalone/` through one management-facing factory with independently owned Text/VAE instances, configuration revision, current request ID, cancellation barrier and save-publication revision. Keep cross-module serialization in management. Actual native factories are independent and may share a client only when a shared busy executor is desired.

Native public namespace `docs/shared/inference/api.mjs` exports:

```js
API_VERSION === 'works-ai-1'
createTextEncoderModule({client?, ownsClient?})
createVaeModule({client?, ownsClient?})
createInferenceAPI(options?)
encodeTensor(tensor)
decodeTensor(bytes)
describeTensor(tensor)
snapshotTensorMetadata(tensor)
requireTensor(tensor)
```

Text: `configure({manifest, files:Map, diagnostics:false})`; `capabilities({operation:'encode',input})`; `encode({text})` or `encode({tokenIds,attentionMask})`; `cancel()`; `dispose()`. Plain text returns L512, SentencePiece+EOS1+PAD0, no BOS, rejects overflow. ID mode preserves exact L1..512 and mask, with IDs0..256383 and at least one active mask position. Normal result `{tensor, attentionMask, inputMode}`. Tensor is FP32 BLC `[1,L,4096]`, meaning `text_hidden_states`, model/tokenizer identities and `umt5-final-rmsnorm-f32-v1` marker. Preserve the tensor mask and normalization into consumer/saves; do not use older interop convenience encoders that drop these fields.

VAE: `configure({manifest,files:Map,diagnostics:false})`; `capabilities({operation,input:descriptorWithoutData})`; `encode(tensor)`; `decode(tensor)`; `cancel()`; `dispose()`. Use native capability support and exact requested shapes; no management rewrite to a smaller F/H/W. Normal result `{tensor,inputDescriptor,binding,processing}`. Stream kind `wan21-vae-stream-v1`, profile `wan21-raw-f32-stream`; encode `[1,3,F,H,W]`, F1..81, spatial16..848 in16 increments; output `[1,16,1+floor((F-1)/4),H/8,W/8]`. Decode raw latent `[1,16,T,h,w]`, T1..21, output `[1,3,1+4*(T-1),8h,8w]`. `raw-decoder-rgb`/`rgb-unit` encode; `raw-posterior-mean`, independent `wan21-raw-latent:v1`, or properly restored `wan21-raw-generated-sample:v1` decode. Normalized mean is rejected by raw decode.

Use dedicated `createInferenceClient({onState})` per module to publish actual native progress; `onState` receives `{status,module,operation,inputRevision,progress,error}`. It creates a fresh Worker per native request and terminates it before success/failure settlement. Cancel terminates current Worker and rejects the original promise; retry can use the same configured module. Reconfigure cancels same-module running work; stale result checks exist inside each native module. Disposal is terminal. Management still guards save publication after `encodeTensor()` resolves because codec digest is not cancelled by module cancel.

Native VAE binding check must select role IDs using actual `requiredStreamAssets(manifest,operation)` from `vae-stream.mjs` for stream manifests, or legacy fixed roles for profile manifests. Binding includes `operation`, `kind`, exact input/output shapes, `assetsVerified`, `assetHashes`, `graphMetadataChecked`, `executionProvider:'wasm'`, explicit threads. Retain native `processing`, inputDescriptor and runtime observation; they are useful provenance, not independent numerical acceptance.

## Source/runtime closure

Actual browser runtime closure is 18 files / 13,276,703 bytes before license files. Keep all static imports plus explicit Worker/WASM URLs. No package install or CDN is required.

- `docs/shared/inference/api.mjs`
- `docs/shared/inference/client.mjs`
- `docs/shared/inference/hike.mjs`
- `docs/shared/inference/inference-worker.mjs`
- `docs/shared/inference/kernel/tensor.wasm`
- `docs/shared/inference/tensor.mjs`
- `docs/shared/inference/text-encoder-api.mjs`
- `docs/shared/inference/text-encoder.mjs`
- `docs/shared/inference/text-job.mjs`
- `docs/shared/inference/tokenizer.mjs`
- `docs/shared/inference/vae-api.mjs`
- `docs/shared/inference/vae-stream.mjs`
- `docs/shared/inference/vae.mjs`
- `docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs`
- `docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm`
- `docs/shared/inference/vendor/ort.wasm.min.mjs`
- `docs/shared/inference/vendor/sentencepiece.mjs`
- `docs/shared/vr180/sha256.mjs`

Also retain Hike/ORT/SentencePiece licenses and vendor notices/license-sources from the source tree. `kernel/runtime.js` is not imported by this runtime path. `sentencepiece.mjs` embeds its own WASM; no extra tokenizer runtime file is referenced. Runtime Hike hash is `9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8`. ORT WASM1.24.3 is local. Stream threads4 requires both actual COI and SharedArrayBuffer and refuses thread fallback; server should supply COOP/COEP if this option is offered.

Private asset configuration is separate from the source closure. Keep browser File/Blob identity; do not arrayBuffer the 6.7GB Text source globally.

Text selected manifest: `development/inference/standalone-20261102/text/full512-conditioning/diagnostic/prepared-model-manifest.json`, 19,908B, SHA256 `aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f`. Required assets:24 prepared ONNX blocks (18,523,750,008B), `final-norm.f32`16,384B, `embedding-row-sha256.bin`8,204,288B, original `umt5_xxl_fp8_e4m3fn_scaled.safetensors`6,735,906,897B, plus `spiece.model`4,548,313B for plain text. The manifest fixture references/native oracle files are not runtime dependencies. Runtime verifies block/norm/row hash bytes and individual selected embedding rows; it does not rehash the entire original source. Original Text model identity `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`; tokenizer `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`.

VAE stream manifests: `development/inference/standalone-20261102/evidence/vae-stream-manifest.json` (51,613B; SHA256 `64c57a7aeb5e8fcb5089b8d5771ce293b8355e365f2fd5cfe80df0840ca85345`) or `vae-stream-threads4-manifest.json` (same size; SHA256 `532523034a5e5c7590c4fca11d67feec329c6e0e364afd55f472f03ffd8966d2`). Both reference identical69 graph+2 conv2 asset bytes totaling507,834,866B. Per-operation capabilities require only the program's actual dependency roles. Original VAE253,815,318B is provenance/export input, not runtime-loaded asset; decoder model identity `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`.

## Existing adapter distinctions and normalization bridge

`normal-vae-owner.mjs` is the old498eb25 fixed-profile facade. Its invoke hardcodes encoder/decoderBody/conv2 asset roles and drops `processing`; a new stream facade is required, or carefully isolated extension with source parameterization. `normal-operation.mjs` expects common tensor artifact(s), owns queue/snapshot/release, and is currently awkward for Text's ordinary `{text}`/IDs input. A focused new standalone adapter can keep ordinary Text input without manufacturing tensor input proof, while retaining the lifecycle pattern.

The existing management Diffusion source `native/diffusion-ffeeeedb/.../latent-space/latent-space.mjs` supports only three small fixed mean shapes: `[1,16,2,2,2]`, `[1,16,1,2,2]`, `[1,16,1,2,4]`. Existing `normal-diffusion-owner.mjs` further selects advertised fixed `rawMeanProfiles`. Neither can be silently treated as a general stream-size normalization bridge. Its transform copies only context and drops frameProcessing; its convenience interop encoders also drop newer marker/context fields. Stream normalization/restore must use the latest adopted Diffusion owner's actual broader contract (if present), or explicitly report unsupported. Management must not reproduce normalization arithmetic, relabel a normalized tensor as raw, or invent producer restoration receipts.

## Saving and acceptance limits

Use latest native `encodeTensor`/`decodeTensor` directly. WKT magic `WKTSR001`, schema1, little endian typed payload, full data SHA256. Saves preserve supplied model/tokenizer/mask/normalization, strict native context, generated latentContract and frameProcessing. Source F4/F80 preserve unused tail, consumed context and full sourceContext; do not flatten this into management fields. Outer save package should retain VAE inputDescriptor, binding, processing, sourceRef, selected config/asset metadata and management workflow trace separately. Strict native context rejects unrelated management fields.

Read API.md, TEXT-RESULT.md, VAE-RESULT.md, STATUS.md and relevant source from exactbadff7a bytes. Text T1/T3 complete; Text T2 has one known failing all-active512 ID case (maxAbs0.0016480088233947754 >0.001). VAE required selected standalone cases are accepted, including target81 and848², but the whole declared domain/real media/generated sample/workflow is not accepted. Distribution sourcebadff7a is distinct from historical numerical execution sources. No ordinary configure/encode/decode request should require independent references, gates, fixed prompt hashes, past receipts, or another owner's ACK.

## Implemented handoff

Implemented in the assigned shared checkout, without commits:

- `docs/shared/ai-connection/native/text-vae-badff7a/`:18 runtime files,6 license/notice files,3 exact owner configuration manifests;27 files/13,746,814B plus generated `SOURCE.json`. Relative import/Worker/WASM paths remain intact. Bootstrap pins SOURCE.json SHA256 `48e98b67b7f6d1a04a8fbc412a70d0bc2a7fb71468acdc751e65752f647d3a47` and verifies each listed file.
- `adapters/text-vae-standalone/native.mjs`: exact native factories/client/codecs, source verification, manifest reader and adoption inspection. No API doubles in the default path.
- `adapters/text-vae-standalone/management.mjs`: `createTextVaeStandaloneManagement({kind,configuration,onProgress?,controlOnly?})`; `execute({operation,input,requestId?,signal?,onProgress?})`, synchronous native `query({operation?,input?})`, `configure`, exact-target `cancel`, `recover`, `dispose`, `inspect`, `subscribe`. Explicit `controlOnly:{clientFactory}` seam is marked in observations/results. It still uses actual native factories/validators and is only for lifecycle tests.
- Execute returns `{status:'EXECUTION_COMPLETED',tensor,result,target,terminal,sourceRef,controlOnly,generationReady:false}`; retains the whole native result including VAE processing/inputDescriptor/binding. Uses common `createInvocationQueue`, native Worker termination/terminal boundary, native dispose release barrier, cleanup quarantine and recovery. Snapshot remains root coordinator ownership; this focused adapter does not manufacture a fake Text tensor descriptor or snapshot.
- Source verification file: `/workspace/work/ai-connection/full-route-r17/text-vae-source-verification.json`; all27 delivered files equal exact Git bytes.

Verification: focused10 tests PASS, queue24 PASS, snapshot28 PASS, normal-operation11 PASS; `git diff --check` clean. All invoked as direct `node tools/ai-connection/test-....mjs` because this environment's `node --test` child reporter only returned an opaque child failure, while direct node executes the same Node test suites and prints complete outcomes. Focused cases cover native ordinary support, queue serialization, exact stale-target cancellation/retry, cleanup quarantine/recovery, progress observer isolation, valid/invalid reconfiguration, queued AbortSignal cancellation, independent raw stream decode support, actual stream binding/tail metadata, and codec marker/frameProcessing ownership. Actual NN/model loading was never invoked; controlled outputs are explicitly transport/lifecycle evidence and do not add numerical acceptance.

Review corrections: focused suite now16 PASS. Reproduced and fixed configure/recover racing disposal: lifecycle transitions are serialized and disposalRequested becomes terminal immediately, so a superseded transition rejects TEXT_VAE_DISPOSED instead of creating another native client/queue. Successful disposal clears the retained configuration/File Map; failed disposal remains terminal and permits disposal retry without reopening. Reproduced shared input mutation across a queued boundary: structuredClone alone shares SharedArrayBuffer storage, so snapshotInput now replaces cloned SAB buffers/views with independent nonshared bytes while preserving typed-array classes before enqueue. Both Text IDs/mask and VAE FP32 payload have queued-mutation regression coverage. Progress publication rechecks record revision/signal/cancellation/terminal state between global callback, request callback and each subscriber; cancellation before native ingress prevents dispatch and leaves queue reusable. No native/source mirror files changed in these review corrections. Final `git diff --check` clean; no broad suite was rerun during the failing reproductions.

Terminal disposal also clears the observable recovery requirement after successful cleanup of a previously quarantined queue; the retired queue history remains available for audit. This has a separate regression test.
