# Text / VAE 単体API差分

対象は「Kushyameln Works モジュール単体完成 実行計画 Draft」1.0 draft 1。API版は既存の `works-ai-1` を維持する。この文書は今回追加したstream VAE、保存metadata、Text共有jobとNode参照hostを説明する。数値受入は [RESULT.md](RESULT.md) に記載したcaseへ限定し、収集中のNode結果は受入済みとして扱わない。

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

### 共有Text jobと通常結果

[text-job.mjs](../../../docs/shared/inference/text-job.mjs) の `runTextEncoderJob({input,manifest,files,ort,hike,signal,onProgress,diagnostics=false})` をWorkerとNode参照hostで共有する。既存の `validateTextEncoderInput()`、`tokenizePlainText()`、`loadTextEncoder()` を呼び、入力検査・Tokenizer・24段loaderの正本を共通にする。Textの演算loopやtensor schemaをhost側へ複製しない。

共有jobは `finally` でencoderをdisposeする。ORT実行環境とHikeの寿命はcallerが所有し、Hikeはjob側でdisposeしない。既存の独立ES module APIと `createTextEncoderModule().configure()/encode()` は維持する。通常利用者がこの下位jobへ直接接続する必要はない。

`configure({manifest,files,diagnostics:false})` が既定で、通常結果は `{tensor,attentionMask,inputMode}`。`inputMode` は `plain-text` または `token-ids` となる。`diagnostics:true` を明示した場合だけ、外側の `result.evidence` にHike寄与、実行provenance、Tokenizer情報などを追加する。diagnosticsの指定はmodel演算・返却tensor・数値gateを切り替えない。独立参照や過去receiptは通常APIの必須入力にしない。

### Node参照host

[node_sdk_host.mjs](../../../tools/inference/text-encoder/node_sdk_host.mjs) は、`createTextEncoderModule({client:referenceClient})` をconfigureしてからencodeする参照hostである。custom clientは同じ共有Text jobを直列に実行する。実ORT WASMの1thread、既存loaderのprepacking停止設定、実Hike最終RMSNormを使い、結果を通常の `encodeTensor()` / `decodeTensor()` で保存・読戻しする。shape・全mask・normalization・model/Tokenizer識別・全float値を照合し、caseごとの `.wktensor` とreceiptを残す。独立FP32参照との数値比較は親Pythonの既存比較器で行う。

各prepared graphは1GB未満で、norm・row hashes・Tokenizerとともにnative `fs.openAsBlob` で開く。6,735,906,897bytesの元modelには、readonly fdを保持するbounded positional readerを使う。実ファイルのBigInt `size / mtimeNs / ino / dev` を捕捉し、最大8192bytesの位置指定readの前後でfdとpathnameのidentityを検査する。全modelの `arrayBuffer()` は提供せず、closeは進行中のreadを待ってfdを閉じる。receiptではprepared assetのfile-backed Blobと、元modelの `bounded positional file source` を区別し、実size・読出し量・close状態を記録する。元model全体の再読出し・再hashは実施しない。

source検証はNN開始前に行う。親Pythonが `git cat-file -t` で指定SHAのcommit型を確認し、固定15 pathのNode依存と親helperの実bytesをGit bytesと照合する。Nodeは親から受け取った `sourceRecords` について、固定path集合の欠落・重複・追加、全40桁SHA、bytes、SHA-256を検査し、現在の各実ファイルを再読出しして照合する。Node内でGitや子processを起動せず、commitの同定は親のGit検証に依存する。直接CLIへ渡した表だけで独立したcommit証明が成立するとは扱わない。

資源対策はhost側の明示設定として記録する。使い捨てNodeで明示的に `NODE_OPTIONS=--require=.../node_resource_guard.cjs` を有効にした場合だけ、自身の `oom_score_adj=1000` を設定する。これはOOM停止対象の選好であり、利用可能RAMや完走を保証しない。親PythonはNode開始前の24 graphと各block完了後に、readonly fdへ `POSIX_FADV_DONTNEED` を助言する。対象path・回数・累計file bytes・errorを記録するが、助言成功をpage eviction・RSS低下・空きmemoryの証拠へ読み替えない。

このhostの結果はNode参照hostの検証範囲に限る。Browser File/Workerでの実行・強制取消・T3受入は別に残り、receiptも `browserWorkerAcceptance:false / cancellationAcceptance:false` とする。`byteGraph` 指定はNN前に拒否し、計画の `id-l2` bytes経路はBrowser側の後続試験へ残す。ID APIのL2契約は前表どおり維持する。既存FP32 model経路・重み・graph・独立oracle・比較gateは維持し、FP64 model経路への切替や再exportは行わない。

| 区分 | 完全実行source SHA | この追補時点の状態 |
| --- | --- | --- |
| Node参照hostの実行 | `dccb88515775ec8aa86dd16f82e8816c9347ed38` | 6caseを収集中。数値結果は未確定 |
| 比較対象の独立full512 FP32 oracle | `5954d48e0fb6df1d6977964fd8a7ba2a242b6eff` | 保存済みの独立参照を再利用 |

後続の文書・証拠追加による配布commitと、実際に実行したsource SHAを分けて保存する。最新配布SHAで上表の実行SHAを付け替えない。再現手順とhost指定は [REPRODUCE.md](REPRODUCE.md) を参照する。

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

`manifest.inference` はWASM、graph optimization disabled、明示threads1または4。既存exportのthreads1は維持する。threads4は同じgraphを使えるが、cross-origin isolationとSharedArrayBufferを必須とし、非対応hostやthread数のfallbackを拒否する。`capabilities().inference` と成功bindingに実設定を返す。4 threadでWASM32bitの4GiB heap上限が増えることはない。小規模時間継続と細長い参照境界での実行・子Worker終了を受け入れた範囲はRESULTを参照する。大shapeの速度保証へ広げない。

## 保存・通信・終了

`.wktensor` は `WKTSR001`、schema1、little-endianのtyped binary payloadとdata SHA-256を使用する。dtype/shape/layout/meaning、model hash、mask、Tokenizer、供給済みnormalization marker、strict native context、latentContract、任意 `frameProcessing` を保存する。metadataはhashのawait前にsnapshotする。旧markerなしファイルを読み、従来fieldだけの出力bytesを維持する。欠けている旧markerを後から検証済みとして補わない。

`frameProcessing={schemaVersion:1,policy:'wan21-causal-floor-v1',sourceFrames,latentFrames,consumedFrames,unusedTailFrames,sourceContext?}`。encodeの `.context` は処理済みframeとの対応、`.frameProcessing.sourceContext` は未使用末尾を含む元入力全体の対応を保持する。重複frame番号と時刻配列も保持する。compatibleな固定profile decodeでもこの情報を落とさない。

normalized meanの中間WKTとrestored generated sampleでも同じnative `frameProcessing` を保持する。normalized markerは供給された場合だけ保存し、raw意味への混入や未検証のmarker補完を拒否する。generated sampleの複数producer、decoder binding、Diffusion所有のrestored contract検査は維持する。これらmetadataの保存対応は、VAE側へ数値復元を追加する変更ではない。

管理snapshot・owner・graph/build・trace・詳細receipt/evidenceは外側packageへ保存し、strict native context/latentContractへ挿入しない。VAE decode結果の `inputDescriptor` に入力sampleのproducer/decoder/正規化状態とcontextを保持する。管理はRGBのWKTだけでなく、この外側の入力来歴も保存する。

同一origin ES moduleと明示MessagePortを既存どおり使う。`bindInferencePort()` のresult転送後、tensor/maskのbuffer所有者は受信側となり送信側ではdetachedになる。入力はclientのstructured clone経路で送る。外部origin hostの設置・取得ACKは別の接続試験で扱う。

実行中の同じmoduleへのconfigureはそのjobを取り消す。`cancel()` はowner WorkerをterminateしPromiseを失敗させ、古いjob/revisionの結果を採用しない。cancel後は同じAPIへ再実行できる。失敗時はsession/Tensorをfinallyで解放し、強制取消ではWorker所有のWASMごと終了する。`dispose()` はcancel・設定破棄後に再利用を拒否する。WKT保存はhost操作であり、module cancelが保存digestを中断する契約ではない。保存後の公開抑止はhost revisionで判断する。
