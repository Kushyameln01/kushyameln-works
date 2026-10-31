# Natural N2 prefix result

The new `bernini-rect2-block0-postmod-f32-v1` unit passes the frozen independent
prefix gates on both original models. It computes the self-attention input from
the actual Rect VAE mean, explicitly supplied diagnostic noise, fixed scheduler
timestep, and actual block0/prefix parameters. This is separate from the older
explicit16token fixture and from production workflow/precision acceptance.

| Case | Fixed sigma index | Runtime hidden SHA256 | Max hidden abs error | Run time |
| --- | --- | --- | --- | --- |
| LOW | 3 | `7d633f1d07d15fc02fe50030dbbc45800d14d7dc8f140acc309c6339a2467f4f` | 2.6226043701171875e-6 | 14.461s |
| HIGH | 1 | `99066357aff4ebc1a13f63aa9486298153b43f8f026f6db8ada2a31a6671c61c` | 3.844499588012695e-6 | 14.760s |

All14 numeric stages pass their original gates. Normalized mean, noised latent
and im2col patches match strict F32 bytes. All selected original parameter raw
and decoded-F32 hashes match the independent reader. LOW is not a HIGH handoff.
The trusted receipts are `low-comparison.json` and `high-comparison.json`.
Their private-artifact full hashes are respectively
`1b2808f5ee1185db85cba4e2c59c030fd45d6e3c83c9fde457e70c7d1545d797` and
`4493d93b56f434b6292da1c9898dd30b474444073796a10e25788d5c71a65a52`.
All numerical arrays remain outside the repository. The receipts record the
36-file owner-local executed inventory; the final main build closure owns the
complete source/import closure. The independent reference is checked against
its separate public receipt and the pre-observation plan before any comparison.

The BLC core tensor [1,2,5120] lowers to LC [2,5120] with implicit batch1.
Rows map to grid coordinates (0,0,0),(0,0,1), source IDs0,0. There is no padding,
repetition or context stream. The actual outputs and externally anchored
receipts are handed to the all40head N2 owner; exact-hidden-bit component gates
and independently composed prefix→attention gates are separate experiments.
The current experiment releases the prefix before constructing the downstream.

A successful prefix run streams160,634,880 selected parameter bytes. Maximum
weight read163,840B and decoded tile327,680B are bounded independently of the
181,280B strict header read. Four reused Hike Memories total5,046,272B, including
1,245,184B for the new143,360B math arena. Returned stage arrays total289,280B.
Raw F16 tile163,840B + F16 decode-bit staging163,840B + decoded327,680B form one
bounded decode phase; later Gemm additionally snapshots its weight327,680B and
input at most20,480B. These maxima describe named arrays, not a browser peak.
The existing source bridge clears1,733,059,200 cumulative bytes/run; linear
input snapshots total341,319,680B/run. Cumulative traffic is not live Memory.
Two ORT sessions coexist; ORT Memory/allocator/GC/File/browser/harness and full
production joint resources are unmeasured here. No combined production budget
or all-query production graph is accepted from this result.

Verification completed:

- Native bounded-source/symbolic-graph/Hike math/admission/async-hash cancellation: 4/4, including the matrix runtime-input/vector hike-parameter registry binding check.
- Actual Chromium ORT symbolic Gemm ownership, abort/reuse and injected native Tensor disposal failure/recover: PASS.
- Prefix cancellation at first weight tile, getter reentry rejection, caller input mutation after call, reuse after abort: PASS on LOW and HIGH.
- Modified private reference gate rejected against public reference/plan anchors: 1/1.
- New math build-record source/host/builder/WASM/WAT/runtime hashes: 6/6.
- Independent reviewer checked final private artifact SHA, all36 inventory hashes, parameter/stage gates and NOT_READY state: PASS; no remaining blocking finding.

The new Hike math binary is
`ec95f1ca2bb76c332d1ff1072d48347e8a79d48f15618fa59b191dabe9117f7c`.
Source/API/ABI/reproduction are in
`docs/shared/diffusion-models/ort-bridge/block-hidden/README.md` and `ABI.md`.
The existing Rect mean, scheduler and bridge kernels are hash-pinned and reused.
Native pointwise1,048,576 capacity and fixed raw-mean profiles are unchanged.

Not accepted: original81frame/source/reference production inputs; HIGH→LOW
handoff; production BF16/FP16/FP8 activation or Torch fused parity; complete
self-attention including O projection; residual/cross-attention/FFN; full model
or generation; complete production live/staging/copy budget. `load`, `predict`
and `sample` remain `NOT_READY`.
