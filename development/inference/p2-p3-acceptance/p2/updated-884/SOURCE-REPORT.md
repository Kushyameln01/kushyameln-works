> 本文にあるOWNER-P2-SOURCES/retrieval-884/SOURCE-DIFF/ACK-STATUS等の参照は、取得調査時の私有directory内を指し、この公開directoryへ全て同梱した意味ではない。公開する固定source一覧は[NEW-884-SOURCE-CLOSURE.json](NEW-884-SOURCE-CLOSURE.json)、実取得・Git byte照合は[MANAGER-SOURCE-RECEIVED.json](MANAGER-SOURCE-RECEIVED.json)に記録した。

> 履歴: 以下は新884実行前のsource取得調査。記載する「未実証」「再run0」はこの調査時点の範囲である。その後、observer source `e150e7ac3c4859739528ff278763c6474968ac08`から管理884の新joint runnerを実行し、正常・取消復帰がPASSとなった。現在の実行記録は[observer-result.json](observer-result.json)、[正常](decode/result.json)、[取消復帰](cancel-recover/result.json)を参照。旧sourceの結果を新sourceへ付け替えていない。

# 管理884取得・旧実行17sourceとの比較

## 結果

**管理実装8849891を実取得した。旧60d16で実行した17fileのうち15fileは完全同一、2fileは変更あり。17/17同一とは報告できない。** 新884の20file closureは全件固定Git treeのblob/長さと一致した。

今回成立したのは「Text/VAE側受領者が管理884の実sourceを取得・照合した」という向きの限定source確認。管理担当がText/VAE dd3401のsource/data／5537返却を受領・正式admissionしたという逆方向のACKは、前のACK-STATUS.mdの未確認状態と別である。

## 固定SHA・取得物

- 過去NN実行source: **5537b8932343aa2476b95191817e8913f99dab02**
- 過去使用管理source: **60d16b64d6020d3d20239f087f8add91268dcaad**
- その配布receipt: **dd3401a906e3dfce519bc7c00b2e0c14a2975064**
- 新取得管理実装: **8849891f19124df31847bd691503c2491278eaa8**
- 新管理資料配布: **f34bf10a67c91f462ab46dec033eaeb2110facf1**

元17recordの正確な原本path:
`development/inference/p2-p3-acceptance/P2-SOURCES.json`（p2 subdirの外）。
GitHub取得Git blob: `803a3cac1b227afc35d5db3859fbd12e2d2dd4c2`。
本directoryの `OWNER-P2-SOURCES.json` はその取得原文。

884全source:
`checkout-884/`
https://codeload.github.com/Kushyameln01/kushyameln-works/zip/8849891f19124df31847bd691503c2491278eaa8

- ZIP21,553,046 bytes
- SHA256 `b090fbc8776375fe932a229191de67c74fa20ac8286524a821ad01f8c3d0a8d3`
- 取得記録 `retrieval-884.json`
- GitHub toolで17fileを各固定ref884から直接取得した原文: `acquired-884/`
- 同GitHub blob: `884-github-blob-refs.json`

## 比較件数

| 比較 | 結果 |
| --- | --- |
| 元17recordsと取得済み60d16の実bytes／長さ／SHA／Gitblob | 17/17一致 |
| 新884のGitHub取得原文と固定refのGitblob | 17/17一致 |
| 元17recordsと新884実bytes／長さ／SHA／Gitblob | 15一致、2差分 |
| 新884と配布f34の同17path実bytes／Gitblob | 17/17一致 |
| 新884の現source closure | 20file、20/20 Git tree blob／長さ一致 |

機械証拠: **SOURCE-COMPARISON-884-60d-f34.json**。
各pathにrecordedExecuted60d、actual60d、actual884、github884BlobSha、actualF34、各一致booleanを保存した。

## 二つの差分

| path | 60d16 | 884 / f34 |
| --- | --- | --- |
| tools/ai-connection/run-norm-required-rect.mjs | 20826B、SHA6b4b400ec2df0dd1940b2843a69f861957fd38e9f87bb20db52791e836d29d40、blob88c63cd37afed5283be177a179a43a45d0bc10a7 | 23857B、SHA9f5c490237290821c37bcfc5d6bfea5710bda8eb555435af4b73cba08d7a3a45、blobd5a1850f0a9e64d62c77eb7aa45cc822c757bbe9 |
| tools/ai-connection/norm-required-rect-browser.mjs | 21774B、SHA4130682e5fe8a47c9c002db680788cd1faf22721c7bbfa0d5b751e5bde78cb7b、blob046d25ec588553bbd20182fe1277e433496b0a47 | 26562B、SHA30e9750a1087f74a514e162dac1dc7bf9a3b80ef6b1a4424bfe81fde8e4e5c9e、blob65627917940c2f5971cfb6ef1f751d58c5734336 |

完全diff: `SOURCE-DIFF-60d-884.patch`。

主な変更:

1. `collectRectManagementSourceReceipts()` を公開し、新run-joint-rect-management.mjsも相対import closureへ含める。
2. `verifyRectManagementCommit({managerCommit,sourceReceipts,repositoryRoot})` を追加。固定Git object実bytesを読み、現sourceReceiptsの長さ/SHA一致を証明する。任意40桁labelだけでは固定実行sourceにしない。
3. `runNormRequiredRect` にjointTraceId、currentInputLink、requireFixedManagementSourceを追加。固定source不一致はnative0/browser0のBLOCKED。current mean側とdecode側のsource receiptも相互一致を要求。
4. `assertRectCurrentInputLink` を追加。raw/normalized/restored3stageの実package、2owner operation、mean queue終端/release、source/build/model/profile/context、全file/payload/codec、同jointTraceId、元復元meanを厳密に結ぶ。
5. browserの入力再検査とpriorInputEvidence／trace／取消復帰後caseへcurrentInputLinkとjointTraceIdを伝搬する。

core規範adapter、queue、package、storage codec、shape/gate等の15fileが同一であっても、これら新guardや新trace結合を旧5537の実行で受け入れたことにはならない。

## 新closureは旧17より広い

`collectRectManagementSourceReceipts` の静的相対import探索と同じ規則で、source bytesだけを読んで列挙した。関数・NN・suiteを実行していない。

新closureは20file。旧17比較集合に加わるpathは:

- tools/ai-connection/run-joint-rect-management.mjs
- tools/ai-connection/rect-management-runner.mjs
- docs/shared/ai-connection/cache.mjs

これらは「今回のclosureに追加されたpath」であり、全てがrepositoryに新設されたという意味ではない。
**NEW-884-SOURCE-CLOSURE.json** に20件の長さ/SHA/Gitblobと固定Git treeとの一致を保存した。20/20一致。

旧17集合の15/17同一という結果だけで新20file全closureの実動作同一性を宣言しない。

## 受領ACKとして正確な記述

次の限定表明は実証済み:

> Text/VAE側で管理実装8849891f19124df31847bd691503c2491278eaa8の固定sourceを取得した。元60d16実行17fileとの比較は15同一・2変更で、新884の20file source closureもGit blob/長さを照合した。実NNは元5537／管理60d16のまま保持し、新884の実行・新guard受入・管理正式admissionとは区別する。

次は未実証:

- 17file全同一。
- 元5537runが新884のcurrentInputLink／Gitcheckpoint guardを通過した。
- 実行sourceが新884またはf34だった。
- 管理担当本人によるdd3401/data packetの受領ACKや正式admission。
- Diffusion本番conditioning消費。

前のf34 OWNER-HANDOFF観測時刻09:47は、VAE/Text返却comment6556640862の10:19より前。歴史的pendingを、新返却の拒否判定に読み替えない。

## 次の限定確認候補

新guard／joint linkageの必要な追加確認範囲は、管理側が旧run receiptと現source差を照合して決める。モデル不要でsource/checkpointとcurrentInputLinkの改変・欠落・別trace拒否を確認する候補はあるが、本調査で実行しておらず、NN再実行の要否も決めていない。

本作業でNN／export／再run／投稿は0回。既存receiptとloop sourceは変更していない。
