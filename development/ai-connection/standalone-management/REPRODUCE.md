# 管理単体の再現

Node.js 24、Git、静的browser試験にはChromiumとPlaywrightを使用する。参照ownerは実モデルを読まず、他ownerの完成やACKを必要としない。固定source SHAと結果はRESULT.mdに記録する。

```sh
node --test --test-isolation=none \
  tools/ai-connection/test-standalone-pipeline.mjs \
  tools/ai-connection/test-standalone-host.mjs \
  tools/ai-connection/test-reference-owner.mjs \
  tools/ai-connection/test-management-workspace.mjs \
  tools/ai-connection/test-workflow-shapes.mjs \
  tools/ai-connection/test-workflow-normal-requests.mjs \
  tools/ai-connection/test-normal-operation.mjs \
  tools/ai-connection/test-snapshot-normal.mjs \
  tools/ai-connection/test-queue.mjs \
  tools/ai-connection/test-cache.mjs
git diff --check
```

追加の旧package/既存native API回帰は[既存回帰手順](../normal-execution/VERIFY.md)の環境変数を使う。NORMAL_VAE_NATIVE_ROOTは固定 `498eb25f027666e3cc661a5851288e4aabf39f0a`、NORMAL_P4_NATIVE_SOURCE_ROOTは固定 `30e283bb115741af6b475e9bdc41700a4e564053` の既存受領sourceである。これらは旧受入の回帰fixtureであり、新管理の通常利用者や単体完成に全資材を要求する仕様ではない。`test-*.mjs` 全体の既存診断も通常入口とは分離する。

[browser自動試験・手動操作](REPRODUCE-BROWSER.md)で実File選択から保存・復旧まで再現する。静的配信はrepoの `docs/` をrootとして `/ai-connection/` を開く。公開の実施は別作業であり、今回Pagesを更新しない。

shapeは既存workflow-shapes.mjsを正本とし、81frame目標latent `[1,16,21,60,104]` を縮小しない。参照ownerのコピーに対する全payload hash・手で定めた値の確認は、管理制御の開発検証である。実NN、全工程生成、LoRA演算、全体RAM予算の合格に読み替えない。
