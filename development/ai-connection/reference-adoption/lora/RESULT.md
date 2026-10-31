# LoRA P0宣言と管理採用経路の変更境界試験

この文書は管理285で実施した前回の事前確認の履歴。管理P0/P1完了後の受領・実base・規範付きsnapshotの結果は [P3-RESULT.md](P3-RESULT.md) を参照する。以下の未受領状態を現在の状態へ流用しない。

2026-10-31。P0の管理向け宣言・証拠対応表を提出する。既存の管理採用経路では、ローカルFile 1件による数値比較7件と制御試験7群が合格した。これは **P3の事前確認**であり、新規範runtimeを通すP3全体の受入ではない。`P1:UNVERIFIED`、`snapshotNormRuntimeVerified:false`、`fullP3Accepted:false` を維持する。

## 確認した正本

| 資料 | 版・固定元 | 本文の取得 |
| --- | --- | --- |
| 規範導入と生成工程の実行計画 Draft | `1.0-draft.1`、[0fb553fd…/EXECUTION-PLAN.md](https://github.com/Kushyameln01/kushyameln-works/blob/0fb553fd081d3bcbbad4ead7accd165679f77d34/development/ai-connection/reference-catalog/EXECUTION-PLAN.md) | Page `page_78c30bebe16481918944e621b8c2a02a` 全87ブロックと固定Git本文 |
| Profile・管理照合規範・数値規則 | `1.0-draft.1`、[6dae9a6f…/catalog.v1.json](https://github.com/Kushyameln01/kushyameln-works/blob/6dae9a6fac3e9ad29ea941f22211edbe4aa894ad/docs/shared/ai-connection/reference/catalog.v1.json) | 正本JSONと説明文書18ファイルを取得。18 profiles、12 norms、10 rules、data 6件・文書7件のdigestを照合 |
| 管理照合規範／数値規則のPage | `1.0-draft.1` | `page_7972cb392a3481918a1ceb0b7501bb76` 全30ブロック、`page_ecfe5b714e008191a7779e5cd2bad42c` 全45ブロック |

指定されたProfile台帳Page `page_7036da19567881918356235b7aa82b83` はPage閲覧ツールで `FORBIDDEN / page_read_forbidden`、`retryable:false` となった。再試行せず、Page本文は読了扱いにしていない。固定GitのREADMEは「JSONはバージョン管理された参照データの正本、Pageは同版の説明と入口」と明記しているため、指定commitの正本を確認した。[取得記録](evidence/SOURCE-ACQUISITION.json)に両者を区別して記載する。

## P0の提出物とAPI対応

- [DECLARATION-BINDINGS.json](DECLARATION-BINDINGS.json)：12個のnormを実APIのフィールドまたは外側sidecarへ対応付ける。契約宣言、数値証拠、動的資源状態を分離する。
- [EVIDENCE-INDEX.json](EVIDENCE-INDEX.json)：既存の実LoRA・実baseのPARTIAL結果、非正方形meanの既存profile、管理fixtureを、それぞれの固定commitとscopeで再利用する。今回の事前確認は別recordとする。
- [接続API](../../../../docs/shared/inference/lora/DIFFUSION_DIAGNOSTIC_ADAPTER.md)：`createDiffusionDiagnosticAdapter` をmapping正本として維持する。SDK・planner・adapter・Hike kernelの製品実装は変更していない。

| 宣言 | 内容・境界 |
| --- | --- |
| loader | `comfy-lora-b5a4321-linear-diff-v1`。ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` の固定規約 |
| variant・dtype | 2D Linearのdown/up・A/B、加算diff・diff_b。原本BF16/F16/F32、計算・base・出力F32 row-major。未知variant、Conv、派生方式、直接量子化baseを既定値で通さない |
| rank・alpha・strength | rankは因子shape由来。明示alphaはalpha/rank。alpha省略時のscale=1は上記固定loaderに限定。0・負のalphaを省略扱いにしない。strengthは明示の有限F32値。診断集合 `{0,1,-1}` を製品既定や全域制限へ転用しない |
| 原本識別 | 選択したローカルFileの全体SHA-256、サイズ、既知tensor・loader適合を新規load時に結ぶ。ファイル名やshapeだけではbase適合を認定しない。過去4原本のhashは履歴証拠であり、必須allowlistではない |
| 領域・binding | Q full `[5120,5120]` の先頭16行・全5120列、明示Q bias full `[5120]` の先頭16値。weight=`runtime-input`、bias=`hike-parameter`。`initializer` に偽装しない |
| registries | native registryとconnection registryのdescriptor/hashを別々に保持。原本・plan・bundle・package・snapshotのhashも同一視しない |
| gate・reference | 実baseの既存gateと今回の合成fixture専用gateを分離。独立期待値のhash、native receipt、coverage=`PARTIAL`、scope=`diagnostic-projection`を保持 |

full shape、slice、含むpatch、除外target・行領域は各planと記録に残る。native/catalogの新しいshape profile IDを発明していない。HIGH/LOWは別instance、light/detailは選択・切替であり、二組の同時合成を追加していない。

## 実行した管理採用経路

| 担当 | 完全commit |
| --- | --- |
| 管理 `createAdoptedLoraAdapter` / InvocationQueue | `28596717182e48aeb23c719c51b6e593edf4e496` |
| LoRA SDK v2 / canonical owner adapter / kernel | `0c27874908638afc748ea2455a2779a16736730b` |
| Diffusion consumer / ORT・Hike stage | `438972f30242e0a3bc66edb8591f38eaa0fcd384` |
| 今回の試験コード | `d59c917a2d136a29e4f0b083143d63a0d621dcb5` |

管理factoryは公開されたcanonical owner factoryを1回注入する。旧 `createDiagnosticLoraBridge` はimport・重畳とも0件。LoRAの5051-byte kernelはSHA-256 `3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24`。旧4919-byte artifactと取り違えない。新しいowner `fc2789a…`、Diffusion `5f880fd…` との対応ファイルのbyte一致は別記録であり、管理の採用pinを変更していない。

ブラウザはChromium `154.0.8037.57`、実ORT WASM `1.24.3`。27件の配信sourceを固定Git blobへ照合した。FileはブラウザのFile APIから読み、`.safetensors` のHTTP取得は0件。

## 今回の数値比較

入力は新しく作ったF32・rank 1・alpha 1のローカルfixture 1件、`user-chosen-local-fixture.safetensors`。61,890 bytes、SHA-256 `ab3e2bee32a725c68d42e923e80951409cea16526e2271a8c17d07baf88fb57f`。過去4原本・実baseモデルは開いていない。Q因子と明示Q `diff_b` を持つこのfixtureを、非ゼロの合成baseへ接続した。

実行前に `W[:,0]=1+0.5*s`、他列0、`bias=2+0.125*s`、`x[0]=1`、他要素0、従って各出力 `3+0.625*s` と固定した。いずれもF32で正確に表現できるため、fixture専用gateは絶対・相対誤差0。実LoRAの受入gateを厳格化・置換したものではない。

| case | strength | 管理revision | SDK input/application revision | consumer epoch | 各16出力 |
| --- | --- | --- | --- | --- | --- |
| strength-zero | 0 | 1 | 1 / 1 | 1 | 3 |
| strength-positive | 1 | 2 | 2 / 2 | 2 | 3.625 |
| strength-negative | -1 | 3 | 3 / 3 | 3 | 2.375 |
| strength-reapply | 1 | 4 | 4 / 4 | 4 | 3.625 |
| apply-after-base-restore | 1 | 5 | 5 / 5 | 6 | 3.625 |
| apply-after-cancel | 1 | 7 | 8 / 8 | 7 | 3.625 |
| apply-after-validation-recovery | 1 | 9 | 10 / 10 | 8 | 3.625 |

重み573,440値・bias112値・case出力112値を全比較し、誤差0。base復帰の16出力もすべて3。14個の選択F32生成物を別担当が独立の閉形式で読み戻し、全byteと記録された128出力の一致を確認した。全16出力、各block範囲・hash・native検証receiptは[実行結果](evidence/managed-boundary-result.json)に保存する。生配列はprivate出力先に保持し、Gitにはhashと結果だけを置く。

今回のregistryには固定診断graphのidentityが入るが、それを合成baseと実モデルbaseの同一性の証拠にしない。これは「実SDK・Hike・ORTと実管理adapterの制御試験」であり、「実LoRA＋実baseの新規試験」ではない。

## 制御・取消・資源の寿命

7群すべて合格。325件のtraceと78件のqueue終端記録で、request、管理revision、resource generation、native SDK revision、epochを別々に対応付けた。

| 制御 | 確認結果 |
| --- | --- |
| 適用・強度変更・再適用 | 不変baseから毎回構築し、適用済み重みへ再加算しない。成功したcohortのみactiveにする |
| base復帰 | native `prepareBase → validate → commit`。元baseの出力へ戻し、再適用可能 |
| 取消 | 実Hikeの1 block後にqueueから取消。Signalと当該SDK.cancelへ伝達し、元native処理の終端、stop確認、releaseを待って再利用可能とする。Promise拒否だけを停止証明にしない |
| 検証失敗・復旧 | 故意に誤った期待値を渡し `NATIVE_VALIDATION_MISMATCH` を確認。以前のpackage・epoch・active cohortを維持し、失敗した選択revisionを公開しない |
| 古い状態・異なるtarget | SDK旧planの拒否と、管理cohort違いの `TARGET_MISMATCH` を別々に確認。重複requestは `REQUEST_ID_REUSED`、旧resource generationも拒否 |
| HIGH成功・LOW失敗 | 別instanceでLOWの数値検証を失敗させ、HIGHのpackage・epoch・管理revisionが変わらない。atomic snapshot成立とは扱わない |
| release失敗 | 試験用release observerの故障で `RESOURCE_CLEANUP_FAILED`。次のdispatchは `RESOURCE_QUARANTINED`。明示recover/releaseで残存preparedを処分してもqueueは隔離を維持。verified rebindは未試験 |

適用成功後はnative candidate履歴とpreparedを解放してからconsumerを再実行した。今回の所有権は `independent-copy` で、active consumerが必要bytesを所有する。lease方式を新規受入した結果ではない。管理の `isOwnerCurrent` は資源所有期間を指し、選択のcurrent判定とは別。取消・失敗した新しい選択を、古いactive feedの所有権消滅として扱わない。

factoryに架空の `cancel` / `dispose` を追加していない。取消はqueueとSDK、終了は実際のSDK・consumer・stageの所有者が担う。cleanup故障は隔離のまま残し、再利用へ自動復帰させない。読戻しの限界として、一部の前後比較は生出力vectorを保存しておらず、実行時の比較assertとpackage/epoch/cohortの保持で確認する。隔離後の直接cleanupにも独立したnative release receiptはない。

## 再利用と未受入

管理の固定採用契約試験も今回 **11/11、skip 0**。実SDK/Hikeを使うものを含むが、一部はconsumer fixtureである。[log](evidence/adopted-contract-tests.log)を数値7件や既存の実base20件へ混同しない。

既存のv1/v2合成base試験、実4原本の実base PARTIAL20件、非正方形meanと前後比較の合格はscope付きで再利用し、原本hashを再計算していない。今回の製品実装差分は0であり、それらを新しいP1/P3合格へ流用しない。

- P0は管理への提出まで完了。管理でのnorm集約・ReferenceSet採用は別工程。
- 管理P1の `reference-loader` / `norm-bindings` の完全commit・ReferenceSet・receipt契約は未受領。既知の管理2859671には含まれない。新規範runtime edgeは `UNVERIFIED / NOT_VERIFIED / BLOCKED`。
- 同一 `context.target` に実native候補を接続した管理診断snapshotのstage/validate/commit/publishは未受入。既存の汎用snapshot fixture試験を代用しない。管理は原本登録・prepared・STAGED・診断 `CONSUMER_APPLIED`・snapshot公開を別状態で表示する必要がある。
- 今回は旧committed candidateのrollback supersession、lease方式、verified rebind、detail/lightの実原本を管理で読み直す試験を追加していない。既存証拠の適用範囲を保持する。
- 全targetは対応する実graph/consumer成立後のP6へ残す。実model全session、生成への寄与、二組同時合成、generationReady、公開・mergeは含めない。

管理へ必要なのはP1固定sourceとその対象edge、同一targetのsnapshot参加契約である。Diffusionには上記固定診断provider/consumerを使い続ける。追加の全target適用には実graph initializer/runtime parameterの正確なbinding registry、不変base provider、読み込むpackage・所有権契約が必要であり、重みhandleを返すだけでは適用合格にしない。

[再現手順](REPRODUCE.md)、[独立レビュー](evidence/independent-review.md)、[独立読戻し](evidence/independent-readback.json)、[管理API照合](evidence/manager-contract-audit.md)、[計画](PLAN.md)。
