# Bounded streaming Hike LoRA arithmetic

`createStreamingKernel({wasmBytes?})` loads and verifies this separate kernel. The existing scalar kernel and SDK API remain available at `../host.mjs`. Products, scale multiplication, addition, and BF16/F16 decoding execute in Hike WASM. There is no JavaScript, NumPy, native BLAS, server, or WebGPU arithmetic fallback.

This kernel uses the pinned Hike compiler's LLVM backend, followed by pinned Clang/LLD 19.1.7. LLVM vectorizes independent output columns into standard WASM SIMD128 instructions. Every output starts at F32 `+0` and accumulates rank terms in ascending order with separate F32 multiplication and addition. Scale multiplication and base addition are also separate F32 operations. The build rejects unsafe floating-point flags, FP64 instructions, fused multiply/add, and imports. This is an explicit backend change from the existing WABT normal kernel; the mathematical source remains [lora.hike](../../../../../../tools/lora/kernel/streaming/lora.hike).

| Method | Contract |
| --- | --- |
| `product({down,up,rows,cols,rank})` | Returns a new, owned F32 row-major `up[rows,rank] @ down[rank,cols]` array. |
| `apply({base,delta,scale})` | Returns a new, owned F32 `base + f32(scale) * delta` array. `add` is the same operation. |
| `decode(bytes,dtype)` | Decodes little-endian BF16, F16, or F32 to owned F32; rejects nonfinite values. |
| `retainDown({down,cols,rank})` | Copies one down factor into the fixed arena and returns an opaque instance-local handle. |
| `product({downHandle,up,rows,cols,rank})` | Uses the retained down factor without another validation scan or upload. |
| `releaseDown(handle)` | Clears and invalidates the retained factor. Release it before retaining a replacement. |
| `retain(ownerId)` | Returns `{kernel,isValid,release}`. The lease-specific kernel remains usable after owner disposal until this lease is released. |
| `dispose()` | Closes the owner capability. Memory is dropped after the final lease releases. On a lease capability it releases that lease. |
| `stats()` | Reports call counts, down uploads/residency, workspace high-water bytes, closing/disposed state, and lease count. |

The instance owns exactly 32 MiB of WASM memory. The first 1 MiB is reserved for compiler/runtime storage. Transient inputs, output, and any resident down factor share the remaining 31 MiB; larger requests reject before writing the arena. `decode` and `apply` preserve resident factors. Host input/output copies and caller caches are separate allocations. Calls are synchronous; callers split work into bounded blocks and check cancellation between calls.

`apply` checks the type and shape, copies both inputs into its disjoint arena, and validates every copied value through Hike `LoraFinite`. This ordered F32 range reduction accepts signed zero, subnormals, and both finite extrema; it counts NaNs and infinities without an early exit in the scan. The host rejects a nonzero count. Every operation's complete output is also validated in Hike before the owned copy is returned, so arithmetic overflow still rejects. The multiply/add source and rounding order are unchanged. The former JavaScript input/output scans limited a measured apply call to about 147 million elements per second; the complete replacement path, including validation and ownership copies, measured about 562 million after warmup on the recorded Node environment. This is a component measurement, not a full-model time guarantee.

Products are independent of strength and base. A bounded caller cache may key them by immutable source hash, kernel build hash, factor names, original full shape, and original row range. Applying a new strength still reads immutable base and executes `apply`. For two adapters, preserve the declared application order and its F32 rounding; summing their products before base application changes that order. Keeping a lazy recipe does not mean all values have already been calculated.

Build and validate from the repository root:

```sh
python tools/lora/kernel/streaming/bootstrap-llvm.py --out /workspace/work/lora/standalone-task/llvm
python tools/lora/kernel/streaming/build.py
node --test tools/lora/kernel/streaming/test.mjs tools/lora/test-kernel.mjs
node tools/lora/kernel/streaming/browser-check.cjs
```

The bootstrap extracts three hash-pinned Debian packages into the chosen workspace directory and requires the hash-pinned existing `libLLVM19` listed in the [build record](../../../../../../tools/lora/kernel/streaming/build-record.json). It does not install system packages. Set `LORA_HIKE_LLVM` to that directory and `LORA_HIKE_TOOLCHAIN` to the existing pinned Hike toolchain when using other paths. `build.py` verifies dependency hashes, writes private LLVM IR/WAT to the ignored `build/` directory, and updates this WASM/hash registry plus the public build record. Two fresh builds produced the same WASM bytes. Standard WASM SIMD128 support is required.

The optional [WABT compiler patch](../../../../../../tools/lora/kernel/streaming/hike-structured-return-loop.patch) records the investigated structured-emitter repair: ordinary returns, one-time loop initialization, and unchanged CFG lowering for switches. It is not used by the selected LLVM build.

[Kernel validation](../../../../../../tools/lora/kernel/streaming/validation.json) records representative comparisons against the old Hike kernel and independent NumPy, exhaustive finite BF16/F16 decoding, and an actual Chromium default-fetch run. These component checks do not establish all-patch full-value adapter acceptance.
