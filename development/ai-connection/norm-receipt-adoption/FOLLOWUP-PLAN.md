# 規範付き入口とVAE新証拠の追補

基点は配布 `0260fc0b153c2491cc94aca3d75c7835a03bf0f7`、既存試験source `c84bc495562a393a437056cef944fb2e0f95ba08`。今回もcatalog `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` / `1.0-draft.1` と計画 `0fb553fd081d3bcbbad4ead7accd165679f77d34` を維持する。

## 原要求と変更境界

1. loaderのbaseDtype/outputDtype/layoutの個別比較と負例は既存実装を再利用する。ただし今回、規範IDを残したままLOAD-COMFY-LINEAR-DIFF bindingと3宣言を同時削除すると規範付き入口を通れる穴を確認した。known policyが必要なprofile bindingも固定して同じevaluateEdgeへ照合する。missingを省略許可へ変更しない。generic/legacyにLoRA条件を強制しない。
2. 宣言→実数値receipt→実公開receiptの段階順、future receipt拒否、commit/decode直前のlive再照合は維持する。新しい独立判定器、数値演算、native ABIは追加しない。
3. Pageで新VAE/codec証拠PR#13の配布 `d8a19f684f75fdf2f772d64754cba9d08b8f5c82`、codec実装 `2bdca59ea78580d4fe7a9d31a8de33209b64d029` を発見した。原本・版・bytes/hash・scopeを取得し、既存VAE855/codec4cの実行pinと分けて候補受領する。必要な追加検証はmarker付きWKTの現管理E4保存読戻しに限定する。
4. 新管理Rectの実decode・実取消復帰・解放・その実RGB保存の受入は、既存encodeを再利用し、既送付packetから進める。新資料のFile/Map configure成功やcodec保存成功をNN成功へ付け替えない。既存3decode assetまたはowner実行receiptが取得できた場合だけ実dispatchを再開する。

## 実施と確認

- policy/profile bindingの省略・side/representation変更を負例から確認し、関連回帰後に変更境界に応じた全回帰を行う。
- owner sourceと公開証拠を固定し、markerなし既存bytesと新marker保存を区別する。以前の失敗・旧採用setを履歴として保持する。
- 新Page/PRコメントを確認し、既存asset質問・既存encode・モデル再export・原本4点再取得を繰り返さない。
- 独立レビューと目的監査を既存担当へ依頼する。完了scopeと未受入を区別し、GitHub同branchとDraft PR#7へ共有する。main merge/Pages deploy/生成受付解除は行わない。
