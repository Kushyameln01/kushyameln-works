# P1導入後の再受領

Node24でrepo rootから実行する。モデル推論やBrowserは不要。既存のRect bundle4assetは実bytes/hash検査のため必要で、原本を再exportしない。

```sh
export WKW_P1=/absolute/new-private/p1-assessment
export WKW_RECT_BUNDLE=/absolute/private/existing-accepted-rect-bundle
mkdir -p "$WKW_P1/manager" "$WKW_P1/diffusion"
git fetch origin edda43f9ea69c5b3ab1af3c6eb82295f2912887c
git archive edda43f9ea69c5b3ab1af3c6eb82295f2912887c docs/shared/ai-connection | tar -x -C "$WKW_P1/manager"
git fetch origin 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3
git archive 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 docs/shared/diffusion-models docs/shared/inference/tensor.mjs | tar -x -C "$WKW_P1/diffusion"
node tools/inference/vae/check_p1_rect_adoption.mjs --manager-root "$WKW_P1/manager" --diffusion-root "$WKW_P1/diffusion" --bundle "$WKW_RECT_BUNDLE" --output "$WKW_P1/run"
```

`run`はfresh directoryにする。期待結果は`passed:true, positiveEdges:2, negativeCases:9, newNeuralExecutions:0`。実managerのReferenceSetとevaluateEdgeを同じmodule系統で使う。manager内の旧tensor codecをG1Cと同一扱いしない。

`result.json`のreadyはcontract/file assessmentだけで、新たなNN実行のreadyではない。元35151d1のreceiptは全file/input/output hashで対応付け、過去のstatus・sourceを改変しない。normalized wire markerの非対応も維持する。

関連する既存の小さい検査は、manager完全checkoutで次を実行できる。

```sh
node tools/ai-connection/test-reference-loader.mjs
node tools/ai-connection/test-norm-bindings.mjs
```

今回のprocess記録は、既存`tools/inference/vae/process_lifecycle.py`のProcessOwnershipで直接起動したNode子processだけを観測したもの。新規Browser/Worker/sessionの停止を試した記録ではない。
