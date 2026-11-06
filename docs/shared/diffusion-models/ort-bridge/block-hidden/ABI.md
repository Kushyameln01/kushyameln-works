# Natural N2 prefix diagnostic ABI

This is a separate profile, `bernini-rect2-block0-postmod-f32-v1`. It does not
change the older explicit N16/head0 profile. The source and pre-observation gates
are in `development/ai-connection/qkv-next/hidden-core/`.

`math.hike` exports the following functions, each returning i32 status (0 success,
-1 shape/capacity, -2 admission, -3 nonfinite computation). All pointer arguments
are byte offsets in that instance's Memory. The host creates disjoint input and
output regions, snapshots finite compact nonshared F32 inputs, and clears the
143,360-byte arena on every exit. Reentry is rejected before reading arguments.

| Export | ABI | Exact extent |
| --- | --- | --- |
| `Sinusoidal` | `(t:f32,out:i32,capacity:i32)->i32` | 256 output; t F32 in 0..1000 |
| `LayerNorm` | `(x:i32,rows:i32,out:i32,capacity:i32)->i32` | rows=2, width=5120, capacity=10240 |
| `Add` | `(a:i32,b:i32,count:i32,out:i32,capacity:i32)->i32` | 1..10240 elements |
| `Modulate` | `(x:i32,shift:i32,scale:i32,rows:i32,out:i32,capacity:i32)->i32` | x[2,5120], shift/scale[5120] |

The only imports are `env.cos(f64)->f64`, `env.sin(f64)->f64`,
`env.pow(f64,f64)->f64`, and `env.sqrt(f64)->f64`, bound to ECMAScript Math.
Model indexing, F32 reductions, normalization, and modulation execute in Hike.
`build.py` checks import and export signatures and pins the compiler binary.
`build-record.json` records source/host/builder/WASM/WAT/generated-runtime hashes.
The generated runtime is retained as build provenance, not loaded by the host.

Sinusoidal time uses F32 exponent, F64 pow rounded to F32, F32 phase, and F64
cos/sin rounded to F32. RoPE's separate F64 frequency rule is not substituted.
LayerNorm is nonaffine full-width 5120, eps=1e-6, ordered two-pass F32 sum and
variance, F64 sqrt rounded to F32, then F32 reciprocal and multiplication.
The admission bound |x|<=1e16 prevents overflow; it is not a universal precision
acceptance certificate. Modulate computes `shift + norm * (1 + scale)` with
separate F32 boundaries. Torch fused SiLU/addcmul, CUDA/ck.adaln, Welford, TF32,
FP16/BF16 and production FP8 activations are outside this diagnostic profile.

The arena is independent of the native pointwise 1,048,576-element maximum and
of the raw-mean profiles' fixed extents. The Rect mean is processed through its
explicit Rect export. Neither bound is changed or bypassed through padding.
