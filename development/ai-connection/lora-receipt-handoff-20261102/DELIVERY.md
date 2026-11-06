# LoRA受入証拠の引継ぎ

2026-11-02。管理担当・DiffusionModels担当へ渡す既存成果物を、完全commitと取得path・bytes・SHA-256・Git blobへ束縛した。[機械可読manifest](DELIVERY-MANIFEST.json)が全23entryの正本である。照合は既存metadataに限り、推論・export・原本読取・runtimeコード変更は行っていない。今回の返却記録は別の追補commitとして共有する。

成果物の固定commitは `dd95ed05f058930a391f015c11b9a2b963a42db5`。実行sourceは `28f44c3a1b71bef59e2d018a0db736de6d84675c`、使用した管理は `60d16b64d6020d3d20239f087f8add91268dcaad`。native LoRA fc2789とDiffusion5f880、DATA82bは別の版として保持する。成果物commitを実行sourceへ読み替えない。

## 取得する成果物

| 用途／path | bytes | SHA-256 |
| --- | ---: | --- |
| [P2_P3_ACCEPTANCE.md](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/docs/shared/inference/lora/P2_P3_ACCEPTANCE.md) | 3,583 | `f65685c5e9fa12f65e0522c3f199009912d0eaed02885d19f0275f86f205035f` |
| [run-result.json.gz](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/evidence/run-result.json.gz) | 1,211,308 | `29dca21132f34616f48d88f4b81d884378b508b8dac81a9987049371932e1754` |
| [MANIFEST.json](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/evidence/MANIFEST.json) | 2,333 | `d60f99bfa3f91b0240d0885843172e1cbd9fc75bee20c8f5ac29559ab63eb04f` |
| [receipt.json](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/evidence/receipt.json) | 110,148 | `6e21f7bf9719675cac9fefc237b9eb56fd78533c14493fd0294ae3c55102d7ae` |
| [independent-readback.json](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/evidence/independent-readback.json) | 128,460 | `9d5347bd08387393f508e9985409657f49b19107ef36e89ff4068b25dfdc7ffc` |
| [TARGET-CONSUMER-MATRIX.json](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/TARGET-CONSUMER-MATRIX.json) | 7,720,882 | `aca99eacef49cd827d0db1740fb3311eaa7795c300cd92f4419ed08ea13ea7ee` |
| [TARGET-CONSUMER-MATRIX.md](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/TARGET-CONSUMER-MATRIX.md) | 4,683 | `2a0c75265d1e0b50f2357cd476dd1cf6cb9f3521247a283d7050d06502ce7145` |
| [RESULT.json](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/RESULT.json) | 26,714 | `5616b3c0866c8e7bab6bf098f4cbfdc5ae2288f07dda9871596f0a9f08127361` |
| [RESULT.md](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/RESULT.md) | 13,086 | `041e95efd6094dfe4cc028226c3f17b25999e4c8922c85cfd5fe6cf719b15639` |
| [REPRODUCE.md](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/REPRODUCE.md) | 7,584 | `dbc4cf55d92d17484ba0c55c11e63c7962f5f753d15bf7a44a1b17ba8ebba4ce` |
| [CONSUMER-CONTRACT-RECEIPT.json](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/CONSUMER-CONTRACT-RECEIPT.json) | 6,088 | `6f2a0a27d5272f4af2fa30c6b7c4446feed4901e75845ec48ca3897a35b7a655` |
| [CONSUMER-DEPENDENCIES.md](https://github.com/Kushyameln01/kushyameln-works/blob/dd95ed05f058930a391f015c11b9a2b963a42db5/development/ai-connection/lora-p2-p3-consumer/CONSUMER-DEPENDENCIES.md) | 3,757 | `c5fb6739a30f414b11ba9a2c37b0040b46c392740fc244d928c5d383d2e6c931` |

manifestには上記に加えて計画・残りの検証log/source review、実行receiver3 sourceとmetadata generatorを含めた。各entryのblob URL/raw URLとGit blob SHAを使って取得できる。receiver3 sourceは固定dd95と実行28fのbytes一致を確認した。証拠manifestに収録された9entryは既存bytes/SHAへ一致し、残り14entryは固定Git objectのbytesとhashを確認した。

完全receiptはsummaryではなく既存の `run-result.json.gz` 全体である。圧縮1,211,308 bytes／SHA-256 `29dca21132f34616f48d88f4b81d884378b508b8dac81a9987049371932e1754`、展開後37,764,410 bytes／SHA-256 `50a58d8f8c94bed2883fc294554acd744039ce0aa36e39ed6046135e5984f032`。展開後のmetadata hashも既存manifest・RESULT・compact receiptと照合した。新しい推論、再export、期待値生成は行っていない。

## 引き継ぐ受入範囲

受入済みなのは、28fで実行した管理60d16の `createLoraDataPhaseBridge` による **light/HIGHの旧Q16 PARTIAL診断6case**。実Q full[5120,5120]の先頭16行・全5120列と明示Q bias full[5120]の先頭16値を扱う。強度0/+1/-1、再適用、検証失敗後・取消後の復帰を含み、公開caseの比較は491,520 weight・96 bias・96出力。取消checkpointの81,920 weight・16 biasは公開6caseへ加算しない。

旧25e5の6caseやE1の20caseを新経路の実行として付け替えない。独立参照・gate・原本識別は固定sourceで再利用している。今回の引継ぎは、これらの実行を繰り返したものでも、新たな数値合格でもない。

真正bounded baseは709,364-byte artifactの既存証拠。全base hashは過去owner receiptであり、今回の全base検証ではない。原本・base・選択重み配列は本受渡しに含めず、再読していない。入力はユーザー選択のローカル.safetensorsで、過去4原本の取得・hashを前提にしない。

consumer独立copy、prepared/source解放後のrun、取消の元Promise終端/releaseとbase復帰は既存receiptの範囲で引き継ぐ。leaseは未受入。診断snapshotの公開と本番公開を分け、終了時はbase復帰・snapshot非current・資源解放済み。currentLiveAdmission=false、generationReady=false、modelInference=falseを維持する。

## 新P4・新tailへ持ち越す点

固定dd95には新P4へのLoRA mappingや共同数値受入は含まれない。Diffusion508dの固定N2 tail原文/APIの受領、内部で読む元重み5key、旧Q16 sourceのbyte一致は、LoRA prepared bytesを新tail実sessionへ採用できた証拠ではない。全2,904 patchの新tail状態はDEPENDENCY_WAITINGのままとする。旧Q16の実受入も、新tailの未成立を理由に未受入へ戻さない。

今回、別候補Diffusion7ee362のP4 registry/provider/sink/consumerとWEIGHT-FEEDを受領した。取得path・bytes・hashと旧Q16との差は [P4-CONTRACT-DIFF.md](P4-CONTRACT-DIFF.md) に分ける。新しいF32受取APIがあることと、LoRA canonical mapping・実LoRA適用weight・共同数値受入が成立したことは別である。固定trusted hashへLoRA出力を付け替えず、管理へmappingを複製しない。この引継ぎで共同数値試験を実施したとは扱わない。

## 対向での受領確認

管理担当は正式bridge/API・完全receipt・readbackの版とhash、checkpointとpostpublication、revisionと寿命のscopeを照合する。Diffusion担当は対応表と依存一覧を読み、旧Q16と新P4/tailの実target／session接続可否を分けて返す。受領確認には取得した完全commit/path・bytes・SHA-256、受け入れるscope、残る依存を含める。

固定RESULTにおける個人ACKは管理・DiffusionともNOT_RECEIVED。DATA2 moduleのbyte exact/runtime proofと、今回の成果物を各担当が取得・照合したACKは別である。この受渡しmanifestの作成だけで対向受領・採用完了としない。本人ACKと新consumer提供状況は別途記録する。

取得済みgzipのmetadata一致確認だけを行う場合は、manifest記載の圧縮hashと、`gzip -dc run-result.json.gz | sha256sum` の展開後hashを照合する。REPRODUCE.mdには過去試験の再現手順もあるが、本handoffの受領確認に再推論・原本再取得・再exportは必要ない。
