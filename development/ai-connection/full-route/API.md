# 実モジュール管理画面・運用controller API

このAPIは固定nativeの操作順・参照・状態・取消・保存を管理する。NN、数値変換、scheduler、LoRA mappingは各ownerの実APIを呼ぶ。全体接続実装の完了・実モデルの通し成功・生成READYを表すAPIではない。

## 画面と固定版

画面は`docs/ai-connection/modules/index.html`。既存`docs/ai-connection/index.html`から移動できる。元画面の参照ownerによる制御検証と、`lora/`の単体SDK開発用base/consumer接続はそれぞれ保持し、実Diffusion全モデル接続と区別する。

| module | 固定source | 通常入口 |
| --- | --- | --- |
| Text／VAE | `badff7a436b56207a084c4c770e01490899a576c`、`works-ai-1` | manifest＋相対pathのFile Map、通常のtext/IDsまたはnative tensor |
| Diffusion | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a`、`diffusion-models/0.1` | HIGH／LOW File pair、native tensor／conditioning／明示noise |
| mean変換utility | 同じ固定Diffusion。元の3小shapeの範囲 | `{tensor}`。raw mean正規化／復元のみ |
| LoRA単体SDK | `6d0c8df4cd4992f26745d2d26394f5e194d2567f` | 既存単体接続の元scopeを維持。full Diffusion consumer未公開 |

最新Text/VAEは`native/text-vae-badff7a/`へ相対treeを維持して別採用した。旧normal VAE／Rect接続の固定sourceを差し替えていない。実factory、client／Worker、ORT、Hike／WASM、native codecと必要なlicense／manifestを管理と同じcheckoutに置く。モデル重み／graph payloadはユーザーが選択するFileで、Gitへ保存しない。

## 管理画面からの操作

1. 保存tensorを参照名付きで登録する。Textはモデルmanifest・資材フォルダ・必要な元UMT5 File、VAEはmanifest・資材フォルダを選ぶ。manifestがフォルダ直下の`manifest.json`でない場合も、manifest Fileを別に指定できる。
2. moduleごとに設定を適用する。TextはpromptまたはID＋mask。VAEはencode／decodeとnative tensor参照。Diffusionは準備後に完全なHIGH／LOW File pairをloadする。
3. 単独操作または経路JSONを実行する。参照helperで前段出力を選ぶ。DiffusionのshapeRequest・noise・conditioning・contextはnative契約に従って指定し、管理は値やshapeを生成・改変しない。
4. 実行中は現在のtargetを取り消す。元Promiseとowner解放の終端後に再実行する。Diffusion Workerが取消で終了した場合は必ずpairをreloadする。
5. native tensorまたは現在の部分結果・設定をworkspace bundleへ保存する。bundle読戻しでtensorと設定は復旧するが、model File選択、session／実行権限は復旧しない。

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
| `configureModule(id,configuration)` | idは`text/vae/diffusion/mean`。設定変更は旧結果の採用を失効し、旧ownerの終了後に新ownerを作る。 |
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

固定Diffusion public Worker／samplerにはLoRA standaloneの完成重みを受ける公開consumerがない。`query({moduleId:'lora'})`は`LORA_MODEL_BINDING_UNAVAILABLE`を返し、`fullImplementationComplete:false`を維持する。実装済み操作と実数値受入は分け、`generationReady:false`を維持する。全体実装が揃うまで新しい試験LoRAは要求・受領せず、全体運用成功を報告しない。
