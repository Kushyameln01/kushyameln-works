# Saved input cases and independent comparison contract

This directory separates an explicit full-geometry acceptance case from the unresolved original workflow replay. It does not promote either case to generation READY.

## Original uploaded data

The chat requested retention of `example_workflows.zip` and these pinned downloads:

- `Kijai/WanVideo_comfy_fp8_scaled@5890255e5742d12ecf40d159dc01c7d647501c40/Bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors`
- The same repository/revision, `Bernini/Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors`.

The retained workflow is `development/ai-connection/original81-profile-comparison-20261102/bernini_rv2v_basic.json`, SHA-256 `543865dfeeb9a94427bea543624e51db5f1dfcf88a7af6a497ddcdbeadc477dd`. Its target is 81 RGB frames, height 480, width 832; the target latent is `[1,16,21,60,104]`, comprising 2,096,640 elements and 32,760 patch tokens. Actual source decoded frame count, actual non-null reference resolution/selection and original model precision cannot be recovered from the workflow's cap or filenames. The original replay retains `BLOCKED_INPUT_METADATA`; unknown context is never converted into absent context.

Three wired image connections and two saved editor filenames are not five contexts. Each non-null wired input wins over its same-slot saved fallback. Source precedes reference video, then effective reference slots, preserving each stream's frame order. The original reference-video connection is absent. Mode-4 nodes do not prove an actual runtime image value. The original model names contain `mxfp8`; original precision equivalence remains `UNCONFIRMED_NOT_COMPLETION_GATE`.

## Explicit full-geometry case

`full-declared-case.json` fixes a separately authorized test case, **not original workflow replay**:

| Ordered stream | Declared RGB F/H/W | Model-space latent | Patch tokens | source_id |
| --- | --- | --- | --- | --- |
| target | 81/480/832 | `[1,16,21,60,104]` | 32760 | 0 |
| source | 81/480/832 | `[1,16,21,60,104]` | 32760 | 1 |
| reference slot 0 | 1/848/848 | `[1,16,1,106,106]` | 2809 | 2 |
| reference slot 1 | 1/848/848 | `[1,16,1,106,106]` | 2809 | 3 |
| reference slot 2 | 1/848/848 | `[1,16,1,106,106]` | 2809 | 4 |

All three explicitly non-null wired slots are included once. Reference video is explicitly absent. Total N is **73,947**, all 40 heads have dimension128, and all supplied tokens are keys and queries. Shape derivation calls the shared `workflow-shapes.mjs`; this preparation tool does not own another production shape formula. Saved latent values are explicit deterministic dyadic F32 data, **producerVerified=false**, not decoded original media, VAE results or upscaled N5 output.

Target model-space input and explicit noise are bit-identical for first HIGH timestep1000, because original CONST initial mixing at sigma1 returns the noise. The sampler receives a separate owned zero initial target file and the same explicit noise file. Neither is a posterior mean. Source/reference values declare normalized posterior-mean space and retain their ordered population for all steps.

## Actual real Text L512

Both cases use every row of the retained `Hello world` Text packet, including all 512 mask entries (3 active, 509 zeroed). This is not the original workflow prompt. Packet, header, JSON conversion, F32 payload, mask, model and tokenizer identities are checked before preparation. Payload SHA-256 is `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`; mask SHA-256 is `19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62`.

The legacy packet predates top-level normalization metadata. Its canonical descriptor explicitly lifts the producer's existing final Hike RMSNorm result to `normalization: umt5-final-rmsnorm-f32-v1`. This adds metadata only; no numerical normalization, row removal or mask rewrite occurs. Provenance and hashes remain in the receipt. Original core text projection, K/V projection and cross-attention still consume all512 rows. The mask is retained as producer metadata, not used to invent a new attention-mask operation absent from this core.

CFG1 validates separate positive/negative descriptor snapshots but does not evaluate the negative branch. The negative snapshot is explicitly the same retained packet, not a claim about the original negative prompt.

## Small changed-boundary regression

`small-real-l512-case.json` retains the controlled N5 fixture's target/source/reference-video geometry and replaces its old controlled L3 text with the complete real L512 packet. It has a new case/Profile identity. Old N5/L3 numerical results are not reused for N5/L512 numerical acceptance. It is suitable for public Worker lifecycle and adapter checks, not full-geometry completion.

## Reproduction

From repository root, using the private retained Text assets named in the JSON receipt:

```sh
python3 tools/diffusion-models/production-reference.py self-test --receipt /tmp/reference-self-test.json
python3 tools/diffusion-models/production-reference.py prepare --private-dir /tmp/new-full-inputs --receipt /tmp/new-full-input-receipt.json
python3 tools/diffusion-models/production-reference.py prepare-small --private-dir /tmp/new-small-inputs --receipt /tmp/new-small-input-receipt.json
python3 tools/diffusion-models/production-reference.py freeze --manifest /tmp/new-full-inputs/inputs.json --contract /tmp/new-full-contract.json
```

Preparation and freeze open no model weights and allocate no full hidden/K/V stores. Private directories must be owned mode0700 outside a checkout. Existing files are never overwritten. Public receipts contain identities, shapes and local asset locations; a local location alone is not a recipient acquisition ACK. Raw latents, conditioning values and model weights are not committed.
