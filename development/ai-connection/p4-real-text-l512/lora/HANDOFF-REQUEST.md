Diffusion担当から、新P4の実Text L512・実LoRA接続に必要な実装を依頼します。LoRAのP4 source取得ACK（PR14 #6560083267）は受領済みです。

今回GitHub pluginでPR2の最新headを `7f48a1407998078ca793238af068ae117e322662` に固定し、全tree（truncated=false）とf992以降の差分を確認しました。追加はRETURN-STATUS/ROUNDTRIP-MANIFESTの2文書だけです。現canonical `docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs` は20746B、SHA-256 `bcea7b495e819d1e1052543f36cbdad0ed8515e74bd8914cf66dc03b093c6e4f`、Git blob `b1a37034122764800703ef1f3e3a264ebd190861` で旧fc2789/Q16と同一でした。README/P4-CONTRACT-DIFF/RETURN-STATUS/ROUNDTRIP-MANIFEST/adapter/SDKの6公開fileを実bytesで取得し、pluginのsize/Git blobへ全一致させました。これは受領確認で、P4適用済みの主張ではありません。

Diffusion側は、実Text producerのL512 conditioningを使うP4 base検証を進めています（現時点で数値受入未宣言）。固定Diffusion sourceは `27776abb234fc12733c600b1dabd2fdab70e27ae`、P4 runtime/WEIGHT-FEEDのbytesは既受領7eeから変更ありません。
- [WEIGHT-FEED](https://github.com/Kushyameln01/kushyameln-works/blob/27776abb234fc12733c600b1dabd2fdab70e27ae/development/ai-connection/p4-cross-ffn/WEIGHT-FEED.md)
- [registry/provider/sink/candidate](https://github.com/Kushyameln01/kushyameln-works/blob/27776abb234fc12733c600b1dabd2fdab70e27ae/docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs)
- [実stage](https://github.com/Kushyameln01/kushyameln-works/blob/27776abb234fc12733c600b1dabd2fdab70e27ae/docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs)

次をLoRA ownerの新しい版として実装・固定し、完全SHAとpath/bytes/SHA-256、再現commandを返してください。

1. `bernini-p4-f32-feed-registry/0.1` / `bernini-block0-n2-cross-ffn-f32-candidate-v1` へのcanonical mapping。defaultのcross q/k/v/o・ffn0/2のweight+bias 12entryと、元fullShape・original-key binding・元要素offset/count・manifest疎範囲を対応させてください。初回の数値試験はlight/HIGHの明示した限定rangeで構いません。旧Q16 adapter/pinは保持し、未選択箇所はimmutable base pass-throughとします。
2. 実LoRA原本を固定loader `comfy-lora-b5a4321-linear-diff-v1` で読み、providerのimmutable F32から低rank/alpha/strength/明示biasを計算して、完成F32をsinkへ供給する実code。全入力列を保ち、1block最大81920要素、通常16行以下・FFN downは4行以下としてください。原FP8/F16 decodeと完成F32を分け、sink後に再scaleしません。低rank計算はLoRA ownerで所有し、Diffusionへ重複実装しません。
3. `sink.begin({...identity,patches}) → writeBlock({weightId,offset,count,fullShape,binding,dtype:'F32',sha256,data}) → finish` から、実prepareLoad/validate/commit/rollback/prepareBaseへ渡すbridgeと、新P4構造化receiptのSDK/管理対応。identityにはmodel/graph/registry/side/executionProfileId/scope、実package/input/source/planを結んでください。sink copy・candidate/active/run leaseの寿命、native epochと管理revisionの区別も保持します。
4. 実LoRAで変化したP4 blockOutput全10240値の独立referenceと事前固定gate（`p4-cross-ffn-composed-f32-v1`、abs0.01+rel0.001）。L512でもresidual10240/timeAct1 5120/output10240です。実conditioning data/mask/metadataとreference/hashを結び、強度変更・再適用・失敗/取消復帰・base復帰を新scopeで検証できる形にしてください。旧expected16やDiffusion direct-final-F32 fixtureは代用しません。
5. 原LoRA・独立reference・限定F32 packageの取得方法を、公開metadataと非公開payloadに分けて示してください。Diffusionの今回確認したworkspaceにはBernini HIGH/LOW以外のsafetensors原本がなく、LoRA原本とP4 LoRA-specific独立referenceは未取得です。owner保持環境にあるなら、その場で新mappingを実行し、限定成果物とreceiptを返す方法でも接続できます。全4LoRA原本やfull baseの再取得を追加条件にはしません。

新canonicalが届くまで依存するLoRA共同数値工程だけを保留し、実Text L512 base検証は継続します。公開source/ACK、実LoRA計算、数値受入を別記し、PARTIAL / completeAdapter=false / generationReady=false / load,predict,sample=NOT_READYを維持します。merge・Pages公開は行いません。
