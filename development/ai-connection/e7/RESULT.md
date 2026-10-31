# E7: Q出力行tile化、一候補の実shape検証

2026-10-31 JST。接続検証と本番実装の実行計画0.2-draft.1 §E7、総合接続仕様1.1-draft.1 §7/11/18/19に基づくDiffusion担当の一候補。対象は実LOWの **`blocks.0.self_attn.q.weight [5120,5120]` とbias[5120]**。明示activation `[1,5120]` に対する全5120出力を16行×320tileで得る。単一tokenのLinear境界だけであり、元の本番token数を1へ変更した生成ではない。

**判定:** この宣言したF32診断境界は **adopt**。元FP8計算precisionと本番token/profileでの採用は **unverified**。attention等の全必須境界・組合せ資源予算が未成立のため **E8はblocked、load/predict/sampleはNOT_READY**。Linear一部分の成功で予測へ進まない。

## 出典・方式

固定core ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` の `comfy/ldm/wan/model.py:55` はQをdim→dim Linear、`:73` はその後にnorm_qを実行する。保存実modelのdimは5120。今回の境界は **norm_qより前**。K/V、RoPE、softmax、attention、o、FFN、残差は含めない。

元LOW full SHAは既存保持manifestの `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` を再利用する。今回新たに全15.57GBをhashしたとはしない。実File header/size、actual27byte `comfy_quant`、F32 scalar scale、full Q/biasのshapeと保存dtypeを検査している。providerの `fullFileSHA256Verified:false` を保持する。

```text
immutable File: Q F8_E4M3 full[5120,5120]
  ↓ read16 consecutive full-column rows (81,920 bytes)
provider Hike: E4M3FN decode × scalarF32 → ownedF32[16,5120]
  ↓ bounded runtime-input weight feed
ORT WASM1.24.3: Gemm(x[1,5120],weight[16,5120],transB=1)
  ↓ F32 projection[16]
stage Hike: +actual original F16→F32 bias[16]
  ↓ owned output16; append into result5120
repeat320 row tiles, one ORT session and fixed two Hike workspaces
```

F16 bias5120個は初期化時に実HikeでF32へ変換して20,480bytesだけcacheする。元Qの26,214,400bytes全体をhost/WASMへ常駐させない。L1の16行固定registryを変更・偽装拡張せず、独立した `bernini-tiled-linear/0.1` 契約を提供した。既存stage/Hike/kernel/API/pointwise上限は変更していない。

## precisionと独立期待値

保存はE4M3FN＋weight単位scalar F32 scale、biasはF16。runtimeは実HikeでF32復号/scale、ORT F32 Gemm、実Hike F32 bias。Linearにepsilonはなく、norm_qのepsilon/数値処理は未実装境界として残す。

独立Python/NumPy参照は1tileずつ独自FP8 lookup→scale F32丸め→F64 dot累積→F32投影→F32 biasとした。Hike/ORTコードや出力から期待値を作っていない。activationは `x[i]=float32(((i%31)-15)/64)`。全5120期待値とtile別raw/F32 weight/bias hashをreference.jsonへ保存した。HIGHはこの一候補の試験では未実行。

比較前にgateを **`absError <= 1e-4 + 1e-5*abs(expected)`** と固定し、実行結果から緩和していない。これは宣言したF32診断profileの比較であり、元FP8 scaled_mm・activation量子化・元plugin版との同等性を認定しない。

## 実行結果

実Chromium154.0.8037.57、ORT1.24.3、既存Hike kernel `ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd`。

- 小16行: `ONE_TOKEN_SELECTED_Q_ROWS`、独立期待値と比較。
- 全5120行: `ONE_TOKEN_FULL_Q_ROWS`、320tile、全5120値を比較して失敗0。最大絶対誤差 **4.0046870708465576e-7**。最大相対誤差0.0032248はnear-zero出力を含む値で、採否は上記combined gateによる。
- activationはasync前に所有copyへ固定。実行途中でcaller配列を999へ変更しても出力を変えず、caller配列をdetachしない。
- 並行runとactive disposeを拒否。tile1完了時のsignal取消を観測し、以後tileを読まず結果を拒否。取消後の小runが再成功する。
- 不正activation shape/非有限、rowsが16の倍数でない値・範囲外を拒否。
- ORT session作成は1回、provider/stageそれぞれのHike Memoryは全320tileで固定。
- REDはmissingfactory、追加REDは小行scope誤表示とstats metadataの外部変更を再現。statsはprivate metadataの所有copyを返す。GREENは実browser3scope case。source receipts、reference bytes/hash、node syntaxを照合済み。

全row実行の時間は **2,668.6ms**（File read303.8ms、Hike復号2,053.9ms、stage309.7ms、初期activation copy/output allocationを含む）。constructorと小/取消/回帰を含むbrowser全試験wallは3.124s。冷warm比較、CPU負荷目標、利用者端末の待ち時間保証ではない。

## 最大live量とcopyを分けた算定

| 対象 | bytes |
| --- | ---: |
| callerX / ownedX / fullOutput / cachedF32bias 各1本 | 20,480 |
| raw weight tile | 81,920 |
| provider F32 weight / stage owned F32 weight 各1本 | 327,680 |
| stage owned activation | 20,480 |
| tile bias / stage bias / ORT output / Hike output 各1本 | 64 |
| 上記の既知数値配列logical live合計 | **839,936** |
| provider Hike Memory / stage Hike Memory 各1個 | 1,572,864 |
| 既知数値配列＋2 Hike Memory | **3,985,664** |

この表は名前を付けた数値bufferのlogical live boundである。JS metadata/参照fixture/wasm bytes・compile、ORT Memory/allocator、他caller配列、GC未回収領域、FileのOS cacheを含む総JS/RSS上限ではない。古いtileはalgorithm上保持しないが、GC/OSへ即時返却する保証もしない。ORT内部総Memoryは公開APIから未測定のためnull。

full runのweight File I/Oは **26,214,400bytes**。initializationのheader/config/scale/biasを含む独立参照読出量は26,405,959bytes。managed copiesは **242,626,560bytes**（初期X20,480＋各tile758,144）。別にORT logical input boundaryは111,411,200bytes、output boundaryは20,480bytes。論理搬送量とORT内部での追加copy/arenaは別。trafficと同時live量を足し合わせてピークとしない。

OS観測は、自分が起動したChromium子孫だけを約20ms間隔、100sampleで集計した。baseline PSS263,652,352bytes、観測peak PSS **422,010,880bytes**。RSS process合計peak698,167,296bytesはshared pageを重複計上し得る。PSSはconstructor・全case・renderer/runtime/test harnessを含むこの条件の観測ピークであり、ORT allocator単独や本番pipelineのピークではない。他担当browser/processは合算していない。

## 採用範囲、残る阻害、次の観測

このone-token full-Q row16境界は、宣言したdtype・固定activation・記録環境で容量内かつ参照gate内として採用できる。**full modelの実行単位採用ではない。** 同じ実装をtoken毎に繰返す場合は26MB再読と320回dispatchを毎token負担する。元target32,760tokens・contextを処理するgraph/weight reuse、全tokenの時間、残差/KV/attention/FFN、旧新session・package・copyを組み合わせたlive量は未実装/未検証である。

次候補へ進む前に、元compute policyと適用profileを固定し、token batchingによるweight reuseまたはstream attentionのいずれか一境界を別契約で選び、その全出力と必要Memory/staging/copyを比較する観測が必要。本候補の成功をattention成立、predict ready、元scaled_mm同等、利用者負荷改善へ昇格しない。新attention候補は今回自動着手していない。

## 変更と再現

新runtimeは `docs/shared/diffusion-models/ort-bridge/tiled-q.mjs`。新testは `tiled-q-cases.mjs`、toolsの `e7-reference.py` と `e7-browser.py`。root担当のnative build-info閉包へ新runtimeを追加する。生成build情報をこのタスクで手書きしていない。

```sh
python tools/diffusion-models/e7-reference.py --models <original-model-dir> --side LOW --output development/ai-connection/e7/reference.json
python tools/diffusion-models/e7-browser.py --model <original-model-dir>/Bernini_LOW_fp8_e4m3fn_scaled.safetensors --reference development/ai-connection/e7/reference.json --output development/ai-connection/e7/green.json
```

metadataは `decision.json`、実browserは `green.json`、固定独立参照は `reference.json`。元File bytes・実weightは配布しない。commit/push/公開/full NNは本担当で実施していない。
