# Text Encoder / VAE 外部API契約 v1

API版: `works-ai-1`。Text EncoderとVAEは独立モジュール。包括処理と一括UI、別CodexのDiffusionモジュールはこの実装に含めない。

受入済みの実行条件は、UMT5の24層FP32診断経路と、Wan2.1 VAEの固定プロファイル `wan21-raw-f32-5x16x16`。VAEはRGB `[1,3,5,16,16]` とraw latent `[1,16,2,2,2]` の相互変換を検証した。大きな動画shapeをそのまま受け入れるものではない。別shapeは `tools/inference/vae/export_profile.py` で別bundleを作成し、その参照tensorとブラウザ結果を照合してから利用する。

## 呼出し口

基本経路は包括モジュールと同じWorks originでES moduleをimportする。import先を変更しただけでは、cross-origin Worker起動が許可されるとは限らない。別originの場合は、同originに置いたmodule host/iframeでWorkerを起動して、明示的MessagePortを受け渡す等のadapterを対向仕様と合わせて実装・検証する。このライブラリだけでcross-origin接続済みとは扱わない。

```js
import {createInferenceAPI, bindInferencePort, encodeTensor, decodeTensor}
  from './shared/inference/api.mjs';

const api = createInferenceAPI({onState: state => renderProgress(state)});
api.textEncoder.configure({manifest: textManifest, files: textFiles});
api.vae.configure({manifest: vaeManifest, files: vaeFiles});

const conditioning = await api.textEncoder.encode({text: 'Hello world'});
// conditioning.tensor: BLC float32 hidden states + attentionMask
// diffusion側のAPI契約に合わせてconditioningを渡すのは包括モジュールの責任。

const latent = await api.vae.encode(rgbTensor);
const decoded = await api.vae.decode(latent.tensor);
const persisted = await encodeTensor(conditioning.tensor);
const restored = await decodeTensor(persisted);
api.dispose();
```

`createTextEncoderModule()` と `createVaeModule()` を各APIファイルから直接生成することもできる。複数モジュールを同じUIで扱う場合は上の共有executorを使い、重い実行は1件に制限する。同時呼出しはbusyエラーとなり、暗黙に並列実行しない。包括モジュール側で必要な順序・待機列を管理する。

`files` は `Map(relativeFileName -> File/Blob または Uint8Array)`。File/Blobなら必要部分だけを読む。URLをモデルファイルの代わりに渡すAPIではなく、入力素材を外部サービスへ送信しない。元UMT5はそのbasenameでMapに含める。prepared bundleのmanifestとgraph/hashは読み取り時に照合する。

モデル準備はPythonで行い、実行時はブラウザ内のWASMを使う。元の `.safetensors` だけを選べばONNXへ自動変換されるAPIではない。今回のText実行用24 graphは合計18,523,750,008 bytesあり、元6,735,906,897-byteモデルも別に保持する。段階ロードは同時常駐量を抑えるが、保存容量を小さくする方式ではない。VAE bundleは約0.51GB。モデルの準備手順は各 `tools/inference/*/README.md` に記載する。

## モジュールとtensor境界

| モジュール | 操作 | 入力 | 出力 |
| --- | --- | --- | --- |
| Text Encoder | `encode({text})` | 通常テキスト。元UMT5埋込SentencePiece、EOS1/PAD0、最大512token。無断切詰めなし | `[1,L,4096]` float32、layout `BLC`、meaning `text_hidden_states`、attentionMask |
| Text Encoder | `encode({tokenIds,attentionMask})` | 同じ長さの整数ID列と0/1mask。内部mask位置を維持 | 同上。末尾paddingの計算を省略しても返却shapeとmaskを保持 |
| VAE | `encode(tensor)` | float32、NCTHW、meaning `raw-decoder-rgb`、値域−1〜1、profileと一致するshape | float32、NCTHW、meaning `raw-posterior-mean`。乱数sample・latent正規化なし |
| VAE | `encode(tensor)` | meaning `rgb-unit`、値域0〜1のRGB | 同上。値域変換`x*2-1`はHikeで行う |
| VAE | `decode(tensor)` | float32、NCTHW、meaning `raw-posterior-mean`、profileと一致するshape/model | float32、NCTHW、meaning `raw-decoder-rgb`。clamp・色変換なし |

tensorの共通表現は `{dtype, shape, layout, meaning, data: TypedArray, modelSha256?, attentionMask?}`。保存形式 `.wktensor` はバイナリpayloadとschema/shape/意味/model hash/mask/SHA-256を持つ。巨大なembeddingをJSON数値配列へ展開しない。`decodeTensor` はArrayBufferまたはUint8Array（NodeのBufferを含む）を受け、payloadを所有する新しい配列を返す。

Text embeddingはVAE latentではない。外部DiffusionからVAEへ接続するとき、相手が返すlatentの意味・shape・モデル・正規化空間を照合する。現在のVAE APIはraw空間を明示するため、normalized latentを名前だけ変えて渡さない。どの正規化・layout変換を包括モジュールが担当するか、対向APIの仕様と一緒に確定する。

`modelSha256` を明示したdecode latentはWan2.1 VAEのhashと照合し、不一致を拒否する。hashを省略したraw latentもSDKは受け入れるため、未記載ならモデル互換性が確認できたとは扱わない。包括モジュールはlatentの出所と必要な変換を確認し、可能な限りmodel hashを渡す。

通常テキスト経路はComfyUIのprompt重み構文・custom embedding・Berniniのsystem promptを自動再現しない。必要なprompt構築は包括モジュール側で明示的に行う。

## MessagePort経由

別iframe/Worker等との接続には、呼出し元が明示的に所有・提供したMessagePortを渡す。

```js
const {port1, port2} = new MessageChannel();
const unbind = bindInferencePort(port1, api);
// port2を渡す相手のorigin/Windowを包括モジュール側で確認する。
port2.postMessage({
  apiVersion: 'works-ai-1', id: 'request-1',
  module: 'text_encoder', method: 'encode', args: {text: 'Hello world'}
});
```

MessagePort自体にはorigin属性がない。初回のport受渡しは対向側の明示originを用い、`postMessage('*')`や全origin受付を既定にしない。このライブラリは勝手にwindow message listenerやHTTP推論serverを公開しない。

許可メソッド: Textは`capabilities/configure/encode/cancel`、VAEは`capabilities/configure/encode/decode/cancel`。返却は `{apiVersion,id,ok:true,result}` または `{apiVersion,id,ok:false,error}`。request IDは同時実行中に重複させない。関数名やコードを任意実行するRPCではない。

返却tensorとmaskのArrayBufferはportへtransferされ、host側の返却bufferは失効する。受信側が結果を所有し、別の処理へtransferした後は元viewを再利用しない。direct JavaScript APIの結果は呼出し元が所有する。

取消は専用Worker終了で実計算を止め、Promiseを失敗終端にする。次の実行でWorkerを再生成。build/session/job/inputRevisionの不一致返信は採用しない。moduleの`cancel()`はそのmoduleの実行だけを取り消し、共有APIの`cancel()`は現在の実行を取り消す。

`unbind()` はlistenerとportだけを閉じ、すでに開始した推論を取り消さない。共有APIの無関係なジョブを切断側が止めないための契約である。実行中に接続を閉じる呼出し元は、対象moduleの`cancel()`が返るまで待ってから `unbind()` する。hostごと終了する場合は `api.dispose(); unbind();` とする。応答待ちのrequest管理は呼出し元が終端化する。

## Hikeと実行条件

Text最終RMSNormはHikeがreduction・正規化・weight乗算を行う。固定Hike WABT runtimeのsqrt primitiveだけは明示した`env.sqrt -> Math.sqrt` bridgeを使う。VAE decodeは実conv2をHike MatMul+biasに置換し、その結果をORTへ渡す。VAE encodeはrgb-unit入力の値域変換をHikeで行う。既に−1〜1の入力へ無意味な恒等計算を追加せず、raw入力経路はそのままORTを使う。kernel欠落やhash不一致をJS/ORT代替で隠さない。

ORT Web1.24.3のWASM provider、1 thread。元FP8/BF16値をFP32へ展開した検証経路であり、元GPU precisionや性能との同等性は別判定。Textは24層を1件ずつload/releaseする。元2.1GB embedding表は全量展開せず行を検証して読む。モデルファイルと実行用graphは公開資材に同梱しない。

## 接続確認の状態

同一originの外部callerから明示MessagePortを通し、実UMT5のtokenize→24層→Hike最終norm、VAEのencode→decode、取消後の再実行、異種tensor拒否を実Chromiumで検証済み。個別UIのファイル選択→処理→保存・読戻しと、不透明PNG入力→Hike値域変換→VAE encodeも検証した。透過画像は背景を勝手に決めず拒否する。

別CodexのDiffusion API・包括UIとの対向接続は、相手のAPI版、tensor contract、originと実endpointを取得してから別に検証する。API入口の存在だけで対向接続済みとは報告しない。
