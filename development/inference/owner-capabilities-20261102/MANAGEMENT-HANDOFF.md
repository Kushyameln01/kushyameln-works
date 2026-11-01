# 管理への通常接続契約返却

API `works-ai-1`、文書revision `OWNER-CAPABILITIES-1`。実行sourceは`b2541fd2e3b7edcecd810f5215b1bd9f86afc0f4`。配布SHAはこの文書の固定Git URL/PR headを使い、後続証拠commitを実行sourceへ付け替えない。管理側の照合参照は`59ae817d0e5aa0d2b5031f88e182ac36d16a6a9f`。管理実装をこのbranchで変更していない。

## 通常の照会と実行

```js
const configuration = api.vae.configure({manifest, files});
const {support, encode, decode, runtime, constraints} = api.vae.capabilities({
  operation:'decode', input: nativeDescriptor
});
if (!support.supported) return support; // code/reason/requiredChangesを表示
const result = await api.vae.decode(nativeTensor);
// result.tensor: RGB
// result.inputDescriptor: 元sample/meanの形状・意味・producer/decoder/context
// result.binding: 今回検証したasset hashesと実input/output shape
// 詳細evidenceは通常結果にない
```

通常`configure`に参照tensor、gate、prompt hash、過去receiptを渡さない。`files`は従来のMap(fileName→File/Blob/Uint8Array)で、モデル/graphのbytes/hash検査は通常実行でも維持する。manifestの`references`・`comparisonGate`・Textの`numericGate/nativePass`は通常接続の条件ではない。誤差gateを外して無検証の別graphを受入済みとする意味ではなく、診断受入と日常の接続判定を分ける。

| 管理側descriptor | 当ownerへのnative照会 |
| --- | --- |
| operationId | `operation:'encode'/'decode'` |
| tensor.dtype/shape | `dtype/shape`。具体次元をそのまま保持 |
| tensor.axes | `layout=axes.join('')`。VAE NCTHW、Text出力 BLC |
| tensor.nativeMeaning | `meaning`。common semanticから推測しない |
| 既存native.metadata | model/Tokenizer、mask、normalization marker、context、latentContractを保持 |
| artifact/snapshot/owner/trace/build | 外側package。native context/latentContractへ追加しない |

既存の`capabilities(q.input)` adapter/MessagePort methodを利用できる。Textへの照会inputは通常APIと同じ`{text}`または`{tokenIds,attentionMask}`。Textは構文/local filesの照会後、実tokenizationでoverflowを拒否する。返却tensorの実L/maskが正本であり、`effectiveTokens`と返却Lを混同しない。

## 能力の意味

VAEは設定した一組の完全shapeを返す。`support.supported`はdescriptorの一致と必要asset存在/容量の判定で、`runtime[operation].verified`とは別。未実行・再configure・dispose後のruntime検証状態はfalse。成功後だけ実shape/hashを記録し、将来の変更可能なassetまで保証しない。graph metadataの具体次元が宣言と異なればrun前に失敗し、symbolic outputも実出力を全次元検査する。

照会失敗時は理由と必要なprofile/graphの追加または設定変更を返す。式F=4n+1や同じ要素数だけで接続しない。現exporterのN=1、F=4n+1、H/W≥16の16倍数と、manifest構造検査の空間8アラインは区別する。既存Bernini/workflowの前処理やshape計算をownerへ複製していない。縮小/padding/frame削減を追加しない。

capability内の`normalization`は説明用の制約で、raw tensorへmarkerを補う指示ではない。native raw mean/RGBにはlatent正規化markerを付けない。normalized meanの供給済みmarkerを保持し、VAE raw decoderでは拒否する。生成sampleは元producer列・decoder VAE bindingとDiffusion所有のrestored宣言を維持し、meanへ改名しない。

## 通常出力と保存

Text通常出力は`{tensor,attentionMask,inputMode}`。tensorに実shape/L、float32、BLC、text_hidden_states、model/Tokenizer hash、mask、`normalization:'umt5-final-rmsnorm-f32-v1'`がある。実Hike weighted final RMSNorm（epsilon1e-6）適用後のmarkerであり、mask0行は0。plainはL512、IDは要求L（1..512）。projection/cross-attention/FFNを追加していない。

`.wktensor`はschemaVersion1/WKTSR001のまま、Text markerと既存native metadataを保持する。旧markerなしText/latentは読み取れ、省略markerを推測しない。旧writerでの再保存は新markerを失い得るため、新codecをsourceRefで選択する。今回の通常接続で旧ファイルを一括作り直す必要はない。

VAE decode後のRGB tensorのmodelはdecoder VAE。入力sampleのproducer/decoder/復元宣言は通常`inputDescriptor`へ残す。管理はこれとRGB `.wktensor`を外側packageで結ぶ。RGBファイルだけでsample来歴を保存できたとは扱わない。詳細receipt・独立参照・gate・全中間tensorは診断側へ保存する。

## 取消と所有権

既存共有executorのbusy・Worker終了・stale結果拒否を維持する。cancelは専用Workerをterminateしてpendingをrejectする。正常/失敗でもWorkerを終了し、正常処理はsession/Tensor/Hike終了後に結果を返す。module disposeはfile handlesと観測済みbindingを捨てる。共有clientを使う片方のmoduleのdisposeは他moduleを終了しない。Diffusion executorを含む横断直列化・待機列は管理側が所有する。

同origin ES module/明示MessagePortを維持する。RPC resultのdata/mask buffer転送後は受信側が所有し、送信側はdetachedとなる。`inputDescriptor`はdataなしのowned snapshot。port unbindのみではジョブを取消しない。

実行結果・新規確認と再利用・未対応shapeは[RESULT.md](RESULT.md)、数値と資源の詳細は`diagnostics/`に分ける。これは送付側の契約返却であり、管理別環境でのsource取得・実adapter受入ACKを代行した記録ではない。
