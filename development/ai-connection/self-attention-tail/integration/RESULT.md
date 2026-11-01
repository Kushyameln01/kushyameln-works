# Self-attention tail integration

HIGH scheduleIndex1 and LOW scheduleIndex3 independently PASS the complete natural N2 block0 O projection, chunk2 gate, separate F32 multiplication and original `patchHidden` residual unit. All five local and three independent-prefix composed comparisons passed every value: 71,680 values per side, 143,360 total, with no failed or nonfinite values. Gates were fixed before new tail outputs; no arithmetic, source or threshold changed during accepted runs.

| Comparison maximum absolute error | HIGH | LOW |
|---|---:|---:|
| Local O | 2.288818359375e-5 | 1.1444091796875e-5 |
| Local gate projection / gate | 7.152557373046875e-7 | 2.384185791015625e-7 |
| Local gated / residual | 5.340576171875e-5 | 1.1444091796875e-5 |
| Composed O | 7.534027099609375e-5 | 2.6702880859375e-5 |
| Composed gated / residual | 2.288818359375e-5 | 1.71661376953125e-5 |

Seven original parameter selections per side matched independent raw/decoded hashes exactly, including O's own scalar-scale/config, O weight/bias, time-projection rows10240..15359/bias and modulation chunk2. The model scalar scale value is removed from published evidence; only hashes/descriptors and numeric comparison/resource metrics are published.

Actual attention was generated once per side by the unchanged accepted N2 downstream using the retained full actual prefix artifact. No prefix or `timeAct1` was rerun. Actual context bits matched the old accepted hashes exactly: HIGH `69838610e717a8d7c65adda4133233f581a5173cf10820a130471b96d75985ee`, LOW `b688a5ad16637c42fe22f1a069c1e786881f028aa23da421c27170e84f7778fd`. Local tail references used those exact actual bits. Composed references used the separately anchored independent prefix/head context. Reference arrays were never used as actual attention inputs.

The old owner was disposed and its browser closed before tail construction in a fresh browser. HIGH tail browser closed before LOW tail browser launched. Tail measurements therefore cover only a fresh tail realm; they establish no same-realm old-plus-tail budget.

| Resource observation per side | Bytes / count |
|---|---:|
| Decode Hike Memory | 1,572,864 bytes |
| New tail Hike Memory | 1,310,720 bytes |
| Distinct tail Hike capacity total | 2,883,584 bytes / 2 identities |
| Shared ORT Memory | 16,777,216 bytes / 1 identity |
| Active ORT sessions | 1 during owner lifetime; 0 after dispose |
| Retained caller outputs | 163,840 bytes |
| Original typed inputs / mutated caller copies | 102,400 bytes each |
| Selected parameter reads | 78,673,920 bytes |
| Own-scale/config reads | 31 bytes |
| Header reads | 181,288 bytes |
| Largest raw / decoded weight tile | 163,840 / 327,680 bytes |

Memory identities were attributed to exact decoder, new tail kernel and ORT hashes; shared ORT identity was deduplicated. Physical capacities agreed with native owner stats. Source/decoded tile snapshots and cumulative copy counters are recorded separately in each receipt; linear input snapshot traffic alone was 229,376,000 bytes for a completed run and is not simultaneous allocation. Parsed JSON/reference heap, allocator live bytes, File backing, GC, OS/process peak and combined old-plus-tail peak remain unknown (`null`). Named spans cannot be added to produce a measured host peak. Instrumentation adds hashing and response-copy traffic.

Both sides rejected wrong side/time, unknown old artifact/attention receipt, post-modulation-hidden basis swap, shape/nonfinite/range violations and reentry. Cancellation occurred after an actual first weight tile, followed by successful reuse. Immediately mutating caller inputs after `run` preserved all local comparisons, proving snapshot retention for these inputs. Returned output hashes remained intact after native dispose. Observer hash/observation/import attribution failures were zero, and the original WebAssembly methods were verified restored after each diagnostic returned.

The historical 98-asset fixed-commit package guard is separate from this experiment's executed source inventory. Current numerical assets and all 36 old prefix producer sources remained exact; the explicitly changed build-closure generator is recorded separately. Current build `diffusion-models/0.1+bba4dc740028dcecf849a36e395970b24358a6185378336d61d3a063ad72bc74` and all 100 closure source hashes were checked before tail execution. Each tail receipt lists its own 24 actually requested module/orchestrator sources. Frozen capture-time Python bytes remain retrievable through `capture-source-snapshot.json`.

`summary.json`, `high-tail-browser.json` and `low-tail-browser.json` contain the complete public hashes/metrics. Private model/array artifacts remain outside HTTP and Git. No model download/full hash, full-model inference, commit, push or deployment was performed.

Cross-attention, FFN, later blocks/timesteps, original81frame/context/noise, actual HIGH-to-LOW handoff, original fused Torch/GPU or production precision and a full resource budget remain unaccepted. `load`, `predict` and `sample` remain `NOT_READY`.
