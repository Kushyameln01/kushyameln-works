# Text Encoder / VAE 外部API契約 v1

API版: `works-ai-1`。Text EncoderとVAEは独立モジュール。包括処理と一括UI、別CodexのDiffusionモジュールはこの実装に含めない。

文書revision: `G1C-V1`（2026-10-31 JST）。`works-ai-1`とG1Cのnative契約を維持し、F=1診断profileの受入を追記する。source branchの文書であり、main/Pagesの配信更新を意味しない。新規generated sample受入口と以下のmetadata追加は、実生成sampleの推論・復元・decodeを受入済みとするものではない。

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

`configure({manifest,files})` はparsed manifestとこのMapを受け、同期的にcapabilitiesを返す。JSONテキストやモデルURLを直接渡さない。設定変更では同じmoduleの実行を取り消す。`capabilities().configured` は設定を保持したことを表し、全assetの読込み・推論成功を保証しない。

| 設定 | manifestと必要files |
| --- | --- |
| Text | `wan-umt5-staged-fp32` / schemaVersion1 / complete true、24 blocks、opset17 / ORT1.24.3。`blocks[].path`、`finalNorm.path`、`embedding.rowHashes.path`、`embedding.sourceFile` をMapに含める。通常テキストでは `tokenizer.path` の元埋込 `spiece.model` も必要 |
| VAE | `wan21-vae-profile-v1` / schemaVersion1、Wan2.1 model binding、raw / NCTHW / opset17の固定profile。`posterior:'mean'` はencodeの平均値選択を表す。encodeには `assets.encoder.file`、decodeには `decoderBody.file/conv2Weight.file/conv2Bias.file` が必要。両操作を使う場合は全4assetを入れる。元safetensorsは準備時だけ使用し、runtimeのMapには不要 |

manifestのshapeだけを書き換えて別profileにしない。assetのbytes/SHAと実graphが一組である。`createInferenceAPI({onState})`、または各factoryでconfigureし、実行時のasset検査・失敗を必ず受け取る。

モデル準備はPythonで行い、実行時はブラウザ内のWASMを使う。元の `.safetensors` だけを選べばONNXへ自動変換されるAPIではない。今回のText実行用24 graphは合計18,523,750,008 bytesあり、元6,735,906,897-byteモデルも別に保持する。段階ロードは同時常駐量を抑えるが、保存容量を小さくする方式ではない。VAE bundleは約0.51GB。モデルの準備手順は各 `tools/inference/*/README.md` に記載する。

## モジュールとtensor境界

| モジュール | 操作 | 入力 | 出力 |
| --- | --- | --- | --- |
| Text Encoder | `encode({text})` | string。元UMT5埋込SentencePiece、EOS1/PAD0、EOSを含め最大512token。空文も可、無断切詰めなし | `[1,512,4096]` float32、BLC、`text_hidden_states`、mask、model/Tokenizer hash |
| Text Encoder | `encode({tokenIds,attentionMask})` | 整数配列または数値TypedArray、`1≤L≤512`、IDは0..256383。同長の0/1maskで少なくとも1つ有効 | `[1,L,4096]`。EOS/paddingを自動追加しない。内部mask位置・返却Lを保持 |
| VAE | `encode(tensor)` | float32、NCTHW、meaning `raw-decoder-rgb`、値域−1〜1、profileと一致するshape | float32、NCTHW、meaning `raw-posterior-mean`。乱数sample・latent正規化なし |
| VAE | `encode(tensor)` | meaning `rgb-unit`、値域0〜1のRGB | 同上。値域変換`x*2-1`はHikeで行う |
| VAE | `decode(tensor)` | float32、NCTHW、meaning `raw-posterior-mean`、profileと一致するshape/model | float32、NCTHW、meaning `raw-decoder-rgb`。clamp・色変換なし |
| VAE | `decode(tensor)` | float32、NCTHW、`wan21-raw-generated-sample:v1`、一致するprofileと下記latentContract | 同上。追加のlatent正規化・復元を行わない。契約fixtureだけを今回受入、実生成経路は未検証 |

tensorの共通表現は `{dtype,shape,layout,meaning,data:TypedArray,modelSha256?,attentionMask?,tokenizerSha256?,context?,latentContract?}`。保存形式 `.wktensor` はバイナリpayloadとschema/shape/意味/model hash/mask/SHA-256を持ち、今回の任意metadataも検査して保存する。巨大なembeddingをJSON数値配列へ展開しない。`decodeTensor` はArrayBufferまたはUint8Array（NodeのBufferを含む）を受け、payloadを所有する新しい配列を返す。

Text embeddingはVAE latentではない。DiffusionからVAEへ接続するとき、latentの意味・shape・モデル・正規化空間を照合する。normalized latentの名前だけを変えて渡さない。モデル固有の正規化・復元はDiffusion側Hikeが担当し、管理側やVAE側へ重複実装しない。

旧 `raw-posterior-mean` の `modelSha256` はWan2.1 VAEのhashと照合し、不一致を拒否する。旧mean経路はhashの省略も維持するが、未記載ならモデル互換性が確認できたとは扱わない。生成sampleの `modelSha256` は後述する生成側producer列と照合し、decoder VAEは別フィールドで結び付ける。

## Text Encoderの出力契約

出力は `{tensor,attentionMask,evidence}`。`tensor.attentionMask` はUint8Array `[L]` で、同じmaskをtop-levelにも返す。無効行のhidden statesは0、内部mask位置は保持する。末尾のmask0だけを計算時に省略しても、返却shapeと0行を元のLに戻す。

| 識別 | 固定値 |
| --- | --- |
| `tensor.modelSha256` | `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`（元UMT5） |
| `tensor.tokenizerSha256` | `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`（元埋込SentencePiece） |
| `evidence.inputMode` | `plain-text` または `token-ids`（Worker API経路） |

通常テキストはBOSなし・EOS1を追加・PAD0で512まで埋める。lowercase/cleanText、暗黙のtask prefixは適用しない。直接ID経路はIDの範囲・maskを検査するが、呼出し元が本当に同じTokenizerでIDを作ったことを数列から証明できない。Tokenizer hashはモデルに対応する期待識別であり、任意のID列の出所認証ではない。textとID/maskを同時指定する曖昧な入力は拒否する。512はAPIの上限であり、全512位置が有効な入力の性能・全promptでの数値受入まで検証したという意味ではない。

Bernini system promptの構築、negativeの選択と実際の文字列・line breakは管理側が保持する。ComfyUI固有の括弧によるprompt重み、custom/textual embedding、clip-skip、別encoder、pooled outputは未対応。通常テキストのhidden statesだけで元conditioning全体を再現したとは扱わない。Diffusionの `requireWanConditioning` と保存wrapperは、Tokenizer hashがあれば一致を検査して保持する。旧ファイルでhashが無い場合の既存受入は維持するが、Tokenizer識別まで確認済みとは扱わない。

## VAE profileの棚卸しと受入条件

すべてNCTHW、N=1。`F=4n+1`、latent時間長 `T=(F-1)/4+1`、空間 `H/8,W/8`、decode出力Fは `4*(T-1)+1`。モデル構造の空間条件は8アラインだが、現exporterは **H/Wが16以上の16倍数** に限定する。この違いを無断で緩めない。

| 用途 | RGB shape | latent shape | 状態 |
| --- | --- | --- | --- |
| 既存公開bundle | `[1,3,5,16,16]` | `[1,16,2,2,2]` | `wan21-raw-f32-5x16x16`。既存FP32参照・ブラウザ受入を保持 |
| F=1正方形診断bundle（非公開） | `[1,3,1,16,16]` | `[1,16,1,2,2]`（64要素） | `wan21-raw-f32-1x16x16`。元VAE FP32全出力・実Hike/ORT WASM受入済み。実workflow参照媒体ではない |
| 元workflowのsource/video grid | `[1,3,81,480,832]` | `[1,16,21,60,104]` | 必要shape。未export・未ブラウザ受入 |
| 最終decode | `[1,3,81,480,832]`へ復元 | `[1,16,21,60,104]`からdecode | 同じgridでも生成sampleとmeanは別契約。実生成経路未実装 |
| 静止参照画像、workflow gridを使う場合 | `[1,3,1,480,832]` | `[1,16,1,60,104]` | F=1用の別graphが必要。全slotをこの寸法へ変える意味ではない |
| 異なるratioの参照画像 | `[1,3,1,H_ref,W_ref]` | `[1,16,1,H_ref/8,W_ref/8]` | 画像・slotごとの実寸法を取得して固定profile化する |
| 別ratio／長さの参照動画 | `[1,3,F_ref,H_ref,W_ref]` | `[1,16,(F_ref-1)/4+1,H_ref/8,W_ref/8]` | F/H/W確定後に別profileを検証。reference_videoは例workflowで未接続 |

workflowの81×480×832はRGB単体388,177,920 B、latent単体8,386,560 B（2,096,640要素）。重み、activation、時間cache、copyを含むピークRAMではない。Diffusionの公開pointwise予算1,048,576要素を超え、mean正規化の固定128要素profileからも外れる。VAEのshapeを揃えるだけでは接続できない。

Bernini例の `ref_max_size=848` は長辺上限であり、実参照画像が848×848という情報ではない。元nodeのresize/crop式と実媒体の寸法・EXIF・frame数は別に照合する。今回、縮小、padding、末尾切断、frame削減、縦横の入替えを追加・実行しない。受入済み5-frame graphをF=1や81へ流用せず、manifestだけの書換えも行わない。

別profileの受入は、(1)実入力とrole/slot/F/H/Wを確定、(2)固定原VAE194 keys・FP32参照の全出力を保存、(3)新しい非公開bundleへopset17の固定exportとSHA/shape記録、(4)比較前に数値gateを固定、(5)実ブラウザで入力→Hike/ORT→全結果回収・照合・取消/解放・copy/cache/OS側RAM計測、(6)同じshape・意味の対向tensor接続、をprofileごとに行う。F=1・16×16診断一件は個別export・実WASMで受け入れた。他のshapeへ合格を流用しない。小profileの0.002 gateや合格を大動画の画質・負荷へ自動転用しない。

## Diffusionから受け取る生成sample

旧 `raw-posterior-mean` はVAE encodeの平均。Diffusionの `normalizeRawMean` → `wan21-normalized-posterior-mean:v1` → `restoreRawMean` → raw mean、という現行128要素経路を保持する。`restoreRawMean`へ生成sampleを渡したり、meanへ改名したりしない。

生成sample用のVAE受入口は次の追加schemaを使う。これはVAE側の宣言検査契約であり、現Diffusion APIにはまだ実sample出力や生成sample用復元操作がない。

```js
const sample = {
  dtype:'float32', layout:'NCTHW', shape:[1,16,2,2,2],
  meaning:'wan21-raw-generated-sample:v1', data:rawSampleValues,
  // modelSha256が既にあれば生成側の値を保持する。VAE hashへ替えない。
  latentContract:{
    schemaVersion:1, representation:'generated-sample', space:'raw',
    vaeModelSha256:'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b',
    producerModelSha256s:actualGeneratorModelHashes,
    normalization:{id:'wan21-comfy-f32-v1', state:'restored', owner:'diffusion_models'}
  }
};
// 実際の生成とDiffusion所有の復元が完了した場合だけ、api.vae.decode(sample)。
```

producerModelSha256sは非空・重複なしの小文字64桁SHA配列。HIGH/LOW両モデルが使われたなら両者を保持し、順序やLoRA設定は別の実行traceに保存する。任意の `modelSha256` がある場合はproducer列の一員とし、decoder VAE hashはproducerへ入れない。`vaeModelSha256` は対象decoderとのbindingとして照合する。hash未取得を仮のhashで埋めて実互換性を認定しない。

latentは有限float32であり、RGBのような単一の `[-1,1]` / `[0,1]` 範囲を課さない。raw値のclampや推測したscalar scale/shiftは行わない。channel別mean/std、FP32順序、`wan21-comfy-f32-v1` による復元はDiffusionが所有する。VAEは復元済みraw値へ実conv2とdecoder bodyを適用し、正規化・復元は追加せず `evidence.normalizationApplied=false` を返す。RGB出力のmodelSha256は実際に出力したVAEの識別であり、入力producer hashの付替えではない。入力hashとlatentContractはevidenceへ残す。

`restored` はproducerによる宣言で、metadataだけから変換の実行・二重適用の不存在・モデル互換性を証明できない。元normalized tensor、復元操作/build、前後payload hashを対向側で対応付けて数値比較する。未復元・normalized meaning・違うdecoder bindingは拒否する。現在の `predict/sample=NOT_READY` とmean専用の復元を、fixtureが通っただけで解除しない。

## contextと管理側が保持する情報

VAEに任意の `tensor.context` を渡すと、出力tensorへ所有コピーを返し `.wktensor` でも保持する。shapeや値の変換をこのmetadataが指示することはない。

```js
context:{
  schemaVersion:1, contextId:'ref-slot-2-frame-80',
  inputId:'original-asset-7', inputSha256:originalAssetSha256,
  slotId:'reference-image-2', sourceFrameIndices:[80],
  sourceFrameTimesSeconds:[5.0] // 任意。同数の有限・非負の秒列。
}
```

sourceFrameIndicesは元入力での0始まりframe番号で、順序・重複をそのまま保存する。encodeにcontextを付ける場合は入力RGBのFと同数を要求し、選択された全元frameを記録する。時間圧縮後の各latent位置へ単純な1対1対応を発明せず、decodeのlatent Tとの同数も要求しない。source hashや各frame番号・時刻の実内容は管理側が原本から照合する宣言値であり、VAEが原媒体を再検証したとは扱わない。context名から実画像寸法・内容を推定しない。

既存のDiffusion mean用Hike正規化・復元もcontextを所有コピーで保持する。payloadの数値・hashは変換で変わるが、元入力とslot/frameの対応は変えない。管理側は引き続きjob manifestを正本として保持し、context列の順序・正負共有・失敗時の失効を管理する。

管理job manifestには、job/session/inputRevision、原本とasset hash、選択frame/時刻、各slotとcontextId、profile id＋manifest hash＋graph hash、model/Tokenizer/build識別、実promptと正負区分、context順序とpositive/negative間の共有参照、前後tensor hash、各工程の状態・error・取消対象を保持する。HIGH/LOW実行順、LoRA識別・strength、scheduler/noise入力と変換履歴も該当工程の記録に含める。contextに任意の順序属性を混ぜず、このjob manifestのordered contextId列で順序を管理する。

管理側は同一contextを正負conditioningで共有するかを決める。Diffusion本番graphが各contextをどう消費するか、結合軸・長さ・mask・slot roleはDiffusion担当と確定する。今のAPIからcontextをstack/concat/resizeしてよいと推測しない。Text/VAE共有executorとDiffusionの別executorの横断直列化、待機列、依存工程のskip/取消は管理側が担当する。今回管理UIや重複したモデル数値処理を追加しない。

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

Text/VAEのhost→Workerは入力をstructured cloneし、入力bufferをtransferしない。Worker→hostは結果bufferをtransferし、その後Workerを終了する。Diffusion APIも入力所有権を保ち、Worker結果はhostへtransferするが、現在のDiffusion MessagePort adapterは返答をstructured cloneする。両adapterが同じ転送方式だと仮定しない。管理側が明示的transferを追加した場合はその送信元viewを失効させ、再利用・正負fan-outが必要なら移譲前に所有copyや保存物を作る。WASM Memoryのpointer共有やzero-copyは保証しない。

取消は専用Worker終了で実計算を止め、Promiseを失敗終端にする。次の実行でWorkerを再生成。build/session/job/inputRevisionの不一致返信は採用しない。moduleの`cancel()`はそのmoduleの実行だけを取り消し、共有APIの`cancel()`は現在の実行を取り消す。

`unbind()` はlistenerとportだけを閉じ、すでに開始した推論を取り消さない。共有APIの無関係なジョブを切断側が止めないための契約である。実行中に接続を閉じる呼出し元は、対象moduleの`cancel()`が返るまで待ってから `unbind()` する。hostごと終了する場合は `api.dispose(); unbind();` とする。応答待ちのrequest管理は呼出し元が終端化する。

Text/VAEには内蔵待機列がない。同時実行はPromiseの `Inference client busy`、取消は `Inference cancelled`、推論失敗はmessage文字列のError/RPC `ok:false` で終端化する。dispose後のconfigure/encode/decodeは拒否する。DiffusionのBUSY/CANCELLED/STALE_INPUT/DISPOSED等は `{status:'error',error:{code,...}}` なので、管理側adapterは各protocolを区別して状態へ写す。新revisionが旧Diffusionジョブを終了する挙動と、Text/VAEのbusy拒否を混同しない。失敗した依存工程の結果で後工程を起動せず、取消/失敗後に再利用できるAPIは新ジョブへ進め、disposeしたAPIは再生成する。

直接factoryへ自前の共有clientを渡す場合は `ownsClient:false` を指定して寿命を管理する。通常は `createInferenceAPI()` がText/VAE共有clientの所有を処理する。Diffusion側の専用executorはその共有clientに自動参加しない。

## 保存形式と今回の確認範囲

`.wktensor` はmagic `WKTSR001`、uint32 LE header長、UTF-8 JSON header、little-endian binary payload。schemaVersion1、dtype/shape/layout/meaning/byteLength/dataSha256、任意model/mask/Tokenizer/context/latentContractを保持する。header上限65,536 B、無効shape・非有限float32・不正mask・破損payload・不整合な新metadataは拒否する。非同期hash前にpayloadだけでなくshape・識別・mask・contextもsnapshotする。SHA-256はpayload整合であり、header署名や原媒体の真正性を保証しない。

旧フィールドだけのgolden fixtureについてバイト一致を確認する。今回の接続fixtureはText `[1,2,4096]` とmask、raw mean/生成sample `[1,16,2,2,2]`、contextとmodel/Tokenizer hash、保存読戻し、変更中metadataのsnapshot、MessagePort転送後の所有権を対象とする。反復 `a/b/c` hashなどのfixture値は合成識別で、実model互換性ではない。SDK dispatchのdoubleやText lifecycleのORT doubleを実モデル推論の成功として数えない。

Text24層・既存VAE5×16×16のFP32診断記録に加え、F=1・16×16を元VAE参照と実WASMで受け入れた。Textの重い再推論は実施していない。実generated sample、実参照媒体の各ratio、832×480・81frame、全sampling/最終動画、元GPU精度と端末負荷改善は未受入。実model/profile検証と小規模codec fixtureを合算しない。

## Hikeと実行条件

Text最終RMSNormはHikeがreduction・正規化・weight乗算を行う。固定Hike WABT runtimeのsqrt primitiveだけは明示した`env.sqrt -> Math.sqrt` bridgeを使う。VAE decodeは実conv2をHike MatMul+biasに置換し、その結果をORTへ渡す。VAE encodeはrgb-unit入力の値域変換をHikeで行う。既に−1〜1の入力へ無意味な恒等計算を追加せず、raw入力経路はそのままORTを使う。kernel欠落やhash不一致をJS/ORT代替で隠さない。

ORT Web1.24.3のWASM provider、1 thread。元FP8/BF16値をFP32へ展開した検証経路であり、元GPU precisionや性能との同等性は別判定。Textは24層を1件ずつload/releaseする。元2.1GB embedding表は全量展開せず行を検証して読む。モデルファイルと実行用graphは公開資材に同梱しない。

## 接続確認の状態

同一originの外部callerから明示MessagePortを通し、実UMT5のtokenize→24層→Hike最終norm、VAEのencode→decode、取消後の再実行、異種tensor拒否を実Chromiumで検証済み。個別UIのファイル選択→処理→保存・読戻しと、不透明PNG入力→Hike値域変換→VAE encodeも検証した。透過画像は背景を勝手に決めず拒否する。

最新Diffusion APIを取得し、旧mean境界・model binding・所有権・build依存を照合した。VAE側のgenerated sample受入口とmetadataの保存契約は小規模fixtureで調整したが、対向の生成sample producer/復元と本番graphは未実装で、包括UIとの実生成接続は未確認である。API入口やfixtureの存在だけで対向の全工程を接続済みとは報告しない。

## V1受入資材と再現

受入原本は `54bfeadbd83f1fea074c503c0e05ec478aba5cfb` の `development/inference/vae-v1/RESULT.md`、`receipt.json`、`acceptance-plan.json`。同commitに全出力比較・session/Worker終了・資源記録と `tools/inference/vae/{export_profile.py,reference_still.py,accept_still.py}` を保持する。元VAE/ONNX重みは非公開bundleで供給し、source repoにはmanifest/hashと検証証拠を置く。

64要素meanは `raw-posterior-mean`、float32 NCTHW、model識別はWan2.1 VAEのまま。VAEのraw decode受入はDiffusionの64対応を意味しない。128要素の別profileへreshapeして通さず、正規化・復元はDiffusion所有とする。管理snapshot/owner/graph/build/trace/evidenceは `.wktensor` 外側へ保存する。
