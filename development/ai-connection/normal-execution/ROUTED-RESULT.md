# 通常入口・workflow要求・owner接続の追加結果

2026-11-02 JST。共通shape導出と通常入口に加え、VAEのRGB／latent要求とP4の3入力を既存の判定・queue・snapshotへ接続した。**管理実装と変更境界の検証は完了。新VAE／P4の実NN共同受入は、資材保持環境からの返却待ち**。生成READYは解除しない。

## 配布・実行sourceとAPI差分

branchは `codex/ai-connection-e0-e4`、[Draft PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)。最終配布SHAはこの記録を含むcommitとしてPR／完了報告に記載する。今回の実行sourceは **`a54382935423186dd3121d61a8b886b58cb08612`**。後続の診断CLI／文書配布と、実行したsourceを区別する。merge・Pages公開は実施していない。

| 用途 | 固定native source／契約 |
|---|---|
| 受入済みmean通常実行 | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`、API `diffusion-models/0.1`、実buildはreceiptに保持 |
| 新VAE通常候補 | 配布 `498eb25f027666e3cc661a5851288e4aabf39f0a`。owner NN source `b2541fd2e3b7edcecd810f5215b1bd9f86afc0f4`、監視修正 `94e1d5f2a28880a514bdec53059342a03e04a83f`。API `works-ai-1`。`works-inference-v1` は登録したclient／worker sourceのenvelopeで、native BUILD_IDのexportではない |
| 新P4通常候補 | 配布 `5278069ee0b72a9f2d684cdc8075e460187a7acf`、実行source `30e283bb115741af6b475e9bdc41700a4e564053`。API `diffusion-models/0.1`、build `diffusion-models/0.1+2fb82c63758d657932ffdf063f438c7ad183501b3f1ae72ed24d0fe2b2cd1ae8` |
| 共通規格／shape | `works-module-contract/1.0-draft.1`／`bernini-ca69274-b5a4321-wan21-shapes-v1`。後者は導出規則であり、実行Profileの通過一覧ではない |
| 新holdingのFile codec | 固定498 `tensor.mjs`、9,104B／SHA-256 `e200fef69be3909a13bc91a59743681df1072817eadc7c1865717afe0c3c9f8e`。この入口だけで選択し、既存2bd codec／P2 pinを変更しない |

新規ファイルはVAE／P4 facade、workflow router、holding runnerとbrowser、別のpost-normal診断CLIおよび各テスト。既存変更はnormal hostへのnamed-input追加、API追記、関連テストと文書。演算・層mapping・native APIを管理へ複製していない。[固定API](https://github.com/Kushyameln01/kushyameln-works/blob/a54382935423186dd3121d61a8b886b58cb08612/docs/shared/ai-connection/API.md)と[API差分](API-DIFF.md)を参照する。

独立診断CLIの固定sourceは `3fedbb52fca42a6c8a5a53984981a5d4fe6ca382`。この追加で通常runtimeは変更していない。

- 通常要求は既存descriptorのoperation／model／target／shape／dtype／axes／意味／normalization。source・build・kernelの証跡や独立参照・gate・事前PASS・数値receipt・E4を通常利用者へ要求しない。実source／capabilities／構成の確認はservice bootstrapとowner内部で行う。
- `createNormalVaeOwner` が実 `capabilities({operation,input})` へ委任する。`tensor,inputDescriptor,binding` を保持し、構成変更で支持・runtime観測・旧結果を失効する。宣言支持とruntime.verifiedは別。
- named形式 `{operationId,artifacts:{residual,timeAct1,conditioning},parameters?}` を追加。3つの独立artifactと既存evaluateEdgeを、一つのqueue／snapshot取引で扱う。secondary tensorをmetadataに詰めず、mask／未知binary metadataはowned handleで保持する。
- `createNormalP4Owner` が実 `checkExecutionSupport` とsame-realmの通常runへ委任する。未対応要求の照会だけでmodelを開かない。prepare前のprofileRefはbuild＋operationに束縛した管理sidecarで、native Profileとは呼ばない。実feed registryのProfile／header／epochはprepare後の別観測。
- `queryWorkflowOwners` は一つの共通shape planから明示したownerへ要求を渡す。generic latentからmean／sampleを推測しない。既知RGB／latentが単に管理未bindingのままになる経路を解消した。未確定媒体に依存する要求だけを保留する。

## 固定sourceによる通常実行・照会結果

| ケース | 実結果とscope |
|---|---|
| 現sourceのRect mean通常normalize→restore | [EXECUTION_COMPLETED](current-source/mean-normal/result.json)。`[1,16,1,2,4]`、native2回、実Worker2生成／2終了／live0。参照・gate未読、`diagnosticState:NOT_REQUESTED` |
| 同結果の別診断 | [DIAGNOSTIC_PASS](current-source/mean-diagnostic/diagnostic.json)。各128値が既存独立Python F32とbyte exact。roundtrip最大 `2.384185791015625e-7`、元gate `2e-6` 内、失敗0。native0で通常結果は不変 |
| 現sourceの対象取消／旧結果／解放 | [LIFECYCLE_VERIFIED](current-source/mean-cancel/result.json)。Aの実Worker生成後に停止・元Promise終端・解放、実Bがactive中の旧AをTARGET_MISMATCHで拒否、Bは正常完了。Worker2／2終了 |
| 共通RGB／latent→実VAE API | [WORKFLOW_QUERIED](current-source/vae-query/result.json)。known Rect RGBとmeanはownerのMISSING_ASSET、目標81frame latent `[1,16,21,60,104]` はDESCRIPTOR_UNSUPPORTED。資材不足をshape非対応へ言い換えていない。browser実行・Worker／native0 |
| VAE実資材不足の入口 | [BLOCKED／LOCAL_ASSETS_MISSING](current-source/vae-missing/result.json)。実入力Fileは存在するが読取0、browser／native0。早期preflight結果にembedded manager proofはなく、固定commandは[外側process記録](current-source/PROCESS-LEDGER.json)で別に保持 |
| P4の具体L512宣言 | [owner SUPPORTED](current-source/p4-l512-query/result.json)、3edgeはCOMPATIBLE。model File未配置によりRESOURCE_NOT_READY／dispatchSupported:false。実tensor payload／model読取／prepare／native／Worker0 |
| 新Text marker→P4 | [UNSUPPORTED_NORMALIZATION](current-source/p4-l512-marker/result.json)。actual Textの `umt5-final-rmsnorm-f32-v1` と、30eの `encoder-final-rmsnorm` が不一致。管理で別名変換しない |

P4の最初の照会ではcapabilityの可変Lをnullのまま要求へ渡して拒否された。[元の負例](current-source/p4-query/result.json)を保持し、具体L512を明示した別要求で再照会した。これはdata生成やshapeを小型化する処理ではない。P4宣言照会を実Textの受領・実行証拠とは扱わない。

## 再利用証拠と新規検証

初回の[4667／f1限定受入](RESULT.md)は元sourceのまま保存。今回normal hostの複数入力対応を変更したため、同じ既存Rect入力・native5fで現在の接続境界だけを再検証した。source a543の新しい通常／診断／取消receiptを別に追加し、旧結果を新SHAへ付け替えていない。

VAE498は公開38file、index32・production16を含む[230項目を実bytes／hashで確認](new-owner-returns/vae/VERIFICATION.json)。P4は[117 source pinを照合](new-owner-returns/diffusion/SOURCE-PINS-VERIFIED.json)し、実bootではBUILD_SOURCES113＋generated build-infoを別検査した。ownerの既存NN結果は元実行source／scopeで再利用し、管理の実NN共同受入へ拡張しない。私有model／graphの取得・再export・新oracle生成は0。

最終回帰は[634/634 PASS、FAIL／SKIP 0](verification/FINAL-ROOT-SUITE.log)、実行中173fileのbytes不変。変更境界と実resultは[独立レビュー](verification/INDEPENDENT-ROUTED-REVIEW.md)でも確認した。既存APIの83,206B prefixはbyte同一で、診断入口／採用済みnative pinを置換していない。

別CLI `diagnose-normal-holding.mjs` は通常完了後のsaved output、既存reference／gateだけを読む。通常outputのwhole／payload hash、全inputのpayloadとwhole-file SHAのcohortを先に確認し、固定7ee owner comparatorへ委任する。値が同じでもmask／model等のWKT headerが異なるcohortは拒否する。raw F32／JSONの外部metadataはcaller declarationであることを保持し、本人性を自動認証しない。正常／数値FAIL／NOT_VERIFIEDを通常完了と分け、nativeのdiagnoseによる再推論は行わない。旧855 PNG基準はP2 pipeline基準の再利用であり、restored mean専用の新decoder oracleではない。

## 資源と未受入

実meanのHike容量はoperationごと1,114,112B、arena1,024B、入力／出力copy各512B。VAEの6,144BとP4の8,450,560Bは1論理input payloadの許容量で、copies／ORT workspace／host／全工程RAMを含まない。host／allocator／ORT／全工程peakは未測定null。CLI時間とNN時間を混同せず、[process記録](current-source/PROCESS-LEDGER.json)を保持する。

[資材recon](current-source/PRIVATE-ASSET-RECON.json)では既存receiptのencoder／decoderBody／conv2 pathsがENOENT、filename検索でも該当graph／Bernini原本／saved-tailは見つからなかった。他環境の絶対pathを取得済みとせず、[固定holding手順](HOLDING-REPRODUCE.md)をVAE／Diffusionへ渡した。通常decode、取消復帰、必要なP4実取引と保存済み出力の別診断を保持環境で実行する。取得ACKのためだけの再推論は不要。

未受入は新VAE／P4の管理経由実NN・数値共同返却、Text／P4の正規化契約整合、LoRA新canonical通常adapter、任意shape／LoRA、元sample実媒体・81frame全workflow、本番全工程／全体資源。LoRAなしbaseへLoRA固有条件を強制しない。新native pin／codecを採用済みP2／旧N2へ一括置換していない。

`generationReady:false`、`load/predict/sample=NOT_READY` を維持する。source取得ACK・送信側GitHub読戻し・各owner本人の取得ACK・実行受入は別状態。[独立レビュー](verification/INDEPENDENT-ROUTED-REVIEW.md)、[API差分](API-DIFF.md)、[再現手順](HOLDING-REPRODUCE.md)を参照する。
