# VAE profile差分とP5入力待ち

既存3診断profileとP2受入を元scopeで保持する。今回の資料は[PLAN](PLAN.md) Task3の入力待ちと対向receiptの更新であり、profile棚卸し・export・decode・NN・native importは行っていない。詳細な条件は[PROFILE-READINESS.json](PROFILE-READINESS.json)、原文13files（初回7＋L512追加6）の完全SHA/path/bytes/SHA256/Gitblob/固定URLは[PEER-RECEIPTS.json](PEER-RECEIPTS.json)に記録した。

## 更新できた受領状態

| 対象 | 確認済み | 残る範囲 |
| --- | --- | --- |
| 管理P2 | 管理5aa5のRETURN-ADMISSIONはupdated884を `ACCEPT_DIAGNOSTIC_PROFILE_SCOPED` と受入。f76の98files/6,592,142B、93index/20source/10package、正常と対象取消後のfresh recoveryを照合 | 現live owner・全生成READYの受入ではない。P2 receiptはbroader plain conditioning payloadを明示的に除外 |
| Diffusion実L512 | [本人返信](https://github.com/Kushyameln01/kushyameln-works/pull/15#issuecomment-6560066069)と実取得receipt/captureで、f76の27files/17,083,779B、WKT `[1,512,4096]`、全mask/model/Tokenizer/native metadataと独立copyを確認 | 初回capture receiptでは投影/cross/FFN・JSON変換0。後続994ebbは専用入力/referenceを固定してbase実行中と報告。P4数値・資源受入は未確認。初回3 verification flagsはfalse |

取得記録配布は管理 `5aa5a806f84a875c542b2922fe80ef6faafc7915`、Diffusion `27776abb234fc12733c600b1dabd2fdab70e27ae`。Diffusion ACKの初回配布は `f3d49827bcfe2bf7e36c1701a13e230b2e7e8972`、capture実行checkoutは既存 `7ee36228030ba3bb544a90b1d4b528702a7bae32`。元Text実行5537、管理実行884/observer e150、native855/mean5f/codec2bdを新資料の配布SHAへ付け替えない。こちらのsource取得、相手のdata受領、capture、数値消費は別状態である。

## 実L512専用consumerは実行中、数値受入待ち

[Diffusion本人の追加返信](https://github.com/Kushyameln01/kushyameln-works/pull/15#issuecomment-6560578159)と固定 `994ebb9ce01c9e95db9cd18eb877a981152693c5` の追加6filesを実取得した。旧L4診断から分離した[専用native入口](https://github.com/Kushyameln01/kushyameln-works/blob/994ebb9ce01c9e95db9cd18eb877a981152693c5/docs/shared/diffusion-models/diagnostics/p4-real-text-l512/run.mjs)と[driver](https://github.com/Kushyameln01/kushyameln-works/blob/994ebb9ce01c9e95db9cd18eb877a981152693c5/tools/diffusion-models/p4-real-text-l512-browser.py)、input-freeze、PLAN、HIGH/LOW composed reference receiptのbytes/SHA256/Gitblobが一致した。現在の状態は **CONSUMER_RUNTIME_IN_PROGRESS**。ownerはbase実行開始を報告しているが、完了したnative全値比較・共同数値/資源受入のreceiptはまだ取得していない。

入力は元f76/5537のwhole `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9`、payload `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`、mask `19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62` に固定。native JSONは8,604,657B / SHA256 `9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8`。元header・metadata/model/Tokenizer/全512行/maskとF32 bits保持は取得したfreeze/owner receiptの記録であり、当方はprivate JSONを再取得・変換していない。Text最終RMSNormの再適用、mask softmax適用・行削除はない。

独立composed referenceのowner報告実行sourceは `741f1abe675eda328c7e65bb4e5903885be9ac22`。取得した両receiptは `COMPOSED_BEFORE_RUNTIME` で、各25cut・15,927,296値（63,709,184B）。HIGH manifest SHAは `8dd640f0cbf127c149903eec558ea2a5b804a5bc0a4533dab67ae54da86ec97d`、LOWは `530746b1e2d59d0c9cbe82e1ddad6d743ae32eb8fd7029f56cca694b57672be7`。owner報告のpre-runtime freeze SHA `3982b57a4cc2cebedc83d1d90cdaf31e5f6f414a46e5f711a23717337fea935c` と入力/参照cohortをdriverがChromium前に検査する。独立参照の事前固定はnative比較合格ではない。P4 gateはlocal abs.001/rel.0001、composed abs.01/rel.001のまま、native後local25と全composed再計算hash・全値比較、WASM/copy/lease/RSS/PSS/cgroup/timeの実receiptを待つ。

別のTextメモリ実行 `eab4fabfadd133cc97434eed28ea998dca6795c2` は[SUMMARY](SUMMARY.json)と[新handoff](runs/incremental/conditioning-handoff.json)へ分離する。新whole `ed9bb076172a9529e99594987a966646e70e48dd363a2584206d5ccc740552d3` / payload `6bb54eb36f06802f6ffa0b59edc2d515f24b5d40993a08a587348d9ee6537386` を、994ebbが固定したf76 P4入力へ勝手に置換しない。新Text数値/メモリ結果もP4合格へ加算しない。取得済み最新コメントに実media/slot/処理後exact F/H/WやP5実raw sample/復元receiptの追加はない。

## exact media入力に依存するprofileはBLOCKED

[既存P6 requirements](../p2-p3-acceptance/p6/requirements.json)の不明値を維持する。source video、reference video、reference image/editor slotについて、取得可能な原本・全bytes/SHA、decoded/orientation後F/H/W、slot供給元と順序、元frame/time、前処理node/source版・parameters、処理後exact F/H/Wとpayload hashは、今回取得した最新対向資料にも提示されていない。未知が他の場所にも存在しないと断定したものではない。

| 依存先 | 現状態 | 再開に必要な情報 |
| --- | --- | --- |
| source context encode | `BLOCKED_PRECISE_MEDIA_RECEIPT` | 実file、decoded/処理後F/H/W、原本→選択frame/time→contextの対応、元前処理 |
| reference video encode | `BLOCKED_PRECISE_MEDIA_RECEIPT` | 実接続の有無と原本・独自の前処理後shape。source gridを代入しない |
| reference image/editor slot encode | `BLOCKED_PRECISE_MEDIA_RECEIPT` | wired/editor選択、各slotの実file・mode/順序、orientation後H/Wと元長辺処理後H/W |
| P5最終generated decode | `BLOCKED_P5_ACTUAL_PRODUCER_RESTORE_AND_EXACT_PROFILE` | 実sample、producer、Diffusion復元receipt、exact decoder profile |

既存 `wan21-raw-f32-5x16x16`、`wan21-raw-f32-1x16x16`、`wan21-raw-f32-1x16x32` は[既存棚卸し](../connection/PROFILES.md)・[F1受入](../vae-v1/RESULT.md)・[Rect受入](../e6/RESULT.md)を参照する。元workflow gridのRGB `[1,3,81,480,832]` / latent `[1,16,21,60,104]` は設定由来の候補で、実媒体の観測shapeでも受入済みprofileでもない。filenameや長辺上限848からexact shapeを作らない。profileに合わせたresize/padding/反復/末尾切断・frame削減、manifestだけのshape変更は行わない。

## 実P5 sampleを受け取る入力契約

P5契約の根拠は[a42固定API](https://github.com/Kushyameln01/kushyameln-works/blob/a42ad61a7f56667ceefb4f21a9aacde859e00538/docs/shared/inference/API.md#diffusionから受け取る生成sample)、[native validator](../../../docs/shared/inference/vae.mjs)、[G1C metadata](../../../docs/shared/inference/tensor.mjs)、[capabilities](../../../docs/shared/inference/vae-api.mjs)。P5契約根拠はa42固定原文から取得し、hashをPEER-RECEIPTSへ記録した。VAE/tensor/capabilitiesの実コードは現checkoutでも同一bytes。現API文書はTEXT-MEMORY-1へ更新しており、旧原文の文書hashを現行API.mdのhashとして扱わない。

| native項目 | 要求 |
| --- | --- |
| data/shape | 有限 `Float32Array`、`float32 / NCTHW`、設定済みmanifestのexact `latentShape` と要素数に一致。未知の実shapeはnullのまま |
| meaning | `wan21-raw-generated-sample:v1`。posterior meanへの改名はしない |
| top-level normalization | **fieldを持たない**。`normalized` / `restored` / `notnormalized` の文字列を新たに設定しない |
| latentContract | `schemaVersion:1, representation:'generated-sample', space:'raw'` |
| decoder binding | `vaeModelSha256` は実decoder VAE `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b` と一致 |
| producer binding | `producerModelSha256s` は実生成modelの非空・重複なし64桁小文字SHA列。decoder VAE hashを含めない。任意のtensor.modelSha256があればその列の一員として保持 |
| contract内normalization | `id:'wan21-comfy-f32-v1', state:'restored', owner:'diffusion_models'` |
| context | 任意。供給されたsource identity、元frame列の順序・重複、同数の有限非負時刻列を保持。decode時にlatent Tとの同数は要求しない |

`restored` 宣言は計算済みの証明ではない。元normalized sampleとDiffusion所有の復元operation/source/build/kernel・前後whole/payload hash・独立reference/事前gate/数値receiptを結ぶ。VAEは復元済みrawへconv2/decoderを適用し、二重復元・clamp・推測scaleを加えない。`normalizationApplied:false` はVAEの処理範囲を表す。

実runVae evidenceにはinputMeaning/inputModelSha256/latentContract/assetHashes等があるが、入力payload hashを自動計算する実装はない。hashは外側receipt/traceへ束縛し、存在しないnative出力fieldを根拠にしない。管理はjob/revision・queue/owner・ordered context/slot/frame/time・snapshot/evidence/traceとE4保存読戻しを保持し、strict nativeへ管理fieldを足さない。

現profile定義はraw/posterior=mean/opset17の固定graphで、decode入口が同exact shapeのraw generated sampleも許容する。これを入力sampleのmeanへの改名や任意shape対応と扱わない。capabilitiesは `declaredOnly:true / realGenerationVerified:false`。既存testのgenerated-sampleはzero tensor・仮producer hashの契約fixtureであり、実P5 producer・復元・最終decodeの受入証拠ではない。

## 次の優先順位

1. 固定994ebbの実native local/composed全25cut比較・資源receiptを受け取り、管理dispatch/取消/保存の共同確認へつなぐ。入力は元f76の事前固定cohortを維持し、新Textメモリ成果へ置換しない。Text最終RMSNormは当方、投影/cross/FFNはDiffusionの責任を維持する。
2. 管理からexact media/slot/frame/preprocessing receiptを受け取り、既存profileとexact shapeを照合する。不足shapeだけが新export検討対象となる。
3. 新shapeは元VAE source/model・独立全出力reference・事前gate・予算を固定して別工程へ進める。現時点の依存exportはBLOCKED。旧診断gateを自動転用しない。
4. P5実producerとDiffusion復元receiptが成立してから、対応decoder profile・raw decode・管理保存を接続する。現在のRect mean受入やN2 hiddenは実sampleの代わりにならない。

この入力待ちは固定Hello worldのTask1/2メモリ計測や既存P2証拠再利用を止める条件ではない。対向への依頼はrootがまとめる。この資料の作成による新NN/decode/export/import・外部送信は0、generationReadyはfalseのまま。
