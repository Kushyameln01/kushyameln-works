# 通常入口と共通workflow shape

2026-11-02 JST。基点59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f。ユーザーの今回の指示が実装方針であり、診断を通常入口へ改名する方式は採用しない。

通常は既存Artifact descriptorのoperation/model/target・shape/dtype/axes・意味・normalizationをownerへ渡す。ownerが実capabilities/manifest/registryに基づいて返す対応可否と理由を使う。独立参照、誤差gate、事前PASS、数値receipt、全中間E4保存は不要。既存の規範必須・診断入口は維持する。

## 一つの共通shape source

`docs/shared/ai-connection/workflow-shapes.mjs` の純粋関数 `deriveWorkflowShapes(input)` と保存Bernini workflow parserを唯一の通常shape導出元とする。元source/video実F・元resize、editor848/Python丸め16、モデルが宣言した圧縮/patch、実context順・token concat/source_idを導出する。実resize/encode/patch/concat/RoPE/数値演算/mappingはownerに残す。

target設定と実供給frame数、source/reference/wired/editor各branch、unknown/absentを区別する。未知contextより後のsource_idや範囲を仮定しない。小診断へのresize/pad/削減、81frameの実供給の推定、形状式から実行可否の推定はしない。モデル固有geometryは明示入力であり、共通descriptorの固定条件にしない。

`queryWorkflowRequirements({shapePlan,bindings,queryOwner})` はこのplanから通常要求を組み立てる。bindingの省略されたgeometryだけを補い、明示shape/dtype/axes・意味・normalizationの矛盾は入力不備として拒否し、owner判定を捏造しない。既知要求はownerへ渡し、その返答と理由を保持する。未知の媒体に依存する要求は問い合わせを保留し、既知の他の要求は進める。複数要求を一つのSUPPORTEDや本番READYへ集約しない。

## Normal owner facade と host

新しい管理側facade protocolはnative exportの新設を意味しない。`createNormalOperationAdapter({owner,artifactStore?,managerSessionId?})` は通常descriptorを受け、既存evaluateEdge、queue、snapshotを使う。

公開操作は `querySupport(descriptor)`、`execute({descriptor,input,signal,requestId?})`、`configure(configuration)`、`cancel(target)`、`recover()`、`dispose()`、`inspect()`。descriptorは `{operationId,artifact,modelRefs?,targetRefs?}`。source/build/kernel・reference/gate/PASS/E4を通常data requestへ要求しない。任意拡張・来歴は維持する。

owner facadeは `observe()`、`querySupport(descriptor)`、`invoke({descriptor,input,target,signal})` とcancel/afterTerminal/release/recover/configure/disposeを提供する。observeはactual instance/configuration revision/resource generation・actual native API/build/source registration・resource stateを返す。querySupportは `{status:'SUPPORTED'|'UNSUPPORTED'|'UNVERIFIED',capabilityRef,reasons,consumerPort,registry,observation}` を返す。capabilityRefは現在instance/configと要求に束縛する。SUPPORTEDは数値PASSではない。unsupportedはowner由来のcode/fieldPath/reasonを返しnativeへdispatchしない。

generic hostはownerのprofile一覧を持たない。common profileRefが省略された場合だけownerが選んだ実profile、または明示した外側contract bindingを内部で補う。既存の明示profile/metadataは書き換えず、ownerのconsumerPortと既存evaluateEdgeで照合する。入力producerは管理の実data holderであり、元producerの来歴を上書きしない。

ownerの観測/支持は内部で行い、構成変更時に支持token・snapshot・現在結果を失効する。元Promise終端まで待ち、旧target取消が新native jobに届かない。解放失敗時はqueueをquarantineしownerのrecoverで停止/解放を確認する。owner専用資源を他moduleから停止しない。

queueは一つの通常transaction全体を直列化する。snapshot owner.prepare内から同じqueueへ再enqueueせずnative ownerを直接呼ぶ。公開返却はqueueのoriginal terminal/owner release後。snapshot内部公開後にqueue cleanupが失敗した場合は、その結果を現在の成功として返さない。

## Snapshot通常scope

既存snapshot.mjsへadditiveな `{kind:'normal',scopeId}` branchを追加する。通常profile.requiredEvidenceScopesは空、各stepは通常edgeと内部capabilityRefを必須にする。通常validateは構造・支持・現在性を確認し、数値coverage/PASS/evidenceRefsを要求しない。commitは `EXECUTION_COMPLETED` とcopy/lease所有権を確認する。モデルsession適用や生成READYの証明にしない。共通schemaの将来scopeを限定しない。

## 最初の実owner

`createNormalDiffusionOwner` は固定5f native `createDiffusionModels` のprivate instanceと実capabilitiesを所有し、normalizeRawMean/restoreRawMeanを接続する。支持shapeはactual ownerのrawMeanProfilesから取得し、manager側へ3profileを転記しない。原本型/意味/model/normalizationはownerの既存interop/latent-space validatorに従う。mapping/演算はnative Hikeへ委任する。

native namespace/build/protocol/sessionの一致をbootstrap内で確認し、native loaderのWASM整合検査を使う。moduleとlazy kernel、meanの出自modelとloaded VAE weightsを混同しない。利用者が証跡を添付する方式にしない。設定変更はprivate native instanceを停止し新generationへ移す。旧nativeを外部へ公開しない。

## 検証と完了scope

既知Rect raw mean128の通常normalize→restoreを、参照配列/gate/PASS/E4なしで実native Hike実行する。既存P2の数値参照を診断runnerだけで使い出力を確認する。owner非対応shape・意味/model不一致・構成変更・取消・古い結果・元Promise・解放を検証する。通常runと診断比較のreceiptを分ける。

元81frameや任意shapeが式に合うだけで実行可能としない。新owner facadeがないmodule/operationは理由付き未対応とし、既存diagnostic/owner standaloneを変更しない。本番全工程/予算が揃うまではgenerationReady:false、load/predict/sample=NOT_READY。成果は管理branchへpushし、完全SHA/API差分/通常実行/残るshape制限を報告する。

## RGB／latentと複数入力への接続

mean経路の限定受入だけを管理改修全体の完了とはしない。新VAE配布498eb25の通常capabilitiesと新Diffusion配布5278069／実行30e283bの通常実行APIを取得し、採用済み5f meanと別候補として接続する。native pinやcodecを一括置換しない。

VAEは `createNormalVaeOwner` と通常descriptor helperを追加し、実native `capabilities({operation,input})` へ要求を渡す。configureによりmanifest／実asset Mapとowner generationを束縛し、通常encode/decodeの `{tensor,inputDescriptor,binding}` を保持する。診断opt-inを通常の条件にしない。共有RGB／latent要求は `queryWorkflowOwners` の明示bindingでこのownerへ渡す。論理的なlatent roleからraw mean／sampleを推測せず、意味とnormalizationは供給metadataとowner契約で明示する。

P4は通常hostへnamed-input形式を追加する。既存 `{operationId,artifact}`／input:tensor は維持し、新形式は `{operationId,artifacts:{residual,timeAct1,conditioning},parameters?,modelRefs?,targetRefs?}` と同名のnative tensor mapを使う。ownerは各consumerPortsを返し、管理は各artifactへ既存evaluateEdgeを適用する。snapshotは一つの取引で複数inputBindings／edgesを持つ。複数tensorを単一tensorへ見せかけたり、secondary配列をmetadataへ詰めたりしない。

`createNormalP4Owner` はnativeの通常support判定とsame-realmの通常runへ委任する。未対応shapeの照会のためにモデルやweightsを取得しない。nativeがprepare前のprofile IDを公開しない場合は、actual build＋operationに束縛した管理sidecar contract identityと明記し、native Profileや数値PASSと呼ばない。prepare後の実feed registry／header／epochは別の内部観測として記録する。LoRA canonical mappingはLoRA ownerへ残し、旧診断adapterを新しい通常取引へ黙って転用しない。

実assetは各owner保持環境にある。管理環境にない絶対pathを取得済みとせず、固定した管理source／通常runnerを保持環境で実行する既承認の方式を使う。通常実行・構造／資材preflight・独立診断を分け、未返却の共同実行を合格とは記録しない。
