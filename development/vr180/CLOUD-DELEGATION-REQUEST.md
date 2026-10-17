# VR180クラウド動的検証の引継ぎ

状態: 依頼文を準備済み。Codex Cloud/dotへの送信は未実行。
識別子: vr180-pages-cloud-20261017-r1

## 依頼内容

Kushyameln01/kushyameln-works のVR180ブラウザツールを、GitHub Pages用ソースのクラウド複製へ反映して動的検証してください。目的は「VR180撮影素材・左右2眼動画を、ブラウザ上で簡単に加工できること」です。Codexで環境・ソース・試験を整え、dotではその実行状況と結果を確認できる範囲で担当してください。同じ試験の二重投入はしないでください。

- GitHub作業ブランチ: `codex/vr180-browser-b1`
- 試験対象VR180コードの固定commit: `e6c0245eb72ad676c2297e2d5b7ba5fc592e9e60`（build `vr180-b1-diag1`）。文書追加後もこのコードを試験対象にする。
- Pages用ソースの固定main commit: `fd12bd0a787bc46fabb840cdbc146715b2452f90`。
- mainの `docs/` に、候補commitの `docs/vr180-studio/` と `docs/shared/vr180/` を重ねた独立複製。共有Mediabunny 1.61.5の4配布物は両commitで一致済み。
- `development/vr180/IMPLEMENTATION.md`、`RESULT.md`、`WORKLOG.md`、`CLOUD-REPLICA-2026-10-17.md` と保存試験記録を先に確認する。

## 先に確認する環境条件

今回のChatGPT Work環境では管理プレビューが `bwrap: Can't mount proc on /newroot/proc: Operation not permitted` で起動できませんでした。sandboxや認証を無効化せず、その環境で許可されたHTTP(S)配信と実ブラウザ・ファイル回収経路を用意してください。環境を用意できたことと動画加工が通ったことを分けてください。

先のTinyFish環境では入力avc512×512のdecodableと出力avc512×256/2Mbpsのencodableがともにfalseでした。全ブラウザでH.264が使えないという結論ではありません。新環境の対応判定を個別に記録してください。

## 試験と回収

1. 複製のファイル一覧・commit・SHA-256を照合。ページ表示、素材取得、Module Workerの読込みを確認。
2. `stereo180-sbs.mp4` をUIから再圧縮なしで処理。出力MP4と処理記録JSONを実際に保存・回収し、`tools/vr180/verify-metadata.py` 相当の独立box/packet照合を行う。
3. `stereo360-tb.mp4` を256px/眼・2Mbpsで変換。成功したらMP4・JSONを回収し、`tools/vr180/verify-conversion.py` で画素・時刻・音声を検証。Spherical metadataの独立解析も行う。失敗したら失敗JSONを回収。
4. 小素材が通った場合に、取消・失敗後の復帰と4K 2秒/12秒の保存までを確認。試行ID、inputRevision、入力/出力hash、区間時間、ブラウザ版、未測定項目を記録。
5. 合成素材の加工・保存・独立読戻し、対象VRプレイヤーでの再生、実写素材の品質、初見での簡単さを別判定で報告する。

## 制約

公開main/Pagesの更新、Sitesの公開範囲変更、課金、実ユーザー動画の外部送信は今回行わない。既存の共有ツールを変更しない。codec変更・新しいソフトウェアcodec導入・対応入力の拡張を診断修正に混ぜない。Nodeモック試験やエージェントの要約だけをブラウザでの保存・回収成功の証拠にしない。dotへ連絡できない場合は未実行と明記し、別のサブエージェントをdotと呼ばない。

返してほしい成果: 実行環境/入口、試験対象commit、試行ごとのraw JSON、実際に回収したMP4、独立検証結果、成功/失敗/未検証の一覧、再開可能な作業ログ。
