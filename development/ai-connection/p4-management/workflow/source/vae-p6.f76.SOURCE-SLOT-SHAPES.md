# P6 source・reference・slotと最終decodeの不足分

2026-11-01。[requirements.json](requirements.json)は役割ごとの不足条件を扱う外側資料。既存[PROFILES.md](../../connection/PROFILES.md)を作り直さず、その後の[F1正方形](../../vae-v1/RESULT.md)・[F1非正方形](../../e6/RESULT.md)受入を元scopeで参照する。ここでは媒体probe、profile export、独立数値参照生成、NN、原本assetコピーを行っていない。

## 設定gridと実媒体を分ける

元workflowの設定はW832/H480/F81/B1、出力fps16。そこから必要になる候補はRGB NCTHW `[1,3,81,480,832]`、latent NCTHW `[1,16,21,60,104]`。これは**設定に基づく必要shape**であり、実sourceのdecoded寸法・81frame供給や、そのVAE profileの受入済みを意味しない。

根拠は `CCpt5/ComfyUI-BerniniStudio@ca69274a2d2135052489bc0c67a2d79a64225e86` の [元example](https://github.com/CCpt5/ComfyUI-BerniniStudio/blob/ca69274a2d2135052489bc0c67a2d79a64225e86/example_workflows/bernini_rv2v_basic.json)、SHA `543865dfeeb9a94427bea543624e51db5f1dfcf88a7af6a497ddcdbeadc477dd`。提供workflowとbyte一致する既存証拠を再利用するが、実利用runtime版や媒体を認証したとはしない。

| 役割 | 既存sourceで分かる処理 | 追加で必要な実情報 |
| --- | --- | --- |
| source_video context encode | VHS_LoadVideo→source_video。force_rate16、cap81、skip0、stride1。先頭length後にarea/centerで設定W/Hへ処理 | `132123.mp4`の原本identity、decoded frame数・寸法・時刻・rotation/色、実供給frame。実入力/処理後shapeはnull |
| reference_video context encode | reviewed workflowでは未接続。接続するなら先頭length→元の長辺resizeという別経路 | 実媒体のidentity/F/H/W、元処理後shape。sourceと同じgridを仮定しない。現値はnull |
| reference image / editor slot | wired優先、なければeditor File、欠番を詰める。各画像batchの各frameをF=1別contextとしてencode | slotごとの供給元・実file・mode/順序、EXIF適用後H/W・alpha等と元処理後H/W。F1でも寸法はnull。非正方形という分類だけで任意ratio対応にしない |
| 最終generated sample decode | 元設定なら上記latent→RGBの候補。mean診断とは別の入力意味 | P5の実sample producer、source/precision、normalized→raw復元receipt、対応decoder/profile、全出力参照と予算。実入力shape/producerは未確定null |

`ref_max_size=848`は長辺上限であり848角の指定ではない。保存されたfilenameやlink、bypass nodeから供給成立・寸法・frame実在を推測しない。slotのframe/time/context順序と重複は管理側で保持し、latentのT個へ切り詰めない。

## 既存profileから追加が要る条件

既存の `wan21-raw-f32-5x16x16`、`wan21-raw-f32-1x16x16`、`wan21-raw-f32-1x16x32` は各診断入力の受入である。今回P2のRect mean/RGBは既存bundleを使えるので再export・再棚卸しは不要。これらを元source、実slot、全ratioや生成sampleの代替へ昇格させない。

追加準備は次の差分だけに限定する。

1. 実媒体とslot供給元を確定し、元処理前後のF/H/W、identity、frame/timeを記録する。実sourceの短い動画へ反復・padding・frame削減を追加しない。
2. 元nodeの長辺式 `scale=min(848/max(h,w),1.0)` と各辺 `max(16, Python round(edge*scale/16)*16)`、Python ties-to-even、area/crop disabledを保持する。共通APIへ暗黙resizeを追加せず、JS Math.roundやCanvas既定補間へ無検証で置換しない。
3. 処理後のexactshapeと既存受入を照合し、不足するshapeだけを別工程の固定profile候補にする。manifestを書換えて任意shape対応にしない。
4. 新候補では元Wan2.1 source/model、独立FP32全出力reference、比較前gate、graph/assets/manifest対応、WASM/browser・取消/解放・資源予算を個別に固定する。既存診断gate2e-5、exporter default.002、mean往復2e-6は自動転用しない。

現exporterはN=1、F=4n+1、H/Wが16以上の16倍数、opset17を要求する。モデル構造の空間8alignmentとexporterの16倍数条件を分ける。引数受理、export完了、独立比較、実WASM受入は別の状態。対応外F/H/Wを既存shapeへ無断で丸めない。graph/activation/cache/copyを含む実ピークは大shapeの別検証条件であり、小tensorがwasm32範囲内というだけで実行可能としない。

## 最終decodeはP5 producerに依存

native VAE consumerは `wan21-raw-generated-sample:v1` と `latentContract`を使い、raw/restored、全producer model hash列、decoder VAE `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b` を別に照合する。P5の実sample、前後payload hash、Diffusion operation/build・数値復元receiptが必要で、`restored`という宣言だけで計算済みと認定しない。

復元ownerはDiffusion、VAEは復元済みrawをdecodeする。mean操作をsample用へ改名すること、VAEで復元を重複実行すること、producerをVAE hashへ付け替えることは行わない。現在のRect mean共同診断や固定N2 self-attention残差を本物の生成sampleへ読み替えない。

この整理はP6の入力表準備まで。新profile exportや大shape推論、実generated最終decode、全target LoRA・全工程UIを自動実施しない。

## 仕様と版

- [新実行計画1.0-draft.1 P6](https://chatgpt.com/space/page_78c30bebe16481918944e621b8c2a02a)、固定計画 `0fb553fd081d3bcbbad4ead7accd165679f77d34`。
- [総合仕様1.1-draft.2](https://chatgpt.com/space/page_65b303c9bc708191a7e48c78b51c35a7)、source/reference/slot処理と生成sample契約。
- [Profile台帳1.0-draft.1](https://chatgpt.com/space/page_7036da19567881918356235b7aa82b83)、固定 `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`。
- 元VAE source `Wan-Video/Wan2.1@9737cba9c1c3c4d04b33fcad41c111989865d315`。既存診断受入source `855f435120f08eb9e818e51281fc26f0e2633829`。今回の資料配布sourceを過去実行へ付け替えない。
