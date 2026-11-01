# 返却成果の受領・照合結果

2026-11-02 JST。**P2のupdated-884を固定Profileの診断範囲で受入。LoRAの6ケースは管理60dでの実績として受入。
884の追加3条件は保留。新P4は旧固定N2とは別の未採用候補として取得した。**
取得ACKと受入判定は [RETURN-ADMISSION.json](RETURN-ADMISSION.json) で分離する。
取得確認のための再推論・再export・model取得はいずれも0。

## 配布と実行source

| 対象 | 取得した配布SHA | 既存証拠の実行source SHA |
| --- | --- | --- |
| 管理固定 | `f34bf10a67c91f462ab46dec033eaeb2110facf1` | `8849891f19124df31847bd691503c2491278eaa8` |
| VAE返却 | `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48` | 管理884、observer `e150e7ac3c4859739528ff278763c6474968ac08`、native `855f435120f08eb9e818e51281fc26f0e2633829` |
| LoRA返却 | `dd95ed05f058930a391f015c11b9a2b963a42db5` | owner `28f44c3a1b71bef59e2d018a0db736de6d84675c`、管理 `60d16b64d6020d3d20239f087f8add91268dcaad` |
| 新P4候補 | `7ee36228030ba3bb544a90b1d4b528702a7bae32` | final-F32 `5744f700e17b23d5c18d32315fb6dfbd7c49089a`、base `829467c14ec6fd1ab1858dfc175c84605de1ac98` |

管理P2/P3 runner・返却条件・source照合記録と固定N2の引渡しpath／bytes／SHA-256は
[MANAGEMENT-HANDOFF.json](MANAGEMENT-HANDOFF.json) に12件を記録した。
固定source/APIは[管理884](https://github.com/Kushyameln01/kushyameln-works/blob/8849891f19124df31847bd691503c2491278eaa8/docs/shared/ai-connection/API.md#joint-p2p3-receiver-runners)。
この返却照合によるnative/runtime/API/catalogの変更はない。配布SHAと検証scriptの固定sourceはPR #7の引渡し報告に記載する。

## VAE：取得ACKとP2受入

[取得記録](vae/acquisition-receipt.json) は98公開file、6,592,142Bの各path・bytes・SHA-256・Git blobを含む。
updated-884 index93件、管理closure20件、f34との実source一致を確認した。
VAE担当からの管理884取得ACKも、その20件と実行traceを照合して受領した。

管理側で既存E4 readerとcodec2bdを使い、実配布10 packageを読戻してcompleteを確認。
各scenarioのraw／normalized／restored mean各128値を固定5f参照と照合し、marker・model・Profile・context／frame配列を保持した。
roundtrip maxAbsは `2.384185791015625e-7 <= 2e-6`。
正常／復帰の実RGBは各1536値、maxAbsは `4.328787326812744e-6 <= 2e-5`。
両RGBの全file SHAは `4de752c8a7d6df05fed012065bfd222b2f41d4c1c93c2cf8be58edfa24a46d72`、
payload SHAは `aacf932664139862197c2dab5c087ce76305b2622bf02b3f5bde44eb73392d85`。

raw→normalize→marked E4保存読戻し→restore→E4保存読戻し→実decode→実RGB保存読戻しは、
今回の `jointTraceId/currentInputLink`、source、入力／出力hash、queue target、norm receiptで一続きに結び付く。
取消はrunning／creating-sessionの記録、元Promiseの `INVOCATION_CANCELLED` 終端、対象tokenの実close、
queue／owner解放後のfresh token・別request・revision2復帰を確認。
Workerは正常1/1、取消復帰2/2でlive0。取消をdecode成功へ加算しない。

**受入：`wan21-raw-f32-1x16x32` の今回の正常・取消復帰・保存診断。**
歴史的なreceived-RGB2件は今回のdecode証拠に使わず、元encode351の再利用条件はsource/model/profile/context/hashへ束縛した。
初回の不完全source取得によるENOENTは失敗原本のまま保持し、同じ5fの完全Git treeで解消した成功と区別する。
private decoder／model原本の取得や管理環境でのNN実行は行っていない。
原NN・元disk write/read・原model全hash・process観測はowner証拠、今回は実配布bytesの読戻し／全値再比較として区別する。
詳細は [P2照合](vae/REVIEW.md) と [検証出力](vae/verification-output.json)。

## LoRA：管理60dの6ケースと884の差分

[取得記録](lora/acquisition-receipt.json) は21配布pathを実Git bytesへ照合。
gzip 1,211,308B／SHA `29dca21132f34616f48d88f4b81d884378b508b8dac81a9987049371932e1754`、
展開JSON 37,764,410B／SHA `50a58d8f8c94bed2883fc294554acd744039ce0aa36e39ed6046135e5984f032` が一致した。
9manifest、55source、22boundary、DATA原本2件と管理配置、6phase／snapshot／request／revision／resource generation／native tupleを照合。
**249検査PASS、6 canonical snapshot hashもPASS**。これらは受領検査数であり、新しい数値試験件数ではない。

**受入：管理60d、owner28f44の選択light/HIGH・真正bounded base・Q先頭16行×全5120列＋bias16の6正式取引。**
491,520 weight／96 bias／96出力のowner結果を記録済みscopeで受け入れる。
公開JSONの96出力は固定参照と照合した。26 private artifactはdescriptorと既存独立読戻し証拠を照合し、実payloadの再取得・再読としては扱わない。
各caseの正式3phase、現在target、独立copy、取消／終端／解放、queue経由base復帰を保持。
最後のsnapshotは過去factであり、`selectionCurrent:false/currentLiveAdmission:false`。

| 884追加条件 | dd95の未充足範囲 |
| --- | --- |
| 実output16のE4保存・新しいdisk読戻し | `savedPackage/packageFiles` と実snapshot結合receiptがない。出力descriptorは代わりにならない |
| 改変・snapshot欠落の拒否 | 同じ実packageで `ASSET_HASH_MISMATCH`／`REQUIRED_ASSET_MISSING` を確認したreceiptがない |
| native前の参照guard | dd95はactivation先頭+1024で実native `NATIVE_VALIDATION_MISMATCH`。884のexpected先頭+1に対するprepare前 `NORM_REFERENCE_PAYLOAD_MISMATCH` は別条件 |

core runtimeは60d→884で同一でも、新receiverの観測を代用しない。
dd95の8 native試行（6公開＋native失敗1＋取消1）を884予定の7試行へ付け替えない。
884追加scopeは **COMPATIBLE／NOT_VERIFIED／BLOCKED**。成立済み6ケースと既存20件は元scopeで再利用し、全4原本／全baseの再取得や再推論を取得ACKの条件にしない。
詳細は [LoRA照合](lora/reconciliation.md)、[case別binding](lora/case-bindings.json)。

## Diffusion：新P4は別候補

[取得記録](p4/ACQUISITION-RECEIPT.json) は重複排除123file・22,427,434B。
50実行source・13,352,427B（WASM含む）を配布7ee／実行5744のGit bytesに照合し、745検査・不一致0。
APIは36,545B／SHA `77b06f51da7c100c54507b5972aa553797c6cdcd62fbbf641487b18a41a2ca44`、
kernelは10,094B／SHA `4d8518e94bd2de3ab9bf50f09b2fd17b69a5c57e7fd45dc65cd062d7fdbdbc4e`。

新Profile `bernini-block0-n2-cross-ffn-f32-candidate-v1` を
[独立した未採用candidate](p4/CANDIDATE-RECORD.json) に記録した。
owner報告のbase HIGH/LOW各50比較・643,072値、HIGH最終F32の25比較・321,536値を公開receipt間で照合。
private配列を再計算した結果ではない。Textは明示L4 fixtureであり、実Textやcanonical LoRA適用の共同受入ではない。
F32 consumerの2要素sign bit変更試験をLoRA積の成立へ読み替えない。

P4単独WASM容量21,102,592B／idle旧tail併置23,986,176B、3ORT sessionの共有Memory1個16MiBはそのscopeの観測。
host／allocator／GC／全工程peak・組合せ資源予算は未受入。
private model／runtime25配列／独立参照／保存E4本体・実Text値は未取得。
新管理dispatch、新Profileのcatalog採用、実Text、新LoRA mapping、元本番条件・全block・HIGH→LOW・生成は未受入。
LoRAなしbase経路と新LoRA mappingの受入は別scopeであり、LoRA固有条件をbase経路へ強制しない。
旧N2の管理5c／nativea49／配布beffd／返却508dと正本ADMISSIONは変更しない。

## 各担当へ返す組合せと状態

| 組合せ | 状態 |
| --- | --- |
| 固定N2自己注意tail | 既存の固定診断受入を維持。新P4へ上書きしない |
| P2管理884＋Diffusion5f＋VAE855＋codec2bd | 今回の固定Rect診断trace・取消復帰・E4を受入 |
| P3管理60d＋DATA82b＋LoRAfc＋consumer5f | 6正式取引を記録済みPARTIAL範囲で受入 |
| P3管理884の追加receiver条件 | 既知契約互換性を維持しNOT_VERIFIED／BLOCKED |
| 新P4 final5744／base8294 | 別候補・未採用。mapping契約不明はUNVERIFIED、数値のみ不足は互換性と分離 |

各ownerへの返却にはこの記録、全path／bytes／SHA-256の取得receipt、管理固定source・runner・返却条件・source照合記録を結ぶ。
返却記録の固定sourceは `67fb256f3cf47d85a338f8a0af8b30a884796193`。
VAE／LoRA／Diffusionへ返却し、3件とも本文の読戻し一致を確認した。
[送信receipt](OUTBOUND-RECEIPT.json) に各URLと作成時刻を保持する。

- [VAE：取得ACKとP2限定受入](https://github.com/Kushyameln01/kushyameln-works/pull/11#issuecomment-6559983673)
- [LoRA：60d受入と884の未充足3条件](https://github.com/Kushyameln01/kushyameln-works/pull/2#issuecomment-6559984810)
- [Diffusion：新P4取得ACKと未採用scope、固定N2引渡し](https://github.com/Kushyameln01/kushyameln-works/pull/14#issuecomment-6559985966)

これは管理が受領側として返す取得確認であり、相手の追加ACKを取得確認の条件として要求しない。
[再現手順](REPRODUCE.md) は既存manifest・receipt・packageを読み、NN／exportを実行しない。
`generationReady:false`、`load/predict/sample=NOT_READY`。merge・Pages公開は実施しない。
