# 新しい実plain L512出力の受入とDiffusion capture

**approved manifestで新たにplain長文を全24層実行し、全512token有効の2,097,152値が独立参照と元gate内で一致した。さらに、この新しい実出力を固定Diffusionのcapture/snapshot APIへ渡し、全data・mask・識別・最終RMSNorm markerとbuffer所有を確認した。** projection、cross-attention、FFNは実行していない。

包装のためのモデル再推論、export、参照生成は0。原reportと実payloadを保存し、別の8MB参照は重複コピーしていない。

## 実plain推論の受入

| 項目 | 固定した値・結果 |
|---|---|
| Text実行source | `78954ee92d1b76c6652f50df1668159a55db6dc9` |
| approved manifest | `420ebccc3bd6bb2124324512b60bf7f6b9dc49f1f57bdcff6ee29f561eb72405` |
| case / 入力経路 | `plain-long-eos512` / `encode({text})` |
| 入力 | 1021文字の固定長文。既存Tokenizerで511個の本文tokenとEOS、512有効token |
| 出力 | float32 BLC `[1,512,4096]`、全2,097,152値、mask512個が全て1 |
| 独立全値比較 | maxAbs `0.000151902437210083`、finite/allclose、padding0 |
| 元gate | maxAbs/atol/rtol `0.001`、変更なし |
| session・Tensor | 作成24/release24/run24、dispose72、最大同時1、終了active0 |
| 終了 | `cleanupPassed:true`、観測live/zombie/errorsなし、client disposed |
| outer wall / group peak RSS | `1417.1977774770003 s` / `3,960,307,712 B` |

[acceptance.json](acceptance.json)と[node-sdk-results.json](node-sdk-results.json)は完了済みの原本をコピーした。通常の公開Text factory・共有jobを使うNode SDK、`diagnostics:false`、実ORT CPU WASM/実Hikeによる受入である。browser Worker/T3や管理経由実行の新しい受入ではない。同時環境負荷を含みうる時間と標本peakであり、専用benchmarkや最小必要RAMとは扱わない。

独立参照は元`5954d48e0fb6df1d6977964fd8a7ba2a242b6eff`の[既存plain-long-eos512-reference.f32](../../../standalone-20261102/text/full512-conditioning/diagnostic/plain-long-eos512-reference.f32)、8,388,608 bytes、SHA-256 `6d684253cf55507dcb5e5d10b9b35970d271314131954bc614ae1954ed91312e`。実受入harnessは参照の全bytes/hashを照合した。元入力・参照・gateを今回出力へ合わせて変更せず、選択manifestの対応だけを明示した。[source-and-reference-index.json](source-and-reference-index.json)に固定取得URLと元oracle receiptを残す。

[input-record.json](input-record.json)はplain入力の来歴を保持する外側recordであり、native codecへinputModeなどの独自fieldを追加していない。この1caseを任意plain全文、system/negative構成、ComfyUI prompt重みまでの全conditioning再現とは扱わない。

## 今回の新しい実payload

[plain-long-eos512.wktensor](plain-long-eos512.wktensor)はこの新規推論の保存物。**8,390,098 bytes、SHA-256 `18ed985965e4dd90e5db3fe85b3ea55e0839d073008749ab99c9cc9d6927c00a`**。古い公開plain conditioningを新実行として再利用したものではない。[payload-descriptor.json](payload-descriptor.json)にnative headerを保存する。

- meaning `text_hidden_states`、normalization `umt5-final-rmsnorm-f32-v1`。
- model `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`。
- Tokenizer `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`。
- maskはUint8Arrayとして読み出す512個の1。保存読戻しも全値とmetadataを保持した。

このpayload hashは配布・診断用fixtureの照合値であり、通常の接続で同じpromptやpayload hashを要求する条件ではない。通常入口は実tensorのshape/dtype/layout/meaning/mask/識別とowner能力を使う。

## 実Diffusion captureのNN0確認

新しいWKTをdecodeし、固定FFEの**実**`captureP4Conditioning`と`snapshotP4CapturedConditioning`へ渡した。[conditioning-handoff.json](conditioning-handoff.json)が成功receipt、[conditioning-handoff-source-proof.json](conditioning-handoff-source-proof.json)が実行前のsource bytes照合である。

| 担当部分 | 完全source SHA |
|---|---|
| capture検証script | `941b2a6e3e956d000a3339ae05c0ef84aafed47e` |
| codec/native入力形式 | `78954ee92d1b76c6652f50df1668159a55db6dc9` |
| 実Diffusion capture/snapshot | `ffeeeedb6b57d182a977c3ac02c042ce235fc87a` |
| 元Textモデル推論 | `78954ee92d1b76c6652f50df1668159a55db6dc9` |
| 元独立参照 | `5954d48e0fb6df1d6977964fd8a7ba2a242b6eff` |

scriptは[verify-conditioning-handoff.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/941b2a6e3e956d000a3339ae05c0ef84aafed47e/tools/inference/management-connection/verify-conditioning-handoff.mjs)、8406 bytes、SHA-256 `409fefbd685c61a991b3268a015d354364c8d7fc62d18c2abc2151c4ed5954a5`。共有runtime・既存harnessを変更せず、Git固定bytesを照合した。

確認内容は次のとおり。

1. 全2,097,152値をUint32 wordとして比較し、全512mask・model/Tokenizer・final markerを保持。
2. decoded入力、capture、返却snapshotのdata/maskが別bufferを所有。
3. decoded入力のdata/mask/metadataを変更してもcaptureが変わらない。
4. 返却snapshotのdata/mask/metadataを変更してもprotected captureと次のsnapshotが変わらない。

変更したのは検証process内のowned配列だけで、保存WKTは変更していない。captureを1回、snapshotを3回呼び、projection/cross-attention/FFN/モデルNN/exportは0回。コピー・変異隔離検査全体は約10.933秒、Node rusage peak RSS `531,230,720 B`だった。snapshotを追加した診断全体の測定であり、通常capture1回の最小資源ではない。

Diffusionの`metadata.verification`は`producerAuthenticated:false / realExecutionVerified:false / jointlyAccepted:false`のまま保持した。captureがmodel identityを照合して所有copyを作ることと、producer認証・相手環境の共同受入は別である。実推論の外側receiptを理由に、この内蔵flagをtrueへ上書きしていない。

初回はcaptureより前のNode `git show`子processでsandbox EPERMとなった。同じ固定scriptを許可された環境で再実行し成功した。[conditioning-handoff-attempts.json](conditioning-handoff-attempts.json)にこの失敗と、入力decode/capture前停止だったことを分けて残す。

## Diffusion担当の受取手順

1. 最終配布commitにあるこのdirectoryのWKTと[index.json](index.json)を取得する。fixtureの受領確認ではbytes/hashを照合し、再推論は不要。
2. 同一originの共有codec `decodeTensor`で新しいowned native tensorを読む。通常接続にはこの診断reportや固定prompt hash、比較gateを要求しない。
3. 受取側Diffusion module instanceで`captureP4Conditioning(tensor)`を呼び、そのinstanceの`snapshotP4CapturedConditioning`を最初のawaitより前に使う。protected captureの認識はmodule realmローカルなので、送付側のcapture objectをJSON/MessagePort経由でそのまま認証済みtokenとして使わない。
4. 最終markerはsnapshotの`metadata.nativeTensorMetadata.normalization`に保持される。native hiddenは4096次元のまま渡す。4096→5120投影、cross-attention、FFNはDiffusion ownerの実装・検証範囲で、Text側へ重複実装しない。

```js
const tensor = await decodeTensor(await receivedFile.arrayBuffer());
const capture = diffusion.captureP4Conditioning(tensor);
const snapshot = diffusion.snapshotP4CapturedConditioning(capture);
// snapshot.data / attentionMask are receiver-owned copies.
```

不要になったnative tensor・capture・snapshotへの参照は受取側が解放する。このcapture APIにsession/Worker disposeを追加したとは扱わない。MessagePortでbufferをtransferした場合の送信側detachと、captureによるowned copyは分けて扱う。

## 再現と残件

[memory.json.gz](memory.json.gz)、[stdout.log.gz](stdout.log.gz)は原本をlossless gzip化し、[compression-receipt.json](compression-receipt.json)へ圧縮前後のbytes/hashを記録した。既存参照8MB、元6.735GB model、18.52GBの元24graphをこのdirectoryへ重複保存しない。

captureだけを再現する例。これは数値推論を起動しない診断である。

```sh
node tools/inference/management-connection/verify-conditioning-handoff.mjs \
  --tensor /path/to/plain-long-eos512.wktensor \
  --owner-root /path/to/owner-checkout \
  --owner-source-sha 78954ee92d1b76c6652f50df1668159a55db6dc9 \
  --diffusion-root /path/to/acquired-diffusion-ffeeeed \
  --diffusion-source-sha ffeeeedb6b57d182a977c3ac02c042ce235fc87a \
  --producer-source-sha 78954ee92d1b76c6652f50df1668159a55db6dc9 \
  --case-id plain-long-eos512 \
  --script-source-sha 941b2a6e3e956d000a3339ae05c0ef84aafed47e \
  --output /path/to/new-private-handoff.json
```

モデル受入そのものの再実行が必要な別環境では、固定789 sourceの`accept_lowering.py`、approved420eb bundle、元aeb7986 manifest、model、既存参照と[reproduce-selection.json](reproduce-selection.json)を使い、新しいprivate outputを指定する。受領ACKだけを目的に再推論を繰り返さない。

未受入は、受領したDiffusion担当自身の別環境ACK、投影/cross-attention/FFN、browser管理Textの別run、system/negative等のprompt組立て、LoRA付き全体運用、製品生成READY。browser管理ID試験は別runとして扱い、その結果をこのplain Node受入へ含めない。merge/Pages公開もこの包装には含めない。
