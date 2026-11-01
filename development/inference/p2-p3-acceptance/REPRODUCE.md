# 再現・受取確認

## モデル不要の受取確認

このbranchの最終固定commitをGitで取得し、[RECEIVER.md](conditioning/RECEIVER.md)のNode probeを実行する。source/conditioning/receiptのbytes照合だけであり、NN、モデル取得、数値規範の再実装は不要。自己検査の成功と、相手本人の取得ACKは分ける。

## 元の実行source

今回のNN/helper実行checkoutは`5537b8932343aa2476b95191817e8913f99dab02`。sourceを再現する場合は独立worktreeを使い、旧worktree/証拠を上書きしない。配布版には後続の結果文書とエラー時受入guard修正が入る場合があるため、実行sourceと配布SHAを混ぜない。

既存の私有model/graphをそのまま使う。元modelはText6,735,906,897 B、24stage graph18,523,750,008 B、Rect decode asset286,314,451 B。再exportや別shapeへの置換はしない。モデル原本/ONNX本体はGitへ含めていない。

P2のsource選択は管理`60d16b64d6020d3d20239f087f8add91268dcaad`、native`855f435120f08eb9e818e51281fc26f0e2633829`、mean owner`5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`。完全Git objectsも実行repoへ取得し、helperのGit-byte照合が可能にする。実行用checkoutはZIPの絶対pathだけを取得証拠にしない。

## P2

Node24、Python3/numpy/psutil/Playwright、Chromium、管理CLI既存のNode Playwright環境を使う。今回は既存依存だけを利用した。各`WKW_*`を受取側の実pathに設定する。native rootへstorage codecを上書きせず、storage2bdとnative855 closureを別pinにする。

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/inference/vae/accept_joint_rect.py \
  --manager-root "$WKW_MANAGER_60_ROOT" \
  --diffusion-root "$WKW_DIFFUSION_5F_ROOT" \
  --native-root "$WKW_NATIVE_855_ROOT" \
  --bundle "$WKW_RECT_BUNDLE" \
  --resource-state "$WKW_CURRENT_RESOURCE_JSON" \
  --output "$WKW_FRESH_JOINT_OUTPUT"
```

resource-stateは現在deviceの`status/ownerId/requiredBytes/budgetBytes/occupiedBytes`を明示する。保存した[p2-resource-state.json](p2/p2-resource-state.json)は今回の環境用記録で、将来のreadiness証明にコピーしない。今回のcgroup16GiB/CPU4core、8GiB task budgetとNN横断直列化を維持した。推定2GiBと実測を分け、他NNが終了しowned allocationsが0であることを先に確認する。

helperはsource/shape/hash検査、採用codec normalized保存読戻し、owner normalize/restore、正常新decode、取消/復帰新decodeの順に実行する。成功時は`joint-result.json.passed:true`、両scenario `status:PASS`、RGB caseは`status:published`、全1536値`maxAbs<=2e-5`、Worker close1/1と2/2、子process live/zombie/errors0。`published`は管理artifact状態である。外部公開・生成READYではない。

## 管理884の追加変更境界

初回60dの実行記録とは別に、`8849891f19124df31847bd691503c2491278eaa8`を固定取得する。observerの実行sourceは`e150e7ac3c4859739528ff278763c6474968ac08`。Diffusionは同じ5fの完全Git worktreeを使い、`development/ai-connection/e6/reference-received.json`も含むことを確認する。部分sourceだけではNN前に終了する。後続のdocのみのcommitへ再実行ラベルを付け替えない。

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/inference/vae/observe_management_joint.py \
  --manager-root "$WKW_MANAGER_884_ROOT" \
  --diffusion-root "$WKW_DIFFUSION_5F_ROOT" \
  --native-root "$WKW_NATIVE_855_ROOT" \
  --bundle "$WKW_RECT_BUNDLE" \
  --resource-state "$WKW_CURRENT_RESOURCE_JSON" \
  --output "$WKW_FRESH_884_OUTPUT"
```

このhelperは管理の`run-joint-rect-management.mjs`を変更せず、正常と取消復帰を直列実行する。成功は[保存済み結果](p2/updated-884/observer-result.json)の`passed:true`、両scenario `status:PASS / freshVaeDecode:true / actualNumericalAccepted:true`、Git sourceCheckpoint20件一致、同復元mean payload、全1536 RGB値の元gate内、Worker closeとowned process live/zombie/errors0。各`jointTraceId`でnormalized marker、mean3段階のE4、owner/queue、`currentInputLink`、実decode後のRGB保存読戻しを確認する。実測23.702秒、RSS和peak1,836,781,568 B。参照の再計算・Text NN・export・encodeを加えない。モデル不要の固定source取得確認では、この実モデル再現を要求しない。

## Text plain

[plain/REPRODUCE.md](plain/REPRODUCE.md)を使う。source oracleと実browser NNは直列化し、P2実NNと同時に走らせない。元manifest・Tokenizer・finalNorm・gateを固定した[事前計画](plain/predeclared-plan.json)を保持する。source callerは実helper checkoutの完全SHAを指定し、別SHAのcodeへ古い実行ラベルを付けない。

新比較対象は`Hello world`のplain pathだけ。短縮しない512位置PyTorch referenceと、実plain API/既存ORT WASM24graph/実Hike final normを使う。ID4tokenの過去結果をexpected値にしない。成功条件は全2,097,152値、512 IDs/mask一致、padding厳密0、strict maxAbs<=.001かつ元allclose.001/.001、session/Tensor/Worker/process終端。source-stat/保存/close失敗は数値成功と区別して失敗にする。

4GiBは事前目安で、browserの実測最大processは約5.66GBだった。実行deviceの余裕を評価し、この結果から端末負荷改善を認定しない。実モデル再現はoptionalで、単なる受取確認にNNを要求しない。

## P6・未受入

[必要shape表](p6/SOURCE-SLOT-SHAPES.md)の実媒体・slot寸法がnullの項目は、実fileと既存前処理の情報が届くまで確定しない。P5以前のgenerated sample decodeや、workflow設定gridを小診断profileへ収める処理をこの手順へ追加しない。
