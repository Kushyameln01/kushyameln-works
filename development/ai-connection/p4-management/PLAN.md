# P4管理接続とP3追加境界 Implementation Plan

**Goal:** 既存管理経路へ独立P4候補を接続し、P3保存・事前guard差分とworkflow受渡しを完成させる。
**Architecture:** SPECの外側adapter方式。owner演算／mappingを呼び、既存evaluateEdge／queue／E4を再利用する。
**Tech Stack:** JavaScript ES modules、Node24、Chromium、既存Python metadata観測、既存WASM/ORT owner。
**Spec:** `SPEC.md`。ユーザー指定の実装方法・保持環境runnerを継承する。

## 変更対象と分担

### Task 1: P4宣言・catalog・規範（p4_norm）

Create `docs/shared/ai-connection/adapters/p4-cross-ffn/{declarations,source}.mjs`、
`reference/candidates/p4-cross-ffn/{catalog,shape,numeric-execution,norms}.v1.json`。
Modify既存 `norm-bindings.mjs` と `norm-execution.mjs` だけを有限binding／新policy追加で拡張する。
Test `tools/ai-connection/test-p4-cross-ffn-norms.mjs`。

Exports:
- `P4_PROFILE_ID` ownerProfile、`P4_POLICY_ID='p4-cross-ffn'`、
  `P4_SHAPE_RECORD_ID='SHAPE-BERNINI-BLOCK0-N2-CROSS-FFN-F32'`、
  `P4_EXEC_RECORD_ID='EXEC-BERNINI-BLOCK0-N2-CROSS-FFN-F32-CANDIDATE-V1'`。
- `P4_PINS`（sourceRefは5744のstage、配布7ee／metadata277／build、catalogRef、source50+owner compareのhash）。
- `P4_OUTPUTS` の25named spec、`p4OutputSpecs(textRows)`（shape/axes/semanticId）。
- `prepareP4NormInputs({referenceSet,managerSourceRef,binding,target,conditioningMetadata,savedInputBindings,
  validationSpec,numericRequirement,resourceState,extensions})` → `edgeInput`。
  numericRequirement欠落ならcompatible/not-verified/blocked。fixture/nativeText cohortを取り違えない。
- `verifyP4CrossFfnSource({files})` / `isVerifiedP4CrossFfnSource(proof)` のbrand。

- [x] missing decl／known mismatch／numeric-only missing／fixture→nativeText付替えのREDを確認。
- [x] 実loaderとevaluateEdgeでGREEN。旧parent6file/N2/P2 bytesを保持。

### Task 2: P4 native adapterと保存（p4_adapter）

Create `adapters/norm-required-p4-cross-ffn.mjs`、`adapters/p4-cross-ffn/package.mjs`。
Test `test-norm-required-p4-cross-ffn.mjs` と `test-p4-cross-ffn-package.mjs`。

Interface `createNormRequiredP4CrossFfnAdapter({nativeFactory,conditioningClone,conditioningSnapshot,conditioningMetadataBytes,
  verifiedSource,binding,artifactStore,executionScope})` → `run/cancel/recover/rebind/inspect/dispose`。
`run({referenceSet,edgeInput,target,inputs:{residual,timeAct1,conditioning},readCurrent,
  diagnosticBudget,validationSpec,validateOutput,publishOutput,signal})`。
`nativeFactory({target,signal})` は外側bundle `{owner,stats,dispose,recover}` を返す。
owner.runへ管理fieldsを追加しない。bundle側がstage→feed→sourceを終了する。
clone/snapshotはownerの同一module capabilityであり、structuredClone(capture)は禁止。
conditioningMetadataBytesも同じ固定owner exportを渡す。owner固有encodingをJCSで代替しない。
validation callbackはowner数値関数、receiptはtarget/inputHashes/outputBinding/reference/specへ厳密結合。
scope `boundary-fixture` の結果をactual数値受入と表示しない。

Publisher `createP4OutputPublisher({storage,artifactRef,receiptRef,ownerId,textRows,sourceRef,
  provenance,lineage,extensions})` と `readP4OutputPackage(storage)`。
E4全25artifact・codec・evidence/trace/extensionsを実読戻しし、principal `#blockOutput` を返す。
budgetはscope `p4-n2-diagnostic-only`、maxElapsedMs/maxReturnedOutputBytesと
WASM/ORT/read/tile上限を明示。未測定peakはnull、旧L4予算をL512へ暗黙転用しない。

- [x] source/norm省略、strict native args、capture mutation、取消・旧結果、release失敗／新generation、25出力保存のRED。
- [x] 既存queue/E4でGREEN。入力/出力意味とscopeを維持。

### Task 3: 固定holding runner（p4_runner）

Create `tools/ai-connection/run-norm-required-p4-cross-ffn.mjs` と
`norm-required-p4-cross-ffn-browser.mjs`、変更境界CLI試験。
CLIは `--native-root --assets --text --owner-case --diagnostic-budget --out --manager-commit`
（必要なsource/import/path入力を追加する場合は説明する）。
owner-caseは管理側の外側manifestとしてschemaを明示し、native APIと称さない。
実Textのowner prior P4 PASS receipt、独立25出力reference／gate／parameter identity、
input cohort／private pathsが欠ければBLOCKED/native0/browserfalse。
同一realmでcapture→clone→source/feed/stageを構築。owner既存common.compareを使う。
caseにないreferenceを作らず、source/verifierの実bytesを固定Gitへ照合する。
正常／対象取消／release/recover／E4保存読戻しのcaseを返せるrunnerを固定する。

- [x] CLI欠落・未知schema・改変source／referenceと、compatible numeric不足のRED→GREEN。
- [ ] localはactualText数値依存待ちを正しく記録し、固定sourceをownerへ配布する。

### Task 4: P3追加3条件（lora_return）

新LoRA配布 `a80db72feea60b9bd69e292e4716665c6f0ee77f` が、固定管理884の正本runnerで
実行した返却を取得。元60dの6caseと区別し、source/Git bytes・actual File digest・
6case request/revision/generation/phase/snapshot・E4 fresh disk readback・負例・解放を照合する。
ownerが実施したE4負例はfresh reader内の改変／snapshot nullであり、別方式へ読み替えない。

- [x] 既存formal bridge試験へwrong expectedのexact guard/counter回帰を追加。
- [x] 受領manifest・gzip・固定source・保存記録・152検査・準備前guardをportable verifierで照合。
- [x] 未実行の追加delta prototypeは今回配布せず、実File再hash／再推論を省略。
- [x] 最終root取得照合とLoRA担当へのscope付き返答。

### Task 5: Workflow／共同受入／共有（root）

- [x] workflow担当の元bytes/source比較結果を検証し、handoff JSON/MDを固定してVAEへ渡す。
- [x] 最終freezeの全AI接続回帰516/516 PASS、150source/API/reference/test bytesを試験中保持。P2受入を維持。
- [ ] 固定管理runnerをpushし、Diffusionへ実Text数値不足と必要返却を具体的に伝える。
- [ ] 取得ACK／数値実行／取消／保存／資源実測／未受入を別記録で照合。
- [ ] 完全SHA・API差分・再利用証拠・新規検証・資源・再現・残件を報告し、Draft PR更新。

## Review focus

nativeText captureのbrand維持、K4証拠の付替え拒否、未来receiptの拒否、
factory取消後の元Promise終端、解放失敗quarantine、historical snapshotの再公開偽装禁止、
入力配列/任意拡張/frame順の保持、静的extentと実測peakの区別を優先する。

## 固定直前の検証

rootの最終回帰は516 PASS／0 FAIL／0 SKIP。初回の中間回帰は509件の試験自体はPASSしたが、
host修正が並行しsource bytes不変条件を満たさなかったため、最終合格には用いていない。
その後のsole evaluator、composed25、publisher schema、元binary reference transportの変更境界を
含めて全sourceを再固定し、上記516件と不変条件を確認した。
LoRA/VAE向け文書・受領記録は9e9b3ad4258a7f91542e7c74ab1011b1b13921edへ先行push済み。
P4 actualText数値はowner事前PASS未受領のため、共同native dispatch受入だけを保留する。
