# ChatGPT Sites：MP4互換性 r6 の追加

- 原依頼: 検証済みの追加パッチを、現在の UI デザインと機能を維持したまま追加する。
- 統合元: Sites v79 / `5239f52ff852ce0b4d39b27764ae8cac1de903e3`。入力は `VR180_MP4_Compatibility_r6_2026-10-18.zip`。添付 README と CHANGE-MANIFEST の適用元条件を確認した。
- v75 基準の累積パッチ32ファイルを対象ごとに照合。既存ファイルは v75 基準、既存 r5 payload、または r6 結果と一致し、画面制御 app.mjs だけ v79 の追加 UI 差分があった。
- app.mjs は r5 を共通基準に現行 v79 と r6 を競合なく三者統合した。残る31ファイルは添付 r6 payload と完全一致。既存 runtime 依存15ファイルも添付の指定 hash と一致。
- 目次、左ガイド、3欄の常時表示、作成前の操作無効化、保存欄への移動、保存完了の区別を維持。CSS は v79 と同一。HTML は診断 build と対応範囲の説明のみ変更した。
- r6 の既知記述メタデータ保持、stz2、末尾 size=0 mdat、限定 cslg、AAC 依存情報保持と診断を追加。diagnostics は r5 から更新し、新規3公開モジュールと public-files / asset hash 契約を反映した。MP4全形式への一般対応を意味しない。
- ユーザーが検証済みとした添付の記録を引き継ぎ、追加の機能・動画・ブラウザ試験は実施していない。統合に必要なファイル同一性、差分、JavaScript 構文、配信用ビルドのみを確認する。
- 対象は ChatGPT Sites。GitHub main / GitHub Pages は変更しない。配備結果・保存版・commit は native Sites 記録と会話の完了報告を参照。
- 詳細の適用結果と ZIP / ファイル hash は `SITES-R6-INTEGRATION-2026-10-18.json`。添付の適用手順が推奨する追加ブラウザ試験を、最新の利用者指示へ置き換えていない。
