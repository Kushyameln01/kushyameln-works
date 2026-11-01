# N2共通catalog登録packageの結果

日付: 2026-11-01 JST。新plan Task1のデータ登録工程を対象とする。数値model/operatorは再実行せず、固定e480の限定scopeの合格結果を再利用した。

## 新規成果

- [共通形式の登録要求](../../../../docs/shared/diffusion-models/profiles/registration-qkv-n2.json)。新4 record / 5 rule / 1 norm / 独立candidate。
- [宣言・入場条件・gate・source/build説明](../../../../docs/shared/diffusion-models/profiles/registration-QKV-N2.md)。
- [新preview catalog](candidate/docs/shared/ai-connection/reference/catalog.v1.json)。提案文書版 `1.0-draft.3`、`runtimeIntegrated:false`。
- [receipt](receipt.json)。生成14ファイルの長さ/hashとsource141assetの検査結果。

| データ | Profile | 数値規則 | 管理規範 |
| --- | ---: | ---: | ---: |
| 6dae原本 `1.0-draft.1` | 18 | 10 | 12 |
| 固定78aのN16 preview `1.0-draft.2` | 21 | 14 | 13 |
| 本N2追加preview `1.0-draft.3` | 25 | 19 | 14 |

登録要求SHA256: `da456cc58fde7159ad2cb82d8ef54b61f9dab30e046aa29abb8f052569ab04ea`、123832 bytes。

preview catalog SHA256: `36352a751037d59db3fee3911f237561b629db6453e7ab7bbee9e678f7a4db05`。

`mainBuildCommit` は `e48021d8da29ef3b3b9e9d6161331c282798b6b3`、handoffは `78a3268166eca63e5daafb1b21e184224c4d14b1`。旧owner案のmainBuildCommit placeholderを本packageへ引き継がない。main89 sourceの旧build `148a33420c9b87accd25b92d94f8160bbc7e14298e6ef7cdd4b5b65d70701c10` と7 Hike kernelのbyteを明示する。

## 再利用した証拠

- HIGH index1 / LOW index3の実Rect raw mean＋固定明示noiseからblock0 post-modulation hiddenまで、各side14 stage・9 parameter decode check。
- そのnatural LC `[2,5120]` / grid `[1,1,2]` / 座標 `[[0,0,0],[0,0,1]]` / source `[0,0]` / contextなしから、全2query×全2key×全40head、O投影前まで各side11比較。
- 実hidden local独立referenceと、独立prefix composed referenceの別receipt・別gate。以前のN16明示fixture/head0結果は別candidateのscopeを維持する。

これらは固定runtime `e48021d8da29ef3b3b9e9d6161331c282798b6b3` の既存receiptであり、本登録の新規数値試験ではない。private weight/hidden/reference payloadはGitへ追加しない。

## 新規の静的検証

| 検査 | 結果 |
| --- | --- |
| RED→実装→GREEN | 先に16契約試験を作成し、実装未提供のREDを記録。[RED](red-initial.log) / [GREEN](green.log) |
| 契約・negative | 16/16 PASS。source/gate/precision/shape/native ID/adoption偽造を拒否 |
| source認証 | 固定handoff hash、canonical6dae hash、保持N16 preview全14ファイル、main89 closure、実行source・既存結果・別reference receiptを含む141 asset一致 |
| 旧内容保持 | 旧record/rule/norm、旧manager adoption、N16 candidate、旧registrationSourceBuildを不変で保持 |
| 独立レビュー | 16/16再実行PASS。追加のLOW sigma、prefix timeSin precision、prefix LayerNorm付替え、prefixDescriptor偽造も拒否を確認。blocking findingなし |

negativeには、原本/N16 byte改変、同一API/commit名義の異なるkernel、自己整合した偽plan/hash、未知owner asset、偽handoffによる再anchor、事前gate緩和、native admissionのshape/grid/座標/source/context/flag変更、prefix依存の削除、catalog IDのnative ID偽装、build/commit/API/descriptorの付替え、旧record/adoption IDの流用を含む。

## 再現

必要なGit objectは固定6dae / e480 / 78a。取得先は[説明文書の正本表](../../../../docs/shared/diffusion-models/profiles/registration-QKV-N2.md)。checkoutした新packageに対して実行する。

```sh
PYTHONDONTWRITEBYTECODE=1 python3 tools/diffusion-models/build-qkv-n2-registration.py
PYTHONDONTWRITEBYTECODE=1 python3 tools/diffusion-models/test-qkv-n2-registration.py
```

同一proposal/catalog hashと25/19/14件を返す。生成器はGitの公開コード/JSON/WASMだけを読み、上流catalog・旧preview・元source/build・旧receiptを変更しない。原版catalog validatorの件数固定assertを新previewへ通したとは主張しない。

## 未受入

共通catalogの正式登録、管理runtime採用、本文/Page更新・公開、元production入力/precision・ordered context、実HIGH→LOW handoff、O投影以降・全block/timestep、Memory/staging/copy/time込みproduction予算、全model推論と生成は未受入である。別Task2の新しい資源観測を本登録結果へ自動合算しない。

`managerAccepted:false`、`generationReady:false`、`originalWorkflowInputsVerified:false`、`originalProductionPrecisionVerified:false`、`fullSequenceVerified:false`、`fullSelfAttentionBlockVerified:false`、`load/predict/sample=NOT_READY` を維持する。commit/pushとDraft PRへの掲載はroot担当が行う。
