# Controlled N5/L3 independent six-step reference

This contract is fixed before six-prediction execution. It uses the exact frozen
full40 input fixture (`a30177ba…`), including its target, source/reference order,
all three nonzero Text rows/mask111, and explicit `construction.explicitNoise`.
Positive and negative are distinct snapshots of the same controlled Text input;
CFG1 skips the negative neural evaluation. This is neither actual Text producer
evidence nor the original81-frame target workload.

The independent reference reuses the separately frozen NumPy full40 reference,
not the candidate runtime or a prediction callback. Original Comfy source hashes
and both reference generator hashes are in `contract.json`. The Wan21 channel
constants are read as AST literals from the original source without importing
Torch. NumPy F32 operations retain every CONST/Euler/process_in/process_out
rounding boundary. The seven simple6/shift5 sigmas, split3, and HIGH3→LOW3 are
unchanged. The HIGH public raw handoff is inverse scaling then process_out; LOW
entry is process_in (with whole-raw-zero skip) followed by zero-noise scaling.
Final raw restoration occurs after inverse scaling at sigma0, exactly once.

The 16 fixed arrays are `initialX`, `velocity00` through `velocity05`, `step00X`
through `step05X`, `highPublic`, `lowEntry`, and `finalRaw`. Every array has exact
NCTHW shape `[1,16,1,2,4]`. The unchanged all-value gate is
`abs(actual-reference) <= 0.01 + 0.001*abs(reference)`, with nonfinite values
rejected. The native diagnostic must complete six actual40-block predictions;
partial traces and ordinary finalRaw-only sample results cannot satisfy this
16-array comparison. No reference, gate, or receipt enters normal execution.

Light preparation only:

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/standalone-sampler-reference.py self-test
```

The contract has already been frozen. Do not replace it or relax gates after
comparison. Before heavy work, commit the new source, complete the separate
HIGH/LOW full40 gates, and obtain the coordinating agent's execution GO. Then:

```sh
install -d -m 700 /tmp/bernini-standalone-n5-sampler
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/standalone-sampler-reference.py run \
  --fixture /tmp/bernini-standalone-n5-low/input.json \
  --output /tmp/bernini-standalone-n5-sampler/reference.json \
  --receipt development/ai-connection/standalone-d1-d4-20261102/sampler-reference/reference-receipt.json
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/standalone-sampler-reference.py compare \
  --reference /tmp/bernini-standalone-n5-sampler/reference.json \
  --receipt development/ai-connection/standalone-d1-d4-20261102/sampler-reference/reference-receipt.json \
  --candidate /tmp/bernini-standalone-n5-sampler/native.json \
  --output development/ai-connection/standalone-d1-d4-20261102/sampler-reference/comparison.json
```

The retained model defaults are the original HIGH/LOW files in
`/workspace/work/retained/bernini`; `--models` can identify a different local
directory. Model sizes/headers and immutable stats are checked; original full-file
hashes are reused, not recomputed. This diagnostic reads all model parameters in
bounded row tiles for every prediction, without retaining a fullF32 model. The
reference forces BLAS1. Public reports contain identities, counts, errors and
timing; all tensor values stay in a dedicated mode0700 private temporary directory
with mode0600 output files. End-to-end browser/resource/product readiness remains
separate from this controlled numerical diagnostic.
