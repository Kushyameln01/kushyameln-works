# 最新版採用・MessagePort所有の実装計画

正本は2026-11-05のユーザー指示。管理基点9fe2c2e1dd35e17a3063a2c67d3bda676e953c8a、既存worktree／branch codex/management-full-routeで継続する。

## 固定版と保持条件

- Text/VAE: 20f640a6e071b6c060a212e89b28f0c8965923f7。実source、新Text manifest、normLowering、現codecを組として採用する。
- 全モデルDiffusion: b6e166478a8e072c9ffd3ce562bfdb0c89634920。実factory／Worker／WASM等の相対treeを維持する。
- 通常P4: 全モデルとは独立のsource/build/entry採用記録。同じb6配布でも別entryとして固定し、canonical Text markerを実native能力へ照合する。
- 旧badff/ffe/30e等の合格証拠は元scopeの回帰用。旧P4拒否を全モデル経路の拒否理由にしない。
- 管理は実行順・queue・状態・取消・所有・保存を担当。数値・mapping・shape式・LoRA重み適用はownerへ委任する。
- MessagePort/client/package leaseは専用runtime所有。通常clone、tensor snapshot、JSON、workspaceから分離し、解放失敗時は参照を保持して再試行する。
- 実NNは資材保持環境で固定管理sourceを実行して受け入れる。管理側にないことを資材自体の不存在と呼ばない。旧成功やdoubleを新NNへ拡張しない。
- 試験LoRA受領・全体運用実験は全体接続実装完了後。生成READYは自動昇格しない。

## 独立タスク

1. Text/VAE・codec: native/text-vae-20f640aを別採用、新manifest／normLowering／codecを固定。graphBindingsはtensor外に保持。marker/mask/frameProcessing/producer/decoderを実codec往復で確認する。
2. Diffusion source: native/diffusion-b6e16647を別採用し全build sourceのbytes/hashを照合。旧ffeは回帰用に保持する。
3. 通常P4: normal-p4-currentと専用bootstrap。既存normal owner/queue/snapshotへ実接続し、正規marker肯定例と旧30e回帰を分ける。
4. weight port: openWeightFeed専用queue入口、feedIdメタデータと非clone client accessor、side/model世代のfence、取消後の遅延port回収、unload/reload/disposeと解放再試行。操作名追加だけでは完了としない。
5. 運用controller/UI: current codecと新P4を実利用し、専用feedの開閉・再試行を操作可能にする。runtime clientはsnapshot/保存へ入れない。LoRA SDKの通常resource bindingはownerへ委任する。
6. 独立review、変更境界と既存回帰、固定sourceのbrowser/MessageChannel検証。新規／再利用、実装不足／受入待ちを分けてpush、Draft PR19と固定文書のbytesを再取得する。

## 保持環境への実NN受渡し

Diffusion保持資料で完全pairとN5 manifestの存在を確認済み。モデルは保持側/workspace/work/retained/bernini、入力は/tmp/d1-d4-real-l512-n5-inputs/inputs.json。このpathを管理環境へ取得した証拠とはしない。

Text/VAE保持資料にもprepared Text／Rect／stream bundleと管理e166 bridgeの実NN結果がある。旧sourceの結果を新controllerへ付け替えない。接続されたtoolには保持側terminal/endpointがないため、新固定管理source・runner・返却条件と、取得ACK／実行receiptを分けて受領する。保持側の既存原寸runと同じ16GiBで同時NNを起動しない。

## 進捗

- 本文・実export取得済み。旧「公開consumerなし」はffe時点の履歴。b6はopenWeightFeed／createDiffusionWeightClientを提供する。
- Text32files／Diffusion164filesをexact採用。通常P4正規marker肯定例NN0を確認。専用port管理・controller/UI統合を実装中。
