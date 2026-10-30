# 実重みFP8線形演算の検証候補

本番モデルへ未採用の内部数値部品。合成activationと実LOW/HIGHのQ射影16行×5,120列を使う。実施結果・ABI・hash・限界はreport.json、root再実行結果はdevelopment/diffusion-models/linear-*-results.json。

再現（このディレクトリで実行）:

```sh
DIFFUSION_TOOLCHAIN=/workspace/work/diffusion-investigation/toolchain python build.py
python extract-fixture.py --models-root /workspace/work/retained/bernini --output work
node test.mjs
python test-browser.py
```

work/に生成する元重み断片はprivateでgitignore対象。モデルと配布元hashのmanifestが必要。検査用に自身のloopback serverへ限定ファイルを一時配信し、終了する。rawWASMはcallerがpointerの範囲・shape・capacityを検査する内部ABIで、公開されたmodel推論APIではない。

HikeはFP8復号と乗算・加算を実行する。JSはcopy・有限値検査・結果回収。f32逐次蓄積は比較用候補であり、元ComfyUIのFP8scaled_mmと同じ演算経路と保証していない。全model推論・性能改善とは区別する。
