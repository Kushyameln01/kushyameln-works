# N2/all-head scope and reproduction

The accepted numerical unit is all2 query tokens and all40 heads from actual block0/timestep-derived hidden, before `self_attn.o`. It is a separate profile from the unchanged explicit16/head0 diagnostic. Rect raw mean is `[1,16,1,2,4]`, producing native grid `[1,1,2]`; it does not represent the original81frame input. Context is absent and sourceID0. The LOW diagnostic is not a HIGH output handoff. `load/predict/sample` remain `NOT_READY`.

1. Obtain the original side-specific model and the separately accepted private prefix artifact from the prefix owner. Verify the model receipt and the public `hidden-runtime/{side}-comparison.json`. The prefix must be disposed before constructing downstream. The scripts read the local File in bounded slices and never serve the safetensors file over HTTP.
2. Generate two independent reference files, outside this repository. `--input-hidden` accepts actual runtime hidden bits for a local gate; `--prefix-reference` accepts `expected.hidden` from the independent prefix oracle for the composed gate. Keep those references distinct. Set `OPENBLAS_NUM_THREADS=1` and `OMP_NUM_THREADS=1` (the reference script sets both before NumPy import). Existing output files are refused.

```sh
python tools/diffusion-models/head-reference.py --models MODEL_DIR --side LOW \
  --input-hidden PRIVATE_LOW_ACTUAL.json --output /tmp/low-local-reference.json \
  --receipt development/ai-connection/qkv-next/expansion/low-local-reference-receipt.json
python tools/diffusion-models/head-reference.py --models MODEL_DIR --side LOW \
  --prefix-reference PRIVATE_LOW_PREFIX_REFERENCE.json --output /tmp/low-composed-reference.json \
  --receipt development/ai-connection/qkv-next/expansion/low-composed-reference-receipt.json
python tools/diffusion-models/head-browser.py --model MODEL_DIR/Bernini_LOW_fp8_e4m3fn_scaled.safetensors \
  --artifact PRIVATE_LOW_ACTUAL.json \
  --producer-receipt development/ai-connection/qkv-next/hidden-runtime/low-comparison.json \
  --local /tmp/low-local-reference.json --composed /tmp/low-composed-reference.json \
  --output development/ai-connection/qkv-next/expansion/low-browser.json
```

Repeat for HIGH with its model and side-specific private artifacts. The harness verifies public producer/reference receipts, artifact/source/reference full SHA, fixed plan/gates, and independent-prefix source before constructing a browser. Node and admission-only negative checks:

```sh
node --test --test-isolation=none tools/diffusion-models/test-head-boundaries.mjs
python tools/diffusion-models/test-head-reference-anchors.py --artifact PRIVATE_LOW_ACTUAL.json \
  --local /tmp/low-local-reference.json --composed /tmp/low-composed-reference.json \
  --out development/ai-connection/qkv-next/expansion/negative-reference-anchors.json
python tools/diffusion-models/build-head-profile.py
```

The resource planner is `attention-heads/budget.mjs`. Its arithmetic is a resource plan, with `ORTMemoryBytes:null`; it never supplies numerical admission. `phase-plans.json` covers N2, target32760 and one context65520 scenario, including serial2session and old/new4session alternatives. The latter explicitly includes6H with separate hidden/KV, or5H only with proven shared immutable original hidden; these are alternatives, not additive. Unknown ORT allocator, GC and FFN are not assigned zero.

```sh
python tools/diffusion-models/head-budget-probe.py \
  --output development/ai-connection/qkv-next/expansion/host-allocation.json
```

The probe requires cgroup headroom for all3H host arrays plus a fixed2GiB reserve, fills every element with nonzero values, holds them while sampling, closes the browser and checks owned processes have exited before the second scenario. It creates one real attention ORT session and one Hike Memory but performs no numerical model run. It writes no large cache to disk. It does not validate a4GiB WASM graph, allfullquery compute, FFN, precision or fullmodel throughput.

No pointwise1,048,576-element cap, mean profile, original workflow schedule, existingN16 module, or full-model readiness flag is changed. The original allweights-Memory/dense-score rejection is reused rather than retried. New kernels are unnecessary: the verified old RoPE/stream native ABIs already accept exact rows2; new hosts and a new ORT Q2 graph select that native shape without padding.
