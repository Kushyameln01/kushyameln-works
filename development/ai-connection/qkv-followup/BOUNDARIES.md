# 本番shapeへ進むために残る境界

現在の数値受入は自然N2・F32診断・block0のO projection前までである。元workflowの81frame、480×832、latent `[1,16,21,60,104]` をN2へ置換して合格と扱わない。`load/predict/sample=NOT_READY` を維持する。

| 次の境界 | 入場に必要なもの | 現在の判定 |
| --- | --- | --- |
| 本番gridの実post-modulation hidden | 実入力latent/noise/contextのbytes/hash、side/block/timestep、元patch/time/modulation source、独立参照と事前gate | 元81frameの実latent/context/noiseは既存受領資料で未取得。依存する数値受入は保留 |
| 本番座標とhidden row | target latentからpatch `(1,2,2)`、grid `[21,30,52]`、row `((t*30)+h)*52+w` の対応。contextは個別shape/順序/source IDを保持 | N2座標を元gridへ付け替える方法は不可。新producer receiptが必要 |
| 実QKV→全keyの選択query | 全5120 norm後にhead抽出、元source ID/RoPE、全declared Kとtail、local実hidden参照とcomposed独立参照 | N2と旧precomputed-K32760のPASSを合成して受け入れない。K2専用hostは新境界の実装・検証が必要 |
| 全query/head | 対象N・query tile・key tile・head数・全末尾shape、実QKV生成、全出力参照、必要な保持/再計算・loop順 | 32760/65520の数値実行は未受入。N2の全2query/40headと区別 |
| 重みstaging/copyを含む本番同時保持 | ORT/Hike/hostの実live範囲、producer/consumer寿命、旧新session、weight/hidden/KV/score/出力、copy/time | 新N2観測と既存3H容量を足すだけでは本番予算合格にならない |
| O/残差/cross/FFN・全block | 実graph全境界と各精度/出力、FFN13824のgraph/staging、全体資源条件 | FFN inner13824は現dynamicLinear inner<=5120の外。row4案は実装済みではない |
| predict/sample | 必須全境界、Text/context契約、元Euler/simple6steps/shift5/split3、HIGH→LOW実受渡し、生成sampleの復元/decode契約 | NOT_READY |

N32760の既存Q16/K64全40head計画は41,943,040 ORT score呼出し/block、最低KV source交通量2,748,107,980,800B/blockである。これは固定したloopの算術であり実測速度ではない。1headだけKVを保持する案は全5120 normの再計算を要し、別loop順の低交通量と同時成立させない。旧新別hidden/KVの6Hと、不変元hidden共有が成立した場合の5Hは別案として保持する。

今回のobserverは実WebAssembly.Memoryの容量/増加を観測する。ORTの複数sessionが同じMemoryを共有する場合は一度だけ数える。ORT allocatorのlive bytes、JS/GC/File、コンパイル一時量、OS PSS、WASM入力snapshot等は別指標であり、未観測値を0にしない。観測容量が解放直後に減らないことからsession解放失敗と即断せず、native解放の成否とbrowsercloseを別に記録する。

元inputの受領、対向ownerの必要profile、管理採用を待たず実施できる数値owner内の検証は継続する。新しい入力・precision・scheduleを黙って本番仕様へ採用しない。source出典は既存 [SOURCE-CONTRACT.md](../qkv-next/hidden-core/SOURCE-CONTRACT.md) と [phase-plans.json](../qkv-next/expansion/phase-plans.json) に固定する。
