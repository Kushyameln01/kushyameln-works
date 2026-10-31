# QKV N16 Profile catalog登録案

日付: 2026-11-01 JST。状態は `PROPOSED_NOT_PUBLISHED`、`runtimeIntegrated:false`。これは既存の限定診断を共通catalogへ登録するためのデータ案であり、管理側の採用記録ではない。`load/predict/sample=NOT_READY` と P5 `BLOCKED` を維持する。

## 正本と版

| 種別 | 固定参照 |
| --- | --- |
| 共通catalogの原本 | [6dae9a6fac3e9ad29ea941f22211edbe4aa894ad/catalog.v1.json](https://github.com/Kushyameln01/kushyameln-works/blob/6dae9a6fac3e9ad29ea941f22211edbe4aa894ad/docs/shared/ai-connection/reference/catalog.v1.json) |
| 既存QKV実装・数値証拠 | [8cdfd3f5f7db0cd66762e78f09c209fb5b27366b/P4結果](https://github.com/Kushyameln01/kushyameln-works/blob/8cdfd3f5f7db0cd66762e78f09c209fb5b27366b/development/ai-connection/profile-adoption/p4/RUNTIME-RESULT.md) |
| 引渡しcommit | [621796a2cb5266a4c8ea7abc2f676322836360c5](https://github.com/Kushyameln01/kushyameln-works/commit/621796a2cb5266a4c8ea7abc2f676322836360c5) |
| 機械可読の登録要求 | [registration-qkv-n16.json](registration-qkv-n16.json) |
| 適用後preview | [candidate/catalog.v1.json](../../../../development/ai-connection/qkv-next/registration/candidate/docs/shared/ai-connection/reference/catalog.v1.json) |
| 生成・整合性確認結果 | [registration/RESULT.md](../../../../development/ai-connection/qkv-next/registration/RESULT.md) |

固定catalog原本の文書版 `1.0-draft.1`、18 Profile / 10数値規則 / 12管理規範は変更しない。登録案の文書版は `1.0-draft.2` とし、既存の構造schema `works-profile-reference/1.0-draft.1` を保ったまま、21 Profile / 14数値規則 / 13管理規範のpreviewを別ディレクトリへ生成する。原本の7本文は原版の参照資料としてbyte一致で保持し、新しい規則の本文は本書と登録要求に置く。Pageの書換え、公開、管理runtimeへの組込みは行っていない。

旧 `ADOPT-MANAGER-285967`（manager 285967 / LoRA 0c278 / Diffusion 438 / codec 2c171）の配列・各record・各規則はそのまま残す。追加候補は `managementCandidateSets` の `CANDIDATE-DIFFUSION-QKV-N16-8CDFD3F` であり、旧候補を上書きしない。`managerAccepted:false`、`registrationIsManagementAdoption:false` を明示する。

## Profile、数値規則、native識別の対応

| 追加catalog record | 意味 | native側との対応 |
| --- | --- | --- |
| `SHAPE-BERNINI-QKV-N16` | hidden/投影 `[16,5120]`、head0 `[16,128]`、16座標の厳密shape | catalog専用ID。`nativeProfileId:null` |
| `EXEC-BERNINI-QKV-N16-F32` | 実重みQKV→全5120 Q/K norm→RoPE→限定attention | `bernini-block0-qkv5120-norm-rope-selected16-head0-f32-v1` |
| `NORM-BERNINI-QK5120-N16-F32` | Q/K全5120軸のF32正規化 | 複合stage内部。独立native Profile/normalization rule IDは未定義なのでnull |

native descriptorは `bernini-qkv-diagnostic/0.1`。入口は `createActualQkvDiagnostic({file,side,bridgeBytes,tensorBytes,ropeBytes})` の `run({hidden,positions,sourceIds,signal,onProgress,headIndex:0})`。返すnative実行IDをcatalog専用IDへ置き換えない。

| 追加数値規則 | 演算と固定precision | 事前gate |
| --- | --- | --- |
| `NR-BERNINI-QKV-N16-F32` | 実E4M3FN重みをscalar F32 scaleでHike復号。全5120列のORT WASM F32 Gemm、Hike F32 bias加算。biasは実F16から復号 | 復号はF32 byte一致。投影 `abs 1e-4 + rel 1e-5` |
| `NR-BERNINI-QK5120-F32` | 全5120列を昇順にF32二乗和・平均。epsilon `1e-6`。`env.sqrt` primitive、F32逆数、xと実F16 affineを順に乗算 | `abs 1e-4 + rel 1e-4` |
| `NR-BERNINI-ROPE64-F32` | 軸44/42/42、別のsource_id回転64pair。F64 power/cos/sin primitive後F32化し、順序を固定した2x2 F32行列積で合成 | 行列 `abs 2e-6 + rel 2e-6`、適用 `abs 1e-4 + rel 1e-4` |
| `NR-BERNINI-QKV-ATTENTION-N16-F32` | 既存ORT score/max/ExpとHike online numerator/denominator。明示16key全件、head0。mask/dropout/paddingなし | 接続出力 `abs 1e-3 + rel 1e-4` |

gateの式は `abs(actual-ref) <= absolute + relative*abs(ref)`。値は固定commitの事前計画・入場条件から取り込み、結果に合わせて緩和しない。独立referenceの方法、元coreの参照、HIGH/LOW各結果への参照は登録要求に含む。計算規則の所有者はDiffusionであり、管理側が数値を再計算するものではない。既存 `NR-SCOPED-GATES` と結び、新しい管理規範は `N-QKV-N16-DIAGNOSTIC` とする。

## 入場条件と受入scope

- 入力はcompactな通常のowned F32配列。hiddenと各投影は `[16,5120]`、positionは `[16,3]`、sourceIdはInt32 `[16]`。Q/K normのreduction軸は5120。128軸への置換、padding、shape偽装は禁止する。
- Q/K投影値は有限かつ最大絶対値 `1e16` 以下。`5120*(1e16)^2 = 5.12e35` がF32最大値を超えないことを入場条件の根拠とする。UMT5の4096軸Profileは変更しない。
- 位置gridは `[21,30,52]`。sourceIdのhost範囲は `0..16777216` だが、数値証拠は事前指定されたID 0/1/2と16座標の組だけ。全座標・全IDの精度受入へ広げない。
- HIGH/LOWそれぞれの実block0重みを使う。ただしhiddenは決定的な明示16token fixture。実block/timestepのpost-modulation hidden由来とは扱わない。実推論・生成の成立、元FP8/GPU backendとのprecision一致を意味しない。
- 受入scopeは `ACTUAL_WEIGHTS_EXPLICIT_HIDDEN_N16_FULL_WIDTH_HEAD0`。全40head、元32760token、context込み65520以上、O投影以降、全層、samplingを含めない。既存の事前生成K32760 attention fixtureの結果も別scopeとして保持する。

後続の実prefix由来N2/all-head Profile `bernini-block0-derived-qkv-n2-allheads-f32-v1` は別の登録要求・別gate/scopeで扱う。本登録のsource/buildやN16証拠を置き換えない。

## source/build/kernelの束縛

runtimeの固定commitは `8cdfd3f5f7db0cd66762e78f09c209fb5b27366b`、build IDは `diffusion-models/0.1+7a14a46b5119c1e8f7f8ef0a16a5ac0881ea4f177d063f957a489f193e4f090a`。native descriptor自体にbuildId fieldはないため、外部宣言 `catalog.registrationSourceBuild` がsource、build-info、読込byteを束縛する。API版文字列だけで同一実装と判定しない。

| 読込kernel | bytes | SHA256 |
| --- | ---: | --- |
| FP8/F16復号・bias `ort-bridge/kernel/bridge.wasm` | 6899 | `ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd` |
| 全5120 RMSNorm `inference/kernel/tensor.wasm` | 5265 | `9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8` |
| RoPE `ort-bridge/qkv/kernel.wasm` | 6494 | `46cd2ac1859e809d9bcb722b55822c606185e67b3639392fa00d21b698825997` |
| attention recurrence `ort-bridge/stream-attention/kernel.wasm` | 5940 | `b809f614c69be820346d738b46b743b50c624d902141610c28de07ae0cfd159c` |

各kernelのsource、host、build receiptにも完全path・長さ・SHA256を登録要求へ収録した。Norm kernelの過去compiler SHA256は `f41a501783e98f2d1d72dca95099f87ef3b4dff30477d0db486e7b2e44106e75`。他3kernelの `fb4588cba306b8dded91ad02735254681eaca08fa997f55919185cd607e89b26` と同一と扱わない。既存byteを再利用し、本工程で再buildしたという主張はしない。投影graph SHA256は `ec834903f4a7fc0ff315c134b0efc858ce7cff3464d908f37f0df8c968382a39`。

固定build-infoにある72 sourceのclosure digest、事前計画/入場条件/core資料/LOW-HIGH receiptsの固定hash、各receiptが記録するsourceを照合する。合計92個の異なるsource assetを検査し、認証された固定source集合に含まれない追加assetも拒否する。`sourceBuild` 全体も固定期待値と比較するため、handoff/API版/native descriptorだけの付替えも拒否する。

## 登録方法・再現

新規のcheckoutでは、上記BASE/runtime/handoff各完全commitを取得したうえで次を実行する。必要なのはGit内の公開コード・JSON・WASMであり、登録試験はモデル重みファイルを開かない。

```sh
PYTHONDONTWRITEBYTECODE=1 python3 tools/diffusion-models/build-qkv-registration.py
PYTHONDONTWRITEBYTECODE=1 python3 tools/diffusion-models/test-qkv-registration.py
```

generatorは原本7 JSONと原本文書7点を固定commitから読み、登録要求を検証し、`development/ai-connection/qkv-next/registration/candidate/` にpreview14ファイルを書き出す。上流catalogを直接変更しない。登録側がレビューする対象は3 record、4 rule、1 norm、独立candidate setとsource/build束縛である。

原版 `validate_catalog.py` は18/10/12件を固定assertするため、原版への実行はPASS、拡張後21/14/13 previewへの合格は主張しない。拡張previewには本generatorの構造・参照・hash・旧内容保持検査を実行する。将来正式登録する場合はcatalog保守担当が文書版と検証器の件数・受入範囲を併せて更新する必要がある。

管理側による新規範の読込み・判断・採用、共通catalog正本への取込み、原本文書/Pageの版更新は未受入である。登録データの整合性PASSを、数値再試験・管理接続PASS・全pipelineの容量受入へ読み替えない。
