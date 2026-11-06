# Retained-model management run

This runner connects the new base-model management facade to the adopted public
`createDiffusionModels({sessionId})` factory, its real dedicated Worker, and the
unchanged model/sampler owner from
`ffeeeedb6b57d182a977c3ac02c042ce235fc87a`. It does not implement inference,
weight decoding, normalization, or a scheduler. LoRA is outside this run.

The complete actual HIGH/LOW pair and the saved small-input manifest must already
exist in the holding environment. On 2026-11-02, the implementation environment
had the exact real L512 conditioning packet but neither the 31.15 GB model pair
nor the original saved N5 manifest. No actual management sample or one-thread
runtime result was established there. Missing assets are not a WASM failure.

## Holding environment command

Use a checkout containing the finished management commit. Replace
`<FULL_MANAGEMENT_SHA>` with its complete 40-character execution SHA, and retain
that checkout at exactly that HEAD throughout the run. Python 3, Python
Playwright, Node.js, and Chromium are required. Install/runtime preparation is
separate from the model run; this command never downloads models.
The fixed owner Git object must also be present locally: source guards use
`git show ffeeeedb6b57d182a977c3ac02c042ce235fc87a:<original-path>` in addition
to the adopted manifest hashes. A shallow checkout missing that object needs
the original history/object supplied before preflight.

```bash
node tools/ai-connection/run-diffusion-public-browser.mjs \
  --source-commit <FULL_MANAGEMENT_SHA> \
  --manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
  --models /path/to/retained/bernini \
  --mode sample --cancel-before-run \
  --wasm-threads 1 --coi false \
  --private-output /tmp/bernini-management-private/fresh-one-thread-values \
  --output /tmp/bernini-management-one-thread-fresh.json
```

Create `/tmp/bernini-management-private` with mode `0700` first. Both the private
output directory and public result/progress filenames must be fresh. Private
output must be outside every Git checkout and under `/tmp`, or the repository
parent's `diffusion-private-hidden` directory. Values are written with `O_EXCL`
and mode `0600`. The public report contains identities, metadata, progress,
resource observations and source inventories; it does not publish tensor data.
Select a longer explicit `--timeout-seconds` if the holder requires it. The
one-thread duration has not been measured. The old four-thread sample duration
does not provide a one-thread estimate.

Before execution, use the same paths with `--check-only`:

```bash
node tools/ai-connection/run-diffusion-public-browser.mjs \
  --source-commit <FULL_MANAGEMENT_SHA> \
  --manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
  --models /path/to/retained/bernini \
  --wasm-threads 1 --coi false --check-only
```

Check-only validates committed sources, hashes only the explicit small saved
inputs, and stats the model paths. It creates no browser, executes no NN and
writes no output. `BLOCKED` and exit code `2` identify missing or mismatched
prerequisites; this is not a successful runtime check. A source check cannot pass
against uncommitted manager/runner changes. Actual execution additionally needs
`--private-output` and `--output` and exits nonzero if any required evidence fails.

## Exact resource profiles

The default is `--wasm-threads 1 --coi false`. The loopback server sends no COOP,
COEP or CORP headers in this profile. The report records the actual window and
each observed main public Worker's `crossOriginIsolated` and SAB availability,
plus the native loaded resource profile. A mismatch fails the run. Merely
declaring one thread is not an execution result.

An independent operator run can select four threads only by explicitly passing
both `--wasm-threads 4 --coi true`, with fresh outputs. This sends real
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` headers and requires actual COI/SAB in
the window and Worker. `4/false` fails before launch. There is no retry or silent
fallback to one thread. A one-thread run with explicit COI, if selected, is a
different profile from the requested no-COI check.

GitHub Pages does not gain those headers from this adapter. A successful local
no-COI one-thread run would establish that resource profile at the supplied N5
inputs; it would not establish that 31 GB of models are hosted by Pages or that a
particular end-user device has sufficient resources.

## Actual Files and saved input contract

The model directory must contain these complete retained base Files:

| Side | Filename | Bytes |
| --- | --- | ---: |
| HIGH | `Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors` | 15,574,833,216 |
| LOW | `Bernini_LOW_fp8_e4m3fn_scaled.safetensors` | 15,574,833,216 |

The host uses file stats and browser file selection for these paths. It never
reads, copies, hashes or serves complete model contents through Node/Python/HTTP.
The actual native owner performs its existing File-based model validation and
staged reads. Model stat identities are checked before and after the browser
lifetime. Stat continuity is not a newly recomputed full-model SHA-256.

The private manifest uses the unchanged fixed owner's `prepare_inputs` contract:

- `tensors[]`: target/source/reference in their original order, each with `path`,
  `bytes`, `sha256`, `dtype`, `shape`, `layout`, `meaning`, normalization and the
  native requirement metadata.
- `initialEmptyTarget` and `explicitNoise`: separate saved values. Sample uses
  the empty target plus the explicit noise; predict uses the saved noisy target.
- `conditioning`: `metadata`, `payloadPath`, `maskPath`, `payloadSHA256` and
  `maskSHA256`; retain all `[1,512,4096]` F32 rows and all 512 mask entries.
- `shapeRequest`, and the saved `profileId`, `caseClass`, `canonicalShape` and
  producer metadata when present.

The established case is `bernini-small-n5-real-l512-f32-chunks-v1`, target/source
`[1,16,1,2,4]` and reference `[1,16,1,2,2]`, 2/2/1 tokens. The real conditioning
payload SHA is
`107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`;
the 512-byte mask SHA is
`19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62`.
The saved packet uses `umt5-final-rmsnorm-f32-v1`, with three active mask entries.
Positive and negative are separate owned copies of that complete packet; CFG1
does not evaluate the negative numerical branch. This is the established
controlled case, not original-workflow input replay.

The host reuses the frozen owner's `prepare_inputs`, immutable File stats,
`OutputSink`, and file-writing helpers. The browser reuses that owner's
`capturePublicModelInputs`. Their transport identity checks remain outside every
ordinary management input. `load` contains Files/resource only; `predict` and
`sample` contain their native tensor/shape/conditioning/session fields only.
Reference arrays, gates, past receipts and fixture identity conditions are not
added to the ordinary request contract.

If saved small inputs need preparation, the separate owner checkout at the fixed
distribution contains the existing non-NN preparation command:

```bash
python3 /path/to/fixed-owner/tools/diffusion-models/production-reference.py \
  prepare-small \
  --private-dir /tmp/fresh-real-l512-n5-inputs \
  --text /tmp/p4-real-text-l512/inputs/real-text-l512-native.json \
  --receipt /tmp/fresh-real-l512-n5-preparation.json
```

Use that command only with its complete owner preparation dependencies and its
existing verified real Text JSON and retained packet paths. The fixed command
checks both objects and performs metadata-only normalization tagging; this
runner does not reconstruct or substitute them. The packet path is also checked
by the owner's `verified_text` implementation. Newly prepared inputs must be
identified as newly prepared; do not label their manifest as the previously
received 43,223-byte manifest merely because payloads agree. Preparation is not
model inference and does not create an independent numerical reference.

## Recorded lifecycle and output

`--mode sample --cancel-before-run` performs these actual management operations:

1. Create the management facade without an injected API, then load the complete
   pair through the adopted public factory and real Worker.
2. Dispatch HIGH predict with the ordinary saved input. At actual native `patch`
   progress, cancel the exact current `manager.inspect().activeTarget`; await the
   original operation terminal and Worker termination acknowledgement, then
   require that Worker's actual Playwright close event before starting reload.
   A timer does not count as successful cancellation or physical close.
3. Require `reloadRequired`, unloaded state and rejection of retry before load.
   Reload in the same public API instance, require a replacement model ID and
   Worker epoch, and reject an explicitly supplied old model session at
   management admission before numerical dispatch.
4. Complete the unchanged actual sample. Record all six `step-complete` events
   with HIGH3/LOW3, the native `{tensor,execution}`, and the normal management
   snapshot/edge/artifact connection. Preserve `wan21-raw-generated-sample:v1`
   with its restored latent contract; do not convert or rename it to mean.
5. Call management `saveTensor`, POST its bounded canonical bytes to actual
   private disk, select that disk file again as a real browser File and call
   management `readTensor`. Compare every F32 bit and all canonical metadata,
   including meaning, model identities and `latentContract`.
6. Read native status, await unload, and dispose. Record actual Playwright Worker
   close events before browser teardown. Browser shutdown alone cannot satisfy
   the cleanup proof. Hash caller-owned tensors/noise/Text/masks before and after.

`--mode predict --side HIGH --timestep 1000` records a complete selected-side
velocity result; `--mode smoke` checks duplicate-load/side-input controls,
actual HIGH prefix cancellation/reload and saved-input codec readback. Smoke
never claims a completed generated sample. Smoke still needs the actual models
because its cancellation trigger is real prefix computation.

The observer derives from the fixed owner's native WASM observer, retaining its
bootstrap message queue and unchanged native delegation. Its only changes are
the adopted Worker path and explicit COI/SAB observations. It records main public
Worker WASM allocations and lifetime epochs. Reported memory does not include
all JS buffers, process RSS/PSS or unexported allocations. Actual Worker close
events are separate from `terminate()` calls and sampled WASM counters. External
resource monitoring can add a separate receipt without changing model inputs.

## Source and numerical scope

Before and after the run, the host requires exact management HEAD bytes for its
manager source superset, runner, observer, adoption manifest and all adopted
sources. It also compares every adopted source against the fixed owner commit
and validates the 144-entry generated build inventory plus build-info. The
adoption manifest adds the owner's license, three runner helpers and contract,
for 150 owner files. The server permits only these frozen source bytes, the
explicit small inputs and bounded output sinks. The report lists actual GET
paths, counts, hashes and denied paths. Any denied path or source change fails.

The unchanged owner's prior numerical evidence retains its original scope:
N5/real L512, explicit noise, F32, Euler/simple6/shift5/split3, CFG1, no LoRA,
four threads with COI. The recovery sample executed at
`0f761f374dce1d447bbb912ad13c08f9bf85c279`; the later failure-recovery change
did not rerun its complete NN. That sample compared only the final 128 raw values
against the separate L512 reference, with zero gate failures and maximum
absolute error `7.62939453125e-6`. It did not compare every sample intermediate.
This proof is reused at that original scope; it is not relabeled as new
management or one-thread execution evidence.

Numerical comparison is optional postprocessing of the actual private
`tensor.f32`, performed separately from normal calls. A matching saved independent
reference and its frozen input/model/source identities are required to make a new
comparison claim. The owner's `compare-public-model.py` admits its own old host
receipt schema; it must not be passed this different management receipt without
an explicit schema-aware admission change. No all-NN intermediate recomputation
is required by this connection runner. No comparator or old PASS makes an absent
actual management run successful.

Neither this runner nor reused evidence establishes original81/full73947-token
completion, original media/prompt replay, production mixed-precision
equivalence, generation quality, full-model LoRA support or generation READY.
`generationReady` and `originalWorkflowAccepted` remain false.
