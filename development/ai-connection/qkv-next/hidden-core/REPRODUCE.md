# Natural Rect N2 actual-operator prefix

`candidate-plan.json` is a separate pre-observation plan. It leaves the previous N16 profile and all shared accepted catalog entries unchanged. Numerical gates and precision are fixed before actual-weight reference/runtime comparison.

The independent oracle accepts the real VAE Rect mean from the Git object at `855f435120f08eb9e818e51281fc26f0e2633829`; verifies its complete file/payload/model identities; and applies explicit diagnostic noise, fixed schedule timesteps, actual F16 patch/time/block0 parameters, full5120 nonaffine LayerNorm and shift/scale modulation. Natural patch grid `[1,1,2]` gives two tokens without padding or repetition. LOW is a separate diagnostic timestep case, not an actual HIGH→LOW handoff.

Run from the repository root after obtaining the two immutable Bernini safetensors whose full-model identities appear in the receipts. Preserve the original file bytes and full-hash acquisition receipt; the commands below verify headers, bounded ranges and unchanged stat identities rather than rehashing both15.57GB originals.

```bash
python -m py_compile tools/diffusion-models/hidden-reference.py
python -m json.tool development/ai-connection/qkv-next/hidden-core/candidate-plan.json > /dev/null
python tools/diffusion-models/hidden-reference.py \
  --models /absolute/private/bernini \
  --side HIGH \
  --output /absolute/private/new-high-prefix-reference.json \
  --receipt /absolute/output/high-reference-receipt.json
python tools/diffusion-models/hidden-reference.py \
  --models /absolute/private/bernini \
  --side LOW \
  --output /absolute/private/new-low-prefix-reference.json \
  --receipt /absolute/output/low-reference-receipt.json
```

The reference requires NumPy, uses one BLAS thread, and refuses an existing private output or an output inside this repository. Numerical arrays and parameter fragments are private. Only receipts containing hashes, exact ranges, shapes, predeclared gates, identities, timing and scopes may be committed.

The private reference schema has `meta`, `input.rawMean` with exact tensor metadata and128values, `input.noise` with128caller-owned values, `expected` with named flattened F32 arrays, `arrayIdentities`, `ranges` and `gates`. Expected names are `normalizedMean`, `noisedLatent`, `patches`, `patchHidden`, `timeSin`, `timeLinear0`, `timeAct0`, `timeEmbedding`, `timeAct1`, `timeProjection`, `shift`, `scale`, `layerNorm`, `hidden`.

Runtime output must retain its own actual post-modulation hidden bits and evidence in a private artifact. The downstream independent oracle receives those actual bits for **local QKV/norm/RoPE/attention gates**. The separate composed oracle receives `expected.hidden` from this independent raw-mean prefix for the predeclared final attention gate `abs1e-2 + rel1e-3`. Substituting actual hidden for the composed prefix reference would hide prefix propagation error.

Public receipts here record independent reference generation only. Browser runtime and downstream comparison results have their own evidence and hashes. Original production81frame inputs, context/noise, GPU fused/FP8 compute parity and full block are unaccepted. `load/predict/sample` remain `NOT_READY`.
