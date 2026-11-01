# 正式DATA bridgeの実File・真正base受入

実行sourceは `28f44c3a1b71bef59e2d018a0db736de6d84675c`。管理 `60d16b64d6020d3d20239f087f8add91268dcaad` の `createLoraDataPhaseBridge`（`works-lora-data-phase-bridge/0.1-draft.1`）から、DATA82b・native LoRA fc2789／Diffusion5f880のQ16 consumerへ接続した。[結果](../../../../development/ai-connection/lora-p2-p3-consumer/RESULT.md)、[再現](../../../../development/ai-connection/lora-p2-p3-consumer/REPRODUCE.md)、[全target表](../../../../development/ai-connection/lora-p2-p3-consumer/TARGET-CONSUMER-MATRIX.md)を参照する。

## API差分

SDK v1/v2、loader、正本 `createDiffusionDiagnosticAdapter`、Hike/ORT kernelのbytesとnative pinは変更していない。正式bridgeを使う実File receiver harnessと、未来receiptを含まない事前宣言assemblyを追加した。旧手動norm hookや旧管理bridgeを重ねない。

```js
const bridge = createLoraDataPhaseBridge({
  adapter, referenceSet, edgeInput, inspection, dataSourceVerification,
  consumerBinding, readConsumerBinding, readNativeRevisions,
  readCurrent, readWeightBiasEvidence
});
const plan = await bridge.plan({selection, strength, diagnostic}, {target});
const owner = bridge.createSnapshotOwner({
  plan, validation, resourceBinding, queue, requestPrefix
});
// Existing snapshot manager owns the actual checkpoint and branded audit.
```

実sdk.plan返却時のlocal revision、管理revision、外側consumer tokenを分ける。base/outputはF32 row-major、原本storageはweight F8_E4M3／bias F16、LoRA原本のBF16はinspectionから取得する。

## 受入範囲と寿命

一つのユーザーローカルlight/HIGH Fileを新規loadし、その全体hashを一度確認した。4原本の取得・hashは要求しない。真正baseは709,364-byte配布artifactのheader・offset・5rangeと既存独立参照へ照合した。全base hashは過去owner receiptであり、今回の再検査ではない。

実Q full[5120,5120]の先頭16行・全列と、明示bias full[5120]の先頭16値を扱う。強度0/+1/-1、再適用、検証失敗後・取消後の復帰の6公開caseで正式checkpointと公開後監査を確認した。各81,920 weight・16 bias・16出力を保持済み独立参照／元gateへ比較した。失敗・取消候補は公開6件へ加算しない。

取消はnative checkpointでの協調停止と元Promise終端/releaseを確認したもので、Hike同期呼出し内部への割込みではない。新選択は旧snapshotを直ちに非currentにする。prepared/history解放後とsource能力解放後も、consumer独立copyからrunできた。解除は同じqueueで不変baseへ戻し、差分引戻し・再加算をしない。leaseは未受入。

## consumerとcoverage

全2,904 patchを保持し、旧Q16対応6patch以外の2,898patchには実graph/feed/sessionがない。logical shapeを実base適合とせず、未知dtypeはnullとする。現在の選択はPARTIAL、completeAdapter=false。

Diffusion508dの新固定N2 tailは、LoRA prepared bytesを実sessionへ採用する取引APIがなく [依存待ち](../../../../development/ai-connection/lora-p2-p3-consumer/CONSUMER-DEPENDENCIES.md)。管理へmappingを複製せず、mean入出力APIを追加しない。新tail・別pair/sideの新正式経路・HIGH/LOW共同snapshotの新真正base試験・全target・全model/session・生成・二組同時合成・本番公開は受入外。終了時はbase復帰・snapshot非current・資源解放済み、generationReady=false。
