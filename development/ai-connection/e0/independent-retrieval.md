# E0 独立取得・復元の検証

2026-10-31 JST。取得元は [DiffusionModels 接続検証用ソースと公開契約](https://chatgpt.com/space/page_2b15f0bb13288191837ee215949aa89d) のPage本文と、その本文にある実`library-file:`参照。Page閲覧ツールの`read_page(view:full)`、`read_page_reference`で原文を受領した。提供者のlocal archive・Git checkoutは取得元に使っていない。

## 確認結果

- index 4,148 bytes、SHA-256 `24c50ae8cd87d5d3f31254f5927a96f884578cdb99c920becdec1823ba8a9885` を受領・再計算一致。
- sourceKit 126,833 bytes、SHA-256 `51ac0ba878681bc1c09ee11b2c063852f77903203191d9b1076e5e7d1b752fb1` を受領・再計算一致。9つの原文をそれぞれpath/SHAと復元archive内bytesへ照合。
- 9 JSON partsを全てPage参照から受領。各JSONの実bytes/hash、decodedSHA256、partIndex/count、byteOffset/byteLength、完全commit/archive宣言を検査し、連続順で復元。
- 復元tar.gz 3,855,440 bytes、SHA-256 `43d087ddac1ebda890a5d5225a70026b4c79150f464bf574321e086e9dbf32d3`。PAX commentは `f522d9aeff313558c4ef83022a340af9a4c21391`、file数200。
- 同梱原902 archive 73,134 bytes、SHA-256 `3464794167492e1440a918ab38e9823e6d9d030d141e58fb596fae7b482fdbb0`。PAX commentは `9023329b8d803306abcdd9342f24c01ba0df2676`。manifestのpath集合32件、全bytes/SHA-256/Git blob SHA-1を照合。
- 相対path、安全なmember種別を確認し、archive内sourceを実行していない。モデル・LoRAのダウンロードやNN実行はない。

## 原文9ファイル

| path | bytes | SHA-256 |
| --- | ---: | --- |
| `docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md` | 11402 | `dd4a645757d3d79305299f09a4fc5cd6488cb477a2d6c1d594f301e4f78c295f` |
| `docs/shared/diffusion-models/lora/diagnostic-base.mjs` | 7321 | `a252458a300fa6b305ed976b412b9924cf61e3795c8cace625f91742eab179a8` |
| `docs/shared/diffusion-models/lora/diagnostic-consumer.mjs` | 16475 | `fdac31542f87d68b9e01a1ba674ee9b60433cae685d6670222f8d914dd27f943` |
| `docs/shared/diffusion-models/lora/diagnostic-identity.mjs` | 1365 | `35ed52cde91236e764acd61ce912a96aea6627c249eeccd3c8039036069de9c9` |
| `development/ai-connection/diagnostic-registry-examples.json` | 7060 | `38059838dfc5f38e7da5512aaf6bdb324b529ec048ab1f2d4ef6faea21e68f61` |
| `development/ai-connection/FEASIBILITY.md` | 16466 | `c5d7aa8a43e1aec46dd45d9bad3e88fc0383c12a6c37c68a989e3bdbc72903b3` |
| `development/ai-connection/feasibility.json` | 34942 | `0bf66d8f7010fc09b435eb1e14ae168a7036d5bfe24c3cdd4c30a701fa8839e9` |
| `development/ai-connection/CORE-CONTRACT-MAPPING.md` | 17633 | `79db8ead04d2e27d3fed3ffba32ee67aa57daa4c24ec2d6f1b5620870809fa9d` |
| `development/ai-connection/DIFFUSION_RESULT.md` | 7862 | `3b788a125d077fe1bae3623cfe19934fbcf2d3b55943958aa3153c8a8c9d4ab8` |

詳細な参照・各part検証値は `independent-retrieval.json`。復元・検証用の受領bytesは受領者専用 `/workspace/work/diffusion-e0-receiver` に保持した。このpathは取得手段ではなく検証結果の保存先である。

## 判定の範囲

**提供可能・Pageツールで独立取得/復元できることは確認済み。** 本検証は同じ権限下の独立検証agentによる取得試験であり、LoRA担当本人の受領済み・契約合意・実LoRA共同試験成功とは別である。これらは引き続き未確認。ZIP形式自体のPage閲覧対応を主張せず、UTF-8 JSON＋base64分割経路を使用した。

Page本文の参照と保存状態を確認したが、UIプレビューや別アカウントのアクセス権は検証していない。
