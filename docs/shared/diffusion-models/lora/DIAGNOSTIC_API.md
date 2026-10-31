# L1 Diffusion diagnostic contract 0.1

Status: implemented for an explicit **PARTIAL** Q-projection slice. No full-model load/predict/sample, no full LoRA coverage, no SDK v1 apply compatibility, no generation snapshot publication. Low-rank multiplication remains owned by LoRA.

## Execution and precision

- ES modules, same owning page/Worker. Independent of the management tool and Text/VAE. Functions, AbortSignal and opaque handles are not MessagePort payloads.
- Original target `blocks.0.self_attn.q.weight`, full `[5120,5120]`; selected 16 consecutive output rows, all5120 columns. Bias original `[5120]`, same selected rows.
- Storage `F8_E4M3`, per-tensor scalar `weight_scale:F32`, config `{"format": "float8_e4m3fn"}`. Profile `scaled-e4m3fn-scalar-f32-v1`: real Hike E4M3FN decode and f32 multiply by scale. Reject NaN codes, nonfinite/invalid scale. Bias F16→F32 is a separate real Hike DecodeF16 path.
- Compute in this diagnostic is F32 Gemm in ORT WASM1.24.3, then real Hike F32 bias. This is not a claim of original FP8 scaled_mm/activation-quantization or workflow precision equivalence. No re-quantization, approximation, model replacement or change to sampling profile.
- Actual graph hash `af48828a7e93d75f529cee34c9b609cf4c3748f095a2c6fb3d5f1d71424988b0`, fixed graph weight is a **runtime input**, not an initializer. Bias binding is **hike-parameter**. There are no initializer bindings in this limited registry.

## Immutable base and registry

```js
import {createBerniniDiagnosticBase} from './diagnostic-base.mjs';
const base = await createBerniniDiagnosticBase({file: originalBaseFile, side:'HIGH', rowStart:0});
const registry = base.describe(); // owned metadata copy; scope PARTIAL
const identity = {modelHash:registry.modelHash, graphHash:registry.graphHash,
                  registryHash:registry.registryHash};
const weight = await base.baseProvider.readBlock('q.weight', 0, 81920,
                                               {...identity, signal});
const bias = await base.baseProvider.readBlock('q.bias', 0, 16,
                                             {...identity, signal});
```

`hikeBytes` may be supplied explicitly; otherwise the pinned local Hike asset is fetched. Initialization verifies strict header hash/file size against the selected HIGH/LOW, original shapes/storage types, actual27-byte config and actual scalar scale. `modelHash` is the expected full original identity; `baseVerification.fullFileSHA256Verified:false` explicitly says these checks do not rehash/authenticate all15.57GB. Reuse an owner-held valid full-hash receipt only with its bound immutable original; never turn caller-declared hashes into a production ready proof.

Registry schema `bernini-diagnostic-registry/0.1` includes modelHash/side, actual graphHash, registryHash, executionProfileId, fp8ProfileId/config hash, targets and coverage. Each target includes originalKey/key/weightId, **fullShape** and selected **shape**, storageDtype/computeDtype, layout, binding, transform, payload offset and source element mapping. Weight fp8 includes scale key/shape/dtype/value and actual scale-byte hash. `transform` is row-slice, rowStart0..5104, rowCount16, columns0..5119, no transpose. Changing rows/profile/scale/binding without recomputing registry digest is rejected by the consumer.

`registryHash` is SHA-256 of UTF-8 canonical JSON of the entire descriptor excluding `registryHash`. `diagnostic-identity.mjs` sorts object keys by UTF-16, keeps array order, uses ECMAScript finite-number serialization, rejects malformed Unicode/undefined/sparse arrays. Restricted registry fixtures cover these JCS rules. It is a native registry digest, not a management snapshot hash.

Read offsets/counts are **elements inside the selected slice**, not full original tensor offsets. Original mapping stays in registry.source/transform. Count1..81920 for weight and1..16 for bias, within selected bounds; no zero reads. All3 identity hashes are required. Returns an independent finite `Float32Array`; no WASM pointer escapes and no patched value is used as base. Reads serialize and honor abort before/after asynchronous boundaries; a bounded synchronous Hike call finishes first. `base.stats()` reports read hashes and fixed Hike counters, not full-model proof. `dispose()` invalidates future reads and drops owned references; it does not close another module or guarantee immediate OS return.

## Private bounded original-base fragments

`base-block.mjs` adds `createBerniniBlockProvider({artifact,side,hikeBytes?,signal?})` for a receiver that has the selected raw ranges but **does not have the original full model File**. It returns the same `describe()/baseProvider.readBlock()/stats()/dispose()` boundary used above. `diagnostic-base.mjs` and its whole-File contract are unchanged. This transport is fixed to original rows0..15 (exclusive end16), all5120 columns; it does not expose the other rows or manufacture an original-sized Blob.

The private JSON format is `bernini-diagnostic-base-block/0.1`:

```typescript
type BaseBlockArtifact = {
  schemaVersion:'bernini-diagnostic-base-block/0.1';
  scope:'PARTIAL'; fullFileHashRecomputed:false;
  sides: Partial<Record<'HIGH'|'LOW', {
    registry: DiagnosticRegistry; // exact native describe(), digest included
    source:{name:string; fileBytes:number; modelSha256:string;
      priorOwnerReceipt:{kind:'retained-download-manifest';
        manifestSha256:string; sha256:string; verified:true;
        verification:'PRIOR_OWNER_RECEIPT_NOT_REHASHED';
        authenticity:'not-independently-certified'}};
    ranges:{id:'header'|'q.weight'|'q.bias'|'weight_scale'|'comfy_quant';
      absoluteByteOffset:number; byteLength:number; sha256:string;
      encoding:'base64'; data:string}[];
  }>>;
};
```

Each side contains exactly those five ranges, in that order: original header181,280 bytes at file offset8, selected FP8 Q81,920 bytes, F16 bias32 bytes, F32 scalar scale4 bytes and quantization config27 bytes. Every payload range has its **absolute original file offset**, actual byte length and SHA-256. The range hashes are hashes of raw bytes, not registry/canonical metadata hashes. `registry` keeps original full shapes and the same original model/graph/registry identity as the whole-File provider. Missing, additional, reordered or out-of-source ranges are refused.

Initialization snapshots caller metadata, base64 strings and supplied kernel bytes before its first await. It enforces a JSON byte budget below1MiB, canonical base64, every provided range digest, pinned original header/side, strict selected tensor descriptors/full shapes/offsets, scalar scale and27-byte config, the native registry digest, and a complete reconstructed-registry comparison. Re-signing an incorrect row/scale/source mapping with a new digest does not make it valid. Only real Hike FP8/F16→F32 conversion is used; no JavaScript numerical fallback or low-rank multiplication is added.

```js
import {createBerniniBlockProvider} from './base-block.mjs';
const bytes = await privateArtifactFile.arrayBuffer();
// expectedArtifactSHA256 comes from the original owner's private delivery receipt.
const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(v=>v.toString(16).padStart(2,'0')).join('');
if (actual !== expectedArtifactSHA256) throw Error('Private artifact identity mismatch');
const artifact = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const base = await createBerniniBlockProvider({artifact,side:'HIGH'});
const registry = base.describe();
const identity = {modelHash:registry.modelHash,graphHash:registry.graphHash,
                  registryHash:registry.registryHash};
const weight = await base.baseProvider.readBlock('q.weight',0,81920,{...identity,signal});
// Pass base.baseProvider and registry to the unchanged consumer below.
// Receiver teardown after consumer/stage cleanup:
base.dispose();
```

Reads require the same3 hashes, selected-slice element bounds, nonzero counts and AbortSignal behavior as the original provider. They return independent F32 copies, serialize access, reject after disposal and reuse fixed Hike workspace. Abort is cooperative around the bounded synchronous Hike call and asynchronous digest boundaries. `stats()` explicitly reports `source:'bounded-fragment-artifact'`, `fullFileHashRecomputed:false`, `fullFileSHA256Verified:false` and `unprovidedRangesAvailable:false`. The source whole-file size/hash in metadata is provenance, not a capability to access15.57GB or a fresh proof of that entire file.

An original owner creates a **new private output outside any Git repository**:

```sh
node tools/diffusion-models/export-e1-base-block.mjs \
  --models /absolute/original-model-directory \
  --output /absolute/private/new-base-blocks.json
```

The source directory must contain the original HIGH/LOW files and matching retained `manifest.json` prior-owner full-hash receipts. The exporter reuses the existing whole-File factory to produce the native registry, reads only actual bounded ranges, and checks opened inode/device/size/mtime/ctime around each read. Its Node-only fs-backed Blob adapter avoids Node24 `openAsBlob`'s >4GiB size truncation; it never materializes the whole model and does not change the browser File API. Relative paths, repository/symlink-to-repository outputs and existing-file overwrite are rejected. The artifact file is written with mode0600 and is never added to the public asset list.

The first actual two-side artifact is709,364 bytes, SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`. Export read889,164 actual source bytes total, at most181,280 per read; no original full-file rehash occurred. Obtain raw payload only through the original owner's authorized **private artifact delivery**, verify that delivery's file hash, and keep it separate from this public code/recipe/receipt. A prior-owner receipt is not independently authenticated by this module. Header/range verification, prior full-file receipt, delivery provenance, real LoRA joint application and full model acceptance remain different evidence scopes.

Current handoff status: the raw artifact is prepared privately; disclosure to the LoRA recipient through a shared Page is pending explicit sharing approval. Private owner-side storage/retrieval checks, if recorded separately, do not prove that recipient handoff is complete. This public contract contains only schema/recipe/hash/bytes and scoped results; it contains no private Library reference or raw payload.

Selected side initialization decodes263,263 bytes of provided raw ranges; after validation it retains only81,952 raw Q/bias bytes plus metadata and Hike Memory. The private JSON, base64 strings, parsing/snapshot objects, transient header, hash buffers and F32 copies add to this amount; the1MiB format budget is not an RSS peak guarantee or a change to tensor-operation limits.

Reproduce the independent fragment checks and unchanged consumer's real WASM path:

```sh
BERNINI_E1_BLOCK_ARTIFACT=/absolute/private/base-blocks.json \
  node --test --test-isolation=none docs/shared/diffusion-models/lora/test-base-block.mjs
node --test --test-isolation=none tools/diffusion-models/test-export-e1-base-block.mjs
python tools/diffusion-models/test-base-block-browser.py \
  --artifact /absolute/private/base-blocks.json --output /absolute/private/block-browser.json
```

Node fragment tests compare both sides' decoded weight/bias hashes against the existing independent original-base reference. The browser receives only the small artifact File, then runs real Hike→owned F32→unchanged consumer `prepareBase/validate/commit`→ORT WASM→Hike, with all16 outputs compared to independent references. It also checks cancellation/re-execution, binding/range refusal and workspace reuse; no original model File or `.safetensors` request is supplied. Evidence: `development/ai-connection/e1-block/`. No real LoRA product or low-rank arithmetic is used in this fragment-provider test; the LoRA owner's joint E1 test remains separate.

## Owned sink and candidate consumer

```js
import {createDiagnosticConsumer} from './diagnostic-consumer.mjs';
import {createOrtProjectionStage} from '../ort-bridge/stage.mjs';
const stage = await createOrtProjectionStage(); // caller owns this actual ORT/Hike stage
const target = createDiagnosticConsumer({registry, stage, baseProvider:base.baseProvider});
const manifest = {...identity, side:registry.side, scope:'PARTIAL'};
const context = {...manifest, signal, isCurrent:() => applicationStillCurrent()};
const sink = target.createSink();
await sink.begin(manifest);
// LoRA owner supplies computed F32 blocks and hashes. No low-rank math here.
await sink.writeBlock({weightId:'q.weight', offset:0, count:81920,
  shape:[16,5120], dtype:'F32', sha256:weightBlockHash, data:loraWeight});
await sink.writeBlock({weightId:'q.bias', offset:0, count:16,
  shape:[16], dtype:'F32', sha256:biasBlockHash, data:loraBias});
const handle = await sink.finish(manifest);
const candidate = await target.prepareLoad(handle, context);
await sink.release(handle); // candidate owns an independent feed copy now
const receipt = await target.validate(candidate, {...context,
  x:diagnosticActivation, expected:independentExpectedOutput,
  tolerance:{absolute:1e-6, relative:1e-5}});
if (!receipt.valid) throw Error('Diagnostic reference mismatch');
await target.commit(candidate, context);
await target.releaseCandidate(candidate); // active feed stays owned; rollback history dropped
const result = await target.run({x:diagnosticActivation, signal});
```

The caller must arrange try/finally: failed writes/finish → `sink.abort(error)`; every owned handle → `sink.release(handle)`; failed candidate → `target.rollback(candidate,context)`; owner teardown → `target.dispose()`, then `stage.dispose()`, then `base.dispose()`. Release successful candidate metadata after rollback is no longer needed. A signal may be aborted during cleanup: rollback may restore only its own current active candidate/epoch even after abort, and never overwrite a newer active feed. If the manager has moved to another application, cleanup cannot restore the old application.

Sink requires both selected targets fully covered with nonoverlapping blocks, exact dtype/selected shape, compact nonshared owned input and SHA256 of actual F32 bytes. Missing/duplicate/out-of-range/hash-mismatched blocks fail. `graphInitializer` is rejected. `finish` returns an opaque owned `runtime-feed-set`; it is **actually fed** to fixed ORT/Hike inputs, not an array dictionary pretending to be an ONNX initializer package. Its native packageHash hashes UTF-8 JSON of fields in fixed order schemaVersion/modelHash/graphHash/registryHash/side/scope/weightHash/biasHash. Management treats this as opaque native identity and uses its own canonical snapshot/package rules.

`prepareLoad` creates an isolated owned **feed-set candidate**, not a new14B NN session or initializer mutation. `validate` calls the actual stage, requires x[5120], explicit independent expected[16] and finite nonnegative tolerances, checks graph identity and every output, returns `bernini-diagnostic-validation/0.1` receipt with valid/scope/identity/hash/evidence. It does not return SDK v1 boolean true. Diagnostic success must not be adapted to full apply success or generation readiness.

`commit` requires a valid receipt, matching identity/epoch and `isCurrent()===true` immediately before its synchronous switch. `prepareBase(context)` rereads immutable base into a candidate; independently validate it, then commit for restoration. `rollback`/`releaseCandidate` are idempotent for released candidates, and reject or avoid affecting unrelated ownership. `run` checks owner state/active feed and returns actual stage output/evidence plus scope/epoch/package hash.

Direct consumer cancellation is cooperative around bounded ORT/async calls: it rejects the result after abort, not a promise of interrupting WASM midcall. `dispose` waits for owned pending hashes/runs to settle and never disposes caller stage/provider. Native Diffusion API cancellation terminates its **owned Worker**, rejects original Promise and recreates a Worker next time. Port detach is neither cancellation nor dispose. LoRA's v1 planner/new binding adapter and low-rank calculation are the other owner's work.

## Native F32 transport and resource bounds

`linearProjectionF32` in native `diffusion-models/0.1` accepts `{weight:Float32Array81920,x:Float32Array5120,bias:Float32Array16}` through existing JS/MessagePort request identity. It rejects noncompact/shared/detached/nonfinite before host dispatch. Inputs clone to Worker; stage snapshots before async ORT; Worker result transfers, Port response clones. It does not adopt a consumer candidate or apply a LoRA itself.

Known bounded buffers (not RSS/ORT peak):

| Buffer | bytes |
| --- | ---: |
| selected F32 weight+bias F | 327,744 |
| activation | 20,480 |
| sink buffers / per-element coverage | 327,744 / 81,936 |
| largest sink write owned snapshot | 327,680 |
| package→candidate owned feed copy | 327,744 |
| consumer→stage copied weight+bias+x per run | 348,224 |
| stage's independent input snapshot per run | 348,224 |
| provider Hike fixed Memory / arena | 1,572,864 / 491,648 |
| stage Hike fixed Memory / arena | 1,572,864 / 491,648 |
| output16 F32, each owned copy | 64 |

Active+previous/candidate feeds, caller retained arrays, raw read bytes, header/descriptor JS objects, pending package/hash copies and ORT internal Memory add to these quantities. Release unused candidate history/packages rather than accumulating them. `stage.runF32` still copies inputs even if consumer passed copies; both are counted. WASM grow occurs when constructing its arena; views are recreated after grow, and calls reuse fixed workspace. ORT allocator/runtime/RSS peak remains unmeasured. File references are not full weight arrays.

Pointwise1,048,576 remains unchanged. Mean transforms have separate strict F5/128, F1/64 and rectangular F1/128 profile ABIs after E6; none accepts the2,096,640-element production latent. Equal element counts do not make the two128 shapes interchangeable. Text512 tensor size is not governed by pointwise operation limits. No model graph partition/production VAE capability follows from this small diagnostic.

## Evidence and counterpart handoff

`development/ai-connection/l1-final-browser.json` records actual HIGH/LOW File decode → realORT/Hike validation, explicit F32 test changes, base restore, abort and API Worker/Port. All decoded selected F32 bytes match independent Python reference. The explicit changed weights are **consumer fixtures**, not a real LoRA product. `consumer-verification.json` separately records contract-only stage tests. `half-green.json` and base TAP are scoped independently.

The fixed2bba SDK regression is connected through [V2_ADAPTER.md](V2_ADAPTER.md), with separately scoped synthetic-source and actual-base-fragment tests. The current canonical registry/slice/transaction mapping belongs to the LoRA owner's `createDiffusionDiagnosticAdapter`; its fixed [fc278 joint report](https://github.com/Kushyameln01/kushyameln-works/blob/fc2789a0f649e33f15eb13750e6a983b5c52d170/development/ai-connection/JOINT-LORA-RESULT.md) records actual-original PARTIAL acceptance in that owner's scope. Those results are not a fresh run of this old regression path. An all-target registry, production FP8 precision, full D1 graph and large VAE profiles remain pending. Public contract delivery does not mean GitHub Pages publication; asset allowlist/deployment is a separate action.
