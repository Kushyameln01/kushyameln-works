# 実行中断と再開条件

Text・VAEの単体完成は未達。確定済みの実装・試験・証拠はGitHubへ保存したが、2026-11-02 17:38 UTC頃に実行環境との接続を失い、残るVAE受入が中断した。[機械可読の観測記録](evidence/environment-interruption-20261102.json) と [全体結果](RESULT.md) を参照する。

## 確定した成果

- TextはT1の9valid/9reject、T3の実Browser9controls・取消復帰・保存読戻し・終了確認が完了。T2は9case中8PASS、全512有効ID一件がmaxAbs0.0016480088233947754 > 事前gate0.001で未受入。最適化設定だけを変えたblock19限定診断は既存出力を再現したが改善が小さく、探索を終了した。[Text個別結果](TEXT-RESULT.md)。
- VAEはtarget81×480×832のencode・独立raw decodeを実WASMで全値受入。source F1/F4/F5、参照16×16/16×848/848×16、独立raw T2 decodeの取消・同一API復帰・保存・終了も受入済み。[VAE個別結果](VAE-RESULT.md)。
- 実L512 conditioning、mask、model/Tokenizer、最終正規化、来歴と任意診断参照は [manifest](text/full512-conditioning/manifest.json) から取得できる。独立参照・詳細receiptを通常APIへ必須化していない。

## 接続喪失時の未確定範囲

F80 encodeの最終正常観測は17:37:55 UTC、20chunk中15chunkが完了し、index15（16番目）を処理中だった。最後の確認で最終acceptance-results.jsonは未作成。接続後の処理継続・終了・保存・session/Worker・生存process・zombieは取得できず、数値FAILともPASSとも判定しない。

要求はRGB [1,3,80,480,832] → raw mean [1,16,20,60,104]。native規則の消費77frame・未使用末尾3frameと元80frame対応、全1,996,800値、保存読戻しと終了を確認してから受入する。最後の観測時点では848×848の独立参照と実WASM bothも未着手で、接続喪失後の状態は未確認。

コマンド実行側は unavailable と exec-server transport disconnected / recovery timed out after25s を返した。制御側のrunning/connectedという応答と区別する。原因は未確定であり、OOM・コード不具合・process終了の根拠にはしない。保持diagnostic metadataはnot_foundで、network log本文は読んでいない。

## 再開手順

1. 同じ実行環境へ再接続し、既存processと保存物を先に調べる。接続喪失だけを理由に生存jobを停止・再実行しない。
2. /tmp/kw-vae-remaining-queue-20261102.json と /tmp/kw-vae-wasm-source-f80-20261102/{acceptance-results.json,resource-measurements.json} を確認する。絶対pathの存在だけで受入済みとは扱わず、固定source、manifest/files、全値比較、codecと資源終了を照合する。
3. F80の最終reportが取得できたら、そのscopeで結果を確定する。回収可能な結果がない場合だけ、実行source `dccb88515775ec8aa86dd16f82e8816c9347ed38`・同じ参照とbundleで未受入F80を新しい出力先へ再実行する。
4. 848×848も既存reportの有無を調べ、未実施部分だけ独立参照→実WASM bothを行う。元model、precision、graph hashと事前gateを維持する。
5. 接続回復後はremoteの同branchを取得し、ローカル変更を確認して文書差分を反映する。今回の接続後追記はGitHub connectorで保存しており、通常runtimeの数値コードを変更していない。

[再現手順](REPRODUCE.md) と既存64件の証拠を再利用し、target81・F1/F4/F5・Text参照の再推論や、変更のないgraphの再exportを繰り返さない。Diffusion本体や受領ACKは単体再開の待機条件にしない。実generated sample・モジュール間接続・製品生成READY、mergeとPages公開は別の未受入範囲である。
