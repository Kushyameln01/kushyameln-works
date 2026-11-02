# Text / VAE 単体API差分

対象は「Kushyameln Works モジュール単体完成 実行計画 Draft」1.0 draft 1。API版は既存の `works-ai-1` を維持する。この文書は今回追加したstream VAEと保存metadataの説明であり、数値受入は [RESULT.md](RESULT.md) に記載したcaseへ限定する。

## 通常入口

`docs/shared/inference/api.mjs` の `createTextEncoderModule()`、`createVaeModule()` を個別に利用できる。`createInferenceAPI()` は任意の共有executorを提供し、Text/VAEの同時実行をbusyで拒否する。工程・待機列・Diffusion executorとの横断直列化は管理側が所有する。

```js
import {createVaeModule, encodeTensor, decodeTensor}
  from './shared/inference/api.mjs';

const vae = createVaeModule();
vae.configure({manifest, files}); // files: Map(filename -> File/Blob/Uint8Array)
const support = vae.capabilities({operation: 'decode', input: descriptor});
if (!support.support.supported) throw Error(support.support.reason);
const result = await vae.decode({...descriptor, data: rawLatent});
const saved = await encodeTensor(result.tensor);
const restored = await decodeTensor(saved);
vae.dispose();
```

通常入口へ独立参照・数値gate・過去receipt・固定prompt hashを渡す必要はない。`configure({manifest,files,diagnostics:false})` が既定で、詳細 `result.evidence` は診断opt-in時だけ返す。通常のcapabilitiesと結果bindingは構成・実shape・実asset照合を表し、参照との数値一致を表さない。

`capabilities({operation,input})` はdataなしdescriptorを受け、Workerを起動しない。非対応時は `support={supported:false,code,reason,requiredChanges,scope}` を返す。shape外要求を縮小・padding・frame削減・意味の改名で適合させない。asset SHA-256と実graph metadataは実行時に検査する。`runtime.encode/decode.verified` は最後に成功した具体shapeだけを保持し、再configure/disposeで消える。

## Text

Textの通常出力は `{tensor,attentionMask,inputMode}`。詳細数値試験の完了状態とは区別する。

| 入力 | 許容範囲と出力 |
| --- | --- |
| `encode({text})` | 元SentencePiece、BOSなし、EOS1追加、PAD0で512へ埋める。空文可。EOS込み512を超えたら拒否。出力 `[1,512,4096]` |
| `encode({tokenIds,attentionMask})` | 同長 `1≤L≤512`、整数ID0..256383、二値maskで少なくとも1位置有効。EOS/PADを追加しない。出力 `[1,L,4096]` |

textとID/maskの混在、全0mask、非整数・範囲外ID、長さ不一致を拒否する。内部mask位置を保持し、masked rowは0。既存の検証済み末尾mask compactionを使う場合も返却Lとmaskは復元する。

| 通常tensor field | 値 |
| --- | --- |
| `dtype / layout / meaning` | `float32 / BLC / text_hidden_states` |
| `shape` | 実出力の `[1,L,4096]` |
| `attentionMask` | `Uint8Array[L]`。top-levelにも同じ値を返す |
| `modelSha256` | `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68` |
| `tokenizerSha256` | `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458` |
| `normalization` | `umt5-final-rmsnorm-f32-v1`：実Hikeのweighted `encoder.final_layer_norm`、epsilon1e-6適用済み |

使用する24 graph、元model、row hashes、final norm、plain用Tokenizerは構成manifestで固定する。ID列のTokenizer識別は期待bindingを示し、外部で作った任意ID列の出所認証ではない。system prompt・negative選択は管理側、4096次元hiddenの投影・cross-attention・FFNはDiffusion側。ComfyUI prompt重み、custom embedding、clip-skip、pooled outputは未対応。

## VAE

既存固定 `wan21-vae-profile-v1` は維持し、別形式 `wan21-vae-stream-v1` を追加した。新形式は元Wan2.1 VAEの194 state keysを69個の空間symbolic ONNX unitとHike conv2用2 assetへ分割する。native causal順序とjobごとのhistoryをhostに保持し、同時ORT sessionは1件。各空間resampleはfeature frameごとB1で実行する。global attentionの境界変更や空間tileは行わない。

| 項目 | stream manifestの構造的入力域 |
| --- | --- |
| batch / dtype / layout | `1 / float32 / NCTHW` |
| encode入力 | `[1,3,F,H,W]`、`1≤F≤81`、H/Wは16..848の16倍数 |
| encode出力 | `[1,16,T,H/8,W/8]`、`T=1+floor((F-1)/4)`、raw posterior mean |
| decode入力 | `[1,16,T,h,w]`、`1≤T≤21`、`8h/8w`が上記空間域内 |
| decode出力 | `[1,3,1+4*(T-1),8h,8w]`、raw RGB、clipなし |
| target | RGB `[1,3,81,480,832]` ⇔ raw latent `[1,16,21,60,104]` |

このdomain宣言だけでは全組合せの数値受入・端末RAM保証にならない。実WASM合格shapeと資源はRESULTを参照する。shape計算の管理正本は `5ab651395e245e35f9472ca1b24f5e61550a9957:docs/shared/ai-connection/workflow-shapes.mjs`。ownerは前処理済みtensorを受け、resize/slot mappingを複製しない。

encode初回は1frame、続きは完全な4frame群を消費する。F4は1frameを処理して末尾3、F80は77frameを処理して末尾3を明示する。入力shape自体を書き換えず、`processing` と `tensor.frameProcessing` に返す。最初のdecodeは1 RGB frame、以後のlatent stepは4 RGB framesを返す。

| 意味 | 受入と数値責任 |
| --- | --- |
| `raw-decoder-rgb` / `rgb-unit` | encode用、値域[-1,1] / [0,1]。後者の `x*2-1` はHike |
| `raw-posterior-mean` | encodeの平均値。sampleでもnormalized latentでもない |
| `wan21-raw-latent:v1` | 独立した未正規化raw decode入力。mean/generatedへの改名を要求しない。指定model hashはdecoder VAEと照合 |
| `wan21-normalized-posterior-mean:v1` | codecが供給済みmarkerを保持するがraw decodeでは拒否。VAEは復元しない |
| `wan21-raw-generated-sample:v1` | 既存の複数producer・decoder VAE・Diffusion所有のrestored contractを検査。数値復元はDiffusion側。今回の独立raw decode試験は実生成受入を意味しない |

decoder VAE hashは `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。元BF16格納係数は変更せずFP32へ展開する。元BF16演算との同一性は主張しない。

`manifest.inference` はWASM、graph optimization disabled、明示threads1または4。既存exportのthreads1は維持する。threads4は同じgraphを使えるが、cross-origin isolationとSharedArrayBufferを必須とし、非対応hostやthread数のfallbackを拒否する。`capabilities().inference` と成功bindingに実設定を返す。4 threadでWASM32bitの4GiB heap上限が増えることはない。4 threadの速度・子Worker終了は別に実測する。

## 保存・通信・終了

`.wktensor` は `WKTSR001`、schema1、little-endianのtyped binary payloadとdata SHA-256を使用する。dtype/shape/layout/meaning、model hash、mask、Tokenizer、供給済みnormalization marker、strict native context、latentContract、任意 `frameProcessing` を保存する。metadataはhashのawait前にsnapshotする。旧markerなしファイルを読み、従来fieldだけの出力bytesを維持する。欠けている旧markerを後から検証済みとして補わない。

`frameProcessing={schemaVersion:1,policy:'wan21-causal-floor-v1',sourceFrames,latentFrames,consumedFrames,unusedTailFrames,sourceContext?}`。encodeの `.context` は処理済みframeとの対応、`.frameProcessing.sourceContext` は未使用末尾を含む元入力全体の対応を保持する。重複frame番号と時刻配列も保持する。compatibleな固定profile decodeでもこの情報を落とさない。

管理snapshot・owner・graph/build・trace・詳細receipt/evidenceは外側packageへ保存し、strict native context/latentContractへ挿入しない。VAE decode結果の `inputDescriptor` に入力sampleのproducer/decoder/正規化状態とcontextを保持する。管理はRGBのWKTだけでなく、この外側の入力来歴も保存する。

同一origin ES moduleと明示MessagePortを既存どおり使う。`bindInferencePort()` のresult転送後、tensor/maskのbuffer所有者は受信側となり送信側ではdetachedになる。入力はclientのstructured clone経路で送る。外部origin hostの設置・取得ACKは別の接続試験で扱う。

実行中の同じmoduleへのconfigureはそのjobを取り消す。`cancel()` はowner WorkerをterminateしPromiseを失敗させ、古いjob/revisionの結果を採用しない。cancel後は同じAPIへ再実行できる。失敗時はsession/Tensorをfinallyで解放し、強制取消ではWorker所有のWASMごと終了する。`dispose()` はcancel・設定破棄後に再利用を拒否する。WKT保存はhost操作であり、module cancelが保存digestを中断する契約ではない。保存後の公開抑止はhost revisionで判断する。
