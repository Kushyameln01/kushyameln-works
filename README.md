# Kushyameln Works — GitHub Pages

第三者の初回表示遅延を抑えるための静的配布版。元サイトの dist を複製し、HTMLのルート相対リンクのみ相対化。Hike/WASM、Worker、既存Google Analytics設定を維持。

## 公開
専用リポジトリ kushyameln-works にこのフォルダの内容を配置。Settings → Pages → Deploy from a branch → main /docs → Save。

## 検証と切替
公開後、トップ、5カテゴリ、3ツールのリンク・Worker・WASMの読み込みを確認。元SitesとPagesを同一端末・回線で各5回以上、キャッシュ無効で交互に測定。TTFB、FCP、LCPを分け、中央値と最悪値を比較する。通常再訪も別に記録。第三者の未ログイン環境で確認する。現段階では速度改善は未検証。

元Sitesは変更していない。公開確認後、Pagesを案内先にし、元Sitesからの導線と更新手順を整える。既存の非掲載アーカイブを含む配布物は現行と同じ範囲で保持している。

## 更新
Sitesの新しい配布物を取り込み、HTMLのサイト内リンクを相対化してdocsを更新する。秘密情報・原本アバター・開発用資料は配布物に含めない。
