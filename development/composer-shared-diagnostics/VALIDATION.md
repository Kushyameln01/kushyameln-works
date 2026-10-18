# 受入条件と期待結果（実装前固定）

2026-10-18。動的試験はPages更新後の最新版クラウド複製でのみ行う。下記は期待値であり、実施結果ではない。

| ID | 必須条件 | 期待結果 |
| --- | --- | --- |
| C01 | 既存入出力・選択読込・Plan復元・生成 | Sites v69の機能を保持。旧出力Asset/metaとの差は原則バイト一致、例外は根拠と範囲を記録 |
| C02 | 診断未実施・成功・同期throw・非同期reject・取消 | 全状態でoperationId/revision/reasonを追跡。非成功sdkReport:null |
| C03 | 旧success/failure/progress、取消直後再実行 | 新結果を上書きしない。Composer生成可否を診断が変更しない |
| C04 | 単一・片側合計・text・snapshot・report上限とmeta | 診断のみ理由付き失敗/未実施。全件preflight前に本文/metaの追加コピーをしない |
| C05 | 入力原本・buffer・共有pool | 原本hash不変・detachなし。借用SDKが他利用者poolをdisposeしない |
| C06 | 選択外・referenceOnly・opaque・曖昧参照 | 確定欠落へ読み替えず、inputCoverageとSDKの判定範囲を明示 |
| C07 | JSON全件・50件ページ送り・絞込み | ページ外もJSONに存在。全件整形は表示/保存時のみ、同一結果では再利用。サイズ計算をページごとに行わない |
| C08 | fileIDと位置 | signed64上限/下限・32bit超の文字列が無損失。日本語/絵文字のoffsetはUTF-16、end排他 |
| C09 | 同じtargetの基準比較・GUID大小文字 | 変更前後revisionと選択を記録。GUID大小文字だけで削除+追加としない。異なるtarget比較は拒否 |
| C10 | Module/Worker/WASM・公開版照合 | 最新Pagescommit/配信byteの確認後に実ブラウザ入力→処理→JSON/package実byte回収 |
| C11 | 取消・例外からの再開・破棄 | 旧進捗・旧失敗抑制、保存基準を明示解放、Worker/URL/pool/一時serverを終了 |
| C12 | 画面条件の工程別測定 | moduleReuse=falseと実Worker設定を記録。caller全体、prepare、SDK、容量計算を分ける。未計測memoryを推定しない |
| C13 | 他プロダクト・配信構成 | 無関係な静的資産・登録task・Worker/D1設定・migrationのhash不変 |

必須項目にUNVERIFIED/HOLDがあれば初期実装完了とはしない。Unity Editor/MA/VRChatの動作、全種類のUnity情報のlossless編集、新DSL、恒常的な性能改善認定は初期範囲外。

初期状況: C01〜C13 未実施。以下は公開後に追加した実施結果。期待条件は変更していない。

## 実施結果（2026-10-18）

製品コードcommit `691e0a34df232b6f2c52509f23139779e7696e07`。Sites v71 / source `724388539aaa4b3e92752f8da2a6cd7ed7ec644c`。試験開始前にPagesのbuild/deployment成功を確認した。後続 `85e64d5c…` はVR180の更新であり、Composer・Unity SDK・共有compute・FTに差分がないことをGitHub比較で確認した。

「PASS」は下表の実施範囲に限る。Node Worker試験、mock試験、実ブラウザ試験を相互に代替しない。全体判定は **未完了（C01、C12）**。

| ID | 判定 | 実施範囲・証拠・残件 |
| --- | --- | --- |
| C01 | HOLD | 既存生成試験、選択読込12群、Plan復元、実ブラウザで生成・再読込みを確認。現行版の診断前後packageは6510 bytesで完全一致。ただし旧版の保存済み出力を確保できず、旧新版Asset/meta比較は未実施。現行版同士の一致を代替合格としない |
| C02 | PASS | 17境界回帰のprepare/SDK同期throw・非同期reject、実ブラウザの未実施・成功・取消・TEXT_BYTE_LIMIT失敗JSON。非成功はsdkReport:null、operationId/revision/reasonを回収 |
| C03 | PASS | 17境界回帰で旧通知と取消を検査。実ブラウザで取消後再実行、選択変更で旧結果無効化、診断失敗後も生成可能を確認 |
| C04 | PASS | preflightのファイル・合計・件数・テキスト・path制約とコピー前全件確認。実ブラウザの4 MiB超テキスト失敗後も生成成功。実SDK/Worker/WASMでSNAPSHOT_IR_LIMITとレポート8 MiB制約による失敗、両者の再開成功を追加確認。全ての上限組合せを網羅した主張ではない |
| C05 | PASS | 原本不変/複製bufferの回帰、実SDK境界試験の入力hash不変、借用poolをdisposeしないmock、同一版診断前後package一致。実機ピークmemory・全Worker共有状況の保証ではない |
| C06 | PASS | 14→12ファイル比較で未選択1件、many-inputsのpartial101/opaque1をJSONで保持。選択読込試験と静的確認でreferenceOnly経路を確認。全素材を診断済みとは表示しない |
| C07 | PASS | 214ファイルの報告は512表示項目を全件保持。実ブラウザで50件ずつ1→2ページ、missing絞込み1件、その状態から保存したJSONには512項目。遅延整形/キャッシュ/サイズ値の再利用は境界回帰とソース照合 |
| C08 | PASS | signed64上限/下限を文字列のまま保持、日本語・絵文字原文のUTF-16 offset/end排他を回帰検査。UIとJSONに単位を明記 |
| C09 | PASS | 実ブラウザ同一入力比較はchanges/fileChanges/ambiguous各0。選択差分2ファイル、target不一致では比較不可。公開コードのGUID/JSON回帰8件PASS |
| C10 | PASS（照合範囲限定） | 公開主要5ファイル＋SDK等18ファイルの実配信hash一致。クラウドChromeで入力→Worker/WASM診断→JSON/package回収。全配信資産をHTTPで照合した主張ではない |
| C11 | PASS（範囲限定） | mockで旧進捗/旧失敗抑制、実ブラウザで取消・容量失敗からの再実行、比較基準の明示解除。試験poolはfinallyでdispose、検証タブを終了。URL解放経路はソース確認。メモリリーク不存在の認定ではない |
| C12 | PARTIAL | 実画面条件Worker2/moduleReuse=false、UI全体・caller・prepare・SDK内区間を回収。容量計算だけの独立時間、診断なし/あり同条件反復、初回表示・ピークmemoryは未計測。高速化・性能非劣化の認定はしない |
| C13 | PASS（静的） | 既存5モデルmoduleと共有SDKを保持。Sites並行更新v70のVR180を取り込んだ上で公開。Worker/D1/migrationを保持し公開投影検査成功。全他プロダクトの動的回帰を実施した意味ではない |

詳細は [RESULT.md](RESULT.md)。生JSON・package・入力・Plan・ログは [evidence/evidence.zip](evidence/evidence.zip)、各hashと操作対応は [evidence/manifest.json](evidence/manifest.json) と [evidence/browser-actions.json](evidence/browser-actions.json)。

必須残件C01/C12があるため、計画全体の完了・保全受入合格とは認定しない。Unity Editor/MA/VRChat動作検証は今回の初期範囲外であり、残件と区別する。
