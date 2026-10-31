# owner数値宣言と三段階DATA契約の管理引継ぎ

2026-11-01 JST。LoRA側のデータexportと引継ぎ契約を用意した。管理の正式な受入入口は未取得であり、現管理edda43の宣言負例は未対応だった。既存6ケースの数値合格は元scopeで維持する。

正本は [HANDOFF.json](HANDOFF.json)。コード正本は `82b21f09cb63926543181b16f0e97ebc6b9fa6be`。新しいDATA moduleを旧native fc commitへ付け替えない。native tupleは引き続きLoRA fc／Diffusion5f、kernel5051 bytesで、SDK・planner・canonical adapter・kernelは変更していない。

## 1. base/output dtype・layoutの取得元

```js
const binding = await facade.describeBinding();
const declarations = describeLoraNumericDeclarations({plan, ownerBinding: binding});
```

exportは `lora-numeric-declarations/0.1-draft.1`。実plan operationと公開ownerの両registryを、keyとweightIdで結合する。配列位置を意味として使わない。値・presence・取得元container/path/key/weightId、両registry hashとsource/plan識別を返す。欠落はpresence:falseとして保持し、F32やrow-majorで補完しない。既知の矛盾も観測データのまま返し、管理の判定へ渡す。

| 管理宣言 | 実owner bindingの取得元 | 同時に照合する観測値 |
| --- | --- | --- |
| baseDtype | `owner.nativeRegistry.targets[key,weightId].computeDtype` | native.dtype、connection.dtype、op.target.dtype |
| outputDtype | `owner.connectionRegistry.targets[key,weightId].dtype` | native.dtype、native.computeDtype、op.target.dtype |
| layout | 同`connectionRegistry.targets[key,weightId].layout` | native.layout、op.target.layout |

outputDtypeは準備したweight/biasの形式である。consumerの16出力とは別。LoRA原本のsourceDtypeはinspectionから取得し、baseのstorageDtypeから推定しない。

| patch | base原本storage | 復号してLoRAへ渡すbase | 準備後output | layout |
| --- | --- | --- | --- | --- |
| q.weight | F8_E4M3 | F32 | F32 | row-major |
| q.bias | F16 | F32 | F32 | row-major |

[OWNER-NUMERIC-WITNESS.json](OWNER-NUMERIC-WITNESS.json)は、前回の実owner binding・選択scope・loaderDetailsを参照した宣言の対応例。生の重みを含まず、現在有効なSDK plan handleやsessionを表さない。管理は正式実行時に実facadeから取得する。

## 2. 管理へ渡す三段階入力API

exportは `lora-management-admission-inputs/0.1-draft.1` の `createLoraManagementAdmissionInputs(options)`。`options` は実plan/inspection/ownerBinding/sourcePins、管理のverified ReferenceSet/candidateSet、gate/reference、資源・選択binding、実currentness callbackを受け取る。新moduleのfactorySourceRefにはHANDOFF.jsonの完全commit/path/hashを使う。

| method | 返すデータと呼出し時点 |
| --- | --- |
| `preflightInputs()` | patch別の宣言と既存evaluateEdge用raw input。準備前に管理が評価する。将来の数値・取引receiptを要求・生成しない |
| `checkpointInputs({nativeValidation,weightBiasEvidence,snapshotTarget,ownerValidation})` | 実native検証と全選択weight/biasの独立証拠を結ぶraw input。正式経路は実snapshot context.targetと外側owner validationを必須とする |
| `postpublicationInputs({snapshotTarget,publication,queueReports,ownerState,ownerValidationRef})` | 実公開・native owner・元queue終端/releaseを結ぶraw input。core publish/cleanupが戻ってから管理が評価する |

ownerは別の互換性判定器やREADYを返さない。管理は自分の既存 `evaluateEdge` を呼び、入口・commit許可・受入・再利用を制御する。管理のReferenceSet brandは保持し、native payloadの型にこのDATAを混ぜない。

checkpointのcontextが省略された場合は `referenceContext.ownerAdmission.phaseBinding` がnullのtargetと`bound:false`を残す。これは旧receiverの入力互換用であり、**正式入口は最初のcheckpointで拒否する**。native phase requestや後から得たpublicationからsnapshot targetを作らない。明示targetを渡した場合は、実外側owner validation、source/build、SDK/local revision、manager/resourceの一致を検査する。

旧 `createP3NormEdge` は薄い試験用shimとして残した。管理の正式入口へこのshimや旧 `createDiagnosticLoraBridge` を重ねない。mapping正本は既存 `createDiffusionDiagnosticAdapter` を維持する。

## 3. 管理側の必要差分と順序

1. 実sourceで検証したowner factory、実facade.describeBinding、opaqueなSDK planからDATAを取得する。任意JSONのF32宣言や同じhash文字列だけを実owner証明として扱わない。
2. `LOAD-COMFY-LINEAR-DIFF` の既存catalogにあるbaseDtype/outputDtype/layoutを有限bindingへ加える。宣言3値と上表の実owner/plan観測値も対応させる。欠落はUNVERIFIED、既知のF16/BF16/column-major矛盾はINCOMPATIBLE。LoRAを使わない経路へ条件を強制しない。
3. 契約preflight、実checkpoint、公開後監査で既存evaluatorを呼ぶ。checkpointには正しいsnapshot/step/operation/source/両registry/gate/reference/kernelが必要。管理revisionと各SDKのlocal revisionを共通counterにしない。
4. native commit直前に、成功したcheckpointと実選択・資源generation・外側consumer token・native bindingを再確認する。checkpointの成功を後続requestへ持ち越さない。
5. 公開後は別の `isPublishedCurrent` callbackで、active snapshot/ownerの寿命を観測する。core snapshotは公開時にstage recordをclosedにするため、stageの `context.isCurrent()` をこの用途へ流用しない。
6. 後段監査やcleanupに失敗しても、実際の `SNAPSHOT_PUBLISHED` とnative `CONSUMER_APPLIED` の事実を保持する。診断受入と再利用をBLOCKEDにする。finalize済みの履歴を使ったrollbackや「commitしなかった」という復帰を捏造しない。

正式API名と修正版commitは未受領なので、この資料で管理に存在するmethodとして命名していない。採用時に管理の実入口とsource/hash・phase receiptを確定する。

## 4. 確認した変更境界

[owner fixture log](evidence/owner-tests.log)：数値宣言9、raw DATA9、旧shim互換5の **23/23 PASS、skip0**。新DATAの欠落/矛盾、元storage分離、source/candidate、receipt/target、published currentness、所有権をmetadataで確認した。

[現管理probe](evidence/manager-baseline.json)：管理 `edda43f9ea69c5b3ab1af3c6eb82295f2912887c` の固定sourceと6daeの7 JSONを照合し、**負例12件を先に実行**した。欠落6件・矛盾6件はすべてCOMPATIBLEのままで、必要な拒否結果を満たした負例は0/12。正常なBF16 source＋F32 base/outputの正例2件は一致した。終了code2、`BLOCKED_MANAGER_DECLARATION_COMPARISONS_UNIMPLEMENTED` を未対応として保存した。

このprobeは宣言のみの検査で、管理の正式三段階入口を評価しない。管理修正後は同じ負例から再実行し、次に [CONFORMANCE-CASES.json](CONFORMANCE-CASES.json) のphase/取消/所有権を実入口へ結ぶ。正例や旧6caseの合格だけで正式採用へ進まない。

[import-only確認](evidence/import-smoke.json)では、旧ブラウザreceiverの実allowlistを使って新module・shim・receiverを読込み、38 sourceを固定Git blobへ照合した。原本Fileを開かず、SDK/native演算を呼ばず、WASM要求0件で確認した。

[独立source review](evidence/source-review.md)は取得元・凍結DATA・phase provenanceを承認し、現管理の未対応と採用保留も確認した。証拠の長さ・SHA-256は [manifest](evidence/MANIFEST.json) にまとめる。

## 5. 数値証拠の再利用と拡張目的

旧6公開caseは実行source `25e5b56feeb070594110bb292d9de21e4e234f0a`、配布 `40f7f0cfc95bfb5f3e8ed5cc68c4bdb196cbbf68` のまま。491,520 weight・96 bias・96出力の実LoRA/実base PARTIAL比較とnative取引証拠を維持する。原本load、全体hash、Hike計算や期待値生成は今回繰り返していない。新しい宣言比較と正式管理入口の合格証明は、別に取得する。

[6件のDATA対応確認](evidence/replay-inputs.json)では、保存済みowner binding・loaderDetails・実target/receiptを新factoryへmetadataとして投影した。checkpoint targetとsource/ref/kernel/revision/所有権を保ち、evaluator・SDK・consumerの呼出しは0件。元記録にないresource容量やraw header shapeは未取得のまま残した。これは過去の証拠の対応確認であり、live planや現在の資源利用権ではない。[確認source](evidence/replay-inputs.mjs)は実行時のprivate配置を冒頭に持ち、別環境では入力配置を合わせて使う。

拡張目的は **HIGHがnative適用に成功した後LOWが失敗した場合の共同snapshot公開防止と復帰** の一つに限定する。管理の既存 `low-failure` は実SDK/Hike/ORT＋合成LoRA/baseのnative挙動として再利用する。新しいLOW実モデルの数値受入や二組同時合成を目的へ加えない。正式入口で同じmanager snapshotに属する両step・各native revision・source/registry・所有権・元処理終端を確認する。

過去4原本の取得・全体hash再計算は前提にしない。全targetは対応する実graph/consumer成立後。全model session、生成、lease、本番公開・mergeは今回の受入外で、generationReady=falseを維持する。

## 6. 再現

```sh
WORKS_P3_NORM_MANAGER_ROOT=/path/to/manager-edda43 \
node --test tools/ai-connection/test-lora-numeric-declarations.mjs \
  tools/ai-connection/test-lora-admission-inputs.mjs \
  tools/ai-connection/test-p3-norm-edge.mjs

node tools/ai-connection/probe-manager-lora-declarations.mjs \
  --manager-root /path/to/fixed-manager \
  --manager-commit edda43f9ea69c5b3ab1af3c6eb82295f2912887c \
  --owner-declarations development/ai-connection/reference-adoption/lora/management-handoff/OWNER-NUMERIC-WITNESS.json \
  --out /absolute/private/new-empty-declaration-probe
```

probeは自身とwitnessのHEAD Git blobを検査するため、commit済みの配布sourceを使う。outはsource repo外の新しい空ディレクトリ。修正後はmanager rootと完全commitを置き換え、先に同じ12負例を確認する。負例・正例14件が要求を満たすと宣言metadata検査のみcode0となる。正式phase採用の合格は別に確認する。

完全source/path/hash、証拠のhashと再利用範囲はHANDOFF.jsonとevidence manifestを参照する。管理PR #7への掲載と、管理担当の受領・採用完了は別に記録する。
