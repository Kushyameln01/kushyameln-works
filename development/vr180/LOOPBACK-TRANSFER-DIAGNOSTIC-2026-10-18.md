# ブラウザから runner への転送診断

5GB attempt 2 はブラウザ内の生成・変換・保存後、転送の600秒上限で終了した。保存済み input 5,002,062,814 bytes と output の先頭896,532,480 bytesが runner に届いた記録を、原因を調べる起点とする。完了済みの媒体受入とは扱わない。

`tools/vr180/probe-loopback-transfer.py` は、原因候補である Playwright のリクエスト介在だけを切り分ける私用診断である。既存 `TRANSFER` と `MediaReceiver` を実行し、各128 MiBの input/output を baseline → filtered → baseline の順に転送する。全体の上限は準備を含む300秒、終了処理の猶予は30秒とする。送信chunkは1 MiB、サーバーはHTTP/1.0、各POSTの応答を待つ順次処理を維持する。

| 条件 | baseline | filtered |
|---|---|---|
| Playwright route | `**/*` で全リクエストを捕捉 | 正規表現で正確な許可origin以外のみ捕捉 |
| 許可origin | `http://127.0.0.1:<今回のport>/` から始まるURLをcontinue | 同じURL集合を捕捉しない |
| 外部URL | abort | abort |
| ブラウザ・保存 | 新規所有profile、既存Chrome、通常sandbox | 同左 |
| 媒体・サーバー・上限 | 固定の合成バイト、既存転送実装、HTTP/1.0 | 同左 |

入力は動画ではなく、独立Python実装でも全量SHA-256を計算できる固定の合成バイトである。ブラウザWorkerがOPFSへ各ファイルを保存し、既存転送で全量をrunnerへ送り、streaming hashとfsync/close後の全量再読取りを両ファイルとも照合する。動画の復号・変換・画質、5/10GB対応や公開版の性能はこの試験で合格にしない。

計測は固定個数の集計（回数・失敗回数・合計・最大）だけを保持する。ブラウザ側はslice、fetch完了、応答JSON読取り、complete fetch、complete JSON読取り。サーバー側は本文読取り、書込みとhash、flush/fsync/closeと全量再読取りを記録する。異なる時計の値を直接差し引かず、fetchにはブラウザ・通信・介在・サーバー待ちが含まれることを明記する。各ファイルの読取り済み量・ACK済み量・受信量・完了済みreceiptも保存し、失敗中の値を残す。サーバースナップショットはatomicではない。

既存長尺producerには観測のみを追加する。本番用guard、期限、chunk量、品質・容量制約は変更しない。転送途中の観測は既存 `browser-lifecycle.json` と `run.json` 内の `runnerTransferObservation` に保存するため、品質証拠bundleの参照許可集合を拡張しない。

各試行の終了時は、既知のnamespaceだけを検査して削除し、ブラウザ終了、HTTP要求停止、所有runnerファイル削除、所有profile削除を独立に試みる。未知entry・所有者不一致・未確認の終了はHOLDとして残す。清掃完了を確認できない場合、その試行を成功としない。300秒の割込みは既存 `ProducerSignals` を使い、30秒猶予超過はexit 124となる。強制終了では清掃・完全な証拠出力を保証しない。

完了条件は3試行の全量SHA一致・保存再読取り・既知資源の清掃である。baselineの前後差も残す。単発の差から性能分布や5GBへの効果を断定せず、結果を確認してから本番guardの変更と5GB再試験を判断する。HTTP/1.1化の効果は今回の比較に含めない。

ローカル検証は専用testsで、許可origin境界の同等性、実HTTP/1.0の短い転送と途中記録、実 `TRANSFER` の成功・fetch失敗記録、固定上限、失敗時の証拠出力を確認する。native診断はローカル検証から独立した後続受入とする。

2026-10-18の実装時確認では、専用6件、既存streaming/oracle 9件、既存producer 9件、既存取消5件の合計29件が成功した。ブラウザ側スナップショットが失敗しても、完了inputの全量再読取りreceiptと部分outputの受信量を先に独立取得し、元の失敗理由を維持して保存する回帰を含む。実行コマンドは `python3 -m unittest discover -s tests -p <次のファイル名> -v`。

| ファイル | 成功件数 |
|---|---:|
| `test_vr180_loopback_transfer.py` | 6 |
| `test_vr180_p5_long.py` | 9 |
| `test_vr180_p5_long_probe.py` | 9 |
| `test_vr180_p5_long_cancel.py` | 5 |

この記録時点ではnative診断未実行。転送高速化や大容量受入の成功は未判定である。

## 次の限定比較：ブラウザdownload

HTTP診断の後、`--transport browser-download` を追加する。これは同じ128 MiB×2の素材を、全リクエスト捕捉を行う既存baseline guardのまま、1試行だけ回収する診断である。従来の `--transport http` は3試行のまま保持する。実5GB producerの呼出しは引き続きHTTPであり、診断結果を根拠にするまでは切り替えない。

短尺校正で使ったOPFS File→Blob URL→ブラウザdownloadの経路を再利用する。新規専用downloadディレクトリを作成し、同一filesystemと直前空き容量を確認する。`accept_downloads=True` とその専用 `downloads_path` を設定し、1ファイルずつ開始イベント、`download.path()`と`failure()`による完了を確認する。完了ファイルは専用ディレクトリ直下のregular fileに限り、device・inode・size・mtime・ctimeを照合する。

Python側はそのファイルをO_NOFOLLOWで開き、open FDのfstatとpathの情報を前後で照合する。1 MiB以下の逐次読取りを既存 `MediaReceiver.chunk/complete` に渡し、予定bytes後のEOF、expected SHA-256、fsync/close後の全量再読取りを確認する。確認後に `download.delete()`、不在確認、Blob URL revoke、専用dirが空であることの確認を行い、次のファイルへ進む。追加のnative downloadファイルを2本同時に保持しない。1 MiBはPython側の読取りbuffer上限であり、ブラウザやdriverのピークメモリ保証ではない。

計測はファイル別の開始イベント待ち `startEventWaitSeconds`、開始後の完了待ち `completionWaitSeconds`、コピーとcomplete/fsync/全量再読取りを含む `copy.elapsedSeconds`、delete・URL revoke等の清掃時間に分ける。ファイル別elapsedと全helper elapsedも別に保持する。開始イベントの観測だけで保存完了とは判定しない。

`path/failure/delete` にはAPIのtimeout引数がないため、`expect_download` のtimeoutだけに依存しない。既存 `ProducerSignals.bounded_stage` がstageの絶対期限と親期限の早い方へSIGALRMを設定し、終了時は親期限の未経過分だけを復元する。SIGALRM/SIGTERMが発生した場合は既存の30秒清掃猶予を保持し、猶予を延長・再開始しない。診断は準備を含め全300秒、将来の5GB接続時は同じhelperに転送600秒の絶対期限を渡す。2ファイル間で期限をリセットしない。

失敗時もcancel、terminal状態確認、delete、URL revokeを独立して試み、最初の失敗を維持する。download停止を確認できない場合はOPFS名前空間の清掃をHOLDとし、browser closeの観測と専用dir残存を別に記録する。browser closeができても、未確認だったdownload API終端状態を遡って成功扱いしない。未知entryや差し替わったpathは削除せず、空と同一性を確認できた専用dirだけを非再帰で削除する。期限後に猶予内で清掃できても、その試行は成功にしない。

実装時の専用8件と既存29件、計37件が成功した（2026-10-18）。専用試験は実一時ファイル・実hash/fsync/再読取りと実SIGALRM/SIGTERMを使う。blocking path中断後のcancel/stop、猶予非延長、2ファイル逐次処理、hash不一致とdelete失敗の併発、FD/path差替え、予定終端後の追加bytes、未知entry保持を確認した。Playwright downloadは注入したテスト実装であり、native download診断は後続の独立した受入である。


## native比較結果

候補541f1a9bf8d9b856bb6b105cd5d9f3290121152b、Actions39091870918。各128MiB×2の全hash・fsync・保存再読取り・清掃は3試行ともPASS。runnerで測った転送区間はbaseline25.249秒、filtered23.933秒、baseline25.233秒。filteredのPython callbackは外部abort1回だけだったが、fetch256回の合計は21.819秒残った。slice読取り0.642秒、受信本文読取り＋write/hash0.297秒、完了時fsync/再読取り1.324秒とは区別する。

この1観測の約5.2%差を、600秒内に5GB経路が完了する根拠としない。filteredを採用せず、5GB再試行は保留した。固定Playwright1.62.0 sourceでは、route有効時のCDP Fetch.enableが全URLに適用される。regex非一致でもChromium→Nodeの介在とPOSTデータ処理がなくなった比較ではない。85～90ms/chunkの主因をソースだけで確定した意味ではない。

別のローカルPython HTTP比較では32×1MiBのchunk合計がbaseline57.94ms、server TCP_NODELAY53.82ms、baseline53.84msで、85ms/requestは再現しなかった。client NODELAYは全条件で有効、ブラウザではない。ローカルdriver読取りは1.62.1であり、pinned1.62.0の根拠には使わない。

原5chunk/archive13,373B、8原記録、source11件・公開inventory102件を独立照合。原記録と比較判断を `evidence/2026-10-18-loopback-transfer.json` に固定する。次経路の設計・受入は別途判断する。

## browser-download のnative受入

候補4a820dba46a24ada9b41f6887e5dadfc291ce5cd、Actions39092947039、job117573353022。元の全request guardを維持し、128MiBのinput/outputを1本ずつdownloadして回収した。各134,217,728Bの予定hash、逐次copy時hash、fsync/close後の全量再読取りhashが独立Python生成式と一致。download APIの終端をbrowser close前に確認し、各download削除・不在・空dir・URL revoke後に次へ進んだ。既知namespace、runner media、専用download dir、正常終了後の所有profileはいずれも撤去できた。

転送区間は3.084秒、準備を含む診断全体は9.483秒。従来HTTPの約25秒とは別runの単発観測であり、一般性能・5GB完了・実動画の品質を示さない。入力開始待ち0.006秒/完了待ち0.275秒/copyと全量再読取り0.650秒、出力は0.029秒/1.059秒/1.038秒。Python buffer上限1MiBはnative peak memoryの測定ではない。

原5chunk、archive12,931B、SHA-256 `8c67e647470d816d805c44fa072286cce5b8112079a75df7266616e917d7ceab`、原5record＋manifestを回収し、`evidence/2026-10-18-loopback-download.json`へ保存した。独立レビュー後、同じhelperを実5GB callerへ接続して既定600秒内の全回収を別に試験する。10GBと公開上限拡張は実5GBの媒体全回収・独立品質検査・別receiver受入まで保留する。

## 実long callerへの限定接続

同じhelperを `browser_trial` から呼ぶ差分を追加した。既存のsignals所有者を渡し、transfer deadlineは従来の `min(producer deadline, now + 600/900秒)` のまま使用する。生成前に専用download dirを作成し、元の全request guard・sandbox・独立oracle・artifact全回収条件は維持する。

download未開始の生成失敗は `NOT_STARTED` と記録する。開始後に終端を確認できなければOPFS清掃はHOLD、profileはunknownとして保持し、browser closeで停止確認済みへ読み替えない。既存のrun/browser-lifecycle/runner-transfer記録へ観測を追加し、未知ファイルを採用せず、専用download dirのREMOVEDをmainの受入条件にも加えた。

実helper・小さい実ファイル・実receiverと注入browserによる4試験で、成功、生成失敗、停止未確認、取消時にbrowser観測が失敗しても完了inputのreceiptを保持する経路を確認した。既存deadline試験の注入箇所だけを更新し、専用4＋既存37の計41件PASS。rootも新規4件を独立再実行しPASS、diff空白検査PASS。これらは局所契約の結果であり、実5GBの全回収・品質・最大メモリは後続native試験で判定する。

別レビュー担当も差分と受入gateを照合し、新4件＋既存清掃期限1件の5/5を確認した。追加のblocking指摘なし。原guard、全hash/fsync/readback、未確認停止時のHOLD、600/900秒、oracle/artifact契約を保持した単一5GB試験へ進む判断であり、10GB・公開統合の解禁ではない。レビュー対象producer SHA-256は `3561a7aee21eabe46fe34ec3cded3b5647f30390ed98833381083edee3d31ff2`。
