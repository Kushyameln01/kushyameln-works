# Text内部RMSNormの採用

全512token有効のID入力で残っていた数値不一致を、元Torch CPUと同じFP32集計順へ揃えて解消した。ID0を含む入力域、model／Tokenizer、mask、最終Hike RMSNorm、固定gateは維持する。

選択する[manifest.json](manifest.json)は696,123B、SHA-256は`420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405`。元24graphのpath・bytes・SHAは保持し、`blocks[].normLowering`に元assetと実行graphの識別、metadata置換、実行bytes／SHAを持つ。model重みと元graphの再exportは行っていない。

各内部RMSNormのReduceMeanだけを、Torch SumKernelのAVX2、8 lane・ILP4・cascade集計へ置換する。Torchの一般CPU capabilityはAVX512だが、SumKernelはAVX512登録を持たずAVX2へfallbackする。根拠はTorch固定source `2236df1770800ffea5697b11b0bb0d910b2e59e1`の[DispatchStub.h](https://github.com/pytorch/pytorch/blob/2236df1770800ffea5697b11b0bb0d910b2e59e1/aten/src/ATen/native/DispatchStub.h)と[SumKernel.cpp](https://github.com/pytorch/pytorch/blob/2236df1770800ffea5697b11b0bb0d910b2e59e1/aten/src/ATen/native/cpu/SumKernel.cpp)。全演算をFP32に保ち、FP64への推論変更はしていない。

## 通常の構成

従来の`works-ai-1`を使う。plainは`encode({text})`から`[1,512,4096]`、IDは`encode({tokenIds,attentionMask})`から`[1,L,4096]`、L=1..512。現在の元model・prepared graph・norm・row hash・Tokenizerを、manifestのpathに対応するfiles Mapへ渡す。`norm-recipe.json`や独立参照・品質receiptを通常呼出しへ追加する必要はない。recipeは選択manifestに含まれる。

元assetのSHA検証後、graph長と2つのNode fieldだけを置換し、実行graph用に1本の新bufferを確保する。元buffer参照を置き換えてから実行SHAを検査し、ORT sessionを作る。各graphは19,376B増える。実測peakは下記の1caseに限定し、元bufferと新bufferが一時的に共存する1回のコピーを資源要件に含める。

通常出力の`graphBindings`はtensor外に置く。元asset SHA、実行graph SHA、recipe識別、実recipeの`recipeStatus`を返す。`.wktensor`のnative tensorへ管理fieldを挿入しない。新しい中立statusは`source-ordered-fp32`。旧`diagnostic-only-unaccepted`も固定sourceの再現用に受理し、statusを付け替えて返さない。normLoweringを持たない旧manifestも有効である。

## 数値受入と再利用

| 項目 | 確認した範囲 |
| --- | --- |
| 実行source | `c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3` |
| 独立参照source | `5954d48e0fb6df1d6977964fd8a7ba2a242b6eff`。元oracle全24layer hashと最終SHAを照合して復元した参照を再利用 |
| 全値比較 | `id-l512-all-active`、float32 BLC `[1,512,4096]`、2,097,152値、全mask1、合法ID0を含む |
| 結果 | maxAbs `0.0000852346420288086`、元maxAbs／atol／rtol `0.001`でPASS |
| 識別・保存 | model／Tokenizer・mask・最終RMSNorm marker・WKT保存読戻しを保持 |
| 資源終了 | 24 sessions作成／24 release、active0、72 tensor dispose、所有process終了、cleanup PASS |
| 資源実測 | harness＋所有Nodeのsampled RSS合計peak `3,909,136,384B`、時間`1,142.7529186539996秒`。当該host・1caseの実測 |

[acceptance.json](acceptance.json)は実行時receiptの元bytesである。[accepted-execution-manifest.json](accepted-execution-manifest.json)のSHAは`40afd296805a8ecfbadcca1602cea2d1d93421f93db3af9b9b196b9a7af2e3af`。今回の選択manifestはstatusだけを変更し、全24のgraph操作・元asset／実行graphのbytesとSHAをdeep比較で維持した。[status-change.json](status-change.json)に変更境界を記録している。status変更に新たな18.5GB hash読出し、再export、再推論は含めていない。

局所比較ではblock18／19／20の第1内部RMSNormについて、元checkpointとnorm weightを使い、square・mean・inverse・normalizedの全値が実WASMと独立Torchでbitwise一致した。Torch norm3件のsourceは`329d7048eeab06f32ce6bf7946516709bbd30b18`、参照を再利用したAVX2 graph／実WASMは`08b4d32d83c81124f2b3bf6f3e2692bcff44238c`。[diagnostics](diagnostics/)のreceiptと[artifact-index.json](artifact-index.json)で取得bytes／SHAを照合できる。

## 再現と残る範囲

固定sourceを取得し、既存assetを選択manifestのpath／bytes／SHAへ対応させる。新しいgraphファイルをexportする工程は不要。通常APIの構成・実行・取消・保存・解放は[管理接続の再現手順](../../REPRODUCE.md)を使う。開発用の数値再現では`accept_lowering.py`へ元manifest、選択bundle、未変更oracleと対応referenceを渡し、固定sourceで実行する。実行前のsource／構成確認は`--preflight-only`で行える。

履歴receiptを実行source `c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3`で再現する場合は`accepted-execution-manifest.json`を使う。新しい中立statusの`manifest.json`は、この配布sourceのAPIで構成する。両manifestの違いはstatus24件だけである。

今回の数値受入は明示した全512有効IDの1caseであり、任意promptの網羅的品質試験ではない。既存plain／ID／maskの結果は各元scopeのまま保持する。新statusの管理経由実行、他モジュールとの接続、実生成sample、LoRAを含む全体運用の結果は、別の実行receiptで報告する。

SDPA倍率候補は固定gate未達のため不採用。FMAとpost-AV正規化も採用しておらず、この選択manifestへ混ぜていない。
