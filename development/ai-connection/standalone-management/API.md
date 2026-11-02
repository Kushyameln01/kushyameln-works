# 管理単体 API — M1・M2・M3

2026-11-02。新計画「モジュール単体完成」1.0 draft 1に対応する**追加APIと静的browser入口の提案実装**。着手基点は `5ab651395e245e35f9472ca1b24f5e61550a9957`。

既存の通常adapter、`evaluateEdge`、queue、snapshot、E4 packageを再利用する。数値演算、LoRA層mapping、owner固有のshape対応を管理に追加しない。既存の診断入口と受入範囲は維持する。今回の参照ownerによる成功は管理制御の証拠であり、本物NNの数値成功・モジュール間の共同受入・製品生成READYとは別である。

## 既存APIとの差分

| 追加file | 担当すること | 再利用する既存実装 |
| --- | --- | --- |
| `docs/shared/ai-connection/pipeline.mjs` | 有限pipelineの参照解決・DAG化、明示条件分岐、共有workflow要求との対応 | `validatePipelineProfile`、`workflow-shapes.mjs`、`bindWorkflowRequirement` |
| `docs/shared/ai-connection/management-host.mjs` | owner注入、複数step・named入力、能力照会、進捗、対象取消、失効、保存状態の復旧 | `createNormalOperationAdapter`、既存`evaluateEdge`・queue・snapshot |
| `docs/shared/ai-connection/management-workspace.mjs` | 実tensor bytesとdescriptor・snapshot・evidence・trace・拡張・設定をZIPへ結合し、実bytesを検証して読戻す | 既存E4 package、JCS/hash、binary attachments、fflate |
| `docs/shared/ai-connection/reference-owner.mjs` | 単独管理試験で注入できる準拠owner | 通常owner protocol。実NNの代替実装ではない |
| `docs/ai-connection/` | File・JSON選択、設定、照会、実行・取消・解放、保存・復旧 | 上記公開APIと既存静的tool配置 |

既存ownerのnative APIへ管理metadataを追加しない。旧LoRA bridge、Text/VAE/Diffusionの実行source pin、採用済みP2のcodec pinは一括変更しない。workspace専用codecは固定 `498eb25f027666e3cc661a5851288e4aabf39f0a` のowner codecをbyte同一で参照し、既存採用pinと区別する。

## pipeline.mjs

```js
import {
  PIPELINE_PLAN_VERSION,
  compilePipeline,
  resolvePipelineWorkflowRequest,
} from './pipeline.mjs';

const plan = compilePipeline(profile, {
  externalInputs: {inputRef: {descriptor, tensor}},
  selections: {loraEnabled: false},
  registry, // 任意。必須schema拡張がある場合は明示登録する
});
```

`PIPELINE_PLAN_VERSION = 'works-standalone-pipeline/1'`。入力は既存 `works-module-contract/1.0-draft.1` の有限 `PipelineProfile`。一つの外部入力・step出力を、artifact refで次のstepへ結ぶ。単一入力と複数named入力を扱う。正本を複数producerへ上書きさせず、循環、未解決参照、外部・内部producer衝突、重複port、未知の必須schema、不正な明示条件をowner照会前に拒否する。未選択の外部入力は構造エラーと分けて `INPUT_UNCONFIRMED` とする。

追加field:

- `step.when = {selection, equals}`: JSON scalarによる明示選択。値未確認なら `SELECTION_UNCONFIRMED`。
- `step.bypass = {outputPortId: inputPortId}`: false側で、全出力を明示的に既存入力へ対応させる。数値変換は行わない。bypassなしのfalse側は `SKIPPED`。
- `profile.finalArtifactRefs`: 最終保存対象の順序。省略時は宣言順のsink出力。
- `profile.workflowShapeRequest`: 既存 `deriveWorkflowShapes` へそのまま渡す明示要求。
- `step.inputBindings[].workflowRequirementId`: 上記共有shape planのrequirementにportを対応させる。

戻り値には `profile`（トポロジカル順）、`topologicalOrder`、`layers`、`steps`、`externalBindings`、`finalArtifactRefs`、`workflowShapePlan` を含む。外部descriptorは所有copyを持ち、実payloadやFile grantを構造planの実行権限にしない。

```js
const bound = resolvePipelineWorkflowRequest({
  shapePlan: plan.workflowShapePlan,
  step: plan.steps[0],
  descriptor: {operationId, artifact}, // または artifacts: {portId: artifact}
});
```

`BOUND / BLOCKED / INPUT_UNCONFIRMED / NOT_REQUIRED` と理由を返す。これは幾何と明示descriptorの整合までであり、実行可否は引き続きownerの `querySupport` へ照会する。意味・model・decoder・normalizationを管理で推測しない。

共有shape正本は既存 `workflow-shapes.mjs` のみ。source実F、元resize、参照長辺848、16pixel単位のPython互換丸め、latent圧縮、patch・context順・token連結・source_idをここで導出する。target81frame・480×832／latent `[1,16,21,60,104]` を小診断に置き換えない。式に合うことだけでは能力を成立させない。

## management-host.mjs

```js
const host = createManagementHost({
  owners: {[moduleId]: normalOwnerFacade},
  managerSessionId, // 省略時は新規ID
});
await host.configure({profile, externalInputs, selections});
const query = await host.query();
const result = await host.execute({requestId, signal, onProgress});
```

owner facadeは既存normal protocolの `observe / querySupport / invoke / cancel / afterTerminal / release / recover / configure / dispose` を実装する。能力replyは、現在の実instance・configuration revision・resource generation・source・native buildと要求descriptorへ対応する必要がある。この確認は内部化し、利用者へsource/build/kernel証跡の添付を要求しない。

| method | 入出力・効果 |
| --- | --- |
| `configure({profile,externalInputs={},selections={}})` | 構造検証後に既存実行を失効・終端待ちし、新revisionへ設定。`loadPipeline` は同じ入口 |
| `query()` | 各stepの `status / reasons / support` を返す。構成変更中の古いreplyは拒否する |
| `execute({requestId?,signal?,onProgress?})` | `COMPLETED / PARTIAL / BLOCKED / CANCELLED`、exact target、step状態、artifacts、final refs、snapshotを返す |
| `cancel(host.inspect().activeTarget)` | exact targetだけを取り消し、元Promise・owner終端barrierまで待つ。旧targetは拒否する |
| `setSelections(selections)` | 進行中実行を失効させ、終端後に新revisionへ変更。LoRAなしは明示bypass可能 |
| `reconfigureOwner(moduleId, configuration)` | owner自身へ構成変更を依頼し、以前の結果・snapshot・能力を失効させる |
| `recover(moduleId)` | 終端後にownerへ停止・解放を再依頼。失敗資源を未確認のまま再利用しない |
| `restore({profile,selections,records,snapshotMetadata,unconfirmedExternalRefs?})` | 保存済みtensorをdurable入力として復旧。明示未確認refは復旧しない。File/session/能力tokenは復活しない |
| `subscribe(listener)` | `configured / started / step / progress / finished / settled / owner-configured / owner-recovered / restored / disposed` の状態通知。戻り値はunsubscribe |
| `inspect()` | 現revision、active target、各step、artifact metadata、owner observation、queue、回復要否、snapshot metadata |
| `exportState()` | payloadを除いた保存可能なstate。`schemaVersion='works-management-state/1'` |
| `exportArtifacts()` | `{ref: {descriptor,tensor,snapshot?,management?,...}}` の所有copy |
| `dispose()` | 実行終端を待ち、owner自身に停止・解放させる。失敗を成功扱いしない |

`externalInputs` は `{artifactRef: {descriptor, tensor, ...metadata}}`。tensorは明示shape・dtype・layout・意味と実TypedArray bytesが一致する必要がある。複数入力のport名、frame・時刻、複数producer、decoder・Tokenizer・mask・拡張は各ownerの宣言に従う。管理metadataをstrict native tensor/contextへ押し込まない。

構造上独立した要求は、他branchの入力未確認・失敗に巻き込んで削除しない。依存stepの未実行出力を数値なしで生成しないため、事前 `query()` は下流に `DEPENDENCY_BLOCKED` を返せる。これは契約不一致を意味せず、実行でproducerが出力した後にownerへ照会する。

通常入口は独立数値参照・誤差gate・過去PASS・詳細数値receipt・全中間E4保存を要求しない。診断経路の数値証拠を通常条件へ戻さない。`PARTIAL`、`STAGED`、参照ownerの成功で生成受付を解除しない。

## management-workspace.mjs

```js
const {bytes, manifest, receipt} = await buildManagementBundle({
  state: host.exportState(),
  artifacts: host.exportArtifacts(),
  fileRequirements: [{id:'model', role:'owner-asset', name, size, lastModified}],
  registry: owner.getRegistry(),
  settings,           // 任意。省略時は state.workspaceSettings
  kind: 'partial',    // または final。検証成功の宣言ではない
});
const saved = await readManagementBundle(bytes, {registry: owner.getRegistry()});
await host.restore(saved.restore);
```

`MANAGEMENT_WORKSPACE_VERSION = 'works-management-workspace/1'`。writeは実native tensor全体と、descriptor・evidence・trace・snapshot・extensions・binary attachmentsを既存E4 packageへ結合し、書込み済みbytesの読戻し検証後にZIPを返す。evidenceなしの通常実行へ数値PASSを捏造せず、未記録の理由を保存する。native codecで保持できない必須情報を暗黙変換して通さない。

reader入力は実 `Uint8Array` ZIP。戻り値は `state / artifacts / restore / fileRequirements / settings / kind / receipt / manifest / issues / status / sha256`。`restore` は `host.restore()` 用の `profile / selections / records / snapshotMetadata`。未知schema、改変、欠落snapshot、不正archive path、codec保存欠落などを既存packageの検査と合わせて拒否する。`maxUnpackedBytes` は明示展開容量上限で、既定1,073,741,824 bytes。総RAM予算の合格とは異なる。

保存tensorのbytesはdurable sourceであり、元のtensor File grantがなくても再利用できる。追加asset/model Fileはbytesを自動埋込せず、`id / ref / role / name / size / type / lastModified` 等のmetadataのみ保存する。読戻し時は必ず `reselectRequired:true / originalFileEmbedded:false` となり、実Fileを必要とするownerは再選択を求める。保存済みFile名や絶対pathを、生きたFile handleと扱わない。

## reference-owner.mjs

```js
const descriptor = createReferenceDescriptor('copy', tensor);
const named = createReferenceDescriptor('copy', {left, right}, {named:true});
const owner = await createReferenceOwner({
  ownerId: 'reference:control',
  configuration: {
    operations:['copy'], budgetBytes:536870912,
    requiredFiles:[], files:[], supportedTensor:{},
  },
  behavior: {mode:'success', releaseFailures:0},
});
```

`REFERENCE_REGISTRY` または `owner.getRegistry()` は参照tensor/valueのformat schema登録を返す。現在の能力や実File選択を授与するものではない。

`createReferenceDescriptor` は任意の明示shape・dtype・layout・意味を共通記述へ対応させる。shape-only照会はdata不要、実行にはその宣言と一致するTypedArrayを必要とする。`supportedTensor` で `shape / dtype / axes / meaning / normalization` の対応範囲を明示制限できる。既定dtypeは `float32 / float64 / int32 / uint32 / int16 / uint16 / int8 / uint8`、正の有限shape・safe integer要素数。workspace/native codecの保存可能域は、ownerのcopy対応域と別に検査する。

ownerが照会に返すのは `SUPPORTED / UNSUPPORTED / UNVERIFIED` とfield path・理由。操作非対応、shape/契約不一致、必須File不足、論理payload予算超過、未知schemaを個別に返す。実行は所有copyのみで、正規化やLoRAの適用・NN計算をしない。

開発用 `owner.controls` はnormal protocolから分ける:

- `setBehavior({mode, releaseFailures})`: `success / delay / fail / cancel-late`。
- `waitForInvocation() / continueInvocation(requestId?)`: 現在一件だけを手動継続。次のinvokeは再び待機する。
- `failNextRelease()`: 次の解放を一度失敗させる。
- `changeCapabilities(patch)`: capability revision/generationを変更し、過去の能力replyを失効させる。

`recover()` は旧owner instanceの停止・解放後にinstance/generationを更新する。管理は新ownerとして観測し直す。`inspect()` の `logicalOwnedRecords / logicalPayloadBytes` は参照ownerが現在保持するcopy/leaseの観測であり、Worker・model・WASM・process RAMや総peakではない。`budgetBytes` も論理入力payload allowanceのみ。実NN資源の成立へ転用しない。

## browser入口と保存操作

静的routeは `/ai-connection/`（repo sourceは `docs/ai-connection/`）。Pages公開は別工程。通常入口に数値参照・gate・詳細receipt入力欄はない。

1. 実WKTENSOR Fileと外部refを選び、必要ならpipeline JSON・追加Fileを選ぶ。
2. 設定適用、owner能力照会、実行。参照ownerと本物NNの区別を画面に表示する。
3. exact target取消、遅延継続、失敗後再実行、解放再試行、明示終了を操作する。
4. step単位の部分出力をbundle保存し、完了後は最終bundleを保存できる。各出力のnative WKT保存は、実codecでencode→decodeし、元tensorの全fieldとpayload bytesが保持された場合に限る。codecが未知optional metadata等を落とす場合は `NATIVE_SAVE_METADATA_LOSS` で拒否し、sidecarも含むbundle保存へ案内する。codec自身の規格や採用pinは変更しない。
5. bundle読戻し後、durable tensorは復旧する。必須の追加Fileがあれば再選択する。

既定pipelineは入力copy→選択付き通過→最終copy。LoRAという選択名は管理条件分岐の検証であり、LoRAの数値適用を表さない。非選択側は明示bypassし、LoRA固有の条件をbase経路へ強制しない。

browser再現と実測は [REPRODUCE-BROWSER.md](./REPRODUCE-BROWSER.md)、計画は [PLAN.md](./PLAN.md)。管理単体の検証結果・固定SHAは同ディレクトリの結果記録に分ける。全APIに共通し、`generationReady:false` と `load / predict / sample = NOT_READY` を維持する。
