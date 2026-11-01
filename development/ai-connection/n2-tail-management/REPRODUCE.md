# 固定N2 tailの保持環境実行

返却のStep3は[受入記録](acceptance/RESULT.md)へ照合済み。
数値再実行を伴わない返却原本・SHA/Profile/証拠の再照合は
[acceptance/REPRODUCE.md](acceptance/REPRODUCE.md)を使う。
以下は実行済み5c484の手順を保持したもの。新metadata修正版は05c684で、過去resultは無変更。

管理の固定commitと実行コマンドは [HANDOFF.md](HANDOFF.md) に記載する。
順序は、管理runner固定 → Diffusion側保持環境で実行 → 管理が返却証拠を照合して受入。
本環境にprivate payloadを複製することは前提にしない。

## sourceと資材

- 管理source: `HANDOFF.json` の `managementImplementationCommit`。
- Diffusion配布: `beffdcb800b629d0b13ff43bbc90e9f74c659152`。
- 実行source: `a49aac492cc68e2dd6037e0deb4a6954731a847a`。
- Profile: `bernini-block0-n2-self-attention-residual-f32-v1`。
- 新candidate catalog: 9589B / SHA256
  `aa492b66fc3775b561bd6535290ebb5eabf7328039c47238e009996bd417943b`。

実行sourceのrepository-relative treeを保持する。元モデル、prefix、attention、参照、保存出力は
Git・HTTP配下へ置かない。既存source checkoutがあれば再取得不要。新規source checkoutには
固定commitの `git worktree add --detach` または `git archive` を使える。元モデルの再download、
全file hash、prefixや参照の再計算は行わない。

private `assets.json` はHIGH/LOWそれぞれ次の6pathを明示する。

```json
{
  "HIGH": {
    "model": "/private/models/Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors",
    "fullPrefixArtifact": "/private/prefix/high-prefix-actual.json",
    "attentionArtifact": "/private/attention/high-attention-actual.json",
    "localReference": "/private/reference/high-local-reference.json",
    "composedReference": "/private/reference/high-composed-reference.json",
    "savedOutput": "/private/saved/high-tail-outputs.json"
  },
  "LOW": {
    "model": "/private/models/Bernini_LOW_fp8_e4m3fn_scaled.safetensors",
    "fullPrefixArtifact": "/private/prefix/low-prefix-actual.json",
    "attentionArtifact": "/private/attention/low-attention-actual.json",
    "localReference": "/private/reference/low-local-reference.json",
    "composedReference": "/private/reference/low-composed-reference.json",
    "savedOutput": "/private/saved/low-tail-outputs.json"
  }
}
```

上記はpathの役割を示す例で、取得済みの宣言ではない。保持環境の実在pathへ置き換える。
入力・参照・保存済み出力の全bytes/hashとF32 hashを固定receiptへ照合する。モデルは既存
fullmodel receiptを再利用し、実fileの長さ・bounded headerを確認する。全31GB pairを再hashしない。

private `diagnostic-budget.json` は例えば次の明示値を使う。maxElapsedMsは保持環境で定める
tail単体の中止条件であり、必要なら実行前に明示変更して返却receiptへ残す。

```json
{
  "scope": "n2-tail-diagnostic-only",
  "tailHikeCapacityBytes": 2883584,
  "ortSharedMemoryCapacityBytes": 16777216,
  "maxReturnedOutputBytes": 163840,
  "maxElapsedMs": 120000
}
```

期限で取消しても元factory/run Promiseの終端を待つ。これは総RAM/host/allocator/全工程peakの
予算ではない。native ORTMemoryBytesのnullは保持し、現在の独立observer測定なしに
16777216を実測値として記録しない。

## 実行

Node24、Playwright/Chromiumとlocalhost GETが必要。`playwright` packageが通常のNode解決に
なければ、この環境の既存 `/opt/codex/cua_node/lib/node_modules/playwright` を利用する。
Chromiumの既定は `/usr/bin/chromium`、別配置は `WORKS_CHROMIUM` で明示する。

```sh
node tools/ai-connection/run-norm-required-n2-tail.mjs \
  --native-root /fixed/native-a49aac \
  --assets /private/assets.json \
  --diagnostic-budget /private/diagnostic-budget.json \
  --out /private/fresh-managed-n2-tail
```

outはrepository外の新規絶対pathとし、既存出力を上書きしない。
source24file・build100file・public receipt15file・codecを先に検査する。
private資材不足なら `BLOCKED / nativeCalls:0 / browserLaunched:false` と不足台帳を保存し、
数値dryrunの合格を返さない。sourceや既知hashの不一致は拒否する。

実行可能ならHIGH1とLOW3を別browser realmで順に実行し、同realmの `createSelfAttentionTail`
を管理adapterから直接呼ぶ。元owner `common.mjs:compare` による8全値比較・71680値/sideと
7 strict parameter checksを使い、元事前gateの一致を必須とする。
prefix/attention stage自体は再実行しない。保存済みoutputの全hash受領は別receiptであり、
今回の数値比較の代用にしない。

成功sideは5出力を既存E4で保存し、実diskから全て読戻す。output名、LC/C shape、hidden意味、
source、validation target、evidence、拡張を保持する。公開前cache登録は行わない。
private出力は `high-outputs/` と `low-outputs/` に残す。

## 返却と管理での照合

1. 変更しない `result.json` と、その全file SHA256・bytes。
2. 実行した管理 `git rev-parse HEAD`、`git status --short`、上の実行commandと診断予算。
3. Diffusion execution/distribution完全SHA、Profile、各sideのscope・8比較・7parameter結果。
4. 成功sideのE4 `manifest.json` とその全hash・長さ。result内のpackageReceipt、
   manifestSha256、各5native file hash・出力F32 hash、実readbackVerifiedを対応付ける。
5. 失敗・取消・解放・recoverが起きたら、成功へ書き換えず元errorとqueue終端／解放を返す。

privateモデル・activation・referenceやpackage payload自体をGitへ追加する必要はない。
公開resultは数値配列とモデルscalar値を除外し、5出力のhash/shape metadataを保持する。

管理は固定checkpointのGit bytesに対して、result.managementSourceの実module hash一覧、
native source24、build100、Profile、両sideのtrusted input/reference/gate、数値結果、
packageReceipt/manifest/出力hash、終端・解放を照合する。40桁ラベルの一致だけで受入しない。
不足・不一致は該当edgeを保留し、返却前は `PENDING_DIFFUSION_EXECUTION_RETURN` を維持する。

## 管理側の回帰

既存native環境変数は `../norm-receipt-adoption/REPRODUCE.md` と
`../lora-data-bridge/REPRODUCE.md` の旧pinを維持する。追加は次のみ。

```sh
WORKS_N2_TAIL_NATIVE_ROOT=/fixed/native-a49aac \
node --test --test-isolation=none tools/ai-connection/test-n2-tail-*.mjs \
  tools/ai-connection/test-norm-required-n2-tail.mjs \
  tools/ai-connection/test-run-norm-required-n2-tail.mjs
```

全回帰は全ての旧native rootも設定して同じ `node --test --test-isolation=none
tools/ai-connection/test-*.mjs` を実行する。既存LoRA bridgeを新tail pinへ差し替えない。
制御fixture・codec読戻し・source検査の合格を、HIGH1/LOW3の実数値受入件数に加算しない。

cross-attention、FFN、全block、実HIGH→LOW、本番生成、任意LoRA、全体資源予算は未受入。
generationReady:false、load/predict/sample=NOT_READYを維持する。
