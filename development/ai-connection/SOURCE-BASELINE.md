# LoRA–Diffusion E0 source baseline

2026年10月31日 JST更新。**対向原本未取得によるE0の阻害は解消しました。** 指定原本f522と、実共同試験に採用したDiffusion438を別々に取得しています。LoRAの版付きadapterと実SDK/Hikeを実consumerへ接続し、HIGH/LOWのlight/detail計20caseでPARTIAL診断が成功しました。全体の受入状態は[共同試験結果](JOINT-LORA-RESULT.md)で追跡します。

## 本文を取得した仕様

| 正本 | 取得版 | Page sequence / 全block数 | 本文SHA-256 |
| --- | --- | --- | --- |
| [総合接続仕様書](https://chatgpt.com/space/page_65b303c9bc708191a7e48c78b51c35a7) | `1.1-draft.1` | 1 / 198 | `c5fc7291ee321e49214189ebc4ab4f34a583b23a6699fc3329b21aea268a1e83` |
| [接続実行計画](https://chatgpt.com/space/page_cfdb3e2026608191964eb24af5c64e61) | `0.2-draft.2` | 2 / 134 | `cdcc22e07587a206dc94ca8c67bc9d8f7547ed8e76aa906352f054a20e3362b3` |

本文hashはcanonical Page blockをLF LFで連結したUTF-8、Page titleは追加しない形式です。実行計画0.2-draft.2はGitHub push、Draft PR、固定commit、受領側の実コード取得を分けて記録します。旧0.2-draft.1のmetadataは初回取得記録として残しています。

## 採用sourceと取得証拠

| 対象 | 完全commit / 固定source | 現在の扱い |
| --- | --- | --- |
| LoRA v2基点 | [配布2bba907](https://github.com/Kushyameln01/kushyameln-works/commit/2bba90785292e42a0c7c8756685b0d8b128b2dcf)、実装 `89b489c6f2595ebff8836fe90b18fc94e3ea086b` | 既存loader/planner/SDKを再利用 |
| HIGH試験の実runtime | [4d5fd736](https://github.com/Kushyameln01/kushyameln-works/commit/4d5fd7363f40f0d743ead448193ef2bf1915bbdc) | [版付き接続adapter](https://github.com/Kushyameln01/kushyameln-works/blob/4d5fd7363f40f0d743ead448193ef2bf1915bbdc/docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs)、実SDK/Hikeを固定。後続LOW runnerのcommitと混同しない |
| 指定Diffusion原本 | [f522d9ae](https://github.com/Kushyameln01/kushyameln-works/commit/f522d9aeff313558c4ef83022a340af9a4c21391)、[Draft PR #8](https://github.com/Kushyameln01/kushyameln-works/pull/8) | exact Git sourceを受領。以前のcommit422/document404は解消 |
| 実共同試験のDiffusion | [438972f3](https://github.com/Kushyameln01/kushyameln-works/commit/438972f30242e0a3bc66edb8591f38eaa0fcd384)、[Draft PR #6](https://github.com/Kushyameln01/kushyameln-works/pull/6) | branch `codex/diffusion-e0-e7`、この版の実provider/sink/consumer/ORT/Hikeを使用 |
| 旧重みI/O版 | `679a72d7f53e31bccecbee46b4e2fe559a4e0aba` | 初回に取得できた歴史的source。共同consumerへ代用していない |

438のnative buildは `diffusion-models/0.1+f7f23c2291886de637cb06ae001fc748d29232f7c8919683467da5eef6cfb80e`。f522のbuildは `diffusion-models/0.1+17ecb7d0645bc4ac28ef459cfb1a4d594e58398b6db73d5d42ac072bc1b5df70` で、別identityとして保持します。base/provider・consumer・diagnostic identityの3実装は両commitでbyte同一です。DIAGNOSTIC_API.mdは後続版の64要素mean ABI追補だけが異なり、Q16×5120の接続契約は同じです。

[現在のsource manifest](evidence/lora-e0/current-peer-source-manifest.json)に、438の実行依存16fileと契約・build情報2file、HIGHで使用したLoRA側12fileの完全commit、Git blob、bytes、SHA-256、固定GitHub URLを記録しました。HIGH試験receiptのsource hashとGit objectを照合しています。adapterのSHA-256は `bcea7b495e819d1e1052543f36cbdad0ed8515e74bd8914cf66dc03b093c6e4f`、同試験LoRA WASMは `3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24` です。旧配布時のkernelとは別artifactとして保持します。

## 実baseの証拠とscope

HIGHは元File15,574,833,216 bytesを取得し、全byteのcoverageと全体SHA-256 `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52` を検証した外側receiptに結び付けています。試験前後のFile同一性も記録しています。出典は固定[Comfy-Org/Bernini-R@f7fd9812](https://huggingface.co/Comfy-Org/Bernini-R/resolve/f7fd9812e54095d0c511d5e7429e6d8f6acc381a/diffusion_models/wan2.2_bernini_r_high_noise_fp8_scaled.safetensors)です。

Diffusion nativeの `baseVerification.fullFileSHA256Verified:false` はそのまま保持します。native provider自身の検査はheader/file size/config/scale/rangeであり、外側の全体hash receiptと別の証拠です。実baseとLoRAの新規load/hash要件を、宣言値や旧inventoryの文字列で代用しません。

接続範囲はQの元full shape `[5120,5120]` から16行・全5120列、および対応するbias16値です。HIGH-fixedの10caseはstrength0/1/−1、再適用、取消後の回復をlight/detailそれぞれに含みます。これは `coverage:PARTIAL`、`completeAdapter:false`、`modelInference:false`、`generationReady:false` の共同診断です。最終結果・LOWの進捗・再現CLIはroot担当の[共同試験結果](JOINT-LORA-RESULT.md)を参照します。


LOW実行sourceは `e1f03a4f6092c3154d5b47f166b77bbd32897ac9`。LOW原本15,574,833,216 bytesの全体SHA `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` と試験前後の同一性も確認済みです。HIGH/LOWの全実行source recordsと結果は `evidence/lora-e1/HIGH-result.json`、`LOW-result.json` に保存しています。

## 初回取得の履歴

以下と `evidence/lora-e0/source-baseline.json`、`peer-retrieval.json`、`PEER-SOURCE-RETRIEVAL.md` は、原本がGitHubから取得可能になる前の記録です。当時の失敗を保存したもので、現在の阻害条件として読みません。

<details>
<summary>2026年10月31日 JST 初回E0取得記録（更新前の原文）</summary>

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

</details>
