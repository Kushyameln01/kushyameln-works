# Reproduce the independent tail references

Use the existing private retained models and full prefix/head artifacts. No model download, full-model hash, new prefix execution, original artifact overwrite or public numeric arrays are needed. The O→chunk2 gate→patchHidden residual is one acceptance unit; production readiness stays `NOT_READY`.

Run from the repository root, with bytecode disabled and one BLAS thread:

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python development/ai-connection/self-attention-tail/core/test-reference.py
```

For each `side=high` / `HIGH` and `side=low` / `LOW`, first record the retained artifact/header inventory:

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python tools/diffusion-models/tail-reference.py \
  --models /workspace/work/retained/bernini --side HIGH \
  --prefix-actual /workspace/work/diffusion-private-hidden/high-prefix-actual.json \
  --prefix-reference /workspace/work/diffusion-private-hidden/high-prefix-reference.json \
  --heads-reference /workspace/work/diffusion-private-heads/high-composed-reference.json \
  --inventory development/ai-connection/self-attention-tail/core/high-inventory.json
```

Capture actual attention with the separate integration recipe first. It reruns the accepted old attention owner from the authenticated full prefix, disposes it, and writes new private context. Then generate both references in one selected-weight traversal:

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python tools/diffusion-models/tail-reference.py \
  --models /workspace/work/retained/bernini --side HIGH \
  --prefix-actual /workspace/work/diffusion-private-hidden/high-prefix-actual.json \
  --prefix-reference /workspace/work/diffusion-private-hidden/high-prefix-reference.json \
  --heads-reference /workspace/work/diffusion-private-heads/high-composed-reference.json \
  --context /workspace/work/diffusion-private-tail-attention-20261101/high-attention-actual.json \
  --context-receipt development/ai-connection/self-attention-tail/integration/high-attention-capture.json \
  --output-dir /workspace/work/diffusion-private-tail-reference-final-20261101 \
  --receipt-dir development/ai-connection/self-attention-tail/core/final-reference
```

LOW substitutes `LOW` and `low` in the same command. Outputs must be new absolute private paths outside this repository; existing private reference files are never overwritten. A repeat needs a new output directory. The fixed capture receipts bind the original captured artifact bytes, so a recapture must receive explicit source/receipt review before replacing those trust anchors.

New private references use schema `bernini-self-attention-tail-reference/0.1`, modes `LOCAL_ACTUAL_INPUTS` and `COMPOSED_INDEPENDENT_PREFIX`, and flat `expected.o/gateProjection/gate/gated/residual` arrays. Public receipts remove `expected` and retain hashes, exact selected range identities, input bindings, gates, software/precision details and bounded-read counts. `inputs` are identities only. Independent references never provide the actual runtime arrays.

Before acceptance, independent review tightened the standalone composed-head receipt admission to an exact known SHA and made the1e16 boundary compare in binary64, matching the runtime literal. This changes neither numerical arithmetic nor the fixed gates. Initial private references and public receipts are preserved; the exact initial generator bytes are archived at `source-snapshots/tail-reference-initial.py` (a byte snapshot, not an executable from its moved location). Final references are newly created in the exclusive directory above and their public receipts in `final-reference/`. Public reference receipts bind their exact generator SHA. Repeated arithmetic produces identical private reference hashes; the final receipt identifies the stricter generator.

The synthetic reference tests verify the fused-versus-separate rounding distinction, channel broadcast, zero gate/original patch basis, absent scale+1, wrong fullshape/offset/range, bad shape/finite/range, representable F32 values around the exact1e16 limit, frozen-plan tampering, caller success booleans and self-consistent composed-receipt substitution. Integration must additionally run actual runtime boundary/lifecycle/parameter decoder gates and every numerical acceptance gate. Passing these synthetic tests alone is not numerical model acceptance.
