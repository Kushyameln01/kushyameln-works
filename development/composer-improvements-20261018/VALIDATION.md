# 検証記録

2026-10-18 / 対象製品B `20edc32b13981320686d5418852cacf589d24a63`

**判定：実装・公開済み、保全計画全体は未完了。** PASSは表に記載した試験層と範囲だけを指す。

## 手順と版

静的確認 → AのPages公開成功 → Aの20操作・実体保存 → Bの静的確認 → BのPages公開成功 → Bの配信取得・照合 → Bの動的検証の順序で実施した。B公開後にAや旧版生成器を実行していない。Node試験も公開後に取得したBの133ファイルを用いた。Sitesのbuildは静的な配信準備であり、未公開候補の操作試験には使っていない。

指定ワークフローv1.0、技術Tips本文1.2、直接指示、既存保全契約を照合した。原チャット全文未取得を、準拠認定で埋めてはいない。計画の基準と履歴は変更せず保存し、実行の状態をCONTRACT/RESULT/本書へ追記した。

## 受入の証拠

| 条件 | 結果 | 証拠・限界 |
| --- | --- | --- |
| R1 原本・出力 | 今回A/BでPASS、旧C01はHOLD | 31package実体が素材別に全バイト一致。選択・Plan回帰12群。全反復の回収は未完了 |
| R2 診断の独立性 | 確認範囲でPASS | 未実施、失敗、取消の独立状態。TEXT_BYTE_LIMIT後も生成可能・package回収。通常入力の診断へ復帰 |
| R3 識別子・意味 | 変更影響範囲でPASS | 境界試験、A/Bの同一coverage・診断・mapping・source。共有GUID規則自体は未変更。既存証拠の範囲を超えてUnity動作を保証しない |
| R4 所有権・全件性 | 確認範囲でPASS | 同期snapshot後に一回用参照を解除。借用poolをdisposeしない。17回収レポートがcomplete・意味一致。全素材の完全解析とは異なる |
| R5 評価の正確さ | 記録済み、必須残件あり | C01/C12、回収欠測、キー操作、memory nullを保持 |
| 初期依存 | PASS | B初期6リソース、未実施JSON保存後も6。computeを未使用時に要求しない |
| 遅延整形 | PASS（キー操作除く） | 未展開行/coverage整形0。展開後の再表示で各1。50件ページ送り、絞込み、全件保存・表示を確認 |
| キーボード | UNVERIFIED | summary Enterの制御deadline。成功を確認できていない |
| 取消・復帰 | 確認範囲でPASS | 境界30ケースとブラウザ取消→再実行。UI取消時の未settled処理はlastMs=null。物理的な即時停止を証明しない |
| C12性能 | PARTIAL | 40操作＋追測5回。連続全体時間・Blob区間は未取得。初回診断負担と境界超過も記録 |

## 公開コードで行った試験

| 試験 | 結果 | 実行層 |
| --- | --- | --- |
| `test-shared-diagnostics.mjs` | PASS 30ケース | モック境界。同期・非同期例外、load取消/失敗/dispose/retry、古い完了、原本・識別子など。ブラウザWorkerそのものの保証ではない |
| `test-package-selection.mjs` | PASS 12群 | Node VM Worker、scan→select→analyze→generate、選択/既知fileID/制限/破損。`--experimental-vm-modules`付き |
| `test-shared-sdk-limits.mjs` | PASS | 公開ファイルの実SDK・WASM・Node Worker。snapshot/report上限、原本不変、失敗後成功。ブラウザの速度証拠ではない |
| 公開ブラウザA/B | 40操作の工程値取得 | Chrome 154/Linux、Worker 2、moduleReuse=false、parseBatchSize=8、合成通常・多件数素材 |
| 追測 | 5操作取得 | 変更なしBの通常・診断なし。初回群の値は置換しない |
| 追加UI回帰 | 6件の記録・JSON回収 | 生成物診断、同一比較、取消、再実行、上限超過、通常入力へ復帰。キー操作は未確認 |

`B-tests.json` に初回harness起動のフラグ不足も残す。製品障害と試験設定の不備を混同しない。既存共有部に変更がない箇所の試験は、継承証拠を使い、件数のための再実行はしない。

## 実体の照合

Aはpackage15・report8、Bはpackage16・report9を回収。全31packageが同じ素材の基準と一致。17reportは完全なJSONとしてparseし、全件性、入力/Plan、coverage、構造・指摘・位置・参照対応を照合した。

レポートの実行ID・revisionカウンタ・時間だけを列挙した規則で正規化し、job完了順は数値job識別子順へ整列した。元のJSONを上書きしていない。正規化規則と各hashは `comparison.json`、実体はA/B archiveにある。同一反復比較19 PASS / 11 UNAVAILABLE / 0 FAIL。未回収行は `byteVerification: NOT_PERFORMED_UNAVAILABLE` とし、archiveに存在しないという一致とバイト一致を分離した。

追加回帰ではTEXT_BYTE_LIMIT後のpackage 6,518 bytes / SHA-256 `fa7d7830444c9eb24d3c95c9e0b6d422ebff8dc96ef550f021b5a91ce67a3700`を取得。最初のdownload返却パスに実体がなく、生成済みリンクを回収し直した。生成は繰り返していない。

## 再開条件

1. C01：旧版の対応入力・Plan・出力実体・revisionを取得して比較する。未取得のまま合格へ変更しない。
2. C12：不足する観測区間を先に定義した測定が必要。既存Aの未観測値の遡及補完や旧コードの再実行はしない。
3. キーボード：最新公開版でsummaryへのフォーカス・Enter/Space・再折り畳みを確認する。制御経路のdeadlineが残る場合は失敗と未確認を区別して記録する。
4. 回収欠測：残存する既存出力実体が得られる場合だけ回収・照合から再開し、代わりの再生成で当該試行の成功を埋めない。

**必須項目が未実施または未確認なら未完了である。** 未解決FAILがないことだけを完成条件にしない。
