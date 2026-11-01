# 実L512 P4の再現条件

Node24、Python/NumPy、Playwright/Chromium、Gitを使う。既存の大モデルを再exportしない。
原モデルHIGH/LOWは保持済み各15,574,833,216 Bを使い、全file hashは再計算しない。
非公開の保存N2 artifact・prefix guard/E4資材は従来の保持環境が必要である。
公開receiptの要約から値を復元しない。sourceだけの取得をprivate値の取得ACKとは扱わない。
前提pathは元 [P4再現](../p4-cross-ffn/REPRODUCE.md) の保持資材に対応する。

## 軽い変更境界検査

```sh
PYTHONDONTWRITEBYTECODE=1 python development/ai-connection/p4-real-text-l512/reference/test-prepare-input.py
PYTHONDONTWRITEBYTECODE=1 python development/ai-connection/p4-real-text-l512/reference/test-run-reference.py
node --test --test-isolation=none docs/shared/diffusion-models/diagnostics/p4-real-text-l512/test-run.mjs
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/test-p4-real-text-l512-browser.py
```

private packet未配置のときは、その入力を必要とするtestがskip/限定検査となるため結果を区別する。
保持環境の記録ではskip0。全model推論のtest件数へ加算しない。

## 実行sourceと入力

base nativeの元実行sourceは `994ebb9ce01c9e95db9cd18eb877a981152693c5`。
その固定checkoutで実行するか、同一codeを使う新commitの実行として別receiptを作る。
driverの`--source-commit`は実際のHEADと一致しなければならない。

```sh
git worktree add --detach /tmp/p4-real-l512-repro 994ebb9ce01c9e95db9cd18eb877a981152693c5
cd /tmp/p4-real-l512-repro
PYTHONDONTWRITEBYTECODE=1 python development/ai-connection/p4-real-text-l512/reference/prepare-input.py --packet /path/to/f76/plain-conditioning.wktensor --output-dir /tmp/p4-real-l512-repro-inputs
```

元WKTは固定f76 `development/inference/p2-p3-acceptance/plain/evidence/plain-conditioning.wktensor`。
whole90f9aed…/payload107a34…/mask19ab437…をadapterが検査する。
生成native JSONは元と同じ8,604,657 B／SHA9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8になる。

## base参照をnative前に固定する

次のHIGH例をLOW・対応low-tailにも実行する。すべて新しい出力pathを使う。

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python development/ai-connection/p4-real-text-l512/reference/run-reference.py --mode compose --side HIGH --saved-tail /workspace/work/diffusion-private-tail-saved-outputs-20261101/high-tail-outputs.json --text /tmp/p4-real-l512-repro-inputs/real-text-l512-native.json --output-dir /tmp/p4-real-l512-repro-composed/high --receipt /tmp/p4-real-l512-repro-high-composed.json
```

両`manifest.json`のSHA、実行source、既存gate/input identityを
`bernini-p4-l512-pre-runtime-reference-freeze/0.1`へ固定する。
保存形式と全値identityは [PRE-RUNTIME-FREEZE.json](PRE-RUNTIME-FREEZE.json) が正本。
`sourceCommit`には再現checkoutの実HEAD、`cases.HIGH/LOW.manifestPath`と`manifestSHA256`には
今回の新referenceを置く。値を見た後にgateやinput identityを変更しない。

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 timeout --signal=INT --kill-after=30s 1800s python tools/diffusion-models/p4-real-text-l512-browser.py --source-commit 994ebb9ce01c9e95db9cd18eb877a981152693c5 --composed-freeze /tmp/p4-real-l512-repro-freeze.json --native-input /tmp/p4-real-l512-repro-inputs/real-text-l512-native.json --packet /path/to/f76/plain-conditioning.wktensor --private-dir /tmp/p4-real-l512-repro-runtime --output-dir /tmp/p4-real-l512-repro-receipts
```

外側timeoutはpage.evaluateを拘束するために使う。停止時もPythonのfinallyがbrowserを閉じ、
可能ならprivate failure receiptを残す。手順は元モデル全体のload/predict/sampleではない。
両browserが閉じた後にlocal参照を実行し、benchmark中のcgroup測定へ参照計算を混ぜない。

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python development/ai-connection/p4-real-text-l512/reference/run-reference.py --mode local --side HIGH --saved-tail /workspace/work/diffusion-private-tail-saved-outputs-20261101/high-tail-outputs.json --text /tmp/p4-real-l512-repro-inputs/real-text-l512-native.json --runtime-manifest /tmp/p4-real-l512-repro-runtime/high-runtime/manifest.json --composed-manifest /tmp/p4-real-l512-repro-composed/high/manifest.json --composed-manifest-sha256 <今回のHIGH参照SHA> --output-dir /tmp/p4-real-l512-repro-local/high --receipt /tmp/p4-real-l512-repro-high-local.json
```

LOWも同様に実行する。**CLI exit0だけで判定せず、receiptのpassed:true、local/composedの全25 failed0、
各group15,927,296値、全29 parameter proofを検査する。** 元の結果は
[HIGH](reference/high-local-receipt.json) / [LOW](reference/low-local-receipt.json)。

## LoRAの追加工程

owner source・原本の取得/検証は [SOURCE-ACQUISITION.json](lora/SOURCE-ACQUISITION.json)、
実L512用の境界は [REAL-L512-PLAN.md](lora/REAL-L512-PLAN.md)。
baseと別のsource/reference freeze・private出力pathを使う。
controlled K4の期待値を実L512へ転用せず、Diffusionで低rank積を再実装しない。
実LoRAの実行コマンドと最終receiptは、当該実行完了後にここへ追記する。
