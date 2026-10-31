# 記録済み実artifactの管理保存往復

repo rootでNode24を使用する。モデルやBrowserの用意は不要。管理の固定原本を別directoryへ取得し、既存native codecと組み合わせる。

```sh
export WKW_MANAGER_CHECK=/absolute/new-private/manager-artifact-check
mkdir -p "$WKW_MANAGER_CHECK/manager"
git fetch origin refs/heads/codex/ai-connection-e0-e4
git archive a26879057d169cb2eecff30503d64adba5057c52 docs/shared/ai-connection tools/ai-connection | tar -x -C "$WKW_MANAGER_CHECK/manager"
node tools/inference/vae/check_manager_artifacts.mjs --manager-root "$WKW_MANAGER_CHECK/manager" --output "$WKW_MANAGER_CHECK/recovered"
node tools/inference/test-connection-contract.mjs
```

`--output`は未作成のdirectoryを指定する。harnessは前回GitHubから取得・Git blob照合済みの32fileを全てbyte/hash照合してから管理moduleをimportする。必要原本は`../current-peers/manager-source-checks.json`に列挙している。モデル・profile・shape・gateを書き換えず、記録済みmean/RGB・decode evidence・元manifestを使う。

期待結果は`passed:true`、`artifacts:2`、`rejected:3`、`packageStatus:complete`。出力の`package/`は実writerが書いたbytesで、`results.json`は回収して比較した結果。artifactのnative payloadとwhole-file hash、context、元evidenceと入力/出力hashを確認する。native operationの再生や新しい推論は行わない。

記録済み資源測定は、harnessを単独子processとして起動し、既存`tools/inference/vae/process_lifecycle.py`の`ProcessOwnership`で観測したもの。Linuxの`resource.getrusage(RUSAGE_CHILDREN).ru_maxrss * 1024`を直接Node子processのRSSとして記録し、`finish()`後の生存・zombie・errorが全て空であることを別に確認した。通常CLIの成功だけでBrowser/Workerの停止を試したとは扱わない。
