# 数値規則と規範の決定根拠

版 `1.0-draft.1`。状態 `documented-draft`。目的は、式・定数・dtype・丸め順・source・計算owner・事前gateとscopeを明示し、規範に必要な宣言と条件を導くこと。機械可読正本は `numerical-rules.v1.json`。本資料は製品演算の実装でも管理runtimeへの統合でもない。

# 1 規則の責任と規範への出力

モデル演算はTextEncoder、VAE、Diffusion、LoRAの各ownerが実行する。管理は採用済み数値規則を再計算せず、選択した規範へ必要な宣言・版・owner・意味・shape・precision・証拠scopeが揃っているかを比較する。数値の独立oracleと全値比較結果はownerの証拠として参照する。

| ruleId | source上の処理 | 演算owner | 規範へ渡す判断材料 |
| --- | --- | --- | --- |
| NR-WAN21-MEAN-F32 | channel別mean/std、f32順序 | Diffusion Hike | exact shape・意味・VAE binding・normalization ID・ABI・scope |
| NR-RGB-AFFINE-F32 | x*2-1 | VAE Hike | RGB範囲・意味・profile、二重変換拒否 |
| NR-UMT5-RMSNORM-F32 | 最終RMSNorm | TextEncoder Hike | epsilon/重み/モデル・kernel、選択manifestのgate |
| NR-LORA-LINEAR-F32 | scale・低rank積・base加算 | LoRA Hike／固定loader規約 | variant/rank/alpha/strength、shape/layout/coverage |
| NR-LORA-DELTA-F32 | diff/diff_b加算・保存dtype復号 | LoRA Hike | weight/bias役割、patch実在、除外・pass-through |
| NR-FLOW-SCHEDULE-F32 | fixed simple6/shift5 | Diffusion Hike | scheduler ID、sigma境界、source/shape |
| NR-FLOW-NOISE-F32 | noise mix/inverse・velocity→denoised | Diffusion Hike | inputの意味・sigma/noiseScale・operation予算 |
| NR-EULER-DENOISED-F32 | denoisedからのEuler更新 | Diffusion Hike | denoisedとvelocityの区別、sigma区間 |
| NR-GENERATED-MEAN-SEPARATION | 生成sample受入口の意味分離 | 復元Diffusion／decode VAE | 実復元証拠の必要性。未実装経路の拒否 |
| NR-SCOPED-GATES | 比較前gateと受入範囲 | 各数値ownerが宣言・検証 | scope限定の既存gate。管理は値を後付けしない |

`normInputs`はこれらの規則から規範側へ渡す宣言と条件の記録で、新native fieldの一覧ではない。JSONのsourceRefsはrepository/完全commit/pathを持つ。新IDはこの資料のrule参照IDであり、既存wireやprofileへ送信しない。

# 2 Wan21 posterior mean

`f32(a op b)`はsourceのfloat32演算位置を説明する記法であり、管理側の実装関数名ではない。Hikeのfloat32 sourceと生成WASMを固定する。compiler/backend変更時はsource上の意図だけでなく生成WAT・binaryと独立比較を確認する。

```text
normalize:
  difference = f32(x - mean[c])
  scaled     = f32(difference * 1.0f)
  z          = f32(scaled / std[c])
restore:
  product    = f32(z * std[c])
  divided    = f32(product / 1.0f)
  x_restored = f32(divided + mean[c])
```

scale factor=1もsourceでは積／除算として保持する。逆数へ書換えない。係数は以下の十進literalをcompilerがfloat32へ変換する。FP64係数を使った別計算とbit同等とはしない。

| channel | mean | std |
| --- | ---: | ---: |
| 0 | -0.7571 | 2.8184 |
| 1 | -0.7089 | 1.4541 |
| 2 | -0.9113 | 2.3275 |
| 3 | 0.1075 | 2.6558 |
| 4 | -0.1745 | 1.2196 |
| 5 | 0.9653 | 1.7708 |
| 6 | -0.1517 | 2.6052 |
| 7 | 1.5508 | 2.0743 |
| 8 | 0.4134 | 3.2687 |
| 9 | -0.0715 | 2.1526 |
| 10 | 0.5517 | 2.8652 |
| 11 | -0.3632 | 1.5579 |
| 12 | -0.1922 | 1.6382 |
| 13 | -0.9497 | 1.1253 |
| 14 | 0.2503 | 2.8251 |
| 15 | -0.2921 | 1.916 |

channelはF1正方形64値だけfloor(i/4)、F5/非正方形128値はfloor(i/8)。count一致ではなくhostのexact shape/profile照合から専用exportへrouteする。意味・shape・VAE hash・有限性・directionをownerが検査する。raw0もこの式へ従い、生成sampleは入力対象ではない。

# 3 RGB、RMSNorm、LoRA

RGBはmeaning=rgb-unitの場合にVAEが `product=f32(x*2); raw=f32(product-1)` を実行する。raw入力はそのまま使い、RGB範囲をraw latentへ課さない。VAE decodeのconv2はHike MatMul＋biasであり、latent正規化とは別のモデル演算。

UMT5最終RMSNormはhidden4096、epsilon1e-6。列を昇順にf32二乗和し、列数でf32除算、epsilonをf32加算する。固定env.sqrtのf64入力・出力を介し、sqrt結果をf32へ戻してf32逆数を作る。input×inverse、さらにweightをf32乗算する。FP64の和、別epsilon、FMA、inverse-sqrtへの無検証置換を同じ規則としない。Textの実gateはmanifest.numericGateを参照し、今回未取得の値はunverifiedのままにする。

LoRA固定policyは `comfy-lora-b5a4321-linear-diff-v1`。対応するLinearだけ、JS effectiveScaleが `strength*(alpha/rank)`、明示nullのalphaなら`strength*1`を計算し、kernel hostがMath.froundでscaleをf32化する。alpha0や負値を欠落へ読み替えない。

Hike mergeはrow/columnごとにsum=f32(0)、k昇順で `sum=f32(sum+f32(up[i,k]*down[k,j]))`、最後に `base+f32(scale32*sum)` をf32加算する。down/A=[rank,in]、up/B=[out,rank]、base=[out,in]。diff/diff_bはalpha/rankを使わず `base+f32(strength32*delta)`。再適用・強度変更・解除は不変baseから再構築する。

LoRA sourceのBF16/F16/F32と演算F32を分ける。u16の読取りはhost、BF16/F16数値復号はHike、F32もHike copyを通る。非有限・overflow・未知variant・無規約alpha・量子化base直接入力等を拒否する。light Q biasの実合格と、診断外の全201 diff適用合格は別である。detailのbiasは不変base pass-throughで、架空のLoRA biasではない。

# 4 schedulerとlatent更新

fixed scheduleは `bernini-comfy-simple6-shift5-v1`。1000点tableの各tにsource記載の `/1000 → *1000 → /1000` のf32順序を保ち、`5*t / (1+4*t)` を計算する。選択索引は999,833,666,499,333,166、最後にsigma0を追加。HIGHは境界0〜3、LOWは3〜6を共有する。model timestepはsigma*1000。固定table生成は全HIGH/LOWモデルhandoffの成立ではない。

noise mixはcomplement=f32(1-sigma)、scaledNoise=f32(noiseScale*noise)、noisePart=f32(sigma*scaledNoise)、latentPart=f32(complement*latent)、最後にf32和。inverseはlatent/(1-sigma)でsigma=1を拒否。flow denoisedはx-f32(velocity*sigma)。どれも供給済み配列の数値部品で、PRNGもニューラル予測も実装しない。noiseScaleはnative requestでは明示し、direct helperの既定1を新native既定にしない。

Eulerはdenoised x0を入力とし、dt=nextSigma-sigma、derivative=(x-denoised)/sigma、next=x+derivative*dtのf32 source順を保つ。raw velocityをdenoisedへ無断relabelしない。sigma>0、0≤nextSigma≤sigma、hostの有限性・容量検査を適用する。

component schedulerのMAX_ELEMENTS=4,194,304／CHUNK4096と、native RPCの1,048,576要素予算は別の層にある。内部の大きい上限を理由にRPCや本番shapeを許可しない。chunkはelementwise処理のworkspace再利用であり、モデルgraph分割能力ではない。

# 5 gateはscopeと一緒に採用する

| 既存の比較対象 | 比較前gate | 適用していない範囲 |
| --- | --- | --- |
| F1/Rect mean往復 | maxAbs≤2e-6。normalize/restore各値は独立struct-f32と一致 | 大shape、generated sample、別family/precision |
| 実4 LoRA Q選択weight | abs≤1e-5＋1e-4×abs(ref) | 全target、元GPU precision、全model |
| 不変baseの選択weight/bias復号 | F32数値・bytes厳密一致 | 任意復号方式、除外target |
| LoRA適用後の選択bias16値 | F32数値厳密一致。新たなbit一致条件は追加しない | 除外bias・未知variant |
| Q consumer全16出力 | abs≤1e-6＋1e-5×abs(ref) | 他activation全般、全query/head/attention、本番生成 |

gateの根拠はDiffusion RECT-RESULTとLoRA JOINT-LORA-RESULTの固定記録。actual F32、独立参照f32またはNumPy binary64、shape・source・kernel・coverageを一緒に保持する。最大観測誤差やPASS件数を新thresholdへ変換しない。未取得manifestのgate、新generated producer、81frame、whole-model精度には値を作らない。

管理は選択した規範に必要な事前gateとowner発行証拠の一致を確認する。異なるscopeのPASSを足してfull acceptanceにせず、数値oracleやモデル演算を管理へ新設しない。

# 6 出典と確実さ

JSON sourceRefsに完全commit/pathを記載した。主な固定根拠は次のとおり。

- Diffusion `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` のlatent-space .hike/.mjs/registry、scheduler .hike/.mjs、kernel/euler.hike、API、RECT-RESULT。
- Text/VAE `855f435120f08eb9e818e51281fc26f0e2633829` のvae.mjs、text-encoder.mjs、tensor.hike、API。
- LoRA `fc2789a0f649e33f15eb13750e6a983b5c52d170` のloader-policy.mjs、host.mjs、lora.hike、kernel README。scale規約の上流は固定ComfyUI b5a4321のsubsetで、任意safetensors一般の規則ではない。
- 実Q gateは直接取得したLoRA `0c27874908638afc748ea2455a2779a16736730b` のJOINT-LORA-RESULTに帰属する。後続版でも同じgateを使うという記録と、新規受入範囲を分ける。

今回、sourceを直接読んで式・定数・順序・ownerを確認した。ownerの数値試験を今回再実行したわけではない。上流coreや未取得manifestの内容、別compilerの出力、生成sample復元はunverifiedを残す。

# 7 変更手順

1. 新要件と変更理由をownerが確定し、source/生成物/ABI/precisionと影響scopeを固定する。
2. 本ruleの式・条件・sourceRefs・evidenceScopeを更新し、独立oracleとgateを実行前に選ぶ。未知はunverifiedで残す。
3. normInputsを対応するprofile/正規化catalogと規範へ渡し、意味・shape・owner・source・scopeの照合条件を改訂する。新native fieldやnative profile IDを管理側で発明しない。
4. ownerの数値受入、native単独回帰、adapter情報保全、規範照合を段階別に確認する。gate変更は別の根拠と承認範囲で扱う。
5. 旧版証拠を新sourceへ付け替えず、数値規則・規範・catalogの版と未達を同期して引き継ぐ。

# 文書の参照先

[総合管理台帳](https://chatgpt.com/space/page_7036da19567881918356235b7aa82b83)／[管理照合規範](https://chatgpt.com/space/page_7972cb392a3481918a1ceb0b7501bb76)／[数値規則](https://chatgpt.com/space/page_ecfe5b714e008191a7779e5cd2bad42c)
