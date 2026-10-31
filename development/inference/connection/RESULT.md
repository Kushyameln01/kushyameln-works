# 接続調整 `connection-1` の結果

2026-10-31 JST。ブランチ `codex/inference-connection-contract`、基点 `a33b311e45a75a6c683242286fef608c7b3770a9`。着手時、前回ローカル `d2e9e3c` から最新mainまでの5commit・101ファイルの差分を確認した。Diffusion/LoRAが追加され、Text/VAE中核は基点まで変更されていなかった。確認した差分は `baseline.json` に保存した。

## 実施した調整

| 原要求 | 実装・資料と確認範囲 |
| --- | --- |
| Text出力契約 | `works-ai-1`を維持。通常textと明示ID/maskを区別し、混在を拒否。float32 BLC `[1,L,4096]`、Uint8 mask、model/Tokenizer hashを出力・保存へ保持。ComfyUI重み構文等は未対応、system prompt/negativeは管理側。`docs/shared/inference/API.md` に記載 |
| VAE profile | 受入済み5×16×16と、81×480×832、静止F=1、各ratioの参照画像/動画、最終decodeを区別。`PROFILES.md` にsource/workflow箇所、shape・容量・制約・別profileの受入条件を記載。新profileはexportしていない |
| 生成latent | `wan21-raw-generated-sample:v1` のVAE consumer契約を追加。raw/restored、decoder VAE binding、生成producer列を分け、meanへの改名・VAE hashへの付替えを拒否。正規化・復元は追加実装せず、Diffusionの既存mean用Hike処理を維持 |
| contextと管理側 | 任意contextでinput/slot/source frameと時刻を保存し、VAEと既存Diffusion mean変換で所有コピーを保持。encodeに付ける場合は元RGB Fと同数を検査し、latent Tとの1対1対応は要求しない。context順序・正負共有・横断直列化・待機列は管理側、graphでの消費はDiffusion担当 |
| 引継ぎと確認 | 両API文書、profile/設定/入出力/保存/所有権/取消・失敗・dispose/未対応一覧を更新。小規模fixture、旧codec golden、実128要素Hike、実SentencePieceの確認と、以前の実モデル受入記録を分けた |

共通 `.wktensor` は `WKTSR001` / schemaVersion1を維持し、旧fixtureはバイト一致。追加した任意fieldは `tokenizerSha256/context/latentContract`。非同期hashの前にmetadataもsnapshotする。Diffusionのconditioning保存wrapperも新metadataを保持し、Tokenizer hashがあれば対応を照合する。旧ファイルのTokenizer識別未記載は旧経路として受け入れるが、同一性の検証済みとは扱わない。

生成sampleのproducer hashはそのまま保持し、decoderのVAE hashは別bindingとする。HIGH/LOWの実行順、LoRA、prompt、scheduler/noise等は管理job manifestのtraceで保持する。metadataの `restored` は宣言であり、数値復元やmodel互換性の証明ではない。実producerは引き続きNOT_READYである。

## 実施した検査

| 検査 | 結果・意味 |
| --- | --- |
| 新規接続fixture | **12/12 PASS**。shape/layout/meaning/hash/mask、Tokenizer、複数producer/decoder binding、context、保存読戻し、変更中metadata snapshot、矛盾marker・疎配列拒否、明示MessagePortのbuffer所有権を確認 |
| 実Hikeの小fixture | 上記12件内。既存mean128要素のnormalize→保存読戻し→restore、2呼出し、数値差≤2e-6、contextの所有コピーとsample拒否。ニューラル推論ではない |
| SentencePiece実ブラウザ | **6/6 PASS**。Chromium154.0.8037.57、英語/日本語/大小文字/空白/絵文字/空文のID一致、EOS/PAD/長さを確認。Text24層の新しい実推論ではない |
| 既存関連Node検査 | tensor、controller、Hike、external API、VAE APIが合格。Text runtimeの5 lifecycleケースも合格するが、ORT doubleを使うためモデル数値検証ではない |
| Diffusion build receipt | `--check`、新generator6テスト、全29source hash・aggregateの独立照合PASS。protocol `diffusion-models/0.1`を維持 |
| 全体Python検査 | **53件中52件PASS、1 error**。`test_publication.PublicationTests.test_valid_export` が基点からの未登録LoRA/plan15ファイルで失敗。`repository-checks.json` に同じunknown集合が基点にもある証拠を記録 |
| 静的な参照閉包 | 全docsのliteral参照確認PASS。変更した公開pathは全て既存台帳にあり、台帳自体は変更していない。full exportは上記既存不整合で失敗し、公開可能と判定していない |

独立レビューで、保存時に矛盾normalization markerを捨てる抜け道、疎なframe配列、mean変換でのcontext欠落を確認し、失敗fixtureを保存してから修正した。`REVIEW.md` は修正後に重要な未解決事項なしと判定した。今回の実行ログ・旧sourceから作成したgoldenの根拠は `/workspace/work/inference/connection/`、再現テストは `tools/inference/test-connection-contract.mjs` と `tools/diffusion-models/test-build-info.py` に保持する。

## build識別と再現性

共有codec変更はDiffusionの既存BUILD_SOURCESに影響するため、BUILD_IDを更新した。

```text
diffusion-models/0.1+164b7cb4b575e60388e7ce66db27cfbaea7057cf3cc46a5362e6f47ed601b3ae
```

元の `api/build-info.py` は基点のrepoに欠落していた。旧29-record aggregateを独立に再現した後、同じkey順compact JSON方式の新しい `tools/diffusion-models/build-info.py` を作成し、欠落builderのkeyだけを新scriptのself hashへ置換した。元builderを回収した・kernelを再buildしたとは報告しない。旧hash/aggregateと変更理由は `DIFFUSION-CONTRACT.md` に残す。

## 今回完了した範囲と残る条件

完了したのはVAE consumer／Text出力／metadata保存の契約調整、必要profileの棚卸し、管理側への引継ぎと小規模検査である。実際のDiffusion producerと共同の生成接続を完了したとは扱わない。

- Diffusionの `load/predict/sample` と生成sample用復元はNOT_READY。現mean変換は128要素だけ。
- 元workflow latent `[1,16,21,60,104]` の2,096,640要素は公開pointwise予算1,048,576を超える。profileだけ増やしても解消しない。
- F=1、81×480×832、実参照媒体の各ratioは未export・未参照比較・未ブラウザ受入。slot画像の実寸法/EXIF/alpha、source/reference動画の実frame数も不足のまま残す。
- Diffusion本番graphのcontext消費形式、shape/layout/mask/結合軸と正負共有の受入は、producer実装と実tensorで照合する必要がある。
- 元GPU FP8/BF16演算、全生成workflow、利用者端末のRAM/速度改善は未検証。既存の実モデルFP32受入は以前の記録で、今回再実行していない。
- 大容量model download、再export、重い全工程推論、公開、pushは行っていない。今回の変更はローカルブランチに保持する。
