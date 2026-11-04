# Text markerとDiffusion通常P4の契約照合

確認対象はDiffusion固定source `48ff155988d995fc2569e495c8d8820273bd472c`。
GitHub pluginで下記本文を取得し、同じ完全commitのGit objectと全bytesおよびGit blob SHAを照合した。モデル推論・export・投影は実行していない。

| 取得path（固定GitHub source） | bytes | SHA-256 |
| --- | ---: | --- |
| [execution/capabilities.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/48ff155988d995fc2569e495c8d8820273bd472c/docs/shared/diffusion-models/execution/capabilities.mjs) | 13,932 | `7dbeb6dc41bba3973fe0804c9a9536e5a5814cbc017db522f810cd1eee55642e` |
| [execution/README.md（通常API）](https://github.com/Kushyameln01/kushyameln-works/blob/48ff155988d995fc2569e495c8d8820273bd472c/docs/shared/diffusion-models/execution/README.md) | 11,010 | `4d33ec925925a354128e3774bcc100d6189bfc9965c1af9fdb43195bb8b0cc1b` |

取得物と照合記録は `/workspace/work/inference/management-20261104/diffusion-48ff-normalization/` 配下の元repository相対pathおよび `ACQUISITION.json` にある。取得根拠は上記固定GitHub本文とGit bytesの一致であり、この環境の絶対pathだけには依存しない。

**通常P4のmarker不一致は48ffでも未解決である。** `P4_INPUT_SEMANTICS.conditioning.normalization` とstrictな `postSelfAttention` 対応判定は `encoder-final-rmsnorm` を要求する。当担当の実Text出力は `umt5-final-rmsnorm-f32-v1` であり、同じmodel／Tokenizer・shapeでも `UNSUPPORTED_NORMALIZATION` となる。通常API文書の例も旧markerを指定している。`execution/p4.mjs` はこの対応判定を実行前に適用するため、表示だけの差ではない。

既存の実管理 `e1661e561dfb1a4f20544ff48bc375175b5981d1` を使った部分接続の受入範囲は維持する。同経路で使ったDiffusion `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` の `captureP4Conditioning` は、実payload・mask・model／Tokenizerと、`metadata.nativeTensorMetadata.normalization` 内の実markerを保持した。このcapture実装は48ffでも同じGit blob `6b1eab70c200b0c25077e9c3c635cf55f9f97d0e` である。

captureでの情報保持PASSは、strictな通常P4入口の受入や投影・cross-attentionの実行PASSを意味しない。実markerは保持し、改名・別名への自動変換・最終RMSNormの再適用は行わない。Diffusion ownerが実markerの正式受理契約と通常入口の判定を整合させる必要がある。それまでは管理から通常P4への当該接続を未対応として残す。
