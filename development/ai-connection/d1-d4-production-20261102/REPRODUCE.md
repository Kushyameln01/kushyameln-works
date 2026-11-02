# 再現手順（保存入力・baseのみ）

他の推論moduleは起動しない。privateなモデル・入力tensorはGitへ含めない。必要資材は[入力契約](input-contract/README.md)のpath／bytes／SHA-256で照合する。元媒体がない状態を、元workflowの実測値で補わない。

モデルはユーザーが保存を指示したHuggingFace revision `5890255e5742d12ecf40d159dc01c7d647501c40` の `Kijai/WanVideo_comfy_fp8_scaled/Bernini/` にある次の2ファイル。

- `Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors`、15,574,833,216B、SHA-256 `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52`
- `Bernini_LOW_fp8_e4m3fn_scaled.safetensors`、同bytes、SHA-256 `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3`

元mxfp8との同一性・元環境の計算dtypeは未確認。今回の固定scaled-FP8 loader／F32 baselineを使用する。既存の完全hash確認を再利用し、実行前後はFile statと固定header/profileを照合する。各NN runで完全hashを取り直したとの主張はしない。

## 軽量確認

```sh
python docs/shared/diffusion-models/api/build-info.py
python tools/diffusion-models/check-build.py
node --experimental-test-module-mocks --test --test-isolation=none docs/shared/diffusion-models/api/test/model-adapter.test.mjs
node --test --test-isolation=none docs/shared/diffusion-models/api/test/model-host.test.mjs tools/diffusion-models/test-public-model-browser.mjs
node --test --test-isolation=none docs/shared/diffusion-models/execution/test-capabilities.mjs docs/shared/diffusion-models/execution/test-model-capabilities.mjs
python tools/diffusion-models/production-reference.py self-test
python tools/diffusion-models/test-observe-process-run.py
python tools/diffusion-models/test-compare-public-model.py
python tools/diffusion-models/production-chunk-browser.py --self-test
```

adapterのmodule mockはNNを行わない。同じprocessでそのmockを有効にしたまま実NNの試験へ進めない。通常の数値owner試験とは別processで実行する。

## 入力と独立参照

`production-reference.py prepare-small` は保持済みN5 fixtureと実Text L512 native JSON、`prepare` は明示した原寸別caseを保存する。`--text`で対応する保存JSONを渡せる。Textのpayload／mask／model／Tokenizerを照合し、元producerのfinal RMSNormに対応するmetadata liftのみ行う。入力manifest・contractの一致は診断runner側の記録であり、通常load/predict/sampleのフィールドには渡さない。

本環境の保存入力は次の2件。

- `/tmp/d1-d4-real-l512-n5-inputs/inputs.json`：N5、target2＋source2＋reference_video1、実L512。元媒体の再現ではない。
- `/tmp/d1-d4-production-73947-inputs/inputs.json`：原寸target32760＋source32760＋参照画像3×2809、実L512。source81frames相当等はこのcaseの宣言値。

独立6更新の実行は、固定reference source `3e68d2fc54c67b16f8a82002f69fa183674a9f14` にある `production-reference.py execute-reference --operation sample` を使用した。`reference/small-real-l512-preexecution.json` にsource・入力identity・gateを固定済み。手順・全16配列の識別は[reference資料](reference/README.md)を参照。開発比較はbinary chunk単位で行い、reference出力をnative入力へ渡さない。

## 公開Worker

公開predictとsmokeの実行sourceは `7cf77c21889d9642e61d9a41d3242a816e24d6be`、原寸probeと取消後のsample runnerは `0f761f374dce1d447bbb912ad13c08f9bf85c279`。全NN本体は同じ生成build `diffusion-models/0.1+134d002dbab74539d95d66e529bcd34f4e6b4a87459856359195a6876ba1a386`。固定sourceへcheckoutして実行し、実行中にHEAD・guarded bytesを変更しない。レポートやreceiptの配布commitとは区別する。

freshな0700のprivate親ディレクトリを用意し、[公開runner手順](../public-worker-20261102/README.md)の `--mode smoke`／`--mode predict --side HIGH`／`--mode sample --cancel-before-run` を実行する。モデルはHTML File inputで選び、HTTPでmodel bytesを配布しない。明示4-threadにはCOOP/COEPとSharedArrayBufferが必要で、未対応環境で1-threadへ黙ってfallbackしない。GitHub Pagesにこれらのheaderを自動付与する実装ではない。

各commandは `tools/diffusion-models/observe-process-run.py --output <fresh-resource.json> --interval 0.5 -- <command...>` で起動した。gatepipeでexec前から観測し、終了後までRSS/PSS・共有cacheを記録する。fullcaseとsampleの重い処理は同時実行しない。

公開出力の数値比較は `compare-public-model.py --native-receipt <public-result.json> --actual-f32 <private/tensor.f32> --reference <private/reference.json> --source-commit <full-execution-sha> --output <fresh-comparison.json>` を使う。HIGH/t1000はvelocity00、sampleはfinalRawを比較する。保存ファイルはnormal saveTensorが作り、実ディスクへ書いたFileを再選択してnormal readTensorで全bit・canonical metadataを照合する。

## 原寸chunk比較

[chunk runner手順](reference/CHUNK-BROWSER.md)のfullcaseを使う。本runは `--block-limit 0 --diagnostic-timeout-seconds 1800`。これは事前に選んだ運用上の診断枠で、精度／対応可否の判定gateではない。stopAfterBlock診断が返すものは診断metadataでありvelocityではない。未完了なら部分coverage・実operator・nativeと参照側の時間・cleanupを記録し、完全predict／6更新へ昇格させない。

巨大な全中間tensorの保存は要求しない。最大128行・8MiB以下のbinaryを比較して解放する。参照用memmap・子processは取消後もclose／join／unlinkを確認する。実行条件・資源範囲は[RESOURCE-METHOD](RESOURCE-METHOD.md)を参照。
