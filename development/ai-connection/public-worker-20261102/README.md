# Public model API / Worker verification

The public adapter routes actual model work to `createBerniniModelSamplerCandidate`
inside its owned Worker. `load/predict/sample` no longer end at the legacy
single-file header inspector. Route implementation and numerical acceptance are
separate: this directory's presence establishes no original-workflow support or
generation READY. See [the API contract](../../../docs/shared/diffusion-models/api/MODEL_RUNTIME.md).

The [frozen runner contract](CONTRACT.json) defines three explicit modes. `smoke`
loads the actual HIGH/LOW Files, checks stale identities and side admission,
executes an actual prefix, cancels at patch progress, reloads, unloads and
disposes. `predict` performs the complete selected-side forward pass. `sample`
performs the internal six neural updates using the unchanged Euler/simple6/
shift5/split3 schedule, then returns the restored raw generated sample.

The host parses **all** generated `BUILD_SOURCES`, verifies actual bytes against
the exact execution commit, and serves captured immutable bytes. The two runner
files, this contract and generated build-info are included in the source guard.
The fixed Worker bootstrap observer is also source-guarded. It delegates native
WASM construction/instantiation with unchanged arguments and reports observed
Memory sizes separately from public protocol replies. Memory references are weak;
collection may lag logical cleanup, so these observations are not proof that GC
has run or a physical realm was released. It changes no tensor
arithmetic or operator implementation. It covers the main Worker's constructed
or exported memories; JS buffers and unexported native allocations remain outside
that counter. The original Worker constructor is restored after disposal.
Only128 recent events/Memory observations remain in browser memory; complete
metadata events stream to JSONL and the peak is accumulated without a spread
argument list. This avoids an event-retention or argument-count limit on a long
full-query run.

The host verifies the same source state after the browser has closed. Model files
enter Chromium only through HTML File inputs. HTTP serves only captured runtime
sources and saved-input binary paths explicitly declared by the manifest.

The normal API receives structure, semantics and explicit numerical values;
it receives no fixture hash, numerical reference, gate or receipt. The runner's
input transport hashes and later independent comparisons remain development
verification. Every caller-owned tensor, Text row, mask and explicit-noise bit
is compared before/after. Positive and negative packets use separate owned
copies; identical packets at CFG1 are a controlled case, not an original
positive/negative workflow replay.

`predict` uses the manifest's explicit-noise target. `sample` uses its separate
initial-empty model-latent target plus explicit noise. Saved context order and
all supplied Text rows/mask remain unchanged. In particular, a controlled N5/
real-L512 run is independent from original81-frame acceptance. The actual
manifest's shape calculation and `caseClass` are recorded in the result.

For successful numerical calls, public `saveTensor` creates canonical bytes.
The host accepts bounded binary POSTs only for `tensor.f32` and `tensor.wktensor`,
writes new private files with `O_EXCL` and mode0600, rereads those bytes, and
selects the actual saved `.wktensor` as a new browser File. Public `readTensor`
then verifies canonical metadata and every F32 payload bit. Sample meaning and
the generated-sample restored `latentContract` survive this roundtrip.

Run only after committing the unchanged execution source and regenerating
`api/build-info.mjs`. Use the full fixed execution SHA for `SOURCE_SHA`:

```sh
install -d -m 700 /tmp/public-worker-case
SOURCE_SHA='<full execution commit SHA>'
python tools/diffusion-models/public-model-browser.py \
  --source-commit "$SOURCE_SHA" \
  --manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
  --mode smoke --wasm-threads 4 \
  --private-output /tmp/public-worker-case/smoke-values \
  --output /tmp/public-worker-case/smoke-result.json \
  --check-only
```

Remove `--check-only` to construct Chromium and perform actual model work. Use
separate new output paths for every run. `--mode predict --side HIGH --timestep
1000` and `--mode predict --side LOW --timestep 1000` select the side explicitly;
`--mode sample` invokes all six updates. Four threads require the runner's real
COOP/COEP headers and SharedArrayBuffer; no fallback is allowed. `--wasm-threads
1` is a separate resource profile.

An external process-memory monitor must start before the runner and continue
through browser cleanup. The runner itself records native stage timings,
progress and resource counters, source identities, terminal errors, cancellation
and logical cleanup. Browser/host RSS or PSS coverage and unobserved allocations
must be reported separately; these native counters are not an aggregate peak.
The raw output's independent numerical comparison is a separate command and
does not become a normal API prerequisite.

The session watchdog records its active identity and last progress, terminates
the owned Worker on timeout and prevents reuse. Independent bounded phase races
also cover imports/readback because Playwright's default timeout does not bound
`page.evaluate`. The host attempts logical cleanup and always closes Chromium.
The smoke codec roundtrip uses an explicit saved-input tensor; it establishes
file/ownership behavior and makes no generated-sample claim from a cancelled
prefix. Numerical modes roundtrip their actual prediction/sample output.

Structural tests use no browser/model inference:

```sh
node --experimental-test-module-mocks --test --test-isolation=none \
  docs/shared/diffusion-models/api/test/model-adapter.test.mjs \
  docs/shared/diffusion-models/api/test/model-host.test.mjs
node --test tools/diffusion-models/test-public-model-browser.mjs
python tools/diffusion-models/test-public-model-browser.py
```

The API tests use explicitly labeled runtime/Worker doubles for routing and
admission; their passing is not neural inference evidence. Actual run results,
resource-monitor outputs and independent numerical comparisons must be added
with their own execution SHA and accepted input scope.
