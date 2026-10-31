# E0 source baseline supplement

版: `ai-connection-e0/3`。確認日: 2026-10-31 JST。前回A0の [SOURCE-BASELINE.md](SOURCE-BASELINE.md) と [SOURCE-RECEIPT.json](SOURCE-RECEIPT.json) は履歴として保持する。本追補は実装計画0.2-draft.1に記載された新成果の取得を扱い、前回の読了・fixture数・native sourceを新成果の取得証拠として使わない。

## 今回の正本

- 実行順: Page `page_cfdb3e2026608191964eb24af5c64e61` の実装計画0.2-draft.1。実取得本文は `/workspace/work/ai-connection/page_cfdb3e2026608191964eb24af5c64e61.md`。
- 接続規格: Page `page_65b303c9bc708191a7e48c78b51c35a7` の総合仕様1.1-draft.1。実取得本文は同workディレクトリの `page_65b303c9bc708191a7e48c78b51c35a7.md`。
- 今回添付の実装計画0.2-draft.1は32,624 bytes / SHA-256 `9ceb3f2538f5145edfc697be5ea9b7cb8db28db2d250f01912c8d6b67f2e8897`。Pageと添付は同版名でも本文を同一視しない。Page E1は`coverage:PARTIAL`、添付は`coverage`と表記する差がある。今回要求された現行Pageを優先し、既存添付の代替読了とは報告しない。
- 総合仕様のPageと旧添付にはnative meaningの`:v1` suffix等の差がある。native実装本文の`wan21-raw-generated-sample:v1`、`wan21-normalized-posterior-mean:v1`を維持し、管理ラベルに合わせた改名を行わない。

計画の成果報告、原本の取得、source identity照合、実export/署名照合、単体実行、共同受入、全model推論、所有者合意を別状態で記録する。

## 参照版と取得状態

repository: `https://github.com/Kushyameln01/kushyameln-works`。

| owner / source | 完全commit | 取得方法と確認範囲 | 残る不足 |
| --- | --- | --- | --- |
| 管理 / M1 M2 | `21e77f292c2540975d1846e7efe320fe89625e23` | local Git object存在。32 filesを`git show`で取得し、全blobを独立再計算。全1015 blobのtree一覧も保存 | remote GitHub GETは422。local正本と公開済みを同一視しない |
| Text/VAE | `54bfeadbd83f1fea074c503c0e05ec478aba5cfb` | GitHub recursive tree取得1227 entries、truncated=false。公開API/codec/worker/Hike/ORTとG1C-MAPPING/F=1報告を含む68 files取得・blob照合 | 新profileのモデルbundle原本は未取得。受入報告と今回の実推論は別 |
| LoRA実装 / 配布 | 実装 `89b489c6f2595ebff8836fe90b18fc94e3ea086b` / 配布 `2bba90785292e42a0c7c8756685b0d8b128b2dcf` | Page原source text4件に加え、network追加許可付き直接git fetchで配布commit取得。完全archiveの全1020blobを独立照合、実API/exports取得。今回74/74再現test PASS | 実base共同診断/実model session/全target/全生成は未受入。元Pageの未push記載は過去状態として保持 |
| Diffusion新PARTIAL consumer | `f522d9aeff313558c4ef83022a340af9a4c21391` | 計画本文に完全commitの報告を取得。GitHub commit/tree GETは422 | DIAGNOSTIC_API/registry/provider/sink/consumer/source/build全文未取得。報告から署名を補作しない |
| Diffusion core | `9023329b8d803306abcdd9342f24c01ba0df2676` | 初回connector GET422の後、network追加許可付きの完全commit直接git fetchに成功。全1085 tracked blobをgit archive展開・独立blob照合。原提案本文と既存0.1実装を取得 | 次期0.2契約は原提案、未実装/未合意を維持。f522の新PARTIAL consumerを取得した意味ではない |

初回のdefault sandboxでのshell `git fetch` は`proxy:8080`接続不可で失敗し、認可済みGitHub connector読取りGETで継続した。後から利用可能と判明したnetwork追加許可付きexecにより、remote branch一覧とDiffusion branch `679a72d7f53e31bccecbee46b4e2fe559a4e0aba` を取得した。このbranchは旧公開LoRA I/Oまでで、f522/902を祖先に持たなかった。続く完全commit直接fetchで902のみ取得成功、f522はremote `not our ref`。remote LoRA branchはこの一覧に存在しなかった。proxy迂回や本番workingtreeのnative変更は行っていない。過去のconnector422は取得不能の最終判定にせず、新しい取得証拠で本追補を更新した。

## 取得物の配置とidentity

中間原本: `/workspace/work/ai-connection/e0-native/`。native製品sourceへ上書きしていない。

| directory | 内容 | receipt |
| --- | --- | --- |
| `21e77f/` | 完全commitの共通規格/validator/判断器/testと既存証拠32 files | `e0-receipts/management-source-receipt.json`、`management-tree.json` |
| `54bfead/` | 固定Text/VAE source closureとAPI/profile/報告68 files | `e0-receipts/textvae-source-receipt.json`、`textvae-tree.json` |
| `2bba907/`（`lora-distribution/` alias） | 最初に取得したPage contract/registry/receipt/RESULT原source text4件の履歴 | `e0-receipts/lora-text-source-receipt.json`、`lora-page.json` |
| `2bba907-source/` | 後から完全commit直接fetchで回収したgit archiveの全1020blob、LoRA関連68 filesのscope receipt、実API | `e0-receipts/lora2bba-source-receipt.json`、`lora2bba-tree.json` |
| `9023329/` | 完全git archiveの1085 blob、うちDiffusion関連157 filesをscope receiptへ収録 | `e0-receipts/core902-source-receipt.json`、`core902-tree.json` |

Text/VAE68件のうち40件はpinned commitのconnector UTF-8本文を取得、28件は既存local bytesがpinned remote treeのGit blob SHAと一致した場合だけ再利用した。ORT WASMの大容量再取得は行わず、同一性を検証してcopyした。各fileのbytes、Git blob SHA、SHA-256、取得方法は機械可読receiptへ記録。保存した全68fileのGit blobを独立再計算し、remote treeと一致させた。21件の静的import/new URL参照検査で必要fileの欠落0。これは静的閉包確認であり、Worker/ORT/モデル実行の成功ではない。

## Text/VAEの実exportとnative境界

上記54b sourceの実本文で確認した。

- `docs/shared/inference/api.mjs`: `API_VERSION='works-ai-1'`、`createInferenceAPI(options={})`、`bindInferencePort(port,api)`。`createTextEncoderModule/createVaeModule`とcodecのpublic exportを再export。
- `text-encoder-api.mjs`: `validateTextEncoderInput(input)`、`createTextEncoderModule({client,ownsClient=true}={})`。capabilities/configure/encode/cancel/dispose。plain textとIDs/maskは排他的。設定はparsed manifestとlocal `Map`。
- `vae-api.mjs`: `createVaeModule({client,ownsClient=true}={})`。capabilities/configure/encode/decode/cancel/dispose。manifest kind`wan21-vae-profile-v1`/schemaVersion1。consumer側generated sample宣言と実生成受入を分離。
- `client.mjs`: build`works-inference-v1`、入力clone・結果transfer、busy拒否。取消は専用Workerを終了し元Promiseを失敗終端。module cancelにjob targetがないため、管理側barrier前に次jobをdispatchしない。
- `tensor.mjs`: `snapshotTensorMetadata(t)`、`requireTensor(t,expected={})`、`async encodeTensor(t)`→Uint8Array、`async decodeTensor(value)`→新しい所有typed array。decodeはUint8Array/BufferまたはArrayBuffer。Blobを直接渡さず明示的に`arrayBuffer()`を取得する。

codecはmagic`WKTSR001`/schemaVersion1。dtypeはfloat32/int32/uint8/int64。全producer、decoder binding、context frame番号/時刻の配列を保持するが、top-level evidence、管理snapshot/trace/任意拡張は自動保存しない。strict context/latentContractへ管理fieldを挿入しない。

54bのAPI/client/codecは前G1Cと同じblob。新しい`G1C-MAPPING.md`とF=1受入報告をAPI変更と混同しない。F=1・16×16の報告profileはRGB`[1,3,1,16,16]`⇔raw mean`[1,16,1,2,2]`（64要素）。Diffusionの既存128要素mean operationへそのまま適合とはしない。shape/元model/profile/証拠の実値は取得したprofile原本を使い、F=1の数値受入を実参照媒体へ外挿しない。

## LoRA v2原契約と段階的なsource取得

取得Page: `https://chatgpt.com/space/page_4988393f36e88191bcf7c0823139d1f3`。current sequence3。Page上のarchiveは255,467 bytes / SHA-256 `10e4993c3e5c6e6e4ca7cc7bed4bae10cdc21e022b1a8b85d4ec12e95541f1eb`。Git bundle基点はmain`029ce9336a61e53bc6172fa4a7b7189b15f2efa0`、bundle SHA-256 `d1534290a4757f71b3f54878ac63381f063c52ed05962b79c3a47a08edcbf21b`。これらは取得したimmutable receiptの報告値で、archive/bundle実bytesは未取得・未再hash。

| 原source path | bytes | SHA-256 / 今回照合 |
| --- | ---: | --- |
| `development/lora/contracts/connection-contract-v2.json` | 13748 | `87e132af1739114f171254888c04f3050df27c47cd02e92fd67bc5babe4ac6d2` / 一致 |
| `development/lora/contracts/registry-correspondence-v2.json` | 11895 | `a3a0a6fd7c5d71cbf8c2e4b73f83d4581df47c1a5b8ab09a9cb48778ce81b3ab` / 一致 |
| immutable delivery receipt（保存名`handoff/DELIVERY-RECEIPT.json`） | 1799 | `8862eb09b9a30862ad37e8b24dab332b7b3529ef1928bd4277b3be01da295492` / 一致 |
| `development/lora/A0_L1_RESULT.md` | 7981 | `a1a133cf36daa78bc952b553deec4d54b298ec430d7456933101ab8aed3a8148` / 一致 |

保存名はPage/receiptに示されたsource pathへの対応で、receipt自身のarchive内pathは未確認。初回のGit commit/tree/実.mjs exportsとのbindingは未確認だった。後続の直接git fetchで取得した完全commit sourceと対応する契約/registry/RESULTのbytesを独立照合し、現在は実source/exportsを確認済み。immutable receiptの配布記録は原文のまま保持する。

原contractの宣言: `lora-connection/2.0-draft.1`。`createLoraV2({folder,sourceFactory,kernel})`、sdk-v2/planner-v2/loader-policy/v1-adapter各entrypointを示す。v1 adapter宣言は`adaptV1Registry/createV1SinkAdapter/adaptV1Consumer`。binding.kindのruntime-input/initializer/hike-parameter、FULL/PARTIAL、loader policy`comfy-lora-b5a4321-linear-diff-v1`、旧local revisionと管理revisionの分離、copy/leaseとrelease/rollback条件を保持する。

上記JSON宣言だけを読んだ段階では実source exports未確認だった。Pages経由ZIP binaryは未回収のままだが、その後に許可済みnetwork付きの完全commit直接git fetchが成功し、元sourceの取得不足は解消した。Sediment専用download_fileへFile Service IDを流用せず、既存proxy経由のGit取得で正本を確保した。実exportsは下記追補へ固定する。

## 未決edgeと後続の再開条件

| edge / task | 今回進められる範囲 | 不足と再開条件 |
| --- | --- | --- |
| E2 Text/VAE↔管理 | 固定API/codec/native静的境界、所有権/ID/error/metadataのadapter、必要差分のtest | 実model数値推論は別scope。新媒体profileのbundle/参照未取得を隠さない |
| E2 既存Diffusion部分operation | 前A0で取得済み0.1公開契約とsource/buildを固定した経路 | f522新consumer口へ前0.1 sourceを付替えない |
| E1 LoRA v2↔Diffusion PARTIAL | LoRA原source/contract/registry/実exportsの取得・74/74再現fixture、管理境界の検査 | f522実API/provider/sink/consumer/buildを取得し双方を接続する。74件の合成baseと共同実baseは別scope |
| E3 queue | 明示owner/binding/revision、旧cancel/子readの失敗fixtureと管理実装 | 各nativeの実停止・再利用を別に受け入れる。未取得consumerの協調停止は未確認 |
| E4 package | 取得済み54b codecと外側descriptor/evidence/trace/snapshotの完全性 | 実generated sample producer/decode受入を保存fixture成功から認定しない |
| E6 64要素mean | F=1 native profile/schemaを宣言、現128要素境界を明示拒否/保留 | Diffusion所有の新profile/kernel/ABI/hash/数値参照の受入後に拡張 |
| E7/E8 | 取得した902原提案・core参照・既存0.1実装、容量阻害と未成立条件の整理 | f522新consumer source、元workflow実行版、固定precision/実graph/数値条件と実scope受入が必要 |

取得不足は独立Text/VAE・管理queue/packageの作業を止めない。原本受渡しを依頼する場合は、上記不足sourceと既に判明したarchive/file referenceだけを対象にし、同じ資料の読み直しや課金/設定変更を要求しない。

## 追補: 902取得後に確認した実exports/build

`docs/shared/diffusion-models/api/index.mjs` の実exportは`PROTOCOL_VERSION`、`MAX_TENSOR_ELEMENTS`、`BUILD_ID`、`createDiffusionModels({sessionId=crypto.randomUUID()}={})`、`attachDiffusionPort(port,api)`。factory返却は`{sessionId,request,cancel,dispose}`。workerFactory注入引数はない。

- native protocolは`diffusion-models/0.1`、buildは`diffusion-models/0.1+33d7c5c3f3865fb6cf68b85358e04d1d0f558ca362531cc14902667fcc0c850b`。固定receipt34sourceのSHA-256とaggregateを独立再計算し全一致。正本builderは同ディレクトリの`api/build-info.py`。このbuilderは書込み型で`--check`を実装しないため、取得原本を変えず独立読取り照合した。
- 実Workerは`api/worker.mjs`、Eulerは`kernel/euler.wasm`、schedulerは`scheduler/build/scheduler.wasm`。全native source/依存をarchive内の元相対配置で保持した。ブラウザでの実演算受入は本追補では未実施。
- requestはnative版/build/session/job/inputRevision/op/inputを明示。cancelは`api.cancel({sessionId,jobId,inputRevision})`、成功ACKは`cancelled:true,workerTerminated:true`。管理のresourceGenerationとnative inputRevisionは別に維持する。
- capabilitiesは`modelInference:false,partialOnly:true,loraApplied:false`。schedule/Euler/noise/flow/128要素mean変換/固定Q射影/LoRA原本I/Oが既存scope。`load/predict/sample`はNOT_READY、`linearProjectionF32`とf522の新PARTIAL consumerはこの902にはない。
- 次期契約原文は`development/diffusion-models/INTEGRATION_ADJUSTMENT.md`、版`bernini-integration/0.2-draft.1`。source_id/concat/RoPE/padding/handoffと次期envelopeの提案を実本文で取得した。第5節は`diffusion-models/0.2-draft.1`を未実装・未合意と明示する。この原提案取得だけで新operationを現0.1へdispatchしない。

全git archive TARは今回取得commitからローカル生成したもので、計画に記載されたZIPのSHA-256と比較しない。原sourceと完全commitの取得によって902の「原文未取得」は解消したが、f522取得、共同LoRA試験、元精度/full graph/全生成の受入は未達のまま。

## 追補: LoRA実source取得、再現検査、branch/PR

network追加許可付きの完全commit直接fetchで`2bba90785292e42a0c7c8756685b0d8b128b2dcf`を取得し、`e0-native/2bba907-source/`へ完全git archiveを展開した。1020 tracked blobの同一性を独立再計算し全一致。LoRA関連68 filesをscope receiptへ収録。モデル拡張（safetensors/onnx/pt/pth/ckpt/gguf/bin/f32/npy/npz）のtracked fileは0、最大資材は既存ORT WASM。元モデル/LoRA原本bytesを含まない。

実sourceで確認したv2 export:

- `sdk-v2.mjs`: `CONTRACT_VERSION`、`async createLoraV2({folder,sourceFactory,kernel:providedKernel}={})`。返却は`{contractVersion,sdkInstanceId,kernelInfo,inspect,plan,prepare,stage,cancel,release,recover,dispose}`。v2に`apply/detach`はない。
- `plan(input)`は`selection/registry/strength/loaderPolicyId/diagnostic`を捕捉する。`prepare(plan,{baseProvider,sink,blockRows=16,signal}={})`は所有F32 blockを要求。`stage(prepared,target,{signal,isCurrent=()=>true}={})`は構造化scope/identity検証とcopy/lease receiptを要求する。
- `planner-v2.mjs`: `validateRegistryV2(registry)`、`buildPlanV2({inspection,registry,diagnostic,sourceSha256,strength,loaderPolicyId,alphaValues={}}={})`。FULL/PARTIALとfull shape/row sliceを保持する。
- `v1-adapter.mjs`: `adaptV1Registry(registry,options={})`、`createV1SinkAdapter(sink,{registry}={})`、`adaptV1Consumer(target,options={})`。FULL/実initializer限定のv1境界を維持する。

今回、固定source rootから`node --test --test-isolation=none tools/lora/test-*.mjs`を再実行し**74/74 PASS、skip0**。記録は`e0-receipts/lora2bba-native-tests.log`。実Hikeと合成base/test consumerのscopeであり、f522実base共同診断・実model session適用・全生成の合格ではない。パネル12項目は元報告のままで今回未再実行。

ユーザーの全作業branch push/Draft PR依頼に基づき、新しい2branchへ原本完全commitをatomic/no-forceでpushした。既存open PRがないことを確認し、次のDraft PRを作成した。mainへのmergeやPages公開は行っていない。

| branch | 完全commit | Draft PR | 固定API |
| --- | --- | --- | --- |
| `codex/lora-connection-v2` | `2bba90785292e42a0c7c8756685b0d8b128b2dcf` | [#4](https://github.com/Kushyameln01/kushyameln-works/pull/4) | [CONNECTION_V2.md](https://github.com/Kushyameln01/kushyameln-works/blob/2bba90785292e42a0c7c8756685b0d8b128b2dcf/docs/shared/inference/lora/CONNECTION_V2.md) |
| `codex/diffusion-core-902` | `9023329b8d803306abcdd9342f24c01ba0df2676` | [#5](https://github.com/Kushyameln01/kushyameln-works/pull/5) | [API.md](https://github.com/Kushyameln01/kushyameln-works/blob/9023329b8d803306abcdd9342f24c01ba0df2676/docs/shared/diffusion-models/API.md) |

既存remote Diffusion branch679a72dと902は共通祖先a33b311から分かれ、互いにancestorではない。tree差分はINTEGRATION_ADJUSTMENT.mdとapi-adjustment/baseline-and-capacity.jsonの追加2件だけで、native source/kernel差分は0。既存branchをforce更新せず、新branchへ原本を保持した。f522の新consumerは今回も`not our ref`で未取得のため、こちらの新branchをf522の配布成功とは扱わない。
