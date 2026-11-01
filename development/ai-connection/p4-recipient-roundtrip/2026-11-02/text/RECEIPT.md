# Text conditioning の取得・P4 capture 受領記録

固定配布 `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48` の実 conditioning packet を取得した。27 file、計17,083,779 bytesの実bytesを、immutable Git commit→tree→blobとSHA-256へ結び、元manifest・receipt・reference・sourceの整合を確認した。受領側7eeの既存 `captureP4Conditioning` と snapshot の純粋検査もPASSした。新しい推論・export・投影・cross-attention消費は0である。

この記録の受入範囲は取得と同期capture境界である。元Text全値比較のreceiptを実bytesへ結んだが、数値比較を再実行したとは扱わない。`producerAuthenticated:false`、`realExecutionVerified:false`、`jointlyAccepted:false`、`generationReady:false`を維持する。

## 固定source

| 対象 | 完全SHA / source |
| --- | --- |
| Packet配布 | `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48` |
| 元Text実行 | `5537b8932343aa2476b95191817e8913f99dab02` |
| 受領probeで使用したDiffusion checkout | `7ee36228030ba3bb544a90b1d4b528702a7bae32`、`/workspace/work/diffusion-models` |
| 元codec宣言source | `2bdca59ea78580d4fe7a9d31a8de33209b64d029` |
| 取得したGit tree | `1ccc9b06c92fc7dc767fae13cf9cc0a963938744` |

PacketはGitHub APIの固定commit/tree metadataとraw HTTPSで取得した。PacketのGit checkoutは作成しておらず、`actualCheckoutSha:null`。共有Git DBへのfetch/ref変更は行っていない。実取得物は `/tmp/text-packet-receipt-20261102/source/` に保持した。各path・URL・bytes・SHA-256・Git blob SHAは `acquisition.json` にある。

## 主な取得物

以下はすべて配布f76の `development/inference/p2-p3-acceptance/` 以下のpathである。

| path | bytes | SHA-256 |
| --- | ---: | --- |
| `conditioning/manifest.json` | 18,626 | `3a97422cda0c3bf8e731217ce230e92708945987db55498791d8421da8aec25a` |
| `conditioning/RECEIVER.md` | 6,078 | `78c03c72adcb8fc59b8cb5f05e0560bc8b5f0afde59fc3b50baa9a1dee4f2c32` |
| `conditioning/CONTRACT.md` | 12,943 | `f2fa421bc7cbac686865c7893420bdb9d976954207a93391966e9dafffa094e7` |
| `plain/RECEIPT.json` | 8,087 | `d8ae8e1733342ff868f394af5b2ad17bf9c07b9cb80c9975bac427ab022e9903` |
| `plain/evidence/plain-conditioning.wktensor` | 8,390,054 | `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9` |
| `conditioning/mask.u8` | 512 | `19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62` |
| `plain/evidence/plain-reference.f32` | 8,388,608 | `e59ad16a82799a42fe82eb76b3c7438a70c4766be7d7c7eb9b18222bfb1c83a9` |

WKT payloadは8,388,608 bytes、SHA-256 `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`。`float32/BLC/[1,512,4096]/text_hidden_states`、mask全512位置・有効3位置とmask0行の既存zeroを確認した。Modelは `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`、Tokenizerは `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458` と一致した。Tokenizer本体を取得・再実行したという意味ではない。

## 検査sourceと結果

元helper `tools/inference/text-encoder/inspect_conditioning_handoff.mjs` はf76からbyte exactに取得した。11,461 bytes、SHA-256 `69af4634a9a18a5689862ba8fe469d2efa8d8de462a4599cac2962df14024017`。元helperは実Git checkout/HEADを要求するため、そのまま実行したとは記載しない。派生 `inspect_received_conditioning_handoff.mjs` はこのGit照合を取得済み固定tree/blob照合へ替え、元のpacket・receipt意味検査をすべて保持した。派生SHA-256は `fb740780d7a62072f9bf04e0741a758b96647088a11598cac5b2086525cb8c20`。変更理由・差分は `received-inspector-derivation.json` と `received-inspector.patch` に残した。

`packet-inspection.json` はPASS。source6件、manifestの8参照、index内全file、選択manifestの19,908 bytes/SHA、finalNorm/epsilon、元gate、prompt全UTF-8 bytes、全512 IDs/mask、元Text実行5537、既存全2,097,152値比較receipt/reference/browserのhashを照合した。既存receiptのPASSと今回のhash検査を区別した。

`capture-probe.mjs` はSHA-256 `9bf400a62aa0fc2fbf63c84c2e38d20f6436a362254be2174606b2d64e786622`。f76から取得・hash検査したcodec `tensor.mjs`（8,256 bytes、SHA-256 `d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5`）で読戻し、7eeの既存capture module（18,862 bytes、SHA-256 `b4518ea35ca35e63e6ba8cdbe67e5d9fea0fa2125dac7dac0f5d4ac6c83ac7c2`）を実行した。Nodeはv24.19.0。

`capture-receipt.json` はPASS。shape・全行・全mask・model/Tokenizer・native metadataを保持し、入力不変、data/maskの独立owned copy、snapshotの独立copy、前後payload/mask bytesとhashの同一性を確認した。`sealBytes=8,389,120`。`fullProvenance:true`は必須識別fieldの一致のみで、本人性や過去実行の再認証ではない。外側evidence/trace/receiptは元packetとして別保持した。

## モデルを使わない再現

`TEXT_RECEIPT_DIR` は保持asset root、`RECEIVER_REPO` は実際に7eeへ固定したcheckoutを指定する。記録時の既定値はそれぞれ `/tmp/text-packet-receipt-20261102` と `/workspace/work/diffusion-models`。後続commitのcheckoutへ実行sourceラベルを付け替えない。記録後に共有branchが進んだ場合は、別の7ee固定checkoutを指定する。

```sh
export TEXT_RECEIPT_DIR=/tmp/text-packet-receipt-20261102
export RECEIVER_REPO=/path/to/checkout-at-7ee36228030ba3bb544a90b1d4b528702a7bae32
git -C "$RECEIVER_REPO" rev-parse HEAD > "$TEXT_RECEIPT_DIR/receiver-head.txt"
git -C "$RECEIVER_REPO" show 7ee36228030ba3bb544a90b1d4b528702a7bae32:docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs > "$TEXT_RECEIPT_DIR/receiver-conditioning.mjs"
node "$TEXT_RECEIPT_DIR/source/tools/inference/text-encoder/inspect_received_conditioning_handoff.mjs" --output "$TEXT_RECEIPT_DIR/fresh-packet-inspection.json"
node "$TEXT_RECEIPT_DIR/capture-probe.mjs" "$TEXT_RECEIPT_DIR/fresh-capture-receipt.json" "$TEXT_RECEIPT_DIR/fresh-packet-inspection.json"
```

出力fileは未存在の名前を使う。captureは第三引数で今回作ったinspectionを読む。必要な場合のみ `TEXT_RECEIPT_DIR` を指定して `acquire.py` で同じ27fileを再取得し、`prepare_received_inspector.py` で派生probeを作れる。いずれもmodel推論を呼ばない。tracked scriptsを別の場所に保存する場合、captureは `TEXT_RECEIPT_DIR` でasset rootを明示できる。派生inspector自体は上記の `source/tools/inference/text-encoder/` 配下で実行する。

## 未取得・未受入

Model weights/ONNX graph、`spiece.model` 本体、元workflow媒体・Bernini prefix・negative/context入力は取得していない。P4 stage/固定L4診断runner、native reference JSON変換、projection、cross-attention、FFN、数値oracle再比較、生成decodeは実行していない。任意prompt、元GPU FP8、元workflow conditioning、全block、本番数値・資源・生成READYを受入済みとはしない。

独立read-only reviewは取得chainと全27fileのbytes/hash、元helperからの意味検査保持、captureのモデル不使用とscopeを確認し、重大な問題なし。再現時のfresh inspection指定は第三引数で解消した。成果物の全pathとSHAは `receipt-summary.json` にまとめた。共有repositoryのファイル変更・対外コメント・commitはこの作業では行っていない。
