# LoRA targetと実consumerの対応

固定metadataから4つのpair/side、全2,904 patchを展開した。[JSON正本](TARGET-CONSUMER-MATRIX.json)は各patchの原本hash、層、variant、倍率規約、full shape、選択領域、dtype、binding、graph/feed/session、除外理由を保持する。原本の再load・hash、実計算は行っていない。

| pair | side | logical patch | 旧Q16へ接続したpatch | 除外patch | 新tail |
| --- | --- | ---: | --- | ---: | --- |
| light | HIGH | 1052 | Q weight + Q bias | 1050 | DEPENDENCY_WAITING |
| light | LOW | 1052 | Q weight + Q bias | 1050 | DEPENDENCY_WAITING |
| detail | HIGH | 400 | Q weight（biasは不変base pass-through） | 399 | DEPENDENCY_WAITING |
| detail | LOW | 400 | Q weight（biasは不変base pass-through） | 399 | DEPENDENCY_WAITING |

Q weightのfull shapeは[5120,5120]、選択は先頭16行・全5120列。lightの明示biasはfull[5120]の先頭16値。detailにbias patchを作らず、consumerに必要なbase biasを別に記録する。残りの行と全除外targetを保持し、coverage=PARTIAL、completeAdapter=falseとする。

旧Q16はLoRA mapping fc2789a0f649e33f15eb13750e6a983b5c52d170、Diffusion 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3。実registryはweightがruntime-input `weight`、biasがhike-parameter `bias`。単一Gemmのx[1,5120]とweight[16,5120]からprojection[1,16]を作り、Hikeでbiasを加える実ORT WASM診断sessionである。実base storageはweight F8_E4M3、bias F16、decode後base/準備済みweight・bias出力はF32 row-major。準備済み重みのdtypeと16出力のdtypeを混同しない。

fullShapeのlogical provenanceと実native descriptorを別々に記録する。選択外2,898 patchは旧Q16へのLoRA適用bindingがなく、元の照合は論理名・形状に限られる。base storage/compute dtype、準備済み出力、layout、実fullShape、bindingはnullのまま未確認理由を示す。未知値をF32やFP8で補わず、shape一致をbase適合としない。

新Diffusion 508d72cc9036e7f500827465c644b4aed3c5f711のcreateSelfAttentionTailは固定N2 block0のO projection、chunk2 gate、元patchHidden残差を扱う。constructorはfile/side/trustedInputs/bridgeBytes/mathBytes、runはattention/patchHidden/timeAct1と制御引数を受ける。LoRA prepared/candidate/feedを実tail sessionへ渡す公開経路がないため、全2,904 patchにDEPENDENCY_WAITINGを付けた。新tailが原本から読むO/time/modulationの5keyは、originalParameterContractsに元readerのstorage/compute dtype・full shape・許可領域として別記し、対応するpatchから参照する。これはLoRAの注入口や実適用を意味しない。旧Q16のconsumer/base/stageのGit blobが新commitでも同一であることと、新tailへのLoRA適用は別である。

旧E1の20件はHIGH実行4d5fd7363f40f0d743ead448193ef2bf1915bbdc、LOW実行e1f03a4f6092c3154d5b47f166b77bbd32897ac9、Diffusion実行438972f30242e0a3bc66edb8591f38eaa0fcd384の4 pair/side各5件。強度0,+1,-1、再適用、取消復帰を元scopeで再利用する。HIGHの古rollbackは旧prepared未commit候補、LOWは旧commit済み候補なので同じ試験として扱わない。

直近のlight/HIGH 6件は実行25e5b56feeb070594110bb292d9de21e4e234f0a、配布40f7f0cfc95bfb5f3e8ed5cc68c4bdb196cbbf68の別scope。491,520 weight・96 bias・96出力と診断snapshotの証拠を再利用するが、旧20件と合算して全モデル合格にしない。この表はmetadataの展開だけであり、旧数値試験の再実行、新管理DATA bridgeや新tailの採用を証明しない。いずれも現在のlive session利用権ではなく、generationReady=false。

入力はユーザーが選ぶローカル.safetensors。4原本の記録は過去証拠であり、全部の取得やhash再計算を製品の前提にしない。全targetは対応する実graph/consumer成立後に受け入れ、二組同時合成・全model/session・生成・公開は追加しない。

再生成・照合はrepo内から次を実行する。固定commitのGit objectsが必要だが、原本バイナリやnative runtimeは不要。

```sh
node tools/lora/build-target-consumer-matrix.mjs --write
node tools/lora/build-target-consumer-matrix.mjs --check
```

検査はinventoryと4scopeのkey集合の完全一致、重複なし、variant/fullShape、原本hash対応、両registryの実Q16 binding、全2,904件の収録、未対応理由の保持、固定sourceと決定的な生成結果を確認する。生成物だけを編集せず、変更時はgeneratorと固定sourceを合わせて更新する。
