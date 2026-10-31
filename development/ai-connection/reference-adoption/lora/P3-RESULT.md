# 管理P1と実baseを結ぶLoRA P3共同結果

2026-10-31。**選択したlight HIGHのPARTIAL診断を受け入れた。** 実ローカル原本1件と受領した実base断片で、規範照合から実native検証・管理診断snapshot公開・取消復旧・base復帰まで確認した。他のpair/side、全target、全model session、生成への寄与は今回の新規受入ではない。

## 使用した正本と変更

| 対象 | 完全commit・契約 |
| --- | --- |
| 新計画 | `0fb553fd081d3bcbbad4ead7accd165679f77d34`、`1.0-draft.1`。Page全87ブロックを再取得 |
| Profile・規範・数値規則 | `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`、`1.0-draft.1`。管理同梱7 JSONが固定bytesと一致 |
| 管理P0/P1/P3 | `edda43f9ea69c5b3ab1af3c6eb82295f2912887c`、[API](https://github.com/Kushyameln01/kushyameln-works/blob/edda43f9ea69c5b3ab1af3c6eb82295f2912887c/docs/shared/ai-connection/API.md) |
| LoRA候補 | `fc2789a0f649e33f15eb13750e6a983b5c52d170`、`lora-connection/2.0-draft.1`、owner adapter `/0.1` |
| Diffusion候補 | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`、Q16 consumer / ORT WASM `1.24.3` / Hike |
| 今回の実行source | `25e5b56feeb070594110bb292d9de21e4e234f0a`、Chromium `154.0.8037.57` |

旧採用0c/438と別候補fc/5fを分離する。管理の新規 `createCandidateAdoptedLoraAdapter`、`createSnapshotNativeLoraOwner` を使用し、mapping正本は `createDiffusionDiagnosticAdapter` のまま。旧bridgeの読込み・重畳は0件。LoRA SDK・planner・adapter・5051-byte kernelの製品実装変更は0件であり、v1へPARTIAL/runtime-inputを渡していない。

追加したのはreceiver用の [norm edge組立て](../../../../tools/ai-connection/p3-norm-edge.mjs)、[そのfixture](../../../../tools/ai-connection/test-p3-norm-edge.mjs)、[ブラウザ実行入口](../../../../tools/ai-connection/test-lora-managed-snapshot.mjs)、[共同case](../../../../tools/ai-connection/managed-snapshot-browser-cases.mjs) と資料である。

## 入力・loader・領域

原本はローカルFile `Bernini-R_LightX2V_high_noise.safetensors`、1,244,141,856 bytes、SHA-256 `9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945`。新規load時にheaderを検査し、このFileの全体hashをブラウザで1回検証した。後続planは同じFileの検証済み結果を使う。過去4原本の取得・再棚卸し・全体hash再計算は条件にしていない。

loaderは `comfy-lora-b5a4321-linear-diff-v1`。今回のweightはBF16の `linear-down-up`、rank 128、alpha 128、alpha/rank=1。明示strength `{0,1,-1}` を使い、biasはBF16 `additive-diff-b`。これは一般の既定strengthではない。alpha省略時scale=1の規定は固定ComfyUI loaderの範囲に留め、今回の明示alphaとは分ける。

実baseは既受領の709,364-byte bounded artifact、SHA-256 `25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`。HIGHのheader・FP8 weight・F16 bias・F32 scalar scale・quantization configの5 rangeと絶対offsetを照合し、Diffusionの正規providerでF32へ復号した。全81,920 weight・16 biasの復号値とbytesは独立参照へ一致した。`fullFileSHA256Verified:false`、`fullFileHashRecomputed:false` とprior-owner receiptを保持し、現在の全base File hash証明へ変更していない。

| 項目 | 対象 |
| --- | --- |
| full shape | Q weight `[5120,5120]`、bias `[5120]` |
| 選択領域 | weight先頭16行・全5120列、bias先頭16値 |
| binding | weight=`runtime-input:weight`、bias=`hike-parameter:bias` |
| 含むpatch | 明示Q down/up/alphaとQ `diff_b` の2 patch |
| 除外 | 他1050 patchと、Q weight/biasの行 `[16,5120)` |
| native registry | `b1142c55f5f43ac78cd1b167ceed5be0d7f8e9b87b21047ff565d08d38c4c87b` |
| connection registry | `cc6a329b0cffbdf3c2a50914843da33e7d402a815921e206ddf5f8b0fea4c806` |

全除外表と元shapeは [selected-scope.json](evidence/p3/selected-scope.json) に保存。原本・base・graph・registry・plan・bundle・package・snapshotの識別子を同一視していない。

## P1とsnapshotの接続

管理の既存P3試験はnative取引を検証するが、`referenceContext` / snapshot stepの`edges`を渡していなかった。今回、その結果をP1合格へ読み替えず、実取引に次のphase hookを追加した。

1. **preflight**：実header・plan・公開owner bindingから `N-IDENTITY / N-LOADER / N-MAPPING` を既存 `evaluateEdge` へ渡す。この時点で将来の数値・取引receiptを作らない。
2. **実owner.validate checkpoint**：実Hikeで作った全weight/biasを独立期待値へ比較し、実ORT/Hikeのnative検証receiptと結ぶ。`N-NUMERIC` はDiffusionの `EXEC-BERNINI-Q16-F32`、LoRA weight/biasの比較は `N-EVIDENCE` に分ける。規範不合格ならnative commitを許可しない。
3. **公開後**：実snapshotの同じ `context.target`、native owner envelope、元queue処理の終端・release結果から `N-TRANSACTION` を照合する。管理snapshot公開後にのみowner finalize・prepared releaseを完了する。

これは明示したreceiver hookの確認であり、管理の省略された`steps[].edges`が暗黙にP1を呼ぶという主張ではない。事後の取引監査を、未来の事前証拠としてsnapshotへ入力していない。

catalogの短いrepository表記とnative pinのHTTPS表記は外側SourceRefの対応として記録し、native receipt・pinは変更していない。consumerの外側binding token、管理revision、SDK local revision、native epochを別々に保持する。規範のREADYは当該診断edgeの判定であり、生成READYではない。

## 数値・取引結果

事前gateは旧0c固定の独立NumPy参照を再利用した。weight=`1e-5 + 1e-4*abs(reference)`、bias=F32数値完全一致、出力=`1e-6 + 1e-5*abs(reference)`。gateや期待値の生成、モデル全量hashを繰り返していない。

| 公開case | strength | 管理revision | SDK input/application | consumer epoch |
| --- | ---: | ---: | --- | ---: |
| initial-zero | 0 | 1001 | 1 / 1 | 2 |
| initial-one | 1 | 1002 | 2 / 2 | 3 |
| initial-negative | -1 | 1003 | 3 / 3 | 4 |
| reapply-one | 1 | 1004 | 4 / 4 | 5 |
| validation-recovery | 1 | 1006 | 6 / 6 | 6 |
| cancel-recovery | 1 | 1008 | 9 / 9 | 7 |

6件の公開caseすべてで、491,520 weight・96 bias・96出力を全比較した。最大絶対誤差はweight `3.72290287486976e-9`、bias `0`、出力 `7.450580596923828e-9`。正strengthの再適用はweight hashとnative package hashが同一で、加算が累積しない。

取消したcheckpointにも81,920 weight・16 biasの独立比較がある。これを合わせた比較数はweight 573,440・bias112だが、その候補は公開case・公開出力へ加算しない。取消候補の生の16出力はnative APIから記録しておらず、native検証receiptの差分・expected hash・gateを保持する。

| 制御 | 結果 |
| --- | --- |
| 誤った期待値 | `NATIVE_VALIDATION_MISMATCH` を確認。旧active feedを維持し、旧snapshotのcurrentnessを解除。次の正しい選択で復旧 |
| checkpoint取消 | 実queue targetを取消し、stop確認・元native Promise終端・release・再利用可能を確認。元feedを保持し、再適用成功。bounded呼出し後の協調停止 |
| 旧管理request | `TARGET_MISMATCH`。古い管理revisionを新しいnative適用へ使用しない |
| source能力解放 | `SOURCE_BINDING_UNAVAILABLE`。prepared・candidate履歴・sourceへのアクセスがなくてもnative独立copyで実行可能 |
| base復帰 | 同じ管理queueで元baseをvalidate/commit。実行前にsnapshotをuncurrentとし、元処理終端・afterTerminal・releaseを確認。consumer epoch8でbaseへ戻る |

規範の8負例も期待どおり。数値receiptだけ欠落した場合は `COMPATIBLE / NOT_VERIFIED / BLOCKED` を維持し、graph・source hash・選択領域・loaded source・旧kernelは衝突、loader欠落と未知必須normは未確認として扱った。

## 所有権・証拠・再利用

native `CONSUMER_APPLIED`、native `snapshotPublished:false`、管理 `SNAPSHOT_PUBLISHED` を区別した。動的なnative `independent-copy` owner IDを管理ownerへ置き換えず、公開stepの所有権との一致を検査した。lease方式は今回の受入に含めない。最後はbaseへ戻してsnapshotをuncurrentにした後、manager・queue・SDK・consumer・ORT/Hike stage・base providerを終了した。

固定source49件と保存生成物26件を検証。独立読戻しでは全配列・全公開出力に加え、保存したweight/biasからnative feedのpackage hashも再構成した。原本や選択weightの生配列はGitに含めない。比較用typed-arrayの容量は記録したが、OS／device／全modelのpeak memory予算は未測定。

- [小さい受入receipt・全公開16出力](evidence/p3/receipt.json)
- [完全receipt gzip](evidence/p3/run-result.json.gz)：197,667 bytes、SHA-256 `37a229469a21c8d78057d5a6202e59920a4c10e081019bcc401485481758f6bd`。展開後4,683,224 bytes、SHA-256 `f67a2a7533e45647e69122d0443d0f7378f5198135f98fe46d1e1808d2967c7c`
- [独立読戻し](evidence/p3/independent-readback.json)／[レビュー](evidence/p3/independent-review.md)／[source review](evidence/p3/runner-review.md)
- [P1取得と34 fixture](evidence/p3/p1-receiver-receipt.json)／[新規norm組立て5 fixture](evidence/p3/norm-edge-fixtures.log)
- [管理側既存証拠の再利用元](evidence/p3/reused-manager-evidence.json)：Node272、合成native8、実File＋合成base1、package4を元scopeで再利用し、今回の6件へ合算しない

## 残る範囲

今回新規受入したpair/sideはlight HIGHのみ。light LOW・detail HIGH/LOWの既存実base PARTIAL結果は維持するが、今回の規範付き管理取引の新規受入へ変更しない。HIGH/LOW原子的snapshotやcleanup故障・旧rollbackの管理側合成試験も、そのscopeを維持する。

管理normのloader bindingはbase/output dtype・layoutのsidecar値を比較していない。この拒否をP1で実証したとはしない。実SDK/provider/consumerはF32 row-majorを検査し、今回の実行もそれを満たすが、管理側の未実装比較とは区別する。N-ARTIFACTの新しい選択weight package、N-LEGACY、normalization、生成の新しい受入も含めない。

全targetは対応する実graph/consumer成立後のP6。全model session、生成結果への寄与、二組同時合成、fresh VAE連結、device live-resource budget、merge・本番公開は保留する。`generationReady:false` を維持する。

[再現手順](P3-REPRODUCE.md)。前回の[事前確認](RESULT.md)は履歴として残し、本結果とは区別する。
