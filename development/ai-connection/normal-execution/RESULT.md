# 通常入口・共通workflow shapeの実装結果

2026-11-02 JST。通常入口を追加し、既存descriptorとownerの実行能力から接続を判断する。独立参照・誤差gate・事前PASS・数値receipt・全中間E4保存は通常要求の条件に含めない。従来の診断入口と受入済みP2／旧N2のscopeを維持する。

## 配布・実行source

branchは `codex/ai-connection-e0-e4`、[Draft PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)。この記録を含む配布commitと、次の実行sourceを区別する。merge・Pages公開は今回実施していない。

| 区分 | 固定sourceと確認scope |
|---|---|
| 通常実行・独立診断の管理source | `4667f46e5961a34c095a394bf6c75156ab9ab9cb`。管理closure17fileを実Git bytesと照合 |
| 取消検証の管理source | `f1dceb971bed7e9c9c16ab0a56d897507318a174`。実Worker生成ACKを待つrunner修正後の固定source。通常実行・診断をこのSHAへ付け替えない |
| Diffusion native source | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`。実53fileをsource inventory／Git bytesで照合 |
| native API／build | `diffusion-models/0.1`／`diffusion-models/0.1+35b5ecdf924b13ccfcd08ec1eeaf840700dfc7c69acd168bbb39e72376542a20` |
| 共通descriptor版 | `works-module-contract/1.0-draft.1`。汎用schemaへWan固有shapeや意味を追加していない |
| 通常実行のowner選択Profile | `wan21-raw-f32-1x16x32`。利用者のProfile指定や管理allowlistから選んだものではない |
| shape規則 | `bernini-ca69274-b5a4321-wan21-shapes-v1`。論理的な導出規則であり、実行受入Profileではない |
| 再利用入力 | VAE配布 `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48` の更新884／Rect raw mean。今回の新規encodeではない |

通常入口のAPIは[API差分](API-DIFF.md)、詳細は[固定API](https://github.com/Kushyameln01/kushyameln-works/blob/4667f46e5961a34c095a394bf6c75156ab9ab9cb/docs/shared/ai-connection/API.md)を参照する。通常descriptorへsource/build/kernel証拠を要求せず、サービスbootstrapが固定sourceを検査し、private native instanceのsession・build・capabilitiesを内部で確認する。meanのVAE hashは出自identityであり、VAE重みロードを意味しない。

## 実装差分

- `workflow-shapes.mjs` をshape導出の一つの正本にした。実供給frame数、元sourceのarea／center resize、参照848上限・16pixelのPython ties-to-even、latent圧縮、patch端paddingのextent、context順・token連結範囲・source_idを導出する。元81frame設定を実供給frame数へ読み替えない。式と[原本の対応](SHAPE-SOURCE.md)を固定した。
- `queryWorkflowRequirements` は既知の要求をownerへ渡す。bindingで省略されたgeometryだけを補い、明示値の矛盾は入力不備として拒否する。未知の入力に依存する範囲だけを保留し、ownerの返答・理由を保持する。数式だけで実行可能にしない。
- `createNormalOperationAdapter` は既存 `evaluateEdge`・queue・snapshotを使用する。ownerのSUPPORTEDと共通契約の適合を分け、`edgeDecision`／`dispatchSupported`を返す。数値比較を通常の準備条件へ混ぜない。
- snapshotへ通常scopeと `EXECUTION_COMPLETED` を追加した。通常は構造・capability・現在性・所有権を確認し、数値coverage／PASSを要求しない。queueが取引全体を直列化するため、prepare内の同じqueueへの子enqueueはない。
- 最初の具体facadeはnative5fのmean normalize／restore。shapeは実 `rawMeanProfiles` を参照し、数値演算・shapeごとのnative validationはownerの既存実装へ委任する。構成変更で支持token／snapshot／旧結果を失効し、解放失敗時はrecoverまで再利用を止める。終了履歴へbinaryを蓄積しない。

## 通常実行と非対応判定

実Chromium154／専用Workerで、実P2入力 `[1,16,1,2,4]`・128 F32を通常normalize→restoreした。native演算2回、両方 `EXECUTION_COMPLETED`。各snapshotは通常scope、validationは空、準備はready。独立参照・gateの取得やE4作成は行わず、`diagnosticState:NOT_REQUESTED` のまま通常結果を返した。元Promise終端・owner解放・結果採用を確認し、実Workerは2生成／2終了／live0だった。

| 同じshape導出から作った要求 | ownerの返答と実行 |
|---|---|
| controlled P2をwired slot0へ供給した要求 `[1,16,1,2,4]` | `SUPPORTED`、共通契約もready。通常実行に使用 |
| 元の目標81frame／480×832のlatent `[1,16,21,60,104]` | `UNSUPPORTED`、`OWNER_SHAPE_UNSUPPORTED`、field path `/artifact/tensor/shape`。native演算はdispatchしない |

このcontrolled例は元sampleの実媒体を受領した証拠ではない。元sampleのsource／画像の実寸法・frame供給はunknownとして保持する。targetの32,760 tokensとcontrolled contextの2 tokensは別に計算され、後者を元workflowの小型代替Profileとして採用していない。

[通常の実行receiptと出力](normal/result.json)を保持した。通常完了を独立数値PASSや本番生成READYへ読み替えない。

## 取消・古い結果・解放

固定f1dceb9の実[取消receipt](cancel/result.json)は `LIFECYCLE_VERIFIED`。Aのnative postと実Worker-created ACK後に対象取消し、`stopConfirmed:true`・`originalTerminal:true`・`resourceReleased:true` を確認した。Aの結果は `INVOCATION_CANCELLED` で不採用。次のBが実際にactiveであるtargetを記録して旧Aを送ると、`TARGET_MISMATCH` で拒否し、Bは `EXECUTION_COMPLETED`／元終端・解放・結果採用trueになった。実Workerは2生成／2終了／live0、browser／source error0。native dispatchはAとBの2回で、成功した演算2回という意味ではない。

最初の4667の取消試験は、起動直後のWorker終了をPlaywrightで観測できず失敗した。[失敗記録](verification/CANCEL-4667-FAILED-ATTEMPT.json)を残し、未取得の件数はnullのままにした。runnerの観測順と非同期control終端待ちだけを修正し、実Worker生成ACK後に取消する境界を新SHAで再検証した。通常の数値経路・管理host・native演算は変更していない。既に成立した4667の通常実行・診断は再計算せず、元のsource／証拠で再利用した。

構成変更による失効、遅延した旧結果の不採用、解放失敗時のquarantine／recoverは、実coreと制御したownerを使う変更境界テストで確認した。これを本番モデルの資源試験として数えない。

## 再利用証拠と新規検証

入力raw meanは1,084B／SHA-256 `8134bc943a60b3f0e0d388048ef0943a5274ef37511ce5630cc40d7596bb26a8`、payload512B。今回の通常出力はnormalized1,137B／`f7b2b158096937648a14a224ca4961543eace129a24ae3b88394a810f6c18840`、restored1,084B／`dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612`。出自context・frame番号・時刻配列も保持した。

通常完了後だけ、既存Python F32参照とownerの既存比較関数を使う別コマンドを実行した。normalized／restoredは各128値が参照payloadとbyte exact、raw→restoredは最大絶対誤差 `2.384185791015625e-7`、元gate `2e-6` 内・失敗0。この診断はnative演算0で通常結果を変更しない。参照・誤差・hashは[診断資料](diagnostic/diagnostic.json)へ分離した。oracle・gate・mappingを新設せず、大型モデルのencode／生成や再exportも行っていない。

全体回帰は[576/576 PASS、FAIL／SKIP 0](verification/ROOT-SUITE.log)。実行中の162 source／API／testfileは同一bytes。新しい負例テストの共有fixture汚染を修正し、取消runnerの追加境界2件を含めて再実行した最終結果である。[既存150fileの148はbyte同一](verification/BASELINE-PRESERVATION.json)、変更はAPI末尾追記とsnapshotの通常branchだけ。既存の診断・queue・cache・package・codec・native pinを一括変更していない。

## 資源と残るshape制限

各mean operationのHike観測はmemory容量1,114,112B、arena1,024B、入力copy512B／出力copy512B、calls1。WASM hash `bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d` をnative loaderが確認した。これは限定operationの容量であり、host／allocator／全工程peakは未測定null。Worker終了の実観測と合算RAMの成立を区別する。

取消CLIの外側経過時間は1,635.267468ms。bootstrap・Chromium起動・取消・B実行・解放を含む計測であり、kernel単体時間やRAM peakではない。[元のprocess記録](cancel/PROCESS.json)を保持した。

native5fが照会時に広告したmean shapeは `[1,16,2,2,2]`、`[1,16,1,2,2]`、`[1,16,1,2,4]`。今回の実通常検証は最後のRectだけ。他の2shapeは広告能力と既存診断scopeを保持し、今回実行したと記録しない。管理側にこの3件を通過条件として転記していない。

このfacadeはmean normalize／restoreを接続する。nativeにEuler能力があっても、このfacadeにまだ通常入力契約がないEuler／他operationを実行可能とは扱わない。VAE／Text／LoRA／P4本体の新しい通常owner facade、任意shape・任意LoRA・81frameの実workflow、本番生成・全体資源予算は未受入。各ownerの数値演算・層mapping・実capability宣言を管理へ重複実装しない。

`generationReady:false`、`load/predict/sample=NOT_READY` を維持する。[再現手順](REPRODUCE.md)には通常実行・取消・独立診断を別コマンドとして記載した。[回帰手順](VERIFY.md)、[独立レビュー](verification/INDEPENDENT-REVIEW.md)、[path／bytes／SHA-256付きhandoff](HANDOFF.json)も保持する。GitHubの送信側再取得照合と、各owner本人の取得ACKは別状態として報告する。
