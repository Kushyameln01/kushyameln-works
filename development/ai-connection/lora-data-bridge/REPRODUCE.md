# 正式LoRA DATA bridgeの再現

採用記録の `implementationCommit` に管理checkoutを固定する。DATA実装は
`82b21f09cb63926543181b16f0e97ebc6b9fa6be`、引継ぎ本文は
`82cd9bb3d6792fa20a5305f52198efca5a30459f`。両者を実行native pinと混同しない。
管理にはDATAの2moduleを同梱している。製品入力は従来どおりユーザーが選ぶローカル
`.safetensors`で、以下の合成入力は開発時の取引制御検証に限る。

## source・宣言境界

repository rootで実行する。Nodeのtest isolationを無効化しているのはこの実行環境の
子process制約のためで、native処理の置換ではない。

```sh
node --test --test-isolation=none \
  tools/ai-connection/test-lora-admission-data-sources.mjs \
  tools/ai-connection/test-lora-data-source-proof.mjs \
  tools/ai-connection/test-loader-norm-fields.mjs
```

原本2moduleの実bytes・SHA・blob、runtime proofのbrand、改変・欠落拒否、観測と宣言の
不一致、取得元欠落を確認する。これだけでは共同native取引の受入にはならない。

## 実native共同取引

固定commitのsource treeを3つ用意する。既存checkoutがある場合はその実bytesをrunnerが
Git objectへ照合するので再取得不要。新しい環境では同repository内で次のように分離できる。

```sh
git worktree add --detach /tmp/works-r6-native-lora fc2789a0f649e33f15eb13750e6a983b5c52d170
git worktree add --detach /tmp/works-r6-native-diffusion 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3
git worktree add --detach /tmp/works-r6-owner-data 82b21f09cb63926543181b16f0e97ebc6b9fa6be
node tools/ai-connection/run-lora-data-joint.mjs \
  --lora-root /tmp/works-r6-native-lora \
  --diffusion-root /tmp/works-r6-native-diffusion \
  --admission-root /tmp/works-r6-owner-data \
  --out /tmp/works-r6-joint-result.json
node tools/ai-connection/run-lora-data-joint.mjs \
  --lora-root /tmp/works-r6-native-lora \
  --diffusion-root /tmp/works-r6-native-diffusion \
  --admission-root /tmp/works-r6-owner-data \
  --scenario postpublication-audit-failure \
  --out /tmp/works-r6-postpublication-result.json
```

実行nativeは固定のSDK、LoRA Hike、ORT WASM、projection Hike、consumer。HIGH/LOWは
別SDK・queue・owner・resource・consumer namespaceを持つ。旧jointを正式bridgeで公開した後、
新jointでHIGHを実commitしてからLOWを失敗させる。HIGHのnative rollback、実ORT feedの復元、
双方の元task終端と資源解放を確認する。旧snapshotの存在と、新選択により旧selectionが
currentではなくなったことを別々に記録する。

後者のscenarioは実finalize・prepare release後にoutside consumer tokenだけを変更し、
正式bridgeの `LORA_DATA_CONSUMER_CHANGED` を記録する。実publicationを保持したまま
`RECOVERY_REQUIRED`で新規workを拒否し、元token復元後に同じsnapshotの監査だけを再実行する。
native commitは2回のまま、rollbackは発生しない。

sourceは合成BF16 rank128、baseは合成immutable F32。既存6件の真正base数値証拠を
この新bridge実行として付け替えない。今回の81920 weight＋16 bias比較はこの合成fixtureの
各side・各revisionに限り、16出力だけでweight/bias比較を代替しない。

## 全回帰と未受入

全回帰のnative環境変数は
[`../norm-receipt-adoption/REPRODUCE.md`](../norm-receipt-adoption/REPRODUCE.md)
の固定pinを維持する。追加の `WORKS_LORA_ADMISSION_ROOT` は上の82b owner-data rootとする。
共同試験を単独で実行する場合は次を用いる。

```sh
WORKS_SNAPSHOT_LORA_ROOT=/tmp/works-r6-native-lora \
WORKS_SNAPSHOT_DIFFUSION_ROOT=/tmp/works-r6-native-diffusion \
WORKS_LORA_ADMISSION_ROOT=/tmp/works-r6-owner-data \
node --test --test-isolation=none tools/ai-connection/test-lora-data-joint-native.mjs
```

```sh
node --test --test-isolation=none tools/ai-connection/test-*.mjs
git diff --check
```

全query/head/stage、本番hidden、組合せ資源予算、真正baseの新規組合せ、全model session、
生成受付はこの検証に含まれない。`PARTIAL`・`SNAPSHOT_PUBLISHED`だけで生成受付を解除しない。
selected-weight artifactと出力16の保存packageは別物で、今回の正式DATA取引に
出力16 packageを `N-ARTIFACT` 証拠として付けていない。
