# 実測資源の結果：全40blockの小入力受入と6更新の途中観測

作成基点：`e6f76c6a36a641be0a3483fd7b6bf6fcdf287ce2`。controlled N5/L3の6NNは **実行・独立比較完了**。詳細な数値・定義・出典hashは[RESULT-RESOURCE.json](RESULT-RESOURCE.json)。本書は既存の公開receiptと数値metadataを読むだけで作成した。runtime、固定source、実行中jobは変更していない。

**HIGH／LOWはcontrolled N5・Text L3で全40blockと最終headを完走し、独立参照の全47cutが通った。元target `[1,16,21,60,104]`、N=65,520+refs、およびその全6更新は未受入。** 小入力の時間・Memoryをproductionへ比例拡大した予測や、production容量設定の新設は本書では行わない。

## 全40blockの実測

| 条件 | HIGH | LOW |
| --- | ---: | ---: |
| browser case時間 | 505.9325秒 | 525.4706秒 |
| 内部model区間 | 505.2478秒 | 524.7508秒 |
| 全40block・head | 完走 | 完走 |
| 独立比較 | 47cut・1,106,368値・失敗0 | 47cut・1,106,368値・失敗0 |
| stage host F32 cache peak | 566,231,040 B | 566,231,040 B |
| hidden storeのnamed peak | 409,600 B | 409,600 B |
| source復号F32累積量 | 57,153,966,336 B | 57,153,966,336 B |
| operator input span counter | 57,217,101,056 B | 57,217,101,056 B |

いずれもtarget2token＋source2token＋reference1token、Text3行、40head、prediction shape `[1,16,1,2,4]` のcontrolled case。比較gateは事前固定`abs0.01 + rel0.001*abs(reference)`。元媒体・元81frame・GPU FP8との同等性は受け入れていない。

sourceF32の約57.154GBは、range sourceから復号して処理へ渡した**累積量**であり、57GBの同時常駐を意味しない。operator input約57.217GBもowner境界の入力span counterで、native ORT/WASM内部の全copy総量ではない。実file読込はrangeの累計15,574,833,216 B/model、最大payload range163,840 B。モデル全体hashは再計算していない。

stage cache566,231,040 BはFFN up/downのhost F32 pair等を保持するnamed peak。native weight常駐の証拠ではなく、復号buffer、operator snapshot、ORT allocator、old/new session、GC遅延を含まない。dispose後はnamed hidden/cache0、native tensor handle0になったが、OS返却やORT arena縮小はこのreceiptでは測っていない。

## process観測の範囲

| 値 | HIGH | LOW |
| --- | ---: | ---: |
| 観測区間のprocess RSS合計peak | 2,431,102,976 B | 2,388,434,944 B |
| sample数 | 484 | 378 |
| 観測区間の長さ | 494.763秒 | 387.147秒 |
| 使用できるPSS | 未取得 | 未取得 |

monitorは実行開始後に入り、prefixを含む全lifecycleを覆わない。RSS合計は共有pageを重複計上し、owner allocatorのpeakとは異なる。両runともPSS readable processが全sampleで0だったため、LOWファイルの保存値0も測定値として使わない。

cgroup currentは他の作業とfile cacheを含み、memory.peakは歴史上の最大値である。これらをこのrun固有のpeakへ読み替えない。

## 実取消とMemory観測

prefix取消は9.4161秒、block完了0、5trace後にAbortErrorで終端した。cleanup errorなし、owner dispose済み、native tensor handle0。prefix runにはWASM observerがなく、取消後WASM容量は未測定。

6更新samplerの実timeout取消は3.2012秒で、完了step／HIGH prediction／LOW predictionはいずれも0。cleanup errorなし、owner dispose済み、native tensor handle0だった。

このsampler取消にはWeakRef observerが入り、dispose後の観測は11identity、9個がdereference可能、current合計 **134,807,552 B**、sampled concurrent peakも同値、観測error0。そのうちconstructor経由の最大Memoryは114,753,536 Bだった。これは各WASM Memory objectのbuffer.byteLengthであり、allocatorの使用量やprocess RSSではない。dispose後もdereference可能なことだけで、残存参照、未GC、意図したruntime保持を区別できず、OS解放の成否も判断できない。

## 6NNの完了結果とMemory

[実sampler receipt](n5-sampler-native.json)はcontrolled N5／Text L3でHIGH3回→LOW3回、各40block、計240blockを完走した。browser case時間は **3206.3816秒（約53.44分）**。独立比較は16配列・2,048値すべてgate内、失敗0で、finalRawの最大絶対誤差は3.21865082e-06だった。元targetの6更新を実行した結果ではない。

保存codecは1,179 B、payload128要素すべてbit一致し、disk readbackのpayload／encoded hashも一致した。cleanup errorなし、model／source／shared operator ownerをdisposeし、native tensor handle0。linear／attentionの2sessionを6predictionで共有し、creation数は2のままだった。

最終WASM observerは11identity、9個がdereference可能、current合計とsampled concurrent peakは **313,458,688 B**、観測error／byteLength unavailableはいずれも0。

```text
既知の小Hike Memory8個の合計  20,054,016 B
Memory.constructorの最大object 293,404,672 B
観測current合計               313,458,688 B
```

最大objectは`Memory.constructor`から観測され、owner／stack tagはない。厳密なORT allocatorへの帰属や使用量peakは主張しない。per-identity peakの総和314,572,800 Bは異なる時点も含み、同時peak313,458,688 Bへ足さない。dispose後も同じcapacityがdereference可能だったが、未GC・別参照・runtime保持を区別できず、OS解放の成否は分からない。

[process観測](n5-sampler-process-memory.json)のRSS合計peakは **2,907,226,112 B**。共有pageを重複計上し、開始後に入った3,104sample・3188.187秒の観測区間に限る。PSS readable processは全sampleで0なのでPSSは未取得。cgroupは他の作業とcacheを含み、このrun固有のpeakには使わない。

共有operatorのinput span counterは343,302,606,336 B、outputは320,140,800 Bで、6predictionの累積量。HIGH／LOW配下に同じshared ownerのstatsが重複するため、入れ子のcounter／Memoryを足し合わせない。これらもnative全copy総量やpeakではない。

初期のprogress prefixは履歴としてJSON内に残し、最終receipt・比較・process観測を優先する。元target／全N queryの受入、production peak・時間については引き続き未確認。

## 長いattentionと元shapeへの残件

[長いattentionの実receipt](long-attention/browser-result.json)はH40/Q128/K65520/D128、256tile・末尾240、4配列1,320,960値で失敗／非finite0。正規化output最大絶対誤差は2.58260897e-07。計測全区間35.4692秒のうち17.8506秒は診断hash、15.0896秒のattention呼出し区間はsnapshot／copy／cleanup等も含む。全N queryや実モデルQKVはこの診断の範囲外。

元targetは32,760tokens、同shape source81だけで全Nは65,520、実referenceを加えればさらに増える。4本のhost hidden/K/V storeの算術値は次の通り。

```text
4 * N_total * 5120 * 4 B
N_total=65520 のとき 5,367,398,400 B
```

これはstage cache、source／decoder、ORT／Hike、snapshot、Worker／IPC、出力、GC、old/new sessionを含まない。productionのhost／ORT／全pipeline peakと所要時間はnullのまま残す。初期資源計画の仮予算やcurrentの90,000token planning capを、実測済みproduction範囲として扱わない。

並列の重い実行は自動承認レビューで2回拒否されたため、参照・nativeを順次実行した。保留中の承認要求はない。

## 原寸容量確認用storeと最大tile

固定source `98e4aa361532a2de22ea5aed1565de42a084426c`で、非zeroの容量確認用store 5,367,398,400 Bと実FFN重みcache 566,231,040 Bを同時保持した。実LOWのM128/N5120/K13824 Gemm＋Hike biasは655,360値すべて事前gate内、最大誤差8.344650268554688e-7。観測WASM Memoryは372,637,696 B、計測開始から終了までのRSS合算peakは7,425,630,208 B（共有pageの重複を含み得る）。この計測ではPSS合算peakも7,146,511,360 Bと観測できた。先行HIGH／LOW／6更新のPSS未取得とは別に扱う。

初回はRSS観測開始が間に合わず、その0は未観測を意味する。同じ固定参照を再利用した計測付き試験でRSSを取得した。両試験のbiased output hashは一致する。これはcontrolled inputによる容量・tile試験であり、production hidden、全query、全40blockの実predict、原寸6更新、全candidate scheduleの数値・資源受入ではない。

[計測付きreceipt](target-capacity/native-monitored-result.json)／[初回receipt](target-capacity/native-result.json)／[RSS観測](target-capacity/native-full-process-memory.json)
