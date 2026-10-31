# P1導入後のP2再開 — Diffusion版と数値証拠の再利用

2026-10-31 JST。GitHub PR #6の現head、固定API/host/build/profile sourceと実WASM bytesを読み取り比較した。**Diffusionは前回P2と同じ `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` のままで、数値・shape・host・buildの変更はない。** 数値差分を理由にP2モデル/NN/単体kernel検査を再実行する必要はない。

管理P1の候補はroot指定 `edda43f9ea69c5b3ab1af3c6eb82295f2912887c`。この文書はDiffusion差分の確認であり、その新管理実装の受入は別担当の照合・実行結果へ結び付ける。

## 現在の固定版

| 項目 | 実確認値 |
| --- | --- |
| PR | [#6](https://github.com/Kushyameln01/kushyameln-works/pull/6)、open Draft、未merge |
| head branch / 完全commit | `codex/diffusion-e0-e7` / `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` |
| base | `codex/diffusion-models` |
| PR updated_at | `2026-10-31T01:19:50Z` |
| API | [API.md](https://github.com/Kushyameln01/kushyameln-works/blob/5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3/docs/shared/diffusion-models/API.md)、`diffusion-models/0.1` |
| BUILD_ID | `diffusion-models/0.1+35b5ecdf924b13ccfcd08ec1eeaf840700dfc7c69acd168bbb39e72376542a20` |
| ABI | `wan21-raw-mean-f32-v3` |
| mean WASM | 8,210 B、SHA-256 `bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d` |
| Hike source | SHA-256 `bd51d724b5a4fbad545670674701f316343a17e63916a57daf144bd763cfd81e` |

## 比較証拠

GitHub connectorで次の8 text fileを現headから再取得し、各bytesのGit blob/SHA-256を検査した。API/receipt/interop/latent host/registry/Hikeは前回の固定5f取得receiptと一致。public API index/workerは前回固定BUILD_SOURCESに記録されたdigestと一致する。WASMもbase64で実bytesを再取得し、前回保存bytesと完全一致した。

| source path（`docs/shared/` 以下） | SHA-256 |
| --- | --- |
| `diffusion-models/API.md` | `d0fb2029bb7ca21fd45a70ada27996f69928d14c81d271bdaa9c7ccabf909100` |
| `diffusion-models/api/build-info.mjs` | `e988e290d61e7c88cd8e78082caf15035ef54ada3d95b0ef19fbb7aef0951970` |
| `diffusion-models/api/index.mjs` | `73d75a4474156f55cc6fe8c37004691a93172eeff4512c3c7cf78d0e89b537a8` |
| `diffusion-models/api/worker.mjs` | `5fbc06083392c8038d6919b0e556fefbba61866927d7e2f813f92a00e64bced5` |
| `diffusion-models/tensor-interop.mjs` | `13c3595f0786a45a62d0a8739b6acd58d3025c80f7eaff4baf7314559665c1c1` |
| `diffusion-models/latent-space/latent-space.mjs` | `3d28445a5c36eeb4f31b7bfe89163e43091438f571488a665888833e1d860104` |
| `diffusion-models/latent-space/kernel-registry.mjs` | `191f85b0bedc8ad439a486b077f0891c7846a7535b0d71d26350b8581f8d11b8` |
| `diffusion-models/latent-space/latent-space.hike` | `bd51d724b5a4fbad545670674701f316343a17e63916a57daf144bd763cfd81e` |

機械記録は同directoryの `diffusion-comparison-0.json`、`diffusion-comparison-1.json`、`diffusion-kernel-comparison.json`。WASMのmodule instance生成/compile/数値callは今回行っていない。旧52source/14kernel receipt全体を今回独立再検査したとの主張もしていない。

## 維持されるRect契約

- native profileは `wan21-raw-f32-1x16x32`、latent float32 NCTHW `[1,16,1,2,4]`、128値。RGBは `[1,3,1,16,32]`。F5 `[1,16,2,2,2]` と同countでも別profileで、reshapeしない。
- owner factoryの `normalizeRawMean` / `restoreRawMean` がstrictshapeから専用 `NormalizeRawMeanRect` / `RestoreRawMeanRect`へrouteする。context配列は所有コピー、順序/重複/時刻を保持。
- rawは `raw-posterior-mean`、normalizedは `wan21-normalized-posterior-mean:v1`。規約ID `wan21-comfy-f32-v1` とABI v3は別識別。復元はDiffusion所有で、VAE/管理に重複実装しない。
- VAE bindingは `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。owner旧codec/wrapperのmetadata制約は残るため、P2は明示G1C codecと外側package/evidenceを維持する。
- native RPC包装は `input:{tensor: connectedTensor}`。独立ES hostを使った既存証拠を、public API instance/Worker全体の実行証拠へ昇格しない。
- 既存F5/F1正方形も宣言されたまま。generated sample、load/predict/sampleはNOT_READY。P1規範の採用を本番生成の採用にしない。

## VAE35151d1のP2 traceも固定取得した

`35151d1f447d6bba30931a8c28636b2d5d9c3820` の [RESULT](https://github.com/Kushyameln01/kushyameln-works/blob/35151d1f447d6bba30931a8c28636b2d5d9c3820/development/inference/reference-adoption/RESULT.md)、`p2/CANDIDATE-ENTRY.json`、`p2/source-pins.json`、`p2/acceptance-plan.json`、`p2/run/trace.json`、`p2/run/browser/acceptance-results.json`をGitHubから実取得した。ローカルHEADは変更せず、別の固定sourceとして読んだ。

trace SHA-256は **`18f0a5181a24eb52b64172098e77246c8d2d41db6026e5563fe23be3127650c0`** でcandidate記録と一致。source-pinsは同じDiffusion5f、同じinterop/host/registry/WASM digestを指定している。前回traceの数値根拠に現在のowner差分はない。

維持すべき元scope：管理285967・Diffusion5f・VAE855f435・codec2c171の候補診断。実encode証拠再利用、実owner Rect Hike、実VAE raw decode一回、管理package読戻しまで。P1 evaluatorを実行した判定ではなく、旧candidateのadoptionReadiness=BLOCKEDは当時の管理P1未導入による状態である。

取得したbrowser receiptはpassed=true。全1,536 RGB、maxAbs `4.328787326812744e-6`、RMSE `6.104514800995174e-7`、事前`atol=rtol=maxAbs=2e-5`以内。raw RGB payload SHAは `aacf932664139862197c2dab5c087ce76305b2622bf02b3f5bde44eb73392d85`。これは既存実行証拠であり、今回再decodeした値ではない。meanの既存`2e-6` gateとRGBモデルの`2e-5` gateを混用しない。

`vae-trace-source-comparison-0.json` / `-1.json` はこの6ファイルのbytes/SHA/blob/固定URLを保持する。新管理eddaのnorm照合・admission判定はfreshな別receiptで付加し、旧数値traceのmanager identityや完了当時のBLOCKEDを事後に書き換えない。

## 再開判断

**Diffusion/VAE数値経路は元scopeで再利用できる。** 新たに必要なのは管理P1の規範runtime/対象bindingsと既存数値証拠を結ぶ差分確認であり、owner数値規則・新profile・model inputの変更ではない。

今回の新モデル取得0、NN推論0、export0、kernel単体再実行0。source/readback identity比較以外の数値検査を行っていない。他branchとproduct codeを編集していない。
