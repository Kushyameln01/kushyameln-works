# Saved standalone inputs and portable recovery — 2026-11-04

This closes the missing saved-input preparation dependency. It does not execute
TextEncoder, VAE, LoRA, a numerical model reference, or Diffusion inference. The
recovered native Text JSON and both original-path input manifests match their
previous byte identities exactly. The full-geometry case remains an explicitly
declared separate case, not a replay of unavailable original media.

## Fixed sources that a recipient can acquire

Repository: `https://github.com/Kushyameln01/kushyameln-works.git`.
The recovery command reads these **local Git objects**, with no implicit network
fetch. A recipient can explicitly obtain the named objects first, for example
`git fetch origin <complete-commit>`. An unavailable object fails recovery; its
values are never reconstructed from a receipt or hash.

| Role | Complete commit | Git path / blob | Bytes / SHA-256 |
| --- | --- | --- | --- |
| Actual saved Text packet | `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48` | `development/inference/p2-p3-acceptance/plain/evidence/plain-conditioning.wktensor` / `79f2e153d32846b6a9ed154aaf63b5d35112abae` | 8,390,054 / `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9` |
| Original packet-to-JSON format adapter | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` | `development/ai-connection/p4-real-text-l512/reference/prepare-input.py` / `02ad515ee85e967ba7d12a05e747fe532b90b307` | 9,032 / `e59320fbd28f0402e6b5bdb389535bd41afbf245095d801d016476a642c278cb` |
| Unchanged input preparation CLI | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` | `tools/diffusion-models/production-reference.py` / `d01c24b1ae545a4b13e4efd0bae4cda95fafd946` | 62,171 / `9d3faad4db7db710a6341bca24e541d898dd7b0dd4d68b8ed0bccd2df07d1ce8` |
| Controlled N5 construction source | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` | `tools/diffusion-models/standalone-reference.py` / `6db87c5c5a8d8ce7644936dd4ea58ac662403847` | 36,222 / `6f81afa662f444d0f207a91a5b3778f77c88e4a99e05748221b1ddbfece35c2f` |
| Shared shape owner | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` | `docs/shared/ai-connection/workflow-shapes.mjs` / `bcd35f37114c792c55af4f016f1b378465ba9249` | 17,269 / `7a78955fd8156e0b3a5b287ad5f712ff04d62dbb6e501952bc52f9696e9dd821` |
| Original full-case receipt | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` | `development/ai-connection/d1-d4-production-20261102/input-contract/full-declared-case.json` / `c0607d66442428b4d69e397793e1c57222ab1480` | 66,814 / `c8d5de1129fef2b3e9a74e21d94dda426382261552cefbe668aec8291074bb8f` |
| Original N5/L512 receipt | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` | `development/ai-connection/d1-d4-production-20261102/input-contract/small-real-l512-case.json` / `d5bc8594c4eb22a026eba34c206ce7e5af630e0f` | 27,243 / `6ce0ef22908bdcc697581b155f768b194f0e80b93878b05269e62b2be038f5d2` |

Direct fixed packet: [GitHub blob](https://github.com/Kushyameln01/kushyameln-works/blob/f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48/development/inference/p2-p3-acceptance/plain/evidence/plain-conditioning.wktensor).
The recovery receipt also records the exact blob/bytes/SHA-256 of the original
workflow JSON used by the shared shape owner. No absolute provider path is
required to acquire these source objects.

The new recovery tool is `tools/diffusion-models/recover-standalone-inputs.py`.
It extracts the fixed source subset into a private directory, imports the exact
saved format adapter, and invokes only the unchanged `prepare` and
`prepare-small` CLI commands. The repository's current working tree can change
without changing the fixed preparation source. Python 3 with NumPy, Node.js and
Git are required. Model files are neither opened nor fetched.

## Reproduce saved files without inference

From a checkout containing this recovery tool and the two fixed source objects:

```bash
python3 tools/diffusion-models/recover-standalone-inputs.py \
  --private-root /tmp/bernini-input-recovery-20261104

python3 tools/diffusion-models/test-recover-standalone-inputs.py
```

The command uses owned `0700` directories and `0600` files outside Git. An
identical existing file is verified and reused; conflicting bytes, symlinks,
unsafe permissions, partial case directories and missing source objects fail.
It writes `/tmp/bernini-input-recovery-20261104/recovery-receipt.json` containing
source identities and file identities, without numerical arrays. If reusing a
private root, keep the same options; select a fresh root for another receipt.

The original owner verifier currently requires the saved packet's established
`/tmp` path. Therefore this recovery tool deliberately restores the two exact
compatibility paths below; it does not hide a different packet behind a changed
verifier. The full/small case directories can be explicitly moved using
`--full-dir /tmp/<private-full>` and `--small-dir /tmp/<private-small>`. Such a
manifest has a new byte identity because it contains absolute paths. The receipt
records that identity and separately compares the original serialization after
the declared case-path rebase. It never labels a relocated manifest as the old
manifest. Use `--skip-prepare` to restore only saved Text and an available old N5
artifact.

| Restored artifact | Exact local path | Bytes / SHA-256 |
| --- | --- | --- |
| Saved native packet | `/tmp/text-packet-receipt-20261102/source/development/inference/p2-p3-acceptance/plain/evidence/plain-conditioning.wktensor` | 8,390,054 / `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9` |
| Saved native Text JSON, byte-exact format restoration | `/tmp/p4-real-text-l512/inputs/real-text-l512-native.json` | 8,604,657 / `9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8` |
| Declared full-case manifest | `/tmp/d1-d4-production-73947-inputs/inputs.json` | 82,481 / `7c1545413898de4c18cee2ed19dbec9f8abe61cfed7b48ee0954d33f0206c6b6` |
| N5 / real L512 manifest | `/tmp/d1-d4-real-l512-n5-inputs/inputs.json` | 43,223 / `11d345729b9132dd600b3fa73b61fd5e686b3f5a0ed7b72ef12e3a83791307e9` |
| Persisted old controlled N5/L3 fixture, used only at its original scope | `/workspace/work/diffusion-private-hidden/standalone-n5-l3-input.json` | 162,181 / `a30177ba13a922f29b8d9664ff1b24bc68d6a1e308c95e3a6faf23f402751d3c` |

The old fixture is optionally copied unchanged into the private recovery root.
It is not needed by the real-L512 preparation CLI; that CLI's authoritative
controlled fixture constructor supplies the small latent geometry and values.
Missing old private bytes are explicitly `NOT_ACQUIRED`, never fabricated from
the old hash. Controlled input preparation does not constitute a new numerical
model reference or a new producer result.

## Exact tensor mapping and separate profiles

Both manifests contain separate `initialEmptyTarget` and `explicitNoise`.
`sample` uses the explicit zero model-latent plus the saved noise. The first
HIGH `predict` input is the saved sigma1 noisy target. These are generated-model
latent values (`bernini-generated-model-latent:v1`, `wan21-comfy-f32-v1`), not raw
posterior means. Context tensors are declared normalized posterior means
(`wan21-normalized-posterior-mean:v1`, same normalization), with
`producerVerified:false`; they are controlled test values, not results of VAE
execution. Every latent is little-endian F32/NCTHW.

| Profile / order | Actual latent shape | Tokens | Saved tensor filename / SHA-256 |
| --- | --- | ---: | --- |
| Full target | `[1,16,21,60,104]` | 32,760 | `noise.f32` / `455ca1bc979554b349147ad2f316ba329acb003e9c5531241824183346ae7625` |
| Full source | `[1,16,21,60,104]` | 32,760 | `context-1.f32` / `46e3784dfba900a5aadf2d13c667d718df5be9ad45f21cafc0ee814f75c19739` |
| Full slot 0/frame 0 | `[1,16,1,106,106]` | 2,809 | `context-2.f32` / `2a14b17be63734ddc21475f566d7875c3fee73a1a6782a80f0dae795a1232af5` |
| Full slot 1/frame 0 | `[1,16,1,106,106]` | 2,809 | `context-3.f32` / `e2451854b9c478655759b59d2c6f935c8ef39dd00e448e52e3a24294560e43d0` |
| Full slot 2/frame 0 | `[1,16,1,106,106]` | 2,809 | `context-4.f32` / `887b9ca919abc4bdfb19a8378f1392ba88ac4362821915f3f57dc9863a9566a3` |
| N5 target | `[1,16,1,2,4]` | 2 | `noise.f32` / `ece94cda18a964b7d445303c31053cd84417d0e909b6056b251061f839c422df` |
| N5 source | `[1,16,1,2,4]` | 2 | `context-1.f32` / `32007fbe7ca0b3eff16b1eff68f48a742cfadaad06685005d21ca9e569e62dfc` |
| N5 reference_video | `[1,16,1,2,2]` | 1 | `context-2.f32` / `103b065f6c18417d8aa7529507376adf4dff549bcbde62238e487147bc5314f7` |

The full profile is
`bernini-declared-target81-source81-ref3-848-l512-f32-chunks-v1`: target
832×480×81, **declared test source** 832×480×81, no reference_video, then three
explicit non-null wired slots of one 848×848 image each. Total: **73,947** tokens.
The small profile is `bernini-small-n5-real-l512-f32-chunks-v1`: target/source
32×16×1, reference_video 16×16×1, no slots; total **5** tokens. All contexts and
their source/frame order are preserved. Shape calculation is delegated to the
fixed shared owner, not reimplemented by the recovery tool.

The actual old workflow has a known target but unresolved source frame count,
reference image dimensions and effective slot streams. Its source cap81 does
not establish 81 actual frames. Its reference_video is unconnected. The three
mode4 LoadImage entries and two saved slot entries must not be added together;
the fixed CustomNode selects a non-null wired input first, else that same slot's
saved file. The declared 73,947-token case is not proof of those original facts.

Both prepared cases preserve the **same complete actual Text packet**: F32 BLC
`[1,512,4096]`, 512 mask entries with three active entries, actual prompt
`Hello world`. Payload bytes are 8,388,608 and SHA-256
`107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`;
mask bytes are 512 and SHA-256
`19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62`.
The Text model is `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`,
tokenizer `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`,
actual producer commit `5537b8932343aa2476b95191817e8913f99dab02`.
The owner lifts the legacy absent normalization tag to
`umt5-final-rmsnorm-f32-v1` based on the actual producer's final RMSNorm;
**no numerical normalization is performed**, and padded rows remain unchanged.
Positive/negative are separate owned copies of this packet; CFG1 skips the
negative numerical branch. This does not reproduce the original workflow prompt.

## Retained model pair and resources

Actual local retained directory: `/workspace/work/retained/bernini`. Each File
was statted again on 2026-11-04 at 15,574,833,216 bytes. The SHA identities below
are the **previously verified** complete-model/header identities retained by
the fixed owner; this recovery did not reread or rehash the 31,149,666,432-byte
pair. A stat check alone is not a new full-model hash verification.

| Side / actual filename | Previously verified full SHA-256 | Header SHA-256 |
| --- | --- | --- |
| HIGH / `Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors` | `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52` | `d8aec897e3af480492d7eca7b57141ea968e89cde7f46ea7886db11754ebd6e3` |
| LOW / `Bernini_LOW_fp8_e4m3fn_scaled.safetensors` | `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` | `286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b` |

Original acquisition: `Kijai/WanVideo_comfy_fp8_scaled`, fixed Hugging Face
revision `5890255e5742d12ecf40d159dc01c7d647501c40`, `Bernini/` and the filenames
above. Their identity is scaled E4M3FN with the fixed owner's own-scale decode to
F32 and current F32 operators. The original mxfp8 model/compute dtype is not
inferred from filenames or `default`; its equivalence remains unconfirmed.
Private model files are not copied into Git or automatically sent to another
module. Normal execution must retain its staged real File reader validation.

## Prepared management run: actual fixed source and arguments

Management distribution is
`e1661e561dfb1a4f20544ff48bc375175b5981d1`; its fixed actual runner source is
**`296c18d5f2c878fa42bbb198a706991fc901065f`**. The authoritative instructions are
[REPRODUCE-HOLDING.md at that source](https://github.com/Kushyameln01/kushyameln-works/blob/296c18d5f2c878fa42bbb198a706991fc901065f/development/ai-connection/diffusion-public/REPRODUCE-HOLDING.md).
Use a dedicated checkout at exactly that HEAD; its adopted owner Git object
`ffeeeedb6b57d182a977c3ac02c042ce235fc87a` must also exist locally.

The restored N5 manifest is directly usable by that runner. First run its
read-only preflight from the **management checkout**:

```bash
node tools/ai-connection/run-diffusion-public-browser.mjs \
  --source-commit 296c18d5f2c878fa42bbb198a706991fc901065f \
  --manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
  --models /workspace/work/retained/bernini \
  --wasm-threads 1 --coi false --check-only
```

After the standalone-first execution order has been satisfied, the already
implemented management connection can use this command with fresh private/public
outputs (create `/tmp/bernini-management-private` with mode0700 beforehand):

```bash
node tools/ai-connection/run-diffusion-public-browser.mjs \
  --source-commit 296c18d5f2c878fa42bbb198a706991fc901065f \
  --manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
  --models /workspace/work/retained/bernini \
  --mode sample --cancel-before-run \
  --wasm-threads 1 --coi false \
  --private-output /tmp/bernini-management-private/fresh-one-thread-values \
  --output /tmp/bernini-management-one-thread-fresh.json
```

Normal Pages profile is **1 thread / no COI**. A separate 4-thread run must
explicitly pass **`--wasm-threads 4 --coi true`** with fresh outputs and actual
COOP/COEP/SAB; there is no silent fallback. A four-thread prior sample does not
establish one-thread execution or its duration. These commands do not host the
31 GB pair on GitHub Pages. The management runner has its own source/Worker/
cancellation/reload/save/read guards; recovery neither bypasses nor executes
them. This document provides assets and a reproducible connection command, not
a claim that management inference was executed here. Management's existing
`--check-only` behavior is not numerical acceptance.

## New verification and reused evidence

New verification on 2026-11-04:

- Exact f76 packet extraction; original adapter restores native JSON to the
  same 8,604,657-byte/SHA-256 identity. No masked-row or numeric transformation.
- Unchanged fixed owner CLI recreates the old full and N5/L512 manifests at
  their original paths with the exact byte identities listed above.
- Four recovery tests pass: full/small preparation at relocated private paths
  with original-manifest comparison after explicit path rebase; repeat/reuse;
  corrupt saved tensor rejection; no overwrite of conflicting bytes; symlink,
  permission/location and missing-Git-object rejection. Tests perform no NN.
- The existing `production-reference.py self-test` passed 9 checks, including
  shared shape/token derivation and a 15,360-element streamed-attention helper
  comparison with zero maximum error. It opened no model weights and allocated
  no full stores. This is a helper check, not a real-model original-shape run.

Reused evidence retains its original scope: old N5/L3 fixture and the prior
separate N5/real-L512 numerical/public-Worker results. Recreating identical input
bytes does not expand either numerical acceptance scope. No original-shape
40-block or six-update result, new one-thread result, management sample, LoRA
application, original-media replay, original mxfp8 equivalence or generation
READY is established by this preparation task. Those execution results must be
reported separately by their actual execution source and resource profile.
