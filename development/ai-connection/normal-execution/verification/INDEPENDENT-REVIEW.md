# 独立レビュー

2026-11-02 JST。判定: **PROCEED**。今回の受入範囲は、既知Rect shapeの通常normalize／restore、owner理由による非対応判定、対象取消・古い結果の不採用・解放まで。全workflow生成の受入ではない。

## 実行sourceと確認対象

| 対象 | 固定管理source | 確認したreceipt SHA-256 |
| --- | --- | --- |
| 通常normalize→restore | `4667f46e5961a34c095a394bf6c75156ab9ab9cb` | `9d190f9e54f95d5e33139936dabcf9b700fd435188b4ac9c41ab0f51b6c91453` |
| 通常完了後の任意診断 | 同じ `4667f46e5961a34c095a394bf6c75156ab9ab9cb` | `ca0f34e2ddc29f4511870e6f705c97959325ebd720d4e0f522fc09c4c3431b20` |
| 取消・B実行中の旧A拒否 | `f1dceb971bed7e9c9c16ab0a56d897507318a174` | `d20e3eb0ca85f0dafdfc5ee0a373a57dd1a952c8795a4e35f15c2d3a2097916a` |

通常・取消のnativeは `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`。その各receiptのnative53fileと管理17fileを実Git bytesへ独立照合し、全て一致した。実出力WKTの全file hashと、既存codecで読み戻した128 F32のpayload hashも一致した。監査側ではnative演算を再実行していない。

## 確認結果

- 通常2要求は独立参照・gate・事前PASS・数値receipt・E4を入力条件にせず完了した。各snapshotはnormal scope、既存evaluateEdgeのvalidationは空／ready。各stageの実Hike callsは1、実Workerは2生成／2終了／live0。通常networkに診断参照・gateの取得はなく、`diagnosticState:NOT_REQUESTED`を保持した。
- 形状はownerの実capabilitiesから選ばれ、管理独自の3shape許可表はない。controlled RectはSUPPORTED、目標81frameのlatentはowner由来`OWNER_SHAPE_UNSUPPORTED`。元sampleの実媒体はunknownのまま、81frameの演算はdispatchしていない。
- 取消では実Worker生成ACK後にAを取り消し、`INVOCATION_CANCELLED`・元Promise終端・停止確認・解放を確認した。実行中Bのtargetを記録した状態で旧Aを送り、`TARGET_MISMATCH`で拒否。Bは正常完了し、両Workerの実close・live0・disposeを確認した。取消Aで数値kernelが実行済みだったとは推定しない。
- 4667の最初の取消試験はWorker生成／closeの観測不足で失敗した。[失敗記録](CANCEL-4667-FAILED-ATTEMPT.json)を保持し、取消成功やWorker数を補作していない。修正は観測／非同期controlに限定し、通常4667と診断を新sourceの結果へ付け替えていない。
- [任意診断](../diagnostic/diagnostic.json)は通常完了後の別実行でnative演算0。既存Python stage参照と各128 F32がbyte exact、raw→restoredだけ既存gate `2e-6`で最大絶対誤差 `2.384185791015625e-7`。診断を通常dispatchの条件へ戻していない。

差分レビューで、明示geometry／native metadataの上書き、構成変更失敗後の支持応答、過去payloadの履歴保持、B失敗時のpending control待ちを是正確認した。既存evaluateEdge・queue・snapshotを再利用し、通常成功は元取引終端とowner解放の後に返す。source/build/kernelの確認はbootstrapとprivate owner内部で行い、通常callerへ証跡を要求しない。

監査側で関連snapshot33件、workflow bridge5件、host／owner17件、取消観測修正後runner12件を実行して全件PASS。主担当の[最終全体回帰576/576、FAIL／SKIP0](ROOT-SUITE.log)を読み、[実行中不変の162file](SUITE-SOURCE-RECEIPT.json)を現bytesと独立照合した。全体回帰自体を監査側が再実行したものではない。[既存150file中148file不変、API旧prefix保持](BASELINE-PRESERVATION.json)もbaseline Gitと再照合した。

任意shape・任意LoRA、他operationの通常facade、元81frame workflow、本番生成、全工程RAM予算は未受入。Hike容量とWorker解放は全体peakの証明ではなく、未測定peakはnull。`generationReady:false`、`load/predict/sample=NOT_READY`を維持する。GitHubでの送信側再取得と各owner本人の取得ACKも別状態である。
