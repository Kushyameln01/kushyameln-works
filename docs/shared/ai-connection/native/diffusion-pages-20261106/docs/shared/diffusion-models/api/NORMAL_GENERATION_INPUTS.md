# Normal generation owner inputs

The existing `diffusion-models/0.1` `sample` operation owns the empty target and
default noise. A normal caller supplies canonical `shapeRequest`, positive and
negative Text producer tensors, and any actual context producer tensors. No
manual target/noise tensor, seed, numerical reference, gate, receipt, or payload
hash is required. The dedicated Worker and existing request envelope are unchanged.

Read `capabilities.executionDescriptor.operations.sample.normalInputs` before
constructing the request. `normalInputs.defaults.shapeRequest` is a complete,
cloned owner template: batch1, one frame, 16×32 RGB canvas, canonical geometry and
semantic declarations, and explicitly absent source/reference video and all eight
reference slots. Clone it, change the user's dimensions/media declarations, and
pass it through the shared `deriveWorkflowShapes` and existing `checkSupport`.
Never mark unknown media absent or independently calculate replacement shapes.
The same contract is returned by `operations.load.normalInputs`,
`capabilities.modelRuntime.normalInputs`, and the successful `load.normalInputs`.

`sample({shapeRequest,positive,negative})` creates the zero model-space target
from its canonical target requirement. With media, `tensors` may contain either
the complete ordered target+contexts or only the exact ordered contexts; the
owner prepends the zero target in the latter form. Missing, reordered, duplicated,
or mislabelled contexts fail admission. Raw posterior means retain the existing
VAE identity and owner normalization checks. Missing media cannot be generated.

Omitted `noise` selects `webcrypto-u32-box-muller-host-f32-v1`. The host owner
acquires Uint32 entropy in requests of at most 65,536 bytes, maps each word pair
to `u=(word+0.5)/2^32`, computes `r=sqrt(-2*log(u1))`, `theta=2*PI*u2`, then stores
`r*cos(theta)` and `r*sin(theta)` as F32. Uniforms and transcendental arithmetic
use host F64 numbers. This is explicitly host initialization, not a Hike kernel.
Chunks yield for cancellation; temporary entropy/normal buffers are cleared on
success or error, and a failed output is cleared. There is no seed or RNG callback
input. A supplied finite, compact, nonshared exact-shape F32 `noise` follows the
existing snapshot and Hike CONST mix without regeneration or alteration.

`operations.sample.supportedUISettings` declares fixed Euler/simple, steps6,
shift5, split3, CFG1, noiseScale1, augmentation0 and batch1. Resource threads
default to1. Four threads require actual cross-origin isolation and native
SharedArrayBuffer; GitHub Pages does not receive COOP/COEP headers from this API.
Unsupported controls must not be presented as editable runtime inputs.

`normalInputs.limits` distinguishes sample capacity from primitive capacity:
target ≤4,194,304 elements, complete target+context sequence ≤90,000 tokens,
batch1/C16/F32, and no nonzero patch tails. These coupled allocation caps do not
define independent maximum RGB dimensions or an accepted model domain. The
top-level 1,048,576 `maxTensorElements` belongs to pointwise primitives and must
not restrict `sample`. `checkSupport` checks metadata only and consumes no entropy.

The zero target follows [BerniniStudio ca69274, lines600–604](https://github.com/CCpt5/ComfyUI-BerniniStudio/blob/ca69274a2d2135052489bc0c67a2d79a64225e86/bernini_studio.py#L600).
The normal distribution follows [ComfyUI B5 `prepare_noise_inner`](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/sample.py#L9),
which calls F32 `torch.randn`. This distribution reference establishes no seeded
Comfy/PyTorch RNG bit identity. Existing Hike/ORT model operators, schedule,
HIGH/LOW handoff, and final raw restoration stay with their existing owners.

Validation covers only the new initialization: focused Node tests exercise
entropy bounds, finite F32 output, cancellation, context admission and ownership;
`execution/test-normal-reference.py` independently compares frozen Uint32 pairs
against Python F64 Box–Muller with F32 output rounding, using
`abs <= 1e-6 + 1e-6*abs(reference)`. Sparse-header sampler tests stop at initial X
before any neural payload access. No NN, original73,947 full40/six-update,
original media, precision, or resource acceptance is added. All existing
`acceptedProduction:false`, `generationReady:false`, and empty confirmed-domain
flags remain in force.
