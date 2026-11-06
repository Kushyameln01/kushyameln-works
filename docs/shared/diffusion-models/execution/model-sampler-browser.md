# Controlled N5 six-NN browser harness

This is preparation for an actual six-update experiment, separate from the
required original target `[1,16,21,60,104]` and complete context population. No
production acceptance follows from a successful controlled N5 run.

`model-sampler-browser.py` requires an exact committed HEAD and byte-identical
tracked runtime dependencies before and after execution. Its source list extends
the existing frozen full40 prediction harness with the sampler, scheduler,
Euler, generated-space and canonical tensor codec modules and WASM assets.
Commit these new harness files and all runtime dependencies before invoking it.
Existing frozen runtime/fixture files are read without modifications.

Required local sources are both retained original HIGH/LOW safetensors files,
the exact private `standalone-n5-l3-input.json` fixture (SHA256
`a30177ba13a922f29b8d9664ff1b24bc68d6a1e308c95e3a6faf23f402751d3c`),
the committed existing reference identity contract, its pinned Comfy core source,
Chromium and Python Playwright. The normal browser inputs contain no expected
values, reference receipts or numerical gates. The independent reference and
any comparison remain separate from this execution harness.

The frozen fixture supplies three canonical streams (two target tokens, two
source tokens and one reference token), controlled Text L3 and explicit noise
from `construction.explicitNoise`. Both CFG branches receive separately copied
controlled Text, and CFG1 skips the negative neural pass. This is declared model
metadata, not a verified Text Encoder or VAE producer. The frozen target tensor
is retained, but at initial sigma1 its CONST coefficient is zero. No seed or RNG
is introduced.

First run only the preflight:

```sh
python docs/shared/diffusion-models/execution/model-sampler-browser.py \
  --source-commit COMMITTED_SHA \
  --fixture /workspace/work/diffusion-private-hidden/standalone-n5-l3-input.json \
  --private-output /tmp/bernini-six-n5/run.json \
  --output /path/to/public-metrics.json \
  --check-only
```

The dedicated `/tmp/bernini-six-n5` parent must be owned by the current user with
mode0700. It is created by the harness if absent. Private snapshots and encoded
sample files use mode0600 and exclusive new paths. Outputs cannot already exist.
The HTTP server serves public modules from `docs`; model and fixture bytes enter
Chromium through actual File inputs, never whole-model HTTP reads.

After preflight and when actual NN execution is authorized, remove `--check-only`.
The default mode invokes the real candidate's normal `.sample` once: six complete
full40 predictions, HIGH three times then LOW three times. It saves the returned
final raw sample privately. Add `--diagnose` to call `.diagnose` once instead and
save all sixteen cloned `initialX`, `velocity00`..`velocity05`,
`step00X`..`step05X`, `highPublic`, `lowEntry` and `finalRaw` arrays.
Neither mode silently runs the other; each requires six actual
predictions. Both use the same real candidate and ordinary input contract.

The final raw generated sample is encoded with the canonical codec, compared
bit-for-bit after browser decode, and saved as `run.json.wktensor`. The host then
selects that actual saved path into a new browser File input and decodes it again.
Encoded hashes, every payload bit through its SHA256 and all generated metadata
must agree with the original output. The restored/raw/generated-sample contract
and ordered `[HIGH,LOW]` model producers remain distinct from the decoder VAE.

Public JSON and progress JSONL contain shapes, identities, source/host counters,
timings, model evidence and codec readback metrics. Numerical tensor values are
private. Resource counters distinguish host stage copies and shared ORT sessions;
they do not establish aggregate RSS or native-resident weights. Model header/size
identity and stable file stats are checked; a full model hash is not recomputed.

The default timeout is six hours. No measured six-NN duration exists yet. A run
counts as completed only after all six complete40-block model results, final
restoration, codec save/readback and cleanup. Public APIs remain `NOT_READY`;
`acceptedProduction`, `generationReady`, `publicRuntimeEnabled`, original
precision parity and original81 acceptance remain false.
