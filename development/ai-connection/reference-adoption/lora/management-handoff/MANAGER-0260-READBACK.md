# 管理0260の受領と残る接続差

2026-11-01。管理の正式native入口を受領し、宣言の欠落・競合を拒否する変更を独立確認した。LoRA `82b21f09cb63926543181b16f0e97ebc6b9fa6be` の三段階raw DATAを、この入口へ接続するbridgeは未実装・未受入である。管理入口の存在、制御fixtureの合格、owner DATAの正式採用を区別する。

## 固定sourceと確認結果

管理PR [#7](https://github.com/Kushyameln01/kushyameln-works/pull/7) の確認commitは `0260fc0b153c2491cc94aca3d75c7835a03bf0f7`。原文で確認した入口は次の二つである。

| source | API／役割 | SHA-256 |
| --- | --- | --- |
| [adapters/norm-required-lora.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/0260fc0b153c2491cc94aca3d75c7835a03bf0f7/docs/shared/ai-connection/adapters/norm-required-lora.mjs) | `createNormRequiredLoraExecution`、`works-norm-required-lora/0.1-draft.1`。実native facadeを包む管理入口 | `aac1c46cdbcc5826d5733e76a51ea93485d2b9ff4323629d46867ee0f0d40c1f` |
| [norm-execution.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/0260fc0b153c2491cc94aca3d75c7835a03bf0f7/docs/shared/ai-connection/norm-execution.mjs) | `createNormExecution`。既存evaluatorで `declaration → validated → published` を管理 | `47d2138d76c5678c45e721660abba5e26f21c7d22039239c169c192c7e990635` |

[17ファイルの実行source照合記録](evidence/manager-0260-boundary-sources.json)は完全commit、path、長さ、SHA-256、Git blob一致を保持する。LoRA側の比較対象は [82b DATA factory](https://github.com/Kushyameln01/kushyameln-works/blob/82b21f09cb63926543181b16f0e97ebc6b9fa6be/docs/shared/inference/lora/management-admission-inputs.mjs) と [数値宣言export](https://github.com/Kushyameln01/kushyameln-works/blob/82b21f09cb63926543181b16f0e97ebc6b9fa6be/docs/shared/inference/lora/numeric-declarations.mjs)。native mapping正本 `createDiffusionDiagnosticAdapter` とfc/5fのsource pinsは変更していない。

- LoRA原文probeをreceiver `40abf43c7c9cf565b115cafc36c7e33f4ae661f1` → 管理0260で独立再実行し、負例を先に確認した。欠落6件・競合6件の **12/12**、正例 **2/2** が適合、exit 0。[全結果gzip](evidence/manager-0260-probe.json.gz)を保持する。これはbase/output dtype・layoutの宣言metadata検査である。
- 管理のloader宣言、phase境界、mandatory LoRA入口の3 suiteを独立実行し、**35/35 PASS、fail 0、skip 0**。[実行log](evidence/manager-0260-boundary.log)を保持する。fake public native adapterを使う制御fixtureであり、実LoRA・実base・実SDK/Hike/consumerの新しい数値受入ではない。
- 旧eddaの0/12適合は変更前の履歴として保持する。今回の0260結果で、その宣言比較の未対応は解消した。owner82b DATAを正式入口へ接続したことや、新しい実native適用を示す結果にはしない。

## 正式bridgeで合わせる差

| 論点 | 原文上の差と必要な調整 |
| --- | --- |
| planとphaseの所有者 | 管理入口は生成時に単一の不変 `edgeInput` を受け、自分の `plan()` が返すplanだけをWeakMapで受け入れる。82b factoryは実plan・実bindingの取得後に生成し、patch別の `preflightInputs()`、実検証後の `checkpointInputs()`、実公開後の `postpublicationInputs()` を返す。呼出し順を明示したbridgeが必要で、三methodをそのまま入口の引数へ差し替えられない。weightと明示Q bias、各source dtypeの宣言・originを欠落させない。 |
| 事前宣言と実証拠 | 管理入口は事前に `numericRequirements[0].referenceRef.expectedOutputSha256`、`referenceContext.environment`、gate、PARTIAL scopeを要求する。82bのexpected-output hashはfactoryの `referenceIdentity` にあり、同位置のreferenceRefには複写されない。environmentも同位置にない。またpreflightには数値要求・evidenceTargetがなく、checkpoint以降には実証拠がある。管理constructorは事前に入れた証拠を拒否するため、事前宣言とその後の観測を分けて接続し、将来receiptを捏造しない。 |
| weight/bias比較receipt | 管理の `readOwnerEvidence` は `result`、`coverage/scope/baseKind/referenceId` 等を持つflat receiptを要求する。82b checkpointは `weightComparison` / `biasComparison` の全選択値の件数・結果・artifact識別を要求する。bridgeで実比較からflat receiptを作る場合も、81,920 weight・16 biasの証拠とgate/reference/source/plan/両registryを保持する。consumerの16出力合格だけをweight/bias比較の代わりにしない。 |
| 実target・公開・寿命 | 管理の `afterPublication` はcoordinatorが生成したbrand付きcontextと実receipt、terminal/release、native所有権を確認する。82b DATAには実 `snapshotTarget` と外側 `ownerValidation` の束縛が必要で、欠落時は `null / bound:false`。正式bridgeでcommit前に拒否し、後のpublicationから補わない。stageのcurrent判定と、公開後の独立した `isPublishedCurrent` を別々に接続し、閉じたstageを公開後の資源判定へ再利用しない。 |

管理0260の二ファイルは82b DATA moduleをimportしておらず、そのownerAdmissionのorigin・presence・phaseBindingを正式に採用する接続はまだない。これは取得したコードのAPI差であり、今回の35件の合格範囲を否定するものではない。必要なbridge変更後は、同じ欠落・競合負例を先に再確認し、実target・currentness・phase・所有権の変更境界を確認する。owner側へREADY判定を追加したり、同じ経路に旧管理bridgeを重ねたりしない。

## 再利用と次の一目的

既存6 caseの実LoRA/実base PARTIAL数値証拠は実行commit `25e5b56feeb070594110bb292d9de21e4e234f0a`、配布commit `40f7f0cfc95bfb5f3e8ed5cc68c4bdb196cbbf68` のscopeで再利用する。この引継ぎでは保存済みmetadataを新DATAへ再投影しただけで、旧6 case、原本の取得・全体hash、実native計算を再実行していない。

拡張目的は `JOINT-HIGH-SUCCESS-LOW-FAILURE-CONTAINMENT` の一つを維持する。HIGH成功後のLOW失敗で共同snapshot公開を防ぎ、復帰と両native終端・releaseを確認する。既存の合成LoRA/baseを使ったnative `low-failure` は元scopeで再利用し、新しいLOW実モデル合格や同時合成と数えない。入力はユーザーが選ぶローカル `.safetensors` で、過去4原本すべての取得・hash再計算は前提にしない。全targetは対応する実graph/consumer成立後とし、全model/session・生成・本番公開を追加しない。`generationReady=false` を維持する。

## 再現

別々のclean worktreeを上記完全commitで固定する。probeは自身とwitnessのHEAD Git blobを確認するため、receiver `40abf43c7c9cf565b115cafc36c7e33f4ae661f1` のworktreeから実行し、出力はsource repo外の新しい空ディレクトリに置く。

```sh
node tools/ai-connection/probe-manager-lora-declarations.mjs \
  --manager-root /path/to/manager-0260 \
  --manager-commit 0260fc0b153c2491cc94aca3d75c7835a03bf0f7 \
  --owner-declarations development/ai-connection/reference-adoption/lora/management-handoff/OWNER-NUMERIC-WITNESS.json \
  --out /absolute/private/new-empty-declaration-probe
```

次は管理0260のworktreeから実行する。記録時はNode `v24.19.0`。

```sh
node --test --test-isolation=none \
  tools/ai-connection/test-loader-norm-fields.mjs \
  tools/ai-connection/test-norm-execution-boundaries.mjs \
  tools/ai-connection/test-norm-required-lora.mjs
```

この二つの再現手順はmetadata／制御境界の検査に限る。正式82b bridgeと実共同snapshotの受入結果は別途記録する。
