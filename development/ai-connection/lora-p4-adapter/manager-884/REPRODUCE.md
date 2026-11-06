# 管理884の実File受入を再現する

固定sourceと既存独立referenceを使う。新しい空outで実行し、失敗試行も保持する。原本やbase、reference、生成されるbinaryは全てGit source tree外に置く。今回の実行では管理runtimeを編集していない。

## 固定sourceと前提

- 管理: `8849891f19124df31847bd691503c2491278eaa8`
- LoRA native root: `fc2789a0f649e33f15eb13750e6a983b5c52d170`
- Diffusion native root: `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`
- DATA origin: `82b21f09cb63926543181b16f0e97ebc6b9fa6be`
- reference/gates/旧receipt: `0c27874908638afc748ea2455a2779a16736730b`
- codec origin: `2bdca59ea78580d4fe7a9d31a8de33209b64d029`

管理rootのGit object databaseにも全固定commitが必要。正本手順のfetchを省略しない。実行run1はcodec object不足で停止し、fetch後の新空out run2で成功した。別codec/pathへの置換や検査の無効化はしていない。

[固定P3-REPRODUCE](https://github.com/Kushyameln01/kushyameln-works/blob/8849891f19124df31847bd691503c2491278eaa8/development/ai-connection/p23-joint-acceptance/P3-REPRODUCE.md)に従い、管理rootで必要objectを取得する。

```sh
git fetch origin fc2789a0f649e33f15eb13750e6a983b5c52d170 \
  5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 \
  82b21f09cb63926543181b16f0e97ebc6b9fa6be \
  0c27874908638afc748ea2455a2779a16736730b \
  2bdca59ea78580d4fe7a9d31a8de33209b64d029
```

必要な私有入力は選択light/HIGH `.safetensors`、真正 `base-blocks.json`、`HIGH-fixed/reference` のreference/gates JSONと既存9配列、隣接 `HIGH-fixed/result.json`。選択Fileだけを新browser loadでhashする。4原本や全baseの再hash、期待値の作り直しは不要。`base-blocks.json` はmode600、outは未存在または空で、全てsource tree外に置く。

## 今回の実行command

cwdは `/workspace/work/lora/manager-884989`、HEADは上記884。Playwright既定pathは `/opt/codex/cua_node/lib/node_modules/playwright`、Chromiumは `/usr/bin/chromium`。別環境では正本の `LORA_PLAYWRIGHT_MODULE` / `LORA_CHROMIUM_PATH` を用いる。

```sh
node tools/ai-connection/run-managed-lora-data-real.mjs \
  --lora-root /workspace/work/lora/p3-owner-fc278 \
  --diffusion-root /workspace/work/lora/nonrect-peer-5f880 \
  --artifact /workspace/work/lora/nonrect-received/base-blocks.json \
  --reference-root /workspace/work/lora/e1-joint/HIGH-fixed/reference \
  --file /workspace/work/lora/light-safetensors/Bernini-R_LightX2V_high_noise.safetensors \
  --pair light --side HIGH \
  --expected-sha256 9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945 \
  --out /workspace/work/lora/p4-adapter-task/manager884-run-2
```

今回のrun2 directoryは既に成果を保持するため、再実行には必ず別の新空outを指定する。原本とbaseはFile picker経由で入り、HTTP sourceとして配信しない。loopback以外のbrowser requestは拒否される。

## 確認する返却

exit0、`PASS_MANAGED_FORMAL_DATA_REAL_BASE_PARTIAL_SNAPSHOT`、6公開case、native prepare/stage7、base restore1、baseline別、baseline後native commits7、oracle0を確認する。pre-native expected改変拒否、checkpoint取消・復帰、prepared/source解放後copy、不変base復帰、最終disposeを別の観測として確認する。

`initial-one` のE4保存8ファイルは実diskから読戻される。output16のbytes/hashとsnapshot ID/hash、tamper `ASSET_HASH_MISMATCH`、missing snapshot `REQUIRED_ASSET_MISSING` を確認する。selected-weight package受入として扱わない。各artifact/packageのlength/hash/readbackは [artifact-package-manifest.json](evidence/artifact-package-manifest.json) に保持した。私有完全resultは `/workspace/work/lora/p4-adapter-task/manager884-run-2/result.json`、公開lossless metadataは [run-result.json.gz](evidence/run-result.json.gz)。原本やW/b binary、package binaryは公開archiveに含めない。

source closure、DATA/codec originとdeployment、各caseのphase/snapshot/manager/SDK/consumer/queue対応は [receipt.json](evidence/receipt.json) と [sources.json](evidence/sources.json) を参照。metadata gzipと公開fileのbytes/SHA-256は [MANIFEST.json](evidence/MANIFEST.json)。gzipを展開した内容は64,415,767 bytes、SHA-256 `123538bcf1aac5df2f2c26d6d989378b5e04efd2b96260e787ab279c61481d50`。

独立監査は保存済みsource/artifact/packageと16出力の読戻しで、再推論や新期待値生成をしない。[監査JSON](evidence/manager884-run-2-independent.json) と[監査本文](evidence/manager884-run-2-independent.md)に152項目の結果と範囲を記録した。正本手順にある既存node test suiteは今回再実行しておらず、その過去PASS件数を新数値実行件数へ加えない。

従来dd95/28f/60dの証拠はその版のまま保持する。今回の結果を新P4、他side/pair、全target/full model、selected-weight E4、lease、生成へ拡張しない。source取得、runtime正式bridge受入、管理担当の受領・採用ACKを区別する。
