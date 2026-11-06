# 固定成果受け渡し・新受取契約の照合

2026-11-02 JST。今回の対象は、既存manifest・receiptを使う固定source取得確認と契約差分の返却。推論・export・LoRA原本load・原本全体hash・新canonical mapping実装・新P4共同数値試験は行わない。

## 固定した版

- 返却するLoRA成果：dd95ed05f058930a391f015c11b9a2b963a42db5。実行source28f44c3a1b71bef59e2d018a0db736de6d84675c、使用管理60d16b64d6020d3d20239f087f8add91268dcaad、旧Q16 PARTIAL。
- 受領する管理実装：8849891f19124df31847bd691503c2491278eaa8。管理の現在配布f34bf10a67c91f462ab46dec033eaeb2110facf1の証拠追補と、884のruntime/APIを区別する。
- 受領するDiffusion成果：7ee36228030ba3bb544a90b1d4b528702a7bae32。対向が記録した最終実行5744f700e17b23d5c18d32315fb6dfbd7c49089a、base実行829467c14ec6fd1ab1858dfc175c84605de1ac98は対向の既存証拠であり、今回のLoRA実行ではない。

## 作業と記録

1. dd95のAPI、完全receipt、manifest、consumer対応表を完全commit/path・bytes・SHA-256付きで返す。既存source・実数値scope・新しい取得確認を分ける。
2. 管理884 P3 runnerと返却条件を原文で取得し、既存6caseで満たす条件、異なる負例、E4保存・実読戻し等の追加未受入を列挙する。60d実行記録を884へ付け替えない。
3. Diffusion新P4 WEIGHT-FEED、registry/provider/sink/consumerを原文で取得する。旧Q16から接続できる概念・追加mapping・未検証を分け、508の旧tailと新P4を混同しない。
4. 管理・Diffusionへ固定成果と各自の取得確認をコメントで返し、読戻しを確認する。今回の送付とsource取得ACK、相手がLoRA新packetを取得したACK、P4共同数値試験を別に記録する。

## 維持する未受入

新P4向けLoRA canonical mappingと、実LoRA適用済みP4 weightは現時点で未成立。Diffusion側の最終F32 feed実証を、LoRA low-rank計算・base適合・全target適用・管理採用の合格へ転用しない。旧Q16選択のPARTIALと原本hash・両registry・source pinは維持する。merge・Pages公開は実施しない。
