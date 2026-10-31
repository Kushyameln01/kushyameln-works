版1.0-draft.1／2026年10月31日 JST。対象は管理、DiffusionModels、VAE & TextEncoder、LoRAの実装担当。全タスクは未着手として記載する。

**Goal**：事前定義した規範を管理の実行判定へ接続し、既存の診断成果を実接続で受け入れたうえで、元の入力・出力条件を保つブラウザ生成工程へ進む。

**Architecture**：各moduleのnative APIと単独利用を維持する。管理は宣言・identity・証拠・状態を規範と照合し、数値演算は各owner、LoRAの数値mappingはLoRA正本adapterへ委ねる。規範導入・診断接続と、本番計算の成立性検証を並行して進める。

**Tech Stack**：GitHub Pages、JavaScript ES modules、ブラウザFile/Blob、既存のORT Web WASMとHike WASM、JSON参照台帳、既存のqueue・artifact package・snapshot・cache。

**Spec**：[Profile総合管理台帳](https://chatgpt.com/space/page_7036da19567881918356235b7aa82b83)、[管理照合規範](https://chatgpt.com/space/page_7972cb392a3481918a1ceb0b7501bb76)、[数値規則](https://chatgpt.com/space/page_ecfe5b714e008191a7779e5cd2bad42c)を参照する。文書・JSON版は1.0-draft.1、固定sourceは `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`。総合仕様1.1-draft.2と[既存実行計画0.2-draft.3](https://chatgpt.com/space/page_cfdb3e2026608191964eb24af5c64e61)の条件を維持し、以下で次の作業順と受入条件を具体化する。

# 現在地と直近の到達点

4種類のProfile、12照合規範、10数値規則は文書・参照JSONとして成立している。管理runtimeへの読込みは未実施であり、JSON中の説明文やcomparisonラベルはそのまま実行できる判定プログラムではない。まず各規範を実際のnative宣言・receipt・管理状態へ対応付け、既存の判定経路へ接続する。

| 項目 | 再利用する現在の成果 | 次に埋める境界 |
| --- | --- | --- |
| 管理 | 28596717182e48aeb23c719c51b6e593edf4e496。209件、Chromium File制御、既存queue/package/snapshot/cache | 規範runtime導入、候補版の実接続、owner実取引とsnapshotの結合 |
| 管理採用組合せ | LoRA 0c27874908638afc748ea2455a2779a16736730b、Diffusion 438972f30242e0a3bc66edb8591f38eaa0fcd384、codec 2c171a09ccda65c54899f322ae490f1bfcaac6fb | 最新owner版は別候補として検証。API版の一致だけで採用更新しない |
| LoRA最新報告 | fc2789a0f649e33f15eb13750e6a983b5c52d170。実原本×実base PARTIAL20件と既存320出力、mean前後の共同診断 | 宣言と証拠の規範対応、管理経由の実取引、将来の全target consumer |
| Diffusion最新報告 | 5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3。3mean shape、実base診断、限定tiled Q/attention | 管理のRect採用、実QKV/全query/headと同時保持予算、本番predict/sample |
| VAE & Text最新報告 | 855f435120f08eb9e818e51281fc26f0e2633829。固定VAE profile、Text、実mean/RGBのcapture/package読戻し | 規範対応、管理経由のRect連結、必要実媒体profileと実generated sample |

既存20件の証拠照合と、管理が実baseで20件を新規実行することは別である。管理Chromium試験のbaseは `synthetic-manager-control-fixture`。既存の合格scopeを再利用し、変更した境界に必要な試験を追加する。

# 全工程で維持する条件

- LoRA製品入力はユーザー選択のローカル `.safetensors` File/Blob。過去4原本すべての取得を実装開始条件にしない。実base受入には、実際に使用するbase/graphと対象bytesに結び付いた正当な証拠を要求する。

- HIGH/LOWを一組とするlight/detail二種類の選択構成を保持する。各pair/sideを個別に受け入れ、現規格外の同時合成や既定strengthを無断追加しない。LoRAを使わない経路へLoRA条件を強制しない。

- 元sourceの81frame・480×832、latent `[1,16,21,60,104]` などの条件を診断shapeへ縮小して本番合格にしない。入力・resize・prompt・noise・schedule・precisionの変更は元要件からの変更として明示する。

- 共通化するのは宣言・規範・照合方法である。native field、method、hash名前空間、state表記を一律に統合しない。台帳IDをnative profileIdとして送信しない。

- LoRA full-shape/selected-slice、SDK/native registry、sink/consumer取引mappingの正本は `createDiffusionDiagnosticAdapter`。管理の `createAdoptedLoraAdapter` はこれを注入する。旧 `createDiagnosticLoraBridge` は固定sourceの回帰専用で、同じ実行経路へ重ねない。

- 管理へmean/std、RMSNorm、LoRA積、FP8復号、schedulerの演算や新たな許容差決定を追加しない。意味変換はownerの明示operationへ渡す。

- 契約不明は互換性UNVERIFIED。契約が一致し数値gate/receiptだけ不足する場合は、契約判定を維持して検証NOT_VERIFIED・準備BLOCKEDとする。PARTIALや診断FULLを生成READYへ昇格しない。

- producer hash列はnativeの順序・一意性を保持し、context/frame配列は順序・重複を保持する。任意metadataを削らず、未知の必須条件は依存edgeだけ保留する。

# 作業順と受渡し

| 段階 | 主担当 | 先行条件 | 判定可能になること |
| --- | --- | --- | --- |
| P0 規範とnative情報の対応を固定 | 各数値owner、管理が集約 | 現在の文書と固定source | 規範を何と比較するか |
| P1 管理へ参照台帳を導入 | 管理 | 対象edgeのP0 | 既存判定と規範の接続 |
| P2 Rectを管理経由で共同接続 | 管理、VAE、Diffusion | 対象P0/P1 | 新候補の実mean/RGB連結 |
| P3 LoRAと診断snapshotを実取引へ接続 | 管理、LoRA、Diffusion | 対象P0/P1 | 管理の取消・復帰とowner取引の整合 |
| P4 本番の次の未成立境界を検証 | Diffusion | 固定core・重み・referenceがある境界 | 本番WASM方式の採否 |
| P5 本番predictとHIGH LOW sample | Diffusion | 対象scopeのP4全必須境界 | 本物の生成sampleと復元 |
| P6 全target LoRAと実媒体decode | LoRA、VAE、Diffusion | 該当graph/profileとP5出力 | 選択条件の全coverageと実decode |
| P7 製品工程と同条件比較 | 管理、各owner | 必要なP1〜P6 | 生成受付、保存、負荷目標の個別受入 |

P0は担当別に並行する。P1は対応が確定したedgeから実装し、全ownerの全項目を待たない。P2とP3は並行可能。P4は管理導入を待たず進める。P6のtarget整理・必要媒体shapeの確定は先行できるが、実数値受入は対向実装の成立後に行う。

# 変更対象と配置

以下の新設名は本計画の配置案であり、現在存在するAPIではない。既存同等機能があればそのファイルを拡張し、第二の判定系を作らない。

| 区分 | 対象 |
| --- | --- |
| 固定参照データ | 既存 `docs/shared/ai-connection/reference/catalog.v1.json`、`norms.v1.json`、`numerical-rules.v1.json`、`profiles/*.v1.json` |
| 管理判定 | 既存 `docs/shared/ai-connection/compatibility.mjs` の `evaluateEdge`、`descriptor.mjs`、`contracts/` |
| 管理導入の新設案 | `docs/shared/ai-connection/reference-loader.mjs`、`norm-bindings.mjs`。前者はbytes検査、後者は規範と既存入力の対応・traceを扱う |
| 管理取引 | 既存 `adapters/adopted-lora.mjs`、`queue.mjs`、`snapshot.mjs`、`cache.mjs`、`package.mjs`、`diagnostic-package.mjs` |
| LoRA正本 | 既存 `docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs`、SDK v2、loader policy、kernelとCONNECTION_V2 |
| Diffusion正本 | 既存 `docs/shared/diffusion-models/latent-space/`、`lora/`、`ort-bridge/`、`scheduler/`、`kernel/`、API |
| VAE/Text正本 | 既存 `docs/shared/inference/vae.mjs`、`text-encoder.mjs`、API、`tools/inference/vae/` のexport/参照/受入 |
| 接続結果の新設案 | `development/ai-connection/reference-adoption/` に宣言対応表、証拠index、候補採用表、P1〜P3の結果と再現手順 |
| 管理の検証入口の新設案 | `tools/ai-connection/test-reference-adoption.mjs`。ownerの既存数値試験とは分ける |

# P0 規範とnative情報の対応を固定する

**入力**：4Profile、12規範、10数値規則、各ownerの固定source・既存descriptor/receipt。**出力**：管理外側の宣言対応表と証拠index。新設案は `reference-adoption/DECLARATION-BINDINGS.json`、`EVIDENCE-INDEX.json`。

- [ ] 各ownerが自分のnormIdごとに、取得元のnative API/fieldまたは外側sidecar、source/build/kernel、shape/dtype/layout/meaning、profile、gate/reference、coverage/scopeを記載する。取得できない値は理由付きで未確認とする。

- [ ] 管理が各項目を「契約宣言」「数値受入証拠」「動的resource状態」に分け、比較対象のfield path、版、必須条件、比較方法と欠落時の判定を固定する。管理は数値ownerの宣言を推定して埋めない。

- [ ] F5 mean gateとTextの選択manifest.numericGateを出典から確認する。未取得の間はF1/Rectの2e-6やLoRA gateを転用しない。その数値受入だけを保留する。

- [ ] sourceの取得と受領側の読込みを照合し、実際のbytes/hash/長さを記録する。LoRAの採用kernel 5051 bytesと旧4919 bytesをAPI版だけで同一にしない。

**完了条件**：対象edgeの各必須項目について、値・取得元・owner・版または未確認理由が追跡できる。sidecarはnative型の外側に置き、数値mappingの正本を増やさない。

# P1 参照台帳を既存の管理判定へ接続する

**入力**：固定catalog/規範bytes、P0対応表、既存のedge評価入力。**出力**：既存EdgeDecisionと、採用catalog版・適用normId・出典・証拠参照を持つ外側trace。

既存入口は `evaluateEdge({producerPort,consumerPort,artifact,adapters,registry,implementationState,requiredScopes,evidence,resourceState,activeBindings})`。既存の検証結果 `pass/fail/not-verified`、`readiness.state` の `ready/blocked/failed` は保持し、台帳の大文字分類との対応を管理traceに明示する。

- [ ] 規範導入で変わる境界の失敗ケースを先に追加する。catalog/参照fileの改変、未知schema、同じ128値で別shape、必須宣言欠落、数値receiptのみ欠落を区別する。

- [ ] `reference-loader.mjs` の新設案 `loadReferenceSet({catalogBytes,files,expectedCatalogSha256})` を実装する。`catalogBytes` はUint8Array、`files` は登録pathからUint8ArrayへのMap、返値はPromiseで読取専用ReferenceSet。ReferenceSetは `{catalog,catalogSha256,profileRecords,normRecords,integrityReceipts}` とし、profileRecords/normRecordsは各IDをkeyとするMap、integrityReceiptsは `{path,sha256,byteLength}` の配列とする。catalog自身は呼出し側の固定digest、参照fileはcatalogのdigest/長さ/版で検査する。公開時に同梱する静的assetsまたは明示注入bytesを読み、任意URLやモデル重みを暗黙取得しない。数値規則は根拠参照として保持し、数式を管理の実行入力にしない。

- [ ] P0で確定した有限の比較を `norm-bindings.mjs` から既存 `evaluateEdge` のregistry・requiredScopes・evidence等へ接続する。JSONの自由文をevalしたり、独立した別の互換性判定器を並立させたりしない。N-TRANSACTION/N-ARTIFACTは既存queue/snapshot/packageの検査へ結び、同じhash検査や取引を重複実装しない。

- [ ] COMPATIBLE＋数値証拠不足がNOT_VERIFIED/BLOCKEDになること、未知必須条件と既知衝突の違い、具体adapterがある場合だけNEEDS_ADAPTERとなることを確認する。任意metadataを保持し、古いreceiptと旧kernelを拒否する。

- [ ] native moduleを読み込まず宣言だけで照合できる経路と、単独module利用が維持されることを確認する。既存関連回帰とcatalog整合検証を実行し、結果・再現手順をpushする。

**完了条件**：同じ固定入力で再現可能な判定を返し、理由をnormIdと実field/証拠へ遡れる。既存の209件等を元scopeで維持し、説明用JSONだけをもってruntime導入完了にしない。

# P2 非正方形meanを管理経由で共同接続する

**対象候補**：Diffusion5f880…とVAE855f435…、実際に使う管理・codecの完全SHA。現採用438972…のentryを上書きせず、候補entryの実読込buildを固定する。

- [ ] 管理が `[1,16,1,2,4]` のRect profileと対応するRGB `[1,3,1,16,32]` を選択する。F5の128値やF1正方形64値への置換を拒否する。

- [ ] VAEの実raw meanをcapture/package/読戻しへ通し、DiffusionのRect専用normalize/restore、同profileのVAE raw decode、RGBのcapture/package/読戻しを一つのtraceで結ぶ。正規化済み配列をraw meanへ改名してcodecへ通さない。

- [ ] 各ownerが比較前に固定したgateで全値を比較し、前後payload hash、model/decoder/context、実operation/build、数値receiptを管理が照合する。元frame配列の順序と重複を保持する。

- [ ] 旧F5専用guard/codec wrapperをRect入口として使わず、対応が確認されたRect境界とG1C codecを選ぶ。取消・終了・借用/owned copyの寿命を確認し、P2結果を候補採用表へ記録する。

**完了条件**：管理を経由した同一候補・同一profileのencode/変換/decode/保存が追跡できる。受入はmean診断の連結までで、persistent全sessionや実generated-sample受入とはしない。LoRAはこのmean APIの通過先に追加しない。

# P3 LoRAと診断snapshotを実取引へ接続する

**入力**：選択ローカルFile、対象baseの正当なprovider、owner adapter、規範、既存snapshot/queue。**出力**：管理requestとnative取引・診断snapshotを結び付けたreceiptと終了記録。

- [ ] 管理とLoRAが採用0c278…/438972…、最新候補fc278…/5f880…の差分を照合し、試す組合せを一つ固定する。owner factoryを注入し、旧bridgeが同じ経路へ重ならないことを検査する。

- [ ] 既存 `plan → prepare → stage → finalize → release` と失敗時recover、adapterのrestoreBaseを管理queueへ接続する。SDK v2に存在しないapply/detachを要求しない。full shape、選択領域、両registry hash、source/plan/bundle、native revision、所有権を保持する。

- [ ] 同一SDK/facadeの直列化、古いrequest/rollback、HIGH成功LOW失敗、強度0・再適用・base復帰、取消後の遅延結果、cleanup失敗時の再利用禁止を対象の変更境界で検証する。常に不変baseから再構築する。

- [ ] 既存snapshotのowner facadeへ実native候補を結び、同一context.targetでstage/validate/commit/publishと復帰を検証する。fixture制御、実LoRA＋fixture base、実LoRA＋実baseの結果を別scopeで記録する。

- [ ] 実base取引を新規受入するケースでは、使用した原本・base bytesとidentity、独立reference、事前gate、全選択出力を保持する。必要な入力がない場合はそのケースだけ保留し、過去4原本すべての再取得を要求しない。

**完了条件**：管理のrequest/revision/resource generationとnative local revision・candidate ownershipが一致する。診断snapshotの公開はscope付きで受け入れ、generationReadyはfalseを維持する。実model全sessionのE5はP5/P6/P7の依存として残す。

# P4 本番WASMの次の未成立境界を検証する

**主担当**：Diffusion。既存Q診断と限定attention8ケースを前提に、次は実production Q/K/V生成とQK norm/RoPEを、既存stream attention sourceへ接続する境界を優先する。固定core・必要重み・参照が得られない場合は当該境界をUNVERIFIEDとし、理由と取得対象を記録する。

- [ ] 次の一候補について対象operator、実model形状、source/core、storage/compute precision、独立reference、比較前gate、最大live量を先に固定する。

- [ ] 実QKVから選択query/一headへの接続、全query/headへの拡張、複数stageの重みstaging・WASM Memory・copy同時保持を、独立に受入できる単位で検証する。既存precomputed-tensorsのPASSをproductionQKVVerifiedへ読み替えない。

- [ ] 公開pointwise上限1,048,576、内部scheduler4,194,304、Text conditioningの2,097,152要素を別operationとして扱う。元latent2,096,640要素への拡張はhost・ABI・workspace・結果比較と合わせて行い、上限値だけを書き換えない。

- [ ] 実model形状で全出力、ピークlive/copy、時間、取消と終了を測り、採用・保留・不成立を記録する。`development/ai-connection/FEASIBILITY.md` または既存E7結果へ次境界の結果を追補する。

**完了条件**：その候補の数値と資源条件を再現できる。P5へ進むには予測に必要な全境界と組合せ資源予算が成立していること。一候補のPASSだけではload/predict/sampleのNOT_READYを解除しない。

# P5 実predictとHIGH LOW sampleを成立させる

- [ ] Diffusionが実graph、conditioning/context、source_id、concat、QK norm/RoPE、padding、予測意味を固定coreと対応付け、実predict一回から独立比較する。

- [ ] 固定noise tensor、Euler/simple6/shift5/split3、HIGH/LOWの元handoffを一stageから全反復へ拡大する。seed番号だけを同一入力の証拠にしない。

- [ ] 実generated sample専用の正規化復元をDiffusionが実行し、normalized/rawの前後hash、operation/build、全producer hash列、decoder binding、数値receiptを出す。mean操作への改名やmetadataのrestoredだけで通さない。

**完了条件**：対象operation/profileの実model出力と資源条件が成立した範囲だけreadinessを更新できる。LoRAなしのbase経路は先行でき、未対応shape・precision・LoRAは別判定を維持する。

# P6 全target LoRAと実媒体decodeを受け入れる

- [ ] LoRAとDiffusionが各pair/sideの全patchを実graph/feed/sessionへ対応付け、適用・強度変更・解除・再適用・失敗復帰を検証する。未対応/除外が残る選択はPARTIALを維持する。

- [ ] VAEが実source/reference/slotと最終decodeの必要shapeを確定し、既存profileで不足するものだけ個別export・独立参照・実WASM比較を追加する。Textは選択manifest、Tokenizer、maskと既存staged経路の契約を維持する。

- [ ] P5の本物のraw generated sampleをVAEでdecodeし、管理保存読戻しまで比較する。VAEへ生成sampleの再復元を追加しない。producerとdecoderのidentityを付け替えない。

**完了条件**：pair/side/profileごとの数値・coverage・寿命・資源条件がそろう。実generated sample→復元→decodeの成功と、F1/Rect mean診断の成功を別々に記録する。

# P7 製品工程と同条件比較を完成させる

- [ ] 管理が有限なpipeline stepの参照解決と実行をつなぐ。循環・未解決参照・不正な多重producerを拒否し、元のsource/reference/slot/frame順、prompt、resizeを保持する。File選択・取消・状態表示・部分結果保存のUIは先行できる。

- [ ] 生成受付時に、選択profileに必要なowner実装、数値scope、全native sessionのsnapshot/復帰、必要LoRA coverage、実decodeと資源予算を照合する。診断専用snapshotのgenerationReadyを一括でtrueにしない。

- [ ] 元ComfyUIと同じmodel/LoRA/media/prompt/noise/schedule/出力条件で、中間tensorから最終出力まで比較する。初回/再実行のload・準備・copy・推論・保存・総時間とCPU/RAM等を分けて測る。

- [ ] 実測で支配的な演算からHike移植を評価し、ORT側との二重実行を避ける。未測定値は理由付きnullとし、利用端末のCPU/RAM・許容時間の目標が未決なら負荷目標の受入だけを保留する。

**完了条件**：技術成立、利用経路、数値一致、負荷目標を別々に判定できる。クラウド実行結果を利用端末の改善として報告しない。

# レビューで重点確認する入力と失敗条件

| 条件 | 所有する段階と期待する結果 |
| --- | --- |
| 同じ128値でF5/Rectが違う、Text conditioningが1Mを超える | P1/P2/P4。shapeとoperation別予算で判定する |
| COMPATIBLEだがgate/receiptだけ不足 | P0/P1。互換性を維持しNOT_VERIFIED/BLOCKED |
| 台帳hashは一致するがロードしたkernelが旧版 | P0/P1/P3。実bytes/長さ・採用組合せ不一致として拒否 |
| 取消後に旧stage/rollback結果が返る | P3。対象request/revision/ownership以外へpublishせず、未復旧resourceを再利用しない |
| generated sample宣言だけある、任意metadataやframe重複がある | P2/P6/P7。意味と数値receiptを照合し、正当なmetadataを保全する |

# 成果物の共有と完了報告

各タスクは対象の失敗ケース、実装、該当検証、commit、push、Draft PR、受領側による固定source取得を一単位とする。既存の合格試験は関連変更がある範囲で回帰し、同じ棚卸し・export・全数再推論を理由なく繰り返さない。

各担当の報告には、完全SHA・branch・PR、API/宣言/規範との差分、採用または候補entry、実施した試験と再現手順、証拠のscope・base種別・比較前gate、既存証拠の再利用箇所、未受入と依存先を含める。コードはGitHubへpushして次担当が取得できる状態にし、ローカル保存だけを共有完了としない。raw重みや原本payloadはコード共有の必須成果物にしない。

本計画は実装担当間の実行手順である。担当へ渡す具体的な依頼文はチャット側に分ける。merge・本番Pages公開の状態はコード共有と分けて記録する。

# 実行計画の固定版

[GitHub固定版](https://github.com/Kushyameln01/kushyameln-works/blob/0fb553fd081d3bcbbad4ead7accd165679f77d34/development/ai-connection/reference-catalog/EXECUTION-PLAN.md)／[Draft PR #10](https://github.com/Kushyameln01/kushyameln-works/pull/10)

計画commit：`0fb553fd081d3bcbbad4ead7accd165679f77d34`。参照するProfile・規範・数値規則は `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` に固定する。
