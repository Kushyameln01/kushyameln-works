# VAE担当との新管理Rect共同受入packet

2026-10-31。新管理source checkpointは `c84bc495562a393a437056cef944fb2e0f95ba08`。実行時の管理closure15ファイルとGit実bytesの一致は `CHECKPOINT-SOURCE-RECEIPT.json`、今回のpreflightは `evidence/rect-preflight.json` に固定した。ファイルが同じという理由でnative pinをe86へ更新しない。

## 今回実行する境界

新しい規範必須入口 `createNormRequiredRectAdapter` から、実VAE855の既存 `configure → decode` をdispatchする。既存encode/mean復元証拠を再利用し、encode・export・参照再計算は行わない。

入口の固定policyは `rect-decode`。必須normは `N-IDENTITY / N-SHAPE / N-EVIDENCE / N-TRANSACTION / N-ARTIFACT`。RGBの数値receiptをDiffusion mean規範へ付け替えない。

1. RGB `[1,3,1,16,32]` を予定出力artifactとして事前宣言し、原本restored mean `[1,16,1,2,4]` を別のowned handleで検査する。旧encode hashとrestored hashは別fieldで保持する。
2. declarationの同じevaluateEdgeがreadyの場合だけ、固定native855のidle moduleをfactoryから生成してconfigure/decodeする。source・model・profile・context・現在のrequest/revision/resource generationが不明ならnative0で拒否する。
3. 実decode後に1536値を既存参照とowner事前gate `atol=rtol=maxAbs=2e-5` で比較し、その現在output hash/shape/meaning/input mean linkをN-EVIDENCEとしてvalidatedへ渡す。
4. 元Promise終端、対象Workerの実close、owner releaseをbarrierとして確認する。実行中取消後も次Workerへ旧cancelを送らない。管理revisionとnative local revisionは独立値で保持する。
5. RGBの実capture→E4 write→実disk readerを終えてから、現在queue receiptと実package receiptをpublishedへ渡す。生成snapshotの公開・generationReadyはfalseのまま。

## 必要原本はdecode用3点だけ

| file | bytes | SHA-256 |
| --- | ---: | --- |
| decoder-body.onnx | 286313363 | 6674457d2170352760b3aa73543ee1d2bf5713e6bf4d7ea6bf63d8f9703ac27e |
| conv2-weight.f32 | 1024 | 9ce97eaf137ab64ae409384b6f6177a7b07e593faf103e7e986c0c99d0a1316f |
| conv2-bias.f32 | 64 | 1a79fbc83c80584e46d5683d49df3482b575ffb4aca99c843a0e8a2aef9df9cd |

encoder実bytesは要求しない。manifestはVAE855の既存Rect原本 SHA `450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a` を維持する。

管理環境では3原本をworkspace/既存cache/既存Drive参照・exact filename検索から取得できていない。ownerが保持する既存bundleで新管理dispatcherを実行してreceiptを返す経路、または承認済みprivate handoffで3原本だけを渡す経路が必要。原本4点の再要求、再export、公開Gitへの重み追加、小型代替は不要。

## 固定した元証拠

- 実NN証拠 `35151d1f447d6bba30931a8c28636b2d5d9c3820`。元管理285、native VAE855、Diffusion5f、codec2c/4c。
- 新P1再受領 `e86d17f8fe3310875d3578ce838e1fc2c32271dc`。管理eddaでの証拠/input/file assessmentのみ。NN/Hike/export0。
- 原本入力 `restored.wktensor` 1084 bytes、全file SHA `dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612`、payload SHA `71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063`。
- 旧encode payload SHA `289977e71b65ca42ac9f3fa2b614882bc0eba7420e70620927a25740db6f53a3`。
- 既存独立参照 `development/inference/e6/fixtures/png-roundtrip.f32` 6144 bytes、SHA `44cf55e9ea5896f985a0ccf26f61cbb52650fd1a53d3fe80fc3e03aaae545c29`。
- 元実RGBの最大差 `4.328787326812744e-6` は元scopeで保持する。新dispatchの1536値は新たに比較し、旧receiptの時刻・source・queue停止を現在値へ書き換えない。

## 新管理実行CLI

管理checkoutを `c84bc495562a393a437056cef944fb2e0f95ba08` に固定して実行する。native rootは855の固定source closure、bundle rootは既存exportの3decode asset所在。出力先は新しいprivate directoryにする。推論Memoryはファイル検査の64KiB等を流用せず、現在device用の明示resource-state JSONを渡す。

```sh
node tools/ai-connection/run-norm-required-rect.mjs \
  --native-root <verified-native855-root> \
  --bundle-root <existing-accepted-rect-bundle> \
  --input <exact351-restored.wktensor> \
  --reference <existing-png-roundtrip.f32> \
  --resource-state <explicit-current-device-budget.json> \
  --manager-commit c84bc495562a393a437056cef944fb2e0f95ba08 \
  --scenario decode \
  --out <fresh-private-result-directory>
```

取消・復帰の共同受入は別fresh directoryで同じ条件を `--scenario cancel-recover` として実行する。Worker closeはPlaywrightの実イベントで確認し、timeout・port切断を停止扱いしない。descriptor/API/native sourceは変更しない。

## 現在の検証scope

mandatory adapter制御19件、CLI原本境界5件は合格。制御試験はfixture能力として明示し、NN成功とはしない。新管理/実VAE855 Workerのモデル0 smokeはChromium154で成功した（Worker1作成・実close1・live0、postMessage/job/encode/decode0）。通常sandboxのlocalhost listen EPERMと、追加network profile下のlocalGET-only成功は別記録。

現在CLIの実経路は `BLOCKED / actual-vae-decode / nativeCalls:0 / browserLaunched:false`。3原本不足と現在推論resource readinessだけが依存条件であり、旧encodeや大型モデル成立を新たな開始条件へ増やさない。normalized中間codec marker、実generated sample/81frame/全sessionは今回の受入外に保持する。

全Node回帰は344/344 PASS、skip0。実NN受入前にserved管理closureが固定checkoutと一致することを照合する。CLIのcommit:nullはそのまま保持し、別source receiptから対応を証明する。入力はbrowser選択後にも351原本の1084 bytesと全file SHAを再検査する。
