# Standalone LoRA reproduction

The completed results are recorded in [RESULT.md](./RESULT.md) and the original terminal receipts in `diagnostics/`. These commands reproduce their separate fixed sources in fresh output directories; they are not normal SDK admission requirements.

## 1. Fix source and dependencies

| Stage | Fixed source |
| --- | --- |
| R1 full arithmetic and saved-package value comparison | `4a3419c768e2b4b38b081314abe2cfaaeed6b14b` |
| R2 lifecycle, cancellation, browser and final API/control | `986b66b3dd54ef26d98f99a1db92a2933f3e31aa` |

R2 changes shared-cache cancellation/control and adds lifecycle evidence. Its kernel arithmetic, loader, original shapes, selected coordinates and comparison gates are unchanged from R1. Label each receipt with its actual source; do not relabel the R1 numerical run as an R2 execution.

Use separate fixed checkouts and fresh output directories. From the existing repository, for example:

```sh
git worktree add --detach /workspace/work/lora-repro-r1 4a3419c768e2b4b38b081314abe2cfaaeed6b14b
git worktree add --detach /workspace/work/lora-repro-r2 986b66b3dd54ef26d98f99a1db92a2933f3e31aa
export LORA_REPRO_OUT=/workspace/work/lora-repro-output
export LORA_REPRO_ASSETS=/workspace/work/lora/standalone-task/assets.json
export PYTHON=/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python
mkdir -p "$LORA_REPRO_OUT"
```

Recorded dependencies: Node `v24.19.0`, Python `3.12.14`, NumPy `2.3.5`; little-endian host with standard WASM SIMD128. The supplied kernel needs no build toolchain during normal operation. Browser/build dependencies and resource bounds are listed in [RESOURCES.md](./RESOURCES.md).

## 2. Select local original inputs

The normal SDK accepts the selected File(s) for one side; light alone, detail alone, both, or base-only are valid. It has no all-four-file admission gate and no fixed-hash input allowlist.

The full composition harness tests both pairs on every selected side. Its private JSON manifest is an array or `{ "sources": [...] }`; each record contains `id`, `pairId`, `side`, `path`, `bytes`, `sha256`, and `headerSha256`. Paths resolve relative to that manifest. Use [ASSETS.example.json](./ASSETS.example.json) for a HIGH-only example. For both sides, add the corresponding LOW records from `development/lora/contracts/original-inventory.json`.

| Selected original | File bytes |
| --- | ---: |
| light HIGH: `Bernini-R_LightX2V_high_noise.safetensors` | 1,244,141,856 |
| light LOW: `Bernini-R_LightX2V_low_noise.safetensors` | 1,244,141,856 |
| detail HIGH: `NSFW-22-H-e8.safetensors` | 613,516,752 |
| detail LOW: `NSFW-22-L-e8.safetensors` | 613,516,752 |

Hashes in the harness manifest identify the exact originals used for reproduction. The SDK independently hashes selected immutable input bytes and checks their actual structure; those recorded identities are not a general permission list. Keep original payloads and saved copies outside Git.

## 3. Run complete R1 arithmetic and persistence comparison

```sh
cd /workspace/work/lora-repro-r1
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 node tools/lora/standalone-acceptance.mjs \
  --assets "$LORA_REPRO_ASSETS" \
  --cases all-targets-and-composition \
  --out "$LORA_REPRO_OUT/full"
```

Add `--side HIGH` or `--side LOW` to reproduce one side using only that side's two originals. Omitting `--side` tests both sides. Do not add `--pilot-targets 2` for full acceptance; that option deliberately produces partial pilot evidence.

The harness records its committed runtime closure before running. Per side it exercises light/detail strengths `0`, `+1`, `-1`, both `(+1,+1)` and `(+1,-1)`, plus base restoration over all formerly selected light coordinates. It saves actual source payloads through normal `sdk.save`, opens a fresh package, and uses saved-source bytes for the full streamed comparisons. Expected comparison volume is **127,874,273,664 values per side**, **255,748,547,328 across both sides**. No dense model output is retained.

Inspect `full/run-config.json`, `full/HIGH/report.json`, `full/LOW/report.json`, and the terminal `full/report.json`. Require complete non-pilot domain counts, the independent oracle's terminal verdict, zero failed/incomplete values, fresh-handle persistence checks, and terminal cleanup. `incomplete.json`, a live progress count, a pilot result, or metadata coverage alone is not a final result.

## 4. Run sequential R2 lifecycle on the saved payload

```sh
cd /workspace/work/lora-repro-r2
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 node tools/lora/standalone-lifecycle.mjs \
  --saved-run "$LORA_REPRO_OUT/full" \
  --assets "$LORA_REPRO_ASSETS" \
  --out "$LORA_REPRO_OUT/lifecycle"
```

Again, an optional `--side HIGH|LOW` selects one side. This reuses `full/<side>/owned/` and writes no additional large source or dense copies. HIGH then LOW execute sequentially on one consumer per side: fresh-open/stage both → remove detail → reapply light → reinstate both → remove light → restore base. It also cancels a real full-source plan after one bounded tile, checks the unchanged active package/epoch, verifies all 652 light-only removed targets against independent base, and checks retained reads after creator release.

Successful control completion is named `CONTROL_PASS_REFERENCE_PENDING`. It remains pending until the next stage matches every full output stream against completed R1 independent evidence.

## 5. Match lifecycle receipts to completed R1 comparisons

Run only after both terminal reports exist. The exported matcher requires a completed non-pilot R1 independent verdict and complete lifecycle cleanup:

```sh
cd /workspace/work/lora-repro-r2
node --input-type=module - \
  "$LORA_REPRO_OUT/full/report.json" \
  "$LORA_REPRO_OUT/lifecycle/report.json" \
  "$LORA_REPRO_OUT/lifecycle-match.json" <<'JS'
import fs from 'node:fs/promises';
import {matchLifecycleToFullRun} from './tools/lora/standalone-lifecycle.mjs';
const [fullPath, lifecyclePath, outPath] = process.argv.slice(2);
const full = JSON.parse(await fs.readFile(fullPath, 'utf8'));
const lifecycle = JSON.parse(await fs.readFile(lifecyclePath, 'utf8'));
const match = matchLifecycleToFullRun(lifecycle, full);
await fs.writeFile(outPath, JSON.stringify(match, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(match));
JS
```

This checks all-output F32 hashes, target sets and traversal against the already elementwise-compared R1 streams, along with source/header hashes, registry, loader, kernel, strengths, synthetic base, domain counts, cancellation and cleanup. It does not infer correctness from a sampled block or source hash alone.

## 6. Run R2 component/control/browser checks

Standalone Node/control checks require no Diffusion fixture:

```sh
cd /workspace/work/lora-repro-r2
node --test tools/lora/test-owned-package.mjs tools/lora/test-standalone-sdk.mjs tools/lora/test-standalone-host.mjs tools/lora/test-standalone-lifecycle.mjs tools/lora/test-standalone-acceptance.mjs tools/lora/test-standalone-node-source.mjs tools/lora/test-standalone-mapping.mjs tools/lora/kernel/streaming/test.mjs
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 "$PYTHON" tools/lora/test-standalone-reference.py
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tools/lora/standalone-browser-check.cjs --out "$LORA_REPRO_OUT/browser-r2"
node tools/lora/kernel/streaming/browser-check.cjs
```

The standalone browser harness uses two tiny synthetic Files, normal control, cancellation/ownership, actual OPFS save, and a fresh-page readback. It is browser-path evidence, not full-original/all-patch browser arithmetic.

Optional broader v1/v2/P4 compatibility regression has a separate inherited fixture dependency:

```sh
P4_NATIVE_ROOT=/workspace/work/lora/diffusion-normal-owner-48ff node --test tools/lora/kernel/streaming/test.mjs tools/lora/test-*.mjs
```

That fixture is pinned to `48ff155988d995fc2569e495c8d8820273bd472c`; it is neither a dependency of the standalone normal API nor a condition for running its independent host. The exact command passed 241/241 at R2; output is [R2-repro-command-node.log](./verification/R2-repro-command-node.log).

## 7. Optional kernel rebuild

Use a disposable R2 build checkout, never an active acceptance checkout. The shipped WASM already has SHA-256 `5117e21d789d01b5dd49d7e8cf9bc8d2f78a51f7d3810aab56e4a40588a0c361` (7,036 bytes).

```sh
export LORA_HIKE_TOOLCHAIN=/workspace/work/lora-toolchain
export LORA_HIKE_LLVM=/workspace/work/lora/standalone-task/llvm
python tools/lora/kernel/streaming/bootstrap-llvm.py --out "$LORA_HIKE_LLVM"
python tools/lora/kernel/streaming/build.py
node --test tools/lora/kernel/streaming/test.mjs tools/lora/test-kernel.mjs
```

The bootstrap verifies/extracts pinned LLVM packages; `build.py` verifies the existing Hike compiler and LLVM hashes, audits strict F32 output, and updates the kernel/build record in that disposable checkout. It does not fetch or build the Hike compiler. Preserve `build-record.json`, dependency hashes and resulting WASM identity. No WebGPU/BLAS/server replacement is part of this procedure.

## Result scope

Record final R1, R2 lifecycle, post-match and browser receipts separately with actual elapsed/resource results. The accepted arithmetic base is the independent nonzero dyadic formula, not Bernini's real weights. These stages establish no training-base identity, Diffusion graph binding, production full-model inference, generation quality or generation readiness. Existing Q4/Q16/P4 evidence retains its prior scope.

## 8. Verify stored terminal evidence without inference

From the distribution checkout, the optional report verifier reads Git objects and metadata only. The identities JSON here is used only for report joining and does not require the named local source files to exist:

```sh
node development/lora/standalone/verification/verify-terminal-receipts.mjs \
  --repo "$PWD" \
  --r1 development/lora/standalone/diagnostics/R1-FULL.json \
  --lifecycle development/lora/standalone/diagnostics/R2-LIFECYCLE.json \
  --mapping development/lora/standalone/MAPPING.json \
  --assets development/lora/standalone/INPUT-IDENTITIES.json \
  --out /tmp/lora-stored-evidence-check
```

Use a fresh destination. This checks all domain counts, source closures, mapping/identity joins, complete cleanup, unchanged arithmetic scope and the frozen R2 lifecycle matcher. `FINAL-TERMINAL-REVIEW.md` records independent byte-level verification. The original verifier and the exact export-backed copy used in this sandbox are both preserved; the latter changes only three Git reads to checked exported Git objects. Its temporary `fixed-git-objects.json` can be regenerated from the 37 commit/path entries in `FIXED-GIT-READBACK.json` using checked `git show` and base64; it is not a normal runtime dependency or a shipped payload. Node's sandbox Git subprocess reported EPERM after a successful child exit, so Python checked Git reads supplied the actual objects for that report-only step. No acceptance condition or comparison was relaxed.
