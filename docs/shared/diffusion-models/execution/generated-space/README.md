# Generated latent space arithmetic

This standalone D3 owner restores supplied generated model latents into the existing `wan21-raw-generated-sample:v1` contract. It does not execute a neural model, run a sampler, authenticate producer execution, or decode VAE output. Public `predict` and `sample` readiness is unchanged.

```js
import {
  createGeneratedLatentSpace, GENERATED_MODEL_LATENT, NORMALIZATION
} from '../generated-space.mjs';

const owner = await createGeneratedLatentSpace({
  wasmBytes, targetShape: [1,16,21,60,104]
});
try {
  const raw = await owner.restore({
    dtype: 'float32', layout: 'NCTHW', shape: [1,16,21,60,104],
    meaning: GENERATED_MODEL_LATENT, normalization: NORMALIZATION,
    producerModelSha256s: [highModelSha256, lowModelSha256], data
  }, {signal});
  // Owned raw.data; raw.latentContract keeps the VAE and producers separate.
} finally {
  owner.dispose();
}
```

`bernini-generated-model-latent:v1` is the new owner input meaning. Its normalization marker must be `wan21-comfy-f32-v1`. The output meaning and `latentContract` follow the existing generated-sample declaration in `profiles/p0-bindings.json`. Output contract normalization is `{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}`; the top-level normalization marker is absent, as required by the canonical tensor codec. Known nonempty unique HIGH/LOW producer identities are mandatory caller provenance. They are not a receipt proving that this standalone primitive ran those models. Restored output, posterior means, masks and posterior profile IDs cannot enter `restore`. Shape must equal the owner's configured target, so an equal-count axis permutation is rejected. New positive NCTHW `[1,16,T,H,W]` targets can be configured within the 4,194,304 element admission bound.

`normalizeContextRaw(tensor)` and `normalizeContexts(orderedTensors)` use a different Hike export and preserve posterior-mean semantics. They accept raw `raw-posterior-mean` tensors bound to the Wan21 VAE, with no normalization marker or generated contract. They return `wan21-normalized-posterior-mean:v1`. Context list order and cloned `context` metadata are retained, including repeated or nonmonotonic frame maps. Zero raw contexts are normalized. The list has a separate aggregate admission bound of 8,388,608 elements, checked before payload copies. Each individual context remains bounded at 4,194,304 elements. A fixed posterior `profileId`, if supplied, must match its exact published shape. No frames or streams are removed to meet a limit.

`restoreHighHandoff(normalizedTensor)` and `normalizeHighHandoff(rawHandoffTensor)` implement the transient HIGH/LOW boundary with dedicated Hike exports sharing the same internal staged transforms. Both handoff methods require exactly the known HIGH producer identity, since the LOW model has not executed at this boundary. HIGH uses `inverseNoiseScale(xSigma, splitSigma)` first, then `restoreHighHandoff` applies Wan21 process_out. Its output meaning is `bernini-high-handoff-raw:v1`, with `handoffProfile:'bernini-high-low-wan21-handoff:v1'`, the same producer identity and no top-level normalization or generated `latentContract`. LOW calls `normalizeHighHandoff` to apply process_in, then `noiseMix(zeros, normalizedLow, splitSigma, 1)`. The normalized output uses `bernini-generated-model-latent:v1` and the Wan21 marker, retains the handoff profile/producer, and records `handoffNormalization:'applied'`.

For the source KSAMPLER exception, `normalizeHighHandoff` checks whether the **entire** raw handoff contains only zeros. If so, it copies those values unchanged, including signed zeros, and records `handoffNormalization:'skipped-all-zero-raw'`. A zero chunk within a nonzero tensor still receives process_in. This exception applies only to this HIGH/LOW handoff method; context posterior means always normalize. The handoff metadata is a transient owner contract. It does not create a new persisted codec contract. Only the final `restore` creates the raw-generated `latentContract`, once at the final boundary.

`createGeneratedTargetPointwise({scheduler,euler,targetShape})` adapts the existing real Hike scheduler and Euler owners to the configured target. Its async `noiseMix`, `inverseNoiseScale`, `flowDenoised` and `eulerStep` methods accept a request containing `shape`, the same named F32 arrays as the existing primitives, and explicit scalar parameters. `noiseMix` requires explicit `noiseScale`. Scheduler calls are bounded at 4,096 values and Euler calls at 65,536 values. Every dependency result must be finite F32 of the exact chunk length. The adapter borrows these dependencies; its caller disposes them. This is a separate operation target contract, without raising the public 1,048,576 pointwise cap.

Inputs are copied before the first async boundary. Shared buffers, nonfinite values, mismatched lengths, conflicting axes and masks are rejected. Output arrays belong to the caller. The owner clears its 32,768 byte WASM arena and owned input snapshots on completion, error and cancellation. Work yields after every 16 chunks, allowing AbortSignal cancellation; `onProgress` is an optional numeric progress notification. Disposal during an operation rejects that operation and releases the WASM reference after cleanup. One operation runs per owner at a time. The pointwise adapter clears its own snapshots and failed output; the borrowed Euler owner retains its existing workspace policy.

These limits describe admitted buffers and fixed WASM capacity. They do not measure browser/RSS peaks, JS garbage collection, model weights or the aggregate memory needed by D1/D2. Upstream resource admission must still account for simultaneous target, context, hidden and weight buffers.

The source and ABI are recorded in [contract.json](contract.json). Build offline using the already pinned compiler:

```sh
DIFFUSION_TOOLCHAIN=/path/to/pinned/toolchain python build.py
node test.mjs
python test-browser.py
```

Node and actual Chromium compare every one of the original target's **2,096,640** values in restoration and each of the four pointwise operations against a separate staged `Math.fround` oracle. The gate is declared before execution: bit-exact values plus max absolute error, max relative error and RMSE at most `1e-6`. Current recorded errors are zero. Additional cases exercise channel boundaries with a non-chunk-aligned shape, ordered context normalization, ownership, native ABI rejection, hash binding, cancellation, disposal, masks and semantic separation. `work/node-results.json` and `work/browser-results.json` record the executions; `work/red.log` records the initial missing-owner failure. These are arithmetic capacity receipts, not original ComfyUI execution or end-to-end generation receipts.

The HIGH inverse/process_out/LOW process_in/zero-noise mix stages also compare every target value with independently staged F32 oracles. Separate full-target cases cover the complete-zero identity exception and a single nonzero value among otherwise zero chunks. No neural prediction callback or six-step model simulation is used by this arithmetic harness.

The same actual target passes through canonical `docs/shared/inference/tensor.mjs` `encodeTensor` and `decodeTensor` in both runtimes. The save/readback gate compares all 2,096,640 payload words bit for bit and verifies the complete `latentContract`, producer list and source `context`. Receipts include the encoded bytes hash, codec source hash, payload hash and readback metadata. The codec is the existing shared implementation; this owner provides no replacement codec.
