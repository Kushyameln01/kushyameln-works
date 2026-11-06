# 正式LoRA DATA bridgeの受入結果

**正式82b DATA → 管理必須native入口 → 共同snapshotの接続を、PARTIAL診断の制御scopeで受け入れた。**
管理実装checkpointは `235da572b9547d2f4ea027da5e6377eb9f0a970d`。
branchは `codex/ai-connection-e0-e4`、[Draft PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)。
[固定API文書](https://github.com/Kushyameln01/kushyameln-works/blob/235da572b9547d2f4ea027da5e6377eb9f0a970d/docs/shared/ai-connection/API.md#formal-lora-owner-data-phase-bridge)、
[再現手順](REPRODUCE.md)、[機械可読採用記録](RESULT.json)を同じ差分に含める。
最終配布commitはこのcheckpoint以降の証拠追加commitで、実装113ファイルのbytesは変更していない。

取得した最新引継ぎ本文はPR #2の `82cd9bb3d6792fa20a5305f52198efca5a30459f`。
`MANAGEMENT_ADMISSION.md`、`HANDOFF.md/json`、`CONFORMANCE-CASES.json`、管理0260読戻しと
証拠台帳など15原本・300281 bytesをGit objectへ照合した。取得時の「正式phase bridge未受入」は
原本の記録として保持し、今回の管理側受入と区別する。

| 用途 | 固定commit／版 | 変更 |
| --- | --- | --- |
| owner DATA実装2module | `82b21f09cb63926543181b16f0e97ebc6b9fa6be` | byte exactで管理配下へ配置。32961B / `ddf57f4c76333ada1ddf93cf238e5f4ea6219b39afd5dc4d567213667a7d897e`、9909B / `e7dd99d570c666969d76e93747998f3e1c20ba64d9e3b9d1b5f7a19e05aa6b17` |
| LoRA SDK・canonical adapter・merge kernel | `fc2789a0f649e33f15eb13750e6a983b5c52d170` | 変更なし |
| Diffusion consumer | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` | 変更なし |
| catalog／規範 | `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`、文書 `1.0-draft.1` | 8343B / `14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c`を維持 |
| 新計画 | `0fb553fd081d3bcbbad4ead7accd165679f77d34` | 既存規範・担当境界を維持 |
| 保存codec | `2bdca59ea78580d4fe7a9d31a8de33209b64d029` | 前回採用を維持。native pinへ代入しない |

新しい外側 `createLoraDataPhaseBridge` は、実bytesを検査したruntime proofを必須とし、
既存 `createNormRequiredLoraExecution` を内部から利用する。owner原本のpreflight全patch・全source dtype、
実validation後のcheckpoint、実公開・cleanup後のpostpublicationを順に渡す。
raw DATA、複数patch、observed/presence/originsと任意metadataを保持し、環境・referenceの
事前宣言は別の管理入力へ合成する。source storageのFP8/F16とprepared F32を混同しない。
数値演算、mapping正本、独立互換性判定器、別queue・snapshot・package・cacheは追加していない。

`norm-bindings.mjs` では正式DATA経路に限り原観測と取得元を同じ `evaluateEdge` へ渡す。
例えば `observed.target.dtype` が欠ければ `UNVERIFIED/BLOCKED`、F16と観測済みなら
`INCOMPATIBLE/BLOCKED`。同じ宣言でも原観測をF32へ補完しない。
契約一致・必要数値receipt未取得の通常判断は `COMPATIBLE / NOT_VERIFIED / BLOCKED` を維持する。
段階別declarationの進行許可は、後段receiptや生成受付の許可を表さない。
比較path・根拠版・理由は [判断例](evidence/judgment-examples.json) と実native証拠内に保存した。

実checkpointでは最初から `phaseBinding.bound:true` と実outer validation／snapshot targetを要求する。
commit直前にSDKのinput/application revision、管理revision、resource generation、outside consumer
namespace/tokenを別々に照合する。公開後はcoordinatorのbrandとactive published lifetimeを使い、
closed staging contextのcurrentnessを流用しない。監査retryでは管理debug historyだけを除き、
同じnative receiptを保持する。欠落targetを後のpublicationで埋めることはない。

| 検証 | 結果とscope |
| --- | --- |
| 全回帰 | **407/407 PASS、fail0、skip0**。旧371件と追加36件。試験中81実装／試験moduleのhash不変 |
| source・loader・正式bridge境界 | 41/41 PASS。実bytes／brand、全patch原観測、SDKとoutside tokenの独立失効、比較不足、bound checkpoint、公開後retry。control fixtureの成功を実数値へ広げない |
| 実native共同LOW失敗 | 旧joint両3.625 → 新HIGH実commitでHIGH2.375/LOW3.625 → LOW実commitの制御失敗 → HIGH実rollback、両3.625。新joint非公開、旧snapshot fact保持、旧selectionCurrent=false、両元task終端／解放・queue active0 |
| 実native公開後監査失敗 | 実finalize・prepare release後にoutside token変更、実 `LORA_DATA_CONSUMER_CHANGED`。公開fact保持、`RECOVERY_REQUIRED`で新規work拒否。token復元後、同snapshotの監査復帰。native commit2回のまま、rollback0、両feed3.625 |
| source固定・レビュー | 実装checkpoint113ファイルがGit bytesと一致。独立レビューPROCEED、未是正の欠陥なし。`git diff --check` PASS |

実nativeのsource/baseは合成BF16 rank128とimmutable F32。SDK・LoRA Hike・ORT WASM・projection Hike・
consumerは23原本を照合して実行した。LOW失敗caseでは両side・両revisionの計327744 prepared値を
独立比較し、weight81920＋bias16を16出力だけで代替していない。公開後caseも別に実行した。
実行時は未commitの管理bytesであったため、後から `CHECKPOINT-SOURCE-RECEIPT.json` で実装checkpointへ
照合した。初回全回帰は試験記録項目の同時更新により1件不成立となり受入に使わず、全file凍結後に
単独2件と全407件を再実行した。ログと無変更の元JSONをgzipで保持し、全hashを
`EVIDENCE-MANIFEST.json` に記録している。
両runnerは最後にnative資源をdisposeしており、記録は過去の受入証拠である。
`currentLiveAdmission:false` を保持し、現在の実行準備が整っているとは扱わない。

変更ファイルは、`adapters/lora-data-phase-bridge.mjs`、`adapters/lora-data/`、既存
`norm-bindings.mjs`／`adapters/index.mjs`／`API.md`、新runner・3つのDATA試験・共同試験・
既存loader試験、本directoryの計画・原本／checkpoint receipt・結果・再現手順・証拠。
既存20件・6数値receiptは元commit／scopeで再利用し、今回の実行へ付け替えていない。
旧bridgeの結果は回帰専用で、正式DATA受入の代用には数えていない。

未受入は、真正base／実Fileの新しい正式bridge取引、production hidden・全query/head/stage・全model session・
組合せ資源予算、selected-weight自体の `N-ARTIFACT` 保存受入。既存output16 packageをその証拠へ流用しない。
Rectの実NN dispatchも従来の原本assets・owner receipt待ちを維持する。`generationReady:false`。
LoRA担当へはこの固定APIと共同2receiptの確認、Diffusion担当へは独立consumer tokenとcopy所有権の維持、
VAE/Text担当へはcodec採用済みとRect実dispatchの別受入を確認事項として残す。
