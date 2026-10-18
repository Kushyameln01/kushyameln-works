# VR180 shared module

現行実装：`vr180-b14-mp4-compatibility-r6`。ユーザー提供のSites v75（宣言source `d398bd62aad40ca6764b0c9e8ced4075f4b95f35`）を基準としたr6パッチを、既存の保存UIと統合し、ChatGPT SitesおよびGitHub Pagesへ反映しています。この識別子はVR180モジュールの版を示し、サイト全体の版番号ではありません。

`keys`を含むmdtaメタデータと、`tmcd`／`tc64`時間コードtrackを範囲検査し、再圧縮なしのVR情報付与で原バイトを保持します。ISO FullBox／QuickTime形式、キーと値の1始まり参照、参照あり／なしの時間コードを区別します。画素変換の出力には、寸法・時刻・トラックIDに依存しないと分類した記述メタデータを元scope・型・locale・多値のまま移します。未知の新規metaと時間コード・章の画素変換は未対応です。従来ISO udta/mdirの受付は維持し、保持できないcontainerは処理記録と画面に省略を示します。

r6は`stz2`の4/8/16bitサンプルサイズ、末尾top-level `size=0 mdat`、signed `ctts`と全5値が一致するv0 `cslg`要約を追加しました。末尾mdatのheaderは媒体位置を変えずに確定します。4 GiB超の8→16byte拡張には直前のfree/skip等に8byteの再利用余地が必要です。変換時のAAC `sdtp`・roll/prol `sgpd/sbgp`は、元sampleの順番・件数・サイズ・設定・相対時刻を確認した場合に保持します。原映像の依存表は新映像へ流用しません。実装範囲と検証の限界は`docs/vr180/MP4-25-STATUS-r6.md`を参照してください。

入力検査が失敗すると、既知コンテナのヘッダーを上限付きで走査し、複数の未対応構造と未走査範囲を処理記録の`structureDiagnostics`へ記録します。未知のpayloadを子Boxと推測せず、診断から加工を許可しません。診断用の全動画hash、ファイル名・GPS値の収集、外部への自動送信は行いません。

ファイル容量の固定上限を撤廃した既存処理を維持し、5〜10 GBの利用に向けた索引の逐次処理を変更していません。実装の変更と大容量実動画による動作確認は別です。本変更では大容量の実データ試験を実施していません。

保存の区間記録は `receipt.timings.filePhases`（direct）と各 `saveAttempts[].timings.filePhases` に残します。計画、metadata hash/write、truncate、close、getFile、全体hash、metadata読戻し、再解析を区別し、失敗時も終了statusと経過時間を保持します。`requestedBytes` はAPIに要求した量で、失敗したwriteの成功量ではありません。重なる区間を足して総時間にはしません。

高頻度metricsの記録は最新8件と `eventLog.dropped` に制限します。保存試行の事実履歴は打ち切りません。記録は端末内JSONで書出し、遠隔へ自動送信しないため、提供されない利用ログは集計できません。SDKの観測値とブラウザ全体・GPUメモリを区別し、未計測はnullとします。

目的は、VR180撮影素材・左右2眼動画をブラウザで簡単に加工することです。5〜10 GBを一律に拒否する容量制限はありません。利用可能な容量は保存先・ブラウザの一時保存領域、対応形式と端末の処理能力にも依存します。容量表記のGBは1,000,000,000 bytesです。

## 現在のAPI

`client.mjs` の `StereoClient` が専用Module Workerを作成します。

- `run(file, {mode: 'inspect'})`: MP4の構造、既存VR情報、変換時刻条件を検査。
- `run(file, {mode: 'copy', layout: 'sbs'|'tb', fov: 180, confirmed: true})`: 元の圧縮サンプル・時刻・音声を保持し、180度のVR情報を付与。
- `run(file, {mode: 'convert', layout, fov: 180|360, eyeSize, bitrate, confirmed: true, executionRoute}, {outputHandle})`: 正面180度の切出し、横並びへの配置、H.264再圧縮、条件付きAACコピー。大容量・長時間は`indexed`経路と事前選択した`outputHandle`が必要です。
- `cancel()` / `dispose()`: writer・codec解放とそのジョブの一時保存削除を待ち、清掃応答後にWorkerを終了。清掃失敗中は次の処理を止め、明示的な清掃再試行を受け付ける。
- `acknowledgeUnknownOutput()`: 異常終了で保存状態不明になったdirectジョブを明示的に終了。不明記録を返すだけで、保存成功・取消成功・清掃成功へ変更しない。

`confirmed` は、呼出側が入力の投影と左右配置を確認したことを示します。ファイルの縦横比だけから付与してはいけません。180度の各眼は正方形、360度の各眼は2:1に制限します。

作成成功時は `{blob, receipt, info}` を返します。directの `blob` は保存後に取得した実File、通常経路は保存待ちのBlobです。結果を保存又は明示破棄するまで保持し、その後 `dispose()` をawaitします。同じclientで次のジョブを開始する前にも `dispose()` が必要です。結果の取得直後に一時ファイルを削除しないでください。

## 経路と必要な能力

| 経路 | 保存先と必要な能力 | 作成成功の意味 |
| --- | --- | --- |
| indexed convert + `outputHandle` | 空のFileSystemFileHandle、OPFS、SyncAccessHandle、Web Locks、WebCodecs、OffscreenCanvas、Module Worker | 媒体を逐次保存し、索引をディスクへ記録。VR情報と保存後の読戻しを確認したFile |
| 小規模なlegacy convert + `outputHandle` | 空のFileSystemFileHandle、WebCodecs、OffscreenCanvas、Module Worker。OPFSは不要 | 直接muxし、VR情報の追記、物理close、読戻し検査まで完了したFile |
| 小規模なlegacy convert、handleなし | OPFS、WebCodecs、OffscreenCanvas、Module Worker | OPFS経由で準備した出力。外部保存は未完了 |
| copy | Module WorkerとBlob範囲読込み。変換用OPFS・codecは不要 | 元の圧縮サンプルを保つ出力。外部保存は未完了 |
| 準備済み出力を保存 | `saveBlobToFile(blob, handle, {signal, expectedSha256})` | 最大0.001048576 GBずつコピーし、保存後のサイズ・全体hashを事前期待値と照合 |
| Blobダウンロード | ブラウザのダウンロード操作 | 要求を出した事実のみ。保存完了・外部回収を証明しない |

画面は作成前にも保存先を選択できます。選択した保存先への直接muxはconvertだけに適用し、copyは作成後に保存します。非空の既存保存先を拒否し、入力原本の上書きを避けます。保存APIの存在だけではOS保存ダイアログを操作できた証拠にはなりません。

## 対応形式と上限

1ファイルに格納したSBS/TB正距円筒MP4、H.264（avc1）又はH.265/HEVC（hev1/hvc1）、音声なし又はAAC 1トラックが対象です。HEVCの再圧縮しない処理ではhvcC・映像sample・音声sample・時刻・色metadataを保持します。HEVCのHDR/field metadataもcopyでは保持し、画素変換はSDR・非interlaceとブラウザの復号能力が必要です。出力の再圧縮形式は引き続きH.264です。既存メッシュ、魚眼、カメラ固有補正、左右別ファイル、HDRの画素変換、対応する章・時間コード以外の追加データトラック、複雑な編集リストは未対応です。左右別ファイルの将来の同期契約は[固定候補のIMPLEMENTATION.md](https://github.com/Kushyameln01/kushyameln-works/blob/e6c0245eb72ad676c2297e2d5b7ba5fc592e9e60/development/vr180/IMPLEMENTATION.md)にあります。

トラック参照（tref）はコピーで型・ID列・空参照0・順序を保持します。参照先IDの存在とトラックIDの一意性を検査し、ID列はページ単位で読み込みます。enabled trackからchap参照されたdisabled text/tx3g章トラックは、参照・sample tables・媒体とともに丸ごと保持します。対応するminfはgmhd又はnmhdで、音声は従来通り0/1 AAC、動画は1本、章を含む合計は最大16トラックです。chpl章リストも保持します。textの表示スタイルや章タイトルの意味までは解釈しません。参照や章を持つ入力の切出し・再圧縮は、それらを失うため実行しません。利用者の実ファイル内の参照型や章の有無は未確認です。

出力はSpherical Video V2のcropped equirectangular 180度ステレオで、Googleのカメラ固有mesh形式への準拠を意味しません。変換でAAC payload、decoder configuration、対応する先頭調整を保持します。AAC依存表は`audioDependencyTransfer`がsample順と出力table照合を確認したときに元表を移します。途中からの再生品質は別に未検証です。

入力・出力ファイルには固定容量上限を設けません。位置と長さはJavaScriptの安全な整数で検査し、MP4の64 bit offsetと保存先の容量に従って処理します。`route-profile.mjs`の`requiresIndexedConversion({inputBytes, sampleCount, metadataBytes})`は、入力1 GB以上、合計10万sample超、又はlegacy用metadata予算0.016777216 GB超でindexedを要求します。1 GBは処理方式の切替条件で、容量上限ではありません。`selectExecutionRoute()`はこの判定と明示設定、保存先、利用可能な機能を扱います。

indexedでは合計1000万sampleを既存parserの対応範囲に合わせて扱い、索引の件数に比例する配列を作りません。入力は固定作業領域の外部ソート、出力は最大10万sampleの並替え区間を使います。出力の並替え上限を超える長いGOPは明示的に拒否します。索引の明示予約は0.008388608 GB、入出力ソートの合計予約は0.004194304 GBのままです。moov全体は容量制限から外し、表を0.000065536 GBずつ走査します。小さい構造・説明metadataと入力skeletonの0.016777216 GB予算、box2万個・深さ16は維持します。

legacyではMediabunnyの索引がsample数に比例するため、10万sample・metadata 0.016777216 GBの条件を維持します。copyは元Fileの範囲を参照するBlobを組み立て、媒体全体の配列を作らず保存時に逐次コピーします。これらのバッファ予算をcodecやブラウザを含む総メモリ量の保証にはしません。

## 保存記録 schema 2

記録の正本は `saveAttempts` です。生成結果の `operationId`、`inputRevision`、生成時の設定snapshot、入力・出力bytes/hashを保持し、各試行に固有の `id`、`resultOperationId`、`inputRevision` を付けます。保存時のDOMから生成設定を取り直しません。試行は `direct`、`prepared-copy`、`download-request` を区別します。

各試行は `commitState`（not-started / pending / committed / aborted / unknown）と `verificationState`（not-run / running / passed / failed / canceled）を分離し、観測したbytes/hash、`hashBasis`、開始・終了時刻、所要時間、エラー、清掃結果を記録します。完了した旧試行を追加保存の開始・取消で書き換えません。保存後照合に失敗しても、既知の `committed` は保持し、保存先を自動削除しません。

`save-record.mjs` の `summarizeSaves()` は同一結果に属する試行だけを検査して要約します。foreign ID、重複試行ID、出力bytes/hashと一致しない照合成功を拒否します。`bindSaveSummary()` は以下を読み取り専用の導出欄として設定します。Workerのstructured cloneやJSONでは導出時点の値となり、clientはschema 2のgetterを復元します。上位フラグを別々に更新する第二の正本は作りません。

| 導出欄 | 意味 |
| --- | --- |
| `saveWriteCommitted` | 1件以上の既知commitがあればtrue。既知commitがなくunknownを含む場合はnull。それ以外はfalse |
| `saveCompleted` | この結果に保存後照合passedの試行が1件以上ある |
| `savedSize` / `savedSha256` / `saveObservedAt` | 最後の照合成功試行のサイズ、hash、確認時刻。未確認はnull |
| `lastSaveAttemptId` | 最後の試行。取消や失敗も含む |
| `lastVerifiedSaveAttemptId` | 最後に照合成功した試行。追加取消では変わらない |
| `saveApiMs` / `savePermissionWaitMs` | 最後の照合成功試行の対応区間。未測定はnull |
| `downloadRequestedAt` | 最後のダウンロード要求時刻。保存完了ではない |

**hashの根拠は分けます。** `output.hashBasis` は準備済み出力の `prepared-output` 又はdirect保存後観測の `post-commit-observed` です。prepared-copy試行の `prepared-output-compared` は事前に完成していた出力hashとの比較です。directの `wholeFileHashCompared:false` は、全体hashが保存後の観測値であることを示します。directでは追加VR metadataだけを事前期待hashと比較し、保存後MP4を再解析します。directの試行hashと結果hashが同じことを、別の事前全体hashとの独立一致に読み替えません。

元のdirect観測は `directSave` に保持します。Worker異常終了の不明記録は元記録を `workerReceipt` に保持し、明示終了でもunknownのまま残します。既に生成・照合が完了した結果との取消競合は `preparedBeforeCancel` に同一世代の結果を保持し、成功履歴を残します。過去schema 1の証拠をschema 2へ自動変換する互換・移行処理は設けません。

保存は記録時点の観測であり、その後の外部編集・削除や、電源断後の永続保持を監視したという意味ではありません。`downloadRecovered` と `targetVRPlayerVerified` は保存成功と別です。

## 記録の取得と失敗後の操作

画面からJSONを保存できます。新しい遠隔ログ収集は追加していません。提供されなかった利用ログは自動集計できません。ファイル名や保存先パスを遠隔ログへ送りません。

Workerとページの区間時間、設定、ID、入出力bytes/hashを記録します。全体hashは最大0.001048576 GBずつ読み、取消を受け付けます。未完了hash、未測定CPU/GPUピーク、外部回収、VR再生を成功や0へ補完しません。ページ時間とWorker時間は別時計で、選択からの時間には設定操作が含まれます。

`saveBlobToFile()` の清掃失敗は `retryCleanup` を持ちます。画面はその成功まで次の作成・保存を止めます。保存済み履歴と今回の追加保存結果を分けて表示します。未知のdirect状態は、記録保存と明示終了の後も成功扱いせず、保存先ファイルの確認を促します。

## 検証と履歴

`node --test tests/vr180-*.test.mjs`

P1aは実appイベント経路の模擬DOM試験で、初回保存、追加保存取消、direct後の追加保存取消・失敗、commit後の照合失敗・取消、清掃再試行を検査します。client/Workerの世代照合、unknownの明示終了、取消競合も対象です。模擬DOM・模擬backend試験は、OS保存ダイアログや実ブラウザでの保存成功ではありません。

独立メタデータ照合は `tools/vr180/verify-metadata.py`、回収した小素材の画素・時刻・音声照合は `tools/vr180/verify-conversion.py` を使います。実施版・判定は[反映・検証記録](https://github.com/Kushyameln01/kushyameln-works/blob/main/development/vr180/RELEASE-2026-10-17.md)を参照してください。

- b3は逐次hashと位置指定保存を導入し、小素材UIの実ダウンロード、取消・再実行、実OPFS backendを検証しました。当時の変換はOPFS経由でした。
- b4はサンプル表等の範囲走査、取消可能なmetadata再構築を導入しました。4.294967296 GB境界の構造adapter試験は、実ブラウザでの同容量出力の証拠ではありません。
- b5 `vr180-b5-direct1` は選択handleへの直接muxを導入しました。実Chrome・OPFS backendで小素材と4K12秒の直接保存、0.001048576 GB書込み後取消→0 B→同handle再実行を検証。4回のmux write、2,703,581 bytesを全回収し、360フレーム・時刻・559 AAC packets・VR情報を独立照合しました。

これらの既存証拠は、P1a変更後のOS保存ダイアログ、外部保存先、app direct UI、5〜10 GB実動画、VR再生互換性、実写品質、操作性、速度改善の合格を示しません。

legacyは既存 `media-basic/vendor/mediabunny.mjs` 1.61.5、indexedは専用 `vr180/vendor/mediabunny-indexed.mjs` を使います。本変更ではどちらのvendor bundleも変更せず、付属ソース・MPL-2.0ライセンスを維持します。
