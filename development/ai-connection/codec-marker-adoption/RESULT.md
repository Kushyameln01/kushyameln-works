# 規範付き入口の追補とcodec marker受領

基点は `0260fc0b153c2491cc94aca3d75c7835a03bf0f7`。今回の実装checkpoint、配布fileのhash、実行結果は `RESULT.json` に固定する。共通schema `works-module-contract/1.0-draft.1`、package `works-artifact-package/1.0-draft.1`、参照catalog `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad` / `1.0-draft.1` は維持した。

実装checkpointは `0239c8117622bb388af0d7870b672e54a79beec3`。Node全354/354 PASS、fail0、skip0。追加のowner宣言probeは負例12/12・正例2/2、実SDK/Hike/ORTの規範必須入口も1/1 PASS（合成source/base、23固定runtime object、81,920 weight＋16 bias＋16 output）。新codecの保存読戻しはNN0で成功し、実Rect dispatchは未受入。

## 必須profile bindingの省略穴

個別のbaseDtype/outputDtype/layout比較は前回実装済みだったが、LOAD-COMFY-LINEAR-DIFF bindingと3宣言を同時に削除すると、N-LOADERの名前を残したまま必要比較そのものを省略できた。旧実装でnative describeBinding/planへ進む負例を確認した。

known native-entry policyが必要なrecord・side・representationも固定し、同じevaluateEdgeに渡すよう修正した。

| 規範付き入口 | 必須binding |
| --- | --- |
| LoRA Q16 | producer LOAD-COMFY-LINEAR-DIFF、producer LOAD-LOCAL-SAFETENSORS、consumer EXEC-BERNINI-Q16-F32 |
| Rect decode | producer SHAPE-VAE-WAN21-F1-16X32、representation rgb-decoder-raw |

欠落はUNVERIFIED、既知のside/representation衝突はINCOMPATIBLE。重複recordも曖昧として拒否する。理由とfield path、固定参照版、requiredProfileBindingsをEdgeDecision/traceへ残す。既存LoRAの非shape bindingでrepresentation未指定を許容する範囲は明示し、異種の指定は拒否する。汎用／legacy evaluateEdgeとstandalone snapshotへLoRA条件を一律適用していない。

宣言・実validate後の数値receipt・実公開後の取引receiptの順、未来receipt拒否、commit/decode直前のlive binding/RAM再照合、公開後失敗のrecoveryを維持した。数値演算・独立判定器・native API変更はない。rect-meanはpure helper policyであり、今回の実native入口として受け入れたものではない。

## 新VAE/codec receiptと実行pin

旧計画Pageのcodec owner投稿から、Draft PR#13 `codex/codec-normalized-marker` の固定原本を取得した。正確なPage/thread/messageとGit sourceは `SOURCE-RECEIPT.json`、受領scopeは `OWNER-HANDOFF.json`。

| 対象 | 固定版／完全commit |
| --- | --- |
| 配布証拠 | `d8a19f684f75fdf2f772d64754cba9d08b8f5c82` |
| codec実装 | `2bdca59ea78580d4fe7a9d31a8de33209b64d029`、8256 bytes、SHA-256 `d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5` |
| 元codec | `2c171a09ccda65c54899f322ae490f1bfcaac6fb`、SHA-256 `4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b` |
| ownerの管理/E4/configure証拠 | 管理edda、native configure2bd、Worker/run/fetch/NN0 |
| 既存Rect実NNとraw経路 | 元証拠351、VAE855、Diffusion5f。今回も実NNのpin／scopeは変更しない |

新codecは有効な供給normalization markerのsnapshot/header保存のみの変更で、数値配列やモデルを変換しない。WKTSR001/schemaVersion1とAPI exportは維持。markerなし旧bytesは維持され、旧writerでの新marker再保存には欠落制限がある。旧pinを同名で差し替えず、package registryへ新source/hashを明示した独立の保存候補として受領した。

## 当管理環境での保存読戻し

ownerの固定 `test-manager-e4.mjs` を変更せず、当管理checkoutの実E2/E4 moduleへ向けて実行した。helperの5module依存はeddaと当管理でbyte同一であり、helper内部のedda表記は実装sourceの出所として保持した。別receiver receiptが実行checkoutとGit bytesの対応を記録する。元のreceiptやtraceのcommitを書き換えていない。

既存Diffusion5fの記録済みnormalized128値をコピーし、owned capture → 新codec encode → E4実write → 実filesystem read → E4 decodeで全128値、marker、shape/layout/meaning、model/context、descriptor/evidence/traceが一致した。8 files、snapshotはnull、store残留0。

- 新codec明示registry：package complete、marker保持。payload SHAは `4c6802f01df4ecd426cfc5910ee33d450858214c3d4bd4823499c2ddd313bfe5`。
- 旧registryだけ：NATIVE_CODEC_UNVERIFIED。
- 旧writerでmarkerを落としたnative bytes：NATIVE_METADATA_MISMATCH、書込み0。

これはmarker保存境界の受取側確認である。正規化・復元の再計算、VAE encode/decode、モデルsession、Worker、取消を実行していない。公開packageと実行結果のhash、helper/source照合は `RESULT.json`。旧codecで拒否された過去結果は元scopeのまま保持する。

## Rect実dispatchの残件

新INPUTSからRect/Textの選択manifest、Mapキー、bytes/hash、gate原本を受領した。Rectは従来と同じdecoder側3点だけでdecodeでき、encoderを追加取得条件にしない。ownerの4asset stream hashと同host File/Map configure成功は、それぞれの元scopeで受領した。

当管理環境へdecoder-body.onnx・conv2-weight.f32・conv2-bias.f32本体は届いていない。新管理の規範必須入口から実decode・実取消復帰・owner解放・その実RGBの保存を行った返却receiptも未受領。**項目4は未受入のまま**である。既送付の `../norm-receipt-adoption/RECT-OWNER-HANDOFF.md` を再利用し、ownerが原本を保持する環境から固定新管理のreceiptを返すか、既存3原本を受け取った場合に再開する。同じasset質問、既存encode、再exportは繰り返さない。

LoRAの40f実PARTIAL6件と旧20件、VAE e86/351、追加DATA82bのmetadata受領は元scopeで保持する。DATA82b正式bridge、本番production hidden・全query/head/stage・組合せ資源予算、generated sample/81frame/全sessionは今回の受入に追加しない。PARTIAL/STAGED/保存完備から生成受付を解除しない。

再現は `REPRODUCE.md`。同作業branchとDraft PR#7で共有し、main merge/Pages deployは行わない。
