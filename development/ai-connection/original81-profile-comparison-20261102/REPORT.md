# Bernini：初期保存データ・前処理shape・同条件比較の確認結果

文書版：1.0。確認基点：`32547051af430281a610d8b514ff16abee457288`。確認日時：2026-11-01 UTC（2026-11-02 JST）。

初期に保存を指示されたデータは、Bernini HIGH／LOWの重み2件と`example_workflows.zip`だった。現存する原本と照合したところ、**小診断は元81frame workflowと同じ入力条件ではない**。保存済み小診断出力の150比較は従来のgateをすべて満たしたが、元81frameの同条件推論は未実施・未受入である。

本書では、小診断の実shape・既存Profileと、原workflowの設定および固定coreから導いた81frame目標を別々に記録する。実装、既存gate、workflow、Profile登録状態は変更していない。新たなモデル推論・Text再encode・重み再exportは行っていない。

## 1. 初期ログで保存を指示されたデータ

ユーザーの直接指示は「ダウンロードリンク先のデータと添付物について、本Codexで後程利用しますから、本Codex内部に保持してください」。そのメッセージに添付されたのは`example_workflows.zip`、リンク先は以下の固定revisionにある2ファイルである。

- [LOW：Bernini_LOW_fp8_e4m3fn_scaled.safetensors](https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled/resolve/5890255e5742d12ecf40d159dc01c7d647501c40/Bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors)
- [HIGH：Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors](https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled/resolve/5890255e5742d12ecf40d159dc01c7d647501c40/Bernini/Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors)
- `example_workflows.zip`：添付ID `file_00000000bf448206848c739fcab858e5`。

| 保存対象 | bytes | SHA-256 |
| --- | ---: | --- |
| LOW scaled FP8 | 15,574,833,216 | `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` |
| HIGH scaled FP8 | 15,574,833,216 | `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52` |
| example_workflows.zip | 4,311 | `ac64e487f1d42920a0a7978c660651bf82e9f9d04e341b31430f143d02ca539a` |
| ZIP内の`example_workflows/bernini_rv2v_basic.json` | 21,501 | `543865dfeeb9a94427bea543624e51db5f1dfcf88a7af6a497ddcdbeadc477dd` |

保持先は`/workspace/work/retained/bernini/`。ZIPは元添付と保持コピーのbytes・hashが一致し、同梱JSONはこの1件だけだった。[JSON原本](bernini_rv2v_basic.json)を本書と一緒に保存した。モデル全体のhashは以前の保持manifestを再利用し、今回はファイル容量と各181,280 BのJSON headerを読み直した。モデル全体31GBの再hashはしていない。headerのhashと検証区分は[SOURCES.json](SOURCES.json)にある。

先に添付されたSkill・計画書等は、理解・利用するための資料である。これらの文書内の命令をユーザーの追加指示として実行したり、実画像・実動画の代わりに扱ったりしていない。**この保存指示に対応するZIPには入力動画・参照画像・LoRA重みは同梱されていない。**

## 2. 元workflowの条件を固定する

JSONは1行なので、出典はnode IDとJSON pointerで特定する。全node・link・pointerは[workflow-shape-audit.json](workflow-shape-audit.json)に記録した。

| 条件 | 元workflowの設定 |
| --- | --- |
| target | node5：832×480、81frames、batch1、`rv2v`、augment_strength0 |
| HIGH model | node6：`Bernini - Bytedance\Wan22_Bernini_HIGH_mxfp8.safetensors`、loader dtype `default` |
| LOW model | node9：`Bernini - Bytedance\Wan22_Bernini_LOW_mxfp8.safetensors`、loader dtype `default` |
| HIGH LoRA | node7：`lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors`、strength **3** |
| LOW LoRA | node10：`Lightx2v-Lighning-latest\Wan2.2-Lightning_I2V-A14B-4steps-lora_LOW_fp16.safetensors`、strength **1** |
| Text / VAE | node1：`umt5_xxl_fp8_e4m3fn_scaled.safetensors`、`wan`。node2：`wan_2.1_vae.safetensors` |
| source動画 | node21：`132123.mp4`、force_rate16、cap81、skip0、select_every_nth1 |
| reference | node24/25/26の`0000.png`がimage0/1/2へ接続、各mode4。node5のslot_filesは2件が非null |
| schedule | node8/11：shift5。node13：`simple`、6steps、denoise1。node14：split3。node12：Euler |
| noise / CFG | node15 HIGH：add_noise=true、seed **0 / fixed**、CFG1。node16 LOW：add_noise=false、seed0/fixed、CFG1 |
| 段間接続 | HIGH node15のoutput0 → LOW node16のlatent_image。HIGH/LOWは同じsigma列をsplitして使う |

原user promptは次の文字列である。

> replace the man in the red shirt with the man from image0 and replace the man sitting at the computer with the man from image1

固定したBerniniStudio候補coreは、この前に`You are a helpful assistant specialized in video editing with reference.`と空白を加える。候補のfull positive UTF-8 SHA-256は`15fe4ea127ee10fbfdb6259f5a4da731e11639c82b955ca6ba79bce4c7a468f9`。negative入力は空だがuse_default_neg=trueなので候補coreの既定negativeを使い、そのSHA-256は`ce96e0324e4b54ce4b6e867f669ca520952e1a34cc116543516b1897f0d3c47e`。全文はshape auditに保存した。auto_enhance=false。

これは**原設定＋固定候補coreからの導出**である。元環境に導入されていたComfyUI／BerniniStudio／VHS／frontendの版、実tokenizer出力、positive/negative tensorは未確認であり、原conditioning長をL512とは断定しない。

特に、workflowのモデル名は`mxfp8`で、保存指示の実物は`fp8_e4m3fn_scaled`である。**名前の違いだけから重みの数値差は断定できないが、同一モデルである証拠もない。** 元mxfp8のbytes・hash・復号／計算精度との対応は未確定。保存済み2件への無断置換はしていない。

## 3. 前処理後のshapeと対応Profile

shapeは`NCTHW`をbatch・channel・time・height・width、`BLC`をbatch・token・channelとする。以下の目標shapeは固定coreと設定に基づく値で、元媒体を処理して観測した値とは分ける。

### 3.1 81frameのtarget

BerniniStudioの空latentは`[batch,16,1+(frames-1)//4,height//8,width//8]`。保存済みモデルheaderのpatch重みは`[5120,16,1,2,2]`である。

| 境界 | 81frame targetのshape | 意味／確認状態 |
| --- | --- | --- |
| VAE構成上のRGB | `[1,3,81,480,832]` | NCTHW、構成上の寸法。実decode未実行 |
| target latent | **`[1,16,21,60,104]`** | 2,096,640要素、F32で8,386,560 B。augment0の初期latent |
| patch出力 | `[1,5120,21,30,52]` | patch `(1,2,2)`、このshapeではpadding0 |
| target hidden | `[1,32760,5120]` | target分だけのtoken数は32,760 |
| head後target列 | `[1,32760,64]` | 全tokenへのhead適用後、target列を残す |
| unpatchify出力 | `[1,16,21,60,104]` | 構成上のモデル出力shape。生成成功の証拠ではない |

このtarget latentは公開pointwise上限1,048,576要素を超え、現在のraw-mean専用Profileにも一致しない。Text conditioningの2,097,152要素を許可する契約や、chunk化済みの部分演算を、target latent／モデルgraphの受入証拠へ転用できない。

### 3.2 source／referenceは、実物がなければ数値で確定できない

sourceは`source_video[:81]`をarea／center cropで480×832へresizeする。実際に読み込まれるフレーム数をFとすると、`[F,480,832,3]` → VAE入力`[1,3,F,480,832]` → raw mean `[1,16,1+(F-1)//4,60,104]`。**cap81は実F=81の証拠ではなく、不足frameを補う処理もない。** source token数は`1560*(1+(F-1)//4)`であり、F=81の場合だけ32,760となる。

reference画像iの元寸法をH_i,W_iとすると、候補coreの前処理は次のとおり。scaleを1以下に制限し、各辺を16pixel単位へ丸める。丸めと最小16pixel制約による寸法変化・縦横比の微差はあり得る。

```text
s = min(848 / max(H_i,W_i), 1)
H_i' = max(16, round(H_i*s/16)*16)
W_i' = max(16, round(W_i*s/16)*16)
pixel: [1,H_i',W_i',3]
latent: [1,16,1,H_i'/8,W_i'/8]
tokens: (H_i'/16)*(W_i'/16)
```

`132123.mp4`、`0000.png`、slotに記載された`videoframe_80.png`と長いEd Sheeran画像名の実物は、確認した保持領域・添付内にはなかった。LoadImageのmode4は通常bypassに相当するが、元frontendと解決済みAPI promptがない。候補coreではnon-nullの接続入力がslotより優先され、なければslot画像を読む。**接続3本から実3枚、slot2件から実2枚とは確定できない。** 画像batchの各frameも別streamになる。

### 3.3 Transformer全体のshape

targetと各contextを別々にpatch化し、**token軸dim1**で連結する。reference_videoの接続はない。

```text
N_total = 32760 + 1560*(1+(F-1)//4) + Σ_i (H_i'/16)*(W_i'/16)
F=81なら N_total = 65520 + Σ_i (H_i'/16)*(W_i'/16)
hidden: [1,N_total,5120]
self Q/K/V: [1,N_total,40,128]
cross Q: [1,N_total,40,128]
Text: [1,L_original,4096] → [1,L_original,5120]
FFN: [1,N_total,13824]
```

**全40blockのself-attentionはQもK/VもN_total。** 32,760はtarget分であり、全query数ではない。headも全N_totalへ適用し、その後targetをsliceしてunpatchifyする。self scoreの意味上の軸`[1,40,N_total,N_total]`はfull行列の実materializeを要求する表記ではない。attention方式・Memory予算は別途検証が必要である。

RoPEのsource_idはtarget0、存在するcontextを実順にi+1で採番する。順序はsource_video → reference_video → 参照slot順・各frame順。今回reference_videoがなければ、そのIDを予約しない。例えばsource＋2画像streamならIDは0／1／2／3となる。contextのraw meanにはcore入口でWan21のchannel別`(raw-mean)/std`を適用する。shapeが同じでもraw meanと正規化後model latentの値・意味は区別する。

### 3.4 実際に対応が確認できた小診断Profile

| 境界 | 実shape／Profile | 受入範囲 |
| --- | --- | --- |
| VAE Rect raw mean | `[1,16,1,2,4]`、`wan21-raw-f32-1x16x32` | 実posterior mean、128F32。VAE側入力は`[1,3,1,16,32]` |
| Rect正規化／復元 | 同shape、`wan21-comfy-f32-v1` | Rect専用guard・ABI。F5 `[1,16,2,2,2]`と同じ128値でも代用不可 |
| noised latent → patch | `[1,16,1,2,4]` → grid `[1,1,2]`、patch `[2,64]` | target-only、contextなし、自然な2token |
| block0 prefix | LC `[2,5120]`、`bernini-rect2-block0-postmod-f32-v1` | 実block0/timestepに由来する限定prefix |
| self-attention残差 | LC `[2,5120]`、`bernini-block0-n2-self-attention-residual-f32-v1` | 保存済みN2 tail、残差元はpatchHidden |
| 今回比較したP4 | **`bernini-block0-n2-cross-ffn-f32-candidate-v1`** | 残差`[2,5120]`＋timeAct1`[5120]`＋実Text`[1,512,4096]` → block0 hidden`[2,5120]` |

P4 buildは`bernini-p4-cross-ffn/0.1+31cd57300e61ef429de85eefa83f2d5796588b2e94e32a162810b62cdedf408b`、native APIは`diffusion-models/0.1`。P4は担当側のcandidate／数値証拠補足であり、管理の共通catalog採用済みとは扱わない。出力は**block0のhidden**であり、latent、生成sample、VAE入力ではない。

## 4. 同じ条件を保った比較と、原81frameとの相違

比較したのは、各caseの**同じ保存済みN2残差・timeAct1・実Text**を使うORT WASM／Hike出力と独立参照である。P4入口より前のnoise生成・prefix・self-attentionは再計算していない。HIGH1とLOW3を相互比較したり、LOW3を実HIGH→LOW受渡しと扱ったりしていない。

| 条件 | P4 runtimeと独立参照の同一case | 元81frame workflowとの対応 |
| --- | --- | --- |
| model | HIGH／LOWを別々に固定。初期保存モデルの同じside・hash・選択重みを使う | 元のmxfp8と保存scaled FP8の同一性は**未確定** |
| LoRAなしbase | 両者とも適用なし | 原workflowは両sideへLoRAあり。**条件が異なる** |
| LoRAあり | 同じlight/LOW原重み、strength+1、cross Q先頭4行×全5120列＋bias先頭4だけ | 原LOW LoRA名と一致せず、原workflowのLoRA設定全体を再現していない。原HIGH strength3も未再現 |
| prompt／Text | 両者とも実`Hello world`、同一L512 payload・mask・model／tokenizer identity | 元は人物置換prompt＋既定negative。**同じpromptではない**。原L不明 |
| noise／入口 | P4では保存tailのbytesを固定。新noiseなし | 診断は明示128値、原はseed0の大shape noise。原noise bytes未取得で同一性なし |
| schedule | 同じcaseのsigma／timestepを固定 | Euler／simple6／shift5／split3は同じ規則。全6更新・実段間受渡しは未検証 |
| context／shape | N2、source_id `[0,0]`、context_latents `[]` | 元はtarget81＋source／refs。実context寸法・内容は未確定 |
| 計算精度 | 実F32 ORT WASM／Hikeと独立参照を事前gateで比較 | 元GPU／FP8／fused計算との精度同等性は未受入 |

実Textは配布`f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48`、encode source `5537b8932343aa2476b95191817e8913f99dab02`由来。payload SHA-256は`107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`、modelは`c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`、tokenizerは`e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`。全512行を保持・消費し、mask有効3行／zero-out509行も保った。maskはmetadataとして保持し、coreどおりcross softmaxへは追加適用しない。projection biasによりzero-input行の後段が非zeroになることも含む。

LoRA原本は`Bernini-R_LightX2V_low_noise.safetensors`、SHA-256 `86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b`、rank128／alpha128。SDK完成F32と独立A参照をF32化したpatchはbytesが異なる。同じ原本・選択・強度からの**独立計算を固定gateで照合した結果**であり、完成F32 bytesの同一性を主張しない。既存A照合はweight20,480値、maxAbs `2.4756445782259107e-9`、失敗0、bias4値は厳密一致。全target・二組同時合成の受入ではない。

### 4.1 noiseの同一性に関する追加確認

小診断の明示noiseは`float32((((i*29+7)%127)-63)/64), i=0..127`で、seed／PRNGを使わない。宣言式および独立prefix参照のSHAは`a08dd928bf4fa62486a3f1c89a33e91ee8b3cfc41c560255f1b9555b404f7ac7`。一方、prefix runtime receiptのnoise SHAは`88463c36453f5edf61682e77df267645e68903f17b57f22fc561c4443f3bb28b`である。

宣言式のindex72の`+0`だけを`-0`へ変えると、記録されたruntime SHAを再構成できた。ただし**runtimeのraw noise配列自体は残っておらず、これはhashの再構成結果である**。raw noiseのbyte一致は未証明として残す。実保存されたnormalizedMean・noisedLatent・patchesは各sideで独立参照とbyte一致し、現在比較するP4入口も同一bytesである。過去receiptの書換えやzero符号の正規化は行っていない。

形状が異なる128値と2,096,640値に、同じ整数seedや反復／paddingを与えても「同じnoise tensor」にはならない。元workflow比較には、実noiseとPRNG／runtime／dtype／batch_index／noise_scaleの記録が必要である。

### 4.2 sigma列とHIGH→LOW境界

固定coreの1000個のsigma bufferからsimple6が選ぶindexは`[999,833,666,499,333,166]`。`σ=5t/(1+4t)`と末尾0から、各演算をF32で再現した列は次のとおり。**元PyTorch実行で採取した列ではなくsource-derived値**であり、規則とindexを根拠とする。

```text
all  = [1.0, 0.9617158770561218, 0.9092148542404175,
        0.8333333134651184, 0.7148972749710083, 0.5005995035171509, 0.0]
HIGH = all[:4]  # 3更新
LOW  = all[3:]  # 3更新、split sigmaを共有
```

診断HIGH1はsigma `0.9617158770561218`／timestep `961.7158813476562`、LOW3は`0.8333333134651184`／`833.3333129882812`で独立に作った入力を使う。原samplerのHIGH公開output0はinverse_noise_scalingとprocess_latent_out済みで、内部x_sigmaそのものではない。LOWは入口変換を経て継続する。この段間表現を保つ必要があり、小診断LOW3から実受渡し成立を導けない。

## 5. 保存済み出力で比較を再確認した結果

69件の公開証拠ファイルと、9manifestに属する225件のF32配列をhash・shape・finite照合した。3case×参照2方式×25cut＝**150比較、gate失敗0**。各方式15,927,296値、合計95,563,776値を保存済み配列から再比較し、既存receiptの件数・最大誤差も再現した。再推論の結果ではない。

| case | 25cut全体のlocal maxAbs | composed maxAbs | composed blockOutput maxAbs | local blockOutput |
| --- | ---: | ---: | ---: | --- |
| HIGH1 base | 4.57763671875e-5 | 4.57763671875e-5 | 3.814697265625e-5 | 10,240値すべてbit一致 |
| LOW3 base | 5.340576171875e-5 | 5.340576171875e-5 | 2.09808349609375e-5 | 10,240値すべてbit一致 |
| LOW3 light LoRA部分適用+1 | 5.340576171875e-5 | 5.340576171875e-5 | 1.52587890625e-5 | 10,240値すべてbit一致 |

gateは既存の`abs(actual-reference) <= abs + rel*abs(reference)`。localはabs0.001／rel0.0001、composedはabs0.01／rel0.001を維持した。LoRA Aはweight abs1e-5／rel1e-4、bias厳密一致。結果を見てgateを変更していない。各cutのMAE・RMSE・relativeL2・bit差・失敗数は[CSV](per-cut-comparison.csv)と[same-condition-audit.json](same-condition-audit.json)にある。

local参照は実runtimeの直前cut出力を入力するため、最終local一致は全block独立実行の証明ではない。composed参照は同じ保存N2 tailとTextからP4区間を独立に伝播するが、prefix・自己注意・後続block・head・samplerを含まない。LOW3 baseとLoRAのblockOutput差`0.0001163482666015625`は意図したLoRA変更の効果であり、「同じLoRAでの誤差」には数えない。

## 6. 小診断と81frame目標を別に残す

[PROFILE-SNAPSHOT.json](PROFILE-SNAPSHOT.json)に独立した2recordを保存した。元81frame目標の`profileId`は`null`であり、本書から正式IDやcatalog登録を新設していない。

| 項目 | 小診断record | 元81frame目標record |
| --- | --- | --- |
| 対象 | 固定N2 block0、HIGH1／LOW3個別、P4 tail | 元ZIPのrv2v、832×480×81、HIGH→LOW |
| target latent | `[1,16,1,2,4]`の上流診断 | `[1,16,21,60,104]`、設定＋候補core導出 |
| 全sequence | 2、contextなし | `N_total`の式まで確定、実media待ち |
| Text／LoRA／noise | 実Hello world L512、なし／LOW部分LoRA、明示128noise由来 | 原編集prompt、原両LoRA設定、seed0。実tensor・原identity未確定 |
| 数値証拠 | 保存済み配列の150比較を再確認 | 同条件実行未実施、数値受入なし |
| Profile状態 | 実装済みcandidate、限定scopeで担当側受入 | 文書上の目標、未登録・未受入 |

目標を小診断へ縮小して完了扱いにせず、次の不足をそのまま残す。

1. 元mxfp8 modelと保存scaled FP8のidentity／復号／計算精度の対応、原LoRA2件のbytes・hash・全mapping・強度と適用順。
2. 実動画・参照画像と、mode4／slotを解決した実入力。前処理tensorのshape・hash、ordered context・各frame・source_id／座標。
3. 原positive／negativeの実conditioning、Text model／tokenizer、mask・実L・正規化状態。
4. 元の実noise tensor、初期latent、sigma列、全更新とHIGH→LOW公開／内部表現のreceipt。
5. 同じ境界を通る本番shape・全block・head・sampler、weight staging／copy／同時保持／WASM Memoryの組合せ予算。

将来、保存済みscaled FP8 pairを81frameの比較サンプルへ採用する場合も、原mxfp8との同一性が不明な間は**モデルを明示した別候補**として扱う。元workflowの無変更再現と呼ばない。大tensorから明示座標で切り出した小入力も、full noiseとの対応を示す別recordが必要であり、全token依存のattention結果がN2単独計算と一致するとは仮定しない。

現状は`load/predict/sample = NOT_READY`、`generationReady:false`を維持する。

## 7. 出典・実行source・再現手順

本書の比較基点は[配布32547051…](https://github.com/Kushyameln01/kushyameln-works/tree/32547051af430281a610d8b514ff16abee457288)。既存の[実L512結果](https://github.com/Kushyameln01/kushyameln-works/blob/32547051af430281a610d8b514ff16abee457288/development/ai-connection/p4-real-text-l512/RESULT.md)、[固定入力](https://github.com/Kushyameln01/kushyameln-works/blob/32547051af430281a610d8b514ff16abee457288/development/ai-connection/p4-real-text-l512/reference/input-freeze.json)、[再現手順](https://github.com/Kushyameln01/kushyameln-works/blob/32547051af430281a610d8b514ff16abee457288/development/ai-connection/p4-real-text-l512/REPRODUCE.md)をscopeを変えず再利用した。

| 実行／参照 | 完全source SHA |
| --- | --- |
| base独立composed | `741f1abe675eda328c7e65bb4e5903885be9ac22` |
| base native／local | `994ebb9ce01c9e95db9cd18eb877a981152693c5` |
| LoRA独立／native／local | `db5df292b21366ec385d92bb281b5f3ee74183c4` |
| LoRA担当SDK | `a80db72feea60b9bd69e292e4716665c6f0ee77f` |
| Text encode | `5537b8932343aa2476b95191817e8913f99dab02` |

shapeの原式は取得した固定core本文に対応させた。以下は元インストール版の証明ではない。全取得path・bytes・SHA-256・行範囲は[SOURCES.json](SOURCES.json)を参照。

- [BerniniStudio ca69274…](https://github.com/CCpt5/ComfyUI-BerniniStudio/blob/ca69274a2d2135052489bc0c67a2d79a64225e86/bernini_studio.py#L379)：379–387 reference resize、583–604 prompt／empty latent、630–674 context順序・入力優先。
- [Wan model b5a4321…](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/ldm/wan/model.py#L579)：579–607 patch／token concat、624–651全block／head後slice、687–723 source_id／RoPE。本文SHA-256 `17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699`。
- [VAE入口](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/sd.py#L1447)、[WanVAE](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/ldm/wan/vae.py#L461)、[latent format](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/latent_formats.py#L769)：temporal／spatial圧縮、posterior mean、正規化の区別。
- [sampler境界](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/samplers.py#L983)、[noise生成](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/sample.py#L9)：後者の取得正本SHAは`d274ed5b6abf83707b52b87d25d1716f072d5444954cf23ac0ed31a3b803ee1c`。schedule audit内に残した旧ローカル写しのSHAとは区別する。

再現は次の2段階に分かれる。

1. **公開資料の確認**：本書と同じcommitを取得し、`FILES.json`に対して各同梱ファイルのbytes／SHA-256を照合する。workflowのnode5/6/9/7/10/13/14/15/16/21/24–26とsource manifestを読み、3節の整数式を再計算する。これはモデル重みや推論を必要としない。
2. **保存済み数値の再比較**：保持環境で`python development/ai-connection/original81-profile-comparison-20261102/holding-environment-recheck.py`を実行する。NumPyと、元のprivate artifact配置が必要。モデル演算は実行せず、公開receipt・225配列のhash／shape／finite・150比較を読み直し、結果を`/tmp/same-conditions-profile-audit-20261102/audit.json`へ出力する。日時以外の比較件数・gate失敗数・最大値を同梱auditと照合する。

2のscriptは今回実行した手順をそのまま保存したもので、保持環境の絶対pathを含む。public cloneだけではprivate tensorは取得できず、pathの提示を相手の取得確認とは扱わない。`same-condition-audit.json`の`verification.artifacts`に実際に確認したpath・bytes・hashがある。本書には重み断片やprivate tensor自体を追加していない。

今回の新規確認は、初期保存指示の特定、ZIP／header／固定source本文の照合、shapeと条件の区別、保存済み出力の再比較である。既存NN証拠の再利用と、新しいモデル推論・元81frame受入を混同しない。merge・Pages公開はこの文書作成に含めない。
