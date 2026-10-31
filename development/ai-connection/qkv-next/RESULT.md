# Diffusion QKV登録・実block hidden・全head境界の結果

日付: 2026-11-01 JST。ブランチ `codex/diffusion-derived-hidden-heads`。固定commitと取得先は [handoff.json](handoff.json) に置く。基点は `621796a2cb5266a4c8ea7abc2f676322836360c5`。実装・部分演算の受入と、全モデル推論・生成の成立を分ける。`load/predict/sample=NOT_READY` を維持する。

作業前にPage本文の「Kushyameln Works Profile総合管理台帳」`1.0-draft.1` と「規範導入と生成工程の実行計画 Draft」`1.0-draft.1` を再取得した。参照catalogは `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`、計画は `0fb553fd081d3bcbbad4ead7accd165679f77d34`。Page本文、文書版、固定Gitデータを別の識別として保持し、報告要約からcoreを復元していない。

## 1. 共通catalogへ渡す登録資料

[QKV登録要求と説明](../../../../docs/shared/diffusion-models/profiles/registration-QKV.md) は、既存N16/head0診断を固定runtime `8cdfd3f5f7db0cd66762e78f09c209fb5b27366b` のsource/build/kernel・入場条件・gate・独立reference・数値receiptへ束縛する。旧管理 `ADOPT-MANAGER-285967` と原本18 Profile / 10数値規則 / 12管理規範は保持する。

別entry `CANDIDATE-DIFFUSION-QKV-N16-8CDFD3F` を追加したpreviewは21/14/13、提案文書版 `1.0-draft.2`、`runtimeIntegrated:false`。proposal SHA256は `5f9afe091548befcf4f555b1fcf6f015c23fbeed0a4d3ab8e09ebb07ac2b535f`。固定catalog正本への取込み・管理runtime採用・Page改版は未実施。[登録検証](registration/RESULT.md) は原版validatorと変更境界16 testsに合格した。

後続N2は [別Profile提案](expansion/profile-proposal.json) とする。N16の明示fixtureを本番hiddenへ読み替えず、N16のsource・数値receipt・管理候補を差し替えない。新N2提案も正式catalog登録・管理採用とは区別する。

## 2. 実block/timestep由来hiddenと座標・precision

[source契約](hidden-core/SOURCE-CONTRACT.md) は固定ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`、実HIGH/LOW header、model class・patch・time embedding・非affine norm1・modulationの元sourceへ対応する。実装入口は [block-hidden](../../../../docs/shared/diffusion-models/ort-bridge/block-hidden/README.md)。

VAE `855f435120f08eb9e818e51281fc26f0e2633829` の実Rect raw mean `[1,16,1,2,4]` を使う。payload SHA256は `289977e71b65ca42ac9f3fa2b614882bc0eba7420e70620927a25740db6f53a3`。専用Rect Hike正規化→明示noise128/noiseScale1→元schedulerのmix→実F16 patch/time/block0 modulation→全5120 LayerNorm→post-modulation hiddenを実行した。

| 境界 | 固定条件 |
| --- | --- |
| HIGH | global schedule index1、timestep `961.7158813476562` |
| LOW | global schedule index3、timestep `833.3333129882812`。独立試験でありHIGH出力の受渡しではない |
| 空間 | 元BLC `[1,2,5120]`、実装LC `[2,5120]`、暗黙batch1、grid `[1,1,2]` |
| 座標 | row0 `(0,0,0)`、row1 `(0,0,1)`、sourceIds `[0,0]`、contextなし |
| patch | 元kernel/stride `(1,2,2)`。自然な2tokenで、16tokenへのpadding・反復なし |
| time | scalar timestep、shift/scale用の先頭2chunk。残る4chunk/full blockは未受入 |
| storage / compute | prefix F16、QKV FP8 E4M3FN＋明示scalar scale、bias/norm F16。HikeでF32へ復号し、明示F32診断演算 |
| 新kernel | `ec95f1ca2bb76c332d1ff1072d48347e8a79d48f15618fa59b191dabe9117f7c` |

time sinusoidはF32 exponent/frequency/phase、pow/cos/sin primitiveをF64からF32へ戻す。RoPEのF64 frequency規則と混用しない。SiLUはORT F32 Sigmoid→Mul、LayerNormはHike二段階F32、sqrt primitiveはF64→F32。元Torch fused/addcmul/ckadALN・GPU/FP8 production compute一致は未受入。

観測前 [prefix gate計画](hidden-core/candidate-plan.json) SHA256は `2d71ba3e541ad8646a9805585b2641ad1fb2888db37c5a8c1a7a185f7a0c5291`。全14stageと全selected parameterのraw/F32 hashを独立NumPy参照へ照合し、HIGH/LOWともfailCount0。hidden最大絶対誤差はHIGH `3.844499588012695e-6`、LOW `2.6226043701171875e-6`。referenceの全file hash・事前計画hash・gate完全一致を先に確認し、結果を見てgateを変更していない。[HIGH receipt](hidden-runtime/high-comparison.json)、[LOW receipt](hidden-runtime/low-comparison.json) に全値比較のhash・最大誤差を保存する。

actual artifactは私的領域に保持し、公開Gitには数値配列・重み断片を含めない。trusted receiptはactual artifact全bytes・hidden・座標・producer source・model/side/block/timestepを束縛する。これは検査可能な整合証拠であり、任意callerの出所を認証する機能ではない。実VAE出力も元81frame workflow入力とは異なるため、`originalWorkflowInputsVerified:false`、`productionHiddenVerified:false` を維持する。

## 3. 全query/head接続の成立scope

[attention-heads API](../../../../docs/shared/diffusion-models/ort-bridge/attention-heads/API.md) はactual artifactから全幅Q/K/V `[2,5120]` を生成し、Q/K全5120 RMSNorm→全40head RoPE→全2query/2key attentionへ接続する。既存Hikeのrows対応ABIを新しい厳密N2 hostで使用し、仮query/keyを作らない。出力 `attention:Float32Array(10240)` は `[2,5120]`、O projectionの手前である。

独立local参照は実runtime-produced hiddenの同一bitsを入力とする。composed参照は独立prefix参照hiddenを入力とし、両者の役割とhashを分ける。参照file hash・plan/gates・mode・独立prefix入力hashを入口で固定する。[HIGH](expansion/high-browser.json) / [LOW](expansion/low-browser.json) は各8case、11比較項目でfail0。

| 比較 | HIGH最大絶対誤差 | LOW最大絶対誤差 | 事前gate |
| --- | ---: | ---: | --- |
| downstream attention/local | `5.137920379638672e-5` | `2.09808349609375e-5` | abs1e-3＋rel1e-4 |
| prefixからのcomposed attention | `5.841255187988281e-5` | `2.2172927856445312e-5` | abs1e-2＋rel1e-3 |

real Hike→ORT→Hike、全headの行配置、workspace再利用、入力保持、取消後の再利用、getter再入、誤artifact/side/timestep/座標/旧N16、範囲外read、解放失敗handle保持とrecoverを確認した。数値規則と詳細結果は [expansion](expansion/) に置く。

## 4. 同時保持・重みstaging・copyの段階評価

prefixをdisposeした後で後段を生成する直列barrierを今回の条件とする。prefixとdownstreamを重ねた全production資源の受入ではない。

| 実測した限定単位 | 数値/重み・copy条件 | native resources |
| --- | --- | --- |
| prefix N2 / side | selected parameter read160,634,880B、header181,280B別計上。最大raw weight163,840B、decoded327,680B、返却stage arrays289,280B | 4 Hike Memories計5,046,272B、ORT2session、ORT Memory未測定 |
| QKV＋全head N2 / side | QKV weight read78,643,200B＋初期bias/norm51,200B別計上。最大raw tile81,920B、decoded327,680B。caller/snapshot hidden81,920B、QKV122,880B、QK norm81,920B等を別記 | 4 Hike Memories計4,915,200B、ORT2session、ORT Memory未測定 |

prefixのHike arena clear交通量1,733,059,200B、linear input snapshot交通量341,319,680Bは累積copyでありlive RAMではない。最終測定のprefixはLOW14.461秒/HIGH14.760秒。downstreamを含む各実測時間はside別receiptに保存し、環境依存の限定観測として扱う。本番時間予測ではない。動的Linearのruntime-input weightと、bias/norm/modulationのhike-parameter bindingを分ける。initializerとして誤表示しない。

[phase-plans.json](expansion/phase-plans.json) は元N32760と例示context N65520について、KV構築・query/head・KV解放barrier・重みstaging/copy・直列2session/旧新重複4sessionを分ける。`H=N*5120*4`。全KV2H＋元hiddenHは下表で、named stagingが加算される。旧新別hidden/KVは6H、元hiddenの不変共有が成立する場合のみ5Hという別案を示し、同時成立とは扱わない。

| N | H | 3H named array | allocation-only peak PSS |
| ---: | ---: | ---: | ---: |
| 32760 | 670,924,800B | 2,012,774,400B | 2,391,382,016B |
| 65520 | 1,341,849,600B | 4,025,548,800B | 4,397,018,112B |

[容量試験](expansion/host-allocation.json) は16GiB cgroupで非zero fill・保持・走査を行い、1つの実ORT attention sessionと1 Hike Memoryを保持した。各browserclose後のowned PSS0、OOM0を確認した。prefix/Gemm/SiLU、重みstaging、全graph・数値attentionの同時実行は含めない。N65520は1つの二source例であり最大対応token数ではない。

Q16/K64をそのまま全N32760/40headへ広げると、**1blockあたり41,943,040 ORT score呼出し**、最低KV source交通量約2.75TB、token-major QKV FP8読出し161,061,273,600Bとなる。1head KVだけ保持する案は全5120 normのため再計算が必要で、全KV保持案の低交通量と両取りできない。これらは計算式を固定した評価であり実行時間の測定ではない。

採用は自然N2の限定接続だけ。本番全queryへの素朴拡張は保留。full-size numerical/timing、ORT allocator、GC/File/host、producerとの同時保持は未測定。FFN inner13824は現dynamicLinear inner上限5120の外で、row4案も未実装。全量常駐案・素朴block案は再実装していない。pointwise1,048,576と固定mean profile、stream chunkと実graph分割を混同せず、host上限の変更も行っていない。

## 5. 変更・検証・再現・引渡し

主な変更は新 `ort-bridge/block-hidden/`・`attention-heads/`、独立参照/比較/browser/容量probe、登録packageとpreview、API文書、build source closureである。旧N16 QKV、旧selected-query attention、Rect/F1/F5 kernel、共通catalog正本は不変。新buildは89 source、derived transitive runtime import28、kernel receipt29箇所を検証する。旧generic tensor kernelは過去compilerによる固定bytesを再利用し、今回rebuildしたと表示しない。

追加確認は登録16 tests、prefix native4 tests、reference改変拒否、head native3 tests、reference anchor負例4件、両sideの実browser境界・数値比較、容量2段階。新buildでnative Worker/MessagePort既存22caseもPASSし、modelInference=falseとNOT_READYを確認した。hash/source閉包の検査は数値再受入とは分ける。独立reviewでprovenance anchor・取消・解放・binding・API戻り値を確認した。

再現手順は [prefix参照](hidden-core/REPRODUCE.md)、[prefix実行](../../../../docs/shared/diffusion-models/ort-bridge/block-hidden/README.md)、[head/容量](expansion/REPRODUCE.md)、[登録](registration/RESULT.md) を参照。公開のsource/JSON/WASM整合確認だけなら巨大modelは不要。実演算再現には受領済み原本modelの同一header/selected rangesとprivate referenceが必要で、model全hashは既存受領receiptを再利用し今回再計算していない。

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/build-qkv-registration.py
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/test-qkv-registration.py
PYTHONDONTWRITEBYTECODE=1 python tools/diffusion-models/check-build.py
node docs/shared/diffusion-models/api/test/browser-check.cjs
```

管理へは登録案・厳密shape/receipt・所有権/取消/解放・phase予算、VAEへは実Rect専用変換と生成sample未受入の区別、LoRAへは不変base bounded read・owned F32・runtime-input/hike-parameter bindingを渡す。LoRA低rank積をDiffusion側へ重複実装していない。全体queue/工程管理は管理、内部数値計算/資源は本担当。

未受入は、正式catalog登録/管理採用、元workflow媒体/noise/ordered context、HIGH→LOW実受渡し、元production精度、O projection/残差/cross-attention/FFN/全block・全timestep、生成sample→VAE decode、全工程のMemory/staging/copy/time予算である。限定診断・容量確認からload/predict/sampleのNOT_READYを解除しない。pushとDraft PRのみを引渡しとし、merge・Pages deploy・重い全model推論を行っていない。
