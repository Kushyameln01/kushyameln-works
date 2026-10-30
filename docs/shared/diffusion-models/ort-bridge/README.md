# Hike → ORT WASM → Hike 部分演算

実Q射影の切出し16行×5120列を使い、次の処理を実行する独立した部分演算です。

1. Hike WASM: E4M3FNの復号とscale乗算。
2. ORT Web1.24.3 WASM: FP32のGemm（biasなし、transB=1）。
3. Hike WASM: 実biasの加算。

`stage.mjs` の `createOrtProjectionStage()` → `run({q,scale,bias,x})` で呼び出し、`dispose()` で自分のsessionを解放します。`q`は81920-byte Uint8Array、xは5120要素、biasは16要素のFloat32Arrayです。Workerからの公開操作は親APIの `linearProjection` を利用してください。取消は親APIが所有Workerを終了します。

`projection.onnx` は220-byteの部分graphで、モデル重みを含みません。`node build-graph.mjs`で再生成でき、runtimeが `graph.mjs` から作るものと同じhashになります。Hike source/build/ABI/hashはkernel/、実ブラウザ検査はbrowser-results.json。

ORTは同じ固定公開commitから取り込んだJS/WASMを使い、executionProviders=['wasm']、numThreads=1、proxy=falseです。HikeとORTは別Memoryとして扱い、bufferをcopyして渡します。pointerの共有やzero-copyを保証しません。

検証:

```sh
node test-kernel.mjs
python test-browser.py
```

実重み試験には親linear/のprivate fixtureが必要です。`linear/extract-fixture.py`の手順で保存済み原本から作り、公開・commitへ含めません。全32出力を事前許容値abs1e-4+rel1e-5で独立参照と比較します。

これは合成activationを使った部分graph・tensor境界の確認です。5120列は実寸ですが出力は16行の切出しです。全model変換・元FP8 scaled_mm算術・全shapeの実行合格ではありません。
