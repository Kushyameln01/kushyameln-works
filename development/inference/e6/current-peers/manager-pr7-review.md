# E0/E2/E4 管理PR #7受領後の追補確認

2026-10-31 JST。新しい取得可能な[Draft PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)を根拠に再調査した。APIから取得時のheadは **`a26879057d169cb2eecff30503d64adba5057c52`**、ref `codex/ai-connection-e0-e4`、base `029ce9336a61e53bc6172fa4a7b7189b15f2efa0`、open/draft、merged=false。

## 現在の結論と旧記録

**当該a268版の管理実source取得不足は解消した。** 5種共通schema、validator、Text/VAE adapter、owned artifact変換、E4 packageを実際に取得し、G1Cの追加metadataに関するsource照合と小fixture実行を行った。以前の21e77取得422/404は、その時点の取得結果として [manager-review.md](manager-review.md) に保持する。以前の「現在未取得」をa268にも適用し続けない。一方、21e77そのものの原本を以前から取得していたとは記録しない。

今回確認したのは **schema/adapter/実codecと小さいbinary package、実clientのWorker所有者境界** である。管理sourceをText/VAE側へmerge・複製実装せず、native API・codec・kernel・既存12fixture・model dataは変更していない。Text24層やVAEのニューラル推論、実Chromium管理adapter接続、Diffusion生成sample復元は実行していない。

## 取得物とhash

GitHub connectorで完全commit、text-vae/core/artifacts/package source、ディレクトリ一覧・Git blob identity、PR metadataを取得した。connectorはbinary archiveを取得できないため、試験用に同じ完全commitの公開codeload ZIPをHTTPSで私有work領域へ取得・展開した。

- URL: `https://codeload.github.com/Kushyameln01/kushyameln-works/zip/a26879057d169cb2eecff30503d64adba5057c52`
- bytes: **19,129,780**
- SHA-256: **`b47ada033c5df1f7a0b6763178fd8f77a40aa3d8c877435bfbe64cbe83db8c71`**
- connectorが返したGit blob SHA-1と、展開したschema/validator/adapter/package/test等 **32 fileを一致確認**。全archive memberをGit treeと照合したという主張ではない。
- 試験に使った実G1C native codec SHA-256: `4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b`。各real-codecケース自身もこの固定hashを検査する。

機械可読記録は `manager-pr7/retrieval.json`、`source-checks.json`、`direct-node-results.json`。取得元URL・完全commit・bytes/hashを記録し、環境内pathの存在だけを受領証拠にしない。

## 実schemaとnative対応

共通5schemaは `contracts/module.schema.json`、`artifact.schema.json`、`pipeline-profile.schema.json`、`execution-snapshot.schema.json`、`edge-decision.schema.json`。全てJSON Schema2020-12、規格IDは `works-module-contract/1.0-draft.1`。同じ定義をbrowser向け `contracts/schemas.mjs` がexportし、`descriptor.mjs` は5validatorとport validatorをexportする。追加でE4の `package.schema.json` / `works-artifact-package/1.0-draft.1` がある。

| G1C項目 | 取得した実sourceの対応と確認 |
| --- | --- |
| native wire/操作 | `adapters/text-vae.mjs:3` はworks-ai-1/moduleを限定し、公開native関数をそのまま呼ぶ。管理規格へapiVersionを付け替えず、sourceVerified=false時はdispatchしない |
| dtype/shape/meaning、mask/Tokenizer | `adapters/artifacts.mjs:35` はnative tensorと元応答を別々のowned snapshotにし、元metadataを保持。binary metadataはref/type/byteLengthへ写す。restoreはnative所有コピーを返し、参照差替えとdescriptor改変を拒否。Text512/ID Lを書き換える演算は追加しない |
| 全producer/decoder | `artifacts.mjs:42` はproducer配列を全件順序保持でidentityへ写し、VAEはconsumer bindingへ分離。`descriptor.mjs` はG1C登録規格を選択した場合、producer全件/順序・decoder・厳密meaningの矛盾を拒否 |
| contextのframe/時刻 | `artifacts.mjs:46` はinput/slot/indices/timesSecondsを配列のまま写す。F5→T2のfixtureでframe5件と重複を維持。strict native context/latentContractへの管理field混入もvalidatorが拒否 |
| evidence/未知optional binary | native応答全体を `responseRef` へ保持し、optional metadataも元native snapshotに保持。E4は明示したattachment bindingからmask/Uint16/evidence/extensionを実bytesへ復元する |
| 保存 | `package.mjs` はwhole-native-file hash、descriptor/evidence/trace/snapshot/extensionsとmanifest receiptを照合。payload hashだけに依存しない。実G1C codecを登録し、native metadataとsidecar矛盾を拒否 |
| RGB来歴 | native結果のRGB tensorと応答evidenceを両方captureできる。実生成sample→復元→RGB/evidenceの履歴構築は呼出し側の明示binding/記録が必要で、invokeの成功だけで完全保存済みにはしない |

対応する固定sourceは、[artifacts.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/a26879057d169cb2eecff30503d64adba5057c52/docs/shared/ai-connection/adapters/artifacts.mjs)、[descriptor.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/a26879057d169cb2eecff30503d64adba5057c52/docs/shared/ai-connection/descriptor.mjs)、[Text/VAE adapter](https://github.com/Kushyameln01/kushyameln-works/blob/a26879057d169cb2eecff30503d64adba5057c52/docs/shared/ai-connection/adapters/text-vae.mjs)、[package.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/a26879057d169cb2eecff30503d64adba5057c52/docs/shared/ai-connection/package.mjs)。この範囲でG1C-MAPPINGとの重要な新しい不整合は見つからなかった。任意の全入力/全consumerの受入を証明したものではない。

## 今回実行した検査

取得したa268のtest sourceを変更せず、私有checkoutで実行した。`WORKS_NATIVE_CODEC_PATH` と `WORKS_NATIVE_ROOT` は、hashを検査する既存G1C sourceを明示指定した。

| 実コマンド | 結果 | 実証する範囲 |
| --- | --- | --- |
| `node tools/ai-connection/test-descriptor.mjs` | **26/26 PASS、skip0** | 5schema/browser export一致、複数producer/decoder/context、unknown required、strict native key、順序/meaningの負の検査 |
| `node tools/ai-connection/test-adapters.mjs` | **13/13 PASS、skip0** | native→共通→native所有コピー、mask/Tokenizer/F5配列/evidence/optional binary、参照改変拒否、要求ID/文字列error/取消対象、connected edge gate。native推論関数はdoubleを含む |
| `node tools/ai-connection/test-package.mjs` | **34/34 PASS、skip0** | JCS/profile、実ファイル保存、whole-file改変、欠落/evidence/unknown extension、実G1C codecの生成sample metadata往復とmask/optional Uint16回収。NN推論ではない |
| `node tools/ai-connection/test-native-owner.mjs` | **2/2 PASS、skip0** | 実G1C client sourceをGit blob固定、実Node Workerによる取消/終端/解放barrier。Worker計算はtransport fixtureで、実Hike/ORTモデルやChromiumではない |

これらの件数は異なるscopeであり、既存12fixture・Python・全生成の件数へ合算しない。最初の `node --test` 4file実行はfile単位の4PASSだけが表示されたため、その表示をケース数として採用せず、上の直接実行で各ケースの明示結果とskip数を回収した。調査用の意図的失敗probeはproduction testの失敗ではない。

各testログとSHA-256を `manager-pr7/direct-node-results.json` に保存。実行したtransient Python helperにProcessOwnershipを置き、直接起動した4 Node PIDと観測子processを記録した。実行終了後の観測範囲ではliveAfterClose=[]、zombiesAfterClose=[]、errors=[]。50ms samplingであり全短命forkの捕捉を保証しない。

## 更新できる状態と残るedge

- **更新可:** a268の管理正本取得・5schema/validator受領、Text/VAE mappingのsource整合、小fixtureと実native codec/package/Worker-owner境界の限定合格。21e77未取得だけを理由にこのa268版のE0/E2確認を停止し続けない。
- **残る:** 管理adapterを介した実Chromium/native operation接続、実shapeのprofile readiness/資源、実Diffusion側とのmean新profile照合、generated sampleの実producer/復元/decoder比較、完全生成snapshotと本番package。
- **保持:** Text `[1,512,4096]` とID `[1,L,4096]`、mask/Tokenizer、旧mean、native works-ai-1、既存fixture。管理版を受領しただけでVAE側の数値正規化・復元は追加しない。
- **E6 profile注意:** 64要素F1と旧128要素profile、または同じ128要素でも非正方形時間/空間shapeは別。実shapeを登録規格と対向validatorへ照合し、要素数だけで互換判定しない。

外部担当本人のACK、mainへのmerge、Pages公開、管理側修正は行っていない。本追補と機械可読取得/検査記録だけを窓口へ渡す。
