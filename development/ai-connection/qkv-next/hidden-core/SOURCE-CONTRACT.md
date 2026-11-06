# Block0 post-modulation hidden source contract

2026年11月1日 JST。これは固定coreの依存関係と実headerの読取記録であり、数値受入や元production入力の真正性を認定する文書ではない。

## Fixed source

ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`。正確な原文は既存 `development/ai-connection/profile-adoption/p4/core-source/`、bytes/hash/Git blobは同 `core-manifest.json` を再利用する。Wan model本文SHA-256は `17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699`、ops本文SHA-256は `e0f4cbd79e60def5f8e766fffa9be1cb5b0d059318762028c2a08c28ea2afeaa`。

| Source lines | Actual operation and dependency |
| --- | --- |
| `wan/model.py:19–29` | Time sinusoidal embedding: position→F32、arange/half F32 exponent、pow10000→F32、outer product F32、cos/sin→F32、cos half then sin half concat |
| `:514–522` | Patch Conv3d `(1,2,2)`、time MLP `256→5120→5120` with SiLU、time projection SiLU then `5120→6×5120` |
| `:581–590` | `patch_embedding(x.float()).to(x.dtype)`→flatten T/H/W→token transpose、time embedding→`[B,time,5120]`、projection→`[B,time,6,5120]` |
| `:602–607` | Each context latent gets its own patch embedding and is appended in token order after target |
| `:173–194` | `repeat_e` keeps a single time position unchanged for broadcasting. Small/non-CUDA modulate is `torch.addcmul(shift, norm(x), 1+scale)`; large CUDA may choose `ck.adaln` |
| `:223` | `norm1` is LayerNorm over all5120 with epsilon1e-6 and `elementwise_affine=False` |
| `:240,262–270` | Add block modulation to time projection, split six chunks; only chunks0/1 feed the first self-attention input |
| `:55–78` | Q/K Linear then full5120 RMSNorm, reshape40heads×128 and apply RoPE; V is Linear without that norm/RoPE |
| `:654–692,702–725` | Patch grid T/H/W coordinates; target source_id0; appended context streams get IDs1,2,… and separate full-head source rotation |

## Natural Rect input shape

The received actual VAE Rect mean has NCTHW `[1,16,1,2,4]`. Patch `(1,2,2)` gives grid `[1,1,2]`, exactly **two tokens**, each5120 values after embedding. No padding, token repetition or reshape to16tokens is needed. Flatten order is T→H→W. The two target coordinates are `[0,0,0]` and `[0,0,1]`, both source_id0. This exact small profile contains no context latent, ref_conv, time_dim_concat, transformer patch or block replacement.

The public input provenance is VAE commit `855f435120f08eb9e818e51281fc26f0e2633829`, `development/inference/e6/fixtures/png-mean.wktensor`; file SHA `6539204ef61dc0f706238b74e2bcabf8bbcce971f5056d0b0d7e288811516b71`, raw payload SHA `289977e71b65ca42ac9f3fa2b614882bc0eba7420e70620927a25740db6f53a3`, producer VAE hash `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`.

When explicit caller noise is supplied, normalization and CONST noiseMix can produce a traceable diagnostic model input. The noise must retain its own source/hash; it is not the original workflow noise merely because a seed or schedule index agrees. A LOW timestep case created this way is not an actual HIGH→LOW handoff.

## Prefix dependency and partial time projection

For a single timestep, e has shape `[1,1,5120]`, and time projection unflattens to `[1,1,6,5120]`. The block adds modulation `[1,1,6,5120]` and unbinds chunk axis2. Shift/scale `[1,1,5120]` broadcast over both Rect tokens. The post-modulation self-attention input depends only on projection rows `[0,10240)` and block modulation chunks0/1. Chunks2–5 are required later by residual/FFN gates and are **not** executed by this prefix scope. Pruning them is not a full-block acceptance.

Text embedding and cross-attention are outside this dependency cut: the fixed forward computes text before its block loop, but text does not enter block0's norm1/shift/scale input. Omitting that branch here does not implement a complete `WanModel.forward`.

## Precision boundary

The new operator profile must identify F16 storage→F32 decoding, F32 im2col/Linear, time sinusoidal F32 frequency and phase, the chosen SiLU backend, full5120 LayerNorm and modulation order. Time sinusoidal frequency is **not** the old RoPE F64 frequency rule. A standard Math primitive bridge returns F64 and must be rounded at the declared F32 positions; that is a diagnostic execution rule whose difference from Torch GPU kernels remains explicit.

The source's `torch.nn.functional.layer_norm`, SiLU and `torch.addcmul` may use backend-specific reductions/FMA. Large production CUDA inputs may use `ck.adaln`. A sequential F32/ORT/Hike implementation and an independent binary64 reference can be numerically compared under a predeclared diagnostic gate, but this does not establish original GPU, BF16/FP16, FP8 activation/scaled_mm or large-input fused precision parity.

## Provenance and acceptance separation

An accepted prefix may state that its hidden values were computed by the recorded actual-model operators, block0 and an exact timestep from identified inputs. It must still retain `originalWorkflowInputVerified:false`, `productionHiddenVerified:false` and whole-model readiness false while the original81frame target/context/noise and production precision are unavailable. The previous explicit16token hidden fixture remains a separate immutable diagnostic scope.

## Timestep and time-state capacity

The exact original `comfy/model_base.py` body has SHA `ef3d3d515a2b9b60050805a36aea253734424557e2d1a510fcb96e19d7325876`. Lines219–261 call `model_sampling.timestep(sigma).float()` before core, and Base `process_timestep` at263–264 returns it unchanged. `comfy/model_sampling.py` has SHA `f1f7e0a6206b1c0c44bb6d6792851e256f436bd765e98b9bc239c37f747542e6`; its DiscreteFlow timestep at325–326 multiplies sigma by1000. `CONST.calculate_input` at87–88 returns the already mixed latent. `noise_scaling` at94–97 is `sigma*(noise_scale*noise)+(1-sigma)*latent`.

The fixed source `comfy/supported_models.py` SHA `5ddd020c6c5d7d76cc57c52efc0500d510bf217886dc239176d012db3c0fcc67`, 91,230bytes, defines `WAN21_T2V.get_model` at1376–1378 using `model_base.WAN21`. The separate `WAN22_T2V` at1512–1523 matches `out_dim48` and uses `model_base.WAN22`; its optional denoise-mask timestep expansion at`model_base.py:1974–1978` must not be transferred to the Bernini16-channel operator profile. These source facts are not a new runtime model-loader acceptance.

The exact Bernini conditioning source SHA `764bfa5ab3e1b358ede73bf4fe479c17d36186f278cbcc937674263dee54d0f3` only appends ordered context latents; it does not assign context timestep0. In the ordinary single-sigma path, the core computes e/e0 before context-token concatenation, and singleton e broadcasts across target/context tokens. This source path needs time e0 `[1,1,6,5120]` =122,880F32bytes, not dense `[1,N,6,5120]`. The prefix executes only its first2chunks =40,960F32bytes. A different caller supplying multiple time positions is a separate profile: `repeat_e` can repeat groups, and the number/order of those groups must be accounted for. No context-time0 or dense-all-token assumption is silently added.

Fixed source retrieval URLs are `https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/` followed by the paths above. The model_base/model_sampling/Bernini identities and their Git blobs are already in `development/ai-connection/a0/core-source-manifest.json`.

## Actual parameter inventory and bounded execution

HIGH and LOW retained headers have the same parameter shapes, storage dtypes and payload offsets. Every listed prefix key is F16, including patch/time parameters in otherwise FP8-named model files. No E4M3FN scale is applied to these keys. Absolute offsets below include the8-byte prefix and181,280-byte JSON header.

| Original key | Full shape | Absolute byte offset | Selected source bytes |
| --- | --- | ---: | ---: |
| `patch_embedding.weight` | `[5120,16,1,2,2]` | 2,107,728,456 | 655,360 |
| `patch_embedding.bias` | `[5120]` | 2,107,718,216 | 10,240 |
| `time_embedding.0.weight` | `[5120,256]` | 2,202,786,376 | 2,621,440 |
| `time_embedding.0.bias` | `[5120]` | 2,202,776,136 | 10,240 |
| `time_embedding.2.weight` | `[5120,5120]` | 2,205,418,056 | 52,428,800 |
| `time_embedding.2.bias` | `[5120]` | 2,205,407,816 | 10,240 |
| `time_projection.1.weight` | `[30720,5120]` | 2,257,908,296 | 104,857,600, rows`[0,10240)` |
| `time_projection.1.bias` | `[30720]` | 2,257,846,856 | 20,480, elements`[0,10240)` |
| `blocks.0.modulation` | `[1,6,5120]` | 52,710,856 | 20,480, chunks0/1 |

Selected payload totals **160,634,880bytes per side**. Each16-row F16 read is at most163,840bytes, decoded to327,680owned F32bytes. The entire time-projection F16 tensor314,572,800bytes is never materialized. The header read is181,280bytes, a different bound. No norm1 affine tensor exists in either header. Public reference receipts record each selected range's raw/F32 hashes and unchanged-file stat checks, and explicitly reuse prior full-model hashes without rehashing30+GB.

These are source/read-unit facts. NumPy binary64 oracle scratch, browser Hike Memory, ORT Memory, staging, retained tensors and copies have separate accounting. A bounded read does not prove an arbitrary production graph fits executable Memory.
