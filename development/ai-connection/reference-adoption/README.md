# Reference adoption P0–P3

This change introduces the fixed reference data into the existing management
decision path. It does not implement model arithmetic, a second compatibility
judge, production generation or full-model session acceptance.

Read before implementation:

| Authority | Version / complete commit |
| --- | --- |
| New execution plan, [Page](https://chatgpt.com/space/page_78c30bebe16481918944e621b8c2a02a) | `1.0-draft.1`, `0fb553fd081d3bcbbad4ead7accd165679f77d34`, `development/ai-connection/reference-catalog/EXECUTION-PLAN.md` |
| Profile ledger, [Page](https://chatgpt.com/space/page_7036da19567881918356235b7aa82b83) and its six linked bodies | `1.0-draft.1`, `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` |
| Prior manager distribution | `28596717182e48aeb23c719c51b6e593edf4e496` |
| Adopted LoRA / Diffusion / codec | `0c27874908638afc748ea2455a2779a16736730b` / `438972f30242e0a3bc66edb8591f38eaa0fcd384` / `2c171a09ccda65c54899f322ae490f1bfcaac6fb` |
| Separate candidate LoRA / Diffusion / VAE-codec | `fc2789a0f649e33f15eb13750e6a983b5c52d170` / `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` / `855f435120f08eb9e818e51281fc26f0e2633829` |

The catalog is exactly 8,343 bytes with SHA-256
`14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c`.
The six registered JSON files and seven explanatory documents were acquired and
checked; the seven bundled runtime JSON files retain the original bytes. Their
historical `runtimeIntegrated:false` is not rewritten. Runtime decisions have a
separate catalog/norm/source/evidence trace.

## Changes and boundaries

- [DECLARATION-BINDINGS.json](DECLARATION-BINDINGS.json) maps 12 norms, their
  68 manager-read fields and 18 profile records to native declarations, public
  receipts, external sidecars and current management state. It separates
  contract, numeric acceptance and dynamic resource conditions.
- [EVIDENCE-INDEX.json](EVIDENCE-INDEX.json) preserves source/bytes/hash and prior
  evidence scopes. F5's directly found `2e-6` gate belongs to legacy synthetic
  mean arithmetic; it is not received-VAE F5 acceptance. Text source and the
  historical four-token receipt declare `.001/.001`; a newly selected original
  manifest and its hash have not been acquired and are not inferred from it.
- `reference-loader.mjs` authenticates explicit bytes; `norm-bindings.mjs`
  compiles finite comparisons and scope requirements into the existing
  `evaluateEdge`. Missing required declarations differ from missing numeric
  acceptance alone. The latter retains `COMPATIBLE` and yields
  `NOT_VERIFIED / BLOCKED`. Old evidence cannot change source/kernel identity,
  coverage, real-base status, profile, selected region or current target.
- [P2-RESULT.md](P2-RESULT.md) and [RECT-RESULT.json](RECT-RESULT.json) record real
  received Rect mean → E4 readback → cache → owner Rect WASM → E4 readback.
  Received RGB save/read is separate from fresh decode.
- P3 adds a separately pinned native facade and an owner sidecar over the existing
  queue/snapshot transaction. The original SDK stage waits at its public commit
  boundary, and native history is finalized only after management publication.
  Unconfirmed rollback or cleanup blocks reuse. Dynamic native copy IDs are
  preserved. The legacy bridge remains regression-only.
- Diagnostic output packages preserve the actual optional manager snapshot,
  source-bound native envelope, local-File identity and reselect requirement.
  Both adopted and candidate labels enforce their own complete source sets.

The common descriptor and package schemas stay
`works-module-contract/1.0-draft.1` and `works-artifact-package/1.0-draft.1`.
Reference schemas stay `1.0-draft.1`; the outside trace is
`works-norm-trace/0.1-draft.1`. Native API payload types/exports are unchanged.
The new facade is `works-candidate-adopted-lora/0.1-draft.1` and snapshot owner
`works-snapshot-native-lora/0.1-draft.1`.

## Reproduce

Use a checkout of the reported complete management commit. Fetch the full native
commits above and extract each source tree without rewriting its contents. For
example, `git archive <full-native-commit> | tar -x -C <existing-native-root>`.
Native runners check their actual source/runtime bytes against the fixed Git
objects; API strings alone are insufficient.

For the complete Node regression, explicitly provide the old native roots for
old scoped tests and distinct latest roots for new candidate tests:

```sh
WORKS_NATIVE_ROOT=<2c171a0-root> \
WORKS_NATIVE_CODEC_PATH=<2c171a0-root>/docs/shared/inference/tensor.mjs \
WORKS_LORA_NATIVE_ROOT=<dcb1f50-root> \
WORKS_DIFFUSION_NATIVE_ROOT=<438972f-root> \
WORKS_VAE_PROFILE_ROOT=<7e09119-root> \
WORKS_ADOPTED_LORA_ROOT=<0c27874-root> \
WORKS_ADOPTED_DIFFUSION_ROOT=<438972f-root> \
WORKS_RECT_DIFFUSION_ROOT=<5f880fd-root> \
WORKS_RECT_VAE_ROOT=<855f435-root> \
WORKS_SNAPSHOT_LORA_ROOT=<fc2789a-root> \
WORKS_SNAPSHOT_DIFFUSION_ROOT=<5f880fd-root> \
node --test --test-isolation=none tools/ai-connection/test-*.mjs
```

Individual executable routes:

```sh
node tools/ai-connection/rect-management-runner.mjs \
  --diffusion-root <5f880fd-root> --vae-root <855f435-root> \
  --output <new-private-output-dir> --manager-commit <complete-manager-commit>
node tools/ai-connection/run-snapshot-native-lora.mjs \
  --lora-root <fc2789a-root> --diffusion-root <5f880fd-root> \
  --output <new-private-result.json>
node tools/ai-connection/run-managed-local-files.mjs \
  --scenario snapshot-candidate \
  --lora-root <fc2789a-root> --lora-commit fc2789a0f649e33f15eb13750e6a983b5c52d170 \
  --diffusion-root <5f880fd-root> --diffusion-commit 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 \
  --codec-root <855f435-root> --codec-commit 855f435120f08eb9e818e51281fc26f0e2633829 \
  --inputs <private-one-positive-local-selection.json> --out <new-private-trial-dir>
```

The last route needs the selected genuine local File and its expected complete
hash, Chromium/Playwright and the existing independent Python reference
dependencies. Use the existing selection schema with
`fixtureScope:"synthetic-manager-control-fixture"`, one `positive` with explicit
`path`, `expectedSha256`, `selection:{pairId,noise}`, and `negatives:[]`.
It exposes loopback-only source-verified HTTP and injects the File through the
browser file picker. Drive is development reference only; product input stays a
user-selected local `.safetensors`. Original model/LoRA files and selected weight blocks are not committed to Git.
Four small diagnostic packages are distributed under `fixtures/`; they contain
raw mean/RGB or 16 projection values and their complete sidecars. Read them with
`node tools/ai-connection/read-reference-packages.mjs --codec <855f435-root>/docs/shared/inference/tensor.mjs`.

## Unaccepted dependent edges

P2 fresh VAE encode/restore/decode/RGB linkage needs the exact existing four
export assets (498,676,842 bytes), currently absent. The fixed codec omits the
normalized mean marker; E4 correctly rejects that intermediate package instead
of deleting/relabeling metadata. The raw-before/raw-after packages are complete.
RGB affine, generated-sample and Text RMSNorm reference bindings currently remain
`UNVERIFIED` when explicitly required; existing standalone native APIs still work.

P3 actual real-base transactions require a legitimate base provider/artifact and
independent reference. A partially downloaded full base file is not accepted.
Existing owner 20-case real-LoRA/real-base evidence retains its original pins and
scope. It is not a fresh management real-base run. Persistent full sessions, full
targets, actual generated-sample production/decode, the original 81-frame
workflow and device live-resource budgets remain unaccepted. Diagnostic
publication/package completeness never removes generation blocking.
