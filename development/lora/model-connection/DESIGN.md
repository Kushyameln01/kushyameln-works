# LoRA → 管理・Diffusion 接続設計

2026-11-04 JST。ユーザー指示を実行仕様とする。単体→管理部分接続→全体接続実装→実験用LoRA送付・全体実験の順を保持する。API・fixture・証拠の共有は今行い、実験原本の送付と全体実験は全体実装完了通知後とする。

## 正本と取得済み基点

- LoRA配布6d0c8df4cd4992f26745d2d26394f5e194d2567f、算術R1=4a3419c768e2b4b38b081314abe2cfaaeed6b14b、制御R2=986b66b3dd54ef26d98f99a1db92a2933f3e31aa。
- 管理e1661e561dfb1a4f20544ff48bc375175b5981d1。createLoraManagementSideは実新版SDKと注入registry/baseProvider/consumer/kernelを使う。旧bridgeを重ねない。
- Diffusion ffeeeedb6b57d182a977c3ac02c042ce235fc87a。model-weights.mjsのcreateCompletedModelWeightSourceは実sourceのF32読取り後にcompletedProvider.readBlockを呼び、完成F32またはbase pass-throughを受ける。model-candidate.mjsはsourceを明示注入できる。
- 同版の公開Worker/model-adapterと内部samplerはfilesからsourceを作り、completedProviderを受け取る公開経路はない。この差分を全体接続の残件として明示し、LoRA接続成功を公開sample成功へ読み替えない。

## 採用する経路

既存standalone SDKとowned packageを変更せず、新しいcanonical adapterから実full-model F32 portへ結ぶ。管理はside・選択・強度・取引操作だけを既存adapterで扱う。mapping・rank/alpha・復号・light→detail順・不変baseからの再構築は既存LoRA正本に委任する。baseのF16/FP8復号と実operator情報はDiffusion sourceから取得し、LoRAで再実装しない。

旧P4へ全対象を押し込む案は、block0限定registryと疎patch容量を変えてしまうため採らない。管理でF32計算/mappingする案は正本が二つになるため採らない。新版full-model adapterだけを追加し、旧Q16/P4を保つ。これらは実装上の判断で、ユーザーの個別仕様選択として記録しない。

## ファイルと公開interface

- diffusion-model-registry.mjs: source.describeの全original targetとLoRA canonical logical targetを結合する。元full shape/axis、storage/compute dtype、binding.kind/name、実operator、許容範囲を保持。runtime-inputとhike-parameterを区別し、initializerへ偽装しない。
- diffusion-model-adapter.mjs: createDiffusionModelLoraAdapter({source,createCompletedModelWeightSource})。registry/baseProvider/standalone consumerを返す。prepareLoadはpackageの独立leaseを取り、validateは全selected完成F32/finite/range/currentをstream検査、commitは直前current/abort/epochを確認して公開、rollback/releaseCandidateは旧候補で後続公開を上書きしない。
- captureSource()はそのepoch/packageを固定した実completed sourceとreleaseを返す。未patch targetと選択外領域は元baseを通す。旧leaseは切替後も同じ値を保持し、source/baseはcaller所有とする。
- diffusion-model-session.mjs: createDiffusionLoraModelSession({adapter,createModel,options?})。captureしたsourceを実DiffusionのcreateBerniniModelCandidateへ渡す組立て・寿命の補助。NNやschedulerは実装しない。通常weight取引中にNNを要求しない。強度更新後は古いsessionをstaleとして拒否し、新sessionを作る。disposeはnative終端→native解放→source lease解放の順で、失敗資源を保持する。

## 対応・coverage

LoRA canonicalの1053個の1D/2D weight/biasを、Diffusionの1095 original targetへ実体照合する。source側のConv・modulation等42 targetは今回のLoRA patchに含まれずbaseを保持する。全2904 logical source patchの適合は既存MAPPINGへ結合して台帳化する。ファイル名・shapeだけで学習base同一性を認定しない。

FULLは選択LoRAの全patch範囲。元モデルの全weightが変更された意味ではない。診断sliceは元full shapeと選択範囲、除外、原本識別を保ってPARTIAL。initializer、暗黙転置/flatten、未知binding/variant/dtypeは明示拒否する。画像F/H/W/mean APIは増やさない。

## 検証と受入段階

通常に独立expected/gateを入れない。新規は検証用ローカルsafetensors File、独立非zero base provider、実Diffusion completed-source実装、既存管理adapterを使う変更境界試験。F32値・未patch保持、強度0/±1・再適用・片組除去・base復帰、取消/旧候補/失敗/lease/保存・fresh openを確認する。必要な数値比較は開発試験の独立式で行う。fixtureは原本・真正モデル・全NNではないと明記する。

既存全2904算術とR2 lifecycleを元source/scopeで再利用し、loader/kernel/SDK/owned packageの不変bytesを確認する。今回全原本の取得や全件再推論・再hashを必須にしない。

成果は実装・API・対応表・固定owner source receipt・再現可能なfixture・結果をGitHubへpushする。単体、管理部分接続、Diffusion実port、公開sample採用、全体運用実験を別判定にする。実験LoRAは送らず、merge/Pages公開もしない。
