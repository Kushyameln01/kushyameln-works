# 実行中断と再開条件

TextはT2一件が未受入。VAEは今回の必須選択ケースの機能・数値受入を完了。旧監視controllerのzombie1件は別残件として記録する。2026-11-02 17:38 UTC頃に監視接続を失ったが、17:50 UTCにコマンド・filesystemへのアクセスが回復した。同じF80 processが接続喪失中も継続していたことを確認し、再実行せず検証を再開し、同じF80 jobを受入済み。848×848だけを新しいfile-backed監視で実行し、独立参照と実WASM bothも受入済み。VAE必須選択ケースは完了、TextのT2一件と旧監視controller zombieは残件として分離する。[機械可読の観測記録](evidence/environment-interruption-20261102.json) と [全体結果](RESULT.md) を参照する。

## 再接続の観測

[回復観測](evidence/environment-recovery-20261102.json) は、元のF80 PID43453・creation time1793634584.62・元command一致と、接続喪失より前の起動時刻を確認した。17:50 UTCには17chunk完了・index17処理中まで進んでいた。これは同一jobの継続であり、新しい推論・exportを開始していない。元のunified exec監視sessionは再接続できないため、以後は保存されたqueue/progress/reportとPID identityを使う。F80の最終数値比較・保存読戻し・VAE側終了は受入済み。旧監視controllerの終了状態は下記の別scopeで記録する。

## 確定した成果

- TextはT1の9valid/9reject、T3の実Browser9controls・取消復帰・保存読戻し・終了確認が完了。T2は9case中8PASS、全512有効ID一件がmaxAbs0.0016480088233947754 > 事前gate0.001で未受入。最適化設定だけを変えたblock19限定診断は既存出力を再現したが改善が小さく、探索を終了した。[Text個別結果](TEXT-RESULT.md)。
- VAEはtarget81×480×832のencode・独立raw decodeを実WASMで全値受入。source F1/F4/F5、参照16×16/16×848/848×16、独立raw T2 decodeの取消・同一API復帰・保存・終了も受入済み。[VAE個別結果](VAE-RESULT.md)。
- 実L512 conditioning、mask、model/Tokenizer、最終正規化、来歴と任意診断参照は [manifest](text/full512-conditioning/manifest.json) から取得できる。独立参照・詳細receiptを通常APIへ必須化していない。

## 接続喪失時の未確定範囲

以下は接続を失った時点の観測記録である。回復後の最終受入とは時点を分ける。

F80 encodeの最終正常観測は17:37:55 UTC、20chunk中15chunkが完了し、index15（16番目）を処理中だった。最後の確認で最終acceptance-results.jsonは未作成。接続後の処理継続・終了・保存・session/Worker・生存process・zombieは取得できず、数値FAILともPASSとも判定しない。

要求はRGB [1,3,80,480,832] → raw mean [1,16,20,60,104]。native規則の消費77frame・未使用末尾3frameと元80frame対応、全1,996,800値、保存読戻しと終了を確認してから受入する。最後の観測時点では848×848の独立参照と実WASM bothも未着手で、接続喪失後の状態は未確認。

コマンド実行側は unavailable と exec-server transport disconnected / recovery timed out after25s を返した。制御側のrunning/connectedという応答と区別する。原因は未確定であり、OOM・コード不具合・process終了の根拠にはしない。保持diagnostic metadataはnot_foundで、network log本文は読んでいない。

## 回収後の確定結果と後続監視

F80は元のharness PID43453で完了し、全1,996,800値のmaxAbs2.86102294921875e-6、context77/sourceContext80、80/20/77/tail3、codecに合格した。VAE側818sessionのrelease、既知親1/pthread3の終了、harnessが追跡したowned live/zombie/errorsが空であることを確認した。詳細は [F80 receipt](evidence/vae-source-f80-acceptance.json)。

旧監視controller PID40303はPPID1のzombieとして観測され、persisted queueのRUNNINGは更新されていなかった。[controller観測](evidence/orchestration-controller-after-recovery.json) をVAE本体の解放と区別する。原因は未確定で、signal/ptraceは加えていない。後続848²の両directoryは未作成だったため、その未実施2操作だけを新しいcontrollerで起動した。stdout/stderrはfileへ保存し、元のF80や受入済みprofileを再実行していない。

## 最終回収

848×848は独立native参照240.009504秒、実WASM encode179,776値・maxAbs1.9073486328125e-6、独立raw decode2,157,312値・maxAbs3.337860107421875e-6で合格した。正常時間は各264.526090 / 346.672745秒、全体652.244032秒。39/49sessionを全releaseし、既知親2/pthread6の終了とharnessのowned live/zombie/errorsが空であることを確認した。[848 receipt](evidence/vae-reference-f1-848x848-acceptance.json)。

新controller54145、native harness54146、WASM harness54176は終了・不在。旧controller40303だけはPPID1 zombie/RSS0が残る。[post-run観測](evidence/post-run-process-observation.json)。最終正常exit0は [新controller記録](evidence/vae-848-recovery-queue-results.json) に保存した。数値moduleの完了、旧監視controllerのreap、製品生成READYを別に扱う。現在の未受入事項は [全体結果](RESULT.md) とモジュール別結果を参照する。

## 接続喪失時の再開手順（履歴）

1. 同じ実行環境へ再接続し、既存processと保存物を先に調べる。接続喪失だけを理由に生存jobを停止・再実行しない。
2. /tmp/kw-vae-remaining-queue-20261102.json と /tmp/kw-vae-wasm-source-f80-20261102/{acceptance-results.json,resource-measurements.json} を確認する。絶対pathの存在だけで受入済みとは扱わず、固定source、manifest/files、全値比較、codecと資源終了を照合する。
3. F80の最終reportが取得できたら、そのscopeで結果を確定する。回収可能な結果がない場合だけ、実行source `dccb88515775ec8aa86dd16f82e8816c9347ed38`・同じ参照とbundleで未受入F80を新しい出力先へ再実行する。
4. 848×848も既存reportの有無を調べ、未実施部分だけ独立参照→実WASM bothを行う。元model、precision、graph hashと事前gateを維持する。
5. 接続回復後はremoteの同branchを取得し、ローカル変更を確認して文書差分を反映する。今回の接続後追記はGitHub connectorで保存しており、通常runtimeの数値コードを変更していない。

[再現手順](REPRODUCE.md) と既存64件の証拠を再利用し、target81・F1/F4/F5・Text参照の再推論や、変更のないgraphの再exportを繰り返さない。Diffusion本体や受領ACKは単体再開の待機条件にしない。実generated sample・モジュール間接続・製品生成READY、mergeとPages公開は別の未受入範囲である。
