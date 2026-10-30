# Local inference preparation and rebuilds

Run these commands from the repository root. The accepted Hike/WASM and SentencePiece browser artifacts are already included under `docs/shared/inference/`; normal local model use does not require rebuilding them. Model bundles stay outside `docs/` and are selected as local files in Works. No command below publishes models or changes ComfyUI settings.

## TextEncoder model bundle

Use a dedicated Python environment. Install the pinned CPU dependencies, then prepare the exact original model:

```sh
python -m pip install -r tools/inference/text-encoder/requirements.txt
python tools/inference/text-encoder/prepare.py \
  --model /private/models/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --out /private/bundles/umt5
```

The script's pinned source/config defaults are repository relative. `--deps DIR` selects an existing isolated Python dependency directory; it performs no installation. The24 prepared FP32 graphs occupy18.52GB, and the original6.74GB model remains necessary for bounded embedding-row lookup. Reserve additional preparation headroom. This bounds runtime model residency to one block; it does not reduce disk storage or prove equivalence with the original GPU FP8 arithmetic. See [TextEncoder preparation](text-encoder/README.md) for the manifest, numeric gates and optional validation commands.

## VAE fixed-profile bundle

Install CPU PyTorch explicitly before the remaining pinned dependencies:

```sh
python -m pip install torch==2.6.0+cpu --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r tools/inference/vae/requirements.txt
python tools/inference/vae/export_profile.py \
  --model /private/models/wan_2.1_vae.safetensors \
  --output /private/bundles/wan21-5x16x16 \
  --frames 5 --height 16 --width 16
```

The destination must be new and private. Export does not establish browser acceptance of another video shape. The saved references and fixed tolerance must be tested through the real SDK; no hidden resize, stochastic sampling or latent normalization is added. See [VAE preparation](vae/README.md).

## Pinned Hike tensor kernel

Supply a verified compiler directory containing `hikec` and `node_modules/wabt`, plus the source checkout for its standard imports:

```sh
npm install --prefix /private/hike-toolchain --save-exact wabt@1.0.39
python tools/inference/kernel/build.py \
  --toolchain /private/hike-toolchain \
  --compiler-source /private/hike-lang
```

`HIKE_TOOLCHAIN` and `HIKE_SOURCE_DIR` may supply those directories instead. Without flags/environment, the script looks for `tools/inference/kernel/toolchain/` and its `hike-source/` child; it never depends on a past session's working directory.

The compiler/source revision is [kanryu/hike-lang at3c51fde6675f317453919bd505d0e2d0f638e7f1](https://github.com/kanryu/hike-lang/tree/3c51fde6675f317453919bd505d0e2d0f638e7f1), verified compiler SHA256 `f41a501783e98f2d1d72dca95099f87ef3b4dff30477d0db486e7b2e44106e75`. The accepted Linux compiler was built with Go1.22.12 and `go build -buildvcs=false`; another build/toolchain is not silently treated as that binary. A source rebuild whose compiler hash differs needs its own compatibility validation.

The builder checks that compiler hash and WABT1.0.39, uses `-target wabt -wasm-mode normal`, and requires unchanged kernel source to reproduce the accepted WASM hash. Add `--output /private/repro/tensor.wasm` to check generation without changing the shipped artifact; its log/WAT/build record are written beside that private output. `--record FILE` can override the record destination.

## Pinned SentencePiece browser module

Install exact local tooling and build:

```sh
npm install --prefix /private/tokenizer-tooling --save-exact \
  @sctg/sentencepiece-js@1.3.3 esbuild@0.25.12
node tools/inference/build-tokenizer.mjs --tooling /private/tokenizer-tooling
```

`INFERENCE_TOKENIZER_TOOLING` may supply that directory; the repository-relative default is `tools/inference/tokenizer-tooling/`. The builder checks both installed package versions and the accepted output SHA256 before atomically replacing the browser module. Add `--output /private/repro/sentencepiece.mjs` for a non-mutating reproduction check. No tokenizer model is embedded in this public module: the actual unchanged `spiece.model` remains in the private selected model bundle.

Session browser fixtures and model-contract tests may refer to their original private evidence directories. Those are validation fixtures, not installation or preparation requirements; normal preparation commands above use supplied model/output/tool directories.
