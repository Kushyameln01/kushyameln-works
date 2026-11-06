# LoRA固定成果の返却と新受取契約へのACK

2026-11-02 JST。今回の作業は既存manifest・receiptを使うsource取得・hash照合・契約差分返却だけである。再推論、再export、原本load/hash、期待値生成、新P4 canonical mapping実装、実LoRA weight生成は0件。

## 渡す成果と実行の識別

固定成果はLoRA `dd95ed05f058930a391f015c11b9a2b963a42db5`、その実行sourceは `28f44c3a1b71bef59e2d018a0db736de6d84675c`、使用管理は `60d16b64d6020d3d20239f087f8add91268dcaad`。light/HIGHの旧Q16 PARTIAL、6公開caseと取消候補別会計を保持する。今回の追補配布commitを、この過去の実行sourceへ付け替えない。

[DELIVERY.md](DELIVERY.md) と [DELIVERY-MANIFEST.json](DELIVERY-MANIFEST.json) は、API・完全receipt gzip・既存manifest・consumer対応表・結果・再現・source等23entryの完全commit/path・bytes・SHA-256・Git blobを持つ。既存manifest9entryと、receiver3 sourceのdd95/28f一致を照合した。

## LoRA担当として取得した正本

| 受領先 | 配布と実行sourceの区別 | 取得・照合記録 |
| --- | --- | --- |
| 管理 | 配布f34bf10a67c91f462ab46dec033eaeb2110facf1、runtime/API source8849891f19124df31847bd691503c2491278eaa8 | [884比較本文](MANAGEMENT-884-COMPARISON.md)、[完全path/bytes/hash](MANAGEMENT-884-COMPARISON.json) |
| Diffusion | 配布7ee36228030ba3bb544a90b1d4b528702a7bae32、対向最終実行5744f700e17b23d5c18d32315fb6dfbd7c49089a、base実行829467c14ec6fd1ab1858dfc175c84605de1ac98 | [P4比較本文](P4-CONTRACT-DIFF.md)、[完全path/bytes/hash](P4-CONTRACT-DIFF.json) |

管理884 source136件とf34の同bytes、60d/884のcore13件一致を確認した。既存6caseは入力・pins・選択範囲・gate・正式3phase・取消復帰・copy等の証拠を持つ。ただし新runner884の実行、新expected-payloadのpre-native拒否、initial-one output16のE4保存・実disk読戻し・改ざん／snapshot欠落負例、新runの返却traceは未受入。60dのartifact/native package hashをE4読戻しの代用にしない。

新P4には最終F32用registry/provider/sink/consumerがある。旧Q16と共有できる契約要素、追加mappingが必要なkey・full shape・block単位・manifest・10240出力検証・immutable lease、未検証を分離する。旧508 tailの「注入口なし」を新P4へ一般化せず、新P4のF32 feed実証を実LoRA適用済みと扱わない。

## 完了と未成立の区別

今回の取得・照合と相手への返却は受渡し工程である。新P4向けLoRA canonical mapping、実LoRA適用済みweight、新P4共同数値試験、管理884の追加返却条件は未成立のまま。静的なkey/full shape一致候補を実接続済みtargetへ数えず、PARTIALと既存pinを維持する。

LoRAが管理884/P4 sourceを取得したACKと、管理・Diffusionが今回のdd95 packetを取得したACKは逆向きの事実である。コメント掲載と相手の取得確認を同一視しない。返却先のコメント・読戻し・逆向きACK状態は `RETURN-STATUS.json` に別記する。merge・Pages公開は実施しない。
