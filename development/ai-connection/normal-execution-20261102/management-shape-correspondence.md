# Management shape correspondence receipt

This is a source-only diagnostic receipt for the normal execution interface. Management adapter and catalog changes have **not** been applied. Matching dimensions do not establish matching meanings, numerical acceptance, or management adoption.

- Owner baseline: `9d67561685173de6529d6f22e79088bb75a6a679`, branch `codex/diffusion-derived-hidden-heads`.
- Management snapshot: `59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f`, branch `codex/ai-connection-e0-e4`.
- Receipt created: 2026-11-01 21:29:34 UTC.

The live management branch SHA was read through the GitHub connector GET endpoint. It was eight commits ahead of the cached local tracking ref `60d16b64d6020d3d20239f087f8add91268dcaad`. The exact earlier GET timestamp was not retained. The owner HEAD commit adds report/evidence files and changes no runtime source.

## Acquired source identity

Three complete management source bodies already fetched at the full commit above were reused from the session store. SHA-256 covers their complete UTF-8 bytes. Computed Git blob SHA1 matches GitHub-reported blob identity for all three. Two additional one-line metadata reads confirmed declarations/norm-bindings identity; no complete body was downloaded again.

| Management source | Bytes | SHA-256 |
| --- | ---: | --- |
| [p4-cross-ffn/shape.v1.json](<https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/reference/candidates/p4-cross-ffn/shape.v1.json>) | 24893 | `9553855ed4aa8d9bd3861f241bba198c3521a91f449d69734d3ad7f1210f9614` |
| [p4-cross-ffn/declarations.mjs](<https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/adapters/p4-cross-ffn/declarations.mjs>) | 53308 | `e3599223ab4528f8eb17b0b3b22bf73aaebf7ed9f2b733d143526e571b1414bd` |
| [ai-connection/norm-bindings.mjs](<https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/norm-bindings.mjs>) | 32732 | `2cfdf5db6d5e511a93455bf0342a39a170c35373e5f2685dae2e77fdcbab5f18` |

These owner sources were read from fixed local Git objects at `9d67561685173de6529d6f22e79088bb75a6a679`. Their URLs identify the same commit; this audit did not fetch those owner blobs remotely.

| Owner baseline source | Bytes | SHA-256 |
| --- | ---: | --- |
| [stage.mjs](<https://github.com/Kushyameln01/kushyameln-works/blob/9d67561685173de6529d6f22e79088bb75a6a679/docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs>) | 21978 | `ff184acbabc589472a95b0bbf0eb2d3949b4478ecc0b19266817e8c313e7826d` |
| [conditioning.mjs](<https://github.com/Kushyameln01/kushyameln-works/blob/9d67561685173de6529d6f22e79088bb75a6a679/docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs>) | 18862 | `b4518ea35ca35e63e6ba8cdbe67e5d9fea0fa2125dac7dac0f5d4ac6c83ac7c2` |
| [source.mjs](<https://github.com/Kushyameln01/kushyameln-works/blob/9d67561685173de6529d6f22e79088bb75a6a679/docs/shared/diffusion-models/ort-bridge/post-self-attention/source.mjs>) | 10907 | `5bf263b8b6465b395dd6ea3634ef9619626479f95b8a22cc207dd923541c9d63` |
| [linear.mjs](<https://github.com/Kushyameln01/kushyameln-works/blob/9d67561685173de6529d6f22e79088bb75a6a679/docs/shared/diffusion-models/ort-bridge/post-self-attention/linear.mjs>) | 7075 | `3821cca4b031aae4adf3944f15f8d171ed602f97878307ce495b7dcd8b05118a` |

The accompanying JSON records full repository/commit/path/URL, byte count, hash scope, Git blob identity, and relevant line ranges for each source. Missing release identities or observation timestamps are left null with a reason.

## Shared physical contract

| Field | Shared declaration | Management source |
| --- | --- | --- |
| Residual / block output | float32 LC `[2,5120]` | [shape:306–339](https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/reference/candidates/p4-cross-ffn/shape.v1.json#L306) |
| Time activation | float32 C `[5120]` | Native operator time projection and saved-input binding |
| Text conditioning | float32 BLC `[1,L,4096]`, integer `1<=L<=512` | [shape:680–727](https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/reference/candidates/p4-cross-ffn/shape.v1.json#L680) |
| Operator constants | block0, two tokens, width5120, FFN13824, 40 heads, headDim128, epsilon1e-6, chunks3–5 | [declarations:857–890](https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/adapters/p4-cross-ffn/declarations.mjs#L857) |
| Cross attention | no RoPE or softmax mask; mask retained as provenance | [declarations:870–875](https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/adapters/p4-cross-ffn/declarations.mjs#L870) |
| Named outputs | 25 outputs, symbolic Text `L` resolved from `conditioning.rows` | [norm-bindings:65–72](https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/norm-bindings.mjs#L65) |

Native admission remains bounded: decode81920 elements, raw read163840 bytes, ordinary projection/weight tiles16 rows, FFN-down weight tiles4 rows with intact inner13824, graph query2, key chunks1–64. These come from [source:18–29](https://github.com/Kushyameln01/kushyameln-works/blob/9d67561685173de6529d6f22e79088bb75a6a679/docs/shared/diffusion-models/ort-bridge/post-self-attention/source.mjs#L18), [source:71–77](https://github.com/Kushyameln01/kushyameln-works/blob/9d67561685173de6529d6f22e79088bb75a6a679/docs/shared/diffusion-models/ort-bridge/post-self-attention/source.mjs#L71), [linear:14–19](https://github.com/Kushyameln01/kushyameln-works/blob/9d67561685173de6529d6f22e79088bb75a6a679/docs/shared/diffusion-models/ort-bridge/post-self-attention/linear.mjs#L14), and [linear:45–54](https://github.com/Kushyameln01/kushyameln-works/blob/9d67561685173de6529d6f22e79088bb75a6a679/docs/shared/diffusion-models/ort-bridge/post-self-attention/linear.mjs#L45). They do not establish aggregate browser/ORT/host memory peak. Pointwise1M, three mean profiles, and Text extents stay separate limits.

## Meanings require a new explicit binding

Management's existing P4 catalog uses `works:p4-output:NAME:f32`, with authority `management-sidecar/owner-named-output` and `ownerNativeMeaning:null`. Its block output is `works:p4-output:blockOutput:f32`; see [shape:332–355](https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/reference/candidates/p4-cross-ffn/shape.v1.json#L332) and [declarations:1248–1254](https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/adapters/p4-cross-ffn/declarations.mjs#L1248).

The normal working-tree interface declares:

| Tensor | Native meaning | Normalization |
| --- | --- | --- |
| residual | `bernini-block0-post-self-attention-hidden:v1` | `none` |
| timeAct1 | `bernini-time-embedding-silu:v1` | `none` |
| conditioning | `text_hidden_states` | `encoder-final-rmsnorm` |
| blockOutput | `bernini-block0-output-hidden:v1` | `none` |

These declarations are in `docs/shared/diffusion-models/execution/capabilities.mjs` lines11–19 and44. That interface is being integrated in the working tree; this receipt assigns no invented release commit or hash. A future management adapter/catalog entry must explicitly bind the new source, operation, and native meanings. Physical shape equality alone cannot select or authorize that mapping.

## Fixed diagnostic cohorts remain separate

`N-P4-SHAPE` binds `SHAPE-BERNINI-BLOCK0-N2-CROSS-FFN-F32`. `N-P4-NUMERIC` separately binds `EXEC-BERNINI-BLOCK0-N2-CROSS-FFN-F32-CANDIDATE-V1`, HIGH schedule1 / LOW schedule3, saved residual/time inputs, conditioning cohort identities, references, gates, and prior owner acceptance. See [norm-bindings:39](https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/norm-bindings.mjs#L39), [74–83](https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/norm-bindings.mjs#L74), and [194–239](https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/norm-bindings.mjs#L194).

The L4 fixture and fixed native Text L512 packet are separate cohorts in [shape:686–727](https://github.com/Kushyameln01/kushyameln-works/blob/59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f/docs/shared/ai-connection/reference/candidates/p4-cross-ffn/shape.v1.json#L686). Their public binding hashes are retained verbatim in the JSON. L4 acceptance cannot become L512 acceptance. The normal support check requires its declared shape/model/meaning/normalization/capacity contract; it does not require those diagnostic payload hashes, receipts, or gates. Existing diagnostic policies remain pinned.

No manager adapter or catalog was edited, no manager execution/publication was performed, and no model payload, neural execution, or whole-model hash was used. `load/predict/sample=NOT_READY` and `generationReady:false` remain. N32760/context, later blocks/timesteps, real HIGH→LOW, production precision, and complete pipeline resource acceptance remain outside this receipt.
