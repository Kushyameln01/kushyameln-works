# Text／VAE操作候補

ユーザー指定の運用候補を既存実APIで作る。基点367367dc758f7bfb4231803da62afe574f1bafca、既存worktree継続。数値処理・shape計算・codecは元実装を使い、原寸VAE／Textの合格は再利用。新しい規範やACKを完了条件にしない。

- [x] `docs/shared/inference/operational-owner.mjs`：実bridgeを包むサービス。修正Text manifest＋File Map＋現codecの一組を構成し、execute/cancel、record取得、管理保存、読戻し、再利用、disposeを提供。Fileは全量読出しせず保持。旧manifestの黙った選択を拒否し、独立native APIの旧互換は維持する。
- [x] `docs/inference-owner/{index.html,app.mjs,style.css}`：Text plain／IDs、VAE encode／decode、File資材選択、保存tensor／package選択、取消、結果と入力の保存、読戻し再利用を同画面から操作する。plainをdummy tensorへ置換しない。
- [x] `tools/inference/management-connection/serve-operational.py`：既存repo／管理固定source／修正manifest／明示した検証入力だけを同origin配信。loopbackで起動し、必要資材と入力pathを検証用Codexへ渡せる。巨大modelを複製・全hashしない。
- [x] 変更したサービスとUIの正常系、取消終端と再利用、保存読戻しを確認。Text長時間NNは既存証拠を再利用し、新画面の操作は保存実tensorを使うcontrolled executorで区別して検証。実VAEは関係する小さいdecode経路だけ確認。小成功を原寸UI受入へ拡張しない。
- [x] 固定sourceで起動可能な候補をpush。引継ぎは起動・資材・通常操作・既知制限・残した確認だけを短くまとめる。

サービスinterfaceは `createOperationalInferenceOwner({manager,sourceRef,nativeAPI?,onState?})`、`bindOperationalFiles({module,manifest,files})`。返却は `configureText({manifest,files})`、`configureVae({manifest,files})`、`capabilities(module,request?)`、`execute({module,operation,input?,inputArtifactId?,signal?})`、`cancel()`、`importTensor(bytes,{name?})`、`readPackage(bytes)`、`save({artifactIds})`、`tensorBytes(artifactId)`、`records()`、`getRecord(artifactId)`、`clearRecords()`、`dispose()`、`busy`。

管理実装はe166の4rootを取得して注入する。`candidate-config.json`にsourceRef／textManifestUrl／optional vaeManifestUrl／検証入力を返す。公開appはproject相対の `../shared/ai-connection/...` の実module、`../shared/inference/...` のownerをimportする。VAE raw sampleは原本が届けばそのままdecodeし、producer／decoder／restoredを保持して元raw＋RGBを保存する。現在、実sample2件はreceiptのみでbytes未取得。synthetic／meanで代用せず、その受入だけは未完に残す。

追加の公開要件に従い、main8ce26847e0cf886ddf6f08fc0b91025894520f0eへ選択移植済み。Pages run42228584861は成功。公開実操作確認と媒体helper差分の確認を進行中。原寸・全体生成の未受入scopeは維持する。

最終：管理PR19を含む公開main c34def4c5fe141fc77518d1bbaa31e121850b089とPages run42230908310の成功を確認。公開実VAEの保存・取消復帰・再利用、および最終版のText実資材設定／PNG取込／旧ZIP互換読戻し／媒体取消復帰が完了。固定codec source143とUI source1dを分けた。詳細はPUBLIC-RESULT.md。
