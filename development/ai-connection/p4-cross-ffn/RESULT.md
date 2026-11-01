# P4 cross-attention・FFN接続候補

この実装commitは数値実行前のsource固定用である。実資材の結合結果・実行source SHA・配布SHAは後続の証拠commitで記録する。現時点の状態は`IMPLEMENTED / NUMERICAL_INTEGRATION_PENDING`であり、本番受入を表さない。

S2追補: 初回source `3ae9b934ffcd2cf092171699fd7a5b55110f1197`の再現runnerで符号付きゼロの入出力serialization不整合を検出した。初回の数値比較とweight復号結果は原記録として残すが、fixtureのbyte一致と保存array identityは未受入である。修正はdiagnostic transport/検査だけに限定し、Hike/ORT数値owner・kernel・referenceの数値定義・gateは変更していない。全payloadをJSON文字列で渡し、private JSONは`-0.0`を保持する。実行前の入力hashと、保存前の25出力F32 hashを必須検査にして、S2の実結合を再実行する。

保存済み固定N2自己注意残差のhash・shape・意味とE4 payloadを照合し、再利用する。prefix・自己注意・元tailの数値計算を再実行しない。新入口は固定tailとは別Profileで、cross-attention→FFNの全hidden幅・全40headと、明示したText行数を処理する。

実Text payloadは着手時未取得である。独立したL4 fixtureは`bernini-p4-explicit-text-l4-dyadic-v1`と明記し、UMT5や元workflowの本番入力と呼ばない。source/APIを取得した事実、producer宣言、数値受入、対向ownerの合意を区別する。

- [conditioning契約と未合意項目](CONDITIONING.md)
- [実base provider・最終F32 consumer契約](WEIGHT-FEED.md)
- [元core・独立reference・事前gate](core/REFERENCE-CONTRACT.md)
- [候補source/build](build.json)
- [取得した仕様書と固定catalog](spec-acquisition.json)
- [本番shapeの容量内訳・未成立条件](production-budget-estimates.json)
- [実装計画](../../../docs/superpowers/plans/2026-11-01-diffusion-p4-cross-ffn.md)

既存tailの管理受入は管理`60d16b64d6020d3d20239f087f8add91268dcaad`で確認した。その限定scopeを新P4の受入へ広げない。正式82b bridgeと旧Q16 consumerは変更しない。

実producerとのconditioning、canonical LoRA adapterの新target mapping、本番K/N/context、全block/timestep、production precision、実HIGH→LOW、生成sample/復元/VAE decode、組合せ全工程資源は未受入。`load/predict/sample=NOT_READY`、generationReady=falseを維持する。merge・Pages公開を行わない。
