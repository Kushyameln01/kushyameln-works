# Changed resource boundaries

The distribution/execution commit is assigned by the enclosing D1–D4 result.
These tests ran against captured modified source bytes while Git HEAD remained
`3aed2f696adf36385b54cfaa5019d447d64984e0`; that baseline is not the modified
implementation's identity. [manifest.json](manifest.json) and each native report
pin the actual source paths, bytes and SHA-256. No private model data appears in
these receipts.

## Implemented

- Explicit bounded raw read-ahead, default0 and maximum1MiB, confined to a single
  original tensor. Selected blocks and F16/FP8 decode profiles are unchanged.
- Owned prepared finite F32 CPU weight handles, copy or explicit transfer,
  reused across query tiles with stage-scoped release and failed-cleanup recovery.
- Owned Q/online-state CPU tensors across ordered K/V tiles. Finish requires all
  declared keys, returns owned copies and releases the query. The existing
  `attentionTile` arithmetic graph remains the oracle for exact path parity.
- Explicit verified ORT thread1/default or thread4/COI resource profiles. The
  latter proves three actual pinned pthread Worker creations and fails closed
  when isolation/runtime initialization cannot support it. Profile changes need
  a fresh Worker/realm.
- Storage/read/cache/decode/copy counters and host/native-run timing scopes.

The public contracts are documented in
[resource-profiles.md](../../../../docs/shared/diffusion-models/execution/resource-profiles.md),
[model-read-window.md](../../../../docs/shared/diffusion-models/execution/model-read-window.md)
and [owned-attention-query.md](../../../../docs/shared/diffusion-models/execution/owned-attention-query.md).

## Reused evidence and new verification

The graphs, original F16/FP8 decoder, H40/D128 layout and online-softmax recurrence
are reused. Existing full-model N5/L3 results are not promoted by these tests.

[node-owners.log](node-owners.log): 28/28 normal/cancel/cache/range/ownership and
failed-release tests pass. Controlled payloads use pinned actual model headers;
selected legacy/lookup F16/FP8 F32 values and diagnostic hashes remain identical.

[changed-boundaries.json](changed-boundaries.json): 8/8 fresh-browser groups pass:
prepared weights, unchanged existing Gemm/attention regression, owned attention
on both threads1 and4, resource1/resource4, nonisolated refusal and incompatible
preinitialized-backend refusal. Prepared full inner13824 ×128rows passes the
independent F64 gate and old-path bit parity. Owned attention uses H40/Q3 with
7keys and all263keys (256+7), verifies every max/denominator/context value,
retains bit parity, rescales rising maxima and validates cancel/retry/recovery.
The native browser query high-water and final released counts are retained in
the receipt. These are primitive acceptance shapes, not a full sequence.

[thread-profile.json](thread-profile.json): predeclared all-value gate
`abs(error) <= 0.001 + 0.0001*abs(reference)` passes 927,744 independent F64
comparisons per thread mode. Four output hashes match bit for bit. Seven-repeat
median timings on this machine:

| Case | threads1 | threads4 | ratio1/4 |
| --- | ---: | ---: | ---: |
| Gemm M128/N2048/K2048 | 43.955ms | 17.215ms | 2.553 |
| Attention H40/Q128/K256/D128 | 38.740ms | 17.555ms | 2.207 |

These are bounded controlled-input measurements, not overall model speedups.
The prepared-weight benchmark also verifies fewer JS weight snapshots; its
per-run time is recorded as an observation, not an end-to-end forecast.

## Remaining resource/acceptance scope

Native ORT may still copy retained CPU tensors into WASM for each run.
`runtimeInputSpanBytes` counts those logical feed spans; physical uploads are
unmeasured. Query CPU span sums can include backing aliases. Thread experiment
WASM observations cover the main realm, not pthread realms or process RSS/PSS.
No aggregate whole-model pool admission follows from per-tile bounds.

Real model QKV, full original token count, all40blocks, HIGH→LOW six updates,
original-production precision, combined host/cache/ORT/pthread budget and
public Worker completion remain separate enclosing acceptances. No
`load/predict/sample` or production capability is enabled by this receipt.

## Reproduce

From the repository root, use the commands at the end of
`docs/shared/diffusion-models/execution/resource-profiles.md`. Node owner tests
need no model or browser. Native reports need Python NumPy/Playwright and
`/usr/bin/chromium`; each thread profile is run in a fresh isolated browser.
The runner serves captured source bytes on localhost and checks them unchanged
after the run. Normal APIs never take these references or receipts as inputs.
