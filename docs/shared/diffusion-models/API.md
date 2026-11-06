# diffusion_models 外部API 0.1

[公開管理画面](../../ai-connection/)からローカルFileの選択、設定、実行、取消、結果取得と保存を行う。既存の[JavaScript API入口](api/index.mjs)と専用Workerを使い、新しい通信方式は追加していない。

この入口は固定native ownerを再exportする。ownerの相対Worker／ORT／Hike／共有codecは専用treeに保持し、他の既存モジュールのcodecや演算を上書きしない。数値sourceは`296e4fe14dff26689f5075e3103cf3c4a54e3485`。buildは`diffusion-models/0.1+6f8203f8f0a6dbb906dc212abcf1ce9d9fa6ae46d4cd8f399ae787aed7bf4de8`。

契約の詳細は次の固定owner文書を参照する。

- [load/predict/sample・保存・取消と所有権](../ai-connection/native/diffusion-pages-20261106/docs/shared/diffusion-models/api/MODEL_RUNTIME.md)
- [通常生成の入力・既定値・容量・未対応条件](../ai-connection/native/diffusion-pages-20261106/docs/shared/diffusion-models/api/NORMAL_GENERATION_INPUTS.md)
- [既存openWeightFeed／createDiffusionWeightClient](../ai-connection/native/diffusion-pages-20261106/docs/shared/diffusion-models/api/WEIGHT_PORT.md)

通常生成は`sample({shapeRequest,positive,negative})`。shapeRequestのowner既定値は`capabilities.executionDescriptor.operations.sample.normalInputs.defaults.shapeRequest`から取得する。管理はtargetの幅・高さ・frame数を設定し、共有shape ownerと`checkSupport`へ照会する。初期targetはDiffusionがzeroで作り、省略されたnoiseも標準正規F32としてDiffusionが作る。明示noiseと完全な順序付きcontext入力も既存APIで扱う。管理でshape式、noise、scheduler、正規化や復元を再実装しない。

noise既定はWebCrypto＋host Box–Muller。seed入力・seed再現・Comfy/PyTorchとの乱数列一致は未対応。Euler/simple・6更新・shift5・split3・CFG1・noiseScale1・augmentation0は固定で、変更可能な設定として表示しない。

通常Pagesは1-thread/no-COI。明示4-threadは実cross-origin isolationとSharedArrayBufferがある環境のみ。4が使えない環境で1へ黙って切り替えない。primitiveの1,048,576要素上限とsampleの4,194,304 target要素上限は別で、後者も数値受入shapeを意味しない。

`sample`はDiffusionが一度復元した`wan21-raw-generated-sample:v1`を返す。`saveTensor`でcanonical bytesを保存し、`readTensor({file})`で再利用する。VAEへはraw生成sampleの意味を保ち、meanへの改名・mean専用復元・再復元をしない。実raw sample原本は非公開受渡しで再利用でき、公開サイトにpayloadを同梱しない。

公開操作の実装と数値／資源受入は別である。管理画面の初回入力域はtargetのみ、既定32×16・1frameで、Text producerのconditioning Fileを使う。context選択、Text実行、VAE decode、実LoRA全モデル適用はこの操作欄では未接続。原寸81frameのHIGH全40block終端・LOW・6更新・raw保存・全工程資源と元mxfp8同等性は未受入のまま維持する。公開画面の操作結果は開発報告に記録する。
