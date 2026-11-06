# 管理画面からの実モジュール接続 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans. Independent source areas run in parallel; root owns integration, reviews and delivery.

**Goal:** 管理画面から固定版の実Text/VAE・base Diffusionを構成し、入力・実行・取消・再実行・保存・復旧まで操作する。全体接続の実装成立と全体運用試験は別判定にする。

**Architecture:** 既存queue・pipeline参照解決・shape正本・snapshot・packageを再利用する。最新Text/VAEは旧版とは別native treeと外側adapterへ採用し、既存Diffusion公開adapterへ接続する。新画面と運用controllerは実factoryを既定値とし、ownerへ厳密なnative入力だけを渡す。

**Tech Stack:** ES modules、既存Chromium/Playwright、既存WASM/ORT/Hike、Node test。

**Spec:** このチャットの2026-11-04ユーザー原文「全担当の進行順序は…」を正本とする。下記はその作業用整理であり原文の置換ではない。

## Global Constraints

- 単体 → 管理部分接続 → 全体接続実装完了 → 試験LoRA受領・全体運用実験の順序を守る。
- 接続口の文書、stub、保持環境runnerだけを実運用経路の完成と呼ばない。
- 管理基点e1661e561dfb1a4f20544ff48bc375175b5981d1、最新Text/VAE badff7a436b56207a084c4c770e01490899a576c、Diffusion ffeeeedb6b57d182a977c3ac02c042ce235fc87a、LoRA SDK6d0c8df4cd4992f26745d2d26394f5e194d2567f。動くbranch名を固定版の代わりにしない。
- 管理は選択・実行順・queue・状態・取消・保存・復旧を担当し、数値演算、shape式、weight mapping、schedulerを複製しない。
- 通常入力へ数値参照・gate・事前PASS・詳細receiptを必須化しない。保存されたtensorはpayloadから戻し、runtime session/権限は復元しない。
- 実Diffusion NNは実モデルでのload/predict/sample/取消reload/保存読戻しを確認する。CONTROL19/11や旧4-thread証拠を新NN受入へ転用しない。
- 1-thread/no-COIと4-thread/COIを明示区別し、構成を黙って切り替えない。生成READY・原寸81frame・製品受入を拡大しない。
- LoRAの実験素材は全体接続実装が揃うまで受領・実験しない。既存の単体SDK制御成果は元scopeで保持。

## Review Focus

- Fileやmanifestを変更した後、遅延した旧result/progressを採用せず、モデルsessionを再利用しない。
- パイプラインに循環・未解決参照があれば、nativeへ最初のrequestを発行する前に拒否する。
- Text mask/Tokenizer、VAE decoder/normalized marker、raw generated sampleの意味、frame/時刻・任意metadataを落とした接続を通さない。
- 取消では対象を固定し、元Promise終端とowner資源解放を確認する。解放不明は復旧待ち。
- 保存packageからFile権限やmodel sessionを復元しない。actual payload、snapshot/trace/metadataを再照合する。

## Task 1: 最新Text/VAEの実採用

Files: `docs/shared/ai-connection/native/text-vae-badff7a/**`、`adapters/text-vae-standalone/{native,management}.mjs`、focused tests。

- [x] API/RESULT/STATUSと実export・runtime closureを取得しpath/bytes/SHA-256照合。
- [x] 実factory/configure/encode/decode/cancel/disposeを通常管理APIへ接続。古い固定graph adapterは保持。
- [x] capability、File保持、進捗、取消終端、失敗・再設定、保存codecを意味のある制御試験で確認。

## Task 2: mean変換のowner委任

Files: `adapters/diffusion-public/normalization.mjs` とfocused tests。

- [x] 既存normal owner/queue/snapshotを再利用して、固定Diffusionの実normalizeRawMean/restoreRawMeanを接続。
- [x] 小shapeの実Hike変換とowner非対応shapeの理由を確認。未対応shapeを式一致だけで通さない。
- [x] processing/frame等がnativeで保持できない場合は保存sidecarへ保持し、失う変換を成功扱いしない。

## Task 3: 実運用controllerとパイプライン

Files: `docs/shared/ai-connection/operational-management.mjs`、focused tests。

Interfaces: `createOperationalManagement({services?})`。`configureModule(id,config)`、`execute({moduleId,operation,input,outputRef?})`、`executeRoute({steps,externalRefs?,finalRefs?})`、`cancel(target)`、`recover(moduleId?)`、`dispose()`、`inspect()`、`subscribe(fn)`、`importTensor(ref,file)`、`saveTensor(ref)`、`saveWorkspace()`、`restoreWorkspace(file)`。

- [x] Text/VAE/Diffusion/meanの実factoryをlazyに生成。services注入は制御試験専用と識別。
- [x] `{$ref:'artifactRef',path:'tensor'}`形式で値を参照する。metadataやpayloadのshape変更は行わず、profile参照解決・循環拒否は既存compilePipelineを利用。
- [x] 既存queueで全体の操作順を管理し、child adapterの取消と元Promise終端へ接続。
- [x] 出力の実payload、native metadata、execution/snapshot/traceを保存。読戻しは権限を復元せず、新規取引として行う。

## Task 4: 管理画面

Files: `docs/ai-connection/modules/{index.html,main.mjs,styles.css}` と入口link、focused browser runner。

- [x] 実module選択・manifest/files、Diffusion HIGH/LOW File、prompt/IDs、tensor、noise、shape/config、route参照を入力可能にする。
- [x] query/execute/cancel/retry/recover/dispose、進捗・部分/最終結果・native保存・workspace読戻しをcontrollerへ接続。
- [x] 既存reference制御画面・LoRA単体画面を区別して保持。browser試験は実API/codec制御とNNを別記。

## Task 5: 部分受入・制約の記録と配布

- [ ] 変更境界の制御・browser・既存回帰を確認し、実sourceを固定。
- [ ] モデル・入力保持環境が利用可能なら固定sourceで実NNを検証。利用できなければ接続先未取得とし、確認できた範囲を明示する。
- [ ] API、実装差分、新規/再利用証拠、取得path/bytes/hash、単体/管理接続/全体未検証を分けてpush・Draft PR化、固定fileを再取得。

## 既に確認した阻害条件と判断

1. 固定Diffusion公開loadは`files/file/resource`のみ。完成LoRA重みのprovider/consumer/session bindingを受け付けない。重み層に`createCompletedModelWeightSource`はあるが、sampler/public Workerへ未配線。管理へmapping/数値を移植せず、このedgeをowner API不足として保留する。
2. 本環境に完全な実HIGH/LOW pairとN5 manifestは未確認。13.83GBのpartial HIGHを完全モデルの代用にしない。保持環境実行は許可済み方式だが、接続先は未受領。
3. したがって現時点では「全体接続実装完了・全体運用未検証」と宣言しない。上記2件に依存しない実装は継続する。新しい実験LoRAは要求・受領しない。

## Progress ledger

- 2026-11-04: fixed owner headsをGitHub/Gitから取得、独立TextVAE/UI/Diffusion/LoRA境界調査を開始。read-only目的監査は独立範囲PROCEED、全体完了宣言・試験LoRA受領HOLD。

- 2026-11-04: Task1–4の実装とfocused制御試験を完了。最新TextVAE16、mean2、controller39。独立adapterレビュー3件・controllerレビュー4件を修正し、原再現で再確認PASS。実UI開発版13件PASS、固定SHA版は配布前に実行する。
- 実モデル取得先の固定metadata/headerと容量を調査。workspace32GiB/空き約15GiBに対しpartial再利用後も追加22.66GB必要、tmpfsもLOW単体未満。download再開なし、保持環境接続先未受領。全体実装/運用/試験LoRA受領は未実施。
