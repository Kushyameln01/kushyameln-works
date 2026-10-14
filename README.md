# Kushyameln Works

公開サイト: https://kushyameln01.github.io/kushyameln-works/

第三者向けの配信先としてGitHub Pagesに静的版を公開しました。元のSites配布物の内容とHike/WASM・Worker・Google Analyticsを維持し、サイト内リンクを相対化しています。

## 更新と安全な配布範囲

現在の変更では旧FTツール2ページとXアーカイブを配布対象から外し、既存Composerの共有依存をバイトを変えずに `docs/shared/ft/` へ移動しています。新しいSites機能の同期は含みません。

`python3 scripts/sync-static.py docs --output /absolute/path/to/new-stage`

[公開対象一覧](security/public-files.json)の完全一致と参照を検査し、新規ディレクトリへ出力します。失敗時に公開用出力は残りません。既存docsの上書き・push・公開は実行しません。公開担当者が検証済み成果物と差分を確認し、別途反映してください。Sitesの新機能を同期するときは公開対象一覧の再審査が必要です。

[境界と検査](security/README.md)を参照してください。以下は初回公開時の記録であり、今回の公開後検証結果ではありません。

## 確認結果

- 初回公開: 2026-10-12 JST。main /docs、HTTPS。
- 静的ファイル58件、HTML内ローカル参照93件、ES module等の参照44件に参照切れなし。
- トップ、5カテゴリ、3ツール、CSS、WASMの計11 URLはHTTP 200かつローカル配布物とバイト一致。
- トップおよびツール画面はブラウザ表示確認済み。実データを用いた生成処理は再検証していません。
- **表示遅延の改善はまだ実証できていません。** 各5回のクラウド環境curl計測ではTTFB中央値が元Sites 5.559秒、Pages 5.716秒。日本の実ユーザー環境の描画時間を示すものではありません。FCP/LCPは未計測です。

詳細: [移行・検証記録](MIGRATION_REPORT.md)、[HTTP測定値](http-measurements.json)、[配布照合](deployment-checks.json)。
