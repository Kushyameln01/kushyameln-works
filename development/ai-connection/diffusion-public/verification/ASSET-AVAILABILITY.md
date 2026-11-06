# Actual Bernini model/input availability in this environment

Checked 2026-11-02 UTC, read-only except this report. Fixed owner distribution source: `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` (present as a local Git commit in `/workspace/kushyameln-works`). No model downloads, inference, input regeneration, or model/tensor changes were performed.

## Finding

The complete actual HIGH/LOW pair and the owner's private N5/L512 manifest are **not available at the checked local paths**. The saved real L512 conditioning packet **is available**, and its complete bytes match the fixed owner's declared packet identity. Therefore this environment cannot presently execute an actual management sample with that pair. This is asset absence, not evidence of a one-thread WASM failure.

The bounded file search used `rg --files` for safetensors and exact N5/L512/input names under `/workspace/work`, `/tmp`, and the repository, plus metadata checks of the runner's known `/workspace/retained/bernini` and private-storage paths. It did not inspect credentials or scan unrelated secret directories. A second safetensors pass included hidden files and excluded Git internals/node_modules. It found 32 safetensors: existing LoRAs and 41KB management test files, with no 15.57GB base-model files. Existing 1.244GB `Bernini-R_LightX2V_{high,low}_noise.safetensors` are LoRAs, not the required base pair.

## Actual received asset

`/workspace/work/ai-connection/p4-r11/runner/plain-conditioning.wktensor`

| Property | Observed value |
| --- | --- |
| File size | 8,390,054 bytes |
| Complete SHA-256 | `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9` |
| Format | `WKTSR001`, 1,434-byte JSON header, then F32 payload |
| Header SHA-256 | `2e9ac007423d1f7bc894c4ac76e63e55ad3bd92704cecd12ee87cacee0654441` |
| Payload | 8,388,608 bytes, `[1,512,4096]`, float32, BLC, `text_hidden_states` |
| Payload SHA-256 | `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7` |
| Mask | 512 entries, first three active; declared mask-byte SHA-256 `19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62` |
| Text model SHA-256 | `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68` |
| Tokenizer SHA-256 | `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458` |

The complete file, header, and payload hashes above were calculated from this local file. The owner receipt attributes the packet to artifact commit `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48`, producer `5537b8932343aa2476b95191817e8913f99dab02`, prompt `Hello world`. Its legacy header lacks the top-level normalization tag; the fixed owner preparation records adding `umt5-final-rmsnorm-f32-v1` as metadata only, with no payload/mask transformation.

A second packet at `/workspace/work/ai-connection/p4-r11/text-5b0d/source/development/inference/text-memory-20261102/runs/incremental/plain-conditioning.wktensor` has the same size but complete SHA-256 `ed9bb076172a9529e99594987a966646e70e48dd363a2584206d5ccc740552d3`; it must not be substituted by filename alone.

## Required actual model pair

The owner runner's default model directory is `<repo-parent>/retained/bernini`, which resolves to `/workspace/retained/bernini` for this checkout. Both `/workspace/retained` and that directory are absent here.

| Side / exact filename | Declared model bytes | Previously verified model SHA-256 | Header SHA-256 |
| --- | ---: | --- | --- |
| HIGH / `Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors` | 15,574,833,216 | `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52` | `d8aec897e3af480492d7eca7b57141ea968e89cde7f46ea7886db11754ebd6e3` |
| LOW / `Bernini_LOW_fp8_e4m3fn_scaled.safetensors` | 15,574,833,216 | `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` | `286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b` |

These are receipt/source identities, not hashes computed from models in this environment. The owner runner selects actual retained files through HTML File inputs, records their stat identities before/after, and explicitly does not read the complete models through HTTP or recompute full model hashes.

## Missing saved N5/L512 inputs and minimal manifest contract

The owner path `/tmp/d1-d4-real-l512-n5-inputs/inputs.json` is absent. Its published identity is 43,223 bytes, SHA-256 `11d345729b9132dd600b3fa73b61fd5e686b3f5a0ed7b72ef12e3a83791307e9`. `/tmp/d1-d4-real-l512-n5-inputs`, `/tmp/p4-real-text-l512`, `/tmp/text-packet-receipt-20261102`, `/tmp/public-worker-run`, and `/workspace/diffusion-private-hidden` are absent here. Paths in published owner evidence identify that owner's storage; they are not transfer acknowledgments.

An execution environment holding the actual pair must supply a private manifest and these saved values to the management runner. Ordinary public calls require tensor metadata/values, not comparison gates, receipts, or fixture hashes.

| Manifest input / owner filename | Shape / bytes | Declared SHA-256 |
| --- | --- | --- |
| `tensors[0]`, target / `noise.f32` | `[1,16,1,2,4]`, 512 B | `ece94cda18a964b7d445303c31053cd84417d0e909b6056b251061f839c422df` |
| `tensors[1]`, source / `context-1.f32` | `[1,16,1,2,4]`, 512 B | `32007fbe7ca0b3eff16b1eff68f48a742cfadaad06685005d21ca9e569e62dfc` |
| `tensors[2]`, reference / `context-2.f32` | `[1,16,1,2,2]`, 256 B | `103b065f6c18417d8aa7529507376adf4dff549bcbde62238e487147bc5314f7` |
| `initialEmptyTarget` / `initial-empty-model-latent.f32` | `[1,16,1,2,4]`, 512 B, zeros | `076a27c79e5ace2a3d47f9dd2e83e4ff6ea8872b3c2218f66c92b89b55f36560` |
| `explicitNoise` | Same explicit noise bytes above | `ece94cda18a964b7d445303c31053cd84417d0e909b6056b251061f839c422df` |
| `conditioning.payloadPath` / `conditioning.f32` | `[1,512,4096]`, 8,388,608 B | `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7` |
| `conditioning.maskPath` / `attention-mask.u8` | 512 B | `19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62` |

Manifest fields used by the fixed owner's `prepare_inputs` are `tensors[]` (each `path`, `bytes`, `sha256`, requirement/tensor metadata), `initialEmptyTarget`, `explicitNoise`, `conditioning` (`metadata`, `payloadPath`, `maskPath`, `payloadSHA256`, `maskSHA256`), and `shapeRequest`; optional echoed metadata include `schemaVersion`, `profileId`, `caseClass`, `producerVerified`, `canonicalShape`. Text metadata must preserve all 512 rows, dtype/layout/meaning/normalization and text-model/tokenizer/producer identity. The underlying target/source/reference order is unchanged.

The explicit input scope is `bernini-small-n5-real-l512-f32-chunks-v1`, case `controlled-n5-with-real512-text-not-original-workflow-replay`: target RGB 1x16x32, source RGB 1x16x32, reference RGB 1x16x16, no extra context slots, target/source/reference token counts 2/2/1. Latents use NCTHW float32 and `wan21-comfy-f32-v1`; target means `bernini-generated-model-latent:v1`, source/reference mean `wan21-normalized-posterior-mean:v1`. Sample uses separate empty target plus explicit noise; positive and negative are separate owned copies of the same real packet with CFG1. Euler/simple6/shift5/split3 remains unchanged. This does not establish original-workflow inputs or generation readiness.

The fixed owner's `production-reference.py prepare-small` builds these small saved values from `standalone-reference.py controlled_fixture()` and verified real Text data without model NN. The controlled fixture is present in fixed Git source (declared prior fixture SHA `a30177ba13a922f29b8d9664ff1b24bc68d6a1e308c95e3a6faf23f402751d3c`). Thus deterministic input preparation can be considered separately from model inference, but no preparation was performed during this availability check and no regenerated manifest may be claimed as the received old 43,223-byte manifest without checking identity.

## One-thread / no-COI execution evidence

No matching one-thread, no-COI actual public-model sample receipt exists in the inspected fixed public-worker bundle. Its smoke, HIGH predict, sample-recovery, and failed-pair recovery receipts explicitly use `wasmThreads: 4` and Chromium COOP `same-origin` / COEP `require-corp`. The contract declares one thread as a separate resource profile; that declaration does not establish an actual execution result.

Additionally, the fixed owner Python runner unconditionally adds COOP/COEP headers, including when `--wasm-threads 1` is selected. Merely changing that flag cannot prove no-COI operation. A management run must observe `crossOriginIsolated === false`, use one thread, and record its own actual sample/progress/cancel/reload/readback evidence.

The existing successful real-L512 recovery sample executed source `0f761f374dce1d447bbb912ad13c08f9bf85c279`, took 2,945.987954757 seconds, completed HIGH3/LOW3 and 240 blocks, compared final raw 128 values, and saved/read back a 1,179-byte canonical file with all F32 bits exact. It remains evidence for that 4-thread controlled N5/L512 scope only. Later exception recovery source `6d12140eeab204385fa31f5da73d4796968a4003` reran only actual failed-pair/prefix/codec smoke, not the complete sample. Distribution commit `ffeeeedb...` does not upgrade those numerical execution identities.

The earlier standalone N5/L3 records were also inspected and do not supply a public real-L512/no-COI one-thread receipt. They remain restricted to their original controlled fixture and cannot establish the requested management execution.

## Execution handoff requirements

Use an environment with the actual pair already retained, or explicitly receive that pair; this check identified no reachable asset-owning external environment. Supply the private saved-input contract above, fixed management/source inventory, a fresh private output parent mode0700, and fresh output names. Models must enter through actual Files. Run the management sample with one thread and no COOP/COEP, observe progress, perform same-instance actual prefix cancel/reload, then complete the six-update sample and save/read the actual canonical disk File. Preserve raw generated-sample semantics and latentContract; record source identities and monitor resources independently. One-thread runtime duration has not been measured, so the 4-thread sample timing cannot support a promise of a quick run.

Read sources: fixed Git `development/ai-connection/public-worker-20261102/{README.md,RESULT.md,CONTRACT.json,evidence/README.md,evidence/manifest.json}`; actual public receipt fields; `development/ai-connection/d1-d4-production-20261102/input-contract/small-real-l512-case.json`; `tools/diffusion-models/{public-model-browser.py,production-reference.py,standalone-reference.py}`; local bounded prior-work asset paths listed above.
