# G1C mappingとV1 F=1 profile一件の受入

2026-10-31 JST。総合仕様 **1.1-draft.1**（SHA `0744a98219c6ddab4880773029e6318de3e770c8e14e1bb2edbb1bf25c1c3944`）、実装計画 **0.1-draft.1**（SHA `770d1cdc26c07548cbe12b33cba93d3f22ab3b565ff58b0ba978f3983ff9c64d`）の添付本文を取得した。本結果の範囲はG1Cの無損失対応表と、VAE単体のF=1診断profile一件。管理M1/M3/M5やDiffusion本体、V2の完成ではない。

**選択した `wan21-raw-f32-1x16x16` は、fresh export・元VAE FP32参照・実ChromiumのHike/ORT WASM・保存回収・取消/終了を受入済み。** 元workflowの実slot/reference、非正方形、81frameは未受入のまま保持する。

## 対象、正本、寸法

| 項目 | 確定した値 |
| --- | --- |
| native API | `works-ai-1`。自担当の実行sourceは [`6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095`](https://github.com/Kushyameln01/kushyameln-works/tree/6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095)。native API/codec/kernel/vendor/exporter本体は今回変更していない |
| G1C基点 | [`502b243d092b84979b10b1624df60612047d640a`](https://github.com/Kushyameln01/kushyameln-works/commit/502b243d092b84979b10b1624df60612047d640a)。既存12fixtureを維持。着手時のremote mainは`029ce9336a61e53bc6172fa4a7b7189b15f2efa0` |
| 元VAE | Wan2.1、SHA-256 `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`、194 keys strict load、missing/unexpectedなし |
| 元source | [Wan-Video/Wan2.1 `9737cba9c1c3c4d04b33fcad41c111989865d315`](https://github.com/Wan-Video/Wan2.1/blob/9737cba9c1c3c4d04b33fcad41c111989865d315/wan/modules/vae.py)、source SHA `4912ffd7a9fbb17ceef9a17d4a9c4b8aee36ec37c32594f54e57693b29909498` |
| 実際に選択した媒体 | 既存`png-fixtures/frame-000.png`、opaque RGB8、16×16、623 B、SHA `0dcfaf393c24895f31d6e689157725b07cf86e2fea34396ccfaeb1caef0f21f5`。元からある**合成診断画像**で、workflowの実slot画像ではない |
| 入力の役割・寸法 | F=1の最初の時間分岐を検証する単一静止画。元画像H/W=16/16。既存Bernini長辺式はscale=1、丸め後も16/16。画像自体のresize・crop・padding・frame削減を実行していない |
| 固定shape | RGB float32 NCTHW **`[1,3,1,16,16]`**（768値、3,072 B）⇔ latent **`[1,16,1,2,2]`**（64値、256 B）。N=1、F=4n+1、H/W≥16の16倍数を維持 |
| precision/runtime | 保存BF16値を維持してFP32展開。opset17、ORT Web1.24.3 WASM・1 thread・graph optimization disabled。元BF16/GPU演算との同等性は未判定 |
| Hike | kernel SHA `9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8`。PNG encodeの値域変換1呼出し、decodeの実conv2 MatMul＋bias17呼出し。値は実出力へ寄与する |

入力選択の根拠は既存PROFILESと添付計画V1の「診断用小profileを追加しても元動画を置換しない」という区別。`132123.mp4`、実slot画像などはこの環境で寸法を取得できず、それらに依存するprofileだけを保留した。前処理式の根拠は既存PROFILESに固定されたBerniniStudio `ca69274a2d2135052489bc0c67a2d79a64225e86`を再利用した。

## exportと資材の識別

新しい非公開出力先は `/workspace/work/inference/vae-v1-f1/bundle/`。元5-frame bundleは上書きしていない。以下のONNX二つを実際にexportし、checker・input shape・元モデル参照・実SDK出力shapeで照合した。

| 資材 | bytes | SHA-256 |
| --- | ---: | --- |
| `encode.onnx` | 212,362,391 | `193cebca40fa62412e672e64a126898a42ba0450154dd5bbb87d29fcd8aaafae` |
| `decoder-body.onnx` | 286,313,363 | `c6c4457e538c6f613d2b3a73d97d90525bdc872b4d310dda125712e1f42b55cf` |
| `conv2-weight.f32` | 1,024 | `9ce97eaf137ab64ae409384b6f6177a7b07e593faf103e7e986c0c99d0a1316f` |
| `conv2-bias.f32` | 64 | `1a79fbc83c80584e46d5683d49df3482b575ffb4aca99c843a0e8a2aef9df9cd` |
| `manifest.json` | receiptに記録 | `fa219b8e7e0b6b0be37c598d3dfedadb29505ad1407fe3f8270d8655dd46828c` |

ONNXの重みはinitializerへ埋め込みで、ONNX external-dataファイルは0件。別資材のconv2 F32重み/biasも上表で識別する。graphと必要資材の合計は498,676,842 B。model/source/manifest/全asset hashは[receipt.json](receipt.json)と[reference-report.json](reference-report.json)に保持する。

legacy exporterのONNX **入力**は固定値、output型metadataは一部symbolicのまま残る。ONNX shape inferenceでも解消しなかったため、graph bytesやoutput宣言を手直しせず、元PyTorch出力と実SDKの**全runtime出力寸法**を固定shapeと照合した。このsymbolic metadataを任意shape対応と扱わない。manifestだけのshape変更は行っていない。

export前の[acceptance-plan.json](acceptance-plan.json)で、全値に対する`atol=2e-5, rtol=2e-5, maxAbs=2e-5`を固定した。immutableなexport時manifestには旧診断既定0.002が残るが、今回の判定には外側planの厳しいgateを使った。manifestのexport時「browser確認待ち」を事後書換えず、今回の受入結果を独立receiptとして結び付ける。

## 受取・返却・保存の境界

[G1C-MAPPING.md](../connection/G1C-MAPPING.md)がnativeから総合仕様への対応表である。Textのplain `[1,512,4096]`とID `[1,L,4096]`、mask、model/Tokenizer、producer配列、decoder binding、contextのframe/時刻配列と順序・重複、evidenceを保持する。管理独自fieldをstrictなnative context/latentContractへ追加しない。

V1では`configure({manifest,files})`後に、不透明PNGを実UIから入力し、`rgb-unit`→Hike→raw mean、保存meanの再入力→Hike conv2/ORT→raw RGBを確認した。API試験では同じPNGのNCTHW単精度値とcontext `[0]`/時刻`[0]`を渡し、返却・codec読戻しで保持した。latent Tと元frame列の1対1対応は新設していない。

`.wktensor`はdtype/shape/layout/meaning/model/mask/payload hashとG1C追加のTokenizer/context/latentContractを保存する。**evidence・snapshot・owner・graph/build・traceは外側保存**とする。今回の[artifact-index.json](artifact-index.json)は保存したnativeファイル全体SHAとpayload SHA、入力PNGまたは入力meanの全体SHA、返却evidenceとbundle識別を対応付ける診断記録であり、M5の共通package実装ではない。生成decodeでは入力sampleのファイル・producer/latentContract・evidenceをRGBと一緒に外側へ保持する必要があるが、実sampleによるその受入はV2へ残す。

## 数値比較・回収・終了

Chromium **154.0.8037.57**で全5 phaseが合格。actual model filesをlocal File入力し、source/runtime配信はlocalhostへのGET76件だけ、page/console/HTTP error・request failureは0件だった。[acceptance-results.json](acceptance-results.json)に全件記録する。

| 検査 | 全比較値数 | 最大絶対誤差 | 結果 |
| --- | ---: | ---: | --- |
| PNG→mean、実UI保存回収 | 64 | 8.344650268554688e-7 | 2e-5 gate合格 |
| 保存mean→decode、実UI保存回収 | 768 | 7.152557373046875e-7 | 2e-5 gate合格 |
| 取消後API再実行、context付き保存読戻し | 64 | 8.344650268554688e-7 | 入力保持・全data/context読戻し一致 |
| F=1 synthetic encode参照 | 64 | 7.748603820800781e-7 | 全runtime shape・全出力合格 |
| F=1 synthetic raw decode参照 | 768 | 4.470348358154297e-7 | 全runtime shape・全出力合格 |
| 既存5-frame encode回帰 | 128 | 1.6689300537109375e-6 | 元gate・元bundleで合格 |
| 既存5-frame decode回帰 | 3,840 | 8.046627044677734e-7 | 元gate・元bundleで合格 |

UIのmean/RGBとAPI recoveryを実バイナリdownloadして回収し、header・全file SHA・payload SHA・全要素を照合した。meanは実UIで読戻してdecodeへ投入した。busy拒否、実run進捗時のWorker取消、旧job失効、次の実推論成功、dispose後拒否を確認した。

実ORTへ委譲する計測wrapperでは、F=1で3 session作成/3 release、元5-frameも3/3でactive=0。各々、正常encode/decodeと、実session.run後のAbortErrorを含む。模擬ORTの数値ではない。計6 Workerを作成/終了しlive=0、Hike dispose後の再利用も拒否した。

## 資源と時間

| 工程 | 実測時間 | メモリ実測 |
| --- | ---: | --- |
| fresh export | 全process 18.350 s、export内11.942 s | child最大RSS 1,687,416,832 B |
| 元FP32 PNG encode＋mean decode | 推論0.546 s | 参照/graph確認process最大RSS 2,454,687,744 B |
| 実UI PNG encode | load721.2 ms、推論260.1 ms、SDK全体1532.7 ms、操作/回収1.936 s | browser tree sampled PSS最大1,112,174,592 B（1060.65 MiB） |
| 実UI mean decode | load884.6 ms、推論280.0 ms、SDK全体1897.8 ms、操作/回収2.186 s | sampled PSS最大1,323,973,632 B（1262.64 MiB） |
| F=1 session計測・abort | 4.190 s | sampled PSS最大1,953,390,592 B |
| 元5-frame回帰・abort | 8.293 s | sampled PSS最大1,988,632,576 B |
| browser受入全体 | 21.045 s | 順次工程であり各phaseのpeakを合算しない |

[resource-measurements.json](resource-measurements.json)はbrowser processと観測子processの約100ms間隔のPSS/RSSを保持する。PSSは比例配分、RSS合計は共有ページを二重計上する。どちらも厳密な瞬間peakや端末全RAMではなく、Python/export/参照processを含めない。単一tensor容量とも区別する。

browser close後、生存する観測processは0。**zombie PIDが2件残り、全PID消失は確認していない**。OSの即時回収やGCを保証しない。利用端末の負荷低減・高速化は本結果から主張しない。

## 残るprofileと担当間の確認

- F=1 **16×16診断一件だけ**を新たに受入。非正方形、実slot/reference、元動画81×480×832、生成sample最終decodeは未受入。寸法不明媒体を推測しない。既存PROFILESを再棚卸し・書換えしていない。
- Diffusionへ：このF=1 latentは64要素。現mean変換の固定128要素profileとは別であり、そのまま接続済みとしない。実generated sampleのproducer/復元・正規化状態・対象VAE/profile・前後payloadと変換buildの照合はV2で行う。復元の数値処理はDiffusion所有で、VAEに追加していない。
- 管理へ：native情報を外側ArtifactDescriptorへ非破壊に対応付け、evidence・snapshot・owner・profile/graph/build・traceをnativeファイル全体hashへ結ぶ。共通semantic登録、package canonical/required規則、対象取消のcompare-current、横断queueは管理側の工程。nativeの版やstrict keyを変えない。
- 接続12fixtureは変更せず12/12合格、全体Python53/53合格、syntaxとDiffusion receipt整合も合格。旧52/53の基点由来LoRA台帳不整合は元記録のまま保持する。件数を実モデル受入や全生成へ合算しない。

独立レビューは重要な未解決指摘なし。product code・モデル原本・既存bundleを変更せず、試験harnessと文書/計測証拠を追加した。モデルbundleの公開、mainへの統合、Pages配信更新、Diffusionモデル推論は実行していない。
