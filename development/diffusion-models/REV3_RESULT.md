# 計画書の明示確認と追加実装 — revision 3

更新: 2026-10-31 JST。ユーザー指示に従い、全体を推測で完成認定せず、全体モデルの推論実行も行っていない。確認範囲は添付計画v1.1の工程2〜5、tensor境界、状態・資源管理とし、確認できた契約に沿って部分実装を追加した。

## 最初に指定された3つの確認

| 確認内容 | Text Encoder | VAE | こちらの証拠 |
| --- | --- | --- | --- |
| 個別モジュールか | createTextEncoderModuleを独立定義 | createVaeModuleを独立定義 | 固定公開source d2e9e3c、実factory/capabilities呼出し |
| 外部接続経路があるか | 同一ページES module・明示MessagePort | 同一ページES module・明示MessagePort | 実モジュールのJS/MessagePort制御と拒否をNode/Chromiumで確認。公開API等4資材のHTTP200・固定Git blobバイト一致 |
| Hikeを利用すべき部分で利用しているか | 最終RMSNormのreduction/正規化/weight乗算 | rgb-unit入力の値域変換、decodeの実conv2 MatMul+bias | sourceとWASM hash・実呼出し箇所を照合。公開Hikeの小入力divide/RMSNorm/affine/MatMul/反復buffer試験も本担当が実行 |

API仕様は `docs/shared/inference/API.md`、相手の実行記録は `development/inference/RESULT.md` と `PUBLICATION.md`。後者の実24層Text/VAE推論は公開元の検証記録として読んだもので、今回こちらが再実行したとは扱わない。今回の自分の動的確認はmodule制御、バイナリ境界とHike小演算に限定した。

相手の現行VAE profileはRGB `[1,3,5,16,16]` ⇄ raw latent `[1,16,2,2,2]` のみ。元workflowの832×480×81へ対応済みと一般化しない。Textの通常テキスト処理もBernini system promptやComfyUI独自promptを自動再現しない。詳細はrev3-source.json。

## 計画書との対応と今回の実装

| 計画書の明示項目 | 実施・追加した内容 | 判定範囲 |
| --- | --- | --- |
| 工程2: Hike→ORT→Hikeの小tensor往復 | 実LOW/HIGH Q射影の16行×全5120入力列。Hike FP8復号+scale→ORT1.24.3 WASM Gemm→Hike bias加算 | 部分演算32出力と境界の確認。全model変換/推論ではない |
| 工程3: scheduler/noise/latent更新 | simple6/shift5/1000-point表とsplit3、CONST mix/inverse、flow velocity→denoised、timestep変換をHike実装 | 固定profileと明示noise tensorの数値部品。RNG生成なし |
| raw meanの空間変換 | Diffusion担当のHike normalizeRawMean/restoreRawMean。全16channelのsource定数とf32式を保持 | 公開VAEのposterior mean profileのみ。生成sampleをmeanへ読み替えない |
| 共通tensor契約、保存・読戻し | 既存.wktensorを再利用。dtype/shape/layout/meaning/producer hash/maskの厳密検査と所有snapshot | 元codecと互換、実ファイル保存・読戻し。別空間へ数値を無断変換しない |
| 工程4: バイナリ入出力と利用経路 | 同一ページJS/明示MessagePort APIにschedule/noise/inverse/flow、tensor検査、linearProjectionを追加 | 実Worker内の部分処理と制御。包括UIの全体生成とは別 |
| 工程5: Hike実使用と正答を分離 | source/WASM/ABI/hash、担当処理の実call、返却tensorがORT入力と最終bias結果に使われることを検査 | Hike欠損時は失敗。JS代行・WebGPU代行なし |
| 状態/資源 | 旧返信拒否、cancelで所有Worker停止、partial取消後の新Worker再実行、dispose、固定workspace | このAPIが所有する資源のみ。全プロセスRAM低減/無期限リーク不存在の認定なし |

Diffusionの外部APIは `docs/shared/diffusion-models/API.md`。protocol `diffusion-models/0.1` は維持し、capabilitiesを追加した。`modelInference=false`、部分射影は `partialOnly=true`。未成立のload/predict/sampleはNOT_READYで、部分演算を全モデル推論へ読み替えない。

## 実行結果

- Hike→ORT→Hike: 実Chromium154.0.8037.57、5項目合格。全32出力の独立double参照との差はLOW最大1.787915593354228e-7、HIGH最大4.870171181892147e-7。事前許容値abs1e-4+rel1e-5内。ORT累積順序が異なるため、旧Hike逐次f32とのbit一致は要求していない。
- ORTは同じ固定公開commitの1.24.3 JS/WASM、provider=['wasm']、numThreads=1、proxy=false。220-byte部分ONNX graphはweightを埋め込まずruntime入力を受ける。graph hash `af48828a7e93d75f529cee34c9b609cf4c3748f095a2c6fb3d5f1d71424988b0`。
- Hike bridge単体: Node8項目と1016通りのFP8 code/scale照合。固定arena409728 bytes、WASM Memory1507328 bytes、反復100回で一定。
- scheduler: Node/実Chromium各8項目合格。sigma列は `[1,0.9617158770561218,0.9092148542404175,0.8333333134651184,0.7148972749710083,0.5005995035171509,0]`。0-based表索引 `[999,833,666,499,333,166]`。固定arena49152 bytes、WASM Memory1114112 bytesが100サイクルで一定。
- tensor interop: Node/実Chromium各10項目合格。metadata・mask・payload所有権と実ファイルの保存/読戻し、破損・異種tensor拒否を含む。
- 外部Diffusion API: 実Chromium Worker/MessagePort22項目合格。ORTはpartial操作まで遅延読込み。取消後の再実行、同一build/session/job/revision照合を検査。保存済み15.57GB File2件はheaderのみ再検査し、元hashと一致、loadはNOT_READY。
- 既存Euler: Node13項目合格。既存の公開側tensor/controller/externalAPI/VAE境界検査とHike小演算試験も本担当が再実行し合格。全モデル推論は含まれない。

各試験は独立した確認範囲であり、件数を合算して全体の品質指標にしない。全browser/serverは回収後に終了した。元31GBモデルは変更・削除していない。

- raw mean空間変換: Node/実Chromium各10項目合格、全128値が独立source順f32参照と一致。往復最大誤差2.384185791015625e-7、事前許容2e-6内。固定arena1024 bytes、100反復でMemory一定。normalized meaningは `wan21-normalized-posterior-mean:v1` で、既存.wktensor保存・読戻し後も復元できる。WASM hash `ffd1c821d9ecf2aba10cd7ac96f231c78380a1d02621dae8838ee8d64495b9ea`。

## 独立レビューと修正

非同期保存中にcallerのmodel hash・shape・maskを変更すると、検査時と異なるmetadataが保存される問題を再現した。相手codecを変更せず、こちらのwrapperでdata/shape/mask/model metadataをawait前に所有snapshotへコピーし、decode側のexpected bindingも固定した。失敗→修正→Node/Chromium10項目合格を記録した。

別担当の最終確認で、API22項目と29 source/runtime/manifest hash・aggregate buildId一致を独立に確認し、阻害問題は残っていない。buildIdは `diffusion-models/0.1+ab0c2224128e82229b3261114eac59573b791f56be97599023173d3e5f92b6c9`。

以前からの小項目: ヘッダー検査はJSON重複キーの厳密拒否に未対応。厳密model importはNOT_READYのまま。linear旧単体試験のhash assert強化も以前の記録に残す。今回の部分ORT・API実行結果と元precision一致は別判定。

## 残る境界

- raw posterior meanの正規化・復元は今回追加したDiffusion側のHike明示APIが担当する。包括UIへ数値計算を転嫁しない。HIGH/LOW全sampling状態の接続や生成sampleの復元が完成したとは扱わず、posterior meanと区別する。
- 全modelのONNX変換、全shape、元FP8/GPU precision、LoRA2件と元動画/prompt条件の同等性は今回認定しない。実入力activationではなく固定合成activationの部分演算である。
- 全体モデルの推論・生成・元ComfyUIとの全工程負荷比較は、最新指示どおり実行しない。後続実装の目標・未達として維持する。
- 3モジュール横断の直列化と包括UIは別担当コーディネーターが所有する。各APIの専用executorが自動で共有されるとは保証しない。
- このDiffusion branchはローカル保存。相手の公開TE/VAEを固定版で取り込んだが、こちらの変更をpush/公開していない。

## 証拠と再現

- rev3-source.json: 公開source/4実GET/byte一致と公開元記録の区別。
- rev3-latent-space.json: 全16channelの正規化・復元とcodec往復10項目。
- rev3-interop.json: Node/Chromium10項目、snapshot修正のRED記録。
- `docs/shared/diffusion-models/scheduler/contract.json`: 式・source・ABI・8項目。
- `docs/shared/diffusion-models/ort-bridge/browser-results.json`: ORT部分5項目と全32値。
- `docs/shared/diffusion-models/ort-bridge/kernel/`: Hike source/build/ABI/hash/単体結果。
- `docs/shared/diffusion-models/api/test/browser-results.json`: 外部API22項目・遅延読込み・実File検査。

private fixtureはlinear/work/、実行中間記録はscheduler/work/へ分離してcommitしない。再現手順は各componentのREADMEと親API.md。
