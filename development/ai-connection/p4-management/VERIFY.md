# 取得照合と変更境界の再現

実行sourceは `a7e16cfdf2d87899e2774662539194094f214f06`。配布commitはこの文書を含むGit commit。GitHubのDraft PR #7から取得する。取得ACKのための再推論・再exportは不要。

## 配布bytes・固定Git source

repositoryのrootで実行する。必要な固定Git objectがなければ先に`git fetch origin <完全SHA>`する。

```sh
python development/ai-connection/p4-management/verify-release.py --repo "$PWD"
python development/ai-connection/p4-management/diffusion-return/verify.py --repo "$PWD"
```

前者は配布manifest、管理150file、native51file、旧scope74fileを読むだけ。`MANIFEST.json`は自己参照を避けるため自分自身を除外し、他の全fileのlength/SHA-256を列挙する。これはE4 package規則を変更するものではない。後者は994の公開source/receiptのみを確認し、private参照やNNを実行しない。

P3返却186項目の再照合は[p3-owner-return/REPRODUCE.md](p3-owner-return/REPRODUCE.md)。固定a80の13公開pathをrepository-relative階層で取得し、同verifierへ渡す。gzip2,053,790B・展開64,415,767Bをhash照合するが、原本LoRA・base・private E4 binaryを再取得しない。

## Node回帰516件

Node24。`REGRESSION-ENVIRONMENT.json`は実際に用いた16のsource/fixture pathと完全commit・hashを記録する。旧API互換確認用のsourceも含むため、最新native pinへ一括置換しない。別環境では固定Git worktree等で同じbytesを配置し、pathだけを変更した環境設定を用意する。既存legacy Rect preflight用1,084B WKT fixtureがない場合は対応試験のscopeが不足し、SKIP 0の再現とは報告しない。元モデルや実LoRA取引はこの回帰に不要。

保持環境の同じpathでは、次の設定で実行できる。

```sh
python - <<'PY'
import glob, json, os, pathlib, subprocess
record = json.loads(pathlib.Path('development/ai-connection/p4-management/REGRESSION-ENVIRONMENT.json').read_text())
test_env = dict(os.environ)
test_env.update({item['name']: item['observedLocalPath'] for item in record['environment']})
assert all(pathlib.Path(item['observedLocalPath']).exists() for item in record['environment'])
raise SystemExit(subprocess.run(['node', '--test', '--test-isolation=none',
                                *sorted(glob.glob('tools/ai-connection/test-*.mjs'))],
                               env=test_env).returncode)
PY
```

保存済みの完全logは[verification/ROOT-SUITE.log](verification/ROOT-SUITE.log)。150fileの実測length/hashが試験中不変だったことは[SUITE-SOURCE-RECEIPT.json](verification/SUITE-SOURCE-RECEIPT.json)。実際のowner処理をfixtureへ置く試験は、実Textや全modelの合格ではない。

## 固定a7でのpreflight

[REPRODUCE.md](REPRODUCE.md)のnative source取得と元f76 WKT配置を用いる。model・reference payload・owner PASSを省略した場合、既存evaluateEdgeの`COMPATIBLE / NOT_VERIFIED / BLOCKED`、native0、browser未起動、private入力IO0を期待する。

```sh
node tools/ai-connection/run-norm-required-p4-cross-ffn.mjs \
  --manager-commit a7e16cfdf2d87899e2774662539194094f214f06 \
  --native-root /fixed/public-p4-source-root --source-git "$PWD" \
  --text /local/original-f76-plain-conditioning.wktensor \
  --out /private/fresh-preflight-output
```

rootが実施したpreflightは[FIXED-SOURCE-PREFLIGHT.json](verification/FIXED-SOURCE-PREFLIGHT.json)、Node/Gitの最大単一process RSSと時間は[HOST-RESOURCE-OBSERVATION.json](verification/HOST-RESOURCE-OBSERVATION.json)。公開sourceと元f76を検査した観測であり、NN資源計測ではない。

## 保持環境での実Text共同受入

先行owner native PASSと同scopeの独立参照・gate・入力identityが揃ってから、[固定holding手順](REPRODUCE.md)を用いる。composed25が成立した場合にlocal参照を追加生成しない。元binary manifestと25 F32をそのまま読む。通常と対象取消は別のfresh出力先へ実行し、source/receipt/target/revision/generation/native取引・終端/解放・25 E4読戻し・実資源を返す。未測定の全体peakはnull。

取得確認、owner数値PASS、管理実dispatch、取消/保存、generationREADYはそれぞれ別の受入である。未成立のscopeを合格に含めない。
