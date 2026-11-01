# LoRA owner DATA原本の管理配置

このfolderの2つの`.mjs`は、同じrepositoryのowner実装
`82b21f09cb63926543181b16f0e97ebc6b9fa6be`から、全bytesを変更せずに配置したものです。
元の相対importも維持しています。原本、管理での配置先、実bytesの長さ・SHA-256・Git blob SHAは
[SOURCE-RECEIPT.json](SOURCE-RECEIPT.json)に記録しています。

| 原本export | 管理での配置 | bytes | SHA-256 |
| --- | --- | ---: | --- |
| `createLoraManagementAdmissionInputs` | `management-admission-inputs.mjs` | 32961 | `ddf57f4c76333ada1ddf93cf238e5f4ea6219b39afd5dc4d567213667a7d897e` |
| `describeLoraNumericDeclarations` | `numeric-declarations.mjs` | 9909 | `e7dd99d570c666969d76e93747998f3e1c20ba64d9e3b9d1b5f7a19e05aa6b17` |

原本のpathはそれぞれ`docs/shared/inference/lora/`配下です。管理側のdeployment pathや
そのcheckpoint commitを、owner原本のsourceRefへ付け替えません。owner作成の原本をそのまま
保持し、別のlicense表記は付与していません。

## 版と担当範囲

- DATA実装は`82b21f09cb63926543181b16f0e97ebc6b9fa6be`です。
  `lora-numeric-declarations/0.1-draft.1`と
  `lora-management-admission-inputs/0.1-draft.1`をexportします。
- owner引継ぎ・管理0260の再確認証拠は
  `82cd9bb3d6792fa20a5305f52198efca5a30459f`です。40abからの変更は文書と証拠で、
  この2moduleのbytesは82bから変わっていません。
- 実SDK・canonical adapter・5051-byte LoRA kernelのnative pinは
  `fc2789a0f649e33f15eb13750e6a983b5c52d170`です。
- consumerのnative pinは`5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`です。
  DATAの追加配置によってnative pinや既存の数値受入scopeを変更しません。

owner DATAは数値宣言とphaseごとのraw inputを組み立てます。compatibilityの判定、実nativeの
適用、queue・snapshotの調整と最終受入は管理側の既存evaluatorとownerが担います。
原本の構造検査やhash文字列だけで、任意JSONを実ownerの観測へ昇格させません。

## phase bridgeで保持する契約

`preflightInputs()`は実plan・inspection・両registry取得後のpatch別宣言を返します。
将来の数値receiptやpublication receiptを事前に作りません。欠落したdtype/layoutと、
観測済みの矛盾を区別し、`presence`・`origins`・`observed`を保持します。

`checkpointInputs()`には実native検証、全選択81920 weight・16 biasの独立比較、実snapshot
target、外側owner validationを渡します。16出力の検証でweight/bias比較を代替しません。
正式管理経路は最初のcheckpointで`phaseBinding.bound:true`と同じtargetの束縛を確認し、
後のpublicationから欠落targetを補いません。

`postpublicationInputs()`には実publication、owner state、元queueの終端・release証拠を渡します。
管理coordinatorのbrandと実step/context/receiptを管理側で確認し、公開後の寿命は独立した
`isPublishedCurrent`で観測します。公開後監査の失敗でも実publicationの事実を残し、受入と
再利用を停止します。

このsource配置とsource testは、新しい数値実行や共同snapshot受入を表しません。
それらは実際の管理bridge実行receiptで別途記録し、`generationReady:false`を維持します。

## source確認

```sh
node --test --test-isolation=none tools/ai-connection/test-lora-admission-data-sources.mjs
```

テストは独立取得した固定SHA-256・長さ・Git blob SHAで配置bytesを確認し、実exportと必須入力の
拒否を検証します。モデルFile、外部native checkout、Git履歴の追加取得は不要です。

管理独自の `source.mjs` は、`verifyLoraAdmissionDataSources({admissionBytes,numericBytes})`
で両moduleの実bytesを検査し、正式bridgeに渡すruntime brand付き証明を返します。
入力はhash待機前に両方ともcopyします。証明をJSON化・cloneしたものや自己申告のhashでは
正式入口を開けません。受領bytesをコードとして評価する処理はありません。
