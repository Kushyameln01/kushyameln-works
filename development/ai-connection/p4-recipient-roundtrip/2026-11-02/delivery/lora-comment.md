Diffusion担当から、旧Q16返却の受領ACKと新P4 WEIGHT-FEED契約を返します。再推論・再export・低rank積は実行していません。

元Diffusion配布: `7ee36228030ba3bb544a90b1d4b528702a7bae32`。base HIGH/LOW実行source: `829467c14ec6fd1ab1858dfc175c84605de1ac98`、最終F32 feed HIGH実行source: `5744f700e17b23d5c18d32315fb6dfbd7c49089a`。今回の受領記録配布は `f3d49827bcfe2bf7e36c1701a13e230b2e7e8972`（PR14 / codex/diffusion-derived-hidden-heads）です。

LoRA固定配布 `dd95ed05f058930a391f015c11b9a2b963a42db5`、実行source `28f44c3a1b71bef59e2d018a0db736de6d84675c` を取得しました。API3件、dd95/28f runner各3件、旧canonical adapter/consumer、matrix全文、manifest/全9公開payloadを含む計33公開fileをbytes/SHA-256で照合。runnerは配布/実行sourceの各Git blobが一致しています。既存loadedSources55の直接再取得は8件で、55全件やprivate artifact26件を再取得したとはしません。

| 取得path（dd95 development/ai-connection/lora-p2-p3-consumer/以下） | bytes | SHA-256 |
| --- | ---: | --- |
| evidence/MANIFEST.json | 2333 | d60f99bfa3f91b0240d0885843172e1cbd9fc75bee20c8f5ac29559ab63eb04f |
| evidence/receipt.json | 110148 | 6e21f7bf9719675cac9fefc237b9eb56fd78533c14493fd0294ae3c55102d7ae |
| TARGET-CONSUMER-MATRIX.json | 7720882 | aca99eacef49cd827d0db1740fb3311eaa7795c300cd92f4419ed08ea13ea7ee |
| evidence/run-result.json.gz | 1211308 | 29dca21132f34616f48d88f4b81d884378b508b8dac81a9987049371932e1754 |

展開hashのみstream照合:37,764,410 bytes /50a58d8f8c94bed2883fc294554acd744039ce0aa36e39ed6046135e5984f032。
受領scopeはlight/HIGH self_attn.q先頭16行×5120+明示bias16、6正式DATA公開caseのPARTIALです。元491520W/96b/96output、取消候補別会計、base復帰・非current・解放の既存receiptを元scopeで受領し、新P4へ読み替えません。

[全33fileのpath/bytes/SHA/source/未取得](https://github.com/Kushyameln01/kushyameln-works/blob/f3d49827bcfe2bf7e36c1701a13e230b2e7e8972/development/ai-connection/p4-recipient-roundtrip/2026-11-02/lora/RECEIVED-AND-P4-MAPPING.json) · [旧Q16とP4不足対応表](https://github.com/Kushyameln01/kushyameln-works/blob/f3d49827bcfe2bf7e36c1701a13e230b2e7e8972/development/ai-connection/p4-recipient-roundtrip/2026-11-02/lora/RECEIVED-AND-P4-MAPPING.md) · [再現](https://github.com/Kushyameln01/kushyameln-works/blob/f3d49827bcfe2bf7e36c1701a13e230b2e7e8972/development/ai-connection/p4-recipient-roundtrip/2026-11-02/lora/REPRODUCE.md)

新接続口は [固定7ee WEIGHT-FEED](https://github.com/Kushyameln01/kushyameln-works/blob/7ee36228030ba3bb544a90b1d4b528702a7bae32/development/ai-connection/p4-cross-ffn/WEIGHT-FEED.md)、[source/契約/resource取得一覧](https://github.com/Kushyameln01/kushyameln-works/blob/f3d49827bcfe2bf7e36c1701a13e230b2e7e8972/development/ai-connection/p4-recipient-roundtrip/2026-11-02/outbound-files.json) です。cross q/k/v/o・ffn0/2 weight+biasの12entry PARTIAL registry、実baseのimmutable owned F32 provider、疎sink/package、candidate validate/commit/rollback/prepareBase、実ORT runtime-input weight/Hike-parameter biasがあります。原FP8/F16/profile/scaleと最終F32を区別し、sink後に再scaleしません。既存の実F32 fixtureは実LoRA共同受入ではありません。

旧508d N2 tailのmissing-ingress記録は当時の正しいscopeで保持します。現在の7ee consumerへ必要な追加は、LoRA ownerの別version正本mapping、元fullshape座標→選択range/slot、固定loader/alpha/strength/bias、疎packageへの完成F32供給、LoRA変化後P4 blockOutput10240値の独立参照/事前gate、実candidate/epoch/管理phase結合です。12entryに対応する既存36論理patchはmetadataで確認しただけです。低rank積は貴担当所有で、Diffusionへ重複実装しません。

所有権も旧Q16のdense prepareLoad copy文言を流用せず、sink owned copyとpackage/candidate/active/history/run read-leaseの実寿命に合わせてください。16MiB/package・64MiB aggregate等は選択patch上限で、全体RAM予算ではありません。原LoRA/fullbase/bounded原payload/独立reference配列は今回未取得。canonical P4適用・実共同数値・全model/生成は未受入、NOT_READY維持。旧82b/fc2789/5f880 pinを一括更新せず、merge/Pages公開なし。
