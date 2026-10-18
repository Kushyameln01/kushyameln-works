# Animator Composer 共有診断・初期実装契約

2026-10-18 / 計画の実行、初期範囲のみ。以下の受入条件を実装・試験より先に固定する。

## 継承と基準

- 概論・工程: https://chatgpt.com/space/page_2394936dec0881918c19a0d132313ea9
- 保全計画: https://chatgpt.com/space/page_24ad086da33c819190bc9f29093dee8b
- 最新ユーザー指示の5補足をこの実装契約へ具体化する。
- Composer保全元: Sites version 69、source `56ae07b48a819dad41dcbd098c8e7db4fdae7f63`。同版の公開成功を確認した。
- 共有SDK/Pages: `d239aa057b6080bd824a89653ec7dedcc5febc75`。Sitesのshared/unity-analysisは同じバイト。ComposerはSitesの方が新しく、Pagesにはpackage-selection等が未反映。Sitesの現行機能をPagesへ移す。
- 開発手順確認の原チャット全文との完全一致は未確認。取得済み計画、現行Skillと直接指示を適用し、原文取得済み・完全準拠とは記録しない。

## 保全境界

原本、既存Plan、既存GenerationReport、既存packageの生成仕様を維持する。共有診断は別の任意操作であり、失敗・取消・上限超過でComposerの受付範囲や生成判定を書き換えない。診断結果を完全な編集IRに昇格させない。既存の依存再読込比較・Expression適用範囲の比較は残す。

初期範囲は選択済み入力および生成済みAssetの共有診断、明示的に保持した同じ種類の比較基準との前後比較、独立JSON。新DSL、AAC移植、Create/Edit/Reset編集基盤、SIMD、常駐Worker、Unity動作保証は範囲外。

## データと責任

UI → Composer Workerのdiagnostic-export → 共通preflight → File SDK（借用pool）→ 独立report。Composer WorkerとFT kernelは保全する。新poolはページ所有、初回使用時に生成し、SDKは借用者として扱う。UI終了時に所有者がdisposeする。元Asset bufferはtransferしない。全入力確認後の新規コピーだけを転送する。

診断モジュールは `start(context, prepare)` 呼出し時、prepare/SDKより先にoperationIdを確保する。同期例外・非同期失敗・取消を同じ外側reportへ変換する。状態はnot-run / running / succeeded / failed / cancelled。not-runには理由を付ける。非成功のsdkReportはnull。inputRevision / selectionRevision / planRevisionとtargetを全経路で保持し、旧成功・旧失敗・旧進捗を現行表示へ流さない。revision更新時には旧診断を無効にする。

基準保持は利用者が明示的に行い、単一side最大32MiB。入力同士または生成物同士だけを比較する。基準のtargetとrevisionを保存し、差分対象を表示する。新しい基準、明示クリア、画面終了で旧基準を解放する。入力と生成物のGUID置換を通常差分と混同しない。

## 上限・識別子・診断の意味

File SDK固定版の上限は、入力ファイル2048、単一16MiB、片側合計32MiB、対応テキスト4MiB、snapshot4MiB、report8MiB。metaを含む全件のパス・容量・件数を追加コピーより先に確認する。snapshot/report上限はSDKの最終検査を維持する。Composerの既存大容量受付は縮小しない。64MiB等の展開上限や32MiBの保持量をピークメモリ保証としない。

fileIDはsigned 64-bit十進文字列のまま、Plan/対応表/JSONを通す。GUID正規化はSDKの共通規則へ委ねる。ソース位置はUTF-16コード単位（0起点、end排他）、line/columnは1起点。UTF-8バイト位置と表示しない。

inputCoverageに選択範囲、未選択、参照のみ、解析不能・opaque、曖昧さを記録する。JSONの全件性と全素材診断の達成を独立に表す。JSONのdownload開始は利用者端末への保存成功を証明しない。Unity Import、MA、VRChat動作は別の未確認項目。SDK内のmissing等を選択外の確定欠落へ読み替えない。

## 表示・性能

要約と最大50件ずつの診断行を表示する。全文JSONは開く・保存する時だけ整形し、同じreportでは再利用する。サイズはreport確定時に一度だけ計算する。操作全体を呼出し側で測り、SDK totalMs（最終容量検査・freeze除外）と分ける。moduleReuse=falseを初期既定のまま、Worker数・設定・コピー・prepare・SDK・全体時間を記録する。比較実測なく高速化やピークメモリ削減を認定しない。

## AAC対応表（将来拡張用、今回の新機能ではない）

| API例 | API上の操作型 | Unity保存型 | 宣言・登録先 |
| --- | --- | --- | --- |
| FloatParameter | Float wrapper | Float | Controllerへ宣言する経路を確認 |
| TriggerParameterAsBool | Bool wrapper | Trigger | Boolへ保存型を変換しない |
| NoAnimator経由 | 呼出しに応じたwrapper | Controllerへの新規登録なし | 宣言なしと未検出を区別 |
| ResetClip | Clip操作 | AnimationClip | 曲線の初期化と他情報の全面初期化を混同しない |
| SetDirty / SetDirtyAll | 変更通知 | 保存型の変更なし | 保存操作の完了とは別 |

AAC公式: https://docs.hai-vr.dev/ja/docs/products/animator-as-code/functions/base / https://docs.hai-vr.dev/docs/products/animator-as-code/functions/modification

## 実装順と公開・検証

1. 基準hash、差分、期待回帰ケースを固定。
2. Workerの診断用export、envelope、選択範囲、UI、独立JSONを追加。
3. 静的な構文・依存・保全差分レビュー。公開パッケージは既存Worker/D1/他ツールを維持。PagesとSitesの配信パス差のみ明示変換。
4. 許可されたクラウドブラウザと入出力回収経路を確認してから公開する。GitHub Pages更新後に最新版commitをクラウドへ複製して動的試験。未公開候補・旧版の動的実行をしない。
5. 操作・回収バイト・版・設定・原本不変・生成保全・取消復帰を記録。必須証拠が未実施なら未完了。範囲外のUnity動作等とは別扱い。

ロールバックは今回の差分だけを逆適用し、並行更新を保持する。旧版を実行してbaselineを作らない。既存の保存出力が得られなければ旧新Asset/metaのバイト比較は未実施と明記し、同一版の診断ON/OFF比較や生成コード静的不変を旧版比較の代用合格にしない。
