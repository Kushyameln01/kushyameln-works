# 単体検証の再現

実行範囲と合否は [RESULT.md](RESULT.md)、通常の接続契約は [API.md](API.md) を参照する。重いNN/reference/exportは同時に走らせない。独立参照やgateは開発検証の入力であり、通常APIへ渡さない。

## sourceと原本の固定

repositoryは `Kushyameln01/kushyameln-works`、branch `codex/text-vae-standalone`、[Draft PR #18](https://github.com/Kushyameln01/kushyameln-works/pull/18)。初回公開commitは `3ea4ca34d50aef0da434985965b0b01105bbb8d8`。最終配布SHAはRESULTへ別記し、各runの実行sourceとは区別する。再現するrunのsourceへcheckoutし、変更のない状態で実行する。各toolは指定commitのsource bytesとの一致を検査する。

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
git diff --check
```

`test-stream-runtime.mjs` のORT Addは実WASMだが小演算helperである。metadata/control doubleや小channel source等価性を元VAEの81frame推論へ数えない。

## Text

固定planは [text/predeclared-plan.json](text/predeclared-plan.json)。case、独立full512参照、比較と取消の詳しい説明は [text/REPRODUCE.md](text/REPRODUCE.md) にある。既存9case独立参照はsource `5954d48e0fb6df1d6977964fd8a7ba2a242b6eff` で作成済み。現在のbrowser sourceと別に `--reference-execution-source-sha` を渡す。

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

上記は失敗を含むcanaryを再現する診断コマンドで、合格を保証しない。現在の既知結果はmaxAbs0.0016480088233947754でgate0.001に不合格。既存canaryを保持し、原因修正後のfresh出力と別に比較する。全512有効を短いmaskへ変更したりgateを上げたりしない。

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
