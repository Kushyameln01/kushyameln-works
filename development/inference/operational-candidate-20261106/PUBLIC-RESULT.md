# 公開されたText／VAE管理画面

- 公開URL：https://kushyameln01.github.io/kushyameln-works/inference-owner/
- 確認した公開main：`c34def4c5fe141fc77518d1bbaa31e121850b089`。本担当の公開変更はPR21・22・23、最終mergeは`e80a1f3df34456792b92a74ed399736aaae9abbb`。その後の管理PR19を含むmainで最終確認した。
- Pages：[run42230908310](https://github.com/Kushyameln01/kushyameln-works/actions/runs/42230908310)が成功。公開8資材のbyte一致を[記録](public-deployment-files.json)した。
- native実行source：`143526fc29787e282dcc91cfb8423621e4da3fd3`。媒体UI/source：`1d3338edc588ff51c4ab79c645a0767675772b66`。native API／codecの変更がないUI更新でcodec識別を変えず、既存ZIPの読戻しを維持する。

## 公開画面で完走した操作

実Rect bundleのmanifest・4資材を通常のFile選択で設定した。保存済みposterior mean `[1,16,1,2,4]`を入力し、早期取消の終端、復帰decode、WKT・管理ZIP保存、履歴消去、ZIP読戻し、同じraw meanの再利用decodeを確認した。RGBはfloat32 NCTHW `[1,3,1,16,32]`、`raw-decoder-rgb`。追加復元やmeanへの改名はない。

全1,536値の参照比較はmaxAbs `2.4437904357910156e-6`、既存gate `2e-5`以内。再利用出力のdata SHAは一致。ZIPは27,268bytes、3記録を保持し、元mean・RGB・context・依存・traceを読戻した。実推論は初回公開main `8ce26847e0cf886ddf6f08fc0b91025894520f0e`で2回完了し、最終mainc34では同じ公開ZIPの互換読戻しを追加確認した。native／使用する管理依存のbyteは同じで、NNを繰り返していない。

最終公開画面では、実Textの27準備済み資材＋元model1件を設定した。内蔵manifest `420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405`、24件のsource-ordered-fp32 binding、model／Tokenizer、`umt5-final-rmsnorm-f32-v1`を確認した。この追加確認ではTextの実行ボタンを押していない。

実PNGを選び、既存媒体decoder→owner共通packingで作るRGB全1,536値が既存`png-unit.f32`と一致した。shape `[1,3,1,16,32]`、`rgb-unit`、元SHA・slot・frame0を保持する。通常取込みは無改変のdecoder、取消試験だけ実decoder呼出し前の600ms待機を加えた別contextで行い、取消終端→記録0→再取込みを確認した。NN・Worker起動は0。

## 証拠と再利用範囲

- [公開VAEの18項目評価](public-validation/public-completion-assessment.json)、[最終公開版の追加確認](public-validation/browser-public-final-media/result.json)、[保存物の独立読戻し](offline-package-verification.json)。normalized markerの管理保存往復はofflineでbyte一致も確認し、normalized decodeとは区別した。
- [媒体境界の比較](media-input-verification.json)。4対象テスト、既存PNGとの全値比較、取消後の再取込みを確認した。
- Textの修正版NN比較・全512有効ID、原寸VAEの合格は既存source `c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3`／`78954ee92d1b76c6652f50df1668159a55db6dc9`とstandalone資料のscopeで再利用。新公開画面の原寸NN合格へ拡張しない。
- 初回の環境証明書エラーはNN前。既存NSS DBへの書込み権限で解消し、TLS検証は有効のまま。公開VAEの元receiptはWorker観測数の固定期待値だけでFAILだったため保存し、取消がWorker-ready通知前に終わった事実を踏まえた別評価を付けた。元receiptを合格へ書き換えていない。
- 公開VAEの約18秒と最終追加確認の約27秒は各実行全体の時間。今回のピークRSSは未測定。両harnessの生存・zombie・cleanup errorは最終0。ローカル検証hostも終了済み。

## 起動・再現

公開URLを開き、[操作説明](../../../docs/inference-owner/README.md)に従う。Textは27資材を含むフォルダと元model、VAEはmanifest.jsonと対応graph・重みのフォルダを選ぶ。raw safetensorsだけでは実行できない。manifest／File Map／graphBindingsを手編集する必要はない。

開発確認は`tools/inference/management-connection/validate-operational.py --scope vae`と、NNを行わない`validate-public-media.py`。[実行時の引数](public-validation/reproduce-public-media.sh)を保存した。絶対pathは実行環境の配置へ置き換える。Playwright／Chromium／psutil、実bundle・元model・PNG・既存参照が必要。managed環境ではnetworkと既存NSSディレクトリの書込み権限を使用した。取得確認だけのためにNNを繰り返す必要はない。

## 未対応・未検証

実Diffusion生成raw原本2件は未取得で、その実sampleのdecode、全体生成・LoRA運用は未受入。Textの公開URLでの新規NN、原寸81frameの公開画面での実行・保存資源、動画の実codecを使ったUI操作も今回未検証。

通常Pagesではthreads4 streaming VAEに必要なcross-origin isolationがなく受理しない。threads1への自動切替はない。媒体取込には既存decoderの4MiB・10秒制限と、元file＋保持RGBA＋生成tensorの64MiB見積り制限がある。resize・padding・frame削減で合わせない。RGBは元数値のWKT／管理ZIPで渡し、PNG変換・動画プレビューは提供しない。
