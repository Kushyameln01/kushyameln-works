# N2 self-attention gate and residual ABI

`GateResidual(o, projection, modulation, patch, rows, gate, gated, residual, capacity) -> i32`

All pointers are byte offsets to F32 arrays in the exported nonshared WASM Memory. The owning host assigns disjoint spans. `rows` must be 2 and `capacity` must be 10240. `o` and original `patch` each contain 10240 values. `projection`, `modulation`, and `gate` contain 5120 values. `gated` and `residual` contain 10240 values.

The operator writes `gate = f32(modulation + projection)`, broadcasts gate across two token rows, then writes `gated = f32(o * gate)` and `residual = f32(patch + gated)`. The multiply result is stored as F32 before residual addition; there is no gate scale-plus-one. All inputs must be finite, and `abs(o)`, `abs(patch)`, and `abs(gate)` must be at most 1e16.

Status is 0 for success, -1 for a shape mismatch, -2 for nonfinite input or admission failure, and -3 for nonfinite output. The module imports nothing. The host snapshots inputs, uses a fixed 225280-byte arena, copies out owned arrays, and clears the arena after every attempt. Readiness remains `load/predict/sample=NOT_READY`.
