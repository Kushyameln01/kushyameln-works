# A0 native/common contract mapping

版: `ai-connection-mapping/1`。根拠: 今回添付 総合接続仕様1.1-draft.1 第4・6〜10・15・18〜20節、実装計画0.1-draft.1 A0/M1/M2。固定source/buildと取得範囲は [SOURCE-BASELINE.md](SOURCE-BASELINE.md) に記録。

## 層と担当境界

| 層 / owner | 今回扱う公開契約 | 今回変更しない契約・内部 |
| --- | --- | --- |
| 管理 / 共通規格担当 | `works-module-contract/1.0-draft.1` のModule/Artifact/PipelineProfile/ExecutionSnapshot/EdgeDecision、registry、接続判断 | モデル計算、precision、native wire、kernel、codec、共有依存 |
| TextEncoder | operation `encode`、text-encoding role、BLC float32 hidden states、mask/model/Tokenizer identity | `works-ai-1`、`text_encoder`、Text512/plain-text/ID規約、内部session |
| VAE | latent-encoding / latent-decoding roles、profile別port、mean/sample/decoder binding | `works-ai-1`、NCTHW/native meaning、数値範囲変換・conv2、native strict keys |
| Diffusion | tensor-transform / denoising / sampling / adapter-source等のoperationごとの役割と状態 | `diffusion-models/0.1` request/build/session/job/inputRevision/op、128要素mean数値式、NOT_READY |
| LoRA | adapter-source / adapter-weight-transform / adapter-application の個別役割、F32 Linear/additive scope | SDK apiVersion1、local plan/revision、kernel ABI、既存boolean validate、元loader policy |

operation役割、実装状態、port契約適合、検証scope、現在のresource/binding readinessは別々に記録する。役割一致だけで代替を許可しない。Text512、Wan shape、HIGH/LOW、light/detailは固有profileであり、共通enumにしない。

## 外側adapterでのデータ対応

以下は公開契約から共通記述への対応であり、M3のruntime呼出しadapterを今回実装済みとするものではない。元native metadata/応答を保持し、共通extensionsはstrict native fieldへ戻さない。

| native公開項目 | 共通側の対応・照合 | 失ってはいけないもの |
| --- | --- | --- |
| `dtype/shape/layout/meaning/data` | `tensor.dtype/shape/axes/nativeMeaning/dataRef` とnative schema/payloadRef。axesは公開layoutに対する明示mappingで解決 | 数値payloadはバイナリ/参照のまま。unknown layoutから軸を推測しない |
| Text `modelSha256` | `provenance.producerRefs` のmodel identity + native metadata | VAE/graph/LoRA hashと混同しない |
| Text `tokenizerSha256/attentionMask` | tokenizer identityと必要metadata。maskは元native metadata/別payload参照へ保持 | 内部mask位置・返却L、top-level mask/evidence。任意token IDsの出所認証とは別 |
| VAE mean `modelSha256` | producer VAE identity、必要decoder bindingの照合 | 旧nativeでhash省略を受理しても、共通側のbinding検証済みとはしない |
| G1C `latentContract.producerModelSha256s` | `producerRefs` に全件とnative配列を保持 | 非空・重複なしのnative規則、元配列順序、全producer。先頭scalarへ潰さない |
| G1C `latentContract.vaeModelSha256` | `consumerBindings` のdecoder identity | producerへ混ぜず、consumer decoderと照合。誤decoderは不適合 |
| G1C `latentContract.normalization` | native metadataのid/state/owner + semantic space/profile | restoredは宣言。変換実行/build/前後payload hashのevidenceを別に要求 |
| G1C `context.sourceFrameIndices/sourceFrameTimesSeconds` | native metadata + `lineage.sourceFrames[].indices/timesSeconds` | 順序・重複・同数・非負有限秒。元RGB F=5でもlatent T=2へ削らない |
| `context.inputId/inputSha256/slotId/contextId` | lineageとtyped identity、native metadata | context名から寸法/内容を推測しない。encode入力Fとのnative照合は所有VAE契約 |
| 応答 `evidence` | evidence参照と元応答の保持、native snapshotと管理snapshotを分離 | RGB出力VAE hashと入力latent producer/decoder来歴の両方 |
| unknown optional metadata/extension | namespace/schemaVersion/requiredForUse付き共通extensions | 不透明に保持し、削除しない。必須の未知schemaはUNVERIFIED |
| Diffusion `protocolVersion/buildId/sessionId/jobId/inputRevision/op` | module nativeAPI/source/buildと明示operation/binding参照 | common contract IDをnative protocolへ送らない。G2/G1C buildを付替えない |
| LoRA `apiVersion/planId/inputRevision/applicationRevision/buildId` | nativeAPI版、localRevisionBindings、SDK/kernel/source参照 | managerRevisionで上書きしない。planや登録を実適用の成功へ昇格しない |

HIGH/LOW↔high/lowはBernini用M3 adapterの明示対応表で扱う。pair light/detail、A/B別名、強度既定値、次期source_id/concat/RoPE/paddingは不明値を推測しない。

## edgeで使える正本と保留範囲

| edge | 取得済み正本 | 契約と実行の境界 / owner |
| --- | --- | --- |
| Text encode → conditioning検査 | G1/G1C `works-ai-1` → G2 `validateConditioning` | model/Tokenizer/mask/BLCの宣言検査。Text tensor2097152要素に別pointwise上限を適用しない。実graph消費はDiffusion担当 |
| VAE raw mean → normalizeRawMean → restoreRawMean → VAE mean decode | G1/G1C + G2 mean固定profile | 128要素の既存mean経路。sampleへ転用しない。大shape/profile受入はU2 |
| Diffusion generated sample → VAE decode | consumer G1C取得済み / producer902未取得 | semantic/space/decoder宣言の判断fixtureは可能。実producer/復元/実decode結合はU1/U3でUNVERIFIED/NOT_READY |
| File → Diffusion LoRA登録/source → SDK inspect | G2 I/O/source契約 + G3 SDK | 登録はloraApplied=false。現在binding/revisionの明示照合が必要。M3実呼出し・寿命検証は次工程 |
| LoRA prepare/apply → Diffusion実consumer | G3 apiVersion1のみ。次期registry/consumerは案 | runtime-input/initializer/hike-parameterを勝手にgraphInitializerへ押し込めない。U4/U5 |
| 任意構成の合成module | 今回共通schemaと合成fixture | 一段/複数encoder/LoRAなし等を記述できることの試験。別familyの実推論対応や各担当合意ではない |

## M2への明示入力

`producerPort` と `consumerPort` は比較対象の公開port、`artifact` は宣言値、`registry` は今回利用できるschema/semantic/profile定義、`adapters` は利用可能な版付き変換のリストとする。implementationState / requiredScopes / evidence / resourceState / activeBindingsを対象operationと参照版に結び付けて呼出し側が明示する。評価器は他moduleの内部・global・暗黙capability fetchへ依存しない。

- `COMPATIBLE`: 既知契約が直接適合。未実装・未検証・一時RAM不足でも契約結果とreadyは独立。
- `NEEDS_ADAPTER`: 具体的な利用可能adapterと版・適用条件を識別できる場合のみ。自動取得や任意コード実行はしない。
- `INCOMPATIBLE`: 既知の意味/空間/単位/shape/decoder/静的容量等が矛盾、または既知consumer必須metadataが実欠落し、有効adapterもない。
- `UNVERIFIED`: 未知必須schemaや未取得の契約・宣言・解釈規則を明示。既知consumerが要求するmetadataの実欠落はINCOMPATIBLE、evidence不足はvalidation/readinessへ分離する。

各理由には期待値・実際の宣言/観測値・field path・根拠schema/source/build・担当/未決IDを記録する。静的port capacity超過は契約問題、一時available RAM不足はreadiness問題として分離する。

## U1〜U9と担当への確認項目

| ID | 確認先 / 必要な返却 | 影響範囲と今回の状態 |
| --- | --- | --- |
| U1 | VAE+Diffusion: G1C latentContractへの実sample producer/decoder mapping、復元前後payload hash、復元operation/build、実decoder数値比較 | consumer本文取得済み。実生成decodeは保留。mean/schema判断は継続 |
| U2 | VAE+Diffusion: F=1/非正方形/元81frame/profile別export、実参照、peak RAM/copyとnative上限 | 5×16×16の既存受入記録のみ。大shapeに外挿しない |
| U3 | Diffusion: 902完全commit/pathまたはarchive/hash、source_id/concat/RoPE/paddingとHIGH→LOW core式、実graph | source未取得。未知fieldとfull sampleの実装だけ保留 |
| U4 | Diffusion+LoRA: 実base FP8規約、F32 consumer口、binding.kind/slice/full shape/coverage/graph identity | 新数値適用は保留。既存原本I/Oは使用可能な契約として記述 |
| U5 | LoRA+Diffusion: loaderPolicyId、full/partial planner、新structured validationとv1 boolean adapter、lifetime/lease | 次期案の原配布JSON/合意は未確認。G3 v1から推測拡張しない |
| U6 | 管理+resource owner: Invocation/resource binding、旧cancel対象、子read、stage/publish/rollback、実session復帰 | M4/M6次工程の試験条件へ固定。descriptorに取消/資源契約を宣言しても実動作合格ではない |
| U7 | 管理+提供者: 厳密schema、JCS/RFC8785 hash対象/自己digest除外、safe integer/decimal string、Bernini A/B別名 | M1/M2で今回採用schemaを固定。canonical hashingとpackageはM5、A/Bは未決のまま |
| U8 | 管理+codec所有者: 全native bytes + descriptor/evidence/trace/snapshot/extensions sidecar、required hash/byte count、legacy分類 | M5次工程。native codecだけで完全保存とはしない |
| U9 | 管理+各所有者: 共通descriptor/registry/判断器、module差替え/未知拡張/負fixture、ownerのmapping採用 | 今回M1/M2で実装する範囲。M3のruntime接続、各ownerの採用合意は別 |

各所有者へ確認する際は本1.1本文の受領・差分・native版/source/build・未対応を返してもらう。旧1.0全17節/143ブロック読了という報告は保持し、本版の読了/合意に再利用しない。上表は確認項目の整理であり、この作業で外部送信はしていない。

## M4: 次工程の取消・子read受入条件

1. A取消→B開始→Aの遅いcancel/成功/失敗を再現し、対象token/session/job/revision/ownerをdispatch直前とremote実行側で照合する。旧cancelがBを停止せず、旧返信がBの現在値を書き換えない。
2. Text/VAE cancelはnativeにjob対象がない。取消要求、元Promise終端、必要資源解放のbarrierが成立するまで同executorのBを開始しない。結果不採用・実計算停止・解放・再利用可能を別々に観測する。
3. LoRA親prepare中の子readが、親自身のqueue枠解放待ちになってdeadlockしない。専用Worker終了とLoRA協調停止を分離し、無関係ownerを停止しない。
4. queue待ち取消、port切断、dispose、timeout、Worker再生成、再実行を検証する。Promise破棄やtimeoutだけを取消完了としない。重いjob1件のpolicyはBernini profile限定。

## M5: 次工程の保存欠落受入条件

1. native `.wktensor` payloadだけでなくnativeファイル全体hashを検査する。header改変、payload改変、manifest差異を別々に拒否する。
2. evidence欠落、descriptor/snapshot/trace/必須bytes/hash欠落を完全保存と分類しない。G1C codecにないtop-level evidenceと任意extensionsをsidecarへ保持する。
3. 複数producer、decoder binding、context frame番号/時刻の順序・重複、正負共有、profile/build/native版を保存読戻しで照合する。producer列をhash都合で並べ替えない。
4. unknown optional拡張は保持、unknown required規格は拒否/未対応分類。legacy来歴不足を完全生成packageへ昇格しない。
5. package `works-artifact-package/1.0-draft.1` の厳密schema、JCS適合fixture、manifest自己digest除外、snapshotと実行traceの分離を先に固定する。実ファイルを保存・回収・読戻ししてから合格とする。
