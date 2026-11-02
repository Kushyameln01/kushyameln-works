# 単体検証の再現

全体の状態は [RESULT.md](RESULT.md)、各caseの合否は [TEXT-RESULT.md](TEXT-RESULT.md) と [VAE-RESULT.md](VAE-RESULT.md)、通常の接続契約は [API.md](API.md) を参照する。重いNN/reference/exportは原則として直列にする。同時実行する場合は、所有processの停止条件とcgroupの余力を別に確認し、競合を含む実測として記録する。独立参照やgateは開発検証の入力であり、通常APIへ渡さない。

## sourceと原本の固定

repositoryは `Kushyameln01/kushyameln-works`、branch `codex/text-vae-standalone`、[Draft PR #18](https://github.com/Kushyameln01/kushyameln-works/pull/18)。初回公開commitは `3ea4ca34d50aef0da434985965b0b01105bbb8d8`。最終配布SHAはRESULTへ別記し、各runの実行sourceとは区別する。再現するrunのsourceを別checkoutへ取得し、変更のない状態で実行する。NN実行toolは指定commitのsource bytesとの一致を検査する。Browserの `--preflight-only` はGit照合を省略するため、下記T1の事後照合と区別する。

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

### T1：Tokenizer・入力契約のNN0検査

b3e5のBrowser preflightは、有効9件、不正入力拒否9件、Worker0、NN0、export0で合格した。実行sourceはb3e5、参照識別は5954であるが、このmodeは参照tensorとの数値比較を行わない。以下は新しい出力先で同じ入力境界を調べるコマンドである。

```sh
python tools/inference/text-encoder/accept_plain.py \
  --preflight-only \
  --plan development/inference/standalone-20261102/text/predeclared-plan.json \
  --bundle /workspace/work/inference/text-implementation/bundle \
  --source /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --reference /tmp/kw-standalone-text-oracle-20261102 \
  --execution-source-sha b3e5e34430d58bca3bf69b8938ba87beb196d054 \
  --reference-execution-source-sha 5954d48e0fb6df1d6977964fd8a7ba2a242b6eff \
  --output /tmp/kw-text-new-t1-preflight
```

Browser preflight modeはNN開始前のGit bytes照合を省略する。指定SHAだけをsource取得の証明にせず、終了後にreceiptの `servedSources` 各pathについて `git show <SHA>:<path>` のbyte数・SHA-256と、現在fileの実bytesを照合する。今回の17件の事後照合は [text-t1-b3e5-served-source-verification.json](evidence/text-t1-b3e5-served-source-verification.json)、元receiptは [evidence/index.json](evidence/index.json) に保存した。事後照合をharnessによる事前検査と記載しない。旧T1 receiptのnull sourceを5954などへ補完しない。

### Node SDK参照host

`--node-sdk --skip-controls` は、通常の `createTextEncoderModule()` に専用clientを渡し、共有job・実ORT CPU WASM1 thread・実Hike・既存WKT writer/readerを通す参照hostである。別のT5実装、precision、export、oracle、gateは導入しない。現在のhostも通常の `diagnostics:false` で実行する。privateなsession/Tensor観測とHike呼出回数は外側receiptに記録する。

prepared graphだけは、1個のcaller-owned ArrayBufferへ最大8 MiBのpositional `fs.read` を繰り返す。configure時にreadonly FDと64-bitのsize・mtimeNs・inode・deviceを保持し、各slice読込みの前後でFDとpath双方のstatを照合する。graphは1 GiB未満、sliceは安全整数の範囲内に限定し、短いreadは残りを読み直す。pending readを待って全graph FDをfinallyで閉じ、storage・読込みbytes・回数・close状態は通常tensorの外側receiptへ記録する。prepared graphは1 Bも変更しない。final norm・row hashes・Tokenizerは引き続きnative `fs.openAsBlob` を使う。

元6,735,906,897 B modelは、使用Node環境でBlobのsizeが4GiBぶん短くなるため、実 `fs.stat` の64-bit sizeを持つ既存readonly positional source adapterを使う。loaderの8192 B以下のembedding row要求だけを `fs.read` し、size・mtimeNs・inode・deviceを読出し前後に照合する。元model全体のArrayBuffer化や新しい重みfileは作らず、Browser File経路の確認とも記録しない。

Node v24.19.0のNN0読込みprobeでは、native Blobが読込みchunkを保持したまま最終bufferへconcatする実装を確認した。block00の同一771,822,917 Bをmanifest SHAへ全byte照合し、Blob経路のown RSS peak約1.586 GBに対し、単一ArrayBufferの実production readerは約0.807 GBだった。これはgraph読込み時の約1個分のcopyを除いた測定であり、全24層NNのpeakや受入結果ではない。順序・cache・並列VAEで読込み時間と共有working setが変わるため、速度向上や全jobのRAM上限へ換算しない。実行時のad hoc sourceは [read-probe/README.md](text/evidence/read-probe/README.md) にbytes/SHA付きで保存する。

Python親processは `git cat-file` で指定objectがcommitであることを確認し、親harnessと全Node import closureのbytesを `git show` と照合する。Nodeへ渡す15件のsource recordsはpath集合・bytes・SHA-256・execution SHAを固定する。Nodeは不足・重複・追加を拒否し、現在のfile bytesを再読して照合する。Node自身がGit commitを独立に検証したという意味ではない。親の検査後にsourceが変わった場合も、Node側の再照合で拒否する。

#### 初回6case試行（終了済み）

実行source `dccb88515775ec8aa86dd16f82e8816c9347ed38` の6case試行は、632秒で資源guardが所有Nodeを停止して終了した。共有cgroup working set約16.405 GBを観測し、当該harness群のsampled RSS peakは約3.983 GBだった。両者は別指標であり、他jobを含むRAMへ単純加算・換算しない。終了後の所有live process・zombie・cleanup errorは空だった。

`plain-empty` は通常出力で24層とsession releaseを完了し、全2,097,152値を元5954参照と比較して最大絶対誤差 `4.172325134e-6`、元gateとnative codec読戻しに合格した。この1caseの確認を6case全体の合格に広げない。`plain-multilingual-newline` はblock8までのpartialで、数値結果は未確定。残る5caseと長文plainは未完了であり、この停止までに数値FAILは観測していない。この記述は初回attemptの終了時点に限定する。その後のb3e5実行で残る6件は完了し、最新の判定と保存済み証拠は [TEXT-RESULT.md](TEXT-RESULT.md) を参照する。

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

#### 完了したNode6件とBrowser T3の再現

実行sourceは `b3e5e34430d58bca3bf69b8938ba87beb196d054`、独立参照は5954のまま再利用した。Node6件は全24層・全値比較・保存読戻しまで合格し、その終了後にBrowser T3を直列実行して完了した。Nodeの事前検査は親harnessとNode closureの18件照合、24 graph FDのclose、graph/source read0 B、NN0であり、数値受入とは別記録である。以下は完了runの構成で、取得確認のために再実行する必要はない。再現する場合だけ、各 `--output` を新規directoryへ置き換える。完了済みemptyと既知FAILのall-active ID512 canaryは、このNode6件に含まない。

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

Node jobが終了して資源を解放した後、同じb3e5 sourceで次のBrowser jobを直列実行した。`--node-sdk` と `--skip-controls` を付けず、主caseは `plain-empty` と `id-l2` の2件だけを選ぶ。planの全9 controlsと、同じAPIの `id-l1` recoveryを一度実行するため、正常な全24層NNは合計3件となる。cancel途中のjobや保存revision controlを正常NN件数へ加えない。Browser emptyは取消・保存のhost確認用であり、Node emptyの通常出力受入を付け替えるものではない。

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

正常保存とrecovery保存は `encodeTensor()` の後にnative `decodeTensor()` でdescriptor、normalization、model/Tokenizer、全maskと全float値を読戻し、payload/maskが独立所有のbufferであることも確認する。recoveryは `recovery-cancel-run.wktensor` としてdownload・保存し、Pythonが全file bytes/SHA、native header/payloadと元 `id-l1` 参照の全4,096値を再照合する。これらは診断hostの外側receiptであり、通常APIの必須入力やtensor fieldを追加するものではない。このBrowser runでは通常2件・復帰1件の独立全値比較、9 controls、保存読戻しに合格した。詳細receiptと資源測定はTEXT-RESULTを参照する。

`node-sdk-results.json` は通常factory/shared job/codecを通したhostの記録、`node-sdk-acceptance.json` は元参照との全値比較、所有NodeのPID/create timeと資源観測である。各完了caseのWKTとhost receiptを順次保存し、後のprocess停止でも完了分を残す。数値FAILは個別・最終FAILのまま後続caseを集める。不正なnative outputやfile/hash破損は継続せず拒否する。未完了caseを合格に補わない。

このNode経路はBrowser Workerの取得・終了・取消を検証しない。`byteGraph` を持つID2 caseはNode側で拒否し、上記Browser runで実行した。9 controlsと同じAPIでのL1 recoveryもBrowser側の独立した結果である。Node結果へBrowser/T3の受入を移さない。

### 既存のHello world資源比較

同じ固定 `Hello world`、選択manifest、Tokenizer、5537独立full512参照による3件の実行は、[既存の資源改善報告](../text-memory-20261102/RESULT.md) とそのINDEXを再利用する。baseline `04d1447e3531836adbb013314e716f2403895443`、prepack停止 `44b188633343cc2c93ea6f85aac348059ac42757`、incremental `eab4fabfadd133cc97434eed28ea998dca6795c2` はいずれも全値gateに合格した。baselineからincrementalへのsampled RSS和は5,708,951,552 Bから4,490,174,464 Bへ減ったが、full時間は117.264秒から388.521秒へ増えた。各1runでcache/GCを統制しておらず、完全なfull-phase PSSは記録されていない。過去の入力・source・hostの範囲に限定し、b3e5の全512 caseや現在の端末資源保証へ転用しない。取得確認のための再推論は不要である。

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

### block19の限定比較（完了済み）

追加診断sourceは `5b784339a6caf83728a529522538fd43d5fb68f8`。同じsourceS18とgraph19でALL出力hashを再現し、一致した場合だけDISABLEDへ進む。通常APIの変更ではない。最大2sessionに限定し、既存full24の最終gateは再評価しない。実結果は差が小さいため探索終了であり、取得確認だけなら再実行しない。

```sh
python tools/inference/text-encoder/diagnose_block.py block-options \
  --bundle /workspace/work/inference/text-implementation/bundle \
  --reference /tmp/kw-text-trace-source-20261102 \
  --native-trace-report /tmp/kw-text-trace-native-20261102/trace-native-results.json \
  --layer-index 19 \
  --execution-source-sha 5b784339a6caf83728a529522538fd43d5fb68f8 \
  --output /tmp/kw-text-new-block19-options
```

`--preflight-only` を追加すれば既存graph一件とcheckpointのhash/sourceをNN0で検査する。全24graphや独立参照を再作成しない。停止条件・数値と資源のscopeは [TEXT-RESULT.md](TEXT-RESULT.md) を参照する。

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

固定case一覧は [vae/predeclared-plan.json](vae/predeclared-plan.json)。前処理済みの正確なF/H/Wから一件を選ぶ。target81は参照source `05198dba7959cc95e0c4d770fd85557ad4010a80`、実WASM source `d578ec006571d82bc50c6c2935d78ae6ea838269` でencode・独立raw decode・取消後再実行・保存読戻しまで合格した。全工程は17,624.837秒だった。既存参照とbundleが揃う場合は保存済み証拠を使い、取得確認のために再生成しない。以下は再現先に参照がなく、新規directoryで同じcaseを確認する例である。参照生成とWASMのsourceを個別に記録し、過去runへ最新SHAを付け替えない。

```sh
VAE_RUN_SOURCE_SHA=$(git rev-parse HEAD)

python tools/inference/vae/stream_reference.py \
  --case-id target-f81-480x832 --operation both \
  --model /workspace/work/models/vae/wan_2.1_vae.safetensors \
  --deps /workspace/work/inference/vae-proof/deps \
  --execution-source-sha "$VAE_RUN_SOURCE_SHA" \
  --output /tmp/kw-vae-new-target81-reference

python tools/inference/vae/accept_stream.py \
  --bundle /tmp/kw-vae-stream-threads4-20261102 \
  --reference /tmp/kw-vae-new-target81-reference \
  --operation both \
  --execution-source-sha "$VAE_RUN_SOURCE_SHA" \
  --controls --timeout-seconds 21600 \
  --output /tmp/kw-vae-new-target81-wasm
```

referenceが完了したことを確認してからbrowserを起動する。target81の取消・復帰とboth実行には21,600秒を例示し、環境に応じた明示deadlineを記録する。所要時間を保証する値ではない。timeout/resource失敗を小shapeへの置換で合格扱いしない。`--preflight-only` はcapabilitiesとsource/storage確認のみでNNを動かさない。

新規に受け入れた `diagnostic-f5-16x32`、`reference-f1-16x16`、`reference-f1-16x848`、`reference-f1-848x16` の各run sourceは `cc9b37f82ed855b36261d92429a822528bc24a71`。同じtoolを使い、`--reference` に対応する完了済みref directory、`--bundle` に明示threads4 bundleを選ぶ。F5診断のrefは `/tmp/kw-vae-ref-temporal-f5-16x32-20261102`、browser出力は `/tmp/kw-vae-wasm-thread4-temporal-f5-16x32-20261102`。参照境界のrefは `/tmp/kw-vae-ref-reference-f1-16x16-20261102` 等、browser出力は `/tmp/kw-vae-wasm-reference-f1-16x16-20261102` 等である。target81や848×848の別scopeの代わりには数えない。848×848などの最新受入状態はVAE-RESULTを参照する。

planへのF5診断追加に伴って旧参照を再計算する必要はない。`reference_contract.py` は作成時commitのplan/tool bytes/hashと、現在の選択case・model/source/precision/gate/patternを照合し、意味が同じ場合だけ既存参照を再利用する。現在のplan全体hashを古いreceiptへ書き換えない。

source F4/5/80/81の独立参照用causal prefixを派生する場合は `derive_stream_prefix.py` を用い、完了済みtarget81と別実行direct F1双方のreport SHAを明示する。per-channelのNCTHW axis2で抽出し、flat prefixや別空間へのcropを許可しない。派生statusは `DERIVED_CAUSAL_PREFIX_REFERENCE`、新規model load/NN実行0。親とdirect F1のhash・全値bridgeを保持し、派生を新しい元vendor推論と記録しない。F4入力は4frameのうち1frame、F80入力は80frameのうち77frameを元のcausal規則で処理し、未使用末尾3frameと全入力contextをmetadataへ残す。派生参照があるだけではactual F4/F80のowner呼出しを確認したことにはならず、実WASM出力の全値照合は別に必要である。未完了targetのpartial reportを親には使えない。

source oracleは未変更vendorの `WanVAE_.encode/decode`、raw scale `[0,1]` を直接呼ぶ。encode用RGBとdecode用独立raw latentは別の事前固定pattern。encodeのmeanをdecode独立入力として流用しない。RGB patternは `((c*71+t*13+y*5+x*3)%257-128)/128`、raw latentは `((c*17+t*11+y*7+x*5)%257-128)/512`。全値比較はatol/rtol/maxAbs0.002、shape/layout/meaning/hash/保存metadataも照合する。

`--controls` は最初の実chunk完了後に取り消し、同じAPIで正常再実行を一度行う。保存は実WKT writer/reader、取消は実owner Workerで確認する。保存digestそのものをmodule cancelで中断したという意味ではない。

出力の `acceptance-results.json`、`resource-measurements.json`、`resource-samples.jsonl`、`.wktensor` を一組で保持する。全値・metadata・mask・meaningの比較と、session/Tensor・owner Worker・live process・zombieの記録を別々に確認する。threads4では親Worker終了だけで子pthread終了まで確認済みとしない。診断hostはCDPで列挙できる親/pthread targetのcreate/destroyを収集し、操作後とdispose後、browserを閉じる前にbounded settlementを待つ。新規F5 runは計12 target、F1参照境界各runは8 targetを観測し、全destroyとその後の不在を確認した。非公開targetや物理RAM回収までの証明ではない。

### 独立raw decodeの取消境界

完了済みの小診断参照を再利用した追加制御runは、source `dccb88515775ec8aa86dd16f82e8816c9347ed38`。新しいprofileや参照を作らず、decodeのfirst chunk後取消→同一API再実行→全値比較・codec保存読戻しを確認する。既存結果を取得するだけなら再実行は不要。

```sh
python tools/inference/vae/accept_stream.py \
  --bundle /tmp/kw-vae-stream-threads4-20261102 \
  --reference /tmp/kw-vae-ref-temporal-f5-16x32-20261102 \
  --operation decode --controls --timeout-seconds 300 \
  --execution-source-sha dccb88515775ec8aa86dd16f82e8816c9347ed38 \
  --output /tmp/kw-vae-new-raw-decode-control
```

結果は [VAE-RESULT.md](VAE-RESULT.md) の独立raw decode制御行に分けて記録する。この小shapeの取消を大shapeの数値合格や実generated sampleに置き換えない。

## 資源とscope

このhostはCPU4、cgroup16GiB。workspace空き約1.3GBと `/tmp` tmpfs約8.8GBは別であり、tmpfsはRAMにも課金される。target81 RGB1本は388,177,920 B、latent1本は8,386,560 B。input・reference・WKT・download staging・host history・WASM・sessionを含むpeakはこの単体容量より大きい。

新graphはjob-owned host historyと同時1 sessionでWASM32bit heapを守るが、全shapeを資源保証したものではない。資源guardのreserve256MiBは操作上の設定である。RSS sumは共有pageを二重計上し得る。PSS・WASM capacity・cgroup current・inactive_file・shmemを混ぜて単一の「必要RAM」へ置き換えない。

既存合格は元のmodel/graph/source/shape/promptのscopeで再利用し、変更境界だけを新しく検証する。実generated sampleの受入・Diffusionとの結合・管理保存・製品生成READY・merge/Pages公開は、この単体コマンド群の自動処理に含めない。
