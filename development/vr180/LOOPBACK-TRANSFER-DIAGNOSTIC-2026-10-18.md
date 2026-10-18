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
