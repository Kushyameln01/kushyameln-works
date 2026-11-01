# 実L512 P4共同検証のscope

実TextのbaseはHIGH1/LOW3とも限定数値受入済み。
[base結果](BASE-RESULT.md) と [全値集計](BASE-NUMERICAL-SUMMARY.json) に、
元入力・事前gate・独立参照・実行source・実測資源を記録した。

LoRAは新canonical source `a80db72feea60b9bd69e292e4716665c6f0ee77f` と
選択light/LOW原本を取得し、[実L512用の別計画](lora/REAL-L512-PLAN.md) に従って接続を進める。
元controlled K4・旧Q16・baseの成功を、LoRA適用後の受入へ転用しない。
LoRAの実受入・実測結果は、独立A/B参照と実native検証後に別scopeで記録する。

| scope | 状態 |
| --- | --- |
| real Text L512 + base HIGH1/LOW3固定N2/block0 | local25+composed25各31,854,592値、失敗0 |
| real Text L512 + canonical LoRA light/LOW Q4+bias4 +1 | 実行前。ownerコード・実原本取得済み、独立参照と接続runnerを作成中 |
| 本番shape・全block・実HIGH→LOW・全体資源予算 | 未受入 |
| load/predict/sample・生成 | NOT_READY、generationReady:false |

source取得ACK、owner限定数値受入、管理catalog採用、共同snapshotを別に扱う。
merge・Pages公開はこの作業で行わない。再現は [REPRODUCE.md](REPRODUCE.md) を参照する。
