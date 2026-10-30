# DiffusionModels GitHub Pages 公開

2026-10-31 JST。ユーザーの「GitHub_Pagesに実装してください」に基づき、既存の `Kushyameln01/kushyameln-works` の `main` / `/docs` へ公開した。Pages設定は変更していない。

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

公開先: https://kushyameln01.github.io/kushyameln-works/diffusion-models/ 。公開コミット `cccaf9532c3db76c7a415603d2672affb5b599fe` のPages buildは `built`、公開されたbytesも一致した。対応するActionsは [41100084870](https://github.com/Kushyameln01/kushyameln-works/actions/runs/41100084870)。

実HTTPSの公開originで、Diffusion関連30ファイルと一覧ページ1件（107,802 bytes）の内容・SHA・実行資材MIMEが候補と一致した。既存codec/ORT runtimeの4ファイル（12,440,180 bytes）も別途バイト照合した。実Chromium154.0.8037.57では11項目を確認し、JavaScript/MessagePort、専用Worker、Hike Euler/scheduler/CONST、全16 channel raw mean正規化と公開codec保存読戻し・復元、Hike→ORT WASM→Hikeの明示的な合成部分射影が合格した。モデル全体のload/predict/sampleはNOT_READYを維持している。

保存済みLOW/HIGHの両15,574,833,216-byte Fileについて、1815 tensor・181280-byte header・既知のheader SHAを照合した。payload全量やNN推論は実行していない。Text Encoder/VAEは公開APIの独立性とcapabilitiesのみ確認した。HTTPは公開originへのGETだけで、モデルや入力のuploadはなく、page error、console error、遮断requestはいずれも0。HTTPS受入は6.58秒。機械可読記録は `public-verification.json`。

初回Chromiumは環境の既存NSS DBが読み取り専用のため証明書検証で停止した。同じ検査スクリプトを、既存DBへのtask単位の書込許可で再実行して合格した。TLS検証の無効化や新規CAの登録は行っていない。失敗記録も作業環境に保持した。

この受入は全体モデルの推論合格、元GPU算術との一致、包括UIとの全工程結合、利用者端末の負荷低減を意味しない。
