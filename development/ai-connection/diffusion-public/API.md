# LoRAなしDiffusion公開モデルAPIの管理接続

新しい全モデル用の入口は `createDiffusionPublicManagement()`。固定配布 `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` の `createDiffusionModels({sessionId})` と実module Workerを使い、既存のqueue・互換性評価・normal snapshot・owned artifactへ接続する。旧mean/P4の入口・pin・成立域は変更しない。管理側で重み復号、NN、scheduler、数値変換を実装しない。

これはプログラムから呼ぶ管理adapterと保持環境用runnerのAPIであり、既存の管理ページに全モデル操作UIを追加したという記録ではない。実HIGH/LOW pairによる新管理経由のsampleと、1-thread／非COIでのNN実行は未確認。必要な実ファイルと再現手順は [REPRODUCE-HOLDING.md](REPRODUCE-HOLDING.md) を参照する。

## 作成と公開メソッド

`docs/` をHTTPのrootとして配信する場合のimportは次のとおり。

```js
import {createDiffusionPublicManagement} from
  '/shared/ai-connection/adapters/diffusion-public/adapter.mjs';

const manager = await createDiffusionPublicManagement({
  managerSessionId: 'my-diffusion-manager',
  apiSessionId: 'my-diffusion-api'
});
```

両session IDは省略可能。通常は `api` を渡さず、採用した実factoryに専用Workerを所有させる。作成時に固定sourceを照合してcapabilitiesを取得するが、モデルpairはまだloadしない。

| メソッド | 引数 | 動作 |
| --- | --- | --- |
| `load` | `{files:{HIGH,LOW},resource?,requestId?,signal?,onProgress?}` | 両方の完全なFile／Blobを公開APIへ渡す |
| `modelStatus` | `{requestId?,signal?,onProgress?}` | nativeの現在状態と資源観測を取得する |
| `unload` | `{requestId?,signal?,onProgress?}` | native ownerの解放を待ち、公開APIのWorkerを終了する |
| `predict` | `{input,requestId?,signal?,onProgress?}` | 明示sideのnative予測を通常結果へ接続する |
| `sample` | `{input,requestId?,signal?,onProgress?}` | native内部のHIGH3→LOW3 sampleを通常結果へ接続する |
| `saveTensor` | `{tensor,requestId?,signal?,onProgress?}` | native codecのcanonical bytesを返す。ディスク書込みは呼出側が行う |
| `readTensor` | `{file,requestId?,signal?,onProgress?}` | 渡された実File／Blobのbytesをnative codecで読む |
| `execute` | `{operation,input={},requestId?,signal?,onProgress?}` | 上記7操作の共通入口 |
| `query` | `{operation,input}` | 実装・load・cleanup状態と必須入力の有無を照会する。NNは実行しない |
| `cancel` | `manager.inspect().activeTarget` の完全な値 | 該当する実行中requestを取り消し、元requestの終端を待つ |
| `inspect` / `observe` | なし | 管理状態／owner観測を同期取得する |
| `subscribe` | `listener` | `{kind,value,state}` を観測する。解除関数を返す |
| `restoreArtifact` | `artifactId` | 管理が保持するnative tensorの独立copyを同期復元する |
| `releaseArtifact` | `artifactId` | owned artifactを解放し、存在した場合に `true` を返す |
| `dispose` | なし | queueと元requestの終端、API終了、保持artifactの解放を待つ |

`requestId` はmanager内で再利用できない。`signal` は実 `AbortSignal`、`onProgress` はwire入力外のローカルobserverである。実装に `configure`／`recover` メソッドはない。再loadには `unload` または取消後の状態に従って `load` を使い、dispose後は新しいmanagerを作る。

作成引数 `api` は制御試験用の注入点で、使うと `inspect().controlTestDouble` が `true` になる。`environment:{crossOriginIsolated,sharedArrayBuffer}` は管理側の資源受付を試すための指定であり、実WorkerのCOI/SAB条件を成立させない。通常の呼出例では両方を省略する。

## nativeへ渡す入力と結果

管理wrapperの `input` は次の公開契約を保持する。通常入力へ独立参照、誤差gate、過去receipt、診断callback、固定payload hashの一致条件を追加しない。モデルidentity、tensorの値域・shape・dtype・layout・meaning・normalization、context順序、Text/mask、finite値の数値検査はnative ownerが行う。未知fieldやaccessorを管理snapshotで通常データへ変換して受理することもない。

| 操作 | native入力 | native結果 |
| --- | --- | --- |
| `load` | `{files:{HIGH:FileOrBlob,LOW:FileOrBlob},resource?:{wasmThreads:1\|4}}` | `{loaded,modelSessionId,modelEpoch,profile,models,scheduler,resource,publicWorkerConnected:true,generationReady:false,originalWorkflowAccepted:false}` |
| `modelStatus` | `{}` | `{adapterImplemented,loaded,cleanupRequired,modelSessionId,modelEpoch,busy,closing,disposed,generationReady:false,nativeCandidateDescription,resources}` |
| `unload` | `{}` | `{unloaded:true,modelSessionId,modelEpoch,resources}` |
| `predict` | `{side:'HIGH'\|'LOW',shapeRequest,tensors,conditioning,timestep,modelSessionId?}` | `{tensor,execution}` |
| `sample` | `{shapeRequest,tensors?,noise,positive,negative,modelSessionId?}` | `{tensor,execution}` |
| `saveTensor` | `{tensor}` | `{bytes:Uint8Array,byteLength,sha256,metadata}` |
| `readTensor` | `{file:FileOrBlob}` | `{tensor,byteLength,sha256}` |

`tensors` はnativeのcanonical target/context順序と `requirementId` を保持する。sampleの `noise` は明示したcompact・非共有・finiteな `Float32Array`。`positive` と `negative` は別owned copyのText packetで、全Text行とmaskを保持する。tensors省略時のzero targetはcontextなしの場合だけnativeが扱う。管理側でcontextを詰め直さず、noiseやschedulerを生成しない。

predictのtensorは `float32`／`NCTHW`／`bernini-flow-velocity:v1`。sampleのtensorは `wan21-raw-generated-sample:v1` で、raw生成sampleとして復元済みの `latentContract` を持つ。posterior meanへ改名せず、mean専用の追加復元も行わない。

`execution` はnativeの `{operation,modelSessionId,modelEpoch,profile,publicWorkerConnected:true,generationReady:false,originalWorkflowAccepted:false}` を保持する。管理は返されたtensorとexecutionの値を変更せず、copyして通常結果へ接続する。

## 管理結果、snapshot、artifact

成功した `execute` と各操作wrapperは次の共通形を返す。nativeの各結果fieldはトップレベルにも展開されるため、例えばsampleの `reply.tensor` は `reply.result.tensor` と同じ内容になる。

```js
{
  status: 'EXECUTION_COMPLETED',
  operation,
  result: nativeResult,
  ...nativeResult,
  normalExecution,
  // 通常tensor接続がある場合:
  snapshot, edgeDecisions, artifactRecord,
  nativeReply, target, terminal,
  load: 'IMPLEMENTED', predict: 'IMPLEMENTED', sample: 'IMPLEMENTED',
  generationReady: false,
  originalWorkflowAccepted: false,
  acceptedProduction: false
}
```

`snapshot` と `edgeDecisions` は入力tensorを既存のnormal経路へ接続できたpredict/sampleで返す。tensor fieldを持つ結果には `artifactRecord` を作るため、readTensorにもartifactがあるが、codec操作の `normalExecution` は `false`。必須入力や数値の妥当性はnativeで検査され、`query().dispatchSupported` やedgeの構造評価は任意shapeの数値受入を表さない。

`artifactRecord` は `artifactId`、`descriptor`、`nativeRef`、`responseRef`、`descriptorRef`、`ownership` と、存在する場合の `snapshot`／`execution` を持つ。通常出力の `artifactRecord.descriptor.snapshotId` は実際にpublishされた `reply.snapshot.snapshotId` と結び付く。executionは別fieldとして保持し、`modelSessionId`／`modelEpoch`／executionをnative tensorやそのdescriptorのnative metadataへ混入させない。`restoreArtifact(id)` は保持copyから元native tensorを復元する。

`terminal` はqueueの元request終端・request資源解放・結果採用の記録である。正常request終端時のreleaseはrequest record、入力holder、snapshot ownerを解放する。API instanceやload済みHIGH/LOW pairは保持し、次のpredict/sampleに再利用する。pairを終える `unload` とrequestのreleaseは別操作である。

## identityと現在状態

| field | 意味と寿命 |
| --- | --- |
| `managerSessionId` / `managerRevision` | 管理instanceとqueue requestの連番。nativeのinputRevisionとは別 |
| `apiSessionId` / targetの `sessionId` | 一つの公開factoryのsession。取消・unload後も同じAPI instanceで再loadできる |
| `jobId` / `inputRevision` | 一つのnative requestと公開APIの入力順序。capabilities取得にも消費される |
| `modelSessionId` | 一つのload済みpairのnative UUID。取消・unloadで失効する |
| `modelEpoch` | native Worker内のowner世代。新Workerでは値が再開するため、単独で一意とは扱わない |
| `modelGeneration` | manager内でload／model失効を区別するcounter。native epochとは別で、一回の操作につき一増加という契約ではない |
| `ownerInstanceId` / `resourceGeneration` | 管理ownerとAPI control資源のidentity。現実装のresourceGenerationは同じAPI instance内で維持され、model pairの世代を表さない |
| `configurationRevision` | owner観測のfield。現実装は初期値0で、外部から変更するconfigure APIはない |

`target` は `managerSessionId,managerRevision,requestId,activeToken,resourceBinding,sessionId,jobId,inputRevision,modelSessionId,modelEpoch,modelGeneration` を持つ。取消にはその時点の `inspect().activeTarget` 全体を渡す。managerはnative返答のprotocol/build/session/job/inputRevision/opを照合し、数値結果のexecutionも現在のmodel session/epochに照合する。古いtargetやmodel handleは再利用しない。

`inspect()` は `observe()` のowner／model状態に加え、`managerSessionId,managerRevision,apiSessionId,nativeBuild,capabilities,modelRuntime,activeTarget,lastStatus,lastError,snapshot,artifactRecord,artifactCount,queue,controlTestDouble,executionEvidence` と上記の実装／受入flagsを返す。`loaded`、`cleanupRequired`、`reloadRequired` が受付状態である。`lastStatus` は最後のnative modelStatus／unload結果で、毎request自動更新される現在値ではない。`snapshot`／`artifactRecord` は現在選択中の結果で、明示解放まで保持される全artifactの一覧ではない。

## 取消と失敗後の手順

実行中に公開APIが取消を受理すると実Workerを終了し、model sessionを失効させる。管理の `cancel(target)` は元native requestとqueueの終端を待つ。部分tensorは採用せず、`loaded:false,cleanupRequired:false,reloadRequired:true` となる。数値再試行には普通のpaired `load` が必要で、同じAPI sessionでreplacement modelSessionIdを取得する。

進捗observerから取り消した場合も、後続observerへ古い進捗を送らない。`subscribe` の `kind` は `progress`／`terminal`／`error`。`onProgress` とprogressの `value` はnative progress envelopeに `managerSessionId,managerRevision,requestId,modelGeneration` を加えた形で、native進捗本体は `event.result` にある。observer例外は数値結果を変更しない。

取消前にnative requestが既に終わっていて公開APIが `NOT_RUNNING` を返す場合は、Workerを終了したと見なさない。queueの遅い取消により結果採用は拒否しても、healthyなload済みownerは保持し、reloadRequiredへ変更しない。既にnative終端済みのtargetを直接 `manager.cancel` へ渡すと `TARGET_MISMATCH` になる。dispatch前の取消にもWorker終了やmodel失効を捏造しない。

| native側の失敗 | 管理状態と次の操作 |
| --- | --- |
| dispatch済みpaired loadの準備失敗 | Workerを破棄。元error codeと `details.workerTerminated/preparationDiscarded/reloadRequired:true` を保持。cleanupRequiredは解除され、再loadが必要 |
| 上記の後のfresh modelStatus | nativeは `loaded:false,cleanupRequired:false,modelSessionId:null,resources:null`。status照会だけでは管理のreloadRequiredを解除しない |
| 重複load／P4 owner競合 | native dispatch前に拒否され、既存ownerを保持 |
| predict/sampleのhealthyな入力エラー | load済みownerを保持し、修正した入力で再試行可能 |
| 実行後のclosing／cleanupPending、または統計取得不能 | `MODEL_CLEANUP_REQUIRED`。保持ownerのunloadが成功するまで数値実行・loadを禁止 |
| ordinary unloadの解放失敗 | `MODEL_UNLOAD_FAILED`。cleanupRequiredを維持し、unloadを再試行 |
| unload成功 | Worker終了、`loaded:false,cleanupRequired:false,reloadRequired:false`。次の数値実行にはloadが必要 |

同一managerのload/status/save/read/unloadも同じqueueで直列化する。実行中のsampleを、新しいinputRevisionのstatus照会で上書き終了しない。`dispose()` は最終終了であり、以後の実行は拒否される。

## 保存と実Fileの読戻し

```js
const loaded = await manager.load({files: {HIGH, LOW}});
const sample = await manager.sample({input: {
  shapeRequest, tensors, noise, positive, negative,
  modelSessionId: loaded.modelSessionId
}});
const saved = await manager.saveTensor({tensor: sample.tensor});

// 呼出側でsaved.bytesを実ディスクへ保存する。
// そのファイルを再選択して得た実FileをsavedFileとする。
const readback = await manager.readTensor({file: savedFile});
await manager.unload();
await manager.dispose();
```

例のHIGH/LOW、shape・tensor packet、savedFileは呼出側が供給する実データである。`saveTensor` 自体はディスクへ書かない。`readTensor` は指定されたFile／Blobのbytesを読み、メモリ上の同じtensorを再返却する代替動作は行わない。

canonical codecは `WKTSR001`、encoded fileの上限は別枠の64 MiB。pointwiseの1,048,576要素上限やposterior-mean専用profileを流用しない。saveの共有／非compact bufferは拒否し、readは読込み前にFile byte lengthを検査する。raw sampleのmeaning、normalization状態、producer identitiesとlatentContractを保存し、runtime handleや診断receiptは永続tensor payloadへ保存しない。

## thread条件とsource pin

`resource.wasmThreads` の既定値は1。通常の確認対象は1-thread／非COIである。4を使うときは明示指定に加え、実Workerの `crossOriginIsolated:true` と `SharedArrayBuffer` が必要で、満たさなければ `UNSUPPORTED_RESOURCE_CONFIG`。1へのfallbackは行わない。管理の資源受付だけでなくnativeも同じ条件を検査する。GitHub PagesがCOOP/COEPを取得したという前提は置かない。

採用bootstrapは [native.mjs](../../../docs/shared/ai-connection/adapters/diffusion-public/native.mjs)。`SOURCE.json` と150 owner filesを照合し、144の生成済み `BUILD_SOURCES`、build-info、Worker・ORT/Hikeの相対配置を保持する。モデルweightsは同梱しない。buildは `diffusion-models/0.1+9c5d8d18e9a7b046d7768c8c32ca6a48eaa084c900e916d59d63e735ebeb2a20`。

このmoduleの公開exportsは `DIFFUSION_PUBLIC_ROOT_URL,ADOPTED_DIFFUSION_PUBLIC_SOURCE,verifyDiffusionPublicSources,createDiffusionModels,BUILD_ID,PROTOCOL_VERSION,inspectDiffusionPublicAdoption`。通常管理入力にsource証拠の提出を要求せず、bootstrapが採用sourceを内部照合する。`verifyDiffusionPublicSources({read?})` のreader差替えはsource整合性の検査用である。

## 実装と検証の成立域

受付は実際の `capabilities.modelRuntime.operationsImplemented`、load／cleanup状態、対象入力契約を参照する。旧top-level `modelInference:false` やnativeCandidateDescriptionのlegacy flagだけで新routeを拒否しない。一方で `IMPLEMENTED`、`EXECUTION_COMPLETED`、normal snapshotは本番／原寸／数値精度受入を表さない。`generationReady,originalWorkflowAccepted,acceptedProduction` はfalseを維持する。

Nodeの [adapter試験](../../../tools/ai-connection/test-diffusion-public-adapter.mjs) は注入APIによる状態・identity・queue・snapshot・artifactの制御試験である。[native試験](../../../tools/ai-connection/test-diffusion-public-native.mjs) は固定source／capabilitiesの照合である。[実browser制御試験](CONTROL-REPRODUCE.md) は実factory・実Worker、無効な小Fileでの準備失敗、制御requestの取消、合成tensorの実ディスクcodec読戻しを扱う。いずれも実モデルNNのpredict/sample成功や、確保済み実pairの解放を証明する試験ではない。

実pair保持環境の入口は `tools/ai-connection/run-diffusion-public-browser.mjs`。固定管理SHA、保存済みN5／実L512入力、実HIGH/LOW Fileを使い、1-thread／非COIのsample、実patch進捗取消→同一APIでreload、6更新完走、raw sampleの実ファイル保存・読戻し、unload/disposeを記録する。[保持環境手順](REPRODUCE-HOLDING.md) の `--check-only` はsource／入力前提の検査であり、NN実行ではない。

本実装環境には約31.15 GBの実HIGH/LOW pairと元N5 manifestがなく、新管理経由のactual sampleと1-thread／非COIのNN結果は保持環境での実施待ちである。実L512 packetのbytes一致やone-threadで無効FileがWorkerへ到達した事実を、その代わりの成功結果にはしない。

既存4-thread／COIの数値証拠は元sourceとscopeで再利用する。HIGH predictの実行sourceは `7cf77c21889d9642e61d9a41d3242a816e24d6be`、cancel→reload後のsampleは `0f761f374dce1d447bbb912ad13c08f9bf85c279`。N5／実Text L512、明示noise、F32、Euler/simple6/shift5/split3、CFG1、LoRAなしであり、sampleの独立比較は最終raw128値だけである。後続 `6d12140eeab204385fa31f5da73d4796968a4003` の実試験は失敗prepare回復／prefix／codec smokeで、完全NNの再実行ではない。

private調査記録 `/workspace/work/ai-connection/diffusion-public-r16/OWNER-EVIDENCE-SOURCE-DIFF.json` では、採用配布と旧predict/sample実行sourceの144 build sources中142が同一bytesで、差分は `api/index.mjs` と `api/model-adapter.mjs` の失敗準備・cleanup処理だった。failureRecovery実行sourceとは144すべて同一である。このsource一致は旧数値証拠のscope再利用を支えるが、新管理／1-threadの実行記録へ置き換えるものではない。

原寸81frame／全73947token、元媒体・prompt/noiseの再現、本番mixed precision相当、生成品質、全モデルLoRAは未受入。計画上限90000は検証済みdomainへ読み替えない。
