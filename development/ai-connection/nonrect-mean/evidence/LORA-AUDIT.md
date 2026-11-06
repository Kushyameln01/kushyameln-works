# LoRA source and fragment-boundary audit

2026-10-31 JST. Read-only source audit for the requested non-square mean follow-up. This audit neither receives the private payload nor runs numerical tests. No original LoRA/base payload was opened or hashed. Repository status was clean at the start and after the source comparison: branch `feat/lora-hike`, HEAD `0c27874908638afc748ea2455a2779a16736730b`. No AGENTS.md was found in the bounded workspace/tmp discovery used here. Existing history and evidence were left untouched.

## Fixed source comparison

New peer: `Kushyameln01/kushyameln-works@5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`. Its following Git blobs are exactly equal to the accepted `438972f30242e0a3bc66edb8591f38eaa0fcd384` source:

| Path under docs/shared/diffusion-models | Git blob | SHA-256 |
| --- | --- | --- |
| lora/diagnostic-consumer.mjs | 6f87d6e14b0d2243983741130b673c4f9f20df3e | fdac31542f87d68b9e01a1ba674ee9b60433cae685d6670222f8d914dd27f943 |
| lora/diagnostic-base.mjs | eac3ef89b032c59dd1d39a5e12358f20c25e7234 | a252458a300fa6b305ed976b412b9924cf61e3795c8cace625f91742eab179a8 |
| ort-bridge/stage.mjs | 02598923753121872c49dc801aae36f304ed51c3 | 9b484163791a89526c7ad7e6fc997ff3cc308090a13fc07489a48fa8af974d67 |

GitHub fetch returned each new blob identity; local `git rev-parse 438972...:path` matched. SHA-256 was computed only over those retained code files. The new commit object itself was not yet present in this checkout at audit time; no remote fetch or branch mutation was performed by this audit.

New `lora/base-block.mjs` is 11,747 source characters, Git blob `0276a50a392a0817220dc8e54add12ee2d248d09`. Its full source was obtained through the GitHub connector. Public contract: `lora/DIAGNOSTIC_API.md@5f880fd8...`; new Diffusion-owned alternative adapter: `lora/V2_ADAPTER.md` / `lora/v2-adapter.mjs` (blob `b2653824606eb0421ec07d9835450cba6369f7d6`). That alternative targets the same native LoRA v2 version but has a different factory/ownership wrapper and registry version. It is not our existing adapter identity and must not be silently substituted. Its documented harness pins the older LoRA source `2bba9078...`; our current fixed large-matrix kernel is a distinct artifact.

## Compatibility with the existing LoRA adapter

`docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs`, adapter version `lora-diffusion-diagnostic-adapter/0.1`, already takes injected `consumer`, `baseProvider`, and required `isOwnerCurrent`. It does not import a whole-File factory. Therefore a validated `createBerniniBlockProvider({artifact,side,hikeBytes?,signal?})` can supply the same native `describe()` and `baseProvider.readBlock()` to this adapter without changing the native SDK, loader policy, planner, or LoRA kernel.

The fragment provider reconstructs the same `bernini-diagnostic-registry/0.1`, graph `af48828a...`, profile `bernini-q16x5120-f32-wasm-v1`, FP8 profile `scaled-e4m3fn-scalar-f32-v1`, original full Q `[5120,5120]`, selected `[16,5120]`, original bias `[5120]`, selected `[16]`, runtime-input `weight`, and hike-parameter `bias`. It compares the entire reconstructed registry, including its digest, with the delivered registry. Its offsets are selected-slice elements; our adapter already checks and translates full original element offsets into these selected offsets. The two registry digests remain distinct.

Native consumer/session ownership, structured PARTIAL validation, atomic epoch guard, rollback, prepareBase, releaseCandidate, and run behavior are byte-identical to the accepted peer. The caller continues to own base/stage/consumer; our wrapper retains owner-current separately from SDK cancellation, preserves rollback context, passes detail's real base bias separately, and returns diagnostic-only CONSUMER_APPLIED. No initializer/FULL relabeling is required or justified.

## Private artifact verification boundary

The Page advertises exactly 709,364 bytes and SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`; format `bernini-diagnostic-base-block/0.1`, scope PARTIAL, `fullFileHashRecomputed:false`. Root owns actual receipt and hash verification; this audit does not claim that receipt.

Per side, the public provider verifies five ordered ranges: header 181,280 bytes, q.weight 81,920 bytes, q.bias 32 bytes, weight_scale 4 bytes, comfy_quant 27 bytes. Checks include exact lengths/order/IDs, canonical base64 and actual range SHA, original absolute offsets from the strict pinned header, storage/full shape, scalar scale and quant config, side/model identity, native registry digest, and full registry reconstruction. Unknown/missing/reordered/out-of-source ranges reject. All decoding is Hike. Data returned to LoRA is independent finite F32 and read calls serialize with cooperative abort around bounded calls and digest awaits.

`stats()` correctly reports `source:'bounded-fragment-artifact'`, `fullFileSHA256Verified:false`, `fullFileHashRecomputed:false`, `unprovidedRangesAvailable:false`. A prior-owner whole-file receipt is provenance, not a fresh full-file verification by the receiver. Do not expose this object as a 15.57GB Blob or allow missing-row reads. Preserve the supplied private artifact outside any Git repository and avoid payload/base64 in public evidence or an HTTP file endpoint.

## Smallest reproducible runner change

Existing `tools/ai-connection/test-lora-diffusion.mjs` currently requires `--base` plus `--base-receipt`, verifies the actual full File's stat binding, invokes `lora-reference.py --base`, and supplies a browser `<input id=base>`. `joint-browser-cases.mjs` directly instantiates `createBerniniDiagnosticBase`. Therefore the new bounded transport is not yet selectable through this runner. Its whole-File mode must keep its present checks unchanged.

A bounded-artifact mode can remain confined to the verification harness:

1. Explicit, mutually exclusive input mode `--base-artifact` with the owner-delivered expected full artifact hash/byte count. Verify raw UTF-8 artifact bytes before JSON parse and record its delivery identity. Reject mixing a fragment with `--base/--base-receipt`.
2. Browser creates `createBerniniBlockProvider` only for that explicit mode, then uses our unchanged external adapter and the same real consumer/stage. Import the new factory conditionally so a reproduction against the old peer still works.
3. Independent reference can reuse the saved previous original-based reference arrays only after checking the delivered raw Q/bias/scale/config/header hashes, identities, target/slice, and expected F32 decoded hashes against those references. Existing private reference JSONs are present at `/workspace/work/lora/e1-joint/{HIGH,LOW}-fixed/reference/reference.json`. Selected F64/F32 arrays remain alongside them. These are prior independent NumPy references, not synthetic zero base. Reuse must be recorded as such. A portable alternative is to add an explicit bounded-byte input to the Python oracle, independently validate/decode its actual five ranges, and keep the LoRA factor/loader arithmetic unchanged. Either route must avoid a fake whole-model File.
4. Preserve all current comparison gates and lifecycle cases: all81,920 selected weights, light bias16/detail immutable bias16, all16 consumer outputs, strengths0/1/-1, restore/reapply, no double-add, cancel/recovery, copy lifetime, stale plan/epoch and v1 refusal. New browser File loads retain required original LoRA source checks. Metadata-only `ls` confirmed four LoRA files remain at the existing paths; this audit did not read them.
5. Output separate artifact acquisition/range verification, Hike decode, existing reference reuse, real LoRA calculation, actual diagnostic consumer application, and NOT_RUN full-model/generation/snapshot stages. Do not replace the old full-original evidence with the new fragment provenance.

Relevant existing commands, after root obtains the fixed new peer code:

```sh
DIFFUSION_SOURCE_ROOT=/absolute/fixed-5f880-peer node --test tools/ai-connection/test-diffusion-diagnostic-adapter.mjs
node --test tools/ai-connection/test-joint-comparison.mjs
python tools/ai-connection/test-lora-reference.py
```

A new explicit fragment-mode test command should reflect its final parser; no hypothetical command is presented as implemented. Existing whole-File reproduction remains in `development/lora/REPRODUCE.md`.

## Non-square mean scope

LoRA's Q target is a weight matrix and its consumer activation is x[5120]; it accepts no VAE posterior-mean tensor or latent normalization operation. New Diffusion source advertises the independent rectangular mean profile `wan21-raw-f32-1x16x32`, shape `[1,16,1,2,4]`, 128 values, with a dedicated normalization/restoration ABI. Old `[1,16,2,2,2]` also has128 values but is not interchangeable; F1 64 values is another separate profile.

Consequently the rectangular mean does not change our rank/alpha/scaling, bindings, selected Q slice, SDK v1/v2 versions, or LoRA weight algorithm. The mean boundary belongs to Diffusion/VAE and any management data-routing wrapper. Appropriate LoRA-side support is to receive the new peer source/fragment contract, document the independent mean shape/profile, preserve the native `input:{tensor}` wrapper when integrating through Diffusion's mean API, and verify that such metadata is not accepted as a LoRA weight registry or converted merely by element count. An integration check of the supplied exact mean profile/shape/encoding is appropriate; adding a second mean normalizer inside LoRA is not implied by the supplied contracts.

Full model inference, all-target LoRA coverage, generated-sample decode and common snapshot publication remain outside the existing E1 LoRA diagnostic acceptance.

## Execution addendum after root received the private artifact

Root provided the private file at `/workspace/work/lora/nonrect-received/base-blocks.json` and the fixed new source checkout `/workspace/work/lora/nonrect-peer-5f880`. The following fresh commands were inspected first, then executed. All outputs are outside Git; no product code was changed.

- `BERNINI_E1_BLOCK_ARTIFACT=... node --test --test-isolation=none docs/shared/diffusion-models/lora/test-base-block.mjs`: **8/8 PASS, 0 skipped**, exit0. Evidence `nonrect-received/block-native.log`. It checks actual HIGH/LOW Hike decoding, owned output copies, immutable initialization, range/hash/base64/registry forgery rejection, bounds, cancellation and disposal. The private artifact is the input; no original full-model File is supplied.
- `DIFFUSION_SOURCE_ROOT=/workspace/work/lora/nonrect-peer-5f880 node --test tools/ai-connection/test-diffusion-diagnostic-adapter.mjs`: **19/19 PASS**, exit0. Evidence `nonrect-received/block-our-adapter.log`. This is the existing adapter contract suite using the new byte-identical actual consumer with explicitly synthetic provider/stage fixtures. It is not a new four-real-LoRA joint run.
- `python tools/diffusion-models/test-base-block-browser.py --artifact ... --output /workspace/work/lora/nonrect-received/block-browser.json`: **PASS**, Chromium154.0.8037.57, HIGH and LOW cases pass, no page errors, zero `.safetensors` network requests. Evidence `block-browser.log` and `block-browser.json`. This executes actual bounded artifact→real Hike decode→unchanged native consumer prepareBase/validate/commit→actual ORT WASM/Hike. It includes provider guards, cooperative cancellation/re-execution, workspace reuse and all16 diagnostic outputs per side through independent native references. It performs no LoRA low-rank multiplication.

An independent comparison script then read only the received bounded artifact, the prior independent reference metadata/selected arrays and new provider source/WASM. It checked exact artifact709,364bytes/SHA, each of the10 actual raw ranges and hashes, prior original header hash, Q/bias/scale/config range hashes, model identity and native registry digest against the old accepted actual-original trial. Hike decoded both sides and the resulting full81,920weight/16bias arrays were byte-identical to the previously verified independent NumPy reference arrays. Evidence: `/workspace/work/lora/nonrect-received/block-prior-reference.json`, statusPASS.

| side | decoded Q F32 SHA-256 | decoded bias F32 SHA-256 |
| --- | --- | --- |
| HIGH | 716323810c36affed35f130f246daa9984fcecd50a7ecdc262b89d3655387c9d | e43ae1fd2b1b80b29aff9212368fd282cb5a216b5c13526c8696bf25b1a0d6e0 |
| LOW | 9ccabb6bff52fcc841b4cca9a863dc54b73a1cb032cd739d7b091d097529906b | 2d6cabbb0c26620dc56eee8533ae4a0248eda52ac71ab5d69e0a1d3251aacb7e |

The old original-full-file acquisition receipt remains historical proof belonging to that original immutable File. Today's fragment verification does not reauthenticate15.57GB originals. Native `fullFileSHA256Verified:false`, `fullFileHashRecomputed:false` and `unprovidedRangesAvailable:false` remain explicit. Nothing was cast into a virtual full-model File. No actual original LoRA/model payload was read or hashed, no full-model inference or model export was run, and repository status remained clean at HEAD0c27874908638afc748ea2455a2779a16736730b after these tests.
