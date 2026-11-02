# 単体検証の再現

実行範囲と合否は [RESULT.md](RESULT.md)、通常の接続契約は [API.md](API.md) を参照する。重いNN/reference/exportは原則として直列にする。同時実行する場合は、所有processの停止条件とcgroupの余力を別に確認し、競合を含む実測として記録する。独立参照やgateは開発検証の入力であり、通常APIへ渡さない。

## sourceと原本の固定

repositoryは `Kushyameln01/kushyameln-works`、branch `codex/text-vae-standalone`、[Draft PR #18](https://github.com/Kushyameln01/kushyameln-works/pull/18)。初回公開commitは `3ea4ca34d50aef0da434985965b0b01105bbb8d8`。最終配布SHAはRESULTへ別記し、各runの実行sourceとは区別する。再現するrunのsourceへcheckoutし、変更のない状態で実行する。各toolは指定commitのsource bytesとの一致を検査する。

実行sourceには、そのrunで使うharnessとmoduleの完全SHAを指定する。将来harnessを変更したrunでは変更後のSHAを記録し、古いrunの `executionSourceSha` を最新配布SHAへ付け替えない。`git rev-parse HEAD` は対象checkoutの確認であり、過去runのsourceを最新HEADとみなす操作ではない。独立参照のsourceは `--reference-execution-source-sha` で別に固定する。

```sh
git rev-parse HEAD
git status --short
```

依存環境は既存のPython CPU torch2.6.0、numpy、onnx、safetensorsと、Chromium/Playwright。Text source oracleには既存Tokenizer依存も使う。下記 `--deps` は隔離済み依存directoryを参照する指定で、toolによるinstallではない。再現先では自身のdirectoryへ置換する。

| 入力 | この実行環境のpath・識別 |
| --- | --- |
| 元UMT5 | `/workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`、6,735,906,897 B、SHA `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68` |
| 選択Text bundle | `/workspace/work/inference/text-implementation/bundle/manifest.json`、19,908 B、SHA `aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f`。24 prepared graphs合計18,523,750,008 B |
| 元VAE | `/workspace/work/models/vae/wan_2.1_vae.safetensors`、253,815,318 B、SHA `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b` |
| VAE stream bundle | `/tmp/kw-vae-stream-export-20261102/manifest.json`、SHA `64c57a7aeb5e8fcb5089b8d5771ce293b8355e365f2fd5cfe80df0840ca85345`。69 graph+2 binary assetは507,834,866 B |
| VAE明示threads4 bundle | `/tmp/kw-vae-stream-threads4-20261102/manifest.json`、SHA `532523034a5e5c7590c4fca11d67feec329c6e0e364afd55f472f03ffd8966d2`。graph/重みは上記と同一 |
| Python依存 | `/workspace/work/inference/vae-proof/deps`、Text Tokenizerは `/workspace/work/inference/tokenizer-python` |

モデル原本を再取得する場合も上記全bytes/SHAを照合する。pathの存在だけで取得・互換を確認したと扱わない。既存bundleと参照が揃う場合は再export・再推論せずその証拠を再利用する。

## 軽量検査

repository rootから実行する。これらの合格はNNの大shape受入とは別である。

```sh
node tools/inference/vae/test-stream-threads.mjs
node tools/inference/vae/test-stream-runtime.mjs
node tools/inference/vae/test-fixed-frame-processing.mjs
node --test tools/inference/test-vae-temporal-metadata.mjs
python -m unittest discover -s tools/inference/vae -p 'test_stream_reference.py'
python -m unittest discover -s tools/inference/vae -p 'test_reference_contract.py'
python -m unittest discover -s tools/inference/vae -p 'test_derive_stream_prefix.py'
python -m unittest discover -s tools/inference/text-encoder -p 'test_plain_checks.py'
python -m unittest discover -s tools/inference/text-encoder -p 'test_plain_failure_controls.py'
node tools/inference/text-encoder/test_plain_browser_controls.mjs
node tools/inference/text-encoder/test-text-job.mjs
node tools/inference/text-encoder/test_node_sdk_host.mjs
python -m unittest discover -s tools/inference/text-encoder -p 'test_node_sdk_accept.py'
git diff --check
```

`test-stream-runtime.mjs` のORT Addは実WASMだが小演算helperである。metadata/control doubleや小channel source等価性を元VAEの81frame推論へ数えない。

## Text

固定planは [text/predeclared-plan.json](text/predeclared-plan.json)。case、独立full512参照、比較と取消の詳しい説明は [text/REPRODUCE.md](text/REPRODUCE.md) にある。既存9case独立参照はsource `5954d48e0fb6df1d6977964fd8a7ba2a242b6eff` で作成済み。現在のbrowser sourceと別に `--reference-execution-source-sha` を渡す。

Textの通常入口は既存の独立ES module APIのまま。WorkerのText処理を `docs/shared/inference/text-job.mjs` の `runTextEncoderJob()` へまとめ、通常WorkerとNode参照hostが同じ入力validator・Tokenizer・staged loaderを呼ぶ。job関数がencoderをfinallyでdisposeし、Hikeの寿命は呼出側が所有する。通常の `configure({manifest,files})` は `diagnostics:false` で、結果は `{tensor,attentionMask,inputMode}`。`result.evidence` は明示opt-in時だけ返す。参照hostの外側receiptにあるsession/Hike観測や独立比較を、通常tensor fieldへ加えない。

### Node SDK参照host

`--node-sdk --skip-controls` は、通常の `createTextEncoderModule()` に専用clientを渡し、共有job・実ORT CPU WASM1 thread・実Hike・既存WKT writer/readerを通す参照hostである。別のT5実装、precision、export、oracle、gateは導入しない。現在のhostも通常の `diagnostics:false` で実行する。privateなsession/Tensor観測とHike呼出回数は外側receiptに記録する。

prepared graphだけは、1個のcaller-owned ArrayBufferへ最大8 MiBのpositional `fs.read` を繰り返す。configure時にreadonly FDと64-bitのsize・mtimeNs・inode・deviceを保持し、各slice読込みの前後でFDとpath双方のstatを照合する。graphは1 GiB未満、sliceは安全整数の範囲内に限定し、短いreadは残りを読み直す。pending readを待って全graph FDをfinallyで閉じ、storage・読込みbytes・回数・close状態は通常tensorの外側receiptへ記録する。prepared graphは1 Bも変更しない。final norm・row hashes・Tokenizerは引き続きnative `fs.openAsBlob` を使う。

元6,735,906,897 B modelは、使用Node環境でBlobのsizeが4GiBぶん短くなるため、実 `fs.stat` の64-bit sizeを持つ既存readonly positional source adapterを使う。loaderの8192 B以下のembedding row要求だけを `fs.read` し、size・mtimeNs・inode・deviceを読出し前後に照合する。元model全体のArrayBuffer化や新しい重みfileは作らず、Browser File経路の確認とも記録しない。

Node v24.19.0のNN0読込みprobeでは、native Blobが読込みchunkを保持したまま最終bufferへconcatする実装を確認した。block00の同一771,822,917 Bをmanifest SHAへ全byte照合し、Blob経路のown RSS peak約1.586 GBに対し、単一ArrayBufferの実production readerは約0.807 GBだった。これはgraph読込み時の約1個分のcopyを除いた測定であり、全24層NNのpeakや受入結果ではない。順序・cache・並列VAEで読込み時間と共有working setが変わるため、速度向上や全jobのRAM上限へ換算しない。実行時のad hoc sourceは [read-probe/README.md](text/evidence/read-probe/README.md) にbytes/SHA付きで保存する。

Python親processは `git cat-file` で指定objectがcommitであることを確認し、親harnessと全Node import closureのbytesを `git show` と照合する。Nodeへ渡す15件のsource recordsはpath集合・bytes・SHA-256・execution SHAを固定する。Nodeは不足・重複・追加を拒否し、現在のfile bytesを再読して照合する。Node自身がGit commitを独立に検証したという意味ではない。親の検査後にsourceが変わった場合も、Node側の再照合で拒否する。

#### 初回6case試行（終了済み）

実行source `dccb88515775ec8aa86dd16f82e8816c9347ed38` の6case試行は、632秒で資源guardが所有Nodeを停止して終了した。共有cgroup working set約16.405 GBを観測し、当該harness群のsampled RSS peakは約3.983 GBだった。両者は別指標であり、他jobを含むRAMへ単純加算・換算しない。終了後の所有live process・zombie・cleanup errorは空だった。

`plain-empty` は通常出力で24層とsession releaseを完了し、全2,097,152値を元5954参照と比較して最大絶対誤差 `4.172325134e-6`、元gateとnative codec読戻しに合格した。この1caseの確認を6case全体の合格に広げない。`plain-multilingual-newline` はblock8までのpartialで、数値結果は未確定。残る5caseと長文plainは未完了であり、この停止までに数値FAILは観測していない。最新の判定と保存済み証拠は [RESULT.md](RESULT.md) を参照する。

以下は終了済みattemptの元構成であり、現在走っているjobの指定ではない。outputは既存保存先なので、再現が必要な場合だけ別の新規directoryへ置換する。完了済みemptyは次の最小再開Node構成へ含めない。

```sh
TEXT_NODE_SOURCE_SHA=dccb88515775ec8aa86dd16f82e8816c9347ed38
TEXT_REFERENCE_SOURCE_SHA=5954d48e0fb6df1d6977964fd8a7ba2a242b6eff

python tools/inference/text-encoder/accept_plain.py \
  --node-sdk --skip-controls \
  --plan development/inference/standalone-20261102/text/predeclared-plan.json \
  --bundle /workspace/work/inference/text-implementation/bundle \
  --source /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --reference /tmp/kw-standalone-text-oracle-20261102 \
  --execution-source-sha "$TEXT_NODE_SOURCE_SHA" \
  --reference-execution-source-sha "$TEXT_REFERENCE_SOURCE_SHA" \
  --case-id plain-empty --case-id plain-multilingual-newline \
  --case-id id-l1 --case-id id-l511 \
  --case-id id-l512-trailing-mask --case-id id-internal-trailing-mask \
  --output /tmp/kw-text-node-sdk-six-20261102
```

同じ構成へ `--preflight-only` を付け、別の新規outputへ実行すると、source・manifest・local asset sizeをNNなしで検査する。ORT/Hikeのinstanceを作らず、元modelのread observationは0 Bで閉じる。これはTokenizer・数値比較・Browser取消の受入ではない。

#### 未完了分の最小再開計画

次のsourceは `b3e5e34430d58bca3bf69b8938ba87beb196d054`。この固定sourceのNN0 preflightは、親harnessとNode closureの18件照合、24 graph FDのclose、graph/source read0 B、NN0で完了した。これは数値受入ではない。旧153cの待機queueを止め、b3e5を指定する直列controllerを再起動した。所有VAE targetのfinal終了を待っており、この追補時点ではNode再開も後続Browser jobも開始していない。未完了の5caseと長文plainを次の6件にまとめ、5954 oracleを再利用する。完了済みemptyや既知FAILのall-active ID512 canaryは、このNode jobで再実行しない。

```sh
TEXT_RESUME_SOURCE_SHA=b3e5e34430d58bca3bf69b8938ba87beb196d054
TEXT_REFERENCE_SOURCE_SHA=5954d48e0fb6df1d6977964fd8a7ba2a242b6eff

python tools/inference/text-encoder/accept_plain.py \
  --node-sdk --skip-controls \
  --plan development/inference/standalone-20261102/text/predeclared-plan.json \
  --bundle /workspace/work/inference/text-implementation/bundle \
  --source /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --reference /tmp/kw-standalone-text-oracle-20261102 \
  --execution-source-sha "$TEXT_RESUME_SOURCE_SHA" \
  --reference-execution-source-sha "$TEXT_REFERENCE_SOURCE_SHA" \
  --case-id plain-multilingual-newline --case-id plain-long-eos512 \
  --case-id id-l1 --case-id id-l511 \
  --case-id id-l512-trailing-mask --case-id id-internal-trailing-mask \
  --output /tmp/kw-text-node-sdk-remaining-serial-20261102
```

Node jobが終了して資源を解放した後、同じb3e5 sourceで次のBrowser jobを直列実行する計画である。`--node-sdk` と `--skip-controls` を付けず、主caseは `plain-empty` と `id-l2` の2件だけを選ぶ。planの全9 controlsと、同じAPIの `id-l1` recoveryを一度実行するため、正常な全24層NNは合計3件となる。cancel途中のjobや保存revision controlを正常NN件数へ加えない。Browser emptyは取消・保存のhost確認用であり、Node emptyの通常出力受入を付け替えるものではない。

```sh
python tools/inference/text-encoder/accept_plain.py \
  --plan development/inference/standalone-20261102/text/predeclared-plan.json \
  --bundle /workspace/work/inference/text-implementation/bundle \
  --source /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --reference /tmp/kw-standalone-text-oracle-20261102 \
  --execution-source-sha "$TEXT_RESUME_SOURCE_SHA" \
  --reference-execution-source-sha "$TEXT_REFERENCE_SOURCE_SHA" \
  --case-id plain-empty --case-id id-l2 \
  --output /tmp/kw-text-browser-t3-controls-20261102
```

b3e5でも、主caseへ選ばないrecovery入力も含め、全control入力のsource/manifest、固定ID/maskと独立full512参照のbytes/SHA-256をNN前に照合する。`controlReferencePreflight` に保存し、古い参照や破損fileを取消後まで持ち越さない。

正常保存とrecovery保存は `encodeTensor()` の後にnative `decodeTensor()` でdescriptor、normalization、model/Tokenizer、全maskと全float値を読戻し、payload/maskが独立所有のbufferであることも確認する。recoveryは `recovery-cancel-run.wktensor` としてdownload・保存し、Pythonが全file bytes/SHA、native header/payloadと元 `id-l1` 参照の全4,096値を再照合する。これらは診断hostの外側receiptであり、通常APIの必須入力やtensor fieldを追加するものではない。新しいBrowser取消・保存結果も未確定であり、実行前から合格とはしない。

`node-sdk-results.json` は通常factory/shared job/codecを通したhostの記録、`node-sdk-acceptance.json` は元参照との全値比較、所有NodeのPID/create timeと資源観測である。各完了caseのWKTとhost receiptを順次保存し、後のprocess停止でも完了分を残す。数値FAILは個別・最終FAILのまま後続caseを集める。不正なnative outputやfile/hash破損は継続せず拒否する。未完了caseを合格に補わない。

このNode経路はBrowser Workerの取得・終了・取消を検証しない。`byteGraph` を持つID2 caseは拒否し、上記の通常Browser host計画へ残す。9件のBrowser controlsと同じAPIでのL1 recoveryも、実完了後に別判定する。Node結果へBrowser/T3の受入を移さない。

### 資源policy

Node SDK参照hostのOOM優先度を明示する場合だけ、`--node-sdk` を使うPythonコマンドの先頭に次を付ける。必要な `/proc/self/oom_score_adj` 書込み権限を持つ実行環境で使う。Browser jobの停止条件は別の所有process controllerで扱う。

```sh
NODE_OPTIONS="--require=$(pwd)/tools/inference/text-encoder/node_resource_guard.cjs" \
  python tools/inference/text-encoder/accept_plain.py --node-sdk --skip-controls ...
```

このopt-in guardは起動したNode自身のOOM scoreを1000に設定して読戻し、他processのpriorityやmodel演算を変更しない。外側controllerによる所有Nodeの停止条件、有効にしたguardと実測資源はrunごとに記録する。OOM優先度はメモリ上限や他jobの完走保証ではない。

Python Node-modeは起動前の24 prepared Text graphと、caseごとの各block完了後にreadonly `POSIX_FADV_DONTNEED` を試みる。重複progressはcase/indexでまとめる。原model・参照・VAE graphを対象にせず、全体のdrop_cachesやfile削除もしない。成功件数・対象path・累積file bytes・errorはadvisoryの記録であり、page解放・RSS低下・空きRAMの証明ではない。source/Node自身のRSS、cgroup、file cache、同時実行VAEの使用量を別に扱う。

### Browser canaryと独立参照

```sh
TEXT_RUN_SOURCE_SHA=$(git rev-parse HEAD)

python tools/inference/text-encoder/accept_plain.py \
  --plan development/inference/standalone-20261102/text/predeclared-plan.json \
  --bundle /workspace/work/inference/text-implementation/bundle \
  --source /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --reference /tmp/kw-standalone-text-oracle-20261102 \
  --reference-execution-source-sha 5954d48e0fb6df1d6977964fd8a7ba2a242b6eff \
  --execution-source-sha "$TEXT_RUN_SOURCE_SHA" \
  --case-id id-l512-all-active --skip-controls \
  --output /tmp/kw-text-new-canary
```

上記は失敗を含むcanaryを再現する診断コマンドで、合格を保証しない。現在の既知結果はmaxAbs0.0016480088233947754でgate0.001に不合格。この値を新しいharness SHAの実測へ付け替えず、新sourceの結果は別receiptに記録する。既存canaryを保持し、原因修正後のfresh出力と別に比較する。全512有効を短いmaskへ変更したりgateを上げたりしない。

9case独立参照がない再現先では、まず次を単独実行する。末尾のoutputは新規directoryとする。

```sh
python tools/inference/text-encoder/plain_reference.py \
  --plan development/inference/standalone-20261102/text/predeclared-plan.json \
  --bundle /workspace/work/inference/text-implementation/bundle \
  --model /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --deps /workspace/work/inference/vae-proof/deps \
  --tokenizer-deps /workspace/work/inference/tokenizer-python \
  --execution-source-sha "$TEXT_RUN_SOURCE_SHA" \
  --output /tmp/kw-text-new-oracle
```

この新参照を使うbrowser commandの `--reference` と `--reference-execution-source-sha` も、その実sourceへ合わせる。oracleを現WASM出力へ合わせる変更はしない。

層ごとの診断は既存source checkpoint `/tmp/kw-text-trace-source-20261102` と元canaryを再利用する。全24層のsource digestが元5954 oracleと一致することをtoolが検査する。次は元graphを変更せず、native直列入力と各層の同一source入力を別feedにして局所/伝播差を比較する。新しい出力先が必要な再現先でのみ実行し、取得確認のためには再推論しない。

```sh
python tools/inference/text-encoder/diagnose_block.py trace-native \
  --bundle /workspace/work/inference/text-implementation/bundle \
  --reference /tmp/kw-text-trace-source-20261102 \
  --failed-output /workspace/work/inference/standalone-20261102/text-canary/id-l512-all-active.wktensor \
  --execution-source-sha "$TEXT_RUN_SOURCE_SHA" \
  --output /tmp/kw-text-new-native-trace
```

実runのsourceは `79d62327b47056fff0e3f8d5ea0ebd2e183048c3`。診断完了の `passed:true` と最終数値gateの `finalFixedGatePassed:false` は別項目である。今回の実native traceは失敗canaryをbitwise再現した。これを製品の数値修正・受入とはしない。

## VAE exportとgraph照合

既存69-unit bundleを再利用するのが通常手順である。再現先にbundleがない場合だけ、固定原VAE194 keysから新しい非公開directoryへexportする。

```sh
python tools/inference/vae/export_stream.py \
  --model /workspace/work/models/vae/wan_2.1_vae.safetensors \
  --deps /workspace/work/inference/vae-proof/deps \
  --output /tmp/kw-vae-new-stream-bundle
```

manifestだけのshape変更は行わない。manifestの全assetについてfile/bytes/SHAを検査する。各graphの入力/出力・history・空間symbol・元key対応は [vae/partition-inventory.json](vae/partition-inventory.json) でも確認できる。runtimeも使用unitを毎回hash照合してからsessionへ渡す。

初回exportのthreads1はそのまま保持する。明示threads4を検証する場合は別directoryにmanifestとassetを用意し、変えたfieldが `inference.threads` だけであること、全asset hashとprogram/shape/model/sourceが同一であることを記録する。これはgraphの再exportでもshape変更でもない。derived manifestの新bytes/SHAを別に記録する。COOP `same-origin`、COEP `require-corp`、SharedArrayBufferを提供できる参照hostで実行する。非対応hostの暗黙threads1 fallbackはしない。

今回のthreads4 manifestとderivation receiptは [evidence/index.json](evidence/index.json) で取得・hash照合できる。公開したreceipt/manifestの取得と、非公開graph/tensor payloadの取得・実行を混同しない。

## VAE独立参照と実WASM

固定case一覧は [vae/predeclared-plan.json](vae/predeclared-plan.json)。前処理済みの正確なF/H/Wから一件を選ぶ。既存F1・16×32とF1・480×832参照はそのまま再利用できる。以下は未作成caseを新規に確認するときの例。

```sh
VAE_RUN_SOURCE_SHA=$(git rev-parse HEAD)

python tools/inference/vae/stream_reference.py \
  --case-id target-f81-480x832 --operation both \
  --model /workspace/work/models/vae/wan_2.1_vae.safetensors \
  --deps /workspace/work/inference/vae-proof/deps \
  --execution-source-sha "$VAE_RUN_SOURCE_SHA" \
  --output /tmp/kw-vae-new-target81-reference

python tools/inference/vae/accept_stream.py \
  --bundle /tmp/kw-vae-stream-export-20261102 \
  --reference /tmp/kw-vae-new-target81-reference \
  --operation both \
  --execution-source-sha "$VAE_RUN_SOURCE_SHA" \
  --controls --timeout-seconds 7200 \
  --output /tmp/kw-vae-new-target81-wasm
```

referenceが完了したことを確認してからbrowserを起動する。対象時間が7200秒を超える場合は適切な明示deadlineへ変更して記録する。timeout/resource失敗を小shapeへの置換で合格扱いしない。`--preflight-only` はcapabilitiesとsource/storage確認のみでNNを動かさない。

新規に受け入れた `diagnostic-f5-16x32`、`reference-f1-16x16`、`reference-f1-16x848`、`reference-f1-848x16` の各run sourceは `cc9b37f82ed855b36261d92429a822528bc24a71`。同じtoolを使い、`--reference` に対応する完了済みref directory、`--bundle` に明示threads4 bundleを選ぶ。F5診断のrefは `/tmp/kw-vae-ref-temporal-f5-16x32-20261102`、browser出力は `/tmp/kw-vae-wasm-thread4-temporal-f5-16x32-20261102`。参照境界のrefは `/tmp/kw-vae-ref-reference-f1-16x16-20261102` 等、browser出力は `/tmp/kw-vae-wasm-reference-f1-16x16-20261102` 等である。元81frameや未受入848×848の代わりには数えない。

planへのF5診断追加に伴って旧参照を再計算する必要はない。`reference_contract.py` は作成時commitのplan/tool bytes/hashと、現在の選択case・model/source/precision/gate/patternを照合し、意味が同じ場合だけ既存参照を再利用する。現在のplan全体hashを古いreceiptへ書き換えない。

source F4/5/80/81のcausal prefixを派生する場合は `derive_stream_prefix.py` を用い、完了済みtarget81と別実行direct F1双方のreport SHAを明示する。per-channelのNCTHW axis2で抽出し、flat prefixや別空間へのcropを許可しない。派生statusは `DERIVED_CAUSAL_PREFIX_REFERENCE`、新規model load/NN実行0。親とdirect F1のhash・全値bridgeを保持し、派生を新しい元vendor推論と記録しない。実WASM出力の全値照合は派生後も別に必要である。未完了targetのpartial reportを親には使えない。

source oracleは未変更vendorの `WanVAE_.encode/decode`、raw scale `[0,1]` を直接呼ぶ。encode用RGBとdecode用独立raw latentは別の事前固定pattern。encodeのmeanをdecode独立入力として流用しない。RGB patternは `((c*71+t*13+y*5+x*3)%257-128)/128`、raw latentは `((c*17+t*11+y*7+x*5)%257-128)/512`。全値比較はatol/rtol/maxAbs0.002、shape/layout/meaning/hash/保存metadataも照合する。

`--controls` は最初の実chunk完了後に取り消し、同じAPIで正常再実行を一度行う。保存は実WKT writer/reader、取消は実owner Workerで確認する。保存digestそのものをmodule cancelで中断したという意味ではない。

出力の `acceptance-results.json`、`resource-measurements.json`、`resource-samples.jsonl`、`.wktensor` を一組で保持する。全値・metadata・mask・meaningの比較と、session/Tensor・owner Worker・live process・zombieの記録を別々に確認する。threads4では親Worker終了だけで子pthread終了まで確認済みとしない。診断hostはCDPで列挙できる親/pthread targetのcreate/destroyを収集し、操作後とdispose後、browserを閉じる前にbounded settlementを待つ。新規F5 runは計12 target、F1参照境界各runは8 targetを観測し、全destroyとその後の不在を確認した。非公開targetや物理RAM回収までの証明ではない。

## 資源とscope

このhostはCPU4、cgroup16GiB。workspace空き約1.3GBと `/tmp` tmpfs約8.8GBは別であり、tmpfsはRAMにも課金される。target81 RGB1本は388,177,920 B、latent1本は8,386,560 B。input・reference・WKT・download staging・host history・WASM・sessionを含むpeakはこの単体容量より大きい。

新graphはjob-owned host historyと同時1 sessionでWASM32bit heapを守るが、全shapeを資源保証したものではない。資源guardのreserve256MiBは操作上の設定である。RSS sumは共有pageを二重計上し得る。PSS・WASM capacity・cgroup current・inactive_file・shmemを混ぜて単一の「必要RAM」へ置き換えない。

既存合格は元のmodel/graph/source/shape/promptのscopeで再利用し、変更境界だけを新しく検証する。実generated sampleの受入・Diffusionとの結合・管理保存・製品生成READY・merge/Pages公開は、この単体コマンド群の自動処理に含めない。
