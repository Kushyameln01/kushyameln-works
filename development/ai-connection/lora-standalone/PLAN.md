# 新版LoRA通常接続の実装計画

2026-11-02 JST。管理基点 `92942230fbefe6ff727ba0b6f78f59591c46756e`、LoRA配布 `6d0c8df4cd4992f26745d2d26394f5e194d2567f`。指定STANDALONE.mdとRESULT.mdの今回の本文をGitHubから取得し、実SDK/Hike closureをGit objectへ照合する。旧v2 bridgeと通常P4の拒否・採用pinは維持する。

1. 固定owner sourceをbyte同一で別配置へ採用。native bootstrapでsource・WASMを検査し、通常利用者へ証跡提出を要求しない。LoRA logical registry、mapping、decode、計算順、consumerの全宣言範囲F32検査はownerへ委任する。
2. SINGLE-SIDE adapterを既存queue/evaluateEdge/normal snapshotへ接続する。File/plan/prepared/leaseはnativeのruntime authorityとして内部保持し、管理へはopaque idと無改変native receiptを返す。tensorや画像meanへ偽装しない。外側snapshotは操作receiptの所有だけを表す。
3. HIGH/LOWは別SDK。選択Fileだけ登録し、片組/二組/なし・強度変更・解除・再適用・base復帰を通常操作にする。一括片側失敗はBATCH_FAILEDとし、古いrollbackを再利用せず、recover→新取引restoreBase両sideの結果を別receiptで確認する。
4. SDKのstreaming saveをdirectory/OPFSへ流し、実payload・manifestを保存する。管理JSONは小さいsidecarに限定する。新SDK/openPackage/stageで再適用し、runtime handleは復活させない。creatorのrelease/disposeとconsumerのactive/read leaseを区別し、最後のleaseまでbase/kernelを保持する。
5. 実SDK/Hike＋owner正本registryと準拠する開発provider/consumerで接続を試験する。実Fileは正本canonical full shape `[5120,5120]` のrank1開発safetensors、明示した1行のPARTIAL接続とする。実4原本ではなく、ownerの全2904patch数値証拠は同一実装/演算規則を照合して元scopeで再利用する。
6. browserは実File選択、通常合成・解除、取消・復旧、batch失敗、streaming保存・fresh読戻し、lease寿命を新規検証する。既存689件/Chromium14件は回帰として別記し、新SDK接続の件数へ数え直さない。source固定後にrunnerで実取得bytes/hashを照合しpushする。

新規API/filesは追加実装として記載する。実Diffusion graph/operator/model provider/consumerが未成立でも、準拠参照consumerでの管理接続を先行して完了する。`graphBinding:UNBOUND`、trainingBaseVerified:false、generationReady:falseを維持し、管理接続成功を本番生成へ読み替えない。merge・Pages公開は別工程。
