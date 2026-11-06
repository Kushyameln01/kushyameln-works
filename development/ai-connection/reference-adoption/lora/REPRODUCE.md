# P0宣言と管理採用経路の再現

今回実行したreceiver sourceは `d59c917a2d136a29e4f0b083143d63a0d621dcb5`。結果は[RESULT.md](RESULT.md)、全出力とnative receiptは[evidence/managed-boundary-result.json](evidence/managed-boundary-result.json)。再実行は新しい合成ローカルFileを1件だけ作成する。過去4原本・実baseモデルの取得を条件にしない。

## 必要な環境

実行環境はNode `v24.19.0`、Python `3.12.14`、Chromium `154.0.8037.57`、Playwright。ORT `1.24.3` とHike artifactは固定Git sourceに含まれる。Playwright moduleとChromiumの場所が既定値と異なる場合は `LORA_PLAYWRIGHT_MODULE` と `LORA_CHROMIUM_PATH` を指定する。新たなmodel packageは不要。

## 固定sourceを揃える

```sh
git clone https://github.com/Kushyameln01/kushyameln-works.git lora-p3-repro
cd lora-p3-repro
git fetch origin d59c917a2d136a29e4f0b083143d63a0d621dcb5 28596717182e48aeb23c719c51b6e593edf4e496 0c27874908638afc748ea2455a2779a16736730b 438972f30242e0a3bc66edb8591f38eaa0fcd384 fc2789a0f649e33f15eb13750e6a983b5c52d170 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 6dae9a6fac3e9ad29ea941f22211edbe4aa894ad
git checkout --detach d59c917a2d136a29e4f0b083143d63a0d621dcb5
git worktree add --detach ../manager-285967 28596717182e48aeb23c719c51b6e593edf4e496
git worktree add --detach ../owner-0c278 0c27874908638afc748ea2455a2779a16736730b
git worktree add --detach ../diffusion-438 438972f30242e0a3bc66edb8591f38eaa0fcd384
git worktree add --detach ../reference-6dae 6dae9a6fac3e9ad29ea941f22211edbe4aa894ad
```

runnerは全配信ファイルをGit blobへ比較する。自身の2ファイルもHEADにcommit済みである必要がある。後続owner/consumerのbyte一致確認にも完全SHAを使うが、採用pinを後続SHAへ変更しない。後続の文書commitで試験コードが同一なら実行可能だが、報告上の `receiverCommit` はそのHEADへ変わる。

## ブラウザの事前確認を実行する

outはsource repoの外にある、新しい空のprivateディレクトリを指定する。既存の結果ディレクトリへ上書きしない。

```sh
node tools/ai-connection/test-managed-lora-boundary.mjs \
  --manager-root ../manager-285967 \
  --lora-root ../owner-0c278 \
  --diffusion-root ../diffusion-438 \
  --out ../private-lora-p3-run-NEW
```

既定のPlaywrightは `/opt/codex/cua_node/lib/node_modules/playwright`、Chromiumは `/usr/bin/chromium`。別環境では実在するパスを環境変数へ設定して同じコマンドを実行する。

期待する終端は `PASS_P3_CHANGED_BOUNDARY_PRECHECK`、cases 7、controls 7、`P1:UNVERIFIED`、`snapshotNormRuntimeVerified:false`、`fullP3Accepted:false`。inputCountは1、historicalFourOriginalsRequiredはfalse。`.safetensors` のHTTP GET、legacy bridge、page/server errorはいずれも0件である。

outに生成するものは `pre-execution.json`、新規合成File、`result.json`、14個の `actual/*.f32`。事前条件はrank 1、alpha 1、F32、strength `{0,1,-1}`、非ゼロ合成base、各出力 `3+0.625*strength`、fixture専用gate誤差0。実LoRA用gateや実base適合の検証へ転用しない。

`result.json.cases[*]` に原本hash、full/selected shape、含むpatch・除外領域、両registry、manager target、native local revision、package/epoch、全16出力を記録する。traceはqueue各要求を対応付ける。生成した生配列はprivateに保持する。Gitへはreceiptとhashだけを登録した。

## 既存の管理採用契約とcatalogを確認する

```sh
cd ../manager-285967
WORKS_ADOPTED_LORA_ROOT=../owner-0c278 \
WORKS_ADOPTED_DIFFUSION_ROOT=../diffusion-438 \
node --test tools/ai-connection/test-adopted-lora.mjs
cd ../reference-6dae
python development/ai-connection/reference-catalog/validate_catalog.py
```

管理契約は11/11、skip 0。catalogは18 profiles、10 rules、12 norms、data 6件・文書7件のdigestが一致する。このcatalogコマンドは静的検査だけで、規範runtimeや推論を実行しない。ここでの契約fixture、前節の実ORT＋合成base、既存の実LoRA＋実base試験を別々に報告する。

## 結果を読む際の境界

取消は実Hike block後の協調停止であり、queueが元処理終端・停止確認・releaseを待ってから再利用する。cleanup故障はquarantineを維持し、明示cleanupだけで再利用へ戻さない。`independent-copy` の所有権を確認しており、lease方式は新規試験していない。

P1のReferenceSet／norm-bindingsが未受領のため、catalog統合や同一targetの実native診断snapshotを合格にしない。追加sourceを取得後、その変更境界を別試験にする。全target・全model・生成・二組同時合成を本手順へ自動追加しない。
