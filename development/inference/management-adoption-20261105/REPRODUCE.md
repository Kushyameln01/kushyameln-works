# 再現・取得確認

受領確認には各indexのpath／bytes／SHAを使う。原寸VAE再export、Text再encode、参照再生成は不要。以下の構成・保存検証もNN0である。

## 新manifestの実選択と現codec

固定配布sourceから実管理closureを準備する。管理sourceはe166、数値modelの取得はしない。

```bash
node tools/inference/management-connection/prepare-source.mjs \
  --repository-root "$PWD" --output /tmp/kw-adoption-sources-NEW

node tools/inference/management-connection/verify-adoption.mjs \
  --management-root /tmp/kw-adoption-sources-NEW/management \
  --text-bundle /path/to/existing-source-ordered-bundle \
  --text-source /path/to/original-umt5.safetensors \
  --execution-source-sha <FIXED_CLI_SOURCE_SHA> \
  --output /path/to/new-private-adoption-run
```

bundleはmanifest420eと既存prepared27資材を持つdirectory。元modelは6,735,906,897B。Node24 `openAsBlob.size`の4GiB wrapを避け、元modelだけ既存の `openPositionalSource` へ渡す。実fstatでsizeを検査し、構成・保存確認ではmodel読取り0のままcloseする。宣言sizeの偽装、modelの再取得、18.5GB graph全hashの再計算はしない。通常encodeが実行される場合の元asset／実行graph hash検証はnative loaderが引き続き担当する。

CLIは旧configureの互換成功と新configureを区別し、実manifest bytes→native inspector24binding→configure戻りcapabilitiesを照合する。その後、保存済み実長文L512と既存normalized meanを実管理capture／package保存／実disk読戻しへ通す。全payload word、mask、識別、marker、外側traceを比較する。optional実source-F4 WKTを持つ場合だけ `--frame-tensor` を指定できる。未供給時はNOT_CHECKEDであり、frame／slot fixtureを生成しない。

source取得の負例はモデル不要。保存integrationの1件も実行する場合は保持済み実資材を明示する。未指定時、その1件はSKIPとして表示されるので全9件合格とは数えない。

```bash
KW_ADOPTION_TEST_BUNDLE=/path/to/existing-source-ordered-bundle \
KW_ADOPTION_TEST_SOURCE=/path/to/original-umt5.safetensors \
node --test tools/inference/management-connection/verify-adoption.test.mjs
```

## 最新P4通常入力

このdirectoryの `p4/acquisition.json` と、[固定source取得・CLI手順](../../../tools/inference/management-connection/verify-normal-p4.md)を使う。固定Diffusion b6eの全source／runtime assetをGit bytesへ照合してからimportする。

管理packageの `artifacts/0/tensor.wktensor` は現codecで保存された実conditioningである。必要ならこの1entryだけを新しいprivate pathへ取り出し、同じCLIの `--tensor` へ渡せる。保存・読戻しの同一性はadoption receiptに記録する。

```bash
node tools/inference/management-connection/verify-normal-p4.mjs \
  --diffusion-root /path/to/acquired-b6e-source \
  --acquisition development/inference/management-adoption-20261105/p4/acquisition.json \
  --tensor /path/to/conditioning-from-management.wktensor \
  --owner-root "$PWD" --output /path/to/new-normal-p4-receipt.json
```

これは通常metadata対応判定と通常native snapshot／protected captureの情報保全確認であり、model factoryやP4数値演算は呼ばない。固定fixture hashは開発再現用に限定し、通常APIへ要求しない。

## 実raw sampleの受領後

原本WKT1179Bを[取得状況](sample/availability.json)のwhole／payload SHA、shape、meaning、latentContractと照合する。contextが原本にない場合は追加しない。既存Rectを構成して `querySupport('vae','decode',describeTensor(raw))` を確認し、同じrawをdecodeする。`save({records:{rgb},inputs:{[inputArtifactId]:inputRecord}})` で元rawとRGBを共に保存する。追加復元やmeanへの改名は不要。

今回この原本は未取得。上記は既存実APIによる受領後の実行方法で、今回decodeを実行した証拠ではない。synthetic受入とは分ける。
