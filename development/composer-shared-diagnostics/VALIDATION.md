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

初期状況: C01〜C13 未実施。静的確認、SDK mock、実ブラウザ、公開HTTPS、回収検査を別欄で追記する。
