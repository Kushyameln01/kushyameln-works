# Bernini管理ツール向け DiffusionModels API調整案

版: `bernini-integration/0.2-draft.1`、2026-10-31 JST。

この文書は調整案と受入条件である。runtimeのAPI版・実装・公開状態は変更していない。重いモデル推論、graph export、push、Pages公開は今回の工程に含めない。型名・追加operation・meaningのうち「提案」と記したものは、現行APIからまだ呼べない。

## 0. 着手時の最新差分と判断の範囲

GitHubとoriginを取得し、最新main `029ce9336a61e53bc6172fa4a7b7189b15f2efa0`、最新source branch `679a72d7f53e31bccecbee46b4e2fe559a4e0aba` を確認した。作業開始HEAD `d454549df0f9b4f77c6f92ee45b2157f6aa130ff` のtreeは最新source treeと一致する。公開台帳383ファイルは最新mainとすべて同じblobで、指定の3 API文書にも差分はない。commit IDの違いを実装差分とは扱わない。

依頼再提示後の2026-10-31 JSTにもoriginを再取得した。再確認開始HEADは `6f023a1d4340420d907d8ecbb09390f351c24929`。main/sourceの先端は上記のままで、公開383ファイルと指定3契約の同一性を再確認した。sourceとの差は本調整文書と容量記録の2ファイルだけである。Text/VAEとLoRA consumerの担当別読取り照合を行い、現行実装・提案・未合意を分けた記述を維持する。今回は文書の再確認記録のみを更新し、最小結合gateを実行済みへ変更しない。

参照した契約:

- `docs/shared/diffusion-models/API.md`: `diffusion-models/0.1`。
- `docs/shared/inference/API.md`: Text/VAE `works-ai-1`。
- `docs/shared/inference/lora/README.md`: LoRA SDK `apiVersion:1`。

差分・文書hash・容量の再計算は `api-adjustment/baseline-and-capacity.json`。coreはComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` を固定する。元workflowはBerniniStudio node5だが、その当時のplugin source版は未取得。参照候補 `CCpt5/ComfyUI-BerniniStudio@ca69274a2d2135052489bc0c67a2d79a64225e86` と元版の同一性は未確認である。元workflowのMXFP8名と保存済みscaled E4M3FNモデルのprecision同等性も未確認。これらを曖昧にしたまま「元workflow同等」と認定しない。

**責任の原則:** 管理ツールは全体の待機列・工程・利用者の選択とI/Oを管理する。Diffusionは自分の数値計算、Berniniの準備規則、モデル/LoRA/sessionの採用、内部排他・資源上限・解放を管理する。管理UIに正規化・RoPE・scheduler算術を実装させない。

## 1. モデル推論APIの現状と成立条件

| 項目 | 実装済み | 未実装・阻害要因 | readyを認める条件 |
| --- | --- | --- | --- |
| load | File/header検査、型/範囲検査、NOT_READYの構造化応答 | 実Bernini graph、prepared manifest、全weight対応、partition/precision仕様、session生成がない。元payloadは各15,574,651,928 B、単一wasm32の4GiBを超える | 原本/graph/external data/変換版のhash、実I/O名・shape・意味、resource見積り、実session作成、別途合意した小さい実モデル入力の照合が成立 |
| predict | `flowDenoised`等の独立primitiveのみ | 40-block coreへのlatent/text/context入力、実model session、出力照合がない。現在は無条件NOT_READY | 対象stage/shape/compute profileのload受入、core/Wan wrapperの意味・符号・時刻・context順が検証済み |
| sample | 固定sigma、Euler、noise/inverse、128要素mean変換の独立部品 | 初期化、実predict、6反復、HIGH/LOW入替・handoff、生成sampleの出力変換が未結合。現在は無条件NOT_READY | 同一variant snapshotの両stage、固定schedule、noiseの出所、handoff、取消/解放、最終latent契約が受入済み |
| LoRA | 6つのweight I/O、File登録、SDK source接続 | 数値適用・実consumer/package/session切替は未実装 | 後述の実graph consumer・precision・transaction条件を満たす |
| 全体生成 | 独立Text/VAEの小profile、数値部品の既存実績 | 本番VAE profile、元prompt/media/LoRA、原手順の照合、全体負荷は未確認 | 各moduleの本番profileと対向契約を揃え、別途承認した全体受入を実施 |

`linearProjection`はQの16×5120診断演算で、モデルの1回予測ではない。graphの`weight`は入力であり、実initializerではない。ファイルを読めること、WASM演算が動くこと、prepared packageが有効なこと、モデル推論ができることを別のcapabilityにする。

### 1.1 predictの意味を固定する（提案）

入力は正規化されたnoisy target `x_sigma` と `sigma`。再noise付加やlatentの再正規化をpredictの入口で行わない。coreへ渡す時刻は固定profileの `t = f32(sigma * 1000)`。呼出し側から別のtimestep列を暗黙に混ぜない。

**predictの公開出力は選択branchのflow velocity `v` とする。** 入力に`branch:'positive'|'negative'`を必須にし、positive/negativeのどちらを使ったかを返す。predict単独ではCFG合成しない。`predictionType:'flow-velocity'` とmeaning `wan21-flow-velocity:v1` を必須にし、epsilon/画像/denoisedと呼び換えない。pinned Wan coreにはこの経路の符号反転がなく、CONST wrapperは次式でdenoised estimateを作る。

```text
v = WanCore(x_sigma, timestep, preparedText, orderedNormalizedContexts)
D = f32(x_sigma - f32(sigma * v))
d = f32(f32(x_sigma - D) / sigma)
x_next = f32(x_sigma + f32(d * f32(sigma_next - sigma)))
```

`D` は `wan21-denoised-estimate:v1`。sample内部ではDiffusionのHikeが一度だけこの変換と既存Euler順序を行う。`x_next=x+v*dt` へ無断に簡約しない。predictをdenoised出力へ変更する場合は契約を改版し、同じfield/meaningのまま中身を切り替えない。sigma0は最終状態であり、このprofileのpredict/Euler更新は呼ばない。

### 1.2 元workflowのsampleを固定する（提案）

baselineはbatch1、832×480×81、latent `[1,16,21,60,104]`。Euler、simple、6 steps、shift5、denoise1、split3、両stage CFG1を固定する。

```text
profile = bernini-comfy-simple6-shift5-v1
tableIndices = [999,833,666,499,333,166]
sigmas = Float32Array([
  1, 0.9617158770561218, 0.9092148542404175,
  0.8333333134651184, 0.7148972749710083,
  0.5005995035171509, 0
])
HIGH: sigmas[0..3] の3更新
LOW : sigmas[3..6] の3更新
```

- `initialLatent` は元nodeの全0 raw target placeholderで、meaningを提案 `bernini-empty-target:v1` とする。VAE posterior meanではない。全0 sampler initializerでprocess_inをskipする原規則を明示し、通常のmean正規化のzero入力とは別にする。
- `noise` は同shapeの有限Float32Arrayとして明示受入れ。HIGH開始時 `x_0 = sigma_0*(noiseScale*noise)+(1-sigma_0)*initial`、noiseScale1。元のseed0を記録しても、それだけでTorch/Comfyの乱数列を再現できたとはしない。seedからの生成を追加する場合は別のRNG受入が必要。
- sigma列を外から渡す場合も固定profileとFP32値/長さ/順序を照合する。別scheduler・steps・shift・境界・CFGはこのprofileでは拒否し、勝手に補正しない。
- `positive` と `negative` を別々に保持し、両方へ同じordered contextを付ける。CFG1ではpinned最適化に従いnegativeのNN評価を省略し得る。結果metadataに実評価branchを記録する。negative tensorが存在することを、負branch実行の証拠にしない。

**HIGH→LOWの境界:** `s=sigmas[3]`、HIGH終了の内部状態を `u_3`、Wan正規化をNとする。

```text
HIGH output slot0: h_3 = N^-1(f32(u_3 / f32(1-s)))
LOW initialization: x_3 = f32(f32(1-s) * N(h_3))  // noiseは0、add_noise=false
```

h_3は提案 `wan21-raw-stage-handoff:v1` で、sigma s・前後stage・variant snapshotを保持する。HIGHのdenoised_output slot1ではない。LOW入口の全0判定も元sampler規則に従う。実装時にこの往復を恒等式として省略しない。初期化/終了時のCONST inverse `x/(1-sigma)` とlatentの逆正規化N^-1を別の処理とする。

LOWの最後はsigma0。内部normalized final sampleにN^-1を一度適用し、sampleの公開 `latent` は提案meaning **`wan21-raw-generated-sample:v1`**、NCTHW、同shapeで返す。posterior meanへ改名せず、VAEの新decode契約へ渡す。途中handoffを最終decode入力として採用しない。

## 2. Textとordered context_latentsの本番境界

### 2.1 Text受入れと明示的なBernini準備

```ts
type TextTensor = {
  dtype: 'float32'; layout: 'BLC'; meaning: 'text_hidden_states';
  shape: [1, number, 4096]; data: Float32Array;
  attentionMask: Uint8Array; modelSha256: string;
};
type ConditioningInput = {
  positive: TextTensor; negative: TextTensor;
  context_latents: readonly ContextStream[];
  preparation: { coreProfile: string; textProfile: string; expectedOrderedManifestHash?: string };
};
type PreparedConditioning = {
  handle:string; originalLengths:{positive:number;negative:number};
  orderedManifestHash:string; preparedTextHash:{positive:string;negative:string};
  contextBindings:readonly {streamId:string;sourceId:number;shape:readonly number[];sha256:string}[];
};
```

入口は `1<=L<=512`、data長=4096L、有限値、mask長L、各bit0/1、少なくとも1つの1、encoder hash `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68` を必須にする。positive/negativeの元Lは異なってよい。両branchのmaskやtensorをJSON数値配列へ変換しない。

Diffusionの提案 `prepareConditioning` が受入れsnapshotを所有し、mask0行を0にし、**text_embedding前に**右側の0行/0maskで512行までpadする。元L・元mask・準備版を保持し、穴のあるmaskの位置を詰めない。現在のTEはmask0出力を0にしているので通常は冪等である。native Wan tokenizerのmin_length512に基づくlayout準備で、短いTE実行とnativeの512行実行の数値同等を新たに認定するものではない。

Wanのcross-attentionはtext maskを引数に取らず、biasを持つtext_embedding後の**全行**へattentionする。0行は投影後に0とは限らない。maskをそのままsoftmax maskにしたり、pad行を削除したりしない。現TEの512制限をモデルアーキテクチャの恒久上限とも呼ばない。512超のnative promptは現接続では未対応として明示拒否し、切詰めない。

promptについてはprepared embeddingを本番境界の正本とする。元workflow相当のsystem prefix・negative default・Comfy emphasis/custom embeddingは、plain text APIだけでは自動再現しない。literal textの準備機能を追加する場合はDiffusion側が固定template/negative方針と最終文字列のhashを返し、管理UIは選択値と文字列I/Oを渡す。rv2v候補prefix等は参照版に結び付け、元plugin版の同一性が未確認のまま元手順再現と表示しない。

### 2.2 ContextStreamと順序

```ts
type ContextStream = {
  streamId: string;
  role: 'source-video' | 'reference-video' | 'reference-image';
  slotIndex?: number; frameIndex?: number; // image slot/frameの元の番号
  inputFrameOrder: readonly number[];     // encode前の実frame順
  tensor: {
    dtype: 'float32'; layout: 'NCTHW'; meaning: 'raw-posterior-mean';
    shape: [1,16,number,number,number]; data: Float32Array;
    modelSha256: string; // VAE producer hash
  };
  vaeProfileId: string; payloadSha256: string;
};
```

本番のraw mean受入れはVAEのshape-profile allowlistと対で拡張する。現APIの `[1,16,2,2,2]` 固定guardを通ったことを本番shape受入れとは扱わない。VAE hashは `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。

順序は **source-video → reference-video → 参照slot順 → slot内のframe順**。動画はそれぞれ全選択frameを一度のVAE streamとしてencodeする。参照画像batchは1frameずつ独立streamにする。元のslot/frame番号は来歴として保持し、modelのsource_idと分ける。

source動画は指定canvasへarea/center処理、reference動画/画像はnative aspectを保つlong-edge/stride処理を固定profileに記録する。実shapeはstreamごとに異なってよい。管理ツールは素材とslot/frameの元順を渡し、Diffusionの準備manifestで意味順・shape・hashを確認する。明示したslotが未解決なら黙って欠落させずエラーにする。候補pluginの「読めないslotをskip」と同じエラー挙動を保証するものではない。

欠けたrole/slot用の空streamを作らない。実在listのindex iへ **source_id=i+1** を割り当てる。生成targetは0。例えばsourceがなく画像slot2だけならその画像のsource_idは1である。payloadが同じでもstreamをdedup/並替えしない。正負のcontextを別々に複製せず、1つのordered manifestを両branchが参照する。

### 2.3 coreから確定するconcat/RoPE

確認済みの保存モデルはin/out16、dim5120、40heads×128、40blocks、patch `(1,2,2)`。対象profileではref_conv/clip image prefixを使わない。

1. targetと各contextをそれぞれpatch倍数へpadする。eager sourceはcircular、tracingにはreflectの分岐があるため、採用graphのpadding modeを明示する。今回のeager基準を無断にtracing方式へ替えない。
2. 各streamへ独立に同じpatch_embeddingを適用し、W→H→Tの順にflattenした `[1,K_i,5120]` を作る。
3. `[target tokens, context0 tokens, context1 tokens, ...]` の**token軸**で連結する。raw NCTHWのT/C軸でconcatしない。
4. 各streamのT/H/W座標は0から開始。RoPEはtheta10000、head128のaxis幅 `[44,42,42]`。source_id>0には別の**full128幅**のsource_id rotationを作り、既存のaxis rotationへFP32行列合成する。第4軸、時間offset、H/W座標への単純加算ではない。64pair全体（時間22pairを含む）に合成される。丸めを変える角度の畳込みは別検証なしに採用しない。
5. target/context全tokenをself-attentionと40blocksへ通す。contextは固定K/Vだけの代用品ではない。head後にcontext suffixを除き、targetをunpatchifyし、元T/H/Wへcropしてpredictionを返す。

K_target=21×30×52=32,760。総self-attention tokensは `K_target+Σ(T_i*ceil(H_i/2)*ceil(W_i/2))`。stream数とtoken数を混同しない。`time_dim_concat`、context-window、custom rope_options、control/hook、ref_conv等は別profileの実装・受入まで未対応と明示する。

## 3. VAE latent契約と容量調整

### 3.1 meanと生成sampleを分離する

| 値 | meaning/空間 | 数値処理と受入の所有者 |
| --- | --- | --- |
| VAE encode出力 | 既存 `raw-posterior-mean` | VAEがmeanを生成。stochastic sample/正規化なし |
| mean context | 既存 `wan21-normalized-posterior-mean:v1` | DiffusionがNを一度適用。target全0 skipを流用しない |
| target中間 | 提案 `wan21-noisy-latent:v1` | Diffusion内部。meanに改名しない |
| LOW final内部 | 提案 `wan21-normalized-generated-sample:v1` | Diffusion内部。sigma0のみ最終と扱う |
| sample公開出力 | 提案 `wan21-raw-generated-sample:v1` | DiffusionがN^-1を一度適用。VAEの新decode guardが明示受入れ |

```text
N(raw)    = f32(f32(f32(raw - mean[c]) * scale) / std[c])
N^-1(z)   = f32(f32(f32(z * std[c]) / scale) + mean[c])
scale=1、16 channelの係数/FP32順序はpinned Wan21に固定
```

`normalizeRawMean/restoreRawMean` は既存の128要素mean専用として維持する。生成sampleを通すためにそのmeaningだけ変えない。新しいshape対応kernelではglobal offsetと `positions=T*H*W` からchannelを計算するか、channelを明示して処理する。現実装の `i/8` は本番shapeに使えない。

**VAE担当への変更依頼・合意条件:** raw-generated meaningのdecode受入れをcapabilities/public guard/Worker/profile/APIへ追加する。encodeのmean契約は維持し、`profile.posterior:'mean'` をdecoder入力すべての由来へ適用しない。VAE内で再denormalizeしない。大きい動画shapeは別bundle/参照結果/実ブラウザ受入が必要で、新meaningの追加だけでshape対応済みにしない。現在の受入済みprofileはRGB `[1,3,5,16,16]` / latent `[1,16,2,2,2]` だけである。本変更はまだVAE側と相互合意・実装された状態ではない。

VAEのshape交渉には、target動画、native aspectのreference動画、参照slotの**1frame静止画**を別々に含める。1frameはlatent T=1の独立streamであり、現profileの5frame入力へ勝手に反復/padしない。refを一律にtarget解像度へ変更して既存profileを通すこともしない。

### 3.2 producerとdecoder互換性を別にする（提案）

generated latentのproducerはDiffusionのHIGH/LOWとadapter/graph snapshotである。VAE hashを生成元だと偽装して旧guardを通さない。

```ts
type GeneratedLatent = {
  dtype:'float32'; layout:'NCTHW'; meaning:'wan21-raw-generated-sample:v1';
  shape:[1,16,number,number,number]; data:Float32Array;
  decoderBinding:{modelSha256:string; profileId:string; latentFormat:'wan21-comfy-f32-v1'};
  producer:{module:'diffusion_models'; variantSnapshotId:string;
    highModelSha256:string; lowModelSha256:string;
    graphSetHash:string; adapterSetHash:string; inputRevision:number};
  sigma:0;
};
```

legacy meanの`modelSha256`契約は変更しない。generatedではdecoderBindingとproducerを分けた新契約をVAEと合意し、旧fieldへHIGH/LOW hashを1個だけ押し込まない。正規化版・shape profile・両stage・LoRAの出所を失わない。

現 `.wktensor` は任意の追加provenanceを保存しない。既存形式を使う保存案は「tensorファイル＋版付きdescriptor manifest」とし、manifestに完全なwktensor file SHA・decoderBinding・producer・ordered context情報を結び付ける。読戻しでmanifest欠落/hash不一致ならgenerated接続を拒否する。codec自体を改版する場合は別合意とする。今のmean用保存往復を、新generated契約の保存往復の実績として扱わない。

### 3.3 必要容量、copy、ピーク保持量

以下はshapeと既存copy経路の算定値で、OS/RSS実測ではない。

| 項目 | 要素数 | Float32 bytes | MiB |
| --- | ---: | ---: | ---: |
| 現pointwise上限 | 1,048,576 | 4,194,304 | 4 |
| 既定latent | **2,096,640** | **8,386,560** | **7.998046875** |
| 提案pointwise上限2^22 | 4,194,304 | 16,777,216 | 16 |
| positive+negative各512 hidden | 4,194,304 | 16,777,216 | 16 |
| 最終RGB `[1,3,81,480,832]` | 97,044,480 | 388,177,920 | 370.1953125 |

必要な変更はhost preflight/worker/capability/profile allowlistと、動的shape対応の正規化kernelを一体で行うこと。上限はoperation/profile別とし、request合計input bytes、context合計bytes/token数、保持cache、stage/session、candidate、結果の重複を別に予算化する。単に定数を2^22へ変えただけではVAE・正規化・モデルgraphは対応しない。

既存の固定workspaceを利用する案: Euler65,536要素chunkで32回（tail65,024）、scheduler4,096で512回（tail3,584）。正規化はchannel毎131,040要素を65,536+65,504に分ける案なら32回で済み、全NをWASM arenaへ常駐させる必要はない。いずれも**elementwiseの処理分割**であり、attention/Transformer graphの分割成立ではない。

2入力Eulerについて、caller入力保持・host→Worker clone・Worker結果transferを数える。Euler WASM1,835,008 B、chunk出力slice262,144 Bを加えた既知bufferの保守的算定は次のとおり。

| 経路 | 算定式（B=8,386,560） | bytes / MiB |
| --- | --- | ---: |
| direct計算中 | 5B + WASM + slice | 44,029,952 / 41.990234375 |
| MessagePort計算中 | 7B + WASM + slice | 60,803,072 / 57.986328125 |
| Port応答時の重複を含む | 8B + WASM + slice | 69,189,632 / 65.984375 |

copy trafficはEuler kernel内4Bとhost→Worker 2Bでdirect合計6B、Port経路はさらに入力2B/結果Bで9B。このtrafficと同時保持量は別である。2入力primitiveではなくsample/predictの予測tensorやstage出力を保持すれば、その分も増える。

上表はcompactな独立ArrayBufferが前提。現APIは小さいsubarrayでも大きなbacking buffer全体をcloneし得て、SharedArrayBufferも現型検査を通り得る。次期hostは**dispatch前**にshape/bytes/有限値・backing長・shared/detachedを検査する。基準案は非compact/sharedを拒否すること。compact snapshotを作る選択肢を採るなら追加copyと一時保持を予算に足す。Worker内の要素上限だけではincoming cloneの上限を保証できない。

context payloadは `C=Σ4*16*T_i*H_i*W_i`、textは正負を別に数える。同canvasのsource1本と画像3frameという**例**ではcontext9,584,640 B、target+context+正負最大text=34,748,416 B（mask/metadata/clone別）。実referenceはnative aspect/選択frame数を使って再計算し、この例を元素材の実測としない。

NN側は別の予算である。target32,760tokensだけでFP32 hidden `[K,5120]` は670,924,800 B、同サイズsourceを含む65,520tokensなら1,341,849,600 B。weight・QKV・FFN・attention・ORT/Hike境界copyはさらに必要。これらの制約を忠実なtiling/streaming/partitionで満たす実装・数値照合は未成立。VAEもRGB結果だけで約370MiBあり、現実装のORT出力copy等を外挿した既知bufferだけで約766MiBになり得る（graph/activation/RSSは別）。大profileのexporterは参照NNを実行するため今回実行しない。

## 4. LoRA実モデルconsumerと2組のHIGH/LOW

### 4.1 現接続口との対応

現LoRA File I/OとSDK sourceはadapter原本を読む経路である。`lora/targets.mjs` の1,095 native key/shapeは**実export済みgraph registryではない**。既存partial Gemmの `[16,5120]` graph inputを、元Q `[5120,5120]` のinitializerとして登録しない。

| 必要な契約 | 担当と成立条件 |
| --- | --- |
| `target.describe()` | Diffusion。実graph hash/registryVersion、元logical key、weightId、module、実initializer、shape/dtype/layoutを実exportから生成。slice/transpose/fusionは明示し、未対応なら拒否 |
| `baseProvider.readBlock()` | Diffusion。不変原本からowned blockを読む。model/graph hashとAbortを検査し、patch済みweightをbaseとして返さない |
| LoRA/Hike算術 | 既存LoRA SDK。通常pair/alpha/diff/diff_bの演算とSDKのprepare/apply/detachを担当 |
| `sink.begin/writeBlock/finish/abort/release` | Diffusion。被覆・重複/欠落・checksumを検査し、実graph/external-weight packageへ組み立てる。配列辞書をONNX packageと呼ばない |
| `prepareLoad/validate/commit/rollback/prepareBase` | Diffusion。candidate sessionと合意した小さい実入力の検証、採用直前のcurrent/abort検査、切替・失敗回復・base復帰・解放を担当 |
| 選択と全体工程 | 管理ツール。variant選択と準備を依頼し、global queueを管理。kernelやpackage生成を代行しない |

元baseはscaled FP8/F16、SDKの現consumerはF32 row-majorでquantized/slice/transposeを拒否する。F32化してよいと仮定しない。次工程の候補は、合意したprecision/変換版を持つ実F32 graph/packageとproviderを構築するか、量子化/scale/partitionを明示するconsumer改版を双方で設計すること。両方とも未実装で、今回いずれも採用・実行しない。全量F32化はweightだけで約57.15GB/modelの下限となり、wasm32問題の解決策ではない。

さらに現SDK plannerのtargetは1D/2Dだけで、`.diff`を一律にstem+`.weight`へ対応づける。nativeの`blocks.0.modulation`のような非weight名・3D targetや、5D patch_embedding差分は、I/Oで読めてもそのままSDK.plan/prepareを通せない。rank/非weight key/実initializer対応のhandler改版も対向条件に含める。F32化だけで解決したとしない。実adapter全tensorの被覆を確認し、対応するsubsetだけを黙って適用しない。

### 4.2 A/Bは独立variant pair

必要な宣言は `A.HIGH/A.LOW/B.HIGH/B.LOW`。各sideへbase/graph/adapter full hash、strength、alpha/patch規則版、shape/precision profileを結び付ける。A/Bとlight/detailというSDK名の対応を推測しない。

現MapはHIGH/LOW各1登録であり、B.HIGHをloadすればA.HIGHのidが失効する。4side保持・pair一括採用は未実装である。次期は原本File/metadataを `variantId×stage` で保持し、**activeな生成snapshotは1組**にする。4モデルの同時常駐を条件にしない。A+Bの同一base同時合成はbaselineで無効とし、必要なら別profile・別数値受入へ分ける。

pair登録/検証/採用はDiffusion内部で一括判定し、B.HIGH+A.LOWの途中状態を生成へ使わない。HIGH→LOWは1つのvariant snapshot内のstage切替、A→Bは別variantへの切替である。進行中の生成へ新strength/adapterを混入させない。

現SDKは新しいplanで古いplan/packageを失効させるため、active pairのHIGH/LOWには独立SDK instanceとstage consumerを使う。A/Bの4side宣言を保持するために、4つのNN sessionやprepared packageを同時常駐させる必要はない。

旧sessionとcandidateを同時保持できるとは約束しない。RAM不足時は受付を止め、旧package/identityを保持し、candidate失敗時に旧sessionを再生成する。`switching/recovering` の間は生成を拒否し、部分成功を全体成功と報告しない。rollbackに必要な保存容量・再load時間も予算と状態へ含める。

## 5. 管理ツールに渡す版・schema・呼出しと寿命

### 5.1 版と提案する操作

現行はDiffusion `diffusion-models/0.1`、Text/VAE `works-ai-1`、LoRA SDK `apiVersion:1` のまま。下記の次期schemaは **`diffusion-models/0.2-draft.1`（未実装、未合意）** としてレビューし、受入後に正式版へ昇格する。管理ツールはcapability/version negotiationなしに提案operationを現行endpointへ送らない。

| operation案 | 入力/出力の要点 |
| --- | --- |
| capabilities | manifest登録可、weight I/O、model load、predict、sample、LoRA適用、VAE decode互換を別に返す。対応shapeとoperation別bytes上限も返す |
| prepareConditioning | Textのsnapshot/zero+padとordered raw context manifestを検査・準備。準備済みhandle、hash、元L/順序を返す |
| registerVariant | variantId A/B、HIGH/LOWの元File/原本hash/実prepared manifest+asset/adapter binding+strength。pair handleを返す。session readyの意味ではない |
| load | variant handle、stage、実prepared graph/profileと予算を検証し、受入済みstageのmodelHandle/sessionEpochを返す |
| predict | modelHandle、snapshotId、sigma、正規化noisy target、condition handle。flow velocity tensorと実provenanceを返す |
| sample | variant pair、同じsnapshot、明示initial/noise/sigmas/CFG1/condition。内部でHIGH→LOWを管理し、raw-generated final latentを返す |
| releaseModel | 所有model session/Worker/cache参照を解放。原本File登録とは別。解放後のmodelHandleを拒否 |
| cancel / dispose | 対象jobの取消と、instance全資源終了を分ける。既存I/O操作の意味も保持 |

loadは**各stageの実session**を意味し、File選択だけをload成功にしない。sampleがLOWを必要時にload/reloadする内部段階ロードはDiffusionが所有する。片方のpredict readyだけでpairのsample readyを返さない。両stageのgraph/profile/variant条件をpreflightし、必要時loadが失敗したらstage付きerrorで停止する。

### 5.2 共通request/response schema案

```ts
type DraftRequest = {
  protocolVersion:'diffusion-models/0.2-draft.1'; buildId:string;
  sessionId:string; jobId:string; inputRevision:number; op:string;
  input: unknown;
};
type ExecutionSnapshot = {
  snapshotId:string; variantId:'A'|'B'; variantRevision:number;
  highModelSha256:string; lowModelSha256:string;
  graphSetHash:string; adapterSetHash:string; registryHash:string;
  computeProfileId:string; latentProfileId:string;
};
type ModelRef = {modelHandle:string; stage:'HIGH'|'LOW'; sessionEpoch:number};
type PreparedModel = {
  original:{file:File|Blob; sha256:string};
  manifest:{modelSha256:string; graphSetHash:string; registryHash:string;
    computeProfileId:string; partitionPlanId:string;
    assets:readonly {name:string;bytes:number;sha256:string}[];
    io:readonly {name:string;logicalRole:string;dtype:string;shape:readonly (number|string)[];meaning:string}[];
    declaredShapeProfiles:readonly string[]};
  files:Map<string,File|Blob>;
};
type VariantDefinition = {
  variantId:'A'|'B'; variantRevision:number;
  stages:{HIGH:{model:PreparedModel;adapterBindingId:string;strength:number};
          LOW:{model:PreparedModel;adapterBindingId:string;strength:number}};
  composition:'single-adapter-per-stage';
};
type PredictInput = {
  model:ModelRef; snapshotId:string; sigma:number; branch:'positive'|'negative';
  latent:{dtype:'float32'; layout:'NCTHW'; meaning:'wan21-noisy-latent:v1';
    shape:[1,16,number,number,number]; data:Float32Array};
  conditioningHandle:string;
};
type PredictResult = {
  predictionType:'flow-velocity'; evaluatedBranch:'positive'|'negative'; sigma:number; modelTimestep:number;
  prediction:{dtype:'float32'; layout:'NCTHW'; meaning:'wan21-flow-velocity:v1';
    shape:[1,16,number,number,number]; data:Float32Array};
  model:ModelRef; snapshot:ExecutionSnapshot;
};
type SampleInput = {
  variantHandle:string; snapshotId:string; conditioningHandle:string;
  profile:'bernini-comfy-simple6-shift5-v1'; cfg:1;
  latentProfileId:'bernini-832x480x81-v1';
  initialLatent:{dtype:'float32'; layout:'NCTHW'; meaning:'bernini-empty-target:v1';
    shape:[1,16,21,60,104]; data:Float32Array}; // 全要素0を検査
  noise:{dtype:'float32'; layout:'NCTHW'; meaning:'wan21-sampling-noise:v1';
    shape:[1,16,21,60,104]; data:Float32Array};
  sigmas:Float32Array; // 固定7値とbit照合。JSON数値配列へ展開しない
};
type SampleResult = {
  latent:GeneratedLatent; snapshot:ExecutionSnapshot;
  scheduleProfile:'bernini-comfy-simple6-shift5-v1'; finalSigma:0;
  evaluatedBranches:('positive'|'negative')[];
  stages:{stage:'HIGH'|'LOW'; updates:3; packageHash:string}[];
  inputHashes:{initial:string;noise:string;positivePrepared:string;negativePrepared:string;contextOrder:string};
};
// responseはrequestのidentity + status:'ok'/result または status:'error'/error。
```

hashは64桁SHA-256、shape/長さ/offset/revisionはsafe integer、データは有限値、ArrayBufferは非shared/非detached/compactを基準とする。意味・stage・profile・hash・bytes一致を一緒に検査する。snapshotはDiffusionが正本manifestから生成し、caller値をechoしただけの情報を権威としない。

prepared manifestのshape/precision宣言は受入証明ではない。loadは実assetとI/Oを照合し、Diffusion側の検証済みprofile/receiptへ結び付けてreadyを判定する。callerの`declaredShapeProfiles`だけを根拠に本番shapeを有効化しない。

API instanceのsessionIdとmodelHandle/sessionEpochは別物。build/job/inputRevision/Worker世代に加えてsnapshot/variant/profile/package/epochを、開始時・async境界後・commit直前に照合する。新input/variant/strength/graph/precisionで旧job/candidate/resultを採用しない。cache keyはbase/graph/registry/adapter/strength/変換版/profileを含み、base hashだけでA/Bを共用しない。

### 5.3 呼出し例（提案、現行では実行しない）

```js
// controllerのpseudo-code。draft endpointの実装・合意後に接続する。
// requestDraftはJS呼出し/明示MessagePortを同じenvelopeへ対応づける。
const pair = await requestDraft('registerVariant', variantA); // HIGH/LOW一組
const cond = await requestDraft('prepareConditioning', {
  positive: textPositive, negative: textNegative,
  context_latents: orderedRawVaeContexts, preparation: pinnedPreparation
});
const high = await requestDraft('load', {
  variantHandle: pair.variantHandle, stage: 'HIGH',
  latentProfileId: 'bernini-832x480x81-v1', resourceBudget
});
// 単発predictを利用する場合の値はflow velocity。sampleとの二重更新をしない。
const velocity = await requestDraft('predict', {
  model: high.model, snapshotId: pair.snapshot.snapshotId,
  sigma, branch: 'positive', latent: noisyNormalizedTarget, conditioningHandle: cond.handle
});
const generated = await requestDraft('sample', {
  variantHandle: pair.variantHandle, snapshotId: pair.snapshot.snapshotId,
  conditioningHandle: cond.handle, profile: 'bernini-comfy-simple6-shift5-v1',
  cfg: 1, latentProfileId: 'bernini-832x480x81-v1',
  initialLatent: emptyTarget, noise: explicitNoise, sigmas: fixedSigmas
});
// VAE側のgenerated meaning / decoderBinding /本番profile受入が揃ってから呼ぶ。
const rgb = await agreedVaeApi.decode(generated.latent);
```

管理ツールのrequest adapterはprotocol間のID/結果を対応づける。Text/VAEは `{apiVersion:'works-ai-1',id,module,method,args}`、Diffusionは上記envelope、LoRA SDKはES module transactionであり、同じRPC schemaだと仮定しない。portの初回受渡しは明示origin、以後も許可operationだけを扱う。cross-origin Workerをimport URL変更だけで成立と扱わない。

LoRAのtarget/baseProvider/sink等の関数objectは同一ページ/同じ所有Worker内のinterfaceであり、MessagePortへ関数をcloneしない。管理portにはDiffusionが登録した不透明なconsumer/package/variant handleと許可methodだけを渡し、callback実体はDiffusion側に置く。この文書のTypeScript風schemaはbinary runtime型の契約であり、Float32Array/File/BlobをJSON数値配列や通常のJSON Schemaで検証できるという意味ではない。

### 5.4 所有権、取消、解放、状態

- 現Text/VAEのport結果はbufferをtransferし、host側viewは失効する。管理ツールは受信bufferを所有する。Diffusionの現入力はclone、Worker結果はhostへtransfer、port応答はさらにcloneする。経路ごとに区別し、次期も変更を宣言せずzero-copyを約束しない。
- conditioning/context/variantのprepareは所有snapshotと上限を持つ。queueに巨大tensorを何世代分も積まず、管理側の保留jobは小さいdescriptor/File参照を基本とする。参照しているtensorの寿命と解放時点をstateで公開する。
- global queueは管理ツールがText/VAE共通executorと独立Diffusion executorを跨いで直列化する。Diffusion側にも内部BUSY/資源予算/所属job照合を残す。
- cancelは対象API/session/job/revisionだけを止め、Promiseを必ず終端化する。DiffusionのWorker終了で実model sessionは消えるためepoch/modelHandleを失効させ、次にreloadする。既存LoRA File bindingの保持とは別である。
- LoRA transactionはSDKのAbort/currentとDiffusion candidateのrollbackを対応させる。解除・cancel・dispose・port closeを同一視しない。port detachだけでは実行は止まらず、所有者がcancel/終端化後にcloseする。
- 提案状態はregistered / loading / ready / running / switching / recovering / disposed。一部candidate失敗でreadyと返さず、回復完了前に次生成を受けない。releaseModelはモデル資源、unloadLoraは原本登録、disposeはinstance全体を対象にする。
- 提案error理由は `MODEL_GRAPH_UNAVAILABLE`、`MODEL_MEMORY_PLAN_UNVERIFIED`、`CONTEXT_PROFILE_UNSUPPORTED`、`VAE_GENERATED_CONTRACT_REQUIRED`、`VAE_SHAPE_PROFILE_UNVERIFIED`、`LORA_CONSUMER_UNAVAILABLE`、`PRECISION_PROFILE_REQUIRED`、`STALE_MODEL_EPOCH` 等。現APIがこれらを既に返すとは扱わず、既存NOT_READYと区別して設計する。

## 6. 最小結合検証の条件と進め方

**今回:** source/契約の照合、metadataと整数による容量計算、調整文書のみ。以下は今後の調整実装の最小gateであり、今回NNやexportを実行したという意味ではない。

| Gate | 重くない確認と合格条件 | このgateで認めないこと |
| --- | --- | --- |
| G0 版/現状 | 最新commit差分、3契約hash、capabilityのNOT_READY、schema/shape/bytes/必要field、所有/IDの対応を静的照合 | 本番モデルready |
| G1 Text/context | 既存の保存済み実TE/VAE出力または出所明示の小fixtureでguardを試す。正負の元L/内部mask/右pad、source欠落・slot gaps・batch frame順、同payload別stream、dynamic shape、ordered hashを検査。小さい位置gridで実core由来RoPE/concat規則を独立期待値と照合 | prompt/encoder/全Transformerの数値同等 |
| G2 数値境界 | 小さい16channel Hike配列でN/N^-1、flow→D→Euler、HIGH inverse/out/in/LOW mix、zero初期化、chunk/channel境界・tail・sigma特異点を固定FP32参照と照合。隠れたJS代行を拒否 | mock predictionによる実predict成功 |
| G3 容量/寿命 | まずmetadata/cap/cap+1/aggregate/backing/shared/detached/所有権を検査。実装後に明示budget内の既定shape配列でpointwiseだけを確認し、copy・固定WASM memory・取消・disposeを記録。NN sessionは作らない | graph分割/本番VAE/OSピークの受入 |
| G4 LoRA/profile | 既存source JS/port I/Oを基準にA/B4sideのpair完備・atomic選択・旧id/snapshot/epoch・中止回復を検査。SDK consumer準備段階ではregistry/base/packageの実bytes/hash対応を確認 | fake initializer、常にtrueのvalidate、配列辞書による実package認定 |
| G5 VAE対向 | VAE担当と新meaning/decoderBinding/保存manifestを合意し、小さい受入済みprofileで逆正規化1回・意味維持・誤hash/誤space拒否・direct/port所有を確認。test receiverなら「契約試験」と表示 | 大動画shape/生成全体の成功 |

**次に別工程で必要な実モデルgate:** 実prepared graph/precisionとmemory planの採用、各stage小さい実入力のpredict照合、LoRA packageをloadしたcandidateの実validate/rollback、VAE本番shapeの新bundle/参照/ブラウザ照合、元素材・prompt・RNGと原版を揃えた6step全工程の照合。これらは今回の調整に自動追加せず、負荷・素材・実行範囲を具体化してから進める。

小さい入力であっても14Bモデルのweight/sessionは重い。実model validateを「軽いstub試験」に置換せず、その実行自体を上記の別工程として扱う。

未対応一覧: load/predict/sample本体、元precision/元plugin完全再現、seed単独のComfy RNG保証、本番VAE shapeとgenerated guard、動的mean/生成変換kernel、default容量のhost受入、実LoRA consumer/FP8対応/A-B pair transaction、完全な生成provenance保存、cross-origin対向、全体品質/CPU/RAM改善。To-Beは維持し、独立部品の成立をもってこれらを完了へ変更しない。

## 根拠の主要箇所

- [ComfyUI Wan core](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/ldm/wan/model.py): 62–123, 516–536, 581–645, 654–749。
- [WAN21 wrapper](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/model_base.py): 220–261, 1668–1755。
- [Bernini conditioning node](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy_extras/nodes_bernini.py): 20–98。
- [CONST/flow](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/model_sampling.py): 86–101, 289–294。[samplers](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/samplers.py): 592–620, 993–1006, 1223–1239。
- [Wan text configuration](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/text_encoders/wan.py): 6–14。[SDClipModel](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/sd1_clip.py): 266–287, 668–669。
- [Wan21 latent format](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/latent_formats.py): 755–783。RoPEの行列生成は同版 `comfy/ldm/flux/math.py:20–32`、axis連結は `comfy/ldm/flux/layers.py:15–29`。
- 原workflow・metadata棚卸し: `development/diffusion-models/model-inventory/`。既存成立範囲: `REV3_RESULT.md`, `LORA_RESULT.md` と指定3契約。
