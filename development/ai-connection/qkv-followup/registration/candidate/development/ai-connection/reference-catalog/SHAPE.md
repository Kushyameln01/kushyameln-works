# 目的と管理側の照合項目

版1.0-draft.1。状態はdocumented-draft。本書とshape.v1.jsonは、既存native契約を参照する形状台帳であり、新しいnative APIやruntime validatorではない。runtimeIntegrated=falseはこの台帳の未組込みを表し、既存の単体機能まで未実装とする意味ではない。

管理が照合する最小項目は、選択operation、native契約/source/build、profileの有無、dtype/layout/shapeと配列長、meaning、model/Tokenizer/decoder識別、必要mask、asset/manifest対応、所有権と検証scopeである。shape一致と数値空間一致を別判定にする。正規化・復元の数値処理はDiffusion、VAE encode/decodeはVAE、Text encodeはTextEncoderが所有し、管理は同じ式を再実装しない。

recordIdはこの新台帳内の参照ID。nativeProfileIdは取得済み原文のIDだけを記録し、存在しなければnullとする。台帳IDをnative profileIdやprotocolVersionへ送らない。管理上の共通規範と、各数値ownerのnative受理条件・実行準備を区別する。

# VAEの固定shape profile

| recordId | nativeProfileId | RGB NCTHW | raw latent NCTHW | latent要素数とbytes |
| --- | --- | --- | --- | --- |
| SHAPE-VAE-WAN21-F5-16X16 | wan21-raw-f32-5x16x16 | [1,3,5,16,16] | [1,16,2,2,2] | 128、512 B |
| SHAPE-VAE-WAN21-F1-16X16 | wan21-raw-f32-1x16x16 | [1,3,1,16,16] | [1,16,1,2,2] | 64、256 B |
| SHAPE-VAE-WAN21-F1-16X32 | wan21-raw-f32-1x16x32 | [1,3,1,16,32] | [1,16,1,2,4] | 128、512 B |

native契約はworks-ai-1、dtypeはfloat32、layoutはNCTHW、raw meanのmeaningはraw-posterior-mean。Wan2.1 VAEの識別は2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b。各profileのmanifest、graph・重み、bytes/hashを一組で確認する。未提供assetや未実行profileは、shapeが一致しても実行readyとしない。

F5と非正方形F1はともに128要素だが、時間軸と空間軸が異なる。要素数だけで置換・reshape・paddingして受理させない。native側がprofileIdを任意に受け取る場合は指定値とshapeから選ぶIDを照合する。本書のためだけにnativeへ未定義fieldを追加せず、元契約にない必須入力を作らない。

モデル構造からのF=4n+1、T=(F-1)/4+1、H/8・W/8という関係と、実exporterのN=1、H/Wが16以上の16倍数という条件は別である。これらを満たす任意shapeが受入済みになるわけではなく、上表以外には別profile・export・参照比較・実ブラウザ受入が必要である。manifestのshapeだけを書き換えない。

生成sampleは、同じlatent shapeでもmeanとは別契約である。wan21-raw-generated-sample:v1とlatentContractによるproducer列・decoder・raw/restoredの照合を別に行う。shape台帳はmeanを生成sampleへ改名する権限を与えない。

# Text EncoderのBLC契約

recordIdはSHAPE-TEXT-UMT5-BLC。独立したnative shape profile IDは確認できないためnativeProfileIdはnullとする。wan-umt5-staged-fp32はmanifest形式であり、ここで新しいshapeProfileIdへ読み替えない。

| 入力経路 | 出力 | 入力とmaskの条件 |
| --- | --- | --- |
| plain text | float32 BLC [1,512,4096] | BOSなし、EOS1、PAD0、EOS込み最大512、無断切詰めなし |
| token IDs | float32 BLC [1,L,4096]、1≤L≤512 | ID0..256383、同長0/1mask、少なくとも1位置有効。EOS/padding自動追加なし |

meaningはtext_hidden_states。maskはUint8Array[L]で、内部mask位置と出力Lを保持し、mask0行は0とする。textとID/maskを同時指定する曖昧入力は拒否する。

native出力のmodelSha256はc3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68、tokenizerSha256はe3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458。期待Tokenizer hashは、任意の入力ID列の出所認証ではない。旧ファイルのTokenizer hash省略を維持する経路があっても、Tokenizer同一性まで検証済みと分類しない。

plain text出力の512×4096=2,097,152要素、float32で8,388,608 Bという寸法を、Diffusion pointwiseの1,048,576要素予算で拒否しない。conditioning validatorとpointwiseは別operationである。ComfyUI固有prompt重み、custom embedding、clip-skip、pooled出力などの未対応は維持する。

# ownerの能力と管理採用版

| 層 | 確認できる範囲 | 自動的には含まない範囲 |
| --- | --- | --- |
| VAE owner855f4351… | 上記3固定profileのFP32参照・実Hike/ORT受入 | 実workflow媒体、81frame、生成sample実結合、元GPU精度 |
| Diffusion owner5f880fd8… | 上記3shapeのmean検査・正規化・復元。Rect専用exportとABIあり | 大shape、生成sample、full model推論 |
| 管理採用Diffusion438972f… | F5/128とF1/64の採用版 | owner5fのRect/128を採用済みとしない |

owner5fの能力と、管理285967の採用pinは別である。コードが一部同byteでもcommit/build/kernel/profileの採用を暗黙更新しない。Rectの別owner同browser診断は、管理snapshotや全sessionの受入ではない。

# 管理の判断と未知の扱い

配列dimは正の整数、shape積・dtype幅・配列長/byte長の整合を検査する。有限float32、厳密な軸順、semantic meaning、producer/decoder/model bindingを別項目として照合する。未知のprofileや必要識別未取得はUNVERIFIED、既知のshape・意味・binding不一致は当該edgeのINCOMPATIBLEとして根拠を残す。

契約適合でもasset未提供・busy・未検証scopeはreadyではない。全moduleへWan shapeを強制せず、別familyはそのmoduleの版付き契約で判定する。既存診断profileを利用者の入力へ勝手に縮小適用しない。

# 根拠と未受入範囲

固定sourceは次のとおり。本文の台帳化は静的照合であり、この作業でモデル再実行は行っていない。

- VAE/Text API：Kushyameln01/kushyameln-works、855f435120f08eb9e818e51281fc26f0e2633829、docs/shared/inference/API.md。
- Diffusion API：同repo、5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3、docs/shared/diffusion-models/API.md。
- 管理の採用とscope：同repo、28596717182e48aeb23c719c51b6e593edf4e496、development/ai-connection/E1-ADOPT-RESULT.md。採用Diffusionは438972f30242e0a3bc66edb8591f38eaa0fcd384。

元source動画[1,3,81,480,832]とlatent[1,16,21,60,104]、実slot/referenceの各ratio、実generated sampleのproducer→復元→decode、全生成と端末負荷改善は、このshape台帳では未受入として残す。

# 文書の参照先

[総合管理台帳](https://chatgpt.com/space/page_7036da19567881918356235b7aa82b83)／[管理照合規範](https://chatgpt.com/space/page_7972cb392a3481918a1ceb0b7501bb76)／[数値規則](https://chatgpt.com/space/page_ecfe5b714e008191a7779e5cd2bad42c)
