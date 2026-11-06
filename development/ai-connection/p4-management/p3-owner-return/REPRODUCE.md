# P3 owner返却の照合を再現する

通常は受領済み返却の照合だけを行う。以下のverifierは原本・base・reference binary・E4 binaryを開かず、nativeを実行しない。

```sh
python verify-owner-return.py \
  --repo <repository-with-all-fixed-Git-objects> \
  --received <acquired-tree-with-repository-relative-paths> \
  --output <public-verification-packet-directory>
```

取得元は配布 `a80db72feea60b9bd69e292e4716665c6f0ee77f` の `development/ai-connection/lora-p4-adapter/manager-884/` 全13path。`--received` はそのrepository-relative階層を保つ。Git objectは実行884、native fc/5f、DATA82b、codec2bd、reference0c、旧dd95のものも必要となる。verifierはPython標準library、Git、Node24の保存JSON用canonical serializerだけを使用する。

最終確認は186/186 PASS。`VERIFICATION.json` にverifier自身のSHA-256と全検査項目、`PACKET-MANIFEST.json` に配布packetのlength/hashを記録する。raw gzipと展開JSONはGit originのbytes/hashを照合するが、本packetへ再配置しない。私有絶対pathを含む原監査・失敗ログも再配布しない。

## 元ownerが使った884の正本route

今回このrouteを管理側で再実行する必要はない。将来、別途実数値再現が必要となった場合だけ、元ownerの[固定REPRODUCE](https://github.com/Kushyameln01/kushyameln-works/blob/a80db72feea60b9bd69e292e4716665c6f0ee77f/development/ai-connection/lora-p4-adapter/manager-884/REPRODUCE.md)と[884正本P3手順](https://github.com/Kushyameln01/kushyameln-works/blob/8849891f19124df31847bd691503c2491278eaa8/development/ai-connection/p23-joint-acceptance/P3-REPRODUCE.md)を使う。

cwd/HEADは管理 `8849891f19124df31847bd691503c2491278eaa8` の固定checkout。管理rootのGit databaseにも、次の原commitが必要である。

```sh
git fetch origin fc2789a0f649e33f15eb13750e6a983b5c52d170 \
  5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3 \
  82b21f09cb63926543181b16f0e97ebc6b9fa6be \
  0c27874908638afc748ea2455a2779a16736730b \
  2bdca59ea78580d4fe7a9d31a8de33209b64d029
```

次は元owner commandの引数・固定値を保ち、private絶対pathだけをplaceholderに置き換えたものである。

```sh
node tools/ai-connection/run-managed-lora-data-real.mjs \
  --lora-root <fixed-fc2789a0-root> \
  --diffusion-root <fixed-5f880fd8-root> \
  --artifact <private-base-blocks.json> \
  --reference-root <private-HIGH-fixed/reference> \
  --file <private-Bernini-R_LightX2V_high_noise.safetensors> \
  --pair light --side HIGH \
  --expected-sha256 9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945 \
  --out <new-empty-private-output>
```

この正本routeを数値再実行する場合には、owner環境の既存独立9配列とreference/gate/旧receiptを使う。期待値やgateを生成し直さず、mode600の真正bounded baseと選択light/HIGH File1件だけをsource tree外に置く。4原本・全base hashは条件にしない。元run2を上書きせず、新しい空outを使う。Playwright／Chromiumは正本の既定値または `LORA_PLAYWRIGHT_MODULE`／`LORA_CHROMIUM_PATH` を用いる。

返却条件は正本のまま、6公開case、prepare/stage7、別base restore1、expected-payloadのprepare前拒否、取消・復帰、copy所有権、8ファイルE4新規保存・実disk読戻し、2種の拒否、全disposeである。本packetでは、その成立済みowner実行を照合して受け入れ、重複する管理側実行を避けた。
