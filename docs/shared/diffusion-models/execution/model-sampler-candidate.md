# Experimental full-model sampler candidate

`model-sampler-candidate.mjs` binds the actual full-40-block HIGH and LOW model
candidates to the pinned Euler / simple6 / shift5 / split3 schedule. It is a
separate experimental entry point. `acceptedProduction`, `generationReady` and
`publicRuntimeEnabled` remain false inside the numerical owner. The public Worker
now connects the fixed [adapter](../api/MODEL_RUNTIME.md) to this owner;
`publicWorkerConnected:true` describes that route, not full-target numerical acceptance.

```js
import {createBerniniModelSamplerCandidate} from './model-sampler-candidate.mjs';

const candidate = await createBerniniModelSamplerCandidate({
  files: {HIGH: highFile, LOW: lowFile}, // immutable original Blob/File objects
  // Optional explicit Uint8Array/ArrayBuffer kernels, useful in Node:
  bridgeBytes, lookupBytes, mathWasmBytes,
  schedulerWasmBytes, eulerWasmBytes, generatedSpaceWasmBytes,
  signal
});
try {
  const result = await candidate.sample({
    shapeRequest, tensors, noise, positive, negative, signal, onProgress
  });
} finally {
  await candidate.dispose();
}
```

Omitted kernel bytes use the adjacent deployed assets through `fetch`. All
supplied byte arrays and file references are captured before preparation's
first asynchronous operation. Both weight sources explicitly select the
lookup decoder with its legacy-compatible Hike F32 numeric profile. The factory
constructs both full model candidates internally. They share one model-math
owner and the same linear and attention ORT sessions (two sessions total).
No predictor callback, supplied model/source/operator owner, expected output,
receipt or acceptance gate can substitute for model execution.

Inputs use `deriveWorkflowShapes` with explicit normalized semantic declarations:
target `bernini-generated-model-latent:v1`, contexts
`wan21-normalized-posterior-mean:v1`, normalization `wan21-comfy-f32-v1`.
`tensors` is the exact ordered target followed by canonical context population,
each with its canonical `requirementId`, shape, `float32` dtype and compact,
finite, nonshared `Float32Array` data. If `layout` or `axes` is supplied it must
agree with NCTHW. Omit `tensors` only when no contexts exist; the initial target
then defaults to a zero model latent. This zero input is not a prediction.
The original augment value is zero; the candidate has no augmentation port.

Raw context posterior means may instead declare `meaning: 'raw-posterior-mean'`
with no normalization and the exact Wan21 VAE `modelSha256`. The generated-space
owner normalizes them, retains supplied context/profile metadata, and restores
their canonical requirement IDs before sequence validation. The sampler performs
no numerical normalization in JavaScript. Shape, population, role order and
source IDs remain derived from the same canonical request for both branches.

`noise` is always an explicit target-shaped compact, finite, nonshared
`Float32Array`. There is no seed or RNG reproduction port. `positive` and
`negative` are canonical native Text tensors: BLC `[1,L,4096]`, L1..512,
`text_hidden_states`, pinned Text model/tokenizer identities, valid attention
mask, and `umt5-final-rmsnorm-f32-v1` normalization. Both are captured and
validated before execution. CFG is exactly 1, so only the positive neural pass
is evaluated. The same canonical context tensors accompany every prediction.

The sampler takes seven sigmas and six F32 model timesteps from the actual
pinned scheduler kernel. Initial X is CONST `noiseMix(noise, initialTarget, 1,
1)`. Steps 0..2 run HIGH; steps 3..5 run LOW. Each neural prediction is flow
velocity. The full target passes through `flowDenoised` and then Euler `step`.
All target arithmetic uses the actual-shape generated pointwise owner over
Hike scheduler and Euler kernels.

At the nonzero HIGH boundary the order is explicit:

1. Inverse noise scaling of X at sigma3.
2. Wan21 `process_out` to `bernini-high-handoff-raw:v1`.
3. LOW Wan21 `process_in`, with the source's complete-all-zero raw skip.
4. CONST noise mix with a target-shaped zero-noise tensor at sigma3.

The raw handoff has a separate meaning and handoff profile; it is neither a VAE
posterior mean nor the final generated sample. Directly wiring internal X across
this boundary omits observable F32 conversion rounding.

After step 5, inverse noise scaling at sigma0 is explicitly executed (division
by one), followed by exactly one final generated-sample restoration. The output
meaning is `wan21-raw-generated-sample:v1` with a generated-sample/raw/restored
`latentContract`, the separate VAE identity, and producer model hashes ordered
`[HIGH, LOW]`. Evidence records every actual neural prediction and the fixed
schedule. It does not assert production acceptance.

`candidate.predict({side, shapeRequest, tensors, conditioning, timestep, signal,
onProgress})` exposes the actual selected model candidate's native prediction
contract, requiring already normalized latent tensors. It returns model-space
flow velocity and performs no sampling or final restoration.

`candidate.diagnose(sampleInput, {onTrace})` is a development-only sample path.
It emits owned clones named `initialX`, `velocity00`..`velocity05`, `stepX`,
`highPublic`, `lowEntry` and `finalRaw` (six step-indexed `stepX` events).
Velocity clones are exposed only on this diagnostic path. Callback return values
are ignored. Callbacks can inspect or alter
their clones but cannot inject numerical values into execution. Normal
`sample` does not accept a trace callback. Progress callbacks report model
stages and step completion; cancellation is checked before and after callbacks.

The sampler serializes its own sample/predict calls. `dispose()` cancels active
work, waits for it to terminate, releases both models, and then releases the
shared ORT/math owners and both sources. Caller-owned model files and input
tensors remain unchanged. Native AbortSignal slots and captured EventTarget
methods provide cancellation; duck signals are rejected and signal-owned method
overrides do not replace listener attachment/removal or native aborted state.
Listener attachment is transactional. Finish attempts every removal and resets
busy/terminal state in a finally block before reporting aggregate cleanup errors.
Stage caches contain host F32 copies; weights are not
native-resident and each ORT tile still snapshots its weight inputs. Aggregate
RSS, GC latency and ORT allocator peaks are unmeasured. Original header/size
identities are checked; a complete file SHA256 is not recomputed. No LoRA
completion is applied by this base-model candidate.

Run the focused checks with:

```sh
node --test --test-isolation=none docs/shared/diffusion-models/execution/test-model-sampler-candidate.mjs
```

These checks prepare real Hike and ORT owners, validate metadata/cancellation
and ownership, and compare the full small-shape handoff against an independent
staged-F32 arithmetic reference. Sparse original-header files prohibit any
neural weight payload reads. They deliberately do not produce six synthetic
predictions or assert a successful full-model sample.

Six actual full-model predictions and an independent numerical comparison are
still required. Production acceptance separately requires the original
`[1,16,21,60,104]` target with its complete canonical context population. A
smaller sample, lowered shape, dropped context or padded substitute cannot
satisfy that requirement. Completing a single model prediction or these
component checks does not complete D3 or establish original precision parity.
