# LoRA v2の取得と再現・検証手順

作業branchは `feat/lora-hike`、native契約は `lora-connection/2.0-draft.1`。SDK v1は既存の `docs/shared/inference/lora/sdk.mjs`、v2は同じdirectoryの `sdk-v2.mjs` を使用する。API正本は `docs/shared/inference/lora/CONNECTION_V2.md`、機械可読契約と原本台帳は `development/lora/contracts/` にある。

## 固定版を取得する

```sh
git clone --branch feat/lora-hike https://github.com/Kushyameln01/kushyameln-works.git
cd kushyameln-works
git switch --detach ee665398318cfbb60735de143566a737214281dc
```

この完全commitはv2実装、API、必要WASM、A0/L1の検証結果、E0/E1準備記録を含む。Draft PRの最終headには取得経路の記述と本手順の追補も含む。実装commit `89b489c6f2595ebff8836fe90b18fc94e3ea086b` と数値実装は同じであり、追補で実base共同成功を追加したものではない。

## Nodeでfixtureを検証する

確認環境はNode `v24.19.0`。Nodeの組込みtest runnerを使い、npm依存の追加やモデルのダウンロードは不要。

```sh
node --test tools/lora/test-*.mjs
node tools/lora/check-inventory-plan-v2.mjs
git diff --check
```

期待結果は74件PASS、fail0。後者のscriptは保存済みinventoryと固定論理target表から4原本のschema fixtureを再構成する。実原本payload・実base・実graphを検査したとは扱わない。数値fixtureは実Hikeと小さな合成非ゼロbaseを使用し、倍率、FULL/PARTIAL、全3binding、取消、旧plan、copy/lease、cleanup、v1互換を検証する。

## ブラウザパネルを検証する

```sh
node tools/lora/test-panel.cjs
```

確認環境ではPlaywrightを `/opt/codex/cua_node/lib/node_modules/playwright`、Chromiumを `/usr/bin/chromium` から使用する。scriptは一時HTTP serverを起動し、12項目を検証して終了する。別環境ではこれらの実行依存の配置を合わせる必要がある。元モデルはHTTP配信しない。fixtureは小さな一時safetensorsを生成し、実モデル推論は行わない。

パネルを手動確認する場合:

```sh
python -m http.server 8000 --directory docs
```

`http://127.0.0.1:8000/lora/` を開く。利用者のローカルフォルダーを選択する。実consumer未接続のまま適用は有効にならない。旧v1パネルはv2/staging-only接続を拒否し、v1 transactionの完了も生成snapshot公開とは区別する。

## WASM生成物と再build

実行に必要な `docs/shared/inference/lora/kernel/lora.wasm`、`host.mjs`、`registry.mjs` はrepositoryに収録済み。WASMは4919 bytes、SHA-256は `da6d56fca5d9bc91173681c22b91cd9337f53ea067d84455b9d659ee7ee52984`。

Hike原文は `tools/lora/kernel/lora.hike`、builderは `tools/lora/kernel/build.py`、版・hash・ABI・flagsは `tools/lora/kernel/build-record.json`。再buildのtoolchain配置と入力条件は `docs/shared/inference/lora/kernel/README.md` を参照する。

```sh
LORA_HIKE_TOOLCHAIN=/path/to/prepared-toolchain python tools/lora/kernel/build.py
```

必要なのは固定Hike commit `3c51fde6675f317453919bd505d0e2d0f638e7f1`、記録されたGo toolchainとWABT `1.0.39` 等。builderは依存を自動取得・インストールしない。既存生成物を検証するだけなら再buildは不要。Hike数値失敗をJS fallbackで成功させない。

## 実base共同試験の状態

`development/ai-connection/SOURCE-BASELINE.md`、`CONTRACT-MAPPING.md`、`JOINT-LORA-MATRIX.json`、`JOINT-LORA-RESULT.md` がE0/E1の記録。指定Diffusion commit `f522d9aeff313558c4ef83022a340af9a4c21391` の実registry/provider/sink/consumerとHIGH/LOW実baseは、記録時点で未受領だった。したがって共同数値比較、全出力、実consumerでの取消・復帰・leaseはNOT_RUN。

受領後に引数・element/byte単位・binding・scope・固定activation・使用強度・事前gate・base復帰口と所有権を照合する。対象は各原本Qの元shape `[5120,5120]` の先頭16行・全列とlightの明示Q bias。PARTIALを維持し、initializer/FULL限定のv1 adapterへ付け替えない。新規loadで必要な全体hash/header/range検査は維持する。全target・実model全session・生成への寄与はE9に残す。
