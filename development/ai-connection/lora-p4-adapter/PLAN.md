# 884追加受入とP4正本adapter

2026-11-02 JST。ユーザーの実装・共同受入指示と、固定f992の884/P4差分を実行する。受入済みP2、旧Q16、旧28f/60dとdd95の証拠は変更・再タグしない。

## 固定契約

- 管理追加試験は8849891f19124df31847bd691503c2491278eaa8正本runner。codec2bdの元Git objectを取得して同sourceで実行。最初のsource取得不足はnative0として別記録。
- P4 native consumerは7ee36228030ba3bb544a90b1d4b528702a7bae32のWEIGHT-FEED/weights/source/stage。新LoRA mappingは別owner版 `lora-diffusion-p4-adapter/0.1-draft.1`。
- 既存SDK v2に省略可能な `target.blockLimits` (`lora-block-limits/0.1-draft.1`) を追加し、元full要素座標・全列・maxRows/maxElementsを守る。省略時は旧registry/plan構造とQ16 hashを維持。
- P4 native targetID/binding.nameは元program slot、ORT graphInputだけweight。full shape・storage/compute dtype・量子化entry provenanceを保持し、initializerへ詰め替えない。
- sparse sink宣言は実plan.operationsの選択範囲。対象外target/範囲はnative immutable-base pass-through。PARTIALのみ受け入れ、全target・full model・生成READYへ昇格しない。
- private conditioning captureはnative cloneP4CapturedConditioningで同期captureし、structuredCloneでbrandを失わない。native scoped validationをSDK v2へ明示対応する。
- caller→sinkの私有copyと、candidate/active/run leaseの保持を別々に記録。prepareLoadで二度目の数値copyをしたと偽称せず、SDK prepared/source解放後もnative activeがbytesを保持する条件を確認。

## Tasks

1. [x] 固定884を実行し、6公開、7prepare/stage、base復帰、E4fresh読戻し、tamper/missing snapshot/expected pre-prepare拒否を確認。旧実行と別のrun2/source884で記録。独立監査152項目PASS。
2. [x] SDK/plannerのblockLimitsをTDDで実装。FFN down全13824列・1回max4行、81920要素上限、取消、旧Q16/v1互換を合成base＋実Hikeで確認。新9件・LoRA全85件PASS。
3. [x] 新P4正本adapterとnative consumerを結ぶ。SDKregistry/native registry、source/plan/manifest/package/epoch、current/abort、入力/reference/gateを保持。新制御fixtureは実P4feed＋合成source/fake forwardのscopeを明示する。
4. [x] 独立oracle A/Bをsource固定で作る。選択light/LOW・crossQ先頭4行×全5120列＋bias4。既存LOWbaseの来歴/statは保持するが全体hashを再計算しない。新loadのheader/rangeとselectedFileの必要hashは維持する。
5. [x] 4のsource commit後に期待値生成と実File共同試験を実行。強度0/+1/-1、再適用、検証失敗、取消、復帰、immutable-base復帰、package/candidate/active/read-lease寿命を確認。
6. [x] 独立source/evidence review、旧境界回帰、source/配布SHAを分けた結果・API・資源測定・未受入・再現を記録し、feat/lora-hikeへpush。管理/Diffusionへ固定commit/path/hashとreceiptを返す。merge/Pages公開は行わない。

## controlled入力の新scope

P4公開stageはcaller-supplied residual[2,5120]・timeAct1[5120]・明示fixture conditioningを受け、producerAuthenticated=falseを維持する。新試験ではbounded dyadic residual/timeと既存公開dyadicK4を明示し、自然P2/N2 producer・timestep・実Textの受入を主張しない。旧Python CLIのsaved natural-tail gateを改変せず、固定数値coreを呼ぶ別source-pinned wrapperを作る。

Aは別NumPy/binary64計算と独立storage decodeで全20480weight＋4biasを作る。Bは固定P4数値coreに同じ入力と独立patchを渡し10240expectedを作る。SDK/Hike prepared F32とAのF32は許容差内でもbit差があり得るため、期待patch hash、実prepared block hash、実消費tile/package/epoch、数値gateを区別する。旧direct-F32 signbit fixtureを実LoRA期待値へ転用しない。

## 検証・報告境界

- 独立oracle、新control fixture、実File実行、既存証拠再利用を別に数える。
- native P4 SDK/queue取引と、管理P4規範/catalog/snapshot採用を区別する。管理revisionは外側actual queue target、SDK generationとnative epochは別namespace。
- block/patch bytes、native retained buffers、Hike/ORT容量、host観測を別に計測し、未計測のOS/device/全工程peakを既定値で埋めない。
- 自然N2入力・本番Text・本番shape/precision、全block、実HIGH→LOW、二組同時合成、生成/VAE寄与は今回の診断から推定しない。
