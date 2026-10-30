# Hike operation adoption decisions

Decision date: 2026-10-31 JST. Scope is the later authorized Text Encoder + VAE implementation; diffusion is excluded. This records the attached plan's requested evaluation of major-operation migration, including a bounded actual-weight comparison. A successful Hike build or a small correct kernel is not evidence that the whole product is faster.

## Adopted operations and their actual contribution

| Path | Adopted Hike computation | Evidence and boundary |
| --- | --- | --- |
| Text Encoder | Actual `encoder.final_layer_norm`: per-token RMSNorm with the original4096-element final-norm weights and epsilon1e-6 | The24 actual ORT-WASM blocks feed this Hike operation; it is not a wrapper around ORT normalization. Full Works Worker/UI fixture returned `[1,4,4096]`, final maximum error2.86102294921875e-6 against the independent FP32 reference, and one Hike API call. Missing Hike fails. A dedicated RMSNorm speed comparison was not recorded, so this is correctness/architecture adoption, not a measured speedup. |
| VAE encode from images | Explicit `rgb-unit`[0,1] → raw RGB[-1,1] conversion, `f32(x*2-1)` | Range conversion occurs in Hike before the unchanged encoder graph. Five16×16 PNG fixtures match an independent unchanged-weight FP32 encode reference with maximum error1.1920928955078125e-6; one actual Hike call, input preservation and missing-Hike rejection are verified. Raw RGB encode remains valid without a redundant identity-Hike call. |
| VAE decode | Actual original `conv2.weight`16×16 MatMul and16 channel-bias additions, followed by the exact remaining decoder graph in ORT WASM | Original learned values are retained. The fixed latent `[1,16,2,2,2]` produces RGB `[1,3,5,16,16]`; maximum error8.046627044677734e-7 against the original-weight FP32 reference. Seventeen Hike API dispatches are observed. Earlier ablation bypassing conv2 changed the final decoded result and failed its reference gate. This is a real learned projection, but not the decoder's entire convolutional body. |

The fixed Hike source is `tools/inference/kernel/tensor.hike`; compiler/backend/hash evidence is `tools/inference/kernel/manifest.json` and final WAT is retained beside it. The public host is `docs/shared/inference/hike.mjs`.

The fixed WABT normal compiler emits one documented import: **`env.sqrt(f64)->f64`**, provided by `Math.sqrt`, as in its generated runtime. RMSNorm accumulation, multiplication, division and output writes execute in Hike WASM; the scalar square root uses that declared host primitive. It must not be described as a pure no-import WASM operation. There is no JS RMSNorm fallback. The host rejects a different import set, and missing required Hike exports fail. The bounded square-root probe retained its import signature, actual four-case values and missing-bridge failure.

## Measured major-operation candidate: Text Encoder MatMul

The heavy candidate evaluated is block0's actual learned query projection, `encoder.block.0.layer.0.SelfAttention.q.weight`, whose complete shape is4096×4096. Current Text execution uses the original scaled-FP8 values expanded to FP32. The comparison preserves that exact existing expansion, including the original scalar `scale_weight`; it does not introduce another quantization or precision change.

A bounded test selected the first16 output rows, retained the full4096-element reduction dimension, and used four actual embedding-fixture positions after the source layer's original weighted RMSNorm. Shape is **16×4096 multiplied by4096×4**. Independent Torch output, source keys, scale, binary hashes and the pre-registered numerical gate were saved before browser execution. This is1/256 of one projection's output rows; it is not a full projection, Transformer block, or end-to-end model benchmark.

Both candidates ran in the same actual Chromium154 Worker using ORT Web1.24.3 WASM, threads1. There were two warmups followed by seven paired measurements. Hike used the current public MatMul host, including validation, arena copies and owned output; ORT used `session.run` on the same arrays, including its runtime input/output work. Session creation was outside both timed loops.

| Candidate | Seven measured times, ms | Median, ms | Correctness versus independent Torch |
| --- | --- | --- | --- |
| Current scalar Hike MatMul | 5.6,8.0,4.7,8.4,5.6,6.4,5.6 | **5.6** | maxAbs3.5762786865234375e-7; normalized peak1.7055494029440056e-6; relative RMS1.2229691118653257e-6 |
| ORT WASM MatMul | 0.7,0.4,1.4,0.5,1.5,0.3,0.2 | **0.5** | maxAbs7.82310962677002e-8; normalized peak3.7308893189400124e-7; relative RMS3.4246920723031853e-7 |

The pre-registered normalized-peak and relative-RMS limits were each1e-4; both candidates passed. Hike Memory remained1,835,008 bytes across nine calls with a65,536-element-per-arena workspace. This is the Hike Memory size, not process-wide RAM. The observed Hike median was about11.2 times the ORT median for this slice. The short times, one machine and small slice limit generalization; no full-matrix time is extrapolated from them.

**Decision: retain heavy Text MatMul in ORT for this implementation.** The current scalar Hike candidate is slower on the measured actual-weight slice and its full4096×4096 left operand contains16,777,216 floats, exceeding both the default65,536-element arena and the current maximum1,048,576-element arena. A future full migration would require an explicit row/column tiling and weight-delivery contract, a separately validated optimized kernel, per-layer numerical comparisons, and an end-to-end copy/load/memory measurement. The mathematical operation is a valid future Hike target; this measured candidate is not adopted as a performance improvement.

The full24-block Works UI fixture took approximately95.56 seconds including browser/UI, asset loading and result recovery, while the separate first-block preflight measured approximately6.83 seconds of session creation and0.446 seconds of inference. These are different measurement scopes, not a subtraction-based operator profile. They show why changing a small arithmetic kernel alone cannot establish lower total burden. Per-operator whole-model profiling remains unmeasured.

## VAE convolution/residual-block decision

The original VAE contains61 five-dimensional learned weight tensors. Several encoder residual convolutions have shape **[384,384,3,3,3]**, or3,981,312 FP32 values each after the existing BF16→FP32 expansion. For example, `encoder.middle.0.residual.2.weight` and `encoder.middle.2.residual.6.weight` have this shape. These learned convolutions and the corresponding temporal-cache, padding, activation, normalization and residual-add boundaries are the next structural candidates, rather than adding more unrelated small functions to inflate Hike usage.

The public Hike kernel currently exposes affine, divide, MatMul and RMSNorm; it has **no Conv3D or causal residual-block implementation**. A3D convolution cannot be replaced by the present small MatMul API without defining patch materialization or direct convolution, temporal cache ownership, padding/order and the increased live buffers. Even one of the above weight tensors exceeds the current maximum Hike left-operand arena. An isolated Hike Conv3D numerical/performance comparison is therefore **not implemented and not measured**; lack of such a kernel is not a failed speed benchmark.

For the actual fixed-profile SDK run, learned conv2 plus its biases took approximately2.10ms, the remaining ORT decoder inference738.70ms, session creation1,040.90ms, and the entire decode call2,611.40ms. Unit-RGB preprocessing took approximately2.30ms before an encoder inference550.70ms; its entire call was1,949.90ms. These are single local diagnostic runs with copy/ownership work at the recorded API boundaries. The final Works image-selection UI run separately recorded7.40ms of Hike work and1,340.20ms of ORT inference under its different overall workload. None identifies a specific residual Conv3D as the dominant operator.

**Decision: keep the exact VAE convolutional/residual body in ORT and retain only the validated conv2 split and explicit input conversion in Hike.** A future migration must first collect a bounded operator profile on the supported VAE shape, select an actual costly convolution or residual segment, preserve the source's temporal state, then compare small shape → actual profile shape → split graph → full encode/decode under an unchanged pre-registered gate. A different compiler/backend, SIMD kernel, larger workspace, tiled convolution or larger video profile is a new explicitly validated candidate; none is silently substituted here.

## Evidence locations and remaining acceptance

Private execution evidence stays outside public model assets:

- `/workspace/work/inference/vae-implementation/major-op-benchmark/`: actual-weight subset preparation, source/tensor hashes, tiny ONNX MatMul, independent Torch output, real-browser paired times and all outputs. Reproduce with `python prepare.py`, then network-enabled local execution of `python check.py` in that directory. No product source is changed by this benchmark.
- `/workspace/work/inference/vae-implementation/sdk-browser-results.json`: raw VAE encode/decode, unit-RGB preprocessing, numerical comparisons and Hike dispatch evidence. `png-encode-reference.json` describes the independent original-weight PNG reference.
- `/workspace/work/inference/vae-implementation/math-probe/`: declared square-root bridge and actual calls.
- `/workspace/work/inference/integration/text-browser-results.json`, `vae-images-browser-results.json`, `external-browser-results.json`: Works UI/Worker and external SDK paths. A real external peer service was not supplied; local module import/API use is the tested connection boundary.
- `/workspace/work/inference/browser-proof/split-results.json`: original-weight conv2 split and bypass ablation; it is an earlier diagnostic path, separate from final Works SDK measurements.

The current VAE browser-accepted profile remains5 frames at16×16. The exporter can generate another explicit fixed profile, but export alone is not browser acceptance. Stored values are preserved while inference arithmetic is FP32; original GPU/BF16/FP8 runtime equivalence is not claimed. CPU/RAM targets and acceptable total latency for the user's endpoint remain unspecified, so **no overall load-reduction target or ComfyUI performance improvement is certified**. Major Hike migration has an actual-weight measured candidate and explicit adoption/defer decisions; it has not been relabeled as a completed full-model Hike port.
