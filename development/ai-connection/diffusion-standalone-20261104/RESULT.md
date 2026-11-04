# DiffusionModels単体と接続経路 — 2026-11-04 UTC

原寸でのD1〜D4単体完成は、まだ受け入れていない。実装済みの公開API・weight接続と、原寸の数値・資源検証を区別する。全体運用実験、実験用LoRAの送付、merge、Pages公開は行っていない。

## 実装と配布

既存branch `codex/diffusion-derived-hidden-heads`／Draft PR14を継続する。完全な実行sourceと配布の対応は [EXECUTION-SOURCES.json](EXECUTION-SOURCES.json) と各固定receiptに記録する。配布は本書を含むcommit、実行は各試験の固定commitと取得したファイルのbytes／SHA-256で識別する。

- `d2a0d074ad5196940301f7107c6577c5fa48158c`：canonical logical targetから実reader/operator、不変base provider、完成F32 consumer、公開Workerの双方向weight portを実装したsource。
- `a23d5276d705605903afa599b1e049f62948d094`：上記実APIを、実HIGH／LOW Fileで同一ページ・明示outer MessagePortの両方から検証したsource。
- `8ddefbafdb27ce8a0451c3ad5ba36d63729acd87`：全K/V準備後に自己注意残差をprivate入力へ書き戻し、4本目の全hidden出力storeを省くsource。独立参照の全40block単独predictを比較できる診断経路も追加した。

通常入口に参照値・gate・固定サンプルhash・過去receiptを追加していない。`load/predict/sample`、Worker、session、取消後reload、canonical保存・読戻しを引き続き正本とする。数値参照と詳細receiptは開発検証側に置く。

## 単体の新規検証

公開HIGH predictはsource `d2a0d074ad5196940301f7107c6577c5fa48158c`、通常Pagesを想定した **1-thread／no-COI**、N5／実Text L512／t1000で全40block・全N head・target抽出・unpatchifyを完了した。意味は `bernini-flow-velocity:v1` であり、生成sampleではない。

全512行とmask、Text model／Tokenizer、保存済みinput manifestを維持した。native1001.440秒、独立F64参照138.675秒。全128値比較は失敗0、最大絶対誤差 `2.259388566017151e-6`、最大gate比 `0.0002254238001404883`。事前gateは従来どおり `abs .01 + rel .001*abs(reference)`。以前の4-thread出力とはbit一致しなかったため、そのhash一致で数値受入を代用せず、新しい独立参照で比較した。

512Bのvelocity payloadと835Bのcanonicalファイルを実際に保存し、Fileとして再読して全bit・意味・shapeが一致した。caller入力も保持された。native側process familyの観測PSS peakは1,627,832,320B、RSS合算は1,913,679,872B。実行前からcleanup後まで2秒間隔で観測した。試験の一部は後述の原寸試験と重なっており、所要時間は隔離されたbenchmarkではない。

[native・資源・参照・比較receipt](evidence/) に詳細を保存する。旧N5/L3と旧4-thread実L512のHIGH3→LOW3／raw保存の証拠は、それぞれの実行source・入力・環境に限って再利用する。今回の新1-thread受入をLOW完全predict、6更新、原寸、生成READYへ広げない。

## 管理へ渡せる実接続

[公開weight契約](../../../docs/shared/diffusion-models/api/WEIGHT_PORT.md) と [native consumer](../../../docs/shared/diffusion-models/execution/FULL-WEIGHT-FEED.md) を正本とする。

`load`後の `openWeightFeed({side,modelSessionId})` が、実Workerに結び付いたMessagePortとbindingを返す。`createDiffusionWeightClient` は同一ページ・明示outer portのどちらでも、不変base providerと `lora-standalone/1.0-draft.1` consumerを提供する。packageの関数をcloneせず、完成F32のreadと逆向きbase readを実RPCで処理する。

1053 logical targetは、元full shape・dtype・FP8 scale/profile・変換・bindingを持つ1095 native targetへ別descriptorで対応付ける。行列はORT runtime-input、bias／normはHike parameterであり、initializerと読み替えない。41 modulationとrank5 patch convolutionは、このlogical契約ではbase専用。canonical tableはLoRA固定source `6d0c8df4cd4992f26745d2d26394f5e194d2567f` の正本を再利用する。

通常検証は宣言範囲の全F32値、有限性、package identity、shape・対象・取引を検査する。真正baseに宣言交差範囲だけを上書きし、未宣言値はpackageから採用しない。低rank積はLoRA ownerに残す。predictは片側、sampleは6更新全体で両側のepochを保持し、実行中のcommit／解除を拒否する。head cacheもepoch変更に追従する。旧lease、取消、stale candidate、cleanup失敗時の保持・再試行を検証した。

実公開Workerの **1-thread／no-COIと4-thread／COI** は別々に合格した。同一ページ・outer port、HIGH／LOWのbase供給、検証用完成F32の通常検査・切替・解除、逆向きreadの取消、unload／reload、旧port拒否、disposeを確認した。所要30.87／28.53秒、PSS peak586,856,448／601,934,848B。終了時package参照・candidate・lease・cleanup pendingは0。

[実公開portのreceiptと再現手順](../standalone-weight-feed-20261104/public-worker/RESULT.md) を参照する。この試験ではNN predict/sampleを呼んでいない。別の [実LOW base→ORT→Hike bias試験](../standalone-weight-feed-20261104/RESULT.md) は20,484個のbase復号値が独立復号と完全一致し、完成F32／base復帰後の各8出力が誤差gate内だった。いずれも実LoRA全モデル適用・管理全体運用の証拠ではない。

管理には、既存の実公開API adapterを再利用して新固定sourceを採用できる。保存資材は [SAVED-INPUTS.md](SAVED-INPUTS.md) と復元scriptから取得できる。管理の旧固定sourceによるcontrol受入と、今回のDiffusion実Worker接続受入を区別する。管理側で新sourceのNN／VAE／LoRAを通した全体運用は未実施で、取得ACKを単体試験の着手条件にはしていない。

[管理採用の照合結果](MANAGEMENT-ADOPTION.md) では、管理の固定source `296c18d5f2c878fa42bbb198a706991fc901065f` の実adapter・保存入力を取得して確認した。baseの既存7操作は互換だが、管理が採用済みの旧runtime144件に対し最新は153件であり、変更11・追加9のsource／build／closure更新が必要である。管理の結果cloneはMessagePortを扱えないため、`openWeightFeed`の操作名追加だけで接続完了にはならない。専用のport/client所有経路と取消・解放を管理ownerが実装する必要がある。これは実コードから確認した未実装境界であり、管理の新source採用・全体接続の完了や相手の取得ACKを主張しない。照合した固定source・path・bytes・SHA-256は [差分manifest](MANAGEMENT-SOURCE-DIFF.json) に保存する。

## 原寸の容量と最初の障害

明示した別caseはtarget `[1,16,21,60,104]`、source81frames相当、848×848参照3stream、reference_videoなし、合計73947 token。実媒体のframe数／有効slot／寸法を測った結果ではない。target-firstのconcatと、contextのsource→有効slot順、frame順を維持する。元workflowを推測で復元していない。

source `ecf1122b3afaba989277c5b44f523a40219b79eb` の原寸HIGH/block0を、native4/COI・明示参照BLAS4で試験した。途中から別processのN5公開predictも実行した構成で、共有cgroupの16GiB上限に達し、OOM10回・OOM kill2回の増分と原寸page crashを記録した。nativeからoperatorエラーが返った事例ではなく、どの個別allocationが直接の引き金かは未観測である。同時保持の見積もりが不足していたため、以後の重い試験は逐次実行とする。

最初の未完了stageはblock0 self-attentionの全query。1766.258秒で試験を終了し、patch／post-modulation／K／Vの各73947行、Text512行、Q3968行、attention／O／自己注意残差の各3840行を比較した。2,445 chunks、比較失敗0。全query、cross／FFN、完全block、全40block、6更新は完了していない。

原寸process family単独の観測PSS peak10,879,312,896B／RSS合算11,258,544,128Bは、別processのN5試験を含めない。共有cgroup観測と加算しない。page crash後のnative allocator cleanupは確認できなかった。browserを閉じ、独立参照を終了し、private X/K/V backing3ファイルを除去した。詳細は [失敗receiptと資源観測](evidence/concurrent-memory-failure/) に残す。この結果から原寸の単独実行を不可能とは判定していない。

prepared K/Vは全row-major K/Vの2本を置き換える。追加の3.029GBを保持する方式ではない。さらに [残差store再利用](../standalone-inplace-self-residual-20261104/RESULT.md) で、N73947の名前付きspanを6,057,738,240Bから4,543,303,680Bへ減らした。差1,514,434,560Bは論理spanであり、既に触った物理pageの削減実測ではない。LOW/N259の全query/key・33中間chunkは旧方式とbit一致し、独立F64残差gateも全値合格した。

row一時配列、最大stage weight cache566,231,040B、source／decode、WASM／ORT staging、入力保持・返却copy、allocator／GCは別途必要である。native ORT内部copyを消したとは主張しない。pointwise上限1,048,576とmean64／128 profileは、モデルstore／生成sample専用space容量とは独立の制約である。hostの上限値だけを上げて対応したものではない。

## 原寸の再試験と残件

3-span source `8ddefbafdb27ce8a0451c3ad5ba36d63729acd87` を凍結して、他のNN試験を終えた後に再開した。native4/COIと参照BLAS1を明示し、旧4-reference trialと環境を混同しない。prefix／post-modulationの数値証拠は、変更されていない演算に限って再利用する。診断の `--skip-prefix-comparison` は再比較を省く選択であり、native prefix計算・全K/V生成・全self/cross/FFNの比較は行う。比較したstageはreceiptに列挙し、省いた境界を新規比較と呼ばない。

この再試験は終端 `passed:true`、外側process exit0で完了した。HIGH block0の選択した13 stageは全query／key／headのcoverageを満たし、6,366 chunks・4,169,937,920要素の比較失敗0。最大絶対誤差0.0002288818359375、最大gate比0.01576734089608632、事前gate `abs .01 + rel .001*abs(reference)` は変更していない。所要13,737.908823秒。末尾query91行／key219行を含み、prefix再利用を新規比較とは数えていない。[block0結果・原本receipt](evidence/original-block0/RESULT.md) に根拠を残す。

外側monitorは実行前から終了後まで全期間6,312 samplesを観測し、PSS合算peak12,217,216,000B、RSS合算peak12,494,725,120B。保存履歴の4,512 samples省略は未観測を意味せず、全期間sampled peakには反映されている。OOM10／kill2は開始時から増えていない。ownerのstore／K/V／query／prepared weightは解放され、参照child exit0・backing残留なし。after-disposeでも観測されたWASM容量はnative allocator生存量やOS解放の証明ではなく、最終zombie2件のPSSはnullだった。詳細と未知範囲は [SUMMARY.json](evidence/original-block0/SUMMARY.json) を参照する。

このblock0終端後、[小attention診断](resident-ort/TIMING-RESULT.md) を1/no-COI、4/COIの順で終え、その後に公開APIの原寸HIGH predictだけを開始した。source `6cda0a686d30a4bd748909fc56c61c1acece7bfb`、専用worktree、exec session30165で実`load`→`predict`を実行中。固定した [観測記録](RUNNING-PUBLIC-HIGH.json) ではblock0 self-attention 1,024／73,947行まで進み、終端receiptはまだない。これは観測時点の状態であり、その後の進捗や完了を推定しない。345,600秒（96時間）のwatchdogは運用上の上限で、所要時間予測や数値gateではない。

今回受け入れた原寸all-queryは **HIGH block0の選択境界のみ**。原寸の公開HIGH完全predict／全40block・headと独立数値比較、LOW完全predict、HIGH3→LOW3、raw sample保存は未受入。小attention診断もprofile内のbaseline/wrapper全10,649,600 bytes一致に限り、profile間bit一致・原寸の時間比・速度改善・resident K/V成立を示さない。モデルの数値演算・資源管理はDiffusion、全体の待機列・工程管理は管理側が所有する。

生成sampleの復元はDiffusionで一度だけ行い、`wan21-raw-generated-sample:v1`／NCTHW F32／`normalization.state=restored`としてVAEへ渡す。posterior meanへの改名・mean専用復元への代用は行わない。この契約の実装と旧小入力のraw保存証拠は保持するが、原寸raw生成・VAE decodeを今回受入済みとはしない。

元媒体の実frame数・参照寸法・有効stream、元mxfp8環境の計算dtype／同等性は未取得。今回の実行baselineは保持scaled E4M3FN/F16・固定Hike復号・F32演算であり、未取得資料や他担当の完成を待って実装を止めてはいない。
