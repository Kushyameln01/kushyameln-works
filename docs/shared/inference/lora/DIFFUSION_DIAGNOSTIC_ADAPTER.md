# LoRA v2とDiffusion Q診断consumerの接続

`lora-diffusion-diagnostic-adapter/0.1` は `lora-connection/2.0-draft.1` と `bernini-diagnostic-registry/0.1` の外側adapter。対象はQ full shape `[5120,5120]` の連続16行・全列と同じ16 bias。全target、実model全session、生成snapshotを扱わない。

対向原本は [Diffusion PR6 commit438972](https://github.com/Kushyameln01/kushyameln-works/blob/438972f30242e0a3bc66edb8591f38eaa0fcd384/docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md)。base/provider/consumerは [診断原本f522](https://github.com/Kushyameln01/kushyameln-works/blob/f522d9aeff313558c4ef83022a340af9a4c21391/docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md) と同じ実装。native API、scope、hashと所有権を維持し、公開objectを注入して使う。LoRA本体から対向のprivate実装をimportしない。

```javascript
const adapter = createDiffusionDiagnosticAdapter({
  consumer, baseProvider: base.baseProvider,
  isOwnerCurrent: () => ownerStillOwnsThisDiagnosticApplication()
});
const plan = await sdk.plan({
  selection: {pairId, noise}, strength, registry: adapter.registry,
  loaderPolicyId: adapter.registry.loaderPolicyId,
  diagnostic: {targets: selectedWeightAndOptionalLightBias}
});
const prepared = await sdk.prepare(plan, {
  baseProvider: adapter.baseProvider, sink: adapter.createSink(plan)
});
const target = adapter.targetForPlan(plan, {x, expected, tolerance});
const receipt = await sdk.stage(prepared, target);
await sdk.release(prepared); // native candidate/active feedが独立copyを所有
await adapter.finalize(plan); // stage終端後にrollback履歴を解放
const result = await adapter.run({x});
```

失敗時はSDKのrollback/recoverを完了してからpreparedを解放する。`finalize(plan)`をstage終端前に呼んでrollback履歴を捨てない。callerがnative consumer、ORT/Hike stage、base providerを所有し、終了時にその順でdisposeする。

`isOwnerCurrent`は必須のowner識別条件で、SDKの取消Signalとは別。通常dispatchではowner・SDK current・Signalを検査し、cleanupではownerとnative candidate/epochの所有関係を検査する。同じownerのcommit直後取消は元feedへ戻し、ownerが移った場合や新epochを古いrollbackで上書きしない。管理側で使う際は、固定trueではなく実owner/revisionへ結ぶ。共同runnerは他jobと共有しない診断ownerを明示的に持つ。

## 対応規則

| 境界 | 対応 |
| --- | --- |
| registry | LoRAのshapeは元full shape。native selected shape・row-slice・FP8情報は別descriptorに保持 |
| hash | connectionRegistryHashとnativeRegistryHashを別に保持。相互に同じ値へ付け替えない |
| provider | 元tensor内element offsetをnative選択slice内offsetへ範囲検査付きで変換 |
| sink | fullShape/bindingをselected shape/runtime feedへ変換。graphInitializerを使わない |
| detail bias | LoRA patchを作らず、不変base16値をchecksum付きpass-through。ゼロ補完しない |
| light bias | 明示Q diff_bの16値が必須。欠落をbase値で隠さない |
| validate | 独立x/expected[16]/事前gateでnativeを実行し、元receiptにv2 plan/source/scope識別を結ぶ |
| commit | native feed切替を診断scopeのCONSUMER_APPLIEDへ対応。copy ownerを実candidateへ結ぶ |
| snapshot | generationReady=false。管理snapshotを公開しない |

`describeBinding()`は両descriptor/hashとpass-throughの来歴を返す。nativeは自身のheader/range検査を記録し、外部の有効な全file hash receiptは別証拠として結ぶ。native registryを改変してfullFileSHA256Verified=trueへ変更しない。

## 管理採用とP0の宣言

管理の `createAdoptedLoraAdapter` はこのowner factoryを注入して使う。mappingの実装を管理へ複製せず、旧 `createDiagnosticLoraBridge` を同じ経路へ重ねない。固定採用source、loader・variant・dtype・明示strength・原本識別・full/selected shape・両registry・gate/scopeの対応は [P0宣言](../../../../development/ai-connection/reference-adoption/lora/DECLARATION-BINDINGS.json) と [管理経路の確認結果](../../../../development/ai-connection/reference-adoption/lora/RESULT.md) を参照する。

管理request/revision/resource generationと、SDK instance/local revision・native consumer epochは別の識別子。取消やbase復帰後には値が一致しない。原本登録、prepared、STAGED、診断consumerへの `CONSUMER_APPLIED`、管理snapshot公開を別状態として扱う。このadapterの成功だけでは生成可能snapshotを公開しない。

入力は選択されたユーザーのローカルFile。下記の過去4原本を使う共同runnerは歴史的な実モデル診断の再現手順であり、一般の登録・適用に4原本すべてを要求するAPI制約ではない。今回の管理経路fixtureは1 Fileで実行し、実base合格とは別の証拠にする。次期規範runtimeと実native診断snapshotの受入状況も確認結果で区別する。

## baseへの復帰

```javascript
await adapter.restoreBase({x, expected: baseExpected16,
  tolerance, signal, isCurrent: () => diagnosticOwnerIsCurrent()});
```

native `prepareBase → validate → commit` を使う診断sideの復帰。SDK v2へ架空のdetachを追加せず、PARTIAL/runtime-inputをv1 initializer/FULL経路へ付け替えない。復帰候補も独立期待値へ比較し、失敗時には元candidate/contextでrollbackする。

## 共同検証入口

```sh
DIFFUSION_SOURCE_ROOT=/path/to/pinned-peer node --test tools/ai-connection/test-diffusion-diagnostic-adapter.mjs
python tools/ai-connection/test-lora-reference.py
node --test tools/ai-connection/test-joint-comparison.mjs
node tools/ai-connection/test-lora-diffusion.mjs --help
```

契約fixtureと実base共同結果は別の証拠。共同runnerは実baseの有効な全file hash receipt、元File、4実LoRA、固定peer sourceを要求する。独立参照はNumPy binary64による固定loader式、実演算はHike F32とORT WASM/Hike bias。元ComfyUI GPU precisionや全model適合を認定するものではない。

事前gateはbase復号byte一致、weightは `1e-5 + 1e-4*abs(reference)`、biasはF32値一致、出力はnative診断契約の `1e-6 + 1e-5*abs(reference)`。strength `{0,1,-1}` を宣言した診断集合として使い、製品の初期強度へ流用しない。全81,920重みと対象bias、各16出力を保存・比較する。生の選択重みと参照配列はprivate evidenceへ保存し、モデルの一部をGitHubへ公開しない。
