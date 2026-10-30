# Text Encoder / VAE 接続契約の調整

2026-10-31 JST。原要求は今回のユーザー指示1〜5。着手前ローカル `d2e9e3cba6269464bf556acc73c0b97030f75b5f` と最新main `a33b311e45a75a6c683242286fef608c7b3770a9` を照合した。追加5commitはDiffusionModelsとLoRA。既存Text/VAE中核は変わっていない。作業基点は後者、ブランチは `codex/inference-connection-contract`。

## 保持条件と範囲

- `works-ai-1`、既存の独立factory・MessagePort envelope・raw mean経路・`WKTSR001` schemaVersion1を維持する。
- 最新Diffusion protocolは `diffusion-models/0.1`。`predict/sample` はNOT_READY、数値mean bridgeは128要素の固定profileのみである。接続契約と実モデル接続の完了を区別する。
- 管理側は工程・横断直列化・待機列・slot/frame対応・context順序・正負共有を担当する。正規化や復元を管理側/VAE側に複製しない。
- 832×480×81frameや参照媒体のprofileは棚卸し・受入条件まで。無断の縮小、padding、frame削減、export、重い全工程推論、公開、pushは行わない。

## 変更前に定めた契約

| 項目 | 調整内容と根拠 | 未検証境界 |
| --- | --- | --- |
| Text | model hashと埋込Tokenizer hashを出力・保存へ保持。textと明示ID/maskのモードを区別し、無断prompt処理を追加しない | 通常テキストだけでBernini/Comfy conditioning全体を再現しない |
| 生成sample | `wan21-raw-generated-sample:v1`。`latentContract` でraw空間、対象VAE hash、生成側model hash配列、Diffusion所有の復元済み状態を表す。meanへ改名しない | schema受入は本物の生成/復元の実行証拠ではない。実sample producerはNOT_READY |
| 正規化 | `wan21-comfy-f32-v1` のchannel別変換はDiffusionが担当。VAEはraw入力に対して再適用しない | 現在のmean用128要素カーネルを生成sampleや大shapeへ流用済みとしない |
| 対応情報 | 任意のcontextに `contextId/inputId/inputSha256/slotId/sourceFrameIndices` と任意の時刻列を保存。VAEはコピーして返す | 元媒体hashは管理側が照合する。latent各時間位置と元frameの1対1対応を発明しない |
| 保存 | 既存codecへ任意の `tokenizerSha256/context/latentContract` を追加。旧フィールドだけのファイルは同じ形式で読める。非同期hash前にmetadataもsnapshotする | SHAはpayloadの整合検査で、宣言metadataの真正性や数値空間の証明ではない |
| Diffusion build | codecが既存BUILD_SOURCESに含まれるためBUILD_IDを再計算。元builderはcheckoutに欠落しており、同じ記録済み集約式を使う新規再現scriptを用意し、そのsource hashも登録 | 元builderを回収した・元compiler/kernelを再buildしたとは報告しない |

`latentContract` v1は `{schemaVersion:1,representation:'generated-sample',space:'raw',vaeModelSha256,producerModelSha256s,normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}}`。producerリストは重複のない非空SHA列。任意の既存 `tensor.modelSha256` は生成側の値を保持しリストと照合する。対象VAE hashをproducerへ付け替えない。モデル識別の宣言だけで実モデル互換性を認定しない。

`context` v1は `{schemaVersion:1,contextId,inputId,inputSha256,slotId,sourceFrameIndices,sourceFrameTimesSeconds?}`。frameの並び・重複・選択は入力をそのまま保持し、時刻列があれば同数とする。context順序・positive/negative共有の情報は管理job manifest側に持つ。

## 作業と確認

- [x] Text入力/出力の識別、metadataの保存snapshot、raw sampleとmeanの区別について小規模失敗fixtureを作る。
- [x] 共通codec・Text API/Worker・VAE validator/APIへ追加契約を実装し、小規模fixtureを通す。
- [x] profile棚卸しと、双方APIの同じ契約、管理側情報・所有権・失敗・取消・configure手順を記載する。
- [x] Diffusion build receiptを新scriptで更新し、元mean用Hikeの小fixtureと既存API検査で維持を確認する。
- [x] 独立レビュー、関連検査、公開exportの静的検査を実施。公開や実モデル全工程は実施しない。

profilesは `PROFILES.md`、Diffusion側調査は `DIFFUSION-CONTRACT.md`。実行後の変更・PASS/FAIL/UNVERIFIEDは `RESULT.md` に追記する。
