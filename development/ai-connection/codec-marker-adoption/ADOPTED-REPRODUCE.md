# 採用したcodecの再現

実装checkoutを `830e58bbe1e9d783910cfc0a9c6bf8cf45071c58` に固定する。codecは管理に同梱され、外部codec-rootの準備を既定の保存処理に要求しない。source原本は2bd / SHA d82、schemaはWKTSR001/schemaVersion1。

## 単体・保存境界

```sh
node --test --test-isolation=none \
  tools/ai-connection/test-adopted-wktensor.mjs \
  tools/ai-connection/test-managed-storage-codec.mjs
```

原本byte exact、旧wire、normalized marker、改変source拒否、両scenarioの実selectorからE4保存読戻し、codec flagsの片方だけの入力拒否を確認する。全回帰は `../norm-receipt-adoption/REPRODUCE.md` のnative環境変数をそのまま用い、371 PASS/skip0。旧codec固定のWORKS_NATIVE_CODEC_PATHを新codecへ一括変更しない。

## Rectの実管理保存

```sh
node tools/ai-connection/rect-management-runner.mjs \
  --diffusion-root "$NATIVE_5F" \
  --vae-root "$NATIVE_855" \
  --manager-commit 830e58bbe1e9d783910cfc0a9c6bf8cf45071c58 \
  --output "$FRESH_RECT_DIRECTORY"
```

期待値は4package complete、normalizedPackageGate complete、新source2bd/d82、旧legacy probeはmarker mismatch/書込み0、store/cache残留0。既存ownerの128値normalize/restoreと保存を確認する。VAE encode/decodeは呼ばないため、result全体のPARTIALは実NNの未受入を表し、codec保存の失敗ではない。

## LoRAの既定保存

既存の実ローカルFile選択JSONを使用し、以前必要だったcodec-root/codec-commitは指定しない。

```sh
node tools/ai-connection/run-managed-local-files.mjs \
  --scenario snapshot-candidate \
  --lora-root "$NATIVE_FC" \
  --lora-commit fc2789a0f649e33f15eb13750e6a983b5c52d170 \
  --diffusion-root "$NATIVE_5F" \
  --diffusion-commit 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 \
  --inputs "$PRIVATE_INPUT_SELECTION" \
  --out "$FRESH_LORA_DIRECTORY"
```

result.storageCodec.modeがbundled-adopted、codecCommitが2bd、savedPackageがcompleteであることを確認する。実Fileのbytes/hashとnativeのmanager/local revision/所有権は元の検査を維持する。元Fileやweight/base blockは公開Gitへ追加しない。ここでのbaseは明示synthetic control。

legacy scenarioも同じ省略で新codecを使う。既存採用組合せを使う場合のnative pinはLoRA `0c27874908638afc748ea2455a2779a16736730b`、Diffusion `438972f30242e0a3bc66edb8591f38eaa0fcd384`。外部codecを明示して旧回帰を行う場合だけ、従来のcodec-root/codec-commitを両方渡す。modeはexternal-explicitとなる。

実browser経路は既存Chromium/Playwrightと独立参照のPython依存を使用する。model uploadや遠隔Drive入力を追加しない。raw/normalized/producer/decoder/mask/frame情報とnative evidenceは既存の意味を保持する。
