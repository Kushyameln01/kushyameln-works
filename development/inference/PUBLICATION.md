# Text Encoder / VAE GitHub Pages反映

2026-10-31 JST。ユーザーの「GitHub Pagesに実装していなければ実装する」という追加指示により、以前のローカルのみの範囲を更新した。対象リポジトリは `Kushyameln01/kushyameln-works`。GitHub Pagesの既存設定は `main` ブランチの `/docs`、legacy build、公開先は https://kushyameln01.github.io/kushyameln-works/ 。設定変更は行わない。

## 公開対象

- `/text-encoder/` と `/vae/` の独立UI、および `/shared/inference/api.mjs` の独立API。
- 必要なHike、ORT Web、SentencePiece WASMとライセンス表示、API仕様。
- GitHub・ツール一覧の新規2項目と、モデル準備手順へのリンク。

保存済みモデル、ONNX graph、Tokenizerモデル、入力素材や結果tensorは公開・pushしない。VAEの検証済み範囲、FP32診断精度、Text準備graphの保存容量、相手Codexとの接続未検証という制限はAPI/UIに維持する。

## 公開前の修正と検査

独立レビューで新規公開ファイルの内容・目的・ライセンス・依存を検査し、SentencePiece bundleの追加依存ライセンス全文を補った。WorkerのORT読込みは1.24.3が定義する明示的な `.mjs` / `.wasm` URLへ変更し、実VAE画像encodeで数値回帰を確認した。

`security/public-files.json` は依頼された新規公開ファイルだけを追加する。公開exportの参照検査では、minified JavaScript内の文字列をimportと誤認する問題を是正し、Node専用のbare importはファイル・SHA・specifierを固定した例外だけを認める。未知ファイル、欠落依存、path escape、symlink、変化したvendorへの拒否は維持する。

既存FT relocation検査の不整合は今回の推論コード以前から存在し、無関係なloaderや旧台帳は変更しない。

公開前の実測: `python -m unittest discover -s tests -v` は53件すべて合格（24.498秒）。tensor/controller/Hike/外部API/VAE APIのNode検査とText runtime5ケースも合格した。承認済み333ファイルのexportに成功し、元docsとexport先の全ファイルがバイト一致した。公開対象のスナップショットは28ファイル、13,611,277 bytesで、既存一覧ページ1件の更新を含む。

## 公開受入

公開後、実URLから新規ファイルのbytes/SHA・MIMEを照合し、実Chromiumで個別UI、公開originのWorker、Hike/ORT WASM、ローカルモデル入力、結果保存・数値比較を確認する。これらの実測を得るまでは、mainへのpushだけを公開実行の成功とは扱わない。実測結果は公開後に本記録へ追記する。
