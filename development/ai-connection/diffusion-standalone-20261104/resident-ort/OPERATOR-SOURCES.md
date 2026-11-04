# CPU Exp / MatMul source inspection — no execution

Read-only investigation of ORT 1.24.3, fixed commit
`3a728b75062256951b6e19ce718907cf1a1d4cf0`. Sources were retrieved through the
GitHub connector at that full commit. SHA-256 and Git blob SHA-1 were recomputed
from the returned UTF-8 bytes and matched the GitHub blob metadata. No full source
copies are included here. No native/browser diagnostic, model read, or code change
was performed for this inspection.

## Findings and limits

- **Exp selection:** `element_wise_ops.cc:73–76` specializes F32 Exp to
  `MlasComputeExp`, rather than the generic Eigen `.exp()` functor. In
  `compute.cpp:124–184,214–245`, the generic MLAS kernel uses range reduction and
  polynomial approximation on four-lane vectors. With `MLAS_TARGET_WASM_SIMD`,
  `mlasi.h` maps the vector operations to WASM SIMD intrinsics.
- **Exp threading:** `element_wise_ranged_transform.h:89–103` uses the operator
  thread pool through `TryParallelFor`. The actual split depends on its cost
  model and pool; four requested threads do not prove four active workers for
  every invocation. Actual kernel activity/utilization was not observed.
- **MatMul selection:** `matmul.cc:223–294` sends F32 batches to `MlasGemmBatch`.
  `sgemm.cpp:1587–1637` partitions by workload and batch count. For ordinary H40
  batches at Q128/K256/D128 and a four-thread pool, that source calculation gives
  one partition per head and forty head tasks dispatched to the pool, for both
  QK and PV MatMul. This is a source-derived expectation, not a measured schedule.
  `SgemmKernelWasmSimd.cpp` implements the SIMD SGEMM kernel.
- **Build selection:** `mlas.h:67–76` derives scalar/fixed-SIMD/relaxed-SIMD macros
  from `__wasm__`, `__wasm_simd128__`, and `__wasm_relaxed_simd__`.
  `onnxruntime_mlas.cmake:335–355` selects WASM SIMD or scalar source files using
  `onnxruntime_ENABLE_WEBASSEMBLY_SIMD`. Complete compiler/build flags for the
  vendored binary remain **unknown**; individual generated kernel instructions
  were not established from the artifact name.
- **Arithmetic count, not timing:** `73947 × 73947 × 40 = 218726352360` score-Exp
  elements per layer. Rescale-alpha Exp adds `73947 × 40 × 289 = 854827320`.
  Neither count establishes elapsed time or Exp dominance. The approximately
  eighty-minute public `attentionSessionRun` observation supplied by the parent
  is inclusive session time, not an Exp-only measurement independently obtained
  in this inspection.
- **Next candidate only:** first separate tensor preparation / `_OrtRun` wall /
  output processing using the existing bounded diagnostic after the original
  trial ends. If needed, compare independent same-shape QK MatMul, score Exp and
  PV MatMul diagnostics, separately for 1-noCOI and 4-COI. The independent
  operator diagnostics are **unimplemented and unexecuted**. Their isolated
  times would not sum to an exact original-graph breakdown because allocation
  and cache conditions change. These findings do not justify a resident K/V
  implementation or a speedup/production claim.

## Immutable source identities

All links below contain the fixed full commit; bytes and SHA-256 describe the
retrieved source bytes, not reconstructed report text.

| Source | Bytes | SHA-256 |
|---|---:|---|
| [element_wise_ops.cc](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/onnxruntime/core/providers/cpu/math/element_wise_ops.cc) | 99789 | `830b3c9b6989636293e65956d69a20c84fcb4dc818af49a1ac5a625069a59f19` |
| [element_wise_ranged_transform.h](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/onnxruntime/core/providers/cpu/element_wise_ranged_transform.h) | 4876 | `e561211d32d459482ce7573d04816a3f8dc500c6b75545aaaba2ec3b72b1a963` |
| [compute.cpp](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/onnxruntime/core/mlas/lib/compute.cpp) | 32452 | `40dbc269fe1b2768c3385746de465821c4285a89a9aadfb4c88fd792ee09a126` |
| [matmul.cc](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/onnxruntime/core/providers/cpu/math/matmul.cc) | 10034 | `d3d6800d5caaf9b8725083002997c0774daacd159ecf7d9418ef1306820b1412` |
| [sgemm.cpp](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/onnxruntime/core/mlas/lib/sgemm.cpp) | 42521 | `f2a1595663805c47afe1ce7a9f4e6aa69fe352765cff85891a93b0673ea9911a` |
| [SgemmKernelWasmSimd.cpp](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/onnxruntime/core/mlas/lib/wasm_simd/SgemmKernelWasmSimd.cpp) | 15916 | `536ca0e46f93bc5a7d788c49456c3edb1c01d9219ff739961cefbb5a431c760e` |
| [mlasi.h](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/onnxruntime/core/mlas/lib/mlasi.h) | 86128 | `b599e738e900617ece99740eec6704ca3ca9752c66733dad01853d3187543aa0` |
| [mlas.h](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/onnxruntime/core/mlas/inc/mlas.h) | 56066 | `996f097fb2e675f626612cd561083b405816be84a7c417bd5e8befeccedf9dd1` |
| [onnxruntime_mlas.cmake](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/cmake/onnxruntime_mlas.cmake) | 40454 | `22230bf01ac3ccc7fe7da0f63287581d12f91800b055259ab72507fae51152c8` |
