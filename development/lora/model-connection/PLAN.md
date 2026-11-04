# LoRA model connection Implementation Plan

**Goal:** 単体SDKから管理・実Diffusion F32 portへの接続を、mappingとlease正本を保って実装・検証する。
**Architecture:** standalone SDK不変、新canonical full-source adapter、epoch固定source lease、実native model constructorへの資源glue。
**Tech Stack:** ES modules、Hike WASM、固定Diffusion/管理source、Node/Chromium、ローカルFile fixture。
**Spec:** [DESIGN.md](./DESIGN.md)と今回のユーザー指示。既存専用linked worktree/feat/lora-hikeを継続利用する。ユーザーは実装/pushまで指示済みのため、手順スキルの汎用再承認待ちを追加しない。

## Global constraints

- LoRA standalone arithmetic/loader/mapping正本・合成順・不変baseを変更しない。
- normalに独立expected/gate/詳細receiptを必須化しない。SDK local revision/管理revision/native epochは別。
- 通知前の実験原本送付・全体実験・merge/Pages公開を行わない。
- 対象全patchと除外を列挙し、fixture PARTIALから実モデルFULL適用・全体運用合格へ拡張しない。

## Task 1: binding registryと実source port接続

Files: 新diffusion-model-registry.mjs、diffusion-model-adapter.mjs、tools/lora/test-model-connection.mjs、fixture helper。
Consumes: 実source.describe/readRows/readVector/stats、owner createCompletedModelWeightSource、standalone package/public contract。
Produces: createDiffusionModelLoraAdapter → registry/baseProvider/consumer/captureSource/describeBindings/stats/dispose。
- [x] source/binding/full-shape不適合と正常port計算・範囲・所有権の失敗試験を先に追加しREDを確認する。
- [x] full mappingとbounded F32供給、normal候補/commit/rollback、epoch固定leaseを実装する。
- [x] light/detail/両side/合成・除去/0±1/取消/終端を実owner portでGREENにする。

## Task 2: native session資源と管理の通常取引

Files: 新diffusion-model-session.mjs、tools/ai-connection/test-lora-model-management.mjs、session tests。
Consumes: Task1 adapter、実管理createLoraManagementSide、実native createBerniniModelCandidateと同じconstructor/source契約。
Produces: createDiffusionLoraModelSession、管理requestからnormal適用・保存/fresh open・取消/復帰・解放。
- [x] stale epoch/cached session、native dispose失敗、準備失敗、管理publication/取消/保存の負例をREDにする。
- [x] native constructorを呼ぶglueと終端順序を実装しGREENにする。制御用constructorと実NNの証拠を分ける。
- [x] 実管理adapter→SDK/Hike→新consumer→実Diffusion F32 portの限定接続を実行する。

## Task 3: 対応台帳・証拠再利用・配布

Files: DIFFUSION-MODEL-CONNECTION.md、development/lora/model-connection/{RESULT,REPRODUCE,HANDOFF,FILES,bindings/verification}。
- [ ] 4 pair/side全2904 MAPPINGとowner target/bindingを結合し、全対象・選択領域・除外とdtype/slotを出力する。
- [ ] 変更境界のsuiteとbrowserを実行し、69 baseline/全241 legacy scopeと新規を別記録する。全値算術の再実行はしない。
- [ ] 一回の独立コードレビュー、必要修正、source固定・GitHub push・Draft PR2と固定body取得照合。
- [ ] 単体/管理部分接続/実port/全体実装残件/全体実験未実施/原本未送付を別に報告する。

## Review focus

- 部分sliceの外側と旧leaseを勝手に変更しない。base readのF32を二重scaleしない。
- validate後に更新されたepochや取消済候補をcommitしない。旧rollbackは後続を復元しない。
- creator/prepared解放後もcapture leaseが必要bytesを保持し、in-flight完了前にbase/kernelを解放しない。
- modelがhead等をcacheするため、強度変更後の旧sessionを新重み適用済みに扱わない。
- owner portの実消費・管理copied receipt・全体NN/生成READYを別scopeで評価する。
