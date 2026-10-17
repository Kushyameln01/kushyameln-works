# Pages用ソースのクラウド複製・動的検証

目的: ユーザーの「GitHub PagesをCodexおよびdotに頼んでクラウド版に反映させ、そこで動的検証」指示に基づき、VR180候補の変換・保存・回収をクラウド内で検証する。

## 実行前の条件

- Codexのこの作業環境で実行する。dotへの直接依頼機能は公開されたツール・CLI・プラグイン検索で確認できず、未実行。一般のサブエージェントをdotと称さない。
- GitHub mainから取得したPages用docsはcommit `fd12bd0a787bc46fabb840cdbc146715b2452f90`。VR180候補はcommit `e6c0245eb72ad676c2297e2d5b7ba5fc592e9e60` の `docs/vr180-studio` と `docs/shared/vr180` を重ねる。候補入り複製を現行公開Pagesそのものとは称さない。
- 固定Mediabunny 1.61.5の4配布ファイルは両commitでbytes一致。98ファイルの出所・サイズ・SHA-256を `evidence/cloud-replica-source.json` に記録。
- 旧複製の2配置は消失。新しい専用配置は `/workspace/scratch/9c8ffa8409fe/vr180-pages-cloud-20261017/dist/`。再生成可能な一時コピーで、元コードと証拠はGitHubブランチに保存する。
- 標準のクラウドブラウザCUAと同期ダウンロード経路を確認した。既設のPlaywrightパッケージだけではブラウザ本体がなく、Nodeの補助試験をブラウザ検証に流用しない。
- 管理プレビューの起動は既設の `sites-preview` supervisorを使う。独立サーバーやブラウザの追加インストールは行わない。現状statusはstopped。他の作業のプレビューを停止しない。
- ローカルQAのみ。Sites登録・外部公開・Pages main更新・TinyFish追加課金は行わない。

## 受入条件と順序

1. 複製の配信経路を起動し、クラウドブラウザが表示・素材取得・Worker読込みできることを確かめる。取得した版と入力hashを照合する。
2. 再圧縮なしの小素材でUI処理・MP4と処理記録のダウンロードを行う。元素材と独立box/packet照合。
3. 小さい360 TB素材で復号・符号化対応を確認して変換、出力を回収。独立ffprobeと画素/時刻/音声検証、VR metadata解析を行う。失敗時は失敗記録を回収し原因を限定する。
4. 小素材が通った場合にのみ取消・再実行と4Kの2秒/12秒を確認する。異なる測定境界や未取得メモリを混同しない。
5. 実環境の限界を監査して記録。VRプレイヤー互換性や実写素材・初見操作性は本試験の合格だけで合格にしない。

## 状態

ソース複製と照合を完了。`sites-preview start` は次のエラーで終了し、直後のstatusはstoppedだった。

```text
Sites preview exited before becoming healthy:
bwrap: Can't mount proc on /newroot/proc: Operation not permitted
```

ブラウザへの配信前に停止。新しい素材処理やMP4回収は未実行。sandboxを無効化したり、別サーバーを起動して管理基盤を迂回したりしていない。根拠のない再起動はしない。

Codex/dotへの別環境での依頼を続けるため、許可されたクラウドブラウザでChatGPTを開いたが未ログイン画面だった。このブラウザのセッションは先のTinyFishログインとは別。認証情報は読まず、browserAuthの正規ログイン手順へ進む。Codex Cloudへの別タスク発行、dotへの送信はいずれもまだ行っていない。

引継ぎ内容は `CLOUD-DELEGATION-REQUEST.md`。サインイン後に実在する対象環境・dotを確認し、受付と実行結果を照合するまで委任済みと報告しない。
