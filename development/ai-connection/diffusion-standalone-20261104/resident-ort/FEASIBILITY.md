# Resident ORT K/V and attention state: feasibility only

Historical feasibility/probe scope below. Later bounded public attention
factory-capture and browser 1-noCOI/4-COI observations are recorded separately in
[TIMING-RESULT.md](TIMING-RESULT.md). They do not validate resident K/V/state,
addresses above 2 GiB, original-shape admission, or production acceptance.

Status: **unimplemented candidate; no production acceptance**. The normal public
API remains canonical. This investigation concerns keeping one layer's K/V and
one query range's online attention state in native ORT WASM memory while weights
continue to stream. Whole-model weight residency was rejected and is not revived
by this candidate.

The pinned factory and native tensor ownership are accessible. An 8-byte Node
probe verified that a numeric OrtValue can reference a caller-owned WASM buffer
without copying. It did not execute attention or any other inference. Browser
initialization, addresses above 2 GiB, original-shape memory admission, numerical
equivalence, speedup, full 40 layers, and six sampling steps remain unverified.

## Source identity and reproducibility

Vendored ORT identifies itself as **1.24.3**. Public read-only Git tag resolution
returned commit **3a728b75062256951b6e19ce718907cf1a1d4cf0** for v1.24.3.

[SOURCES.json](SOURCES.json) records all 9 upstream source paths with immutable
full-commit URLs, actual byte counts, SHA-256, and Git blob SHA-1. Each hash was
recomputed from the cached source file bytes; each blob was also checked against
a fresh GitHub fetch at the full commit. The upstream source bytes are not
vendored in this report. The manifest also hashes the actual vendored ORT bundle,
factory, WASM, license, and third-party notices.

ORT's vendored license is MIT. Preserve the existing copyright/permission notice
and third-party notices.

The native API sources below are at that immutable commit:

- [wasm-core-impl.ts](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/js/web/lib/wasm/wasm-core-impl.ts)
- [session-handler-inference.ts](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/js/web/lib/wasm/session-handler-inference.ts)
- [api.cc](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/onnxruntime/wasm/api.cc)
- [api.h](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/onnxruntime/wasm/api.h)
- [onnxruntime_c_api.h](https://github.com/microsoft/onnxruntime/blob/3a728b75062256951b6e19ce718907cf1a1d4cf0/include/onnxruntime/core/session/onnxruntime_c_api.h)

## Public Tensor does not expose this no-copy route

Exact v1.24.3 session-handler-inference.ts lines 20–32 encode only cpu,
gpu-buffer, and ml-tensor inputs. A cpu-pinned input reaches the unsupported
location exception. wasm-core-impl.ts lines 659–669 allocate and copy numeric CPU
inputs through _malloc plus HEAPU8.set. A view backed by the WASM heap does not
bypass that input copy. The model-buffer shortcut in createSession is a separate
path and does not apply to run inputs.

The CPU output branch at lines 1037–1054 copies native data to a fresh JS array
and releases the native tensor. Preferred CPU output location and public
Tensor.fromPinnedBuffer do not provide a supported no-copy route for this
vendored WASM CPU backend. These findings were checked in the actual vendored
minified encoder/preparation/output branches as well as the pinned upstream
source.

## Native factory, ABI, and ownership

The vendored ort-wasm-simd-threaded.mjs default-exports ortWasmThreaded(config).
Its lines 13–14 attach native tensor/session/run exports, and its final lines set
PTR_SIZE=4. The bounded Node probe confirmed those methods exist.

- _OrtCreateTensor(type, data, bytes, dims, rank, location) uses
  CreateTensorWithDataAsOrtValue for numeric data (api.cc lines 361–412).
  onnxruntime_c_api.h lines 1742–1745 explicitly say the caller owns the data
  buffer and ReleaseValue does not release it.
- _OrtGetTensorData(handle, typeOut, dataOut, dimsOut, rankOut) returns a numeric
  data pointer. Its separately allocated dimensions must be freed with _OrtFree.
- _OrtReleaseTensor releases the handle. Separately _free a caller allocation
  only after all handles/runs using that allocation have finished.
- _OrtRun(session, inputNames, inputHandles, inputCount, outputNames, outputCount,
  outputHandles, runOptions) forwards to ORT Run (api.cc lines 612–618).
  Retaining native outputs and passing their handles to the next tile could
  avoid the public output decode/re-upload cycle. This has not been exercised.
- Preserve the canonical graph bytes, attention optimization disabled, F32
  operations, initial state, key order, names, and exact Q/K tails. Await session
  creation and runs as upstream does.

An ABI documentation error matters: api.h line 173 says CPU is 0, while the
actual api.cc enum at lines 29–36 says NONE=0, CPU=1, CPU_PINNED=2.
The initial tiny probe used the stale comment's 0 and failed. The successful
probe uses the implementation's CPU=1. Failed attempts and the correction are
recorded in PROBE.json; they must not be presented as successful observations.

## Observed bounded probe

[PROBE.json](PROBE.json) preserves the successful executed JavaScript source and
its hash, the recorded output, and failed-attempt details. The original source
used a workspace absolute factory import. [portable-probe.mjs](portable-probe.mjs)
changes only that import to a repository-relative path and has its own hash.
The portable file passed node --check; it was not rerun to produce new evidence.

Observed environment: Node.js v24.19.0, one thread.

| Observation | Result |
|---|---:|
| _OrtInit(1,2) | 0 |
| PTR_SIZE | 4 |
| WASM heap bytes | 16,777,216 |
| Explicit data allocation bytes | 8 |
| Caller pointer and returned raw pointer | both 9,074,264 |
| Mutation visible through caller buffer | 3.5 |
| _OrtReleaseTensor result | 0 |
| Caller buffer readable after handle release | yes |
| Process RSS at recorded sample | 104,960,000 |
| Model payload bytes read | 0 |
| OrtRun calls | 0 |

Pointer values and RSS are specific to that run. The process exited. No inference,
browser initialization, numerical comparison, or large allocation was performed.
The raw stdout was not separately saved during execution; PROBE.json transcribes
the recorded tool result rather than claiming an independently saved log.

## Conditional original-shape memory budget

For N=73947, H=40, D=128, Q<=128, K<=256:

| Payload | Bytes |
|---|---:|
| Complete native K/V pool | 3,028,869,120 |
| One full K/V pair (288 pairs) | 10,485,760 |
| Final K/V pair, K=219 | 8,970,240 |
| One Q128 | 2,621,440 |
| One max/denominator/context state | 2,662,400 |
| Q and two state generations | 7,946,240 |
| Vendored Emscripten heap growth ceiling | 4,294,901,760 |

Using the supplied **assumption**, not a measurement from this investigation, of
166,000,000 other ORT/self-linear heap bytes gives 3,194,869,120 bytes with K/V,
and 1,100,032,640 bytes remaining before additional state, allocator metadata,
fragmentation, and growth slack. The actual vendored growth algorithm can request
up to approximately 96 MiB beyond the immediate required size.

Allocate individual tiles and replace host ownership as each tile is produced.
Never retain the complete host pool and complete native pool simultaneously.
WASM heap high-water memory does not shrink after later FFN phases; measure the
worst subsequent-layer baseline. Other Hike heaps and host arrays remain outside
this WASM address-space budget but inside browser/cgroup memory.

Above 2 GiB, normalize pointer/handle returns with >>>0 and use getValue(...,'*')
for pointer loads. The glue wraps _malloc's result as unsigned, but attaches
_OrtCreateTensor and other pointer-returning ORT exports directly. Keep pointer
arithmetic in ordinary JS numbers. Refresh heap-backed views after operations
that may grow memory. Above-2-GiB behavior is **unverified**.

## Realm and thread ownership

Calling the native factory directly creates a separate WASM heap and ORT global
environment. The public bundle does not expose its private backend instance.
A native attention module alongside public linear execution therefore adds
another heap and potentially another thread pool; it cannot be counted as free.

A separately scoped initialization shim through env.wasm.wasmPaths.mjs could be
investigated to capture the same factory instance for public linear sessions and
native attention. That integration has not been implemented or verified.

Keep resource profiles explicit. One thread requires factory numThreads=1 and
_OrtInit(1, loggingLevel). Four threads require a fresh COI realm, SAB and Worker
support, factory numThreads=4, _OrtInit(4, loggingLevel), and exactly three native
pthread workers observed. Direct factory access bypasses the public backend's
feature detection/fallback. Neither browser one-thread nor browser four-thread
initialization was proven here. Normal public API defaults remain unchanged.

## Proposed gates before any original inference

1. In a fresh browser one-thread realm, verify ownership and retained native
   outputs over several small canonical attention tiles, including Q/K tails.
   Compare every state with canonical public ORT.
2. Verify failure, cancellation, foreign/released handles, and cleanup; count live
   handles and payload bytes.
3. Separately admit a resource-bounded address-crossing experiment for >2 GiB.
   This report supplies no result for that experiment.
4. Measure streaming pool growth and the worst-layer heap high-water, without a
   duplicate complete host pool.
5. Measure native copy bytes and per-tile timing before deciding whether an
   original-shape trial is useful.

For 578 query ranges and 289 key tiles, the existing path has 167,042 attention
runs per layer and 1,750,686,351,360 repeated K/V input bytes. The candidate targets
that transfer and recurrent-state/Q transfers. It leaves approximately
111.99 TFLOP of canonical attention matrix multiplications per layer unchanged.
No speedup or full-40/six completion claim follows from the 8-byte probe.
