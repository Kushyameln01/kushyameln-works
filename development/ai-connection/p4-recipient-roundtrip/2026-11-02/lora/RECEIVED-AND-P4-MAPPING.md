# LoRA既存receipt受領とP4 mapping差分

配布source `dd95ed05f058930a391f015c11b9a2b963a42db5` はGitHub pluginで完全SHAへ解決した。実行sourceは `28f44c3a1b71bef59e2d018a0db736de6d84675c`。本調査は既存資料の受領・byte/hash確認・静的mapping比較であり、再推論、再export、原本再読込、期待値再生成、mainrepo変更、commit/push、対外コメントは行っていない。

manifest配下9ファイルをすべて取得し、bytes/SHA-256が宣言と一致した。7,720,882-byte matrixとgzip receiptはpluginの容量/transport制約後に固定raw URLで取得した。matrixのGit blob SHA1はpluginが返したcebc25b87c825d672c40a7182846476cdfb23283と一致した。gzipは展開後のbytes/hashだけをstream確認し、展開ファイルは保存していない。

旧受入はlight/HIGH・self_attn.qの先頭16行×全5120列と明示bias16のPARTIAL。強度0/+1/-1、再適用、検証失敗後復帰、取消後復帰の6公開caseであり、491,520 weight、96 bias、96 output。取消候補81,920 weight/16 biasと失敗負例は公開6caseに加算しない。終了時base復帰、snapshot非current、currentLiveAdmission=false、generationReady=false、completeAdapter=false。元full-base hashは過去owner receiptであり、この調査で再検査していない。

正式DATA owner82bと管理60d16のruntime取引、55 source/26 artifactsの既存独立readbackは保持された過去証拠として受領した。本調査ではその55sourceのうち8件を再取得し保持済みhashへ一致確認した。26件のprivate actual artifact、原LoRA、全base、bounded-base原payload、独立reference配列は取得していない。新P4でのLoRA適用・共同数値試験に読み替えない。

## 主要な受領ファイル

| 固定commit / path | bytes | SHA-256 |
| --- | ---: | --- |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `development/ai-connection/lora-p2-p3-consumer/CONSUMER-CONTRACT-RECEIPT.json` | 6,088 | `6f2a0a27d5272f4af2fa30c6b7c4446feed4901e75845ec48ca3897a35b7a655` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `development/ai-connection/lora-p2-p3-consumer/CONSUMER-DEPENDENCIES.md` | 3,757 | `c5fb6739a30f414b11ba9a2c37b0040b46c392740fc244d928c5d383d2e6c931` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `development/ai-connection/lora-p2-p3-consumer/RESULT.json` | 26,714 | `5616b3c0866c8e7bab6bf098f4cbfdc5ae2288f07dda9871596f0a9f08127361` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `development/ai-connection/lora-p2-p3-consumer/TARGET-CONSUMER-MATRIX.json` | 7,720,882 | `aca99eacef49cd827d0db1740fb3311eaa7795c300cd92f4419ed08ea13ea7ee` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `development/ai-connection/lora-p2-p3-consumer/evidence/MANIFEST.json` | 2,333 | `d60f99bfa3f91b0240d0885843172e1cbd9fc75bee20c8f5ac29559ab63eb04f` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `development/ai-connection/lora-p2-p3-consumer/evidence/independent-readback.json` | 128,460 | `9d5347bd08387393f508e9985409657f49b19107ef36e89ff4068b25dfdc7ffc` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `development/ai-connection/lora-p2-p3-consumer/evidence/receipt.json` | 110,148 | `6e21f7bf9719675cac9fefc237b9eb56fd78533c14493fd0294ae3c55102d7ae` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `development/ai-connection/lora-p2-p3-consumer/evidence/run-result.json.gz` | 1,211,308 | `29dca21132f34616f48d88f4b81d884378b508b8dac81a9987049371932e1754` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `docs/shared/inference/lora/CONNECTION_V2.md` | 25,097 | `ade87d607cae5472581016b20f73f806075a5ee0e41267a04a602388d3d23ba0` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `docs/shared/inference/lora/P2_P3_ACCEPTANCE.md` | 3,583 | `f65685c5e9fa12f65e0522c3f199009912d0eaed02885d19f0275f86f205035f` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `docs/shared/inference/lora/README.md` | 9,499 | `32749ab1138a078c6ad3f5963d90989b5eb8d37db3e728874ddec4401c812d9c` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `tools/ai-connection/lora-data-real-browser.mjs` | 30,782 | `8d950bc009c635a679074536c4d7e35a2dc688a1a5da3d9b0974e0dbed26e9b9` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `tools/ai-connection/lora-data-real-inputs.mjs` | 7,918 | `555333b028c7e832d243962567a63c66ee88416b1e14f392d00e126fece47eaa` |
| `dd95ed05f058930a391f015c11b9a2b963a42db5` / `tools/ai-connection/test-lora-data-real.mjs` | 19,578 | `2cbe3833d980ebd4941f43a821f7cfc2600cd99a11c4d0bdbfc3df0e18eea8f9` |
| `28f44c3a1b71bef59e2d018a0db736de6d84675c` / `tools/ai-connection/lora-data-real-browser.mjs` | 30,782 | `8d950bc009c635a679074536c4d7e35a2dc688a1a5da3d9b0974e0dbed26e9b9` |
| `28f44c3a1b71bef59e2d018a0db736de6d84675c` / `tools/ai-connection/lora-data-real-inputs.mjs` | 7,918 | `555333b028c7e832d243962567a63c66ee88416b1e14f392d00e126fece47eaa` |
| `28f44c3a1b71bef59e2d018a0db736de6d84675c` / `tools/ai-connection/test-lora-data-real.mjs` | 19,578 | `2cbe3833d980ebd4941f43a821f7cfc2600cd99a11c4d0bdbfc3df0e18eea8f9` |
| `fc2789a0f649e33f15eb13750e6a983b5c52d170` / `development/lora/contracts/original-inventory.json` | 495,806 | `97229d6ea17738dc983fa898a38e771a784aeafff9513734c5af0ba0250c23b3` |
| `fc2789a0f649e33f15eb13750e6a983b5c52d170` / `docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs` | 20,746 | `bcea7b495e819d1e1052543f36cbdad0ed8515e74bd8914cf66dc03b093c6e4f` |
| `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` / `docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md` | 19,391 | `434194ed4e278cdf32ff94dbc5e35ef21cde44c1a69b4428e92e73c8b2497d75` |
| `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` / `docs/shared/diffusion-models/lora/diagnostic-consumer.mjs` | 16,475 | `fdac31542f87d68b9e01a1ba674ee9b60433cae685d6670222f8d914dd27f943` |
| `60d16b64d6020d3d20239f087f8add91268dcaad` / `docs/shared/ai-connection/API.md` | 58,123 | `3b4751190ef485da53d838af75143f7c1f3568c945fefdbd973ae61bbd479619` |

gzip展開後:37,764,410 bytes / `50a58d8f8c94bed2883fc294554acd744039ce0aa36e39ed6046135e5984f032`。

## P4 targetへの論理mapping

原本keyにはSDK側で`diffusion_model.`を付ける。以下は新P4契約と既存metadataの対応候補であり、実base適合・実LoRA適用の受入ではない。weight binding.nameは各original key、operatorBinding.graphInputは実ORT入力`weight`。biasは各original keyをHike AddBiasのbiasへ対応させる。

| stem | weight full shape / storage | bias shape / storage | logical LoRA | block |
| --- | --- | --- | --- | --- |
| `blocks.0.cross_attn.q` | `[5120, 5120]` / F8_E4M3 | `[5120]` / F16 | light:rank128 alpha128 + bias diff、detail:rank64 alphaなし・bias pass-through | 全列、最大16行 |
| `blocks.0.cross_attn.k` | `[5120, 5120]` / F8_E4M3 | `[5120]` / F16 | light:rank128 alpha128 + bias diff、detail:rank64 alphaなし・bias pass-through | 全列、最大16行 |
| `blocks.0.cross_attn.v` | `[5120, 5120]` / F8_E4M3 | `[5120]` / F16 | light:rank128 alpha128 + bias diff、detail:rank64 alphaなし・bias pass-through | 全列、最大16行 |
| `blocks.0.cross_attn.o` | `[5120, 5120]` / F16 | `[5120]` / F16 | light:rank128 alpha128 + bias diff、detail:rank64 alphaなし・bias pass-through | 全列、最大16行 |
| `blocks.0.ffn.0` | `[13824, 5120]` / F8_E4M3 | `[13824]` / F16 | light:rank128 alpha128 + bias diff、detail:rank64 alphaなし・bias pass-through | 全列、最大16行 |
| `blocks.0.ffn.2` | `[5120, 13824]` / F8_E4M3 | `[5120]` / F16 | light:rank128 alpha128 + bias diff、detail:rank64 alphaなし・bias pass-through | 全列、最大4行 |

全4pair/sideとも上記6weightのBF16低rank pairをmetadataで確認。lightの明示bias patchはadditive-diff-b、detailはbias patchなし。detailのalpha欠落時scale1は固定ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4規約に限る。全matrix2,904patchの旧Q16接続は6patchのみ、未接続2,898patch。新P4該当36論理patchは旧matrixでも実binding/actualFullShapeがnullである。新P4の12entry registryがそれだけでこの36patchを受入したことにはならない。

## 必要な追加mappingと受入

| 境界 | 確認した差 | 必要な追加 |
| --- | --- | --- |
| registry/profile | consumer.describe() is bernini-diagnostic-registry/0.1, exactly q.weight/q.bias, Q16 profile; row-slice transform → feed.registry() is bernini-p4-f32-feed-registry/0.1; 12 original-key targets by default; P4 profile; full-original-element sparse coordinates; identity includes executionProfileId | LoRA owner must add a separately versioned canonical P4 mapping without weakening or repinning the accepted Q16 adapter. |
| base/provider/loader | self_attn.q full [5120,5120] maps to selected [16,5120] and bias16 → baseProvider.readBlock(originalKey,offset,count,{modelHash,graphHash,registryHash,side,executionProfileId,scope,fullShape,signal}) yields immutable owned F32 from per-entry original FP8/F16 | Map complete row ranges in original coordinates; retain all columns, max81920 elements and FFN-down max4 rows; compute low-rank/alpha/strength/bias with fixed loader semantics in LoRA owner. Do not rescale final F32 or invent detail bias patches. |
| sink/package | fixed runtime-feed-set requires dense selected q.weight and q.bias; native writeBlock uses selected shape/relative offset → begin declares explicit sparse patches; writeBlock requires original fullShape, actual binding, dtype F32 and SHA256; finish returns opaque sparse-final-f32-feed package | Translate SDK plan blocks to exact declared P4 ranges, original-key IDs, bindings and hashes; preserve immutable-base pass-through and exact coverage; never map to graph initializer. |
| candidate/output validation | x F32[5120], expected F32[16], Q16 diagnostic-validation receipt and local projection gates → residual F32[10240], timeAct1 F32[5120], registered captured conditioning; independent blockOutput F32[10240], expected hash, referenceId, frozen p4-cross-ffn-composed-f32-v1 gate abs0.01+rel0.001; actual createPostSelfAttention run | Add exact new reference/profile/input/weight/graph/package bindings and receipt schema checks. Existing fixed-base/direct-F32 references and Q16 expected16 do not establish LoRA-altered P4 outputs; no new reference generation or trial was performed here. |
| commit/rollback/base restoration | Q16 native epoch, independent-copy ownership receipt, old snapshot/manager bridge → validate then epoch-bound commit; rollback restores only its own current committed epoch; prepareBase supported; current/signal checks before switching | Bind actual P4 candidate/receipt/epoch into management phases and queue, preserving separate manager revision, SDK-local revisions and feed epoch; test future apply/reapply/failure/cancel/recovery/base restoration independently. |
| ownership/resources | Q16 prepareLoad copies dense feed; existing adapter returns a copyBoundary statement for that consumer; lease model unaccepted → sink owns copied final F32; package/candidate/active/history/read-lease retain shared internal block buffers; run pins immutable captureSource() before first await; package and candidate release differ | Represent actual P4 ownership without claiming Q16 prepareLoad independent array copying. Preserve read-lease release/dispose and selected-patch budgets:16MiB/package,64MiB aggregate,max4 packages/candidates/transactions,max16 read leases. P4 internal run leases do not prove an external SDK lease model or total-model RAM budget. |
| scope/catalog | historical light/HIGH formal Q16 acceptance; matrix all2904 patches retains old scopes and N2 dependency waiting → default12 targets PARTIAL/completeAdapter=false; optional text embedding disabled; direct-F32 fixture is not real-LoRA joint acceptance | Record new target mapping and future joint evidence separately; retain old source pins and unaccepted scopes. No automatic all-target/model/session/generation or common catalog adoption. |

現canonical adapterは配布dd95でもfc2789と同じGit blob `b1a37034122764800703ef1f3e3a264ebd190861`。schema、Q16 profile、target2件、self_attn.q、16行slice、binding名weight/bias、expected16を厳密に固定しており、新P4へそのまま適用できない。旧pinを保持した別のP4 owner対応と実LoRA共同受入が必要である。

## 未取得・未受入

指定されたmanifest/receipt/旧consumer契約とmatrix全文、配布dd95のP2_P3_ACCEPTANCE/CONNECTION_V2/READMEとrunner3件、実行28fのrunner3件は取得済み。dd95と28fのrunner3件は各Git blobもbyte exact一致。historical source55件の全再取得は行っていない。保持されたRESULTでは管理・Diffusion担当個人の新receipt ACKはNOT_RECEIVED。新P4 canonical adapter、実LoRA低rank積を含む共同試験、LoRAで変化したP4 activationの独立reference受入、新tail・全model/session・生成受入は未成立。

比較したP4のローカルsourceは指定HEAD `7ee36228030ba3bb544a90b1d4b528702a7bae32`。このsubtask単独ではremote配布bytesや公開状態を再検証していない。全受領ファイル・P4比較sourceのpath/bytes/hash、scope、mapping詳細は同名JSONへ保存した。
