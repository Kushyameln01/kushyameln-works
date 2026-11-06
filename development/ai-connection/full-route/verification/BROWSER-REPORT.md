# Operational browser verification

2026-11-04 UTC. New runner: `tools/ai-connection/run-operational-browser.mjs`. No injected services, global transport/numeric shims, model downloads, full NN or LoRA experiment. UI operates through its ordinary `createOperationalManagement()` default factories. Browser selects actual generated fixture Files through HTML file inputs.

## Current result

Development run `/workspace/work/ai-connection/full-route-r17/browser-dev-04/result.json`: **PASS 11/11**. Chromium 154 (exact version in receipt), loopback HTTP without COOP/COEP, actual `crossOriginIsolated:false`. **9 actual Workers created and 9 physical close events observed before browser teardown**. Zero source errors, page errors, console errors. 210 source files, 28,669,936 bytes captured with per-file SHA-256. Explicit development mode: **not fixed-commit evidence**.

1. Real operational screen startup, default controller and no-COI.
2. Real File import of synthetic rectangular raw128 and separately masked Text packet using latest adopted native WKTSR001 codec; frame/time metadata retained.
3. Mean UI configure, capability query, actual native Worker/Hike normalization; owner evidence and inputMetadata retained.
4. Route reference from retained normalized output to actual Hike restoration.
5. Native tensor download to disk and fresh File reimport; decoded F32 values finite; Text mask bit-exact after actual download/readback.
6. Actual Diffusion configure/modelStatus, explicit four-thread UI rejection under no-COI, selection stays 4 and no one-thread dispatch/fallback.
7. Actual selected invalid 8-byte HIGH/LOW Files reach native paired load, return INVALID_SAFETENSORS, discard Worker and set reloadRequired. UI Retry repeats the real failure and preserves unloaded/reload state.
8. Actual small mean operation cancelled via UI, cancelled output absent; recovery and new mean request succeed. A 750ms server delay on the genuine latent-space WASM response makes this control cancellation deterministic; code bytes/factories/numerics are unchanged. This is not a neural cancel test.
9. Actual workspace ZIP download with partial results/settings.
10. Dispose all old modules/Workers, reload page to a fresh controller, select saved ZIP, restore fields and route checkboxes, verify modules unconfigured/Files absent; reused saved response inputMetadata.context/frameProcessing via normal references in another successful native Hike operation; reselect actual model Files and repeat invalid native pair load.
11. UI dispose, physical Worker closes before browser shutdown, served-source integrity and screenshot.

Screenshot: `browser-dev-04/operational-ui.png`. Selected raw/tensor/text/invalid fixture Files, actual downloaded tensors and workspace ZIP are retained in that private output directory. Numeric fixtures are synthetic, including literal producer model declarations; no native neural result is claimed. Native Hike normalization/restoration is real and limited to the existing rectangular128 profile. Actual generated sample, successful complete model pair load, Text/VAE NN, full81 operation, generationReady and fullImplementationComplete remain false.

## Source guard / final rerun

CLI requires a fresh output directory and either explicit `--development` or full `--manager-commit` SHA. It verifies its own bytes and every served source file against `git show <SHA>:<path>` in fixed mode, fails if any source bytes change during a run, restricts browser network to loopback static GET and local blob download, and records sources/errors before teardown. No COOP/COEP headers are sent. Missing files or other methods are failures.

```bash
node tools/ai-connection/run-operational-browser.mjs \
  --manager-commit FULL_SHA \
  --out /workspace/work/ai-connection/full-route-r17/browser-fixed-FRESH
```

The fixed-source rerun is pending the root's source commit. Current development receipt must not be described as that rerun.

## Defects / changes

The only UI defect reported directly to UI owner was route checkbox settings using descendants of an h2 selector, which selected no checkbox. UI owner fixed the containing-section selector before dev03/dev04; both fresh-controller restoration checks pass.

Early harness failures were harness assumptions, corrected before dev04: UI intentionally renders typed arrays as short strings, and Dispose intentionally disables the save button. Neither was a product defect. Current harness tests exact Text mask from downloaded native bytes instead.

Separate authorized SharedArrayBuffer capture fix in mean wrapper: clone typed tensor payload to independent nonshared data before service-tail wait. Actual COI browser regression `/workspace/work/ai-connection/full-route-r17/diffusion-mean-sab-browser.json` proves mutating shared caller data immediately after scheduling does not affect native Hike output; 5/5 Workers closed. That isolated COI test is separate from ordinary no-COI operational UI evidence. Native normalization arithmetic and old pins remain unchanged.


## Added official Text/VAE NN0 UI cases

Latest development run `browser-dev-06/result.json`: **13/13 PASS**, including all 11 earlier operational cases and two added real-owner cases. Still development evidence, not fixed SHA. All 9 Workers closed before browser teardown; zero console/page/source errors. The runner selects byte-identical copies of the adopted official Text `prepared-model-manifest.json` and VAE `vae-stream-manifest.json` via the explicit manifest File inputs, with real folders containing only those manifests. It does not fabricate assets or attempt encode/decode.

- Text: real configure succeeds; actual `works-ai-1` native capabilities declare text_encoder, both input modes and maximum512. Legal IDs `[42,1]` with mask `[1,1]` pass syntax and return `MISSING_ASSET` (block-00.onnx absent). Out-of-range token256384 returns `INPUT_UNSUPPORTED`. No Worker is created and no neural call is made.
- VAE: real stream manifest configure succeeds; actual capability query for RGB `[1,3,1,16,32]` returns encoded shape `[1,16,1,2,4]` and `MISSING_ASSET`. Spatial15 instead of16 returns `DESCRIPTOR_UNSUPPORTED`, with the owner's requirement for valid stride/range. Both runtime encode/decode records remain verified:false. No Worker is created and no neural call is made.

Both cases explicitly record `assetBytesVerified:false`, `neuralExecution:false`, and their source manifest byte length/SHA/path. Manifest configuration/admission is not model readiness or completed inference. The complete model assets remain unavailable/unverified. All 13 cases await the final fixed-source commit rerun.

## Final fixed-source result

Fixed execution source `71fdfca480f0a7500798cf4f3beb6364264b8421` rerun at `browser-fixed-71fdfca/result.json`: **13/13 PASS**, **fixedSourceVerified:true**. Result file: 182,996 bytes, SHA-256 `8283c69ac3908568d46ca01552f19ab3e7adfc87346c00be7d2c6b466d35940f`.

All 211 source records / 28,695,188 bytes matched fixed commit bytes, including runner, UI, controller, current final core changes, adopted native bootstrap/Worker/WASM files and official manifest fixtures. 791 loopback GETs; source/page/console errors all zero. No off-origin uploads or model downloads. Final `git diff --name-only 71fdfca... -- docs/shared/ai-connection docs/ai-connection/modules tools/ai-connection/run-operational-browser.mjs` and `git status --short` were empty: no source-shadow changes remained after the run.

Chromium `154.0.8037.57`; actual no-COI. 9 Workers created; 9 physical close events observed **before** browser teardown. Elapsed 15,353.072101ms is complete UI-control/test time, not NN duration. Process RSS, ORT allocated bytes and total peak RAM were not measured; no RAM acceptance claim is made.

`neuralExecution:false`, `actualModelLoaded:false`, `actualGeneratedSample:false`, `generationReady:false`, `fullImplementationComplete:false`. Text/VAE official manifest configure/capability admission remained NN0 with missing/unverified model asset bytes. Small synthetic mean Hike conversion is the only numerical kernel execution represented.

Whole output-file bytes and SHA-256 inventory, resource summary and result identity: `/workspace/work/ai-connection/full-route-r17/browser-fixed-summary.json`. The fixed output directory contains selected synthetic native input Files, both official manifest-only folder copies, invalid8B model Files, actual downloaded native tensors, workspace ZIP, result JSON, and private screenshot `operational-ui.png`. No implementation files were edited for this final run.
