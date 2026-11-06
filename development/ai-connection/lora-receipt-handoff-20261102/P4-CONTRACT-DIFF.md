# P4重み接続口の原文受領とdd95対応表との差分

2026-11-02。P4のregistry/provider/sink/consumer契約を原文で受領した。**新P4のcanonical mappingと実LoRA適用weightは未成立**のままである。照合はsourceと公開metadataの読取り・hash確認だけで、原本/base読取り、推論、export、nativeテストは行っていない。この照合記録を別の追補commitで共有する。

| 版の役割 | 完全commit |
| --- | --- |
| Diffusion配布 | `7ee36228030ba3bb544a90b1d4b528702a7bae32` |
| final-F32 feed実行 | `5744f700e17b23d5c18d32315fb6dfbd7c49089a` |
| HIGH/LOW base実行 | `829467c14ec6fd1ab1858dfc175c84605de1ac98` |
| 旧LoRA対応表 | `dd95ed05f058930a391f015c11b9a2b963a42db5` |

完全な比較正本、59 source/契約/metadataのpath・bytes・SHA-256・Git blob、静的候補44件は [P4-CONTRACT-DIFF.json](P4-CONTRACT-DIFF.json) に保存した。旧 [TARGET-CONSUMER-MATRIX.json](../lora-p2-p3-consumer/TARGET-CONSUMER-MATRIX.json) とgeneratorは変更していない。

## 取得した正本

- [固定API](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/API.md)
- [WEIGHT-FEED](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/development/ai-connection/p4-cross-ffn/WEIGHT-FEED.md)
- [registry/provider/sink/consumer](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs)
- [不変原本source](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/ort-bridge/post-self-attention/source.mjs)
- [実stage](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs)

上記5ファイルはGitHub固定原文を取得し、checkoutのGit blobと一致させた。build.jsonの50 sourceは固定Git bytes・byteLength・SHA-256へ全一致し、最終実行5744のbytesとも全一致した。これはコード受領確認であり、数値再実行ではない。ファイルごとの完全hashはJSONのsourcesにあり、旧canonical/SDK/plannerと旧dd95対応表のhashもretainedSourcesに保持する。

Native APIは`diffusion-models/0.1`の独立ES入口で、profileは`bernini-block0-n2-cross-ffn-f32-candidate-v1`、registryは`bernini-p4-f32-feed-registry/0.1`。scopeはPARTIAL、coverage.kindは`explicit-sparse-final-f32-ranges`、completeAdapter=false、generationReady=false。新RPC/MessagePort operationを追加する契約ではなく、関数・AbortSignal・opaque handleは同一realmに置く。

## 維持できる旧Q16と追加された接続口

既存の `createBerniniBlockProvider → createDiagnosticConsumer → createDiffusionDiagnosticAdapter` はQ16のまま維持できる。consumer/base-block/diagnostic-base/ORT stageの4 sourceはDiffusion5f880と7ee362でbyte exactに一致する。不変baseからの再構築、loader規約、PARTIAL除外保持、manager/local revisionの分離は再利用する設計要素である。

508固定tailにprepared ingressがないという旧表の記載は、その固定tailについて維持する。新P4では別profileとして `createP4WeightFeed` と `createPostSelfAttention({source})` が提供された。この新入口の存在を、旧tail/Q16への採用や実LoRA適用へ読み替えない。

| 境界 | 旧Q16 | 新P4と追加mapping要件 |
| --- | --- | --- |
| target | self-attn Q、q.weight/q.biasの2target | cross Q/K/V/O・FFNの12target。明示Text選択時16target。新canonical registry mappingが必要 |
| binding | runtime-input weight / hike-parameter bias | binding.nameはoriginal program slot。matrixのoperatorBinding.graphInputだけが実ORT入力weight。initializerへ詰め替えない |
| 座標 | SDK full座標からnative selected-relative Q16へ変換 | provider/sinkとも元full tensorの要素offset/count。旧relative変換を流用しない |
| coverage | 先頭16行/all5120列とbias16の完全feed-set | manifest.patchesの疎範囲を完全被覆。未選択target/rowは不変base pass-through |
| identity | model/graph/registry/side/scope | P4 executionProfileIdも必須。package hash・native epoch、SDK plan/source/revision、外側管理targetを別々に結ぶ |
| validate | x5120 / expected16、Q16 scoped receipt | residual10240/time5120/conditioning、expected blockOutput10240とhash/reference/fixed gate。P4 receiptからSDK scopeへの対応は未実装 |
| ownership | prepareLoadで数値copy。旧SDK受入はindependent-copy | sinkがcaller F32をcopyし、candidate/active/leaseはnative私有bufferを共有保持。第2の数値copyとは記載しない |
| lease | SDK prepared leaseの旧受入なし | captureSourceがrunのepoch/packageを固定する内部read lease。SDK prepared ownership leaseとは別 |
| 管理 | 正式82b Q16 bridge/診断snapshot | P4 DATA/profile/catalog/snapshot採用は別合意。Q16 EXEC/profile/gateへ偽装しない |

現canonical adapterはQ16 schema/profile・self-attn Qの2target・16出力に固定されている。名前を足したwrapperや既存targetのshape置換でP4を通すことはできない。

## full shape・binding・blockとcoverage

各entryはoriginal key、diffusion_model.付きkey、weightId、full shape、storage/compute dtype、row-major、transpose:false、原本offset、許可範囲、scale/config hash、operator bindingを持つ。weightIdとbinding.nameはoriginal keyそのもの。全weight/biasの復号baseと最終prepared dtypeはF32である。

| stem | weight full shape | 保存dtype | weight 1回blockの最大row数 | patch registry |
| --- | --- | --- | ---: | --- |
| blocks.0.cross_attn.q/k/v | [5120,5120] | F8_E4M3、各自scalar F32 scale/config | 16 | default |
| blocks.0.cross_attn.o | [5120,5120] | F16、FP8 scaleなし | 16 | default |
| blocks.0.ffn.0 | [13824,5120] | F8_E4M3、固有scale/config | 16 | default |
| blocks.0.ffn.2 | [5120,13824] | F8_E4M3、固有scale/config | 4 | default |
| text_embedding.0 | [5120,4096] | F16 | 16 | includeTextEmbedding:trueだけ |
| text_embedding.2 | [5120,5120] | F16 | 16 | includeTextEmbedding:trueだけ |

各biasはoutput幅のF16 vectorをHikeでF32へ復号し、original bias key名のhike-parameter/AddBiasへ渡す。cross-Oへself-O/QのFP8条件を流用しない。FP8はentry固有scalar scaleとconfigを検査したF32復号であり、元GPU production precisionの受入とは別。sinkへ入れた最終F32を再scale/decode/加算しない。

**FFN downのmax4行は1回のread/write/linear block上限であり、適用coverage全体を4行へ制限する規約ではない。** full shapeは[5120,13824]で、1行あたり全13824入力列を保持する。複数blockでmanifestの明示範囲を被覆できる。registry全row許可、実manifestの疎選択、81920要素/block、16MiB/package、aggregate64MiBは別の制約である。全層適用を宣言するものではない。

source.readRowsは行、readVectorは要素、内部Blob readはbyte単位（163840B以下）。baseProvider.readBlockとsink offset/countはfull-original要素単位で、matrixはrow aligned・全列必須。実選択sliceはmanifest.patchesが宣言する。registry.shape/fullShapeを部分射影のshapeへ縮めない。原本offsetはheader検査後の8+headerBytes+data_offsets[0]から得る。このreviewで原本headerを新規読取りしてoffsetを再解決してはいない。

既存SDKはrank等からblock stepを決めるが、新P4のper-target maxRowsを受入済みではない。低rankやrankのないdiffでもFFN downの4行/回を満たすよう、canonical prepareのblock制御を設計する必要がある。inner分割・padding・shape改名で上限へ合わせない。

norm3、cross Q/K norm、time projection、modulationの7 entryは原本sourceに存在するが、P4 patch registry対象外。Textは実stageで読むが、default feedではpatch対象外。未選択target・領域を黙って捨てたり、LoRA適用済みと表示したりしない。

## 実session経路・検証・取消・寿命

新しい実経路は次のとおり。

`createP4WeightSource → createP4WeightFeed → sink.begin/writeBlock/finish → prepareLoad → validate(run(candidateSource,ownedInput)) → createPostSelfAttention({source:candidateSource})`

stageは最初のawait前にimmutable source leaseを捕捉し、tile.valuesをlinear.runのweightへ渡す。linearは実ORT session.run({x,weight})を呼び、別Hike biasを加える。Gemmとexact Q2 scoreの2sessionを持つ。最終F32が実演算へ届くconsumerは提供されたが、今回この経路へ実LoRAが作ったweightを渡した共同試験は成立していない。

validateはbooleanではなくbernini-p4-f32-feed-validation/0.1の構造化PARTIAL結果。全10240 blockOutput、candidate/package、model/graph/registry/profile/side、input data/mask/metadata、expected hash/referenceIdを結ぶ。gateはp4-cross-ffn-composed-f32-v1、abs0.01+rel0.001で固定し任意緩和を拒否する。graphHashはdynamic Gemm graphの識別であり、全math/score/attention kernel digestの検査をそれ1個へ集約しない。外側で固定source/build/runtime evidenceを保持する必要がある。

既存v1はinitializer/FULL限定・boolean validateのまま。P4 runtime-input/PARTIALをgraphInitializerやboolean trueへ偽装しない。P4 native receiptはSDK v2が要求するplanId/sourceSha256/registryHash/coverage/scope付き結果そのものでもなく、版付きcanonical validatorの対応が必要である。

commit直前にvalid receipt・abort/current・prepared epochを確認し、awaitなしでactive feedを切り替える。rollbackは自分のactive feed/epochだけを戻し、古いcandidateで新activeを上書きしない。強度変更・解除は不変baseから再構築し、適用済み重みへの再加算・逆差分を避ける。

package、candidate/history、active feed、run lease、feed、sourceは別寿命。sinkがcopyしたnative私有bufferをcandidate/active/leaseが保持するため、package解放だけでactive bytesは壊れない。prepareLoadはfeed/block metadataをcopyし、数値bufferを共有保持する。P4 commit receiptにはSDK ownership receiptがなく、外側canonical mappingでcopy/leaseの意味とownerを確定する工程が残る。内部run leaseをSDK prepared leaseの受入済み証拠にしない。

feed.disposeはleaseを失効させtracked read/hash/validationの終端を待つ。元sourceは呼出し側が所有する。stage.disposeはactive runとoperatorsの解放を待ち、recoverはdisposeの別名である。disposeSource既定false。取消はbounded read/Hike/ORT呼出し後の協調停止であり、force-stopやdispose後の同instance再利用を意味しない。

内部予算はpackage16MiB、aggregate64MiB、package/candidate各4、lease16、transaction4。共有private backing bufferはidentityで重複排除しpending hash copyを別計上する。ORT/browser/File/全工程peakの受入ではない。

## 旧対応表との静的照合と未成立事項

旧2,904 logical patchのうち、default P4 targetのname/fullShapeに一致するのは36（light HIGH/LOW各12、detail HIGH/LOW各6）。明示Text選択で追加される静的一致は8（light HIGH/LOW各4、detail該当なし）。**合計44はstatic name/fullShape candidate onlyで、base適合・canonical接続・実LoRA適用の合格数へ絶対に加算しない。** 旧Q16受入6 patchと未接続2,898の元scopeは変更していない。

light default weightはrank128/alpha128のdown-upと明示diff_b、detailはrank64 A/Bでalpha省略。optional light Textはrank64/alpha省略とdiff_bを持つ。倍率は保持済み固定comfy-lora-b5a4321-linear-diff-v1に限定し、alpha省略scale1を全形式へ一般化しない。detail bias patchは新造せず、不変base pass-throughを明示する。未知variant/倍率は既定で通さない。

Diffusionの既存報告は、base HIGH/LOW各50比較/643072値、別HIGH direct-final-F32 fixture25比較/321536値とconsumerの10240値である。direct fixtureの実選択はcross Q先頭4行/all5120列とbias4で、callerが非zero値のsign bitを各1個変更したもの。低rank/alpha/strength計算ではない。commit epoch1、旧base lease保持、package解放後active読取り、rollback epoch2は元scopeで保持する。復帰は対象tile再読でありstage全体の復帰再推論ではなく、最終lease数0の独立観測も主張されていない。今回は全て再実行していない。

次に合意する項目は、版付きP4 canonical registry/planner/validatorとsupported variant/loader、full/sparse mappingとblock制御、P4 structured validationからSDK/managerへのscope/ownership/current対応、P4 DATA/profile/snapshot受入、実LoRA重みと独立期待値を使う限定共同試験計画である。

新P4 canonical mapping、実LoRA適用weight、実Text producer共同受入、本番shape/precision、全target/full model session、実HIGH→LOW、生成/VAE寄与、全工程資源は未成立。二組同時合成・公開を追加せず、generationReady=false、load/predict/sample=NOT_READYを維持する。
