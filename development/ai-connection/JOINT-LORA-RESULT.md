# E1 LoRA–Diffusion PARTIAL共同試験の準備記録

**状態: BLOCKED / NOT_RUN。初回の完了条件である実PARTIAL共同試験は未達です。**

## 使用版と原文照合

LoRA `lora-connection/2.0-draft.1`、実装 `89b489c6f2595ebff8836fe90b18fc94e3ea086b`、配布 `2bba90785292e42a0c7c8756685b0d8b128b2dcf`。Diffusion指定版 `f522d9aeff313558c4ef83022a340af9a4c21391` は原本未受領です。利用可能な旧679a72d7版はI/Oのみで、実consumer契約とは照合できません。総合仕様書1.1-draft.1と実行計画0.2-draft.1の本文は取得済みです。

## 対象と全結果

| 原本 | 選択Q重み | LoRA bias | consumer出力 | 実base比較／全出力 |
| --- | ---: | ---: | ---: | --- |
| light HIGH | 81920要素 | 16要素 | 16 | NOT_RUN／値なし |
| light LOW | 81920要素 | 16要素 | 16 | NOT_RUN／値なし |
| detail HIGH | 81920要素 | 0要素 | 16 | NOT_RUN／値なし |
| detail LOW | 81920要素 | 0要素 | 16 | NOT_RUN／値なし |

Q full shape `[5120,5120]` のrows `[0,16)`・全5120列。lightは明示Q biasのindices `[0,16)`も対象。lightの他1050 patch（全201 diffを含む）、detailの他399 patch、および選択targetの残り `[16,5120)` を除外します。coverageはPARTIAL、completeAdapter=falseです。detailのLoRA biasがないことを実consumerのbase biasがゼロ／不要という意味にはしません。

原本hash・元shape・除外範囲・予定blockの全要素offset/countは `JOINT-LORA-MATRIX.json` にあります。重みとbiasは全要素、出力は各16値を保存・比較する計画で、未実行値をゼロや合成値で埋めていません。

## 比較条件

固定loader policyは `comfy-lora-b5a4321-linear-diff-v1`。LoRA独立参照は `Wbase + strength * (alpha/rank または固定規約の1) * UP@DOWN`、light biasは `bBase + strength * diff_b` です。実FP8復号のscale粒度／数値profile、固定activation、使用非zero強度、宣言範囲の負数、事前の復号／重み／bias／16出力gateは対向原本未取得のため未確定です。無断の既定値は採用しません。base復号とLoRA加算を別に判定し、同じ実consumerの出力を独立実装へ比較します。

## 所有権・取消・復帰

LoRA v2はin-use／有効lease／復帰未完のpreparedを保持し、copyまたはlease終了後に解放します。取消はbounded Hike後の協調停止です。これは既存実装の契約確認であり、今回の実provider／consumerによる所有権・取消・復帰の結合合格ではありません。

native v2にdetach/resetはありません。実consumer側の不変base復帰口とscope付きreceiptを受領して解除・再適用を検証します。PARTIAL／runtime-inputをv1 initializer・FULL adapterへ付け替えて解除・適用を通しません。

## 残る不整合と次の実行

1. 指定Diffusion原本が未受領のため、引数・binding名・element/byte単位・structured validation・error／取消／leaseの相互適合はUNVERIFIED。
2. 実HIGH/LOW baseと復号profile／実provider／sink／consumerが未受領のため、数値比較・各16出力・copy/lease／取消／復帰はNOT_RUN。
3. base復帰口と使用強度・activation・事前gateを確定してから、light HIGH→LOW、detail HIGH→LOWを順次実行します。

この記録は準備と未取得条件の証拠であり、共同試験の完成品ではありません。全target、実model全session、生成への寄与はE9へ残します。今回製品コード・kernel・v2仕様の変更はありません。
