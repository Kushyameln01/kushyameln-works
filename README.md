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

## 画像・動画の前処理（2026-10-17 本実装候補）

`docs/media-runner/` と `docs/shared/media/` に既存の前処理基盤を追加しています。共有計算のタスク登録とWorker bundleにメディア処理を統合し、既存Unity解析とFT処理の実装を保持します。APIと制限は[共有メディアREADME](docs/shared/media/README.md)を参照してください。

この段階は公開前の準備結果です。クラウド上で新しいページの読込から前処理・結果回収・AI回答までを測定する試験は未完了です。高速化・安定性・回答品質の合格やSkill利用経路の成立を示しません。利用ログの受信先は既存のChatGPT-Sites APIであり、Pagesからの保存確認は公開後に検証します。準備した公開ファイルと検査範囲は[準備記録](development/media-production/preparation-manifest.json)に記載しています。
