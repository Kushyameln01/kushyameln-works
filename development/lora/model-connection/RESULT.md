# LoRAと管理・Diffusion F32 sourceの接続結果

LoRA ownerの正本adapter、管理の通常取引から実Diffusion completed-sourceへ完成F32を渡す経路、native model constructorへのsource/lease接続を実装した。単体SDKの算術は変更していない。実base試験はLOWの限定領域によるPARTIAL。公開Worker/samplerへの採用が残るため、**全体接続実装完了は宣言しない。実験用LoRA原本は送付していない。**

[API](../../../docs/shared/inference/lora/DIFFUSION-MODEL-CONNECTION.md)／[受渡し・残件](HANDOFF.md)／[再現](REPRODUCE.md)／[実行source](EXECUTION-SOURCES.json)／[配布path・bytes・SHA-256](FILES.json)。配布commitはこの文書を含む固定GitHub URLのcommitであり、実行sourceと区別する。

## 使用版・変更

| 用途 | 完全commit SHA |
| --- | --- |
| 実装・Node全265件 C1 | `168a1e2fde2b643cc662514da288a7fd67ab2213` |
| 成功browser・archive再現 C2 | `cfdea995f7f316786ed32a885b10478f66906a23` |
| 管理実adapter | `e1661e561dfb1a4f20544ff48bc375175b5981d1` |
| Diffusion実source/constructor | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` |
| 変更前の単体配布 | `6d0c8df4cd4992f26745d2d26394f5e194d2567f` |

C1は `diffusion-model-registry.mjs`、`diffusion-model-adapter.mjs`、`diffusion-model-session.mjs`、API、試験、再現用生成物を追加した。C2はharnessのfavicon専用204応答だけの修正で、SDK・adapter・算術・assertionはC1と同一。最終配布は結果と証拠の追加。[既存18実装ファイルの不変証拠](verification/UNCHANGED-STANDALONE-SOURCE.json)を参照。

## 成立範囲

| 対象 | 結果と限界 |
| --- | --- |
| 単体SDK | 既存成立範囲を維持。ローカル選択File、片組/二組、強度変更、再適用、片組除去、不変base復帰、stream/owned packageを再利用 |
| 全mapping | 棚卸し済み4source・2,904 logical patchすべてに対応。原本再取得/全patch再計算は行わない |
| binding | native全1095のうち406 matrix runtime-input・647 vector hike-parameterがeligible。残り42はbase pass-through。initializer/暗黙転置/不明dtype・FP8規約を拒否 |
| 管理部分接続 | 実createLoraManagementSide→通常SDK/Hike→新consumer→実createCompletedModelWeightSource。File、取引、取消/復帰、保存/fresh openを確認 |
| 実F32 port | 元shape/座標を維持し選択範囲を最終F32で置換、選択外はbase。native上限へ分割し、再加算/再scaleを避ける |
| native constructor | 固定実createBerniniModelCandidate({source,...})の制御試験PASS。math/opsはNNを呼ぶと失敗する検証hostであり、NN推論の証拠ではない |
| 実base数値 | 実LOW File＋生成rank1 LoRA File。Q full[5120,5120]の行[1,3)・全列、選択時のQ bias[1,3)。その他は除外しPARTIAL維持 |
| 全体 | 公開Worker/sampler採用、実験原本の全target適用、HIGH/LOW共同運用、81frame、VAE decode、製品保存、生成READYは未受入 |

[全対応表](BINDINGS.json.gz)・[hash receipt](BINDINGS-RECEIPT.json)：lightは各side1,052patch、detail各400。未対応source patch0。HIGHは固定key/shape/operator実装の対応までで、今回HIGH実baseは読み込んでいない。FULL_LOGICAL_BINDINGは到達性を意味し、全NN適用済みではない。registry適合は学習base同一性を証明しない。

## 再利用証拠

- 算術R1 `4a3419c768e2b4b38b081314abe2cfaaeed6b14b`：全2,904patch・18ケース・255,748,547,328要素、gate違反0。独立非zero dyadic baseの単体算術であり、今回の実base適用と分ける。
- 制御R2 `986b66b3dd54ef26d98f99a1db92a2933f3e31aa`：12stream、170,971,034,240要素をR1実F32 hashへ照合、除去後base472,002,688要素比較。原本識別/全体hashの有効な証拠を維持。
- 既存241ケースは新規24と合わせ回帰した。全2,904patchの大規模算術は再実行していない。

## 新規検証

1. [全回帰](verification/FULL-REGRESSION.log)：265/265 PASS、fail/cancel/skip0。新規はadapter13・session8・管理3。版/loader/shape/block/有限F32/宣言範囲/現在性、旧rollback、再入時取消/epoch、lease、dispose失敗を確認。
2. [配布archiveの再現](verification/CLEAN-ARCHIVE-REPRODUCTION.log)：owner91ファイルをbytes/Git blob/SHA-256照合し空directoryへ展開、新規24/24 PASS。同じ機能の再現であり、新たな24機能として数えない。
3. [ブラウザ](verification/BROWSER-SUMMARY.json)：Chromium154.0.8037.57、13ケースPASS。light0/+1/-1、detail+/-1、両組/順序反転/再適用/各組除去/base、取消/読取失敗後復帰、OPFS保存/fresh page・SDK読戻し/stage。両組ケースのbias除外も選択範囲として記録。
4. [独立参照](verification/BROWSER-INDEPENDENT.json)：raw E4M3FN/F16独立復号＋NumPy F32のrank/alpha/strength/bias演算へ317,500要素比較。weight gate=1e-5+1e-4*abs(reference)、bias gate=0、違反0・最大絶対差0。適用範囲10,240weight/2biasに対して各20,480weight/4biasを読み選択外も比較。base復号・creator解放後viewの重複比較を要素数に含む。
5. [実行source](verification/BROWSER-SOURCE-RECEIPT.json)：実HTTP取得50ファイル（LoRA12・Diffusion12・管理26）を固定commitのbytes/SHA-256へ照合。送信側の確認であり、別担当本人の取得ACKではない。

C1のbrowser初回は処理後favicon404で総合FAIL。C2ではその応答のみ修正し別試行でPASSした。[試行区別](verification/BROWSER-ATTEMPTS.json)を残し、失敗試行を成功回数へ加えない。独立参照は開発検証だけで、通常SDKはexpected/gateを要求しない。

## 資源・未受入

[資源実測](verification/RESOURCES.json)：LoRA WASM33,554,432bytes、workspace high-water122,880bytes。creator解放後も保持viewがlease1で読め、最後にlease/candidate/in-flight/pending-release/cache残量0・WASM memory0・source disposed。cache上限1,048,576bytes、package block上限1,048,576要素、native81,920要素/16行以下（FFN-down5行）。全process peak RAMは未測定。

実LOW Fileは15,574,833,216bytes。全体をRAMへ読み込まず、source storage readはproducer837,740bytes・fresh264,156bytes。全体hash再計算なし。保存した検証sourceは61,892bytes。配布archiveに実model/LoRA原本や実base配列は含めない。

SDK localRevision・管理managerRevision・native epochは別ID。prepared解放後もactive/captureが独立capabilityを保持し、sessionは取消/予測終端/native dispose後にcaptureをreleaseする。固定native constructorの準備/cleanup二重失敗にretry handleがない場合はlease隔離・未確認cleanupを明示する。公開経路採用とowner回復capabilityは [HANDOFF.md](HANDOFF.md) に残す。

Draft PR [#2](https://github.com/Kushyameln01/kushyameln-works/pull/2)、branch `feat/lora-hike`。merge・Pages公開・原本送付・全体運用実験は未実施。
