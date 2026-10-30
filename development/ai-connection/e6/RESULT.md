# E6 — F=1の64要素posterior-mean境界

2026-10-31 JST。対象はDiffusion所有のHike normalize/restore、厳密shape境界、所有コピーと保存の小規模検証。管理用型やVAE private実装へ依存を追加しない。

## 対向の取得と採用profile

VAE/Text source `54bfeadbd83f1fea074c503c0e05ec478aba5cfb` をgit fetchし、API.md、tensor.mjs、G1C-MAPPING.md、V1 F=1 RESULT、receipt、reference-reportをgit objectから取得した。完全path/URL/Git blob/SHA-256は `source-inventory.json`、取得原文は `source/`。

対向報告の受入profileは **`wan21-raw-f32-1x16x16`**。RGB `[1,3,1,16,16]` 768値に対し、raw posterior meanはfloat32 NCTHW **`[1,16,1,2,2]` / 64値 / 256 bytes**。producer VAE hashは `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。保存BF16値をFP32へ展開したVAE診断経路で、元GPU/BF16算術との同等性は認定しない。

**実manifest本体・bundle・元mean fixtureは未受領。** gitにあるreceiptはmanifest SHA `fa219b8e7e0b6b0be37c598d3dfedadb29505ad1407fe3f8270d8655dd46828c` / 4,821 Bを記録しているが、本体は同梱していない。記載ローカルpathも当環境にはない。graph/別conv2資材の498,676,842 Bを新たに取得・exportしていない。対向の実VAE受入報告と、今回の独立係数算術/codec検証を分ける。manifestをreceiptから推測復元して「実manifest取得済み」としない。

## 実装した範囲

- `WAN21_RAW_F1_PROFILE` / `requireWanRawLatentF1()` を追加。旧 `requireWanRawLatent()` は128専用のまま。F1 guardはexactshape、raw mean意味、VAE hash、data長/有限値、mask禁止、明示profileId整合、normalized/generated metadata禁止を検査する。
- Hikeに **`NormalizeRawMeanF1` / `RestoreRawMeanF1`** を追加し、count64・channel位置4を固定。旧exportはcount128・位置8を維持する。equal-countの別shape、64→128 padding、時間/空間の偽装を受理しない。
- factoryの既存 `normalizeRawMean/restoreRawMean` は2つの厳密profileだけをallowlistで選択する。16channel係数、f32のsubtract→multiply1→divide、multiply→divide1→add、version付きmean meaningは維持する。
- disjoint input512 B/output512 Bの1024 B arenaを再利用。F1は各256 Bを使い、入力/結果copy、arena消去、metadataとcontext配列の所有コピー、dispose拒否、hash/ABI検査を維持する。generated sampleや大shapeの復元は追加していない。
- `ABI.md` とkernel-owner builder/registry/receiptを更新。ABIは `wan21-raw-mean-f32-v2`、mean意味は従来どおり `wan21-normalized-posterior-mean:v1`。API host/workerのcapability・dispatchとAPI共通build identityはAPI所有者が別に更新/検証する。

数値sourceは固定ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` の `comfy/latent_formats.py:755–777`。scale1の演算を明示し、reciprocal再結合・JS算術fallback・sampler全zero skipを追加しない。

## 検証

先にF1試験を実行し、既存128 shape guardで拒否するREDを `red.log` に保存した。追加の明示profile/marker拒否も `red-f1-marker.log` でREDを確認してから修正した。roundtrip maxAbs gate **2e-6** は試験コードに実行前から固定した。

| 検証scope | 結果 |
| --- | --- |
| Node v24.19.0、F1 10ケース | PASS。全64 normalize/restoreを独立JS staged-f32参照と比較 |
| Chromium154.0.8037.57、実Hike、F1 10ケース | PASS。loopback GET限定、page/console/blocked error0 |
| 旧128 profile、Node/Chromium各10ケース | PASS。従来のnormalized/restored bytes hashを完全維持 |
| 既存interop regression10ケース | PASS。128の元guardとText/mask/model境界・codec/port能力を維持 |
| 独立Python標準struct-f32参照、全64 | Node/Chromeのnormalized/restored payload hashと完全一致 |
| F1 roundtrip | 最大絶対誤差 **1.1920928955078125e-7**、事前gate以下 |
| 旧128 roundtrip | 2.384185791015625e-7、従来gate以下 |
| native64 ABI拒否 | count128、capacity63、非有限inputを拒否。旧128 ABIもcount64を拒否 |
| shape/意味 | 同64値の別T/H/W、wrong model、generated meaning、矛盾marker、profileIdを拒否 |
| 所有権/反復 | caller data/shape/context不変、mixed64/128反復でMemory **1,114,112 B** / arena1024 B一定 |
| 保存metadata | 固定54bfead **実G1C codec source**でcontext/meaning/model＋数値を保存読戻し。F1→normalize→codec→restoreを検証 |

現在main側の旧codecとは分離してG1C sourceをimportした試験である。G1Cを既存runtimeへmergeした、現在mainのcodecがcontextを保持できるようになった、とは報告しない。古いcodecではversion付きmean意味/shape/model/数値だけを往復検証し、失う追加metadataを保存済みと扱わない。

`reference-f1.json` の入力64値は固定の**合成診断mean値**であり、対向VAE encodeの出力ではない。対向receiptの既存F1実WASM成功、今回のkernel成功、G1C codec小試験を合算して実VAE→Diffusion共同実行や全生成成功としない。非正方形・実slot/reference・81frame・generated sampleは未対応/未受入のまま。

## source/buildと再現

| 識別 | SHA-256 |
| --- | --- |
| Hike source | `357b7d72c2f38a9dec028818f9df33383a3c4be751258783c3513f9e2f681fea` |
| WASM | `6b9cb9f0617da373e63275354ac42f7843fb455019ed3988df7364173bc775b4` |
| F1 normalized payload | `73a8342eb86d6dbb1495733cb6bb0135dda93fcd0aeb569f26b87f6015c6e4a4` |
| F1 restored payload | `c8d4592c8a20d0f90940ee64d3103859f66e44a7dbdbb9d28ec4221c951a60ae` |

固定Hike commit `3c51fde6675f317453919bd505d0e2d0f638e7f1`、WABT1.0.39、Go1.22.12を使用した。compiler/source/builder/host/boundary/WASM/WAT/hashとcommandは `docs/shared/diffusion-models/latent-space/build/build-record.json` にある。

```sh
DIFFUSION_TOOLCHAIN=/path/to/pinned-toolchain python docs/shared/diffusion-models/latent-space/build.py
node docs/shared/diffusion-models/latent-space/test-f1.mjs
node docs/shared/diffusion-models/latent-space/test.mjs
node docs/shared/diffusion-models/test/interop-node.mjs
python docs/shared/diffusion-models/latent-space/test-f1-browser.py
python development/ai-connection/e6/reference-f1.py
```

実browserとloopback serverはharnessのfinallyで終了する。全OS PID消失/厳密RSS peakは計測しておらず、Memoryの一定値をOS回収や端末負荷改善と呼ばない。VAE担当のPSS約1.95GB/zombie2件はその別実行の観測として残す。新しい巨大export、重みdownload、モデルNN推論、commit/push/公開は本E6で実施していない。

残るjoint gateは、対向の実manifest/bundleと実mean fixtureを受領し、同profile/metadataと対応付けた実VAE→normalize→restore→VAE decodeを比較すること。取得不足はそのjoint edgeだけを保留し、今回の64専用数値APIとVAE単独F1利用を一括停止しない。
