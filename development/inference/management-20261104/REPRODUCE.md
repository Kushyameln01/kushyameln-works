# 再現手順

固定したowner実行sourceのworktreeから実行する。配布commitと実行source commitは引継ぎで別記する。以下の `<OWNER_EXECUTION_SHA>` は、harness・native API・Worker・WASMを含む実行sourceの完全SHAである。現在のHEADを無条件に代入しない。

## NNなしの変更境界

```bash
node tools/inference/management-connection/test-bridge.mjs
```

実管理sourceと実Diffusion capture sourceは取得済みGit objectから読み出す。通常repoへ管理実装を模造・展開しない。testは一時directoryへ実closureを展開し、終了時に削除する。モデルexecutorはcontrolled fixtureであり、NN受入とは別である。

## 実管理sourceの準備

必要なGit objectは管理 `e1661e561dfb1a4f20544ff48bc375175b5981d1` とDiffusion `ffeeeedb6b57d182a977c3ac02c042ce235fc87a`。未取得なら対象commitをGitHubから取得してから実行する。

```bash
node tools/inference/management-connection/prepare-source.mjs \
  --repository-root "$PWD" \
  --output /tmp/kw-management-source-NEW
```

新しい出力先が必要である。`management/ACQUISITION.json` と `diffusion/ACQUISITION.json` にpath・bytes・SHA-256・Git blob SHAを保存する。この工程でNN・exportは起動しない。

## Rectの実ブラウザ部分接続

既存accepted bundleと、別工程でDiffusion Hikeの復元を一度だけ実行して保存したsynthetic generated-sample契約fixtureを使う。新しいexportや実生成は行わない。

```bash
python tools/inference/management-connection/run-browser.py \
  --scope rect \
  --execution-source-sha <OWNER_EXECUTION_SHA> \
  --sources-root /tmp/kw-management-source-NEW \
  --vae-bundle /workspace/work/inference/e6-rect/accepted-bundle \
  --generated-input /workspace/work/inference/management-20261104/generated-fixture/raw-generated.wktensor \
  --output /workspace/work/inference/management-20261104/rect-browser-NEW
```

先に `--preflight-only` と別の新規outputを指定すれば、source／構成／対応外shape／解放をWorker・NNなしで確認できる。実行時はChromiumとPython Playwrightが必要で、他のNNと直列化する。

実行順は実session-createdでの取消→回復Rect encode→同meanのdecode→保存済みraw生成sample契約fixtureのdecode→WKTと管理ZIP保存・読戻し→dispose。PNG入力／全mean／全RGB参照はrepoの `development/inference/e6/fixtures/` を再利用し、既存 `atol=rtol=maxAbs=2e-5` で比較する。独立参照とgateはこの開発harnessだけが使用し、通常bridge入力へ渡さない。

raw生成sample契約fixtureのdecodeは実VAE処理とbinding／保存を検証する。実producerによる生成の受入、全体生成実験、LoRA運用成功は認定しない。

## Textの実ブラウザ部分接続

```bash
python tools/inference/management-connection/run-browser.py \
  --scope text \
  --execution-source-sha <OWNER_EXECUTION_SHA> \
  --sources-root /tmp/kw-management-source-NEW \
  --text-bundle <EXISTING_SELECTED_PREPARED_BUNDLE> \
  --text-source /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --text-reference <EXISTING_HELLO_WORLD_INDEPENDENT_REFERENCE_DIRECTORY> \
  --output /workspace/work/inference/management-20261104/text-browser-NEW
```

参照directoryは既存 `plain-input.json`、`reference-results.json`、`plain-reference.f32` を持つものを使う。選択manifestがその参照と結び付いていることを確認する。plain Hello worldと、同じtokenIds／maskを直接渡すID入力をそれぞれ実行し、全2,097,152値を同じ独立参照と既存 `atol=rtol=maxAbs=0.001` で比較する。このID入力はHello worldのmaskであり、全512token有効の数値受入へ拡張しない。

両出力のmask・model／Tokenizer・最終RMSNorm markerを管理ZIP／native WKTから読戻し、実Diffusion P4 captureへ渡す。投影・cross-attention・FFNは実行しない。

各runの `result.json` は実行source、全served source bytes／SHA-256、元入力取得情報、比較、保存物、Worker／session観測、取消barrier、process所有とlive／zombie、100ms samplerの資源測定を分けて持つ。正常Workerはsession release数、取消Workerはhard terminationの観測を確認し、取消時に未取得のsession releaseを成功扱いにしない。
