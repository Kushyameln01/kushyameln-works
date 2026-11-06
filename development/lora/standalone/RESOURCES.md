# Dependencies and resource bounds

Completed measurements come from the terminal reports linked in [RESULT.md](./RESULT.md). Process RSS/resource usage and bounded allocations are recorded separately; a whole-device or browser OS peak is not asserted.

## Recorded environment and paths

| Dependency | Recorded version / location |
| --- | --- |
| Node | `v24.19.0`; `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node` |
| Python | `3.12.14`; `/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python` |
| Independent oracle | NumPy `2.3.5`; BLAS/OMP threads set to `1` |
| Browser | Chromium `154.0.8037.57`; `/usr/bin/chromium` |
| Browser driver | Playwright `1.57.0`; `/opt/codex/cua_node/lib/node_modules/playwright` |
| Hike source/compiler | commit `3c51fde6675f317453919bd505d0e2d0f638e7f1`; `/workspace/work/lora-toolchain/hikec` |
| Hike compiler SHA-256 | `556a11f406482a0b2015ba0a40e34813ad6c1ec2c50eed175f9d005e7f39a95f` |
| Hike source archive SHA-256 | `1c7d302e737b3209fe9a49b0ac51b212fd6c5c6c931def4421910b716d23e24c` |
| LLVM | Clang/LLD `19.1.7` (`19.1.7-3+b1` Debian packages); workspace extraction `/workspace/work/lora/standalone-task/llvm` |
| Inherited LLVM library | `/usr/lib/x86_64-linux-gnu/libLLVM-19.so`; required hash in `tools/lora/kernel/streaming/llvm_pins.py` |
| WABT inspection utility | `1.0.39`; `/workspace/work/lora-toolchain/node_modules/wabt/bin/wasm2wat` |
| Compiler bootstrap provenance | Go `1.27.3`; `/workspace/work/lora-toolchain/go`; not needed to execute the shipped WASM |
| Optional legacy P4 fixture | `/workspace/work/lora/diffusion-normal-owner-48ff`, commit `48ff155988d995fc2569e495c8d8820273bd472c` |

The selected backend is `hike-llvm-clang19-simd128-strict-f32`, kernel ABI `lora-streaming-f32-v1`. Kernel SHA-256 is `5117e21d789d01b5dd49d7e8cf9bc8d2f78a51f7d3810aab56e4a40588a0c361`; size 7,036 bytes. Rebuild uses hash-pinned packages/binaries from `llvm_pins.py` and `build-record.json`, separate F32 multiply/add, no fast-math/FMA/FP64/imports, and fixed WASM memory. LLVM/Go/WABT are build dependencies, not normal File registration requirements.

## Bounded allocations and logical volumes

| Item | Bound / meaning |
| --- | --- |
| Streaming kernel | 32 MiB WASM per instance; first 1 MiB reserved, 31 MiB shared arena |
| Direct final block | At most 1,048,576 F32 elements / 4 MiB, complete original rows |
| Row iteration | `blockRows:1..256`, default 16; further cap `floor(1,048,576 / columns)` |
| Acceptance host | Requested 128 rows, so width 13,824 uses at most 75 rows per tile, preserving tails |
| Source logical read | At most 16 MiB per request; capture/save hashing uses 1 MiB chunks |
| Header | At most 8 MiB |
| Factor/product LRU | Default 16 MiB; full harness explicitly uses 64 MiB per side |
| Largest original decoded down factor | `128 * 13,824` F32 = 7,077,888 bytes |
| Development comparison queue | At most 16 retained frames and 32 MiB reserved F32 bytes per side |
| Independent oracle cache | Factor arrays 64 MiB + delta blocks 32 MiB by default, per Python oracle |
| Source payload saved, one side | 1,857,658,608 bytes (light + detail) |
| Source payload saved, four originals | 3,715,317,216 bytes; actual file-backed copy, not a descriptor-only save |
| Four separate-source dense F32 logical output | 226,702,705,152 bytes; never materialized as one resident/disk payload |
| Composed union, both sides | 114,295,357,952 bytes per complete composition traversal |
| R1 total comparison volume | 255,748,547,328 F32 values, about 1.023 TB of logical streamed actual payload; not retained output size |

For width `C`, rank `R`, and tile rows `r`, final/product block size is `4*r*C`, decoded down is `4*R*C`, and decoded up is `4*r*R` bytes. Hike workspace, host arrays/copies, LRU entries, active computations, source/header objects, oracle buffers, Node/Python/browser overhead and OS peak are different quantities. LRU residency is not a total process-memory limit.

The recorded machine allocation is four CPU cores of quota (`400000/100000`) and 16 GiB memory. R1 uses two Node side workers and two one-thread Python oracles. Lifecycle runs HIGH then LOW with one Node controller and a temporary independent oracle for removed-target validation. These allocations are the reproduction environment, not measured minimum requirements or a guaranteed peak/time target.

On a fresh reproduction, allow at least the selected saved source bytes as additional free disk beyond the existing originals, plus toolchain/output/log headroom. Full both-side save adds 3.715 GB; lifecycle reuses those saved payloads and creates no second large copy. Retained pilots, multiple full runs or duplicate saved directories consume that space again. Use fresh output directories and preserve incomplete/failed receipts rather than overwriting them. Do not allocate the 226.7 GB dense logical outputs or collect GB streams into one RAM Blob.

## Completed measurements

| Completed run | Elapsed | Node process peak RSS | Python process peak RSS |
| --- | ---: | ---: | ---: |
| R1 HIGH | 6,731.072 s | 594,640 KiB | 246,370,304 B |
| R1 LOW | 6,719.024 s | 524,392 KiB | 260,042,752 B |
| R2 HIGH lifecycle | 4,104.711 s | 534,328 KiB controller-process high-water | temporary oracle, separate receipt |
| R2 LOW lifecycle | 3,355.293 s | same sequential controller-process high-water | temporary oracle, separate receipt |

R1 combined wall time is **6,731.163 s**. R2 sequential combined wall time is **7,460.014 s**. These jobs overlapped under the same four-core CPU quota; do not add their durations into a deployment latency or treat the two R2 RSS entries as independent simultaneous peaks. Node maxRSS is `process.resourceUsage().maxRSS`; Python peaks are sampled `/proc` high-water fields.

Each R1 side used 33,554,432 B WASM, reached **14,155,776 B** Hike workspace high-water, kept the LRU budget at 67,108,864 B, and reached **16 frames / 33,554,432 B** comparison retention. Largest observed source read was **3,538,944 B**, below its 16 MiB logical cap. The cache bound excludes in-flight copies and runtime overhead.

All terminal Node reference hosts, SDK registrations/prepared handles, read/package/source leases, pending work, comparison queues, cache entries and Hike memory/leases were released. Separate tiny Chromium/OPFS evidence also ends at zero tracked resources. This is not a measured whole-device peak or a proof of full-original browser memory consumption. The raw resource/ownership receipts are retained, rather than deriving process peak from payload volume.
