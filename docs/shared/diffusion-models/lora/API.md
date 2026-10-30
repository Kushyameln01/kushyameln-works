# LoRA weight I/O と SDK source接続

既存の `diffusion-models/0.1` request envelopeへ操作を追加する。同一ページJavaScriptと、明示して渡したMessagePortから利用できる。ファイルの登録・読出しは重みI/Oであり、モデルへのLoRA適用済み状態ではない。

## 登録先と原本

HIGH/LOWごとに1件のFile/Blobを登録できる。stage、strength、baseModelSha256を明示する。strengthは有限numberで、0と負数も保持する。stageと以下のbaseモデルSHA-256を照合する。

| stage | baseModelSha256 |
| --- | --- |
| HIGH | `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52` |
| LOW | `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` |

この指定は接続先の宣言であり、LoRAの学習元との一致を証明しない。実行時には原本のFile/Blob参照を保持し、payload全量をresident配列へ展開しない。load時の全ファイルSHA-256は1MiB以下の分割読込みで計算する。expectedFileSHA256を指定した場合は一致を要求する。

ブラウザ内の永続ストレージやサーバーへファイルを保存しない。利用者が選択したFileのsnapshotを使用し、変更されたディスク上のファイルを観測するには再選択・再登録する。

## 操作

| op | input | 動作 |
| --- | --- | --- |
| inspectLora | `{file}` | strictなheaderと対応tensorを検査。全ファイルhashは未計算 |
| loadLora | `{file,stage,strength,baseModelSha256,expectedFileSHA256?}` | 全file hashを計算し、成功時だけ登録を置換。bindingIdを返す |
| listLoras | `{}` | HIGH/LOWの登録metadataの独立snapshot |
| readLora | `{bindingId,stage,tensorName,elementOffset,elementCount}` | 保存dtypeの連続したtensor範囲を読む |
| readLoraSource | `{bindingId,stage,byteOffset,byteLength}` | 登録原本の任意の連続したbytesを読む。SDK source用 |
| unloadLora | `{bindingId,stage}` | 一致する登録だけ解除する |

既存のprotocolVersion、sessionId、jobId、inputRevision、任意buildIdの条件をそのまま使用する。capabilitiesは `loraWeightIO:true` と `loraApplied:false` を区別する。モデル全体のload/predict/sampleはNOT_READYを維持する。

`readLora` の範囲は要素数、`readLoraSource` はbyte数。1回の結果は4MiB以下で、offset/countを明示する。読出し結果のdataは独立したUint8Array、byte orderはlittle endian。F16/BF16/F32の保存bitsを保持し、FP32への数値変換やLoRAの加算を行わない。tensor読出しでは返す範囲のNaN/Infinityを拒否する。全payloadの有限性をload時に検証したとは扱わない。

headerSHA256、fullFileSHA256、読出し範囲のSHA-256は別の識別子である。full hashがあることは数値計算・学習元・モデル出力の正しさの証明ではない。

取消・新revisionによるWorker再生成後も登録は維持する。失敗/取消された置換では旧bindingを保持する。成功した置換・解除後の旧bindingId、別stageや別APIのbindingIdは拒否する。disposeは両登録と所有Workerを解放する。重い処理のBUSY制御は既存APIと共有する。

## 対応形式

通常の2D linear LoRAを、保存済みBerniniの406件の2D weightへ対応づける。nativeの `diffusion_model.<module>`、固定ComfyUIの `lora_unet_<moduleのドットをunderscoreへ変換>` を完全対応で扱う。suffixはdown/upまたはA/B。DOWN/Aは `[rank,in]`、UP/Bは `[out,rank]`。

加算差分 `.diff` / `.diff_b` は元targetのshapeを保ったbytesとして扱う。非2Dの差分を読めることは、そのConv等の適用算術が実装されたという意味ではない。`.diff_b` と一般の未対応LoRA bias学習を混同しない。

alphaは同じstemの `.alpha` scalarを読む。存在する場合の算術上の倍率はalpha/rank、存在しない場合は1。0や負のalphaを欠落として扱わない。metadataのss_network_alphaやfilenameから補わない。これらはmanifestに記録する規則であり、本接続口はその倍率を重みに加算しない。

JSON重複キー、過度な深さ、tensor byte長/範囲/shape不正、pair欠落、target名/shape不一致、alias衝突、同じtargetへの競合patch、未知のtensorを拒否する。DoRA/LoHa/LoKr/midや非2Dのfactorは対象外。任意のDiffusersキーを推測で変換しない。全header上限は8MiB。

## 別担当SDKとの接続範囲

`createLoraSource({request,sessionId,binding,inputRevision})` は既存SDKが使う `{size,read(offset,length,{signal}),hash({signal})}` を提供する。requestは同一ページのapi.request、または同じenvelopeを送受信するMessagePortのPromise transport。bindingはloadLoraの成功結果を渡す。入力revisionは包括モジュールの現在の世代を指定し、更新時はsource adapterを作り直す。

hashは現在の登録を照会して確認した全file hashを返す。readは登録された原本のbytesを返す。SDK側の1回のreadは16MiB以下とし、内部で4MiB以下の逐次requestへ分割する。全file配列を作らず、最大16MiBの組立て結果と範囲bufferを予算化する。解除・置換・dispose後に古いsourceを成功させない。AbortSignalはtransportへcloneせず、対象jobの取消と前後の検査に使用する。

既存SDKのinspectがこのsourceを読める経路と、SDKのprepare/applyに必要な実graph consumerを区別する。SDKのtarget.describe、immutable F32 baseProvider、transactional sink、prepareLoad/validate/commit/rollbackは、量子化Bernini全体について未実装。File登録・source接続を、その適用経路の成功とは表示しない。

## 呼出し例

```js
import {createDiffusionModels, PROTOCOL_VERSION} from '../api/index.mjs';
import {createLoraSource} from './source.mjs';
import {createLora} from '../../inference/lora/sdk.mjs';

const api = createDiffusionModels();
const inputRevision = 1;
const loaded = await api.request({
  protocolVersion: PROTOCOL_VERSION, sessionId: api.sessionId,
  jobId: crypto.randomUUID(), inputRevision, op: 'loadLora',
  input: {
    file: selectedFile, stage: 'HIGH', strength: 3,
    baseModelSha256: '9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52'
  }
});
if (loaded.status !== 'ok') throw Error(loaded.error.message);
const source = createLoraSource({
  request: q => api.request(q), sessionId: api.sessionId,
  binding: loaded.result, inputRevision
});
const sdk = await createLora({catalog: {
  direct: {high: {fileName: selectedFile.name, size: source.size, source}}
}});
try {
  const report = await sdk.inspect({category: 'direct', noise: 'high'});
  // source経由のファイル検査。モデルへのprepare/applyは別の契約。
} finally {
  await sdk.dispose();
  api.dispose();
}
```


## 別契約: PARTIAL consumer

登録bindingIdは原本FileのI/O識別であり、実行重みのbinding.kindと別である。実base復号・F32 runtime feed-set受口は [DIAGNOSTIC_API.md](DIAGNOSTIC_API.md) の版付きES moduleで提供する。原本I/Oのapplied:falseを変更せず、SDK v1/fullモデル適用済みとは表示しない。
