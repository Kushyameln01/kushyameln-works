# 実Text L512を消費したP4 baseの限定受入

2026-11-02 JST。固定N2/block0・HIGH1/LOW3のbase経路で、実Text L512をText投影→K/V→
cross-attention→N2残差→FFNへ接続した。各sideはlocal25+composed25、計31,854,592値・失敗0。
これはDiffusion ownerの限定数値受入であり、LoRA適用・管理採用・全model受入とは別である。

## 配布と実行source

- 直前配布: `27776abb234fc12733c600b1dabd2fdab70e27ae`。
- 独立composed参照実行source: `741f1abe675eda328c7e65bb4e5903885be9ac22`。
- 実native HIGH/LOWとlocal参照実行source: `994ebb9ce01c9e95db9cd18eb877a981152693c5`。
- 実Text原配布: `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48`、元Text実行: `5537b8932343aa2476b95191817e8913f99dab02`。
- profile: `bernini-block0-n2-cross-ffn-f32-candidate-v1`、native API: `diffusion-models/0.1`。

数値core/kernel、元reference演算、事前gateは変更0。変更は専用診断入口、source/reference入場検査、
binary transport、資源観測と文書だけである。実行sourceは開始前と終了時に固定commitへ照合した。
L4 fixture診断・旧Q16・旧N2 tail・正式82b DATAの受入scopeを変更しない。

## 実入力と事前固定

F32 BLC `[1,512,4096]` の全512行、Uint8 mask全512位置（有効3）、model/Tokenizerと
元header/metadata/producerを保持した。Text最終RMSNormを再適用せず、maskをsoftmaxへ適用せず、
mask0の509行も投影後のbiasを含めて全て消費した。

| artifact | bytes | SHA-256 |
| --- | ---: | --- |
| 元WKT | 8,390,054 | `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9` |
| 元payload | 8,388,608 | `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7` |
| 元mask | 512 | `19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62` |
| bit-preserving native JSON | 8,604,657 | `9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8` |

元header1434bytesもexact bytesで保持し、WKTを再構成してwhole hashを検査した。
native JSONの全F32 roundtrip bitsは元payloadと一致する。[input-freeze](reference/input-freeze.json)
に保存N2 residual/timeAct1のside/block/schedule/producer/hashも含めた。prefix・自己注意・tailは再計算していない。

native前に独立composed25配列を計算・保存した。manifest SHAはHIGH
`8dd640f0cbf127c149903eec558ea2a5b804a5bc0a4533dab67ae54da86ec97d`、LOW
`530746b1e2d59d0c9cbe82e1ddad6d743ae32eb8fd7029f56cca694b57672be7`。
[PRE-RUNTIME-FREEZE.json](PRE-RUNTIME-FREEZE.json) のSHAは
`3982b57a4cc2cebedc83d1d90cdaf31e5f6f414a46e5f711a23717337fea935c`。
driverが両参照のmode/side/input/source/gate/25identityをChromium起動前に照合した。

## 数値結果

元core順のText Linear4096→5120/GELU(tanh)/Linear5120→5120、norm3/QKV、
full5120 QK RMSNorm、40head×128・各512key、O/残差、chunks3–5、FFN5120→13824→5120を比較した。
crossにRoPEはなく、norm epsilonは1e-6。FFN downのinnerを分割せず4出力行tileを維持した。

| case | local25の値数/失敗 | composed25の値数/失敗 | 全cut最大絶対誤差 | composed blockOutput最大絶対誤差 |
| --- | ---: | ---: | ---: | ---: |
| HIGH1 | 15,927,296 / 0 | 15,927,296 / 0 | 4.57763671875e-5 | 3.814697265625e-5 |
| LOW3 | 15,927,296 / 0 | 15,927,296 / 0 | 5.340576171875e-5 | 2.09808349609375e-5 |

local gateはabs.001/rel.0001、composedはabs.01/rel.001。`abs(actual-ref)<=abs+rel*abs(ref)`を
全値へ適用し、percentile合格や事後緩和はない。local blockOutputは両sideでbit一致。
local参照生成時にcomposed25を再計算し、native前に固定した全配列とparameterSourcesへbit一致した。
これは参照再現性検査であり、native modelを再実行した件数には加算しない。

各sideの全29 parameter選択は原storage bytes・独立F16/FP8復号F32・実消費F32が一致した。
storageは実F16または固有scalar scale/config付きFP8、計算は明示F32 ORT WASM/Hike。
元GPU FP8 activationやfused precisionとの一致は受け入れていない。

[HIGH比較](reference/high-local-receipt.json) / [LOW比較](reference/low-local-receipt.json) /
[集計](BASE-NUMERICAL-SUMMARY.json)。独立再照合では6manifest・150binary file・182固定sourceと
全4比較群を検査し、1206checkで失敗0だった。実モデル再実行を伴わない。

## 実測資源と寿命

| 指標 | HIGH | LOW |
| --- | ---: | ---: |
| core stage | 147.640s | 149.2032s |
| browser全体（取消probe・export含む） | 159.8248s | 160.6370s |
| sampled Chromium RSS process和peak | 1,420,918,784 B | 1,411,518,464 B |
| sampled Chromium PSS process和peak | 1,138,219,008 B | 1,175,014,400 B |
| cgroup currentの観測最大（環境全体） | 3,635,404,800 B | 3,790,884,864 B |

RSS/PSS最大は数値run中ではなく最初の取消probe後に観測された。RSSは共有pageを重複計上し、
PSSは共有pageを按分する。100ms目標のsamplingは短いpeakを逃しうる。cgroupには環境全体が含まれ、
memory.peakはrun以前の履歴を持つ。測定器のoverheadを含む時間である。

数値stageの4 distinct WASM Memoryは合計21,102,592 Bで固定。ORTは16MiBの1 Memoryを
2 sessionで共有し、session数をMemory数と数えない。別のdispose probeで追加観測されたHike Memoryを
数値stageの同時保持数へ加算しない。旧tailは構築せず、旧idle併置の資源証拠を今回へ転用していない。

両sideで実counterは同じだった。

- projection44,704回、attention score320回。重みstaging最大decoded327,680 B、linear入力最大327,680 B。
- linear input snapshot累積26,825,525,760 B、別のprojection batch copy12,973,506,560 B。
- bridge666,930 call×arena491,648 B=327,894,800,640 Bのlogical zero-fill。物理DRAM転送量ではない。
- 返却25配列63,709,184 B。private export259chunk、base64文字84,946,256、decoded write63,709,184 B。
- 名前付き同時保持binary spanは88,937,984 B。stage側knownRetained80,645,994 Bとはscopeが重なるため加算しない。

これらの累積trafficをRAM peakと扱わない。metadata/string/JSON/File backing、ORT allocator live、
host allocator/GC、全工程peakはnullのまま。今回の限定scope以外の資源保証は行わない。

実取消後の再利用、busy拒否、入力全bytes/metadata不変、fixed workspace再利用、出力保持を確認した。
run中のread leaseは1、取消/数値run/解放後は0。sessionは2→0、pending Tensorとin-flight readは0。
各sideで完了1runと取消2probeを区別する。dispose中のcooperative取消も元Promiseの終端を待った。
出力はdispose後も全25hashを保持し、signed-zeroを含むbinary保存の全bytesがnative identityへ一致した。

[HIGH実測](integration/high-browser.json) / [LOW実測](integration/low-browser.json) /
[独立資源review](resources/actual-resource-review.json)。数値gateと資源reviewの件数を合算しない。

## 再利用・変更・未受入

再利用は元f76実Text・元5537全値receipt、保存N2残差/timeAct1、元core/reference演算、kernel、gate、
Hike復号・ORT graph・F32 consumer。新規は実L512専用診断、入力/参照/source入場検査、binary transport、
実base NNと比較、資源と取消/解放の境界である。pointwise上限1,048,576要素とmean変換128固定は変更していない。

初回source入場はGit管理外の過去build runtimeを拾ってnative前に拒否した。
[原記録](attempts/source-admission-1/RESULT.json)を保持し、source一覧収集だけを修正した。
参照・数値gateは再生成/緩和していない。以降の実runで使用source182件を固定commitへ一致させた。

LoRA適用の数値受入はこのbaseとは別scope。新canonical sourceの取得・実適用/独立参照・切替復帰は
[LoRA接続状態](lora/STATUS.json)へ分けて記録する。baseの成功を実LoRA成功に転用しない。

本番shape、元workflowのpositive/negative/ordered contexts、全block・最終head、実HIGH→LOW、
元production precision、実生成sample/VAE decode、全体資源予算、管理catalog採用は未受入。
`load/predict/sample=NOT_READY`、generationReady:false。merge・Pages公開はこの作業で行わない。
