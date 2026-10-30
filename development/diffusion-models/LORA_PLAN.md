# LoRA接続口の設計・実装計画

2026-10-31 JST。依頼:「LoRA重みを読み込む接続口が必要です。設計し、実装してください。」

## 目的と範囲

公開済みDiffusionModelsの同一ページJS/明示MessagePort APIへ、ローカルsafetensors LoRAの検査、HIGH/LOW別の登録、保存dtypeの重みbytesの範囲読出し、登録一覧、解除を追加する。実際のpayloadを読める接続口を完成させる。モデル全体の推論は実行せず、未実装のLoRA加算を適用済みと表示しない。既存Hike/ORT数値処理とText Encoder/VAEを変更しない。

根拠は添付計画v1.1のLoRA依存棚卸し・共通データ契約・保持上限・取消/Worker再生成、および元workflowのHIGH LoRA強度3/LOW強度1。実LoRAファイルは未提供。以下の形式対応は固定ComfyUI sourceと元Berniniヘッダーに基づく。実ファイルとの互換確認とは区別する。

## 採用する構成

全量resident方式は大きなLoRAの重複保持を増やす。Workerだけで保持する方式は既存の取消/新revisionで登録が消える。本実装ではhostが最大HIGH/LOW各1件のimmutable File/Blob参照と登録metadataを所有し、Workerが検査・分割hash・指定範囲読出しを行う。失敗/取消された置換は旧登録を維持する。登録成功後にのみ不透明bindingIdを発行し、成功した置換・解除後は旧idを拒否する。disposeは両登録を解除する。

`loadLora`は1MiB以下ずつ全ファイルSHA-256を計算する。全ファイルのarrayBufferや全重み展開を行わない。任意のexpectedFileSHA256を指定した場合は一致を必須とする。payloadの有限性は読出した範囲で検査し、全量数値検証済みとは称さない。

`readLora`は1回4MiB以下、elementOffset/countを明示した連続範囲だけを読み、所有Uint8Array・保存dtype(F16/BF16/F32)・little endian・全tensor shape・範囲・range SHA・元tensor名を返す。dtypeの変換・LoRAの行列積・baseへの加算は行わない。Hikeが担当する算術をJSへ移す変更はない。

## ファイル契約

- JSON重複キー、深過ぎるJSON、descriptorの不正shape/byte長/offset/隙間/重複を拒否。ヘッダー上限8MiB。
- 対応は通常の2D linear LoRA、および元のshapeを保つ加算差分 `.diff` / `.diff_b`。DOWN/A=[rank,in]、UP/B=[out,rank]を、保存済みBerniniの406件の2D weightのkey/shapeと一致させる。差分は保存済みweight/bias等の完全なtarget key/shapeを照合し、読み出すだけでConv等の適用算術を提供しない。
- 固定ComfyUIが生成する `diffusion_model.<native module>`、`lora_unet_<native module with dots replaced by underscores>` の完全対応表を使う。任意のDiffusersキーの推測変換をしない。
- suffixは `.lora_down.weight`/`.lora_up.weight` または `.lora_A.weight`/`.lora_B.weight`。混在dialect/別aliasから同一targetへ重複する組合せは拒否する。
- `.alpha` は有限の単一F16/BF16/F32 scalar。欠落時の倍率は1、存在時はalpha/rank。0や負の有限値を欠落として扱わない。metadata/filenameからalphaやdtypeを補わない。
- 不完全pair、不明target、DoRA/LoHa/LoKr/mid/非2D factor等の対象外tensorを黙って無視しない。`.diff_b` と通常の未対応LoRA bias学習は区別する。同じweightへのpairとdiffの競合は拒否する。
- HIGH/LOWと既知baseModelSha256を照合する。このbindingは呼出し側が宣言した接続先であり、LoRAの学習元が一致したという証明ではない。

## API（既存protocol 0.1へ追加）

| op | input | 結果 |
| --- | --- | --- |
| inspectLora | `{file}` | pair/target/rank/alpha/shape、header hash。full hashは未計算 |
| loadLora | `{file,stage:'HIGH'または'LOW',strength,baseModelSha256,expectedFileSHA256?}` | 全file hash、file-backed登録、bindingId、applied:false |
| listLoras | `{}` | 所有するHIGH/LOWの登録metadataの独立snapshot |
| readLora | `{bindingId,stage,tensorName,elementOffset,elementCount}` | 上限付きの保存bytesと出所・範囲・hash |
| readLoraSource | `{bindingId,stage,byteOffset,byteLength}` | 登録原本の任意の4MiB以下のbytes。既存SDKのsource契約用 |
| unloadLora | `{bindingId,stage}` | 一致する登録だけ解除 |

strengthは明示した有限number（0/負も可）。既存のbuild/session/job/revision/op照合、BUSY、新revisionの旧実行取消を維持する。登録metadataとFile参照をcaller変更・偽の内部descriptorから保護する。`capabilities`はweight IOと未実装の適用を区別する。load/predict/sampleはNOT_READYを維持する。

## 実装単位と検証

1. `lora/weights.mjs`・`targets.mjs`・`strict-json.mjs`、既存safetensorsのstrict option。失敗試験を先に実行し、3dtype、alpha、未知形式、重複/alias/rank/shape、NaN/Inf、範囲budget、1MiB分割hashをNodeで確認する。
2. `api/index.mjs`・`worker.mjs`へ上記6操作とhost登録を追加。実Worker/MessagePortの失敗試験→実装。置換成功/失敗、取消、新revision、古い返信、別API/別stage/旧id、snapshot所有権、unload/disposeを確認する。
3. API仕様・案内・public台帳・build IDを更新。既存22ケースを回帰検査し、sanitize済み公開exportと独立レビューを行う。既に許可されたPages上の同じモジュールの更新として反映し、実HTTPSでも小さい合成LoRAをFileとして登録/読出しする。モデル/LoRA原本を公開しない。

## 進捗・判断記録

- 設計:既存workflowにある2段階とAPI契約を維持。任意のLoRA形式/複数adapterの混合/全体生成への対応を今回の接続口から推測しない。
- 作業branch `codex/diffusion-lora`。既存隔離worktreeを使用。原本、他担当実装は変更しない。
- 完成判定:上記の範囲読出しと状態管理が実行でき、対応形式・未適用状態・実ファイル未提供をAPI/仕様/検証結果から確認できること。

### 最新mainのLoRA SDKを確認した変更

調査中にmainが `a33b311e45a75a6c683242286fef608c7b3770a9` へ更新され、別担当の `shared/inference/lora/` が公開された。これを取得・mergeし、独立SDKのsource契約 `{size,read(offset,length,{signal}),hash({signal})}` に接続する `lora/source.mjs:createLoraSource({request,sessionId,binding,inputRevision})` を追加する。requestは既存JS APIまたはMessagePortのPromise transport。adapterはbuild/session/handle/hashと応答を照合し、取消・旧bindingを拒否する。SDKの検査がこの実source経由で動くことを確認する。

SDKはLight系の `.diff/.diff_b` も扱うため、これらの保存bytesの入出力を含める。既存SDKの数値処理、folder UI、consumer契約は変更しない。SDKの `target.describe/baseProvider/sink/prepareLoad/validate/commit/rollback` は実export済みF32 graphを要求し、現行の量子化Bernini全体にはまだ存在しない。weight IO/source接続の完成を、そのモデル適用経路の完成へ拡張しない。実LoRA原本の未提供は「この担当の環境では未提供」を指し、別担当の実ファイル検査記録の存在を否定しない。


### 実施結果

- core12項目、source transport10項目、実Chromium LoRA API16項目、既存API22項目が合格。既存SDKの32 Node項目も合格。
- 実SDK.inspectを同一ページJS/明示MessagePortの2経路で実行し、登録・読出しsourceへ接続した。fake consumerやapply成功を作っていない。
- 独立レビューの不正shape BigInt増大を、200,000個の巨大dimensionでRED（2秒timeout）として再現。descriptor容量を超えたら直ちに拒否し、後続zero dimensionの空tensorは保持する修正でGREEN2項目。Node/coreと実ブラウザ全項目を再実行した。
- 383ファイルの厳密export、公開境界/参照22項目と、公開prefix上の23assetバイト/MIME照合・16API+2SDKの最終実行が合格。既存公開peer15ファイルは独立レビュー後に台帳へ追加し、内容を変更せず保持。
- 全体モデル推論・LoRA加算は実行していない。公開後のHTTPS受入はsource branchの lora-public-verification.json に記録する。
