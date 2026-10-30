# A0 source baseline

版: `ai-connection-a0/1`。確認日: 2026-10-31 JST。対象は A0/M1/M2 の共通データ規格と静的接続判断。モデル推論、M3 runtime adapter、M4 queue、M5 package、merge、公開は今回の完了判定に含めない。

## 今回取得した文書

旧1.0版の読了報告を流用せず、今回添付の実ファイルを取得し、A0と担当境界、規格、判定、未決の該当本文を確認した。

| 文書 | 本文版 | 実bytes | SHA-256 |
| --- | --- | ---: | --- |
| Kushyameln Works AI推論モジュール 実装計画 Draft.md | 0.1-draft.1 / 2026-10-31 JST | 41533 | `770d1cdc26c07548cbe12b33cba93d3f22ab3b565ff58b0ba978f3983ff9c64d` |
| Kushyameln Works AI推論モジュール 総合接続仕様書 Draft.md | 1.1-draft.1 / 2026-10-31 JST | 70278 | `0744a98219c6ddab4880773029e6318de3e770c8e14e1bb2edbb1bf25c1c3944` |

文書中の「今回の成果は文書保存」という過去の範囲記述は、今回のユーザーによる A0/M1/M2 実装依頼に置き換わる。参照先の旧担当報告を、今回の本文読了・契約採用・実行検証へ昇格させない。

## checkoutと公開正本を分離する

- 作業開始 checkout: `a33b311e45a75a6c683242286fef608c7b3770a9` / branch `work`。初期状態はclean。
- ローカルの古い `origin/main`: `6026eae`。これは現在の公開mainの根拠に使わない。
- GitHub connectorで今回再取得した `main`: **`029ce9336a61e53bc6172fa4a7b7189b15f2efa0`**。mainのcommit parentに作業基点a33b311が含まれる。
- PR #1: open / Draft / merged=false。head branch `codex/inference-connection-contract`、**`6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095`**、baseは上記main。main/公開Pagesへの反映とは扱わない。
- G1C元成果: **`502b243d092b84979b10b1624df60612047d640a`**。PR本文が示すarchive 18,944,759 bytes / SHA-256 `d3638a5836d85a24c1e7ab39fce2a690ba85c6f119de16633ffcd28ccb8441b3` はPR上の報告値。この作業でarchive全bytesは未回収・未再照合。
- Diffusion local `9023329`（以前 `6f023a1`）: 今回GitHub commit GETも422 `No commit found for SHA: 9023329`。完全commit/source未取得。存在しないと断定せず、当該次期契約に依存するedgeだけUNVERIFIEDとする。

取得経路はGitHub connector GET。shell `git fetch` は `proxy:8080` 接続不可で失敗したため、許可済みのconnectorで正本本文を取得した。connectorでの本文取得とgit object/checkoutの取得は別であり、remote native sourceをこのcheckoutへ混入させていない。

## 正本・native版・build・profile

repositoryは全行 `https://github.com/Kushyameln01/kushyameln-works`。

| ID / owner | 完全commit / source | native API | buildとschema/profile | 今回の確認状態 |
| --- | --- | --- | --- | --- |
| G1 TextEncoder / Text担当 | main `029ce9336a61e53bc6172fa4a7b7189b15f2efa0` / `docs/shared/inference/API.md`, `client.mjs` | `works-ai-1`; text_encoder | client `works-inference-v1`; Text bundle `wan-umt5-staged-fp32` schemaVersion1、BLC; ORT Web1.24.3 WASM | API/client実本文取得。既存実モデル受入は文書記録、今回未再実行 |
| G1 VAE / VAE担当 | 同main / 同API/client | `works-ai-1`; vae | `works-inference-v1`; `wan21-vae-profile-v1` schemaVersion1; 受入記録 `wan21-raw-f32-5x16x16`、RGB `[1,3,5,16,16]` ⇔ mean `[1,16,2,2,2]` | 旧mean経路。generated-sample追加とは分離 |
| G1C Text/VAE / 各担当 | PR head `6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095` / `API.md`, `tensor.mjs`, `client.mjs`, `development/inference/connection/{PROFILES,RESULT}.md` | `works-ai-1`維持、文書revision `connection-1` | `works-inference-v1`; `.wktensor` magic `WKTSR001` / schemaVersion1; context/latentContract schemaVersion1; generated-sample native meaning `wan21-raw-generated-sample:v1` | API/codec/profile/RESULT/client実本文取得。consumer宣言・小fixtureと実生成decodeは別 |
| G2 Diffusion / Diffusion担当 | main `029ce9336a61e53bc6172fa4a7b7189b15f2efa0` / `docs/shared/diffusion-models/API.md`, `api/build-info.mjs`, `lora/API.md` | `diffusion-models/0.1` | `diffusion-models/0.1+33d7c5c3f3865fb6cf68b85358e04d1d0f558ca362531cc14902667fcc0c850b`; pointwise上限1048576要素; mean固定128要素; scheduler `bernini-comfy-simple6-shift5-v1` | API/receipt/I/O契約実本文取得。load/predict/sample NOT_READY、loraApplied=false |
| G1C内Diffusion receipt / Diffusion+共有codec担当 | PR head `6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095` / `api/build-info.mjs`, `tools/diffusion-models/{build-info,test-build-info}.py` | `diffusion-models/0.1`維持 | `diffusion-models/0.1+114a2aa225f627286ee3e61c4d0a14d019fb990d8e112c7c61479b1c7574e70d`; 34 source receipt | 実本文取得。main buildとの付替え禁止。共有codec/後発source/replacement generatorを含む別閉包 |
| G3 LoRA / LoRA担当 | main `029ce9336a61e53bc6172fa4a7b7189b15f2efa0` / `docs/shared/inference/lora/{README.md,sdk.mjs,kernel/registry.mjs}` | SDK `apiVersion:1` direct JS | SDK buildはkernel SHA `da6d56fca5d9bc91173681c22b91cd9337f53ea067d84455b9d659ee7ee52984`; ABI `lora-block-f32-v1`; Hike `3c51fde6675f317453919bd505d0e2d0f638e7f1` / wabt-normal; F32 row-major Linear/additive target | README/SDK/registry取得。新binding/partial/structured validation契約は別の未確定案 |
| R3 Diffusion次期 / Diffusion担当 | local `9023329`、完全commit未取得 | 報告 `0.2-draft.1` | build/schema/consumer/core式未取得 | 報告のみ。source_id/concat/RoPE/padding/handoff詳細を推測しない |

共通規格 `works-module-contract/1.0-draft.1`、保存案 `works-artifact-package/1.0-draft.1` は上記native版・build・文書版とは独立。共通descriptorをnative内部へ追加せず、外側のadapter記述で関連付ける。

## 今回取得した固定blob

| ref | path | Git blob SHA |
| --- | --- | --- |
| G1 | `docs/shared/inference/API.md` | `a08c7b4d8471f133a9c5cfb00d8e12fbd3ca332f` |
| G1/G1C | `docs/shared/inference/client.mjs` | `2ac5b8fcf98074bfbf1fa3373d8bb2002b169e35` |
| G1C | `docs/shared/inference/API.md` | `d21ce884205d7ad0d2c87f6c971874619b775d97` |
| G1C | `docs/shared/inference/tensor.mjs` | `3e92c3cb350774a86534be42a9b68f8459fe58c7` |
| G1C | `development/inference/connection/PROFILES.md` | `22700f63fa6254004f95f0ffdfdb3effd965ced5` |
| G1C | `development/inference/connection/RESULT.md` | `28d2635ef8a2f362e9a49b6bffbd884252073062` |
| G1C | `tools/inference/README.md` | `e56559bf58585f06d3fff39e8546968928b74f50` |
| G1C | `tools/inference/test-connection-contract.mjs` | `703b72e4f133b12b6ff086bf91c3c91e5a7ff75a` |
| G1C | `tools/diffusion-models/build-info.py` | `8c784e07bc339d83d006516e1d14d3e7e9480605` |
| G1C | `tools/diffusion-models/test-build-info.py` | `9f0e28669baecbb56c36fb2d783dee7db8916fc1` |
| G1C | `docs/shared/diffusion-models/api/build-info.mjs` | `5d122dd672c1f7bef12a29b7ea26c0b717606e9b` |
| G2 | `docs/shared/diffusion-models/API.md` | `82214205071735d96ff7ef8e4cc06e6891c01b6b` |
| G2 | `docs/shared/diffusion-models/api/build-info.mjs` | `8b2b8b7a615eef3d143429ca1fb23310873417b5` |
| G2 | `docs/shared/diffusion-models/lora/API.md` | `8d0a123a66f11a75761e2611ee4e65e8e65a34dd` |
| G3 | `docs/shared/inference/lora/README.md` | `77686e96d102fbb697e7207865bcd7df0ca5eae9` |
| G3 | `docs/shared/inference/lora/sdk.mjs` | `275d685a2ee585ecfa2a92561b7d5ef44eec5d7e` |
| G3 | `docs/shared/inference/lora/kernel/registry.mjs` | `b926785804d23b276b7e5b47c36616f8b56cfe21` |

blob SHAはGitの内容識別であり、SHA-256やruntime受入の証明ではない。

## 配置衝突と再現CLI

local HEADのtreeと、今回取得したmain tree `56389518bd98471ce28601bec3d070292708f35e`（1194 entries）およびG1C tree（1212 entries）のrecursive一覧を照合した。remote応答は双方 `truncated:false`。`docs/shared/ai-connection/`、`tools/ai-connection/`、`development/ai-connection/` に既存衝突なし。既存実装の移動はしない。

| 正本 | repo rootでのコマンド | 今回の扱い |
| --- | --- | --- |
| G1C | `node --test tools/inference/test-connection-contract.mjs` | test source取得。12件は既存報告、今回は未再実行 |
| G1C | `python tools/diffusion-models/build-info.py --check` | argparseの読取り専用checkを本文確認。34source閉包が揃うG1C checkoutでのみ再現する |
| G1C | `python -m unittest discover -s tools/diffusion-models -p 'test-build-info.py'` | test source取得。6検査の既存報告と今回は分離 |
| G1C | `python tools/diffusion-models/build-info.py` | receipt生成。既存native sourceを変えない今回は実行しない |
| G3 | `node --test --test-isolation=none tools/lora/test-*.mjs` | READMEに記載。完全source/対応Nodeでの再現条件、今回は未実行 |
| G3 | `node tools/lora/test-panel.cjs` / `node tools/lora/kernel/browser-check.cjs` / `python tools/lora/check-real-kernel.py` | 既存ブラウザ・小kernel検証。real consumer/全model検証ではない |

G2 APIが記す `python api/build-info.py` は公開main treeにbuilder実体がない。mainの `tools/diffusion-models/build-info.py` GETも404。古いCLI・旧環境絶対パスをそのまま実行条件にしない。取得済みG1Cのreplacement builderは欠落した元builderの回収ではなく、別source閉包として扱う。

## 報告・合意・実測を分離する

- G1C RESULTは旧 **52/53**、旧build `diffusion-models/0.1+164b7cb4b575e60388e7ce66db27cfbaea7057cf3cc46a5362e6f47ed601b3ae` を記録している。今回取得したPR本文の最新報告は **53/53** と34source build。上書きせず履歴を分ける。
- 接続fixture12件、LoRA source7件・SDK32件、Python53件は対象scopeが違い、全生成の合格件数へ合算しない。LoRA7/32は今回添付仕様のR2引用であり、元の独立報告/配布JSONは未取得。
- 今回の本文取得・静的照合は管理側による確認。各所有者の1.1読了、新schema採用、G1C受領、共同検証への合意は未確認。外部メッセージ送信は行わない。
- N1 ComfyUI-BerniniStudio、P1 Hike計画1.3、R1/R2/R3原報告は今回2添付には同梱されていない。引用された範囲を越える判断に使わない。
