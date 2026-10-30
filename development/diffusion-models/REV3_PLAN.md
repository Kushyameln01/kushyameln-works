# 明示確認と部分実装の続行計画

根拠: 添付計画v1.1の「Codexが進める5工程」2〜5、「共通のデータ契約と状態管理」、ユーザー最新指示「全体についての推論は行わず、確認については計画書を参照し、そのうえで明示されている確認内容を確認してください。そのうえで、実装をすすめてください。」

全体を推測で完成認定しない。今回の動的確認は小さい境界・原本由来の部分演算・状態管理に限定し、モデル全体のpredict/sampleや生成は実行しない。この限定を最終製品の恒久的な範囲縮小とはしない。

## 確認後に実装する単位

1. TE/VAE: 公開固定commit d2e9e3cba6269464bf556acc73c0b97030f75b5fを取得。独立module、JS/MessagePort、Hike担当source/WASM/既存実行記録を照合する。既存コードを変更せず取り込む。実tensorの意味・shape・モデルを対向仕様から検査する。
2. Hike→ORT→Hike: 実Q射影16×5120の部分演算を、HikeのFP8復号+scale、ORT Web1.24.3 WASMのGemm(no bias)、Hikeのbias加算に分ける。ORT numThreads1/proxyfalse/providerwasmを明示。原本由来tileと合成activationを使い、元GPUprecision/モデル全体の成功に拡張しない。比較前の許容誤差 abs1e-4+rel1e-5。Node/実Chromiumで全32出力・hash・copy・session解放を確認する。
3. scheduler: 固定ComfyUIのsimple6/shift5/1000timesteps、SplitSigmas3とCONSTのnoise scaling/inverseをHikeで実装する。noiseは明示tensorを受け、RNGを新設しない。HIGH/LOW間のraw/normalized空間変換は無断省略しない。
4. tensor保存/読戻し: 相手の既存.wktensorを再利用し、BLC conditioning・NCTHW raw latent・hash・mask・所有権を保持する。異なる意味/shape/modelは拒否。保存物の全bytesを読戻して一致検査する。相手の検証済みVAE小profileを動画全shapeへ一般化しない。
5. 接続と継続: 以上の実装を薄い独立APIへ追加する。バイナリ所有権、失敗・取消・旧返信・disposalを確認する。全体推論のNOT_READYは根拠なしに解除しない。

## 実行上の約束

- sourceはcodex/diffusion-models隔離worktreeで変更する。モデル原本・他担当内部・公開台帳・公開サイトを変更しない。
- 異なる担当scope: scheduler/、tensor-interop.mjsとinterop試験、ort-bridge/kernel/とhike.mjs、rootのort-bridge実行部/API統合。
- 数学的処理はHike/ORT実WASM。JSの隠れた数値fallback・WebGPU代行なし。
- 意味と独立期待値から先に試験し、未実装の失敗→実装→合格を記録する。
- 小さな接続成功と、実model変換/元precision/全体生成/負荷目標を分けて報告する。

## 判定記録

作業ごとの結果とsource/hashはREV3_RESULT.mdへまとめる。以前の7ea64f6の成立範囲を再利用し、新しく変えたsource/生成物に関係する試験だけを再確認する。

実装中の担当境界確認: raw/normalized変換を包括UIに転嫁しないため、固定Wan21 sourceに基づくHike posterior-mean正規化/復元を明示APIとして追加する。保存形式は変更せず、versioned meaningで状態を保持する。全体sample推論は含めない。
