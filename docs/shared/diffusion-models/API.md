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
| validateRawLatent | `{tensor}` | 公開Wan2.1 VAEのraw mean NCTHW・明示profile（下記3種）・producer hashを検査しmetadataだけ返す |
| normalizeRawMean | `{tensor}` | 実Hikeで公開固定profileのraw posterior meanをWan21正規化空間へ変換。所有tensorと証拠を返す |
| restoreRawMean | `{tensor}` | version付きnormalized posterior meanを実Hikeでraw meanへ復元。生成sampleをmeanへ言い換えない |
| linearProjection | `{q,scale,bias,x}` | 実Hike FP8復号→ORT WASM Gemm→Hike biasの固定部分演算。output16要素と証拠 |
| linearProjectionF32 | `{weight:Float32Array(81920),x:Float32Array(5120),bias:Float32Array(16)}` | 明示F32 runtime weightを実ORT Gemmへ渡し実Hike biasを加算。partialOnly。LoRA低rank演算や全モデル適用は行わない |
| load | `{file: File または Blob}` | 先にヘッダー検査を行い、その後NOT_READY。大容量モデルはdetails.reasonsにSINGLE_WASM32_MEMORY_EXCEEDED |
| predict / sample | `{}` | NOT_READY。仮のニューラル出力や注入predictorを返さない |
| cancel | `{jobId: 対象jobId,inputRevision: 対象revision}` | 自分が所有する実行中Workerだけ終了。対象のPromiseはCANCELLEDで終端化 |
| dispose | `{}` | Workerを終了し以後の呼出しをDISPOSEDで拒否 |

公開メソッド `api.cancel({sessionId,jobId,inputRevision})` も同じ対象を取り消す。`api.dispose()` は冪等である。取消後の次requestではWorkerを再生成できる。dispose後は再利用できない。

同じinputRevisionで実行中の別requestはBUSY。より古いrevisionはSTALE_INPUT。より新しい有効なrevisionを受けると旧Workerを終了し、旧PromiseをSTALE_INPUTで終端化して新requestへ移る。旧Worker・異なるbuild/session/job/revision/opの返信は現在の結果へ採用しない。build不一致で待機する場合も明示cancel/disposeが利用できる。

Eulerの上限1,048,576要素は、このAPIの作業予算。モデル全体の対応上限という意味ではない。Float32Arrayの長さ一致・有限値・sigma条件を検査する。固定workspaceのHike関数を最大65,536要素ずつ呼び、同じelementwise式の結果を結合する。この分割はニューラルグラフや時間・空間tensorを分割して推論する機能ではない。callerの入力配列は変更・detachしない。結果は独立した所有buffer。

noiseMix / inverseNoiseScale / flowDenoisedはFloat32Arrayと正のshapeを要求する。shape積と配列長を一致させ、1 tensorあたり1,048,576要素まで、NaN/Infinityを拒否する。結果は `{data: Float32Array,shape,operation,normalizationApplied:false,evidence}`。これら3つの低水準primitiveは入力空間を変換せず、出力をraw latentへ自動でラベル付けしない。raw meanとの接続に必要な数値変換は、本DiffusionモジュールのnormalizeRawMean / restoreRawMeanが担当する。包括UIは呼出し順・待機列・入力出力の受渡しを担当する。schedulerは固定ComfyUI版のsimple6・shift5・split3だけを提供し、別profileへ黙って切り替えない。noise配列は呼出し側から渡し、seedからの乱数再現は実装しない。

normalizeRawMean / restoreRawMeanはこのDiffusionモジュール内の明示的なHike処理である。下記3種の公開VAE固定profileとVAE model hashを照合し、ComfyUI固定版の16 channel mean/stdとFP32演算順で変換する。rawのmeaningは `raw-posterior-mean`、正規化後はversionを含む `wan21-normalized-posterior-mean:v1`。結果は `{tensor,normalizationApplied:true,evidence}` で、tensor.dataは所有されたFloat32Arrayとなる。raw0も数値式どおり非0へ変換し、無断のzero特別扱いを加えない。全sampling内のzero判定やHIGH/LOW orchestrationを実装済みとは扱わない。

normalized meanのmeaningに版を含めるため、公開 `.wktensor` codecの保存・読戻しを通しても復元可能。追加の `normalization:'wan21-comfy-f32-v1'` は保存形式が保持しない説明属性であり、復元時に省略可能だが、値がある場合の不一致は拒否する。意味・shape・producer hashを揃えただけで任意の生成sampleをposterior meanへ再分類しない。復元はこの固定mean契約の入力だけを受け入れる。

linearProjectionの入力は `q:Uint8Array(81920)`（16×5120 E4M3FNコード）、`x:Float32Array(5120)`、`bias:Float32Array(16)`、正の有限scale。出力は `output:Float32Array(16)` とHike/ORT/hash・copy量等のevidence。これは単一の固定Q射影であり、attention全体、1 stepのモデル予測、samplingではない。準備されたモデル値と明示activationを調べるための部分APIである。`load/predict/sample`はこの操作の追加後もNOT_READYのまま。

validateConditioningとvalidateRawLatentはtensor本体を返さず、dtype/shape/layout/meaning/byteLength/modelSha256と必要なmaskを返す。Text Encoderのhash `c3355d...`、VAEのhash `2fc39d...`、Bernini diffusionモデルhashは別の識別子であり混用しない。出所hash未記載を検証済みにはせず拒否する。VAE公開固定profile以外のshape、normalized latentをrawと名付けた入力も拒否する。Conditioningは公開上限512 tokenを保ち、このmetadata検査の範囲をpointwise演算の1M要素予算と混同しない。

バイナリ保存は `./tensor-interop.mjs` のencode/decodeWanConditioning・RawLatentから公開済み `.wktensor` codecを使える。独自形式を追加せず、encode開始時にdata/shape/mask/hash、decode開始時に期待producer bindingを所有snapshotへ固定し、非同期hash中のcaller変更から保存内容を保護する。これらのcodec wrapper自体は数値正規化を行わず、変換は上記Hike操作が担当する。

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
python api/build-info.py
node api/test/browser-check.cjs
# 保存済み巨大モデルもFileとして検査する場合:
node api/test/browser-check.cjs /absolute/path/LOW.safetensors /absolute/path/HIGH.safetensors
```

build-info.pyはAPI source、生成スクリプト、Euler、scheduler、Wan21 latent-space、tensor interopと公開codec、ORT bridgeのsource/kernel、ORT1.24.3実runtime・manifestのhashをまとめ、hostとworkerが独立に読み込む固定buildIdを生成する。対象sourceやkernelを変えたら必ず再生成する。build-info.mjs自体・テスト・READMEはhash対象外。

REDの記録はtest/red-*.json、最新GREENはtest/browser-results.json。Chromiumの実Worker・MessageChannel・Hike/ORT WASMで22ケースを確認した。固定schedule・noise/flow式、raw meanの16 channel正規化と復元・公開codec保存読戻し、tensor境界拒否、literal部分射影と実重み2タイル32出力、partial取消後の再実行を含む。追加の実File試験では保存済み各15.57 GBのLOW/HIGHを入力し、1815 tensors、181280 bytesのheader hashを独立Python棚卸しと照合した。どちらもloadはNOT_READYで拒否した。これはモデル本体の推論合格ではない。


## LoRA重みの入力

LoRA用に `inspectLora` / `loadLora` / `listLoras` / `readLora` / `readLoraSource` / `unloadLora` を追加した。同じrequest envelope、Worker、取消・revision・MessagePort契約を使用する。HIGH/LOWごとのFile/Blob、強度、既知base hashを明示し、成功時だけ所有bindingを更新する。loadは1MiB以下の分割読込みで全file hashを計算する。登録は取消によるWorker再生成後も保持され、disposeで解除する。

読出しは1回4MiB以下の所有Uint8Array。F16/BF16/F32の保存bitsと元のshape・tensor名・範囲・hashを返し、LoRAの数値加算を行わない。対応する通常pairと `.diff/.diff_b` のshapeを実Bernini targetと照合する。`loraWeightIO:true` と `loraApplied:false` を区別し、モデル全体のNOT_READYを解除しない。

別担当LoRA SDKのsource契約へは `createLoraSource` で接続できる。後述のv2 adapterは限定Q射影のruntime feed-setへ接続する。全モデルのgraph/package/session切替は未実装である。元のweight I/O、対象モデルhash、対応形式、保持・所有権は [LoRA接続仕様](lora/API.md) を参照する。


## L1: bounded F32 runtime weightと実base診断

`linearProjectionF32`はcompact・非shared・非detachedの有限配列をdispatch前に検査する。caller入力は保持し、Workerへcloneし、stageはORT async実行前に所有copyを取る。Worker結果はtransfer、port結果はclone。既存`linearProjection`のFP8原本入力を変更・再量子化しない。capabilitiesの同名fieldは部分受口の存在だけを示し、`modelInference:false`、`loraApplied:false`を維持する。

独立ES moduleの実base provider、PARTIAL registry、runtime-feed-set sink/candidateは [DIAGNOSTIC_API.md](lora/DIAGNOSTIC_API.md) を参照。私的に渡した実base小blockだけを読むproviderも提供する。SDK v1のinitializer/boolean validate契約とは互換にしない。通常のload/predict/sampleとpointwise上限1,048,576は変更していない。

LoRAのfull-shape/selected-slice、両registry、sink/consumer取引mappingの現行正本は、LoRA ownerの `createDiffusionDiagnosticAdapter` / `lora-diffusion-diagnostic-adapter/0.1`。[固定fc278の実装](https://github.com/Kushyameln01/kushyameln-works/blob/fc2789a0f649e33f15eb13750e6a983b5c52d170/docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs)を参照し、管理はowner adapterを注入する。同じ実行経路に別mappingを重ねない。Diffusionはnative registry/provider/sink/consumerと実feed、LoRAは低rank積とmappingを所有する。

同梱の [V2_ADAPTER.md](lora/V2_ADAPTER.md) / `v2-adapter.mjs` は旧SDK `2bba90785292e42a0c7c8756685b0d8b128b2dcf` に固定した回帰経路として保持する。この旧経路の合成source試験と、実base断片の復号/consumer試験は別の証拠である。LoRA ownerが後続版で報告した実原本PARTIAL20caseの証拠は、[固定JOINT-LORA-RESULT](https://github.com/Kushyameln01/kushyameln-works/blob/fc2789a0f649e33f15eb13750e6a983b5c52d170/development/ai-connection/JOINT-LORA-RESULT.md)として区別する。HIGH/LOW各2組の同一base同時合成を保証しない。


## E6: shapeを固定したposterior-mean profile

`rawMeanProfiles`は次の3profileを宣言する。validateRawLatent/normalizeRawMean/restoreRawMeanは厳密なshape/model/meaningへ対応し、入力のprofileIdがあればshapeから選んだidとの一致も検査する。同じ要素数でも軸shapeが違えば拒否し、paddingやshape偽装は行わない。

| profileId | NCTHW | 要素数 / channel index |
| --- | --- | --- |
| `wan21-raw-f32-5x16x16` | `[1,16,2,2,2]` | 128 / i÷8 |
| `wan21-raw-f32-1x16x16` | `[1,16,1,2,2]` | 64 / i÷4 |
| `wan21-raw-f32-1x16x32` | `[1,16,1,2,4]` | 128 / i÷8 |

64専用Hike exports NormalizeRawMeanF1/RestoreRawMeanF1と、非正方形128専用NormalizeRawMeanRect/RestoreRawMeanRectを旧128のexportから分離する。ABI `wan21-raw-mean-f32-v3`、係数とFP32順序は同一Wan21規約、固定arena1024bytes。生成sampleは受理しない。実VAE受領meanとの全値比較と、相手本人の64限定decode記録は [RECT-RESULT.md](../../../development/ai-connection/e6/RECT-RESULT.md) を参照。大shapeや生成sampleのdecode成立を意味しない。

旧requireWanRawLatent/codec wrapperは旧F5の128専用のまま。独立ES境界ではrequireWanRawLatentF1/WAN21_RAW_F1_PROFILE、またはrequireWanRawLatentRect/WAN21_RAW_RECT_PROFILEを明示利用する。G1C contextをmain旧codecへ渡して完全保存と扱わず、外側descriptorを保持する。

## E7: 単一tokenのfull-Q行分割候補

`ort-bridge/tiled-q.mjs` のcreateTiledQProjectionは独立ES moduleであり、native requestにpredict/sampleの代わりとして送らない。実LOW Q `[5120,5120]` を16行ずつread/dequantし、入力 `[1,5120]` から全5120出力を実Hike/ORTで確認した候補である。F32診断、N=1のLinear境界に限定し、元FP8計算、全token/context、attention、組合せMemory/staging/copy予算、E8は未成立。詳細と再現手順はdevelopment/ai-connection/e7/RESULT.md。

## E7: 全keyを参照する選択queryのstream attention候補

独立ES module `ort-bridge/stream-attention/stage.mjs` は、明示したpost-QK-norm/RoPEのF32 Q `[16,128]` と、1headのK/Vを最大64keyずつ受ける。全32,760 keyの末尾56を正しいshapeで処理し、ORT WASMのscore/expとHikeのonline max/sum/value更新を組み合わせる候補である。入力source版は `works-postnorm-rope-qkv/0.1`。本番のQ/K/V生成、norm/RoPE、全query/head、元production precision、他stageと同時保持したMemory・staging・copy予算は別の未成立境界である。試験・採否と再現は [E7 attention RESULT](../../../development/ai-connection/e7-attention/RESULT.md) を参照。native RPCへ追加せず、load/predict/sampleとE8は保留する。

## 管理ツールへ渡す接続条件

共通snapshot版とnative `diffusion-models/0.1`・BUILD_IDを分ける。Text/VAEのconnected tensorをnativeへ渡す際は、上記4操作とも **`input:{tensor: connectedTensor}`** と包装する。tensor単体をwire.inputへ渡すgeneric mappingは互換ではない。独立LoRA provider/consumerとattentionの関数・AbortSignal・opaque handleはMessagePort payloadにせず、所有する同一realmで呼ぶ。

全体待機列・工程順・snapshot採用は管理、Diffusion内部の数値計算・所有資源・Worker世代は本担当が扱う。取消ACKと元Promise終端/解放を別に観測してからresourceを再利用する。相互取得の固定source、相手受領の証拠、残る合意は [E0_PEERS.md](../../../development/ai-connection/resume/E0_PEERS.md) に整理した。

## P0: Profileと実sourceの対応

[profiles/P0.md](profiles/P0.md) と `profiles/p0-bindings.json` は、Profile/規範/数値規則 `1.0-draft.1`、固定commit `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` に対応する外側sidecarである。recordId/normIdをnative requestへ追加せず、native profileId未定義はnullのまま扱う。実source/build/kernel bytes・長さ、全軸shape、meaning、事前gate/reference、再利用元のscopeへ結ぶ。

`verifyDiffusionOwnerBindings({declarationBytes,expectedSha256,referenceFiles,ownerFiles})` はbytesと宣言の整合を検査する独立ES入口で、管理の互換性判定器やモデル演算を実装しない。旧5fの受入証拠と新候補buildの欄を分離する。整合検査成功を新buildの数値受入や生成READYへ昇格させない。gate/receiptだけ不足するedgeは、契約のCOMPATIBLEと数値NOT_VERIFIED/BLOCKEDを別に保持する。

## P2: 実Rect meanの接続

VAE `855f435120f08eb9e818e51281fc26f0e2633829` の実raw meanを、管理 `28596717182e48aeb23c719c51b6e593edf4e496` の実capture/package/queue・明示native `{tensor}` 入力と、Diffusion Worker/MessagePortのRect専用処理へ接続する。[P2結果と再現](../../../development/ai-connection/profile-adoption/p2/RESULT.md) は全128値と変換edgeの入出力hash・operation/job/buildを追跡する。

native contextの既知fieldは所有コピーし、frame配列の順序と重複を保持する。未知context keyは現在拒否し、任意metadataは管理側のouter extensionへ保存する。G1C codecがoptional normalization markerを省略しても、版付きnormalized meaningと元のowner metadataを外側traceへ保持する。旧F5 guard/codec wrapper、padding、reshape、rawへの改名を正常経路として使わない。新restored payloadのVAE decode・管理UI/候補採用・全sessionは対向担当の別受入である。

## P4: 実重みを使うQKV norm RoPEの単位

独立ES入口 [qkv/stage.mjs](ort-bridge/qkv/stage.mjs) の `createActualQkvDiagnostic({file,side,bridgeBytes,tensorBytes,ropeBytes})` は、元block0のQ/K/V `[5120,5120]` をbounded row tileで読み、明示hidden `[16,5120]` から全幅Q/K/Vを計算する。Q/Kは全5120次元のRMSNormを経てhead0/128次元を選び、実coreの3軸RoPEと別のsource_id回転を、全128次元を覆う64組の2×2 F32行列の積として合成し、既存attentionへ渡す。

native executionProfileIdは `bernini-block0-qkv5120-norm-rope-selected16-head0-f32-v1`。本単位のattentionは宣言した選択16keyで、旧attentionのprecomputed K32760試験と別scopeである。入力position/sourceId、gate、独立reference、元precisionとの差、所有権・取消・解放・同時保持資源は [qkv/README.md](ort-bridge/qkv/README.md) と固定candidate planに記載する。Q/K normへ渡すprojection値は、本診断の明示admissionとしてabs≤1e16に制限する。既存generic RMSNormを有限巨大値全般の受入へ拡大しない。

元storage FP8/F16を実HikeでF32へ復号するが、計算は明示したF32診断profileである。実model由来のmodulation後hidden、元production compute精度、全N32760/context65520以上、全query/head/stageと組合せ資源予算は別の未成立条件。`productionQKVVerified:false`、P5=BLOCKED、native `load/predict/sample=NOT_READY` を維持する。本native profileはownerの新しい候補宣言であり、固定catalogへの登録・管理採用は別に行う。
