# Shared workflow shape source

Recorded 2026-11-02 JST. `docs/shared/ai-connection/workflow-shapes.mjs` is the single pure logical derivation used by the normal metadata entrance. Its rule ID is `bernini-ca69274-b5a4321-wan21-shapes-v1`; it exports `deriveWorkflowShapes(input)`, `parseBerniniWorkflowShapeRequest({workflow,media,geometry})`, and `BERNINI_WORKFLOW_RULE_ID`.

The result is a set of shape requirements with `ownerSupport: "NOT_QUERIED"`. It does not authenticate an original user runtime, select an accepted profile, implement numeric tensor operations, or grant owner support. Missing or different rule IDs throw before derivation. Normal owner queries remain separate and retain the owner's answer.

## Pinned source bytes

These hashes describe the actual acquired source bytes, including their existing final newline. Git blob IDs use the Git `blob <length>\0<bytes>` framing. No full commit was inferred from a short prefix.

| Source | Fixed commit and path | Bytes | SHA-256 | Git blob SHA-1 |
| --- | --- | ---: | --- | --- |
| BerniniStudio Python | `CCpt5/ComfyUI-BerniniStudio@ca69274a2d2135052489bc0c67a2d79a64225e86`, `bernini_studio.py` | 54312 | `f7dcf7894ec9a8fbedf21f6186b2525f3fd61705eb814aa7b6ee23286a71675b` | `1cf428deb1d5adbfbc2ffe22539de864c9b3e629` |
| B5 Wan model | `Comfy-Org/ComfyUI@b5a432157de6b8884f81104cd02926adf4d597e4`, `comfy/ldm/wan/model.py` | 83811 | `17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699` | `4e1a055d827b4fa91c3a384d972b851175999be9` |
| B5 patch padding | `Comfy-Org/ComfyUI@b5a432157de6b8884f81104cd02926adf4d597e4`, `comfy/ldm/common_dit.py` | 474 | `5e2459be4a47073a17e6b806f2b93962b4df1cdcaa2ac1890c9573bf942edf82` | `f7f56b72ca6fcd3ba2831b8881a7124d84490bee` |
| Wan2.1 VAE | `Wan-Video/Wan2.1@9737cba9c1c3c4d04b33fcad41c111989865d315`, `wan/modules/vae.py` | 23163 | `4912ffd7a9fbb17ceef9a17d4a9c4b8aee36ec37c32594f54e57693b29909498` | `5c6da5723536cdd49889132479fdd35700e0e5ca` |

Bernini bytes are retained in `development/ai-connection/p4-management/workflow/source/bernini_studio.ca69274.py`; its public acquisition receipt is `../p4-management/workflow/SOURCE-ACQUISITION.json`. The B5 model is retained in this repository's fixed Git object `994ebb9ce01c9e95db9cd18eb877a981152693c5:development/ai-connection/profile-adoption/p4/core-source/comfy/ldm/wan/model.py`; the adjacent `core-manifest.json` records the B5 upstream pin and matching hash. The vendored VAE is `tools/inference/vae/vendor/vae.py`, with its upstream pin in `tools/inference/vae/vendor/source.json`. The bounded B5 padding source was read directly from its fixed upstream revision and is cited at [common_dit.py](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/ldm/common_dit.py); this packet does not claim a checked-in copy of that source.

## Source correspondence

| Source lines | Logical requirement represented by the helper |
| --- | --- |
| Bernini 600–603 | Requested target parameters create the initial zero-latent. The literal original expression is `[B,16,((L-1)//4)+1,H//8,W//8]`. The target is independent of available source frames. |
| Bernini 634–641 | Supplied source takes its first `length` RGB frames, then area interpolation with center crop to the configured canvas. Hence selected F is `min(actual supplied F, target L)`, rather than an unconditional 81. |
| Bernini 379–387,643–645 | Reference video first takes at most L frames, then preserves its own aspect ratio through long-edge processing. Each edge is `max(16, round(edge*min(limit/max(H,W),1)/16)*16)`, using Python ties-to-even. Interpolation is area and crop is disabled. Grid rounding and the minimum can enlarge a small dimension. |
| Bernini 658–674 | A non-null wired slot wins over its editor candidate. Missing slots compact; every supplied image-batch frame is a distinct F1 context in its original order. Original slot index, original frame index and compacted slot ordinal are distinct metadata. |
| Bernini 630–688 | Context order is supplied source, supplied reference video, then successfully supplied slots 0–7 and their original frame order. Positive and negative conditioning receive the same ordered context list. |
| Wan2.1 VAE 516–534 | The declared media compression rule processes the first frame, then complete groups of four: `1+(F-1)//4`. The helper records the coverage qualification; it does not invoke this encoder. |
| B5 model 581–584,603–607 | Target patches flatten before the per-context patch streams are appended along the token axis. In this Bernini `context_latents` path the order is target first, then the actual ordered contexts. The separate optional `ref_conv` prefix at 594–599 is outside this helper's declared path. |
| B5 model 704,719–723 | The owner pads the target and every actual context independently to patch multiples. Target source ID is 0; the actual ordered context at index i receives source ID i+1. |
| B5 common_dit 5–13 | Patch padding is at each axis end, with extent `(patch - size % patch) % patch`. The helper counts the padded grid with `ceil(size/patch)` and reports padding metadata. The numerical padding implementation and its eager circular / tracing reflect policy remain with the owner. |

The caller supplies model geometry explicitly: RGB and latent channel counts, temporal and spatial compression, patch size, hidden width and dtype. The present candidate declaration is RGB3, latent16, time4, spatial `[8,8]`, patch `[1,2,2]`, hidden5120, and the declared floor temporal rule and target-first order. These values are neither implicit global defaults nor a model authentication result. Alternate caller geometry does not establish equivalence to the pinned Bernini literal or the selected model. The recorded selected-model architecture derivation is `development/diffusion-models/model-architecture/architecture-report.json`, `derived_config`; it is prior metadata evidence, not a fresh model execution.

## Qualifications and dependent unknowns

The helper preserves an actual F80 source as RGB F80. Under the explicitly declared Wan floor rule it derives latent T20 with `inputRgbFrames:80`, `coveredRgbFrames:77` and `fullFrameRetention:false`. It does not change the supplied source to F77/F81 or claim that an available owner profile accepts F80. A non-4n+1 target likewise preserves its requested RGB count while independently recording the literal initial zero-latent floor and its coverage qualification. A positive target off the spatial grid retains its requested H/W and reports `spatialRoundtripExact:false` where appropriate; no extra server-side rejection is inferred from widget min/step declarations.

Every requirement has a stable `requirementId`, role, state (`known`, `unknown`, or `absent`), shape, dtype, axes, provenance and issues. RGB and latent metadata use NCTHW axes; token metadata use BLC. Meaning and normalization come from explicit caller semantics or remain null. The normal bridge preserves explicit owner bindings and does not invent a native raw-mean meaning from a logical role.

Unknown supply makes only dependent population facts unknown. Known entries before the first unresolved population retain their source IDs and available token ranges. Later source IDs, ranges and compacted ordinals that depend on an unresolved earlier slot are null; complete totals remain null. Known target and independent media shape requirements remain available. Explicit absence creates no stream and does not block the remaining entries. Known presence with unresolved dimensions still has a known population position but an unresolved shape. Missing optional frame times alone do not block geometry. Supplied frame-index/time arrays retain order and duplicates and are copied rather than mutated.

The parser treats saved links and editor filenames as declarations of unknown actual supply. Explicit runtime media metadata can resolve them. It does not infer supplied dimensions or frames from a filename, duration, FPS, node mode or workflow widget. The original saved workflow declares target L81/H480/W832 and ref limit848, but its actual original source/reference/editor media are still unavailable. The controlled Rect F1/H16/W32 fixture remains a separate supplied test context; it does not replace those unknown original media or alter the original target81 requirement.

Actual decoder/orientation/resize, VAE encode/decode/range conversion, tensor padding, patch embedding, token concatenation, RoPE coordinates/rotations, normalization, RNG/noise and schedule belong to the corresponding owners. No such operation, payload generation, inference or export was performed by these metadata tests.

## Behavioral verification

The focused shared-helper suite has 18 passing behavioral tests. The helper plus normal metadata bridge suite has 26 passing tests, including an actual shared-helper Rect and target81 query integration with a synthetic owner response. Tests observed RED before implementation and two focused RED failures before the rule-ID and dependent-prefix fixes. They check literal expected shapes, order and source IDs, Python rounding ties, non-square and non-4n+1 cases, optional mappings, unresolved media and integer overflow. These checks do not establish real owner support or replace the owner's numerical validators.

```sh
node --test --test-isolation=none tools/ai-connection/test-workflow-shapes.mjs tools/ai-connection/test-workflow-normal-requests.mjs
sha256sum docs/shared/ai-connection/workflow-shapes.mjs tools/ai-connection/test-workflow-shapes.mjs
git show 994ebb9ce01c9e95db9cd18eb877a981152693c5:development/ai-connection/profile-adoption/p4/core-source/comfy/ldm/wan/model.py
```

The parent integration run, actual browser evidence and subsequent owner support answers are recorded separately. This source correspondence document does not claim them.
