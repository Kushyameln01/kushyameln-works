# Textメモリ比較の再現

NN不要の確認では[SUMMARY.json](SUMMARY.json)、[INDEX.json](INDEX.json)と各gzipのSHAを照合する。gzip展開後のJSON長さ/SHAもSUMMARYの各run.evidenceに固定している。モデル・ONNX本体をこのGit成果へ追加していない。単なる取得ACKに再推論・再exportを要求しない。

## 実モデル比較

保持済みの元UMT56,735,906,897Bとprepared24graph18,523,750,008B、選択manifest19908B/SHA `aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f`、埋込Tokenizer、final norm、row hash表を使う。独立referenceは元5537の `plain-input.json/reference-results.json/plain-reference.f32` を再利用する。reference.f32は8,388,608B/SHA `e59ad16a82799a42fe82eb76b3c7438a70c4766be7d7c7eb9b18222bfb1c83a9`。oracle・graphの再export/再計算は含めない。

各sourceを別checkoutへ固定する。baselineは04d1447e3531836adbb013314e716f2403895443、途中候補は44b188633343cc2c93ea6f85aac348059ac42757、最終はeab4fabfadd133cc97434eed28ea998dca6795c2。helperはserved filesをその完全Git SHAのbytesと比較する。sourceを変えたまま古い実行SHAを付けない。reference sourceと今回のbrowser sourceは別引数である。

Node24、Python/numpy/psutil/Playwright、Chromium154の保持済み環境で、各`WKW_*`を実pathへ設定する。source model/graphは実Fileとしてブラウザへ選択する。CPU4core quota/ORT1thread/16GiB cgroup内でtask8GiBの独占NN leaseを使い、他NNと並列にしない。現在のdevice予算はその環境で評価し、ここにある旧予算を将来readinessへコピーしない。

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/inference/text-encoder/accept_plain.py \
  --plan "$WKW_ORIGINAL_PLAIN_PLAN" \
  --bundle "$WKW_EXISTING_TEXT_BUNDLE" \
  --source "$WKW_ORIGINAL_UMT5" \
  --reference "$WKW_EXISTING_5537_ORACLE_DIRECTORY" \
  --output "$WKW_FRESH_PRIVATE_OUTPUT" \
  --execution-source-sha "$WKW_ACTUAL_FIXED_CHECKOUT_SHA" \
  --reference-execution-source-sha 5537b8932343aa2476b95191817e8913f99dab02
```

出力先はfresh・非公開directory。成功はbrowser-results.jsonのpassed、元全値gate/finite/mask/zero padding、24session/release・72Tensor dispose、取消/Worker2/2、owned process live/zombie/errors0を確認する。各raw JSONのmemoryEvents/timelineはread/hash/create/run/release、WASM容量、PID/ctime/role、RSS/PSS、sample start/end/gapを記録する。API-visible累積bytes、WASM capacity、resident memoryを分ける。full/cancelのraw completePSS:nullは0や全suite peakへ補完しない。

最終sourceは `shared/vr180/sha256.mjs` の同origin配信を必要とする。独自hostを使う場合はこの追加assetとsource closureを含める。incremental observerのhookとHTTP route/source proofが追加されており、baselineとのhelper全体byte同一は主張しない。共通のRSS/PSS samplerとplain_memory probeは同一で、OS file cache/GCは強制しない。各1回ずつの比較であり、速度や一般端末の統計的benchmarkではない。

## 小fixtureと読戻し

```sh
node tools/inference/text-encoder/test-runtime.mjs
node tests/vr180-sha256.test.mjs
node tools/inference/test-connection-contract.mjs
python tools/inference/text-encoder/test_plain_checks.py
python tools/inference/text-encoder/test_plain_failure_controls.py
```

元runtimeとの差を再現する場合は、別の一時checkoutで新しいtest-runtimeを保持しruntimeだけ44bへ戻すと新4件が全量WebCrypto guardで失敗する。作業中のruntimeや旧receiptへ上書きしない。これらのfixtureは実モデル・P4・新VAE Profileの推論ではない。

最終の新実conditioningは `runs/incremental/plain-conditioning.wktensor`、元reference/manifest/mask/Tokenizerは元f76 packetへ結ぶ。新file/payload SHAと元source5537／今回実行eabはSUMMARYとconditioning-handoffに別保存している。既存f76を使うDiffusion試験の入力はそのまま保持し、別artifactへ切り替える場合はDiffusion ownerがinput cohort/reference/gateを固定し直す。

実媒体/slotのexact shapeとP5 producer/復元receiptが届くまでは、VAEの依存export・generated decodeへ進まない。原本・処理後F/H/W・slot/context/frame/time・model/producer/decoder・Diffusion復元の前後hash・独立gate/receiptが再開条件。細目は[PROFILE-READINESS.json](PROFILE-READINESS.json)。
