# 作業記録

## 2026-10-18 開始

- 計画v1.0の実行指示を受領。関連スキルとクラウド複製手順、Sites手順を適用。
- Pages mainは2feb6d4。Sitesはv73/source82b7422まで進んでおり、VR180差分を保持する。
- 空ディレクトリでのSites helper初回は `Unable to prepare the Site`。同一Siteの既存clean checkoutを公式helperで開き、最新版へのfast-forward成功。初回失敗の原因は特定していない。製品障害とは扱わない。
- TinyFishは残高不足。課金・設定変更を行わず、許可済みCodex cloud cdpを選択。前回と同じ入出力経路を再確認する。
- Aの計測追加は既存挙動を変えず端末内のみ。B公開前にAの結果を全量回収する。

## C01 保存物探索

- workspace/Sites記録とLibraryの2系統を探索。旧生成器は実行していない。
- Sites `docs/ft-hike/avatar-regression-evidence-20261012.json` の runs[5].cases[0/1] に生成成功とPlanが残る。出力69,208 bytes/SHA-256 `1e8a3d26700d7ac3954d80b6d609c4c0039b7d97a83d1a11f15280b63da53b7f`、17,289 bytes/`d0bf8e6e5763d0862ba18ccb13ba367057691e8544aa4700bf7c643d1fcfdc87`。
- 対応入力subset hashは `cbe30caebabf50243705a4610ef1a5809828aa76b0c01d587238c543ade53989`。入力実体、生成package実体、操作revisionとSites v69の対応は未確保。
- Libraryの対象生成名検索は該当なし。10月11日のUseReviewは生成未完了の評価記録なので出力基準に使わない。
- 判定はHOLDを維持。今回のA/B出力保全と旧C01を別に記録する。
