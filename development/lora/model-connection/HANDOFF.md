# 管理・Diffusionへの接続受渡し

[契約API](../../../docs/shared/inference/lora/DIFFUSION-MODEL-CONNECTION.md)の実装sourceは `168a1e2fde2b643cc662514da288a7fd67ab2213`。[全対応表](BINDINGS.json.gz)、[配布path/bytes/SHA-256](FILES.json)、[固定owner91点](OWNER-SOURCES.json)、[実行版](EXECUTION-SOURCES.json)を渡す。配布commitはこの文書を含む固定URLのcommitとする。

## 管理の入力・状態

既存createLoraManagementSideへregistry/baseProvider/consumer/kernel/cacheを注入する。必要なpair/sideのローカルFileだけを登録し、選択・強度・side・request・取消・復帰・prepared保存/読戻しを既存APIで行う。mappingやshape計算を管理に複製せず旧bridgeを重ねない。

REGISTERED、PREPARED、CONSUMER_APPLIED（F32 feed公開）、管理snapshot、実予測、生成READYを区別する。今回のfixtureはcoverage:PARTIAL、validationMode:normal。expected/gate必須取引ではない。SDK localRevision・管理managerRevision・native epochは別の名前空間。値の一致は同一revisionを意味しない。

固定管理 `e1661e561dfb1a4f20544ff48bc375175b5981d1` の実adapter/保存から新consumerへの経路を確認。OPFS保存→fresh page/新SDK→File読戻し→stageで再登録0、package同一性、新authorityを確認した。これは検証package保存で、製品動画保存ではない。

## Diffusionへの実受渡し順

固定Diffusion `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` の実completed-sourceと実native model constructorを使用する。

1. DiffusionがcreateModelWeightSource({file,side})の不変baseを保持する。
2. LoRA正本adapterのregistry/baseProviderと通常SDKが、既存mapping/loader/rank/alpha/復号/合成順から最終F32 owned packageを構築する。
3. consumerが宣言全範囲・有限F32・candidate現在性を通常検証。commit直前にabort/request/epochを再確認しfeedを公開する。
4. captureSource()がpackage/epochを固定し、実createCompletedModelWeightSourceに完成F32を返す。選択外はbase。callback値の再加算/再scaleは禁止。
5. createDiffusionLoraModelSessionがcaptured sourceを実createBerniniModelCandidate({source,...})へ渡す。新epochは新session。取消/予測終端→native dispose→capture.release→SDK/connection/kernel→raw baseの順で終了する。

package block上限1,048,576要素を、native81,920要素/16行以下へ分割する（13,824列FFN-downは5行）。single-flight raw sourceへのreadをcapture間でも直列化する。owner completed-sourceが先にbaseを読むため、package側base readと重複I/Oになることは残る。

## 全対象・除外

2,904 logical patchすべてにkey/full shape/operator対応。light HIGH/LOW各1,052、detail各400。native1053=406runtime-input matrix+647hike-parameter vector。model全1095の残り42（40block modulation・head modulation・patch embedding Conv weight）は既存LoRA sourceに含まれずbase pass-through。

FULL_LOGICAL_BINDINGは実装上の対応であり、全target実数値適用や全NN推論ではない。HIGH実baseは今回未読。未知variant/不明dtype/非有限strength/未宣言転置・slice/initializer偽装を拒否。alpha省略scale1は固定comfy-lora-b5a4321-linear-diff-v1だけに限定する。FP8 storageはDiffusionがF32へ復号し、LoRAがquantized arithmeticを行うわけではない。画像F/H/Wやmean APIは追加しない。

## 残る採用・未受入

| 境界 | 到達点 | 残件 |
| --- | --- | --- |
| 管理→LoRA→実F32 source | 実装・実LOW slice数値PASS | 実験原本の全target適用は全体接続後 |
| source→native model | 実constructor制御/lease終端PASS | 全NN予測・HIGH/LOW共同運用 |
| 公開Worker/load/sampler | 固定実装はFilesからraw sourceを新規作成 | completed-source採用、model-owning realmの管理route、strict payload/Worker dispatch/build inventoryの実装 |
| sampler cleanup | LoRA側session/capture寿命を実装 | raw sourceとcaptureを別保持しmodel後にcapture.releaseする。旧raw.dispose loopへの単純置換は不可 |
| 準備/cleanup二重失敗 | leaseを隔離し未確認cleanupを表示 | native retry handleまたは隔離Worker終端の成立確認 |
| 全体運用/READY | 未実施・false | 通知後に必要pair/sideのLoRAを送り、管理入力→適用→生成→VAE decode→保存を別検証 |

送信側の固定source取得は確認済み。別担当本人の取得ACK・公開route採用は未取得/未受入とし、単体/部分接続の完了をACK待ちで止めない。実験原本は全体接続実装完了の通知後まで送付しない。merge・Pages公開も未実施。
