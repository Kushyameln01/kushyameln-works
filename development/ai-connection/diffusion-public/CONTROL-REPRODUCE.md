# Public Diffusion browser control reproduction

`tools/ai-connection/run-diffusion-public-control.mjs` verifies the adopted
`createDiffusionModels({sessionId})` factory and its actual module Worker through
the management adapter. It supplies no injected API. This is a development
control harness, separate from the shipped management page and from the runner
that selects the retained real HIGH/LOW pair.

This suite does **not** load real models or run neural `predict`/`sample`.
Its tiny invalid model Files test native preparation rejection. Its 128-value
tensor is a **synthetic codec fixture**, never a model output. Producer and decoder
hashes in that fixture are metadata declarations needed by the canonical codec;
they do not establish neural provenance. Generation READY, original-workflow
acceptance and production acceptance remain false.

## Run

Use the existing Node, Playwright and Chromium installations. No dependency
installation or model download is needed. The runner currently selects Playwright
at `/opt/codex/cua_node/lib/node_modules/playwright` and Chromium at
`/usr/bin/chromium`, matching the existing standalone browser runner.

From the repository root, use a **fresh**, private output directory outside
`docs/`. Replace the SHA with the complete management commit containing this
runner, the adapter and the adopted native tree:

```sh
node tools/ai-connection/run-diffusion-public-control.mjs \
  --manager-commit FULL_40_CHARACTER_MANAGEMENT_COMMIT \
  --out /private/path/diffusion-public-control-fixed
```

In a sandbox, the process needs permission to bind a loopback HTTP server and
launch Chromium. The server handles static source GET requests only. Browser
routes reject other origins and methods. Model/tensor File contents are not
uploaded to the server.

For an explicitly unfrozen development run:

```sh
node tools/ai-connection/run-diffusion-public-control.mjs \
  --development --out /private/path/diffusion-public-control-dev
```

A development PASS reports `fixedSourceVerified: false`. It is not fixed-commit
evidence. Existing output directories are rejected to preserve earlier receipts.

## What is checked

1. Capabilities come from the real public factory: the legacy
   `modelInference: false` coexists with the seven implemented model operations.
   Model execution remains unavailable until a real pair is loaded.
2. The server sends **no COOP/COEP headers**. The browser reports
   `crossOriginIsolated: false`. Explicit four-thread load is rejected by both
   management admission and the actual native Worker with no one-thread fallback.
3. An explicit one-thread paired load uses actual disk-selected, eight-byte
   HIGH/LOW Files. Its expected native `INVALID_SAFETENSORS` header error confirms
   Worker admission. The public factory discards the failed preparation Worker;
   management exposes `reloadRequired: true`, `cleanupRequired: false` and
   `loaded: false`. A fresh Worker then returns a clean empty native model status.
4. Pre-aborted and queued requests do not dispatch model work. A queued request
   reports no fabricated native stop or original terminal. A separate exact-target
   cancellation terminates an actual in-flight `modelStatus` control Worker,
   waits for the original request terminal and closes the queue record. It marks
   reload required and rejects a following sample before load. This is control
   cancellation evidence; it is not real neural sample cancellation evidence.
5. `saveTensor` runs the native canonical codec for a 128-F32
   `[1,16,2,2,2]` synthetic raw generated-sample fixture. An actual browser download
   is saved to disk, selected again through a native file input, and passed to
   `readTensor`. Independent binary header/payload checks verify WKTSR001,
   SHA-256, all 512 payload bytes, negative zero, meaning, producer/decoder IDs,
   and the raw/restored `latentContract`. The management-owned artifact also
   preserves the bytes and meaning. No posterior-mean relabeling or additional
   restoration occurs.
6. Successful unload closes the empty control Worker. Disposal releases owned
   artifacts and closes the remaining Worker. Worker close events are awaited
   **before** browser shutdown; browser teardown does not supply this evidence.
7. Every served source file, including the runner itself, is compared byte for
   byte and by SHA-256 with the specified complete management commit. The native
   bootstrap fetches all 150 files in its pinned source manifest. The receipt
   checks the actual manager, Worker and ORT source GETs and all native hashes.
   Source GETs alone are not counted as Worker or ORT execution.

## Receipts and limits

The output contains `result.json`, a screenshot, the two invalid model fixture
Files, a 512-byte F32 fixture payload and the actual downloaded `.wktensor` file.
`result.json` records each case, full source hashes, static requests, observed
Worker creation/close events, environment, file metadata and payload hashes.

PASS is limited to this control/file scope. A successful empty-owner unload does
not prove cleanup of an allocated real model pair. This suite measures no total
RAM, ORT allocator memory or production numerical accuracy. One-thread admission
without COI does not prove a successful real-model sample on GitHub Pages.
Real HIGH/LOW load, progress, neural sample, neural cancellation/reload and real
sample save/readback require the separately supplied retained-environment runner.
