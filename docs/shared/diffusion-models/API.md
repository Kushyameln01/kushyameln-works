# diffusion_models 外部API 0.1

このAPIは同じページのES module、または呼出し側が明示して渡した専用MessagePortから利用する。全体UI、Text Encoder、VAEのAPIを実装・推測しない。HTTP・WebSocketサーバーやグローバルなwindow message listenerは設けない。静的HTTP(S)配信とWorker/WASMを利用できるブラウザが必要。

現在動く操作は、safetensorsのヘッダー検査、実Hike WASMのEuler・固定scheduler・noise/flow更新・Wan21 posterior-mean正規化と復元、公開Text Encoder/VAEのtensor境界検査、Hike→ORT WASM→Hikeによる固定Q射影の部分演算。API版0.1に操作を追加し、既存envelopeは維持している。`load`・`predict`・`sample`は常に構造化エラーで拒否する。モデル推論の実装・変換・利用経路完成を意味しない。

## 同一ページの呼出し

```js
import {createDiffusionModels, PROTOCOL_VERSION, BUILD_ID} from './api/index.mjs';
const api = createDiffusionModels();
const response = await api.request({
  protocolVersion: PROTOCOL_VERSION,
  buildId: BUILD_ID, // 任意。指定する場合はこの配布版と一致すること
  sessionId: api.sessionId,
  jobId: 'step-1',
  inputRevision: 0,
  op: 'eulerStep',
  input: {
    latent: new Float32Array([3, 7, -2]),
    denoised: new Float32Array([1, 3, 2]),
    sigma: 2,
    nextSigma: 1
  }
});
// status='ok', result.latent = Float32Array [2,5,0]
api.dispose();
```

全requestにはprotocolVersion、sessionId、jobId、inputRevision、opを含める。sessionId/jobIdは1〜128文字の英数字と `_ . : -`。inputRevisionは0以上のsafe integer。responseはこれらと固定buildIdを返し、`status: 'ok', result` または `status: 'error', error: {code,message,details?}` を持つ。

| op | input | 結果・状態 |
| --- | --- | --- |
| capabilities | `{}` | modelInference=false、partialOnly=true、各利用可能操作=true、maxTensorElements=1048576、buildId等 |
| inspect | `{file: File または Blob}` | ヘッダーと実file長を照合したtensor一覧・payload容量・headerSHA256・readiness |
| eulerStep | `{latent,denoised,sigma,nextSigma}` | Float32Arrayの更新結果と実WASM hash、memoryBytes |
| schedule | `{profile:'bernini-comfy-simple6-shift5-v1'}` | Hikeによる7 sigma境界、HIGH/LOW各4境界、6 modelTimesteps、tableIndices |
| noiseMix | `{noise,latent,shape,sigma,noiseScale}` | Hike CONST mix。`noiseScale`は明示した有限非負数 |
| inverseNoiseScale | `{latent,shape,sigma}` | Hike CONST inverse。sigma=1は特異点として拒否 |
| flowDenoised | `{input,velocity,shape,sigma}` | Hikeによるvelocity→denoised変換 |
| validateConditioning | `{tensor}` | 公開UMT5由来のBLC float32 `[1,L,4096]`・mask・producer hashを検査しmetadataだけ返す |
| validateRawLatent | `{tensor}` | 公開Wan2.1 VAEのraw mean NCTHW `[1,16,2,2,2]`・producer hashを検査しmetadataだけ返す |
| normalizeRawMean | `{tensor}` | 実Hikeで公開固定profileのraw posterior meanをWan21正規化空間へ変換。所有tensorと証拠を返す |
| restoreRawMean | `{tensor}` | version付きnormalized posterior meanを実Hikeでraw meanへ復元。生成sampleをmeanへ言い換えない |
| linearProjection | `{q,scale,bias,x}` | 実Hike FP8復号→ORT WASM Gemm→Hike biasの固定部分演算。output16要素と証拠 |
| load | `{file: File または Blob}` | 先にヘッダー検査を行い、その後NOT_READY。大容量モデルはdetails.reasonsにSINGLE_WASM32_MEMORY_EXCEEDED |
| predict / sample | `{}` | NOT_READY。仮のニューラル出力や注入predictorを返さない |
| cancel | `{jobId: 対象jobId,inputRevision: 対象revision}` | 自分が所有する実行中Workerだけ終了。対象のPromiseはCANCELLEDで終端化 |
| dispose | `{}` | Workerを終了し以後の呼出しをDISPOSEDで拒否 |

公開メソッド `api.cancel({sessionId,jobId,inputRevision})` も同じ対象を取り消す。`api.dispose()` は冪等である。取消後の次requestではWorkerを再生成できる。dispose後は再利用できない。

同じinputRevisionで実行中の別requestはBUSY。より古いrevisionはSTALE_INPUT。より新しい有効なrevisionを受けると旧Workerを終了し、旧PromiseをSTALE_INPUTで終端化して新requestへ移る。旧Worker・異なるbuild/session/job/revision/opの返信は現在の結果へ採用しない。build不一致で待機する場合も明示cancel/disposeが利用できる。

Eulerの上限1,048,576要素は、このAPIの作業予算。モデル全体の対応上限という意味ではない。Float32Arrayの長さ一致・有限値・sigma条件を検査する。固定workspaceのHike関数を最大65,536要素ずつ呼び、同じelementwise式の結果を結合する。この分割はニューラルグラフや時間・空間tensorを分割して推論する機能ではない。callerの入力配列は変更・detachしない。結果は独立した所有buffer。

noiseMix / inverseNoiseScale / flowDenoisedはFloat32Arrayと正のshapeを要求する。shape積と配列長を一致させ、1 tensorあたり1,048,576要素まで、NaN/Infinityを拒否する。結果は `{data: Float32Array,shape,operation,normalizationApplied:false,evidence}`。これら3つの低水準primitiveは入力空間を変換せず、出力をraw latentへ自動でラベル付けしない。raw meanとの接続に必要な数値変換は、本DiffusionモジュールのnormalizeRawMean / restoreRawMeanが担当する。包括UIは呼出し順・待機列・入力出力の受渡しを担当する。schedulerは固定ComfyUI版のsimple6・shift5・split3だけを提供し、別profileへ黙って切り替えない。noise配列は呼出し側から渡し、seedからの乱数再現は実装しない。

normalizeRawMean / restoreRawMeanはこのDiffusionモジュール内の明示的なHike処理である。公開VAE固定profile `[1,16,2,2,2]` とVAE model hashを照合し、ComfyUI固定版の16 channel mean/stdとFP32演算順で変換する。rawのmeaningは `raw-posterior-mean`、正規化後はversionを含む `wan21-normalized-posterior-mean:v1`。結果は `{tensor,normalizationApplied:true,evidence}` で、tensor.dataは所有されたFloat32Arrayとなる。raw0も数値式どおり非0へ変換し、無断のzero特別扱いを加えない。全sampling内のzero判定やHIGH/LOW orchestrationを実装済みとは扱わない。

接続調整 `connection-1` では、この既存mean変換の数値処理を変えずに任意の `tensor.context` を所有コピーで保持する。元入力・slot・元frameの対応を保持し、変換後payloadのhashやcontext列の順序・正負共有は管理側が別に記録する。

normalized meanのmeaningに版を含めるため、公開 `.wktensor` codecの保存・読戻しを通しても復元可能。追加の `normalization:'wan21-comfy-f32-v1'` は保存形式が保持しない説明属性であり、復元時に省略可能だが、値がある場合の不一致は拒否する。意味・shape・producer hashを揃えただけで任意の生成sampleをposterior meanへ再分類しない。復元はこの固定mean契約の入力だけを受け入れる。

linearProjectionの入力は `q:Uint8Array(81920)`（16×5120 E4M3FNコード）、`x:Float32Array(5120)`、`bias:Float32Array(16)`、正の有限scale。出力は `output:Float32Array(16)` とHike/ORT/hash・copy量等のevidence。これは単一の固定Q射影であり、attention全体、1 stepのモデル予測、samplingではない。準備されたモデル値と明示activationを調べるための部分APIである。`load/predict/sample`はこの操作の追加後もNOT_READYのまま。

validateConditioningとvalidateRawLatentはtensor本体を返さず、dtype/shape/layout/meaning/byteLength/modelSha256と必要なmaskを返す。Text Encoderのhash `c3355d...`、VAEのhash `2fc39d...`、Bernini diffusionモデルhashは別の識別子であり混用しない。出所hash未記載を検証済みにはせず拒否する。VAE公開固定profile以外のshape、normalized latentをrawと名付けた入力も拒否する。Conditioningは公開上限512 tokenを保ち、このmetadata検査の範囲をpointwise演算の1M要素予算と混同しない。

バイナリ保存は `./tensor-interop.mjs` のencode/decodeWanConditioning・RawLatentから公開済み `.wktensor` codecを使える。独自形式を追加せず、encode開始時にdata/shape/mask/hash、decode開始時に期待producer bindingを所有snapshotへ固定し、非同期hash中のcaller変更から保存内容を保護する。これらのcodec wrapper自体は数値正規化を行わず、変換は上記Hike操作が担当する。

Text conditioningの任意 `tokenizerSha256` は、値があれば元埋込SentencePieceの `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458` と照合し、保存wrapperでも保持する。旧tensorでTokenizer識別が無い受入は維持するが、その場合にTokenizerの同一性まで確認済みとは扱わない。通常テキストhidden statesだけでBernini system prompt・negative選択・ComfyUI重み構文全体を再現したとはしない。

## Text/VAE・管理側との接続調整 `connection-1`

調整の基点はmain `a33b311e45a75a6c683242286fef608c7b3770a9`。API protocol `diffusion-models/0.1` とText/VAE `works-ai-1` は維持する。今回の変更はローカル接続契約と小規模fixtureまでで、公開や重い全工程推論を自動実行しない。

VAE側へ、meanとは別の **`wan21-raw-generated-sample:v1`** 受入口を追加した。生成sampleのschemaはfloat32 NCTHW、選択したVAE profileと完全一致するshape、有限値（RGBのscalar範囲へclampしない）に加え、次の宣言を必須にする。

```js
latentContract:{
  schemaVersion:1, representation:'generated-sample', space:'raw',
  vaeModelSha256:actualDecoderVaeHash,
  producerModelSha256s:actualGeneratorModelHashes,
  normalization:{id:'wan21-comfy-f32-v1',state:'restored',owner:'diffusion_models'}
}
```

`vaeModelSha256` は元Wan2.1 VAE `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b` とのdecoder binding。生成側model hash列は非空・重複なしとし、HIGH/LOW両者が寄与したなら両者を保持する。任意の既存 `tensor.modelSha256` はそのproducer列に含まれることを要求し、VAE hashへの付替えは拒否する。単一primaryのないmulti-expert sampleではこの旧単数fieldの省略を認める。header hashとモデル全体のSHAを混同しない。

これはVAE consumerの宣言検査であり、現Diffusion APIがgenerated sampleを返すという意味ではない。`predict/sample` は引き続きNOT_READY、生成sample用の数値復元操作も未実装である。`restoreRawMean`・`requireWanRawLatent`・raw mean codec wrapperへsampleを改名して渡さない。現在のmean用128要素Hikeカーネルはそのまま限定し、別shapeや生成sampleに対応したと扱わない。

実生成経路ではDiffusion側がversion付きchannel別の正規化・復元を所有し、元normalized tensorとraw出力の数値・前後hash・buildを照合してから上記 `restored` 宣言を返す。管理側/VAE側はその数値変換を重複実装しない。宣言metadataだけで復元の実施、二重適用の不存在や実model互換性を証明できない。VAEはraw sampleに対して再復元を行わない。

元workflow832×480・81frameのlatentは `[1,16,21,60,104]`、2,096,640要素。VAE受入済みprofileと現在のmean変換shapeから外れ、公開pointwise上限1,048,576要素も超える。静止参照F=1、各ratioの画像/動画、最終decodeは別のprofile export・参照比較・ブラウザ受入が必要。縮小・padding・frame削減を暗黙に追加して固定profileへ収めない。

管理側は原入力hash、slot/frame、contextId、ordered context列、正負への共有、profile/manifest/graph/model/Tokenizer/build識別、工程と待機列、横断直列化、取消/失敗を保持する。Diffusion本番graphのcontext消費形式・結合軸・maskと順序はまだ別に確定する。shapeが異なるcontextを管理側が勝手にstack/concat/resizeしない。

共通のmetadata、VAE configure・profile一覧・Text入力モード・保存schema・所有権は [Text/VAE API](../inference/API.md) を参照する。`.wktensor` は既存WKTSR001/schemaVersion1を維持し、任意のTokenizer/context/latentContractを追加保存する。raw latent上の矛盾したnormalization markerは保存時にも拒否し、保存で消して受入口を迂回させない。今回のfixture合格と既存の実モデル受入記録は別に報告する。

ORT・scheduler・tensor境界ヘルパーは対応操作で初めてWorker内へ読み込む。capabilities・inspectだけでORTを初期化しない。同時に重い処理を並列実行せず、cancel/disposeはこのAPIの専用Workerを終了する。partial演算の取消後も次requestで新Workerを作れる。

inspectは最初の8 bytesと最大8 MiBのヘッダーだけを読む。dtype/shapeからの正確なbyte長、offset範囲、隙間・重複、実file終端を確認し、全payloadを読み込まない。headerSHA256はヘッダーのみのhash。`fullFileSHA256=null`、`fullFileHashStatus=NOT_COMPUTED_HEADER_ONLY`で、重みやモデルの完全hash検証を行ったと誤認させない。

検査の制限: JSON.parseが重複キーを後の値で置き換えるため、同じtensor名が重複した不正JSONの厳密拒否は未対応。このinspectはparsed descriptorの構造・範囲検査であり、safetensors形式全体や重み内容の検証を保証しない。厳密なimportが必要なモデル推論経路は現在NOT_READY。

## MessagePort

```js
import {createDiffusionModels, attachDiffusionPort} from './api/index.mjs';
const api = createDiffusionModels();
const {port1,port2} = new MessageChannel();
const detach = attachDiffusionPort(port1,api);
// port2は呼出し側コーディネーターへ、明示した経路で渡す。
// 同じrequest envelopeをport2.postMessage(request)で送り、onmessageでresponseを受信。
// 先にapi.sessionIdをコーディネーターへ知らせる。
// 終了:
detach(); // このportだけを閉じる。APIやWorkerはdisposeしない。
api.dispose();
```

配列はJSON化せずstructured cloneで渡す。呼出し側からWorkerへのtransferは行わず入力所有権を保つ。Workerは自己所有の結果bufferをhostへtransferし、MessagePortアダプターはその結果をstructured cloneで返す。異なるWASM Memory間のpointer共有やzero-copyは保証しない。ポートを閉じるだけではAPIをdisposeしないため、所有者は終了時にapi.disposeを呼ぶ。

## buildと検証

```sh
python tools/diffusion-models/build-info.py
python tools/diffusion-models/build-info.py --check
python tools/diffusion-models/test-build-info.py
node tools/inference/test-connection-contract.mjs
```

新しい `tools/diffusion-models/build-info.py` は、記録済みの集約方式（source hash辞書のkey順compact JSONのSHA-256）でhost/workerが共有するBUILD_IDを再生成する。元の `api/build-info.py` はこのcheckoutに欠落していたため、元scriptを回収したとは扱わず、新script自身のhashを代わりに記録する。対象sourceはAPI、Euler/scheduler、mean latent-space、tensor interopと共通codec、LoRA入出力/sourceとそのSHA実装、ORT bridge/runtime、固定参照manifest。対象を変えたら再生成し、`--check` で現在sourceとの一致を確認する。kernelやモデルを再buildする操作ではない。build-info.mjs自体・テスト・READMEはhash対象外。

LoRA追加後は対向source版 `679a72d7f53e31bccecbee46b4e2fe559a4e0aba` と同じ34 sourceを対象にし、generatorだけは上記のtools側self hashを維持する。対向の元builderは同source版から読取り照合できるが、mainへの統合では既存generatorのatomic更新／`--check`を維持し、二つのgeneratorを混在させない。API版・tensor schema・モデル数値処理はこのbuild識別調整で変更しない。

元作業のRED/GREENブラウザ記録は `development/diffusion-models/` に保存されている（元作業用 `api/test/browser-check.cjs` 自体はこのcheckoutに含まれない）。その実Worker・MessageChannel・Hike/ORT WASMの22ケースは固定schedule、noise/flow、raw meanの16 channel正規化と復元・codec、境界拒否、部分射影、取消・再実行を対象にした。追加の各15.57 GB LOW/HIGHのFile検査もheader/構造照合であり、loadはNOT_READYのままだった。これらを今回の再実行やモデル全体の推論合格として数えない。今回の追加確認は上の小規模fixtureとreceipt整合で、重い全工程推論は実施しない。

## LoRA重みの入力

LoRA用に `inspectLora` / `loadLora` / `listLoras` / `readLora` / `readLoraSource` / `unloadLora` を追加した。同じrequest envelope、Worker、取消・revision・MessagePort契約を使用する。HIGH/LOWごとのFile/Blob、強度、既知base hashを明示し、成功時だけ所有bindingを更新する。loadは1MiB以下の分割読込みで全file hashを計算する。登録は取消によるWorker再生成後も保持され、disposeで解除する。

読出しは1回4MiB以下の所有Uint8Array。F16/BF16/F32の保存bitsと元のshape・tensor名・範囲・hashを返し、LoRAの数値加算を行わない。対応する通常pairと `.diff/.diff_b` のshapeを実Bernini targetと照合する。`loraWeightIO:true` と `loraApplied:false` を区別し、モデル全体のNOT_READYを解除しない。

別担当LoRA SDKのsource契約へは `createLoraSource` で接続できる。SDKの実graph consumer・package/session切替は別の未実装境界である。詳細、対象モデルhash、対応形式、保持・所有権は [LoRA接続仕様](lora/API.md) を参照する。
