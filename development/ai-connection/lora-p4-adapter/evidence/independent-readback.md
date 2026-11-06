# 実P4 controlled PARTIAL 独立readback

判定は **PASS_NATIVE_P4_CONTROLLED_PARTIAL_READBACK**。選択したlight/LOWのcontrolled N2/K4診断について、source・生成物・出力・寿命の記録に受入を妨げる不整合は見つからなかった。製品コードは変更せず、原本／base／LoRA factorの再読、NN/nativeの再実行、期待値の新規生成は行っていない。

## 固定sourceと取得物

実行sourceは `a80db72feea60b9bd69e292e4716665c6f0ee77f`、native P4は `7ee36228030ba3bb544a90b1d4b528702a7bae32`、管理queueは `8849891f19124df31847bd691503c2491278eaa8`。管理P4規範・snapshotの採用は主張しない。resultは35,805,981 bytes、SHA-256 `f07081581e46d8252c207fd945f676b888bf35dbca888bd03a019dfd56bdb6b0`。

実loaded40 sourceと、oracle sourceの事前検査を含む全42 Git blobをbytes・SHA-256・Git blob SHAで照合した。8 roleのsource pin、source-pinned oracle wrapper/core、7eeのcandidate planも一致した。LoRA kernelは5,051 bytes／`3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24`。oracle manifestは `04e643dfddf37337c44d210d20c44b9eefe0d2328efbc7833a0903d59c0167ef`、実行a80の独立sourceへ束縛される。

actualディレクトリの全33生成物はファイル集合・bytes・SHA-256・0600 modeを照合済み。7 case×weight/bias/output/scopeの28個、検証失敗候補のW/b2個、native取消候補のW/b2個、復帰base output1個に対応する。失敗・取消・復帰をLoRA合格caseへ追加しない。

## 数値・適用範囲

| 記録 | weight | bias | output |
| --- | ---: | ---: | ---: |
| 7受入case | 143,360値の比較receipt | 28値の比較receipt | 71,680値を独立Bへ再比較 |
| 別のbase復帰 | 合格caseへ加算しない | 合格caseへ加算しない | 10,240値をBのstrength0へ再比較 |

7 caseは0、+1、-1、+1再適用、検証失敗後復帰、prepare取消後復帰、native read取消後復帰。各caseの20,480 weight／4 biasの全件比較receipt、固定gate、独立Aの参照descriptorと生成物hashを確認した。weightの記録上最大誤差は `2.4756445782259107e-9`、biasは0。W/bはこの監査でbytes/hashだけを読み、LoRA積やAとの値比較を再計算していない。

出力は保存されたF32 activationだけを復号し、保存済み独立Bの各10,240値へ全値再比較した。全7 caseおよび別のbase復帰で失敗0。7 caseの最大絶対誤差は `6.079673767089844e-6`、事前gate `0.01 + 0.001*abs(expected)` と記録値に一致した。期待値の生成・調整は行っていない。

元Q weight full[5120,5120]の先頭4行・全5120列、明示bias full[5120]の先頭4値だけをpatchする。各scopeは2 patch、除外target1,050と残りの行を保持する。Aの期待patchと実Hike prepared patchのhashは別identityのままとした。実prepared hashがnativeのparameterSources／tileBindingsのpatch hashへ到達し、candidate validationとactive runのpackageを対応付けた。validationはcommit前epoch、activeはcommit後epochなので同一revisionへ潰していない。

+1の再適用・各復帰のW/b/output hashは初回+1と一致し、base復帰出力はstrength0出力とbyte一致した。保存activationの0からの差は+1で最大 `0.0004372596740722656`、-1で最大 `0.0004425048828125`。これはcontrolled P4出力への寄与の記録であり、自然入力・画像生成への寄与ではない。

## 失敗・取消・寿命

別の独立phase監査76項目もPASS、blocker0。source／artifact／出力監査399項目と分けてJSONへ収録した。検証失敗はnative receiptが実際にvalid:falseとなり4,941値がgate外、expected hashとgateは維持されている。prepare取消・native read取消は各targetの元Promise終端、release、reusableを確認し、旧feedを保持して新planで復帰した。

7受入caseは81936 bytes／2個のdeduplicated native sparse patch bufferを保持する。sink.writeBlockで私有化したbytesをpackage/candidate/active/read leaseが保持し、prepareLoadで二度目の数値copyをしたとは扱わない。internal read leaseはSDK leaseではない。old-base-viewというcontrol名が保持したのはepoch1のzero-strength sparse feedであり、空のimmutable-base feedではない。

active copyの試験はprepared/candidate/package解放後、LoRA File read/hash能力を無効化した後の成功である。不変base sourceとSDK instanceはその時点で生存し、SDK instance disposeは最終base復帰後のcleanupだけである。base source解放後も全feedが自立したcopyという主張はしない。11 queue invocationはterminal/released、20 runtime stageは解放後ORT session0。最終base復帰epoch8・cleanup後epoch9でpatch bytes、package、candidate、read lease、inFlightは0。

## 入力証拠・資源・留保

選択したローカルLoRA Fileの新runtime whole hashは確認済み、oracle自身のwhole hash検証とは分けた。baseは新header/range照合と過去ownerのfull-hash receiptを使い、今回のwhole-base hashはfalseのまま。File／base／oracleの実行前後identityは一致し、private originalのHTTP GET、page/server/cleanup errorは空である。metadataに原本・weightの値配列は含まず、raw生成物はprivate actualに残す。

資源計測は **PARTIAL_SAMPLED_OBSERVATION**。500ms目標の2,641 samples中1 sampleが不完全、VmRSS unavailableが2件ある。所有Node＋明示Chromiumツリーの同sample RSS和の観測peakは **1,472,950,272 bytes**。Node high-water RSS **648,708,096 bytes** は別の測定であり加算しない。shared pageの重複、非同時sweep、短いpeak／processの取りこぼし、起動時の未捕捉区間を保ち、OS/device／全工程のpeakや資源予算証明へ読み替えない。Hike/ORT/native buffer容量とcopy trafficもこのRSSへ足さない。

hostのconsole filter `LORA-P4 ` とbrowserの `LORA-P4-REAL` が不一致でprogress表示を落とした。events=[]は時系列証拠に使わず、structured queue／runtime receiptsで監査した。これは表示捕捉の制限で、追加実行はしていない。

今回の受入はcontrolled caller-supplied residual/timeAct1とfixture conditioningを使うlight/LOW PARTIALだけ。producerAuthenticated=false、自然P2/N2、実Text、別pair/side、全target、全model/session、管理P4規範・snapshot、lease所有権、二組同時合成、生成・本番公開は受入外。最終currentLiveAdmission=false、generationReady=falseを維持する。

対向取得状況も更新した。DiffusionのPR2コメント6560793586と管理の6560860277でa80 source取得ACKを受領済み。管理返却9e9b3ad4258a7f91542e7c74ab1011b1b13921edの186/186は別の884 P3限定受入である。source ACKを未取得とは扱わず、本P4実数値packetの取得・管理P4採用とは区別する。追加のL512共同数値受入をこのcontrolled K4監査へ加えていない。
