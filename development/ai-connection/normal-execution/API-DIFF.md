# Normal入口のAPI差分

今回追加するのは管理側の通常operation protocolであり、native exportの変更ではない。既存diagnostic／norm-required APIと、各固定sourceの数値受入scopeは維持する。

| 追加物 | 公開入口・役割 |
|---|---|
| `adapters/normal-operation.mjs` | `createNormalOperationAdapter({owner,artifactStore?,managerSessionId?})`。通常descriptorと実dataを既存evaluateEdge／queue／snapshotへ接続する。 |
| `adapters/normal-diffusion-owner.mjs` | `createNormalDiffusionOwner` と `createNormalRequestDescriptor(operationId,tensor,{artifactId?,extensions?,provenance?,lineage?}?)`。最初の実ownerは固定5fのmean normalize／restoreだけを扱う。 |
| `workflow-shapes.mjs` | `deriveWorkflowShapes(input)`、`parseBerniniWorkflowShapeRequest({workflow,media,geometry})`、`BERNINI_WORKFLOW_RULE_ID`。共通shapeの純粋なmetadata導出元。 |
| `adapters/workflow-normal-requests.mjs` | `queryWorkflowRequirements({shapePlan,bindings,queryOwner})`。共通requirementsと明示descriptorを照合してownerへ支持を問い合わせる。 |
| `snapshot.mjs` | additiveな `{kind:'normal',scopeId}`。構造・支持token・現在性・copy/lease所有権を確認し、数値PASSや全中間E4を要求しない。 |
| `run-normal-operation.mjs` | 通常実行 `runNormalOperation` と、完了済み結果だけを読む別操作 `diagnoseNormalOperation`。 |

通常hostの操作は `querySupport(descriptor)`、`execute({descriptor,input,signal,requestId?})`、`configure(configuration)`、`cancel(target)`、`recover()`、`dispose()`、`inspect()`。descriptorは `{operationId,artifact,modelRefs?,targetRefs?}` で、既存Artifactのshape/dtype/axes・意味・normalization・来歴を維持する。

通常data requestにsource/build/kernel証跡、独立reference、誤差gate、事前PASS、数値receipt、E4を添付する必要はない。service bootstrapと実owner観測がsource/API/build／instance／configuration revision／resource generationを内部で束縛する。callerが明示したprofile等は検査し、欠落profileだけをownerの実contractから内部補完する。manager側へnativeのprofile allowlist・演算・mappingを転記しない。

`querySupport.status` はownerの `SUPPORTED | UNSUPPORTED | UNVERIFIED`。管理の `edgeDecision`／`dispatchSupported` は共通contractによるdispatch可否であり、owner対応と区別する。SUPPORTEDでは `edgeDecision.readiness.state==='ready'` の場合だけ `dispatchSupported:true`。それ以外のowner statusやowner応答の不整合は `edgeDecision:null`／`dispatchSupported:false`。SUPPORTEDでも明示profile矛盾ならdispatchできない。COMPATIBLEや通常EXECUTION_COMPLETEDは独立数値PASSを意味しない。独立比較未要求の通常runを、diagnosticのNOT_VERIFIEDを理由に止めない。別diagnosticを実行した場合だけ、その数値証拠を通常runと別に記録する。

共通shape結果は `schemaVersion:1`、`ruleId`、`geometry`、`requirements`、`issues`、`target`、`slotSelections`、`orderedContexts`、`concatenation` を返し、`ownerSupport:'NOT_QUERIED'` を維持する。`orderedContexts` は `complete`／`entries`／`positiveAndNegativeReferenceSameList:true` を持つ。各requirementは安定したrequirementId・role・state（`known | unknown | absent`）・shape・dtype・axes・meaning・normalization・provenance・issuesを持ち、meaning／normalizationは明示入力がなければnull。unknownのshape・後続context ID・合計はnullに保ち、81frame実供給や実媒体geometryを推測しない。明示geometryからshapeを導けても、対応可否は実ownerが判断する。実resize／encode／patch／concat／RoPEはownerの処理である。

通常queueは一つのtransaction全体を保持する。返却は元Promise終端・owner release後であり、通常snapshot公開だけを成功返却の根拠にしない。configure／取消で旧支持・結果を失効し、旧target取消を新jobへ送らない。release失敗時はquarantine／recoverを要する。

現在の実facadeは固定5f native APIの `normalizeRawMean`／`restoreRawMean`。supported shapeは実capabilities.rawMeanProfilesから取得する。nativeがEulerをadvertiseしていても、このmean facadeで利用可能とはしない。対応facadeがないmodule／operationは理由付き未対応とし、小さい診断shapeへの変換やfixtureで代用しない。

通常runは参照/gate/PASS/E4なしで行い、既存P2保存参照との比較は別のdiagnosticで行う。VAE model SHAはmeanの出自であり、normalizerがVAE weightsをloadした証拠ではない。全model／全shape／全workflow／生成や全工程peakの受入へ広げず、`generationReady:false`、load/predict/sample `NOT_READY` を維持する。
