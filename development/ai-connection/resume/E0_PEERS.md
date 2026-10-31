# E0 GitHub相互受領とAPI差分の追補

2026-10-31 JST。実行計画Pageの版`0.2-draft.2`とE0/GitHubの該当本文をPage閲覧toolで確認した。今回の取得元はGitHubの固定commitであり、旧Pageの422記録、提供者local path、当方のPage復元試験を相互受領の代用にしない。既存棚卸し・試験を作り直さず、現在のsource、相手自身の受領記録、API差分だけを追補する。

当方の比較基点は`438972f30242e0a3bc66edb8591f38eaa0fcd384`、[PR #6](https://github.com/Kushyameln01/kushyameln-works/pull/6)。本作業中の未commit rectangle/attention変更はこの比較へ混ぜていない。

## 取得した固定source

| 担当 | GitHub branch / 完全commit | 実際に確認した本文 |
| --- | --- | --- |
| 管理 | `codex/ai-connection-e0-e4` / `a26879057d169cb2eecff30503d64adba5057c52`、[PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7) | [API](https://github.com/Kushyameln01/kushyameln-works/blob/a26879057d169cb2eecff30503d64adba5057c52/docs/shared/ai-connection/API.md)、README、external adapters、queue、static descriptor例、E0取得receipt、実行結果 |
| LoRA | `codex/lora-connection-v2` / `2bba90785292e42a0c7c8756685b0d8b128b2dcf`、[PR #4](https://github.com/Kushyameln01/kushyameln-works/pull/4) | [CONNECTION_V2](https://github.com/Kushyameln01/kushyameln-works/blob/2bba90785292e42a0c7c8756685b0d8b128b2dcf/docs/shared/inference/lora/CONNECTION_V2.md)、実sdk/planner/loader/v1-adapter、registry対応、A0/L1結果 |
| VAE | `codex/e6-vae-rect` / `7e091192232fae36367b550ca5fada88915a0703` | [API](https://github.com/Kushyameln01/kushyameln-works/blob/7e091192232fae36367b550ca5fada88915a0703/docs/shared/inference/API.md)、[CURRENT-PEERS](https://github.com/Kushyameln01/kushyameln-works/blob/7e091192232fae36367b550ca5fada88915a0703/development/inference/e6/CURRENT-PEERS.md)、peer receipt、RESULT、native API/codec |

GitHub connectorで管理READMEを固定commit取得し、network認可付き`git fetch --no-tags origin codex/ai-connection-e0-e4 codex/lora-connection-v2 codex/e6-vae-rect`と`git show <commit>:<path>`で確認した。36個の関連text sourceを読み、Git blob SHA-1を独立再計算、bytes/SHA-256/実exportを`peer-acquisition.json`へ固定した。モデル・LoRA原本payloadは取得せず、runtime試験・相手の試験再実行は行っていない。

## 相手本人による当方source受領の証拠

| 相手の固定記録 | 記録されている受領・試験 | まだ代用しないこと |
| --- | --- | --- |
| 管理a268 `E0-SOURCE-BASELINE.md` / `E0-SOURCE-RECEIPT.json` / `E-RESULT.md` | 原902、exact f522、latest83をGit取得しarchive全blob/実exports/buildを照合。f522の実Hike/ORT F32 wire・conditioning/mean128/schedule/Eulerと、合成File→実source adapter→LoRA v2 inspectのChromium記録あり | exact438の受領記載はない。実base×実LoRA共同受入・全model・全生成の証拠ではない |
| VAE7e091 `CURRENT-PEERS.md` / `current-peers/receipt.json` | exact438のsource/build/kernel取得を明示。実64 mean→当方direct Hike正規化→明示G1C codec保存/読戻し→当方復元→実VAE UI raw decode一回の限定結合を報告 | Diffusion RPC全工程、生成sample、rectangle profileの438対応、利用者端末負荷の受入ではない |
| LoRA2bba `CONNECTION_V2.md` / `A0_L1_RESULT.md` | SDK v2の取得可能sourceと74件の合成非ゼロbase/Hike/test consumer記録がある | 当方f522/438のsourceをLoRA本人が受領・照合したという記録は、この固定版では見つからない。LoRA側の「取得後に実base接続」を当方のfetch成功で解消済みにしない |

管理a268の取得履歴は、最初の422/not-our-refと、後のPR共有に基づく取得成功を両方残す。`unavailable:[]`と新しいsource-acquiredを現在の取得状態として読む。実行計画Pageの改訂説明に残る古い422も、この後続GitHub証拠を上書きしない。

管理が取得した83と当方438の`docs/shared/diffusion-models/`はGitで差分0、buildも`diffusion-models/0.1+f7f23c2291886de637cb06ae001fc748d29232f7c8919683467da5eef6cfb80e`で一致する。ただしruntime bytesが同じことと、exact438の相手本人受領記録は別である。

## 実exports・CLI・native版

- 管理`createDiffusionAdapter(options)`は外側adapter。`descriptor.nativeAPI.version==='diffusion-models/0.1'`と明示`binding.nativeSessionId/inputRevision`を要求し、`requestId→jobId`、fixed native build、session/revision/opの返信一致を検査する。`load/predict/sample`はallowedMethodsに含めない。管理localRevisionをnative inputRevisionへ上書きしない。
- 管理`createLoraAdapter(options)`は`lora-connection/2.0-draft.1`と、`nativeArguments`配列・`nativeRevisionBinding:{sdkInstanceId,inputRevision,applicationRevision}`を要求する。positionalなLoRA weight/consumer connected mappingは`supportsConnected:false`で閉じている。
- 管理`createInvocationQueue({resourceBindings})`はowner/binding/resourceGeneration/groupとcancel/afterTerminal/release callbackを明示し、`enqueue/cancelInvocation/disconnectResource/rebindResource/drain/dispose/inspect`を返す。親prepareの子readは同じ親所有groupのserial laneを使い、自分が保持するglobal枠を再取得しない。
- LoRA実factoryは`async createLoraV2({folder,sourceFactory,kernel:providedKernel}={})`。返却は`inspect/plan/prepare/stage/cancel/release/recover/dispose`等。v2の`apply/detach`は存在せず、推測dispatchしない。`plan(input)`、`prepare(plan,{baseProvider,sink,blockRows,signal})`、`stage(prepared,target,{signal,isCurrent})`を実本文で確認した。
- 当方438のfactoryは`createDiffusionModels({sessionId}={})`、`request/cancel/dispose`と`attachDiffusionPort`。wire版0.1のまま、build/Worker世代/操作scopeを維持する。`MAX_TENSOR_ELEMENTS=1048576`、mean64/旧128は個別profileとABIである。
- 管理の再現入口は`node --test --test-isolation=none tools/ai-connection/test-*.mjs`、実browserは`python tools/ai-connection/test-browser.py --native-root ... --diffusion-root ... --diffusion-commit ... --diagnostic-f32 --lora-root ...`。実parserの引数であり、存在しないbuilder/flagを追加しない。
- LoRA再現入口は`node --test --test-isolation=none tools/lora/test-*.mjs`。VAE/current-peer報告と当方source/buildの再現は各ownerの固定正本に従う。上記CLIは今回実行していない。

## source間の接続差とowner

| edge | 固定sourceから確認した差 | 担当・次の判定 |
| --- | --- | --- |
| 管理descriptor→最新Diffusion | 管理`examples/diffusion.json`はmain029/旧33d7build/旧128shapeのstatic exampleを維持する。新adapterや取得receiptが更新されたことを、この例の438採用済みへ読み替えない。L可変nativeをText512限定profile宣言へ無断縮小しない | 管理が実際に選ぶsource/build/profileのdescriptorを明示。Diffusionのnative版/buildを書き換えて合わせない |
| 管理connected tensor→Diffusion | `captureNativeTensor/restoreNativeTensor`はraw tensorを復元し、generic `q.edge`はそれを`nativeQ.input`へ直接置く。Diffusion adapterもそのままwire.inputへ渡す。一方当方のvalidateConditioning/validateRawLatent/normalizeRawMean/restoreRawMeanは`input:{tensor}`を要求する | 管理所有のoperation別packingが必要。正しいnative inputを直指定する経路と、このgeneric connected経路を分ける。今回は静的差分であり新runtime failureの再現ではない |
| 管理cancel→Diffusion | 管理targetのrequestId/localRevision/resourceGenerationと、nativeのsessionId/jobId/inputRevisionは別。native ACKは`cancelled/workerTerminated`、generic adapterのstop証拠はowner callbackの`stopped`等 | owner callbackで厳密対応し、元Promise終端・解放/reuse barrierも観測する。ACKだけで次jobを開始しない |
| LoRA v2→実base provider | v2 registryは元full shapeとidentity transform、partial row指定はdiagnostic別引数。native DM registryはselected shape＋row-slice。各registryHashも別規約・別対象 | LoRA＋Diffusionの版付きbridgeがfull-offset→selected-offsetとnative model/graph/registryの3hashを対応付ける。hash/shapeを同名らしさで付替えない |
| LoRA prepare→sink | v2はcoverage/scope/plan/source等を持つmanifest。DM sinkはnative三hash/side/scopePARTIALと選択weight+bias両方の完備が必要 | 明示manifest/block変換。detailのbias patch無しは不変base biasをpass-throughし、LoRA算術/zero補完と区別する |
| LoRA stage→consumer | v2 validateはcontractVersion/coverage/scope/planId/registryHash/sourceSha256、commitは状態とcopy/lease ownership receiptを検査する。DM validateはnativePARTIAL receipt＋明示activation/independent expected/tolerance、commitはepoch/packageHashを返す | 数値期待値の供給、current/abort/rollback権限、copy/leaseの版付き外側adapterを合意する。v1 FULL/initializer adapterへPARTIAL runtime-inputを渡さない |
| VAE64→Diffusion438 | VAE本人の実mean64/Hike/codec/復元/decode限定結合報告あり。meanとgenerated、directとRPC、G1C codecと旧owner codecは別 | 64の受領証拠として再利用可。今回NNを再実行せず、当方の元438が非正方形`[1,16,1,2,4]`を拒否することも保持する。新rectangle拡張は別担当の新commit/試験で判定 |

## E0の現在地

当方から管理・LoRA・VAEの固定GitHub source取得とAPI照合は成功。管理本人からの902/f522/83受領、VAE本人からの438受領と限定64結合は、相手がcommitした証拠で確認できる。全相手のexact438受領・双方契約合意・実LoRA共同数値試験は完了にしない。

この追補はread-only source比較である。manager/LoRA/VAEのprivate実装、native wire、元意味、kernel、payload、Pages/mainは変更していない。残るE1 bridge・原本共同試験とE6新profile・E7 attentionは、それぞれのownerと新scopeの証拠で進める。
