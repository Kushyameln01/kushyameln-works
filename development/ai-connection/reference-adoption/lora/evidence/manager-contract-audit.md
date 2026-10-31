# P3 管理採用adapterの原文照合

2026-10-31 JST。read-only audit。manager source `28596717182e48aeb23c719c51b6e593edf4e496`（公開branch `codex/ai-connection-e0-e4`／Draft PR7）をGit objectから取得し、detached worktree `/workspace/work/lora/manager-285967` へ固定した。製品sourceの編集・数値再実行・原本LoRA/modelの読取/hashは行っていない。Profile台帳PageのFORBIDDENは親が記録しており、本監査は再試行・別経路取得を行わず、ユーザーが明示したfixed Git sourceだけを読む。

固定参照データ `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` の `PLAN-ADDENDUM.md` は0.2-draft.3。`createDiffusionDiagnosticAdapter` をmapping正本、管理の `createAdoptedLoraAdapter` をrequest/revision/resource envelopeとする。旧 `createDiagnosticLoraBridge` は回帰専用で同一路へ重ねない。MANAGER-NORMS1.0-draft.1はN-MAPPING/N-TRANSACTION等を規定するが、runtime JSON読込みは未実装と明記している。文書採用をruntime規範機能の実装と読み替えない。

## 取得証拠

`p3-manager-source-receipt.json` に10 source/docのfull commit、path、Git blob、bytes、SHA-256を記録した。主実装 `docs/shared/ai-connection/adapters/adopted-lora.mjs` は15,525 bytes、SHA `16e1cc9be52301c6456fc0754b70874eccc55ad8c27b93039bb98f6a3490843e`。旧bridgeは別file `diagnostic-lora.mjs` で22,658 bytes／SHA `3ae863bb29f0f279cfcc637fe2e6c369061d45f0de11dbf19ec930188a6a3267`。

API原文は `docs/shared/ai-connection/API.md` のAdopted owner LoRA adapter節。公開採用結果は `development/ai-connection/E1-ADOPT-RESULT.md`、元取得根拠は同 `E1-ADOPT-SOURCE-BASELINE.md`。

## 採用組合せを変更しない

manager版は `works-adopted-lora/0.1-draft.1`。数値mappingを再実装せず、明示注入したowner export `createDiffusionDiagnosticAdapter`（`lora-diffusion-diagnostic-adapter/0.1`）だけを呼ぶ。

| pin | 管理の固定値 |
| --- | --- |
| LoRA SDK | 0c27874908638afc748ea2455a2779a16736730b / sdk-v2.mjs / SHA c425519eb282f798f4296bc97fd1506664afd850dee9addb17af77dd41e39fa0 |
| owner adapter | 同0c / diffusion-diagnostic-adapter.mjs / SHA bcea7b495e819d1e1052543f36cbdad0ed8515e74bd8914cf66dc03b093c6e4f |
| LoRA kernel | 同0c / kernel/lora.wasm / 5051 bytes / SHA 3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24 |
| Diffusion native consumer | 438972f30242e0a3bc66edb8591f38eaa0fcd384 / diagnostic-consumer.mjs / SHA fdac31542f87d68b9e01a1ba674ee9b60433cae685d6670222f8d914dd27f943 |

sourcePinsは各repository/full commit/path/SHA（kernelはbyteLengthも）を要求する。pin文字列だけで取得bytesを認定せず、callerがGit/bytesを検証してinjectする。現LoRA fc2789aと0cは `docs/shared/inference/lora/` 内ではCONNECTION_V2.mdのみ差分で、runtimeのSDK/adapter/kernel bytesは同一。ただし採用pinをfcやDiffusion5fへ自動的に付け替えない。manager testは同bytesでもDiffusion5f commitをSOURCE_PIN_MISMATCHで拒否することを明示している。

## Factoryと所有者

```js
createAdoptedLoraAdapter({
  ownerExports, sdk, consumer, baseProvider,
  sourcePins, resourceBinding, isOwnerCurrent
})
```

resourceBindingは `{ownerId,bindingId,resourceGeneration}`。全て非空stringで固定cloneされる。sdkはnative v2とsdkInstanceId、修正kernelのwasmShaを持つ。ownerExportsは実owner versionとfactoryを持つ。factoryはnative consumer/baseProviderをそのままowner factoryへ渡し、戻るregistry/provider/sink/target/finalize/restore/runへ委譲する。旧bridge importはない。module/resourceのdisposeはcaller所有。

## requestとrevisionの実境界

各targetは `{managerSessionId, managerRevision, requestId, resourceBinding, ...optional}`。managerRevisionは非負safe integer、requestIdはinvocationごとに一意。plan cohortはtargetからrequestIdだけを除いた全metadataである。同一plan/preparedに対するprepare/stage/finalize/releaseは、managerRevisionとresourceBindingだけでなく任意metadataも同一でなければTARGET_MISMATCH。

- 同一planのphaseごとにrequestIdだけを変える。強度変更は新plan・新managerRevisionで作る。
- sdkInstanceId / localInputRevision / localApplicationRevisionはnative plan/receiptをそのまま保持し、`management.localRevisionBindings`に記録する。managerRevisionへ代入しない。
- 別sdk、別kernel、cloned plan/prepared、再利用requestId、別resource generationを拒否する。
- active invocationがある間はOWNER_BUSY。pending release/rollbackがあれば通常操作はRECOVERY_REQUIRED。cleanup操作は保持したopaque allocationへ明示回復する。
- 最新selectionが失敗しても以前のconsumer copyは残り得る。読み戻しrunはlast成功cohortであり、呼出し側は`activeRevision`を明示して観測する。失敗した`selectedRevision`としてpublishしない。

## exact method対応

| facade | native/owner呼出しと結果 |
| --- | --- |
| `plan(input,{target})` | diagnostic.targets必須。owner registry/loaderを注入しsdk.plan。original planをWeakMapで保持。PARTIAL/plan/source/build/dual registry/local revisionを検査 |
| `prepare(plan,{target,signal,blockRows=16,onBlock})` | owner.createSink(plan)、owner.baseProvider、sdk.prepare。onBlockにはowned cloneを渡し、callback後に現在性を確認して元blockをnative sinkへ。observer失敗はSDKのabort経路 |
| `stage(prepared,{x,expected,tolerance},{target,isCurrent})` | compact finite F32 x5120/expected16をcopy。owner.targetForPlan→sdk.stage。native scope/reference hash/tolerance/graph/registry/plan/source/packageを検査。結果は正確な`{receipt,management}` envelope |
| `finalize(prepared,exactEnvelope,{target?})` | 終端の同じenvelope objectだけを認めowner.finalize(plan)。省略targetのみ元stage requestId再使用を明示許可。新targetなら一意requestIdを要求 |
| `release(prepared,{target})` | SDK release。in-use/未復帰等の制約はSDKが保持。candidate履歴解放とは別 |
| `run({x,signal},{target})` | last成功cohortでowner.run。返すnative output/epoch/package/evidenceを保持 |
| `restoreBase(reference,{target,isCurrent})` | last成功cohortを対象にowner不変base prepare/validate/commitへ委譲。native v2へ架空detach/resetを足さない |
| `recover(prepared?,{target})` | SDK recover、保留native rollback、保留prepared releaseを順に再試行。失敗時allocationを保持 |
| `describeBinding()` | ownerの両registryと管理側pin/resource/sdk identityを別namespaceで返す |

stage receiptはCONSUMER_APPLIEDでもPARTIAL/diagnostic-projection、generationReady=false、snapshotPublished=false。dynamic ownership.ownerIdは実consumerの独立copy ownerを維持する。native packageHash、SDK bundleHash、registryHash、manager target/hashは同一化しない。

restoreBase/run/recoverはstageのようなmanagement envelopeを返さない。P3の共同試験では外側のtraceに、呼び出したrequest targetと返るnative receipt/epoch/packageを対応付けて保存すると、N-TRANSACTIONを正確に示せる。これは数値mappingの複製ではない。

## 取消・失敗復旧の注意

**adopted facadeはcancel/disposeメソッドをexportしていない。** API.mdの後段にある一般的なadapter.cancel/adapter.disposeの説明はcreateDirectAdapterの機能で、このfacadeへ流用しない。旧bridgeを重ねて不足メソッドを補う経路を作らない。

callerが所有するAbortSignalまたはsdk.cancelでbounded Hike/ORTの後に協調停止し、元Promiseの終端→recover→必要releaseを観測する。取消要求をcleanup完了と呼ばない。manager現公開browser harnessはonBlockからsdk.cancelを呼び、失敗selectionを公開せず以前のactiveRevisionでrunし直す。遅いstage成功直後のmanager失効はowner rollbackへ戻す。rollback失敗時は保持closureをpendingRollbacksへ残して新操作を拒否し、recoverで再試行する。native candidate/epochとowner現在性はowner adapter/native consumerが検査する。

## ローカルFileと既存4原本

`run-managed-local-files.mjs`は入力JSONからpositive File1件＋選んだnegative Filesを読む。positives.selectionは現Bernini診断のlight/detail・high/low、expectedSha256を明示する。原本台帳をCLIの必須4件として列挙していない。製品入力はローカル選択File/Blobで、URL/Drive/ZIP取得は製品runtimeへ追加しない。

browserはnative Diffusion loadLora→createLoraSource→LoRA SDK inspect/planというsource経路を通る。load登録のapplied:false、header-only inspectionのsourceSha256:null、prepare、diagnostic CONSUMER_APPLIEDを区別する。source卸し後はSOURCE_BINDING_UNAVAILABLEとなり、active consumerは独立copyでなおrun可能。

期待値生成は任意selected Fileの実Q factors/alpha/diff_bをowner独立Pythonで読む。baseは明示synthetic-manager-control-fixtureであり、学習base/graph適合・実base再受入としない。ファイル名やtensor shapeだけで実base互換を認定しない。

## 既存証拠とP3で追加確認すべき差分

公開E1-ADOPT-RESULTは次を別scopeで記録する。

1. owner実base×実4LoRA20caseの公開証拠検査。private全weight配列の再取得/再計算ではない。
2. managerの実ローカルpositive File1件＋4negative File、actualSDK/Hike/ORT、synthetic manager-control baseで5case。強度0/1/-1・再適用・取消復帰、保存/破損拒否、source卸し後copyを確認。
3. Node209件の回帰。合成fixtureと元実原本共同成功へ合算しない。

現`managed-local-file-browser-cases.mjs`のfresh実制御試験にはbase復帰操作と意図的validate失敗の追加試験がない。別の`managed-lora-browser-cases.mjs`には両方があるが、full base/2原本を読むoptional診断harnessで、公開File-control5caseの成立からそれらを測定済みとはしない。

P3では少なくとも、選んだlocal File1件で①初回/強度0/明示強度/負数、②不変base restore/reapply、③bounded取消→元Promise終端→recover→旧applied cohortの観測、④故意のindependent expected不一致→復旧、⑤late stage/rollback失敗の保持とrecovery、⑥prepared/candidate releaseとcopy所有を、管理request traceとnative local revisions/native epochへ対応付ける。合成baseを使えば制御経路PASS、旧実base部分結果の再利用は別receiptとする。全target/full session/generatedへの昇格はしない。

## source-only再現入口

```sh
# 正確なadopted LoRA0cとDiffusion438を別rootへ展開した後
WORKS_ADOPTED_LORA_ROOT=/absolute/lora0c \
WORKS_ADOPTED_DIFFUSION_ROOT=/absolute/diffusion438 \
node --test --test-isolation=none tools/ai-connection/test-adopted-lora.mjs
```

このfileは11 tests、うち実SDK/Hike128rank fixture1件は両env指定がなければskipになる。残りはfake numerical stage/SDKも含むunit制御fixture。実File＋実ORTの代わりにはしない。

```sh
node tools/ai-connection/run-managed-local-files.mjs --help
# CLIは --lora-root --lora-commit --diffusion-root --diffusion-commit
# --codec-root --codec-commit --inputs --out を要求する。
```

codecの管理採用版は2c171a09ccda65c54899f322ae490f1bfcaac6fb。Git object照合を管理worktree rootで行うため各依存commit objectも取得する。raw入出力はGit外の新規private directoryへ保存する。

## 監査の結論

実mappingはowner正本へ一元化されており、この固定組合せで採用経路を共同検証する土台は存在する。P3に必要なのはrequest/native revision/ownershipの実traceと、公開File-controlで未測定のbase復帰・失敗復旧を含む変更境界の受入である。現段階で製品mappingの再実装や旧bridge積層は必要ない。

Manager worktreeはdetached2859671のclean状態。既存sourceの編集、orig payload読取/hash、tests実行は本監査では行っていない。
