# Bounded original-model read window

`createModelWeightSource({readAheadBytes})` accepts an integer in `0..1048576`.
The default `0` preserves exact selected physical reads. A caller can explicitly
choose `1048576` for an immutable original model used by a sequential stage.
This changes storage requests, not dtype conversion, numerical operations,
selected-block ABI, tensor shape, graph size or accepted model/input scope.

One window belongs to one original tensor key and its verified absolute byte
range. A refill starts at the requested offset, rounds the configured window
down to a whole selected-request byte quantum (at least one request), and clamps
to the tensor end. It cannot prefetch into adjacent weights or quantization
metadata. The exact last tensor tail is included. The active cache is at most
1 MiB; a selected request remains at most 163,840 bytes / 81,920 decoded values.

Every selected `raw` result is an independent compact copy. Mutating it or the
returned decoded F32 block cannot modify cached storage. Refills clear/drop the
old window before awaiting storage. An aborted pending refill is discarded and
does not publish a new window; a later request can retry. `dispose()` clears and
drops its current window after the active operation has ended. The cache has no
payload hash compatibility gate and performs no FP8/F16 conversion.

`reads/readBytes` and `payloadReads/payloadReadBytes` retain their existing
completed logical-selection meaning. New `storageReads/storageReadBytes` report
actual returned storage ranges, including the known two header reads and
quantization config reads; `maxStorageReadBytes` may therefore exceed the old
selected-read cap. `cacheHits/cacheMisses`, `cachedBytes/peakCachedBytes` and
`windowCopyBytes` distinguish reuse and host copies. Cancelled completed IO is
reported as `discardedStorageReads/Bytes`, not a storage failure.

`storageReadMs` covers payload-window and quantization-config IO;
`headerInspectMs` includes original header IO, parse and hash;
`decodeMs` covers the existing Hike decoder call and legacy F16 input preparation;
`windowCopyMs` covers selected byte copies. These do not claim all CPU time,
physical disk IO, all native copies, process memory or whole-model performance.

Targeted verification:

```sh
node --test --test-isolation=none \
  docs/shared/diffusion-models/execution/test-model-read-window.mjs \
  docs/shared/diffusion-models/execution/test-model-weights.mjs
```

The sparse-source tests use the independently pinned actual headers but generate
controlled payloads. F16 and FP8 legacy/lookup selected F32 bits and diagnostic
hashes remain identical. They are not an original-shape neural-inference result.
