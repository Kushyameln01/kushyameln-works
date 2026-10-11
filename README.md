# Kushyameln Works

公開サイト: https://kushyameln01.github.io/kushyameln-works/

第三者向けの配信先としてGitHub Pagesに静的版を公開しました。元のSites配布物の内容とHike/WASM・Worker・Google Analyticsを維持し、サイト内リンクを相対化しています。

## 更新

`python3 scripts/sync-static.py /path/to/reviewed/dist`

差分を確認して main に push すると、GitHub Pages が docs フォルダを公開します。同期は手動実行です。元Sitesの変更が自動的に反映される設定ではありません。入力するdistは公開用ファイルのみを含むことを事前確認してください。

## 確認結果

- 初回公開: 2026-10-12 JST。main /docs、HTTPS。
- 静的ファイル58件、HTML内ローカル参照93件、ES module等の参照44件に参照切れなし。
- トップ、5カテゴリ、3ツール、CSS、WASMの計11 URLはHTTP 200かつローカル配布物とバイト一致。
- トップおよびツール画面はブラウザ表示確認済み。実データを用いた生成処理は再検証していません。
- **表示遅延の改善はまだ実証できていません。** 各5回のクラウド環境curl計測ではTTFB中央値が元Sites 5.559秒、Pages 5.716秒。日本の実ユーザー環境の描画時間を示すものではありません。FCP/LCPは未計測です。

詳細: [移行・検証記録](MIGRATION_REPORT.md)、[HTTP測定値](http-measurements.json)、[配布照合](deployment-checks.json)。
