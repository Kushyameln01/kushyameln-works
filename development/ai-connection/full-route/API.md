# 実モジュール管理画面・運用controller API

このAPIは固定nativeの操作順・参照・状態・取消・保存を管理する。NN、数値変換、scheduler、LoRA mappingは各ownerの実APIを呼ぶ。実装状態と実モデル／全体運用受入は分ける。実装完了だけでは通し成功・生成READYを表さない。

## 画面と固定版

画面は`docs/ai-connection/modules/index.html`。既存`docs/ai-connection/index.html`から移動できる。元画面の参照ownerによる制御検証と、`lora/`の単体SDK開発用base/consumer接続はそれぞれ保持し、実Diffusion全モデル接続と区別する。

| module | 固定source | 通常入口 |
| --- | --- | --- |
| Text／VAE | `20f640a6e071b6c060a212e89b28f0c8965923f7`、`works-ai-1` | 新Text manifest／normLowering／現codec＋相対pathのFile Map、通常のtext/IDsまたはnative tensor |
| 全モデルDiffusion | `b6e166478a8e072c9ffd3ce562bfdb0c89634920`、`diffusion-models/0.1` | HIGH／LOW File pair、native tensor／conditioning／明示noise |
| 通常P4 | b6配布を独立entry/pinとして採用 | createBerniniP4Execution／postSelfAttention、正規Text marker、明示logical input allowance |
| mean変換utility | 同じ固定Diffusion。元の3小shapeの範囲 | `{tensor}`。raw mean正規化／復元のみ |
| LoRA単体SDK | `6d0c8df4cd4992f26745d2d26394f5e194d2567f` | native weight clientのbaseProvider／consumerへ接続。mapping／演算はSDK、model bindingはDiffusion owner |

最新Text/VAEは`native/text-vae-20f640a/`へ相対treeを維持して別採用した。旧normal VAE／Rect接続の固定sourceを差し替えていない。実factory、client／Worker、ORT、Hike／WASM、native codecと必要なlicense／manifestを管理と同じcheckoutに置く。モデル重み／graph payloadはユーザーが選択するFileで、Gitへ保存しない。

## 管理画面からの操作

1. 保存tensorを参照名付きで登録する。Textはモデルmanifest・資材フォルダ・必要な元UMT5 File、VAEはmanifest・資材フォルダを選ぶ。manifestがフォルダ直下の`manifest.json`でない場合も、manifest Fileを別に指定できる。
2. moduleごとに設定を適用する。TextはpromptまたはID＋mask。VAEはencode／decodeとnative tensor参照。Diffusionは準備後に完全なHIGH／LOW File pairをloadする。
3. 単独操作または経路JSONを実行する。参照helperで前段出力を選ぶ。DiffusionのshapeRequest・noise・conditioning・contextはnative契約に従って指定し、管理は値やshapeを生成・改変しない。
4. 実行中は現在のtargetを取り消す。元Promiseとowner解放の終端後に再実行する。Diffusion Workerが取消で終了した場合は必ずpairをreloadする。
5. 通常P4は全モデルと別File／side／入力を設定する。画面の16MiB初期allowanceはlogical input payloadだけの宣言で、モデルや総RAM予算ではない。
6. load後にsideごとの専用weight feedを開いてLoRA SDKへbindingする。File登録・合成・prepare/stage/apply・解除/base復帰・native package保存／読戻しはownerへ委任する。
7. native tensorまたは現在の部分結果・設定をworkspace bundleへ保存する。bundle読戻しでtensorと設定は復旧するが、model File選択、session／実行権限は復旧しない。

Text→Diffusionには`tensor`に含まれる全mask、model／Tokenizer、normalizationを渡す。VAE contextはraw posterior meanのままDiffusionへ渡せる。正規化はDiffusion ownerが行うため、3小shapeのmean utilityを全VAE接続の必須段にしない。Diffusion sample→VAE decodeは`wan21-raw-generated-sample:v1`と`latentContract`をそのまま渡し、追加復元やmeanへの改名をしない。

4-threadはCOI／SharedArrayBufferが実際に成立する場合だけ明示選択する。通常画面は自動fallbackしない。1-threadが選べることを、Pagesで実モデルのsampleが完走した証拠とは扱わない。

## controller

```js
import {createOperationalManagement}
  from './docs/shared/ai-connection/operational-management.mjs';
const manager = createOperationalManagement();
await manager.configureModule('text', {manifest, files}); // Map<relativePath,File>
const encoded = await manager.execute({
  moduleId: 'text', operation: 'encode', input: {text: prompt},
  outputRef: 'positive-text'
});
```

`createOperationalManagement()`は同期factory。nativeの生成・source照合は各moduleのconfigure時にlazyに行う。`services:{controlTestOnly:true,createModule}`は制御試験専用の明示seamで、`inspect().controlTestDouble`に記録する。通常画面は注入しない。

| method | 入力／結果 |
| --- | --- |
| `configureModule(id,configuration)` | idは`text/vae/diffusion/mean/p4/lora`。設定変更は旧結果の採用を失効し、旧ownerの終了後に新ownerを作る。 |
| `query({moduleId,operation,input})` | 現在の実owner能力／理由。未設定や未対応を実行可能としない。 |
| `execute({moduleId,operation,input,outputRef?})` | 通常のnative引数を参照解決後に実adapterへ渡す。native responseにmoduleId／outputRef／保管artifactを付加。 |
| `executeRoute(route)` | 既存`compilePipeline`で参照・循環・実行順を検査してから直列実行。成功時steps／finalRefs／保管artifacts／planを返す。 |
| `deriveWorkflow(request)` | 共有`deriveWorkflowShapes`への委任。数式を複製せず、算出できることだけでowner対応とはしない。 |
| `cancel(inspect().activeTarget)` | 厳密な現在targetを取消。childの実停止／元Promise終端／releaseを確認。曖昧な停止はquarantine。 |
| `recover(moduleId?)` | 終端・disposeを確認して対象ownerを新しく構成。旧native sessionを復元しない。 |
| `importTensor(ref,File)` | 最新native codecで実Fileを読む。 |
| `saveTensor(ref)` | native codecのBlob。全拡張を保存できない場合はworkspace保存を使う。 |
| `saveWorkspace({workspaceSettings?})` | 既存package writerを利用した`{bytes,manifest,receipt}`。実payload、native metadata、response sidecar、snapshot／traceとJSON設定を結ぶ。 |
| `restoreWorkspace(File)` | hash／package／native読戻しを検査。`{status:'RESTORED',artifactRefs,fileRequirements,workspaceSettings,modelReselectionRequired:true}`。 |
| `inspect()`／`subscribe(fn)` | module状態、revision、現在target、artifact一覧、queue、最後の経路・error。eventは`{kind,value,state}`。 |
| `dispose()` | 全ownerの終了。資源解放が失敗した場合は成功扱いにしない。 |

## 経路と参照

```js
await manager.executeRoute({
  steps: [
    {stepId:'text', moduleId:'text', operation:'encode',
      input:{text:prompt}, outputRef:'encoded-text'},
    {stepId:'sample', moduleId:'diffusion', operation:'sample',
      input:{shapeRequest,
        tensors: nativeTargetAndContextTemplates,
        noise: {$ref:'selected-noise',path:'tensor.data'},
        positive: {$ref:'encoded-text',path:'tensor'},
        negative: {$ref:'negative-text',path:'tensor'}},
      outputRef:'generated-sample'},
    {stepId:'decode', moduleId:'vae', operation:'decode',
      input:{$ref:'generated-sample',path:'tensor'}, outputRef:'rgb'}
  ],
  externalRefs:['selected-noise','negative-text', /* explicit target/context refs */],
  finalRefs:['rgb']
});
```

この例はAPIの接続形であり、実行済み入力／結果ではない。`shapeRequest`、target／context、noiseは選択した入力と共有shape正本／owner契約から与える。管理側の固定Profile一覧や合成noiseを通過条件にしない。

`{$ref:'id',path:'tensor'}`は保存済みnative tensor、`tensor.data`はnoiseなどの配列を参照する。path省略で保管response全体を参照する。参照先・フィールドが不明ならnativeを呼ぶ前に拒否する。循環・重複出力・未解決参照を既存compilerで拒否する。

VAE contextをDiffusionのslotへ結ぶ場合は、`{$ref:'encoded-source',path:'tensor',requirementId:'共有shape正本の識別子'}`を使う。独立copyへrequirementIdだけを付加し、shape／dtype／意味／normalization／frame配列／payloadを変更しない。`workflowShapeRequest`を経路へ付ければ共有正本のrequirementIdと照合する。これはslotの識別であり、LoRAのtarget mappingや数値変換ではない。

## 所有権・保存・受入の境界

入力はqueue待機前に独立copyし、SharedArrayBufferを含めcallerの後続変更から保護する。Fileは不変の選択実体として保持し、成功dispose後に参照を解放する。管理revision、adapter revision、native API job／inputRevision、モデルsession／epochを混同しない。callbackの例外や取消が後続subscriberへ古いprogressを流さない。

native codecが保持しない任意metadata、inputMetadata、execution等はworkspace sidecarに保持する。別tensorを含む拡張も個別のbytesとして残す。workspaceから元のFile権限・active target・capability・モデルsessionを復元しない。

最新b6には公開weight consumerがある。未構成・未load・未接続のLoRA要求には、その不足状態を理由として返し、旧P4 markerや旧『consumerなし』を流用しない。実装状態、今回sourceによる実NN受入、全体運用を別に記録し、generationReady:falseを維持する。資材保持環境の固定source実行・返却receiptは別工程である。


## 新manifest／normLowering／codecの採用組

Text既定値は採用版source-ordered-fp32 manifest（696,123B、SHA-256420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405）。UIは採用版と選択compatible manifestを明示区別する。normLoweringのsource asset／実行graph／bounded patch／statusはnative loaderが検証・実行し、管理でnorm計算やgraph書換えを再実装しない。通常encodeのgraphBindingsはnative capabilityと照合し、tensor外のresponse／workspaceへ保持する。

current codecはowner createCurrentNativeCodecをそのまま利用する。normalization marker、mask、frameProcessing、context、producer群とdecoderのlatentContractを保存・読戻しまで保持する。Textの内部lowering recordをtensor markerへ偽装しない。新codec sourceは20fで固定されているがtensor.mjsのbytesは旧badffと同一であり、異なるcodec計算を新実装したとは扱わない。

## 専用weight feedとLoRA資源binding

```js
await manager.configureModule('diffusion', {});
await manager.execute({moduleId:'diffusion',operation:'load',
  input:{files:{HIGH,LOW},resource:{wasmThreads:1}}});
const feed = await manager.openWeightFeed({side:'HIGH'});
// clone可能なmetadataのみ。MessagePort／clientはここへ含まれない。
const client = manager.getWeightFeedClient(feed.feedId); // runtime専用、保存不可
await manager.configureModule('lora',{feedIds:{HIGH:feed.feedId}});
// 登録・合成・apply等はmoduleId:'lora'の通常操作へ。
await manager.closeWeightFeed(feed.feedId);
// 解放失敗時は同じcleanup-only IDを保持する。
await manager.retryCloseWeightFeed(feed.feedId);
```

普通のexecute／routeへopenWeightFeedを書いても拒否する。専用methodだけがportを受領してnative createDiffusionWeightClientへ渡す。client accessorはmanaged currentnessを検査するfacadeで、保持済みfacadeも取消・close・reload時に即座に失効する。native clientと失敗したpackage leaseは再試行まで専用registryへ保持し、snapshot／JSON／workspaceへ入れない。端末cleanup用rollback／releaseCandidateは失効後もnativeの規約で試行できる。

LoRA登録／合成／prepare／stage／apply／restoreBase／openPackage／release／recoverは既存6d SDKとcoordinatorへ委任する。logical registryのgraphBinding:UNBOUNDは書換えず、actual feed binding／native descriptor／consumer取引は別のmodelBindingとして示す。consumer使用中package leaseとkernelをcreator releaseだけで失効させない。

saveLoraPackage({side,preparedHandle,directoryHandle})は専用writer入口。実payloadとnative manifestをstream保存し、巨大Blobへ集約しない。OPFSまたは選択package FileからopenPackageした後は新しいSDK lease／取引として扱う。workspace JSONだけではLoRA payloadを復旧できず、復旧後はモデルreload・新feed・SDK再構成・native package読込が必要。

unloadのモデル解放とhost側package lease解放も別欄にする。weightFeedCleanupRequired、pendingWeightFeedIds、hostWeightFeedResourcesReleasedで未解放を示し、失敗IDを保持する。解放再試行が終わるまでload／predict／sample／新feedの再利用を止める。

旧R17 workspaceの既知codec識別（works:operational-wktensor／badff7a/WKTSR001／固定badff tensor source）は読込registryにだけ明示登録する。旧実体と新verified codecが同じSHA-2567a15d721b1bab60cdade8723fd1c4d543a142d236cf2e59b63f1ba33ba14ed78であることを確認する。writerはcurrent識別を使い、未知codec ID／版／sourceを推測で読み替えない。

モデル取消では元Promise終端とWorker終了を確認し、旧feed／SDK権限を失効させる。spontaneous Worker故障でもinspectionは例外を出さず、consumerEpochUnavailable／BLOCKEDを表示してcleanupを継続する。古いside／generationの解放失敗IDは、後続のload／同side新feedで消さず再試行可能に保つ。
