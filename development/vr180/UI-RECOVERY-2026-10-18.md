# 候補画面の清掃再試行と保存事実の維持

2026-10-18。起点は `bb91106e1a8e72c8958c1e0b2b6e48c4357506ac`。
Works引継ぎの残件「書込み後取消・異常終了後回復」に関連する、保存後の
清掃再試行を今回の実装単位とする。大容量UI、実OS保存、実写・60fps・VR再生の
受入をこの作業で代替しない。入力・出力各1GiB、既定legacyを維持する。

## 確認した問題と修正条件

実StereoClientと制御Workerで、保存済み・照合済みの処理が内部清掃に失敗し、
画面から清掃を再試行した場合を再現した。cleanup-completeの表示後に、元のrunが
古いdiagnosticsを付けてrejectし、清掃未完了の表示へ戻る。保存ファイル破損の
証拠ではなく、後続の清掃完了が画面と処理記録に残らない問題である。

修正は同一operationId/inputRevisionと所有identityに結び付いた清掃完了を
追補記録として保持する。元の失敗診断や保存観測は書き換えない。他のjobの
完了通知を流用せず、保存済みMP4は清掃対象にしない。

## 変更前に固定した受入

1. 取消ボタンから清掃再試行後、遅延rejectを受けても清掃完了表示と追補が残る。
2. 元の失敗・保存記録を保持し、異なるjob/世代/所有者の通知を適用しない。
3. 同一候補commitの通常実UI試験でMP4と処理記録を回収し、従来動作を確認する。
4. 実Chromeで清掃削除だけを失敗注入し、解除後の実UI再試行・同じ保存ファイルの
   hash・全bytes回収・独立画素/PTS/AAC/VR情報の照合を行う。

試験用Worker wrapperが、当該runのregistry namespace削除だけを失敗させる。
製品moduleの配信bytesは変更せず、注入コードとhash、失敗回数、解除、清掃を
記録する。OS保存pickerは既存試験同様にnative OPFS handleへ置換するため、
実OS操作・自然発生のクラッシュへの合格は宣言しない。

## 資料照合と状態

添付4 ZIPのbytes・SHA256・payload SHA256はpreservationと一致。run
39046224628は約59MB・30fps・300frame・無音の校正試験であり、後続の
5/10GBやAACの受入とは別である。manifest自身の比較対象は記載されていない。
参照確認記録 `/workspace/space-reference-check-20261018/RESULT.json` はこの
workspaceには存在せず未取得。添付とGitHub固定資料から判断可能な範囲を進める。

実装と局所試験: 作業中。実ブラウザ受入: 未実施。公開main/Pages/Sitesの変更: なし。
