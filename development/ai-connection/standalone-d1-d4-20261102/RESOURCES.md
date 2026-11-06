# D1–D4 実shapeの資源・実行方式監査

基点：`48ff155988d995fc2569e495c8d8820273bd472c`。観測：2026-11-02T04:23:40.225114+00:00。詳細と出典hashは[RESOURCES.json](RESOURCES.json)。

**設計候補は、host側に分割したhidden入力・出力・K・Vを置き、Q／attention／FFNを行単位で実行する方式とする。元shapeのWASM実行が一律に不可能という証拠はない。ただし、この方式のproduction ABI、数値受入、全工程peak、完走時間は未成立であり、D1–D4の完了を意味しない。**

この監査では既存source・receipt・容量計算を再利用した。推論、graph生成、大容量allocation、重みdownload／payload load／全体hash、commit／pushは行っていない。作成対象は本書とJSONだけ。

## 目標と既存の失敗条件

固定目標はtarget latent `[1,16,21,60,104]`、target 32,760tokens。sourceも81framesなら全列は **`N=65,520+実referenceのpatch数`**。元workflowのsource実F・画像寸法・実stream数は未確認だが、D1でtargetを小さくする理由にはしない。

全40blockのself-attentionはQもK/Vも全Nを使う。最終出力headも全Nへ適用した後にtargetをsliceする。target-only 32,760keys、選択query／head、小Nの成功はこの受入に転用しない。Q/KのRMSNormは5120channel全体へ適用し、その後40headへ分ける。RoPEは実streamの順序・grid・source_idを保つ。

次は既存資料の拒否理由をそのまま再利用する。

| 方式 | N=65,520時の根拠 | 判定 |
| --- | ---: | --- |
| 全モデルを1本のWASM32 Memoryへ配置 | raw payload 15,574,651,928 B/model、全numeric F32 57,153,967,776 B/model | 4 GiBを超える |
| 全40headのdense scoreを常駐 | 686,859,264,000 B。1headでも17,171,481,600 B | 使用しない |
| 現E7をそのままproduction化 | Q16・1head・K上限32,760 | source81だけで範囲外 |
| 現P4を上限変更だけでproduction化 | N2/block0/contextなし。linear rows≤16、通常columns≤16、FFN-down columns≤4 | 新しい容量・所有・数値契約が必要 |

## 実環境と容量

| 観測項目 | 値 |
| --- | ---: |
| cgroup memory.max | 17,179,869,184 B =16 GiB |
| cgroup memory.current | 4,496,244,736 B |
| cpu.max | 400000/100000 = **4 CPU相当** |
| workspace空き | 153,763,840 B（約146.6 MiB） |
| /tmp空き | 7,405,850,624 B（約6.90 GiB） |

CPUは引継ぎの5ではなく現観測4相当。memory.currentは他processとfile cacheを含む一時点の値であり、推論allocatorのpeakではない。OOM関連eventは観測時0。

N=65,520のhidden F32 `[N,5120]` は1,341,849,600 B。入力・出力・K・Vの4storeは **5,367,398,400 B（4.999 GiB）**。Q全列、全FFN中間、全scoreは保存しない。hiddenは256 MiB以下のsegment、K/Vはhead別等に分割し、1.34 GBの連続ArrayBufferやWASM間pointer共有を前提にしない。

計画上のadmissionは次式とする。

```text
job直前memory.current + 81,920*N_total
  + 3 GiB（runtime・weight・copy・session重複の仮予算）
  + 1 GiB（余裕） <= memory.max
```

この観測値ではN=65,520時の計画合計は14,158,610,432 B、式上の最大Nは102,400。53×53patchの画像8frameを仮定した容量例ではN=87,992となり、この式に入る。ただし実画像8枚という主張ではなく、batch内の各frameも別streamなので実入力で再計算する。資源不足なら実requestを拒否し、source／referenceを切り捨てない。

**3 GiBは実測した上限ではない。** 最大FFN matrixは片側283,115,520 B、up/down pairは566,231,040 B。host cache、raw slice、復号F32、ORT Tensor／native copy、old/new session、Hike、browserを同時に数える必要がある。ORT Memoryはrelease後もhigh-waterを保持し得るため、個々のWASM32 Memoryを独立に制限し、実測で予算を確認する。

## 選ぶ演算順と新しい境界

1. HIGH／LOW原Fileのrangeを使う。model全体のArrayBuffer／OPFS複製は作らない。targetと各contextを別々にpatch化し、実順序でlogical rowへ連結する。
2. 各blockでK/Vを一度生成してhost storeへ置く。query128行ずつQを生成し、40headをbatchとしてkey256行ずつ走査する。最終queryは112行、keyは240行で、phantom paddingを加えない。
3. attentionはonline max／numerator／denominatorを更新する。候補はQK→scale→max→Exp→AV→更新までを1本の新しいbatched ORT graphへまとめる。Hikeは宣言したnorm／RoPE／pointwise境界を担当する。現E7のscalar AVやgraphを採用済みと扱わない。
4. query行のself Oとgated residualを別hidden出力へ書く。全self queryが終わってからK/Vを解放する。cross-attentionとFFNは行単位なので出力を置換できる。FFNは全inner13824を保持したGemmと元のGELU規則を使う。
5. 全block成功後だけhiddenをswapし、40blockを完走する。最終norm／modulation／64列headも全Nへ実行し、target列を残してunpatchifyする。samplingでは元sigma／Euler／段間表現を保ち、内部HIGH→LOWを処理する。

attention tileのQは2,621,440 B、K/Vは各5,242,880 B、scoreは5,242,880 B、online numeratorは2,621,440 B。FFN128行中間は7,077,888 B。この小ささはtile単位の論理量であり、実ORTの中間copy／allocator peakとは別。

必要な新境界は、全Nとordered stream記述、segmented row ownership、weight epoch／lease、全block/finalhead registry、production norm／RoPE／pointwise ABI、40head online graph、Worker取消／復旧である。linearのsymbolic Gemm graph自体は再利用候補だが、rows128・出力5120/13824/64・full inner5120/13824を扱うwrapperと実行証拠が必要。old fixtureのcapだけを引き上げない。LoRAは完成F32の準拠providerを使い、ここで低rank計算を実装しない。

## Disk・copy・参照の保管

保持済みHIGH／LOWは計31,149,666,432 B。1modelの15,574,833,216 Bを追加copyするだけでもworkspace／tmp双方の空きを超える。**元Fileへの直接rangeアクセスが必要条件**であり、File→OPFSの暗黙複製を行う入口は不適合。browserのFile backingとOPFS quotaは未測定で、`df`からorigin quotaを推定しない。

選んだ方式にactivation spillは必須ではない。任意checkpointの旧新hidden2本は2,683,699,200 Bで/tmp候補にできるが、atomic replacementやOPFS backingを加えて再計算する。4storeのspillをさらに二重化すると10,734,796,800 Bになり/tmpを超える。workspaceには小さいcode／evidenceだけを置く。

独立比較はchunkで全値を検査し、cutごとに解放する。40blockのhidden出力を全部残すだけで53,673,984,000 Bとなる。参照を全量RAM／diskへ累積保存する方式は選べない。通常APIの入力に参照receiptを追加しない。VAE／RGB前処理はこのcore予算外で、F32 RGB `[1,3,81,480,832]` だけでも388,177,920 Bを後の全pipeline予算へ追加する。

## 計算量と所要時間の限界

以下はN=65,520、Text L=512という**容量例のGemm計数**。原promptの実Lは未確定。multiply/addを2 FLOPとする。

| 対象 | FLOP |
| --- | ---: |
| 1blockのdense linear | 39,214,225,817,600 |
| 1blockのself-attention QK＋AV | 87,917,985,792,000 |
| 1blockのcross-attention QK＋AV | 687,026,995,200 |
| 40blockの1prediction | 5,112,769,544,192,000 |
| 6prediction | 30,676,617,265,152,000 |

prefix／最終head、norm／RoPE／GELU／Exp、復号、copy、独立比較は含めていない。attentionの計算量はtile化しても二乗のまま。query128/key256なら512×256=131,072tile対/blockであり、K/Vを各query tileで一度読むだけでも1,374,053,990,400 B/blockのhost trafficになる。実copyはさらに増える。

| 仮の持続性能（未測定） | 1prediction | 6prediction |
| --- | ---: | ---: |
| 1 GFLOP/s | 1,420.2時間 | 8,521.3時間 |
| 10 GFLOP/s | 142.0時間 | 852.1時間 |
| 50 GFLOP/s | 28.4時間 | 170.4時間 |
| 100 GFLOP/s | 14.2時間 | 85.2時間 |

これは性能の約束・実測予測ではなく、実測値を後で代入する式の例。4 CPUで50／100 GFLOP/sが出る証拠はない。

実測校正値は、既存通常LOW P4の **N2／L512／block0／contextなしが131.1821秒**。normal後・diagnostic前counterはprojection44,704、score320。prefix／self-attention／最終head／samplingを含まない。新batch方式と演算比率も異なるため、131秒をN/2倍してproduction時間とは呼ばない。既存E7のQ16・1head・K32760約1.1171秒もfixture生成／copyを含む限定値で、実モデル全QKV生成を含まない。

## 残る受入と次の実験

次は独立参照と事前固定gateを用意して、full-inner128行projectionと40head Q128/K256 attentionの実operatorを測る。weight/native copy、old/new session、Hike/ORT high-water、PSS/cgroup、取消を同時に記録する。これは幅・演算の検証であり、target完了ではない。

その後に実descriptorの全65,520+refs query／keyを1block、40blockと最終head、6更新と内部HIGH→LOW、公開API／Workerの順で完走させる必要がある。各段階で全値独立比較をchunkで行う。この監査時点ではproduction peakも総時間もnullであり、load／predict／sampleはNOT_READYを維持する。

資源問題が出た場合は失敗したoperator・shape・peak／時間と次の修正を示す。現方式が未実装であることを、WASM全体の不可能性へ言い換えない。小shape、targetだけのkey、少数head、WebGPU／server推論への置換による完了扱いはしない。
