# 管理P4候補接続・P3追加条件の受入

2026-11-02 JST。P3の追加3条件を返却証拠から受け入れ、P4を既存catalog・規範・adapter・queue・E4へ接続した。**P4の実Text数値・管理経由の実dispatch共同受入は返却待ち**。受入済みP2と旧固定N2を維持し、`generationReady:false`、`load/predict/sample=NOT_READY`とする。

## 配布と実行source

branchは `codex/ai-connection-e0-e4`、[Draft PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)。この記録を含むcommitが最終配布であり、次の実行sourceとは区別する。merge・Pages公開は今回実施していない。

| 区分 | 完全SHA／範囲 |
|---|---|
| 新管理実装・固定preflight実行source | `a7e16cfdf2d87899e2774662539194094f214f06`。NN実行ではない |
| P3・workflow先行配布 | `9e9b3ad4258a7f91542e7c74ab1011b1b13921ed` |
| LoRA新返却配布 | `a80db72feea60b9bd69e292e4716665c6f0ee77f` |
| 返却P3の管理実行source | `8849891f19124df31847bd691503c2491278eaa8`。a80へ付け替えない |
| P4元配布／native実行source | `7ee36228030ba3bb544a90b1d4b528702a7bae32`／`5744f700e17b23d5c18d32315fb6dfbd7c49089a` |
| P4最新照合候補 | `994ebb9ce01c9e95db9cd18eb877a981152693c5`。L512参照固定・source検査修正、実NN合格は未確認 |
| 規範版／元commit | `1.0-draft.1`／`6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` |

P4 Profileは `bernini-block0-n2-cross-ffn-f32-candidate-v1`、buildは `bernini-p4-cross-ffn/0.1+31cd57300e61ef429de85eefa83f2d5796588b2e94e32a162810b62cdedf408b`。独立candidate catalogは9,601B／SHA-256 `e64e2e338b3a33ab2ea5521df652cb041a9d4033cec5da7e0f18d9c2373e023e`。親catalog、旧N2、P2採用pinを一括変更していない。

[固定API](https://github.com/Kushyameln01/kushyameln-works/blob/a7e16cfdf2d87899e2774662539194094f214f06/docs/shared/ai-connection/API.md)は75,818B／SHA-256 `18f924b81febe363a2987e0a8e7f8504f2a6ad88b6a17322bee2c521ae48cb6b`。[MANAGEMENT-HANDOFF.json](MANAGEMENT-HANDOFF.json)に管理150file・native51fileのpath/bytes/SHA-256を固定した。

## API・実装差分

- 独立P4 candidateのshape/EXEC/norm/catalog、source proof、有限bindingを追加。互換性は既存`evaluateEdge`だけが決める。入力文書の構文拒否とnative互換性は別状態。
- 外側`createNormRequiredP4CrossFfnAdapter`と同一realmのsource→feed→stage bundleを追加。native runへ渡すのは`residual/timeAct1/conditioning/signal/onProgress`のみ。request/revision/resource generationは外側で保持する。
- 既存queueで対象取消、古い結果の不採用、元factory/run終端、stage→feed→source解放を管理。解放失敗はquarantineし、recover後は新owner/generationを要求する。
- 25 named出力を既存E4・codec2bdで保存・fresh読戻し。`output` aliasは26個目にしない。意味IDは管理sidecarであり、ownerがexportしていない`nativeMeaning`を作らない。複数producer、lineage、mask/Tokenizer、frame順、trace、typed拡張を保持する。非JSON owner metadataはowner encodingを保存し、operational replayは未検証と明示する。
- 固定holding runnerはownerの比較関数と29parameter検査を呼ぶ。数値演算・層mapping・oracle生成は追加しない。実Textはcomposed25またはlocal+composed50を明示し、先行owner PASSのscopeと一致させる。994の元manifest＋25 LE F32を直接読めるため再exportは不要。
- 既存LoRA bridgeにはprepare前の参照改変拒否の回帰試験を追加。既存native API・queue/snapshot/cache/package本体・codecは変更していない。

## 受入・再利用証拠・新規検証

| 対象 | 判定と確認scope |
|---|---|
| P2 | f76／管理884の正常・取消復帰trace、10 E4読戻しを既存scopeで維持。今回再NN 0 |
| P3 | [186/186受領照合PASS](p3-owner-return/RESULT.md)。light/HIGH PARTIAL Q16・bias16・output16、884の6公開case＋取消1、prepare/stage各7。output16 E4 complete、改変・snapshot欠落拒否、prepare前参照改変拒否を受入 |
| P4公開source | [delta24file/258,272B、旧runtime50file、参照source11件PASS](diffusion-return/REPORT.md)。旧runtimeは7ee/27776/994でbyte同一。公開参照receiptとprivate実体は別受領状態 |
| P4接続境界 | norm11・adapter/package20・runner17を含む[全516件PASS、FAIL/SKIP 0](verification/ROOT-SUITE.log)。テスト中150fileが同一bytes。実native演算を置くboundary fixtureの合格を本番NNへ一般化しない |
| 固定管理preflight | a7を実行し、51 native sourceとf76 WKT8,390,054Bを検査。管理実行closure18件がa7 Git bytesと一致。`COMPATIBLE / NOT_VERIFIED / BLOCKED`、native0、browser未起動、private入力IO0 |
| 保存・所有権 | boundary fixtureの25出力実filesystem E4 fresh読戻し、改変拒否、複数producer/typed metadata/frame/trace保持。取消・stale・元Promise・解放失敗/recoverも変更境界で検証 |
| 既存scope | [74既存fileを5aaとbyte同一確認](ORIGINAL-SCOPE-PRESERVATION.json)。P2/N2受入・旧native pinを維持 |

a80/9e9時点のP3受領はmetadata照合だった。後着c486で公開されたpackage8file・32,171Bは今回実受領し、既存884 E4 reader＋codec2bdでfresh filesystem読戻しcomplete、元manifest/output64B/snapshotのhash一致と2種の拒否を独立確認した。builder/writerは呼ばず、元8fileは不変。private selected-weight artifact26は未取得のまま。旧28f/管理60dの6件、今回の884実行、管理側の186検査を別記録とする。取得確認のための再推論・再export・実File再hashは行っていない。

実Textはf76の全512行、mask512位置、model/Tokenizerを固定する。mean・latent・sampleへの読み替え、任意入力やLoRA後入力への証拠付替えを認めない。比較対象・field path・根拠規範は[preflightのdeclarationEvaluation](verification/FIXED-SOURCE-PREFLIGHT.json)とnorm試験に記録した。契約一致で数値証拠だけ不足する場合は互換性を維持し、必須宣言欠落はUNVERIFIED、既知の契約不一致はINCOMPATIBLEになる。

## 資源実測

- 今回の固定preflight：0.830秒、Node CLI/Git子treeの最大単一process RSS 173,703,168B。browser/native/model/reference payload IOなし。合算RAMや推論peakではない。
- P3 owner884観測：LoRA kernel容量33,554,432B、bounded-base Hike容量1,572,864B、最後の限定projection total約0.4ms。現管理環境で再測定した値ではない。
- 旧L4 P4観測のWASM21,102,592B、ORT共有16,777,216B、linear snapshot累積1,811,538,240B/runは旧scopeで保持する。L512の実測へ転用しない。
- L512の25出力63,709,184Bは静的extent。L512 native・host/allocator/GC・全工程peakと組合せ資源予算は未受入、未測定値はnull。

## Workflow・担当への返却

[workflow handoff](workflow/VAE-WORKFLOW-HANDOFF.md)に元21501B workflow、固定Python/editor、source/reference/8slot、供給順と前処理規則を対応付けた。source grid832×480/L81と実供給frame数を区別し、実媒体の寸法・frame index・時刻は未取得null。reference未接続は他入力の一律blockerにしない。editorはlongedge上限848・16倍数・Python ties-to-even・area/crop-disabledであり、848正方形ではない。

LoRAへ[P3受入](https://github.com/Kushyameln01/kushyameln-works/pull/2#issuecomment-6560860277)、VAEへ[workflow/P2維持](https://github.com/Kushyameln01/kushyameln-works/pull/15#issuecomment-6560861777)、Diffusionへ[固定管理a7 runnerと返却条件](https://github.com/Kushyameln01/kushyameln-works/pull/14#issuecomment-6560913977)を送信し、本文を一致読戻しした。[OUTBOUND-RECEIPTS.json](OUTBOUND-RECEIPTS.json)に記録。送信者のGitHub読戻しと受領側本人の取得ACKは別。LoRAから9e9のP3返却4fileのpath/bytes/hash・186項目の受領ACKを[PR7](https://github.com/Kushyameln01/kushyameln-works/pull/7#issuecomment-6561003362)で受領した。VAEの新workflowとDiffusionの固定a7 source ACKは返却待ち。

## 未受入・次の返却

実Text P4の先行native PASS、固定a7管理経由の通常dispatch・対象取消・終端/解放・25出力保存読戻しは未受入。Diffusionの実資材保持環境で、成立したside/scopeから[固定手順](REPRODUCE.md)を実行する。既存prefix・元モデル・参照を理由なく再計算／再取得しない。

LoRA新P4 canonical mapping/feed、selected-weight N-ARTIFACT、他pair/side、joint HIGH/LOW atomic snapshot、全model/本番hidden/全query-head-stage、実HIGH→LOW、生成sample/restore/VAE decode、全工程資源は未受入。LoRAなしbase経路へLoRA固有条件を強制しない。本番の必要条件が揃っていないため生成READYは更新しない。

[検証・取得照合の再現](VERIFY.md)と[機械可読受入記録](ADMISSION.json)を参照。受領側ACKと新しい数値/lifecycle返却が届いたら、そのscopeだけを追加照合する。

## 後着したowner成果の取得・分類

| 新しい配布／実行source | 実取得と確認 | 管理採用・留保 |
|---|---|---|
| LoRA `c4860579d01d9f704cb16714e364a22668f9d57e`／`a80db72feea60b9bd69e292e4716665c6f0ee77f` | [86公開path・42 source・224/224検査PASS](new-owner-returns/lora-c486/RESULT.md)。ownerの7成功case・独立399+76を照合。旧P3元13pathはa80と同一。上記package8は新たに実読戻し | controlled-caller-input N2/K4・light/LOW crossQ先頭4行×5120+bias4のPARTIAL。実Text L512や管理norm/catalog/snapshotの共同採用は未実施。P3の指定3条件は完了を維持し、別のE4再import→prepare未実装を第四条件にしない |
| Text `5b0da96b71708d56d3226a4bd4cb353aa30fbe3b`／`eab4fabfadd133cc97434eed28ea998dca6795c2` | [INDEX14＋API/source3、source22・peer13・gzip3と新WKT実bytes/hashを照合](new-owner-returns/text-5b0d/REPORT.md)。ownerの固定plain全2,097,152値PASSを元scopeで引用 | 新出力whole `ed9bb076…` / payload `6bb54eb3…` はf76と別identity。旧P2 native855/codec2bd、P4 f76入力・参照を変更しない。追加ES依存shared/vr180/sha256.mjsを確認したが候補runtimeへ未採用 |

LoRA P4のowner測定は約22.03分、sampled owned-process RSS和1,472,950,272Bであり、全工程peakではない。Textのowner測定はsampled RSS和5,708,951,552→4,490,174,464B、最大renderer5,025,157,120→3,795,189,760Bへ低下した一方、117.2639→388.5214秒（3.313倍）。4GiB全process予算・速度改善・本番全工程は未受入。管理の再推論・再export・原本File再hash・oracle生成は0。新規追加は取得・保存読戻し・metadataであり、管理実装150fileは固定a7と同一のまま。

新返却の取得結果はLoRA PR2 [comment6561238902](https://github.com/Kushyameln01/kushyameln-works/pull/2#issuecomment-6561238902)、Text PR16 [comment6561240280](https://github.com/Kushyameln01/kushyameln-works/pull/16#issuecomment-6561240280)へ返し、本文を一致読戻し済み。[NEW-OWNER-OUTBOUND.json](NEW-OWNER-OUTBOUND.json)に記録した。取得ACKへの再ACKや再推論を追加条件にしない。
