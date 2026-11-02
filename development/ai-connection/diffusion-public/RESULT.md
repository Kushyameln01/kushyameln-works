# LoRAなしbase Diffusion公開APIの管理接続

実装、制御試験、実資材保持環境用runnerを固定した。**管理経由の実モデル1-thread／no-COI sampleは未実行・未受入**。本環境に実HIGH／LOW pairと保存済みN5入力manifestがないため、実NNの取消→reload、生成結果の保存・読戻しも受入を保留する。以下の制御試験や既存4-thread数値証拠で代替していない。

## 固定sourceと取得確認

| 役割 | 完全SHA／契約 |
| --- | --- |
| 今回の管理実行source | `296c18d5f2c878fa42bbb198a706991fc901065f` |
| 直前の管理配布（旧mean／P4／LoRAを維持） | `76d813cd48930767caa3e4cf8e797996cc5b6798` |
| 採用Diffusion配布 | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` |
| native protocol | `diffusion-models/0.1` |
| native build | `diffusion-models/0.1+9c5d8d18e9a7b046d7768c8c32ca6a48eaa084c900e916d59d63e735ebeb2a20` |
| 管理branch／Draft PR | `codex/ai-connection-e0-e4`／[PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7) |

この文書・検証記録を収録する配布commitは、実行sourceとは別commit。配布の完全SHAはPRのheadと納品報告に記載する。自己のcommit SHAを本文へ再帰的に埋め込まない。

着手前に固定Diffusionの[MODEL_RUNTIME.md](https://github.com/Kushyameln01/kushyameln-works/blob/ffeeeedb6b57d182a977c3ac02c042ce235fc87a/docs/shared/diffusion-models/api/MODEL_RUNTIME.md)、[API README](https://github.com/Kushyameln01/kushyameln-works/blob/ffeeeedb6b57d182a977c3ac02c042ce235fc87a/docs/shared/diffusion-models/api/README.md)、[API.md](https://github.com/Kushyameln01/kushyameln-works/blob/ffeeeedb6b57d182a977c3ac02c042ce235fc87a/docs/shared/diffusion-models/API.md)、public-workerのCONTRACT／README／RESULTの本文を取得した。各path・bytes・SHA-256は[DOCUMENT-RECEIVED.json](verification/DOCUMENT-RECEIVED.json)。

nativeは元の相対treeを保って`docs/shared/ai-connection/native/diffusion-ffeeeedb/`へ採用した。144のowner build source、build-info、license、固定runner補助3件、CONTRACTの計150ファイル／14,330,041Bを照合した。[SOURCE.json](../../../docs/shared/ai-connection/native/diffusion-ffeeeedb/SOURCE.json)のSHA-256は`5df689d94e1eba9bcf326480caae5a77ff8e0d231b46ce8a6ae53683b0defa1d`。Worker、ORT、Hike、WASMとshared tensor等の相対参照を維持している。

管理実行sourceの新規164ファイルのbytes・hashは[SOURCE-FREEZE.json](verification/SOURCE-FREEZE.json)。既存mean／P4／LoRAのsource・pinは変更していない。nativeの既存EOF空行を含め、owner bytesを改変していない。GitHub固定sourceから管理API、adapter、bootstrap、runner、native Worker等7ファイルを再取得し、ローカル固定bytesと一致させた：[REMOTE-ACQUISITION.json](verification/REMOTE-ACQUISITION.json)。これはコード取得の確認であり、実モデルの取得や別担当者からのACKではない。

## API差分と担当境界

[固定API説明](https://github.com/Kushyameln01/kushyameln-works/blob/296c18d5f2c878fa42bbb198a706991fc901065f/development/ai-connection/diffusion-public/API.md)の新しい`createDiffusionPublicManagement()`が、実`createDiffusionModels({sessionId})`を呼ぶ。通常利用でAPI注入は不要。テスト用`api`注入を使った結果は`controlTestDouble:true`として区別する。

| 接続した操作 | 管理の扱い／今回実体で確認した範囲 |
| --- | --- |
| `load` | HIGH／LOW File pairと明示resourceをownerへ渡す。実Workerへの1-thread受付、無効pairの準備失敗・Worker廃棄を確認。実pairの正常loadは未確認。 |
| `modelStatus` | モデルsession／epoch、loaded、cleanup状態を保持。実Workerで確認。 |
| `unload`／`dispose` | モデル資源とAPI ownerを終了。実Workerのcloseをbrowser終了前に確認。実pairの資源解放は未確認。 |
| `predict`／`sample` | ownerの`{tensor,execution}`を既存`evaluateEdge`、通常snapshot、owned artifactへ接続。制御doubleで成功・進捗・失敗・取消・旧結果拒否を確認。実モデルの完走は未確認。 |
| `saveTensor`／`readTensor` | 実native codec→download→実disk File再選択→読戻し。合成128値のfixtureでbit一致。実生成結果については未確認。 |

既存queue、接続判定、snapshot、artifact保存・復旧を利用する。重み復号、NN、scheduler、shape演算、LoRA mappingを管理へ追加していない。通常入力へ独立参照、gate、過去PASS／receipt、固定payload hashを要求しない。

`sample`の意味はownerが返す`wan21-raw-generated-sample:v1`。`latentContract`のgenerated-sample／raw、producer・VAE識別、restored状態をそのまま保持し、posterior meanへの改名や追加復元を行わない。実行証拠はnative tensorへ混入せず、snapshot・executionのsidecarとして保持する。

対応判定は`modelRuntime.operationsImplemented`、実load状態、cleanup、対象入力契約を使う。旧`modelInference:false`だけで拒否しない。`load/predict/sample`の表示は実capabilityに応じて`IMPLEMENTED`／`NOT_IMPLEMENTED`となる。これは数値受入や原寸対応の認定ではない。`generationReady:false`、`originalWorkflowAccepted:false`、`acceptedProduction:false`を維持する。

## session・取消・解放

- 管理request／revision／resource generation、公開API session／job／inputRevision、モデルsession／epochを別々に記録・照合する。Worker交換時にnative epochが再開しても、modelSessionIdと管理modelGenerationで旧実体を識別する。
- 正常なrequest終端はrequest資源を解放し、健康なモデルpairは次のrequestへ保持する。`unload`／`dispose`によるpair解放とは分ける。
- active native対象の取消でWorkerが終了した場合はモデルsessionを失効させ、`reloadRequired:true`とする。旧結果・古いprogressを採用せず、元Promiseの終端barrierを待つ。再試行は`load`から。既にnativeが正常終端し`NOT_RUNNING`を返した遅い取消では、その事実を区別し、健康なpairを架空に失効させない。
- 準備失敗後にWorkerが廃棄された状態は`reloadRequired:true/cleanupRequired:false`。資源を保持した失敗は`cleanupRequired:true`とし、`unload`の成功までload／推論を止める。無効な通常入力だけで健康なpairを破棄しない。
- 進捗callbackや先行subscriberが取消した後、後続subscriberへ古いprogressを配らない。独立レビューの指摘を修正し、負例で確認した。

## 今回の新規検証

| 検証 | 結果とscope |
| --- | --- |
| 新規Node | **19/19 PASS**。adapter17＋native採用2。queue、authority、正常／失敗／cleanup、取消barrier、遅延結果、snapshot／artifact、capability、明示thread条件。成功推論を返す注入APIは制御double。 |
| 既存を含む回帰 | **739/739 PASS**。従来720＋今回19。既存分を新SDK／実NN接続試験として数え直さない。 |
| 実公開factory／WorkerのChromium CONTROL | **11/11 PASS**。Chromium154.0.8037.57、COI:false／SAB:false。実NNなし。全163 source（native150）の固定bytes一致。 |
| CONTROL取消・解放 | 実`modelStatus`対象のhard cancel、未load再試行拒否、無効pair準備失敗・廃棄、fresh Worker、unload／dispose。5 Workerすべてbrowser終了前にclose。実NN中の取消ではない。 |
| CONTROL保存・読戻し | 合成128 F32／512B payload→1,179B nativeファイル→download／disk File→native read。全bit、負のゼロ、metadata、LC、artifactを保持。fixtureのproducer hashは保存試験用宣言であり、実NN来歴ではない。 |
| 保持runner source preflight | 固定260 sourceの前後一致。exit2／**BLOCKED**：N5 manifest、HIGH、LOWが欠如。browser／NN未起動。 |
| runner observer idle | COOP／COEPなし・ありの2環境でwindow／WorkerのCOI・SABが実headersに一致。各227 GET／164 source照合、各Worker closeを確認。`modelStatus/unload/dispose`のみ。thread演算・WASMメモリ・NN成功の証拠にはしない。 |
| 独立レビュー | progress取消のP2を修正後、重大・重要の未解決指摘なし。実NN未検証というscopeを維持。 |

ログ・未加工result・固定source receiptは[verification](verification/)。CONTROL resultのSHA-256は`61ea12448a524dd4eb4995b87a0f15755d7852f6353d661f22c3cf311fd0276e`。全配布ファイルのbytes・SHA-256は[HANDOFF.json](HANDOFF.json)。

新規資源観測はCONTROLの5 Worker作成／5 close、COI・SAB、idle observerに限る。CONTROL browser所要約3.33秒はNN時間ではない。実モデル1-threadの所要時間、ORT実測、RSS/PSS、総peak RAMは**未測定**。idleのWASM観測0Bは、モデル未loadの結果である。

## 再利用した証拠

Diffusion ownerの既存数値証拠はN5／実L512、LoRAなし、F32、Euler／simple6／shift5／split3、CFG1、**4-thread＋COI**の元scopeで再利用する。管理1-thread実行の証拠にはしない。

| owner実行source | 再利用範囲 |
| --- | --- |
| `7cf77c21889d9642e61d9a41d3242a816e24d6be` | HIGH predictの128値、失敗0、最大絶対誤差`2.7418136597e-6`。 |
| `0f761f374dce1d447bbb912ad13c08f9bf85c279` | HIGH3／LOW3・240block sample、最終raw128値、失敗0、最大絶対誤差`7.62939453125e-6`。全中間比較ではない。旧実file保存・bit一致もこのsourceの範囲。 |
| `6d12140eeab204385fa31f5da73d4796968a4003` | failed-pair／prefix／codecの後続回復証拠。全sampleの再実行とは扱わない。 |

固定144 build sourceの比較で、旧数値実行sourceから変化したのは`api/index.mjs`・`api/model-adapter.mjs`の例外・lifecycle処理2件。残る142件の数値coreは一致。後続回復sourceとは144件すべて一致：[OWNER-EVIDENCE-SOURCE-DIFF.json](verification/OWNER-EVIDENCE-SOURCE-DIFF.json)。これを理由に新管理／1-threadの実行を推定しない。旧4-threadの時間・メモリは今回の予算へ転用しない。

## 実モデルの未取得・未受入

本環境の限定探索では、各15,574,833,216B、計31,149,666,432Bの実HIGH／LOW pairと`/tmp/d1-d4-real-l512-n5-inputs/inputs.json`がない。公開receiptにある別環境の絶対pathは取得済みとして扱わない。[ASSET-AVAILABILITY.md](verification/ASSET-AVAILABILITY.md)に取得済み・未取得を分けた。手元の実L512 packetは8,390,054B、全体SHA-256`90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9`。packet単体ではpairとN5一式の代わりにならない。

保持環境への接続先は未受領。固定管理sourceを保持環境で実行する方式に対応し、全原本の管理環境への複製を要求しない。LoRA、元媒体、原寸81frameを追加条件にしていない。

未受入の接続境界は、実pair正常load→実N5／L512 sample／進捗→NN中取消・旧session拒否→reload→完走→実生成出力のdisk保存・fresh File読戻し→実pair解放。通常Pages向け1-thread／no-COIはこの実行receiptを待つ。loopbackでの制御成功を、GitHub PagesでのNN成功へ一般化しない。4-threadは明示COI/SAB環境限定で、黙って構成を変更しない。

## 再現と保持担当への返却条件

実行sourceを正確にcheckoutする。配布文書commitではなく、次の**実行source**をrunnerへ渡す。固定ownerのGit objectも必要。

```bash
git fetch origin codex/ai-connection-e0-e4
git fetch origin ffeeeedb6b57d182a977c3ac02c042ce235fc87a
git checkout --detach 296c18d5f2c878fa42bbb198a706991fc901065f
git cat-file -e ffeeeedb6b57d182a977c3ac02c042ce235fc87a^{commit}
node --test --test-isolation=none tools/ai-connection/test-diffusion-public-*.mjs
node tools/ai-connection/run-diffusion-public-control.mjs \
  --manager-commit 296c18d5f2c878fa42bbb198a706991fc901065f \
  --out /tmp/fresh-diffusion-control
```

制御runnerの依存環境・追加引数は[CONTROL-REPRODUCE.md](CONTROL-REPRODUCE.md)。保持環境での依存環境、privateディレクトリ0700、fresh出力、入力manifest、時間制限は[REPRODUCE-HOLDING.md](REPRODUCE-HOLDING.md)。その手順に従い、以下を実行する。

```bash
node tools/ai-connection/run-diffusion-public-browser.mjs \
  --source-commit 296c18d5f2c878fa42bbb198a706991fc901065f \
  --manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
  --models /path/to/retained/bernini \
  --mode sample --cancel-before-run \
  --wasm-threads 1 --coi false \
  --private-output /tmp/bernini-management-private/fresh-one-thread-values \
  --output /tmp/bernini-management-one-thread-fresh.json
```

事前確認は同じsource・manifest・modelsと`--wasm-threads 1 --coi false --check-only`。既存small保存tensor／実Textを利用し、全NN中間・原寸・元媒体を再計算しない。small入力を作り直す場合はownerの非NN準備手順を使い、新規準備として識別する。既存43,223B manifestの受領を装わない。

返却は配布SHA、管理実行source、採用Diffusion SHA／build、取得path・bytes・SHA-256、実環境・resource profile、入力identity、request／revision／modelSession・epoch、実進捗6step、取消終端・実Worker close・reload、raw sample／execution／snapshot、実file保存・読戻し・bit一致、unload／dispose、資源観測と未測定項目を含める。独立数値比較は通常入力から分離した診断postprocessとする。旧owner comparatorは異なるreceipt schemaをそのまま受け付けないため、未対応receiptを通してPASS扱いしない。

PRはDraftを維持し、merge・Pages公開は行っていない。生成READY、原寸・本番受入、LoRA連携は拡大していない。
