# VAE接続プロファイル棚卸し

Revision: `connection-1`。読取対象はbranch `codex/inference-connection-contract`、基点commit `a33b311e45a75a6c683242286fef608c7b3770a9`。この棚卸し作業はソース・既存manifest・workflowの確認と容量計算だけで、モデルexportや推論、公開を行っていない。別担当の接続API調整はPLAN/RESULTを参照する。

現時点でbrowser受入済みのVAEは **5 frames・16×16の固定profileだけ**。workflowの81 frames・832×480、静止画、異なる縦横比は、既存の形状式から必要profileを記述できるが、export／FP32参照／実browser受入済みへ読み替えない。

## 1. 固定した入力と根拠

| 根拠 | 確認箇所と意味 |
| --- | --- |
| `tools/inference/vae/profile.json` | `profile.id=wan21-raw-f32-5x16x16`、RGB `[1,3,5,16,16]`、raw latent `[1,16,2,2,2]`。元VAE SHA256は`2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。stored BF16値を保持してFP32で計算する。 |
| `tools/inference/vae/export_profile.py:22`、`:51`、`:57`、`:71` | exporterはF=4n+1、H/Wが16以上の16倍数を要求し、shapeを固定してONNX化する。出力manifestはexport済み・browser未確認として作成される。引数を受理できることと、そのshapeでのexport成功は別。 |
| `tools/inference/vae/vendor/vae.py:516`、`:544` | 固定Wan2.1 source `9737cba9c1c3c4d04b33fcad41c111989865d315`。encodeは最初の1 frame、その後4 framesずつの時間cache処理。decodeはlatentを1時間位置ずつ処理する。 |
| `/workspace/work/inference/workflows/example_workflows/bernini_rv2v_basic.json` | SHA256 `543865dfeeb9a94427bea543624e51db5f1dfcf88a7af6a497ddcdbeadc477dd`。`/nodes/19`のBerniniStudio node5、`widgets_values[0:5]=[832,480,81,1,"rv2v"]`。W,H,F,Bの順。 |
| BerniniStudio固定source | `CCpt5/ComfyUI-BerniniStudio@ca69274a2d2135052489bc0c67a2d79a64225e86/bernini_studio.py`の`_resize_long_edge`と`BerniniStudio.execute`。取得済み原文は`/workspace/work/inference/workflow-sources/bernini__bernini_studio.py`。提供workflowはこのcommitのexampleとbyte一致するが、実利用ComfyUI／custom node版までは証明しない。 |
| `docs/shared/diffusion-models/API.md`、`tensor-interop.mjs`、`latent-space/latent-space.mjs` | 公開raw mean／normalized mean境界、固定128要素の変換、Diffusionの公開要素予算。`predict/sample`は現状NOT_READY。 |

固定source URL:

- [Wan2.1 VAE](https://github.com/Wan-Video/Wan2.1/blob/9737cba9c1c3c4d04b33fcad41c111989865d315/wan/modules/vae.py)
- [BerniniStudio](https://github.com/CCpt5/ComfyUI-BerniniStudio/blob/ca69274a2d2135052489bc0c67a2d79a64225e86/bernini_studio.py)
- [提供workflowと一致するupstream example](https://github.com/CCpt5/ComfyUI-BerniniStudio/blob/ca69274a2d2135052489bc0c67a2d79a64225e86/example_workflows/bernini_rv2v_basic.json)

## 2. モデル形状・exporter条件・受入範囲を分ける

軸順はすべてNCTHW、batchは現在のprofile/APIでは1、RGB channelは3、latent channelは16。意図した形状の一往復では、

```text
F = 4n + 1, n >= 0
T_latent = (F - 1)/4 + 1
H_latent = H/8
W_latent = W/8
F_decoded = 4*(T_latent - 1) + 1
```

となる。

- **モデル構造からの空間条件:** 3回の空間1/2縮小と復元から、寸法を保つprofileのH/Wは8アラインとして扱う。8倍数なら全て動作確認済みという意味ではなく、sourceに基づく形状条件である。奇数／非8倍数を勝手に丸め、同じ画像として扱わない。
- **現exporterの条件:** H/Wは16以上の16倍数に限定される。たとえばH/W=24は8アラインでも現在のCLIは拒否する。profile棚卸しでこの条件を緩めたり、16がモデル本来の必須条件だったと書き換えたりしない。
- **時間条件:** F=1はn=0に対応するsourceの最初のframe分岐。F=5の既存graphをF=1へ流用できる意味ではない。F=2～4や末尾に余りがある入力をencodeのfloor式で短くし、全framesを処理したと扱わない。接続側の形状拒否を維持する。
- **固定graph:** 現exporterはdynamic temporal／spatial axesを指定していない。manifestの厳密shapeとgraphが一組であり、F/H/Wだけを書き換えたmanifestは新profileではない。
- **縦横比:** モデル式は正方形を要求しない。HとWを別々に記録し、入力画像を新profileに合わせてresize／crop／padする操作は別の明示的契約である。この棚卸しはその操作を追加しない。

## 3. profile候補と単一tensor容量

以下の容量はFP32の**単一tensor本体**だけ。重み、activation、cache、WASM heap、元bytes、hash用copy、出力保存物、preview画像を含むピークRAMではない。

| profile／役割 | RGB shape／bytes | latent shape／bytes | 確認状態 |
| --- | --- | --- | --- |
| 既存受入profile `wan21-raw-f32-5x16x16` | `[1,3,5,16,16]`／15,360 B | `[1,16,2,2,2]`／512 B | 元194 keys strict load、FP32参照、実browser ORT WASM＋Hikeのencode/decode／unit-RGB経路を確認済み。合成小入力の受入範囲。 |
| workflowのsource/output grid | `[1,3,81,480,832]`／388,177,920 B（370.20 MiB） | `[1,16,21,60,104]`／8,386,560 B（7.998 MiB）、2,096,640要素 | workflowから得た必要shape。export／参照／browser／接続のいずれも未受入。source_videoの実frame数が81あることも未確認。 |
| workflow gridの単一静止画候補 | `[1,3,1,480,832]`／4,792,320 B | `[1,16,1,60,104]`／399,360 B | F=1の別固定profile候補。source上の形状式のみ確認。reference slotをこの寸法に変更する提案ではない。 |
| reference長辺上限の正方形ケース | `[1,3,1,848,848]`／8,629,248 B | `[1,16,1,106,106]`／719,104 B | `ref_max_size=848`から得た最大正方形ケースの容量例。実参照画像の寸法ではない。未export／未受入。 |
| 縦横比を保つ参照静止画 | `[1,3,1,H_ref,W_ref]`／`12*H_ref*W_ref` B | `[1,16,1,H_ref/8,W_ref/8]`／`H_ref*W_ref` B | 実画像のH/Wと既存nodeの処理結果を取得後、shapeを具体化する。異なる画像／ratioごとに同一profileへ収める処理を推測しない。 |
| 他の動画長・ratio | `[1,3,F,H,W]`／`12*F*H*W` B | `[1,16,(F-1)/4+1,H/8,W/8]`／`T_latent*H*W` B | 容量の簡明式はlatent `T_latent*H*W` B。F/H/Wを固定した時点でそのprofileだけを段階検証する。任意動画への対応宣言ではない。 |

latentの一般式は`4 bytes * 16 * T_latent * (H/8) * (W/8) = T_latent*H*W bytes`。RGBは`4 bytes * 3 * F * H * W`。

## 4. workflow中のVAE利用を役割ごとに保持する

| 役割 | workflow/sourceの根拠 | 必要なprofile／未確認事項 |
| --- | --- | --- |
| Source videoのcontext encode | node21 VHS_LoadVideo（`/nodes/14`）→link29→node5 `source_video`。force_rate16、cap81、skip0、stride1。Bernini sourceは`source_video[:length]`をW832×H480へ`common_upscale(...,"area","center")`する。 | 実入力`132123.mp4`の寸法・復号frame数・色・回転・時刻情報は未取得。既存nodeにある処理は記録するが、別のresize、末尾補完、切断を追加しない。81 framesが得られる場合の候補は上表のworkflow profile。 |
| Reference videoのcontext encode | node5の`reference_video`はこのworkflowでは未接続。source上は`reference_video[:length]`へ`_resize_long_edge`を適用する別経路。 | 接続された場合の実F/H/Wが必要。source_videoと同じprofileであると仮定しない。 |
| Reference image／editor slotのcontext encode | node5 `image0..7`と`slot_images`。sourceはslotごとにwired入力を優先し、無ければeditorのfilenameを読む。各画像batchの各frameをF=1として別々にencodeし、context配列へ追加する。 | `ref_max_size=848`は長辺制限であり固定848×848ではない。実画像寸法、EXIF適用後寸法、各slotの供給元、出力shape、context順序が必要。保存されたLoadImage node24～26はmode4で、link表示だけでは実供給が成立したと確定しない。 |
| Sampler用の初期latent | node5は`[batch,16,((length-1)//4)+1,height//8,width//8]`のzero latentを作る。augment_strength0。 | これはsource/reference画像をencodeしたposterior meanとは別のtensor。zero初期状態をVAE encodeの出力と呼ばない。 |
| 最終decode | HIGH→LOW samplerのlink23→node17 VAEDecode（`/nodes/9`）→node22 VideoCombine（`/nodes/15`）、出力fps16。 | 必要gridは`[1,16,21,60,104]`→81×480×832。生成sampleとposterior meanは別のmeaningであり、shapeが同じでもsampleを`raw-posterior-mean`へ改名して現在のAPIへ通さない。sample空間→decoder入力空間、precision、producer、必要な復元と出力clamp等の契約は別途固定が必要。 |

`_resize_long_edge`の既存式は`scale=min(848/max(h,w),1.0)`、`nh=max(16,round(h*scale/16)*16)`、`nw=max(16,round(w*scale/16)*16)`で、area補間、crop disabled。拡大を避けつつ各辺を16gridへ丸めるため、元のratioと丸め後ratioが厳密に同じとは限らない。これは元nodeの処理記録であり、汎用接続APIに自動resizeを加える仕様ではない。

現在のslot filenameには`videoframe_80.png`と人物参照画像名があるが、名前から画素寸法、frame80の実在、alpha、orientationを推定できない。node5は19 widget入力に20 serialized値を持つため、末尾項目の復元も別の未確認事項として残す。W/H/F/Bは先頭4値と対応schemaから特定できる。

## 5. 現在の公開APIの容量・意味による接続制約

1. **Diffusion raw/normalized mean境界はshape固定。** `tensor-interop.mjs`の`WAN21_RAW_PROFILE.shape`は`[1,16,2,2,2]`。`validateRawLatent`、`normalizeRawMean`、`restoreRawMean`はこのprofileとVAE hashを照合する。`latent-space.mjs`は128要素、入力512 B＋出力512 Bのarenaを使う。F=1の小profileでもworkflow gridでも、現実装にshapeだけ足して接続できない。
2. **公開pointwise APIの予算は別の制約。** `api/worker.mjs`の`MAX_TENSOR_ELEMENTS=1,048,576`に対し、workflow latentは2,096,640要素なので`eulerStep/noiseMix/inverseNoiseScale/flowDenoised`の公開入口では予算超過になる。下位`scheduler/scheduler-kernel.mjs`の上限4,194,304や内部chunk処理が、この公開上限を緩めた証拠にはならない。tensorを半分にしてニューラル処理まで同じ結果とする変更は追加しない。
3. **VAEのhost arenaと全tensor長は同義ではない。** 現VAE hostのaffineはchunk処理、conv2 MatMulは列方向を処理できる。したがって共有Hikeのdefault arena65,536要素だけを根拠にworkflow VAEが直ちに不可能とは判定しない。一方、変換graph・全activation・cacheを含む実RAMや実時間は未測定であり、単一RGB388 MBがwasm32の4 GiB未満というだけで成立とも判定しない。
4. **VAE graph／tensorの検査上限。** `vae.mjs`はgraph assetを2,147,483,647 B以下、tensorのbyte積もその範囲へ制約する。workflowの入力・出力tensor本体はこの検査値以下だが、将来の81-frame ONNXの実byte数は未生成なので不明。ONNX external dataやfile分割で実行Memoryの限界が消えるとは扱わない。
5. **モデル推論の未実装とprofile問題を混ぜない。** Diffusion公開APIの`load/predict/sample`はNOT_READY。VAE profile、意味、要素予算を揃えただけで生成全工程が動くことにはならない。現`restoreRawMean`はnormalized posterior meanの復元であり、生成sample復元の代替ではない。

## 6. 次段階のprofile別受入条件

本工程では以下を**未実行**のまま残す。新しい固定profileを進める際は、小さいprofileの合格を大きいprofileへ流用しない。

| 段階 | profileごとに必要な証拠 |
| --- | --- |
| 入力／役割確定 | `source_video`、`reference_video`、各slot、final decodeを区別し、F/H/W、channel、layout、値域、raw/normalized/sampleの意味、producer hash、処理前後の原本hashを記録。実媒体の不足情報は不足のまま保持する。 |
| 元モデルFP32参照 | 固定Wan2.1 source、元model hash、194 keys strict load、既存FP32展開方針を維持。F=1分岐、F>1の時間cache、指定ratio、encode mean、decoderの全出力を保存。原GPU BF16との同等性へ拡張しない。 |
| 固定export | 新しい非公開出力先、元重み／source hash、opset17、nearest-exact2x lowering、実graph shape、graph/外部weightの対応とhash、asset byte数を記録。manifest作成だけでacceptしない。 |
| 比較gate | 実行前に比較対象・dtype・絶対／相対誤差と全件判定を固定。現CLIの0.002は小profileのFP32診断値であり、大きい実媒体の画質・workflow許容誤差として自動採用しない。結果を見て閾値を緩めない。 |
| 実browser／WASM | 対象profileのlocal file投入→Hike／ORT WASM実行→完全出力回収→hash／shape／全数値比較、入力保持、取消・失敗復帰、session終了を確認。最大live重量、copy、cache、OS側RAM、ロード／推論／保存／総時間を分ける。未測定値を0にしない。 |
| 接続／目的 | 同じprofileのVAE出力を確定したDiffusion境界へ接続し、意味・normalization・model bindingを保ったまま渡す。最終sampleには独立したdecode契約を使う。公開要素予算の変更、media処理変更、backend／precision変更はそれぞれ変更範囲として扱う。利用端末での負荷目標は別に判定する。 |

具体化の順序候補は、受入済み5×16×16を回帰基準として保持し、F=1の小profileと非正方形小profileで時間分岐／軸を確認した後、実参照画像の確定寸法、最後にworkflowの81×480×832を評価する順。ただしこの順序案は新profileの採用・export実行・入力の縮小を確定したものではない。今回の成果は接続契約の判断に使う棚卸しである。
