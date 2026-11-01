# 実L512 P4共同検証のscope

実TextのbaseはHIGH1/LOW3とも限定数値受入済み。
[base結果](BASE-RESULT.md) と [全値集計](BASE-NUMERICAL-SUMMARY.json) に、
元入力・事前gate・独立参照・実行source・実測資源を記録した。

LoRAは新canonical source `a80db72feea60b9bd69e292e4716665c6f0ee77f` と
選択light/LOW原本を使い、[実L512用の別計画](lora/REAL-L512-PLAN.md) に従って接続した。
元controlled K4・旧Q16・baseの成功を、LoRA適用後の受入へ転用しない。
LoRAの実受入・実測結果は [LORA-RESULT.md](LORA-RESULT.md) に別scopeで記録した。

| scope | 状態 |
| --- | --- |
| real Text L512 + base HIGH1/LOW3固定N2/block0 | 各sideでlocal25+composed25計31,854,592値、失敗0 |
| real Text L512 + canonical LoRA light/LOW Q4+bias4 +1 | A weight20,480＋bias4、B local25+composed25計31,854,592値、失敗0。commit1/rollback2・bytes/解放確認 |
| 本番shape・全block・実HIGH→LOW・全体資源予算 | 未受入 |
| load/predict/sample・生成 | NOT_READY、generationReady:false |

source取得ACK、owner限定数値受入、管理catalog採用、共同snapshotを別に扱う。
merge・Pages公開はこの作業で行わない。再現は [REPRODUCE.md](REPRODUCE.md) を参照する。

実行sourceはbase参照 `741f1abe675eda328c7e65bb4e5903885be9ac22`、base native/local
`994ebb9ce01c9e95db9cd18eb877a981152693c5`、LoRA参照/native/local
`db5df292b21366ec385d92bb281b5f3ee74183c4`。配布commitは証拠/文書を含む後続commitであり、
この3sourceへ数値runを付け替えない。全path/bytes/SHAは [FILES.json](FILES.json)、
scopeと検証は [verification.json](verification.json)、相手への返却は [DELIVERY.json](DELIVERY.json)。
