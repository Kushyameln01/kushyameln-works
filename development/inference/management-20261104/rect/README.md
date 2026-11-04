# Rectの実管理API・VAE部分接続

**固定Rectのencode、raw mean decode、保存synthetic generated raw decodeを、取得した実管理adapter/queue/package APIと実VAE browser APIで実行し、保存読戻し・取消復帰・解放まで合格した。** 実行者はVAE/TextEncoder担当の参照hostであり、管理担当の別環境による取得ACKや運用確認とは区別する。今回の包装自体はコピー・hash・ZIP内容確認のみで、NN/exportを起動していない。

原本を変更せず[accepted-result.json](accepted-result.json)と[初回FAIL report](initial-result.json)を保存した。[index.json](index.json)に各bytes/SHA-256、[source-acquisition.json](source-acquisition.json)に取得source・実配信source・入力の完全識別を記録する。

## 実行sourceと通常入口

| owner / 用途 | 完全source SHA |
|---|---|
| 合格run・VAE owner/harness | `8594722e693bda9901f61cededfc1b3338e66c92` |
| 初回・metadata検査で停止したharness | `e481e857de98a828159a2fd48fba4f16be2274e9` |
| 実管理adapter / queue / package | `e1661e561dfb1a4f20544ff48bc375175b5981d1` |
| 取得したDiffusion consumer source | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` |

管理sourceは`createTextVaeAdapter`、`createInvocationQueue`、artifact/package・workspace APIのstatic import closureを固定git objectから取得した。合格runは39件のowner/管理/Diffusion実配信sourceをbytes/SHAで記録する。各固定GitHub URLも取得receiptに含める。絶対pathだけでsource取得を済ませたとは扱わない。

実経路は既存`createInferenceAPI()`を管理bridgeへ接続し、管理の`bridge.configure/querySupport/execute/cancel`からnative VAEを呼び、管理packageでcapture・保存・読戻しする。通常入口に独立参照や詳細receiptを要求する改修はない。全値比較はこの開発harnessだけが行う。

## 新規の数値・保存確認

構成済みprofileは`wan21-raw-f32-1x16x32`、float32 NCTHW、RGB `[1,3,1,16,32]`、raw latent `[1,16,1,2,4]`。元VAEは`2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`、既存Rect graphとHike conv2資材をそのまま使った。再export・新しいoracle生成は0。

| 実操作 | 比較要素数 | maxAbs | 判定 |
|---|---:|---:|---|
| 既存RGB入力からの新しいencode | 128 | `8.642673492431641e-7` | PASS |
| その新しいraw meanからのdecode | 1536 | `3.334134817123413e-6` | PASS |

固定gateは`atol=rtol=maxAbs=2e-5`。既存の`png-mean.f32`、`png-roundtrip.f32`の全値と比較し、今回の出力へ参照やgateを合わせていない。末尾削減・padding・shape変更はない。固定Rect構成に対する81×480×832要求は非対応と判定した。これはstream構成の既存81frame受入を否定する結果ではない。

さらに、[前段で実Diffusion Hike復元を済ませたsynthetic raw保存入力](../generated-fixture/README.md)から、新しい実VAE decodeを行い管理保存した。入力は`wan21-raw-generated-sample:v1`で、posterior meanへの改名や追加復元はない。実producer生成ではなく、HIGH/LOWのhashはsynthetic fixtureの契約検査用bindingである。

このgenerated decodeについて今回確認したのは、実graph/asset hashとshape、producer/decoder/restored契約を保つ入力受理、実RGB出力、保存読戻しである。generated RGBを別の独立oracleへ全値比較したとは扱わず、上のmean/RGB数値比較と分ける。

3つの管理packageは、各入力と出力の2artifactを同梱する。RGBだけを保存して入力sampleの来歴を失わないよう、raw入力のnative WKT・descriptor・trace・snapshot・evidenceも保持した。[package-audit.json](package-audit.json)は包装時にZIP内の入力/出力hashとheaderを読取り確認した記録である。管理fieldをstrict native context/latentContractへ追加していない。

特に`saved-generated-rgb.management.zip`の入力WKTは1475 bytes、SHA-256 `de12bab3ad3c0089e10a36b87f5b42310196e9a5c0f77b7f3da8eec78086517b`。元producer配列、復号先VAE、Diffusion所有の復元状態、frame index/timeのcontextを保持する。出力WKTは6756 bytes、`raw-decoder-rgb [1,3,1,16,32]`で、同packageの出力artifactと一致した。

## 取消・終了・資源

管理取消の結果は`INVOCATION_CANCELLED`、barrierは`stopConfirmed/originalTerminal/resourceReleased/reusable:true`、`quarantined:false`。取消したWorkerの最終session観測はcreated1/released0/active1/runCalls0で、その後Workerをterminateした。実graph chunk完了後の取消や、そのWorker内finallyによるsession releaseを確認したという意味ではない。同じAPI/queueから後続encode/decodeを実行し復帰した。

成功3Workerは各session作成1/release1、active0、run1、TensorDispose2。全Workerは作成4・terminate4・live0。管理dispose後queueはdisposed、quarantine空、artifact store0。browser側とharness側は別に記録し、harnessが観測した子processは20、明示reap4、最終live0・zombie0・ownership error0だった。列挙されない短命processや物理RAM即時返却まで保証しない。

outer wallは`51.05771165900023 s`、browser内の通常経路は`41.046 s`。標本group peak RSS `1,584,381,952 B`、PSS `1,308,856,320 B`。この標本はbrowserと観測子群の範囲であり、Python親・別job・最小必要RAMとは異なる。全resource timelineは原report内に保持した。HTTP/page/console errorは0、server closeを確認した。

## 初回FAILの保持

初回`e481…`はmeanの全値比較には合格したが、管理canonical JSONがobject keyを並べ替えた後のtraceを`JSON.stringify(a)===JSON.stringify(b)`で検査し、`Native binding lost from outer trace`として全体FAILになった。初回reportを成功へ書き換えず、artifact downloadなし・後続未実施のまま保持する。

`e481…→859…`の差分は`browser.mjs`の構造比較と`test-bridge.mjs`のみ。object key順に依存せず、field有無、値、array/axis順、typed bytesは一致を要求する検査へ修正した。VAE数値source、graph、precision、gateの変更ではない。初回を数値FAILとも、全体PASSとも報告しない。

## 保存物・再現・未受入

6つのdownload原本は[artifacts/](artifacts)に置き、report内のbytes/SHA-256と一致を確認した。新しい実行が必要な場合だけ、固定859 sourceのcheckoutと固定管理/Diffusion取得closure、既存Rect bundle、保存synthetic raw入力を使い、別のprivate outputへ実行する。取得ACKのための再推論は不要。

```sh
python tools/inference/management-connection/run-browser.py \
  --scope rect \
  --sources-root /path/to/acquired-management-and-diffusion \
  --execution-source-sha 8594722e693bda9901f61cededfc1b3338e66c92 \
  --vae-bundle /path/to/existing-accepted-rect-bundle \
  --generated-input /path/to/raw-generated.wktensor \
  --output /path/to/new-private-rect-output
```

管理担当の別環境での取得・実行ACK、実Diffusion producerのsample、実LoRA付き全体運用、stream81frameの新規管理実行は未受入。このRect合格はTextの残る数値不一致や別candidateの結果、Diffusion cross-attention、全体接続・製品生成READYを完了にしない。merge・Pages公開もこの包装には含めない。
