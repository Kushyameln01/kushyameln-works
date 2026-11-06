# 修正Textと現データ契約の管理反映

2026-11-05 JST。**実管理APIで新manifestの選択と現codecの保存・読戻しを確認し、そのpackageから回収した実L512を最新版P4の通常入力へ渡した。** 今回はNN0の構成・保存・通常入力受理であり、数値NN受入や管理UI全体のdefault更新ではない。保持済み実generated sampleはreceiptのみ取得でき、raw bytesが未取得のため該当decodeだけを保留した。

## 固定source

| 対象 | 完全SHA |
| --- | --- |
| 今回のCLI実行source | `eba0533fb62ff6caa9d0785f8079f783f23f825c` |
| 実管理adapter／queue／workspace | `e1661e561dfb1a4f20544ff48bc375175b5981d1` |
| 最新P4通常契約／native入力 | `b6e166478a8e072c9ffd3ce562bfdb0c89634920` |
| 変更していないnative codecの比較基点 | `20f640a6e071b6c060a212e89b28f0c8965923f7` |
| 再利用した全512有効IDのNN実行 | `c99d89ca7a9edbe04d0fb451ef7c2529dbaa48d3` |
| 再利用した実長文／管理browserのNN実行 | `78954ee92d1b76c6652f50df1668159a55db6dc9` |

配布commitはこの結果・実生成物・取得receiptを追加したcommitであり、上記実行sourceへ付け替えない。開始時にremote main029ce9、管理e166、対向b6eを確認した。owner native runtime21fileとbridge、管理15fileは前回の実管理789のbytesと一致した。[byte照合](management/runtime-byte-reconciliation.json)。変更は開発検証toolと文書だけで、Text／VAEの数値実装・独立API・原寸graphは変更しない。

## manifestと数値規則

採用manifestは696,123B、SHA-256 `420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405`。内部RMSNorm2箇所×24blockを元Torch CPUのAVX2・FP32 cascade集計順へ揃えるrecipeを持つ。元assetと実行graphのSHAを別に保持する。最終Hike RMSNorm／model／Tokenizer／mask／合法入力域／元gate0.001は変更しない。[数値規則・実行source対応表](HANDOFF.md)。

旧全512有効ID FAILは**解消済み**。同じ独立参照と全2,097,152値を比較し、maxAbs8.52346420288086e-5で元0.001 gateを満たした。旧FAIL値0.0016480088233947754とreceiptは履歴として保持する。STATUS／TEXT-RESULT／旧RESULTにも現在の解消先を追記した。今回、新しい数値参照生成やText再encodeは行っていない。

ブラウザ受入の区別：新manifest420eでのHello world plain／同512 IDs（mask3有効・509無効）は789で実NN・管理保存・取消復帰まで合格済み。長文plain全512有効と全512有効IDは通常SDKの実ORT WASMで合格した。**新manifestで全512有効IDをbrowser WorkerからNN実行する別ケースは未実施**。旧graphの9case結果も、新manifestで9case再実行済みと書き換えない。

## 管理での実選択と現codec

[固定source run](final-run/receipt.json)は既存の実資材28件をFile Mapへ登録した。prepared27件は実file-backed Blob、6.7GB原modelは既存のbounded positional readerを使う。旧configure互換を確認後、新420eをconfigureし、戻りcapabilitiesの24 `graphBindings` がnative inspectorの期待値と完全一致した。plain／IDの構成済みsupportもtrueだった。

構成確認ではmodel／graph本体を読まず、全hash再計算も行わない。通常NN実行時の元asset／実行graph hash検査はnative loaderに残る。今回の新しい構成成功を、資材全hashやNNの再受入として扱わない。

現codec正本 `docs/shared/inference/tensor.mjs` は10,894B、SHA-256 `7a15d721b1bab60cdade8723fd1c4d543a142d236cf2e59b63f1ba33ba14ed78`。実管理workspaceのbuild／readへ同じcodecを明示注入した。

- 実長文WKT8,390,098B／SHA18ed9859…c00aを管理capture→package保存→実disk再選択→readへ通し、全2,097,152 word、mask512、model／Tokenizer、`umt5-final-rmsnorm-f32-v1`、外側traceを一致確認。native WKT再保存bytesも原本と同一。
- 既存P2 normalized mean128値は、供給された `wan21-comfy-f32-v1` markerを保存・読戻し後も保持。追加の正規化・復元は0。
- graphBindings／採用設定／source情報は外側traceへ置き、strict native context／latentContractへ管理fieldを追加しない。
- frameProcessingを持つ実source-F4 WKTは未供給で、今回の往復は `NOT_CHECKED`。現codecのframe／sourceContext保持は、byte不変と既存のcausal-tail回帰試験を再利用した。新しいframe／slotを作って実入力の代用にしない。

正本packageは [長文](final-run/plain-long-conditioning.management.zip) と [normalized mean](final-run/normalized-mean.management.zip)。管理UIのreference copyや旧codec defaultは別経路として残っているため、この明示登録の成功をUI全体の切替完了へ拡張しない。管理担当自身の別環境ACKも未取得。

## 最新P4の通常接続

旧48ffが要求していたmarker差分は、最新版b6eでは解消済み。canonical markerが `umt5-final-rmsnorm-f32-v1` になり、旧 `encoder-final-rmsnorm` は追加legacy aliasである。Text出力を改名せず、RMSNormを再適用していない。

[package回収記録](package-to-p4.json)の実WKTを[固定source P4確認](p4/normal-contract-nn0.json)へ渡した。取得したsource／runtime assets71件を固定Git bytesと照合後、実通常 `checkExecutionSupport` のHIGH／LOWがtrue。対象は `postSelfAttention` block0、residual LC `[2,5120]`、timeAct1 C `[5120]`、contextなしというmetadata要求である。

実 `snapshotP4NativeConditioning` とprotected capture／snapshotで全2,097,152 word、512mask、model／Tokenizer、最終marker、独立buffer所有を確認した。wrong marker／Tokenizer欠落は拒否された。verification flagsはfalseのまま保持する。通常入力に参照・gate・品質receipt・固定prompt hashを要求しない。

この確認は**通常metadata対応判定とnative入力受理**まで。residual／timeAct1の数値実行、model File読込み、4096→5120投影、cross-attention、FFNは実行していない。これらを今回のP4数値・資源受入として報告しない。

## 実generated sampleの取得範囲

[取得状況](sample/availability.json)と[原receipt索引](sample/index.json)を保存した。実sample2件はどちらも1179B、float32 NCTHW `[1,16,1,2,4]`、meaning `wan21-raw-generated-sample:v1`、同じ元producer群、正しいVAE decoder binding、Diffusion所有 `restored` を記録しており、既存Rectでdecode可能なshapeである。

| 元実sample | whole WKT SHA-256 | 当環境の実bytes |
| --- | --- | --- |
| controlled N5／L3 | `c9fb6541b92ff5ea3b81b4decd4b29073aace11b5b9794810d826b34e5be7dd4` | 未取得 |
| real L512 recovery | `cf7ef51123233101efc0191bfd48338008cfae703c828d3ba4fc684d27521c2d` | 未取得 |

保持ファイル、ZIP内WKT／小payload、receipt JSON／JSONLを確認したが、原本や全128raw値は回収できなかった。[既存原本の受領依頼](https://github.com/Kushyameln01/kushyameln-works/pull/14#issuecomment-6643441625)を返した。receiptのhashからpayloadを復元したり、synthetic fixture／meanで代用したりしていない。**実sample decodeは未実施**。新profile／再exportは不要で、追加復元とmean改名も行わない。

## 検証と資源

変更境界のsource／CLI／実管理storage・取消controlは21/21 PASS、skip0。管理source取得の一覧欠落を防ぐ負例を追加し、固定Git由来の4root・全15file closureをimport前に検査する。新しい数値gateではない。native coreの数値参照と原寸VAEの合格は元scopeで再利用する。

固定adoption runは42.685秒、Node自身のrusage peak RSS270,376,960B、元model readCalls／readBytes0、reader closed=true、queue disposed／store0。P4入力確認区間は7.155秒、Node lifetime peak RSS602,480,640B。後者の区間時間はsource取得検査の前処理を除く。どちらもNN0／新Worker0で、全体端末のRAM予算やNN速度の測定ではない。新規取消やORT session終了はこのrunの対象ではなく、既存scopeを再利用する。

初期のstatus期待値誤り、Node Blob.sizeの4GiB wrap、旧manifest選択の拒否、親の完了前読取りは[attempts](attempts/)で区別する。元modelの実fstat sizeは正常で、破損や再downloadとして扱わない。precommitの [run-positional](run-positional/receipt.json) と、正本の固定source [final-run](final-run/receipt.json) を付け替えない。

未受入は実raw sampleのdecode、frameProcessing実WKTの今回往復、全512有効の新browser NN、P4数値演算、管理UI／別環境ACK、管理81大payload保存・全体運用。原寸VAE再export・全面再推論・LoRA送付・merge・Pages公開は実施せず、生成READYは更新しない。基点の全Python52/53とLoRA公開台帳不整合も別残件のまま。再現方法は[REPRODUCE](REPRODUCE.md)、受渡し契約は[HANDOFF](HANDOFF.md)を参照する。
