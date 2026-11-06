# 再利用する証拠と今回の新規確認

2026-11-01 JST。基点 `78a3268166eca63e5daafb1b21e184224c4d14b1`、runtime `e48021d8da29ef3b3b9e9d6161331c282798b6b3`。既存数値結果は元scopeとsource bytesが一致する場合に再利用する。今回の結果は別directoryへ保存し、過去receiptの内容・source・gateを更新しない。

| 既存証拠 | 再利用する範囲 | 再利用では成立しないもの |
| --- | --- | --- |
| N16 QKV、source `8cdfd3f5f7db0cd66762e78f09c209fb5b27366b`、各side6case/10比較 | 実重み・明示hidden16、全幅5120 QKV/QK norm、head0、選択16key | 実block/time由来hidden、全40head、本番入力 |
| N2 prefix、e48021…、各side14stage | 実VAE Rect mean＋固定明示noise、HIGH1/LOW3独立診断、実patch/time/block0 modulation、全5120 LayerNorm、自然2token | 元81frame、元noise/context、production精度、HIGH→LOW受渡し |
| N2 QKV/all-head、e48021…、各side8case/11比較 | 同じ実hidden bits、全幅QKV、全5120 norm、厳密2座標、全2query×40head、O projection前 | 任意shape・元32760token・O/残差/cross/FFN・全block/timestep |
| 旧Q16/allK32760 stream attention、`5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`内のE7証拠 | 明示postnorm/RoPE fixture、1head、宣言全K32760、末尾56、workspace/取消 | 実QKV producerとの接続、本来の全context、全query/head |
| 3H容量probe、78a326… | N32760の2,012,774,400B、例示N65520の4,025,548,800Bを非zero fill/保持、1ORT attention session＋1Hike Memory、browsercloseで回収 | 数値model graph、実Gemm/SiLU/全stage同時保持、全ORT allocator、全工程peak/時間 |
| native Worker/MessagePort22case、build148a3342… | 既存partial/API/取消/所有権、NOT_READYの維持 | 独立N2 APIをnative RPCへ追加したという主張、全model推論 |

今回追加するのは、N2の共通catalog形式登録packageとpreview、固定source/入場条件/依存prefixの照合試験、実N2経路のMemory容量・named staging/copyを同一phaseで観測する診断である。新規試験の件数・実測・実行sourceは [RESULT.md](RESULT.md) と新receiptへ記録する。

開始時の新規静的確認では、handoffの98assetとmain89source、両sideのprefix36/head54source、artifact/reference/plan/gateのhashが固定bytesと一致した。元N16の登録試験16件を再実行し、previewの再生成一致を確認した。これはモデルの数値再実行とは区別する。

新しい資源計測で同じgateを再利用するのは、入力・source・precisionが元N2と同じためである。新private artifactは新しい全file SHAを持ち、元artifactのSHAを流用しない。hidden bitsが異なる場合は元actual-hidden local oracleをそのまま使わず、その境界の新参照が必要になる。独立prefixを入力とするcomposed参照は別に保持する。

新catalog previewの作成は、外部正本 `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` の更新や管理runtimeの採用を意味しない。旧管理候補・N16候補・新N2候補は別entryで保持する。
