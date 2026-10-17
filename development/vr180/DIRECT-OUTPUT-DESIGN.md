# VR180 直接出力と長尺索引の設計

文書版 0.1 / 2026-10-17。基準コードは [5241a95ac24019b4cbe6a8272d0720ff80a785be](https://github.com/Kushyameln01/kushyameln-works/tree/5241a95ac24019b4cbe6a8272d0720ff80a785be)、build `vr180-b4-range1`。以下の「確認済み」は固定ソースの読解による事実、「設計案」は後続変更の契約である。直接mux出力は基準版では未実装であり、本書はその実行成功を報告するものではない。

次の実装単位は、現在のサンプル・出力容量上限を維持したまま、選択済み保存先へmuxし、VR情報の付与が終わるまで物理closeを遅らせる経路を追加すること。この単位の完了後も、5〜10 GBの加工・保存・実ファイル回収まで進める目標は残る。直接保存の成立だけを大容量対応完了としない。

## 1. 目的と維持する条件

5〜10 GBの素材をブラウザで扱い、設定に対応したVR180 MP4を保存・回収できる状態を目指す。容量は実bytesを記録し、GB（10進）とGiB（2進）を混同しない。容量だけでなく、継続時間、映像・音声サンプル数、moovサイズを別々に評価する。

現在の対象は1ファイルに収まったSBS/TB正距円筒、H.264 SDR、音声なしまたはAAC 1トラック。直接出力を理由にcodec、投影、音声、編集リストの対応範囲を変えない。左右別ファイル、魚眼、mesh等の残る目的を、この実装単位の対象範囲で置き換えない。

維持する不変条件は次のとおり。

1. 入力ファイルを変更せず、入力世代・設定・処理IDと出力の対応を保持する。入力と同じ保存先を拒否する。Fileだけで同一性を証明できない場合は、現行どおり非空の既存保存先を拒否する。
2. 画素の切出し・scale・左右順序、PTS/DTS/duration、AAC packet/configと許可済みleading trimを維持する。AACの負時刻を捨てたり0へ正規化したりしない。
3. 既存の不明box、外部参照、未知offset、回転、HDR、矛盾するstereo/crop/poseを拒否する検査を維持する。VR情報だけを書けたことを映像の正しさと同一視しない。
4. mux終了、保存先への書込み確定、保存後の読戻し、独立回収、VR再生を別の事実として記録する。失敗・取消後の再実行は、対応する清掃の確認後に許可する。
5. 全量メディアの配列化、書込み履歴の無制限蓄積、取消を受け付けない長い同期ループを増やさない。課金、認証変更、サンドボックス無効化を前提にしない。

## 2. 基準版の確認済み状態

| 境界 | 確認済みの動作・制約 | 次の変更 |
| --- | --- | --- |
| `file-output.mjs` | `createFileOutput()` は位置指定write、truncate、abort、明示commitを持つ。`stream.close()` はmuxerClosedのみを立て、実writerは閉じない。commit後にFileを取得し全体SHA-256を計算する | 現契約を再利用。muxerによるcloseを物理commitに接続しない |
| `transform.mjs` | OPFS `vr180-jobs/<jobId>/converted.mp4`へmux。`fastStart:false`、1 MiB StreamTarget chunk、10万samples・1 GiB出力上限。finalize後のFileを返す | `outputHandle` を指定したときだけ未commitのtransactionと捕捉metadataを返す。OPFS経路を維持 |
| `mp4.mjs` | moov全量読込みを使わず、表を64 KiB単位で走査。small leaves合計16 MiB、box 2万、深さ16、trackごと1000万samplesを制限。元moovをfreeにし、新moovを末尾へ追加してmdat位置を保つ | 同じ検査・再構築から、位置patchと追加moovを返すplanを分離する |
| `worker.mjs` | convertの合計10万samples／top moov+uuid 16 MiBをinput hash・transform読込み前に検査。現在は変換Fileをtagし、検査と全体hash後にprepared Blobを返す | direct経路ではplan適用、commit、保存Fileの検査・hash、確定状態の記録を担当 |
| `client.mjs` / `app.mjs` | jobId/inputRevision/requestIdで結果・清掃を照合。保存先の事前選択はあるが、muxはOPFS。保存時はprepared Blobを1 MiBずつ転送し、期待hashと保存hashを比較 | 保存先handleの受渡し、direct結果、commit中取消、worker異常終了時の保存先不確定を扱う |

これらの上限は現実装の防護であり、5〜10 GBという目標の変更ではない。64 KiBはページ読込み単位であり、参照中DataViewや小header等を含む総メモリ量の保証ではない。

## 3. 固定Mediabunnyの制約

同梱の公式 **Mediabunny 1.61.5** を読解した。公式tagは `v1.61.5`、参照commitは `0664a57bf2f40e5c4efa176c75ebf1d60df69eb8`。出典と同梱ファイルのhashは末尾に記す。

| 確認済みの実装 | 直接出力への意味 |
| --- | --- |
| 非fragmentedの `fastStart:false` はftyp、予約mdat header、payloadを出力し、finalizeでmdat sizeを上書きして末尾moovを書く | 位置指定の上書きが必要。append-only targetへそのまま置換できない |
| `onMoov(data, position)` はmoov書込み後に同期呼出しされ、返したPromiseをawaitしない | callbackは同期で捕捉・検査するだけにし、plan作成・追記・commitは `await output.finalize()` 後に行う |
| callback用writer trackingはmoov全体を別の拡張bufferへ保持する | onMoovは索引メモリの解決にならない。callbackのサイズ拒否より前にもlibrary側の確保がある |
| 非fragmentedのonMdatは巨大な単一mdatを捕捉し得る | この経路ではonMdatを使わない。必要な先頭headerだけを範囲で捕捉する |
| demuxerはmoovSlice全体を保持し、sampleSizes/chunkOffsets/timing等の配列を作る。cttsありでは全sampleのPTS配列・sort・逆引きも作る | Works側のrange parserとBlobSource cache上限だけでは、library内の全索引メモリは制限できない |
| muxerは非fragmentedのsamples/chunksを保持し、最終box生成で配列map・展開を使う | payloadを保存先へ流しても索引は長尺に比例する。入力・出力索引を別々に改修する必要がある |
| `Output.cancel()` はfinalizing中の処理を中断しない。cancelもtargetをcloseする | finalizeの完了・失敗を待ってから清掃する。targetのcloseを保存成功と判断しない |

参照箇所：公式固定版の [muxer](https://github.com/Vanilagy/mediabunny/blob/0664a57bf2f40e5c4efa176c75ebf1d60df69eb8/src/isobmff/isobmff-muxer.ts#L1559)、[demuxer](https://github.com/Vanilagy/mediabunny/blob/0664a57bf2f40e5c4efa176c75ebf1d60df69eb8/src/isobmff/isobmff-demuxer.ts#L377)、[output](https://github.com/Vanilagy/mediabunny/blob/0664a57bf2f40e5c4efa176c75ebf1d60df69eb8/src/output.ts#L970)、[writer tracking](https://github.com/Vanilagy/mediabunny/blob/0664a57bf2f40e5c4efa176c75ebf1d60df69eb8/src/writer.ts#L69)。

## 4. 最小の直接出力単位（設計案・基準版では未実装）

新しい外部依存やvendor改変は、この単位には必要ない。現行codec・画素変換・AAC copierを使い、出力先と終了処理だけを分離する。

### 4.1 transformの境界

追加API案：`convertStereo(file, settings, { ...existingOptions, outputHandle })`。

- `outputHandle` なしは既存OPFS経路と戻り値を保つ。ありでは `createFileOutput(outputHandle, {signal})` と、小さなmetadata捕捉器を用いる。direct経路の開始条件からOPFSだけを外し、WebCodecs等の能力検査は維持する。
- StreamTargetのwriteを必ず順番にawaitし、transaction.writeAtの成功後に同じ位置・bytesを捕捉器へ通知する。現行1 MiB書込み単位・backpressure・1 GiB出力上限を維持する。
- wrapper.closeはtransactionの論理streamを閉じる。`handle.createWritable()`で得た実writerをtransformからcloseしない。`onMoov`で非同期の保存処理を始めない。
- `await output.finalize()` の後、フレーム数・符号化packet数等の既存検査を通し、`{direct:{output:transaction, source, metrics}, metrics, cleanup}` をWorker内部へ返す。Fileはまだ返さず、transaction関数をpostMessageしない。
- cleanupは既存のcodec終了待ちの後にtransaction.abortをawaitする。commit済みなら保存ファイルを消さない。清掃の失敗・再試行・Worker終了が必要な状態を既存契約へ返す。

`metrics`には保存backend、mux終了時間、捕捉bytes、metadata plan/patch時間、commit待ち、保存後検査時間を分離して記録する。direct経路に実在しないOPFSディレクトリやOPFS削除成功を記録しない。

### 4.2 未commitファイルのmetadata source

通常の保存先writerを開いたまま `handle.getFile()` で新しい未commit bytesを読めるとは仮定しない。必要なmetadataだけを捕捉し、既存parserへ渡せる読取りsourceを構成する。

捕捉器の案：`write({position,data})`、同期 `onMoov(data,position)`、`finish(extent) -> {source,metrics}`。

1. ftyp・mdatの先頭headerを固定上限の領域へ保持する。finalizeのheader上書きを含め、同一範囲は最後のwriteで更新する。write履歴配列は作らない。
2. onMoovは1回、非負safe integerの位置・長さ、16 MiB以下を検査して捕捉する。library側の全moov確保を防ぐ仕組みではないため、事前サンプル上限も維持する。
3. finalize後にftyp、mdat header、末尾moovとextentの位置関係を検査する。`fastStart:false` の想定外構造や未完了callbackを拒否する。
4. sourceはsize/sliceを持ち、捕捉済み範囲だけを正確に読めるものとする。未捕捉範囲をゼロで埋めず、読込み要求を明示エラーにする。mdat payloadは保持・読込みしない。
5. このsourceに対するinspect/planはcontainer検査である。保存されたpayloadの正しさや入力との画素一致を証明したとは記録しない。

### 4.3 VR情報の差替えと保存

`mp4.mjs`に `planMp4Tag(source, {layout,signal})` を分離する案とする。戻り値は、元moov/legacy UUIDのfourccをfreeへ変える位置patch、追加moov Blob、元extentと最終bytes。通常のtagMp4も同じplanを使い、同じ入力検査を共有する。

Workerが実行する順序：

1. input inspect・設定検査・変換索引budget検査・入力全体hashを完了してからtransformを呼ぶ。
2. mux完了後に捕捉sourceをinspectし、出力geometry、AAC有無、時刻の対応範囲を照合する。planが従来のstereo/crop/pose拒否条件を迂回していないことを要求する。
3. planの位置patchをwriteAtし、追加moovを固定上限chunkで元extentへ追記する。既存mdatとchunk offsetsは動かさない。追加moov込みのサイズも出力上限とsafe integerを検査する。
4. 取消未要求、全write完了、最終extent一致を確認して明示commitする。物理closeの開始・終了を別イベントとして保存する。
5. commit後に実Fileを取得し、全体hashと既存MP4検査を実行する。保存Fileの結果から最終receiptを作る。生成前のsource検査結果を保存後検査へ流用しない。

再圧縮なしcopyは既存のrange tag + saveBlobToFileを継続できる。copy用の直接保存最適化は、このmux統合の必須変更に混ぜない。

## 5. 状態・取消・記録の契約（設計案）

| 状態 | 言えること | 取消・失敗時 |
| --- | --- | --- |
| `preflight` | 入力/設定/索引を検査中 | 保存writer取得前なら入力と保存先を変更しない |
| `muxing` | 未commit writerへ位置指定出力中 | codec終了とwriter.abortを待つ。成功確認前に清掃完了を返さない |
| `mux-finalizing` | libraryが索引・headerを仕上げている | cancel受付を記録し、finalizeの終了/失敗まで待つ。その後commitせずabort |
| `metadata-patching` | mux終了済み、VR差替え中 | patch/appendのpending write終了後にabort |
| `file-committing` | 実writer.closeが未決着 | 取消だけでrollback済みと書かない。closeの結果と保存先の状態を記録 |
| `committed-verifying` | close成功、読戻し検査中 | `saveWriteCommitted:true`を維持。取消/検査失敗でも保存ファイルを自動削除しない |
| `saved` | 保存後のサイズ・全体hash計算・MP4検査が完了 | 独立回収とVR再生は別判定。releaseはcodec等の資源を解放する |
| `cleanup-failed` / `destination-unknown` | 清掃または保存先の確定結果を証明できない | 次の処理を安易に成功扱いで開始しない。元のエラー・試行IDを保持 |

全通知はoperationId/inputRevisionを持ち、取消・清掃応答にはrequestIdも必要。遅延した前世代のresultやcleanupを新しい処理へ適用しない。取消とresultが競合した場合も、既に確定した保存を未保存へ書き換えない。

現行clientの異常Worker終了fallbackは、Workerを止めてOPFS jobを削除するもの。direct保存先のwriter.abortやcloseの結果を証明する手段ではない。direct jobでは保存先状態をunknownとして扱い、OPFS削除の成功を保存先rollbackへ読み替えない。主スレッドでtransactionを所有しtransferable streamを使う案は別の改善単位とする。

### hashの意味を変えない

位置指定muxは先頭headerを後で書き換えるため、writeを受け取った順番にSHA-256へ流しても最終ファイルのhashにならない。未commitの全bytesを読み直せる仕組みがない最小案では、commitの `expectedSha256` はnullで、`hashMatched:false` が正しい。

直接経路の保存後hashは観測した全体digestとして `savedSha256` / `output.sha256` に記録する。両欄へ同じ値を入れただけで独立一致としない。既存Blob保存の期待digest比較とは、receiptの経路・比較対象・判定を分ける。UIで「全体ハッシュが一致した」と表示してよいのは、実際に別の期待digestとの比較が成功した場合だけ。

`saveWriteCommitted`、読戻し検査の完了、`hashMatched`、`downloadRecovered`、`targetVRPlayerVerified` は分離する。`saveCompleted`を使う場合はdirect経路の定義を明記し、既存Blob経路の期待hash比較という意味を曖昧にしない。MP4検査やhash計算の途中で失敗した場合は完了にしない。実ファイルを外部回収し、そのhashと記録を照合するまでは `downloadRecovered:false` を保つ。

## 6. 小単位の受入条件と、その後の解除条件

以下は予定試験であり、本書で実行済みとはしていない。

| 対象 | 受入条件・証拠 |
| --- | --- |
| transactionと捕捉 | 先頭への遡りwrite、chunk境界をまたぐheader更新、onMoov回数/位置/上限、不完全領域の拒否、mux closeと実closeの分離。capture保持量がpayload長やwrite回数に比例しない |
| MP4差替え | 通常/extended size、stco/co64、複数mdatを含む許可構造、末尾moov、既存VR情報の一致/不一致。plan経路とBlob経路の出力bytes・sample tables・mdat位置が一致する |
| 失敗と取消 | mux中、finalize中、VR patch中、close保留中、保存後hash中、writer failure、abort failure、Worker異常終了。commit済み/未確定/abort済みを区別し、清掃後の再実行を確認 |
| 小素材回帰 | 再圧縮なしSBSとTB変換を実ブラウザで保存・回収し、既存独立検証器でmetadata、画素、PTS、AACを照合。処理記録JSONも回収し、job/入力世代/hashを照合 |
| 規模拡大 | 4K短素材、4 GiB境界のnative File/Blobと実保存、5 GB・10 GBの実bytesを持つ素材を別々に試験。大容量の構造adapterやpadding素材だけでは、長尺実写変換の合格にしない |

小単位の間は10万samples、入力metadata 16 MiB、出力1 GiBを維持する。この解除は次の独立した成果が揃った範囲から行う。

1. **入力索引**：demuxerのmoovSlice全量、sample配列、cttsの全PTS sortを外部/ページ索引へ移す。decode順、presentation順、keyframe探索、AAC editの意味と取消を維持する。単なるBlobSource cache縮小では解除しない。
2. **出力索引**：samples/chunks/timing等をdisk-backedな固定長表または同等の上限付き構造へ移し、final moovも表ごとに逐次出力する。onMoov全量捕捉を長尺経路から外す。小単位のonMoov方式をそのまま無制限化しない。
3. **容量・64bit・保存**：1 GiB write上限、VR追記後サイズ、mdat largesize、co64、全文hash、保存先残量/拒否/中断の処理を実Fileで検証する。静的に64bit欄を書けることと、対象ブラウザで5〜10 GBを回収できることを分ける。
4. **終端の照合**：大容量出力MP4とJSONを実際に回収し、入力・出力hash、全サンプルの時刻と音声、画素変換、VR情報を独立照合する。現在の短素材用検証器の容量・frame上限も再設計が必要。末尾の抜き取りだけで全sample検査に代えない。
5. **利用上の成立**：取消・失敗からの復帰、VRプレイヤー互換性、実写品質、操作の簡単さ、時間/メモリ/保存量をそれぞれ測定する。直接出力の速度改善は同一素材・設定・環境で比較し、並行処理や公開成功から推定しない。

索引対策の実装候補は、固定vendorソースの局所改修、または現在の対応範囲を満たす限定demux/muxの分離。採用時は出典・変更内容・ライセンス資料を更新する。`fragmented`へ切り替える案は出力形式と再生互換性を変えるため、この小単位へ混ぜない。

## 7. 証拠と再開位置

基準版に対するソース読解と設計上の整合性確認が本書の証拠である。ここには追加のブラウザ試験・5〜10 GB完走の結果はない。実装担当は、上記小単位を実装・回帰検証した後に、対象commit/build、ブラウザ版、試行ID、入力世代、実bytes/hash、MP4/JSON回収先、独立検証結果を追記する。

固定版の公式一次ソース：

- [Mediabunny 1.61.5 npm source](https://registry.npmjs.org/mediabunny/-/mediabunny-1.61.5.tgz)。SHA-256 `95c03a00ca69a7d5ed9805e424349ffeb0cdecbe8cabd0e17749a39e8117802f`。
- [公式commit 0664a57](https://github.com/Vanilagy/mediabunny/tree/0664a57bf2f40e5c4efa176c75ebf1d60df69eb8)。`output-format.ts` のonMoov/onMdat定義、`target.ts` のStreamTarget、`isobmff-boxes.ts` のstsz/stco、`isobmff-muxer.ts` のsamples保持とfinalize、`isobmff-demuxer.ts` のmoov/索引保持を参照。
- [Works同梱出典・hash記録](https://github.com/Kushyameln01/kushyameln-works/blob/5241a95ac24019b4cbe6a8272d0720ff80a785be/docs/shared/media-basic/vendor/mediabunny-source.json)。同梱module SHA-256 `5c3514965f106dd165cc6474979ba302ef85d8c84935a0ad3ea5202ccedfe51b`。vendorは基準版時点で未変更。

次の着手点：transformの出力先分離とmetadata捕捉器の契約を実装し、物理commitがWorkerの明示操作以外で起きないことを最初に確認する。
