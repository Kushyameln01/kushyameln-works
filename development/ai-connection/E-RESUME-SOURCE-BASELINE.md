# Owner progress and fixed-source receipt after resumption

版: `ai-connection-resume-source/1`。確認日: 2026-10-31 JST。過去のA0/E0台帳は履歴として保持し、本書は今回の各ownerの新headの実取得・差分確認だけを追補する。実行計画は今回再取得したPage本文 **0.2-draft.2**（`page_cfdb3e2026608191964eb24af5c64e61`）、総合仕様は **1.1-draft.1**。旧版の読了報告を今回の本文確認に流用しない。

0.2-draft.2のE0は、source・API・必要生成物・再現手順のGitHub共有、Draft PR、固定commit、受領側の実コード取得を受渡し条件とする。非公開モデル/実base/Q blockの受領、共同数値受入、merge/本番Pages公開は別判定。本文中の古い422記述は履歴であり、現在の取得済みsourceを未取得へ戻さない。

## 今回取得したownerの固定版

repository: `https://github.com/Kushyameln01/kushyameln-works`。network追加許可付きの`git fetch origin refs/pull/{number}/head`で取得し、実際の完全headを照合した。native workingtreeのcheckout/置換、owner branchへのpush/PR変更は本取得作業では行わない。

| owner / Draft PR | 完全commit | 比較元 | 今回の実source確認 |
| --- | --- | --- | --- |
| Diffusion [#6](https://github.com/Kushyameln01/kushyameln-works/pull/6) | `438972f30242e0a3bc66edb8591f38eaa0fcd384` | `83c91e3f08fb57ab84c8e74b721f93e0420b5a2c` | 4文書差分のみ。SDK受領状態を更新。native API/kernel/buildは83と同一 |
| 非正方形VAE [#9](https://github.com/Kushyameln01/kushyameln-works/pull/9) | `7e091192232fae36367b550ca5fada88915a0703` | `54bfeadbd83f1fea074c503c0e05ec478aba5cfb` | 非正方形受入・対向再取得・限定64 decode記録、診断fixture、lifecycle/check_restored_mean等の再現tool。native codec/API/runtime sourceは不変 |
| Text/VAE F1 [#3](https://github.com/Kushyameln01/kushyameln-works/pull/3) | `2c171a09ccda65c54899f322ae490f1bfcaac6fb` | 同54b | 12差分はF1診断fixture/REPRODUCE/API記述。nativeコードは不変 |
| LoRA [#2](https://github.com/Kushyameln01/kushyameln-works/pull/2)、branch`feat/lora-hike` | `dcb1f504263955ef2a4b1613b7a9d802aebd1c18` | `2bba90785292e42a0c7c8756685b0d8b128b2dcf` | 12差分は受領記録・matrix・再現手順・descriptor。SDK/kernel/版付きbridgeコード追加はない |

全sourceは`/workspace/work/ai-connection/resume/native/{438972f,7e09119,2c171a0,dcb1f50}/`に完全git archiveとして保存した。全tracked blobをGit blob SHAへ独立再計算し一致。全treeとscope別SHA-256/bytes receiptは同`resume/`に保存し、本書に対応する [E-RESUME-SOURCE-RECEIPT.json](E-RESUME-SOURCE-RECEIPT.json) へ集約する。異なるcommitの同一ファイルも版別に記録するため、record数はunique file数や試験件数ではない。

## API/buildと既存境界の再確認

### Diffusion438

固定[API](https://github.com/Kushyameln01/kushyameln-works/blob/438972f30242e0a3bc66edb8591f38eaa0fcd384/docs/shared/diffusion-models/API.md) と [DIAGNOSTIC_API](https://github.com/Kushyameln01/kushyameln-works/blob/438972f30242e0a3bc66edb8591f38eaa0fcd384/docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md) の実本文を取得。wireは`diffusion-models/0.1`、buildは`diffusion-models/0.1+f7f23c2291886de637cb06ae001fc748d29232f7c8919683467da5eef6cfb80e`。41sourceのファイルSHA-256とaggregateを読取り専用で独立再計算し全一致。owner builderは実行せず、原本を維持した。

- `createDiffusionModels({sessionId=crypto.randomUUID()}={})`→`{sessionId,request,cancel,dispose}`、`attachDiffusionPort(port,api)`。native requestのprotocol/build/session/job/inputRevision/opを維持する。
- `linearProjectionF32`はcompact finite nonshared F32のweight81920/x5120/bias16を明示入力とする。部分projectionの成功からLoRA適用やmodelInferenceをtrueにしない。
- `createBerniniDiagnosticBase({file,side,rowStart=0,hikeBytes,signal}={})`、`createDiagnosticConsumer({registry,stage,baseProvider}={})`。provider/sinkはselected slice内element offset、元fullShapeとrow-slice mappingは別metadata。native registry hashとSDK registry hashを分離する。
- native mean profileは64 `[1,16,1,2,2]`と旧128 `[1,16,2,2,2]`に限定。native raw meanとsampleを改名せず、64専用Hike ABIを保持する。非正方形 `[1,16,1,2,4]` は128要素でも未対応。
- direct mean kernelのcontextコピーと、古いcodec/wrapperによるcontext/Tokenizer保存は別。G1C codecの明示指定と外側packageを維持する。
- `modelInference:false / partialOnly:true / loraApplied:false`、load/predict/sample NOT_READYを維持。ownerのtiled-Q採用はLOW・単一activation・F32診断境界だけで、attention/全graph/E8を成立済みにしない。

### LoRAdcb

固定[CONNECTION_V2](https://github.com/Kushyameln01/kushyameln-works/blob/dcb1f504263955ef2a4b1613b7a9d802aebd1c18/docs/shared/inference/lora/CONNECTION_V2.md)と実SDKを取得。`lora-connection/2.0-draft.1`、kernel SHA-256 `da6d56fca5d9bc91173681c22b91cd9337f53ea067d84455b9d659ee7ee52984`、ABI`lora-block-f32-v1`は2bba907と同じ。

`createLoraV2({folder,sourceFactory,kernel})`→inspect/plan/prepare/stage/cancel/release/recover/dispose。v2にapply/detach/resetはない。planは同期sourceFactoryとsource.hashを必要とし、prepareはfull tensor内element offsetを使う。stageには独立expected/activation/gateをoptionsへ追加する口がないため、外側adapterが所有snapshotとして保持しnative validationへ供給する。in-use/lease/復帰未完のpreparedを解放しない。nativeのlocal revisionsとmanagerRevisionは別系列。

今回のowner headにDiffusion用bridge実装はない。`JOINT-LORA-RESULT.md`はBLOCKED/NOT_RUN。そこに残る「f522未受領」は記録時の観測として保持し、当管理側で取得済みの現在sourceを未受領としない。現在残る差はfull→selected offset、strict SDK registry、dual registry hash、detail bias不変base pass-through、scope/validation/commit ownership、rollback履歴の寿命と、実原本の受領・共同数値検証である。既存v1 FULL/initializer adapterでPARTIALを通さない。

### Text/VAE2cと非正方形7e

両固定版のnative wireは`works-ai-1`、client build`works-inference-v1`、G1C codec SHA-256は`4c6992a7b6f44722e84a7184ed5c878312a203071054335827f7f0adcd01c07b`で一致。createInferenceAPI/createTextEncoderModule/createVaeModule、encodeTensor/decodeTensor/requireTensor/snapshotTensorMetadataの実export・所有権・strict metadata規則は以前の取得済みsourceと同じ。今回の追加はprofile受入と再現・終了gateのscopeであり、native API変更ではない。

| profile | RGB / raw mean | 取得した証拠と現在の境界 |
| --- | --- | --- |
| F1正方形 `wan21-raw-f32-1x16x16` | `[1,3,1,16,16]` ⇔ `[1,16,1,2,2]` / 64要素 | 2cに元受入fixtureとmanifest/再現手順。7e最新追補はDiffusion438の実64mean→明示G1C保存→復元→VAE raw decode一回を受入と報告 |
| F1非正方形 `wan21-raw-f32-1x16x32` | `[1,3,1,16,32]` ⇔ `[1,16,1,2,4]` / 128要素 | 7eにfresh export/FP32参照/実Hike/ORT/保存/取消/終了の受入記録と診断artifact。Diffusionの同128要素旧profileとは不適合 |
| 実slot/source81frame/generated sample | 実媒体/producer/profileに依存 | 診断fixtureや64mean decodeから受入へ昇格しない |

7eの`CURRENT-PEERS.md`は管理a268のdescriptor26/adapter13/package34/native-owner2のNode再現、Diffusion438の5件の小Hike検査、768 RGB値の限定decode比較（最大誤差1.3709068298339844e-6≤事前2e-5）を記録する。これはownerが記録した限定結合で、今回の当管理側の新実モデル再実行ではない。Diffusion RPC/全管理ブラウザ工程の結合とも分離する。新helperのlive0/zombie0観測と旧F1のzombie2記録も別scopeとして保持する。

## source成功とprivate dataset受領を分離する

今回、receipt/REPRODUCEに明記された**exact pathの存在だけ**を確認した。別owner/別環境にも同じ絶対pathがあると仮定せず、広いprivate file scan・GB原本の再hashは行っていない。

| 公開source/診断artifact | 取得状態 |
| --- | --- |
| 各ownerの実コード/API/生成WASM/再現CLIとreceipt | GitHubから固定commitで取得・blob/bytes/hash照合済み |
| F1/非正方形のPNG、mean/RGB F32、WKT、bundle manifest、復元64 WKT | 新owner sourceに同梱、実bytes取得済み。実model bundleの代わりにはしない |
| 原本台帳・selected shape/scale/binding・独立参照の記録 | sourceとして取得。原本payloadを再受領/hash確認した証拠ではない |

| receipt明記の非公開資材 | 今回のexact path確認 | 必要となるscope |
| --- | --- | --- |
| `/workspace/work/retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors` | 存在しない | 実base provider・E1共同・本番方式の実shape評価 |
| `/workspace/work/retained/bernini/Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors` | 存在しない | 同上 |
| `/workspace/work/lora` | 存在しない | light/detail各HIGH/LOW実4原本の共同計算。detailの取得参照はowner記録でも未提示 |
| `/workspace/work/inference/vae-v1-f1/bundle/` | 存在しない | 実VAE F1 raw decodeの再実行 |
| `/workspace/work/inference/e6-rect/accepted-bundle/` | 存在しない | 非正方形実VAE推論の再実行 |

exact path不在は他の取得経路の不存在を意味しない。必要な原本はprivate受渡し参照・hash・scopeへ別に結び付ける。公開source取得とE2/E3/E4/E5の独立作業を、これらのprivate資材待ちで一括停止しない。source受領不足を理由に同じ既存schemaや74 fixtureを作り直さない。

## 次に維持する判断

1. owner sourceのGitHub相互受領は今回の4headで確認済み。古い取得エラーから現状を判断しない。
2. E1は取得済みnative実装を外側adapterで結び、合成contract試験と実base/実LoRA共同試験を区別する。未受領payloadを合成値へ置き換えて実共同成功としない。
3. E5はsnapshot/復帰/cacheの管理責任で進め、診断PARTIALから全生成を公開しない。E6は取得済み64/非正方形artifactをmetadata/保存/適合判断へ使い、未提供private bundleの推論は未検証とする。
4. main merge/Pages公開は作業branch共有と別。今回の取得工程ではnative source/owner branchを変更していない。
