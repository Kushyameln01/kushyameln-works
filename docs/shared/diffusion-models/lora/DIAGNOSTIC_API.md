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

Pointwise1,048,576 remains unchanged. Mean transforms have separate strict128 and64-element profile ABIs after E6; neither accepts the2,096,640-element production latent. Text512 tensor size is not governed by pointwise operation limits. No model graph partition/production VAE capability follows from this small diagnostic.

## Evidence and counterpart handoff

`development/ai-connection/l1-final-browser.json` records actual HIGH/LOW File decode → realORT/Hike validation, explicit F32 test changes, base restore, abort and API Worker/Port. All decoded selected F32 bytes match independent Python reference. The explicit changed weights are **consumer fixtures**, not a real LoRA product. `consumer-verification.json` separately records contract-only stage tests. `half-green.json` and base TAP are scoped independently.

Real LoRA original→LoRA-owned low-rank/diff/bias→this sink comparison, binding-aware partial planner, common adapter, all-target registry, production FP8 precision, full D1 graph and large VAE profiles remain pending. Public contract delivery does not mean GitHub Pages publication; asset allowlist/deployment is a separate action.
