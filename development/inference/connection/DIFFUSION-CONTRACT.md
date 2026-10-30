# Diffusion・Text Encoder・VAEの接続境界

接続作業 `connection-1` の調査記録。基準commitは `a33b311e45a75a6c683242286fef608c7b3770a9`。この文書の調査ではモデル推論、モデルの再export、公開操作を行っていない。

## 基準commitで確認した既存契約

Text Encoder / VAEのAPI版は `works-ai-1`、Diffusionは `diffusion-models/0.1`。同一ページのES moduleと、明示的に渡したMessagePortという既存経路を維持する。包括モジュールは順序・待機列・所有権・取消と入出力を管理し、latentの数値正規化を代行しない。

| 境界 | 基準a33b311のsourceと既存記録が示す範囲 |
| --- | --- |
| Text → Diffusion | `text_hidden_states`、float32 BLC `[1,L,4096]`、`1 <= L <= 512`、非空の0/1 Uint8Array mask、UMT5 producer hash。通常のテキスト入力はBernini system promptやComfyUI独自promptを自動再現しない |
| VAE encode → Diffusion | `raw-posterior-mean`、float32 NCTHW `[1,16,2,2,2]`、Wan2.1 VAE producer hash。乱数sampleではない |
| Diffusionのraw mean正規化・復元 | `normalizeRawMean` / `restoreRawMean`。上記の128要素だけを対象に、実Hikeで全16 channelの定数とFP32演算順を適用する |
| VAE decode | 現行sourceは `raw-posterior-mean` と固定profileのみを受理する。正規化済みlatentや生成sampleの公開入力契約はまだない |
| Diffusionモデル推論 | `load`・`predict`・`sample` は `NOT_READY`。scheduler、noise/flow primitive、部分Q射影の成功で解除しない |

根拠は [Diffusion API](../../../docs/shared/diffusion-models/API.md)、[tensor境界](../../../docs/shared/diffusion-models/tensor-interop.mjs)、[VAE実装](../../../docs/shared/inference/vae.mjs)、[Text/VAE API](../../../docs/shared/inference/API.md)。[revision 3の結果](../../diffusion-models/REV3_RESULT.md)と [raw mean検証記録](../../diffusion-models/rev3-latent-space.json)は、部分演算・境界試験と全体推論を明確に分けている。ここでは既存の実行記録を参照したもので、新しく再実行したとは扱わない。

## 今回追加したVAE consumer契約と未接続のproducer

以下は今回のローカルブランチでVAE側へ追加し、小規模fixtureで検査したconsumer契約である。対向Diffusion APIがこのtensorを実際に生成できるという合意・検証結果ではない。既存のmean契約は変更せず、生成sampleには別のmeaningを使う。

| metadata | 制約・意味 |
| --- | --- |
| `meaning` | `wan21-raw-generated-sample:v1`。posterior meanへ改名しない |
| `dtype` / `layout` / `shape` | float32 / NCTHW / 選択したVAE profileと完全一致。現行の受入候補は `[1,16,2,2,2]` のみ |
| `latentContract.schemaVersion` | `1` |
| `latentContract.representation` | `generated-sample`。上記meaningと一致させる |
| `latentContract.space` | `raw`。VAEは追加の正規化・復元を行わない |
| `latentContract.vaeModelSha256` | 意図したdecoderのVAE hash。現行bundleは `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b` |
| `latentContract.producerModelSha256s` | 実際に生成へ寄与したDiffusionモデルのSHA-256。非空・重複なしの小文字64桁hash配列 |
| `latentContract.normalization` | `{id:'wan21-comfy-f32-v1', state:'restored', owner:'diffusion_models'}`。Diffusion側がraw空間へ復元を終えたことを宣言する |
| `modelSha256` | 既存のproducer値があればそのまま保持し、`producerModelSha256s` に含まれることを要求する。複数expertから単一のprimaryを捏造しないため、省略は可能とする |

`modelSha256` をVAE hashへ付け替えてdecoder検査を通してはいけない。VAE hashはdecoderとのbinding、Diffusion hash群は入力latentのproducerとして別々に照合する。HIGHとLOWの両方が寄与した場合は両方のhashを保持できる。単なるhash配列はexpertの順序・sigma境界・LoRAの値やstrength・seed・元動画・prompt・実行precisionを表さない。これらの再現性は別の実行記録に必要であり、この最小schemaから推測しない。

新しいmeaningをVAEが構造上受理しても、「実際のDiffusion sample → 復元 → VAE decode」の合格にはならない。metadata中の `restored` やownerもproducerの宣言であり、数値計算の実施証明ではない。実際のsamplingとgenerated sample復元が実装・検証されるまでは、対向の `NOT_READY` を維持する。既存の `requireWanRawLatent` / raw mean codec wrapperを緩めず、generated sample用の検査を分ける。

## 正規化の責務と値域

Diffusion側が数値変換を所有する。参照版は ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4` の [Wan21 latent format](https://github.com/Comfy-Org/ComfyUI/blob/b5a432157de6b8884f81104cd02926adf4d597e4/comfy/latent_formats.py#L755)。sourceと[既存Hike kernel](../../../docs/shared/diffusion-models/latent-space/latent-space.hike)は16 channel別のmean/std、scale factor `1.0` を使う。

```text
normalize: difference=f32(raw-mean[c]); scaled=f32(difference*1); normalized=f32(scaled/std[c])
restore:   product=f32(normalized*std[c]); divided=f32(product/1); raw=f32(divided+mean[c])
```

現行NCTHW profileは1 channelあたり8要素なので、channelは `floor(flatIndex/8)`。mean/stdはchannelごとに異なり、一つのscalar scale/shiftでは代替できない。latentにRGBの `[-1,1]` や `[0,1]` を適用せず、推測した共通範囲へのclampもしない。入力検査は有限float32・shape・意味・bindingを対象にする。VAEのraw RGB出力もclamp前であり、画像表示の範囲処理とは別である。

現行APIで確認済みなのはposterior meanの128要素変換だけである。rawの0もchannel別の式で変換し、高水準samplingのall-zero特例を追加していない。このkernelをgenerated sampleや大きいshapeにも対応済みとは扱わない。復元済みrawを包括モジュールやVAEが再び復元してはいけない。

## 互換性と未検証事項

- `.wktensor` は `WKTSR001` / schemaVersion 1を維持する。codecが追加metadataを検証・所有snapshotとして保存する場合も、旧meanやText tensorのheaderを無断変更しない。基準commitのwriterは `latentContract` を保存しなかった。今回のcodecは新metadataを検査・snapshotして保存し、旧golden fixtureのバイト一致と新metadataの保存往復を確認する。
- current VAEの旧mean decodeは、明示した `modelSha256` をVAEと照合し、省略も許す。追加のgenerated sample境界には独立した厳密bindingを使い、旧契約のproducer解釈を変更しない。
- 元workflowの832×480×81や対応latent `[1,16,21,60,104]` は現行VAE固定profile外。別profileのexport・参照比較を要する。metadataの追加で大きいshapeが使えるようにはならない。
- 既存raw meanの保存・復元、旧API envelope、direct/MessagePort経路は回帰対象。新しい境界については、producer/decoderの分離、複数producer、誤ったspace/normalization、意味の読み替え、非有限値、保存中のmetadata変更、保存読戻しを小さいfixtureで検査する。fixture合格と実model生成の接続合格を別に報告する。
- normalization方式とdecoder bindingは接続案として明示できるが、generated sampleの実装、数値復元、HIGH/LOW・LoRAを含む全sampling trace、元precision互換性、実generated sampleのdecoder出力は未検証である。

## Diffusion build IDへの影響

[build-info.mjs](../../../docs/shared/diffusion-models/api/build-info.mjs) は共通 `inference/tensor.mjs` をhash対象に含む。codecを変更したら、API protocol版を維持しつつDiffusion `BUILD_ID` も再生成する必要がある。旧IDのまま新codecを配布すると、host/workerが示すbuildの説明とsourceが一致しなくなる。

基準commitのread-only照合結果は29 record中28 fileが存在してhash一致。唯一、記録対象の `api/build-info.py` がこのcheckoutにない。記録されたSHAは `e0c793d23515e578c14127bf0fe3b35b35e8427cb7631fc3c1798a33d88cccb3`。READMEのコマンドだけではこのcheckoutから再実行できない。

`BUILD_SOURCES` をkey順・compact JSONとしてSHA-256にすると、現行aggregate `ab0c2224128e82229b3261114eac59573b791f56be97599023173d3e5f92b6c9` を再現する。固定IDは `diffusion-models/0.1+` とこのhashの連結。元builderを回収できなければ、再生成用builderを明示的に復元・検査し、その新しいsource hashもrecordへ含める。存在しない旧builderを再実行できたとは記録しない。

今回、[置換用generator](../../../tools/diffusion-models/build-info.py)を新しく作成した。元builderの回収ではない。29 record中、存在する28 pathを保ち、欠けていた `build-info.py` のkeyだけを `../../../../tools/diffusion-models/build-info.py` に置き換えて、新しいgenerator自身のfile hashを記録する。通常実行はreceiptのみをatomicに更新し、`--check` はsourceとreceiptの不一致を検出してファイルを変更しない。kernelの再buildやモデル処理は行わない。

```sh
python tools/diffusion-models/test-build-info.py
python tools/diffusion-models/build-info.py        # source変更を確定してから実行
python tools/diffusion-models/build-info.py --check
```

旧aggregateの再現は独立した固定fixtureに残した。generatorの小さい一時checkout試験は、全29 sourceとself hash、keyの移行、source変更とreceipt改変の検出、source欠損時のreceipt保護、作業directory非依存を確認する。この時点の調査記録として旧IDと元builderの欠落を保持し、置換generatorを作成したことだけで公開receiptを更新済みとは扱わない。

今回の既存mean正規化/復元では、数値式を変えずcontextを所有コピーで保持するよう調整した。管理側は引き続きcontext順序/正負共有/原本照合を所有する。新しいreceipt生成後のIDは接続結果記録とbuild-info.mjsに示す。
