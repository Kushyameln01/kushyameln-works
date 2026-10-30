# LoRA–Diffusion E0 source baseline追補

2026年10月31日 JST。**E0は対向原本未受領のため未完了、E1共同数値試験は未実行です。**

## 本文を取得した仕様

- 総合接続仕様書 `1.1-draft.1`、Page `page_65b303c9bc708191a7e48c78b51c35a7`、sequence1、全198ブロック。
- 接続検証と本番実装の実行計画 `0.2-draft.1`、Page `page_cfdb3e2026608191964eb24af5c64e61`、sequence0、全133ブロック。
- Page閲覧ツールで実本文を取得しました。添付Markdownも別原本として保存し、URL確認や報告要約で本文を代用していません。

## 使用する原本

| 対象 | 完全commit／path | 取得状態 |
| --- | --- | --- |
| LoRA配布版 | `2bba90785292e42a0c7c8756685b0d8b128b2dcf` | ローカル正本取得済み |
| LoRA実装版 | `89b489c6f2595ebff8836fe90b18fc94e3ea086b` | v2実装を再利用 |
| LoRA契約 | development/lora/contracts/connection-contract-v2.json | `lora-connection/2.0-draft.1`、bytes/hashをsource-baseline.jsonへ記録 |
| 指定Diffusion | `f522d9aeff313558c4ef83022a340af9a4c21391`、docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md | GitHub commit422、document404。未受領 |
| 別に取得できた旧Diffusion | `679a72d7f53e31bccecbee46b4e2fe559a4e0aba` | 重みI/Oのみ。実provider／sink／consumerの代用不可 |
| HIGH/LOW実base／検証済みQ block | 対向providerの入力 | このworkspaceでは未取得 |

取得不能は該当commitの不存在を意味しません。GitHub connectorのraw errorとbounded Page探索結果は `evidence/lora-e0/PEER-SOURCE-RETRIEVAL.md` と `peer-retrieval.json`、LoRAファイルのbytes/hashとPage取得記録は `evidence/lora-e0/source-baseline.json` にあります。

## 再開条件

指定Diffusion sourceの取得可能なPage／archiveと完全commit/hash、実baseまたは出典付きFP8 Q bytes・scale・biasとprovider入力、DIAGNOSTIC_API/build/kernel依存を受領する必要があります。受領後に原文から引数・単位・binding・scope・precision・強度範囲・取消・copy/lease・base復帰を照合し、差分ownerを確定します。正本未受領の署名を報告から復元しません。

4原本の台帳と全体hash証拠は再利用しています。新規loadはまだ実行しておらず、実行時に必要な全体hash／header／range検査を省略する変更はしていません。既存74件は以前の合成base証拠として維持し、今回再実行・共同成功への読み替えは行っていません。
