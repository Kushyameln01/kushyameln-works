# 固定conditioning packetの受領検査

このprobeは一件の `Hello world` plain packetに限定する。モデル・ONNX・Tokenizer本体のダウンロードや推論、数値oracle／RMSNorm／cross-attentionの再実装は行わない。既存G1C `decodeTensor`で公開conditioningを読み、独立全値比較receiptへdata/reference hashを結ぶ。

## 実行

Git metadataとpacketが揃った固定checkoutで実行する。Node標準moduleのみを使う。

```sh
node tools/inference/text-encoder/inspect_conditioning_handoff.mjs
```

結果を保存する場合は、まだ存在しないfileを指定する。親directoryは先に用意する。

```sh
node tools/inference/text-encoder/inspect_conditioning_handoff.mjs \
  --output /path/to/fresh-local-inspection.json
```

source/packetをcommitしてから実行する。未trackedのpacket、Git HEADと違うbytes、不足file、hash・schema・mask・receiptの不一致は `passed:false` とexit code1になる。`git rev-parse HEAD`の実測値をactualCheckoutShaへ記録し、宣言された実行sourceを現在checkoutとみなさない。各fileのGit blobは `sha1("blob "+byteLength+"\0"+actualBytes)` と `git rev-parse HEAD:path`で比較する。8MB payloadを `git show` の標準maxBufferへ読み出す方法は使わない。Git metadataのないarchiveだけから、宣言SHAを実checkoutの取得証拠にしない。

## 確認する範囲

- 小source6件の固定SHA-256とHEADの実Git blob。Text API/runtime/Tokenizer、Hike source/WASM、codec原本を変更せず使う。検査済みcodecだけをimportする。
- [P3-HANDOFF.json](../plain/P3-HANDOFF.json)、[RECEIPT.json](../plain/RECEIPT.json)、[EVIDENCE-INDEX.json](../plain/EVIDENCE-INDEX.json)、[source-bindings.json](../plain/source-bindings.json)と、index内の全実fileのbytes/hash/Git blob。
- [conditioning manifest](manifest.json)自身のHEAD blobと、指定8参照（prompt、token IDs、tensor、mask、reference、比較receipt、evidence index、browser trace）のbyteLength/SHA/HEAD blob。選択モデルmanifest原本も別に検査し、既知source6件の参照をcore2bdへ固定する。
- 上記tensor/referenceの実bytesと固定P3 packetのdata/referenceを照合し、比較receipt/index/browser traceも既に確認した元JSONへ結ぶ。別fileとその自己申告hashだけでは検査済みにしない。
- prompt.txtのUTF-8 bytesを元宣言hashへ、mask.u8全512 bytesをtensor header内maskへ、token-ids.jsonのdata全512 IDsをplain-input実記録へ照合する。
- 元plain実行source `5537b8932343aa2476b95191817e8913f99dab02`を固定し、今回取得したcheckout HEADと別に保持する。全receiptのSHAを別の同じ値へ揃える付替えも拒否する。
- 実conditioning全file SHA `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9`、payload SHA `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`。
- float32 BLC `[1,512,4096]`、`text_hidden_states`、model/Tokenizerの固定識別、Uint8 mask全512位置、3有効位置とmask0行の実zero値。ID可変Lの全ケース受入へ拡張しない。
- 選択manifest原本の全hash・finalNorm weight/epsilon・numericGate原文と、既存独立reference全file SHA `e59ad16a82799a42fe82eb76b3c7438a70c4766be7d7c7eb9b18222bfb1c83a9`。
- 元referenceがpinned T5 source・24層・full512・ONNX/Hike不使用と記録され、実WASM側と同じ入力/mask/gate、conditioning/reference hash、全2,097,152値比較receiptへ結ばれていること。過去の数値比較を再実行したとはしない。

固定source6件は[manifestの既知source](manifest.draft.json)と同じ原本 `2bdca59ea78580d4fe7a9d31a8de33209b64d029`に対応する。

| path | SHA-256 |
| --- | --- |
| docs/shared/inference/tensor.mjs | d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5 |
| docs/shared/inference/text-encoder-api.mjs | b20fc73262c12558e2c54fb7ac8bfd20775c39dd2dbe4a47efd0a73632ec9a99 |
| docs/shared/inference/text-encoder.mjs | 9d4f528a926dc40bdbf721c5072518d0e027019a5a0912deeac0dc0f449fd8a2 |
| docs/shared/inference/tokenizer.mjs | 4a7811d4e36fbcc568e2a2a1e0941fd78261f84b231a96458d919ea0259fb9a5 |
| tools/inference/kernel/tensor.hike | 09625a5a955b843fdf15b22676429c3774600b3dd3aaa53fc77325869fcd0490 |
| docs/shared/inference/kernel/tensor.wasm | 9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8 |

## 正式ACKとの区別

出力は常に `localVerificationOnly:true`、`recipientIdentityAttested:false`、`newNN:0`、`crossAttentionConsumed:false`。role名やreceiver名を入力して正式ACKを自動発行する機能はない。

送付側rootが実行した結果はlocal self-checkである。正式な受取確認には、実receiverが取得した公開完全SHA・source/dataの検査結果を、自分の返信またはcommitへ対応付ける必要がある。probeのPASSは独立ownerの本人性、過去NNの再認証、管理への正式採用、Text→現固定N2tail消費、production cross-attention／生成READYを意味しない。

現tailの未対応範囲、negative/Bernini prefix/Comfy重みの制限は[CONTRACT.md](CONTRACT.md)を維持する。既存codec/manifest受領ACKをこの新conditioning dataのACKへ付け替えない。
