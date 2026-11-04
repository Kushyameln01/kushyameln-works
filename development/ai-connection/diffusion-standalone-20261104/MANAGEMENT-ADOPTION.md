# 管理への最新Diffusion採用監査

2026-11-04 UTC。固定Git objectを`git show`で読み、保存入力のbytes／SHA-256を照合した。これはDiffusion側による取得確認であり、管理担当の受領ACK・管理数値実行・他担当の完成を示さない。原寸実行worktree、manager ownerコード、runtime、DELIVERY、RESULTは変更していない。

## 基点と取得原本

| 区分 | 完全SHA |
| --- | --- |
| 管理配布 | `e1661e561dfb1a4f20544ff48bc375175b5981d1` |
| 管理実行source | `296c18d5f2c878fa42bbb198a706991fc901065f` |
| 管理が現在採用するDiffusion | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` |
| 最新Diffusion runtime source | `6cda0a686d30a4bd748909fc56c61c1acece7bfb` |
| 最新Diffusion配布 | `af647e78fd1dbda66b316d1a5e2566553f1f35eb` |

取得path・bytes・完全SHA-256・固定GitHub URL、変更11件／追加9件の旧新hash、最新runtime全153件は [MANAGEMENT-SOURCE-DIFF.json](MANAGEMENT-SOURCE-DIFF.json) に記録した。同JSONは102,934 bytes、SHA-256 `001e9ef901c8f51ae37fd08146d646fac00aaee93637befc1caaeff0f721ca9a`。

主な確認原本は管理sourceの `docs/shared/ai-connection/adapters/diffusion-public/{adapter,native}.mjs`、`tools/ai-connection/{run-diffusion-public-browser.py,diffusion-public-browser.mjs}`、最新Diffusionの [api/index.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/6cda0a686d30a4bd748909fc56c61c1acece7bfb/docs/shared/diffusion-models/api/index.mjs) と [WEIGHT_PORT.md](https://github.com/Kushyameln01/kushyameln-works/blob/6cda0a686d30a4bd748909fc56c61c1acece7bfb/docs/shared/diffusion-models/api/WEIGHT_PORT.md)。管理adapterは28,528 bytes／`a23b6e4f03cf6dbfed6f55a6e0e041254577d01e8f45195793dd643f9c4dfd75`、最新`api/weight-port.mjs`は19,204 bytes／`828edf69d0ee338cf9b7801f7cbba59e22ccccbe64a1160655f772957ce67601`。

## base 7操作とsource closure

既存管理adapterは実`createDiffusionModels`→専用Workerを呼ぶ。`load/modelStatus/unload/predict/sample/saveTensor/readTensor`のbody、tensorの意味・正規化状態・所有権・取消・canonical保存は最新APIと構造上互換であり、Diffusion側stubの追加や同じ管理adapterの再実装は不要。`sample`のraw generated sample／restored latentContractを保ち、VAEへ渡す際も再復元しない。既存操作の互換性は、最新sourceによる管理数値実行の受入を意味しない。

追加gate監査：管理`adapter.mjs:86/183`が読むのは`modelRuntime.operationsImplemented`とbuild／protocol識別で、legacyの`modelInference:false`／`partialOnly:true`では7操作を拒否しない。通常呼出しは160行→93–106行の`client.request`→native Workerへ進み、公開model操作を旧P4用`checkSupport`へ迂回させない。最新factoryのcapabilitiesだけを実取得し、load/predict/sampleは同配列に存在し、`executionDescriptor.operations[op].available/implemented/executableRoute=true`、`modelRoutesImplemented=true`を確認した。現契約に`modelRuntime.available/routes`というfieldはなく、管理はそれらをgateにしていない。通常数値経路の122/143行は`requiredScopes:[]`／`requiredEvidenceScopes:[]`、snapshotのnormal gateも診断scopeを要求しないため、既存数値receipt・独立参照・固定sample payload hashの必須化は確認されなかった。build／モデル識別、構造・current binding・資源・所有権の検査と、holding runner自身の保存file整合hashは別である。この確認はcapabilities取得とsource読解のみで、Worker・NNは起動していない。

現在の管理は旧build `9c5d8d18e9a7b046d7768c8c32ca6a48eaa084c900e916d59d63e735ebeb2a20`／144 runtime source／150 adopted fileへ固定されている。最新buildは `e5ba40ce01bd04e4a432846afb737a9d8c37c56450df68af51460d9140c3e4c6`／153 runtime source。133件同一、11件変更、9件追加、削除なし。`6cda…`と`af647…`のbuild-infoは同一bytesである。

管理owner側で必要な更新候補は次のとおり。今回の監査では実装していない。

1. native採用treeを最新153件と`build-info.mjs`へ更新し、SOURCE.jsonのpath／bytes／hash、source commit、build IDを再生成する。旧150件にはruntime外のlicense・holding helper・履歴contractも含まれるため、その補助closureも明示して保持・再検査する。
2. `adapters/diffusion-public/native.mjs`の採用root・commit・index hash・SOURCE hashと、`adapter.mjs:14`のsource参照を更新する。native bootstrapから最新`createDiffusionWeightClient`も取得できるようにする。
3. holding runnerのOWNER_COMMIT／NATIVE／API、ブラウザ側のnative import／PUBLIC_WORKERとsource freezeを更新する。最新owner helperはPythonとMJSの2件が変更、Worker observerは同一。管理runner自体は既に1-thread/no-COI既定・明示4-thread/COI・fallbackなしを実装している。

`--source-commit`だけを最新Diffusion SHAへ変える方法では、管理HEAD・採用元・SOURCE／build hashの固定検査に合わない。新しい管理実装を固定した管理source SHAが必要である。

## MessagePortの未実装境界

固定管理 [adapter.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/296c18d5f2c878fa42bbb198a706991fc901065f/docs/shared/ai-connection/adapters/diffusion-public/adapter.mjs) は17行の許可操作と184–190行の公開methodに`openWeightFeed`を持たない。さらに106行の`r.nativeReply=clone(reply)`、176行の`clone(completed.result)`／`clone(r.nativeReply)`はMessagePortをtransferなしでcloneするため、操作名の追加だけでは動かない。`structuredClone({result:{port}})`が`DataCloneError: Object that needs transfer was found in message but not listed in transferList`になることをモデル不要のprobeで確認した。

管理ownerの最小対応候補は、既存queueで一度`openWeightFeed`をdispatchし、portをclone対象のsnapshot／receiptから分離して保持する専用経路である。同一realmでは最新native helperでowned clientを作り、別realmへ渡す場合は明示transferを実装する。port、client関数、candidate、AbortSignalを通常tensor保存へ混ぜない。管理のmodelSessionId／modelEpoch／sideにclientを結び付け、close・取消・reload後の古いclientを採用しない。

## 実呼出し・取消・解除の順

1. 管理から実HIGH/LOW Fileを`load`し、そのmodelSessionIdでside別`openWeightFeed`→`createDiffusionWeightClient`を作る。
2. LoRA ownerへclientの不変`baseProvider`と`consumer.describe()`のcanonical registryを渡す。低rank積・package作成はLoRA ownerが行い、完成F32をconsumerの`prepareLoad→validate→commit→releaseCandidate`で供給する。HIGH/LOWや二組を無断合成しない。
3. 管理の既存`predict/sample`へ保存conditioning/context/noiseを渡す。Diffusionはpredictの片側epoch、HIGH3→LOW3の全sampleでは両側epochを保持する。逆方向base readはweight port内で処理し、管理の全体queueへ再投入しない。
4. raw generated sampleを既存`saveTensor`／実Fileの`readTensor`で保存・照合し、後段ではそのraw契約のままVAEへ渡す。
5. 取消時は元requestのterminalとWorker closeを待ち、古いmodel／portを無効化する。通常解除は計算terminal後に`clear`、LoRA ownerの解放、weight clientの`dispose`、`unload`／API dispose。失敗したhost releaseはclientの`inspect().cleanupRequired/failedReleaseIDs`と実capabilityを保持して再試行し、失敗したclientを管理mapから捨てない。

この実LoRAを伴う通し運用は、base単体→管理部分→全体接続実装の成立後に実施する。今回の監査で送付・実験を実行していない。

## holding入力の確認と残り

現在のholding環境には次がある。入力の完全path／bytes／hashは添付JSON、再現・取得元は [SAVED-INPUTS.md](SAVED-INPUTS.md) を参照する。

| 資材 | 確認結果 |
| --- | --- |
| `/tmp/d1-d4-real-l512-n5-inputs/inputs.json` | 43,223 bytes／`11d345729b9132dd600b3fa73b61fd5e686b3f5a0ed7b72ef12e3a83791307e9` |
| 実Text payload・mask | `[1,512,4096]`、全512行・mask有効3位置。payload `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`、mask `19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62` |
| 元管理の固定`prepare_inputs` | 保存7 URL・計8,391,424 bytesの入力照合成功。browser／NNは起動していない |
| retained HIGH／LOW | 各15,574,833,216 bytes存在。今回31 GB全hash再計算はしていない |
| 固定Git objects・環境 | f76 packet、ffeeeed owner、管理296、最新6cdaが取得可能。Python/NumPy/Playwright、Node、Chromiumあり |

保存入力に不足は確認されなかった。管理296の専用checkoutは未作成であり、後段の実行では固定HEADの別checkoutとfresh output先が必要。旧296をそのまま実行した結果は旧ffeeeed採用scopeに限られ、最新6cdaの管理接続証拠にはならない。

未実装は上記の管理native更新・weight port専用所有経路。未受入は最新sourceの管理NN、管理からの実weight適用、原寸全query／全40block／6更新、全体資源条件、全体運用・実LoRA・製品生成READY。既存N5／限定weight port／operator証拠をこれらへ拡張しない。新しいNN、再export、実LoRA送付、merge、Pages公開、対向ACKは今回なし。
