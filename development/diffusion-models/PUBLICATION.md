# DiffusionModels GitHub Pages 公開

2026-10-31 JST。ユーザーの「GitHub_Pagesに実装してください」に基づき、既存の `Kushyameln01/kushyameln-works` の `main` / `/docs` へ公開する。Pages設定は変更しない。

公開するのは作成済みAPIの対応範囲と案内ページ。モデル全体の推論は実行しない。`modelInference:false`、`partialOnly:true`、`load/predict/sample` の `NOT_READY` を維持する。Text Encoder/VAEの既存実装は変更しない。

## 公開境界

`security/public-files.json` に必要な30ファイルだけ追加し、既存分と合わせて363ファイル、23,365,049 bytesの静的exportを作成した。既存サイトとの相違はDiffusionModelsの30ファイルと一覧ページ1件。実行時依存は相対URLで解決し、既存ORT 1.24.3を使う。

Pagesはmainのdocsを直接配信するため、台帳の更新だけで配信対象を制限できるとは扱わない。mainに載せるdocsの全ファイル・ディレクトリ・bytesを検証済みexportと一致させる。ビルド・ローカル試験用の完全なsourceは `codex/diffusion-models` ブランチへ保存し、案内ページから参照する。

モデル本体、元添付資料、private fixture/入力・出力tensor、toolchainを公開しない。Pagesにはローカル試験harness、試験結果、WAT、未使用runtime、ONNXも同梱しない。部分射影は呼出し側が明示した配列を処理し、モデルやfixtureをHTTPで取得しない。

## 公開前の検証

- Node: Euler13、FP8 bridge8、scheduler8、tensor interop10、latent-space10ケース合格。
- 実Chromium: 外部API22ケース合格。保存済みLOW/HIGHの各15.57GB Fileはheaderのみ検査し、両方1815 tensor・181280-byte headerを確認。loadはNOT_READY。
- 静的export:363ファイルが台帳・sourceのbytesと一致。参照scanner7、公開境界15ケース合格（公開境界試験のfixtureにはsanitize済みcandidateを使用）。
- 独立レビュー: exportを実際のproject prefixで配信し、案内の17リンクとEuler/scheduler/latent変換/部分射影が動作。禁止fixture・公開test harness・未使用ONNXのURLは404。pageerrorなし。

API build ID: `diffusion-models/0.1+ab0c2224128e82229b3261114eac59573b791f56be97599023173d3e5f92b6c9`。

## 公開後の受入

公開先: https://kushyameln01.github.io/kushyameln-works/diffusion-models/ 。実公開後にPages buildのcommit、公開bytes/MIME、HTTPSの実Worker・MessagePort・Hike/ORT部分演算を検証し、結果をこのディレクトリへ記録する。全体モデルの推論合格や、包括UIとの全工程結合を意味しない。
