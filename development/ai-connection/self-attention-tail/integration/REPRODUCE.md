# Tail browser experiment

Use Python with `PYTHONDONTWRITEBYTECODE=1`, installed Playwright/Chromium, and loopback network permission. Models and private JSON files stay outside the repository. The HTTP server serves only the resolved `docs` directory on `127.0.0.1`; models enter via browser File, private arrays through Playwright arguments. No model HTTP route, download, full-file hash, full-model inference, commit, push, or deployment is performed.

Capture was performed once per side using the original full actual prefix artifacts and the immutable accepted `createDerivedQkvHeads`. It did not recompute prefix, `timeAct1`, or chunk0/1. Each context was checked against all prior local/composed gates and matched the exact previously accepted context bit hash. Each old native owner was disposed before browser close. HIGH browser closed before LOW browser launched.

The capture-time Python source bytes are archived in `capture-harness-source.py` and mapped to their recorded original path by `capture-source-snapshot.json`. This archive preserves the recorded code bytes; restore it to its original repository path in an isolated historical checkout to reproduce capture. The current runner adds final reference and receipt admission. Existing capture outputs must never be overwritten.

The final tail experiment reads the new actual-context artifact and final independent references; each tail runs in a fresh browser after the old browser has closed:

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/tail-browser.py \
  --mode tail \
  --private-dir /workspace/work/diffusion-private-tail-attention-20261101 \
  --private-reference-dir /workspace/work/diffusion-private-tail-reference-final-20261101
```

Before rerunning, provide a new `--output-dir` containing copies of the immutable capture receipts and `capture-source-snapshot.json`; output creation uses exclusive mode. The current exact two context artifact/receipt IDs, full-prefix artifact/receipt/array IDs, four final reference receipts and four reference payload hashes are pinned. Unknown/altered receipts and wrong side/block/timestep fail closed. `--validate-only` runs admission without constructing any browser/model operator.

Tail measurements describe only the fresh tail realm. They do not measure the old and tail owners in one realm or establish a combined budget. Distinct physical Memory capacities, active sessions, retained caller outputs, named host extents and cumulative copy traffic are separate observations. ORT allocator live bytes, host/GC/File backing and total OS peak remain unknown. Hike/ORT module bytes are hash attributed, deduplicating shared ORT Memory identity.

The old 98-asset baseline is checked against its fixed commit receipt. Current numerical/runtime bytes are checked strictly; explicitly changed root build metadata is listed separately with old/current hashes. The current diagnostic's executed source inventory is distinct from that historical package guard.

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/test-tail-browser.py
node --test tools/diffusion-models/test-tail-browser.mjs
```

Acceptance is one complete O projection, chunk2 gate and original `patchHidden` residual unit per side, with all local/composed comparisons passing. `load`, `predict`, and `sample` remain `NOT_READY`.
