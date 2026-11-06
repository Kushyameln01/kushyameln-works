# 再現手順

管理の実行sourceを完全SHAでcheckoutする。配布記録commitと実行sourceを混同しない。完全SHAは配布RESULT／HANDOFFとDraft PR本文に記載する。

## 管理画面

```bash
git checkout --detach <MANAGEMENT_EXECUTION_SOURCE_SHA>
python3 -m http.server 8765 --directory docs
```

`http://127.0.0.1:8765/ai-connection/modules/`を開く。既存の管理参照画面からのlinkでも移動できる。Text／VAEのmanifest Fileと相対pathを保つ資材フォルダ、必要な元モデルFileを選ぶ。Diffusionは完全なHIGH／LOW pairをFileで選ぶ。入力・使用可能な操作・保存については[API.md](API.md)。重み／graph資材の取得確認と、ソースを取得した確認は別にする。

このserverはCOOP／COEPを加えない。1-threadを明示して使う。4-threadは別途実際にCOI／SABが成立する環境が必要で、選択不可時に自動で1-threadへ変更しない。GitHub Pagesへの公開はこの手順に含まない。

最新Text／VAEの配布は20f640a6e071b6c060a212e89b28f0c8965923f7。必要なモデル／graph資材とasset hashはowner manifestを正本にする。ファイル名の一致だけで資材検証済みとはしない。資材が足りない場合はnativeの理由を表示し、合成FileでNNを代用しない。

## 新規制御試験

```bash
node --test --test-isolation=none \
  tools/ai-connection/test-text-vae-standalone.mjs \
  tools/ai-connection/test-diffusion-public-normalization.mjs \
  tools/ai-connection/test-operational-management.mjs
```

Text／VAEとcontrollerのnative呼出しdoubleは明示的な制御専用seam。数値成功の証拠ではない。meanのowner support／native codec等は実固定sourceを使う。これらの新規試験に原本モデル・旧固定sourceの外部rootは不要。

## 実ブラウザの操作・保存試験

必要環境はNode、`/opt/codex/cua_node/lib/node_modules/playwright`、`/usr/bin/chromium`。HTTP loopbackとChromium起動ができる環境で、未使用のoutput directoryを指定する。

```bash
node tools/ai-connection/run-operational-browser.mjs \
  --manager-commit <MANAGEMENT_EXECUTION_SOURCE_SHA> \
  --out /tmp/fresh-operational-ui-control
```

このrunnerは画面のFile選択・設定・能力照会・実Hike変換・取消／復旧・実tensor保存／fresh File読戻し・workspace保存／fresh controller復旧を操作する。Text／VAEの公式manifestも実Fileで設定し、実能力と資材不足／不正入力・shapeの理由を確認する。Text／VAEモデル資材のbytes検証、encode／decode NN、Diffusion正常load／NN／sample生成は実行しない。

無効8B model pairと合成raw128／Text packetを使う制御試験である。これらを実モデルや生成物の来歴と呼ばない。各取得sourceを固定commitのbytesへ照合し、実Worker closeをbrowser終了前に記録する。`result.json`、実保存File、workspace、screenshotをfresh outputへ残す。

`--development`は開発中sourceを明示して動かすだけで、`fixedSourceVerified:false`となる。固定sourceの検証には上記`--manager-commit`を使う。

## 実Diffusionを保持環境で確認する場合

実モデルpair／保存N5入力を持つ環境で、同じ管理実行sourceをcheckoutする。保持環境の絶対pathだけでこちらへ取得済みと記録しない。全原本の管理環境への複製は必要ない。

既存[実モデルrunner手順](../diffusion-public/REPRODUCE-HOLDING.md)を同じ固定sourceに対して使用できる。固定ownerのGit object `b6e166478a8e072c9ffd3ce562bfdb0c89634920`も用意する。

```bash
node tools/ai-connection/run-diffusion-public-browser.mjs \
  --source-commit <MANAGEMENT_EXECUTION_SOURCE_SHA> \
  --manifest /path/to/retained/n5-real-l512/inputs.json \
  --models /path/to/retained/bernini \
  --mode sample --cancel-before-run \
  --wasm-threads 1 --coi false \
  --private-output /tmp/bernini-management-private/fresh-values \
  --output /tmp/fresh-managed-one-thread.json
```

private parentは0700、出力名は未使用にする。これは実adapterの部分接続を検証するrunnerであり、新画面からの全体運用やLoRA適用を代替しない。返却時は配布／実行source／owner SHA、入力identity、実COI/SABとthreads、progress、取消終端・実close・reload、sampleのraw意味、保存実File／hash／読戻し、資源の観測scopeを分ける。

## 管理採用と受入待ち

b6公開consumerと専用port経路を使う。旧「公開consumerなし」はffe版の履歴で、現在の不足理由ではない。通常P4も独立した正規marker対応pinを使う。採用版・codec・port ownershipの実装確認と、資材保持側での新固定管理source実NN結果は分ける。

保持環境にはモデル・保存入力が存在することをowner資料で確認済み。source checkout・実行窓口と返却receiptを受け取り、現在の管理sourceによるNNを受け入れる。管理環境にないことを資材自体の不存在と呼ばない。現在の具体的な実行・返却条件は../latest-adoption/のhandoffを正本にする。

全体接続実装のレビュー完了と全体運用未検証を区分し、新しい試験LoRAの受領・全体実験は指定順序を守る。モデルや入力の再取得を、固定sourceの取得確認へ追加しない。
