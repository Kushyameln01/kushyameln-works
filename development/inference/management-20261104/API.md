# 管理から使うText／VAEの部分接続API

実装は `docs/shared/inference/management-adapter.mjs`。Node／filesystemに依存しないES moduleであり、既存 `works-ai-1` の単独APIを変更しない。実管理のadapter・queue・capture・workspace factoryをサービス起動時に注入する。通常要求へ独立参照・gate・receipt・固定prompt hashを渡す必要はない。

管理sourceは `e1661e561dfb1a4f20544ff48bc375175b5981d1`、Diffusion capture sourceは `ffeeeedb6b57d182a977c3ac02c042ce235fc87a`。ソース取得の正本は `tools/inference/management-connection/source.mjs`。固定Git objectから相対importのclosureを取得し、path・bytes・SHA-256・Git blob SHAを `ACQUISITION.json` へ記録する。モデル・graphの再exportや取得確認用の再推論は行わない。

## 初期化と通常実行

```js
import * as native from './api.mjs';
import {
  createManagedInferenceBridge, createCurrentNativeCodec,
  captureRestoredConditioning
} from './management-adapter.mjs';

// manager contains the actual acquired createTextVaeAdapter,
// createInvocationQueue, capture/store and management-workspace exports.
const api = native.createInferenceAPI({workerFactory});
const bridge = createManagedInferenceBridge({
  manager, nativeAPI: api, nativeModule: native, sourceRef,
  codec: createCurrentNativeCodec(native, sourceRef)
});
await bridge.configure('text_encoder', {manifest: textManifest, files: textFiles});
await bridge.configure('vae', {manifest: vaeManifest, files: vaeFiles});

const plain = await bridge.execute({
  module: 'text_encoder', operation: 'encode', input: {text: 'Hello world'}
});
const ids = await bridge.execute({
  module: 'text_encoder', operation: 'encode',
  input: {tokenIds, attentionMask}
});
const support = bridge.querySupport('vae', 'decode', rawInputDescriptor);
if (!support.support.supported) console.log(support.support);
const decoded = await bridge.execute({module: 'vae', operation: 'decode', input: rawTensor});
```

`configure` は実native `.configure`、`execute` は実管理 `createTextVaeAdapter.invoke` からnative `.encode/.decode` を呼ぶ。TextとVAEのbindingは実管理queueの同じresource groupに登録する。plain文字列をdummy tensorへ変換しない。shape計算・数値演算・model／Tokenizer／decoder照合はnative ownerが行う。shape外の要求を縮小・padding・frame削減で適合させない。

Textはplain `[1,512,4096]` とID `[1,L,4096]` を維持し、返却 `native.inputMode` で区別する。実L、float32／BLC、mask、model／Tokenizer、`umt5-final-rmsnorm-f32-v1` は返却tensorから取得できる。bridgeは使用可能な入力域を狭めない。全512有効IDの数値問題の解消・受入は別のText数値検証として報告する。

VAEの対応域は構成したnative manifestと `querySupport` が返す完全shape／制約が正本である。固定Rectを構成すれば81frameは対応外となり、stream manifestを構成すればnative streamの対応域を返す。設定できたこと、local assetが揃うこと、メタデータ照会の成功は、全domainの推論成功を意味しない。

## 返却・所有権・保存

`execute` は `{native, record, inputRecord, terminal, target}` を返す。`native` は既存APIの返却を保ち、`record.tensor` は管理captureで独立コピーされたtensorである。tensor入力を持つVAEでは `inputRecord` も返す。Text plain／IDの元入力は `record.sourceRecords` の外側情報として残す。

`.wktensor` は実payload、shape／dtype／layout／meaning、mask、model／Tokenizer、normalization marker、context、latentContract、frameProcessingを現codecの範囲で保持する。管理session／target／terminal、native返却 `inputDescriptor/binding/processing`、source照合は `.wktensor` へ挿入しない。外側の `sourceRecords` と `trace.records[].data.native` へ保存する。

```js
const packageResult = await bridge.save({
  records: {rgb: decoded.record},
  inputs: {[decoded.inputRecord.descriptor.artifactId]: decoded.inputRecord}
});
// Download/write packageResult.bytes, then use actual recovered bytes.
const restored = await bridge.read(packageResult.bytes);
```

decode出力RGBだけを渡して入力raw artifactを省略すると `DEPENDENCY_REQUIRED` を返す。元rawの実WKTとRGBを同じ管理packageへ保存し、RGBのsourceRecordsのartifactRefで結ぶ。生成sampleのproducer群とVAE decoder bindingは入力rawに保持し、native decode返却のbindingも外側traceから読戻せる。生成sampleをposterior meanへ改名せず、復元を追加実行しない。

現codecは管理workspaceの `codec` 引数へ明示注入する。旧管理の `tensor-498eb25.mjs` を既定のまま使うと新しい `frameProcessing` が欠落するためである。file formatは `WKTSR001/schemaVersion1` を維持する。旧markerlessファイルは読めるが、欠けたmarkerを推測して追加しない。

## Diffusionへのconditioning

```js
const capture = captureRestoredConditioning({
  record: restored.artifacts.conditioning,
  diffusion: acquiredDiffusionConditioningModule
});
```

実 `captureP4Conditioning` を使用する。全L行、mask、model／Tokenizerを保持し、最終RMSNorm markerは `capture.metadata.nativeTensorMetadata.normalization` に残る。private capture sealは永続化せず、保存読戻し後に受取realmでcaptureし直す。Tokenizer／normalizationを落とす旧 `encodeWanConditioning` wrapperは使わない。4096→5120投影・cross-attention・FFNはDiffusion側の責任であり、このbridgeでは実行しない。

## 取消・失敗・解放

`execute` は `signal` と任意の一意な `requestId` を受ける。明示取消は `inspect().targets` の完全targetを `cancel(target)` へ渡す。過去targetを新しいjobへ流用できない。

native cancelのbooleanだけでは停止確定にしない。実adapter invocationの元Promise終端、実管理queueの `afterTerminal/release` を待って返す。queue pump後・native未dispatchで取消された場合は `outcome.notStarted` を扱い、存在しないnative Promiseを待たない。正常・取消とも次jobは同groupの解放後に始まる。native結果の失敗は通常入口へ返し、解放未確認のresourceは実管理queueがquarantineする。

`dispose()` はqueueの元処理終端を待ち、adapter、capture store、所有するnative APIを解放する。既存shared APIを呼出側が所有する場合は初期化時に `ownsNativeAPI:false` を明示する。保存済みtensorはowner sessionやFile grantを復元しない。
