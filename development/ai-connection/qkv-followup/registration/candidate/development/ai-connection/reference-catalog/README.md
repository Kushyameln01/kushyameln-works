版1.0-draft.1／2026年10月31日 JST。Profile総合管理台帳。状態：文書化した参照台帳。製品runtimeへの組込みは未実施。

# 用途と参照順

管理は「管理照合規範」を入口に判断し、必要なProfileの宣言とownerの検証receiptを照合する。「数値規則」は数値ownerと規範策定者が参照し、規範を決める際の根拠に使う。管理にモデル計算や数値mappingを重複実装させない。

| 文書 | 役割 | 機械参照ファイル |
| --- | --- | --- |
| shape Profile | shape全軸・dtype・layout・意味と入出力範囲 | shape.v1.json |
| 数値実行 Profile | kernel/精度/復号/限定実行と受入scope | numeric-execution.v1.json |
| 正規化 Profile | raw/normalizedと明示変換の対応 | normalization.v1.json |
| loader規約 Profile | ファイル解釈・対応variant・読み込み条件 | loader-policy.v1.json |
| 管理照合規範 | 管理が判定に使う事前定義条件 | norms.v1.json |
| 数値規則と規範決定根拠 | 式・定数・演算順・gateの根拠 | numerical-rules.v1.json |

総合管理用ファイルは `catalog.v1.json`。各ファイルの版・SHA-256、採用組合せ、mapping責任を束ねる。JSONはバージョン管理された参照データの正本、Pageは同版の説明と入口とする。将来管理へ導入する際はcatalog版と実読込bytesを固定する。文書を作成しただけでruntime導入や全担当の採用完了とは扱わない。

# ID・契約・正本

各recordId、normId、ruleIdはこの台帳の新設参照ID。nativeProfileIdと区別し、未定義のnative IDはnullとする。正規化recordのnativeProfileIdは受理shapeのnative profileIdを示し、数値正規化規約はnormalizationRuleIdで別に特定する。native API、descriptor、payloadへ台帳フィールドを強制追加しない。管理adapterのsidecarから元宣言へ対応付ける。

共通契約 `works-module-contract/1.0-draft.1` とartifact package `works-artifact-package/1.0-draft.1` はモジュール間の宣言と保存を扱う。nativeの `works-ai-1`、`diffusion-models/0.1`、`lora-connection/2.0-draft.1` は各ownerが独立して維持する。cache `works-artifact-cache/1.0-draft.1` とnative hash、bundle、snapshotの識別を混同しない。

# mapping ownerと実行経路

| 対応する対象 | 正本owner | 現行の入口と禁止事項 |
| --- | --- | --- |
| LoRA full-shape→診断slice、SDK/native registry、sink/consumer取引 | LoRA | createDiffusionDiagnosticAdapter、lora-diffusion-diagnostic-adapter/0.1 |
| native registry/provider/sink/consumer、FP8復号と実feed | Diffusion | native契約を維持。LoRA低rank計算を再実装しない |
| request/revision/resource generation、queue・snapshot・package | 管理 | createAdoptedLoraAdapter、works-adopted-lora/0.1-draft.1。owner adapterを注入 |
| mean/RGB/Textの意味・変換 | VAE/Textと該当Diffusion owner | 数値規則と正規化Profileに従う |

旧 `createDiagnosticLoraBridge`（works-lora-diagnostic-bridge/0.1-draft.1）は固定sourceの回帰検証用に区別する。同じ実行経路へ旧bridgeとLoRA正本adapterを積み重ねず、同じ対応を二重に計算しない。回帰経路の成功を現行採用経路の受入へ移さない。「一つのowner」は対応関係ごとの正本を意味し、全モジュールの変換を一か所の管理実装へ集約する意味ではない。

# 固定sourceと採用組合せ

| 区分 | 固定版 | 現在確認されたscope |
| --- | --- | --- |
| 管理採用コード | 管理28596717182e48aeb23c719c51b6e593edf4e496 | 209件、実Chromiumの入力/状態/保存/取消。baseは明示fixture |
| 管理が採用したLoRA/Diffusion | LoRA 0c27874908638afc748ea2455a2779a16736730b / Diffusion 438972f30242e0a3bc66edb8591f38eaa0fcd384 | owner adapterの採用、既存20ケース320出力の証拠照合。管理経由で実base20ケースを新規実行したという意味ではない |
| 管理のcodec | 2c171a09ccda65c54899f322ae490f1bfcaac6fb | capture/保存契約の固定source。runtime読込み実体は別途検証 |
| 最新LoRA報告source | fc2789a0f649e33f15eb13750e6a983b5c52d170 | 実原本×実base PARTIAL20、mean→LoRA→mean共同検証。全session受入ではない |
| 最新Diffusion報告source | 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 | 実base＋合成LoRA、3mean profile、限定attention等。load/predict/sampleはNOT_READY |
| 最新VAE/Text報告source | 855f435120f08eb9e818e51281fc26f0e2633829 | 矩形mean/RGBとcapture/queue/package保存読戻し。実generated-sample/管理全工程は未受入 |

「各担当の最新版」はそのまま「管理が採用・共同検証済みの同一組合せ」にはならない。新しい組合せはsource/build/証拠を固定した別entryとして登録する。

採用LoRA数値kernelは5051 bytes、SHA-256 `3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24`。API版が等しくても旧4919 bytesのkernelと同一と見なさない。

# 拡張と登録手順

1. ownerが新profileの意味、native IDまたは未定義、shape/dtype/layout、数値規則、loaderと必要featureを宣言する。
2. 接続先は公開契約と必要なadapterを確認する。数値ownerがreference・事前gate・scopeを固定し、証拠を提示する。
3. 新しいrecordと規範を追加し、既存recordの意味を後付けで広げない。catalogを改版し、採用組合せと依存edgeの適合を個別に記録する。
4. 管理runtimeへの導入と実接続受入は別作業として検証する。任意metadataは保持し、未知の必須条件は当該edgeをUNVERIFIEDにする。

HIGH/LOW、light/detail各一組ずつという現製品の選択構成は参照パイプライン条件である。各独立moduleの普遍必須条件や既定strengthへしない。LoRAにmean入出力APIを追加しない。

# 現在の未受入範囲

E5全session、本番Diffusion、全target/本物の生成sample、81frame条件の全工程、実資源予算と本番生成の受付は未受入として保持する。診断のPARTIALやFULL、schema検査、保存読戻しの成功だけでgenerationReadyへ昇格しない。追加のWan/LTX資料は現profileの非対応/未確認入力の例であり、新しい対応model profileとして登録しない。

本版の文書/JSON整合検証結果は `EVALUATION.md`。推論の再実行や管理判定器の動作試験は行っていない。

# 文書の参照先

- [Kushyameln Works shape Profile](https://chatgpt.com/space/page_5dc3d850cb0c8191b391da4056356c9e)
- [Kushyameln Works 数値実行 Profile](https://chatgpt.com/space/page_4d06d4d157988191a227a5fcd9e2e1bb)
- [Kushyameln Works 正規化 Profile](https://chatgpt.com/space/page_7c42180e8e888191ac93c1d344169a3a)
- [Kushyameln Works loader規約 Profile](https://chatgpt.com/space/page_2059d904c47881919d1f1192a4550274)
- [Kushyameln Works 管理照合規範](https://chatgpt.com/space/page_7972cb392a3481918a1ceb0b7501bb76)
- [Kushyameln Works 数値規則と規範決定根拠](https://chatgpt.com/space/page_ecfe5b714e008191a7779e5cd2bad42c)
