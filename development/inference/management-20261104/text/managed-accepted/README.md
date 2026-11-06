# Textの実管理browser経路の受入

**取得した実管理adapter/queue/package APIから実Text browser Workerを呼び、plain/ID両経路の全値比較、管理保存読戻し、取消復帰、Diffusion capture、終了まで合格した。** 実行者はVAE/TextEncoder ownerの参照hostであり、相手担当の別環境取得・運用ACKの代わりとはしない。今回の包装は保存物のコピー・hash・ZIP内容確認のみで、NN/exportを再実行していない。

正本は[result.json.gz](result.json.gz)。元JSON 269,180,893 bytes、SHA-256 `d7014b8fc5c1429dc6412b6fb0bf8bfcb3e3853ca5d65c31474a57e00ad93f32`をlossless gzipで保持する。gzipは2,012,244 bytes、SHA-256 `2c80ee58ac1ca686025690a402a9358be349ee9accb35b23644a753f3f8aad1f`。[compression-receipt.json](compression-receipt.json)に加え、包装時にも1MiBずつ展開して元bytes/SHAを再確認した[compression-recheck.json](compression-recheck.json)を保存した。巨大raw JSONはGitへ追加しない。

読みやすい入口は[summary.json](summary.json)、ファイル単位の取得情報は[index.json](index.json)。summaryは原archiveを置き換えるものではない。source/inputの取得記録は巨大native観測部分より前の小さいJSON prefixから抽出し、[source-input-acquisition.json](source-input-acquisition.json)へ保存した。

## sourceと構成

| owner / 用途 | 完全source SHA |
|---|---|
| owner Text・browser harness | `78954ee92d1b76c6652f50df1668159a55db6dc9` |
| 実管理adapter / queue / package | `e1661e561dfb1a4f20544ff48bc375175b5981d1` |
| 実Diffusion capture | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` |
| Hello worldの既存独立参照 | `5537b8932343aa2476b95191817e8913f99dab02` |

選択manifestはapproved `420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405`。元manifest `aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f`との対応は24blockのnorm lowering追加だけで、attention lowering追加は0。model/Tokenizer・元入力・独立参照・元gateを保持した。巨大24graphの再exportは行っていない。

source取得記録は実git objectからの取得と実配信bytes/hashを含み、各固定GitHub URLも付けた。受入済みpayload/receiptだけを現在のsourceへ付け替えたのではなく、この789 sourceを実際にbrowserで実行した結果である。

## plain / IDの実入力と数値

plainは`Hello world`、IDは同じTokenizer結果を512個のtokenIds/maskとして明示した入力。**どちらもL=512だがactive tokenは3、残る509はmask0**である。別の全512有効ID・長文Node受入と区別し、このbrowser runを全512有効の試験として報告しない。

| 実経路 | 出力shape / 全比較数 | maxAbs | 元gate | 結果 |
|---|---|---:|---|---|
| plain | float32 BLC `[1,512,4096]` / 2,097,152 | `2.4437904357910156e-6` | atol/rtol/maxAbs `0.001` | PASS |
| ID | 同上 | `2.4437904357910156e-6` | 同上 | PASS |

既存[plain-reference.f32](../../../p2-p3-acceptance/plain/evidence/plain-reference.f32)は8,388,608 bytes、SHA-256 `e59ad16a82799a42fe82eb76b3c7438a70c4766be7d7c7eb9b18222bfb1c83a9`。参照・元入力のhashと来歴を保ち、出力に合わせて作り直していない。全2,097,152値を比較しており、有効3行の抜取り比較ではない。

両経路の保存native WKTはそれぞれ8,390,098 bytes、同じSHA-256 `6be07864f6c92601b689bfa69e0c4ddc870fdc3be4dc719f3d9c611ec4c1f101`。同じ数値出力でも入力経路は外側の管理recordへ別々に保持する。このfixtureのprompt/hash/gateを通常入口の必須条件へ追加していない。

## 管理保存とDiffusion capture

[artifacts/](artifacts)に4つのdownload原本を保存した。各modeのmanagement ZIPには1個の出力native artifact、descriptor/evidence/trace/snapshot、mask attachmentと、入力を表すworkspace `sourceRecords`が入る。plainには`{text:'Hello world'}`、IDには512個のtokenIdsとmaskが残る。入力を保存した別native WKTがあるとは扱わない。

[package-audit.json](package-audit.json)はZIP内WKTが別download WKTと全bytes一致すること、mask attachment、入力mode/sourceRecord、24個のsource/executed graph bindingを確認した記録。graphのhashは保存された実行bindingとして保持し、包装時に18.52GBのgraphや元modelを再hashしていない。管理の来歴・graph情報は外側trace等へ置き、strict native tensorへ独自fieldを加えない。

管理readback後の実tensorを同じrealmの実Diffusion capture/snapshotへ渡し、全data/mask、model `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`、Tokenizer `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`、`umt5-final-rmsnorm-f32-v1`を保持した。Diffusion内蔵verificationは`producerAuthenticated:false / realExecutionVerified:false / jointlyAccepted:false`のまま。自己認証や相手環境のACKへ読み替えない。

実行したのはcaptureまでで、Diffusionの4096→5120投影、cross-attention、FFNは未実行。Textの最終RMSNormはText owner、これらのDiffusion数値処理はDiffusion ownerが担当する。全体生成READYを更新する結果ではない。

## 取消と終了

取消boundaryは`text-norm-execution-graph-hash`、index0・offset0。**ORT session作成0、run0、Tensor dispose0**の時点でWorkerをterminateした。実ORT演算後の取消や、中断Worker内finallyによるsession解放を確認したとは報告しない。

管理barrierは`stopConfirmed/originalTerminal/resourceReleased/reusable:true`、`quarantined:false`。同じAPI/queueからplainへ復帰し、その後IDも実行した。正常2Workerは各session作成24/release24/run24、Tensor dispose72、active0。合計Worker作成3・terminate3・live0。dispose後queue disposed、quarantine空、artifact store0、native client disposedを確認した。

harnessが観測した子processは22、明示reap4、最終live/zombie/errorsは全て空。HTTP/page/console/blocked requestも各0、server closeを確認。これは標本で列挙できた所有子群の範囲であり、未観測短命processや物理RAMの即時返却まで保証しない。

## 時間と資源のscope

browser native区間は`2036.0335999999995 s`、controller全体は`3312.824011642 s`。後者には巨大な観測JSONの受信・後処理を含む。両方をモデル演算時間として扱わない。このrunは新しい長文Node試験と並行しており、host/threadの性能比較や改善倍率を導かない。

| 観測phase | 標本peak RSS B | 標本peak PSS B |
|---|---:|---:|
| browser-ready | 607637504 | 331196416 |
| text-cancel | 2167795712 | 1895032832 |
| text-plain | 5099126784 | 4818772992 |
| text-id | 5211181056 | 4931945472 |
| dispose・結果回収 | 5344391168 | 4945536000 |

表はbrowserと観測descendantの範囲で、Python親・export・独立参照processを除く。RSSは共有pageを重複計上し、PSSと加算しない。約0.1秒の標本値であり瞬間peakや最小必要RAMではない。dispose phaseにも結果回収時のメモリを含む。原scope/注意書きはsummaryとarchiveに保持した。

通常APIに269MBの診断JSONや詳細receiptを要求する変更はない。このarchiveは今回の開発観測を保持する資料である。

## 診断compactのNN0 replay

元[result.json.gz](result.json.gz)を変更せず、別の[diagnostic-replay/result.compact.json.gz](diagnostic-replay/result.compact.json.gz)と[replay-receipt.json](diagnostic-replay/replay-receipt.json)を追加した。実NN sourceは789のままで、診断整形/replay sourceは実行時未commitの別scope。[source-byte-proof.json](diagnostic-replay/source-byte-proof.json)に実fileのbytes/SHAを記録し、後続配布commitを当時のreplay実行sourceへ付け替えない。

その後、同じ診断source bytesを`003601db1cb92981d41ba5c68efa08e625680223`へ固定した。2fileのbytes/SHAがreplay receiptと一致することを照合済み。これは後から取得できる同一sourceの案内であり、元実NN sourceやreplay当時の未commit状態を書き換えない。

完了済みreplayは取消198件・plain9176件・ID9176件の**全18,550 observation**を復元し、各全fieldをdeepEqual・順序付きsequence hashで照合した。非observationのreport/worker/native fieldsも全deepEqual。数値・回数・境界・取消fieldやsession metadataを省略して小さくしたのではなく、重複metadataを参照する表現で保持した。

compact gzipは262,511 bytes、SHA-256 `3038629d759ffaf911429965c0c03480e2f2d233616257520736226df471f054`。展開したcompact JSONは5,359,171 bytesで、元JSONから約98.009%減った。ただしcompact表現と元raw JSONのtext bytesは異なる。元269,180,893-byte JSONを同じbytesで再現するには原gzipを使い、compactの可逆性は復元後の全structured fields/sequenceで判断する。

これは保存済みrunを使うNN0の診断replayで、新しいモデル推論、browser実行、性能改善の実測ではない。今回の包装はcompact gzipのbytes/hash/展開hashを照合しただけで、replayも繰り返していない。

## 受取・再現・残件

受取側は最終配布commitの[index.json](index.json)と4artifactを取得し、bytes/hashを照合できる。archiveは標準gzipで元JSONへ復元でき、[compression-recheck.json](compression-recheck.json)の原bytes/SHAを使える。受領確認だけのための再推論・再exportは不要。

固定789 source、管理/Diffusionの固定取得closure、approved420eb bundle、同model、既存Hello world独立参照がある環境で、新しいprivate出力へ`run-browser.py --scope text --text-cancel-stage text-norm-execution-graph-hash`を実行すると同じ選択scopeを再現できる。実API文書・harnessの固定sourceは取得indexに案内する。原runの所要時間を新環境のdeadlineや成功保証にしない。

別の[全512有効ID Node受入](../norm-accepted/README.md)と[新長文plain Node受入](../plain-long-accepted/README.md)は、それぞれの入力・manifest・source・gateで維持する。本runは管理browser経路の今回の2入力に限定する。

未受入は管理/Diffusion担当の別環境ACK、browserでの全512有効tokenを含む別入力、Diffusion投影/cross-attention/FFN、system/negative等を含むprompt全体、LoRA全体運用、生成READY。merge/Pages公開もこの包装には含めない。
