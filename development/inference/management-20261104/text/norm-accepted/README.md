# 全512有効ID入力のnorm-only full24受入

**実Node SDK通常APIで全24層を実行し、全512token有効のID入力の2,097,152値が、変更していない独立参照と元gate内で一致した。** `maxAbs=8.52346420288086e-5`、`atol=rtol=maxAbs gate=0.001`、全値finite/allclose、metadataとnative codec保存読戻しも合格した。gate引上げ、mask短縮、合法入力域の縮小は行っていない。

これは**元実行manifest `40afd296805a8ecfbadcca1602cea2d1d93421f93db3af9b9b196b9a7af2e3af`の1個のID case**の受入である。browser Worker、同候補によるplainの新規比較、管理経由の新規Text運用、実Diffusion投影/cross-attention、全体生成の合格へ拡張しない。今回の包装はNN/export/再推論を行っていない。

## 実行source・manifest・参照

- 実行source: [`c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3`](https://github.com/Kushyameln01/kushyameln-works/tree/c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3)。[acceptance.json](acceptance.json)と[node-sdk-results.json](node-sdk-results.json)は完了済み原本を変更せずコピーした。
- 選択manifest: [accepted-execution-manifest.json](accepted-execution-manifest.json)、696,291 bytes、SHA-256 `40afd296805a8ecfbadcca1602cea2d1d93421f93db3af9b9b196b9a7af2e3af`。
- 元manifest: 19,908 bytes、SHA-256 `aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f`。元24graph descriptor/重みを保ち、追加は24blockの`normLowering`だけ、attention loweringは0block。runtimeでFP32 source順のinner RMSNormへloweringした。
- 参照の元実行source: `5954d48e0fb6df1d6977964fd8a7ba2a242b6eff`。元case入力、model/Tokenizer、mask、最終normalization、gateは保持し、選択manifestとの対応だけを明示した。元oracle receiptを新manifest hashへ書き換えない。
- 再利用する公開参照: [既存id-l512-all-active-reference.f32](../id-l512-all-active-reference.f32)、8,388,608 bytes、SHA-256 `e1fc114f15240de2d39cd02b111dfebaa6621250e90543444659053a860c62a4`。このdirectoryへ重複コピーしていない。

元参照の復旧では全24layer digestと最終出力hashが元5954 oracleと一致した。[既存復旧receipt](../reference-restoration.json)と[source-and-reference-index.json](source-and-reference-index.json)にその来歴を残す。今回の受入harnessも使用参照の全bytes/SHAを照合してから比較した。参照を今回のWASM出力へ合わせて再生成していない。

実行時recipeの`diagnostic-only-unaccepted`というstatus文字列も、manifest原本にそのまま保持した。これは実行前からの宣言であり、完了したcaseの数値合格を隠すものでも、全profile/通常運用への採用を宣言するものでもない。後続の`source-ordered-fp32` status採用と、そのmanifestへ証拠を再利用する根拠は別作業で扱う。この資料は別manifestを40afd実行済みと偽らない。

## 入力と実conditioning payload

[input-record.json](input-record.json)は元oracleのID入力record。caseは`id-l512-all-active`、tokenIds 512、attentionMaskは全512個が1で、padding0。plain requestの追加やsystem/negative promptの組立てはない。

[id-l512-all-active.wktensor](id-l512-all-active.wktensor)は今回実出力の保存物で、8,390,098 bytes、SHA-256 `efaed289fbeeb69a1fb6ab172d35d8e2f09bf164bedba5a360787cc29f4e4e29`。全payloadとheaderを包装時にもhash照合した。[payload-descriptor.json](payload-descriptor.json)にnative headerを保存する。

| field | 実出力 |
|---|---|
| dtype / layout / shape | float32 / BLC / `[1,512,4096]` |
| meaning | `text_hidden_states` |
| normalization | `umt5-final-rmsnorm-f32-v1` |
| attentionMask | 512個、全て1、保存読戻しで保持 |
| model | `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68` |
| Tokenizer | `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458` |

Text最終RMSNormとmask・識別の保持はText ownerが担当する。4096次元hiddenからDiffusion内部幅への投影（対象実装の4096→5120）、cross-attention、FFNはDiffusion担当の責任である。native `[1,512,4096]`を5120次元へ改名・reshapeして互換扱いしない。

これは実ID conditioningであり、通常plain経路全体、Bernini system prompt/negative選択、ComfyUI固有のprompt重みを含む元conditioning全体を再現したものではない。system/negativeの組立ては管理側が所有する。

## 数値・終了・資源

通常の公開Text factoryと共有Text jobを使うNode file-backed hostで、`diagnostics:false`、ORT CPU WASM、実Hikeを使った。独立の別Text数値実装で通常APIを迂回した受入ではない。source同一性は親Git検査とNode実bytes検査で確認し、Node自身がGit commit identityを独立検証したとは報告しない。

- 全2,097,152値を比較し、maxAbs `8.52346420288086e-5`。保存読戻しも全値比較、metadata保持を確認。
- session作成24/release24、run24、Tensor dispose72、最大同時session1、終了active0。
- 構成したprepared graph FDは全てclose、元modelのbounded source FDもclose。元6,735,906,897-byte model全体のread/hash再計算は行わず、embedding rowを最大8192 bytes単位で読んだ。
- `cleanupPassed:true`、観測した子の最終live/zombie/errorsは空。Node client stateはdisposed。
- outer wall `1142.7529186539996 s`、Node host wall `1140.635332499 s`。標本group peak RSS `3,909,136,384 B`、Node rusage peak RSS `3,867,672,576 B`。異なる測定であり、合算や最小必要RAMへ換算しない。
- Worker使用0、browser control試験なし。このrunはbrowser取消・再実行・解放の新受入ではない。

[memory.json.gz](memory.json.gz)は4212標本の元memory timeline、[stdout.log.gz](stdout.log.gz)は元progress logをlossless gzip化したもの。[compression-receipt.json](compression-receipt.json)に圧縮前後のbytes/SHAと完全復元確認を記録する。標本group RSSは親と列挙子の範囲で、短いpeakを網羅しない。

## 取得と再現

[index.json](index.json)が配布ファイルのpath/bytes/SHAを列挙する。[source-and-reference-index.json](source-and-reference-index.json)は実source closureの固定GitHub URLと参照取得手順、通常API文書をまとめる。環境内の絶対pathだけを取得済み証拠として扱わない。この包装自体は別担当の受領ACKではない。

再実行が必要な別環境では固定c99 source、同model/Tokenizer/24原graph、**40afdの選択manifest**、既存公開参照を取得する。この資料の[reproduce-selection.json](reproduce-selection.json)も別途取得する。既存証拠の受領確認だけのために1143秒の推論を繰り返さない。次はsource checkoutのrepository rootから、新しいprivate outputへ実行する例である。

```sh
python tools/inference/text-encoder/accept_lowering.py \
  --selection /path/to/downloaded-reproduce-selection.json \
  --bundle /path/to/exact-40afd-selection-bundle \
  --original-manifest /path/to/original-aeb7986-manifest.json \
  --source /path/to/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --execution-source-sha c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3 \
  --output /path/to/new-private-id512-output
```

40afd manifestだけでは18.52GBの元graph資材を取得したことにならない。manifestの各assetと元modelは別途必要であり、通常configureの入力に独立参照やこの詳細receiptを追加しない。

未受入はこの候補によるbrowser Worker/T3、新規plain/管理Text実行、実Diffusion consumer、prompt組立て全体、LoRA付き全体運用、製品生成READY。merge・Pages公開もこの包装には含めない。過去の失敗と局所norm結果は別directoryに保持し、この1case合格で履歴やscopeを書き換えない。
