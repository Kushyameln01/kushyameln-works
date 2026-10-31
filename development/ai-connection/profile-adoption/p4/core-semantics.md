# P4 実QKVからnormとRoPEへの固定境界

固定coreはComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`。取得した原文5file、bytes/hash/Git blobは `core-manifest.json`。元の本番入力hidden・compute precision・全contextの参照がないため、今回の実行単位は **実block0重み＋明示hidden16tokenのF32 operator診断** とする。本番N32,760やsource込み65,520以上を16へ変更した本番合格ではない。

## QKVと正規化の縮約軸

`comfy/ldm/wan/model.py:55–60,72–78` はQ/K/Vを独立Linearとし、Q/K各Linearの後へ `RMSNorm(dim, eps=1e-6, elementwise_affine=True)` を適用してから `[B,S,40,128]` へviewする。実モデルdimは **5120**。head128だけを射影・正規化すると別の演算になる。Fluxの `QKNorm(head_dim)` はこのWanのQK normではない。

実LOW/HIGHのheaderにはQ/K/V各weight `[5120,5120]`（F8_E4M3）、bias `[5120]`（F16）、norm_q/norm_k weight各 `[5120]`（F16）がある。FP8 weightはper-tensor F32 scalar scaleと27byte quant configへ結ぶ。今回は全weightをF32配列として保存・常駐させず、16output行ずつ実原本から読む。

本来のself-attention入力は `model.py:264–271` の `modulate(x, norm1, e[0], e[1])`、すなわちblock hiddenのLayerNormとtime modulation後の値。今回の入力recipeはその境界に明示注入する決定的fixtureであり、patch embeddingや前blockから実際に生成されたhiddenではない。

`comfy/ops.py:746–763` のRMSNormはPyTorch `functional.rms_norm`へ委譲する。縮約のF32内部順、rsqrt/fusion、GPUbackendの丸めは、このcore本文だけでは固定できない。新診断は既存Hike generic RMSNormの全5120列逐次F32二乗和、5120でF32除算、epsilonF32加算、F64 sqrt primitiveからF32、F32逆数、input/affineweightの順を明示する。これはText最終層APIの利用や、元Torch fused rsqrtとのbit同等性ではない。

## RoPEの生成とsource回転

`model.py:535–536` はtheta10000、head128をT/H/Wの **44/42/42** に分ける。`flux/layers.py:15–29` のEmbedNDはT/H/W順で3つのropeをconcatする。64complex pairのうちT22pair、H21pair、W21pairである。

`flux/math.py:20–32` のropeはFP64 `linspace(0,(dim-2)/dim,dim/2)`、`omega=1/(10000**scale)`、F32位置をFP64へ昇格した積からFP64 cos/sinを作り、最後にF32の `[[cos,-sin],[sin,cos]]` 行列へ変換する。実装のF64 primitive bridgeと独立NumPyの差は事前matrix gateで比較し、元GPU trigonometryと同じとはしない。

`model.py:654–685` は各streamのT/H/W座標を0から作る。target source_idは0、contextは提供順に1,2,…。source_id非0では `model.py:687–692` の別 `rope(float32(source_id),128,theta)` を作り、元の64pair全体へ **F32の2×2行列積** で合成する。時間pairも含む。H/Wだけへの加算、第4軸、時刻offset、sin/cosを角度和へまとめる操作へ置換しない。

RoPE applyは隣り合う2要素に行列を左から掛ける。数学は2項積和だが、通常実行の `apply_rope1` はcomfy-kitchenへdispatchする。診断はHikeのF32積→F32和を明示し、GPU fused addcmul/FMAの丸めを認定しない。元原文との意味対応と新診断の演算順を分ける。

## 事前gateと独立参照

`candidate-plan.json` は実行前に固定し、親担当がgateを承認した。比較式は `abs(actual-ref) <= absolute + relative*abs(ref)`。失敗後に閾値を緩めない。

| 境界 | gate | 独立reference |
| --- | --- | --- |
| FP8/F16復号 | F32 bytes一致 | Python E4M3FN literal decoder/F16 struct相当、scale F32 |
| 全Q/K/V `[16,5120]` | abs1e-4＋rel1e-5 | rows16ずつNumPy binary64 dot→F32、biasをF32加算 |
| 全5120列RMSNorm | abs1e-4＋rel1e-4 | binary64 mean-square/sqrt/affine→F32。F32 source順oracleも別に保存 |
| RoPE行列 `[16,64,2,2]` | abs2e-6＋rel2e-6 | NumPy FP64周波数/trig→F32、別source_id行列のF32積 |
| 選択head Q/KのRoPE出力 | abs1e-4＋rel1e-4 | 上記独立norm/行列のF32 apply |
| 接続attention `[16,128]` | abs1e-3＋rel1e-4 | 独立Q/K/Vからbinary64 stable softmax→F32 |

projection gateは既存full-width QのF32境界を出典とするが、batch16/QKV接続は今回の新受入scope。norm gateは5120逐次F32縮約と独立binary64 oracleとの差、connected gateはstage合成の事前誤差予算で、本番生成の許容差ではない。

座標16件は `candidate-plan.json` の順序を使う。source0/1/2、T/H/W非0と境界座標を含む。これはproduction grid `[21,30,52]` の座標coverageを示す例で、実素材・実context shape・実供給hiddenの受領証拠ではない。attentionは宣言した16selected keyだけを使い、元full contextのglobal attentionへ代用しない。

## 容量と未受入条件

3射影weightの保存bitsは78,643,200B、仮F32では314,572,800B。bias/normを加えた数値parameterは保存78,694,400B／仮F32 314,675,200B。1回のraw weight tileは81,920B、F32 tileは327,680B。full-hidden16は327,680B、QKV出力3本983,040B、QK norm出力2本655,360B、norm affine2本40,960B、選択head QKV24,576B、RoPE行列16,384B。これらは個別の論理配列量で、ORT/Hike Memory・snapshot・GC・旧新sessionを含むピークではない。

今回の3射影は1,258,291,200 multiply-add。N32,760を同じ3射影へ通すなら2,576,351,232,000 multiply-addで、hidden1本は670,924,800B。全K/Vを選択1headだけ保持しても33,546,240Bある。QK normには各token全5120列が必要なので、head128のweightだけでこの費用を消したことにしない。

runtime所有者が同時保持するHike/ORT session・arena・copy・途中tensorを一つの実行で計測する。ORT allocatorと汎用producer residencyの未測定値はnull。1台のクラウド観測を利用者端末の改善へ読み替えない。

不足しているのは、実timestep/blockのpost-LayerNorm/modulated hiddenと元入力binding、固定production dtype/backend、独立中間参照、全target/context/allquery/allheadの組合せ予算。`productionQKVVerified:false`、`load/predict/sample=NOT_READY`、P5=BLOCKEDを維持する。

reference生成は `tools/diffusion-models/p4-reference.py --models <retained-model-dir> --side LOW --output <new-absolute-private-json> --receipt <public-metadata-json>`。私的JSONにraw input/expected/normweightを保持し、public receiptはshape/hash/gate/読出し量のみ。実重みやraw参照payloadを公開Gitへ入れない。
