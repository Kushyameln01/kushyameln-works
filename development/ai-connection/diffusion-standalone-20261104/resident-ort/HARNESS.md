# Bounded public attention timing diagnostic

Implementation status: code and native-free unit/static checks only. **Do not run
the browser/native diagnostic while the original-shape long trial is active.**
No timing, browser initialization, output bit comparison, speedup, resident K/V,
or production acceptance result is supplied by the implementation checks.

## Files and execution boundary

- [Driver](../../../../tools/diffusion-models/resident-ort-attention-timing.py):
  captures allowlisted source bytes, verifies three pinned vendor hashes, serves
  those bytes, and runs baseline then wrapped in separate fresh Chromium processes.
- [Browser case](../../../../tools/diffusion-models/resident-ort-attention-timing-browser.mjs):
  existing public ORT plus the existing canonical attention graph, optimization
  disabled, one warmup and 1..4 measured ordered K256 tiles.
- [Factory shim](../../../../tools/diffusion-models/resident-ort-attention-timing-factory.mjs):
  calls the original factory exactly once and returns the identical module object.
  It never creates a separate native module to accompany the public backend.
- [Core](../../../../tools/diffusion-models/resident-ort-attention-timing-core.mjs):
  native-free profile/fixture/trace/wrapper/byte-comparison helpers.

Importing the core, running the unit tests, parsing the Python driver, and using
its help do not initialize ORT or import Playwright. The driver refuses browser
execution without --execute-after-original-trial. That flag is an explicit
operator acknowledgment; it does not automatically detect trial termination.

Only after the original trial ends, run one profile at a time from the repository
root, using new output paths:

```sh
python tools/diffusion-models/resident-ort-attention-timing.py --execute-after-original-trial --threads 1 --tiles 3 --output development/ai-connection/diffusion-standalone-20261104/resident-ort/attention-timing-threads1.json
python tools/diffusion-models/resident-ort-attention-timing.py --execute-after-original-trial --threads 4 --tiles 3 --output development/ai-connection/diffusion-standalone-20261104/resident-ort/attention-timing-threads4.json
```

These commands have **not** been executed for this implementation. Existing output
files are refused. Python Playwright and Chromium are runtime prerequisites.
The child-process deadline is 120 seconds per case, followed by process-group
termination signals on timeout. A timed-out case fails and explicitly leaves
browser-close confirmation unproven; it cannot count as successful cleanup.

## Profiles, source equality, and arithmetic

threads1 requires a noCOI document and creates zero native pthread workers.
threads4 requires COI, SharedArrayBuffer and Worker, and exactly three native
pthread workers. Both explicitly set numThreads. Version/profile/worker mismatch
fails rather than accepting ORT fallback. The wrapped case also records the
actual _OrtInit thread argument. Switching profile requires another fresh process.

The baseline uses the original factory URL; the wrapped case uses the shim.
Both use trace capture, the same captured vendor files, the same existing graph
source, and identical session options. The shim imports the original factory from
its original URL, so pthread workers still load that original module. The WASM
URL is separately explicit. There is only one attention session per case; this
is not a complete two-session model runtime or a full-runtime memory estimate.

Fixtures are H40/Q128/K256/D128 finite synthetic F32 arrays. Q is deterministic;
K/V vary deterministically with keyStart. Initial max is the canonical finite
-3.4028234663852886e38, denominator/context are zero. Warmup runs one K256 tile.
Measured state resets, then keyStart advances 0,256,512,... with the existing
graph and prior-output state. No graph, math, dtype, node order or normal API
implementation changes are made.

After timing, each output's shape/finiteness and positive denominator are checked.
All warmup and measured max/denominator/context bytes are transported to the
driver. It validates length/SHA-256, then compares decoded bytes directly across
baseline/wrapped; it does not equate hash agreement with direct bit comparison.
Every output byte must match within the same thread profile. Input hashes, tile
order and built graph hash must also match. No tolerance masks a bit mismatch.
Raw base64 transport is removed from the saved report after comparison; output
hashes, byte counts and mismatch offsets remain.

## Meaning of timing fields

| Field | Boundary and limitation |
|---|---|
| publicSessionRunWallMs | Diagnostic frame around awaited public session.run; includes binding, upload, native run, download, cleanup and timer overhead. |
| inputTensorPreparationWallMs | Existing ORT console.time/timeEnd trace for preparing inputs and output placeholders: malloc, upload, shapes, native handles and awaits. **Not input-copy-only time.** |
| ortRunCallWallMs | Wrapped case only: synchronous plain CPU WASM _OrtRun entry-to-return wall time. Includes allocator/operators/thread synchronization. Not pure MatMul, worker CPU time, or copy-free native computation. Baseline records null. |
| outputTensorProcessingWallMs | Existing ORT trace for output metadata, host allocation/download and output-handle release. **Not output-copy-only time.** |

Trace labels are validated as one complete begin/end pair per call. The wrapped
case requires one native call per frame. Warmup and measured frames are explicitly
separate; no extrapolation or speedup is calculated. Both cases contain diagnostic
overhead. Trace hooks forward original console calls and restore original
descriptors; native wrappers preserve synchronous return values, this and thrown
error identity. The wrapper adds no Promise to _OrtRun.

## Resource and cleanup evidence

Reports record public session attempts/successes/releases, native session/init/run
counts in the wrapped case, factory invocation count, observed pthread count/URLs,
and memory observer samples after initialization, before cleanup and after cleanup.
The fresh case requires exactly one observed positive-size ORT memory; a zero-size
feature/fallback memory can also be reported. Captured-module heap size must agree
with that positive-size memory. These are buffer byteLength observations, not
live tensor allocation, RSS, all-worker memory, or OS-release measurements.

All tracked public tensors and the session are released, then native hooks, memory
observer hooks, console hooks and Worker interception are restored. Cleanup errors
and restoration conflicts fail the diagnostic. The driver closes the browser after
each case and runs the next case only after successful child completion. Releasing
a session is not claimed to shrink/free the global WASM heap; realm teardown is
required. Output/report pass status is diagnostic-only, never production acceptance.

## Native-free verification

```sh
node tools/diffusion-models/test-resident-ort-attention-timing.mjs
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/test-resident-ort-attention-timing.py
```

The Node tests exercise strict profile admission, full-size finite fixture
construction without NN, trace separation/pairing, unobserved baseline native
duration, transparent success/error propagation, duplicate factory refusal,
session counters/restoration and signed-zero byte differences. The Python tests
exercise pre-browser admission, direct byte comparison/digest rejection and
exclusive report creation. Unit tests cannot establish browser/module integration,
native numerical behavior, four-thread initialization or actual cleanup in ORT.
