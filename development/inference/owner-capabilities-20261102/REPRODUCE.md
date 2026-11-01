# 通常owner境界の再現

今回のNN実行sourceは`b2541fd2e3b7edcecd810f5215b1bd9f86afc0f4`。再現には監視終了を修正したharness `94e1d5f2a28880a514bdec53059342a03e04a83f`を使う。production closureはbyte同一で、当該修正後の起動/能力照会/終了は推論0で別検証済み。配布headや修正版sourceを過去のNN実行sourceへ付け替えない。元資材は再利用し、新規export・参照再生成は不要。

## モデルなしの境界検査

repo rootで実行する。

```sh
node tools/inference/test-owner-capabilities.mjs
node tools/inference/test-text-normalization.mjs
node tools/inference/test-normalized-marker.mjs
node tools/inference/test-connection-contract.mjs
node tools/inference/test-controller.mjs
node tools/inference/test-external-api.mjs
node tools/inference/vae/test-api.mjs
node tools/inference/text-encoder/test-runtime.mjs
```

Text runtime試験のORT doubleはlifecycle検査であり、NN精度受入ではない。Pythonは`python -m unittest discover -s tests -p 'test_*.py'`と、`-s tools/inference/text-encoder`、`-s tools/inference/vae`を個別に指定する。親`tools/inference`だけのdiscoverは子ディレクトリを走査しないため、0件を合格数へ加算しない。`vae/test-peer-boundary.mjs`は引数必須の過去E6 CLIで、0引数unit試験ではない。

## 非公開の既存資材

| 引数 | 必要な既存資材 |
| --- | --- |
| `--vae-bundle` | Rect manifest、encode.onnx、decoder-body.onnx、conv2-weight.f32、conv2-bias.f32。manifest SHA `450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a` |
| `--vae-references` | E6独立参照のreference-report.json、png-unit/mean/roundtrip.f32。モデルsource Wan2.1 `9737cba9c1c3c4d04b33fcad41c111989865d315` |
| `--text-bundle` | 既存24graph、finalNorm、embedding row hash表、spiece.model、manifest。manifest SHA `aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f` |
| `--text-source` | 元UMT5 `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`、6,735,906,897 B |
| `--text-reference` | 既存plain-input.json、reference-results.json、plain-reference.f32。oracle実行source `5537b8932343aa2476b95191817e8913f99dab02` |

これらの参照/gateは**診断harnessだけ**が読む。通常APIはmanifest/filesと通常入力だけを受ける。元モデル・graph・8MiBの実Text payloadをGitHubへ重複pushしない。

## 通常実行の実WASM検査

既存Chromium/Python Playwright/NumPy/psutilを使用する。未導入の場合だけ環境側で用意する。本harnessは依存の自動導入、モデルの取得・exportをしない。次のpathは今回使った実入力であり、別環境では対応する受領済みディレクトリへ置換する。

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/inference/accept-owner-normal.py \
  --execution-source-sha 94e1d5f2a28880a514bdec53059342a03e04a83f \
  --vae-bundle /workspace/work/inference/e6-rect/accepted-bundle \
  --vae-references /workspace/work/inference/e6-rect/references \
  --text-bundle /workspace/work/inference/text-implementation/bundle \
  --text-source /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --text-reference /workspace/work/inference/p2-p3-20261101/plain/oracle \
  --output /private/new-owner-normal-run
```

出力先は新規かつdocs外にする。実モデル推論は直列で、Rectの実run取消→復帰encode→mean decode→plain Hello worldの24層一件→次のText load/hashで取消、の順。Textの取消確認は2件目の24層推論を行わない。既存参照に対してRect全128 mean/1,536 RGB、Text全2,097,152値と512 maskを比較し、codec保存・読戻しも確認する。normal resultにevidenceがないことを検査する。

通常設定/能力照会と終了だけを確認する場合は同じ引数に`--preflight-only`を加え、別の新規出力先を使う。実ChromiumでWorker起動0/推論0を確認し、downloadや数値比較は行わない。今回の終了修正検証はこのscopeであり、修正後のfull24層を再実行した意味ではない。

source配信は固定commitとのbytes一致を確認し、path/bytes/SHA-256をbrowser-results.jsonへ記録する。観測Workerは実ORTへ委譲し、input/output metadataを保持する。数値演算を独自実装しない。browser-results.json、resource-measurements.json、normal-conditioning.wktensorは非公開出力へ回収される。GitHubのdiagnosticsには詳細結果とpayload hashを保存し、元model/graphは保存しない。

完了時はsession/Tensor/Workerの正常終了とWorker取消を区別し、owned childの途中zombie・reap・終了後live/zombieを別記する。100ms sampled RSS/PSSを正確なdevice peakや全workflowの資源保証へ広げない。
