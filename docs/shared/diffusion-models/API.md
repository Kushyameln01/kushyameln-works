# diffusion_models 外部API 0.1

このAPIは同じページのES module、または呼出し側が明示して渡した専用MessagePortから利用する。全体UI、Text Encoder、VAEのAPIを実装・推測しない。HTTP・WebSocketサーバーやグローバルなwindow message listenerは設けない。静的HTTP(S)配信とWorker/WASMを利用できるブラウザが必要。

現在動く操作は、safetensorsのヘッダー検査、実Hike WASMのEuler・固定scheduler・noise/flow更新・Wan21 posterior-mean正規化と復元、公開Text Encoder/VAEのtensor境界検査、Hike→ORT WASM→Hikeによる固定Q射影の部分演算。API版0.1に操作を追加し、既存envelopeは維持している。`load`・`predict`・`sample`は常に構造化エラーで拒否する。モデル推論の実装・変換・利用経路完成を意味しない。

## 通常実行と診断の分離

通常descriptor／対応判定と、固定診断を分離した。`capabilities.executionDescriptor`、`checkSupport`、`prepareP4/runP4/releaseP4`、単独`createBerniniP4Execution`を追加。P4はN2/block0/Text L1〜512/contextなしの範囲を保ち、通常入口は最終hiddenのみ返す。固定payload hash・過去数値receipt・独立比較は通常の互換性条件にしない。weight feedの通常validateと診断diagnoseも分離した。[通常API契約](execution/README.md)を参照。全モデルload/predict/sampleは引き続きNOT_READY。

## D1〜D4の実装候補

全1095重みのregistry／Hike復号、query128・key256・40headのonline attention、全40block・最終headの[単独predict候補](execution/model-candidate.md)、実HIGH／LOWに束縛した[6更新sample候補](execution/model-sampler-candidate.md)を追加した。通常入力へ独立参照・固定payload hash・過去receiptを要求しない。候補の診断入口だけが比較用の中間値を返す。

これらは公開APIとは別の実装候補である。必要shapeでの全predict・6更新・組合せ資源予算は未受入のため、公開`load/predict/sample`とWorkerの状態は引き続き`NOT_READY`。原寸pointwise、部分tile、小Nの全40blockはそれぞれ検証scopeを分ける。[実装・検証計画](../../../development/ai-connection/standalone-d1-d4-20261102/WORK-PLAN.md)を参照。

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

## QKV Profileの登録案と実block由来N2境界

[登録package](profiles/registration-QKV.md) は、上記の既存N16診断を固定source `8cdfd3f5f7db0cd66762e78f09c209fb5b27366b`・旧build・事前gate・数値receiptへ結び付ける。共通catalog `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` と旧管理候補を保持し、別entry `CANDIDATE-DIFFUSION-QKV-N16-8CDFD3F` を追加するpreviewである。提案文書版は `1.0-draft.2`、正本の登録・管理runtime採用は未実施。新しいN2実験へN16の受入scopeを広げない。

後述のN2単位は [別登録案](../../../development/ai-connection/qkv-next/expansion/profile-proposal.json) `CANDIDATE-DIFFUSION-DERIVED-N2-ALL40-F32-V1` として提示する。新build・source・gate・結果はこの別案へ束縛し、旧N16登録案を更新しない。

次の独立ES入口は、native RPCやMessagePortの新opではない。同一realmで所有する管理コードから利用し、関数・AbortSignal・opaque ownerをwire payloadへ入れない。

```js
import {createBlockHiddenPrefix} from './ort-bridge/block-hidden/stage.mjs';
import {createDerivedQkvHeads} from './ort-bridge/attention-heads/stage.mjs';

const prefix = await createBlockHiddenPrefix({file: originalHighFile, side:'HIGH'});
let produced;
try {
  produced = await prefix.run({
    rawMean: actualRectMean, noise: fixedDiagnosticNoise,
    noiseScale: 1, scheduleIndex: 1, signal
  });
} finally { await prefix.dispose(); } // resource barrier
// Compare the private artifact with the independently pinned reference first.
// trustedProducer is that external passing receipt, not a caller success flag.
const downstream = await createDerivedQkvHeads({
  file: originalHighFile, side:'HIGH', trustedProducer
});
try {
  const {attention,evidence} = await downstream.run({
    hidden: produced.hidden, positions: produced.positions,
    sourceIds: produced.sourceIds, evidence: produced.evidence,
    artifactSHA256: trustedProducer.artifactSHA256, signal
  });
  // attention: owned F32 [2,5120], all2 queries / all40 heads, BEFORE O projection
} finally { await downstream.dispose(); }
```

この呼出し例は固定診断条件の例であり、任意のrawMean/noise/timestepを受け入れる生成APIではない。入力はVAE `855f435120f08eb9e818e51281fc26f0e2633829` の実Rect mean `[1,16,1,2,4]`、固定明示noise128、noiseScale1、HIGH index1 / LOW index3である。LOWは独立した試験で、HIGHの出力受渡しではない。元Euler/simple6/shift5/split3を変更しない。

実F16 patch `(1,2,2)`・time embedding・block0 modulation・全5120 LayerNormから、native profile `bernini-rect2-block0-postmod-f32-v1` のhiddenを得る。元core BLC `[1,2,5120]` を暗黙batch1のLC `[2,5120]` に下げ、token座標は `(0,0,0),(0,0,1)`、source0、contextなし。16tokenへのpadding/反復を行わない。F32診断profileとして元production精度との違いを残す。後段は全幅QKV→全5120 QK RMSNorm→各head RoPE→2 query/2 keyのattentionであり、O projection・残差・cross-attention・FFNを含まない。

hidden/positionsはcompact・非sharedの有限F32、sourceIdsはcompactなInt32Array(2)で、runはawait前に所有snapshotを取得する。返却配列はcaller所有で、caller入力を変更・detachしない。BUSYはgetter前に獲得し、取消は協調式のためPromise終端を待ってからdisposeする。native Tensor/sessionの解放失敗ではhandleを保持して再利用を止め、`recover()`で解放を再試行する。全体queue・工程管理は管理、内部演算と資源は各ownerが担当する。

数値規則・shape・sourceとの対応は [prefix契約](ort-bridge/block-hidden/README.md)、[全head境界](ort-bridge/attention-heads/API.md)、[結果・再現・段階別資源](../../../development/ai-connection/qkv-next/RESULT.md) を参照。trusted receiptはartifact・hidden・座標・side/block/timestep・producer sourceのhashを束縛する整合証拠であり、任意callerの出所を暗号学的に認証する機能ではない。

全N32760/65520の数値実行、元81frame入力、ordered context、HIGH→LOW受渡し、production precision、全工程の同時保持・ORT Memory・copy/time予算は未受入。大規模allocation-only試験をモデル実行や全query数値合格と扱わず、`load/predict/sample=NOT_READY` を維持する。

## N2共通catalog登録packageと追加資源検証

[registration-QKV-N2.md](profiles/registration-QKV-N2.md) と `profiles/registration-qkv-n2.json` は、新N2の共通catalog形式の登録資料である。旧owner独自 `expansion/profile-proposal.json` だけでは不足したrecord/rule/norm/category mapping、依存prefix実行profile、厳密native guard、完全commitと実source/build/evidenceを対応付ける。旧managerとN16候補を保持して別entryへ追加するpreviewであり、外部catalog正本や管理runtimeの採用状態を変更しない。

新しい資源観測は既存の数値runtimeを変更せず、[追加結果](../../../development/ai-connection/qkv-followup/RESULT.md) に保存する。ORTのsession数とWebAssembly.Memory数を区別し、同一Memoryはidentityで一度だけ数える。観測する線形Memory容量・高水位、名前付きhost staging、累積copy、allocator live/GC/OSの未知量を別に扱う。計測器の追加をnative RPCの新operationや本番の資源保証と扱わない。

[再利用scope](../../../development/ai-connection/qkv-followup/REUSE_SCOPE.md) と [次の本番境界](../../../development/ai-connection/qkv-followup/BOUNDARIES.md) は、N2数値・旧precomputed-K32760・3H allocationの証拠を合成して本番受入へ昇格させない条件を示す。元gridでの新たな数値受入には、その入力の実producer receipt・座標・precision・独立referenceが必要である。`load/predict/sample=NOT_READY`、元Euler/simple6steps/shift5/split3を維持する。

## N2 O projection・chunk2 gate・自己注意残差

独立ES module [self-attention-tail](ort-bridge/self-attention-tail/README.md) の `createSelfAttentionTail` は、受入済みの同一N2 attentionから、実O projection→chunk2 gateのbroadcast乗算→block0入力への残差加算を一単位で実行する。native profileは `bernini-block0-n2-self-attention-residual-f32-v1`。native RPC/MessagePortへ新opを追加するものではない。

```js
import {createSelfAttentionTail} from './ort-bridge/self-attention-tail/stage.mjs';
const tail = await createSelfAttentionTail({file: originalFile, side:'HIGH', trustedInputs});
try {
  const r = await tail.run({attention, patchHidden, timeAct1, signal});
  // r.o / r.gated / r.residual: owned F32 LC [2,5120]
  // r.gateProjection / r.gate: owned F32 [5120], broadcast across2 tokens
} finally { await tail.dispose(); }
```

`trustedInputs`は、固定fullprefix receipt/artifact、patchHidden/timeAct1のbits、別途保存した実attention artifact/receipt/context bits、side/block0/HIGH1またはLOW3を束縛する。callerのsuccess booleanだけを出所証明にしない。配列はcompact・非sharedの有限F32、形はattention/patchHidden `[2,5120]`、timeAct1 `[5120]`。所有snapshotをawait前に取得し、callerを変更・detachせず、WASM viewやnative Tensorを返さない。

Oは元FP8 E4M3FN `[5120,5120]` とO固有のscalar scale/config、F16 biasを使う。gateは保存済みtimeAct1に対し、元F16 time projectionのrows `[10240,15360)` とbias、modulation chunk2だけを追加取得して計算する。`gate = modulation_chunk2 + timeGate`、`gated = O*gate`、`residual = patchHidden+gated`。残差元にpost-modulation hiddenを使わず、gateへscale+1も適用しない。

計算は明示F32診断で、Hikeの乗算と加算を分ける。元torch.addcmul/GPU fused precisionとの一致は未受入。返すresidualは自己注意後のtoken hiddenであり、生成latentやVAE posterior meanへ読み替えない。HIGH/LOWは独立ケースで、実HIGH→LOW受渡しではない。

BUSYを外部getterより前に獲得し、取消はcooperativeとする。abort後にPromise終端を待ってからdisposeする。native解放失敗時はhandleを保持して再利用を止め、recoverで解放を再試行する。全体queue・工程管理は管理、内部数値計算と資源は本ownerの責任である。

O・gate・gated・residualの独立参照と事前gate、重み範囲/source識別、Memory/copy・再利用/新規検証は [結果と再現手順](../../../development/ai-connection/self-attention-tail/RESULT.md) に記録する。cross-attention・FFN・全block・本番生成は後続とし、`load/predict/sample=NOT_READY`を維持する。

## P4: cross-attention・FFNの別入力候補

独立ES入口 [post-self-attention](ort-bridge/post-self-attention/README.md) を追加する。profileは`bernini-block0-n2-cross-ffn-f32-candidate-v1`、factoryは`createPostSelfAttention`。上記固定tailのhash検査とProfileを変更せず、別のcaller入力・F32 weight feedを検証する候補として扱う。native RPC/MessagePortに新しい生成operationは追加しない。

```javascript
import {createP4WeightSource} from './ort-bridge/post-self-attention/source.mjs';
import {captureP4Conditioning} from './ort-bridge/post-self-attention/conditioning.mjs';
import {createPostSelfAttention} from './ort-bridge/post-self-attention/stage.mjs';
const source = await createP4WeightSource({file: originalFile, side: 'HIGH'});
const conditioning = captureP4Conditioning(textTensor); // strict model/tokenizer binding
const stage = await createPostSelfAttention({source});
try {
  const result = await stage.run({residual, timeAct1, conditioning, signal});
  // result.output aliases result.blockOutput; no new latent/sample meaning.
} finally {
  await stage.dispose(); // await a running native call's terminal state
  source.dispose();      // caller owns source unless disposeSource:true
}
```

| 入力 | 境界 |
| --- | --- |
| residual | compact owned-copy F32 `[2,5120]`、LC、自己注意残差。固定回帰では既存export/E4のhash・意味・producerを照合してから渡す |
| timeAct1 | compact F32 `[5120]`、保存済みtime embedding SiLU出力。別producerの数値を元timestepの証明として使わない |
| native conditioning | `float32 / BLC / text_hidden_states / [1,L,4096]`、`1<=L<=512`、Uint8 mask`[L]`、model/tokenizer識別、全metadataを明示capture |
| fixture conditioning | 別名`captureP4FixtureConditioning`、独自fixtureId/sourceRef、`p4-fixture-text-hidden-states:v1`。実Text model/tokenizer識別を挿入しない |

Text ownerの最終RMSNormは適用済みのまま受け取る。Diffusionは`text_embedding.0→GELU(tanh)→text_embedding.2`を所有し、全L行を保持する。maskはproducer metadataとして保持し、cross softmaxには適用しない。masked hidden行の削除、暗黙padding、再正規化は行わない。native tokenizer欠落は既定で拒否し、明示`missingTokenizerPolicy:'retain-unknown'`の場合もunknownを保持する。captureの形・識別一致は実producerの数値認証ではない。正負conditioningは別artifactで、管理が対象branchを明示して呼び出す。CFGや正負の自動合成はこの部品に含めない。

演算順はaffine LN(norm3)→cross QKV→full5120 RMSNorm→40head×128 attention→O→ungated残差→nonaffine LN→chunks3/4 modulation→FFN5120/13824/5120（GELU tanh）→chunk5 gate→cross残差。全norm epsilonは1e-6、crossにRoPEはない。FFN downは全13824列を保った4出力行tileを使う。復号上限81920要素を引き上げず、inner次元を分割しない。O/text/timeのF16と、各自scalar scaleを持つQKV/FFNのFP8を区別する。

出力は25の診断中間配列と`blockOutput:F32[2,5120]`、入力/出力hash・source・weight epoch/package・Memory/copy/time evidence。`output`は`blockOutput`と同じbufferを指す。全配列は呼出し側が保持でき、dispose後も値を保持する。conditioning captureはsealを所有し、改変されたcaptureを拒否する。runは最初のawait前に入力をcopyし、weight feedのimmutable leaseを取る。取消はbounded WASM/ORTの終端を待ち、busy中の二重実行を拒否する。`dispose/recover`は終端と解放を待つ。管理は全体queueを所有する。

LoRA用の新入口は`createP4WeightFeed({source})`。immutable `baseProvider.readBlock`、疎patch `createSink`、`prepareLoad→validate→commit/rollback→releaseCandidate`、`captureSource`を公開する。registryはoriginal key/full shape/選択範囲、実program slot→ORT入力`weight`／Hike bias parameter、保存/計算dtype、FP8 profile、base/graph/registry識別を保持する。最終F32 weight/biasは再scaleせず実演算へ渡す。低rank積・loader/full-shape mappingはLoRA ownerのままで、新P4へのcanonical adapter共同受入は別条件である。詳細は[consumer契約](../../../development/ai-connection/p4-cross-ffn/WEIGHT-FEED.md)を参照。

本候補のproducer認証、独立参照・事前gateの数値判定、本番shape、複数stageの組合せ資源予算はそれぞれ別判定とする。[conditioning契約](../../../development/ai-connection/p4-cross-ffn/CONDITIONING.md)・[候補gate](../../../development/ai-connection/p4-cross-ffn/core/candidate-plan.json)・[結果](../../../development/ai-connection/p4-cross-ffn/RESULT.md)にsourceと受入scopeを記録する。N2の部品成功からP5へ昇格せず、`load/predict/sample=NOT_READY`、generationReady=falseを維持する。

### 実Text L512専用の結合診断

[runP4RealTextL512](diagnostics/p4-real-text-l512/run.mjs) は、固定f76の実Text packetを消費する独立診断入口である。従来のL4 fixture入場検査を変更しない。`runP4RealTextL512(file,payload,{writeOutput,phaseEvent})` を同一ページで呼び、管理のqueueやRPC/MessagePortへ生成operationを追加しない。

`payload.nativeInputText` は実WKTからbit-preservingに作ったnative JSON原文で、whole SHA `9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8`。元WKT・header・payload・全512 mask・model/Tokenizer・元Text source5537へのbindingと、保存済みN2 residual/timeAct1・side/block0/HIGH1またはLOW3をnative構築前に照合する。`float32 BLC[1,512,4096]` 全行を4096→5120投影・K/V・cross-attentionへ渡し、そのN2残差をFFNへ渡す。maskのsoftmax適用・行削除・Text最終RMSNormの再適用は行わない。

`writeOutput` は `{name,offset,byteLength,base64}` を受ける非公開sinkであり、復号後最大256KiBのaligned F32 byte chunkを25配列の全bytes/hashと照合して保存する。返す公開receiptは配列値を含まず、`blockOutput` の意味はLC `[2,5120]` のblock0 cross-attention＋FFN後出力（保存済み自己注意残差を起点）のままである。生成latent/sampleやVAE posterior meanには変換しない。`phaseEvent` は数値配列を受け取らず、工程時刻と資源観測だけに用いる。

[Python driver](../../../tools/diffusion-models/p4-real-text-l512-browser.py) は、固定commitの実行source・事前composed reference manifest/hash・入力identity・既存gate・全25参照identityをChromium起動前に検査する。数値core/kernel・gateは従来と同一で、local abs.001/rel.0001、composed abs.01/rel.001の全値比較を行う。数値受入、LoRA適用、source取得ACK、管理採用は別scopeとし、[限定結果](../../../development/ai-connection/p4-real-text-l512/RESULT.md)・[再現手順](../../../development/ai-connection/p4-real-text-l512/REPRODUCE.md)へ記録する。

実LoRA結合は別入口 [runP4RealTextL512Lora](diagnostics/p4-real-text-l512/lora.mjs) と [driver](../../../tools/diffusion-models/p4-real-text-l512-lora-browser.py) を使う。owner `a80db72feea60b9bd69e292e4716665c6f0ee77f` の `createLoraV2/createDiffusionP4Adapter` をexact sourceで読み、低rank積は本担当で実装しない。限定受入はlight/LOW、実L512・保存LOW3/N2/block0、cross Q先頭4行×全5120列とbias4、strength+1のみ。canonical adapterがregistry/provider/sink/candidateを接続し、完成F32を実ORT/Hikeへ渡す。

独立Aのweight/bias数値gateと、独立Bの全25中間値/最終出力gateは別である。A-rounded F32とSDK完成F32のhashを分け、SDK bytesの実消費proofを参照Bの置換に使わない。candidate検証中に実NNを一回実行し、commit後・rollback後はpackage/epochとbyte readbackを確認した。SDK/prepared解放後のcopy保持、旧base/active read lease、全session/lease解放を記録する。[LoRA限定結果](../../../development/ai-connection/p4-real-text-l512/LORA-RESULT.md) のscopeを超える実行は未受入で、coverage:PARTIAL、completeAdapter:false、`load/predict/sample=NOT_READY`を維持する。
