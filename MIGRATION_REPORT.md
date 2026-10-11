# GitHub Pages移行・検証記録

## 目的
第三者が利用する際の初回表示遅延を抑える。GitHub Pagesを第三者向けの公開先として利用する。

## 実装
元Sites source commit: 76687b2153feab542a091ef2e4cb6c0720b6219e。
Pages初回公開commit: 5b867ac8f5f5510021067e7f82399e133b0a8f7c。
公開: https://kushyameln01.github.io/kushyameln-works/
公開元: main /docs。GitHub Pages build and deployment #1 は成功。

元のdist全体をコピーし、HTMLのhref/srcのルート相対URLのみ相対URLへ変換。.nojekyllを追加。既存ツールの処理、Hike/WASM、Google Analyticsは変更していない。既存の非掲載Xアーカイブも元の配布範囲どおり含む。ソースリポジトリ内の原本資料・認証情報はコピーしていない。

## 検証
- HTML内ローカル参照93件、JS module等のリテラル参照44件: 参照切れなし。
- トップ、5カテゴリ、3ツール、CSS、WASM: HTTP 200、配布元とのバイト一致。WASM MIMEはapplication/wasm。
- クラウドブラウザでトップ表示を確認。TinyFishでツール3画面とカテゴリ表示を確認。ただし実ファイルを用いた生成、Worker処理完了は未検証。
- TinyFishはPerformance APIやDevToolsの値を取得できず、描画速度やネットワークエラー不存在の証拠としては採用しない。画面にエラーが見えないことと内部処理の成功は区別する。

## 応答開始時間
各回独立curlプロセス、Cookie無し、クライアントHTTPキャッシュ無し。ホスト順を交互にし各5回。HTTPは全件200、リダイレクト無し。CDNのキャッシュ状態は制御していない。クラウド実行環境の経路を含む数値。

| 配信先 | TTFB中央値 | 最小 | 最大 |
|---|---:|---:|---:|
| 元Sites | 5.559秒 | 4.455秒 | 6.050秒 |
| GitHub Pages | 5.716秒 | 3.618秒 | 6.819秒 |

今回の標本ではPagesによる改善は確認できない。HTMLの内容を受け取るまでの時間であり、FCP/LCPや日本の利用者の体感とは同一ではない。サーバーやCDNだけの処理時間にも分離できていない。

## 判定と継続
静的複製、Pages公開、配布照合: PASS。
第三者向け配信先としての利用: 公開済み。
表示遅延低減: NOT VERIFIED。
全ツールの実データ生成: NOT VERIFIED。
元Sitesは比較・復旧用に維持。旧URLへのリダイレクト、外部プロフィールのリンク変更は未実施。新URLを直接案内すればSites経由の待ち時間を通らないが、速度改善の保証ではない。

次の確認は日本の同一端末・回線で、ブラウザのキャッシュを無効化し両URLを各5回以上交互に測定する。TTFB・FCP・LCPを区別し、再訪は別系列とする。採用判断はその結果と実利用の体感で行う。
