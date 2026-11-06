# Normal mean operation runner

2026-11-02 JST。通常要求は `operationId` と普通の Artifact descriptor／入力 tensor を渡す。source/build/kernel証明、独立参照、gate、事前PASS、E4保存は入力条件に含めない。対応shape・意味・model・normalizationは実ownerが判定する。

サービスのbootstrapだけが固定5fの実sourceをGit bytesと照合する。ブラウザでは固定 `api/index.mjs` のprivate instanceを使い、ownerのWorkerとlazy Hike loaderへ委任する。通常host/facadeは演算やprofile一覧を複製しない。

このCLIで使用した環境はNode24.19、Chromium154.0.8037.57（`/usr/bin/chromium`）、Playwright（`/opt/codex/cua_node/lib/node_modules/playwright`）。runnerのbrowser起動pathはこの環境に固定されている。製品の通常ES APIはこのCLI pathに依存しない。

## 固定資材の準備

モデル重みや元画像を取得せず、既存P2の公開raw meanを通常入力に使える。以下は管理checkout内で実行する例で、各作成先は未使用のpathを選ぶ。

```bash
git fetch origin 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3
git fetch origin f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48
git fetch origin 7ee36228030ba3bb544a90b1d4b528702a7bae32
git worktree add --detach /local/native-5f 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3
git show f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48:development/inference/p2-p3-acceptance/p2/updated-884/decode/mean/raw-mean/native.wktensor > /local/accepted-p2-raw-mean.wktensor
sha256sum /local/accepted-p2-raw-mean.wktensor
```

rawの期待hashは下記の `8134bc943a60…`、1,084B。通常runのサービスbootstrapは固定5fの53sourceを実bytes／hashとGit objectで照合する。任意診断を実施する場合だけ、同5fの既存reference／gateと7eeの比較関数を読む。

## 通常実行

この変更を含む固定管理commitをcheckoutしてから実行する。`--manager-commit` は省略するとcheckoutのHEADを使う。実行sourceがそのcommitと違う場合はbrowser前にBLOCKEDになる。これは配備sourceの検査であり、通常descriptorへ証拠を要求する仕組みではない。

```bash
node tools/ai-connection/run-normal-operation.mjs --help

node tools/ai-connection/run-normal-operation.mjs \
  --native-root /fixed/5f880fd \
  --source-git /checkout/with-fixed-public-objects \
  --input /local/ordinary-raw-mean.wktensor \
  --out /local/fresh-normal-run
```

既定の `roundtrip` は、通常入口へ `normalizeRawMean` と `restoreRawMean` を順に渡す。独立参照やgateを読まず、`EXECUTION_COMPLETED` とowned outputを返す。`normalized.wktensor`／`restored.wktensor` はCLIで返却する通常出力であり、E4 packageは作らない。数値診断状態は `NOT_REQUESTED`。

`--descriptor /local/ordinary.json` で既存descriptorをそのまま使える。明示済みprofileやmetadataを書き換えて対応shapeへ合わせない。未指定profileの補完は実ownerとの内部contract bindingで行う。

```bash
node tools/ai-connection/run-normal-operation.mjs \
  --native-root /fixed/5f880fd --input /local/ordinary-raw-mean.wktensor \
  --preflight-only

node tools/ai-connection/run-normal-operation.mjs \
  --native-root /fixed/5f880fd --scenario query \
  --descriptor /local/ordinary-request.json --out /local/fresh-support-query
```

`--preflight-only` はsource／codec入力を読取るだけで、Workerを作らない。queryはownerの `SUPPORTED`／`UNSUPPORTED`／`UNVERIFIED` と理由を返す。形状式だけでは `SUPPORTED` にしない。queryのdescriptorだけから、実81frameの媒体やmean tensorが存在するとは扱わない。

既定のRect実行には共通 `deriveWorkflowShapes`→`queryWorkflowRequirements` の接続確認も含む。controlled P2 snapshot の実供給を「wired slot 0、1 frame、16×32」と明示し、`context:0:0.latent=[1,16,1,2,4]` を通常ownerへ照会する。一方、元の要求設定81 frame／480×832は保持し、`target.latent=[1,16,21,60,104]` の新しい通常descriptorをprofile未指定で照会する。対応可否はownerの実 `rawMeanProfiles` が返す理由を記録し、target81 tensorの演算はdispatchしない。元sampleの実媒体・frame供給は別にunknownのまま残す。選択入力がcontrolled Rectと異なる場合はそのbindingを作らず、通常ownerが対応する入力の実行を妨げない。

## 元P2入力の保持と取消

受入済みP2 Rect raw meanは、f76の `development/inference/p2-p3-acceptance/p2/updated-884/decode/mean/raw-mean/native.wktensor` にある。whole file SHA-256は `8134bc943a60b3f0e0d388048ef0943a5274ef37511ce5630cc40d7596bb26a8`、1,084 bytes、payloadは128 F32、shapeは `[1,16,1,2,4]`。これを普通の入力fileとして選べば、ML model、VAE encode/decode、graph bundleの取得は不要。元producerの来歴は履歴として保持し、今回新たにVAEが生成した入力とは呼ばない。

```bash
node tools/ai-connection/run-normal-operation.mjs \
  --native-root /fixed/5f880fd --input /local/accepted-p2-raw-mean.wktensor \
  --scenario cancel-recover --out /local/fresh-normal-cancellation
```

取消はownerの実native request開始callbackでAを対象に行い、元Promiseの終端を待つ。Bの実request開始後に古いAのtargetを再送し、Bが取り消されず完了することを確認する。実Workerのpost／terminateとPlaywrightのcloseを別観測し、専用ownerのdispose後に全Workerのcloseを待つ。timeoutを停止証拠にはしない。

取消検証では、native post後に実Playwright Worker-created ACKを待ち、対象が現在もactiveであることを確認してから取消する。Bでも実生成ACKとactive targetを確認して旧Aを送る。数値処理やnative runを遅延させるhookは追加していない。ACK前に対象が完了した場合は、取消未達としてFAILになる。開始済みの非同期controlも終端まで待つ。

## 任意の数値診断

通常実行の完了後だけ、別コマンドで既存の独立数値referenceとowner宣言gateを読む。通常実行を診断の別名にせず、通常receiptと診断receiptを分ける。

```bash
node tools/ai-connection/run-normal-operation.mjs diagnose \
  --native-root /fixed/5f880fd \
  --source-git /checkout/with-fixed-public-objects \
  --normal-result /local/completed-normal-run \
  --out /local/fresh-post-normal-diagnostic
```

診断は固定5fの `development/ai-connection/e6/{reference-received.json,rect-receipt.json}` と、固定7eeのowner `diagnostics/self-attention-tail/common.mjs:compare` を使用する。normalized/restored各stageは既存の独立Python F32 referenceにbyte exactで照合する。元の2e-6 gateはraw→restoredのroundtripだけに適用する。rawは受領済みVAE出力であり、独立VAE encode oracleとは呼ばない。新しいnative operationをdispatchせず、通常結果を書き換えない。通常入力cohortが保存referenceと異なる場合や、出力fileが完了receiptのhashから変わった場合は拒否する。

返却記録では、bootstrapの固定native source、実行管理commit、通常完了、任意の診断比較、取消／元終端／解放を分ける。Hike容量とWorker closeは実観測、host／allocator／全工程peakは未測定ならnull。`generationReady:false`、load／predict／sample `NOT_READY` は維持する。
