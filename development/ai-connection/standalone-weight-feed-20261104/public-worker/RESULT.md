# 公開 Worker・weight port 接続検証

実行 source は `a23d5276d705605903afa599b1e049f62948d094`、build は
`diffusion-models/0.1+42a6849d07f6f5404b8be30c5b9c3d556fdf95f2ee02dbc0199d8b2b31c089bb`。
固定 checkout から実行し、開始前と終了後の160ファイルを照合した。
各実行でHTTP取得したsourceは58件。固定source以外への要求、Page error、
console errorはいずれもなかった。取得path・bytes・SHA-256は各receiptに記録した。

| 環境 | 経路 | 結果 | 全試験の時間 | 観測したprocess familyの最大PSS | 最大RSS合計 |
| --- | --- | --- | --- | --- | --- |
| 1 thread / no COI | 同一ページAPI、明示outer MessagePort | PASS | 30.87秒 | 586,856,448 bytes | 976,777,216 bytes |
| 明示4 threads / COI | 同一ページAPI、明示outer MessagePort | PASS | 28.53秒 | 601,934,848 bytes | 995,319,808 bytes |

4-thread環境ではnative ORTの `numThreads:4` と3本のpthread作成を確認した。
1-thread環境は `numThreads:1`、pthread作成0本だった。環境の自動切替は行っていない。
時間はload・接続・取引・取消・unload・reload・disposeを含む試験全体であり、
モデル推論時間ではない。

計測対象は、このPython hostと配下のPlaywright／Chromium processのみ。
RSS合計は共有ページを重複計上する。PSSは取得できたsampleから集計した。
PSSは当初の約500MBという見込みを超えており、500MB以下の成立は主張しない。
WASM Memory、ORT allocator、host保持量の全内訳をこの集計から分離したものではない。

## 実行した境界

元のHIGH／LOWモデルを実際のbrowser Fileとして選択し、公開
`createDiffusionModels.load` → 実Worker → `openWeightFeed` → 返却MessagePort →
`createDiffusionWeightClient` を呼び出した。明示outer経路では、その返却portを
さらに `attachDiffusionPort` 経由で渡した。

各経路・各sideについて、真正baseのcross-Q重み1行 `[1,5120]` とbias4値を読み、
返却F32の変更がbaseへ反映されないことを確認した。呼出元が所有する完成F32の
検証用packageを用意し、通常のprepare → validate → commit → candidate解放 →
creator解放 → clearを実行した。通常admissionは各packageの全5,124値を検査し、
独立参照・誤差gate・forward executorを必須入力にしていない。

creator解放後も実Workerがactive packageを保持し、clear後はbase identity／bytesが
保たれ、旧ownershipが無効になることを確認した。HIGH／LOWはいずれも最終的に
candidate、read lease、operation lease、in-flight、cleanup pending、host package参照が0。
呼出元の完成F32配列とモデルFileの識別情報も保持された。

LOWでは、実際の逆方向 `package.readBlock` に到達してからvalidationを取消し、
rollback／candidate解放／creator解放まで行った。unload後の旧weight portは使用不能、
reload後の旧model sessionは `STALE_MODEL`、dispose後の公開APIは `DISPOSED` となった。
新sessionではbaseの再読出しを確認し、最終unload後の公開statusは
`loaded:false`、`cleanupRequired:false`、`resources:null` だった。

通常のweight transportが成立した証拠である。native operatorの数値比較は、先行する
[bounded ORT/Hike検証](../REAL-BASE-BROWSER.json)の限定scopeで再利用する。
今回の公開port試験ではnative `linearRuns`、`attentionRuns`、HIGH／LOW predictions、
samplesはいずれも0。完成weightが全モデル演算へ寄与した数値証拠として扱わない。

## 所有権・エラー時の扱い

低rank積をDiffusion側へ追加していない。使用したのは準拠する完成F32の検証用sourceで、
実LoRA原本は読んでいない。管理へのLoRA送付、全体運用実験、merge、Pages公開は
この試験では行っていない。

native feed単体ではclear失敗後にも真正baseを読めるが、公開model adapterは
weight feedのcleanup pendingを検出すると `MODEL_CLEANUP_REQUIRED` として
predict前にunload／reloadを要求する。この失敗時方針はsource／単体試験での確認であり、
今回のbrowser試験へclear失敗注入の受入を追加するものではない。

全モデルLoRA適用、元workflow原寸のpredict／6更新、実HIGH→LOW生成受渡し、
VAEを含む製品生成READY、管理からの全体運用は、この結果の受入外。
生成sampleの復元処理にも変更を加えていない。

## 再現

固定sourceをcheckoutし、実モデル2件を同じディレクトリへ配置する。
HTTPへモデルを配信せず、File入力で渡す。出力先は未作成のpathを指定する。

```sh
python tools/diffusion-models/public-weight-feed-browser.py --self-test
python tools/diffusion-models/public-weight-feed-browser.py \
 --source-commit a23d5276d705605903afa599b1e049f62948d094 \
 --models /path/to/retained/bernini --wasm-threads 1 --coi false \
 --transport both --output /tmp/public-weight-thread1.json
python tools/diffusion-models/public-weight-feed-browser.py \
 --source-commit a23d5276d705605903afa599b1e049f62948d094 \
 --models /path/to/retained/bernini --wasm-threads 4 --coi true \
 --transport both --output /tmp/public-weight-thread4.json
```

`--check-only` はsourceとFileのstatを確認し、browserを起動しない。
`--self-test` は実MessagePortの転送・呼出元配列の保持と、資源指定の拒否条件を確認する。

Receiptは [THREAD1.json](./THREAD1.json)、[THREAD4.json](./THREAD4.json)。
両receiptのbytes／SHA-256は [MANIFEST.json](./MANIFEST.json) にある。
