# normalized marker修正と管理への受渡しの再現

この手順はmetadata保存・入力設定・既存asset識別を確認する。NN、export、Text24層推論、実generated sample、ブラウザ全工程は実行しない。管理sourceとモデルassetの取得は明示的に別途行い、公開Gitには大きなmodel/graphを含めない。

## sourceを固定する

管理sourceは`edda43f9ea69c5b3ab1af3c6eb82295f2912887c`。GitHubから取得できる[固定source ZIP](https://codeload.github.com/Kushyameln01/kushyameln-works/zip/edda43f9ea69c5b3ab1af3c6eb82295f2912887c)は19,700,303 bytes、SHA-256 `c74e29df47e1da2819b663daab7c35c0ec1a5e07c44f835eba5ad735ed7be3e6`。展開先を`WKW_MANAGER_ROOT`とする。受取側は自分の環境にある実ファイルを指定する。他環境の絶対pathの存在は前提にしない。

新codecのsourceは`2bdca59ea78580d4fe7a9d31a8de33209b64d029:docs/shared/inference/tensor.mjs`、SHA-256 `d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5`。以下のhelperは旧pinを置換せず、新sourceRefを明示して管理registryに注入する。管理coreや履歴receiptは変更しない。

## codecと管理E4

Node24でrepository rootから実行する。`node:test`を各ファイルで直接実行するため、test runnerの子processを必要としない。

```sh
node tools/inference/test-normalized-marker.mjs
node tools/inference/test-connection-contract.mjs
node development/inference/codec-marker-handoff/test-manager-e4.mjs --manager-root "$WKW_MANAGER_ROOT" --output "$WKW_FRESH_E4_OUTPUT"
python tools/diffusion-models/build-info.py --check
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests
```

E4出力先は未作成のdirectoryを使う。helperが固定管理moduleと新codecのbytes/hashを照合し、既存Diffusion receiptのnormalized128値を再利用して、実管理capture/storeとpackageの保存・回収を行う。正規化・復元の数値計算やVAE decodeを再実行しない。新registryでのmarker付き往復、旧registryでのsource不一致、旧writerによるmarker欠落の拒否を別に確認する。packageの`complete`はこの保存単位の復元結果であり、全工程・実生成・別環境asset受入ではない。

## 既存Rectの実assetと管理File入力

[INPUTS.md](INPUTS.md)でMapキーとUI操作を確認する。`WKW_RECT_BUNDLE`、`WKW_TEXT_BUNDLE`、`WKW_TEXT_SOURCE`は受取側の実pathを設定する。Text元モデルをRAMへ一括展開せず、実File/BlobをMapに保持する。

入力probeはNode24、Python3の`playwright`、実Chromiumを使う。Pythonは既定`python`、ブラウザはPATH上の`chromium`。必要なら`WORKS_INPUT_PYTHON`と`CHROMIUM_BINARY`で受取側の実pathを指定する。ローカルHTTPは固定moduleだけを配信し、model/graphをuploadしない。実ブラウザのfile inputへ既存ファイルを選択してからconfigureを呼ぶ。

```sh
python development/inference/codec-marker-handoff/check-rect-assets.py --bundle "$WKW_RECT_BUNDLE" --output "$WKW_FRESH_ASSET_RECEIPT"
node development/inference/codec-marker-handoff/check-manager-inputs.mjs --manager-root "$WKW_MANAGER_ROOT" --native-root "$WKW_NATIVE_ROOT" --rect-bundle "$WKW_RECT_BUNDLE" --text-bundle "$WKW_TEXT_BUNDLE" --text-source "$WKW_TEXT_SOURCE" --output "$WKW_FRESH_INPUT_RECEIPT"
```

asset probeはmanifestと4assetの実bytes/hashをstream照合する。configure probeは実管理adapterから独立native moduleへ実File/Mapを渡す。Worker factoryは呼ばれたら失敗するため、モデルsessionやNNを起動しない。configure成功はasset全hash検証や推論成功と同義ではない。Textは選択manifestのhash・gateと必要fileの存在/長さを確認し、25GB相当の全payload再hashや全層推論を繰り返さない。

検証環境のNode24では6,735,906,897-byte原本を`openAsBlob()`すると2,440,939,601 bytesとなる制限を検出した。長さ不一致で拒否し、size偽装や切り詰めをしなかった。実Chromium Fileでは正しい長さを確認したため、このprobeはNodeの大容量Blob生成を使わない。[停止した試行](INPUTS.node-file-limit.json)は別scopeの記録として保持する。

別管理Codex環境で実行した場合は、受取側のsource SHA、manifest SHA、asset照合receipt、configure receipt、環境識別をACKとして保持する。この作業の同host管理source再現結果から、別環境ACKを作らない。
