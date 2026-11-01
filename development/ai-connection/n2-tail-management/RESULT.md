# 固定N2 tail管理経路 — runner固定・返却待ち

**管理adapter・規範照合・保存経路を通るrunnerを固定した。次はDiffusion側の実資材保持環境で実行し、返却後に管理接続の受入を記録する。**
実装完全SHAは `5c484a8783ab129a2ff3543a98b2537af9888199`、管理基点は
`03e18b6116c3d778197e4d34ba0364a7dbe918f6`。
branch `codex/ai-connection-e0-e4`、[Draft PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)。
[固定API](https://github.com/Kushyameln01/kushyameln-works/blob/5c484a8783ab129a2ff3543a98b2537af9888199/docs/shared/ai-connection/API.md#fixed-n2-self-attention-tail)、
[Diffusion担当向け引継ぎ](HANDOFF.md)、[再現手順](REPRODUCE.md)、[機械可読状態](RESULT.json)。

ユーザーが確定した3段階は、①管理runnerの固定・push、②保持環境での実行・返却、
③管理が両SHA・Profile・証拠を照合して受入、である。今回①を完了し、②③は待機中。
公開receipt、source検査、制御fixtureの合格を、実HIGH1/LOW3数値・実出力保存の受入へ読み替えない。

## 取得原本・版

指定3本文を配布 `beffdcb800b629d0b13ff43bbc90e9f74c659152` から取得し、Git bytesへ一致確認した。
対象は `self-attention-tail/handoff.json`、native `README.md`、owner `RESULT.md`。
元の数値operator/受入e480、今回の実行a49、capture archive alias、保存replayのsourceを別々に保持する。

| 対象 | 固定識別／結果 |
| --- | --- |
| Diffusion配布 | `beffdcb800b629d0b13ff43bbc90e9f74c659152` |
| Diffusion実行source | `a49aac492cc68e2dd6037e0deb4a6954731a847a` |
| 元受入数値source | `e48021d8da29ef3b3b9e9d6161331c282798b6b3`。過去のprefix/attention証拠を再利用 |
| native API / owner schema | `diffusion-models/0.1` / `bernini-self-attention-tail/0.1` |
| Profile | `bernini-block0-n2-self-attention-residual-f32-v1`、HIGH1・LOW3別case |
| build | `diffusion-models/0.1+bba4dc740028dcecf849a36e395970b24358a6185378336d61d3a063ad72bc74` |
| 新Hike WASM | 4018B / `54c1690e4581a1de0b231d0b538ff280696542c2eb44ebedb4c2c661a6dd3925`、importなし、GateResidual ABI |
| source取得 | 153file、356hash照合PASS。main100source digest、runtime33closure、kernel35digestを別々に照合 |
| runtime source proof | accepted executionの24module/WASM/driver実bytes。captureの同runtime pathをarchive aliasの別hashで保持 |
| gate | candidate-plan5559B / `58a7a187d9580cd5af1d12e4d9552f8880a47c8a89e50b7bf1d27fec4ff11549`。元local/composed gateを維持 |

公開の入力・参照・保存receiptは取得済み。一方、private model/prefix/context/reference/saved output
実体は本環境で未取得。記載された他環境pathを受領済みに扱っていない。
`PRIVATE-INPUT-STATUS.json` とCLIの `BLOCKED / nativeCalls0 / browserLaunchedfalse` がその状態を記録する。
今後はそれらを保有するDiffusion環境で固定管理sourceを実行する。

## 変更境界

新 `createNormRequiredN2TailAdapter` は同realmの `createSelfAttentionTail` / owner.runを直接呼ぶ。
管理request/revision/resource generationは外側に置き、strict native引数へ追加しない。
新RPC operation、LoRA DATA bridgeの流用、native commit/model-session適用はない。
3入力のowned snapshot、trusted prefix/attention/array hash、side/block0/schedule、source/kernel、
5出力shape/hashと元reference/gateを対応付ける。

元catalogと6文書はbyte不変。新candidate catalogは9589B、
`aa492b66fc3775b561bd6535290ebb5eabf7328039c47238e009996bd417943b`。
parent6dae/hash149783を明示し、旧recordを保持して専用shape/numeric recordと
`N-N2-TAIL-SHAPE` / `N-N2-TAIL-NUMERIC` を追加した。
既存evaluateEdgeだけで判断し、規範・native宣言欠落はUNVERIFIED、誤mean意味・誤schedule等は
INCOMPATIBLE、契約一致・数値receipt待ちはCOMPATIBLE/NOT_VERIFIED/BLOCKEDとなる。
[理由付き判断例](evidence/judgment-examples.json) を保存した。

管理の検証callbackは今回のtarget、3input hash、全5output hash、完全referenceRef、
8比較/71680値・7parameter checks・元gateへ束縛する。旧receiptのsuccess booleanでは通らない。
保持環境runnerは固定ownerの `common.mjs:compare` を再利用し、管理に数値演算・別judgeを追加しない。

取消は元factory/run Promise終端まで待つ。遅延旧結果を不採用にし、解放失敗はowner/error.recoverを
保持してqueueを隔離する。recoverはowner終了、rebind後は新generation・新owner instanceを要求する。
旧target取消が新ownerを止めないことも制御fixtureで確認した。

保存は既存E4・採用codec2bdで5出力を別artifactとして扱う。o/gated/residualはLC `[2,5120]`、
gateProjection/gateはC `[5120]`。識別・意味・来歴・evidence・任意binary拡張を実disk読戻しで保持する。
F32→float32はmetadata表記だけで同じbits。公開前cache採用は削除し、既存E5は保存fixtureで
明示dependenciesを付けて別scope検証した。実N2 cache数値受入は主張しない。

## 新規検証と再利用scope

| 検証 | 結果／範囲 |
| --- | --- |
| 全回帰 | **456/456 PASS、fail0、skip0**。基点407＋新規49。LoRA正式82b bridgeの実native共同2caseも旧pinで再検証 |
| 新規49内訳 | norm12、adapter23、storage4、runner7、source3。制御・metadata・codec検査であり実N2数値件数ではない |
| source・規範 | 実bytes/brand、改変source、外部固定catalog pin、元catalog/全旧record不変、未知規範、誤意味/shape/side/schedule/ref/gate拒否 |
| lifecycle | strict ES引数、factory取消、遅延fulfilled/rejected結果、stale target、元Promise終端、release失敗/recover/rebind、deadline後も終端待機 |
| 保存 | 制御adapter→実publisher→temp disk E4→5出力読戻し。signed zero、LC/C意味、全5hash、validation target・拡張保持、改変/欠落拒否 |
| CLI | 実固定source/public receipt/codec検査後、12private role不足でBLOCKED、native0/browserfalse。生成・数値成功を発行せず |
| 固定照合 | 試験中104 runtime/test/reference fileのhash不変。実装checkpointの130fileをGit bytesへ照合 |
| 独立レビュー | source/規範/制御/保存のStep1配布準備はPROCEED。actual private数値/実保存edgeはUNVERIFIEDのまま |

初回一括は既存LoRA1件がskipとなり受入に用いず、単独確認後に全native環境変数を明示して
全456件を再実行した。最終logは `evidence/node-tests.log`。
過去N2の8比較/side・合計143360値、tail単体資源観測、保存replayの出力hashは元scopeで再利用し、
今回の管理実行件数へ付け替えていない。LoRA SDK/kernel fc、consumer5f、codec2bd、VAE855を一括更新していない。

## 資源・未受入・次の返却

診断予算はHike2883584B、ORT共有Memory16777216B、返却163840Bと明示maxElapsedMs。
これはtail単体の観測・限定条件で、総RAMや全工程予算ではない。native ORTMemoryBytes:nullを保持し、
現在の独立ORT Memory観測・host/allocator/GC/File backing/総peakは未検証。

返却待ちは、HIGH1/LOW3の管理経由実数値、private保存済み成果の実hash受領、実N2出力の5artifact保存読戻し。
Diffusion担当から [HANDOFF.md](HANDOFF.md) の返却物が届いたら、管理実装SHA、actual module hash、
native source/Profile、固定input/reference/gate、比較・parameter・package・終端証拠を照合して受入を追記する。
この配布だけでその受入を完了扱いにしない。

cross-attention、FFN、全block、実HIGH→LOW、本番生成、任意LoRA、全体資源予算は受入外。
**generationReady:false、load/predict/sample=NOT_READY。**

変更filesは固定API/export、reference-loaderの明示catalogPath、新candidate4文書、有限norm/policy、
tail adapter、n2-tail source/declaration/input-pins/package helper、Node/browser runnerと新5試験、
このdirectoryのsource/input/固定checkpoint/検証/引継ぎ記録。各pathはcheckpoint receiptとGit差分で追跡できる。
