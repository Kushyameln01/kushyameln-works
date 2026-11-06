# LoRA正式DATA bridgeと実File・真正baseの共同結果

2026-11-01。**選択したlight HIGHのQ16 PARTIAL診断を、管理の正式DATA bridge経路で受け入れた。** ローカル原本1件と真正bounded baseから重みを準備し、実native検証、管理診断snapshot公開、取消・検証失敗からの復帰、不変baseへの復帰まで確認した。最終的には資源を終了し、`currentLiveAdmission:false`、`generationReady:false` とした。

機械可読記録は [RESULT.json](RESULT.json)、[LoRA API追補](../../../docs/shared/inference/lora/P2_P3_ACCEPTANCE.md)、全公開出力と小さいreceiptは [evidence/receipt.json](evidence/receipt.json)、再現手順は [REPRODUCE.md](REPRODUCE.md)。新tailとの依存は [CONSUMER-DEPENDENCIES.md](CONSUMER-DEPENDENCIES.md)、全patchの対応は [TARGET-CONSUMER-MATRIX.md](TARGET-CONSUMER-MATRIX.md) に分けて記録する。

## 固定sourceと変更境界

| 用途 | 完全commit・契約 |
| --- | --- |
| 今回の実行source | `28f44c3a1b71bef59e2d018a0db736de6d84675c` |
| 管理の正式入口 | `60d16b64d6020d3d20239f087f8add91268dcaad`、`works-lora-data-phase-bridge/0.1-draft.1`、[固定API](https://github.com/Kushyameln01/kushyameln-works/blob/60d16b64d6020d3d20239f087f8add91268dcaad/docs/shared/ai-connection/API.md#formal-lora-owner-data-phase-bridge) |
| owner DATA原本 | `82b21f09cb63926543181b16f0e97ebc6b9fa6be`、`lora-management-admission-inputs/0.1-draft.1`／`lora-numeric-declarations/0.1-draft.1` |
| LoRA native SDK・mapping・kernel | `fc2789a0f649e33f15eb13750e6a983b5c52d170`、`lora-connection/2.0-draft.1`／`lora-diffusion-diagnostic-adapter/0.1` |
| Diffusion Q16 consumer・provider | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`、実ORT WASM `1.24.3`／Hike |
| catalog・規範・数値規則 | `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`、文書 `1.0-draft.1` |
| 実行計画 | `0fb553fd081d3bcbbad4ead7accd165679f77d34`、文書 `1.0-draft.1` |
| 再利用した独立参照・gate | `0c27874908638afc748ea2455a2779a16736730b:development/ai-connection/evidence/lora-e1/HIGH-reference.json`／`HIGH-gates.json` |

新規receiverは `test-lora-data-real.mjs`、`lora-data-real-browser.mjs`、`lora-data-real-inputs.mjs` と宣言fixture。LoRA SDK、canonical mapping、kernel、対向管理runtimeは変更していない。mapping正本は `createDiffusionDiagnosticAdapter`。旧diagnostic bridgeや前回のreceiver norm hookは重ねていない。

0260時点ではowner DATAを正式入口へ渡すbridgeが未実装だった。管理60d16は82bの2moduleをbyte exactで同梱し、`createLoraDataPhaseBridge` を公開している。管理側の受入済み合成native共同試験と、今回の実File／真正baseの新しい正式取引を区別した。配布・PRの後続commitを、上表の実行sourceへ付け替えない。

## 原本・base・適用領域

原本はローカルFile `Bernini-R_LightX2V_high_noise.safetensors`、1,244,141,856 bytes、SHA-256 `9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945`。新規loadでheaderを読み、このFileの全体hashをブラウザで検証した。後続planは同じimmutable Fileのdigestを再利用する。過去4原本の全取得・再棚卸し・全体hash再計算は条件にしていない。

loaderは固定 `comfy-lora-b5a4321-linear-diff-v1`。今回のweightはBF16 `linear-down-up`、rank128、明示alpha128、alpha/rank=1。lightのbiasはBF16 `additive-diff-b`。strength `{0,1,-1}` はこの診断の明示値であり、製品の既定値ではない。alpha省略時scale=1の規約は、この固定loaderの適用範囲だけに留める。

真正baseは既受領の709,364-byte bounded artifact、SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`。HIGHのheader、FP8 Q weight、F16 bias、F32 scalar scale、quantization configの5 rangeを、原header・絶対offset・既存独立参照に照合した。Diffusionの正規providerで復号した81,920 weightと16 biasは、独立base参照へ数値・bytesとも一致した。

`fullFileSHA256Verified:false`、`fullFileHashRecomputed:false` を維持する。元15GB baseのwhole-file hashはprior-owner receiptとして保持するだけで、今回の新しい全体hash証明へ変更していない。

| 項目 | 確認範囲 |
| --- | --- |
| full shape | Q weight `[5120,5120]`、Q bias `[5120]` |
| 選択 | weight先頭16行・全5120列、bias先頭16値 |
| 実binding | weight=`runtime-input:weight`、bias=`hike-parameter:bias` |
| 含むpatch | Q down/up/alpha、明示Q `diff_b` の2 patch |
| 除外 | 他1050 patch、選択Q weight/biasの行 `[16,5120)` |
| dtype/layout | base復号・prepared weight/biasはF32 row-major。baseのstorage F8_E4M3/F16とは別 |
| native registry | `b1142c55f5f43ac78cd1b167ceed5be0d7f8e9b87b21047ff565d08d38c4c87b` |
| connection registry | `cc6a329b0cffbdf3c2a50914843da33e7d402a815921e206ddf5f8b0fea4c806` |
| coverage | `PARTIAL`、`completeAdapter:false`、`modelInference:false` |

原本・registry・plan・bundle・native package・snapshotの識別子を同一視せず、full shapeと選択領域・全除外表を各caseのscope artifactへ保持した。

## 正式phaseと状態

1. 実inspection・両registry・事前のsource/reference/gateからreceipt-freeの宣言を作り、正式bridgeの `plan` を呼ぶ。DATA原観測、`presence`、`origins`、全選択patch／source dtypeを管理の既存evaluatorへ渡す。
2. 実native validation checkpointで、全weight/biasの独立比較receiptと、実outer owner validation・同じsnapshot targetを結ぶ。`phaseBinding.bound:true` を満たし、commit直前にもSDK tuple、外側consumer token、管理revision、resource generationを再確認する。
3. 実coordinatorが公開・finalize・prepared releaseを終えた後、brand付きpublication contextから `afterPublication` を自動実行する。閉じたstaging contextのcurrentnessを公開後の寿命へ流用しない。

receiverは過去のP1 phase判定を正式入口へ差し込まず、将来のreceiptを`steps[].edges`へ渡していない。全6公開caseでbridgeのphaseは `postpublication` まで到達し、weightとbiasそれぞれの管理guardが `published` となった。管理のREADYはこの診断edgeの判定であり、生成受付を意味しない。

新applicationを選ぶ時点で旧snapshotをuncurrentにする。失敗時の旧feedとrollbackの権限は、選択revisionとは別のresource lifetimeで保持する。原本登録、prepared、STAGED、native `CONSUMER_APPLIED`、管理 `SNAPSHOT_PUBLISHED`、終了後の過去receiptを別状態として記録した。

## 数値結果と制御

独立期待値と事前gateは0c固定の原本を再利用し、新しい期待値・gateは生成していない。weightは `abs(error) <= 1e-5 + 1e-4*abs(reference)`、biasはF32数値完全一致、出力は `1e-6 + 1e-5*abs(reference)`。

| 公開case | strength | 管理revision | SDK input/application | consumer epoch |
| --- | ---: | ---: | --- | ---: |
| initial-zero | 0 | 2001 | 1 / 1 | 2 |
| initial-one | 1 | 2002 | 2 / 2 | 3 |
| initial-negative | -1 | 2003 | 3 / 3 | 4 |
| reapply-one | 1 | 2004 | 4 / 4 | 5 |
| validation-recovery | 1 | 2006 | 6 / 6 | 6 |
| cancel-recovery | 1 | 2008 | 9 / 9 | 7 |

6公開caseで **491,520 weight、96 bias、96出力** を全比較した。最大絶対誤差はweight `3.72290287486976e-9`、bias `0`、出力 `7.450580596923828e-9`。正strengthの再適用・復帰では、prepared weight hashとnative feed package hashが最初の正strengthに一致し、加算は累積しなかった。

保存済み16出力のJSON値をstrength0と比較すると、strength1／-1の最大絶対差はともに `0.00019116513431072235`。これは実Q16診断出力への寄与であり、生成結果や新tailへの寄与ではない。

取消checkpointにも別途81,920 weight・16 biasの独立比較がある。この候補は公開せず、6公開caseや96公開出力へ加算しない。raw候補16出力は保存しておらず、native validation receiptのexpected hash・gate・差分を保持した。

| 制御 | 実際の結果 |
| --- | --- |
| native validate失敗 | validation用activation copyの先頭値だけを`+1024`。独立expected/gateは変更せず `NATIVE_VALIDATION_MISMATCH`、旧feed保持、選択失効、次の正常適用で復帰 |
| checkpoint取消 | exact queue targetを指定し、stopConfirmed・元Promise終端・resourceReleased・reusable・非quarantineを確認。旧feedを保持し再適用成功 |
| 旧管理request | `TARGET_MISMATCH`。古い管理revisionを新しい適用へ使わない |
| source能力解除 | `SOURCE_BINDING_UNAVAILABLE` 後も、prepared/historyに依存しないnative独立copyで同じ出力を確認 |
| base復帰 | 同じqueueで不変baseをprepare/validate/commit。変更前にsnapshotをuncurrentとし、元task終端・afterTerminal・releaseを確認。native epoch8でbaseへ戻った |

取消はbounded native呼出し後の協調停止であり、実行中WASMの強制中断ではない。validation失敗・取消・source解除・base復帰の出力は独立したlifecycle証拠として残し、新しい公開数値caseへ数えない。

## 検証・配布証拠と受領確認

receiver宣言fixtureは **4/4 PASS**。管理の既存source/loader/正式bridge境界fixtureを今回60d16で再実行し、**41/41 PASS**。両者は宣言・制御境界の試験であり、実数値caseへ合算しない。実browserはChromium `154.0.8037.57`、固定source55件と生成物26件を記録した。26件は6公開caseのweight/bias/output/scope各1件と、取消checkpointのweight/bias2件である。page/server/cleanup error、raw原本/baseへのHTTP GET、入力stat変更、旧bridge読込みは記録されていない。

source reviewは実行前の判断として保持する。実行後の独立読戻しは269件のsource/artifact/scope確認と88件のphase整合確認に合格し、blockerは0件だった。55 Git blobs、26生成物のbytes/hash、DATA原本と管理配置先、固定catalog本文、全公開expected16値、旧独立検証済みartifactとのhash・metrics対応を照合した。F32はhash読戻しであり、今回さらに数学を独立再計算したものではない。[evidence/independent-readback.json](evidence/independent-readback.json) と [review.md](evidence/review.md) のscopeを維持する。F32保存配列はprivateに保持し、Git配布はmetadata・出力16値・hash・source証拠に限る。

- [小さいreceiptと全公開16出力](evidence/receipt.json)
- [配布manifest](evidence/MANIFEST.json)
- [完全receipt gzip](evidence/run-result.json.gz)：1,211,308 bytes、SHA-256 `29dca21132f34616f48d88f4b81d884378b508b8dac81a9987049371932e1754`
- 展開後JSON：37,764,410 bytes、SHA-256 `50a58d8f8c94bed2883fc294554acd744039ce0aa36e39ed6046135e5984f032`
- [実行前source review](evidence/source-review.md)、[receiver4 fixture](evidence/receiver-input-fixtures.log)、[管理41境界fixture](evidence/manager-boundaries.log)

DATA82bの32961-byte／9909-byte原本が管理60d16の配置先とGit blob・bytes・SHA-256で一致し、実browserでsource verificationのruntime brandを正式bridgeが消費した。これは管理配布sourceの対応を確認した証拠である。今回の新receiptについて、管理担当本人・Diffusion担当本人による受領ACKは別途未受領であり、コメント掲載やローカル検査で代用しない。

## 維持する範囲と未受入事項

旧20件と、25e5実行／40f配布の旧6件は、それぞれ元commit・scopeで再利用する。今回の正式取引へ付け替えたり、合算して全model適用としたりしない。今回新規受入したpair/sideはlight HIGHだけである。

新Diffusion tail `508d72cc9036e7f500827465c644b4aed3c5f711` はLoRA preparedを受ける実session ingress／取引APIが未提供のため `DEPENDENCY_WAITING`。全2,904 patchを対応表へ残し、shapeや名前だけで新tail適合を認定しない。詳細な要求は依存文書とPR照合依頼へ結ぶ。

light LOW、detail HIGH/LOWの新正式bridge受入、真正baseでの新しいHIGH/LOW共同snapshot、全target、selected-weight `N-ARTIFACT`、新lease方式、全model/session、LoRA影響下の新tail数値、生成への寄与、組合せ資源予算は未受入。公開直前のlate-binding変更を追加する新しい実負例も、この6件では実行していない。mean入出力API、二組同時合成、merge、本番／Pages公開は追加していない。比較buffer容量は限定的に記録し、native／ORT／RSS／device／全modelのpeak memory受入へ広げない。

最後のsnapshotは過去factとして残り、`selectionCurrent:false`。SDK・consumer・ORT/Hike stage・base・queue・managerの終了後はlive適用権を持たない。
