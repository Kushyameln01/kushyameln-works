# N2 O projection・chunk2 gate・自己注意残差の受入結果

2026-11-01 JST。branch `codex/diffusion-derived-hidden-heads`。開始時のremote最新は `caa521ca23d1e32b36775d0a913b0731962c5df4` と一致した。配布SHA・追加実行source・旧sourceと新成果のhashは [handoff.json](handoff.json) に置く。Page本文と元core取得の記録は [spec-acquisition.json](spec-acquisition.json)。

## 受入単位と元coreへの対応

**自然N2・block0・HIGH1／LOW3それぞれで、O projection→e[2] gate→元patchHiddenへの残差加算を一つの単位として受け入れた。** 実HIGH→LOW受渡しとは区別する。cross-attention・FFN・全block・本番生成は後続に残し、`load/predict/sample=NOT_READY` を維持する。

固定ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` の `comfy/ldm/wan/model.py` では、self_attn.forwardがattentionを `self.o` へ渡し、block.forwardは `torch.addcmul(x,y,repeat_e(e[2],x))` を実行する。このxはmodulate前のblock入力であり、本profileでは保存済み `patchHidden`。post-modulation hiddenを残差元にしない。元本文・行・hashは [SOURCE-CONTRACT.md](core/SOURCE-CONTRACT.md) に対応付けた。

```text
o              = attention @ W_o.T + bias_o
gateProjection = timeAct1 @ W_time[10240:15360].T + bias_time[10240:15360]
gate           = f32(modulation_chunk2 + gateProjection)
gated          = f32(o * gate)                 # 5120-vectorを2tokenへbroadcast
residual       = f32(patchHidden + gated)      # post-modulation hiddenは使用しない
```

gateにscale+1を加えない。Hikeで乗算と加算を別のF32命令として実装した。元Torch/GPU addcmulのfused precision一致は未受入である。出力はLC `[2,5120]` の自己注意後token hiddenであり、生成latentやVAE posterior meanではない。

## 既存artifactの再利用と不足分

| データ | 確認・対応 |
| --- | --- |
| `patchHidden` | 元fullprefix actual artifactに10240 F32あり。元receiptのstage hashへpinして再利用 |
| `timeAct1` | 同artifactに5120 F32あり。time embedding/SiLUを再計算せず再利用 |
| time projection | 元artifactの10240値はchunks0/1のみ。chunk2へ読み替えず、rows10240..15359だけを追加計算 |
| modulation | 元prefix選択はchunks0/1。chunk2のelement10240..15359だけを追加取得 |
| 実attention出力 | 既存publicはhash、private head配列は独立参照で、実出力artifactはなかった。旧N2 downstreamのみ各side一度再実行して実contextを保存 |

旧prefixの完全SHAはHIGH `4493d93b56f434b6292da1c9898dd30b474444073796a10e25788d5c71a65a52`、LOW `1b2808f5ee1185db85cba4e2c59c030fd45d6e3c83c9fde457e70c7d1545d797`。配列bits、side/block/timestep、旧receiptを外側で検査する。新actual context bitsも既存受入のhashと完全一致した。独立referenceをactual inputとして渡していない。

captureでは旧ownerをdisposeしbrowserを閉じてから、別realmのtailを構築した。prefix全体・timeAct1・既存chunks0/1は再計算していない。旧数値moduleとreceiptは不変。変更した旧assetはbuild閉包generator/生成build-ID等の明示metadataであり、旧98packageの固定commit照合・現在の旧数値source照合・新100source閉包を区別する。

## 実重み・取得範囲・binding

| 元key | 元fullshape / storage | 今回の選択・実consumer |
| --- | --- | --- |
| `blocks.0.self_attn.o.weight` | `[5120,5120]` FP8 E4M3FN | O固有scalar F32 scale/configを照合。16rowずつHike復号しowned F32をORT runtime-inputへ |
| `blocks.0.self_attn.o.bias` | `[5120]` F16 | Hike decode/bias。hike-parameter |
| `time_projection.1.weight` | `[30720,5120]` F16 | rows `[10240,15360)`。元fullshapeを保持し、owned F32 tileをORT runtime-inputへ |
| `time_projection.1.bias` | `[30720]` F16 | elements `[10240,15360)`。hike-parameter |
| `blocks.0.modulation` | `[1,6,5120]` F16 | flat elements `[10240,15360)`。Hike gateへのparameter |

元header・key・dtype・range・O自身のscale/profile・raw/F32 hashを確認した。[inventory](core/high-inventory.json) とside別receiptに原本識別とoffsetを保持する。initializerではなくruntime-input/hike-parameterであり、LoRA低rank積やconsumer mappingを追加していない。fullmodel hashは既存受領receiptを再利用し、今回31GB pairを再hashしていない。

選択parameter payloadは各side78,673,920B、O scale/config31B、header/prefix181,288B。最大weight read163,840B、decoded tile327,680B。全O matrixやtime projection314MBを一括residentにせず、必要行だけ読む。ファイル分割やこのLinearの成立を全graph成立とは扱わない。

## 事前gate・独立参照・全値比較

新tail出力の観測前に [candidate-plan.json](core/candidate-plan.json) を固定した。SHA256は `58a7a187d9580cd5af1d12e4d9552f8880a47c8a89e50b7bf1d27fec4ff11549`。

| 比較対象 | 事前gate |
| --- | --- |
| parameter復号・選択範囲 | raw/F32 byte hash完全一致 |
| local O | abs1e-4＋rel1e-5 |
| local gateProjection / gate / gated / residual | abs1e-3＋rel1e-4 |
| independent-prefix composed O / gated / residual | abs1e-2＋rel1e-3 |

全要素を `abs(actual-reference)<=absolute+relative*abs(reference)` で比較し、非有限値を拒否した。local oracleは実context・実patchHidden・実timeAct1の同一bitsを入力とし、独立decoder/NumPy dotと明示F32 pointwiseで求める。composed oracleは別の独立prefix/head参照を入力とする。元参照receiptも固定SHAに束縛し、自己整合した差替えを拒否する。

| 結果 | HIGH1 | LOW3 |
| --- | ---: | ---: |
| all-value comparisons / 要素数 | 8 / 71,680 | 8 / 71,680 |
| gate逸脱 / 非有限値 | 0 / 0 | 0 / 0 |
| local residual 最大絶対誤差 | 5.340576171875e-5 | 1.1444091796875e-5 |
| composed residual 最大絶対誤差 | 2.288818359375e-5 | 1.71661376953125e-5 |
| strict parameter checks | 7 PASS | 7 PASS |

合計143,360比較値がgate内。O・gate・残差を一括受入し、片方sideの成功をもう片方の受入へ流用しない。各stageの最大誤差/hash・lifecycle・sourceは [integration結果](integration/RESULT.md) と [summary](integration/summary.json) に記録した。

受入済み5出力を後続で再計算せず使えるよう、別sourceでtail単体を一度ずつ保存replayし、全5配列のF32 hashが受入結果と完全一致した場合だけ非公開artifactへ保存した。JSON往復後もPythonでbits一致を再確認した。HIGH artifact SHA256は `5040656cf0bf6bd9f06bbf007b16d22ae026a25a5080d666758e0b52a10e86bd`、LOWは `714d96b41cb9e5ba8349b4a9202722f2f94e3fdeeaa984dbc1850b449190d37d`。`arrays.residual`を次工程へ渡せる。これは新たな数値受入・資源測定ではなく、旧受入source/receipt/metricsを変更していない。[保存receiptと再現](output-export/RESULT.md) を参照。

## 所有権・取消／解放・資源

新owner/APIは [README](../../../docs/shared/diffusion-models/ort-bridge/self-attention-tail/README.md) を参照。compact・非sharedの入力をawait前にintrinsicなowned F32へcopyし、typed-array subclassのvirtual slice/metadataでcaller aliasを残さない。BUSYをgetter前に取得する。取消後はPromise終端を待ち、結果を採用せずnative Tensorを解放する。解放失敗ではhandleを保持して再利用を止め、recoverで解放を再試行する。返却5配列はcaller所有でdispose後も保持できる。

両sideで残差basis差替え、誤side/time/artifact、shape/nonfinite/range、再入、最初の実weight tileでの取消、取消後再利用、caller即時変更、dispose後出力保持を確認した。別の実ORT境界試験ではTensor解放失敗・sessionの同期/非同期解放失敗とrecoverを確認した。

| tail単体の観測 | 各side |
| --- | ---: |
| Hike Memory / identity | 2,883,584B / 2 |
| 内訳decode / 新pointwise | 1,572,864B / 1,310,720B |
| ORT線形Memory容量・high-water / identity | 16,777,216B / 1 |
| active ORT session | 実行中1、dispose後0 |
| caller-owned返却出力 | 163,840B |
| 完了runのlinear input snapshot交通量 | 229,376,000B（累積） |

旧attention realmを閉じた後のtail単体測定であり、同realmの旧新combined peakではない。named host spansとcopy累積を加算して総peakと扱わない。allocator live・JS/GC/File/reference・OS peakはnull。計測器のfingerprint/Response copy overheadも別に扱う。post-disposeの物理Memory回収と論理owner解放を区別し、observer復元も確認した。

## 配布・実行source・検証・再現

新profileは `bernini-block0-n2-self-attention-residual-f32-v1`。新Hike kernelは4018B、SHA256 `54c1690e4581a1de0b231d0b538ff280696542c2eb44ebedb4c2c661a6dd3925`、importなし、ABI `GateResidual`。source/host/compiler/WAT/WASM/ABI/build recordを固定した。共通catalogへ旧N2の受入scopeを後付けで拡大していない。

新buildは `diffusion-models/0.1+bba4dc740028dcecf849a36e395970b24358a6185378336d61d3a063ad72bc74`、100source・33 runtime import・35 kernel digest検査。captureの30実行sourceはarchive aliasを含め取得可能にし、tailの24実行source・4snapshotと別に記録する。native API版は `diffusion-models/0.1` のままで、独立ES入口を追加し、新RPC opは追加していない。

新規検証は独立参照11、runtime13、harness Python5/Node3のfocused32試験、実native所有権browser9case、各side全8比較＋13境界。新buildで既存native Worker/MessagePort22caseも再実行PASS。source/hash検査やunit test件数をNN全体の受入件数へ加算しない。

実行手順は [core/REPRODUCE.md](core/REPRODUCE.md)、[integration/REPRODUCE.md](integration/REPRODUCE.md)。固定入力・事前gate・private artifactの必要条件、outputの取得/hash、元source・今回sourceを分けている。公開code/hash/metricsと私的weight/activation配列を混同せず、private payloadをGitやHTTPへ置かない。

## 未受入

cross-attention・FFN・全block・全timestep、本番81frame/context/noise、元production/fused precision、実HIGH→LOW handoff、生成latent/sample・VAE decode、任意N2入力・任意LoRAと全工程のMemory/staging/copy/time予算は未受入。このN2自己注意残差単位の成功から `load/predict/sample` を解除しない。merge・Pages公開・重い全model推論は実施しない。
