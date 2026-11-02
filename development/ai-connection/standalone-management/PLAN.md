# 管理単体完成 M1–M3：実装と検証計画

採用計画は [モジュール単体完成 実行計画 Draft](https://chatgpt.com/space/page_1e950f67b0688191bd3f2a1d5b252224) の本文。版1.0 draft 1、更新2026-11-02T04:01:34.856047Zを今回取得した。取得本文UTF-8 SHA-256 `ef63a9fe0cc5681cf0a4bea8765ccc1a6a2a66d306598bcaf6082be8994fe102`。基点 `5ab651395e245e35f9472ca1b24f5e61550a9957`。本文は資料として扱い、今回のユーザー指示を優先する。

完成対象は管理の参照解決・共通shape導出・能力照会・実行・取消・解放・保存・復旧。CONTROL参照ownerを注入し、本物NNの完成・本人ACK・非公開資材移送は入口条件にしない。新しいmanagement/pipeline/workspace APIとstatic browserは追加案として実装する。既存native API、P2、LoRA bridge、診断入口とsource pinを維持する。

1. M1: 有限DAGを解決し、循環・未定義参照・多重writerを実行前に拒否する。未選択入力と構造エラーを区別する。共通workflow-shapes.mjsを唯一のshape計算として使い、operationの要求をownerへ照会する。独立branchと明示したLoRAなしbypassを進める。
2. M2: 既存normal adapter/evaluateEdge/queue/snapshotを再利用しnamed入力・進捗・revision・対象取消・古い結果拒否・解放失敗/recoverを一つのhostへまとめる。ownerの計算・mappingは追加しない。
3. M3: 静的browserでlocal File/JSON設定・bundle・部分/最終出力保存・読戻しを成立させる。保存tensorの実bytesとdescriptor/snapshot等を既存E4 verifierで照合する。元Fileを必要とする設定の権限は保存しない。
4. 検証: 正常/遅延/失敗/取消/解放失敗/能力変更、DAG負例、実File選択、改変拒否、実読戻しを確認する。81frame目標latent `[1,16,21,60,104]` 8,386,560Bを縮小せずcopy制御試験する。これはNN数値証拠ではない。
5. sourceをcommit/pushして固定し、固定sourceによる実browserの取得・hash確認と検証記録を別commitで配布する。Draft PR #7を更新し、merge/Pages公開は別扱いとする。

通常入口へ独立参照・gate・事前PASS・数値receipt・全中間保存を必須化しない。保存は利用者が明示したときだけ行う。`generationReady:false` と製品 `load/predict/sample=NOT_READY` を維持し、管理単体完成と接続/製品生成受入を混同しない。
