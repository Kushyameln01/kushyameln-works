# 証拠の入口

対象は2026-10-18のComposer軽量化A/B。製品や旧生成器を再実行せず、保存済みの実体・記録だけで照合できる。

| ファイル | 内容 |
| --- | --- |
| `publication.json` | Pages製品BとSites v76の公開識別子 |
| `B-acquisition.json` | 最新公開Bの133配信ファイルとGit blobの照合 |
| `A/runs.json` / `B/runs.json` | 各20操作の生の工程値と端末内診断計測 |
| `A/manifest.json` / `B/manifest.json` | 回収状態、サイズ、hash。返却パスだけの試行を未回収と明示 |
| `A-artifacts.tar.xz` / `B-artifacts.tar.xz` | 回収済みの全package/全件JSON。archive直下のファイル名をmanifestのA/B配下と対応付ける |
| `comparison.json` | 全packageのmember別照合、report全件性、正規化規則、A/B性能分布。未回収のabsence一致はバイト照合ではない |
| `B/aggregate-static.py` | 保存済みファイルを読む静的集計。製品実行なし。再利用時は先頭の環境固有パスを保存先に合わせる |
| `B-timing-followup.json` | 通常・診断なしの別群5回。最初の測定群とは統合しない |
| `A/ui.json` / `B-ui.json` / `B-initial.json` | 初期依存とUI整形回数、表示後の読取り。toggle直後の値は次の状態確認前の観測を含む |
| `B-tests.json` | 公開コードのモック境界、VM選択回帰、実SDK上限回帰の結果と限界 |
| `B-regression.json` / `regressions.tar.xz` | 追加6回帰のJSONと上限エラー後のpackage。キー操作はUNVERIFIED |
| `fixtures.tar.xz` / `fixture-manifest.json` | 使用した公開用合成入力3組とPlan。実素材・個人データは含まない |
| `composer-improved-rows.jpg` | 公開Bで多件数の診断要約を表示した画面 |

日時・ID・時間等を含む原始JSONはarchive内で保存している。比較用に正規化したhashを、原始JSONのhashと混同しない。入力が全部診断されたかはcoverageで確認し、保存レコードの全件性と別に扱う。全体結果は上位のRESULT/VALIDATION/WORKLOGを参照。
