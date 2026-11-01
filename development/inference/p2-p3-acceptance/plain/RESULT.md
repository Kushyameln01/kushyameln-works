# Text plain固有の独立全値比較

固定plain入力`Hello world`について、独立source参照と実WASM出力`[1,512,4096]`の全2,097,152値を比較し、事前gateのまま合格しました。既存ID fixtureの数値合格を転用した結果ではありません。

実行helperの完全SHAは`5537b8932343aa2476b95191817e8913f99dab02`。このsourceを先行固定してからNNを開始しました。runtime・helperの実配信bytesは同SHAのGit bytesと照合し、[browser receipt](evidence/browser-results.json)の`servedSources`へ保存しています。

| 項目 | 結果 |
| --- | --- |
| 入力 | plain `Hello world`、UTF8 SHA `64ec88ca00b268e5ba1a35678a1b5316d212f4f366b2477232534a8aeca37f3c` |
| Tokenizer | 元SentencePiece `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`。Python/browserの全512 IDsとmaskが一致 |
| 出力 | float32、BLC、`text_hidden_states`、`[1,512,4096]`。native model/Tokenizer/maskを保存 |
| 独立参照 | 元weightsをstrict loadしたpinned PyTorch source全24層。全層で512位置を保持し、source最終normとWanのmasked0を適用 |
| 数値 | 全値finite、maxAbs `3.4570693969726562e-6`、全値allclose合格 |
| 事前gate | 元manifestのmaxAbsError `0.001`、rtol `0.001`、scopeを保持。最大絶対誤差とatol/rtol `0.001`の両方で判定 |
| padding | 509行、2,084,864値が参照・実出力とも厳密に0。activeは3行、12,288値 |
| Hike | 実`encoder.final_layer_norm`が最終出力へ寄与。JS/PyTorchへ代替しない |
| 正常完了の寿命 | 実ORT session create/release各24、最大同時1、run24、Tensor.dispose72 |
| 取消 | 追加plain jobをblock1完了後に取消。観測checkpointはsession1/release1・Tensor.dispose3。その後owned Workerを終了し、module/clientをdispose |
| 終了 | Worker create/terminate各2。browser/helper所有子孫の観測15件、自己所有reap3件、終了後live0・zombie0・error0 |

## 参照の独立性とsource

ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` の変更しないT5Block / T5LayerNormを、普通のCPU FP32依存adapterで実行しました。元FP8値へ保存済みscalar scaleをFP32乗算し、元F16値はFP32へ展開しています。各blockをstrict loadし、元412 keysを照合しました。参照計算にONNX・ORT・Hikeや過去の出力を使っていません。元6.7GBモデルの不変identityは再利用し、全原本hashの再計算・graph再exportは行っていません。

WASM側は実plain APIから変更しないnative workerを呼び、既存24 graphと実Hikeを使いました。private observerは実ORT create/run/releaseとTensor.disposeを記録するだけで、演算や数値出力を置換していません。WASM内部は既存のtrailing mask compactionでeffective3を計算し、出力512位置を復元します。参照側を同じprefixへ短縮しなかったため、この固定plain入力についてその境界も比較に含まれます。

T5 source hashは`797f11b69256dffa8d9a6d236fe1e05d0c250c84d231a5993accde0ff44238bc`、Wan wrapper hashは`e9a6ca356790c76f7a36550842fc8a93c8c584cd175d69615eaddb7b4cd276bc`です。[source-bindings.json](source-bindings.json)にTokenizer wrapperを含む固定出典を保持しています。[選択manifest](../../reference-adoption/p0/evidence/manifests/text.json)のSHAは`aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f`のままです。

## 時間と資源

source oracleは74.45秒、sampled peak RSSは1,759,371,264 bytesでした。source mappingをblockごとに閉じ、全層を同時保持していません。source processの終了を確認してからbrowserを開始し、重いNNを同時実行しませんでした。

browserのfull plain処理は83.29秒、追加取消jobは6.06秒、browser helper全体は93.61秒でした。正常完了24 sessionのload合計は26.75秒、run合計は3.31秒です。これらの内訳は同じ時計範囲ではなく、合算して別の総時間を作りません。

browser群のsampled RSS和peakは6,333,726,720 bytes、観測した単一process最大は5,664,215,040 bytesでした。**browserは計画時の4GiB目安を超えています。** RSS和には共有ページの重複計上があり、OS全体の固有RAMや利用端末の負荷改善を示しません。数値診断のPASSと資源目標の受入を分け、資源改善は未受入とします。

PID+create_timeを50ms間隔で観測しました。短命で未観測のforkを含む網羅的監査ではありません。取消では確認済みcheckpoint後の未知のsession解放数を補いません。nativeのsession/build相関は変更しないclientの照合を使い、このreceiptはsession UUIDを別途取得した取引証拠へは昇格させません。

## P3への受渡し

[P3-HANDOFF.json](P3-HANDOFF.json)から、byte exactの[実conditioning](evidence/plain-conditioning.wktensor)と[独立参照](evidence/plain-reference.f32)を参照できます。これはmodelの出力であり、元weights/ONNXではありません。

- conditioning file SHA: `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9`
- conditioning payload SHA: `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`
- 独立参照 SHA: `e59ad16a82799a42fe82eb76b3c7438a70c4766be7d7c7eb9b18222bfb1c83a9`

text hash・gate・referenceは外側lineage証拠として渡し、native producer/model/Tokenizer/maskを改名しません。frame/contextを捏造しません。[EVIDENCE-INDEX.json](EVIDENCE-INDEX.json)に元scopeと各fileのbytes/hashを保存しました。

受入はこの明示plain入力のFP32診断です。任意prompt、512有効tokenの負荷、ComfyUI重み付きprompt、custom embedding、Bernini prefix、元GPU FP8算術、production Diffusion生成や全native session、管理採用・generationReadyは別判定のままです。既存の[中間層初回失敗とgate改訂履歴](../../reference-adoption/p0/evidence/owner/text/REPORT.md)は変更していません。
