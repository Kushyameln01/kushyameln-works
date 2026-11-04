# Text Encoder / VAE 外部API契約 v1

API版: `works-ai-1`。Text EncoderとVAEは独立モジュール。包括処理と一括UI、別CodexのDiffusionモジュールはこの実装に含めない。

文書revision: `STANDALONE-STREAM-1`（2026-11-02 JST）。`works-ai-1`とG1Cを維持する。新しいcausal streaming manifest、独立raw latent入力、native末尾処理の保存契約は[単体API追補](../../../development/inference/standalone-20261102/API.md)を参照する。現在の実検証範囲は[単体RESULT](../../../development/inference/standalone-20261102/RESULT.md)にTextとVAEを分けて記録する。構造上の対応域と実数値受入を区別し、通常APIに参照やreceiptを要求しない。source branchの文書であり、main/Pagesの配信更新を意味しない。generated sampleのmetadata検査は、実生成・復元・decodeの受入を意味しない。

従来の診断受入はUMT5の24層FP32経路と、Wan2.1 VAEの5×16×16・F1正方形16×16・F1 Rect16×32の各固定graphである。前revisionではRectと固定plain一件を通常実行し、既存参照を再利用した。これらのscopeを維持する。新streaming graphの対応域や一部shapeの受入を、他のshape・実生成の合格へ広げない。

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

`configure({manifest,files,diagnostics=false})` はparsed manifestとこのMapを受け、同期的にcapabilitiesを返す。manifest構造とモデル契約を検査するが、診断参照・誤差gate・過去receiptは要求しない。JSONテキストやモデルURLを直接渡さない。設定変更では同じmoduleの実行を取り消す。`capabilities().configured` は設定保持であり、全assetの読込み・推論成功ではない。`diagnostics:true`の場合だけ詳細`result.evidence`を返す。既存診断UI/harnessはこの設定を明示する。低層`runVae`も同じoptionを持つ。

## 通常のowner能力照会

既存`capabilities()`は、構成済みの一組のmanifest/graphを返す。VAEの`encode.input/output`と`decode.input/output`に完全5次元shape、dtype/layout/意味/正規化条件を返し、`graph`に操作別file/bytes/SHA、modelにdecoder識別を返す。未構成のshapeはnull。Profile名一覧から実行能力を推測しない。

```js
const caps = api.vae.capabilities({operation:'decode', input:{
  dtype:'float32', layout:'NCTHW', shape:[1,16,1,2,4],
  meaning:'raw-posterior-mean', modelSha256:vaeModelSha256
}});
// caps.support = {supported,code,reason,requiredChanges,scope}
// caps.runtime.encode/decode = {verified:false} or actual successful binding
```

照会はdata・参照・gateなしで行い、Worker/NNを起動しない。通常descriptorの検証を実dispatchと共有し、操作別local assetの存在/容量も調べる。`supported=true`は構成契約との適合で、実行成功ではない。SHAは実行時に全bytes検査し、実ORT sessionのinput/output metadataにある具体次元と、実出力の全次元を検査する。symbolic outputは任意shape対応を意味しない。成功した操作だけ`runtime[operation]`へ`verified:true`、実input/output shape・assetHashes・graphMetadataCheckedを記録する。再configure/disposeで消去し、過去の成功を変更可能なFile/Uint8Arrayの将来保証へ転用しない。

非対応codeは`NOT_CONFIGURED`、`MODULE_DISPOSED`、`OPERATION_UNSUPPORTED`、`DESCRIPTOR_UNSUPPORTED`、`MISSING_ASSET`、`ASSET_SIZE_MISMATCH`。`reason`は期待shape/不整合内容、`requiredChanges`は対応profile/graphのexport・configureやmetadata修正を示す。無断の縮小/padding/frame削減/reshape/正規化は行わない。数式F=4n+1が成立しても構成graphの完全shapeと異なれば非対応。manifestの空間8アラインと現exporterのH/W≥16かつ16倍数は`constraints`で区別する。

Textの`inputModes`はplain `[1,512,4096]`とID `[1,L,4096]`（1≤L≤512）を区別する。Text照会のinputは既存`{text}`またはID/maskで、構文とlocal filesを確認する。plainの実token数/overflowはencode時に実tokenizerで検査する。通常返却tensorのLとmaskが正本。固定prompt hash・参照・gate・`blocks[].nativePass`は接続条件にしない。

管理の既存`capabilities(q.input)` adapterを使い、別RPC methodは追加しない。管理の`tensor.axes.join('')`→`layout`、`nativeMeaning`→`meaning`と既存native metadataを照会に渡す。snapshot/owner/graph-build/traceは外側packageへ置き、strict native context/latentContractへ混ぜない。workflow形状計算と管理packageは管理側、VAE数値処理と固有shape検査は当ownerに残す。

| 設定 | manifestと必要files |
| --- | --- |
| Text | `wan-umt5-staged-fp32` / schemaVersion1 / complete true、24 blocks、opset17 / ORT1.24.3。`blocks[].path`、`finalNorm.path`、`embedding.rowHashes.path`、`embedding.sourceFile` をMapに含める。通常テキストでは `tokenizer.path` の元埋込 `spiece.model` も必要 |
| VAE | `wan21-vae-profile-v1` / schemaVersion1、Wan2.1 model binding、raw / NCTHW / opset17の固定profile。`posterior:'mean'` はencodeの平均値選択を表す。encodeには `assets.encoder.file`、decodeには `decoderBody.file/conv2Weight.file/conv2Bias.file` が必要。両操作を使う場合は全4assetを入れる。元safetensorsは準備時だけ使用し、runtimeのMapには不要 |

manifestのshapeだけを書き換えて別profileにしない。assetのbytes/SHAと実graphが一組である。`createInferenceAPI({onState})`、または各factoryでconfigureし、実行時のasset検査・失敗を必ず受け取る。

モデル準備はPythonで行い、実行時はブラウザ内のWASMを使う。元の `.safetensors` だけを選べばONNXへ自動変換されるAPIではない。今回のText実行用24 graphは合計18,523,750,008 bytesあり、元6,735,906,897-byteモデルも別に保持する。段階ロードは同時常駐量を抑えるが、保存容量を小さくする方式ではない。VAE bundleは約0.51GB。モデルの準備手順は各 `tools/inference/*/README.md` に記載する。

Textの各graphは、従来どおり全体を読み、元manifestの全bytes SHA-256を検査してからORTへ渡す。検証には既存 `shared/vr180/sha256.mjs` のincremental SHAを使い、最大8MiBの`subarray` viewごとに更新・task yield・取消/dispose検査を行う。8MiBはhash更新のview上限であり、graph全体の読込みやORTへのコピーが8MiBへ収まる意味ではない。小さいembedding rowのWebCrypto検査は維持する。アプリを複製する場合は、この共有ES moduleも同originで取得できる配置が必要となる。configureのmanifest/files Mapへ追加するモデルassetではない。

一度ずつ使うText staged sessionではORTの `extra.session.disable_prepacking='1'` を指定する。graph optimizationは元の既定all、WASM1threadを維持し、sessionは1件ずつ作成・実行・releaseする。prepacking停止だけの比較はWASM容量と時間が減ってもRSS peakが増えたため、高RSS改善の受入とはしていない。固定Hello worldの新しい全値・資源・終了比較と、旧oracle/実行sourceの区別は[計測・比較結果](../../../development/inference/text-memory-20261102/RESULT.md)を参照する。File-backed実測を、巨大Uint8Array Mapの転送コピー、任意prompt・全512有効token、本番全工程や別端末の資源保証へ一般化しない。

## モジュールとtensor境界

| モジュール | 操作 | 入力 | 出力 |
| --- | --- | --- | --- |
| Text Encoder | `encode({text})` | string。元UMT5埋込SentencePiece、EOS1/PAD0、EOSを含め最大512token。空文も可、無断切詰めなし | `[1,512,4096]` float32、BLC、`text_hidden_states`、mask、model/Tokenizer hash |
| Text Encoder | `encode({tokenIds,attentionMask})` | 整数配列または数値TypedArray、`1≤L≤512`、IDは0..256383。同長の0/1maskで少なくとも1つ有効 | `[1,L,4096]`。EOS/paddingを自動追加しない。内部mask位置・返却Lを保持 |
| VAE | `encode(tensor)` | float32、NCTHW、meaning `raw-decoder-rgb`、値域−1〜1、profileと一致するshape | float32、NCTHW、meaning `raw-posterior-mean`。乱数sample・latent正規化なし |
| VAE | `encode(tensor)` | meaning `rgb-unit`、値域0〜1のRGB | 同上。値域変換`x*2-1`はHikeで行う |
| VAE | `decode(tensor)` | float32、NCTHW、meaning `raw-posterior-mean`、profileと一致するshape/model | float32、NCTHW、meaning `raw-decoder-rgb`。clamp・色変換なし |
| VAE | `decode(tensor)` | float32、NCTHW、`wan21-raw-generated-sample:v1`、一致するprofileと下記latentContract | 同上。追加のlatent正規化・復元を行わない。契約fixtureだけを今回受入、実生成経路は未検証 |

tensorの共通表現は `{dtype,shape,layout,meaning,data:TypedArray,modelSha256?,attentionMask?,tokenizerSha256?,normalization?,context?,latentContract?}`。保存形式 `.wktensor` はバイナリpayloadとschema/shape/意味/model hash/mask/SHA-256を持ち、今回の任意metadataも検査して保存する。巨大なembeddingをJSON数値配列へ展開しない。`decodeTensor` はArrayBufferまたはUint8Array（NodeのBufferを含む）を受け、payloadを所有する新しい配列を返す。

Text embeddingはVAE latentではない。DiffusionからVAEへ接続するとき、latentの意味・shape・モデル・正規化空間を照合する。normalized latentの名前だけを変えて渡さない。モデル固有の正規化・復元はDiffusion側Hikeが担当し、管理側やVAE側へ重複実装しない。

旧 `raw-posterior-mean` の `modelSha256` はWan2.1 VAEのhashと照合し、不一致を拒否する。旧mean経路はhashの省略も維持するが、未記載ならモデル互換性が確認できたとは扱わない。生成sampleの `modelSha256` は後述する生成側producer列と照合し、decoder VAEは別フィールドで結び付ける。

VAE通常結果は`{tensor,inputDescriptor,binding}`。`inputDescriptor`はdataを含まない所有された入力metadataで、入力sampleのproducer/decoder/復元契約とcontextをdecode後も保持する。`binding`は成功した操作の実shape・asset hashes・graph検査状態で、参照や誤差receiptではない。管理はRGBの`.wktensor`と外側のinputDescriptorを共に保存する。RGB単体から入力sampleの来歴を復元できるとは扱わない。`describeTensor(tensor)`を公開APIから利用できる。

## Text Encoderの出力契約

通常出力は `{tensor,attentionMask,inputMode}`。`tensor.attentionMask`はUint8Array `[L]`で、同じmaskをtop-levelにも返す。`tensor.normalization='umt5-final-rmsnorm-f32-v1'`は、実Hikeのweighted encoder.final_layer_norm、epsilon1e-6適用済みを表す。weight SHAは構成済みcapabilitiesのfinalNormalizationへ返す。無効行は0、内部maskを保持し、末尾mask0の計算省略後も返却Lを復元する。詳細evidenceは診断opt-in時だけ追加する。

| 識別 | 固定値 |
| --- | --- |
| `tensor.modelSha256` | `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`（元UMT5） |
| `tensor.tokenizerSha256` | `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`（元埋込SentencePiece） |
| `inputMode` | `plain-text` または `token-ids`（Worker API経路。診断時はevidenceにも保持） |

通常テキストはBOSなし・EOS1を追加・PAD0で512まで埋める。lowercase/cleanText、暗黙のtask prefixは適用しない。直接ID経路はIDの範囲・maskを検査するが、呼出し元が本当に同じTokenizerでIDを作ったことを数列から証明できない。Tokenizer hashはモデルに対応する期待識別であり、任意のID列の出所認証ではない。textとID/maskを同時指定する曖昧な入力は拒否する。512はAPIの上限であり、全512位置が有効な入力の性能・全promptでの数値受入まで検証したという意味ではない。

Bernini system promptの構築、negativeの選択と実際の文字列・line breakは管理側が保持する。ComfyUI固有の括弧によるprompt重み、custom/textual embedding、clip-skip、別encoder、pooled outputは未対応。通常テキストのhidden statesだけで元conditioning全体を再現したとは扱わない。Diffusionの `requireWanConditioning` と保存wrapperは、Tokenizer hashがあれば一致を検査して保持する。旧ファイルでhashが無い場合の既存受入は維持するが、Tokenizer識別まで確認済みとは扱わない。

## VAE profileの棚卸しと受入条件

すべてfloat32 / NCTHW、N=1。従来の固定profile exporterは `F=4n+1`、H/Wが16以上の16倍数を要求する。追加した `wan21-vae-stream-v1` はencodeの元入力 `1≤F≤81` とH/W16..848の16倍数を受け、`T=1+floor((F-1)/4)`、空間 `H/8,W/8` を返す。完全な4frame群に入らないnative末尾は `frameProcessing` へ記録し、元入力shapeと全frame対応を保持する。decodeは `1≤T≤21` から `1+4*(T-1)` frameを返す。固定exporterの制約とstream runtimeの対応域を区別する。モデル構造の8アラインへ無断で緩めない。

| 用途 | RGB shape | latent shape | 状態 |
| --- | --- | --- | --- |
| 既存公開bundle | `[1,3,5,16,16]` | `[1,16,2,2,2]` | `wan21-raw-f32-5x16x16`。既存FP32参照・ブラウザ受入を保持 |
| F=1正方形診断bundle（非公開） | `[1,3,1,16,16]` | `[1,16,1,2,2]`（64要素） | `wan21-raw-f32-1x16x16`。元VAE FP32全出力・実Hike/ORT WASM受入済み。実workflow参照媒体ではない |
| F=1非正方形診断bundle（非公開） | `[1,3,1,16,32]` | `[1,16,1,2,4]`（128要素） | `wan21-raw-f32-1x16x32`。元FP32全出力と実Hike/ORT WASM受入済み。既存128要素profileとshape/時間軸が異なる |
| 元workflowのsource/video grid | `[1,3,81,480,832]` | `[1,16,21,60,104]` | 新69-unit stream graphをexport済み。全81frameの数値受入状況は単体RESULTを参照 |
| 最終decode | `[1,3,81,480,832]`へ復元 | `[1,16,21,60,104]`からdecode | 同じgridでも生成sampleとmeanは別契約。実生成経路は今回の単体受入外 |
| 静止参照画像、workflow gridを使う場合 | `[1,3,1,480,832]` | `[1,16,1,60,104]` | 新stream graphで独立参照・実WASMのencode/raw decodeを受入。全slotをこの寸法へ変える意味ではない |
| 異なるratioの参照画像 | `[1,3,1,H_ref,W_ref]` | `[1,16,1,H_ref/8,W_ref/8]` | stream域内の実寸法をそのまま受ける。構造的対応と当該shapeの数値受入は別。848×848を実媒体の寸法と推測しない |
| 別ratio／長さの参照動画 | `[1,3,F_ref,H_ref,W_ref]` | `[1,16,1+floor((F_ref-1)/4),H_ref/8,W_ref/8]` | stream域内は元F/H/Wとnative末尾を保持。域外は具体shapeをcapabilitiesへ照会し、graph/runtime追加を検討。例workflowのreference_video接続とは別 |

workflowの81×480×832はRGB単体388,177,920 B、latent単体8,386,560 B（2,096,640要素）。重み、activation、時間cache、copyを含むピークRAMではない。従来の固定128要素mean変換profileのscopeには収まらない。最新Diffusionの対応可否は対向の構成済みcapabilitiesで確認し、VAEのshapeだけで接続合格や生成READYを判断しない。

Bernini例の `ref_max_size=848` は長辺上限であり、実参照画像が848×848という情報ではない。元nodeのresize/crop式と実媒体の寸法・EXIF・frame数は別に照合する。今回、縮小、padding、末尾切断、frame削減、縦横の入替えを追加・実行しない。受入済み5-frame graphをF=1や81へ流用せず、manifestだけの書換えも行わない。

従来の固定profile方式の受入は、(1)実入力とrole/slot/F/H/Wを確定、(2)固定原VAE194 keys・FP32参照の全出力を保存、(3)新しい非公開bundleへopset17の固定exportとSHA/shape記録、(4)比較前に数値gateを固定、(5)実ブラウザで入力→Hike/ORT→全結果回収・照合・取消/解放・copy/cache/OS側RAM計測、(6)同じshape・意味の対向tensor接続、をprofileごとに行う。F=1・16×16と16×32の診断profileを個別export・実WASMで受け入れた。他のshapeへ合格を流用しない。小profileの0.002 gateや合格を大動画の画質・負荷へ自動転用しない。新stream方式ではdynamic unitとnative causal runtimeを別実装として扱い、比較前に登録した独立参照・新domain gateで全出力を検証する。

## Diffusionから受け取る生成sample

旧 `raw-posterior-mean` はVAE encodeの平均。Diffusionの `normalizeRawMean` → `wan21-normalized-posterior-mean:v1` → `restoreRawMean` → raw mean、という現行128要素経路を保持する。`restoreRawMean`へ生成sampleを渡したり、meanへ改名したりしない。

生成sample用のVAE受入口は次の追加schemaを使う。これはVAE側の宣言検査契約であり、実producer・Diffusion所有の復元・対応decodeの数値受入は別工程である。今回の単体raw decodeは独立latentで検証し、対向の実generated sampleを待たない。

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

latentは有限float32であり、RGBのような単一の `[-1,1]` / `[0,1]` 範囲を課さない。raw値のclampや推測したscalar scale/shiftは行わない。channel別mean/std、FP32順序、`wan21-comfy-f32-v1` による復元はDiffusionが所有する。VAEは復元済みraw値へ実conv2とdecoder bodyを適用し、正規化・復元は追加しない。診断時は`evidence.normalizationApplied=false`も返す。RGB出力のmodelSha256は実際のVAE識別であり、入力producer hashの付替えではない。入力model hashとlatentContractは通常inputDescriptorに保持し、診断時はevidenceにも残す。

`restored` はproducerによる宣言で、metadataだけから変換の実行・二重適用の不存在・モデル互換性を証明できない。元normalized tensor、復元操作/build、前後payload hashを対向側で対応付けて数値比較する。未復元・normalized meaning・違うdecoder bindingは拒否する。対向の生成能力とREADYは最新の構成済みAPIで判断し、VAEのmetadata fixtureや独立raw decode合格だけで解除しない。

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

`meaning='wan21-normalized-posterior-mean:v1'`に有効な`normalization:'wan21-comfy-f32-v1'`が供給された場合、その文字列も非同期hash前にsnapshotしheaderへ保存する。marker省略時は新たに補わない。raw mean/sampleへの矛盾したtop-level markerと不明な規約は従来どおり拒否する。数値の正規化・復元は実行しない。

magic/schemaVersionは変更しない。旧markerなしファイルは読取り可能で、省略されたmarkerを補わず再保存する。markerなしの旧mean/conditioning等の直列化bytesは維持する。旧G1C reader `2c171a09ccda65c54899f322ae490f1bfcaac6fb` は新しい任意headerも読めるが、同じ旧writerで再保存するとmarkerを失うため、保存用途では新しいcodec source/hashを明示選択する。管理E4の旧pinを同名で差し替えず、新candidate sourceRefと実module SHAを登録する。

過去のlatent marker修正sourceは`2bdca59ea78580d4fe7a9d31a8de33209b64d029`、module SHA-256は`d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5`。今回のText marker対応sourceと同一ではない。Textの`normalization:'umt5-final-rmsnorm-f32-v1'`も任意headerとして保持し、float32/BLC/text_hidden_states以外や未知markerは拒否する。markerなし旧Textはそのまま有効で、markerを推測して補わず旧bytesを保つ。旧writerによるmarker消失は自動補完しない。[旧管理E4手順](../../../development/inference/codec-marker-handoff/REPRODUCE.md)と[今回の通常API検証](../../../development/inference/owner-capabilities-20261102/RESULT.md)を分けて参照する。別管理環境の取得ACKと送付側検証は別である。

旧フィールドだけのgolden fixtureについてバイト一致を確認する。今回の接続fixtureはText `[1,2,4096]` とmask、raw mean/生成sample `[1,16,2,2,2]`、contextとmodel/Tokenizer hash、保存読戻し、変更中metadataのsnapshot、MessagePort転送後の所有権を対象とする。反復 `a/b/c` hashなどのfixture値は合成識別で、実model互換性ではない。SDK dispatchのdoubleやText lifecycleのORT doubleを実モデル推論の成功として数えない。

marker修正までの受入は、Text24層・既存VAE5×16×16のFP32診断に加え、F=1・16×16と16×32の元VAE参照・実WASM比較である。その工程ではTextの重い再推論を実施していなかった。実generated sample、実参照媒体の各ratio、832×480・81frame、全sampling/最終動画、元GPU精度と端末負荷改善は引き続き未受入。実model/profile検証と小規模codec fixtureを合算しない。

上記は元のmarker修正時点の履歴である。今回の追加受入では、管理60d16/native855/storage2bdを選択し、実Rect normalized保存→owner restore→同復元meanの新decode→RGB全1536値の実管理保存読戻しを確認した。固定plain `Hello world`は、未短縮512位置の独立PyTorch source referenceに対し実plain WASM/Hike出力 `[1,512,4096]`全2,097,152値を比較し、maxAbs `3.4570693969726562e-6`（元gate.001）とpadding厳密0を確認した。このP2/P3時点ではbrowserの最大単一process RSSが約5.66GBで4GiB目安を超え、資源改善は未受入だった。その後の固定Hello worldに限定したRSS低下・時間増の比較は [資源比較](../../../development/inference/text-memory-20261102/RESULT.md)、今回のNode/Browser別の測定は [Text単体結果](../../../development/inference/standalone-20261102/TEXT-RESULT.md) を参照する。任意prompt/512有効token性能、ComfyUI conditioning全体、現固定N2 tailでのcross-attention消費へ一般化しない。[新規実行・再利用・source・資源の分離](../../../development/inference/p2-p3-acceptance/RESULT.md)、[conditioning実data契約](../../../development/inference/p2-p3-acceptance/conditioning/manifest.json)、[P6不足shape](../../../development/inference/p2-p3-acceptance/p6/SOURCE-SLOT-SHAPES.md)を参照する。

追加884のjoint runnerでは、同じ復元mean `[1,16,1,2,4]`から新しい実decodeを正常・取消復帰で再実行し、各RGB1536値のmaxAbs `4.328787326812744e-6 <= 2e-5`を維持した。normalized marker、raw/normalized/restoredのE4 package、context/frame配列、owner/queue、decode入力とRGB保存を各`jointTraceId/currentInputLink`で結んだ。[新884実記録](../../../development/inference/p2-p3-acceptance/p2/updated-884/observer-result.json)のobserver実行sourceはe150e7ac3c4859739528ff278763c6474968ac08、管理は8849891f19124df31847bd691503c2491278eaa8、native855/storage2bd/mean5fは維持する。旧60dの実行を新sourceへ付け替えない。新P4 captureの構造受入と固定L4診断はDiffusion829の別境界であり、本実Textのcross-attention消費は未受入。新配布に対する管理・Diffusion自身のsource取得ACKと最終共同照合は別条件として残す。

## Hikeと実行条件

Text最終RMSNormはHikeがreduction・正規化・weight乗算を行う。固定Hike WABT runtimeのsqrt primitiveだけは明示した`env.sqrt -> Math.sqrt` bridgeを使う。VAE decodeは実conv2をHike MatMul+biasに置換し、その結果をORTへ渡す。VAE encodeはrgb-unit入力の値域変換をHikeで行う。既に−1〜1の入力へ無意味な恒等計算を追加せず、raw入力経路はそのままORTを使う。kernel欠落やhash不一致をJS/ORT代替で隠さない。

ORT Web1.24.3のWASM provider。Textと旧固定VAEは1 thread、新stream VAEはmanifestで明示した1または4 thread。4 threadはcross-origin isolationとSharedArrayBufferを要求し、暗黙にfallbackしない。元FP8/BF16値をFP32へ展開した検証経路であり、元GPU precisionや性能との同等性は別判定。Textは24層を1件ずつload/releaseする。元2.1GB embedding表は全量展開せず行を検証して読む。モデルファイルと実行用graphは公開資材に同梱しない。

## 接続確認の状態

同一originの外部callerから明示MessagePortを通し、実UMT5のtokenize→24層→Hike最終norm、VAEのencode→decode、取消後の再実行、異種tensor拒否を実Chromiumで検証済み。個別UIのファイル選択→処理→保存・読戻しと、不透明PNG入力→Hike値域変換→VAE encodeも検証した。透過画像は背景を勝手に決めず拒否する。

これまでに取得したDiffusion APIとの旧mean境界・model binding・所有権・build依存の照合を履歴として保持する。VAE側のgenerated sample受入口とmetadataの保存契約は小規模fixtureで調整済みだが、今回の単体受入は独立raw latentを対象とする。最新producer/復元の実行能力はDiffusion側の構成済みcapabilitiesで確認し、包括UIとの実生成接続は別に検証する。API入口やfixtureの存在だけで対向の全工程を接続済みとは報告しない。

## V1受入資材と再現

受入原本は `54bfeadbd83f1fea074c503c0e05ec478aba5cfb` の `development/inference/vae-v1/RESULT.md`、`receipt.json`、`acceptance-plan.json`。同commitに全出力比較・session/Worker終了・資源記録と `tools/inference/vae/{export_profile.py,reference_still.py,accept_still.py}` を保持する。元VAE/ONNX重みは非公開bundleで供給し、source repoにはmanifest/hashと検証証拠を置く。

64要素meanは `raw-posterior-mean`、float32 NCTHW、model識別はWan2.1 VAEのまま。VAEのraw decode受入はDiffusionの64対応を意味しない。128要素の別profileへreshapeして通さず、正規化・復元はDiffusion所有とする。管理snapshot/owner/graph/build/trace/evidenceは `.wktensor` 外側へ保存する。

## E6のprofile境界と対向差分

非正方形profileの固定manifest/graph hash、入力fixture、全値比較、終了・資源記録と再現CLIは `development/inference/e6/RESULT.md`、`REPRODUCE.md`、`receipt.json` に保持する。受入は元サイズ32×16の診断画像一件。実workflowのslot/reference、81frame、実generated sampleは未受入である。

取得したDiffusion `f522d9aeff313558c4ef83022a340af9a4c21391` はmean変換を既存 `[1,16,2,2,2]` の128要素に限定する。64要素 `[1,16,1,2,2]` と、同じ128要素でも別shapeの `[1,16,1,2,4]` は拒否される。VAEの各raw decode単独受入を、Diffusion正規化/復元との結合受入に読み替えない。変換はDiffusion所有で、VAE/管理へ複製しない。

同f522版のmean変換・旧codec/wrapperはG1C context/Tokenizer情報を全て保持しなかった。これは以下の新しい版を取得する前の固定版観測として保持する。

追補照合したDiffusion `438972f30242e0a3bc66edb8591f38eaa0fcd384` は、実Hikeの64要素profile専用経路と直接mean変換のcontext所有コピーを追加している。実64 mean→owner正規化→明示G1C codec保存読戻し→owner復元→既存F1 VAE raw decodeを限定scopeで確認した。正規化/復元の数値処理はownerの実装を呼び、VAEへ複製していない。新非正方形 `[1,16,1,2,4]` は依然未対応で、legacy guard/writerは128要素旧profile限定のままである。

このVAE作業branch内の既存Diffusion runtimeを438へ置き換えたものではない。64要素のこの結合には、[owner438の固定API](https://github.com/Kushyameln01/kushyameln-works/blob/438972f30242e0a3bc66edb8591f38eaa0fcd384/docs/shared/diffusion-models/API.md)と対応する実module/kernel/receiptを別に取得して明示選択する。相対URLの既存Diffusion実装やmain版まで64対応済みとは扱わない。

438版も旧storage codec/wrapperのG1C metadata完全保存は未成立なので、原native artifact/metadata/evidenceを外側で保持し、G1C codecを明示選択する。取得した管理 `a26879057d169cb2eecff30503d64adba5057c52` のadapter/packageは、実G1C codecを指定したNode検査で情報保全を確認した。これは全管理ブラウザ工程、Diffusion RPC全経路、実generated sampleや全生成の受入を意味しない。初期21e77f取得待ちの記録は歴史として保持する。

モデル/ONNXは従来の非公開bundle入力を維持する。source branchへはmanifest/hash・診断fixture・全出力参照・計測証拠・再生成/検証手順を含め、約499MBの神経graphとモデル原本は同梱しない。

## 現行の単体能力と管理接続（2026-11-04）

上記の固定版照合は履歴である。現行stream VAEの入力域・実装・受入は
[単体API](../../../development/inference/standalone-20261102/API.md)と
[VAE結果](../../../development/inference/standalone-20261102/VAE-RESULT.md)を参照する。
N=1、RGBはfloat32 NCTHW、encode F=1..81、H/W=16..848の16倍数。
実処理Fは `1+4*floor((F-1)/4)`、出力Tは `1+floor((F-1)/4)`。
元入力のsourceContextと実処理context/frameProcessingを区別し、末尾を隠して捨てない。
decodeはT=1..21、latent h/w=2..106の偶数で、出力F=`1+4*(T-1)`、H/Wは8倍。
構成する固定graphまたはstream graphの実能力をcapabilitiesで返す。

Textのplainは `[1,512,4096]`、ID入力は `[1,L,4096]`（L=1..512）。
float32 BLC、binary mask、model/Tokenizer SHA、`umt5-final-rmsnorm-f32-v1`
を通常tensorから取得でき、既存codecが保持する。system/negativeの組立ては管理側。
weighted prompt/custom embeddingは未対応。合法なID0を禁止せず、最終gateを引き上げない。
選択manifestの `blocks[].attentionLowering` は元asset SHAと実行graph SHAを分離する。
実行時は元bytesを検証後、同一bufferの2 scalarだけを変更し、実行hashを検証する。
通常返却の `graphBindings` はtensor外に置く。候補の数値合否・採用状況は
[今回の結果](../../../development/inference/management-20261104/RESULT.md)に従う。

新しい実装 `management-adapter.mjs` の `createManagedInferenceBridge` は、
実管理のadapter/queue/workspaceとnative APIを注入して実行・取消・保存・読戻しを行う。
詳細は[管理接続API](../../../development/inference/management-20261104/API.md)。
通常入口へ独立参照・誤差gate・過去receiptを要求しない。current native codecを注入する。
decodeでは入力raw artifactとRGBを同じpackageへ保持し、元producer/decoder bindingと
inputDescriptor、graphBindingsを外側trace/sourceRecordsへ保存する。
取消は元呼出しと管理releaseの終端を待ち、未dispatch取消も解放してから再実行する。

復元済み `wan21-raw-generated-sample:v1` は、その意味とproducer/decoder bindingのまま
decodeする。posterior meanへの改名やVAE側での追加復元を行わない。
実Diffusion復元APIを通したsynthetic保存入力の部分接続と、実producer生成の全体実験は
別の受入である。実P4 captureによる情報保持も投影/cross-attentionの実行とは区別する。
