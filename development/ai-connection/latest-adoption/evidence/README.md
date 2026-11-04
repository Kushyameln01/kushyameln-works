# 検証資料と再現の範囲

本directoryはsource A `f084790d7f594915c869ef375fcbdc6e44ee56f3`の証拠を収録する。全体運用／実NNの成功を示す資料ではない。HANDOFFのfilesは実bytes／SHA-256の一覧。

- NODE.log: 841/841回帰。最後の9行が合計。新SDK／NNを841件実行した意味ではない。
- SOURCE-FREEZE.json: Aの変更232ファイルの実Git bytes。SOURCE-RECEIVED.json: 管理自身がGitHubから再取得した固定Aの7ファイル。保持側取得ACKではない。
- OWNER-DOCUMENTS-RECEIVED.json: 接続API／規約5本文のGitHub取得照合。OWNER-EVIDENCE.json: owner固定Git objectの16資料／receiptのbytes照合。これらはprivateモデルの管理環境への取得証明ではない。
- operational-browser/: 固定A画面14ケース。synthetic tensorと無効8B model pair、NNなし。workspace.zip.gzは輸送圧縮だけで、workspace-transport.jsonが展開後の実native ZIP hashを示す。必要な他の大きい合成P4入力は固定Aのrun-operational-browserが再生成する。
- weight-port-browser/: 固定Aのnative relay／MessageChannel／client／serverと合成providerの実Chromium試験。result、source-before/after、served-sources、Worker physical closeを別々に保持。raw-close契約制限と初回favicon404も保存した。
- holding-preflight.json: source guardはPASS、CLI exit2はこの管理環境の既知pathのlocal不足。保持側資材は存在確認済み。保持側NN実行ではない。
- operational-codec-compat.json: 旧R17 ZIPのexact read-only codec aliasと現在writer。旧ZIP自体は元のfull-route/verification/browser/workspace.zipを変更せず使う。
- REVIEW.md／AUDIT.md: 初期指摘と修正過程を残し、末尾が最終PASS／PROCEED。途中のpendingを最新未解消事項と読み替えない。

## 841回帰の再現

source Aを独立checkoutし、従来rootを用意する。evidence/regression-env.shは今回使用した18環境変数を記録する。別環境では同じ固定native版の取得先へpathだけを変更する。元rootの完全commit／materialized file照合は`../full-route/verification/REGRESSION-ENVIRONMENT.json`と`../p4-management/REGRESSION-ENVIRONMENT.json`、正常入口の補足は`../normal-execution/VERIFY.md`を参照する（pathはlatest-adoptionからの相対）。旧P4はMANAGEMENT-HANDOFFの実51file closureに従いgenerated build-infoも含める。新b6を旧P4回帰rootへ代入しない。

```bash
source /path/to/distribution/development/ai-connection/latest-adoption/evidence/regression-env.sh
# 必要なら、同じ旧1084B fixtureを配布から選ぶ。通常製品入力ではない。
export WORKS_NORM_RECT_INPUT=/path/to/distribution/development/ai-connection/latest-adoption/evidence/legacy-rect-preflight.wktensor
node --test --test-isolation=none tools/ai-connection/test-*.mjs
```

履歴rootを持たない環境ではRESULTの新規focused試験とUIを使える。skipありの全件実行を841/841の再現成功とは呼ばない。今回の元suite source bytesはSOURCE-FREEZEの固定Aと照合済みである。

## port Chromium試験の再現

Python Playwrightと`/usr/bin/chromium`を使う。配布内のrun.py／harness.mjsを同じfresh private directoryへコピーしてから実行する。run.pyのROOTは今回の実行path `/workspace/work/ai-connection/full-route-r17/checkout`。別配置ではこのROOT一箇所だけをAの独立checkoutへ変更する。COMMIT／runtime bytesの検査は維持する。ROOT変更時はrunner自体のhashが元receiptと異なるため、その変更と新結果を別に記録する。新しい出力と元の固定receiptを混在させない。

```bash
mkdir -m 700 /tmp/fresh-r18-weight-port
cp /path/to/distribution/development/ai-connection/latest-adoption/evidence/weight-port-browser/run.py /tmp/fresh-r18-weight-port/
cp /path/to/distribution/development/ai-connection/latest-adoption/evidence/weight-port-browser/harness.mjs /tmp/fresh-r18-weight-port/
python3 /tmp/fresh-r18-weight-port/run.py
```

保持環境NN実行と返却はHOLDER-RUN.md。新管理Aの取得ACK／NN受入は未受領であり、上記制御・再取得では代替しない。
