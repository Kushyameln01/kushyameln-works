# VR180 shared module

目的は、VR180撮影素材・左右2眼動画をブラウザで簡単に加工することです。小さな合成素材で加工・ダウンロードの成立を確認した検証版です。全環境での動作、VR利用先の互換性、製品全体の完成を示しません。

## 実装した入口

`client.mjs` の `StereoClient` が専用Module Workerを作成します。

- `run(file, {mode: 'inspect'})`: MP4の構造、既存VR情報、変換時刻条件を検査。
- `run(file, {mode: 'copy', layout: 'sbs'|'tb', fov: 180, confirmed: true})`: 元の圧縮サンプル・時刻・音声を保持し、180度のVR情報を付与。
- `run(file, {mode: 'convert', layout, fov: 180|360, eyeSize, bitrate, confirmed: true})`: 正面180度の切出し、横並びへの配置、H.264再圧縮、条件付きAACコピー。
- `cancel()` / `dispose()`: Workerに停止を要求し、writer・codecの解放とそのジョブの一時保存削除を待ち、清掃応答後にWorkerを終了。清掃失敗中は再実行を止め、明示的な清掃再試行を受け付ける。

`confirmed` は呼出側が入力の投影と左右配置を確認したことを示します。ファイルの縦横比だけから付与してはいけません。この検証版は180度の各眼を正方形、360度の各眼を2:1に制限します。

成功時は `{blob, receipt, info}` を返し、保存が終わるまで結果を保持します。Blobを取得した直後に `dispose()` してはいけません。結果保存または明示的な破棄の後に呼び出します。同じclientで次のジョブを始める前にも `dispose()` をawaitします。

## 対応範囲

1ファイルに格納した左右／上下の正距円筒MP4、H.264 SDR、音声なしまたはAAC 1トラック。既存メッシュ、魚眼、カメラ固有補正、左右別ファイル、HDR、追加データトラック、複雑な編集リストは対象外です。左右別ファイルの将来の同期契約は[固定候補のIMPLEMENTATION.md](https://github.com/Kushyameln01/kushyameln-works/blob/e6c0245eb72ad676c2297e2d5b7ba5fc592e9e60/development/vr180/IMPLEMENTATION.md)にあります。

出力はSpherical Video V2のcropped equirectangular 180度ステレオです。Googleのカメラ固有メッシュ形式への準拠を意味しません。変換はOPFS、OffscreenCanvas、WebCodecsへの対応を実行時に確認します。AACの対応する先頭調整は保持しますが、変換後の音声seek用sample-groupは再生成されず、途中からの再生品質は未検証です。

## 記録と上限

記録は画面からJSONで保存します。外部ログ収集は追加していません。Worker内の区間時間、ページ内の作成・保存時間、設定、ジョブID、入力・出力サイズ、全体SHA-256を残します。hashは最大1MiBずつ読み、取消を受け付けます。完了していないhash、実測していないCPU/GPUピーク、外部へのファイル回収、VR再生は未取得として残します。

実験用の上限はmoov 16MiB、出力1GiB、処理100000サンプルです。MP4の索引はサンプル数に比例するため、総メモリの一定上限を保証しません。成功時の出力は明示破棄までOPFSを使用します。

## 検証

`node --test tests/vr180-*.test.mjs`

独立メタデータ照合は `tools/vr180/verify-metadata.py`、ブラウザから回収した小素材の画素・時刻・音声照合は `tools/vr180/verify-conversion.py` を使います。2026-10-17にChrome 155のクラウド複製で小素材2件の加工・ダウンロードを行い、回収MP4の独立照合が成功しました。これは合成素材とダウンロード経路の判定です。VR再生・実写品質・操作性・性能改善や保存先選択APIの合格は意味しません。[現在の反映・検証記録](https://github.com/Kushyameln01/kushyameln-works/blob/main/development/vr180/RELEASE-2026-10-17.md)と[元候補時点のRESULT.md](https://github.com/Kushyameln01/kushyameln-works/blob/e6c0245eb72ad676c2297e2d5b7ba5fc592e9e60/development/vr180/RESULT.md)を区別してください。

依存は既存の `media-basic/vendor/mediabunny.mjs` 1.61.5です。既存のソース配布・MPL-2.0ライセンスを維持し、依存本体や既存ツールは変更しません。

## 保存基盤 b3

`sha256.mjs` は逐次SHA-256、`file-output.mjs` は位置付きwrite、truncate、commit、abortを提供する。muxer用streamのcloseはラッパーの終了だけで、実ファイルの確定はcommitが行う。確定後に読戻しhashを計算し、期待hashと比較する。確定後の検証取消・失敗では書込み済みの事実を記録し、巻戻し成功とは扱わない。

`saveBlobToFile(blob, handle, {signal, expectedSha256})` は1MiBずつコピーし、読戻し照合まで待つ。清掃失敗のerrorにはretryCleanupを残すため、呼出側は明示再試行が成功するまで次の操作を止める。現UIでは既存非空保存先を拒否し、各保存試行をsaveAttemptsへ保存する。保存先は作成前にも選べるが、変換の出力はまだOPFS経由であり、直接mux出力にはなっていない。5～10GB対応は未成立。

現行b3は小素材のUI加工・実ダウンロード、取消と再実行、独立した実OPFS保存backendを検証済み。4K 2秒・12秒の実回収と独立照合は変換器が同一のb2で実施した。最新の識別子と判定はRELEASE記録を参照。ネイティブ保存先ダイアログ、5～10GB、VR再生互換性・実写品質・使いやすさ・速度改善は未検証。
