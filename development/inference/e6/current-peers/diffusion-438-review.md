# Focused PR6 review: real owner F1-64 extension

2026-10-31 JST. Exact source `438972f30242e0a3bc66edb8591f38eaa0fcd384`, [PR6](https://github.com/Kushyameln01/kushyameln-works/pull/6), branch`codex/diffusion-e0-e7`. This is the explicit new review target; no other branches or heavyE7 operation were followed.

The previous f522 source acquisition/metadata observations remain valid for f522, but **current438 normalization has changed**. It cannot reuse the previous numeric dependency proof as a test of the new kernel.

## Actual source and advertised profiles

- Protocol remains `diffusion-models/0.1`.
- BUILD_ID: `diffusion-models/0.1+f7f23c2291886de637cb06ae001fc748d29232f7c8919683467da5eef6cfb80e`.
- New real Hike kernel: **7,544 bytes**, SHA-256 **`6b9cb9f0617da373e63275354ac42f7843fb455019ed3988df7364173bc775b4`**, ABI`wan21-raw-mean-f32-v2`.
- Hike sourceSHA `357b7d72c2f38a9dec028818f9df33383a3c4be751258783c3513f9e2f681fea`.
- Actual advertised `rawMeanProfiles` in`api/index.mjs:71`:
  - `wan21-raw-f32-5x16x16`: `[1,16,2,2,2]`,128elements.
  - `wan21-raw-f32-1x16x16`: `[1,16,1,2,2]`,64elements.
- New exports `NormalizeRawMeanF1` / `RestoreRawMeanF1` use channel`i/4`, while existing128 exports retain`i/8`. Fixedarena1024bytes. The host selects strictshape and returns ownedcontext copies for both profiles.
- `requireWanRawLatentF1` / `WAN21_RAW_F1_PROFILE` are separate public ES exports. The old `requireWanRawLatent` and old raw mean codecwrappers intentionally remain128only. Worker`validateRawLatent` dispatch now chooses the separateF1guard by strictshape (`api/worker.mjs:47–52`).

Immutable [API](https://github.com/Kushyameln01/kushyameln-works/blob/438972f30242e0a3bc66edb8591f38eaa0fcd384/docs/shared/diffusion-models/API.md), [host](https://github.com/Kushyameln01/kushyameln-works/blob/438972f30242e0a3bc66edb8591f38eaa0fcd384/docs/shared/diffusion-models/latent-space/latent-space.mjs), [F1guard](https://github.com/Kushyameln01/kushyameln-works/blob/438972f30242e0a3bc66edb8591f38eaa0fcd384/docs/shared/diffusion-models/tensor-interop.mjs), [ABI](https://github.com/Kushyameln01/kushyameln-works/blob/438972f30242e0a3bc66edb8591f38eaa0fcd384/docs/shared/diffusion-models/latent-space/ABI.md).

Eleven exact source/binary files were received through GitHubconnector and byte/blob hashes checked. `diffusion-438-acquisition.json` records all identities; privatecopy`diffusion-source-438972f/`. Noowner source was changed or merged.

## Actual bounded checks

Executed `node diffusion-438-f1-check.mjs`: **5 focused cases PASS**, with the previously accepted real64element F1mean as input. These are direct actualowner ES module and realHike WASM checks inNode, not a new browserAPI/Worker or neuralmodel test.

1. RealF1mean→newowner64normalization: exactshape/model/meaning, caller data unchanged, complete nativecontext/indices/times preserved as ownedcopies. All16channel normalized values match the previously verifiedold128Hike coefficient reference **bitexactly**, maxAbs0. The128reference is an isolated syntheticnumeric control; no actualinput is padded/reshaped to bypass the productionguard.
2. Ownernormalize→**explicitG1Ccodec** save/read→ownerrestore: context andrawmean restored,64values, maxAbs **`1.1920928955078125e-7`** ≤ retained`2e-6` gate. NoVAE or manager normalization was added.
3. Old128profile remains usable, now with ownedcontext preservation through bothownertransforms;128values, maxAbs`1.1920928955078125e-7`.
4. Strictnegative checks: legacyguard rejects64; actualrectangular mean`[1,16,1,2,4]` is rejected byF1guard/normalize/restore; wrongprofile andgeneratedmeaning rejected. These add0Hikecalls.
5. Storage limits remain explicit: owner's legacycommoncodec stilldropscontext and its old rawmean writerwrapper stillrejects64. This is not a declaration of fullowner-storage metadata compatibility.

Newowner kernel made4actualcalls; the oldkernel made1referencecall. Result/sourcefiles are `diffusion-438-f1-results.json` and `diffusion-438-f1-check.mjs`.

## Optional VAE decode delta input

Restored actual64mean saved with ourG1Ccodec:

```text
owner438-restored-still64.wktensor
fileSHA256    133ec18d70bbdb1d8cf999328a04865b79e6aa9dbcb03e47f7b8164184ccc0cb
payloadSHA256 27d9cf7f6251c0819c96ebc653b6fdcd8ed0971b34cab6eb14c79fe582dd16a7
meaning       raw-posterior-mean
shape         [1,16,1,2,2]
modelSHA256    2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b
```

This reviewer did not execute VAE neuraldecode. The coordinator can use this exactrestoredmean for the oneexistingF1decode delta check if needed; noexport or media/profile inventory is needed.

## What changed and what remains

The currentowner now implements64mean normalization/restoration and contextcopying, resolving the earlier directtransform limitation **for exactF1-16×16 only**. Oldowner codecstorage stilldropscontext/Tokenizer metadata, so the explicitG1Cserializer or outside artifact/sidecar remains necessary; preserving metadata in memory does not prove fulljointpackage readback. The newrectangle mean is stillunsupported despite alsohaving128elements. No generatedsample operation, realpredict/sample, originalGPUprecision or E8/E9 inference was accepted here. Source/fixture verification is not a newbilateralACK.
