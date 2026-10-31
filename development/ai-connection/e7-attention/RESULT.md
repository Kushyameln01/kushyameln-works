# E7 next candidate: one-head streamed global attention

2026-10-31 JST。前のQ Linear出力行tile候補を再実装せず、次の一候補を検証した。**採用scopeは明示postnorm/RoPE入力の1head・Q16×D128・宣言した全K32760を使うF32 attention境界のみ。productionはunverified、E8はBLOCKED。**

K32760はtarget-grid選択境界であり、元rv2v全contextのkey数ではない。同shape sourceを加えるだけでK65520となり、今回の上限32760の外。all keysとはexplicit source descriptorの全keyであり、未検証producerが本来の全tokenを含めた証明ではない。

## 固定した意味・出典・precision

`softmax(QK^T * f32(1/sqrt128)) V`、1head、maskなし、dropout0、keyの欠落/並替え/window/近似なし。固定ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` の `comfy/ldm/modules/attention.py:265,279–283,302,304` 本文を取得し、scale/FP32 score選択/softmax/weightedV式を確認した。Git blob `abed292bf742eb8ea9493e0e6341ca5264efdc8a`、全文SHA-256 `2e688c4c96ba10915c7ca847ea692faea3be4b9c2605d74d785b7abb23ee2502`。原文と出典台帳はcore-source/core-manifest.json。

Wan coreはQ/KへnormとRoPEを施してからattentionを呼ぶ。今回その生成は行わず、postnorm/postRoPEを仮定したexplicit/precomputed F32 source interface `works-postnorm-rope-qkv/0.1`を公開した。実model hidden state、QKV weights、source_id/RoPE生成や全headsの実行証拠ではない。元production backend・FP8/compute dtypeの同等性は未検証で、F32診断profileを勝手に本番採用しない。

独立Python/NumPy dense FP64参照は同じF32入力bytesとscaleF32 `0.0883883461356163`、全keyから生成した。gateは比較前に **abs1e-5＋rel1e-4** と固定。生成後や実行後に緩和していない。Q/K/V全bytesのstreaming SHAも独立参照と一致した。dense参照のメモリ量はruntimeのメモリ量と分離する。KV巨大fileやモデル重みは新規保存していない。

## 実行境界とHike ABI

```text
Q[16,128] owned snapshot + source K/V(offset,count)
  → exact Ktile64 / final56
  → actual ORT WASM: QK^T*scale, tile/global row max, stable Exp, alpha
  → owned weights/alpha + owned V tile
  → actual Hike: alpha*old numerator/denominator + all current keys
  → next key tile
  → actual Hike final numerator/denominator division → output[16,128]
```

ORTはglobal rowMaxを更新して `weights=Exp(score-newMax)` と `alpha=Exp(oldMax-newMax)` を返す。HikeはF32順で累積を再scaleし、全keyの重み付きVと分母を加える。初期rowMaxは有限minimumF32、numerator/denominatorは0。中間score/Expや累積をJSで代行しない。source tail56は実Tensor shape16×56としてORTへ渡し、Hikeもrow×56strideで処理し、workspaceの未使用8keyを加算しない。

新export: `Accumulate(weightsPtr,valuesPtr,alphaPtr,rows,keys,numeratorPtr,denominatorPtr)` と `Normalize(numeratorPtr,denominatorPtr,rows,outPtr)`。rows1..16、keys1..64、D128。host所有のdisjointF32 arenaを一度だけ確保し、Memory grow後viewを再取得する。pointersは同じInstanceだけで有効。新kernel SHA-256 `b809f614c69be820346d738b46b743b50c624d902141610c28de07ae0cfd159c`。固定Hike compiler/WABTを利用し、importsなし、ABI/receipt検査を通した。

最初の一関数prototypeでpinned WABT parserがout-of-boundsになった記録を残す。生成WAT最大nest160だったが正確なparser原因は未証明。同じF32順序をhelper関数へ分割したsourceでbuild成功した。compiler/backend/Exp近似/JSfallbackへ置換していない。

## 実検証

実Chromium154.0.8037.57、ORT1.24.3、実Hike。8case群が成功し、pageErrorsなし。

- pattern K64/120/32760: 各2048output全比較。K32760は512tiles、final56、全32760keys消費、失敗0、最大絶対誤差 **4.503817763179541e-09**。最大相対誤差0.0082462979はnear-zero出力を含み、採否はcombined gateによる。
- uniform K120: denominator120、独立mean(V)閉形式。zero V→全0も確認。
- increasing-max K120: tile2で全row最大値が更新され、maxUpdates32。Vを全1にした別bindingの閉形式で全output1、row normalizationを確認。
- moderate-extreme: logits約±67.882、全output/denominator/maxが参照gate内かつ有限。
- compact/finite/shape/binding/tail countを検査、queryを実行中に変更してもowned snapshotが維持され、producer K/Vを変更しない。
- tile境界取消後に次tileを読まず結果を拒否、次runをresetして再利用。不正入力/途中失敗後の正常runも比較。BUSY/active disposeを拒否。
- 独立reviewがsource.describe再入による共有state混入を実browserで再現した。RED後、`run(input)`入口で外部getter/destructureより前にlockし、preflight全体をfinally対象へ修正。describeとq getter内のinner runをBUSY拒否し、outer K120の出力がclean参照と一致することを確認した。

Memoryは全512tileで固定、ORT sessionは1回作成。初期kernel単体recurrence/rescale/divideも実WASMで成功。単体とbrowserの件数を合算して全model合格にしない。

## live量・copy・時間・OS観測

最大tile64に対しscoreは1024F32要素（4096B）。選択Q16対全K32760のdense score1本は2,096,640Bだが実体化しない。この数値はQ32760全queryや全headsのdense scoreではない。

| 区分 | bytes |
| --- | ---: |
| caller/owned Q各8192、producer/owned K/V tile各65536、weights original/copy8192、alpha128、max192、最終output/den/max8320を保守的に合算したnamed numeric live | 164,288 |
| Hike persistent Memory / 固定arena | 1,114,112 / 53,376 |
| named numeric live＋Hike Memory | 1,278,400 |
| graphの名前付きtensorを全て別保持すると仮定したlogical量（K64、transpose/score4本等） | 90,508 |
| 全Q/K/V logical payload（F32） | 33,554,432 |
| host snapshot copies | 35,716,736 |
| Hike input / output copies | 18,902,528 / 8,192 |
| managed copies合計（上3copy欄） | 54,627,456 |
| logical ORT input / output境界 | 21,000,192 / 2,162,176 |
| Hike reset / transient arena clear writes | 53,376 / 18,907,136 |

named logical liveはJS metadata/参照fixture、WASM bytes/compile、ORT allocator/Memory、producerのfull KV backing、GC未回収、他caller buffersを含む総RAM上限ではない。ORT内部量と汎用producerのresident量は **null/未測定**。provenance.kindを見ただけでproducer residency0と認定しない。同梱on-demand fixtureがfullKVを保持しない事実は、その実装/試験に閉じる。copy traffic、arena clear writes、logical input量、同時live量を加算してピークRAMとはしない。

K32760のrunは **1117.1ms**（source生成/検証・入力checksum/copyを含むread348.3、ORT76.6、Hike689.6）。constructor/全caseを含むwallは1.626s。実model QKV生成/weight staging時間は含まない。

自分が起動したChromium子孫だけを20ms目標間隔で47sample観測し、PSS baseline255,006,720B、observed peak **383,030,272B**。RSS process合計peak659,226,624Bはshared page重複があり得る。renderer/ORT/runtime/test harness全caseを含む観測で、ORT allocator単独・本番pipeline peak・利用者端末の改善ではない。

## 採用と保留

採用はこのexplicit Q16/1head/all-declared-K32760/F32境界だけ。K65520+のrv2v context、production QKV/norm/RoPE、全query/all40heads/all40blocks、元precision、residual/FFN/output projection、旧新session・KV/重みstaging・combinedcopy予算は未成立。**E8へ進まずload/predict/sample NOT_READYを維持する。**

再現入口はstream-attention/README.md。新runtime閉包はstage.mjs、graph.mjs、hike.mjs、registry.mjs、kernel.hike/wasm/wat、build.py、build-record.json。既存Q/bridge/latent-space/SDKは変更していない。rootがnative build閉包と全体報告を更新する。モデル原本・全NN・LoRA低rank積・Pages公開はこの候補で実行しない。
