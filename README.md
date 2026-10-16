# Kushyameln Works

公開サイト: https://kushyameln01.github.io/kushyameln-works/

第三者向けの配信先としてGitHub Pagesに静的版を公開しました。元のSites配布物の内容とHike/WASM・Worker・Google Analyticsを維持し、サイト内リンクを相対化しています。

## 更新と安全な配布範囲

2026-10-14の変更では旧FTツール2ページとXアーカイブを配布対象から外し、既存Composerの共有依存をバイトを変えずに `docs/shared/ft/` へ移動しています。新しいSites機能の同期は含みません。

`python3 scripts/sync-static.py docs --output /absolute/path/to/new-stage`

[公開対象一覧](security/public-files.json)の完全一致と参照を検査し、新規ディレクトリへ出力します。失敗時に公開用出力は残りません。既存docsの上書き・push・公開は実行しません。公開担当者が検証済み成果物と差分を確認し、別途反映してください。Sitesの新機能を同期するときは公開対象一覧の再審査が必要です。

[境界と検査](security/README.md)を参照してください。以下は初回公開時の記録であり、共有計算追加後の検証結果ではありません。

## 確認結果

- 初回公開: 2026-10-12 JST。main /docs、HTTPS。
- 静的ファイル58件、HTML内ローカル参照93件、ES module等の参照44件に参照切れなし。
- トップ、5カテゴリ、3ツール、CSS、WASMの計11 URLはHTTP 200かつローカル配布物とバイト一致。
- トップおよびツール画面はブラウザ表示確認済み。実データを用いた生成処理は再検証していません。
- **表示遅延の改善はまだ実証できていません。** 各5回のクラウド環境curl計測ではTTFB中央値が元Sites 5.559秒、Pages 5.716秒。日本の実ユーザー環境の描画時間を示すものではありません。FCP/LCPは未計測です。

詳細: [移行・検証記録](MIGRATION_REPORT.md)、[HTTP測定値](http-measurements.json)、[配布照合](deployment-checks.json)。


## 共有計算基盤（2026-10-16）

ChatGPT-Sitesを仮実装、GitHub Pagesを本実装として扱います。公開API・利用方法は[共有計算README](docs/shared/compute/README.md)、実行画面は[worker-runner](https://kushyameln01.github.io/kushyameln-works/worker-runner/)です。既存Hike/WASMは変更せず、独立したDedicated Workerへジョブを分配します。公開対象は明示リストで検査します。[実装・検証記録](development/shared-compute/VALIDATION.md)に対象版と検証範囲を記載しています。

## 画像・動画の前処理（2026-10-17 本実装・試験結果）

`docs/media-runner/` と `docs/shared/media/` に既存の前処理基盤を追加しています。共有計算のタスク登録とWorker bundleにメディア処理を統合し、既存Unity解析とFT処理の実装を保持します。APIと制限は[当時の共有メディアREADME](development/media-preprocessing/docs/shared/media/README.md)を参照してください。

GitHub Pagesへの反映とクラウドでの8試行を完了しました。今回の合成画像・短動画では全回答が正しく、前処理4操作のログも各2件の保存応答を確認しました。ただし、前処理込みのAI回答までの総時間は比較基準より長く、高速化条件は不合格でした。指定された終了条件に従い、この利用経路のSkillは作成していません。一般の入力や安定性を保証する結果ではありません。[試験結果](development/media-production/RESULT-2026-10-17.md)と[測定値](development/media-production/cloud-results.json)を参照してください。当該試験時点では公開実装を保持し、ChatGPT-Sitesの製品コードを変更しませんでした。

## 画像・動画の基本処理（2026-10-17 運用基準の収集）

現在の公開入口は[画像・動画のブラウザ処理](https://kushyameln01.github.io/kushyameln-works/media-runner/)です。共有APIは[media-basic](docs/shared/media-basic/README.md)。全フレームをPNGへ読み出し、時刻・入力版・ハッシュ・区間時間を保存します。前処理機能は[Pages配信対象外の復旧用ソース](development/media-preprocessing/README.md)へ退避し、公開Workerの登録から除外しました。GitHubソース・履歴の非公開化ではありません。前回の速度不合格記録は保持します。今回の変更は運用基準を収集する準備であり、長期性能や高速化の成功を示しません。
