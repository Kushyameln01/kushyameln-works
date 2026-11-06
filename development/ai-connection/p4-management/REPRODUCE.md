# P4 holding runner 再現手順

2026-11-02 JST。**actualText の owner 先行 P4 数値 PASS は未受領。reference／gate の freeze だけでは dispatch を開かない。** 本手順は source 固定と保持環境への受渡しを行う。model 取得、reference 再生成、旧 L4 fixture 証拠の付替えは行わない。

## 1. 固定 source と管理 commit

配布先では、この変更を含む固定管理 checkout と、owner Git object（P4 実行 `5744f700e17b23d5c18d32315fb6dfbd7c49089a`、追加 compare `7ee36228030ba3bb544a90b1d4b528702a7bae32`、Text packet `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48`）を用意する。Git object がなければ owner の公開 repository から該当 commit を明示取得する。model／private reference は取得対象に含めない。

```bash
export P4_MANAGER_COMMIT="$(git rev-parse HEAD)"
export P4_SOURCE_GIT="$PWD"
export P4_NATIVE_ROOT=/tmp/p4-fixed-public-source
node --input-type=module <<'JS'
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,dirname} from 'node:path';
import {P4_FILES} from './docs/shared/ai-connection/adapters/p4-cross-ffn/source.mjs';
for (const pin of P4_FILES) {
  const path=join(process.env.P4_NATIVE_ROOT,pin.path);
  await mkdir(dirname(path),{recursive:true});
  const bytes=execFileSync('git',['-C',process.env.P4_SOURCE_GIT,'show',pin.sourceRef.commit+':'+pin.path],{maxBuffer:32*1024*1024});
  await writeFile(path,bytes,{flag:'wx'});
}
JS
node tools/ai-connection/run-norm-required-p4-cross-ffn.mjs --help
node tools/ai-connection/run-norm-required-p4-cross-ffn.mjs \
  --native-root "$P4_NATIVE_ROOT" --source-git "$P4_SOURCE_GIT" \
  --manager-commit "$P4_MANAGER_COMMIT" --out /tmp/p4-source-proof-1
```

最後のコマンドは **BLOCKED／native0／browserfalse** が期待結果。private input を読まず、51 source の実 bytes／SHA-256 を固定 Git blob と比較する。`result.json` は実行時の管理 import closure の hash と、指定 commit に存在する bytes との一致／不一致も分けて記録する。実 dispatch には一致が必要。各 `--out` は未作成の絶対 path にする。

## 2. owner-case は新しい管理 sidecar

これは owner native API／既存 receipt schema の宣言ではない。`kind` は `owner-provided-numerical-case` または `owner-provided-shape-reference`。どちらも owner が実際に供給した case を使う。CLI は固定 f76 nativeText 専用。fixture は同一 realm の `runP4HoldingCase` API の境界試験として扱い、actualText 数値受入にはしない。

source-only 実行で生成される `owner-case.example.json` の null は未供給を示す。次の対応表を、実 receipt の source/hash/bytes と実在する RFC6901 pointer で埋める。`MISSING` や `POINTER_PLACEHOLDER` のまま実行を許可しない。

```json
{
  "schemaVersion": "works-p4-owner-case/0.1",
  "kind": "owner-provided-numerical-case",
  "ownerProvided": true,
  "side": "HIGH",
  "inputClass": "native-text-encoder",
  "textRows": 512,
  "inputCohort": "MISSING: exact conditioningBinding and savedInputBindings",
  "norm": "MISSING: numericRequirement and validationSpec from the owner case",
  "priorPass": {
    "sourceRef": "MISSING: actual immutable owner P4 PASS receipt source",
    "sha256": null,
    "byteLength": null,
    "fieldMap": {"result": "/POINTER_PLACEHOLDER", "outputHashes": "/POINTER_PLACEHOLDER"}
  },
  "references": "MISSING: independent payload descriptors and pointers for declared comparisonModes",
  "gates": "MISSING: explicit actualText pre-execution gate source/hash/bytes and pointers",
  "parameterProof": "MISSING: exact fixed owner verify_parameter_identities source declaration",
  "provenance": "MISSING: explicit common-schema producer identities, consumer bindings and trace references",
  "lineage": "MISSING: explicit input ID strings and sourceFrames"
}
```

`priorPass.fieldMap` は `result`、`executionProfileId`、`ownerSourceRef`、`buildId`、`inputClass`、`textRows`、`conditioningBinding`、`savedInputBindings`、`referenceRef`、`gateRef`、`comparisonModes`、25個の `outputHashes`、`strictParameterChecks` を実 receipt へ対応付ける。これは必要な管理側の結合欄であり、未受領の owner receipt に同名欄が存在するという主張ではない。

各値は RFC6901 pointer 文字列。`result` だけは、実 owner PASS 欄が boolean の場合に `{"pointer":"/POINTER_PLACEHOLDER","equals":true,"as":"PASS"}` という明示対応も使える。実欄が true であることを検査し、管理宣言の文字列へ対応付ける。その他の欄は変換・補完しない。

`validationSpec.comparisonModes` は `['composed']`（25比較）または `['local','composed']`（50比較）を明示し、先行 PASS の実 scope と一致させる。`references[mode]` は宣言された mode だけを必要とし、明示された private `path` と全 file `sha256/byteLength`、`arraysPointer`、`parameterIdentitiesPointer`、`inputCohortPointer` を持つ。composed25 scope に未宣言の local reference を要求・読取しない。`gates` は `sourceRef/sha256/byteLength` と宣言 mode の `fieldMap[mode]` を持ち、`numericRequirement.gateRef`／先行 PASS／`validationSpec.gate` と一致させる。actualText gate に既定値はない。

`provenance` と `lineage` は明示 sidecar として必須。既存 artifact descriptor schema で native factory 前に検査する。`producerRefs` は `identityKind/role/algorithm/value/scope` を持つ identity 記録、`lineage.inputs` は入力ID文字列の配列にする。Git `sourceRef` をそのまま identity として渡さない。`transformTraceRefs` がある場合は対応する `ownerCase.trace` も供給する。構文・文書内整合性の拒否は `inputAdmission` として native 互換性から分離し、互換性は実際に供給された cohort を渡した既存 `evaluateEdge` の結果だけを使う。

### 994 の実 binary reference をそのまま渡す

`994ebb9ce01c9e95db9cd18eb877a981152693c5` の HIGH public receipt は `development/ai-connection/p4-real-text-l512/reference/high-composed-receipt.json`。private manifest は25個の little-endian F32 fileを参照する。JSON配列へ再exportせず、保持環境の元 manifest と sibling fileを選ぶ。

`numericRequirement.referenceRef.composed` の public/private identity は次の**実値**。他の必須 referenceRef／prior PASS field を埋めたことにはならない。

```json
{
  "sourceRef": {
    "repository": "Kushyameln01/kushyameln-works",
    "commit": "994ebb9ce01c9e95db9cd18eb877a981152693c5",
    "path": "development/ai-connection/p4-real-text-l512/reference/high-composed-receipt.json"
  },
  "sha256": "277dcccab03492d314c2b9fc44329bc79fdf0375a5b9a35b247333c73932b6e9",
  "byteLength": 39260,
  "payloadSha256": "8dd640f0cbf127c149903eec558ea2a5b804a5bc0a4533dab67ae54da86ec97d",
  "payloadByteLength": 33587
}
```

対応する管理 `references.composed` は次の形式。`MISSING_LOCAL_OWNER_MANIFEST_PATH` はその保持環境の実在する絶対 path に置き換える。public receipt の他環境 path を取得先として使わない。

```json
{
  "kind": "owner-binary-f32-manifest",
  "path": "MISSING_LOCAL_OWNER_MANIFEST_PATH",
  "sha256": "8dd640f0cbf127c149903eec558ea2a5b804a5bc0a4533dab67ae54da86ec97d",
  "byteLength": 33587,
  "arraysPointer": "/arrays",
  "parameterIdentitiesPointer": "/parameterSources",
  "receiptFieldMap": {
    "payloadSha256": "/referenceManifestSHA256",
    "payloadByteLength": "/referenceManifestBytes"
  },
  "inputBindingMap": {
    "/side": "/side",
    "/inputCohort/savedInputBindings/savedArtifactSHA256": "/inputBindings/savedArtifactSHA256",
    "/inputCohort/conditioningBinding/dataSHA256": "/inputBindings/conditioningDataSHA256",
    "/inputCohort/conditioningBinding/attentionMaskSHA256": "/inputBindings/conditioningMaskSHA256",
    "/inputCohort/conditioningBinding/shape": "/conditioning/shape",
    "/inputCohort/conditioningBinding/modelSha256": "/conditioning/modelSha256",
    "/inputCohort/conditioningBinding/tokenizerSha256": "/conditioning/tokenizerSha256",
    "/inputCohort/conditioningBinding/producerExecution": "/conditioning/producer/sourceCommit"
  }
}
```

実 manifest の `arrays[name]` は `{path:name+'.f32',dtype:'float32',shape,bytes,sha256}`。全25個の名前、shape、full-byte extent、hash、finite F32 を検査し、byteOffset／範囲外path／symlink を拒否する。private manifest の全SHA／bytesは実 public receipt の対応欄から照合する。private配列をGit blobとして扱わない。bit列をprivate CDPで渡すだけで、演算・参照生成は行わない。従来JSON配列の `management-json-f32-arrays` は任意の別transportとして残す。

## 3. 保持環境での dispatch と返却

`assets.json` はその環境で実在する `{"model":"/private/original.safetensors","savedOutput":"/private/high-tail-outputs.json"}` を明示する。public receipt の他環境 path を暗黙に使わない。original model は repository 外の local File として選択し、header／extent と run 前後の stat を照合する。whole model hash を再計算したとはしない。

`--text` は元 f76 WKT（8,390,054 bytes、whole SHA `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9`）。全512行、mask、model／Tokenizer／metadata を保持する。公開 Git blob から取得でき、model の取得は不要。

`budget.json` は正確に `scope:'p4-n2-diagnostic-only'`、`textRows:512` と `maxElapsedMs/maxReturnedOutputBytes/maxHikeCapacityBytes/ortSharedMemoryCapacityBytes/maxRawWeightReadBytes/maxDecodedWeightTileBytes` を指定する。値は owner 保持環境の明示上限を使う。静的25出力 extent は63,709,184 bytes。L4予算から推測しない。`device-state.json` は `observedAt` と `resourceState:{status,ownerId,requiredBytes,budgetBytes,occupiedBytes}` の実観測を明示し、ready／occupancy0 を補完しない。

```bash
node tools/ai-connection/run-norm-required-p4-cross-ffn.mjs \
  --native-root "$P4_NATIVE_ROOT" --source-git "$P4_SOURCE_GIT" \
  --manager-commit "$P4_MANAGER_COMMIT" \
  --assets /private/assets.json --text /local/plain-conditioning.wktensor \
  --owner-case /private/owner-case.json --diagnostic-budget /private/budget.json \
  --device-state /private/device-state.json --out /private/fresh-p4-run
```

不足時は browser を起動せず BLOCKED。数値 case context が欠ける場合は明示された private saved/model/reference path も読まない。正常時は同じ conditioning ES module で capture→clone、source→feed（`includeTextEmbedding:false`）→stage→既存 adapter/queue を通す。owner `common.compare` が宣言 mode の25または50比較、固定 owner Python `verify_parameter_identities` が29 selectionを検査する。private Node/CDP は検証 harness の transport であり、native RPC を追加しない。

別の未作成 `--out` と owner-case の `lifecycle.cancelAtProgressPhase` または `cancelAtLifecyclePhase` で対象取消を実行できる。original factory/run の終端後、stage→feed→original source を解放する。実際の解放失敗が生じた場合のみ `recoverOnReleaseFailure:true`、明示 `newResourceGeneration` で recover/rebind を記録する。新 generation の native 再実行を行ったとは記録しない。

正常出力は25 named E4 artifactを実 filesystemへ保存し、fresh readerで全bytesを読戻す。principal は `#blockOutput`、`output` alias は26番目にしない。返却は `result.json`、private `outputs/` と実行 source／入力／reference／gate の hash、取消／終端／release／recover の記録。WASM容量と静的extentを実測peakへ読み替えず、未測定 host／ORT allocator／full peak は null。`generationReady:false`、load／predict／sample は `NOT_READY` を維持する。
