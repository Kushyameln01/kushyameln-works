# Wan2.1 VAE local model bundle

`docs/shared/inference/vae.mjs` runs the unchanged supplied Wan2.1 VAE as a local fixed profile. Encoding returns raw posterior mean; decoding takes raw latents, computes the actual decoder conv2 weight+bias in Hike, then runs its exact remaining ONNX graph in ORT WASM. Sessions and ORT tensors are released after every operation. The public tensor boundary requires `meaning:'raw-decoder-rgb'` ([-1,1]) or `meaning:'rgb-unit'` ([0,1]) for encode input and `meaning:'raw-posterior-mean'` for decode input. Missing or conflicting meaning is rejected. Unit RGB is converted with real Hike affine (`x*2-1`) before ORT encoding; Hike is mandatory on this path and one actual dispatch is recorded. The existing raw RGB path remains unchanged and does not claim an identity Hike contribution. For decode latents, optional input `modelSha256` must equal the selected original VAE model. RGB encode inputs may originate from a different model and retain that provenance; their source model hash is not a compatibility restriction. Outputs always include that model hash. Model files are provided as a caller-selected Map; the API contains no upload or model fetch endpoint.

The initial `profile.json` is the validated fixed profile: RGB `[1,3,5,16,16]`, latent `[1,16,2,2,2]`, NCTHW, FP32. It is an explicit raw tensor API, without hidden resize, slicing, stochastic posterior sampling, latent normalization, denormalization, output clamp, or arbitrary video-size support. Stored BF16 values are expanded exactly to FP32; FP32 arithmetic is not asserted identical to the original BF16 runtime.

Select `manifest.json` and all four files listed in its `assets` object in Works. Filenames, byte lengths and SHA256 are verified before use. Graphs and weights remain private local model assets; do not commit or publish the bundle.

Install the pinned CPU preparation dependencies using the commands in [the inference preparation guide](../README.md). No installed dependency path from a previous session is required; `--deps` is optional.

To export another exact fixed profile from the original saved model:

```sh
python tools/inference/vae/export_profile.py \
  --model /path/to/wan_2.1_vae.safetensors \
  --output /private/new-profile-directory \
  --frames 5 --height 16 --width 16 \
  --deps /optional/isolated/python/deps
```

The output directory must be new and outside `docs/`. The model and pinned official source hashes are checked, all194 state keys are loaded strictly, official nearest-exact2x behavior has an explicit ONNX lowering, and no weight alteration is performed. Frames must be4n+1 and dimensions multiplesof16; export produces a fixed graph for the requested shape. A successful export is not browser acceptance for a larger profile: run its saved input/reference tensors through the real SDK and compare under the manifest's frozen FP32 tolerance.

`test-api.mjs` validates profile/tensor rejection and local file requirements. `browser-cases.mjs` exercises actual local assets, Hike and ORT with the exported reference arrays. An optional `references.encodeUnit` fixture checks the full unit RGB→Hike range conversion→actual encoder path and mandatory-Hike rejection. Runtime version1.24.3 is supplied by the shared Works Worker and uses `executionProviders:['wasm']`, threads1, graph optimization disabled.

Pinned source and license are in `vendor/`. No ComfyUI configuration is changed. A complete rv2v workflow additionally requires conditioning, matching model/runtime precision and its source/reference media; these raw VAE operations do not assert that broader scope.
