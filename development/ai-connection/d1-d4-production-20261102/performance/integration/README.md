# Existing API regression after public model adapter routing

Existing suites now distinguish an unloaded public model runtime
(`predict`/`sample` → `MODEL_NOT_LOADED`) from legacy header-only single-file
`load` (`NOT_READY`). This change does not assert paired-model/full prediction
or sampling acceptance. LoRA IO, partial linear projection, pointwise operations
and strict mean profiles do not implicitly supply a model pair.

The strict API test server allows the new static `model-adapter.mjs` dependency.
The older LoRA test server also needed the already-existing capability module
and its static tensor/mean/scheduler dependencies, plus canonical shared tensor
codec path routing. It still serves a finite explicit allowlist. No production
runtime, capabilities or build metadata were changed by this integration fix.

| Existing suite | Result |
| --- | ---: |
| API browser | 22/22 |
| LoRA IO browser | 16/16 |
| L1 API mode | 4/4 |
| E6 mean API | 4/4 |

All four reports have no page errors. `api-browser-red.log` records the expected
initial missing static dependency failure. Source paths/bytes/SHA-256 and report
hashes are in [manifest.json](manifest.json). The reports identify modified
source by these hashes; the recorded baseline commit is not a claim that the
modified files already existed in that commit.

Reproduce from the repository root (Playwright/Chromium required):

```sh
node docs/shared/diffusion-models/api/test/browser-check.cjs
node docs/shared/diffusion-models/api/test/lora-browser-check.cjs
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/test-l1-browser.py \
  --mode api --output /tmp/l1-api.json
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/e6-api-browser.py \
  --output /tmp/e6-api.json
```

The two Node runners write their legacy result files beside the runner. This
receipt copies those outputs into the present directory and preserves the
previous committed historical result files. No original model was opened and
no model inference/export was run for this regression.
