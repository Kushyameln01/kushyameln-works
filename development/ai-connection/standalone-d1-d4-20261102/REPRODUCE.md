# 制御N5/L3の再現手順

この手順は元81frame workflowとは別の制御入力を使う。targetとsourceは
`[1,16,1,2,4]`、reference_videoは`[1,16,1,2,2]`で、合計N5。
Textは全3行を保持する制御値であり、実Text Encoderの出力ではない。
通常の公開`load/predict/sample`は`NOT_READY`を維持する。

`reproduce.py`は既存の参照実装を使い、fixture生成式、数値演算、shape規則、
gateを追加しない。元参照スクリプト内の提供者環境の絶対パスだけを、指定profileで
再現し検証した保存形のcacheへ付け替える。契約の再freezeや上書きは行わない。

## 必要なもの

- この配布の固定commitをcheckoutしたLinux環境。以下はrepository rootで実行する。
- Python 3.10以降、NumPy、Python Playwright、Chromium。Playwrightのブラウザ取得はこの手順には含めない。
- 既に取得した元HIGH／LOWファイル。各`15,574,833,216` bytesで、合計約29.0 GiBの保存容量が必要。
- ブラウザ推論を順次実行できる資源。今回の小N5の実測と原寸の未受入事項は
  `RESULT-RESOURCE.md`を参照。参照計算とブラウザ計算は並列に起動しない。

モデルのファイル名は次のとおり。helperはモデルをダウンロードせず、全モデルの
SHA-256を再計算しない。元の全体識別、header、file長、実行中のstatを区別する。

| side | ファイル名 | 元モデルSHA-256 |
| --- | --- | --- |
| HIGH | `Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors` | `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52` |
| LOW | `Bernini_LOW_fp8_e4m3fn_scaled.safetensors` | `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` |

## 軽い準備と取得照合

`BERNINI_MODEL_DIR`だけ実際の保存先へ変更する。出力名は新しいものを使う。
private directoryは所有者のみ読めるmode0700、tensor／保存sampleはmode0600で扱う。

```sh
BERNINI_MODEL_DIR=/absolute/path/to/models
REPRO_TOOL=development/ai-connection/standalone-d1-d4-20261102/reproduce.py
REPRO_PRIVATE=/tmp/bernini-reproduce-inputs
REPRO_UPSTREAM=/tmp/bernini-reproduce-upstream
REPRO_METRICS=/tmp/bernini-reproduce-metrics
REPRO_SOURCE_SHA=$(git rev-parse HEAD)
mkdir -p "$REPRO_METRICS"

PYTHONDONTWRITEBYTECODE=1 python "$REPRO_TOOL" prepare \
  --private-dir "$REPRO_PRIVATE" --upstream-dir "$REPRO_UPSTREAM" \
  --fetch-sources --capture-profile retained-plus-lf-v1
PYTHONDONTWRITEBYTECODE=1 python "$REPRO_TOOL" self-test --upstream-dir "$REPRO_UPSTREAM"
```

`--fetch-sources`が取得するのはComfyUI
`b5a432157de6b8884f81104cd02926adf4d597e4`の5つの小さなPython sourceだけである。
rawのbytes／SHA-256／実Git blob識別を検査し、`cache/raw/comfy/...`へそのまま残す。
既存の独立参照が固定していた保存形は、rawへ末尾LFを1つ追加したbytesだった。
そのため、取得時は`--capture-profile retained-plus-lf-v1`を明示して、
`cache/comfy/...`へその保存形を作り、凍結済みの保存bytes／SHA-256を検査する。
profile指定がなければ変換せず拒否する。任意の改行修正やhash不一致時のfallbackは行わない。

[RAW-SOURCE-CAPTURES.json](RAW-SOURCE-CAPTURES.json)にrawと保存形の両識別、
実取得した5ファイルのbyte関係、AST一致を記録した。旧
`a0/core-source-manifest.json`のbytes／SHA-256／gitBlobSHA1は保存形の識別であり、
upstream Git treeのblob識別とは区別する。凍結済み契約と数値sourceは変更しない。
既に同じ保存bytesをcacheへ置いた場合は取得・変換の2オプションを省略できる。
異なる既存ファイルは上書きしない。取得したPython sourceは実行せず、元参照が
必要な定数をASTから読む。

生成する`input.json`は既存`controlled_fixture()`／`private_write()`を使う。
正確なサイズは`162,181` bytes、SHA-256は
`a30177ba13a922f29b8d9664ff1b24bc68d6a1e308c95e3a6faf23f402751d3c`。
同じ既存fixtureは再利用し、異なる内容や権限のファイルは拒否する。
fixture中の旧提供者パスは元のmetadata文字列であり、その場所へのアクセスや取得ACKを意味しない。
この段階ではモデル重みの読出しやNN推論を行わない。

## 全40blockの独立参照とブラウザ照合

次は実モデルを読む重い検証である。`LOW`と`HIGH`を個別に順次実行する。
最初の`--check-only`はsource／fixture／モデルstatの検査だけを行う。
実行中にHEADや対象sourceを変更しない。`--source-commit`は現在checkoutした
固定SHAを指定する。配布commitからの再実行では、そのcommitの同一runtime bytesが
検査対象になり、新しいreceiptへ実際のSHAが記録される。

```sh
PYTHONDONTWRITEBYTECODE=1 python docs/shared/diffusion-models/execution/model-candidate-browser.py \
  --source-commit "$REPRO_SOURCE_SHA" --side LOW --models "$BERNINI_MODEL_DIR" \
  --core "$REPRO_UPSTREAM/comfy/ldm/wan/model.py" --fixture "$REPRO_PRIVATE/input.json" \
  --private-output "$REPRO_PRIVATE/low-native.json" --output "$REPRO_METRICS/low-native.json" --check-only

PYTHONDONTWRITEBYTECODE=1 python "$REPRO_TOOL" reference --kind full40 --upstream-dir "$REPRO_UPSTREAM" -- run \
  --side LOW --models "$BERNINI_MODEL_DIR" --fixture "$REPRO_PRIVATE/input.json" \
  --output "$REPRO_PRIVATE/low-reference.json" --receipt "$REPRO_METRICS/low-reference.json"

PYTHONDONTWRITEBYTECODE=1 python docs/shared/diffusion-models/execution/model-candidate-browser.py \
  --source-commit "$REPRO_SOURCE_SHA" --side LOW --models "$BERNINI_MODEL_DIR" \
  --core "$REPRO_UPSTREAM/comfy/ldm/wan/model.py" --fixture "$REPRO_PRIVATE/input.json" \
  --private-output "$REPRO_PRIVATE/low-native.json" --output "$REPRO_METRICS/low-native.json"

PYTHONDONTWRITEBYTECODE=1 python "$REPRO_TOOL" reference --kind full40 --upstream-dir "$REPRO_UPSTREAM" -- compare \
  --reference "$REPRO_PRIVATE/low-reference.json" --reference-receipt "$REPRO_METRICS/low-reference.json" \
  --candidate "$REPRO_PRIVATE/low-native.json" --output "$REPRO_METRICS/low-comparison.json"
```

HIGHでは`--side HIGH`と、新しい`high-*`の出力名を使う。両sideの完了と資源解放を
確認してから次の6更新へ進む。全47配列の比較を、timestep750の制御caseとして扱う。

## HIGH3→LOW3の6更新と保存・読戻し

独立参照とブラウザを順次実行する。`--diagnose`は開発検証用で、全6回の実40block
prediction後に16配列を保存する。通常のcandidate入力には参照・gate・receiptを渡さない。
`--diagnose`なしの通常candidate sampleは最終raw sampleのみを保存するため、
16配列の開発比較には昇格させない。

```sh
PYTHONDONTWRITEBYTECODE=1 python "$REPRO_TOOL" reference --kind sample --upstream-dir "$REPRO_UPSTREAM" -- run \
  --models "$BERNINI_MODEL_DIR" --fixture "$REPRO_PRIVATE/input.json" \
  --output "$REPRO_PRIVATE/sample-reference.json" --receipt "$REPRO_METRICS/sample-reference.json"

PYTHONDONTWRITEBYTECODE=1 python docs/shared/diffusion-models/execution/model-sampler-browser.py \
  --source-commit "$REPRO_SOURCE_SHA" --models "$BERNINI_MODEL_DIR" \
  --core "$REPRO_UPSTREAM/comfy/ldm/wan/model.py" --fixture "$REPRO_PRIVATE/input.json" \
  --private-output "$REPRO_PRIVATE/sample-native.json" --output "$REPRO_METRICS/sample-native.json" \
  --diagnose --check-only

PYTHONDONTWRITEBYTECODE=1 python docs/shared/diffusion-models/execution/model-sampler-browser.py \
  --source-commit "$REPRO_SOURCE_SHA" --models "$BERNINI_MODEL_DIR" \
  --core "$REPRO_UPSTREAM/comfy/ldm/wan/model.py" --fixture "$REPRO_PRIVATE/input.json" \
  --private-output "$REPRO_PRIVATE/sample-native.json" --output "$REPRO_METRICS/sample-native.json" --diagnose

PYTHONDONTWRITEBYTECODE=1 python "$REPRO_TOOL" reference --kind sample --upstream-dir "$REPRO_UPSTREAM" -- compare \
  --reference "$REPRO_PRIVATE/sample-reference.json" --receipt "$REPRO_METRICS/sample-reference.json" \
  --candidate "$REPRO_PRIVATE/sample-native.json" --output "$REPRO_METRICS/sample-comparison.json"
```

成功時は`sample-native.json.wktensor`を実ファイルとして保存し、同じファイルを
ブラウザFile入力から再読込する。全payload bitとlatentContract、HIGH／LOWのproducer、
raw／restored状態を照合する。参照との誤差gateは既存契約の
`abs=.01 + rel=.001*abs(reference)`を保ち、非有限値や不足配列を拒否する。

公開metricsはhash・shape・計数・誤差・時間だけを含む。tensorの全値、参照値、
保存sampleはprivate directoryに残す。この結果から原寸、全query、実L512 Text、
LoRA、本番precision、VAE decode、製品生成READYを受け入れたとは扱わない。
