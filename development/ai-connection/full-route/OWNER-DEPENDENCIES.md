# 全体接続に残るowner依存

現時点では**全体接続の実装は未完了**。試験LoRAの送付・受領と全体運用実験は開始していない。

## LoRA完成重みをfull Diffusionへ渡す公開入口

固定LoRA SDKは`6d0c8df4cd4992f26745d2d26394f5e194d2567f`、固定Diffusionは`ffeeeedb6b57d182a977c3ac02c042ce235fc87a`。

- Diffusionの[model-adapter.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/ffeeeedb6b57d182a977c3ac02c042ce235fc87a/docs/shared/diffusion-models/api/model-adapter.mjs)のloadは`files/file/resource`だけを許可する。predict/sampleにも完成重みprovider／package／consumerを渡す引数がない。
- [model-sampler-candidate.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/ffeeeedb6b57d182a977c3ac02c042ce235fc87a/docs/shared/diffusion-models/execution/model-sampler-candidate.mjs)はsource注入を拒否し、内部で原本のHIGH／LOW sourceを生成する。
- [model-weights.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/ffeeeedb6b57d182a977c3ac02c042ce235fc87a/docs/shared/diffusion-models/execution/model-weights.mjs)の`createCompletedModelWeightSource`は最終F32を受ける実部品だが、sampler／公開Workerへ未配線。これだけではstandalone SDKのconsumer取引契約を満たさない。
- 既存`loadLora/readLoraSource`はbytesのI/Oで、適用状態はfalse。旧v2 PARTIAL Q診断consumerも、standaloneの全モデルconsumerの代用にはならない。

ownerへ必要な固定成果は、実pair由来の不変baseProvider、logical registryと実weight sourceのbinding、`lora-standalone/1.0-draft.1`準拠consumerのprepare／validate／commit／rollback／epoch、Workerをまたぐ取引・package read lease、samplerがその完成F32を実際に使う経路。強度変更やbase復帰時にはhead等の保持済みweight cacheも失効・再構築する必要がある。

管理側で独自mapping／数値適用／schedulerを追加したり、`graphBinding:UNBOUND`を適用済みに変更したりしない。新契約を取得して該当boundaryを実装するまで、`LORA_MODEL_BINDING_UNAVAILABLE`と`fullImplementationComplete:false`を返す。

静的照合ではstandaloneの1,053 target ID／fullShapeはDiffusion原本registryと一致（不一致0）。これは接続候補のmetadata確認であり、実model binding、baseの数値一致、LoRA適用の成功ではない。

## 実Diffusion部分接続の検証環境

管理側の限定探索では、各15,574,833,216Bの完全なHIGH／LOWモデル、保存N5入力manifest、資材保持環境への接続先を取得できていない。既存13,828,899,376Bのpartial HIGHやLoRA Fileをbaseモデルへ代用しない。公開receiptにある他環境のpathだけで取得確認を済ませない。

資材保持環境で管理の固定sourceを実行する方式は利用できる。返却すべき範囲は、実pair正常load、N5／実L512 predict/sample、実NNの進捗、対象取消・元Promise終端・実Worker close、同一APIからのreloadと旧session拒否、実生成sampleの保存・fresh File読戻し、pair解放。1-thread/no-COIと旧4-thread/COIのreceiptは分ける。

固定公開モデルの所在もHuggingFaceの固定revisionから確認したが、取得は開始していない。観測時のworkspaceは約32GiB中空き約15GiB。既存partialの割当済み領域を再利用してもpair完成に追加約22.7GBが必要となり、空き容量を超える。`/tmp`は約8.8GiBのtmpfsで、LOW単体15.57GBも収まらず、同じ16GiBのRAM予算を使う。モデルの穴を未取得のまま利用したり、他の作業資料を削除したりせず、保持環境方式を採用する。取得不能という推測だけで止めず、固定所在・header一致・実容量を分けて記録した。

これらは実モデル部分接続の受入条件であり、試験LoRAを前倒しで取得する理由にはしない。全NN中間・原寸81frame・元媒体の再計算を、固定境界の検証へ追加しない。

## その後の順序

1. owner新版の完成重みconsumerを固定採用し、管理の実行順・取引・取消・保存へ接続する。
2. 全edgeの実API経路・資源管理が揃ったことをreviewし、「全体接続実装完了・全体運用未検証」と報告する。
3. 必要な試験LoRA、side／組合せと受渡し先を明示して受領する。
4. 管理から入力→完成重み適用→生成→実VAE decode→保存を一つの運用traceで検証する。各段階の単体・部分受入を、未実施の全体成功へ拡張しない。
