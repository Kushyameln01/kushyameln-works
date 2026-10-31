# LoRA connection v2 — A0/L1とE0/E1

Native contract: `lora-connection/2.0-draft.1`。既存の [SDK v1](README.md) と別の入口を追加する契約である。総合接続仕様書 `1.1-draft.1`（Page `page_65b303c9bc708191a7e48c78b51c35a7`、取得時sequence 1）のLoRA担当範囲を扱う。

native SDK v2と既存SDK v1の契約は維持している。A0/L1の検証範囲はfixture、Hike重み計算、test consumerであり、その結果を実base共同試験へ読み替えない。E0ではDiffusionの実registry・provider・sink・consumerをGitHubから取得して照合し、E1用の外側adapterを追加した。

HIGH/LOW双方でlight/detailの実base・実LoRA・同じconsumerによるPARTIAL共同試験を確認した。確認範囲は固定Q射影であり、全target・実model全session・生成への寄与を証明しない。LOWを含むside別の進捗、使用版、事前gate、全出力、所有権・取消・復帰の証拠は [JOINT-LORA-RESULT.md](../../../../development/ai-connection/JOINT-LORA-RESULT.md) を参照する。本API追補だけで未完了caseを合格へ変更しない。

取得・実行依存・検証command・必要生成物と再build手順は [REPRODUCE.md](../../../../development/lora/REPRODUCE.md) にまとめている。作業branchは `feat/lora-hike`。

## 正本と取得先

| 正本 | repository内のpath | 用途 |
| --- | --- | --- |
| v2契約 | `development/lora/contracts/connection-contract-v2.json` | loader、registry、plan、consumer、寿命、互換境界 |
| 以前のv0.1案 | `development/lora/contracts/connection-contract-v0.1.json` | 未合意だった設計案をbyte同一で保持 |
| 原本台帳 | `development/lora/contracts/original-inventory.json` | 4原本の全体hash、rank/alpha/diff/biasの既存棚卸し |
| 論理対応とbinding要件 | `development/lora/contracts/registry-correspondence-v2.json` | cached header対応と実registryに必要な情報 |
| binding例 | `development/lora/contracts/registry-binding-examples-v2.json` | `DIAGNOSTIC_FIXTURE_NOT_REAL_GRAPH`と明記した例 |
| A0/L1 descriptor | `development/lora/contracts/module-descriptor-v2.json` | native APIを変更しない外部記述。最終source identityは引継ぎreceiptで確定 |
| 実装と結果 | `development/lora/A0_L1_RESULT.md` | 完全commit／archive receipt、試験scope、未達事項 |
| E0契約照合 | `development/ai-connection/CONTRACT-MAPPING.md` | 実Diffusionとの型・単位・hash・scope・寿命の対応 |
| E1外側adapter契約 | `development/ai-connection/lora-diffusion-diagnostic-contract.json` | 実binding・side対応・寿命・管理への状態。native契約とは別版 |
| E1共同試験 | `development/ai-connection/JOINT-LORA-RESULT.md` | 実行side、固定版、比較条件、全出力、残る範囲 |

完成したsourceの完全commitと、取得可能なarchive/hashは引継ぎreceiptで固定する。作業端末内の絶対pathだけを取得先にはしない。モデル本体をarchiveへ含めない。

既存v0.1案は18,858 bytes、SHA-256 `f00b469cb32dd620a292007178feb10b135ddb4022a934df38876b754ee579e6`。原本台帳は495,806 bytes、SHA-256 `97229d6ea17738dc983fa898a38e771a784aeafff9513734c5af0ba0250c23b3`。これらは既存ファイルをそのまま保存した値で、4原本を再hash・再棚卸ししたという意味ではない。新たにDiffusionの`loadLora`を実行する際の必須全file hashは省略しない。

## SDK v1との差

| 項目 | SDK v1 | v2 |
| --- | --- | --- |
| 入口 | `sdk.mjs`、numeric `apiVersion:1` | `sdk-v2.mjs`、文字列contractVersion |
| target | `graphInitializer`必須 | `binding.kind/name`を明示 |
| binding | 実initializerの対応を前提とする | runtime-input、initializer、hike-parameterを区別 |
| loader規約 | 現コードのalpha省略倍率1 | 明示policy IDと対応variantで規約を固定 |
| plan | 原本内全patchの対応が必須 | FULLと独立したPARTIAL診断 |
| 検証 | `validate(...) === true` | plan/hash/coverage/scope付きの構造化結果 |
| 適用状態 | v1 transaction完了 | PREPARED、STAGED、CONSUMER_APPLIEDを明示 |
| snapshot | consumerと管理側の責任 | v2でも管理側の責任。SDKは公開しない |
| 寿命 | consumerの独立bytes所有を要求 | 明示copy receiptまたはlease、復帰未完の保持 |

既存v1の入口とboolean検証の意味は維持する。版付きadapterは真のinitializerとFULLに限定する。runtime入力名を`graphInitializer`へ詰めたり、boolean trueからPARTIALの検証証拠を作ったりしない。adapterで保持する`legacy-boolean`の証拠水準を実モデル検証へ昇格させない。

`adaptV1Registry(registry,{side,executionProfileId,loaderPolicyId})`、`createV1SinkAdapter(sink,{registry: nativeV1Registry})`、`adaptV1Consumer(target,{side,executionProfileId,loaderPolicyId,validationScope:'full-adapter',ownership})`を明示して使う。sinkとconsumerは同じnative registryを参照し、fullShapeとlocal revisionをv1のshapeとrevisionへ変換する。v1のregistry／adapter-set／bundle hashと元v2の識別は別に保持する。candidateはadapter所有のopaque handleで、元のnative識別はrollbackでも変更しない。独立copy／leaseはconsumerの明示契約であり、adapterが任意session内部の所有bytesを検査できるという意味ではない。

v2のmetadata identityはnative v2固有の再帰key順整列JSON／UTF-8／SHA-256で、v1は従来のJSON.stringify方式を維持する。このnative identityを管理snapshotのJCS適合・相互hash合意として流用しない。

## 固定loaderと対応variant

Policy IDは `comfy-lora-b5a4321-linear-diff-v1`。参照はComfyUI commit `b5a432157de6b8884f81104cd02926adf4d597e4` の次の箇所である。

- `comfy/weight_adapter/lora.py:160`以降：down/up、A/Bの対応。
- 同`:248`以降：alphaありはalpha/rank、省略時は1。
- 同`:267`以降：UP×DOWNの積と元weight shapeへの対応。
- `comfy/lora.py:45`以降：scalar alpha読取。
- 同`:76`、`:83`以降：`.diff`、`.diff_b`読取。
- 同`:537`以降：加算差分へのstrength適用。

| variant | 原本tensor | rank／倍率 | 対象 |
| --- | --- | --- | --- |
| `linear-down-up` | `.lora_down.weight`／`.lora_up.weight` | DOWN `[rank,in]`、UP `[out,rank]`。明示alphaはstrength×alpha/rank | 2D Linear weight |
| `linear-a-b` | `.lora_A.weight`／`.lora_B.weight` | AがDOWN、BがUP。同じ倍率規約 | 2D Linear weight |
| `additive-diff` | `.diff` | strength×delta。rank/alphaを掛けない | 対応する1D/2D weight |
| `additive-diff-b` | `.diff_b` | strength×delta。rank/alphaを掛けない | 対応するbias |

alpha省略時のscale=1は、このpolicyを明示した標準Linearの範囲に限定する。alpha=0や負数は省略ではなく実値である。rankはfactor shapeから検査し、不明倍率をmetadata・ファイル名・shapeの推測で補わない。sourceはBF16/F16/F32、LoRA boundaryのbaseと出力はF32 row-majorである。

転置・融合・Conv低rank・DoRA/LoHa/LoKr/mid/reshape・量子化されたbaseの直接入力は未対応で拒否する。元loader全体の対応形式を、このsubsetの対応済み一覧へ流用しない。FP8等の復号はDiffusionが所有する明示profileを通して行い、LoRAへowned F32を渡す。

ここでのbias対応は加算差分`.diff_b`であり、一般のbias学習方式を受理する宣言ではない。強度は呼出し側の明示入力とし、旧workflowのHIGH=3/LOW=1をlight/detailの既定値へ流用しない。

## bindingとregistry

```javascript
{
  contractVersion: 'lora-connection/2.0-draft.1',
  modelHash, graphHash, registryVersion,
  side: 'HIGH', executionProfileId, loaderPolicyId,
  targets: [{
    key: 'diffusion_model.blocks.0.self_attn.q.weight',
    weightId, module: 'diffusion_models',
    shape: [5120, 5120], // 元のfull shape
    dtype: 'F32', layout: 'row-major', parameterRole: 'weight',
    binding: {kind: 'runtime-input', name: actualWeightInputName},
    transform: {kind: 'identity'}
  }]
}
```

`runtime-input`はORT等への実weight feed、`initializer`は実graph/packageのinitializer、`hike-parameter`はHikeのbias等の実引数に対応する。bindingのnameだけでは実session適用の証拠にならない。対象graph/build、operatorの順序・layout、packageまたはfeedの生成、copy/leaseまでconsumerの正本で確認する。

現v2のtransformはidentityのみ。registry entryへtranspose、quantization、任意sliceを付けて通さない。LoRA診断の明示row sliceは下記の別引数で指定する。binding例の繰返しa/b hashや名前はfixture専用で、実base/graphの不明値を埋めるためには使わない。

## FULLとPARTIAL

```javascript
const plan = await sdk.plan({
  selection: {pairId: 'light', noise: 'high'},
  strength, registry, loaderPolicyId,
  diagnostic: {targets: [
    {key: qWeightKey, slice: {startRow: 0, rowCount: 16}},
    {key: qBiasKey,   slice: {startRow: 0, rowCount: 16}}
  ]}
});
```

診断は連続した出力rowと全入力columnに限定する。`fullShape:[5120,5120]`を保持し、出力tile `[16,5120]`へ元shapeを書き換えない。baseProviderのoffset/countはfull baseに対する要素単位で、byte単位ではない。weight row rのoffsetはr×5120、bias index rのoffsetはrである。

PARTIALは`coverage:'PARTIAL'`、`completeAdapter:false`を持つ。含むpatch、対象外target、選択したtarget内の対象外row、元原本hashを保持する。全原本tensorを先に分類・構造検査するため、選択外の未知tensorも拒否する。FULLを要求する旧planへ部分registryを渡して、欠落を無視する方式にはしない。

Berniniの単一Q射影をrow `[0,16)` で診断する場合の対応は次のとおり。この表はscopeの定義であり、実行済みsideと数値比較の証拠は共同試験結果で別に記録する。

| 組 | 含むpatch | 除外 |
| --- | --- | --- |
| light各side | `blocks.0.self_attn.q`のdown/up、alpha128、同Qの`.diff_b[0:16]` | 他404低rank、全201`.diff`、他445`.diff_b`。選択Q内のrow/index `[16,5120)`も除外 |
| detail各side | 同QのA/B、rank64、固定policyによるalpha省略規約 | 他399低rank。選択Q内のrow `[16,5120)`も除外 |

lightのQ weight自体には`.diff`は存在しない。biasを診断に含める場合は`.diff_b`を明示選択する。weightだけを選ぶ診断でbiasを計算済みと扱わない。原本台帳の全体hash一致、論理target名/shape一致、実graph binding、数値一致、生成結果への寄与は別々の判定である。

`tools/lora/check-inventory-plan-v2.mjs`は保存済みinventoryと既存の論理target shapeからschema fixtureを再構成する。`development/lora/contracts/inventory-plan-fixture-v2.json`のscopeは`RECONSTRUCTED_INVENTORY_SCHEMA_FIXTURE_NOT_RAW_HEADER_NOT_REAL_BASE_OR_GRAPH`であり、実headerの再読取、Hike計算、実base比較ではない。

## consumerと状態

`createLoraV2({folder,sourceFactory,kernel})`は`inspect / plan / prepare / stage / cancel / release / recover / dispose`を持つ。`sourceFactory(selection)`を使う場合はsize/read/hashを返す。`plan`は原本hashを必須にし、呼出し時に捕捉した選択・原本・registryと結び付ける。

`prepare`は不変baseから再計算し、Hikeの実低rank積／diff加算を行い、sinkへowned blockを渡す。manifestとhandleの返却状態はPREPAREDである。強度変更は不変baseから再構築し、適用済み重みへ再加算したり差分を引き戻したりしない。

`stage(prepared, consumer, {signal,isCurrent})`のv2検証結果は次を持つ。

```javascript
{
  contractVersion: 'lora-connection/2.0-draft.1', valid: true,
  coverage: 'PARTIAL', scope: 'diagnostic-projection',
  planId, registryHash, sourceSha256
}
```

FULLのscopeは`full-adapter`。検証結果がpreparedの識別・coverage・scopeと一致しなければcommitしない。commit receiptは同じ版とplanId、`state:'STAGED'|'CONSUMER_APPLIED'`、所有権を持つ。STAGEDはconsumerへの実適用完了ではない。CONSUMER_APPLIEDでも検証scopeを維持し、PARTIALから全adapterや生成へ昇格させない。SDK結果の`generationReady`はfalseで、SNAPSHOT_PUBLISHEDは管理側から別に通知する状態である。

既存v1パネルへv2/staging-only adapterをそのまま接続しない。原本登録、検査、PREPARED、STAGED、consumer適用、管理snapshot公開をそれぞれの証拠に対応させる。Hike計算だけで「適用済み」と表示しない。

## Diffusion PARTIAL診断用の外側adapter

`diffusion-diagnostic-adapter.mjs` の版は `lora-diffusion-diagnostic-adapter/0.1`。native SDK v2を書き換えず、Diffusionの公開診断契約 `bernini-diagnostic-registry/0.1` と接続する。対象は `bernini-q16x5120-f32-wasm-v1` の16行Q射影であり、任意のモデル・全graphを受理する汎用consumerではない。peer原本は `f522d9aeff313558c4ef83022a340af9a4c21391`、E0受領版は `438972f30242e0a3bc66edb8591f38eaa0fcd384`。この2版の診断base/provider/consumerコードは同一である。peer公開契約は [DIAGNOSTIC_API.md](https://github.com/Kushyameln01/kushyameln-works/blob/438972f30242e0a3bc66edb8591f38eaa0fcd384/docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md) を参照する。

```javascript
import {createDiffusionDiagnosticAdapter}
  from './diffusion-diagnostic-adapter.mjs';

const adapter = createDiffusionDiagnosticAdapter({
  consumer: nativeConsumer,
  baseProvider: nativeBase.baseProvider,
  isOwnerCurrent: applicationOwnerIsCurrent
});
```

`consumer`と`baseProvider`は呼出し側が取得・所有したDiffusion公開APIの実objectを渡す。adapterは管理内部型、peer private実装、別executorをimportせず、baseのFP8復号やLoRA低rank積を代行しない。呼出し側がnative consumer・ORT/Hike stage・base providerの資源を所有する。

| API | 入出力と責任 |
| --- | --- |
| `adapter.registry` | SDK v2用の不変full-shape registry。weightはruntime-input `weight`、biasはhike-parameter `bias` |
| `adapter.baseProvider.readBlock(id,offset,count,context)` | SDKのfull tensor内element座標を、nativeのselected-slice内element座標へ範囲検査して変換。native identityとsignalを渡す |
| `adapter.createSink(plan)` | 固定plan・原本・side・scopeに結ぶsink。fullShape／full offsetをnative selected shape／offsetへ明示変換し、manifest・checksum・実write被覆を検査 |
| `adapter.targetForPlan(plan,{x,expected,tolerance})` | `x[5120]`、独立参照`expected[16]`、明示toleranceを捕捉し、SDK v2のprepareLoad／validate／commit／rollbackへ接続 |
| `adapter.finalize(plan)` | transaction終端を呼出し側が確認した後、native candidateのrollback履歴を解放。active feedの独立bytesは保持 |
| `adapter.restoreBase({x,expected,tolerance,signal,isCurrent})` | native公開prepareBase→独立参照validate→commitで選択sliceを不変baseへ戻す。失敗時は同candidateのcleanupを行う |
| `adapter.run({x,signal})` | 現ownerを確認してnative consumerを実行し、出力・native evidenceを返す。返却前にもownerを確認 |
| `await adapter.describeBinding()` | native／connectionのdescriptorと別々のregistry hash、座標単位、detail bias pass-throughの記録を返す |

native registryの`shape:[16,5120]`と`fullShape:[5120,5120]`は別々に保持する。SDK registryのshapeは元full shape、選択領域はplanのdiagnosticで指定する。SDK境界のidentity transformは、LoRAへ渡すF32値が元tensorの座標で表されるという意味であり、元FP8 storageに量子化・row-sliceがないという宣言ではない。nativeのFP8 profile・scale・row-slice・source mappingはadapterの対応記録に保持する。転置や入力列の省略は追加しない。

native registryHashとSDK connection registryHashは別descriptorのdigestである。provider/contextへの対応を検査してnative側のhashを渡し、元SDK側のhashも保持する。native packageHash、SDK bundleHash、管理snapshotHashも別の識別であり、同じ値へ付け替えない。native scope `PARTIAL`とSDK scope `diagnostic-projection`は版付きadapterで対応付け、booleanやFULLへ縮約しない。

lightは明示したQ weightとQ bias patchの両方が必要で、欠けたbiasを自動補完しない。detailにはLoRA bias patchがないため、sink.finish時に不変baseのbias16値をpass-throughしてnative feedを完成する。この経路は`immutable-base-pass-through`としてLoRA patchとは別に記録し、ゼロ補完や架空bias適用にしない。

native validateは同じORT/Hike stageを実行し、独立expected全16値と事前toleranceを検査する。adapterはその構造化receiptを`validation.evidence.nativeReceipt`に保持し、SDKのplanId・sourceSha256・registryHash・coverage・scopeへ結ぶ。native feedのcommit成功後だけ、SDKへ`CONSUMER_APPLIED`と独立copyの所有receiptを返す。この状態は実診断feedへの反映を表し、全model session適用・snapshot公開・生成可否の判定ではない。`generationReady:false`とPARTIALを維持する。

### ownerの現在性と取消・cleanup

factoryの`isOwnerCurrent`は必須で、既定値はない。これはアプリケーション／resourceの所有者が現在も有効かを検査するcallbackで、SDKのAbortSignalやローカルgenerationとは別に供給する。管理側は自分のowner・session・revisionの対応に基づいて実装し、SDK local revisionをmanagerRevisionへ流用しない。単独で排他的に所有する診断だけが、所有条件を明示したうえで`() => true`を使える。

prepare・validate・commitは、SDKのsignal／invocation現在性と、owner現在性の両方を検査する。取消でSDK context.isCurrentがfalseになっても、同じownerのcleanup権限まで消したことにはしない。rollbackにはowner現在性を別に渡し、native側のcandidate／epoch照合を維持する。したがってcommit直後・SDK返却前の取消では、同じownerかつ同じactive epochなら旧feedへ復帰できる。ownerが交代した場合や新しいnative epochが既にactiveの場合、古いcleanupはそれを上書きしない。SDK context.isCurrentをfactoryのowner callbackとして兼用しない。

transactionの識別、signalとcallback参照、独立参照の配列はawait前に捕捉する。取消はbounded Hike／ORT呼出し後の協調停止であり、要求の送信だけを停止終端にしない。detailのfinish時bias pass-throughは16要素のbounded処理で、別Invocationのsignalを借用しない。SDKはfinish後にも取消を検査して必要なcleanupを行う。

### copyとcandidate履歴、base復帰

このnative consumerの経路ではprepareLoadが独立feed copyを作り、active feedが必要bytesを保持する。preparedを解放した後もそのcopyで実行できることを検査する。generic SDK v2のlease対応を、このadapterがnative leaseも実装するという意味にしない。

`sdk.stage`の成功・失敗終端と必要なrollback／recoverが完了するまで、`finalize(plan)`でcandidate履歴を捨てない。使用中・復帰未完のpreparedを解放せず、SDK返却直前の取消にもrollback履歴を残す。呼出し側のteardownは、進行処理の終端後にnative consumer、stage、base providerの各ownerが行う。

native SDK v2には引き続きdetach/resetメソッドを追加していない。`restoreBase`は外側adapterからnativeの不変base候補を選択sliceで検証・commitする診断操作であり、両side共通snapshotのbase切替ではない。強度変更と再適用も常に不変baseから再構築し、適用済み重みへ再加算しない。PARTIAL/runtime-inputをv1 initializer・FULL adapterへ渡して解除・適用を通さない。

## 資源の寿命と取消

- source Fileはcallerが選択した不変参照。原本のbytesを書き換えない。
- baseProviderは不変baseからowned F32 blockを返す。sinkはwriteBlockの応答前にcopy/保存を完了する。
- preparedはconsumer処理中にreleaseできない。consumerの独立copy receipt、または必要bytesの寿命を保持する有効leaseを要求する。
- leaseが有効な間はpreparedの必要bytesをreleaseしない。consumerがlease利用を終えてからreleaseを再試行する。
- rollback失敗時はRECOVERY_REQUIREDとしてpreparedを保持する。`recover(prepared)`で復帰を再試行し、成功するまで通常releaseへ進めない。
- begin途中等でsink.abortが失敗した場合もcleanupを保持する。`recover()`またはdisposeで再試行し、成功前の新transactionを拒否する。
- release失敗は所有権を保持して再試行できるようにする。disposeは進行中の協調停止と必要な解放を待つ。
- 取消はbounded Hike呼出し終了後のblock/async境界で行う。Promiseの破棄だけを計算停止・資源解放と呼ばない。

consumerはcommitの切替直前にもrevision/abort/currentを検査し、古いrollbackが新activeを上書きしないようにする。LoRA単体の検査は管理側の比較・公開処理を代行しない。別Memoryの同じpointer値を共有handleとして返さない。

## 管理・Diffusionへ渡す情報

管理にはsdkInstanceId、side、原本hash、pairId、local input/application revision、planId、registryHash、coverage/scope、prepared/bundle identity、状態、所有者・lease、取消／復帰の終端を渡す。managerRevisionやDiffusion inputRevisionと数値を同一視せず、対応表を保持する。

Bernini参照profileではHIGH/LOWに別SDK instanceを使い、light/detailは一組の選択・切替として扱う。共通Module/Artifact規格へHIGH/LOWやlight/detailを全module共通enumとして強制しない。moduleはnative APIで単独利用でき、管理側のdescriptor/queue/snapshotをimportしない。

E0で取得・照合したDiffusionの完全source commit/build、実binding registry、不変F32 providerとFP8復号profile、実runtime-feed sink、scope付きconsumer検証、権限・現在性・copy条件を共同試験の使用版へ固定する。比較条件・実行済みside・全出力・残る不整合は共同試験結果に記録する。E1のPARTIAL成功を、E9の全target・実model全session・生成への寄与へ昇格させない。全target受入ではlight/detailを別々に扱い、二組同時合成や公開は別工程とする。

## 既存の非正方形meanとの共同受入

Diffusion/VAEの `wan21-raw-f32-1x16x32` はfloat32 NCTHW `[1,16,1,2,4]`、128値のraw-posterior-meanである。LoRAの重み入出力とは別の既存APIで、native requestsは `input:{tensor}` を維持する。旧 `[1,16,2,2,2]` 128値やF1 64値とshapeを交換しない。mean変換をLoRAのloader/patch演算へ追加する変更はない。

新Diffusion `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` の明示 `createBerniniBlockProvider` を既存の外側adapterへ注入し、実4原本のPARTIAL診断とmean/G1C確認を同じbrowserで順次検証した。raw断片の本人受領、厳密profile、全出力、所有権・取消、再現手順は [受領側共同検証](../../../../development/ai-connection/nonrect-mean/RESULT.md) と [機械可読契約](../../../../development/ai-connection/nonrect-mean/CONNECTION.json) を参照する。これは全モデルsessionや管理snapshotの受入ではなく、native v2/v1のAPI・coverageは維持する。
