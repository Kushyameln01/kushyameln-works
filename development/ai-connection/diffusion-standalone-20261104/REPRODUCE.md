# 固定sourceでの再現

他推論moduleや実LoRAを起動せず、保持済みHIGH／LOWと保存入力を使う。モデルの名前・bytes・既往full SHA／現在照合するheader SHAは [SAVED-INPUTS.md](SAVED-INPUTS.md) を参照する。通常APIは参照・gate・保存サンプルhashを要求しない。以下のsource固定とhash照合は開発検証側の手順である。

## 保存入力

既存Git checkoutに固定objectsがなければ、明示的に取得する。

```sh
git fetch origin f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48
git fetch origin ffeeeedb6b57d182a977c3ac02c042ce235fc87a
python tools/diffusion-models/recover-standalone-inputs.py
```

既存出力を上書きしない。既に復元した環境では、保存receiptのbytes／SHAと実ファイルを照合して再利用する。別pathへ復元する場合は `--full-dir`／`--small-dir` を指定し、path変更後のmanifest hashを新しいidentityとして記録する。値の再推論・再exportは行わない。原寸別caseは73947 token、小caseはN5／実L512である。

## 実公開weight接続

source `a23d5276d705605903afa599b1e049f62948d094` を別worktreeへ固定する。`--models`は両原本を置いたディレクトリ。

```sh
python tools/diffusion-models/public-weight-feed-browser.py \
 --source-commit a23d5276d705605903afa599b1e049f62948d094 \
 --models /workspace/work/retained/bernini --wasm-threads 1 --coi false \
 --transport both --output /tmp/public-weight-pages1.json

python tools/diffusion-models/public-weight-feed-browser.py \
 --source-commit a23d5276d705605903afa599b1e049f62948d094 \
 --models /workspace/work/retained/bernini --wasm-threads 4 --coi true \
 --transport both --output /tmp/public-weight-explicit4.json
```

direct／outer、両sideのbase read・通常完成F32検査・切替・解除・取消・reloadを実APIで行う。NN全体や実LoRAの試験とは区別する。4/noCOIは拒否し、fallbackしない。

## 公開1-thread predictと独立比較

NN sourceは `d2a0d074ad5196940301f7107c6577c5fa48158c`。このworktreeで次を実行した。PlaywrightとChromiumが必要で、private親ディレクトリは0700とする。

```sh
python tools/diffusion-models/public-model-browser.py \
 --source-commit d2a0d074ad5196940301f7107c6577c5fa48158c \
 --manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
 --models /workspace/work/retained/bernini --mode predict --side HIGH \
 --wasm-threads 1 --coi false \
 --private-output /tmp/private-bernini/predict \
 --output /tmp/public-high-pages1.json --timeout-seconds 12000

python tools/diffusion-models/production-reference.py execute-reference \
 --manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
 --contract development/ai-connection/d1-d4-production-20261102/reference/small-real-l512-preexecution.json \
 --models /workspace/work/retained/bernini --operation predict --side HIGH \
 --private-dir /tmp/private-bernini/reference --receipt /tmp/high-reference.json
```

比較toolは修正済みsource `cacef11ab8d92091f59edb7abe2b665088b08922` を使う。NNをやり直さず、保存したnative／独立参照だけを読む。

```sh
python tools/diffusion-models/compare-public-model.py \
 --native-receipt /tmp/public-high-pages1.json \
 --actual-f32 /tmp/private-bernini/predict/tensor.f32 \
 --reference /tmp/private-bernini/reference/reference.json \
 --reference-manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
 --source-commit d2a0d074ad5196940301f7107c6577c5fa48158c \
 --reference-source-commit d2a0d074ad5196940301f7107c6577c5fa48158c \
 --output /tmp/public-high-pages1-comparison.json
```

単独predictの参照には、hashが一致するmanifest本体のtimestep1000、全40block・全N head・全target unpatchのcoverageが必要である。六更新の数値受入へは読み替えない。

## 原寸block0の逐次再試験

source `8ddefbafdb27ce8a0451c3ad5ba36d63729acd87` を固定する。別のNN試験と同時実行しない。最初の並列試験で共有16GiB上限のOOMを観測したため、組合せ資源予算の受入前に並列化しない。参照用backingとraw成果はGit外のprivate領域へ保存する。

```sh
python tools/diffusion-models/observe-process-run.py \
 --output /tmp/original-block0-resources.json --interval 2 \
 --post-cleanup-seconds 3 --max-observations 1800 -- \
 python tools/diffusion-models/production-chunk-browser.py \
 --source-commit 8ddefbafdb27ce8a0451c3ad5ba36d63729acd87 \
 --manifest /tmp/d1-d4-production-73947-inputs/inputs.json \
 --contract development/ai-connection/d1-d4-production-20261102/reference/full-declared-preexecution.json \
 --model-dir /workspace/work/retained/bernini --side HIGH \
 --operation blocks --block-limit 0 --wasm-threads 4 --reference-threads 1 \
 --skip-prefix-comparison --decoder lookup --read-ahead-bytes 1048576 \
 --private-reference-dir /tmp/private-bernini/original-reference \
 --output /tmp/original-block0.json --diagnostic-timeout-seconds 36000
```

`--skip-prefix-comparison`は、変更されていないprefix／post-modulationの既存数値証拠を再利用する選択である。native計算を省かず、全K/V・self／cross／FFNを独立比較する。完了判定ではJSONの `passed`、全selected stageのcoverage、source前後、cleanupを読む。この版の診断processは失敗receiptでもexit0となり得るため、exit codeだけで合格にしない。

完全40block/headは同runnerの `--operation predict`、六更新は `--operation sample` に分離して実装した。sample比較は六つの完全predict出力と16個のsampler状態／handoff／復元を対象とし、全block中間比較とは別scopeである。必要な前段の数値・資源gateが合格してから進め、部分runを受入済みに数えない。

RoPE cacheの新sourceと容量は [ROPE-MATRIX-CACHE.md](ROPE-MATRIX-CACHE.md)、次候補の未受入事項は [resident-ort/FEASIBILITY.md](resident-ort/FEASIBILITY.md) を参照する。native buffer probeや容量用storeだけで、モデル生成が成立したとは扱わない。
