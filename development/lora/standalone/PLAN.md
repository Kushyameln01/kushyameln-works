# LoRA L1–L4 standalone implementation plan

**Goal:** 全2,904 logical patchを通常SDKで供給・二組合成・解除・base復帰し、単独hostで全selected値と取消・保存を検証する。

**Architecture:** 既存classifier/loaderを再利用したgraph-free logical registryを正本mappingとする。所有する低rank/diff入力から、bounded Hike tileでF32を生成する新owned packageを追加する。通常SDKのcandidate/current/epoch/lease契約と、開発用の独立NumPy比較を分離する。

**Tech Stack:** JavaScript ES modules、Hike strict-F32 WASM、Python/NumPy独立参照、File/Blob・streaming writer、Node/Chromium。

**Spec:** [Kushyameln Works モジュール単体完成 実行計画 Draft](https://chatgpt.com/space/page_1e950f67b0688191bd3f2a1d5b252224)、版1.0 draft1、2026-11-02。今回のユーザー指示が既存の「二組合成を追加しない」初期制約を更新する。baseline86f87f42c8585d823f06810370bc0bd451f3fce3。

## Global constraints

- light各side1052/detail各side400、計2904。Q4/Q16の成功を全体完了へ拡張しない。
- source SHAは実体識別。既知sample hash・独立expected/gate/過去PASSを通常入力の許可条件にしない。
- full shapeと元座標、variant/rank/alpha/strength、追加diff/bias、全入力列を維持する。画像F/H/W/mean APIを追加しない。
- canonical合成順light→detail。強度変更・除去・再適用は不変baseから再構築する。
- 既存v1/v2/P4・5051B kernelと16MiB小package上限を変更せず、新版API/streaming kernelを明記する。
- 全4原本のdense出力は226,702,705,152B。全量RAM/一時diskへ置かず、factor所有とtile供給で全座標を実計算・検査する。
- 実Diffusion graph binding・全model組込・生成READY・merge/Pages公開・相手ACKを単体完成条件にしない。
- 参照baseは独立dyadic式F32 `(fullCoordinate%17-8)/128`。実base比較と区別する。

## Tasks and ownership

1. [x] L1 canonical mapping: classifier export、standalone registry/planner、旧Diffusion tableの互換reexport、全2904のmapping evidence。欠落/重複/未知variant/shape偽装を拒否する。
2. [x] L2 owned source/package: verified immutable sources、bounded factor/product cache、全列tile/末尾/FFN、stream保存・fresh reopen、leaseとrelease。descriptorだけを保存成果としない。
3. [x] L2 streaming Hike: 既存ascending-rank F32 multiply/addを保つstrict LLVM backend/newkernel、旧kernel bit比較・NumPy検証・再現buildと資源計測。
4. [x] L3 standalone SDK: 固定sideごとのregister/compose/prepare/stage/apply/restoreBase/cancel/recover/dispose。通常に独立参照を要求しない。local revisionとconsumer epoch、current/abort/rollback権限を分ける。
5. [ ] L4 reference host/独立参照: Diffusion/管理依存なしのbaseProvider/target/consumer、全selected値、両side/二組/0±1/再適用/除去/復帰・取消・保存・fresh読戻し。全値はchunk比較し参照host成功を実NN受入と呼ばない。
6. [ ] 変更境界の独立レビュー、適切な回帰、実行source固定、API/結果/再現/資源/未完を別記しGitHub/Draft PR2へpushする。

## Review focus

- saved manifestをlive handleへ復活させない。源payload/hash検査とbase再結合を行いfresh capabilityを返す。
- creator/leaseA解放後もleaseBは有効、解放したcapability自身のreadは拒否する。
- 取消後の遅延結果・旧rollbackが新activeを上書きしない。cleanup失敗はrecoverまで再利用しない。
- logical full coverage、実計算した全座標、実graph binding、training-base同一性を別の判定にする。
- kernel/backend変更は精度規則を変えず、FMA/reassociation/FP64への置換を認めない。新実行を旧証拠へ付け替えない。

## Progress before full acceptance

L1–L3の実装とcomponent制御試験が成立。HIGH/LOW予備試験は各2完全層・872,939,520値、いずれも失敗0でPARTIAL。最適化前の予備試験は新規全件受入へ付け替えない。次の固定sourceから両sideの全1052/400 target・全selected値の実行を行う。
