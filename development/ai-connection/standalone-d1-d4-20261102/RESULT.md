# Bernini D1〜D4の実装と検証結果

**元81frame workflowを含むD1〜D4の単体完成は未達。** 全1095targetの重みprovider、全40block・最終headのpredict候補、実HIGH／LOWに束縛した6更新sample候補を実装した。HIGH／LOWの全40blockは、controlled N5・Text L3・timestep750の各ケースで独立参照に合格した。原寸の全query、全40block、6更新、組合せ資源条件は未受入であり、公開`load/predict/sample`は`NOT_READY`を維持する。全モデルを公開Workerへ接続するadapterも未実装である。

ブラウザでHIGH3→LOW3の全240blockを完走し、16配列・2,048値が固定gate内だった。最終raw sampleの復元、1179 bytesのcanonicalファイル保存、実ファイル再読込も成立した。これはcontrolled N5／Text L3の受入であり、元81frameの目標shapeは置き換えていない。

## 原本・固定source・配布

作業開始時にPage閲覧ツールで新計画の本文を取得した。文書名は「Kushyameln Works モジュール単体完成 実行計画 Draft」、版は`1.0 draft 1`、Page IDは`page_1e950f67b0688191bd3f2a1d5b252224`。取得bytes・SHA-256、共有仕様`1.1-draft.2`、着手基点`48ff155988d995fc2569e495c8d8820273bd472c`は[SOURCE-CONTRACT.json](SOURCE-CONTRACT.json)に記録した。未取得のcoreを報告要約から再構成していない。

| 検証 | 完全実行source SHA | scope／状態 |
| --- | --- | --- |
| LOW全40block | `21398cb381ae2a6b3c79e5b04554e172ee3f76cf` | N5/L3、t750、47配列合格 |
| HIGH全40block | `efa9b0a753fa9cefc49685189bb5766d40aa5594` | N5/L3、t750、47配列合格 |
| 独立6更新参照 | `efa9b0a753fa9cefc49685189bb5766d40aa5594` | HIGH3→LOW3、240block、16配列、完走 |
| native 6更新・実取消 | `e6f76c6a36a641be0a3483fd7b6bf6fcdf287ce2` | 6更新・16配列・保存読戻し・実取消が合格 |
| 原寸store＋最大FFN tile | `98e4aa361532a2de22ea5aed1565de42a084426c` | N65520容量用バッファ、M128/N5120/K13824、655360値合格。全predictではない |

数値演算を変えずに入力・取消境界を修正した範囲は[CHANGED-BOUNDARIES.json](CHANGED-BOUNDARIES.json)。旧sourceの証拠を新sourceで再実行したとは記載しない。本書と同じ固定commitのAPI文書・成果物manifestを配布正本とし、数値実行のsourceは上表で区別する。

作業branchは`codex/diffusion-derived-hidden-heads`、[Draft PR #14](https://github.com/Kushyameln01/kushyameln-works/pull/14)。merge・Pages公開は行っていない。[固定source本文の取得確認](REMOTE-SOURCE-READBACK.json)はDiffusion担当自身のreadbackであり、相手担当のACKとは区別する。他担当の完成やACKを実行条件にしていない。

## 実装能力と検証済みの入力域

| 区分 | 実装した境界 | 検証済みscope／残件 |
| --- | --- | --- |
| D1 | 元key/full shapeを保つ1095target registry、不変Fileからのbounded read、Hike FP8/F16復号、rows1〜128のmodel math、40head online attention | 実HIGH／LOWの選択値、全合法codeの復号、最大row/tail、Q128/K65520の全keyを比較。全queryの原寸実モデルQKV・attentionは未受入 |
| D2 | prefix→40block→全N最終head→target slice/unpatchify | HIGH／LOWのN5/L3/t750で全40blockを比較。必要shapeと実L512を新全40blockへ通す数値受入は未実施 |
| D3 | 明示noise、固定7sigma、HIGH3→LOW3、generated専用復元、canonical codec | 原寸2,096,640要素の部分演算・保存は合格。controlled N5のnative6更新・16配列・最終保存も合格。原寸sampleは未受入 |
| D4 | 候補内の所有権、取消、busy制御、dispose、資源counter／観測 | 実prefix・sampler取消と公開API／RPC回帰は合格。全モデル公開Worker/API、原寸完走、全工程資源受入は未完 |

目標latentは`[1,16,21,60,104]`、2,096,640要素、target32,760token。同shapeのsource81だけで全Nは65,520になり、reference_video・参照slotはさらに加わる。実装の90,000token上限はallocation前の**計画上のguard**であり、受入済み実行域ではない。1本のhidden storeが2GiB未満になる条件も、全Memoryの成立証拠とは扱わない。

controlled caseはtarget2token＋source2token＋reference_video1token、Text3行、mask111。出力shapeは`[1,16,1,2,4]`。これは元81frameの切詰めや実Text/VAE producerの出力ではなく、明示した別診断Profileである。形状は同じ管理正本`deriveWorkflowShapes`から導き、別のshape式を実装していない。

取得したComfy sourceは公式raw本文に末尾LFを1 byte追加した保存形式だった。[RAW-SOURCE-CAPTURES.json](RAW-SOURCE-CAPTURES.json)に公式rawと保存形の両bytes／SHA-256／Git blobを記録した。全5本文の対応とAST同一を確認済み。再現helperは明示capture profileで同じ保存形を生成し、既存contractを変更しない。

## API差分・tensor・所有権

公開protocolは`diffusion-models/0.1`のまま。既存descriptor、N2/block0の通常P4、pointwise1,048,576要素、旧mean変換の制約を一括で引き上げていない。新しい単独factoryは次の通り。

- `createFullModelWeightSource`：不変の実HIGH/LOW Fileからoriginal key/full shapeのowned F32 blockを返す。payload readは最大163,840 bytes、復号は最大81,920要素。FP8は各targetのscalar scaleを使い、`decoder: 'lookup'`では既存Hike復号を数値正本とする。source factoryの既定はlegacy、モデル候補のowned sourceはlookupを選択する。LoRA低rank積は実装しない。
- `createBerniniModelCandidate`：通常`predict`はshapeRequest、順序付きtensor、conditioning、timestepを受け、owned F32 NCTHWの`bernini-flow-velocity:v1`を返す。全streamを処理し、全40blockと全N headの後にtargetを抽出する。
- `createBerniniModelSamplerCandidate`：HIGH／LOWの実モデルを内部で所有し、明示noise、positive/negative、contextを使う。Euler／simple6／shift5／split3、CFG1を維持する。negativeも検査・保持するが、CFG1ではnegativeのニューラル評価を省く。
- `createGeneratedLatentSpace`／`createGeneratedTargetPointwise`：生成用latentとraw posterior meanを別のmeaningで扱う。既存128値固定mean経路のguardを転用せず、専用Hike ABIの実chunk処理で原寸を扱う。

通常入口は固定payload hash、独立参照、誤差gate、過去receiptを要求しない。hashは識別・診断記録で使う。独立比較とowned cloneの全中間出力は明示`diagnose`に分け、callbackの返り値で演算結果を置き換える経路はない。

Textはfloat32 BLC`[1,L,4096]`、L1〜512、`text_hidden_states`、`umt5-final-rmsnorm-f32-v1`、既知model/Tokenizer SHA、binary attentionMaskを受ける。masked input行はzeroである必要がある。元core通り、投影後の全L行をcross-attentionに残し、maskで行をcompact化したりsoftmaxを変更したりしない。宣言されたmodel識別はproducer実行の証明ではない。

targetは`bernini-generated-model-latent:v1`、contextは`wan21-normalized-posterior-mean:v1`、正規化IDは`wan21-comfy-f32-v1`。samplerは明示raw contextを自担当のHike演算で正規化できる。source→reference_video→参照slotと各frame順、source_id、座標は正本shape規則と元coreに従う。raw meanを生成sampleへ改名しない。

HIGH3後にはinverse noise scaling→Wan21 process_out→raw handoff→LOW process_in→zero-noise CONST mixを行う。HIGH内部XをそのままLOWへ渡すことでF32丸めを省かない。最終生成物はsigma0のinverse scaling後に一度だけ復元し、`wan21-raw-generated-sample:v1`、`latentContract.space='raw'`、`representation='generated-sample'`、normalization state`restored`、producer`[HIGH,LOW]`を持つ。VAEの識別はproducer modelとは別に保持する。

入力・WASM bytesをawait前にsnapshotし、共有・非compact・非finiteの入力を拒否する。呼出し側のFile／tensorは変更しない。native AbortSignalと捕捉したEventTargetメソッドで取消し、listener登録をtransactionとして扱う。`dispose()`はactive処理の終端を待ち、所有session・source・cacheを解放する。callerが供給したoperator ownerはcaller所有のまま。ORTの共有arenaやGC待ちMemoryがOSへ直ちに返るとは保証しない。

全体待機列・工程管理は管理ツール側、Diffusion内の数値計算・stage cache・session・取消／解放は本担当とする。API例・schemaは[全モデルpredict候補](../../../docs/shared/diffusion-models/execution/model-candidate.md)、[sample候補](../../../docs/shared/diffusion-models/execution/model-sampler-candidate.md)、[公開API](../../../docs/shared/diffusion-models/API.md)を参照。

## 新規数値検証と再利用範囲

HIGH／LOW各47配列、1,106,368要素を独立NumPy参照と全値比較した。gateは実行前固定の`abs(actual-reference) <= 0.01 + 0.001*abs(reference)`。失敗0、最終velocityの最大絶対誤差はLOW`7.62939453125e-6`、HIGH`3.4570693969726562e-6`。[LOW比較](reference/low-comparison.json)／[HIGH比較](reference/high-comparison.json)に全cutを残した。両側個別のt750受入とは別に、[実6更新比較](sampler-reference/comparison.json)でHIGH3→LOW3と16配列を検証した。全2,048値がgate内で、最終raw sampleの最大誤差は`3.2186508178710938e-6`。6回のモデル呼出しは通常`predict`を使い、診断hookは計算済み値を複製して記録する。

[長いattention](long-attention/browser-result.json)はH40/Q128/K65520/D128、256tile・末尾240、4配列1,320,960値で失敗0。正規化output最大誤差は約2.58e-7。全queryや実model QKV由来の値はこの診断に含まれない。生成用復元・HIGH/LOW変換は原寸2,096,640値を比較し、canonical codecのbit一致も別に検証した。

最新Node検証は102/102、公開API browser22/22、最終buildのWorker/RPC9/9。変更境界では配列長・buffer偽装を拒否し、signalの例外やown getterでbusy／disposeが停止する問題をred/greenで修正した。新WASM Memory observerの7試験は、native Memory/Instance、import/export、Streaming、共有Memory、unknown容量を確認する診断専用試験である。

旧N2/P4、実Text L512、LoRA共同試験の証拠は、それぞれ元の固定sourceとscopeに保持する。新全40blockや新samplerの実L512／LoRA適用受入には流用しない。LoRA完成F32を受けるsource境界はあるが、今回の新モデル経路はLoRAなしbaseであり、全40blockのLoRA transaction／canonical adapterは未受入である。

## 必要資源と残る阻害要因

実行環境は16GiB cgroup・CPU quota4。ORTはこの候補でnumThreads1／proxy false。各元モデルは15,574,833,216 bytesで、Fileのrange readを使い、全FP32重みを単一Memoryへ常駐させない。ファイル分割だけで実行Memoryが成立したとは扱わない。

| controlled N5/L3の値 | HIGH | LOW |
| --- | ---: | ---: |
| browser時間 | 505.9325秒 | 525.4706秒 |
| host stage cache peak | 566,231,040 B | 566,231,040 B |
| 復号F32累積量 | 57,153,966,336 B | 57,153,966,336 B |
| operator input span counter | 57,217,101,056 B | 57,217,101,056 B |
| 観測区間RSS合計peak | 2,431,102,976 B | 2,388,434,944 B |

累積量は同時常駐量ではなく、operator counterはnative内部の全copy量ではない。RSS観測は実行途中からで全lifecycleを覆わず、PSSは未取得。原寸N65520の4本host storeだけで5,367,398,400 Bとなり、weight staging、snapshot、ORT/Hike、出力、GC、sessionをさらに合わせる必要がある。controlled 6更新は3206.3816秒、RSS合算の観測peakは2,907,226,112 B、観測WASM Memory peakは313,458,688 B、ORT sessionは2個を再利用した。保存payloadの128値はbit一致。原寸全工程のpeak・時間は未測定である。[詳細資源記録](RESULT-RESOURCE.md)／[計画値](RESOURCES.md)／[長いattention実測と仮定の区別](LONG-ATTENTION-ASSESSMENT.md)を参照。

[target-capacity](target-capacity/native-monitored-result.json)では、5,367,398,400 Bの非zero容量確認用storeと実FFN重みcache 566,231,040 Bを同時保持した。実LOWの最大Gemm `[128,5120,13824]`＋Hike biasの655,360値は、事前gate `abs=.001 + rel=.0001`で失敗0、最大誤差`8.344650268554688e-7`。観測WASM Memoryは372,637,696 B、プロセスRSS合算の観測peakは7,425,630,208 B、PSS合算peakは7,146,511,360 B。storeはproduction hiddenではなく、inputも制御fixtureである。この容量・tile試験を全query／全40blockの実predict受入へ昇格させない。初回RSS計測が間に合わなかったため、固定参照を再利用した同一試験でRSSを取得し、両receiptを保存した。

未受入事項は、原寸の全query・全context・全40block・最終headの数値と完走、原寸のHIGH3→LOW3、元production precisionとの同等性、実Text L512の新全40block、全40block LoRA、全モデル公開load/predict/sampleとWorker／保存adapter、全工程の組合せ資源予算、後段モジュール接続、製品生成READY。これらが残るため、APIのNOT_READYは解除していない。

## 再現・成果物

[REPRODUCE.md](REPRODUCE.md)から、固定fixtureの再生成、公開coreのhash照合、個別HIGH／LOW、独立6更新参照、native sampler、保存・読戻しを順に実行する。通常APIへ参照を渡す手順にはしない。参照の再生成は取得ACKのためには不要である。

数値参照・中間tensor・生成sampleは専用private directoryに保持し、public receiptはpath・bytes・hash・scope・誤差・資源だけを持つ。新候補のcatalog提出案は[PROFILE-SUBMISSION.json](PROFILE-SUBMISSION.json)。これは共通catalogへの登録済み宣言ではなく、旧N2候補とは別entryの提出資料である。
