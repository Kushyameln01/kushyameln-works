# Diffusion P0 P2 P4結果

2026年10月31日 JST。Profile台帳・数値実行/正規化Profile・管理照合規範・数値規則の本文をPage閲覧toolで取得し、参照データ `1.0-draft.1` / `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` と照合した。新実行計画 `1.0-draft.1` の固定sourceは `0fb553fd081d3bcbbad4ead7accd165679f77d34`。取得した全blockの記録は `SPEC-ACQUISITION.json`。

作業の開始sourceは `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`。今回のbranchは `codex/diffusion-profile-p0-p4`、PR baseは既存 `codex/diffusion-e0-e7`。runtime codeは `8cdfd3f5f7db0cd66762e78f09c209fb5b27366b` に固定した。handoffの各receipt/hashと、同じ実bytesを指す候補source/buildは `EVIDENCE-INDEX.json` に記録する。候補の受領・管理採用は、旧採用LoRA0c278/Diffusion438とは別に記録する。

## 成立した担当境界

| 作業 | 実装と検証 | 維持した未受入 |
| --- | --- | --- |
| P0 | 8record/12normをsource/build/kernel、全shape、事前gate/reference、元scopeへ結ぶsidecar。実build-infoと全source閉包のbytes照合を含む12case PASS | catalogの管理runtime導入、管理の新候補採用、未登録P4 profileの正式catalog登録 |
| P2 | VAE855実Rect mean→管理の実capture/package/queue→実Worker/PortのRect専用Hike normalize/restore→保存。5case PASS、全128値厳密比較 | P1/UI全工程・全session、新restored payloadのfresh VAE decode、生成sample |
| P4 | 実HIGH/LOW block0重み＋明示hidden16tokenから、全5120QKV→全5120QK norm→head0 RoPE→選択16key attention。各side6case/全10比較区間PASS | 実production hidden、元compute precision、N32760/context65520以上、全query/head/stage、全体資源予算 |
| P5 | 依存を明示して保留 | `load/predict/sample=NOT_READY`、`productionQKVVerified:false`、P5=BLOCKED |

元の81frame/480×832、latent `[1,16,21,60,104]`、Euler/simple6/shift5/split3とHIGH→LOW、source/reference/slot/frame順は変更していない。診断の16tokenを本番sequenceへ置換した受入ではない。LoRA mappingの現行正本はLoRA owner `createDiffusionDiagnosticAdapter`。旧Diffusion2bba adapterは固定回帰用とし、同じ経路へ重ねない。

## P0 宣言と既存証拠の再利用

公開入口は [profiles/P0.md](../../../docs/shared/diffusion-models/profiles/P0.md) と `p0-bindings.json` / `integrity.mjs`。固定catalog7JSONを無改変で受領し、長さ/SHA-256を照合する。nativeへrecordId/normIdを必須追加せず、未定義nativeProfileIdはnullのまま。契約宣言、数値受入証拠、動的resource状態を分ける。

旧5fの52source閉包とkernel/oracle/receipt計71assetは元commitの実bytesへ結び、再利用receiptのfreshRun=falseを維持する。候補buildは別欄へ追加する。整合検査がPASSでも、新sourceの数値受入や生成READYへ自動昇格しない。F5 gateは原実装 `1317758bbba2b13603752d8c910ae2c6e77f78c5` のF5合成fixture/元receiptへ遡り、F1/Rectから2e-6を転用していない。実VAE F5 NN精度の受入とは別である。

旧kernelと同API、同128値のF5/Rect交換、ID混同、偽のbuild ID、source閉包の不一致、旧receiptの新sourceへの付替え、PARTIALから生成への昇格を拒否する。`integrity.mjs` はownerのbytes整合入口であり、第二の管理互換性判定器や数値oracleではない。P0結果は [p0-RESULT.md](p0-RESULT.md)。

## P2 Rect専用の実mean処理

VAE source `855f435120f08eb9e818e51281fc26f0e2633829` の実meanはfile SHA `6539204ef61dc0f706238b74e2bcabf8bbcce971f5056d0b0d7e288811516b71`、payload SHA `289977e71b65ca42ac9f3fa2b614882bc0eba7420e70620927a25740db6f53a3`。既受領7e091のcontext付きmeanとpayload全bytesが同一であるため、独立struct-f32参照を再利用した。

入口は `requireWanRawLatentRect`、native profile `wan21-raw-f32-1x16x32`、NCTHW `[1,16,1,2,4]`。実Workerから `NormalizeRawMeanRect/RestoreRawMeanRect` へrouteする。F5 guardは拒否試験だけで、正常入口の代用にしない。全128値が独立oracleと厳密一致し、往復maxAbs `2.384185791015625e-7` は事前2e-6以内。

管理source `28596717182e48aeb23c719c51b6e593edf4e496` の実adapter/queue/capture/packageへ、明示native `input:{tensor}` を渡す。normalized meaningをrawへ改名せず、入出力artifact/payload hash、実operation/job/buildを同一traceへ結ぶ。既知contextのframe順と重複、unknown optional metadataのouter extension、codecが保存しないoptional markerのowner evidenceを分離して保持する。取消ACK・元Promise終端・計算停止・解放・再利用を別に確認した。

既存RGBは元raw payloadからの結果であり、新restored payload `71e89e4b…` のfresh decodeとはしない。VAE担当へ渡すrestored artifactと受入条件は [P2結果](p2/RESULT.md) / `p2/green/`。新たなVAE graph/NN export・推論は行っていない。

## P4 実重みから既存attentionまでの次の一候補

[candidate-plan.json](p4/candidate-plan.json) を比較前に固定した。原coreはComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` の原文5fileで、[core-semantics.md](p4/core-semantics.md) が出典・式・差を対応付ける。元storageはQ/K/Vがscaled E4M3FN、bias/norm weightがF16。診断computeはF32、normは全5120軸/eps1e-6、RoPEは44/42/42次元とsource_idの別回転を全64組の2×2行列積で合成する。角度加算やhead128だけのnormへ置き換えない。

新native executionProfileIdは `bernini-block0-qkv5120-norm-rope-selected16-head0-f32-v1`。元production activation・precisionを認定したprofileではなく、固定catalogへ未登録のowner候補である。共有generic RMSNormのfinite-intermediate overflowを防ぐP4限定abs≤1e16の入場条件を `runtime-admission.json` へ追加し、元planhashに結ぶ。数値gateを変更していない。

| 比較区間 | 各sideの全比較数 | 事前gate |
| --- | ---: | --- |
| Q/K/V各projection | 各81,920 | abs1e-4＋rel1e-5 |
| normalized Q/K各 | 各81,920 | abs1e-4＋rel1e-4 |
| RoPE matrices | 4,096 | abs2e-6＋rel2e-6 |
| selected Q/K各 | 各2,048 | abs1e-4＋rel1e-4 |
| selected V | 2,048 | abs1e-4＋rel1e-5 |
| connected attention | 2,048 | abs1e-3＋rel1e-4 |

全区間failed0。attention maxAbsはLOW `3.1441450119018555e-6`、HIGH `2.302229404449463e-6`。元fullweight3本のraw/decoded F32 bytes、bias3本/norm2本も独立decoder SHAと一致した。新RoPE WASMは `46cd2ac1859e809d9bcb722b55822c606185e67b3639392fa00d21b698825997`。generic RMSNorm binary `9dfdcb…` は歴史compiler `f41a50…` の既存生成物を実ロードし、現在compiler `fb458…` で再build済みとはしない。

| 実行中の保持/traffic | 値と範囲 |
| --- | --- |
| full QKV / full normalized QK | 983,040 / 655,360 B |
| caller＋snapshot hidden / 最大raw・decoded tile | 655,360 / 81,920・327,680 B |
| base bias/norm保持 / selected QKV・RoPE matrices | 102,400 / 24,576・16,384 B |
| Hike固定Memory / ORT sessions | 4,915,200 B、4Instance / projection＋attentionの2個 |
| 各side fullrun weight reads | 78,643,200 B。header/初期parameter/取消試験readは別 |
| bridge input/output copy / arena clear writes | 80,609,280 / 315,555,840 / 8,023,695,360 B |
| LOW fullrun / observed owned Chromium PSS peak | 10,878.7 ms / 535,017,472 B |
| HIGH fullrun / observed owned Chromium PSS peak | 10,914.4 ms / 534,784,000 B |

named数値buffer、copy/clear traffic、固定WASM Memory、観測PSSは別量である。constructor、private reference/harness、GC/metadata等を含むPSSをallocator単独や本番pipeline peakと扱わず、未測定ORT/producer resident量はnullとした。readMsはread/decode/incremental hashの合成区間で、純粋File I/Oではない。全体の最大live量・旧新session/全stageの組合せ予算は未成立として残す。

所有権の新境界では、全resourceのcleanupを試し、失敗handleを保持して新runをRECOVERY_REQUIREDで止める。同期throw/Promise reject/第2session constructor失敗からの実ORT回収を3caseで確認した。依存stream-attentionのdisposalだけを修正し、旧算術scopeと新解放失敗scopeを区別する。詳細は [RUNTIME-RESULT.md](p4/RUNTIME-RESULT.md) と `runtime-{LOW,HIGH}.json`。

旧attentionのK32760 fixture/precomputed PASSと、新QKVの実重み＋明示hidden16/K16 PASSを足して本番QKV→全K32760の受入にしない。全query/40head/40block、context込み65520以上、modulation/残差/FFN/output projection、元FP8/GPU精度と全工程予算は依存として残る。

## 再現と渡すもの

```sh
python tools/diffusion-models/check-build.py
python tools/diffusion-models/test-p0-bindings.py
python tools/diffusion-models/p2-rect-browser.py --output /tmp/p2-rect-repro
node --test --test-isolation=none docs/shared/diffusion-models/ort-bridge/qkv/test-boundaries.mjs docs/shared/diffusion-models/ort-bridge/qkv/test-rope.mjs
python tools/diffusion-models/p4-reference.py --models /absolute/private/bernini --side LOW --output /absolute/private/reference-LOW.json --receipt /tmp/reference-LOW-receipt.json
python tools/diffusion-models/p4-browser.py --model /absolute/private/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors --reference /absolute/private/reference-LOW.json --output /tmp/p4-LOW.json
python tools/diffusion-models/p4-lifecycle-browser.py --model /absolute/private/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors --output /tmp/p4-disposal.json
```

HIGHは同じ事前gate/coordsで対応原本を明示する。固定Git source取得、Hike再build、依存と入力は各P0/P2/P4 READMEに記載した。source/WASM/WAT/runtime/build receipt・参照生成recipe・hash/metricsをpushし、raw model/LoRA payloadやprivate numerical-reference arraysを公開Gitへ入れない。重み再download、全原本再hash、全model NN推論、main merge、Pages deploymentは行っていない。

管理へはsidecar、候補source/build、Rect変換trace、native版とcatalog版の分離、P4限定profileと未登録状態を渡す。VAEへは新restored Rect artifactとfresh decode依頼条件、LoRAへはnative provider/consumerを維持したmapping owner境界を渡す。各対向担当本人の新候補受領・管理採用は別記録で確認する。
