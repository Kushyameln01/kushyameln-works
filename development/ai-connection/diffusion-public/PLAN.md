# LoRAなしDiffusion公開モデルAPIの管理接続

2026-11-02 JST。管理基点 `76d813cd48930767caa3e4cf8e797996cc5b6798`、Diffusion配布 `ffeeeedb6b57d182a977c3ac02c042ce235fc87a`。今回取得したMODEL_RUNTIME.mdを実契約とし、factory `createDiffusionModels({sessionId})` と144 BUILD_SOURCES/Worker/ORT/Hikeの相対配置・build-infoを変更せず採用する。旧mean/P4/LoRAのpinと受入は変更しない。

1. 実sourceを別の固定mirrorへ採用し、通常ロード内部でbuild/sourceを照合。source証拠・独立参照・gateを通常入力へ要求しない。
2. 新全モデル管理adapterは既存queue/evaluateEdge/normal snapshotを再利用し、一つのAPI instanceで制御と推論を直列化する。request終端でmodelpairを解放せず、unload/dispose/cancelのowner契約に従う。
3. API envelope/session/job/inputRevision、管理target/revision/resource generation、modelSessionId/epochを別々に記録。取消はWorker失効→load必須。失敗prepareの破棄/reloadと、retained cleanup ownerのunload必要状態を区別する。
4. predict/sampleのnative `{tensor,execution}` とraw生成sample意味・latentContractを保持し、saveTensor/readTensorで実ファイルへ保存・読戻す。重みdecode・NN・scheduler・mean復元を管理へ追加しない。
5. 新capabilities.modelRuntime.operationsImplementedとloaded/cleanup/input contractで受付を判断する。旧modelInference:falseで一律拒否せず、implementedと数値/原寸/production受入も混同しない。
6. Node/実browser制御試験とactualmodel接続を分ける。保持環境向け固定runnerは既存N5/実L512入力を用い、1-thread/no-COIを通常構成として明示し、4-threadは明示COI/SABのみ・fallback禁止。既存数値証拠を元scope再利用し、全中間/原寸試験を繰り返さない。

本環境に31.15GBの実modelpairと元N5入力一式は未取得。実L512 packetは既存保存物とhash一致。保持環境で固定source実行可能な接続先をユーザーへ確認しつつ実装/制御/runnerを進める。actual1-thread結果が未返却なら成功と記録しない。LoRA・元媒体・原寸81frameを新しい着手条件にしない。生成READY/原寸受入は拡大しない。
