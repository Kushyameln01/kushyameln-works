# LoRA Hike kernel

`host.mjs` loads and SHA-256 checks `lora.wasm`. It has no JavaScript numerical fallback. The generated runtime is retained under the private build directory; this import-free kernel is instantiated directly.

## Host API

`await createKernel({wasmBytes?})` returns synchronous `merge`, `add`, `decode`, `dispose`, and immutable `info`.

- `merge({base, down, up, rows, cols, rank, scale})`: immutable FP32 inputs, row-major `[rows,cols]`, `[rank,cols]`, `[rows,rank]`; returns `base + scale × up × down`. Caller has already resolved alpha/rank and target layout.
- `add({base, delta, scale})`: equal-length FP32 weight/bias arrays; returns `base + scale × delta`.
- `decode(Uint8Array, dtype)`: little-endian BF16/F16/F32 bytes to a new Float32Array. BF16 and F16 numeric conversion occurs in Hike; host only unpacks 16-bit integers. F32 bytes are copied through Hike. NaN/Infinity are rejected.
- `dispose()`: invalidates calls and drops Memory/Instance references; copied outputs remain owned by caller.

All input values and strengths must be finite; strengths must remain finite when rounded to f32. Empty arrays are allowed for add/decode, but matrix dimensions must be positive integers. Overflow to nonfinite output fails. Float32 multiply/add order is explicit; this kernel promises no FP64 accumulation, fused multiply-add, quantization, DoRA, or implicit transpose.

## ABI and memory

Pinned Hike commit `3c51fde6675f317453919bd505d0e2d0f638e7f1`, WABT normal. Actual WAT signatures are recorded in `tools/lora/kernel/build-record.json`.

The pinned compiler reserves stack slots at each executed local declaration.
Reusable merge/decode loop variables are declared once outside the loops so
compiler stack use stays constant and cannot grow into the host arena. Regression
tests include rank128×5120 BF16/F16 input and a 1024×1024 rank1 merge. Small slices
alone did not exercise the former collision; the real E1 trial exposed it.

| Export | Parameters | Result |
| --- | --- | --- |
| LoraMerge | base/down/up/out byte pointers i32, rows/cols/rank i32, scale f32 | i32 status |
| LoraAdd | base/delta/out byte pointers i32, length i32, scale f32 | i32 status |
| LoraCopy | input/out byte pointers i32, length i32 | i32 status |
| LoraDecode | unpacked-u16-in-i32 input/out byte pointers i32, length i32, mode i32 | i32 status |

Status 0 is success; negative values reject. Raw exports are internal to the host adapter. Only its validated calls are supported. Host owns disjoint four-byte-aligned arenas from byte 1,048,576. Memory grows once at initialization to 33,554,432 bytes, then stays fixed. Inputs are borrowed only for the synchronous call and copied into WASM; outputs are copied out. Working capacity is 31 MiB including all inputs and output. No per-call allocator/free/grow is used. Callers must split larger layers into blocks and account separately for their own buffers and copies. No shared Memory or cross-instance pointers.

Build using `python tools/lora/kernel/build.py`; set `LORA_HIKE_TOOLCHAIN` to the isolated toolchain directory if different from `/workspace/work/lora-toolchain`. It must contain `hikec`, `hike-lang-<commit>/`, `go/`, `hike-source.json`, `go-source.json`, and npm `wabt@1.0.39` with lockfile. The script verifies WABT version and emitted import/export signatures, saves generated runtime/WAT/build log privately, writes provenance, and updates the public WASM/hash registry. It does not install tools, change system paths, or publish.

Node verification: `node --test --test-isolation=none tools/lora/test-kernel.mjs`. Node success does not establish browser, full model, ComfyUI equivalence, or production Pages deployment.
