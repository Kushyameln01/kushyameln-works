# QKV N16 catalog登録案の検証結果

日付: 2026-11-01 JST。ユーザー依頼1の登録資料を対象とする。実モデル数値演算は再実行せず、固定された既存N16診断のscopeを保って再利用した。

## 成果

- [登録要求](../../../../docs/shared/diffusion-models/profiles/registration-qkv-n16.json): `works-profile-registration-proposal/0.1`、`PROPOSED_NOT_PUBLISHED`。
- [説明・入場条件・数値規則](../../../../docs/shared/diffusion-models/profiles/registration-QKV.md)。
- [preview catalog](candidate/docs/shared/ai-connection/reference/catalog.v1.json): 提案文書版 `1.0-draft.2`、21 Profile / 14数値規則 / 13管理規範。`runtimeIntegrated:false`。
- [receipt.json](receipt.json): 固定原本、追加件数、生成14ファイルの全長・SHA256、92 source assetの確認結果。

提案SHA256は `5f9afe091548befcf4f555b1fcf6f015c23fbeed0a4d3ab8e09ebb07ac2b535f`（56898 bytes）、preview catalog SHA256は `3aeccea544fd26bc8720c9bcb700445a41ab1536b1288c84a4d35b5f67047f1d`。source/build bindingの内容を変えた場合は再生成し、新hashとして扱う。

## 検証

| 検査 | 結果とscope |
| --- | --- |
| 原本 `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` の原版validator | PASS、18/10/12。静的catalog・本文整合性だけ。[log](baseline-validation.log) |
| 登録generator | PASS、固定catalog hash・原本6 data/7本文hash、固定C build/source/kernel byte、LOW/HIGH既存receipt・sourceを照合 |
| 変更境界の契約試験 | 16/16 PASS。[GREEN log](green.log) |
| 管理旧adoption・旧record・旧rule保持 | byte入力保持、各旧object不変、別candidate set追加を確認 |
| 独立レビュー | sourceBuild全体照合不足の指摘を修正後、15/15再確認。続いて追加した未知owner asset拒否もtargeted再実行PASS。最終16/16 PASS、追加blocking findingなし |

negativeは、原本catalog改変、同じAPI版を名乗る異なるkernel、gate緩和、自己整合する偽owner計画・未知owner asset、5120から128へのnorm軸変更、production/readiness昇格、旧adoption/record ID上書き、catalog IDのnative ID偽装、build/handoff/API/native descriptorの付替え、旧文書版の維持を拒否する。受理後に入力dict/byte列を変更しないことも確認した。

[red-source-anchor.log](red-source-anchor.log) は、計画とそのhashを同時に書き換えると固定commit文字列だけでは防げなかったREDを記録する。固定build-info/計画/入場条件/receiptの既知hashを信頼基点として加え、再検証した。[red-native-identity.log](red-native-identity.log) は独立reviewerが指摘したhandoff/API/native schemaの付替えを再現し、sourceBuild全体の固定照合で解消したREDである。

[red-owner-asset.log](red-owner-asset.log) は、固定source一覧外の任意byte列を同じcommit名義で追加するケースのRED。固定build/receipt/既知hashで認証されるsource集合との完全一致を要求し、余分なassetや未宣言assetも拒否した。

## 再現手順

repositoryに次の完全commitが必要。

```text
catalog base: 6dae9a6fac3e9ad29ea941f22211edbe4aa894ad
runtime code: 8cdfd3f5f7db0cd66762e78f09c209fb5b27366b
handoff:      621796a2cb5266a4c8ea7abc2f676322836360c5
```

```sh
PYTHONDONTWRITEBYTECODE=1 python3 tools/diffusion-models/build-qkv-registration.py
PYTHONDONTWRITEBYTECODE=1 python3 tools/diffusion-models/test-qkv-registration.py
```

生成器はGitから固定入力を取り、[receipt](receipt.json)の同一SHA256と件数を返す。モデル・reference raw payload・ネットワーク・compilerは使わない。原版validatorの再現は、原本catalogが列挙する6 data/7本文と原版 `development/ai-connection/reference-catalog/validate_catalog.py` を同じ相対pathの一時checkoutへ取り出し、`python3 development/ai-connection/reference-catalog/validate_catalog.py` を実行する。拡張previewに原版の件数固定validatorが通るという主張はしていない。

## 未受入

- 共通catalog正本への登録、管理側runtimeによる新規範の採用、Page/原本文書の改版・公開。既存旧manager candidateは維持する。
- N16 fixtureを実post-modulation hiddenへ読み替えること。後続N2由来Profileは別entryであり、本案のscopeを増やさない。
- 元FP8/GPU precision一致、全query/head/32760token・全layer、高低切替、重みstaging/copy込みの全工程同時保持容量、モデル推論・生成。既存のowner数値試験と容量観測は元scopeのまま利用する。

`actualModelHiddenVerified:false`、`productionQKVVerified:false`、`generationReady:false`、`managerAccepted:false`、P5 `BLOCKED`、`load/predict/sample=NOT_READY` を維持する。本案は管理判断器・数値評価器を追加しない。
