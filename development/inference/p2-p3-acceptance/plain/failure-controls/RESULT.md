# 最終化後の失敗をPASSに残さないguard修正

数値比較を終えた後のhandoff保存やbrowser.closeが失敗すると、旧`accept_plain.py`はfailureを記録しつつpassed=true / exit0を返し得ました。旧`plain_reference.py`も末尾のsource-stat不一致で例外を出しますが、JSONへpassed=trueを残し得ました。

両helperのexceptで`report['passed']=False`へ戻す2行だけを変更しました。数値処理、gate、実行source guardは変更していません。

制御試験は対象helperの実際のtry/except/finallyとreturnをsourceからcompileし、重いモデル/browser部分を制御doubleと既存保存出力へ置き換えます。新たなNN実行・参照計算・browser起動は行っていません。これは受入結果の正しい失敗終端を確認する試験で、数値証拠ではありません。

| fault injection | 固定旧source 5537 | 修正後 |
| --- | --- | --- |
| late handoff write | exit0、JSON passed=trueでRED | exit1、passed=false |
| late browser close | exit0、JSON passed=trueでRED | exit1、passed=false |
| 末尾source-stat変化 | 例外、JSON passed=trueでRED | 例外、passed=false |

旧source `5537b8932343aa2476b95191817e8913f99dab02`を指定した3件のREDと、修正後3件のGREENを[receipt](RECEIPT.json)・[red log](red.log)・[green log](green.log)に保存しました。旧sourceで成功した実数値比較・正常cleanup・保存bytesの証拠はそのまま保持し、guard修正sourceへ付け替えません。新guardのsourceは個々のSHA-256をreceiptへ記録し、rootが別commitとして固定します。

```sh
# 旧sourceの不正なPASSを再現する制御試験（3 failuresが期待値）
python tools/inference/text-encoder/test_plain_failure_controls.py \
  --source-ref 5537b8932343aa2476b95191817e8913f99dab02

# 現行guardの制御試験（3 tests / OK）
python tools/inference/text-encoder/test_plain_failure_controls.py
```
