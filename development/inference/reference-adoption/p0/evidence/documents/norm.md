# 正規化の参照契約

版 `1.0-draft.1`。状態 `documented-draft`、runtimeIntegrated=false。目的は、モデル内・入出力・latent空間の異なる正規化を混同せず、固定した数値規則から管理側が照合できる宣言と入場条件を取り出すこと。機械可読な正本は同じ版の `normalization.v1.json`。本catalogをruntimeやnative APIへ接続する実装は行っていない。

# 1 数値規則から規範を決める

順序は **原モデル／固定loaderの意味 → ownerの数値sourceと生成物 → 適用shape・dtype・丸め順 → 比較前に定めたgateと受入scope → 規範へ渡す宣言・拒否条件**。現在動く小shapeへ本来のモデル要件を縮小したり、観測誤差を見てthresholdを後付けしたりしない。

`NUMERICAL-RULES.md` と `numerical-rules.v1.json` は式・定数・精度・source・既存gateの根拠を保持する。本catalogは、その規則を実行してよいと判断するために必要な宣言を保持する。管理は宣言、source/build/kernel、意味、profile、owner、既存の証拠scopeと規範の一致を比較する。mean/std、RMSNorm、低rank積、scheduler等のモデル演算を管理へ再実装しない。数値比較の実行と全比較結果は各ownerの責任である。

recordIdと数値ruleIdは本資料内の参照IDであり、native profileIdやwire fieldではない。`requiredDeclarations`／`admissionConstraints`もcatalogの外側記述で、同名fieldをnative tensorへ追加する要求ではない。

# 2 正規化対象と実owner

| recordId | native識別と意味 | 計算owner | 適用範囲 |
| --- | --- | --- | --- |
| NORM-WAN21-MEAN-F5 | wan21-raw-f32-5x16x16、raw/normalized posterior mean | Diffusion Hike | float32 NCTHW [1,16,2,2,2]、128値 |
| NORM-WAN21-MEAN-F1 | wan21-raw-f32-1x16x16、raw/normalized posterior mean | Diffusion Hike | [1,16,1,2,2]、64値 |
| NORM-WAN21-MEAN-RECT | wan21-raw-f32-1x16x32、raw/normalized posterior mean | Diffusion Hike | [1,16,1,2,4]、128値 |
| NORM-RGB-UNIT-TO-RAW | rgb-unit→raw-decoder-rgb。独立profile IDなし | VAE Hike encode前処理 | [0,1] RGBを[-1,1]へ。configured RGB profileに従う |
| NORM-RAW-GENERATED-DECLARATION | wan21-raw-generated-sample:v1。計算済みと認定しないconsumer契約 | 復元はDiffusion、raw decodeはVAE | exact profile・producer列・decoder binding。実producer/復元未実装 |
| NORM-UMT5-RMSNORM | 実encoder.final_layer_norm。独立profile IDなし | TextEncoder Hike | hidden4096、manifest epsilon1e-6。内部モデル演算 |

同じ128値でもF5とRectは別shape・時間空間profileである。RGBのFとlatentのTも別軸。contextの元frame列をlatent T個へ切り詰めない。LoRA weight/biasはこのmean表の対象ではない。

# 3 Wan21 meanの根拠と拒否条件

native正規化規約IDは `wan21-comfy-f32-v1`、raw meaningは `raw-posterior-mean`、normalized meaningは `wan21-normalized-posterior-mean:v1`。kernel ABIの `wan21-raw-mean-f32-v3`とは別の識別である。VAE model bindingは次の固定hash。

```text
2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b
```

16channel mean/stdは数値規則NR-WAN21-MEAN-F32へ全件収録した。正規化はfloat32の差→scale1との積→stdで除算、復元はstdとの積→scale1で除算→mean加算というsource順を維持する。生の0を特別扱いしない。逆数乗算への書換えを同じ演算順と認定しない。

| shape | channel算出 | 専用export |
| --- | --- | --- |
| F5 [1,16,2,2,2] | floor(i/8) | NormalizeRawMean / RestoreRawMean |
| F1正方形 [1,16,1,2,2] | floor(i/4) | NormalizeRawMeanF1 / RestoreRawMeanF1 |
| F1非正方形 [1,16,1,2,4] | floor(i/8) | NormalizeRawMeanRect / RestoreRawMeanRect |

ownerはexact shapeと任意profileIdの一致、float32/NCTHW/有限値、VAE hash、directionごとのmeaning、raw上のnormalization marker不在を検査する。normalized側のmarkerは省略可能だが、ある場合は規約IDの一致を要求する。Text maskやgenerated-sample latentContractをmeanへ付けない。contextは所有コピーで保持する。

F1/Rectの受領meanには独立struct-f32の全値normalize/restore比較と、比較前に固定したroundtrip maxAbs≤2e-6の記録がある。このgateはそのprofileのmean往復だけに適用する。81frame、生成sample、別model、別precision、別ratioへ流用しない。catalog runtimeIntegrated=falseであり、新管理経路がこのgateへ既に適合したとは述べない。

# 4 RGBとモデル内部の正規化

VAEはmeaning=rgb-unitのときだけ、実Hike Affineで `f32(f32(x*2)+(-1))` を計算する。raw-decoder-rgb入力へ同処理を二重適用しない。入力RGBの範囲とlatentの値域は別であり、raw latentを[-1,1]へclampしない。VAE raw decoder出力にもこの契約からclampを追加しない。

TextEncoderのRMSNormは内部最終層の演算。f32の二乗和→列数で除算→epsilon加算→固定runtimeのf64 sqrt bridge→f32化→逆数→input乗算→weight乗算という順を保持する。隠れたFP64 reductionや別modelのepsilonを持ち込まない。管理側が実行する汎用正規化ではない。正確な数値gateは選択した受入済みmanifest.numericGateを取得する。本資料では未取得のgate値を作らない。

# 5 meanとgenerated sampleを分ける

VAE consumerは `wan21-raw-generated-sample:v1` と、raw/restored・decoder VAE hash・非空で重複なしのproducer model hash列・正規化規約とowner宣言を検査する。これはconsumerのdeclared contract受入であって、現在のDiffusionが生成・復元を実行できる証拠ではない。

正規化／復元ownerはDiffusion、VAEは復元済みrawをdecodeする。metadataのrestoredだけを実数値変換の証拠にせず、元normalized tensor、前後payload hash、operation/build、数値比較を対応付ける。既存mean操作へ生成sampleを改名して通す処理、VAEでの再復元、管理側でのmean式複製を拒否する。実生成経路の式・gate・参照が不足する範囲はunverified／blockedのままにする。

# 6 出典と確認の状態

repositoryは [Kushyameln01/kushyameln-works](https://github.com/Kushyameln01/kushyameln-works)。機械可読sourceRefsには完全commitとpathを保持する。

| 固定commit | 直接取得した正本 | 使った根拠 |
| --- | --- | --- |
| 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 | docs/shared/diffusion-models/latent-space/latent-space.hike、latent-space.mjs、kernel-registry.mjs | 16channel定数、f32順序、exact profile/export、ABI/生成物hash |
| 同上 | development/ai-connection/e6/RECT-RESULT.md | 受領実mean、独立参照、事前2e-6gate、profile別scope |
| 855f435120f08eb9e818e51281fc26f0e2633829 | docs/shared/inference/vae.mjs、text-encoder.mjs、tools/inference/kernel/tensor.hike | RGB affine、raw consumer、RMSNormとepsilon、計算owner |
| 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 / 855f435120f08eb9e818e51281fc26f0e2633829 | docs/shared/diffusion-models/API.md / docs/shared/inference/API.md | wireと意味・shape・未実装範囲の照合 |

mean Hike sourceは `bd51d724b5a4fbad545670674701f316343a17e63916a57daf144bd763cfd81e`、WASMは `bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d` と固定registryに記載される。sourceのコメントはComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` のWan21 `comfy/latent_formats.py`を上流根拠に挙げる。本資料ではこの上流fileを新たに再取得したとは扱わない。

今回の確認はsourceの直接読解とcatalog構造照合。native test・モデル・runtime統合は実行していない。各既存PASSは記録されたprofile・precision・scopeだけへ帰属させる。

# 7 変更手順

1. ownerが新profile・数式・dtype・丸め・compiler/backendを変更する理由と元要件への影響を提示し、完全source/build/生成物を固定する。

2. 数値規則を先に更新し、独立参照と比較前gate、変えるscope／保持するscopeを明示する。観測誤差を理由にgateを緩めない。

3. 対応するnormalization recordの宣言・拒否条件へ反映し、数値規則IDとの双方向参照を確認する。新profile IDはownerが実際に定義したものだけを使う。

4. ownerの数値受入、native単独回帰、adapter/metadata保全、管理側の事前定義規範照合を別に確認する。管理に新たなモデル演算を入れない。

5. catalogと規範の版・source・未達・runtime採用状態を更新する。文書生成をruntimeIntegrated=trueへ自動変換しない。

# 文書の参照先

[総合管理台帳](https://chatgpt.com/space/page_7036da19567881918356235b7aa82b83)／[管理照合規範](https://chatgpt.com/space/page_7972cb392a3481918a1ceb0b7501bb76)／[数値規則](https://chatgpt.com/space/page_ecfe5b714e008191a7779e5cd2bad42c)

# 固定版ファイル

[説明文の固定版](https://github.com/Kushyameln01/kushyameln-works/blob/6dae9a6fac3e9ad29ea941f22211edbe4aa894ad/development/ai-connection/reference-catalog/NORMALIZATION.md)／[機械参照JSON](https://github.com/Kushyameln01/kushyameln-works/blob/6dae9a6fac3e9ad29ea941f22211edbe4aa894ad/docs/shared/ai-connection/reference/profiles/normalization.v1.json)／[検証結果と制約](https://github.com/Kushyameln01/kushyameln-works/blob/6dae9a6fac3e9ad29ea941f22211edbe4aa894ad/development/ai-connection/reference-catalog/EVALUATION.md)／[Draft PR #10](https://github.com/Kushyameln01/kushyameln-works/pull/10)

固定commit：`6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`。文書・参照データの保存とruntimeの採用・数値受入は別に確認する。
