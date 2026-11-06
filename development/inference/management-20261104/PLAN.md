# 管理部分接続の変更境界

管理の固定source `e1661e561dfb1a4f20544ff48bc375175b5981d1` の実adapter、共有queue、capture、管理workspaceを使用する。ownerの数値演算・shape計算・Tokenizer・VAE復元を複製しない。Diffusion captureは `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` の実装を使用する。

1. Text plain／IDを `createTextVaeAdapter.invoke` から既存native APIへ渡す。TextとVAEのqueue bindingを同じresource groupへ登録する。plain文字列をdummy tensorへ置換しない。
2. VAE encode／decodeを同じ経路で実行する。nativeのshape、context、frameProcessing、生成sampleのproducer／decoder bindingを保持する。追加の復元・meanへの改名は行わない。
3. current native codecを管理workspaceへ明示注入する。native codecが持たないowner／trace／native返却binding／decode入力来歴は管理側の外側recordへ保存する。
4. 保存された実full512 conditioningを管理保存・読戻しし、mask／model／Tokenizer／最終RMSNorm markerと全payloadを実P4 captureへ渡す。投影・cross-attention・FFNは実行しない。
5. exact targetの取消、original terminal、queue解放、再実行、disposeを確認する。通常入力へ独立参照・gate・receiptを追加しない。

最初の試験は実native module factoryと実管理実装にcontrolled native executorを接続する制御・保存境界の試験である。既存tensor全値との同一性はtransport/storageの確認であり、新しいモデル推論や数値受入ではない。NN／browser実行はroot側で直列化し、別結果として追記する。81frameや参照画像の既存数値受入・未取得stream資材の状態を、この制御試験の成功へ混ぜない。
