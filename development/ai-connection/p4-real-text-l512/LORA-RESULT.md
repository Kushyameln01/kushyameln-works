# 実L512＋canonical LoRAの限定受入

実Text L512、保存LOW3・N2/block0の入力に、実light/LOW LoRAのcross Q先頭4行×全5120列とbias4、
strength+1を適用した。LoRA担当のSDK/canonical adapterが完成させたF32を実ORT weight/Hike biasへ渡し、
独立Aのweight20,480値・bias4値、独立Bのlocal25+composed25・計31,854,592値が全て通過した。
coverageはPARTIAL、completeAdapter:falseのままである。

## 正本と境界

Diffusion実行sourceは `db5df292b21366ec385d92bb281b5f3ee74183c4`。
LoRA SDK/canonical/reference sourceは `a80db72feea60b9bd69e292e4716665c6f0ee77f`。
native APIはdiffusion-models/0.1、P4 profileはbaseと同じ
`bernini-block0-n2-cross-ffn-f32-candidate-v1`。base NNのsource994/参照source741と区別する。

選択原本は `Bernini-R_LightX2V_low_noise.safetensors`、1,244,141,856 B、SHA-256
`86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b`。
header SHAは `bd4e95892305560456676c8fc9a4545c27f4deb979f5d2b929b7be7df2d5d333`。
既存owner catalogのURLから選択1fileだけを取得し、actual browser Fileもwhole hashへ照合した。
Bernini baseの全file hashや他3LoRA原本の再downloadは行っていない。

55 owner sourceをGit blob/bytes/SHAへ照合し、HTTP overlayで21 executable sourceを提供可能とした。
実際のrequestはowner11＋Diffusion29の計40 source。55取得・21提供可能・11実行を混同しない。
LoRA名前空間は未登録URLへのfallbackを拒否する。P4 conditioning moduleのURLは本担当と共有し、
captureのWeakMap brandを保った。他担当のproduct fileを上書きせず、元source bytesを変更していない。

```text
不変FP8/F16 base → Hike復号・owned F32 provider
               → a80 SDKの低rank/alpha/strength/bias計算
               → native sinkのowned完成F32 → candidate
               → ORT runtime-input weight / Hike-parameter bias
```

元key/full shape・offset/count・binding種別・base/graph/registry/profileをcanonical adapterが照合する。
weightは`blocks.0.cross_attn.q.weight` full[5120,5120]、offset0/count20480。
biasは同 `.bias` full[5120]、offset0/count4。initializerに差し替えない。
元FP8のbits/固有scaleと完成F32を区別し、sink後に再scale・再decodeしない。
SDK planは2patchを選択し1050targetを除外した。全targetや二組同時合成を受入済みとしない。

## 独立参照と全値結果

独立Aはownerの`original_header/read_tensor/decode_fp8/merge_reference/bias_reference`をexact sourceでimportする。
BF16 DOWN[128,5120]・UP[4,128]、alpha128、diff_b4を読む。weightはNumPy binary64の元owner演算、
biasは元ownerのF32規則。Diffusion側で低rank積を重複実装していない。

独立BはAをF32へ丸めた疎patch、不変base、実L512、保存LOW3入力から元coreの全25cutを計算した。
native前に固定したmanifest SHAは `5fe895ce6f1673c49b9a60fbd79a6701b7e5dae8c3e26b13d9bf9c91d9b5706b`。
[pre-runtime freeze](LORA-PRE-RUNTIME-FREEZE.json) のSHAは
`43881ef034aaba2031680e5b3a88975e67fd57384fcf9d3eec9ffeeb228129c3`。
元controlled K4、旧Q16、base expected出力をLoRA後の期待値へ転用していない。

| 比較 | 全値数 | 失敗 | 最大絶対誤差 | 事前gate |
| --- | ---: | ---: | ---: | --- |
| SDK weight vs A F64 | 20,480 | 0 | 2.4756445782259107e-9 | abs1e-5/rel1e-4 |
| SDK bias vs A F32 | 4 | 0 | 0 | exact |
| B local25 | 15,927,296 | 0 | 5.340576171875e-5 | abs.001/rel.0001 |
| B composed25 | 15,927,296 | 0 | 5.340576171875e-5 | abs.01/rel.001 |
| composed blockOutput | 10,240（上行に含む） | 0 | 1.52587890625e-5 | abs.01/rel.001 |

local blockOutputはbit一致。local参照生成時に、事前Bの全25配列をbit一致で再現した。
事後gate変更は0。新LoRAを使ったNNはcandidate検証中の一回だけである。

**Aを丸めたF32とSDKの完成F32は別物として保持した。** 実weightのhashはA丸め値とは異なるが、
上記の独立A数値gate内である。independent patch JSON SHAは
`affd64f5f07bd6cd89fb9ba8bef485a58208d9052deb18fa04f3236e2808c5d0`、actual SDK patch JSON SHAは
`461b643ebcd7a481f6bec905f4b2e5d925593811c391b5f55f141f37817c9961`。
参照Bをactual SDKへ書き換えて合格させていない。

実消費bitsのproofは別工程で、不変baseの独立decodeへSDK完成bytesをoverlayして全29選択の期待hashを作る。
これは入力bytesの照合であり、低rank積やB数値参照の置換ではない。
全29の原storageと実消費F32が通過し、patched2選択とunpatched27選択を区別した。
[全値・消費proof](lora-reference/s1-local-receipt.json) / [実receipt](lora-integration/s1-browser.json)。

## 検証・切替・復帰・寿命

SDK prepare後にA全値gateを検査し、同じL512入力・独立B blockOutput・固定gateをnative candidateへ渡した。
candidate検証の実ORT/Hike出力を全25binaryとして保持し、SDK/nativeのvalid receiptからcommit epoch1へ進んだ。
全25の外側比較は後段の独立receiptで受け入れた。内部final-output検証と全25受入を同一視しない。

- selected完成F32は81,936 B。native sinkがSDK bufferからcopyし、prepareLoadは追加の数値copyを作らない。
- SDK prepared/source解放後もactive feedが同じ完成weight/biasを保持した。旧base leaseも不変。
- rollback epoch2でactive packageと選択weight/bias・未選択行を元baseへ復帰した。
- rollback後も既に取得したpatched leaseは旧LoRA bytesを保ち、base leaseはoriginal bytesを保持した。
- leaseを全解放するとknownPatchBytes・packages・transactions・candidates・inFlightは0。session/Tensorも0。
- 出力25配列は全owner解放後もhashを保持し、signed-zeroを含むnative bytesへ一致した。

**commit後・rollback後はNNを再実行していない。** その境界の受入はpackage/epochとbyte readbackであり、
active/復帰model再実行や実HIGH→LOWの証拠へ加算しない。
実LoRAの取消・検証失敗復帰・再適用・-1は今回のactual scope外。baseの実取消4probeやowner制御testと分ける。

## 実測資源

| 項目 | 実測 |
| --- | ---: |
| 数値stageのdistinct WASM容量 | 54,657,024 B（5 Memory） |
| うちowner LoRA workspace | 32MiB |
| ORT | 2 sessionが1個の16MiB Memoryを共有 |
| core stage | 146.1977s |
| wrapper stage | 146.9019s |
| browser全体（File hash/SDK/切替/復帰/export含む） | 167.3255s |
| sampled Chromium RSS process和peak | 1,198,710,784 B |
| sampled Chromium PSS process和peak | 922,116,096 B |
| cgroup current観測最大（環境全体） | 5,290,868,736 B |

native中のleaseは3（旧base、candidate view、stage）。commit時は旧base1、active view取得後2、
rollback後も2で旧bytesを保持し、最後に0へ戻った。package/candidate/active/leaseが同じ内側blockを
保持するため81,936 Bを参照数倍しない。rollback直後のactivePatchBytes0とretainedPatchBytes81,936も区別した。

全44704projection＋320score、linear snapshot26,825,525,760 B、bridge666930callの
logical zero-fill327,894,800,640 B、返却25配列63,709,184 Bはbaseと同じだった。
SDK書込のevidence copy81,936 B、native sink copy81,936 Bを別に記録する。
SDK内の全copy・allocator/GC live、File backing、全工程peakは未計測/null。sample1519回、最大gap約253msであり、
RSS/PSS/cgroupをallocator値や本番peakへ置き換えない。

[資源review](resources/lora-actual-resource-review.json) は50check成功。
独立数値/bytes review500checkとsource/procedure378checkも成功し、件数をNN回数へ合算していない。

## 未受入

他のstrength/選択行、HIGH side、他LoRA、全target、二組同時合成、任意Text/任意producer、
元workflowのpositive/negative/ordered context、元GPU precision、全block/最終head、実HIGH→LOW、
生成sample/VAE decode、全体資源予算、管理catalog採用/共同snapshotは未受入。
`load/predict/sample=NOT_READY`、generationReady:falseを維持し、merge・Pages公開は行わない。
