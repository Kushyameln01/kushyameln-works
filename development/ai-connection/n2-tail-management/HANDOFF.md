# Diffusion担当へ渡す固定管理runner

現在は返却508d72のStep3照合を完了し、[限定受入を記録済み](acceptance/RESULT.md)。
以下は実行済み5c484の引渡し履歴。今後のmetadata writerは
`05c684f793e3f5525f3e2afea5d7d278f1ddc5ed` へ修正したが、過去の数値実行をそのSHAへ付け替えない。

**管理側の固定・配布準備は完了。実資材保持環境での実行結果を返却いただいた後、管理接続の実受入を記録する。**

- 管理実装SHA: `5c484a8783ab129a2ff3543a98b2537af9888199`
- 管理基点SHA: `03e18b6116c3d778197e4d34ba0364a7dbe918f6`
- Diffusion配布SHA: `beffdcb800b629d0b13ff43bbc90e9f74c659152`
- Diffusion実行SHA: `a49aac492cc68e2dd6037e0deb4a6954731a847a`
- Profile: `bernini-block0-n2-self-attention-residual-f32-v1`
- [固定API](https://github.com/Kushyameln01/kushyameln-works/blob/5c484a8783ab129a2ff3543a98b2537af9888199/docs/shared/ai-connection/API.md#fixed-n2-self-attention-tail)
- [Draft PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)

既存のDiffusion作業checkoutを変更せず、管理を分離したcheckoutへ置く。例えば同repositoryで:

```sh
git fetch origin 5c484a8783ab129a2ff3543a98b2537af9888199
git worktree add --detach /private/source/managed-n2-tail-5c484a8 5c484a8783ab129a2ff3543a98b2537af9888199
cd /private/source/managed-n2-tail-5c484a8
git rev-parse HEAD
git status --short
node tools/ai-connection/run-norm-required-n2-tail.mjs \
  --native-root /private/source/native-a49aac \
  --assets /private/assets.json \
  --diagnostic-budget /private/diagnostic-budget.json \
  --out /private/fresh-managed-n2-tail
```

pathは保持環境の実在位置に置き換える。native rootはa49実行sourceの元relative treeを保持する。
`assets.json` の両side6項目、診断予算、必要runtime、返却手順は [REPRODUCE.md](REPRODUCE.md)。
runnerは実adapter・専用candidate規範・既存queue・既存E4保存／実読戻しを通る。
固定ownerの8比較/71680値・7parameter checksをHIGH1/LOW3別々に要求する。
prefixや独立参照を作り直す手順ではない。元モデルをdownload/re-hashする手順でもない。

返却するものは、変更しない `result.json` と全hash/長さ、実行した管理HEAD/status/command/予算、
Diffusion完全SHAとProfile、成功sideのE4 `manifest.json` とhash/長さ。
5出力のF32 hash・shape・意味、元queue終端／解放、実保存読戻し、各比較とparameter結果を
resultへ保持する。privateモデル・配列・参照・package payloadは保持環境から公開しない。

管理は返却のmanagementSource実bytes/hashをこの固定commitへ照合し、a49 source/build、
Profile、両sideの入力/参照/gate、数値・保存receiptを対応付けて受入する。
保存済み旧成果のhash受領と今回の実数値比較は別々に判定する。

現在の状態は `PENDING_DIFFUSION_EXECUTION_RETURN`。
制御・保存fixtureと全456回帰は成功したが、管理経由の実N2数値・実出力保存の受入はまだ行っていない。
generationReady:false、load/predict/sample=NOT_READYを維持する。
