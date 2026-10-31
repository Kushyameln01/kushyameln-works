# LoRA P0 / P3作業計画と到達点

目的は固定reference catalog `1.0-draft.1` への宣言・証拠対応と、管理からcanonical owner adapterへの変更境界の確認。入力は利用者が選ぶローカルsafetensorsであり、過去4原本の取得を必須条件にしない。

## 作業前に確認した資料

- 新計画 `1.0-draft.1`：Page `page_78c30bebe16481918944e621b8c2a02a` 全87ブロック、Git `0fb553fd081d3bcbbad4ead7accd165679f77d34` の `development/ai-connection/reference-catalog/EXECUTION-PLAN.md`。
- 指定の参照データ：`6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` のJSON・文書18ファイル。固定READMEの正本規定を確認し、digestを検証した。
- Profile台帳Pageは `FORBIDDEN / page_read_forbidden`。再試行せず、本文取得とは扱わない。管理照合規範と数値規則のPageは全30/45ブロックを取得した。
- 管理採用版 `28596717182e48aeb23c719c51b6e593edf4e496` と、LoRA `0c27874908638afc748ea2455a2779a16736730b`、Diffusion `438972f30242e0a3bc66edb8591f38eaa0fcd384` の実sourceを照合した。

## 実施と残る工程

- [x] P0：`DECLARATION-BINDINGS.json` と `EVIDENCE-INDEX.json` を管理向けに作成。12 normsから実APIまたは外側sidecarのpathへ対応付け、契約宣言・数値証拠・動的資源状態を区別する。
- [x] 原本の再hash・実モデル再推論をせず、有効な既存結果を固定scopeで再利用。5051-byte kernelと既存ownerのbyte境界も照合する。
- [x] 管理の実 `createAdoptedLoraAdapter` が `createDiffusionDiagnosticAdapter` を1回注入する経路を実SDK・Hike・ORTで試験。旧bridgeを重ねず、新規ローカルFile 1件・明示した合成baseで7数値caseを比較する。
- [x] 管理request/revision/resource generationからnative plan/local revision/epochへtraceを対応付ける。取消・復旧・HIGH成功LOW失敗・旧plan・重複request・所有権・cleanup故障隔離の7制御群を確認する。
- [x] 独立読戻し：全14配列と128記録出力、27 source、queue終端を別担当が照合。管理採用契約11/11も確認する。
- [x] 正本・結果・再現手順・未受入事項を作成する。
- [ ] 管理P1のReferenceSet / reference-loader / norm-bindingsの完全sourceと対象edgeを受領し、P0集約を共同確認する。
- [ ] 同一 `context.target` に実native候補を接続する診断snapshotのstage/validate/commit/publishを検証して、P3全体の受入を判定する。

GitHub配布先は `feat/lora-hike` / Draft PR #2。配布commitと固定URLはPR・最終報告を正とする。

## 受入境界

新計画は対象P0/P1をP3受入の前提とする。公開管理285にはP1実装がなく、sourceの所在を確認中。既存経路の事前確認が成功しても `P1:UNVERIFIED`、`fullP3Accepted:false` を維持する。汎用snapshot fixtureを実native snapshotの証拠に代用しない。

管理へ演算式・registry変換を複製しない。mean API、旧bridge重畳、既定strength、二組同時合成、FULL適用、全model session、生成可能snapshotを追加しない。全target受入は対応する実graph/consumer成立後のP6へ残す。合成File/baseの証拠は実原本/base適合へ拡大しない。
