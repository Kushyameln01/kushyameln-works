# 管理への採用設定とデータ契約

2026-11-05 JST。通常API版は `works-ai-1`、native codec schemaは変更しない。旧manifest／旧ファイル互換も維持する。source／数値証拠／今回の構成・保存確認は[RESULT](RESULT.md)で分ける。

## Textの採用設定

正本は[既存の採用manifest](../management-20261104/text/source-ordered-fp32/manifest.json)。696,123B、SHA-256 `420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405`。prepared27資材と原modelを既存pathで渡す。24graphやmodelの再exportは不要。

| 項目 | 規約・変更 | 既存証拠／実行source |
| --- | --- | --- |
| 内部RMSNorm | 各block2箇所のReduceMeanを元Torch SumKernelのAVX2 8lane・FP32 cascade集計順へ揃える。24block、FP32のまま。元weightは不変 | recipe `umt5-inner-rmsnorm-avx2-cascade-f32-v1`、Torch source `2236df1770800ffea5697b11b0bb0d910b2e59e1`。[局所比較](../management-20261104/text/norm-local/)はblock18/19/20の全square／mean／inverse／出力がbitwise一致 |
| source／実行graph | 元asset hashとmetadata置換後の実行graph hashを分け、各graphを実行前に検証する | manifest `blocks[].normLowering`。返却caps／通常出力 `graphBindings` に24件のsource/executed SHA、recipeId、`recipeStatus:'source-ordered-fp32'` |
| 最終RMSNorm | `NR-UMT5-RMSNORM-F32`／実Hike weighted `encoder.final_layer_norm`、epsilon1e-6、無効mask行は0。今回変更なし | 返却marker `umt5-final-rmsnorm-f32-v1`。最終weight SHAはmanifest／capabilitiesに保持。旧P4向け改名や二重適用なし |
| 全512有効ID | 旧FAILを同じ入力・参照で解消。全2,097,152値maxAbs8.52346420288086e-5、元maxAbs／atol／rtol0.001 | [受入原本](../management-20261104/text/norm-accepted/README.md)、実行 `c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3`、独立参照 `5954d48e0fb6df1d6977964fd8a7ba2a242b6eff` |
| 採用status | 数値受入時の40afd manifestからstatus24件だけを変更。全source/executed graph bytes／SHA／操作／gateは同一 | [status差分](../management-20261104/text/source-ordered-fp32/status-change.json)。数値runを新statusへ遡及変更しない |
| 長文plain | EOS込み512有効、全値maxAbs0.000151902437210083、元0.001 gate | [実長文](../management-20261104/text/plain-long-accepted/README.md)、実行 `78954ee92d1b76c6652f50df1668159a55db6dc9` |
| 新manifestでの実browser | plain Hello world／同じ512 IDs、mask3有効・509無効。各全値maxAbs2.4437904357910156e-6 | [管理browser原本](../management-20261104/text/managed-accepted/README.md)、実行789。全512有効caseのbrowser NNとは区別 |

通常のplainはfloat32 BLC `[1,512,4096]`、IDは `[1,L,4096]`、L1..512。ID0..256383、同長0/1maskで少なくとも1有効を維持する。modelは `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`、Tokenizerは `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`。通常入力に独立参照・gate・固定prompt hash・詳細receiptを追加しない。

## 実管理サービスへの登録

管理sourceは `e1661e561dfb1a4f20544ff48bc375175b5981d1`。既存 `createManagedInferenceBridge` に実管理module群、現native API、現codecを渡し、選択したmanifestでconfigureする。

```js
const codec = createCurrentNativeCodec(native, sourceRef);
const bridge = createManagedInferenceBridge({
  manager, nativeAPI: api, nativeModule: native, sourceRef, codec
});
const {value: caps} = await bridge.configure('text_encoder', {
  manifest: selectedManifest, files: selectedFiles
});
// Compare caps.graphBindings with the owner's
// inspectTextEncoderManifest(selectedManifest).graphBindings before service use.
// Hold the selected manifest identity and the returned 24 bindings outside WKT.
```

旧manifestも動くので、configure成功だけを修正版選択の根拠にしない。今回の実行CLIは実manifest bytes420e、native inspectorの24binding、管理経由configure戻りを照合する。既存の[verify-adoption.mjs](../../../tools/inference/management-connection/verify-adoption.mjs)はこれを実行し、旧選択の負例も区別する。独立APIや通常実行へ診断CLIの固定hash条件を持ち込まない。

管理UIはreference copy、codecの旧defaultも別経路として残っている。今回の構成は現codecを実管理workspaceのbuild／read両方へ明示注入する実サービス経路であり、管理UI全体のdefault差替えや管理担当の別環境ACKではない。

## 現codecと保存項目

提供する正本は `docs/shared/inference/tensor.mjs`、10,894B、SHA-256 `7a15d721b1bab60cdade8723fd1c4d543a142d236cf2e59b63f1ba33ba14ed78`。同じ配布sourceのapiからencode／decodeを取得し、[既存factory](../../../docs/shared/inference/management-adapter.mjs)を使う。旧codec2bd／498を暗黙defaultとして使わない。

- native WKT：実payload、shape／dtype／layout／meaning、marker、mask、model／Tokenizer、context／sourceContext、frameProcessing、latentContractを現契約内で保持。旧markerなしファイルへ値を推測追加しない。
- 外側管理package：owner／snapshot／graphBindings／trace／evidence／入力来歴。strict native context／latentContractへ管理fieldを追加しない。
- decode：元raw入力artifactとRGBを同じpackageへ保存。元producer群、decoder binding、復元済みrawという意味を保つ。RGB単独で来歴保持済みと扱わない。

frame処理の既存数値結果とcodec回帰を再利用する。今回、実source-F4 WKT自体は未供給なので新しい保存読戻しを完了扱いにしない。元receiptのframe順・時刻・slotを創作して補わない。

## 最新P4への通常入力

固定Diffusion source `b6e166478a8e072c9ffd3ce562bfdb0c89634920` は `umt5-final-rmsnorm-f32-v1` をcanonical markerとして通常P4で正式受理する。`encoder-final-rmsnorm` はDiffusion側のlegacy aliasで、Textが出力を改名する規約ではない。

管理から読戻したnative tensorを通常入力へ渡す。通常consumerはprotected capture token・独立参照・品質receiptを要求しない。今回確認するのは `checkExecutionSupport` と `snapshotP4NativeConditioning` 等の通常入力受理・情報保全までで、4096→5120投影／cross-attention／FFNの数値実行はDiffusion所有の別工程である。

## 保持済み実generated sample

[取得状況](sample/availability.json)には実sample2件の原receipt、bytes／SHA、producer群、復元owner、decoder bindingを記録した。どちらもraw `[1,16,1,2,4]` で既存Rectへ適合する。実bytesが取得できたら、そのまま `bridge.execute({module:'vae',operation:'decode',input:raw})` へ渡し、元rawとRGBを保存する。新profileは不要。

当環境では原本WKT／全128raw値を取得できていないため、その実decodeだけを保留した。synthetic fixture、VAE mean、receiptのhashを使って値を代用しない。追加復元・mean改名・生成のやり直しは行わない。
