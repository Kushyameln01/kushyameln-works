# Full-model completed-F32 weight feed

`createFullModelWeightFeed` in [model-weight-feed.mjs](./model-weight-feed.mjs)
connects LoRA-owned completed weights to the real model's original-coordinate
readers. It performs no low-rank product or scale application. Base execution
does not require a package or another inference module.

```js
const feed = await createFullModelWeightFeed({source: immutableOriginalSource});
const registry = feed.consumer.describe();
const baseProvider = feed.baseProvider;
// The LoRA owner supplies an owned lora-standalone/1.0-draft.1 package.
const candidate = await feed.consumer.prepareLoad(ownedPackage, context);
await feed.consumer.validate(candidate, context);
const publication = await feed.consumer.commit(candidate, context);
await feed.consumer.releaseCandidate(candidate);
// The consumer retained its own capability before publication.
await ownedPackage.release();
const operation = feed.capture({operation: true});
try { /* real operator/model uses operation.source or pinned feed.source */ }
finally { await operation.release(); }
await feed.clear(); // genuine immutable base; no subtraction of prior deltas
await feed.dispose(); // does not dispose the caller-owned original source
```

The public Worker/MessagePort integration is described in the main API document.
This lower-level owner accepts capabilities in its own execution environment;
functions and WASM pointers are not structured-clone payloads.

## Canonical mapping and native binding

The verbatim LoRA source is fixed to
`6d0c8df4cd4992f26745d2d26394f5e194d2567f`; file hashes are recorded in
[lora-source-manifest.json](./lora-source-manifest.json). The canonical table is
byte-for-byte identical to the previous Diffusion table: 47,893 bytes,
SHA-256 `772ca63c3b82bafa7b2345cdda3361679112fcf4a97c79b67564da0fa196217d`.
The former import path reexports it, preserving all 1,095 native entries,
aliases and original header provenance.

The unchanged LoRA logical schema addresses 1,053 rank-1/2 weight/bias targets.
Its logical bindings do not claim to be ONNX initializers. The separate
`bindingDescriptor` links logical key, original full shape and weight ID to
actual native `binding`, `operatorBinding`, transform, storage/compute dtype and
FP8 scale/profile. Runtime matrices feed actual ORT weight inputs; vectors feed
Hike bias/normalization parameters. No initializer mutation is assumed.
The 41 modulation tensors and rank-5 patch convolution remain immutable base
under this logical contract. Every native parameter remains readable.

Original F16 and scalar-scaled E4M3FN are decoded by the existing Hike source to
owned F32. Completed F32 is consumed without a second quantization conversion.
`modelHash` is the expected original identity; the current source authenticates
the pinned header/size. It does not claim a freshly recomputed whole-file hash
or verified LoRA training-base compatibility.

## Ownership and admission

The returned owner exposes `describe`, `baseProvider`, stable effective `source`,
`consumer`, `capture`, `clear`, `stats` and `dispose`.

`baseProvider.describe()` returns stable model/side/registry/header/size/decode
identity. `readBlock(weightId, offset, count, context)` requires the matching
identity, original `fullShape` and whole matrix rows. It returns an independent,
compact finite F32 array from the immutable original only. Package reads up to
1,048,576 elements are split into native reads of at most 81,920 elements and
the native per-target row limit. Native decoder calls are serialized. Native
limits are unchanged.

`consumer` implements `lora-standalone/1.0-draft.1`: `describe`, `prepareLoad`,
`validate`, `commit`, `rollback`, `releaseCandidate` and `currentEpoch`.
Preparation verifies manifest hash, exact logical registry, captured genuine
base identity and full-coordinate selected ranges, then retains its own package
capability. Validation reads every declared selected value in bounded blocks,
checks finite compact F32 and current identity, and discards comparison scratch.
It requires no expected output, numerical gate or forward executor. Receipts
distinguish structural validation from independent numerical comparison.

Commit retains an independent active capability, pins the candidate while
awaiting retain, and rechecks transaction/current/abort/epoch immediately before
publication. The receipt declares lease ownership. Rollback restores only its
own current publication. Candidate terminal operations are exclusive; failed
releases remain owned and retryable. A failed `clear` retains its release
capability, fences new weight transactions, and can be retried or disposed.
Disposal waits for in-flight reads and terminal work; failed cleanup remains
available for a later disposal retry.

Effective native reads first obtain genuine base, then overlay only intersections
with the declared, validated ranges. Undeclared bytes cannot be supplied by a
completed provider. Read snapshots own their F32 arrays. An ordinary capture
retains an old package epoch across subsequent switches. An operation capture
is synchronous and blocks commit/clear until its asynchronous release finishes.
Both sides must be captured before an entire six-update sample starts. The
head cache reloads on epoch changes and rejects a switch during head execution.

The feed stores capabilities and bounded F32 blocks, not a full dense completed
model. Dense F32 native parameters would be 57,153,966,336 bytes per side.
P4's existing 16MiB/64MiB sparse-buffer limits and accepted scopes remain
unchanged. Whole-model LoRA time/memory/numerical acceptance is separate.

## Verification and limits

Run the focused structural, race, ownership, decoder, head and legacy P4 tests:

```sh
node --test --test-isolation=none \
 docs/shared/diffusion-models/execution/test-model-weight-feed.mjs \
 docs/shared/diffusion-models/api/test/weight-port.test.mjs \
 docs/shared/diffusion-models/execution/test-model-head.mjs \
 docs/shared/diffusion-models/execution/test-model-weights.mjs \
 docs/shared/diffusion-models/ort-bridge/post-self-attention/test-weights.mjs
python tools/diffusion-models/test-full-weight-feed-browser.py \
 --base /path/to/Bernini_LOW_fp8_e4m3fn_scaled.safetensors \
 --output /tmp/full-weight-feed-real-base.json
```

The bounded browser test independently decodes real base Q4/bias4 in Python,
supplies a conforming completed-F32 test package, and consumes it through the
new feed, actual ORT and Hike bias. It compares all selected base values and
eight projected values, restores base, preserves old read epochs, releases the
creator capability before the operator, and checks zero final sessions,
tensors, package references and leases. It runs explicitly at one thread without
COI. The independent diagnostic is not a normal API input.

Evidence: [REAL-BASE-BROWSER.json](../../../../development/ai-connection/standalone-weight-feed-20261104/REAL-BASE-BROWSER.json).
This is a bounded completed-weight consumer test, not an actual LoRA original,
full-model LoRA application, full predict/sample, four-thread acceptance or
whole operational experiment. RSS/PSS and complete ORT allocator peaks are not
measured by this diagnostic. `generationReady` remains false.
