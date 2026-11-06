# 管理運用候補の起動

同じcheckoutにある操作UI、採用native、Worker、manifest、WASMを配信する。Node.js 24を使用する。モデル・保存入力は保持環境の既存Fileを選択し、サーバーへコピーしない。

保持環境では既存repoを指定し、実行中のowner checkoutを切り替えず独立worktreeへ配置する。`MANAGER_SHA`は最終引渡しの完全SHAを指定する。既存固定runnerはHEAD一致に加えて`git show`によるb6 owner照合を行うため、そのGit objectも取得する。モデルの再配置は不要。

```bash
MANAGER_SHA='<FULL_MANAGEMENT_SHA>'
git -C /path/to/existing/repository fetch origin codex/management-full-route
git -C /path/to/existing/repository fetch origin b6e166478a8e072c9ffd3ce562bfdb0c89634920
git -C /path/to/existing/repository worktree add --detach \
  /workspace/work/ai-connection/manager-operational-candidate "$MANAGER_SHA"
cd /workspace/work/ai-connection/manager-operational-candidate
node tools/ai-connection/launch-operational-candidate.mjs \
  --port 8765 --coi false --source-commit "$MANAGER_SHA"
```

実装環境で未commit候補を起動する場合は次を使う。

```bash
cd /workspace/work/ai-connection/full-route-r17/checkout
node tools/ai-connection/launch-operational-candidate.mjs --port 8765 --coi false
```

`http://127.0.0.1:8765/ai-connection/modules/`を開く。終了時は画面の「全moduleを終了」でmodel所有者と資源の終了を確認し、続けて起動したterminalのCtrl+C、またはプロセスへのSIGTERMでHTTP serverを停止する。別portは`--port 8766`、空きportの自動選択は`--port 0`。実URLは起動時に表示される。接続先は127.0.0.1のみで、外部host指定やCDPの公開は行わない。

`--source-commit`を省略した起動は未commitの変更も含む候補起動。固定sourceを実行する場合は、引渡し済み完全SHAを同じcheckoutのHEADにし、`--source-commit <FULL_MANAGEMENT_SHA>`を追加する。HEAD不一致は起動を拒否し、実際に要求された配信FileはGit objectのbytesと照合する。不一致はHTTP 409となる。未commit候補の起動を固定source検証済みとは扱わない。

1 threadを画面で明示し、COIなしを基本にする。4 threadsを使う独立した確認では`--coi true`で再起動し、browserの`crossOriginIsolated === true`かつ`typeof SharedArrayBuffer === 'function'`を確認してから画面で4を選ぶ。launcherはthreadsを変更しない。既存runnerも4/falseを拒否し、自動で1へ戻さない。

手動画面の起動にはNode.js 24とChromiumを使用する。既存の自動実モデルrunnerはPython 3、Python Playwright、NumPy、Chromiumが必要で、browser pathは`--chromium /path/to/chromium`で指定できる。既存の`run-operational-browser.mjs`はNode Playwrightの`/opt/codex/cua_node/lib/node_modules/playwright`と`/usr/bin/chromium`を参照する。これらの別配置への移植は未確認で、launcherの起動時に追加installは行わない。

## 保持済み資材を画面で選ぶ

| 入力 | 既存の保持path／選択方法 |
| --- | --- |
| Text | 採用版source-ordered-fp32 manifestを既定にし、フォルダ`/workspace/work/inference/management-20261104/text-source-ordered-bundle`、必要な元File`/workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`を選ぶ。フォルダ内の相対pathを保持する。 |
| VAE | 公式Rect manifestと`/workspace/work/inference/e6-rect/accepted-bundle`、または保持済みの対応stream manifestと`/workspace/work/inference/management-20261104/vae-stream-recovered`を選ぶ。manifestとbundleの対応を変えない。 |
| Full Diffusion | `/workspace/work/retained/bernini/Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors`と`/workspace/work/retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors`を各File欄で選ぶ。 |
| Normal P4 | 独立P4欄で実モデルFileとsideを選ぶ。fullモデルsessionや専用weight feedと共有しない。 |
| LoRA（使用するときだけ） | local `.safetensors`、または保存packageのmanifest／source-Nを選ぶ。既存の順序でpair load→side feed→LoRA設定へ進む。base経路には不要で、4原本の一括選択を必須にしない。 |
| Tensor／workspace | 保持済みのnative tensorや保存workspaceをFileで選ぶ。workspaceの復旧後もモデルFileを再選択する。 |

上記は保持資料で確認されたpathであり、別の環境に同じpathがあることを保証しない。launcherは`docs`だけを配信し、保持モデル・入力・private出力のpathをHTTPへ追加しない。Text20f／current codec、full Diffusion b6、独立normal P4 b6、専用weight portは既存の採用経路を使用する。

## 画面での通常操作

1. 対象moduleのモデル・manifestを選び、設定を適用する。DiffusionはHIGH／LOW pairをloadし、Normal P4は独立したFile／sideを設定する。
2. native入力または登録tensorの参照を指定し、能力照会で返る対応範囲・理由を確認する。既知shapeと入力範囲は採用ownerのmanifest・能力照会・[API.md](../full-route/API.md)を参照する。
3. 実行して進捗を確認する。取消は現在の実行を対象にし、元の処理と資源解放の終端を待つ。再実行時は画面の状態に従い、必要なら同じモデルFileを再loadする。
4. 出力tensorはnative形式で保存する。途中結果と入力欄はworkspaceで保存できる。保存したFileを読戻して再利用する際、モデルFileは再選択して設定を適用する。

実モデルの数値・原寸実行・全体運用は検証Codex側の確認範囲で、候補の起動確認だけでは受入済みとしない。`generationReady: false`と`originalWorkflowAccepted: false`を維持する。取得ACKや新しいreceiptの受領は、この候補の配置・起動完了条件に追加しない。

## 同じcheckoutの固定実モデルrunner

画面操作のURLは上記。以下は既存の専用harnessを起動する別コマンドで、操作UIの画面試験とは区別する。実モデル運用の実行は検証Codex側で行う。完全SHAは引渡しsourceを指定する。モデル全hashや再exportは追加しない。

```bash
cd /workspace/work/ai-connection/manager-operational-candidate
node tools/ai-connection/run-diffusion-public-browser.mjs \
  --source-commit <FULL_MANAGEMENT_SHA> \
  --manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
  --models /workspace/work/retained/bernini \
  --wasm-threads 1 --coi false --check-only
```

check-onlyは既存の固定source／保存入力／model stat確認で、browserやNNを起動しない。固定sourceのGit objectsとbytesが一致し、保持資材がある環境で実行する。続く実運用ではprivate親directoryを0700とし、出力先を未使用名にする。

```bash
node tools/ai-connection/run-diffusion-public-browser.mjs \
  --source-commit <FULL_MANAGEMENT_SHA> \
  --manifest /tmp/d1-d4-real-l512-n5-inputs/inputs.json \
  --models /workspace/work/retained/bernini \
  --mode sample --cancel-before-run \
  --wasm-threads 1 --coi false \
  --private-output /tmp/manager-operational-private/fresh-values \
  --output /tmp/manager-operational-fresh-result.json
```

このrunnerは同じcheckoutの実controller→既存adapter→native factory→専用Workerを使用する。モデルはbrowserの実File選択で渡し、HTTP配信しない。4-threadは別実行として`--wasm-threads 4 --coi true`を両方明示する。専用weight feedの確認を行うときだけ既存の`--base-weight-probe`を明示追加する。新しいadapterや接続方式は不要。

詳細な既存入力・出力条件は[HOLDER-RUN.md](../latest-adoption/HOLDER-RUN.md)、画面とAPIは[REPRODUCE.md](../full-route/REPRODUCE.md)と[API.md](../full-route/API.md)を参照する。旧文書の管理source SHAを今回の固定sourceへ流用しない。
