# Bernini workflowの固定scheduler・CONST計算

対応profileは `bernini-comfy-simple6-shift5-v1`。固定ComfyUI sourceと添付workflowのsimple6、shift5、1000-point表、split3に対応します。乱数生成やニューラルモデル実行は行いません。

`createSchedulerKernel(module)` は `schedule`、`timesteps`、`noiseMix`、`inverseNoiseScale`、`flowDenoised` を提供します。全数値計算はHike WASM。sourceの式・演算順・native ABI・実行結果はcontract.jsonを参照してください。

HIGH末尾とLOW先頭のsigmaは重複しますが、そのまま配列を連結してよいという意味ではありません。ComfyUIにはinverse noise scalingとraw/normalized latent空間の変換があり、この部品は空間変換を代行しません。velocityをdenoisedと呼び替えず、明示した `flowDenoised` を通します。

```sh
DIFFUSION_TOOLCHAIN=/workspace/work/diffusion-investigation/toolchain python build.py
node test.mjs
python test-browser.py
```

専用HTTP serverとブラウザは試験後に終了します。work/はprivateな実行記録用でgitignore対象です。親APIはこれらの操作を必要時だけWorker内へ読み込みます。
