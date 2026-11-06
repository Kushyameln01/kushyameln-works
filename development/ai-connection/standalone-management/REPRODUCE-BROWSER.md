# 管理単体 browser 検証の再現

この手順は、配布する `docs/ai-connection/` の画面を Chromium で操作する。制御検証用の参照 owner が選択した tensor をコピーする範囲であり、VAE、Text、Diffusion、LoRA の NN 計算成功や製品生成 READY の証拠にはしない。他担当の ACK や非公開モデルは不要。

## 自動実行

必要なものは Node.js、`/usr/bin/chromium`、`/opt/codex/cua_node/lib/node_modules/playwright`。追加ライブラリのインストールは行わない。

```sh
node tools/ai-connection/run-standalone-browser.mjs \
  --manager-commit <この実装を含む完全40桁SHA> \
  --out /tmp/management-browser-fresh-result
```

出力先は未作成のディレクトリを指定する。実行 source の確認では、runner と、実際に取得した HTML・CSS・ES module の bytes・長さ・SHA-256 を、指定 commit の Git object と比較する。作業中の反復に限り `--development` を使えるが、固定 source の受入結果として扱わない。

生成するローカル WKT File は F32、`[1,16,21,60,104]`、`NCTHW`、`raw-posterior-mean`、payload **8,386,560 B**。81 frame と時刻の対応を含む。各値を `(index % 17 - 8) / 4` とした開発用データであり、コピー後の全 payload hash と、手で規定した sample 値を比較する。元モデルによる独立数値参照ではない。

runner は File input、表示された設定、実行・取消・復旧・保存ボタンのみを操作する。画面外の実行 hook や test 専用 API は呼ばない。静的 source を loopback の GET で配信し、File の内容はサーバーへ送信しない。

## 確認する境界

1. JSON pipeline、tensor、owner が必要とする追加 File を実際に選択し、設定・能力照会・通常実行を行う。独立参照、gate、事前 PASS、数値 receipt を入力に要求しない。
2. LoRA 選択なしの bypass と選択ありの条件付きコピーを区別し、選択変更による snapshot・結果の失効を確認する。実 LoRA 適用の証明ではない。
3. owner の論理 input 容量を変え、具体的な拒否理由と、構成 revision・resource generation の更新を確認する。
4. 手動 barrier による遅延から部分結果を保存する。取消では元 Promise の終端と owner 解放を待つ。遅延した旧結果は採用しない。
5. owner 実行失敗後の retry、解放失敗後の再利用拒否、`recover()` による解放再試行と owner identity の更新を確認する。
6. 部分・最終 ZIP と native WKT を download し、実ファイルを新たに読戻す。tensor の全 hash、shape・dtype・意味・frame/context、未知 optional metadata、snapshot を確認する。
7. ページ reload 後に保存 ZIP を再選択する。tensor の durable payload と、失効した追加 File の選択権限を区別する。必要な追加 File は再選択し、その後の通常実行を確認する。
8. 公開されている終了ボタンから管理・owner の dispose 終端を確認する。

未知の optional native header を含む File も別 case で投入する。採用 codec の裸 WKT writer がその情報を保存できない場合は、encode→decode の実読戻しで差を検出し、`NATIVE_SAVE_METADATA_LOSS` と bundle 保存への案内を返す。codec の規格や pin は変更しない。bundle では、hash で結ばれた metadata sidecar と native payload から情報全体を復旧する。裸 WKT のみで未知 field を保存できたとは報告しない。

`result.json` に各 case の結果、取得 source の bytes/hash、ブラウザの実 Worker event 数、実測経過時間、未測定資源を記録する。reference owner の所有 record・payload byte 数は実際に保持するコピーの数であり、総 RAM、ORT memory、NN の資源予算ではない。timeout は失敗の上限であり、取消や解放に成功した証拠としては使わない。

## 手動操作

`docs` を静的 root として配信し、`/ai-connection/` を開く。制御検証モードと表示された説明を確認してから File を選択する。遅延モードでは「現在の遅延を継続」ボタンが各 invocation の barrier を一回ずつ解放する。解放失敗モードでは復旧完了まで owner を再利用しない。保存した tensor は payload として再利用できるが、追加 File の権限や native session は復元しない。

この browser 検証に合格しても `generationReady:false` と `load/predict/sample=NOT_READY` は維持する。実 NN、owner 間接続、全工程資源、本番生成の受入は別工程である。
