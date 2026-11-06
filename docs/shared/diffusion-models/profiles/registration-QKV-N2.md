# 実Rect prefix由来N2 / 全40head Profileのcatalog登録案

日付: 2026-11-01 JST。`PROPOSED_NOT_PUBLISHED`、`runtimeIntegrated:false`。本書と[登録要求JSON](registration-qkv-n2.json)は、既存N2の数値証拠を共通catalogのrecord/rule/normへ対応付けるデータ案である。管理側採用・公開・モデル再試験は実行しない。`load/predict/sample=NOT_READY` を保つ。

## 正本・版・旧候補の保持

| 対象 | 完全commitと取得先 |
| --- | --- |
| 共通catalog正本、文書版 `1.0-draft.1` | [6dae9a6fac3e9ad29ea941f22211edbe4aa894ad/catalog.v1.json](https://github.com/Kushyameln01/kushyameln-works/blob/6dae9a6fac3e9ad29ea941f22211edbe4aa894ad/docs/shared/ai-connection/reference/catalog.v1.json) |
| 本案の数値演算・source/build・既存結果 | [e48021d8da29ef3b3b9e9d6161331c282798b6b3](https://github.com/Kushyameln01/kushyameln-works/tree/e48021d8da29ef3b3b9e9d6161331c282798b6b3) |
| 固定handoff | [78a3268166eca63e5daafb1b21e184224c4d14b1/handoff.json](https://github.com/Kushyameln01/kushyameln-works/blob/78a3268166eca63e5daafb1b21e184224c4d14b1/development/ai-connection/qkv-next/handoff.json) |
| 保持するN16 preview、提案版 `1.0-draft.2` | [78a3268166eca63e5daafb1b21e184224c4d14b1/N16 catalog](https://github.com/Kushyameln01/kushyameln-works/blob/78a3268166eca63e5daafb1b21e184224c4d14b1/development/ai-connection/qkv-next/registration/candidate/docs/shared/ai-connection/reference/catalog.v1.json) |
| 新N2 preview、提案版 `1.0-draft.3` | [candidate catalog](../../../../development/ai-connection/qkv-followup/registration/candidate/docs/shared/ai-connection/reference/catalog.v1.json) |
| 新しい静的検証と再現手順 | [registration/RESULT.md](../../../../development/ai-connection/qkv-followup/registration/RESULT.md) |

原本6daeの18 Profile / 10数値規則 / 12管理規範を変更せず、固定78aのN16追加案21/14/13を土台として、別ディレクトリのpreviewへN2を追加する。新previewは25 Profile / 19数値規則 / 14管理規範。構造schemaは既存の `works-profile-reference/1.0-draft.1` のまま、提案文書版を `1.0-draft.3` とする。

旧 `ADOPT-MANAGER-285967`、N16 `CANDIDATE-DIFFUSION-QKV-N16-8CDFD3F`、その各record/rule、旧source/build宣言 `registrationSourceBuild` を保持する。N2は独立した `CANDIDATE-DIFFUSION-DERIVED-N2-ALL40-F32-V1` と `registrationN2SourceBuild` に置く。元のN16明示fixture/head0や旧数値規則のscopeを広げない。原版の7本文はbaseline参照としてbyte一致で保持する。新規範の管理runtime組込み、catalog正本・本文・Pageの版更新は未受入である。

## 共通catalogへの対応

| 新record ID | category | native ID |
| --- | --- | --- |
| `SHAPE-BERNINI-DERIVED-N2-ALL40` | shape | null。catalog専用shape宣言 |
| `EXEC-BERNINI-DERIVED-N2-ALL40-F32` | numeric-execution | `bernini-block0-derived-qkv-n2-allheads-f32-v1` |
| `NORM-BERNINI-QK5120-N2-F32` | normalization | null。複合stage内のQ/K RMSNormであり独立native ID未定義 |
| `EXEC-BERNINI-RECT2-PREFIX-F32` | numeric-execution | `bernini-rect2-block0-postmod-f32-v1`。N2が要求するproducer依存 |

新数値規則は `NR-BERNINI-RECT2-PREFIX-F32`、`NR-BERNINI-QKV-N2-F32`、`NR-BERNINI-QK5120-N2-F32`、`NR-BERNINI-ROPE64-N2-F32`、`NR-BERNINI-ATTENTION-N2-ALL40-F32`。これら4 record / 5 ruleを新管理規範 `N-DERIVED-N2-ALL40-DIAGNOSTIC` が参照する。既存Rect mean・schedule・noise・事前gateの規則は依存として参照し、内容を変更しない。

本案ではprefixの非affine LayerNorm、下流Q/Kのaffine RMSNorm、Rect raw meanの正規化を区別する。prefix LayerNormに独立native normalization IDは定義されていないため、prefix数値規則とnumeric-execution依存record内に演算・gateを宣言する。旧UMT5やN16 normを代用しない。

## native producerの厳密な入場条件

実装の根拠は固定sourceの [validateProducerReceipt / createDerivedQkvHeads](https://github.com/Kushyameln01/kushyameln-works/blob/e48021d8da29ef3b3b9e9d6161331c282798b6b3/docs/shared/diffusion-models/ort-bridge/attention-heads/stage.mjs)。登録JSONの `admissionConstraints.trustedProducer` が、以下を機械可読で保持する。

| 条件 | 許可される値 |
| --- | --- |
| trusted receipt | `bernini-hidden-prefix-trusted-receipt/0.1`、`passed:true`、artifact SHA256、非空のproducer source SHA256集合 |
| evidence | `bernini-block-hidden-evidence/0.1`、prefix native ID、precision `bernini-block0-prefix-hike-f32-ort-silu-v1` |
| HIGH | block0、scheduleIndex1、sigma `0.9617158770561218`、timestep `961.7158813476562` |
| LOW | block0、scheduleIndex3、sigma `0.8333333134651184`、timestep `833.3333129882812` |
| shape/layout | implicit batch1、core `[1,2,5120]`、operator LC `[2,5120]`、grid `[1,1,2]` |
| 座標・source | `[[0,0,0],[0,0,1]]`、source IDs `[0,0]` |
| context/noise | contextLatents `[]`、noiseScale1。prefixで固定された明示noise recipe |
| 限定演算の証拠 | `postModulationComputedByModelOperators:true` |
| falseを要求する値 | `originalWorkflowInputsVerified`、`productionHiddenVerified`、`originalProductionPrecisionVerified`、`fullBlockVerified`、`modelInference` |
| readiness | load / predict / sampleはいずれも `NOT_READY` |

sideごとの元model/header識別、artifact、hidden/positions/sourceIdsのbit hash、raw mean/noiseのhash、公開receiptの固定commit/path/hashも収録した。実factoryは元modelHashとsideを照合し、runはowned snapshotを作って座標/sourceを厳密照合し、3入力のhashを照合する。hashやbooleanを呼出側が付けただけではproducerの由来を認証しない。import側が、別途信頼された公開receiptと非公開artifact/sourceの対応を固定する責任を持つ。

Prefixの入口は `createBlockHiddenPrefix(...).run({rawMean,noise,noiseScale:1,scheduleIndex,...})`、N2の入口は `createDerivedQkvHeads({file,side,trustedProducer,...}).run({hidden,positions,sourceIds,evidence,artifactSHA256,...})`。成功時はprefixの完了と解放を待ってから下流を構築する。取消時はabort後にPromise終端をawaitし、資源を解放する。全体待機列は管理側が所有する。

## 数値規則・事前gate・参照

Prefixの規則は固定 [hidden-core/candidate-plan.json](https://github.com/Kushyameln01/kushyameln-works/blob/e48021d8da29ef3b3b9e9d6161331c282798b6b3/development/ai-connection/qkv-next/hidden-core/candidate-plan.json) とsource契約に基づく。対象keyはF16で、IEEE754 binary16からowned F32へ復号し、FP8 scaleを適用しない。実Rect raw mean `[1,16,1,2,4]` の正規化、固定noise混合、patch im2col、time embedding、time projectionの先頭10240行/chunk0,1、全5120非affine LayerNorm、modulationを含む。

time sinusoidはF32 frequency/phaseと固定F64 primitive→F32、SiLUはORT Sigmoid→Mul、LayerNormは順序固定のF32 two-pass、modulationはF32 scale+1→積→shift加算。RoPEのF64 frequency規則とは分ける。SiLU入力は有限かつ絶対値 `1e6` 以下、LayerNorm入力は有限かつ絶対値 `1e16` 以下。元Torch fused演算やproduction precisionとの同一性は未検証。

| Prefix stage | 事前gate |
| --- | --- |
| raw mean正規化 / noised latent / patches / parameter復号 | F32 byte完全一致 |
| timeSin | abs `2e-6`、rel `2e-6` |
| patchHidden / timeLinear0 / timeAct0 | abs `1e-4`、rel `1e-5` |
| timeEmbedding / timeAct1 / timeProjection / shift / scale / hidden | abs `1e-3`、rel `1e-4` |
| LayerNorm | abs `1e-4`、rel `1e-4` |

下流は固定 [expansion/candidate-plan.json](https://github.com/Kushyameln01/kushyameln-works/blob/e48021d8da29ef3b3b9e9d6161331c282798b6b3/development/ai-connection/qkv-next/expansion/candidate-plan.json) の別scope。実Q/K/V重みの保存はFP8 E4M3FN＋scalar F32 scale、bias/normはF16、計算はHike復号・norm・RoPE・recurrenceとORT Gemm・score/ExpのF32。全5120入力列を16出力rowずつ処理する。Q/Kを全5120軸でRMSNormした後、全40headを取り出し、全2query×全2keyのcontextをO投影前 `[2,5120]` へ返す。

| 下流stage | 事前gate |
| --- | --- |
| weight/bias/norm復号 | F32 byte完全一致 |
| QKV投影 | abs `1e-4`、rel `1e-5` |
| Q/K全5120 RMSNorm、epsilon `1e-6` | abs `1e-4`、rel `1e-4`。RMSNormへ渡すQ/K投影値の絶対値 `1e16` 以下 |
| RoPE行列 | abs `2e-6`、rel `2e-6` |
| RoPE適用 | abs `1e-4`、rel `1e-4` |
| 実hiddenからのlocal context | abs `1e-3`、rel `1e-4` |
| 独立prefixからのcomposed context | abs `1e-2`、rel `1e-3` |

各値は比較前に固定され、要素ごとに `abs(actual-reference) <= abs + rel*abs(reference)` で判定する。固定HIGH/LOWそれぞれのprefix14stage・parameter9件、下流11比較を再利用する。実hiddenを使うlocal独立referenceと、独立prefixから導くcomposed referenceは別receiptと別gateを保持する。本登録で数値演算を再実行したとは扱わない。

## source/build/kernelの固定

`mainBuildCommit` は完全SHA `e48021d8da29ef3b3b9e9d6161331c282798b6b3` に解決した。旧owner独自案にあった「enclosing commitで割当てる」placeholderは本案にない。build IDは `diffusion-models/0.1+148a33420c9b87accd25b92d94f8160bbc7e14298e6ef7cdd4b5b65d70701c10`。main89 sourceの完全path/hash、build-info自体のhash/長さ、kernelごとのsource/host/build receipt/wasmの完全commit/path/hash/長さを収録する。

| Hike WASM | bytes | SHA256 |
| --- | ---: | --- |
| FP8/F16復号・bias | 6899 | `ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd` |
| 全5120 Q/K RMSNorm | 5265 | `9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8` |
| natural N2 RoPE | 6494 | `46cd2ac1859e809d9bcb722b55822c606185e67b3639392fa00d21b698825997` |
| attention recurrence | 5940 | `b809f614c69be820346d738b46b743b50c624d902141610c28de07ae0cfd159c` |
| prefix time/LayerNorm/modulate | 7744 | `ec95f1ca2bb76c332d1ff1072d48347e8a79d48f15618fa59b191dabe9117f7c` |
| Rect mean | 8210 | `bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d` |
| schedule/noise | 8493 | `bcd35eb9e0bef45c2f21d99ca77a1edeae57c8ea7fa763086492dc1fa40dd220` |

固定handoff SHA256 `e8a8cc203b06678d85c902e5fcfce0f145f13e1e47bc8c3a6d889f8192bc80fb` を信頼基点として、source inventory、build89 closure、事前plan、既存結果、別reference receipts、原本catalogと保持N16 previewを照合する。合計141のowner assetが認証済集合と完全一致することを要求する。自己整合する偽plan/hash、未知sourceの追加、同じAPI版を名乗る異なるkernelも拒否する。既存binaryを再利用し、本工程で再buildしたとは主張しない。

登録JSONのassetは `repository + commit + path + byteLength + sha256` で取得・照合できる。GitHub URLは `https://github.com/Kushyameln01/kushyameln-works/blob/<commit>/<path>`。未取得の元core本文や非公開配列を本案から復元しない。元coreの意味は固定source契約と既存receiptのscopeで再利用する。

## 再現・未受入

上記6dae / e480 / 78aのGit objectを取得できるcheckoutで実行する。

```sh
PYTHONDONTWRITEBYTECODE=1 python3 tools/diffusion-models/build-qkv-n2-registration.py
PYTHONDONTWRITEBYTECODE=1 python3 tools/diffusion-models/test-qkv-n2-registration.py
```

モデル重み・raw reference配列・ネットワーク・compilerを使わず、登録要求とpreview14ファイル、receiptを生成する。原版validatorは原本18/10/12件に固定されており、25/19/14 previewに合格したと主張しない。正式登録時はcatalog保守担当が文書版・本文・検証器・新規範の受入を併せて調整する。

未受入は、元81frame/ordered context/noise/production precision、実HIGH→LOW handoff、O投影・残差・cross attention・FFN・全block/timestep、productionの同時保持Memory/staging/copy/time予算、生成sampleからVAE decodeまでの経路、管理採用である。N2限定の全query/head成功や既存allocation-only 32760/65520観測はこれらの受入条件に代用しない。
