# 新版LoRAの管理通常接続 API

2026-11-02 JST。管理基点は `92942230fbefe6ff727ba0b6f78f59591c46756e`、採用LoRA配布は `6d0c8df4cd4992f26745d2d26394f5e194d2567f`。[owner API正本](https://github.com/Kushyameln01/kushyameln-works/blob/6d0c8df4cd4992f26745d2d26394f5e194d2567f/docs/shared/inference/lora/STANDALONE.md)の実引数・戻り値・所有権へ対応した追加adapterである。実行sourceと配布SHA、検証結果は[RESULT.md](RESULT.md)に分けて記録する。

## 契約と担当境界

| 対象 | 今回の契約・役割 |
| --- | --- |
| 新LoRA SDK | `lora-standalone/1.0-draft.1`。File登録、正本logical registry、mapping、rank/alpha、復号、light→detail合成、不変baseからの再構築、owned package |
| package | `lora-owned-package/0.1-draft.1`。実source payloadとimmutable manifest。全dense modelではなく、同じbase/registry/kernel identityへ結ぶrecipe |
| single-side管理adapter | `works-lora-standalone-management/1`。request、revision、resource generation、queue、snapshot、opaque handle、取消・回復 |
| HIGH/LOW coordinator | `works-lora-management/1`。独立SDKの選択・順序と一括成否、失敗後の別回復取引 |
| 旧bridge | `lora-connection/2.0-draft.1`。既存v2/Q16/P4経路とpin・受入範囲を維持する。新SDKと同じ取引で二重にmapping/重み適用しない |

管理に数値演算やtarget mappingを複製しない。consumerによる宣言範囲の完成F32・finite/type/layout/full shape・package/range identity・currentness検査もownerの既存契約へ委任する。通常入力に独立参照、gate、事前PASS、学習base同一性の証明を要求しない。

`graphBinding:'UNBOUND'`、`trainingBaseVerified:false`と生成READYは別の意味である。論理targetへの適用成功を実Diffusion graph/operator/session適用へ変更しない。管理結果は常に `generationReady:false`、製品 `load/predict/sample=NOT_READY` を維持する。

## 固定sourceの採用

`docs/shared/ai-connection/adapters/lora-standalone/native.mjs` が、別配置のbyte同一owner closureとSOURCE.jsonをbootstrap内部で検査する。既存 `docs/shared/inference/lora/` や旧採用pinを一括置換しない。

管理bootstrapで使う実exportは `createLoraStandalone`、`createBerniniStandaloneRegistry`、`validateStandaloneRegistry`、`createStreamingKernel`、`createLoraProductCache`、`createAdoptedLoraKernel`、`inspectLoraStandaloneAdoption`、`verifyLoraStandaloneSources`、`LORA_STANDALONE_WASM_URL` など。`createAdoptedLoraKernel()` は取得・検査済み実WASM bytesでownerのkernelを作る。source/build/kernel証跡を通常の利用者へ添付させない。

このbootstrapは開発用owner hostの `createIndependentBaseProvider`、`createStandaloneReferenceHost` も公開する。これらは実モデルprovider/consumerではない。

## single-side adapter

```js
import {createLoraManagementSide} from
  './docs/shared/ai-connection/adapters/lora-standalone/adapter.mjs';

const high = await createLoraManagementSide({
  side: 'HIGH', registry, baseProvider, consumer, kernel, cache,
  managerSessionId, resourceGeneration, // 省略時は新規identity
});
await high.register({pairId:'light', file:lightFile, onProgress});
const applied = await high.apply({
  selections:[{pairId:'light',strength:1}],
  targets, // 任意。owner APIの元座標slice。省略は選択sourceの全patch
  requestId, signal,
});
```

`registry.side` は明示sideと一致しなければならない。baseProvider、consumer、kernel、cacheは外側ownerから明示注入し、SDK自身の所有物へ変更しない。片組ならそのFileだけ、base復帰ならFileなしでよい。HIGHとLOWへ同じSDK instanceを使い回さない。

`register / compose / prepare / stage / apply / restoreBase / save / openPackage / release` は、共通の任意field `requestId / signal / onProgress` を持つ。request IDの再利用は拒否する。管理fieldはadapterだけで処理し、厳密なnative引数へ追加しない。

| method | 管理側の引数・戻り値 |
| --- | --- |
| `register({pairId,file,...})` または `{pairId,source,...}` | native registerへそのまま委任。Fileとsourceは同時指定不可。実REGISTERED receiptにsource hash、bytes、patch数、SDK local revisionがある |
| `compose({selections,targets?,...})` | SDKのbranded planを内部保管し、`planHandle` とcopyしたplan metadataを返す |
| `prepare({planHandle,...})` | 同じinstanceのlive planからnative prepare。`preparedHandle` と実manifestを返す。PREPAREDはlazyであり全値計算済みではない |
| `stage({preparedHandle,...})` | 実SDK stageとconsumerのnormal検査・commitへ接続し、native CONSUMER_APPLIED receipt、共通snapshotを返す |
| `apply({selections,targets?,...})` | 管理内でnative compose→prepare→stage。現在の組合せを新しい不変base取引から構築する。強度変更・片組解除・再適用も同じ入口 |
| `restoreBase({...})` | 空compositionを新しく適用する。以前の丸め済み差分を管理で引き戻さない |
| `save({preparedHandle,writer,...})` | native SDKのstreaming saveを使い、実manifestを返す。manager JSONだけの保存ではない |
| `openPackage({manifest,sources,...})` | SDKが実payloadを検査し、新しい `preparedHandle` とmanifestを返す。sourcesはmanifestのfilenameから実File/Blobまたは独立retained sourceへのMap/record |
| `release({preparedHandle,...})` | このadapterのprepared capabilityをSDKで解放する。独立したconsumerのactive/read leaseを失効させない |
| `cancel(high.inspect().activeTarget)` | exact targetだけを取り消す。元操作Promiseとqueueのterminal/release barrierを待つ。古いrequest/revision/tokenは拒否する |
| `recover()` | SDKに残るrollback/release/source cleanupを再試行し、成功したterminal検査後に新resource generationへrebindする。dispose開始後の回復は新規操作受付ではなくdispose再試行の準備 |
| `query()` | provider model/side、consumer registryとcleanup状態を照合。`status / dispatchSupported / reasons` を返す。実graphや学習base適合の認証ではない |
| `capabilities()` | ownerの実capabilitiesと追加管理操作・固定sourceを返す。normalに独立expectedは不要 |
| `inspect()` / `subscribe(fn)` | active target、別々のrevision/epoch、登録source、opaque handle、queue、snapshot、回復要否を参照。subscribeはunsubscribeを返す |
| `dispose()` | queueとSDK操作の終端・残るSDK capabilityを終了する。consumer/base/kernel/cacheはcaller所有のまま |

操作成功の外側は `status:'EXECUTION_COMPLETED' / operation / side / target / managerRevision / terminal` を持つ。実register・stage/apply/restoreBaseのSDK receiptは `nativeReceipt`、compose/prepare/save/open/release等の管理状態摘要は `managementAcknowledgement` として区別する。管理摘要を新しいnative exportやnative receiptとは呼ばない。

`planHandle` と `preparedHandle` はopaqueな管理IDである。nativeのWeakMap brand、prepared.handle、lease、isValid関数は内部に保持し、structuredClone・JSON・snapshotから復元しない。applyが保持する現在のpreparedは保存用にも使え、後続applyでは旧automatic prepared capabilityを終端解放する。native leaseの寿命とは別である。

### revision・取消・snapshot

次のidentityを混同しない。

- 管理 `managerSessionId / managerRevision / requestId / activeToken / resourceGeneration`。
- SDK `sdkInstanceId / localRevision / transactionId` と保存payloadの `planId / packageHash / registryHash`。
- consumerのnative `epoch` と独立active/read lease。

実適用は既存 `evaluateEdge → createSnapshotManager` のnormal scopeと、既存 `createInvocationQueue` を使う。共通artifactはmetadataだけの `adapter-control` であり、FileやLoRAをtensor/画像mean/F/H/Wへ偽装しない。scopeに数値reference/gateを追加しない。snapshotは管理操作receiptの所有を表し、nativeモデル適用範囲を拡張しない。

SDKのcancel発行だけでは停止・再利用を認定しない。遅延した実処理の元Promiseとnative cleanupが終端するまでqueue slotを保持する。consumerはnative currentness/epochを公開直前に検査し、古いrollbackが後続publicationを上書きしない契約を守る。

disposeがcleanup失敗した場合は `disposalPending` を維持し、新規compose/apply/save等を受け付けない。SDK recover後にdisposeを再試行し、終了操作が未完のinstanceを再利用しない。

管理snapshot rollbackの `restored:true` は管理copied receiptのrollbackだけを意味する。native commit後、またはcommit試行の結果が未確定のまま管理publicationが不成立となった場合は `publicationDiverged` を記録し、古いnative candidateのrollbackを再実行したことにはしない。SDK recover後のfresh stage/apply/restoreBaseが成功するまで不整合を保持し、単なるrecover成功で過去の失敗適用を成功へ変更しない。

## HIGH/LOW coordinator

```js
const manager = createLoraManagement({sides:{HIGH:high,LOW:low}});
const batch = await manager.applyBatch({
  selectionsBySide:{
    HIGH:[{pairId:'light',strength:1}],
    LOW:[{pairId:'light',strength:1},{pairId:'detail',strength:-1}],
  },
  targetsBySide:{HIGH:highTargets,LOW:lowTargets},
  requestId, signal, onProgress,
});
```

`createLoraManagement` は `management.mjs` の管理追加APIである。`sides` は一sideだけでもよい。nativeのHIGH→LOW model scheduleではなく、要求したsideをHIGH、LOWの順に処理する。

| method | 効果 |
| --- | --- |
| `run({side,operation,args?,requestId?,signal?,onProgress?})` | single-side adapterへの通常受付。返却にはcoordinatorの別manager revisionとside結果がある |
| `applyBatch({selectionsBySide,targetsBySide?,...})` | 各sideの非空選択はapply、空選択はrestoreBase。全要求sideの実CONSUMER_APPLIEDが成立した場合だけ `BATCH_COMPLETED / accepted:true` |
| `recoverBatch({strategy:'restoreBase',...})` | 各要求sideでSDK recover後、fresh restoreBaseを新取引として実行。全部確認できた場合は別receiptの `BASE_RECOVERED` |
| `cancel(manager.inspect().activeTarget)` | active batch exact targetの取消と元終端待ち |
| `replaceSide({side,adapter})` | 旧SDK adapterを終了して新instanceへ交換。旧consumer/backing leaseはcallerが別途管理する |
| `inspect / subscribe / dispose` | side別結果と一括結果、回復状態、終端を管理する |

片側だけ成功しても `BATCH_FAILED` または `BATCH_CANCELLED` とし、全体成功を公開しない。一部native適用はresultsへ保持して明示する。失敗後は回復を要求し、`recoverBatch` が成功しても元 `lastBatch` の失敗statusを変更しない。回復の目的はfresh transactionでのbase復帰であり、旧candidateによる暗黙の二相atomic rollbackではない。

## streaming保存と新instanceでの復旧

```js
const storage = createLoraDirectoryStorage(selectedDirectoryHandle);
await high.save({preparedHandle,writer:storage.writer});
await storage.writeManagementState({
  schemaVersion:'my-management-state/1',side:'HIGH',selections,
  snapshot:high.inspect().snapshot,
});
// 別のSDK adapter、同じ宣言base/registry/kernel identity、明示したconsumer。
const {manifest,sources} = await storage.readPackage();
const opened = await freshHigh.openPackage({manifest,sources});
await freshHigh.stage({preparedHandle:opened.preparedHandle});
```

`createLoraDirectoryStorage(directoryHandle,{prefix?})` は `storage.mjs` の追加API。File System AccessまたはOPFS等の準拠directory handleを受け取る。

- `writer.writeSource(name,chunks)` はSDKのUint8Array streamを順次writableへ書き、完了までconsumeする。一括Blobへ集約しない。
- `writer.writeManifest(manifest)` は全source保存後の `manifest.json`。空の新保存先だけを使い、既存dataを上書きしない。stream失敗ではmanifestを公開せず、作成中のpartial fileをabort/removeする。既に保存したsourceだけが残る場合も完成packageと扱わない。
- `readPackage()` は実manifestと各source Fileを返す。hash・payload長・mapping・base/registry/kernel identityの最終検査はSDK openPackageの責任である。欠落sourceを空bytesで補わない。
- `writeManagementState / readManagementState` は別の `management.json`。上限1MiBのplain JSONで、File/Blob、関数、live capabilityを保存できない。このsidecarはnative manifestを変更せず、実行権限を付与しない。

実payloadは `source-N.safetensors`。保存するのは選択sourceのimmutable bytesとmanifestであり、元base値・consumer・kernel memory・cache・runtime handleは保存しない。JSONだけではLoRAを復元可能と扱わない。新SDKでのopenは保存planId/packageHashをpayload identityとして保持しつつ、新sdkInstanceId/localRevision/transactionIdと新prepared capabilityを取得する。

SDK disposalはcaller consumer/base/kernel/cacheを終了しない。consumerのactive/read capabilityを終端解放するまで必要なbase/kernelを保持し、最後にcaller側を終了する。prepared creatorのreleaseと、consumerが独立retainしたleaseのreleaseは別操作である。

## browserと開発検証の入力域

静的入口は `docs/ai-connection/lora/`。実File選択、side別登録・片組/二組/なし・強度変更、compose/prepare/stage、取消、回復、stream保存、fresh SDK読戻し、lease確認と終了を提供する。通常P4の拒否を一律解除しない。実provider/consumerを注入するprogrammatic APIと、開発provider/consumerを表示するbrowser経路を区別する。

`reference.mjs` の `createReferenceSide({side,wasmBytes?,behavior?})` は明示した開発wrapperである。LoRA ownerの `createBerniniStandaloneRegistry` からcanonical `diffusion_model.blocks.0.self_attn.q.weight` のfull `[5120,5120]` を採り、元座標row1の1行・全5120入力列を実Hikeで計算する。`targets` により `PARTIAL` とし、full shapeを小行列へ書き換えない。

baseはownerの独立dyadic参照providerで、HIGHのmodelHashは仮の`a`×64、LOWは`b`×64。実学習base同一性の証拠ではない。consumerはbyte同一のowner standalone reference hostで、完成F32と所有権を検査する。fault/barrier controlsはその外側だけに置く。`disposeBacking()` はconsumer終了後もSDK/prepared kernel leaseが残ればbase/kernel解放を拒否する。

`tools/ai-connection/lora-standalone-fixtures.mjs` は開発用File生成器。実4原本ではなく、F32 rank1のfull factor `[1,5120] / [5120,1]` を持つ各約41KBのローカルsafetensorsである。lightはlinear-down-up、detailはlinear-a-b。二side×二pairの検証に4Fileを使うが、通常利用者の受付条件は要求で選んだFileだけである。

ownerの全2,904 patch数値証拠は固定実装と規則を照合して元scopeで再利用し、今回の1行接続試験へ付け替えない。R1全値実行sourceは `4a3419c768e2b4b38b081314abe2cfaaeed6b14b`、R2制御sourceは `986b66b3dd54ef26d98f99a1db92a2933f3e31aa`。R1→R2のowned-package取消/終端修正と、同一loader/mapping/kernel/演算順を区別する。管理の既存689件・Chromium14件は別の回帰証拠であり、新SDK接続の成功件数に数え直さない。

実Diffusionへ残る要素は、canonical logical targetから実graph/operatorへの明示binding、真正なモデルbase provider、standalone契約を受ける実consumer、model/session上の実適用と生成結果の共同検証である。旧P4 consumerがそのまま新registryを受けるとは仮定しない。準拠開発consumerで成立した管理接続を、この不足待ちで保留しない。
