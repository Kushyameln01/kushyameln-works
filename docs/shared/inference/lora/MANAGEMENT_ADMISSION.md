# 管理向け数値宣言・三段階入力契約

ownerコード正本：`82b21f09cb63926543181b16f0e97ebc6b9fa6be`。引継ぎのsource/path/hashと管理の未対応範囲は [HANDOFF.json](../../../../development/ai-connection/reference-adoption/lora/management-handoff/HANDOFF.json)、[管理向け手順](../../../../development/ai-connection/reference-adoption/lora/management-handoff/HANDOFF.md) を参照する。

## 数値宣言DATA

```js
import {describeLoraNumericDeclarations} from './numeric-declarations.mjs';
const declaration = describeLoraNumericDeclarations({
  plan, ownerBinding: await facade.describeBinding()
});
```

版は `lora-numeric-declarations/0.1-draft.1`。公開ownerの両registryとplan operationをkey/weightIdで結び、各patchのbaseDtype・outputDtype・layout、sourceStorageDtype、値のpresence・取得元pathを返す。baseDtypeはnative.computeDtype、outputDtypeとlayoutはconnection targetのdtype/layout。native・connection・plan targetの観測値も残す。

原本FP8 weight/F16 biasはprovenanceであり、LoRAへ渡す復号F32 baseとは別。outputDtypeは準備したweight/biasの出力形式で、consumer16出力ではない。原本LoRAのsourceDtypeはinspectionが所有する。欠落値をF32/row-majorや倍率で補完せず、planのalpha=0/nullとfield未取得を区別する。alpha省略時の倍率は既存の固定loader規約に留める。値を観測したことと管理の互換性判定を分ける。

## 三段階のraw input

```js
import {createLoraManagementAdmissionInputs} from './management-admission-inputs.mjs';
const data = createLoraManagementAdmissionInputs({
  ...actualOwnerOptions,
  factorySourceRef: pinnedSourceRefFromHandoff,
  isCurrent: selectedNativeTransactionIsCurrent,
  isPublishedCurrent: activePublishedSnapshotAndOwnerAreCurrent
});
const declarations = data.preflightInputs();
const numeric = data.checkpointInputs({
  nativeValidation: actualOwnerValidation.nativeValidation,
  ownerValidation: actualOwnerValidation,
  snapshotTarget: context.target,
  weightBiasEvidence: actualIndependentWeightBiasReceipt
});
const transaction = data.postpublicationInputs({
  snapshotTarget, publication, queueReports, ownerState, ownerValidationRef
});
```

この例は管理で組み立てる呼出し形を示す。新しい正式管理APIが実装済みという意味ではない。版は `lora-management-admission-inputs/0.1-draft.1`。各methodは既存管理 `evaluateEdge` へ渡せる凍結DATAを返す。ReferenceSetのruntime brandを維持し、evaluator、READY、native適用機能を所有しない。

正式管理入口はverified ReferenceSet・実source bytes・owner provenanceを確認し、管理の既存evaluatorとqueue/snapshotで受入を判断する。最初のcheckpointで `ownerAdmission.phaseBinding.bound:true` と実context.target/外側ownerValidationの一致を必須にする。省略されたtargetはnull/bound:falseとして残り、後からpublicationで埋めない。

commit直前は選択・資源generation・外側consumer token・native revisionを再確認する。公開後の監査はcore publish/cleanup後のactive snapshot/ownerで行う。closedになったstage contextのcurrentnessを流用しない。後段監査失敗でも実publicationの事実は残り、受入と再利用を止める。finalize済みのrollback履歴があるように扱わない。

旧 `createP3NormEdge` は互換試験用shim。mapping正本は `createDiffusionDiagnosticAdapter`、native SDK v1/v2は維持する。管理版edda43では宣言3値と正式三段階入口が未対応で、採用確認は保留している。既存6件の実数値証拠は元pin/scopeで再利用する。全target・他pair/sideの新規数値受入・全model session・生成は追加しない。
