# 884追加試験と新P4 LoRA adapter

2026-11-02 JST。新P4は **`PASS_LORA_P4_REAL_PARTIAL`**。選択した実light/LOW Fileと真正LOW baseを、LoRA ownerの新正本adapterからDiffusionの実P4 operatorへ接続した。7成功caseと検証失敗・取消・復帰・不変base復帰を確認した。coverageはPARTIAL、生成READYはfalseのまま。

管理884では実output16のE4保存・fresh読戻し、package改変・snapshot欠落のreader拒否、expected改変のnative prepare前拒否が成立した。**output16 packageの正式再import→native prepare入口は884と調査した管理5aaにはなく、その入口の受入は管理依存で未成立**。reader拒否をこの経路の合格へ読み替えない。

## 配布と実行source

この文書・[全配布manifest](DELIVERY-MANIFEST.json)を取得した完全Git commitが配布SHA。実行sourceは以下で固定し、最終配布の証拠追加commitへ付け替えない。

| 使用物 | 完全commit |
| --- | --- |
| 新LoRA SDK/planner/P4 adapter・実browser host・独立oracle wrapper | `a80db72feea60b9bd69e292e4716665c6f0ee77f` |
| 実P4 registry/provider/sink/consumer/stage・独立Python forward core | `7ee36228030ba3bb544a90b1d4b528702a7bae32` |
| 新P4試験の外側管理invocation queue | `8849891f19124df31847bd691503c2491278eaa8` |
| 別実行の管理884 output16 runner | `8849891f19124df31847bd691503c2491278eaa8` |
| 上記884試験が使う旧Q16 LoRA / Diffusion | `fc2789a0f649e33f15eb13750e6a983b5c52d170` / `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` |
| 884試験のowner DATA / E4 codec | `82b21f09cb63926543181b16f0e97ebc6b9fa6be` / `2bdca59ea78580d4fe7a9d31a8de33209b64d029` |

[固定sourceのP4 API](https://github.com/Kushyameln01/kushyameln-works/blob/a80db72feea60b9bd69e292e4716665c6f0ee77f/docs/shared/inference/lora/P4-API.md)は18,731 bytes / SHA-256 `a13d62a861c8453f6cb0153b517948f28dcd83078538bcfc903053d049b9def2`。GitHub本文の取得でも同bytes/hash・Git blob `22166c5685e99f6ef3e3f2f297dca9dbec3dc7e6`を確認した。これは配布元の取得検証で、相手担当本人のACKとは別。

実hostは40 loaded source、42 preverified sourceをGit blob/bytes/SHA-256へ結合した。重複を独立件数へ加算しない。[sources.json](evidence/sources.json)と完全receiptに全pathがある。独立oracleは固定7ee build manifest自身と50 source closureも照合した。

## API差分と正本

- 新 `diffusion-p4-adapter.mjs` / `diffusion-p4-registry.mjs`。版 `lora-diffusion-p4-adapter/0.1-draft.1`。native `bernini-p4-f32-feed-registry/0.1`とLoRA `lora-connection/2.0-draft.1`を明示対応する。mappingはLoRA ownerだけが所有し、旧管理bridgeを重ねない。
- 既存 `planner-v2.mjs` / `sdk-v2.mjs`へ省略可能な `target.blockLimits`、版 `lora-block-limits/0.1-draft.1`を追加。元full要素座標・全列・maxRows/maxElementsを維持し、FFN-downは全13824入力列・1回max4行。省略時の旧registry/plan/manifest構造とidentityを保持する。
- adapterは `createSink / targetForPlan / finalize / restoreBase / run / describeBinding` と実base providerを提供する。runtime-inputのnameは元program slot、ORT graphInputだけ`weight`。biasはhike-parameter。initializerへ詰め替えない。native scope付きvalidateをSDK v2へ対応し、boolean validateのv1と混同しない。
- 原本BF16/F16/F32の既存Hike decode、低rank積、alpha/strength、diff/diff_bを再利用する。未知variantや不明倍率を既定で通さない。固定loaderだけのalpha省略規約を全形式へ一般化しない。FP8 baseの復号は固定Diffusion providerの責務で、汎用の量子化base対応を宣言しない。
- conditioningはnativeの同期brand付きcloneを使う。adapter0.1はplain finite acyclic JSON metadataだけを受け、rich/typed/cyclic metadataを明示拒否する。

旧Q16 adapter、SDK v1、kernel5051 bytesは変更していない。PARTIAL/runtime-inputをinitializer・FULL限定v1へ偽装せず拒否する。[P4 API](../../../docs/shared/inference/lora/P4-API.md)にdefault12＋optional4 slotのfull shape、storage/compute、実operator bindingと全APIを記載した。

[版付きP4接続契約](../../lora/contracts/p4-connection-contract-0.1.json)は既存v2契約・inventory・loader・SDK/planner・両registryを固定commit/path/bytes/hashへ結合する。旧A0/L1契約の歴史statusを上書きせず、今回の実証scopeと未採用範囲を別のcompanion契約として記録した。

## 実File・base・PARTIAL範囲

| 項目 | 今回の固定値 |
| --- | --- |
| 選択 | pairId `light` / side `LOW`、単一組の片side診断 |
| LoRA File | Bernini-R_LightX2V_low_noise.safetensors、1,244,141,856 bytes |
| 原本SHA-256 | `86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b` |
| base | Bernini_LOW_fp8_e4m3fn_scaled.safetensors、15,574,833,216 bytes |
| base歴史全体SHA-256 | `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` |
| loader | `comfy-lora-b5a4321-linear-diff-v1`、固定ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4 |
| weight | `diffusion_model.blocks.0.cross_attn.q.weight`、linear-down-up、BF16、rank128・alpha128 |
| 明示bias | `diffusion_model.blocks.0.cross_attn.q.diff_b`、additive-diff-b、BF16 |
| full shape / 選択 | W `[5120,5120]` → rows `[0,4)`・全5120列、bias `[5120]` → `[0,4)` |
| storage → compute/output | W F8_E4M3＋自身のscalar scale/config、bias F16 → F32 row-major |
| 倍率・宣言範囲 | W `strength*128/128`、bias `strength*diff_b`。試験宣言 `[-1,1]`、使用0/+1/−1 |
| 実consumer | P4 block0 cross-attention/FFN、matrixは実ORT `weight` feed、biasは実Hike AddBias |

原本1052 logical patchのうち2つの部分領域だけを含む。1050 targetと、選択2 patchの残り5116行を明示除外し、未選択範囲は不変baseのpass-throughとする。[実scope](evidence/actual/initial-one-scope.json)、両registryと原本rangeは[RESULT.json](RESULT.json)と完全receiptにある。filenameやshape一致だけでbase適合を認定していない。

入力はブラウザへローカルFileとして選択した。選択LoRAの新loadでheader/rangeと全体hashを検査し、同一immutable File内だけでhashをcacheした。他3 LoRA原本の取得・全hashは要求していない。保持baseの既存取得receiptとsize/mtimeNs/dev/inoの一致を再利用し、fresh header・実rangeを検査した。base全体hashの再計算は0であり、歴史hashを今回の再認証と称しない。前後の入力File/statとoracle全file identityは不変だった。

## 独立参照と数値結果

scopeは **`controlled-caller-input-n2-k4`**。residual `[2,5120]` は `((i%17)-8)/128`、timeAct1 `[5120]`は `((i%13)-6)/256`。固定公開dyadic K4 conditioning `[1,4,4096]`とmask `[1,1,0,1]`を使う。自然P2/N2 producer・schedule・実Text入力の受入は主張しない。producerAuthenticated=false。

Aは独立storage decode＋NumPy binary64低rank積、biasは固定loaderのF32演算を独立実装。Bは固定7ee Python coreへA由来のF32 patchを渡し10240 expectedを作る。SDK/Hike prepared値から期待値を作っていない。期待patchと実prepared patchのhashを別に保持し、bit差を数値gateで比較した。

事前gateはweight `abs1e-5+rel1e-4*abs(ref)`、bias完全一致、P4 output `abs.01+rel.001*abs(ref)`、gate ID `p4-cross-ffn-composed-f32-v1`。原本計算前に固定し、結果後に緩めていない。

| 成功case | strength | 管理revision | SDK input/application | native epoch | W最大絶対誤差 | 10240出力最大絶対誤差 |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| initial-zero | 0 | 3001 | 1 / 1 | 1 | 0 | 6.079673767089844e-6 |
| initial-one | 1 | 3002 | 2 / 2 | 2 | 2.4756445782259107e-9 | 3.2186508178710938e-6 |
| initial-negative | −1 | 3003 | 3 / 3 | 3 | 2.4756445782259107e-9 | 3.337860107421875e-6 |
| reapply-one | 1 | 3004 | 4 / 4 | 4 | 2.4756445782259107e-9 | 3.2186508178710938e-6 |
| validation-recovery | 1 | 3006 | 6 / 6 | 5 | 2.4756445782259107e-9 | 3.2186508178710938e-6 |
| prepare-cancel-recovery | 1 | 3008 | 9 / 9 | 6 | 2.4756445782259107e-9 | 3.2186508178710938e-6 |
| native-cancel-recovery | 1 | 3010 | 12 / 12 | 7 | 2.4756445782259107e-9 | 3.2186508178710938e-6 |

独立保存証拠監査は[source/artifact/output399項目＋phase/lifetime/resource76項目](evidence/independent-readback.md)がPASS。保存activationを独立Bへ全値再比較し、7成功case＋別base復帰で81,920出力・失敗0だった。weight/biasは全件比較receipt・hash・実operator到達を照合し、再LoRA演算をしていない。

成功case合計143,360 weights・28 bias・71,680 outputsが合格。bias誤差0、gate超過0。各prepared blockのSHAが実operatorのtile/patch provenanceに存在し、active outputのpackage/epochも一致した。+1の全再適用はweight/output hashが初回+1と一致し、適用済み重みへの加算をしていない。

0との差は+1で10235要素・最大0.0004372596740722656、−1で10240要素・最大0.0004425048828125。これは固定P4演算への寄与であり、生成画像への寄与ではない。全出力binaryと独立Bの出力を[evidence](evidence/)へ含め、[完全receipt](evidence/run-result.json.gz)をlosslessで保持した。原本・base・prepared weight/biasの配列はGitへ含めない。

完全receiptは展開35,805,981 bytes / SHA-256 `f07081581e46d8252c207fd945f676b888bf35dbca888bd03a019dfd56bdb6b0`、gzip881,221 bytes / SHA-256 `8b01ef4b5fc8190a07c4a4737e1707f9573235017c7cbf463be1509b0f95a7dc`。[RAW-RECEIPT.json](evidence/RAW-RECEIPT.json)にlossless同一性とmetadata scanを記録した。

## 取引・取消・所有権

- validation負例はresidual先頭だけ+1024し、独立expected/gateを保持。実native run完了、native receipt `valid:false` / failedValues>0、SDK plan/source/両registry/referenceの一致を必須確認した。任意の実行エラーだけで合格にはしない。旧epoch4/feedを維持した。
- prepare最初のwrite後と、実cross-Q native read後の2箇所で元queue targetを取消。両方でstopConfirmed/originalTerminal/resourceReleased/reusable=true、quarantined=false。旧feed/epochを維持し、後続+1で復帰した。取消はbounded Hike/ORT呼出し後の協調停止であり瞬時停止ではない。
- SDK tuple、管理queue revision/owner/resource generation、native epochは別namespace。上表の9/12を共通snapshot revisionへ読み替えない。管理P4 snapshot公開はしていない。
- native sinkが私有copyしたF32 bytesをpackage/candidate/activeが保持する。prepareLoadで二度目の数値copyをしたとは報告しない。各成功caseでprepared/candidate/packageを解放した後も、activeの81936 bytesが実runに使われた。
- 強度0 sparse feedの旧read leaseを+1 commit跨ぎで保持し、baseと同じbytesが不変だった。epoch0の空immutable-base feed leaseの試験ではない。native内部read leaseとSDK active所有権leaseは別で、今回のSDK実所有権はindependent-copy。
- LoRA source capabilityのread/hashを禁止した後も、実active出力hashは不変。base sourceは未選択範囲に必要な間はcallerが保持する。
- SDK instance自体はbase復帰後の最終cleanupでdisposeした。その後のrunは未試験であり、prepared解放やLoRA File能力の解放と混同しない。
- 不変baseからprepareBase→独立B検証→commit。管理revision3011/native epoch8で10240出力を別比較し、最大誤差6.079673767089844e-6、active/retained/pending patch bytes0、transaction/package/candidate/readLease/inFlightすべて0。dispose後も0、epoch9は終了による失効であって9件目のcommitではない。

実browser試行1、SDK prepare10取引（成功7・数値失敗1・取消2）、base復帰1は別。native forward呼出し20のうち完了19・取消1。これらを20個の独立受入caseへ加算しない。

## 検証と証拠の再利用

新境界のNode30件、関連SDK/planner/v1を含む重複ありNode67件、独立参照の合成14件がPASS・skip0。adapter制御fixtureは実Hike/native feed＋合成base/fake forwardであり、実File試験の代用ではない。

独立oracleの生成本試行1は12.742143663秒、25 files/2,852,228 bytes。各強度のforward参照は原本524,671,171 bytesを範囲読取した。`/usr/bin/time`未配置で最初の計測launcherが起動前exit127となり、oracleプロセス・原本readは0。source不変のstdlib subprocess/resource計測へ切替え、その起動前失敗と生成本試行を別記録にした。

旧配布dd95、実行28f44c3a1b71bef59e2d018a0db736de6d84675c、管理60d16b64d6020d3d20239f087f8add91268dcaadのlight/HIGH Q16 PARTIAL6caseは元source/scopeで保持。受入済みP2、固定catalog6dae、既存原本inventory/全hash、kernel5051の証拠を再利用し、新P4合格へ付け替えない。

## 管理884の追加成果

[別RESULT](manager-884/RESULT.md)と[別再現手順](manager-884/REPRODUCE.md)にsource・試行数を分離した。新固定884 run2は6公開、7prepare/stage（6＋checkpoint取消）、base復帰1。run1はcodec Git object未取得でnative0、同じ固定source取得後のrun2と混同しない。既存期待値の再生成0。独立監査152項目PASS。

initial-one output16のE4保存・fresh読戻しと、改変ASSET_HASH_MISMATCH／snapshot欠落REQUIRED_ASSET_MISSINGのreader拒否を確認。expected改変はNORM_REFERENCE_PAYLOAD_MISMATCHで実native prepare前・queueなし。前者2件の正式再import→prepare経路は未実装で、[境界追補](manager-884/E4-PREPARE-BOUNDARY.md)に管理5aa原文の取得結果と依存を記載した。

[実output16 package](manager-884/e4-output16/DELIVERY.json)は元8 files/32,171 bytesの同bytes copyを最終配布に追加。固定884 reader/2bd codecで配布copyもfresh disk readback complete、output64 bytesとsnapshot結合が一致した。原本や重み配列は含まない。a80時点の旧manifest/RESULTの「binaryを含めない」は元配布状態の記録として保持し、この追加配布を別manifestで明示している。reader再確認にNN・再export・新prepareは含まない。

## 資源実測

| 観測 | 値・限定scope |
| --- | --- |
| 実host経過 | 1,321,937.759ms（約22.03分） |
| Node＋所有Chromium treeのsample RSS和peak | 1,472,950,272 bytes、500ms間隔、2641 samples |
| 測定状態 | PARTIAL_SAMPLED_OBSERVATION。VmRSS unavailable2件・不完全sample1件 |
| Node resourceUsage maxRSS | 648,708,096 bytes（最終receipt serialization/write前の観測窓） |
| 独立oracle child maxRSS | 49,938,432 bytes、native/browser/全工程peakではない |
| P4 decoded/raw weight最大tile | 327,680 / 163,840 bytes |
| P4 Hike capacity | source1,572,864、math1,638,400、attention1,114,112 bytes（当該stage観測） |
| P4 known retained numeric bytes | 1,561,436 bytes、ORT allocator等を除く限定内訳 |
| P4 linear input snapshot traffic | 1,811,538,240 bytes / 完了run、累積copy trafficでpeakではない |
| native source全試行read bytes | 10,060,237,075 bytes、streamingの累積で同時保持量ではない |

RSS和はshared pageを重複計上し得て、500ms未満のpeak・startup・一部終了processを捕捉しない。Native/ORT allocator・GC・device・全工程の厳密peakはnullのまま。[全receipt](evidence/run-result.json.gz)には各stageのbefore/after/dispose、WASM容量、copy traffic、RSSの全samplesと留保がある。LoRA32MiB workspaceは固定SDK/kernel容量であり、このsample値へ別途加算して新peakを捏造しない。

実harnessのconsole接頭辞とhost filterに不一致があり、events=[]を時系列progress証拠へ引用しない。queue target・runtime call・実receipt・保存artifactから試験を照合した。数値・資源samplingの経路は別である。

## 未受入事項と受け渡し

管理P4 profile/catalog/三段階hook/snapshotへの正式採用、E4 output16の正式再import→prepare入口、他pair/side・他slice・全target、自然P2/N2・実Text L512・本番shape/precision、SDK active lease所有権、rich conditioning metadata、全model session・生成寄与は未受入。二組同時合成やmean APIは追加していない。管理のload/predict/sample=NOT_READY、generationReady:falseを維持する。

管理PR7とDiffusion PR14へ固定source/API/bytes/hashを配送し、a80の本人取得ACKを両担当から受領した。[ACK原文・取得receipt](evidence/recipient-acks/ACKS.json)に固定している。Diffusionは55公開fileの取得・互換性・制御30＋14件の合格を返したが、実L512数値受入とは別。管理は返却9e9b3ad4258a7f91542e7c74ab1011b1b13921edでP3追加3条件を186/186 verifierにより限定受入し、P4は候補取得・未採用とした。同返却のRESULT/ACQUISITION/ACCEPTANCE/REPRODUCE全4本文をGit blob/bytes/SHA-256へ一致させて受領した。今回の実P4数値結果packetの対向読戻し・管理P4採用は別途待機で、a80 source ACKと混同しない。merge・Pages公開は行っていない。[再現手順](REPRODUCE.md)と[全配布manifest](DELIVERY-MANIFEST.json)を使い、取得確認のための再推論・再exportは不要。
