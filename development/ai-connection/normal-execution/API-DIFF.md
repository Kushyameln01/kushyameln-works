# Normal入口のAPI差分

今回追加するのは管理側の通常operation protocolであり、native exportの変更ではない。既存diagnostic／norm-required APIと、各固定sourceの数値受入scopeは維持する。

| 追加物 | 公開入口・役割 |
|---|---|
| `adapters/normal-operation.mjs` | `createNormalOperationAdapter({owner,artifactStore?,managerSessionId?})`。通常descriptorと実dataを既存evaluateEdge／queue／snapshotへ接続する。 |
| `adapters/normal-diffusion-owner.mjs` | `createNormalDiffusionOwner` と `createNormalRequestDescriptor(operationId,tensor,{artifactId?,extensions?,provenance?,lineage?}?)`。最初の実ownerは固定5fのmean normalize／restoreだけを扱う。 |
| `adapters/normal-vae-owner.mjs` | `createNormalVaeOwner` と `createNormalVaeRequestDescriptor(operationId,tensor,{artifactId?,extensions?,provenance?,lineage?}?)`。固定498の実configured capabilitiesでencode／decodeを問い合わせる。 |
| `adapters/normal-p4-owner.mjs` | `createNormalP4Owner` と `createNormalP4RequestDescriptor`。固定30eのpostSelfAttentionを、residual／timeAct1／conditioningのnamed入力で接続する。 |
| `workflow-shapes.mjs` | `deriveWorkflowShapes(input)`、`parseBerniniWorkflowShapeRequest({workflow,media,geometry})`、`BERNINI_WORKFLOW_RULE_ID`。共通shapeの純粋なmetadata導出元。 |
| `adapters/workflow-normal-requests.mjs` | `queryWorkflowRequirements({shapePlan,bindings,queryOwner})`。共通requirementsと明示descriptorを照合してownerへ支持を問い合わせる。 |
| `adapters/workflow-normal-router.mjs` | `queryWorkflowOwners({shapePlan,bindings})`。既知のscalar RGB／latent要求を、明示したownerとoperationへ渡す。 |
| `snapshot.mjs` | additiveな `{kind:'normal',scopeId}`。構造・支持token・現在性・copy/lease所有権を確認し、数値PASSや全中間E4を要求しない。 |
| `run-normal-operation.mjs` | 通常実行 `runNormalOperation` と、完了済み結果だけを読む別操作 `diagnoseNormalOperation`。 |
| `run-normal-holding.mjs` | `runNormalHolding`。手元のVAE graph／P4原本Fileを既存normal hostへ渡す。source preflight、資産の有無、実native実行を別々に記録する。 |

通常hostの操作は `querySupport(descriptor)`、`execute({descriptor,input,signal,requestId?})`、`configure(configuration)`、`cancel(target)`、`recover()`、`dispose()`、`inspect()`。descriptorは `{operationId,artifact,modelRefs?,targetRefs?}` で、既存Artifactのshape/dtype/axes・意味・normalization・来歴を維持する。

named入力では `{operationId,artifacts:{名前:Artifact,...},parameters?,modelRefs?,targetRefs?}` と、同じkeyのinput bundleを使う。artifactとartifactsはどちらか一つだけ。hostは各入力を個別に所有・照合し、一つのqueue／snapshot transactionで実行する。queryの共通判定は名前ごとの `edgeDecisions` と `dispatchSupported`。全edgeがreadyでなければdispatchせず、二次入力も一つのmetadataへ平坦化しない。従来のscalar `edgeDecision` は維持する。

通常data requestにsource/build/kernel証跡、独立reference、誤差gate、事前PASS、数値receipt、E4を添付する必要はない。service bootstrapと実owner観測がsource/API/build／instance／configuration revision／resource generationを内部で束縛する。callerが明示したprofile等は検査し、欠落profileだけをownerの実contractから内部補完する。manager側へnativeのprofile allowlist・演算・mappingを転記しない。

`querySupport.status` はownerの `SUPPORTED | UNSUPPORTED | UNVERIFIED`。管理の `edgeDecision`／`dispatchSupported` は共通contractによるdispatch可否であり、owner対応と区別する。SUPPORTEDでは `edgeDecision.readiness.state==='ready'` の場合だけ `dispatchSupported:true`。それ以外のowner statusやowner応答の不整合は `edgeDecision:null`／`dispatchSupported:false`。SUPPORTEDでも明示profile矛盾ならdispatchできない。COMPATIBLEや通常EXECUTION_COMPLETEDは独立数値PASSを意味しない。独立比較未要求の通常runを、diagnosticのNOT_VERIFIEDを理由に止めない。別diagnosticを実行した場合だけ、その数値証拠を通常runと別に記録する。

共通shape結果は `schemaVersion:1`、`ruleId`、`geometry`、`requirements`、`issues`、`target`、`slotSelections`、`orderedContexts`、`concatenation` を返し、`ownerSupport:'NOT_QUERIED'` を維持する。`orderedContexts` は `complete`／`entries`／`positiveAndNegativeReferenceSameList:true` を持つ。各requirementは安定したrequirementId・role・state（`known | unknown | absent`）・shape・dtype・axes・meaning・normalization・provenance・issuesを持ち、meaning／normalizationは明示入力がなければnull。unknownのshape・後続context ID・合計はnullに保ち、81frame実供給や実媒体geometryを推測しない。明示geometryからshapeを導けても、対応可否は実ownerが判断する。実resize／encode／patch／concat／RoPEはownerの処理である。

通常queueは一つのtransaction全体を保持する。返却は元Promise終端・owner release後であり、通常snapshot公開だけを成功返却の根拠にしない。configure／取消で旧支持・結果を失効し、旧target取消を新jobへ送らない。release失敗時はquarantine／recoverを要する。

従来の固定5f native APIの `normalizeRawMean`／`restoreRawMean` は維持し、supported shapeを実capabilities.rawMeanProfilesから取得する。今回、下記のVAE／P4 facadeを追加する。nativeが別operationをadvertiseしていても、対応する具体的facadeなしで利用可能とはしない。未対応を小さい診断shapeへの変換やfixtureで代用しない。

通常runは参照/gate/PASS/E4なしで行い、既存P2保存参照との比較は別のdiagnosticで行う。VAE model SHAはmeanの出自であり、normalizerがVAE weightsをloadした証拠ではない。全model／全shape／全workflow／生成や全工程peakの受入へ広げず、`generationReady:false`、load/predict/sample `NOT_READY` を維持する。

## 具体的なVAE／P4 factory

```js
await createNormalVaeOwner({
  nativeModule, configuration, clientFactory, onNativeRequest,
  inputPayloadBudgetBytes
});
await createNormalP4Owner({
  nativeModule, file, side, sourceRef, inputPayloadBudgetBytes,
  bridgeBytes, mathBytes, attentionBytes, onNativeRequest, onProgress
});
createNormalP4RequestDescriptor({
  inputs, model, blockIndex, contextLatents,
  artifactIds, extensions, provenance, lineage
});
```

VAEは固定 `498eb25f027666e3cc661a5851288e4aabf39f0a` の `docs/shared/inference/api.mjs` を使う。configurationは任意の `{manifest,files,diagnostics?:false}` で、実行時にはparsed manifestとローカルFile／BlobのMapを構成する。queryはその実native capabilities／supportを使い、`nativeSupport`／`nativeCapabilities` とrequiredChanges／runtime状態を保持する。native capabilitiesにBUILD_ID exportはなく、管理のbuild表記は登録済みclient／worker source envelopeのidentityである。設定や資産の存在だけで重みロード済み・graph成功とはしない。

VAE descriptor helperはdataなしのtensor metadataからも作成でき、dataを読み出してcloneしない。明示meaning／normalization／profileId／modelSha256／context／latentContractを保持する。generated sampleのproducerModelSha256sはproducerのまま、latentContract.vaeModelSha256はdecoder consumer bindingのまま扱う。通常出力はnativeの `{tensor,inputDescriptor,binding}` を保持し、実input・graph資産・runtimeの束縛を確認してから返す。generic latentを自動でraw posterior meanへ改名しない。

P4は固定 `30e283bb115741af6b475e9bdc41700a4e564053` の実 `describeExecutionCapabilities`／`checkExecutionSupport` を使う。helperのinputsと返すartifactsは `residual`／`timeAct1`／`conditioning`。parametersは `model?`／`blockIndex?`／`contextLatents?` で、artifactIds／extensions／provenance／lineageの各mapはinput名で指定する。欠けたnative meaningやnormalizationは補わない。

P4のfileは選択した原本modelのローカルBlob。queryではmodel header／weightを読まず、支持されたinvoke時に初めてnative ownerをprepareし、実model／feed registry／checkSupportを確認する。configureは `{file?,side?,inputPayloadBudgetBytes?,bridgeBytes?,mathBytes?,attentionBytes?}` の置換設定で、旧実体の停止・解放とrevision／generation失効を伴う。selected LoRA targetの通常routeは現在 `NORMAL_P4_LORA_ROUTE_NOT_AVAILABLE`。

P4共通profileRefは `profileBindingAuthority:'management-sidecar-for-native-execution-descriptor'` の外側bindingであり、native exportのprofile IDではない。nativeProfileIdは実prepareでweightFeed registryを観測するまでnull。観測後に保持する値のauthorityは `last-prepared-native-weight-feed-registry` で、release後もnative ownerが常駐しているという意味にはしない。

typed maskやbinary attachmentの実bytesはinput bundleに保持する。descriptorの `native.binaryMetadata` はlocal locator・type・byteLengthだけを持ち、tensor dataやmask bytesをJSON metadataへ埋め込まない。actual inputは既存owned holderが保持・復元する。owner Textの `umt5-final-rmsnorm-f32-v1` は現P4 nativeから `UNSUPPORTED_NORMALIZATION` を返す。markerを削除・別名化して通す処理は追加しない。

inputPayloadBudgetBytesはservice bootstrap設定であり、通常data requestの添付項目ではない。VAEは一つのlogical input payloadが対象で、省略時はconfigured native input contractの最大extentを使う。P4は三つのlogical F32入力extentとmask分の明示allowanceで、未設定ならowner SUPPORTEDでも共通resource判定は `RESOURCE_NOT_READY` でdispatchを止める。いずれも複製・workspace・ORT・host・全工程peakを含む実測値ではない。

## Workflow routeと手元資産の入口

`queryWorkflowOwners` のbindingsは `{requirementId,owner,descriptor}`、または `{requirementId,owner,operationId,supply,createDescriptor}`。factoryは `{requirement,supply,operationId}` を受け、owner固有の明示metadataからdescriptorを作る。shapeは共有helperから取得し、既存bridgeだけが欠落geometryを補完・明示矛盾を拒否する。unknown／absentはfactoryもownerも呼ばず、独立した既知要求を進める。ownerResponse／status／reasonsをそのまま返し、named P4 bundleをscalar RGB／latentへ潰さない。

holding runnerのqueryは通常descriptorまたは明示workflow bindingsを受け、tensor payloadを読まずに対応可否を問い合わせる。executeはwktensor、明示little-endian F32、明示pointerのowner JSON配列をtransportとして扱う。元metadataと追加metadata bindingを分け、既存headerの値やdata／attentionMaskを置換するbindingは拒否する。

新holding transportだけが固定498のowner tensor codecを明示検証して使い、P4側にもcodecRootを指定してText metadataを保持する。既存E4／診断経路のadopted2bd codecを一括で変更しない。source bytes一致・ローカル資産の存在・実native実行の成立は別の状態として記録する。新VAE／P4の共同holding受入は、手元資産と実行receiptが揃うまで未成立。既存4667f46e5961a34c095a394bf6c75156ab9ab9cbの通常／診断と、f1dceb971bed7e9c9c16ab0a56d897507318a174の取消証拠は元のmean scopeで保持し、新VAE／P4 neural実行へ付け替えない。
