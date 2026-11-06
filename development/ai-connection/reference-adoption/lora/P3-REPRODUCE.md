# 実base・P1規範付きLoRA診断snapshotの再現

実行sourceは `25e5b56feeb070594110bb292d9de21e4e234f0a`。製品SDKや管理runtimeを書き換えず、固定ownerをreceiverで接続する。対象は選択したlight HIGHの1 File・Q16 PARTIAL診断である。

## private入力を用意する

1. 手元の `Bernini-R_LightX2V_high_noise.safetensors`。1,244,141,856 bytes、SHA-256 `9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945`。ブラウザの新規loadで実際にhash検査する。CLIのこの制限は固定期待値を使う試験条件であり、製品の4原本allowlistではない。
2. [Diffusionから受領したbase断片](https://chatgpt.com/space/page_2b15f0bb13288191837ee215949aa89d) `base-blocks.json`。709,364 bytes、SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`。privateなsource repo外へ保存し、mode600にする。15GB全baseや仮想full Fileは不要。
3. 既存独立参照： [LoRA引継ぎPage](https://chatgpt.com/space/page_4988393f36e88191bcf7c0823139d1f3) の「Nonrect mean and original LoRA joint receiver evidence」。既存archiveは10,088,369 bytes、SHA-256 `693f76570cf9915be07f258a4248c7618754b99f6dc4f8c11f013a8af053002f`。`reference-root/HIGH-fixed/reference/` と `reference-root/HIGH-fixed/result.json` をprivateな場所へ展開する。参照JSON・gate・旧結果は0c固定Git blob、必要な配列9件は各hashへ照合される。

原本、base断片、生の選択配列をGitやHTTP公開ディレクトリへ置かない。raw `.safetensors` と断片はFile pickerからブラウザへ渡す。過去4原本の取得や期待値の再生成は不要。

## 固定sourceと環境

Node `v24.19.0`、Python `3.12.14`、Chromium `154.0.8037.57`、Playwrightで実行した。ORT WASM `1.24.3` とHike artifactは固定sourceにある。NumPyは独立した保存配列の読戻しに使い、ブラウザ試験の実LoRA計算はHikeで行う。

```sh
git clone https://github.com/Kushyameln01/kushyameln-works.git lora-p3
cd lora-p3
git fetch origin 25e5b56feeb070594110bb292d9de21e4e234f0a edda43f9ea69c5b3ab1af3c6eb82295f2912887c fc2789a0f649e33f15eb13750e6a983b5c52d170 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 0c27874908638afc748ea2455a2779a16736730b
git checkout --detach 25e5b56feeb070594110bb292d9de21e4e234f0a
git worktree add --detach ../manager-edda43 edda43f9ea69c5b3ab1af3c6eb82295f2912887c
git worktree add --detach ../owner-fc278 fc2789a0f649e33f15eb13750e6a983b5c52d170
git worktree add --detach ../diffusion-5f880 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3
```

source treeのファイルは各完全commitのGit blobへ照合する。receiverの試験ファイルもHEADへcommit済みである必要がある。後続の文書commitでも同じコードを実行できるが、`receiverCommit` はそのHEADとなる。UUID・計時値は再実行ごとに変わるため、receipt全体のhash一致を成功条件にはしない。

Playwrightの既定パスは `/opt/codex/cua_node/lib/node_modules/playwright`、Chromiumは `/usr/bin/chromium`。別環境では実在するパスを `LORA_PLAYWRIGHT_MODULE` / `LORA_CHROMIUM_PATH` で明示する。

## ブラウザ試験

```sh
node tools/ai-connection/test-lora-managed-snapshot.mjs \
  --manager-root ../manager-edda43 \
  --lora-root ../owner-fc278 \
  --diffusion-root ../diffusion-5f880 \
  --artifact /absolute/private/base-blocks.json \
  --reference-root /absolute/private/reference-root/HIGH-fixed/reference \
  --file /absolute/private/Bernini-R_LightX2V_high_noise.safetensors \
  --pair light --side HIGH \
  --expected-sha256 9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945 \
  --out /absolute/private/new-empty-p3-output
```

入力とoutはsource repoの外、outは新しい空ディレクトリを指定する。既存の証拠へ上書きしない。期待する終端は `PASS_MANAGED_REAL_BASE_PARTIAL_SNAPSHOT`、公開case6件、`generationReady:false`。old source/kernel、原本hash、range/offset、期待値、規範の8負例、取消・復旧・解放の不整合は失敗とする。

outには完全 `result.json` と26個の `actual/` 生成物を保存する。6公開caseのweight/bias/output/scopeに加え、取消checkpointのweight/biasが含まれる。全配列を保存し、公開caseと取消候補を分けて数える。raw選択weight・参照配列はprivateに保持する。

## 数値と状態を確認する

各weight F32を対応する独立f64参照へ `abs(error) <= 1e-5 + 1e-4*abs(reference)`、biasをF32数値完全一致、各16出力を `1e-6 + 1e-5*abs(reference)` で全比較する。base復号は数値とbytesが完全一致する。比較実装をSDKの演算式から作り直さず、既存の独立参照と事前gateを使う。

`normPreflight`、`normCheckpoint`、`normPostpublication` は別の実行phase。実checkpointのreceiptと全weight/bias比較を得てからnumeric evidenceを作り、公開・queue終端を得てからtransaction evidenceを作る。`steps[].edges`へ将来のreceiptを偽装して渡さない。

manager revision1001以降、SDK local revision1以降、native epochは別の値として記録する。native `snapshotPublished:false` と管理の診断snapshot公開は別。最後はqueue経由でbaseへ戻し、`snapshotTrace.selectionCurrent:false` として所有者を終了する。これをLoRA適用が継続する製品状態として表示しない。

## fixtureと配布receiptの確認

```sh
WORKS_P3_NORM_MANAGER_ROOT=../manager-edda43 node --test tools/ai-connection/test-p3-norm-edge.mjs
cd ../manager-edda43
node --test tools/ai-connection/test-reference-loader.mjs tools/ai-connection/test-norm-bindings.mjs tools/ai-connection/test-norm-boundaries.mjs
```

前者はreceiver組立て5/5、後者は管理P1のfixture34/34。いずれも実base数値試験とは別である。

Git配布には [全出力summary](evidence/p3/receipt.json)、[完全receipt gzip](evidence/p3/run-result.json.gz)、[manifest](evidence/p3/MANIFEST.json)、独立読戻しを含める。gzipはモデル重みを含まず、完全JSONをbyte同一で圧縮したもの。ダウンロード後に `gzip -dc run-result.json.gz > run-result.json` で展開し、[結果文書](P3-RESULT.md)の長さとSHA-256へ照合できる。

実際に用いた[独立読戻しsource](evidence/p3/independent-readback.py)と[59件のphase照合記録](evidence/p3/independent-phase-fragment.json)も同梱した。scriptは標準Pythonのみを使う。実行時のprivate配置を冒頭の `ROOT` / `RUN` / `REFERENCE` / `REPO` に記録しているため、別環境ではこれらを自分の配置へ合わせる。出力先は `ROOT/independent-readback.json` なので、既存証拠を保管してから新しいprivate配置で実行する。原本LoRA・raw baseは読まず、保存配列とGit objectだけを比較する。

実model全session、他pair/sideの新規管理受入、全target、生成、lease、E4新packageの受入はこの再現手順へ追加しない。
