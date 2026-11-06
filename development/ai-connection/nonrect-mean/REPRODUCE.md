# 非正方形meanとLoRAの共同受入を再現する

Linux/Node24.19.0、Chromium154.0.8037.57、Playwrightの既存配置を使用。LoRA製品コード・Hike再build・NN再実行は不要です。

```sh
git fetch origin feat/lora-hike codex/diffusion-e0-e7
git switch --detach e66733a74a24405091e25805e7985d11a77683cd
git worktree add --detach ../diffusion-5f880 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3
node tools/ai-connection/test-lora-nonrect.mjs --help
```

Diffusionの[受渡しPage](https://chatgpt.com/space/page_2b15f0bb13288191837ee215949aa89d)から709,364-byteのprivate JSONを取得し、SHA `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`を確認してください。raw artifactはGit外のprivate directoryへ保存し、ファイルmodeを0600にします。runnerもbytes/hash/権限を再検査します。公開GitやHTTP endpointには置きません。

LoRAの[引継ぎPage](https://chatgpt.com/space/page_4988393f36e88191bcf7c0823139d1f3)から数値archiveを取得し、そのmanifestで全fileを検査してください。archiveの `reference-root/HIGH-fixed` と `reference-root/LOW-fixed` は、受入済み0c27874のresult.jsonとreferenceディレクトリを含みます。runnerはこの二つのJSONを固定Git blobと照合し、全期待値配列もSHAで検査します。以前の個別HIGH/LOW archiveを同じ構造へ展開しても利用できます。独立期待値を今回の出力から作り直しません。

利用者が持つ4実LoRAは従来どおり `light-safetensors/` と `detail-safetensors/` に置きます。ファイル名は[旧再現手順](../../lora/REPRODUCE.md)の一覧を参照。新規に捕捉した各Fileの全体hashは必須です。

```sh
node tools/ai-connection/test-lora-nonrect.mjs \
  --peer-root /absolute/path/diffusion-5f880 \
  --peer-commit 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 \
  --artifact /absolute/private/base-blocks.json \
  --reference-root /absolute/private/unpacked/reference-root \
  --lora-root /absolute/path/to/lora-originals \
  --out /absolute/private/new-joint-evidence
```

`--out` はGit/source/referenceの外側の新しい空ディレクトリを指定します。既存の失敗結果を上書きしません。Playwrightの既定moduleは `/opt/codex/cua_node/lib/node_modules/playwright`、Chromiumは `/usr/bin/chromium`。必要なら `LORA_PLAYWRIGHT_MODULE`／`LORA_CHROMIUM_PATH` で変更できます。

runnerは自身と全配信sourceのGit blob一致を要求するため、変更を加えた場合は先にcommitし、新しい実行sourceとして記録します。raw artifactはFile入力でのみブラウザへ渡し、入力のHTTP GETを提供しません。固定独立参照はloopback GET、選択出力の回収はサイズ制限付きloopback POSTです。新しい出力はprivate modeで保存し、所有server/browserをfinallyで終了します。

期待結果は `PASS_EXISTING_RECT_MEAN_AND_PARTIAL_LORA`、jointCases20、meanBeforeCases7、meanAfterCases7、nativeAPICases4。`result.json` に全16出力、元shape/slice/除外、source hash、所有権と取消・復帰、mean前後のmetadata/hashを保存します。選択した全actual配列は `actual/`。同一browser内の前後比較であり、persistent mean instanceや共通管理snapshotの試験ではありません。

単独受入と契約確認は次の既存commandです。Nodeのowner test entryは結果fileをpeer tree内へ書くため、分離したcheckoutで実行し、候補sourceと結果を区別してください。ブラウザ出力はprivate pathへ保存できます。

```sh
DIFFUSION_SOURCE_ROOT=/absolute/path/diffusion-5f880 node --test tools/ai-connection/test-diffusion-diagnostic-adapter.mjs
node --test tools/ai-connection/test-joint-comparison.mjs
```

peerのルートから:

```sh
node docs/shared/diffusion-models/latent-space/test-rect.mjs
node docs/shared/diffusion-models/latent-space/test-f1.mjs
node docs/shared/diffusion-models/latent-space/test.mjs
python tools/diffusion-models/e6-api-browser.py --output /absolute/private/mean-api.json
BERNINI_E1_BLOCK_ARTIFACT=/absolute/private/base-blocks.json node --test --test-isolation=none docs/shared/diffusion-models/lora/test-base-block.mjs
python tools/diffusion-models/test-base-block-browser.py --artifact /absolute/private/base-blocks.json --output /absolute/private/block-browser.json
```

原本全モデルの再download/hash、全推論、生成・sample decode、二組合成、merge/deployは実行しません。fragment・合成fixture・実4原本・mean境界の各scopeを個別に判定します。
