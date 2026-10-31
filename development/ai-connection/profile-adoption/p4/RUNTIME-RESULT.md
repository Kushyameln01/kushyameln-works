# P4 actual-weight QKV operator result

2026年10月31日 JST。新候補は固定coreと実HIGH/LOW block0重みを用いたN16のoperator診断である。元target32760(+context)のproduction activationは受領しておらず、本番QKV・全query/head・predict/sampleの受入ではない。

## 固定した境界と事前条件

原core/全shape/precision/座標/事前gateは `candidate-plan.json`、原文と取得hashは `core-manifest.json` / `core-source/`。N16 hiddenは公開recipeからの明示fixture、入力shape `[16,5120]`。Q/K/Vを各全5120列出力し、Q/Kだけ全5120軸・eps1e-6・実F16 norm weightによるHike RMSNormへ渡す。その後head0の128値を選び、T/H/W dims44/42/42と別full128 source-ID回転をHikeで合成・適用し、既存attentionへ16keyを渡した。Vへnorm/RoPEは加えていない。

既存単一Q/stream-attention8caseの算術scopeを維持し、新接続を別scopeとして検証した。原FP8 storage→F32診断は元GPU/activation-quantization/scaled_mm precisionの同等ではない。RoPE6,494 Bの新kernelは固定Diffusion compilerでbuild。generic tensor Hike binary9dfdcb…は元owner receiptの歴史compiler f41a50…を継承し、現在のfb458…で再buildしたとは扱わない。

## 全値比較と結果

| 比較対象 | 要素/side | 事前gate | LOW maxAbs | HIGH maxAbs |
| --- | ---: | --- | ---: | ---: |
| qkv.q | 81,920 | abs0.0001 + rel1e-05 | 1.72853469849e-06 | 2.86102294922e-06 |
| qkv.k | 81,920 | abs0.0001 + rel1e-05 | 1.66893005371e-06 | 2.02655792236e-06 |
| qkv.v | 81,920 | abs0.0001 + rel1e-05 | 1.54972076416e-06 | 5.96046447754e-07 |
| norm.q | 81,920 | abs0.0001 + rel0.0001 | 8.10623168945e-06 | 1.23977661133e-05 |
| norm.k | 81,920 | abs0.0001 + rel0.0001 | 6.67572021484e-06 | 7.62939453125e-06 |
| matrices | 4,096 | abs2e-06 + rel2e-06 | 0 | 0 |
| q | 2,048 | abs0.0001 + rel0.0001 | 3.57627868652e-06 | 4.29153442383e-06 |
| k | 2,048 | abs0.0001 + rel0.0001 | 4.05311584473e-06 | 5.72204589844e-06 |
| v | 2,048 | abs0.0001 + rel1e-05 | 1.25169754028e-06 | 3.57627868652e-07 |
| attention | 2,048 | abs0.001 + rel0.0001 | 3.1441450119e-06 | 2.30222940445e-06 |

全比較gate失敗0。Q/K/V各fullweightのrawとdecoded F32 bytes、bias3本・norm2本も独立decoder SHAへ厳密一致。事前gateと座標は結果取得後も変更していない。元input保持、16/5120のshape拒否、head0以外拒否、取消後再利用、再入BUSY、所有output・解放を各side6case群で確認した。

## 変更した拒否と所有権境界

共有generic RMSNormはfinite1e19を入れるとsum-square overflowから見かけ上finiteな0を返すことを実WASMで再現した。共有kernelは変更せず、P4のprojected Q/Kへabs<=1e16のadmissionを追加した。5120×(1e16)^2=5.12e35でF32上限に十分な余裕があり、範囲外finite/NaN/Infを拒否する。これはgate緩和ではなく、この診断の追加条件であり、`runtime-admission.json` が元の比較前planhashへ結ぶ。

`ownership.mjs` は全owned cleanupを独立試行し、成功handleだけclear、失敗handleを保持する。cleanup中/失敗後の新runはRECOVERY_REQUIRED。`dispose/recover`が再試行し、constructor失敗では元error・cleanup error・local recovery closureを保持する。依存stream-attentionの旧disposeも実ORT session.releaseの失敗でhandleを失うため、失敗時session/Hike保持・成功clear・再利用禁止へ修正した。同期throwのpendingPromise代入raceはmicrotask開始をdeferして修正。実ORT prototypeへの明示fail-once注入3case（同期throw・rejected Promise・第2session constructor失敗＋cleanup失敗）でRED→GREEN、実native releaseの成功回数まで確認した。数値算術は変更していない。

## 同時保持量とtraffic

| 区分 | 数値 |
| --- | ---: |
| full Q/K/V outputs | 983,040 B |
| full normalized Q/K outputs | 655,360 B |
| caller＋owned hidden | 655,360 B |
| 最大raw / decoded weight tile | 81,920 / 327,680 B |
| base bias/norm retained / 現parameter copy | 102,400 / 20,480 B |
| selected-head Q/K/V / RoPE matrices | 24,576 / 16,384 B |
| Hike Memory4instances | 4,915,200 B |
| ORT sessions | projection＋attentionの2個 |
| fullrun weight reads | 78,643,200 B |
| logical ORT projection input/output traffic | 629,145,600 / 983,040 B |
| bridge Hike input/output copies | 80,609,280 / 315,555,840 B |
| generic norm input/output copies | 1,351,680 B |
| bridge arena clear writes | 8,023,695,360 B |

この表はnamed buffer/trafficの区別であり、copyやclear量を同時live量へ加算しない。4Hike Memoryは各Instanceの固定Memoryであり、ORT allocator、metadata/parse/header、WASM compile、未回収GC、private reference/harness、callerの他保持量を含む総RAM上限ではない。原File参照を15.57GBの常駐配列とはしない。ORT内部とproducerの未知resident量はnull。header/prefix181,288 Bと初期bias/norm/scale/config51,293 B、取消試験の先頭tile readはfullrun weight readと別である。

| side | fullrun ms | read/decode/hash ms | observed owned Chromium PSS peak |
| --- | ---: | ---: | ---: |
| LOW | 10878.7 | 10381.1 | 535,017,472 B |
| HIGH | 10914.4 | 10436.2 | 534,784,000 B |

elapsed.readMsはFile read＋Hike FP8復号＋raw/decoded incremental SHAを含む合成区間であり、純粋File I/O時間ではない。PSSは自分が起動したChromium子孫のconstructor/全case/private expected/reference harnessを含む観測値で、ORT allocator単独、利用者端末改善、全pipeline peakではない。

## 再現と未受入

```sh
node --test --test-isolation=none docs/shared/diffusion-models/ort-bridge/qkv/test-boundaries.mjs
node --test --test-isolation=none docs/shared/diffusion-models/ort-bridge/qkv/test-rope.mjs
python tools/diffusion-models/p4-reference.py --help
python tools/diffusion-models/p4-browser.py --model /private/Bernini_LOW_fp8_e4m3fn_scaled.safetensors --reference /private/reference-LOW.json --output /private/runtime-LOW.json
python tools/diffusion-models/p4-lifecycle-browser.py --model /private/Bernini_LOW_fp8_e4m3fn_scaled.safetensors --output /private/disposal.json
```

HIGHも同じcandidate/gate/coordsで別原本を指定する。私的referenceの生成recipeと全source/hash、結果metadataは公開し、raw重み・actual norm weights・private expected arrayは公開Gitへ入れない。モデルの再download/full-file再hash/全NN再実行は行っていない。

adopted scopeはHIGH/LOW別の実weight-backed N16/fullwidth-QKV→fullnorm→head0/RoPE→selected16-key attention診断のみ。実timestep/blockのpost-modulation hidden、元production compute dtype/backendと独立中間参照、全target/context・全query/head/stage・残差/FFN/output projection・組み合わせた資源予算が不足する。`productionQKVVerified:false`、`actualModelHiddenVerified:false`、`fullSequenceVerified:false`、P5=BLOCKEDを維持し、load/predict/sampleはNOT_READYのままである。
