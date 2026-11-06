# 長いattentionの実測と全query負荷の見通し

[実browser receipt](long-attention/browser-result.json)と[独立F64参照](long-attention/reference-public.json)を読んだ追加評価。実行sourceはbrowser `21398cb381ae2a6b3c79e5b04554e172ee3f76cf`、参照 `3a198d6788b48293cd209c44141fa98657943609`で、記録された14件のsource hashは一致する。数値・式・receipt hashは[JSON](LONG-ATTENTION-ASSESSMENT.json)に保存した。既存runtime／freeze／RESOURCESは変更していない。

**40head、128query、65,520keysのF32 attentionは実WASMで全keyを消費し、独立参照gateを通過した。全query・実モデルQKV・target predictionの受入ではない。** 小さいquery群を使っている点を残したまま、全queryへ進む際の負荷を数値で示す。

## 今回確認できた境界

shapeはH40/Q128/K65520/D128、key tile256、256回、最終tile240。phantom key0。Python／JavaScriptはQ/K/Vを独立生成し、全streamのhashが一致した。NumPy F64 online参照とORT F32更新＋Hike最終除算を比較し、次の全1,320,960値がfiniteでgate内だった。

| 配列 | 比較数 | 最大絶対誤差 | 失敗 / 非finite |
| --- | ---: | ---: | ---: |
| unnormalized context | 655,360 | 0.0127750128 | 0 / 0 |
| denominator | 5,120 | 0.0379264585 | 0 / 0 |
| max | 5,120 | 8.58562998e-10 | 0 / 0 |
| Hike normalized output | 655,360 | 2.58260897e-07 | 0 / 0 |

共通gateは`absError <= 0.001 + 0.0001*abs(reference)`。denominatorや未正規化contextの絶対誤差だけを0.001と比較しない。正規化後outputの最大絶対誤差は **2.58260897e-07**。

最後のkey65519を落とすと全outputがgateを超えて変わるsentinelも確認した。変化の最小値は0.0305653209、各要素のgateを差し引いた最小余裕は0.029542733。sourceは検証済みbytes snapshotから配信され、参照／browserの実行後hash検査も合格した。

## 時間の読み方

| 実測区間 | 秒 |
| --- | ---: |
| fixture生成 | 2.2718 |
| diagnostic入力hash | 17.8506 |
| receiptの`ortMs`区間 | 15.0896 |
| browser内部の計測全区間 | 35.4692 |

`ortMs`は純粋なkernel時間ではない。attentionTileのsnapshot・検査・Tensor/native移動・演算・出力copy・cleanupと、呼出し後のmax更新確認を含む。全区間はoperator構築・Hike除算・比較も含み、計測開始前の参照fetchとbrowser起動は含まない。ORTはnumThreads1。独立F64参照はOpenBLAS4threadで9.0247秒だったが、production runtimeの速度へ転用しない。

入力hashの17.85秒はこの診断の一部。通常実行で同じfixtureをquery群ごとに再生成・再hashする要件は追加しない。ただし、実モデルでは代わりにQKV生成・weight decode・norm／RoPE等が必要なので、hash時間を引いた値をproduction予測と呼ぶこともできない。

## 全queryへ広げた場合の算術scenario

source81＋targetだけでもN=65,520で、query128行なら512群、最終群112行。各群が全65,520keysを読むため、1blockのattentionTile呼出しは131,072回になる。今回実行したのはそのうち **1query群・256回**。

以下は、全512群が今回の128行群と同じ時間で動くと仮定した掛算である。最終112行も時間計算上だけ128行分を計上している。実処理にpaddingを加える意味ではなく、時間の上限保証でもない。cache、GC、contention、session再利用、入力値、実QKVの影響は未測定。

| 仮定した反復対象 | 1blockの全query attention | 40block分 | 6×40block分 |
| --- | ---: | ---: | ---: |
| `ortMs`区間15.0896秒を各群で反復 | 2.146時間 | 85.84時間 | 515.06時間 |
| 診断全区間35.4692秒を各群で反復 | 5.045時間 | 201.78時間 | 1210.68時間 |

この表はattention区間の**未検証scenario**であり、prediction／sampleの所要時間や完了予定ではない。self O・residual、cross-attention、FFN、最終head、sampling、provider／Worker、追加referenceを含まない。refがR tokens増える場合のattention FLOP比は`((65520+R)/65520)^2`だが、時間がその通り増える証拠はない。

対象Gemmは選択128queryで171,756,748,800 FLOP、全65,520queryで87,917,985,792,000 FLOP/block。全query／選択queryの仕事量比は511.875。今回の実測は全queryを扱う計画へ具体的な校正値を与えるが、完走時間の保証にはならない。

## Memoryとcopyの適用範囲

receiptのcaller named spansは15,769,600 B、最大score tileは5,242,880 B、Hike Memoryはdispose前9,175,040 Bだった。これらはexpected配列、ORT allocator、browser、GC等を含まない。fixtureはK/Vをtileごとに生成しており、実モデルの全K/Vや4本のhost storeを同時常駐させていない。

owner counterのinputは4,036,362,240 B、outputは681,574,400 B。これは1query群内の累積量で、peakではない。同じcounter量を512群反復するとinput約2.067 TB、output約0.349 TB/blockになる。このcounterもnative／GC等の全copyを網羅してはいない。

従来の4store計画はN65,520で5,367,398,400 B、そのうち全K/Vは2,683,699,200 B。今回の小さい実測spanからproduction全工程peakを推定しない。productionのhost／ORT／pipeline peakは未測定のまま残す。

## この結果で変わる判断

新しいbatched F32境界は、旧E7のK32,760・1head制限を越えて実際に動いた。旧境界の制約をWASM全体の不可能性へ広げる根拠にはならない。一方、未確認なのは全N query、実モデルQKVとsource-aware norm／RoPE、全block／最終head、target prediction、6更新と内部HIGH→LOW、全工程のpeak・時間・Worker寿命である。

この追加評価は選択operatorの受入を記録する。D1–D4全体や元81frame workflowの完成・精度同等性を承認するものではなく、production不可能とも結論しない。
