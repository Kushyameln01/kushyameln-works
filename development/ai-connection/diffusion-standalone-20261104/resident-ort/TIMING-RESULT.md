# Bounded attention timing results — diagnostic scope only

Both recorded profiles passed their bounded diagnostic at source
`89fc9cb9d1f71b9b2da63e856ddcdcd4a9c80ed8`, using ORT 1.24.3 and Chromium
154.0.8037.57. The Diffusion owner ran them sequentially after the original 8d block0
trial terminated. This documentation/archive task performed **no additional
native or browser execution** while the subsequent original-shape HIGH predict
was active.

This is a bounded diagnostic, **not a controlled performance benchmark**.
It does not expand whole-pipeline, model, full-40/six, or production acceptance.

## Exact receipts and history

The following files were archived byte-for-byte from the Diffusion owner's /tmp outputs;
the JSON was not reformatted or reconstructed. Each contains captured-source
hashes/byte counts, unchanged-source confirmation, individual timing frames,
output hashes and the driver's direct-byte-comparison result.

| Receipt | Recorded UTC | Bytes | SHA-256 |
|---|---|---:|---|
| [threads1](evidence/diffusion-attention-timing-threads1-20261104.json) | 2026-11-04 19:01:09.105978 | 34931 | `372393296a51675500830ae03dee6d154389c918733258777f0c28fa724a5a8e` |
| [threads4](evidence/diffusion-attention-timing-threads4-20261104.json) | 2026-11-04 19:01:33.773747 | 32844 | `e6d3446b4bb76d22f044664a9733ab6ec28a468427a5bc44177d34df68d7773d` |

[HARNESS-VALIDATION.json](HARNESS-VALIDATION.json) is the historical implementation
receipt committed with `5eef220918ec88e9761f121e3b9c511b82c41e31`. Its stored
sourceCommit is `716ffd169cf1b77ac086e030131af9de6222e528`; neither that field nor
its source hashes were rewritten to describe these later executions. Its file
SHA-256 remains `28fb43cf84dd8096d1767216eae0237088e919ce535d80b520172b1bae0f417d`.

## What was measured and compared

Each profile used separate fresh browser processes for baseline then wrapped,
with the same captured vendor/graph sources, deterministic finite synthetic F32
inputs, H40/Q128/K256/D128 and disabled graph optimization. The built graph hash
was `67ada02d3936f55a7d81e35f92819fe895f29a63a83889f70675624b27df2139`.

Each case ran one warmup tile, reset the online state, then ran **three measured
tiles** in keyStart order 0,256,512. These are synthetic operator inputs, not model
QKV or an original-length attention sequence. Both reports record passed=true,
modelPayloadBytesRead=0, acceptedProduction=false and speedupClaim=false.

Within **each profile**, baseline/wrapped output bytes matched directly:
10,649,600 bytes across warmup plus three measured max/denominator/context
outputs. Input hashes and tile order also matched. **Profile1 versus profile4
output bit equality was not compared.**

## Recorded timing values

All values below are milliseconds, rounded to three decimals. Medians describe
only the three measured frames; warmup is excluded. Full precision and every
baseline frame remain in the archived receipts. No speedup ratio is calculated.

| Profile / case | Tensor preparation median | _OrtRun wall median | Output processing median | Public session.run wall median |
|---|---:|---:|---:|---:|
| 1-noCOI baseline | 1.700 | unobserved | 1.200 | 43.900 |
| 1-noCOI wrapped | 3.500 | 44.400 | 1.900 | 55.300 |
| 4-COI baseline | 2.010 | unobserved | 1.300 | 19.390 |
| 4-COI wrapped | 1.800 | 14.590 | 1.280 | 20.725 |

The wrapped individual measured frames preserve the visible variation:

| Profile / keyStart | Tensor preparation | _OrtRun wall | Output processing | Public session.run wall |
|---|---:|---:|---:|---:|
| 1 / 0 | 3.500 | 44.400 | 1.200 | 50.000 |
| 1 / 256 | 3.100 | 133.000 | 29.700 | 175.100 |
| 1 / 512 | 11.400 | 40.500 | 1.900 | 55.300 |
| 4 / 0 | 1.800 | 17.055 | 1.280 | 21.330 |
| 4 / 256 | 2.430 | 14.590 | 1.265 | 20.725 |
| 4 / 512 | 1.395 | 12.825 | 1.445 | 16.575 |

Warmup public session.run wall values were 89.900/86.200 ms for 1 baseline/wrapped,
and 111.870/92.320 ms for 4 baseline/wrapped. Wrapped warmup _OrtRun was
71.100 ms and 79.540 ms respectively. They are initialization/warmup observations,
not steady-state samples.

The 1-thread wrapped keyStart256 frame is an **observed outlier**. GC or host
scheduling could contribute, but these receipts did not collect a GC trace or
establish its cause. It must not be relabeled as measured GC time or silently
discarded. Three samples, fixed baseline/wrapped ordering, synthetic inputs,
diagnostic overhead and differing COI clock conditions do not establish a
statistically controlled benchmark.

## Meaning and limits of the intervals

- Tensor preparation is the existing ORT input/output-tensor preparation trace:
  allocation, uploads, shapes, native handles and awaits. **Not input copy alone.**
- _OrtRun wall is the wrapped synchronous CPU WASM call from entry to return.
  It includes native operators, allocation and synchronization; **not pure
  MatMul, Exp, CPU time or a copy-free computation measurement**. Baseline has
  no native wrapper and records null, not zero native execution time.
- Output processing includes metadata, host allocation/download and native
  output-handle handling. **Not output copy alone.**
- Public session.run wall includes the public preparation/run/output/cleanup
  path and diagnostic timer overhead. Independent column medians do not form
  the decomposition of a single frame and should not be summed as such.

In these wrapped samples, _OrtRun wall exceeded the measured preparation/output
intervals, except that the 1-thread outlier also enlarged output processing.
This does not identify which native operator dominates. **No original-shape
time fraction, original-block duration, 1-to-4 speedup, or resident-K/V benefit
can be inferred or extrapolated from these short synthetic cases.**

## Resource/cleanup observations and remaining unknowns

All four cases recorded one successful public session creation/release, zero
remaining tracked tensors, no cleanup errors or restoration conflicts, successful
browser.close return and child exit0. Native pthread counts were 0 for profile1
and 3 for profile4, without fallback or unexpected worker URLs.

Each wrapped case recorded one factory call, one successful _OrtInit with its
requested thread argument, the identical returned module, one native session
creation/release and four _OrtRun calls. Each fresh case had one observed
positive-size ORT heap; noCOI also exposed a zero-size fallback memory. Observed
heap buffer size grew from 16,777,216 to **50,331,648 bytes (48 MiB)**. It remained
at that size after session/tensor cleanup, before realm teardown. This is global
WASM buffer byteLength, not live tensor bytes, RSS, all-worker memory, or proof
of OS memory release.

The following remain unverified or unimplemented: resident K/V/state execution,
addresses/allocation above 2 GiB, the approximately 3.03 GB K/V pool, original-shape
resident admission, independent Exp/MatMul operator diagnostics, speedup and
production acceptance. [FEASIBILITY.md](FEASIBILITY.md) and
[OPERATOR-SOURCES.md](OPERATOR-SOURCES.md) retain their narrower source/probe scope.
