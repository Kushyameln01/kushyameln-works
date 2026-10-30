# F1 — Bernini最大モデルと本番WASM経路の成立性

対象は実装計画Draft §F1/L1と総合接続仕様書 `1.1-draft.1` §7/8/11/15。これは **metadata・小範囲読出し・整数計算による判定** であり、新しい推論の実行記録ではない。機械可読の値・式・元hashは [feasibility.json](feasibility.json) にある。

**結論:** 単一wasm32 Memoryへ全モデルを常駐させる案と、全tokenを保持する素朴な1block実行は棄却する。既存の小さいQ射影は限定されたSUPPORTED。線形/FFNの分割とstream attentionを組み合わせる経路は候補だが、実graph・数値同等性・端末資源の検証がなくUNVERIFIEDである。現在の `load/predict/sample=NOT_READY` を変更する根拠にはならない。独立したL1の実base小block診断は継続できる。

## 1. 今回確認した原本と保存形式

HIGH/LOWとも実ファイルのheaderを再読し、既存inventoryのheader SHAと一致した。さらに両モデル合計720組の小さいscale/config領域を読み直した。今回のモデル読出しは両方合計 **384,896 bytes**。31GBの再hash、全payload読込み、dtype変換、graph export、NN session生成は行っていない。原本full SHAは以前に検証済みの保持manifestから引き継いだ値であり、今回の再計算値ではない。

| 項目 | HIGH | LOW |
| --- | --- | --- |
| 原本 | `Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors` | `Bernini_LOW_fp8_e4m3fn_scaled.safetensors` |
| full SHA-256（既存検証） | `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52` | `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` |
| file / payload bytes | 15,574,833,216 / 15,574,651,928 | 同左 |
| header bytes | 181,280（先頭長8 bytes別） | 同左 |
| tensor数 | 1,815 | 1,815 |
| 量子化config | `{"format":"float8_e4m3fn"}` ×360 | 同左 |
| weight scale | scalar F32 ×360、全て有限・正 | 同左 |
| scale範囲 | 0.00008671624527778476–0.0019269671756774187 | 0.00007540839578723535–0.0017787389224395156 |

| 保存dtype | tensor数/model | 要素/model | bytes/model |
| --- | ---: | ---: | ---: |
| F8_E4M3 | 360 | 13,002,342,400 | 13,002,342,400 |
| F16 | 735 | 1,286,149,184 | 2,572,298,368 |
| F32 scale | 360 | 360 | 1,440 |
| U8 JSON config | 360 | 9,720 | 9,720 |

観測された構成は40blocks、hidden5120、heads40×128、FFN13824、patch `(1,2,2)`、in/out16、text4096。HIGH/LOWは容量上同じ最大構成である。各blockの保存量は377,730,327 bytes。scale/configを除く数値parameterは351,394,304要素/blockで、仮に全てF32なら **1,405,577,216 bytes/block**、F16なら702,788,608 bytes/blockである。全モデルのparameterをF32にする仮定では57,153,966,336 bytes（約57.15GB、53.23GiB）となる。これは変換を採用した宣言でも、実行済みの変換でもない。

既存 `model-architecture/quant-and-block-memory.json` の1,405,577,252 bytes/blockは9個のscalar scaleもF32数値として数える。本書ではparameterとscaleを分けたため36 bytes小さい。いずれも同じheaderに基づく。

## 2. FP8規約と計算precisionの未確認部分

保存形式は **per-weight-tensor scalar scaleを持つE4M3FN**。MXFP8のblock scaleではない。E4M3FNはbias7、有限最大448、subnormalはmantissa×2^-9、符号を除くcode127はNaNとして扱う。

固定coreはComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` と comfy-kitchen `v0.2.40`。`comfy/ops.py` のloaderはconfigと `weight_scale` をTensorCoreFP8 layoutへ結ぶ。eager復号式は次の通りで、出力dtypeへのscaleの丸めも含む。

```text
dequant(output_dtype) = q.to(output_dtype) * scale.to(output_dtype)
F32診断profile候補    = f32(decodeE4M3FN(q) * f32(weight_scale))
```

F16/BF16/F32のどれをcompute dtypeとするか、activationをFP8へ量子化するか、accelerated scaled_mmかdequantized fallbackかは実行設定に依存する。headerだけでは実行precisionを固定できない。実ファイルにinput_scale tensorはないが、それはactivation量子化をしない証明にはならない。pinned coreにはactivation量子化経路がある。

F32復号＋F32 MatMulを、新たに定義した**診断profileの式**として検証することはできる。ただし元FP8 scaled_mmとの丸め・累積・activation量子化の同等性は **UNVERIFIED**。F16のscale castを含む式とも一般には異なる。元workflowのファイル名がMXFP8である一方、今回保持した原本はscaled E4M3FNであり、同じ出力を保証していない。

L1へ渡すprofileにはoriginal key/full shape、source dtype、scalar scaleの元tensor/bytes、compute dtype、selected row/slice、binding種別、復号規約版、base/graph identityを含める。小tileを元full shapeのinitializerとして偽装しない。LoRA適用結果のF32受口は、既存FP8入力へ再量子化して戻す経路とは分ける。

## 3. 本番shapeのtensor内訳

既定targetは `[1,16,21,60,104]`、2,096,640要素、F32なら8,386,560 bytes。RGB `[1,3,81,480,832]` は388,177,920 bytesで、どちらも実ピークRAMではない。

patch後target token数は `21×30×52=32,760`。全self-attention token数は以下であり、contextも全40blocksを通る。

```text
N = 32760 + Σ(T_i × ceil(H_i/2) × ceil(W_i/2))
H = N × 5120 × sizeof(compute dtype)
FF = N × 13824 × sizeof(compute dtype)
self-score = heads × N × N × sizeof(score dtype)
cross-score = heads × N × 512 × sizeof(score dtype)
```

以下はF32の**個別tensor bytes**。target-onlyは下限、同canvasのsourceを加えた列はrv2vの条件付き例である。実referenceのnative aspect、frame数、選択順の全入力が未取得なので、実Nの上限や最終ピークは確定していない。3枚の同canvas参照画像を加えたN=70,200の例もJSONへ記録したが、元素材の実測ではない。

| tensor | targetのみ N=32,760 | target＋同shape source N=65,520 |
| --- | ---: | ---: |
| hidden / residual 1本 | 670,924,800 | 1,341,849,600 |
| self Q/K/V 3本 | 2,012,774,400 | 4,025,548,800 |
| self K/V cache全head | 1,341,849,600 | 2,683,699,200 |
| self score 全40head | 171,714,816,000 | 686,859,264,000 |
| self score 1head | 4,292,870,400 | 17,171,481,600 |
| cross K/V（text512） | 20,971,520 | 20,971,520 |
| cross score 全40head | 2,683,699,200 | 5,367,398,400 |
| FFN拡張 / GELU出力の各1本 | 1,811,496,960 | 3,622,993,920 |
| RoPEのfull 2×2行列 | 33,546,240 | 67,092,480 |
| head出力64channel、context切捨て前 | 8,386,560 | 16,773,120 |

正負text入力は各8,388,608 bytes、投影後各10,485,760 bytes（512×5120）。time/modulationの小配列、LayerNorm/RMSNormやGELUのworkspace、softmax probabilities、patch/context concat、layout transpose、ORT allocator/arenaは上表の別項目である。GELU前後を同時保持する実装ならFFN拡張が2本必要になる。F16化で上のtensor量を半分にできても、そのprecisionの受入や実kernelは別条件である。

## 4. 棄却した実行単位と真の阻害

wasm32 Memoryの理論上限は **4,294,967,296 bytes/Memory**。これは全ブラウザ合計の上限ではない。複数Memory・Workerの総量はこれを超え得るが、端末RAM/ブラウザ/ORTのより小さい実上限とcopyを別途満たす必要がある。memory64や新backendが現runtimeで使えるとは仮定しない。

1. **全weightの単一Memory常駐:** 保存payloadだけで約14.505GiB/model。external dataやファイル分割だけでは実行時常駐を減らさない。再実装・試験は不要で棄却済み証拠を維持する。
2. **dense self-attention:** target-onlyの1head scoreは理論上限のわずか2,096,896 bytes下。他のinput/outputやworkspaceを置けない。全head scoreは159.92GiB、source例では639.69GiB。これはdense scoreをそのまま作る案の棄却であり、stream attentionの不可能性の証明ではない。
3. **1blockをF32で丸ごと常駐:** weightだけなら1.309GiBだが、scoreを全く作らない仮定でも、weight＋residual＋QKV＋attention出力はtargetのみ4,760,201,216 bytes、source例8,114,825,216 bytes。weight＋residual＋FFN拡張1本＋出力も4,558,923,776 / 7,712,270,336 bytesとなる。block単位のファイル分割だけでは不足する。
4. **FFNの全token 1射影:** source例はF32 weight283,115,520＋input1,341,849,600＋output3,622,993,920＝5,247,959,040 bytes。attentionだけを改良してもFFN側の分割が必要である。

これらは明示したbufferが同時生存する案の必要量であり、ORTの実ピーク測定ではない。元ComfyUIのoptimized attentionがdense scoreを必ず実体化するとも断定しない。

## 5. staging候補と既存Hike/ORT境界

| 実行単位 | 判定 | 成立済み / 残課題 |
| --- | --- | --- |
| header・scale/config | SUPPORTED | 今回再読・既存hash一致。full payload有限性/NN互換は別 |
| Q `[16,5120]` とactivation `[1,5120]` | SUPPORTED（既存限定証拠） | 実Hike復号→ORT WASM Gemm→Hike bias。全block/全graphの証拠ではない |
| Linear/FFNのtoken/出力row tile | UNVERIFIED | weightとactivationをbounded feedへ分割する候補。bias、GELU(tanh)、累積順・layout・source compute profileを維持した実graph/参照が必要 |
| head単位、query/key tileのstream attention | UNVERIFIED | full score実体化を避ける候補。全keyを使うsoftmax、max/sum再正規化、QK norm/RoPE/source_id・FP32の丸め/縮約順と独立比較が必要 |
| 本番predict/sample | BLOCKED / NOT_READY | graph分割・算術/精度・host ABI・全context/profile・資源/取消・実参照が未成立 |

stream attentionの容量例としてQ128×K256×head128なら、Q/K/V/score/running output/row max・sumの論理F32 bufferは525,312 bytes。これはアルゴリズム候補の整数計算であり、新しいkernelの実行・数値検証ではない。source例のK/Vを1head分保持するだけでも67,092,480 bytesで、全headのcache・residualや重みは別である。全keyを走査せず一部を捨てる方法、context-window化、意味を変える近似attentionを勝手に採用しない。

既存partialの記録は `docs/shared/diffusion-models/ort-bridge/browser-results.json`。ORT1.24.3、graph SHA `af48828a7e93d75f529cee34c9b609cf4c3748f095a2c6fb3d5f1d71424988b0`、Hike Memory1,507,328 bytes、論理arena409,728 bytes。q81,920 bytes→F32 weight327,680 bytes、x20,480 bytes、output/bias各64 bytesが境界を通る。Hike出力slice、hostのowned buffer、ORTの実行Memoryは同じ領域ではない。ORT Memory全量・allocator overhead・OS/RSSピークはこの記録にない。

Hikeは固定arenaを再利用し、grow後にviewを取り直し、返却をowned copyにするABIを維持する。Memory grow前のview、他kernelのpointer、渡したbytesを実行中に再利用する設計を禁止する。実行単位を大きくする場合はcapacity/offset/byte範囲を一体で定義し直す。

既存pointwiseの固定量はEuler1,835,008 bytes（65,536要素chunk、arena786,432）、scheduler1,114,112 bytes（4,096要素chunk、arena49,152）、mean1,114,112 bytes（128要素、arena1,024）。公開pointwise上限1,048,576とmeanの固定ABIは本番latentを受け入れない。上限定数やMemoryだけを増やす変更では受入にならない。

## 6. 搬送、package、旧新sessionを含む保持量

F32 hiddenをHとすると、別runtimeへ渡す1block境界は少なくともinput Hとresult Hの搬送を要する構成がある。source例のHは1,341,849,600 bytes。host input＋ORT input＋ORT output＋host owned resultの4本が同時に残れば **5,367,398,400 bytes**、さらにHikeのarena/weightと管理側保持物を足す。これは複数Memory/hostを合算した条件付き保持量で、一つのMemoryに全て入るという式ではない。毎block input/outputを丸ごとcopyする方式なら40blocksで約107.35GB、6回評価で約644.09GBのcopy trafficになる。trafficと同時保持量・経過時間は別である。

stage inputをtransferするか、host snapshotと複製するか、token/feature tileで流すかによって量は変わる。MessagePortやcallerの保留結果も別bufferとして予算化する。small subarrayの巨大backing buffer clone、SharedArrayBuffer、同時package候補はdispatch前に検査する。File/Blob参照を保持することは15GBのresident配列を作ることと異なるが、OS cacheやRSSを0と保証するものではない。

| 旧新状態の保持例 | parameter/package bytes（activation/arena別） |
| --- | ---: |
| 旧新の全model F32 parameter 2組 | 114,307,932,672 |
| 旧新の全保存payload 2組 | 31,149,303,856 |
| 旧新の1block F32 parameter | 2,811,154,432 |
| 上記＋変換前の1block保存bytes | 3,188,884,759 |
| 旧新それぞれpackage＋独立session copyの1block例 | 5,622,308,864 |

active旧sessionとcandidateの両方を常にRAMへ保持できるとは約束しない。旧sessionを先にreleaseする方式では生成受付を止め、検証済みdescriptor/assetsを保持し、失敗時は旧状態を再loadして回復を確認する。lease/独立copyが成立する前にprepared bytesをreleaseしない。session.release/Worker終了とOSへの即時返却は同一ではない。

HIGH→LOWは同じ受入済みsnapshotの段階ロードを基準とする。A/B切替や旧新candidateは別の寿命であり、四つのNN sessionの常駐を要求しない。管理はglobal resource group/queue、Diffusionは内部Memory・session・cache・copy上限と解放を所有する。LoRAのworkspace/package、Text/VAEの各profile資源は各所有担当のreceiptと合算する。現小VAE実績を本番動画profileのメモリ量へ外挿しない。

## 7. D1/L2へ渡す判定と次のgate

F1の判定として、**既存の一括常駐/素朴block方式の具体的阻害は確定**した。全生成に採用できる実行方式はまだ選定・受入されていない。必要なのは次の証拠であり、管理UIの拡張や巨大package生成で代替しない。

1. 元素材の実context shape、固定source compute/FP8規約、参照入力/出力を取得する。保存dtypeと演算dtypeを分ける。
2. bounded Linear/FFN、stream attention等の実graph/ABI、hash、I/O/順序、weight/data移動と資源上限を固定する。LoRAが変更するfull targetとslice coverageを失わない。
3. 実baseの小blockと独立期待値をL1で比較する。診断scopeを全層/元FP8/生成の合格へ昇格しない。
4. 採用候補について、allocator/arena・Hike/ORT境界copy・旧新package/session・取消/回復を計測する。端末RAM/ブラウザ上限・実経過時間が未知のままresource readyにしない。
5. その後、合意した負荷範囲で本番shape・各stage予測・全context・LoRA適用・generated decodeへ進む。本書はこのNN実行を行っていない。

根拠は保存済みheader inventory、`model-architecture/architecture-report.json` と同reportが固定するcore source SHA、現Hike/ORT境界sourceと既存の限定実行記録。古いarchitecture reportの「TE/VAE API pending」「LoRA未提供」等は過去時点の記述であり、現在の外部担当の成果不存在とは扱わない。今回の未達は本番profile/実consumer/全NNの受入である。

計算結果は別のNode実装でBigInt/整数式と以前のinventoryへ照合し、62項目一致を確認した。JSON構文検査も通過した。これは容量算定の確認件数であり、モデル・ブラウザ・新kernelの実行件数ではない。


## L1実装後の限定追補

上の既存partial記録は過去のABIを指す。今回追加したF16→F32の実Hike経路ではprovider/stage各Memory1,572,864 B、arena491,648 B。実HIGH/LOW Fileと実ORT/Hikeの新しい検証はl1-final-browser.json、細かなcopy/候補保持はDIAGNOSTIC_API.md/DIFFUSION_RESULT.mdへ分離した。F1の本番容量算定やD1未成立を、この限定実行によって合格へ変更しない。
