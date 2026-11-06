# Frozen-source whole-sequence Worker diagnostic

`tools/diffusion-models/production-chunk-browser.py` serves captured committed sources and declared saved input files to a real Chromium **DedicatedWorker**. The model enters the page through a local `File` input and is cloned as a File handle to the Worker. Model bytes are never served over HTTP. The Worker calls actual `createBerniniModelCandidate(...).diagnoseChunks(...)`; it does not substitute a predictor.

The explicit configuration is `numThreads:4`, `readAheadBytes:1048576`, lookup Hike FP8 decoder, max128 query rows and `stopAfterBlock:0` by default. COOP `same-origin` and COEP `require-corp` are set on every local response; cross-origin isolation is required before construction. The selected stage list includes all original prefix, post-modulation, final K/V/Q, self attention/O/residual, cross K/V/Q/attention/residual, FFN output and block output boundaries. Every selected stage must cover its entire declared row population contiguously. N73947 is not truncated to the legacy128-token `diagnose` domain.

## Source and input freeze

Before constructing Chromium or the oracle child, the driver verifies:

1. Full supplied execution SHA equals current HEAD.
2. Every `BUILD_SOURCES` asset matches its owner hash and fixed Git bytes.
3. Driver, Worker module, independent reference sources, observer and pinned pre-execution contract are tracked at the same SHA and unchanged.
4. The fixed source/input/shape/precision/gate contract matches the saved manifest.
5. Each explicitly whitelisted latent/Text/mask file matches bytes and SHA-256.

Only captured source bytes and explicitly declared input URLs are served. No directory fallback, model route or arbitrary private path exists. Runtime modules are served from the immutable captured bytes. Source HEAD and bytes are checked again after execution. The receipt records all captured path/bytes/hash identities and requested URLs. Private paths in the receipt describe local execution assets; they are not recipient acquisition acknowledgements.

## Bounded independent comparison

The Worker posts each owned F32 callback chunk as raw binary to `/compare`; body size is at most8MiB (the FFN-capable emitter maximum is7,077,888 bytes). A bounded metadata header preserves stage, full shape, compact shape, row span/axis, dtype, model, timestep and source coordinates. Binary transport preserves signed zero. The body is not encoded as millions of JSON numbers.

A single serialized independent oracle process consumes the chunk as a comparison operand and returns scalar error counts, max errors and hashes only. Actual native values never enter independent X/K/V, the native graph or a subsequent model input. Reference values and error gates remain diagnostic-only. Independent row cache is one current row group; coverage uses intervals, not retained arrays per chunk. No complete intermediate-output collection is saved.

The separate process makes failure cancellation concrete: the harness can terminate an outstanding independent NumPy operation, close its OS handles and remove private X/K/V files. This adds bounded IPC copies of one callback body; the combined resource monitor must include that child. On clean completion it obtains before/after-close reference stats, closes normally, joins the child and removes backing files. On cancellation or failure it terminates the child and reports the exit/cleanup state. Input artifacts remain untouched.

## Resources and progress

The resource observer is installed in the DedicatedWorker before importing candidate/ORT/Hike modules. It observes WASM Memory capacities through non-owning WeakRefs and restores original hooks after disposal. Three-second messages include current native operator/timers, completed row progress, chunk comparison boundary, named host/cache spans and available JS-heap observations. Python prints compact progress every five seconds. Last-event history is bounded; no stage tensor is retained in it.

Candidate cleanup completes before the `after-dispose` resource snapshot. Worker termination and `browser.close()` follow. WASM capacity is not allocator live bytes, `performance.memory` omits most ArrayBuffer backing stores, and internal ORT copies/allocator peaks remain unobserved. An outer monitor must measure parent, oracle child, browser descendants, RSS/PSS, tmpfs and host cache from before construction through cleanup. These observations must not be summed into an invented exclusive total.

## Reproduce

First commit all executable sources and regenerate the owner build identity. Freeze the input contract after the last numerical source edit, then commit that contract. With fresh private/output paths:

```sh
python3 tools/diffusion-models/production-chunk-browser.py --self-test
python3 tools/diffusion-models/production-chunk-browser.py \
  --manifest /tmp/d1-d4-production-73947-inputs/inputs.json \
  --contract development/ai-connection/d1-d4-production-20261102/reference/full-declared-preexecution.json \
  --model-dir /workspace/work/retained/bernini \
  --side HIGH --source-commit FULL_COMMITTED_EXECUTION_SHA \
  --private-reference-dir /tmp/new-full-block0-reference \
  --output /tmp/new-full-block0-receipt.json --block-limit 0 \
  --diagnostic-timeout-seconds 3600
```

`--validate-only` performs source/model-descriptor/input admission without starting the model, oracle process or browser. The watchdog is an operational limit, **not an accuracy or performance acceptance condition**. On expiry the harness requests cancellation, gives native disposal a bounded grace period, terminates the Worker/browser and kills any outstanding independent reference operation. The receipt preserves the first failing boundary, shapes, completed rows, current operator/timers, comparison coverage and observation limits.

A pass means the selected complete block boundaries passed all declared queries, keys and heads for this saved case. Even block39 stop mode returns no final head or velocity. It cannot establish full `predict`, six updates, generated sample, original-media replay, original mxfp8 equivalence or generation READY.
