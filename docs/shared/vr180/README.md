# VR180 b1 shared module

目的は、VR180撮影素材・左右2眼動画をブラウザで簡単に加工することです。このブランチは最小縦断試作です。ブラウザ変換・保存・VR利用先の合格や、製品全体の完成を示しません。

## 実装した入口

`client.mjs` の `StereoClient` が専用Module Workerを作成します。

- `run(file, {mode: 'inspect'})`: MP4の構造、既存VR情報、変換時刻条件を検査。
- `run(file, {mode: 'copy', layout: 'sbs'|'tb', fov: 180, confirmed: true})`: 元の圧縮サンプル・時刻・音声を保持し、180度のVR情報を付与。
- `run(file, {mode: 'convert', layout, fov: 180|360, eyeSize, bitrate, confirmed: true})`: 正面180度の切出し、横並びへの配置、H.264再圧縮、条件付きAACコピー。
- `cancel()` / `dispose()`: Workerを終了し、そのジョブの一時保存を削除。

`confirmed` は呼出側が入力の投影と左右配置を確認したことを示します。ファイルの縦横比だけから付与してはいけません。b1は180度の各眼を正方形、360度の各眼を2:1に制限します。

成功時は `{blob, receipt, info}` を返し、保存が終わるまで結果を保持します。Blobを取得した直後に `dispose()` してはいけません。結果保存または明示的な破棄の後に呼び出します。同じclientで次のジョブを始める前にも `dispose()` をawaitします。

## 対応範囲

1ファイルに格納した左右／上下の正距円筒MP4、H.264 SDR、音声なしまたはAAC 1トラック。既存メッシュ、魚眼、カメラ固有補正、左右別ファイル、HDR、追加データトラック、複雑な編集リストは対象外です。左右別ファイルの将来の同期契約は `development/vr180/IMPLEMENTATION.md` にあります。

出力はSpherical Video V2のcropped equirectangular 180度ステレオです。Googleのカメラ固有メッシュ形式への準拠を意味しません。変換はOPFS、OffscreenCanvas、WebCodecsへの対応を実行時に確認します。AACの対応する先頭調整は保持しますが、変換後の音声seek用sample-groupは再生成されず、途中からの再生品質は未検証です。

## 記録と上限

記録は画面からJSONで保存します。外部ログ収集は追加していません。Worker内の区間時間、ページ内の作成・保存時間、設定、ジョブID、入力・出力サイズ、16MiB以下のSHA-256を残します。大きい入力のhash、実測していないCPU/GPUピーク、ファイル回収、VR再生は未取得として残します。

実験用の上限はmoov 16MiB、出力1GiB、処理100000サンプルです。MP4の索引はサンプル数に比例するため、総メモリの一定上限を保証しません。成功時の出力は明示破棄までOPFSを使用します。

## 検証

`node --test tests/vr180-*.test.mjs`

独立メタデータ照合は `tools/vr180/verify-metadata.py`、ブラウザから回収した小素材の画素・時刻・音声照合は `tools/vr180/verify-conversion.py` を使います。後者はブラウザ出力をまだ取得していないため未実行です。現時点の判定と再開条件は `development/vr180/RESULT.md` に記録します。

依存は既存の `media-basic/vendor/mediabunny.mjs` 1.61.5です。既存のソース配布・MPL-2.0ライセンスを維持し、依存本体や既存ツールは変更しません。
