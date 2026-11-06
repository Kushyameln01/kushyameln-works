# Original-target storage and maximum FFN tile resource diagnostic

This diagnostic is **prepared, not executed** until an explicit execution GO.
It does not enable public load/predict/sample or accept the original81-frame
workflow. It keeps four nonzero capacity-sentinel host arrays with the canonical
target+source81 sequence shape `[1,65520,5120]`, each1,341,849,600bytes,
5,367,398,400bytes combined. These are allocated storage, not saved or calculated
production hidden states. No multi-gigabyte payload hash, serialization or copy is
performed. One F32 word per4096byte page plus the exact tail is checked.

The same page holds the real immutable LOW block0 FFN-up weights as three output
chunks5120/5120/3584, with full5120 inner dimension, and the complete
FFN-down `[5120,13824]` weight:566,231,040bytes of ownedF32 cache. The existing
source registry supplies original keys/shapes/bindings/FP8 scales, and its Hike
lookup decoder supplies each bounded owned block. This harness adds no numeric
weight conversion or LoRA arithmetic.

It invokes the existing real ORT Gemm with M128/N5120/K13824, then existing Hike
bias. All655,360 biased outputs are compared against the independent existing
NumPy `Parameters.linear` computation from the original LOW file:full-inner F64
dot, explicitF32 projection rounding, separateF32 bias. Gate is fixed before
execution: absolute0.001 plus relative0.0001, all values finite. The controlled
input is a dyadic coordinate fixture, not real FFN activation or post-modulation
hidden. Original storage dtype/scale and computeF32 are explicit.

Keeping four stores during FFN is a conservative named-span overlap. The actual
candidate normally has four hidden stores during self-attention and one during
FFN; this diagnostic is not a trace of that complete schedule. Its named spans,
unverified1GiB ORT reservation and1GiB other allocator reservation total less than
8GiB, with a separate2GiB safety reservation in a16GiB cgroup. This plan does not
bound all allocator behavior or establish aggregate peak memory. The result must
report actual process RSS separately, plus the existing weak WASM.Memory observer
and owner copy counters. Unknown memory stays unknown. No cache-dropping command
is used.

Light preparation reads no model payload and allocates no target arrays:

```sh
PYTHONDONTWRITEBYTECODE=1 python development/ai-connection/standalone-d1-d4-20261102/target-capacity/run.py prepare
PYTHONDONTWRITEBYTECODE=1 python development/ai-connection/standalone-d1-d4-20261102/target-capacity/run.py self-test
node --test --test-isolation=none development/ai-connection/standalone-d1-d4-20261102/target-capacity/test-plan.mjs
```

`self-test` hashes the controlled input with at mostone55,296byte row resident;
it does not construct the production stores, weight cache or any native/reference
MatMul. Node tests use scalar coordinates and metadata only.

After the parent confirms the current six-NN sampler and all other real NN owners
have exited, commit these new sources with unchanged runtime dependencies. Heavy
phases reject other known NN/reference process owners and uncommitted source.
An OS phase lock also mutually excludes this diagnostic's numerical processes;
other harnesses still require coordinator-controlled sequential execution. The
runner requires Linux cgroup metadata; that is a diagnostic environment condition,
not a browser model API portability claim.
The reference and native phases must be sequential and use exactly the same
commit. All served JS/WASM bytes come from a verified captured snapshot.

```sh
PYTHONDONTWRITEBYTECODE=1 python development/ai-connection/standalone-d1-d4-20261102/target-capacity/run.py reference \
  --source-commit FIXED_COMPLETE_SHA \
  --private-dir /tmp/bernini-target-capacity \
  --meta development/ai-connection/standalone-d1-d4-20261102/target-capacity/reference-meta.json
PYTHONDONTWRITEBYTECODE=1 python development/ai-connection/standalone-d1-d4-20261102/target-capacity/run.py native \
  --source-commit FIXED_COMPLETE_SHA \
  --private-dir /tmp/bernini-target-capacity \
  --meta development/ai-connection/standalone-d1-d4-20261102/target-capacity/reference-meta.json \
  --report development/ai-connection/standalone-d1-d4-20261102/target-capacity/native-result.json
```

Pass `--models /recipient/model-directory` to either phase, or use `--model` for
an exact LOW file path. The convenience default uses the provider's retained
model directory; recipients do not need that path. The default core is the
tracked public captured source
`development/ai-connection/profile-adoption/p4/core-source/comfy/ldm/wan/model.py`
(83,811bytes, SHA256`17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699`).
`--core` may supply identical captured bytes elsewhere. The complete model
enters Chromium as a local File; the HTTP server never serves that model. Its
previously verified full hash is reused, not recomputed. Only the bounded actual
parameters and private reference output are read. The private reference binary is
mode0600 inside an owned mode0700 `/tmp` directory; public reports contain
counts/shape/hashes/error/resource metadata, not numerical outputs or weights.

Use the existing process-tree monitor on the runner PID to obtain RSS observations;
RSS sums can duplicate shared pages, PSS may be unavailable, and shared-cgroup
memory.peak is historical. The native observer reports actual reachable memory
object buffer lengths, not physical allocations or OS release. All owner cleanup
is attempted after success, error or cancellation. Host references are dropped,
not zeroed or serialized; the dedicated browser closes before the runner reports.
Optional `--cancel-after-stage host-stores-ready|weights-ready|before-linear`
produces a separately scoped cancelled result and never numerical acceptance.

Even if this unit passes, full-query attention, production Q/K/V, all40blocks at
this target, target-specific precision, six-update sample and the complete
candidate allocation schedule remain unaccepted.
