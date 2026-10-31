# 各担当GitHub反映後のDiffusion再開結果

2026-10-31 UTC。開始点は `codex/diffusion-e0-e7` の `438972f30242e0a3bc66edb8591f38eaa0fcd384`。管理・LoRA・VAEの固定sourceを取得し、開始点との差と実APIを照合してからE0/E1接続支援、E6、E7を継続した。共通仕様は **総合接続仕様書1.1-draft.1** と **接続検証と本番実装の実行計画0.2-draft.2**。Page閲覧toolで本文全198/134blockを取得しており、URL確認や旧報告からの復元ではない。取得記録は `spec-acquisition.json`。

## 今回の成果と残る境界

| 範囲 | 成立したこと | 保留・未成立 |
| --- | --- | --- |
| E0 | 各担当GitHub sourceを固定commit取得。管理本人の902/f522/83受領、VAE本人の438受領記録を確認 | 新しい本commitの各担当本人受領・契約採用は別工程 |
| E1 provider/consumer | 実HIGH/LOWの不変base小blockをHikeでowned F32化し、既存consumer→実ORT/Hikeへ接続 | 実4 LoRA原本は当環境で未受領、実原本共同適用は0件 |
| E1 v2 adapter | 実SDKのregistry/offset/manifest/validation/commit/ownershipへ接続。実base＋合成LoRAでSDK/Hike→ORT/Hikeと復帰を4case確認。失効時cleanupのBUSY失敗を保持しrecoverで再試行 | 実4 LoRA原本との共同試験、全target/全graph/initializer package、同一baseへの2組同時合成、生成ready化 |
| E6 | 旧F5 128値とF1 64値を維持し、非正方形 `[1,16,1,2,4]` 128値を別profile/ABIとして追加。受領実meanを全値検証 | 新たなVAE NN再実行、生成sample decode、本番shape |
| E7 | 新しい1候補だけを検証。1head・16queryから全32,760keyへのstream attentionを実ORT/Hikeで独立参照比較 | 本番QKV生成、norm/RoPE、全query/head、context込み、元FP8精度と工程を組み合わせた資源予算 |
| D1/E8 | 未成立境界を維持 | **load/predict/sample=NOT_READY、E8=BLOCKED** |

全モデル常駐や素朴blockの棄却を再実装せず、既存容量証拠を再利用した。重い全Bernini推論、モデル再export、main merge、Pages deployは行っていない。Euler/simple6steps/shift5/split3、HIGH→LOW、contextのsource→reference_video→slot/frame順は変更していない。

## 取得可能な正本

Repositoryは [Kushyameln01/kushyameln-works](https://github.com/Kushyameln01/kushyameln-works)。現在の作業branchは `codex/diffusion-e0-e7`、[Draft PR #6](https://github.com/Kushyameln01/kushyameln-works/pull/6)。PR baseは `codex/diffusion-models` で、mainへの直接反映ではない。最終完全SHAはPR headと `git rev-parse HEAD` で確認できる。API固定URLは `https://github.com/Kushyameln01/kushyameln-works/blob/<完全SHA>/docs/shared/diffusion-models/API.md`。

| 原本 | 完全commit / 入口 |
| --- | --- |
| 902正本 | `9023329b8d803306abcdd9342f24c01ba0df2676` / [API](https://github.com/Kushyameln01/kushyameln-works/blob/9023329b8d803306abcdd9342f24c01ba0df2676/docs/shared/diffusion-models/API.md)、branch `codex/diffusion-api-adjustment` |
| f522正本 | `f522d9aeff313558c4ef83022a340af9a4c21391` / [DIAGNOSTIC_API](https://github.com/Kushyameln01/kushyameln-works/blob/f522d9aeff313558c4ef83022a340af9a4c21391/docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md)、branch `codex/diffusion-l1-wasm` |
| 今回取得した管理 | `a26879057d169cb2eecff30503d64adba5057c52` / `codex/ai-connection-e0-e4` |
| 今回接続したLoRA SDK | `2bba90785292e42a0c7c8756685b0d8b128b2dcf` / `codex/lora-connection-v2` |
| 今回取得したVAE/実mean | `7e091192232fae36367b550ca5fada88915a0703` / `codex/e6-vae-rect` |

各完全path、Git blobとbytes/SHA-256、本人受領の範囲は `peer-acquisition.json` / [E0_PEERS.md](E0_PEERS.md)。原core出典とsource_id/concat軸/RoPE/padding/HIGH→LOW/次期APIの実装差は [CORE-CONTRACT-MAPPING.md](../CORE-CONTRACT-MAPPING.md) を維持する。取得できていない新しいcoreやmodel精度を要約から補っていない。

## L1/E1へ渡す公開契約と私的データ

公開入口は [DIAGNOSTIC_API.md](../../../docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md)、[V2_ADAPTER.md](../../../docs/shared/diffusion-models/lora/V2_ADAPTER.md)、`diagnostic-registry-examples.json`。原key `blocks.0.self_attn.q.weight`、元fullshape `[5120,5120]`、選択shape `[16,5120]`、bias元 `[5120]` /選択 `[16]` を分ける。weight bindingは **runtime-input**、biasは **hike-parameter**。initializerへ偽装しない。元storageはE4M3FN＋per-tensor scalar F32 scale、bias F16、診断computeはF32。元FP8 scaled_mmとの同等性は未認定で、勝手な再量子化は行わない。

`createBerniniBlockProvider({artifact,side,hikeBytes,signal})` は原headerからregistry/offset/scale/profileを再構成し、指定範囲を所有F32で返す。省略したtensor/rowは読めず、全15.57GBの仮想Fileとして扱わない。公開native registry hashとLoRA full-shape registry hashは別のidentityで、v2 adapterがfull offset→selected offsetとmanifestを明示対応する。detailにbias patchがない場合は、実不変base biasをpass-throughする。

sinkの完全coverage/hash検査、candidateの独立参照検証、現epochの切替/復帰とreleaseはDiffusion所有。低rank積/diff/bias合成は実LoRA SDK/Hike所有。失効窓の解放がBUSYになった場合は候補を保持し `RECOVERY_REQUIRED` として再利用を拒否し、`recover()` でcleanupを再試行する。adapterはcallerのstage/baseをdisposeしない。Worker取消と同一realmのbounded cooperative取消、Port detachを区別する。

固定SDK/Hikeの20契約試験、合成base＋合成LoRAの実ORT/Hike4case、実HIGH/LOW不変base＋合成LoRAの実SDK/Hike→ORT/Hike4caseを分離して記録した。最後の4caseは全81,920 weight/16bias/16outputと不変base復帰を独立Python復号＋一列/one-hot閉形式参照で比較する。実rank128/rank64原本の代用ではなく、`realOriginalJoint:false` を維持する。node/browserの結果は `../e1/adapter-verification.json`、`browser-contract.json`、`browser-real-base-synthetic-lora.json`。原本private dataをHTTP endpointや公開結果へ埋め込んでいない。

私的artifactはHIGH/LOW各5range（header、Q16行、bias16、scale、quant config）、709,364 bytes、SHA-256 **`25a845e0c87a1bcab04740b011d0aa7cd969f46745412810cfd73269b69e8cff`**。元原本read889,164 B、最大read181,280 B。31GBの再hashはせず、prior owner full-hash receiptを継承した。現在のfull-file認証成功へ読み替えない。

公開Gitにはschema、source、recipe、hash、metadata-only receiptを入れ、raw Q/base64やprivate file referenceを入れない。owner側の私的取得と別receiverのhash/range照合は成功したが、**共有Pageへのraw artifactリンク追記は自動承認審査で拒否**された。特定の私的重み断片をそのPageへ共有する明示承認不足が理由で、追記を保留した。LoRA担当本人へのpayload引渡しは未完了。コード・公開契約のpushはこの保留と分ける。

## E6 — shape別の実mean境界

`wan21-raw-f32-1x16x32` / `[1,16,1,2,4]` を専用guardと `NormalizeRawMeanRect/RestoreRawMeanRect` にrouteする。旧F5 `[1,16,2,2,2]` も128値だが互換shapeではない。F1 64値はchannel=i/4、両128profileは専用routeのi/8。ABI `wan21-raw-mean-f32-v3`、Memory1,114,112 B / arena1024 B。WASM SHA **`bd42d4a608fb964b2b1894cf961b5a17002cfc2dabad1721e000236cc335be1d`**。

Git受領した実F1/Rect meanをHike→明示G1C codec→Hikeで比較し、独立Python全値hashも一致。往復maxAbsはF1 `1.1920928955078125e-7`、Rect `2.384185791015625e-7`、事前gate `2e-6`以内。VAE本人の固定7e091が記録した実64限定decode1回は相手の証拠として再利用し、当方が498MB graphを受領/再推論したとはしない。[RECT-RESULT.md](../e6/RECT-RESULT.md) にshape・manifest hash・相手scope・試験をまとめた。

posterior meanの正規化/復元と、生成sampleの意味・VAE decode契約は別。pointwise上限 **1,048,576** は変更せず、3つの小mean profileを本番latent `[1,16,21,60,104]` の2,096,640値へ一般化しない。

## 本番容量とE7の判定

既存 [FEASIBILITY.md](../FEASIBILITY.md) / `feasibility.json` を再利用する。HIGH/LOW各保存payload **15,574,651,928 B**、仮F32全parameter **57,153,966,336 B/model**。target-only N32,760のhidden F32 1本670,924,800 B、QKV3本2,012,774,400 B、FFN拡張1本1,811,496,960 B。1head dense scoreだけで4,292,870,400 B、40headは171,714,816,000 B。全weight単一Memoryと素朴blockは棄却を維持する。

旧LOW/N=1 full-Q行tileの限定成功は [e7/RESULT.md](../e7/RESULT.md) を再利用。新attentionは [e7-attention/RESULT.md](../e7-attention/RESULT.md) に独立参照・全値比較・最大live/copy・時間・owned Chromium PSSを記録する。選択Q16×D128、K32760、tile64・最終56を実shapeで処理し、窓attentionやpaddingへの置換はない。ORT score/exp＋Hike online softmax/value更新を使い、JS数値fallbackはない。

| 新attention限定試験 | 結果 |
| --- | --- |
| Chromium8case / K32760全2048出力 | PASS、maxAbs `4.503817763179541e-9`、事前gate abs1e-5＋rel1e-4 |
| named numeric live＋Hike Memory | 164,288＋1,114,112＝1,278,400 B。ORT/producer/metadata/GC等を除く論理量 |
| host snapshot / Hike input / output copy traffic | 35,716,736 / 18,902,528 / 8,192 B。合計54,627,456 Bは同時live量ではない |
| 1run | 1117.1 ms。実model QKV生成・weight stagingを含まない |
| observed owned Chromium PSS peak | 383,030,272 B、fresh sample。constructor/全case/harness込み、ORT allocator単独や本番peakではない |

source callback/getterの再入で共有accumulatorが混ざる問題は独立レビューでRED再現し、入口のBUSY取得を外部callback前へ移して修正した。再入拒否・取消後reset・workspace再使用を含むfresh8caseを再実行し、receiptの全source hashを現sourceへ照合した。汎用producerとORTのresident量はnull/未測定として保持する。

採用は明示F32 postnorm/RoPE入力の1head/選択query境界だけ。本番QKV・source_id/RoPEの接続・全token/context/40head・FFN・layout/staging・FP8 precision・旧新sessionを同時保持した全体予算は未成立である。単独試験のPSSを足した値やファイル分割を、工程全体のピーク解決としない。**E8へ進めず、load/predict/sampleはNOT_READYのまま**。

## 再現・管理への引継ぎ

配布WASM、Hike source/生成WAT/runtime、owner build record、ORT固定vendorをsourceと一緒に提供する。compilerがなくても保存WASMを使う検証は可能。再buildは既存固定Hike/Go/WABT版を使う。私的baseや4実LoRA原本を取得する操作は通常のsource試験に自動で含めない。

```sh
python docs/shared/diffusion-models/api/build-info.py
python tools/diffusion-models/check-build.py
node docs/shared/diffusion-models/latent-space/test-rect.mjs
node docs/shared/diffusion-models/latent-space/test-f1.mjs
node docs/shared/diffusion-models/latent-space/test.mjs
node --test --test-isolation=none docs/shared/diffusion-models/lora/test-consumer.mjs
node --test --test-isolation=none tools/diffusion-models/test-export-e1-base-block.mjs
python tools/diffusion-models/e6-api-browser.py --output /tmp/e6-api.json
python tools/diffusion-models/e7-attention-browser.py --help
python tools/ai-connection/test-lora-diffusion-browser.py --help
```

固定peer SDK取得と環境変数、私的artifactの明示CLIはV2_ADAPTER/DIAGNOSTIC_API、attention参照生成とbrowserは各RESULTに実parser通りに示す。親の最終再検証は `verification.json`、全source閉包/build identityと各kernel digestは `../build-verification.json`。試験の件数は各scopeごとに保持し、4原本共同の件数へ合算しない。

管理へはnative版 **diffusion-models/0.1** と最終BUILD_ID、3つのmean profile、NOT_READY、独立ES adapterのscopeを渡す。共通snapshot版をnativeへ書き換えず、Textのfloat32 BLC `[1,L,4096]`、attentionMask、modelSha256を保持する。connected tensorは **`input:{tensor}`** へ包装する。全体queue/工程/snapshot採用は管理、数値部と所有資源はDiffusion。取消ACK・元Promise終端・解放のbarrierを別に確認する。

残る合意は、管理の最新descriptor/build採用とoperation別packing、LoRA本人の新source/私的base受領と4原本の独立参照付き実試験、VAEの新Rect profile採用とgenerated契約、D1の本番精度/全境界・組合せ予算である。
