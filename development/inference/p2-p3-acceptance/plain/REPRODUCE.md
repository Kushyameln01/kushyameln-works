# plain独立比較の再現

実行sourceは`5537b8932343aa2476b95191817e8913f99dab02`です。source/Tokenizer/manifest/gateを固定し、新しい出力directoryでsource oracle→browserの順に直列実行します。元modelと既存bundleはGitに含めません。以下は今回使用した既存ローカル入力pathで、別環境では対応する実File/依存directoryを明示します。

以下の元受入を再現する場合は、実行source `5537b8932343aa2476b95191817e8913f99dab02` の隔離checkoutを使います。後続の[失敗終端guard修正](failure-controls/RESULT.md)は別sourceです。現行helperへ旧SHAを渡すと、意図したsource bytes guardが拒否します。guard修正確認のためのNN再実行は不要です。

CPU Torch2.6.0+cpu、safetensors、Python SentencePiece、NumPy、psutil、Playwright/Chromiumの既存環境を使用しました。新しいmodel/graphやGPU依存の取得、再exportは不要です。

## 軽量検査

```sh
python tools/inference/text-encoder/test_plain_checks.py
```

3件が合格します。合成配列はartifact/gate検査のテスト入力だけに使い、NN数値の合格には数えません。

## source oracle

```sh
python tools/inference/text-encoder/plain_reference.py \
  --plan development/inference/p2-p3-acceptance/plain/predeclared-plan.json \
  --bundle /workspace/work/inference/text-implementation/bundle \
  --model /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --deps /workspace/work/inference/vae-proof/deps \
  --tokenizer-deps /workspace/work/inference/tokenizer-python \
  --execution-source-sha 5537b8932343aa2476b95191817e8913f99dab02 \
  --output /private/fresh-plain-oracle
```

全24層のshapeが`[1,512,4096]`、strict keysが整合し、`reference-results.json`のpassed=trueを確認します。Oracleは短縮しない512位置を処理し、最後にsourceのmasked0を適用します。Torch processが終了するまで次を開始しません。

## 実WASMと取消

```sh
python tools/inference/text-encoder/accept_plain.py \
  --plan development/inference/p2-p3-acceptance/plain/predeclared-plan.json \
  --bundle /workspace/work/inference/text-implementation/bundle \
  --source /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --reference /private/fresh-plain-oracle \
  --execution-source-sha 5537b8932343aa2476b95191817e8913f99dab02 \
  --output /private/fresh-plain-browser
```

実Chromium file inputを使うため、元6.7GB FileをNode Blobへ変換しません。モデル/graphをHTTP配信・uploadしません。ローカルserverは固定commitとbyte一致する実module/WASMを配信します。

passed=true、全2,097,152値の比較、maxAbs≤0.001かつallclose、全padding厳密0、session24/24・Tensor.dispose72・最大1常駐、取消とWorker終端化、観測live/zombie別リストを確認します。sampled RSSは共有ページを重複計上し得るので、計画・実測・負荷改善の受入を混同しません。

元の受入済み出力は[証拠index](EVIDENCE-INDEX.json)と[P3 handoff](P3-HANDOFF.json)から読み出せます。再実行せず保存・読戻しだけを確認する場合は、各fileのbytes/SHAとnative `.wktensor` header/payload hash、mask、model/Tokenizerを照合します。
