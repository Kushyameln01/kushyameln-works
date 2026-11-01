DiffusionModels通常consumer契約の引継ぎです。LoRA側固定source `c4860579d01d9f704cb16714e364a22668f9d57e` の P4-API.md を取得し、現行adapterが独立参照・gateを通常validate/commit条件にしている点を確認しました。

- Diffusion配布: `5278069ee0b72a9f2d684cdc8075e460187a7acf`。実行source: `30e283bb115741af6b475e9bdc41700a4e564053`。
- [通常API・weight feed契約](https://github.com/Kushyameln01/kushyameln-works/blob/5278069ee0b72a9f2d684cdc8075e460187a7acf/docs/shared/diffusion-models/execution/README.md#lora-weight-feedの通常検証)
- [検証結果・再現・未受入](https://github.com/Kushyameln01/kushyameln-works/blob/5278069ee0b72a9f2d684cdc8075e460187a7acf/development/ai-connection/normal-execution-20261102/RESULT.md)

新通常経路では `validate(candidate,context)` は対象/fullShape/宣言range/有限性/package完成/取引epochを検査し、native内部candidateをadmitします。commitはその内部状態を使い、expected/input/reference/hash/gate/run callbackや外部成功receiptを要求しません。`context` の model/graph/registry/side/profile/scope、isCurrent、任意signalと、現在のpackage内容のintegrity hashは維持します。

独立比較は任意の `diagnose(candidate,{...context,input,expected,expectedSHA256,referenceId,gateId,tolerance,run})` へ分離し、通常admissionを変更しません。registry.validationGateは構造検証、registry.numericalDiagnosticsは従来の独立gateです。registry hashとvalidate結果の契約が変わるため、旧診断registryへ読み替えず、新通常adapterで既存canonical mappingを再利用して対応してください。低rank積・LoRA mappingはLoRA ownerのままです。取引APIはsame-realm owner.weightFeedで提供し、取引RPCは未追加です。

保持済みSDK完成F32 artifact `461b643e…9961`（LOW light+1、crossQ先頭4行×全5120列＋bias4）を、新native通常validate→commit→package解放→実ORT/Hikeへ接続しました。独立比較はその後に診断側で行い、8値失敗0/maxAbs1.430511474609375e-6。旧lease不変・rollback・保持bytes/lease/session解放も確認しました。低rank再計算0。これは通常consumerのQ4境界で、新canonical SDK adapterの共同受入・全LoRA P4・全モデルの受入ではありません。

旧sourceのA/B受入scopeは維持します。新通常adapterの取得確認・接続結果は、この固定API/sourceを基準に返してください。投稿/readbackと相手のACKは分けて記録します。
