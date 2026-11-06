# 新版LoRA管理接続：実browser再現

この試験は、配布する `docs/ai-connection/lora/` をChromiumで開き、公開されたFile選択と操作ボタンを使う。実 `lora-standalone/1.0-draft.1` SDKとHike WASMを使用する。管理単体の旧689件・Chromium14件を、新SDKとの接続証拠へ数え直すものではない。

## 実行

必要環境はNode.js 24、`/usr/bin/chromium`、`/opt/codex/cua_node/lib/node_modules/playwright`。追加パッケージ、外部モデル、非公開4原本、他担当ACKは要求しない。

```sh
node tools/ai-connection/run-lora-standalone-browser.mjs \
  --manager-commit <今回の実装を含む完全40桁SHA> \
  --out /tmp/management-lora-browser-fresh
```

出力先は未作成のdirectoryを指定する。実行runner、fixture生成source、browserが実取得したHTML/CSS/JS/WASMを、指定commitのGit objectとbytes・長さ・SHA-256で比較する。開発中だけ `--development` を利用できるが、その実行を固定sourceの受入とは呼ばない。`--smoke` は画面入口のみで、SDK接続の受入条件を満たさない。

loopback serverは静的sourceのGETだけを受け付ける。LoRA File内容はserverへuploadしない。管理のprivate runtime handleや隠し実行hookを使って操作せず、表示された状態receiptを検査する。

## File・base・consumerと数値scope

runnerは `tools/ai-connection/lora-standalone-fixtures.mjs` から再現可能な開発用 `.safetensors` Filesを作り、実File inputへ選択する。非公開light/detail原本の複製ではない。HIGH lightだけで登録・適用できることを先に確認し、その後に必要なdetail/LOW Fileを選択する。

LoRA ownerのcanonical `diffusion_model.blocks.0.self_attn.q.weight`、元full shape `[5120,5120]` を使用する。rank1の元factor `[1,5120]`／`[5120,1]` を保存し、nativeの元座標slice `{startRow:1,rowCount:1}` を明示する。shapeを小行列へ置き換えない。今回の接続検証は選択した1行・全5120列のPARTIAL scopeであり、全2904 patchの数値再検証とは呼ばない。

baseはownerの `createIndependentBaseProvider`、consumerはownerの `createStandaloneReferenceHost`。管理はmapping・delta計算・完成値検査を重複実装しない。consumerは宣言範囲の完成F32を実readして型・有限性・shape・現在性を確認する。開発用のhand literalとしてfull offset5120のbase先頭4値は `[-0.0390625,-0.03125,-0.0234375,-0.015625]`。HIGH light +1の差分は+0.03125、HIGH detail +1は−0.03125、LOW light +1は+0.0625。通常SDKへ独立参照・gateを渡さず、管理接続の出力読戻しを開発側で確認する。

## 制御・保存・所有権

- File登録、compose→prepare→stage、apply、強度変更、二組→片組、再適用、base復帰を実SDK/Hikeへ接続する。
- HIGH/LOW別SDK、管理revision・SDK local revision・consumer epochを区別する。
- 遅延取消では元Promise終端を待ち、古いtargetが後続の実行を止めないことを確認する。timeoutは失敗上限であり終端証拠ではない。
- consumer失敗後の回復・再適用、HIGH成功/LOW失敗の一括処理で全体成功を公開しないこと、新取引によるbase補償を確認する。
- native SDKのstream保存をOPFSの実Fileへ書き込み、payload完了後のmanifestを確認する。一括Blobへ集約しない。
- reload後、新SDKがOPFSの実saved FilesからopenPackageし、新しい取引としてstageできることを確認する。保存したJSONだけでruntime authorityを復元しない。
- SDK prepared capabilityを解放しても、独立consumer active/read leaseが値を供給できることを確認する。SDK終了とconsumer/base/kernelの最終終了を別に扱う。
- 最後にconsumer候補・active/read lease・pending work・kernel lease/memory・cacheの解放状態を確認する。

`result.json` はcase別結果、固定source取得確認、native manifest、request/SDK/consumer identity、実resource状態、エラーを保持する。スクリーンショットを `browser.png` に保存する。kernelの32MiB/instanceやcache容量は各ownerの観測値であり、総RAM・OS peakとは区別する。OS RSSと総peakを測定していない場合はnullのまま報告する。

## 手動

`docs/` を静的rootとして `/ai-connection/lora/` を開く。sideと使用pairを選び、必要な `.safetensors` だけを登録する。保存先directoryを選ばない場合はOPFSを使い、「ブラウザ保存から新SDKで開く」で実payloadを再検査する。別directoryのpackageはmanifestと選択分のpayloadをFile入力から開ける。

成功scopeは **管理→実新版SDK/Hike→準拠reference provider/consumer**。実Diffusion graph binding、学習base同一性、生成品質は別受入であり、`graphBinding:UNBOUND` と `generationReady:false` を維持する。
