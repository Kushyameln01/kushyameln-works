# Text RMSNormの局所比較

**block index 18・19・20の最初のRMSNormだけを比較し、実Torch SumKernelのAVX2加算順へ合わせた局所WASM出力が、既存独立source参照と全bit一致した。** MatMul、SDPA、全24層、Text最終出力の受入を示す結果ではない。full24候補`c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3`の検証結果はこの資料に含めず、単体完成や生成READYへ拡張しない。

今回の包装は既存小report・receiptのコピー、JSON/hash・private fileのstat確認だけである。NN・局所演算・exportは再実行していない。8MBの中間tensorは複製しない。

## 初回と改訂のsource

| scope | 完全source SHA | 内容 |
|---|---|---|
| [initial-avx512/source-results.json](initial-avx512/source-results.json) | `329d7048eeab06f32ce6bf7946516709bbd30b18` | CPUで3個の独立norm参照を生成。CPU capabilityからAVX512のlane16加算順を仮定 |
| [initial-avx512/comparison-results.json](initial-avx512/comparison-results.json) | `329d7048eeab06f32ce6bf7946516709bbd30b18` | original/candidate各3graphの実ORT WASM比較。診断完了だが仮定candidateはbitwise未達 |
| [corrected-avx2/source-results.json](corrected-avx2/source-results.json) | `08b4d32d83c81124f2b3bf6f3e2692bcff44238c` | 既存3norm参照を再利用し、AVX2 lane8順へ診断graphだけretarget。source norm再演算0 |
| [corrected-avx2/comparison-results.json](corrected-avx2/comparison-results.json) | `08b4d32d83c81124f2b3bf6f3e2692bcff44238c` | original/candidate各3graphを実ORT WASMで比較。改訂candidateの全出力がbitwise一致 |

Torchは`2.6.0+cpu`、git `2236df1770800ffea5697b11b0bb0d910b2e59e1`。CPU capabilityの報告は`AVX512`のままである。一方、固定Torchの`SumKernel`はAVX512実装へのopt-inを持たず、`REGISTER_DISPATCH`/`DispatchStub`により実際の加算はAVX2へfallbackする。**CPU capabilityと、その演算の実dispatchを同じものとして扱った初回仮定が誤りだった。** 対応sourceの固定URLは[source-acquisition.json](source-acquisition.json)に記録した。

FP32の四段・ILP4・lane8の加算順、4096によるFP32除算を合わせる変更であり、FP64への演算精度変更やgate引上げではない。FP64は診断誤差集計だけに用いる。元model係数、Tokenizer、選択manifestの重みidentityを変更せず、巨大なText graph全体の再exportも行っていない。

## 入力・参照・比較結果

各入力とnormalized出力はfloat32 `[1,512,4096]`、2,097,152値、epsilon `1e-6`。meanとinverseは`[1,512,1]`、各512値。元source traceのblock17/18/19出力をそれぞれ入力し、既存weightの同一性も確認した。参照入力・weight・square/mean/inverse/normalized・診断graphのpath/bytes/hashは元reportに保存する。

改訂は元`329d…`で生成済みの3個のsource norm参照をそのまま使った。`sourceNormOperators:0`、`reusedSourceNormOperators:3`、`referenceExecutionSourceSha:329d…`である。参照をWASM候補へ合わせて再生成したとは扱わない。

| block | original normalized maxAbs | 初回AVX512仮定candidate normalized maxAbs | 改訂AVX2 candidate |
|---:|---:|---:|---|
| 18 | `1.5974044799804688e-5` | `4.76837158203125e-7` | mean/inverse/normalizedの全bit一致、maxAbs 0 |
| 19 | `1.1205673217773438e-5` | `4.76837158203125e-7` | mean/inverse/normalizedの全bit一致、maxAbs 0 |
| 20 | `1.4066696166992188e-5` | `4.76837158203125e-7` | mean/inverse/normalizedの全bit一致、maxAbs 0 |

squareも全caseで全bit一致した。初回candidateのmean不一致はblock18/19/20で297/300/323値であり、改善したことだけを正しい加算順の証明にはしない。改訂candidateは3caseともmean512、inverse512、normalized2,097,152の全値についてfinite・unequalElements0・maxAbs0を確認した。

両方のreportにある`passed:true`は局所診断harnessが完了したことを表す。初回の候補数値一致やText全体合格へ読み替えない。通常Textの最終gateと合法入力域の変更を、この資料から許可・実施したとは扱わない。

## session・process・資源

初回・改訂ともoriginal3 + candidate3の計6sessionを作成し、6sessionすべてrelease、Tensor dispose30、active session0。改訂のNode wallは`3.290879167 s`、親を含むharness wallは`5.945208035000178 s`、Node peak RSSは`255,516,672 B`、親peak RSSは`84,623,360 B`。それぞれ別processの測定であり、同時刻合算やText全24層の必要RAMへ換算しない。

改訂harnessの観測子はPID7336、終了後live0・zombie0・ownership error0。初回も最終live/zombie/errorは空。標本descendant観測は短命の未観測子を網羅しない。今回は独立した局所Node ORT WASM hostであり、browser Workerの取消・管理接続の検証ではない。

## 保存物と再現

[index.json](index.json)は配布する小reportのpath/bytes/SHA-256を列挙する。[payload-inventory.json](payload-inventory.json)は既存private tensor・診断graph75fileの記録hashと包装時statを区別する。75fileは包装時に存在・サイズを確認したが、今回大きいpayloadのhashを読み直したりGitへ複製したりしていない。payloadを配布済みだとする資料ではない。

固定通常API文書は[08b4 commitのAPI.md](https://github.com/Kushyameln01/kushyameln-works/blob/08b4d32d83c81124f2b3bf6f3e2692bcff44238c/docs/shared/inference/API.md)。実診断sourceは[同commitのnorm_reduction_probe.py](https://github.com/Kushyameln01/kushyameln-works/blob/08b4d32d83c81124f2b3bf6f3e2692bcff44238c/tools/inference/text-encoder/norm_reduction_probe.py)。元参照を再取得できる場合、次のretarget/nativeだけで局所診断を再現できる。source準備を繰り返さず、新しいprivate出力先を使う。取得確認だけならreport/hash照合で足り、演算を再実行する必要はない。

```sh
python tools/inference/text-encoder/norm_reduction_probe.py retarget \
  --reference /path/to/existing-329-source-norms \
  --bundle /path/to/unchanged-selected-text-bundle \
  --deps /path/to/existing-python-deps \
  --execution-source-sha 08b4d32d83c81124f2b3bf6f3e2692bcff44238c \
  --output /path/to/new-private-avx2-source

python tools/inference/text-encoder/norm_reduction_probe.py native \
  --reference /path/to/new-private-avx2-source \
  --execution-source-sha 08b4d32d83c81124f2b3bf6f3e2692bcff44238c \
  --output /path/to/new-private-avx2-native
```

独立参照が存在しない再現先で初回prepareを行うなら、固定`329d…`のsourceと元checkpoint/model/depsを別途取得する必要がある。先行の誤ったAVX512候補を現在の正本へ書き換えず、初回の参照生成と候補仮定を分けて保持する。

未受入は全24層の累積差、最終normalization後の全512有効ID出力、既存gateでのText全体合格、plain/ID管理運用、Diffusion consumerの全体運用、製品生成READY。局所3normの全bit一致でこれらを成功扱いしない。full24候補の結果は別reportで判定する。
