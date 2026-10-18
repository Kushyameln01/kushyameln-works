# VR180の3件の不整合修正

対象基点: `6026eae58f2313c3d4c6ea38b53a778455d74698`。以下の試験・候補の記録は、添付パッチ作成時の未公開作業ツリーを対象とする。今回の公開反映の確認とは区別する。

## 受入条件と変更

|順序|元の要件|変更と判定|
|---|---|---|
|1|受付可能なudta/cprt・udta/nameを無通知で脱落させない|両atomを完全なBlob範囲として収集し、movie/vide/sounと入れ子udtaに対応。移送予算をmetaと共有し、超過時は既存の省略件数・理由へ記録。PASS|
|2|indexed保存確定・照合中は画面「3」を処理中にする|commit直前に強制saveCommit通知。既存UIが不定進捗と処理中メッセージを表示。PASS|
|3|保存記録とMP4の指定試験を検証対象まで到達させる|VMへ本物のroute-profile定数・関数を渡し、DOM doubleへdatasetと属性操作を追加。MP4の厳密な戻り値比較に追加フィールドを反映。PASS|

R1を先に修正・検証した後、R2、R3を統合した。コピー経路、既存の予算・キャンセル・保存記録の契約を維持する。変更したindexed transformの現在SHAをprovenanceに記録し、既存の他の由来記録は書き換えていない。

## 回帰試験

- `tests/vr180-container-metadata.test.mjs`: 変更前2失敗→変更後2成功。検査受付済みの実MP4に両atomを付け、movie/video/audioの完全バイト保持、通常Blob・indexed tree移送、コピー経路を検証。予算境界では省略理由とpayload未読を検証。
- `tests/vr180-indexed-save-progress.test.mjs`: 変更前1失敗→変更後1成功。固定時計で通知の強制送信を確認し、truncate/close・保存後ハッシュ・再検査・completeの順序を検証。codec/indexはdoubleであり、ブラウザ変換とは別の証拠。
- 保存記録試験: 変更前2成功・12失敗→変更後14成功。指定MP4戻り値試験: 変更前失敗→変更後1成功。製品の13個の不具合として扱わない。
- メタデータ・indexed進捗・保存記録・file-output・direct-outputを合わせた対象Node試験42件成功。Python既存試験46件成功。公開用静的exportと`git diff --check`成功。
- 初回レビューでは、MP4の異常サイズ試験に既存の期待値不一致が1件残った。ユーザーの追加依頼で下記のとおり解消した。既存の容量上限・版名など、他ファイルの試験不一致は今回修正していない。

## 追加依頼: 残るMP4試験の不一致

製品コードは変更していない。現行仕様は末尾まで続くトップレベル`mdat`のsize=0を認めるが、旧試験はその入力をsize違反として拒否することを期待していた。`mdat`だけの8 Bファイルは実際には必須の`ftyp`不足で拒否されており、拒否理由の期待値を正確に修正した。

- size=0のトップレベル`moov`と入れ子`free`の拒否を明示し、禁止形式の検査を維持した。
- 完全なMP4で末尾`mdat`だけをsize=0にした正常例を追加。受付、タグ付与による有限サイズへの変更、媒体位置・ペイロード全バイト・サンプル数の保持を確認した。
- 修正前は対象1件失敗。修正後は対象2件成功、`tests/vr180-mp4.test.mjs`全26件成功（失敗・中断・スキップ0、exit 0）。独立Reviewerも対象2件を実行しPASS。
- ログは`mp4-malformed-before.log`、`mp4-malformed-after.log`、`mp4-full-after.log`。製品コードと実行条件は前回から不変のため、ブラウザ処理・大容量試験は再実行していない。

## 実ブラウザでの確認

`three-fixes-browser.py`で候補の実UIを操作した。Chromium `154.0.8037.57`、Playwright `1.62.0`、クラウド内HTTP配信、WebCodecs・Worker・OPFS・Web Locksを使用。OS pickerだけをnative OPFS file handleへ置換した。Chromiumはこのクラウドで利用できる既定のheadless起動であり、CIのsandboxed Chrome試験とは区別する。

入力は同梱2秒・30fps・音声付きSBS180合成素材へcprt/nameを付加したもの。出力設定は各眼256px・H.264・2Mbps、indexedを明示した。

|項目|観測|
|---|---|
|入力|30,207 B / SHA-256 `6d918907b6930f0bffbe4781e582362b8029d7632f7e9b36ad6bf006ab565f6f`|
|出力全量|51,458 B / SHA-256 `58838404b978b5ea1b6bd9dd158f48404dfa61a7dae389a6056254ec65dc167c`|
|操作ID / 入力世代|`1f68b637-9571-470c-b890-a68dbeb9cd3a` / 2|
|保存中表示|saveCommitが1回発火。画面「3」の進捗が可視・不定状態となり、「保存ファイルを確定して内容を確認しています…」を表示|
|メタデータ|回収した入力と出力から独立のbox走査でcprt/name全バイトの一致を確認。移送報告は3件152 B保持（既存meta込み）、省略0|
|媒体の独立検査|既存verify-conversion.pyがPASS。全60frame、PTS誤差0、各眼PSNR 38.291/34.608 dB、復号音声一致|

処理記録の入力・出力SHAと回収ファイルの全量SHAを照合した。独立Reviewerも回収バイトと画面観測を読み直し、3受入条件をPASSとした。OSの保存ダイアログ、大容量・長時間素材、VR機器、公開サイトでの動作は未確認。新しい容量・速度・互換性保証は加えない。

再実行はdocsを一時HTTP配信し、次を実行する（出力先は未作成のディレクトリを指定）。

```sh
python3 development/vr180/three-fixes-browser.py --output /absolute/new/evidence-dir
python3 tools/vr180/verify-conversion.py /absolute/new/evidence-dir/input.mp4 /absolute/new/evidence-dir/output.mp4 --layout sbs --fov 180 --eye-size 256 --report /absolute/new/evidence-dir/conversion-verification.json
```

## 手順・根拠と引継ぎ

ユーザーから追加受領した`KushyamelnWorks_Failure_Workflow_v1.0_2026-10-18.zip`のチェックリスト、P0–P7、F03/F08/F05を適用した。資料作成時の「文書のみ」「当時の1GiB候補」は過去タスクの範囲であり、今回の修正指示や現行製品仕様へ転用しない。失敗原ログを残し、harness不備と製品の不具合を分けた。

指定7スキルの本文はSkillサービスから読んだ。付属参照の取得APIとSpaceへのHTTPは失敗したが、追加ZIP内の7本文は読込済み本文とバイト一致した。必要なcloud-validation.md、役割・監査protocol、CDLC評価資料、RTK script、Ideal State補助文書をその原本snapshotから取得し、選択8ファイルのsize/SHAを同梱manifestと照合した。Spaceの現時点の更新有無は未確認。

RTK `0.51.0`は添付の準備scriptを実行。homeへの書込み不可を切り分け、元scriptを残した上で、ローカルcopyの配置先だけを`/workspace/.tools/rtk-token-optimizer/0.51.0/rtk`に変更した。XDG_DATA/CONFIG/STATEを作業領域へ向け、公式archiveの固定SHA・TLS・version/gain検査を保って導入。`DO_NOT_TRACK=1`でgainとGit状態の圧縮表示を実行した。HOMEや全体設定を変更していない。

CDLCは今回の計画・証拠・引継ぎにImproveモードで適用し、スキル自体は変更・再配布していない。監査は要件、優先順、追加の検証経路と完了判定をPROCEEDとした。Unityデータは今回取り扱っておらず、Unity専用スキルは適用外。

原ログ、入力/出力MP4、receipt、画面観測、媒体検査、取得根拠と候補ファイルhashをクラウド内`/workspace/vr180-fix-evidence/`へ保管する。main/Pages/Sitesや公開済み環境snapshotには反映していない。次の工程は、この候補差分のレビューと必要に応じた公開である。


## 2026-10-18: ChatGPT Sites / GitHub Pagesへの統合

ユーザーの添付 `KushyamelnWorks_VR180_Fixes_2026-10-18_v1.zip`（packageVersion 1.0）を対象とし、変更をパッチ適用と記録の整合に限定した。

- 統合基点: Sites v82 / `f84cc27d4006e04c665dbd385d9f026ebace7b60`、Pages `84bdf84496f0b2f767b22e8d311c9691f0c8ea32`。
- 製品2本のJavaScript、既存UI・依存・素材12件はパッチの適用前SHAと一致。Pages側の既存試験2件も一致し、新規4件には競合がない。
- `provenance.json`は前回の記録修正が入っているため、パッチの全文を上書きせず、transformの現在SHAとsaveCommitの変更説明だけを統合。r5/r6の説明、b14の版名、他の現在SHA、歴史的なsource/sourceSha256を保持する。
- Sitesは製品3ファイルと既存ビルド契約の該当3SHA・生成記録、Pagesは同梱の9ファイルを適用対象とする。新しいUI変更や独自の機能変更は加えない。
- 上記の回帰試験・ブラウザ検証結果は添付元の記録であり、今回の環境で再実行した結果ではない。今回の確認範囲はパッチ・適用前後SHA、構文、既存のビルド、公開配信との照合とする。
