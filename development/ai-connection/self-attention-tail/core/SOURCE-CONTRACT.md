# Block0 N2 self-attention tail source contract

The acceptance unit is the complete **O projection → chunk2 gate → original patchHidden residual** for natural N2 block0, HIGH scheduleIndex1 and LOW3 as independent cases. Cross attention, FFN, complete blocks, later timesteps and production generation remain later work. `load/predict/sample` remain `NOT_READY`.

The fixed ComfyUI source is `b5a432157de6b8884f81104cd02926adf4d597e4`, reused byte-for-byte from `development/ai-connection/profile-adoption/p4/core-source/comfy/ldm/wan/model.py`; SHA-256 `17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699`. Its existing `core-manifest.json` supplies the original blob/retrieval receipt. Baseline distribution is `caa521ca23d1e32b36775d0a913b0731962c5df4`; accepted old numerical runtime is `e48021d8da29ef3b3b9e9d6161331c282798b6b3`. No existing source or receipt is replaced.

| Fixed source | Dependency |
| --- | --- |
| `model.py:55–59,91–105` | Self attention has its own `Linear(dim,dim)` O and returns `self.o(x)` after optimized attention. O includes its own bias. |
| `model.py:173–181` | Singleton `repeat_e` broadcasts the one time position; no repeated production time profile is introduced. |
| `model.py:262–265` | Block modulation is added to the six-chunk time projection before chunk/unbind. Chunk2 is flattened elements `[10240,15360)`. |
| `model.py:268–274` | `y=self.self_attn(modulate(x,norm1,e[0],e[1]),...)`; then `x=torch.addcmul(x,y,repeat_e(e[2],x))`. The residual input remains original `x`; post-modulation hidden is only the attention input. |
| `model.py:278–286` | Cross attention and FFN start after this acceptance unit and are excluded. |

The original source is available at [the fixed upstream model.py](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/ldm/wan/model.py). This diagnostic uses no transformer patches, context latents, padding or token repetition. Batch1, grid `[1,1,2]`, channels5120 and40heads×128 match the earlier accepted profile. It does not establish the original81frame workflow or an actual HIGH→LOW handoff.

## Retained artifacts and independent basis

The old full private `{high,low}-prefix-actual.json` artifacts contain actual `arrays.patchHidden` (10240 F32 values) and `arrays.timeAct1` (5120). The immutable public `qkv-next/hidden-runtime/{side}-comparison.json` binds both stage hashes and the whole private artifact hash. Binding each stage independently prevents substituting post-modulation `hidden` as the residual basis. The retained `timeProjection` contains10240 values: chunks0/1 only. It cannot supply chunk2. These old artifacts also contain no actual runtime attention output.

The new actual context is captured once per side by rerunning only the accepted old N2 downstream owner from the same full prefix. Its separate capture receipt binds context F32 bits, artifact hash, full-prefix receipt/artifact, source closure, side/block/schedule and disposal. Caller booleans alone do not authenticate inputs. Unknown or conflicting bindings fail before tail execution.

`tail-reference.py` has two separate oracle modes. `LOCAL_ACTUAL_INPUTS` uses the exact captured actual attention and retained actual patch/timeAct1 bits. `COMPOSED_INDEPENDENT_PREFIX` uses the old independent prefix `expected.patchHidden/timeAct1` and independent composed-head `expected.attention`. Existing published receipt hashes authenticate those references. The standalone generator pins exact full-prefix, context and composed-head receipt bytes; a replacement receipt and private reference that merely agree with each other are rejected. Both modes traverse the same selected weight blocks once; no independent expected array is supplied to the runtime as context, patchHidden or timeAct1.

## Actual retained parameter inventory

Both pinned181280-byte headers have the same full shapes/dtypes/offsets. Absolute offsets include the8-byte prefix and181280-byte JSON header. Only the following new ranges are read; gate selection retains original full tensor shapes.

| Original key | Full shape / storage | Selected region | Absolute offset | Source bytes |
| --- | --- | --- | ---: | ---: |
| `blocks.0.self_attn.o.weight` | `[5120,5120]` / `F8_E4M3` | rows `[0,5120)` | 2818896456 | 26214400 |
| `blocks.0.self_attn.o.weight_scale` | `[]` / F32 | own scalar | 181312 | 4 |
| `blocks.0.self_attn.o.comfy_quant` | `[27]` / U8 | own JSON config | 15574823658 | 27 |
| `blocks.0.self_attn.o.bias` | `[5120]` / F16 | all5120 | 52823496 | 10240 |
| `time_projection.1.weight` | `[30720,5120]` / F16 | rows `[10240,15360)` | 2362765896 | 52428800 |
| `time_projection.1.bias` | `[30720]` / F16 | elements `[10240,15360)` | 2257867336 | 10240 |
| `blocks.0.modulation` | `[1,6,5120]` / F16 | elements `[10240,15360)` | 52731336 | 10240 |

Total selected parameter bytes are78673951 per side. The O scale/config belong to O; QKV scale reuse would violate the contract. Own config must be exactly `{"format": "float8_e4m3fn"}` and its scalar finite/positive. O's full5120×5120 matrix is required; the old16-row projection diagnostic is insufficient. Gate time projection, bias and modulation are F16; no FP8 conversion is applied to them.

Model files remain15574833216bytes each. Existing full-model hashes are reused; they are not recomputed. Independent references read maximum16rows at once:81920 raw O bytes or163840 raw gate bytes, each producing327680 decoded F32 bytes. Header read181280 is separately bounded. Full decoded weights are not retained. Local/composed references share one traversal, reading78855239 bytes including the header and8-byte prefix. Inventory receipts only inspect headers and small parameter ranges, before numerical tail observation.

## Numerical contract and fixed gates

The machine-readable [candidate-plan.json](candidate-plan.json) was frozen before observing any new tail output. Its SHA-256 is `58a7a187d9580cd5af1d12e4d9552f8880a47c8a89e50b7bf1d27fec4ff11549`.

`O=attention@W_o.T+bias_o`. `gateProjection=timeAct1@W_time[10240:15360].T+bias_time[10240:15360]`. `gate=f32(modulation_chunk2+gateProjection)` broadcasts5120 channels over the two tokens. There is **no scale+1**. `gated=f32(O*gate)`; `residual=f32(patchHidden+gated)` uses two separately rounded operations.

The independent oracle decodes E4M3FN with its own scalar lookup table, applies the exact own F32 scale, and converts F16 with NumPy's independent IEEE754 decoder. Binary64 dot is rounded to F32, followed by a separate F32 bias add. Gate and pointwise arithmetic explicitly round F32 at each operation. Runtime decoded bytes must match exactly. Local O uses abs1e-4+rel1e-5; local gate projection/gate/gated/residual use abs1e-3+rel1e-4. Composed O/gated/residual use abs1e-2+rel1e-3. Every finite element must satisfy `abs(error)<=abs+rel*abs(reference)`; thresholds cannot change after comparison.

Compact nonshared finite arrays and exact shapes are required. Pointwise O/gate/patchHidden absolute values must be at most1e16, preventing F32 multiplication/addition overflow. Original `torch.addcmul` may fuse arithmetic or use different GPU precision: this explicit separated-F32 diagnostic does not verify fused Torch, CUDA, TF32, FP16/BF16 or production FP8 parity. Bounded source reads do not establish browser/ORT allocator, host/GC or full production peak memory; those measurements belong to the integration evidence.
