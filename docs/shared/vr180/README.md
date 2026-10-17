# VR180 shared module

現行候補：`vr180-b7-phases1`。公開前の変更は候補branchで検証し、公開版との一致は別記します。

保存の区間記録は `receipt.timings.filePhases`（direct）と各 `saveAttempts[].timings.filePhases` に残します。計画、metadata hash/write、truncate、close、getFile、全体hash、metadata読戻し、再解析を区別し、失敗時も終了statusと経過時間を保持します。`requestedBytes` はAPIに要求した量で、失敗したwriteの成功量ではありません。重なる区間を足して総時間にはしません。

高頻度metricsの記録は最新8件と `eventLog.dropped` に制限します。保存試行の事実履歴は打ち切りません。記録は端末内JSONで書出し、遠隔へ自動送信しないため、提供されない利用ログは集計できません。SDKの観測値とブラウザ全体・GPUメモリを区別し、未計測はnullとします。

目的は、VR180撮影素材・左右2眼動画をブラウザで簡単に加工することです。現在の対応範囲と実際に検証した範囲を以下に分けます。5〜10 GBの実動画を加工・保存・全回収する目標は未達です。

## 現在のAPI

`client.mjs` の `StereoClient` が専用Module Workerを作成します。

- `run(file, {mode: 'inspect'})`: MP4の構造、既存VR情報、変換時刻条件を検査。
- `run(file, {mode: 'copy', layout: 'sbs'|'tb', fov: 180, confirmed: true})`: 元の圧縮サンプル・時刻・音声を保持し、180度のVR情報を付与。
- `run(file, {mode: 'convert', layout, fov: 180|360, eyeSize, bitrate, confirmed: true}, {outputHandle})`: 正面180度の切出し、横並びへの配置、H.264再圧縮、条件付きAACコピー。`outputHandle` は任意で、指定時は保存先へ直接出力。
- `cancel()` / `dispose()`: writer・codec解放とそのジョブの一時保存削除を待ち、清掃応答後にWorkerを終了。清掃失敗中は次の処理を止め、明示的な清掃再試行を受け付ける。
- `acknowledgeUnknownOutput()`: 異常終了で保存状態不明になったdirectジョブを明示的に終了。不明記録を返すだけで、保存成功・取消成功・清掃成功へ変更しない。

`confirmed` は、呼出側が入力の投影と左右配置を確認したことを示します。ファイルの縦横比だけから付与してはいけません。180度の各眼は正方形、360度の各眼は2:1に制限します。

作成成功時は `{blob, receipt, info}` を返します。directの `blob` は保存後に取得した実File、通常経路は保存待ちのBlobです。結果を保存又は明示破棄するまで保持し、その後 `dispose()` をawaitします。同じclientで次のジョブを開始する前にも `dispose()` が必要です。結果の取得直後に一時ファイルを削除しないでください。

## 経路と必要な能力

| 経路 | 保存先と必要な能力 | 作成成功の意味 |
| --- | --- | --- |
| convert + `outputHandle` | 空のFileSystemFileHandle、WebCodecs、OffscreenCanvas、Module Worker。OPFSは不要 | 直接muxし、VR情報の追記、物理close、読戻し検査まで完了したFile |
| convert、handleなし | OPFS、WebCodecs、OffscreenCanvas、Module Worker | OPFS経由で準備した出力。外部保存は未完了 |
| copy | Module WorkerとBlob範囲読込み。変換用OPFS・codecは不要 | 元の圧縮サンプルを保つ出力。外部保存は未完了 |
| 準備済み出力を保存 | `saveBlobToFile(blob, handle, {signal, expectedSha256})` | 1 MiBずつコピーし、保存後のサイズ・全体hashを事前期待値と照合 |
| Blobダウンロード | ブラウザのダウンロード操作 | 要求を出した事実のみ。保存完了・外部回収を証明しない |

画面は作成前にも保存先を選択できます。選択した保存先への直接muxはconvertだけに適用し、copyは作成後に保存します。非空の既存保存先を拒否し、入力原本の上書きを避けます。保存APIの存在だけではOS保存ダイアログを操作できた証拠にはなりません。

## 対応形式と上限

1ファイルに格納したSBS/TB正距円筒MP4、H.264 SDR、音声なし又はAAC 1トラックが対象です。既存メッシュ、魚眼、カメラ固有補正、左右別ファイル、HDR、追加データトラック、複雑な編集リストは未対応です。左右別ファイルの将来の同期契約は[固定候補のIMPLEMENTATION.md](https://github.com/Kushyameln01/kushyameln-works/blob/e6c0245eb72ad676c2297e2d5b7ba5fc592e9e60/development/vr180/IMPLEMENTATION.md)にあります。

出力はSpherical Video V2のcropped equirectangular 180度ステレオで、Googleのカメラ固有mesh形式への準拠を意味しません。変換でAAC payload、decoder configuration、対応する先頭調整を保持しますが、音声seek用sample-groupは再生成せず、途中からの再生品質は未検証です。

現行の変換制限は映像・音声の合計100000 samples、入力moov等16 MiB、VR情報を含む最終変換出力1 GiBです。direct・通常OPFSの両方で最終サイズを検査し、超過時は成果物として返しません。copyへ変換専用の上限を適用しません。

再圧縮なしの解析はmoovを全量配列化せず、表を64 KiB単位で走査します。小さい構造・説明metadataは合計16 MiB、各trackは1000万samples、boxは2万個・深さ16までです。directの捕捉器は先頭2048 bytesと末尾moov（16 MiB以下）を保持し、未捕捉範囲の読込みを拒否します。Mediabunny内部の入力・出力索引は現在もsample数に比例します。これらの読込み単位・capture量を、codecやブラウザを含む総メモリ量の上限としません。

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

Workerとページの区間時間、設定、ID、入出力bytes/hashを記録します。全体hashは最大1 MiBずつ読み、取消を受け付けます。未完了hash、未測定CPU/GPUピーク、外部回収、VR再生を成功や0へ補完しません。ページ時間とWorker時間は別時計で、選択からの時間には設定操作が含まれます。

`saveBlobToFile()` の清掃失敗は `retryCleanup` を持ちます。画面はその成功まで次の作成・保存を止めます。保存済み履歴と今回の追加保存結果を分けて表示します。未知のdirect状態は、記録保存と明示終了の後も成功扱いせず、保存先ファイルの確認を促します。

## 検証と履歴

`node --test tests/vr180-*.test.mjs`

P1aは実appイベント経路の模擬DOM試験で、初回保存、追加保存取消、direct後の追加保存取消・失敗、commit後の照合失敗・取消、清掃再試行を検査します。client/Workerの世代照合、unknownの明示終了、取消競合も対象です。模擬DOM・模擬backend試験は、OS保存ダイアログや実ブラウザでの保存成功ではありません。

独立メタデータ照合は `tools/vr180/verify-metadata.py`、回収した小素材の画素・時刻・音声照合は `tools/vr180/verify-conversion.py` を使います。実施版・判定は[反映・検証記録](https://github.com/Kushyameln01/kushyameln-works/blob/main/development/vr180/RELEASE-2026-10-17.md)を参照してください。

- b3は逐次hashと位置指定保存を導入し、小素材UIの実ダウンロード、取消・再実行、実OPFS backendを検証しました。当時の変換はOPFS経由でした。
- b4はサンプル表等の範囲走査、取消可能なmetadata再構築を導入しました。4 GiB境界の構造adapter試験は、実ブラウザでの同容量出力の証拠ではありません。
- b5 `vr180-b5-direct1` は選択handleへの直接muxを導入しました。実Chrome・OPFS backendで小素材と4K12秒の直接保存、1 MiB書込み後取消→0 B→同handle再実行を検証。4回のmux write、2,703,581 bytesを全回収し、360フレーム・時刻・559 AAC packets・VR情報を独立照合しました。

これらの既存証拠は、P1a変更後のOS保存ダイアログ、外部保存先、app direct UI、5〜10 GB実動画、VR再生互換性、実写品質、操作性、速度改善の合格を示しません。

依存は既存 `media-basic/vendor/mediabunny.mjs` 1.61.5です。本変更で共有vendorを変更せず、既存ソース配布・MPL-2.0ライセンスを維持します。
