# Wan21 posterior-mean ABI v3

Source: ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`, `comfy/latent_formats.py:755–777`. Fixed Hike compiler/runtime identity is in `build/build-record.json`; no WASM imports or JavaScript numerical fallback.

All six exports use `(inputPtr:i32, count:i32, outPtr:i32, capacity:i32) -> i32` with float32 elements. The two legacy names keep their strict128 contract, and the F1 names keep their strict64 contract. Pointers belong only to this module's Memory.

| Export | Profile / NCTHW | count | positions per channel |
| --- | --- | ---: | ---: |
| NormalizeRawMean / RestoreRawMean | wan21-raw-f32-5x16x16 / [1,16,2,2,2] | 128 | 8 |
| NormalizeRawMeanF1 / RestoreRawMeanF1 | wan21-raw-f32-1x16x16 / [1,16,1,2,2] | 64 | 4 |
| NormalizeRawMeanRect / RestoreRawMeanRect | wan21-raw-f32-1x16x32 / [1,16,1,2,4] | 128 | 8 |

The host allowlist checks exact shape, float32/NCTHW, raw or versioned normalized posterior-mean meaning, VAE model hash, finite data, and capacity. Equal element counts do not authorize a different shape. No padding, replication, sampler allzero skip, stochastic posterior sample or generated-sample reclassification is performed.

Channel index is `floor(i/positions)`. Arithmetic preserves separate f32 subtract/multiply/divide for normalization and multiply/divide/add for restoration, including scale1. The sixteen original mean/std constants are unchanged. Return0 means success; −1 rejects count/capacity; −2 rejects a nonfinite input before writes; −3 rejects a nonfinite computed output. A host error never returns partial output.

The host grows Memory once for a1024-byte arena: input512 bytes and disjoint output512 bytes. Square F1 uses256 bytes of each slot; Rect and F5 use512. Views are recreated from current memory.buffer and output is copied into caller-owned storage; the arena is zeroed after each call. Mixed F1/Rect/F5 repeats do not grow Memory. Metadata/shape and supported context arrays are owned copies, and dispose rejects reuse.

The asynchronous factory verifies registry SHA before compilation and requires all six exports. The ABI/registry revision is `wan21-raw-mean-f32-v3`; tensor meaning stays `wan21-normalized-posterior-mean:v1` because the numerical space and source constants are unchanged. Profile identity is the exact supported shape plus producer model binding. An optional supplied profileId must match; the F1 and Rect guards also reject normalized/generated metadata on raw means. The numeric pointer ABI alone cannot identify tensor axes: host shape validation is mandatory, and count128 alone never authorizes routing a rectangle as F5.

`requireWanRawLatent` remains the legacy F5-only boundary. `requireWanRawLatentF1` is the dedicated64 boundary and `requireWanRawLatentRect` is the separate rectangular128 boundary. Public API dispatch/build identity updates belong to the API owner. Fixed G1C codec metadata tests use the retrieved source separately; this extension does not merge that codec or provide a VAE graph bundle. Actual small F1/Rect manifests and saved VAE mean fixtures were received from GitHub7e091 for the current arithmetic checks.
