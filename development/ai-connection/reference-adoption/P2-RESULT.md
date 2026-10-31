# P2 Rect 管理接続の結果

実Rect meanを管理の保存・読戻し、owned cache、ownerのRect WASM normalize/restore、復元meanの保存・読戻しへ通した。全128値は既存の独立owner参照と一致した。**P2全体の受入はPARTIAL**。同じ復元meanからのfresh VAE decodeは未実行であり、候補版を既採用版へ昇格していない。

機械可読記録は [RECT-RESULT.json](RECT-RESULT.json)。private実行記録は `work/ai-connection/profile-adopt/rect-management-checkpoint/` にあり、原本重み・ONNX・実行packageはGitへ追加していない。

| 正本 | 完全commit・版 |
| --- | --- |
| 今回確認した計画 | `0fb553fd081d3bcbbad4ead7accd165679f77d34` / 1.0-draft.1 / P2本文 |
| 固定catalog | `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` / 1.0-draft.1 |
| Diffusion候補 | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` / `diffusion-models/0.1` |
| VAE・codec候補 | `855f435120f08eb9e818e51281fc26f0e2633829` / `works-ai-1` / `works-inference-v1` |
| 管理source | 実行source `74b4b4b0b6cff5b98e5410f9b604f88f587915c7`。実行した11ファイルのSHA-256・長さをGit objectと事後照合（元private receiptは変更せず保持） |

Diffusion候補buildは `diffusion-models/0.1+35b5ecdf924b13ccfcd08ec1eeaf840700dfc7c69acd168bbb39e72376542a20`、Rect kernel ABIは `wan21-raw-mean-f32-v3`。読み込んだnative source 16ファイルのbytesを固定hashで検査してから実行した。

管理の既採用LoRA `0c27874908638afc748ea2455a2779a16736730b`、Diffusion `438972f30242e0a3bc66edb8591f38eaa0fcd384`、codec `2c171a09ccda65c54899f322ae490f1bfcaac6fb` は維持している。候補の数値診断成功を生成READYへ読み替えていない。

## 実行した区間

1. VAE855の `development/inference/e6/fixtures/api-recovery.wktensor` を取得原本として読んだ。Diffusion5f受領 `rect-mean.wktensor` と全file一致する1084 bytesで、contextを含む実meanである。contextなしの `png-mean.wktensor` はpayloadが同じでも全fileは別なので置換していない。
2. 既存E2 captureとE4 package writer/readerでraw meanを保存し、必須sidecar・payload・native metadataの整合を確認した。明示revision付きowned cacheからcopyを取得した。
3. 明示owner/resource generation/request/revision/tokenを持つ既存queueから実owner WASMの `NormalizeRawMeanRect`、`RestoreRawMeanRect` を呼んだ。管理へmean/std演算を追加していない。
4. 復元raw meanをE4で保存・読戻しした。全128値を既存独立Python参照の配列・payload hashと照合し、owner事前gate `2e-6` で往復差を確認した。
5. 既存ownerのRGB出力 `png-roundtrip.wktensor` も別の受領出力scopeで保存・読戻しした。これは今回の復元meanから新規decodeした出力ではない。nativeのcontextなしも保持した。

| payload | SHA-256 |
| --- | --- |
| 受領raw mean | `289977e71b65ca42ac9f3fa2b614882bc0eba7420e70620927a25740db6f53a3` |
| 今回のnormalized mean | `4c6802f01df4ecd426cfc5910ee33d450858214c3d4bd4823499c2ddd313bfe5` |
| 今回のrestored raw mean | `71e89e4bb70e036b28b30c8bb8dd3138cbc08fe61f51102f6ef47d5781cc7063` |
| 受領owner RGB | `e13806a2db0893872a9efb3a1b2ddc49fc58d1fac811fecb2cfc14c76ac2d799` |

対象profileは `wan21-raw-f32-1x16x32`、latent `[1,16,1,2,4]`、RGB `[1,3,1,16,32]`。同じ128要素でもF5 `[1,16,2,2,2]` は拒否し、F1正方形64要素も代用しない。model hash、context、frame/time配列を保持した。重複・順序を含むmetadata-only追加probeは受領原本を改変せず別試験にした。

## 判断と未受入edge

実restored meanの既存 `evaluateEdge` は `COMPATIBLE`。P1の `N-SHAPE / N-NORMALIZATION / N-NUMERIC / N-ARTIFACT` に接続し、実mean roundtripとE4読戻しは `pass`、fresh同profile decodeは `not-verified`、readinessは `blocked` となった。

同じ実artifactに対し、gate参照だけを明示的に欠落させる入力probeも実施した。契約は `COMPATIBLE` を維持し、実E4 evidenceは `pass` のまま、gate欠落scopeだけ `not-verified / blocked` となった。既知のowner gateを不明と報告するものではない。

| 未受入edge | 観測した理由 |
| --- | --- |
| normalized meanのdisk package | 固定G1C codecはnative `normalization:'wan21-comfy-f32-v1'` をwireへ出さない。E4は `NATIVE_METADATA_MISMATCH`、`descriptor.json/native/metadata/normalization` を返し、書込0ファイルで拒否した。markerを削除せず、owned captureでそのままrestoreへ渡した |
| fresh VAE encode/decode | 既存exportの `encode.onnx`、`decoder-body.onnx`、`conv2-weight.f32`、`conv2-bias.f32` が宣言されたprivate配置に存在しない。計498,676,842 bytes。再export、縮小shape、別重みへの置換は実施していない |
| 同一連結のRGB | 受領RGBの保存・読戻しは成立。今回のrestored meanから新規decodeした証拠はない |

VAEの受入gateは事前固定された `atol=rtol=maxAbs=2e-5`。exporter manifestの元default `.002` と区別して保持した。DiffusionのRect往復gate `2e-6` はVAEや他profileへ転用していない。

## 検証と再現

追加7件は **7/7 PASS、skipなし**。関連する規範・台帳・実codec付きE4 package・queue・cacheの回帰は **113/113 PASS、skipなし**。exact shape、source改変拒否、候補gate/identityの外部変更拒否、実WASMと独立参照、必須保存・読戻し、marker欠落のnegative probe、pre-abort、metadataの順序・重複保持を含む。往復最大絶対差は `2.384185791015625e-7`。queue両操作のterminal/releaseを確認し、終了時はkernel dispose、store 0、cache retained bytes 0、cache release 1回だった。実NN sessionや実行中WASMの強制中断はこのscopeに含めない。

取得済みの固定sourceを明示して実行する。出力先は新しいディレクトリにする。

```sh
WORKS_RECT_DIFFUSION_ROOT=<5f880fd-full-source-root> \
WORKS_RECT_VAE_ROOT=<855f435-full-source-root> \
node tools/ai-connection/test-rect-management.mjs

node tools/ai-connection/rect-management-runner.mjs \
  --diffusion-root <5f880fd-full-source-root> \
  --vae-root <855f435-full-source-root> \
  --output <fresh-private-output-directory> \
  --manager-commit <full-manager-base-commit>
```

次のowner確認は、既存Rect exportの原本4assetの受渡し、normalized markerのcodec契約、同じ復元meanからのfresh decodeと全1536値・終了資源証拠である。generated-sample、81frame、本番predict/sample、全sessionの受入は別工程に残る。
