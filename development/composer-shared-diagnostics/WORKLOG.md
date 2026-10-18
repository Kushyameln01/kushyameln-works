# 実装ログ

## 2026-10-18 契約固定

- ユーザーの計画実行指示を受け、現行Sites version69/source56ae07…を専用checkoutで取得。公開成功も確認。
- Pages main d239aa05…を独立clone。先に試した他作業repoの複製は欠損blobがあったため不採用。欠損を削除として公開しない。
- shared/unity-analysisはSites/Pages同一。ComposerはSitesの選択読込などが新しく、現行Sitesを保全元にした。
- CONTRACT / VALIDATIONに最新5補足、受入期待値、公開後の動的試験条件を固定。
- 実装担当と監査担当を分離。担当ファイルを限定し、並行作業の差分を混ぜない。
- まだ製品コードの動的試験・公開は行っていない。

## 実装・静的レビュー

- shared-diagnosticsに独立envelope、operation ID、全件preflight、同期/非同期例外、取消、旧通知排除、遅延JSONを実装。File SDKは改変せず借用する。
- Workerにdiagnostic-exportだけ追加。generateの返却へ非シリアライズのAsset一覧を追加し、出力package/Plan/GenerationReportの生成仕様は保全。
- UIに任意診断、明示基準との同種比較、50件ページ、全件保存、UTF-16表記を追加。
- 独立静的レビューで基準manifestへの候補ファイル混入を発見。固定commitのgit blobから再作成した。未実施JSON初回context、初回全体計測、Workerの診断operation ID受付、準備期限/messageerror、曖昧差分表示も修正。
- node --check、DOM ID整合、共有SDK/既存5モデルmoduleのhash保全、Sites静的公開投影を確認。製品の動的試験はまだ未実施。
- ホスト側ブラウザ導入は配布ZIP破損、aptは環境の権限制約で不可。設定変更や制約回避は行わず終了。TinyFishは残高不足で起動不可。課金操作・案内なし。
- 許可済みCodexクラウドChromeでfilechooser.setFiles、download.path、scratchとbrowserの同期経路を確認。製品アクセス・入出力試験はPages更新後に行う。
- 既存Composerの保存済み生成物を作業領域/Library内で調べたが、固定版に対応する比較用出力は現時点で確保できていない。旧生成器を実行するtest-reference-outputは実行しない。C01旧新版byte比較は未完了のまま保持。
