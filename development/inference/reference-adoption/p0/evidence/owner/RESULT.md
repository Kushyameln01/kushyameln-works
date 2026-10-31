# Text Encoder / VAE 実装と引継ぎ

更新: 2026-10-31 JST。ブランチ `codex/textencoder-vae`。開始点 `a614f772cfcd95ebec0ba094fc5391e4bbdf0676`。

この文書は初期ローカル受入時点の記録。以後のユーザー指示でGitHub Pages公開が対象に加わった。公開レビューと追加修正は `PUBLICATION-REVIEW.md`、公開受入の状態は `PUBLICATION.md` を参照する。

## 現行要件と実装

ユーザーの最新指示に合わせ、Text EncoderとVAEを独立モジュールとしてWorksへ追加した。別Codexが用意するDiffusionと包括UIはこの変更の担当外。保存済みDiffusion HIGHは明示指示で削除し、15,574,833,216 bytesを解放した。LOWは保存していない。元UMT5とWan2.1 VAEは保持している。

| 確認項目 | 実装と受入範囲 |
| --- | --- |
| 独立モジュール | `createTextEncoderModule()` と `createVaeModule()`。独立した設定・操作・取消を提供し、各単独UIも追加 |
| 外部接続経路 | `works-ai-1` のES module API、明示的MessagePort RPC、バイナリ `.wktensor`。実モデルを呼ぶ外部テストcallerを実Chromiumで確認 |
| Hike実使用 | Textの実最終RMSNorm、VAEのunit RGB値域変換、decodeの実conv2。必須経路の欠落を隠れた代替計算で成功させない |
| 直列実行と取消 | 共通executorは重いジョブ1件。取消は専用Workerを終了し、次回生成。旧世代の成功・失敗を現在結果へ採用しない |
| 入出力 | dtype・shape・layout・意味・mask・model hash・payload hashを保持。Text embeddingのVAE latentへの誤接続を拒否 |

接続仕様の正本は `docs/shared/inference/API.md`。個別入口は `docs/text-encoder/index.html` と `docs/vae/index.html`。一覧は `docs/github/index.html` に追加した。包括UIや自動生成パイプラインをこの変更で新設していない。

## 対応モデルと制限

| 対象 | 現在の対応 |
| --- | --- |
| UMT5 | 原本6,735,906,897 bytes、SHA-256 `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`。24層を順に読込み・解放。必要な元F16 embedding行のみ検証して読む |
| Text入力 | 埋込SentencePiece WASM、EOS1/PAD0、最大512token。通常テキストまたは明示token ID/mask。内部mask位置は保持。ComfyUIの重み付きprompt・custom embedding・Bernini system promptの自動再現は未対応 |
| Text出力 | float32 `[1,L,4096]`、BLC、`text_hidden_states` とattention mask |
| Wan2.1 VAE | 原本253,815,318 bytes、SHA-256 `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。全194キーの元BF16値をFP32へ展開 |
| VAE検証済みprofile | `wan21-raw-f32-5x16x16`。RGB `[1,3,5,16,16]` ⇄ latent `[1,16,2,2,2]`。encodeはposterior mean、decodeはclamp前raw RGB |
| VAE入力空間 | RGBは `raw-decoder-rgb` −1〜1 または `rgb-unit` 0〜1。latentは `raw-posterior-mean`。透過画像は拒否。resize・乱数sample・latent正規化・色変換を暗黙適用しない |

ORT Web1.24.3 WASM provider、1 thread、WebGPUを使用しない。Textは元scaled FP8/F16値をFP32へ展開した診断用実行であり、元GPU FP8の算術と同等とは認定していない。VAEも元BF16算術との同等性は未確認。別VAE shapeはエクスポーターでprofileを作り、参照tensorとのブラウザ照合が必要。

Textの実行用24 graphだけで18,523,750,008 bytes、元6.74GBモデルは別途必要。VAE bundleは約0.51GB。段階ロードで全層の同時常駐を避けるが、保存容量の削減を達成したとは扱わない。モデルと変換済み重みは公開docsにもGitにも同梱していない。

## 検証結果

実Chromium154.0.8037.57、ローカルHTTP配信、実Worker、元モデル由来の全層graphで実行した。数値比較は元重みのFP32参照に対するもので、合成の小モデルではない。

| 検査 | 結果 |
| --- | --- |
| Text単独UI → 24層 → Hike → 保存・読戻し | `[1,4,4096]`、最大絶対誤差2.86102294921875e-6、全値finite |
| VAE raw encode | 最大絶対誤差1.6689300537109375e-6 |
| VAE 保存latent → decode | 元FP32 encode/decode参照との差7.152557373046875e-7 |
| PNG5枚 → Hike値域変換 → VAE encode | 最大絶対誤差1.1920928955078125e-6、実Hike呼出し1回 |
| 外部MessagePort caller | 通常テキスト `Hello world` → tokenizer → 24層 → Hike → `[1,512,4096]`、mask保持。VAE encode/decode、Text層1後の取消・再実行、誤接続拒否も合格 |
| Tokenizer | 英語・日本語・大文字小文字・空白・絵文字・空文の6条件でPython SentencePieceとID一致 |
| 状態と受渡し | 旧入力readの競合、透過画像拒否、重複RPC ID、maskの不正値、Node Buffer/offset view読戻しを失敗再現後に修正し、回帰検査に合格 |

Textの最終出力基準0.001は比較前から固定した。中間層の初期絶対誤差基準0.001は大きなhidden値で不合格となり、失敗記録を保持したうえで残りの変換前にpeak正規化誤差/relative RMS 1e-4へ明示改訂した。初期基準が合格したとは扱わない。Hikeの担当・主要演算候補の採否は `HIKE-DECISIONS.md` に分ける。

証拠の要約は `verification.json`。元の計測JSON・log・回収tensorはこのセッションの `/workspace/work/inference/integration/`、モデル別REPORTとbundleは同階層の `text-implementation/` と `vae-implementation/` に保持する。ブラウザと一時HTTP serverは検査後に終了する。

## 公開境界と既存検査

- リポジトリPython検査46件中45件が合格。`test_publication.PublicationTests.test_valid_export` は、新規ファイルが未承認のため公開exportの境界で失敗する。失敗を許可するテスト改変や台帳の無断変更を行っていない。
- `node tests/relocation.mjs` は既存FT loaderのバイト同一性検査で失敗する。`docs/shared/ft/kernel/load-kernel.mjs` は開始点HEADと同一で、この変更では編集していない。現行HEADで追加されたhash/所有権検査と古いrelocation台帳の差による既存不整合であり、今回の推論コードの回帰として修正していない。
- `security/README.md` の公開追加に対するhuman review要件に従い、`security/public-files.json` を保持した。`publication-candidate.json` は正確な目的・ファイル・hash・ライセンスのレビュー用資料で、公開許可ではない。
- ローカル実装と実モデルの限定受入を完了した。サイト公開、push、公開export合格は未実施。

## 別Codexへ渡す契約

包括モジュールは同originのES module APIを呼び、Text conditioningとVAE raw latentの意味を維持する。同じexecutorを共有して必要な処理順を管理する。別originのDiffusionを呼ぶ場合は、同originのmodule hostと明示的に提供したMessagePort等を用い、origin・所有権・取消を両側で確定する。

対向側の実API版、origin、endpoint、tensorのshape/layout/dtype、latent正規化、prompt処理が未提示のため、別CodexのDiffusion/包括UIとの本当の対向接続は未検証。これらを取得して実tensorを往復し、必要な追加VAE profileと元workflowの条件を照合することが次の統合作業となる。現在のコードだけで動画生成全体の完成、元ComfyUIの負荷問題の解消、利用者PCでの性能改善を認定しない。
