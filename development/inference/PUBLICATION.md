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

実装コミット `54c9622e85b4b0c99f3d7d72cdc2c8c0c55d40bf` をmainへpushし、Pages APIが同じcommitのbuildを `built` と返したことを確認した。

公開URLから新規資材と一覧ページの28ファイルを取得し、13,611,277 bytesすべてのSHA・バイト列・MIMEを候補と照合した。実Chromium154.0.8037.57で両UI、JavaScript/MessagePort API、公開originの専用Worker、Hike/ORT WASM、ローカルFile入力、結果ダウンロードを実行した。全試験は169.64秒。ページエラー・遮断対象リクエストは0、HTTPは公開originへのGETだけで、モデルや入力素材のアップロードはなかった。

| 実公開経路 | FP32参照との最大絶対誤差 | 判定 |
| --- | --- | --- |
| Text Encoder、実24層＋Hike最終RMSNorm | 2.86102294921875e-6 | 合格、`[1,4,4096]` を回収 |
| PNG5枚→Hike値域変換→VAE encode | 1.1920928955078125e-6 | 合格、Hike呼出し1回 |
| 既知raw latent→Hike conv2→VAE decode | 8.046627044677734e-7 | 合格、Hike呼出し17回 |

公開受入の要約は `public-verification.json`。元の実行記録・回収tensorは作業環境の `/workspace/work/inference/publication/live-verified/` に保持する。モデル本体や結果tensorをこのJSONや公開Git履歴へ同梱していない。別Codexの実Diffusion/包括UIとの対向接続や、元GPU算術・利用者端末の負荷低減をこの試験で認定していない。

初回ブラウザ検査は検証環境のNSS DB書込み制限で証明書検証に失敗した。既存CAは登録済みで、ChromiumのDB初期化に必要なtask単位の書込み許可を与えて解消した。TLS検証を無効化せず、新しいCAの登録も不要だった。これは公開コードの不具合ではなく検証環境の設定差であり、失敗記録も保存した。検査後に専用ブラウザを終了した。
