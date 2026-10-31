# Selected one-head streamed attention, contract0.1

This is an implemented selected F32 attention boundary, **not model predict/sample**. It accepts explicitly precomputed/fixture Q and K after QK-normalization/RoPE and V after value projection. It does not generate QKV, QK-normalization, RoPE, source IDs or a real model hidden state.

## Fixed semantics and shapes

- Q is a compact finite `Float32Array(2048)` representing `[16,128]`, one head, implicit batch1.
- All K/V rows are consumed in their declared order. `keyCount` is1..32760; each request is64 rows or an **exact smaller tail**. K32760 ends with56 rows. No phantom padding keys, window, mask, key selection, dropout or approximation is used.
- K/V are float32 `[keyCount,128]`. Logical key tile is `[count,128]`, with1<=count<=64. Query/key dimension128 gives `scale=f32(1/sqrt(128))=0.0883883461356163`.
- Actual ORT Web WASM1.24.3 evaluates F32 MatMul/scale, row ReduceMax/Max, Exp and alpha. Actual Hike evaluates online numerator/denominator recurrence and final division. No JS arithmetic fallback or custom Exp approximation exists.
- This is a declared F32 diagnostic profile; original backend/dtype/FP8 scaled_mm equivalence is unverified. All40 heads, all32760 queries, production QKV and combined core/staging/copy budget remain unverified. E8 stays BLOCKED.

The cap32760 is a selected target-grid key boundary, not the full original rv2v context sequence. A same-grid source context alone makes65520 keys before image references, beyond this module's cap. All keys means all keys in the explicit source descriptor; it does not certify that an unverified producer included every original model token.

The mathematical boundary is `softmax(Q K^T * scale) V`. Pinned ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`, `comfy/ldm/modules/attention.py:265,279–283,302,304`, supplies scale/FP32 score option/softmax/V equations. Wan `model.py:73–96` applies QK norm and RoPE before calling attention; those producers are outside this module. The source body/hash and exact reference are recorded under `development/ai-connection/e7-attention/`.

## Public source interface

```js
import {createStreamAttention} from './stage.mjs';
const attention = await createStreamAttention();
const source = {
  describe() {
    return {
      schemaVersion:'works-postnorm-rope-qkv/0.1', bindingId:'opaque-source-id',
      rows:16, headDim:128, keyCount:32760, dtype:'float32',
      querySpace:'post-qk-norm-rope', keySpace:'post-qk-norm-rope',
      valueSpace:'projected-value', mask:'none', dropout:0,
      provenance:{kind:'precomputed-tensors'}
    };
  },
  async readKV(offset,count,{signal}) {
    // The source owner supplies independently owned finite F32 arrays.
    // offset/count are key ROWS; k/v element counts are count*128.
    return {bindingId:'opaque-source-id',offset,count,
      k:ownedK,v:ownedV,kShape:[count,128],vShape:[count,128]};
  }
};
const result = await attention.run({q:ownedQuery,source,signal,onProgress});
await attention.dispose();
```

`describe()` metadata is cloned once and validated. Supported provenance kinds are `precomputed-tensors` and `explicit-fixture`; a declared kind is not a model/precision/residency proof. `readKV` must return the same binding and requested exact range; shape/count/finite/compact/nonshared constraints are checked. Unknown production provenance cannot make predict ready. Functions/AbortSignal are same-page/owning-Worker interfaces, not transferable MessagePort payloads.

The invocation acquires BUSY **before** argument destructuring, getters, source.describe/bind or any user callback. All preflight/error/success paths release it in finally. A reentrant run is rejected without touching the shared Hike state. Q is snapshotted before asynchronous work, every received K/V tile is copied before ORT, and outputs are owned copies. Sources must honor their own immutable binding and returned-buffer ownership; this module does not authenticate an entire external KV store.

`run` returns `{output,denominators,rowMax,evidence}`. Output shape is `[16,128]`, denominators/rowMax have16 elements. Evidence retains source metadata, exact keys/tiles/tail, graph/kernel hashes, scale, actual calls, timing and bounded-resource counters. Resource fields are scoped logical quantities, not a claim of full pipeline peak.

Signal cancellation is cooperative around each source/ORT/Hike tile: a current bounded synchronous call may finish, then its result is refused and no subsequent key tile is read. A later invocation resets the accumulator and can reuse the instance. Direct active dispose is rejected; cancel/await first. A failed ORT release retains its actual session/Hike references and blocks new runs with RECOVERY_REQUIRED; another dispose retries unfinished cleanup. References are cleared only after successful release. A caller needing immediate termination may own this module inside its own Worker. Port detach alone is not cancellation.

## Online recurrence and ABI

For every tile, ORT computes:

```text
score = f32(MatMul(Q,K_tile^T) * scale)
m_new = Max(m_old, ReduceMax(score, key_axis))
w = Exp(score - m_new[:,None])
alpha = Exp(m_old - m_new)
```

Hike computes, in ordered F32 operations, `numerator = alpha*oldNumerator + Σ_k(w_k*V_k)` and `denominator = alpha*oldDenominator + Σ_k(w_k)`. Final output is numerator/denominator. Each invocation starts with finite minimumF32 row maxima and zero numerator/denominator; the first alpha cannot add a phantom key because old denominator is0. Every key participates, including the exact tail. Floating reduction differs from a dense FP64 reference, so comparison uses a fixed pre-execution tolerance rather than bit-equivalence.

| Export | Parameters → status |
| --- | --- |
| Accumulate | weightsPtr, valuesPtr, alphaPtr, rows, logicalKeys, numeratorPtr, denominatorPtr → i32 |
| Normalize | numeratorPtr, denominatorPtr, rows, outputPtr → i32 |

Pointers are transient byte addresses in **this instance's Memory only**, aligned4 bytes forF32. rows1..16, keys1..64, head dimension128. The host owns disjoint arenas and checks lengths before calls. Status0 is success; -1 shape/capacity, -2 invalid finite/unit input or denominator, -3 nonfinite arithmetic/state. Failed update invalidates state until reset. Successful outputs are independent copies. No raw pointer crosses modules.

One fixed arena is53,376 bytes: weights4,096, values32,768, alpha64, numerator8,192, denominator64, output8,192. It grows Memory once at construction, then methods reacquire views after that grow and reuse it. Memory is1,114,112 bytes with the pinned compiler. Transient input arenas are zeroed after each update. This is not a whole-model Memory partition proof.

## Verification and builder

Independent Python dense FP64 reference uses the same explicit F32 input bytes, scaleF32, all keys and no mask/dropout. Gate is fixed before runtime comparison: `absError <= 1e-5 + 1e-4*abs(expected)`. It covers K64/120/32760 (2048 outputs each), uniform, cross-tile maximum updates and moderate-extreme logits. Browser cases also check exact tail, row denominator/max, input hashes/ownership, cancellation/reuse, reentrancy, finite/shape/binding/BUSY failures. Contract fixtures and actual model input are not conflated.

```sh
DIFFUSION_TOOLCHAIN=<pinned-toolchain> python docs/shared/diffusion-models/ort-bridge/stream-attention/build.py
node --test --test-isolation=none docs/shared/diffusion-models/ort-bridge/stream-attention/test-kernel.mjs
python tools/diffusion-models/e7-attention-reference.py --output development/ai-connection/e7-attention/reference.json
python tools/diffusion-models/e7-attention-browser.py --reference development/ai-connection/e7-attention/reference.json --output development/ai-connection/e7-attention/browser-green.json
```

The builder verifies pinned Hike commit/compiler hash and actual exports/imports, then emits WASM/WAT/registry/build receipt. Generated runtime whitespace is normalized by this owner builder and its digest is recorded; the WASM has no imports and the host instantiates it directly. The original deeply nested prototype caused a pinned WABT parser out-of-bounds failure; splitting unchanged F32 recurrence into helper functions built successfully. No alternate compiler, backend or numerical fallback was substituted. The exact parser root cause is not proven. See RESULT and receipts for adopted scope, copy/live/time/PSS and remaining blockers. The native owner builder `api/build-info.py` includes this runtime source closure.
