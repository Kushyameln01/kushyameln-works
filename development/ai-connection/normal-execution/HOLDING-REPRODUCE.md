# VAE / P4 normal holding runner

2026-11-02 JST。既存4667 mean通常実行、独立診断、f1取消受入はそのcommitのまま保持する。新入口は `run-normal-holding.mjs`。通常要求に独立参照、gate、既存PASS、数値receipt、全中間E4を渡さない。今回のローカル環境にVAE graph / conv2 / original Bernini model / saved-tail JSONは存在せず、管理側NN実行は未受入。

## Service bootstrap

固定管理commitを配布後に、そのcheckoutで実行する。`MANAGER_COMMIT=$(git rev-parse HEAD)` は呼出元が配布済み固定commitへ置き換える。未commitのruntime差分があれば実行前にBLOCKEDとなる。

VAEは配布498eb25f027666e3cc661a5851288e4aabf39f0a、NN source b2541fd2e3b7edcecd810f5215b1bd9f86afc0f4。固定Gitの `development/inference/owner-capabilities-20261102/diagnostics/execution-source-reconciliation.json` のproductionClosure16件を、同じ相対pathで `VAE_NATIVE_ROOT` にmaterializeする。P4は実行30e283bb115741af6b475e9bdc41700a4e564053、配布5278069ee0b72a9f2d684cdc8075e460187a7acf。実行commitの `docs/shared/diffusion-models/api/build-info.mjs` と、そのBUILD_SOURCES113件を同じ相対pathで `P4_NATIVE_ROOT` にmaterializeする。各ファイルは `git show COMMIT:PATH` の原byteを使い、bootstrapが実Git bytesとhash/byte数を検査する。新しいmodel/graphの取得・再exportはしない。

P4でも `--codec-root "$VAE_NATIVE_ROOT"` を指定する。新入口だけが固定498 owner tensor codec（9104B、SHA-256 e200fef69be3909a13bc91a59743681df1072817eadc7c1865717afe0c3c9f8e）を選び、Textのactual normalization markerとUint8 maskを保持する。既存2bd codecとmean受入は変更しない。

```sh
node tools/ai-connection/run-normal-holding.mjs --help
node tools/ai-connection/run-normal-holding.mjs \
  --configuration "$PRIVATE_CONFIG" --native-root "$VAE_NATIVE_ROOT" \
  --preflight-only
```

preflightはpublic source実byteと選択されたprivate graph/modelのstatのみを確認し、入力payload、original model whole hash、NN、Workerを読まない。source証明はservice内の作業であり、通常Artifact descriptorへ要求しない。

## Local configuration

以下は管理側のlocal-path設定でありnative API schemaではない。大文字pathはholding環境の実在ファイルへ置き換える。HTTP asset pathは拒否する。過去receiptに出た他環境の絶対pathを暗黙使用しない。

VAE encode（actual RGB WKTを選択する。値を生成して埋めない。最初のjoint holding受入は下記decodeを優先する）：

```json
{
  "kind": "works-normal-holding-local/v1",
  "module": "vae",
  "operation": "encode",
  "manifestPath": "/PRIVATE/accepted-rect-bundle/manifest.json",
  "files": {"encode.onnx": "/PRIVATE/accepted-rect-bundle/encode.onnx"},
  "inputs": {"input": {"kind": "wktensor", "path": "/PRIVATE/actual-rgb.wktensor"}}
}
```

filesのkeyは選んだmanifest.assetsの実file名に合わせる。encodeはencoderのみ、decodeはdecoderBody / conv2Weight / conv2Biasのみを要求する。decode設定ではoperationをdecodeへ、inputをactual raw posterior mean WKTへ、filesをその3件へ置き換える。最初のjoint holding受入は保持済みP2 restored mean（WKT SHA-256 dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612）を明示選択したnormal decodeとする。同cohortの既存P2 f76 RGB/gateは通常完了後の診断だけに使える。保持済みreceived RGBは過去decoder出力（6460B、WKT SHA-256 0d0a28c963445ab88cb4553296489d965a73d3a56b0f1bbff7daa54f6d60834a）であり、ordinary encode入力として使えるが元encoder fixtureではない。このencodeに旧encode独立参照を付けず、別のexact-cohort参照が無ければ数値診断はNOT_VERIFIEDのままにする。必要なgraph bytes/hashはnativeが実行時に確認する。original VAE safetensorsは要求しない。

```sh
node tools/ai-connection/run-normal-holding.mjs \
  --configuration "$PRIVATE_CONFIG" --native-root "$VAE_NATIVE_ROOT" \
  --manager-commit "$MANAGER_COMMIT" --out "$FRESH_PRIVATE_OUTPUT"
```

P4は `module:"p4"`、`side:"HIGH"|"LOW"`、`modelPath`、`inputPayloadBudgetBytes`、`inputs:{residual,timeAct1,conditioning}` を指定する。budgetはserviceが選ぶ1論理input payloadの許容量であり、RAM/ORT/host peakではない。受領normal L512例の許容量は8450560 B。managerはshapeからsupportedやbudgetを推測しない。

inputs各entryは次のいずれか。

- `{kind:"wktensor",path:"/PRIVATE/...wktensor"}`：actual File headerを保持する。
- `{kind:"owner-json-f32",path:"/PRIVATE/saved-tail.json",pointer:"/ACTUAL_ARRAY_POINTER",metadata:{...ordinary native tensor metadata...}}`：選択JSON配列をF32へtransportする。pointerとmetadataは呼出元が実原本から選ぶ。
- `{kind:"f32-le",path:"/PRIVATE/whole-array.f32",metadata:{...ordinary native tensor metadata...}}`：whole LE F32をtransportする。演算・shape導出・mappingではない。

独立参照やmetadata authority receiptは不要。WKTに既にある値と明示metadataBinding.fieldsが矛盾すると拒否し、未知値を補う場合も呼出元の明示値として保存する。意味、normalization、model/tokenizer bindingをhelperが自動追加しない。旧f76 conditioningには新markerが無いことを保持する。新498 Textの `umt5-final-rmsnorm-f32-v1` と30e P4が要求する `encoder-final-rmsnorm` は別の実宣言であり、runnerは変換せずownerの理由を返す。

```sh
node tools/ai-connection/run-normal-holding.mjs \
  --configuration "$PRIVATE_P4_CONFIG" --native-root "$P4_NATIVE_ROOT" \
  --codec-root "$VAE_NATIVE_ROOT" --manager-commit "$MANAGER_COMMIT" \
  --out "$FRESH_PRIVATE_OUTPUT"
```

VAE decodeで対象取消・復帰を確認する場合は同じ設定で `--scenario cancel-recover` を指定する。既存f1の対象protocolを再利用し、actual Worker-created ACK後にAを取り消し、元Promise終端/解放を待ち、実Bがactive中に旧Aの取消を拒否する。B完了後に出力を保存してdisposeする。ACK前に完了した場合は取消未観測として失敗し、時間待ちを停止証拠にしない。このscenarioはVAE専用であり、P4のmain-realm ownerへWorker証明を流用しない。

## Workflow metadata query

設定に `workflow:{shapeInput,bindings}` を指定できる。shapeInputは共通 `deriveWorkflowShapes` の元入力をそのまま渡す。bindingsは例として `{requirementId:"context:0:0.rgb",owner:"vae",operationId:"encode",supply:{meaning:"rgb-unit"}}`、またはlatent decodeにactual VAE modelSha256とraw posterior-mean meaningを明示する。一般latentというroleから意味を推測しない。`--scenario query` はpayloadを読まず、共通routerから実owner.querySupportへ渡す。target81のmetadataだけをcontrolled Rectから作り替えて受入れない。元sample mediaのunknownと、実供給controlled Rect snapshotを分ける。

## Returned evidence and pending owner execution

通常完了はEXECUTION_COMPLETED、diagnosticStateはNOT_REQUESTED。output.wktensorとresult.jsonをfresh private directoryへ保存する。actual owner input/output binding、queue terminal/release、current snapshot、実Worker created/closed、進捗を記録する。ORT allocator/host/total peakは未観測のためnull。P4はmain-realm native ownerであり、Worker数からORT session解放を推測しない。owner disposeの返答とnative resourcesを別に記録する。

現在のholding execution requestは、固定管理commit・上記固定public source・既存local assetsを用い、(1) retained P2 restored mean→normal VAE decode、(2) 同decodeのcancel-recover、(3) retained received RGB→ordinary normal VAE encode（数値診断NOT_VERIFIED）、(4) actual three tensors→normal P4を各fresh directoryで順番に実行し、結果と原Promise終端/解放を返すこと。新graph export、Text再encode、reference生成は不要。実行不能ならmissing asset/unsupported理由とnative0を返す。任意の数値診断は通常結果保存後の別scopeであり、通常要求へreference/gateを再導入しない。

## Focused tests

受領済みsource rootを明示する。NORMAL_P4_NATIVE_SOURCE_ROOTはactual30e build-infoを含む。WORKS_RECT_VAE_ROOTは855 fixtureを同じrepo相対pathに保持するroot。任意の絶対privatepathへのfallbackはない。

```sh
NORMAL_VAE_NATIVE_ROOT="$VAE_NATIVE_ROOT" \
NORMAL_P4_NATIVE_SOURCE_ROOT="$P4_NATIVE_ROOT" \
WORKS_RECT_VAE_ROOT="$VAE_855_FIXTURE_ROOT" \
node --test --test-isolation=none tools/ai-connection/test-run-normal-holding.mjs
```

## Optional saved-output diagnosis

`diagnose-normal-holding.mjs` は保存済みnormal outputと既存reference/gateだけを読む別CLI。native `.diagnose` は呼ばず、VAE/P4再実行、graph/model読出し、Worker、全中間出力、oracle生成は0。通常result.jsonは変更しない。DIAGNOSTIC_FAILでもordinary normal completionを無効化しない。sourceGitには固定7ee comparatorと498 standalone tensor codecのGit objectが必要。

次は最初のP2 restored mean→normal VAE decode専用例。referenceは855の独立FP32 `png-roundtrip.f32`（6144B、44cf55...）、gateは同版reference-report.json（3882B、f21861...）に既存のmaxAbs cap。absolute-onlyと明示してその既存capだけを比較し、relativeは0に固定する。manifestの別scopeの0.002 gateやmean roundtripの2e-6を転用しない。inputPayloadSha256とexpectedInputFileSha256の両mapを、このdecodeのactual normal input payload / whole-file SHAへ束縛する。retained decoded RGB→encodeにはこのreferenceを使わない。

```json
{
  "kind": "works-normal-holding-diagnostic/v1",
  "outputKey": "output",
  "inputPayloadSha256": {
    "input": "71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063"
  },
  "expectedInputFileSha256": {
    "input": "dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612"
  },
  "reference": {
    "kind": "f32-le",
    "path": "/EXISTING/855/development/inference/e6/fixtures/png-roundtrip.f32",
    "sha256": "44cf55e9ea5896f985a0ccf26f61cbb52650fd1a53d3fe80fc3e03aaae545c29",
    "byteLength": 6144,
    "shape": [1, 3, 1, 16, 32],
    "sourceRef": {
      "repository": "Kushyameln01/kushyameln-works",
      "commit": "855f435120f08eb9e818e51281fc26f0e2633829",
      "path": "development/inference/e6/fixtures/png-roundtrip.f32"
    }
  },
  "gate": {
    "path": "/EXISTING/855/development/inference/e6/reference-report.json",
    "sha256": "f2186145f7ea752530696d0828863228320ebca6f7d8d29d0eceed3380fc2e8e",
    "byteLength": 3882,
    "mode": "absolute-only",
    "fieldMap": {"abs": "/comparisonGate/maxAbs"}
  }
}
```

```sh
node tools/ai-connection/diagnose-normal-holding.mjs \
  --normal-result "$COMPLETED_NORMAL_DECODE" \
  --configuration "$EXISTING_REFERENCE_GATE_CONFIG" \
  --source-git "$FIXED_PUBLIC_SOURCE_GIT" --out "$FRESH_DIAGNOSTIC_OUTPUT"
```

WKT referenceは `kind:"wktensor"`、既存JSON配列は `kind:"json-f32",pointer:"/actual/existing/array"` を指定する。abs/relの既存gateは `mode:"absolute-relative",fieldMap:{abs:"/actual/abs",rel:"/actual/rel"}` とし、どちらのwhole SHAも必須。P4では既存final blockOutputだけを同様に選択し、inputPayloadSha256とexpectedInputFileSha256にresidual/timeAct1/conditioningの全3件を、normal.inputReceiptsと完全に同じkeyで指定する。旧25cutやowner numerical runnerの再実行は不要。新normal P4/marker受入のpendingを、このoptional比較で置き換えない。

このwhole-file mapはWKTに保存されたmask/model/normalization等のheader差を検出する。raw F32/JSON transportの外で与えたmetadataや、別のmetadataBinding/ordinary descriptorの宣言までは、そのraw file hashで認証されない。それらは呼出元の宣言として残る。この二重hash照合は診断専用であり、通常入口へhash証拠を追加要求しない。

診断はnormal outputの保存whole/payload hashとinput cohortのpayload / whole-file hash両方を先に確認し、reference/gateのactual whole SHAを検査した後、固定7ee `common.compare` へ全値を渡す。結果はDIAGNOSTIC_PASS / DIAGNOSTIC_FAIL / NOT_VERIFIED。receiptにactual output/reference/gate/config bytes、実gate pointer/value、normal management source、診断runner hash、owner comparator/codec version/hashを保存する。入力不足やcohort/hash不一致ではNOT_VERIFIEDとなる。通常入口にはこの設定を渡さない。
