# VAE / Text 固定成果の返却・取得照合

2026-11-02 JST。対象成果の配布SHAは **`f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48`**、branch `codex/p2-p3-plain-acceptance`、[Draft PR15](https://github.com/Kushyameln01/kushyameln-works/pull/15)。この追補は既存manifest・receiptの取得一覧と対向契約照合だけを追加する。既存実行・data・gateは変更せず、推論・export・新しい参照計算を行っていない。

## 配布と実行source

| 記録 | 実行source SHA | scope |
| --- | --- | --- |
| 初回Text plain / P2 helper | `5537b8932343aa2476b95191817e8913f99dab02` | plain全値独立比較と初回60d管理実行 |
| 初回管理 | `60d16b64d6020d3d20239f087f8add91268dcaad` | 初回P2。884結果へ付け替えない |
| 追加P2 observer | `e150e7ac3c4859739528ff278763c6474968ac08` | 新joint runnerの正常・取消復帰を外部観測 |
| 追加P2管理 | `8849891f19124df31847bd691503c2491278eaa8` | currentInputLink / jointTraceIdでmean→実decode→E4を連結 |
| 実VAE | `855f435120f08eb9e818e51281fc26f0e2633829` | 既存Rect raw decode |
| mean数値owner | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` | Diffusion Hike normalize / restore。VAEに重複実装しない |
| 採用永続codec | `2bdca59ea78580d4fe7a9d31a8de33209b64d029` | 供給normalized markerを保持 |

## 管理へ渡すP2

以下のpathは固定f76 tree内の `development/inference/p2-p3-acceptance/` からの相対path。[全121fileの取得path・bytes・SHA-256・Git blob・固定URL](FILES.json)を併用する。今回の照合は保持済み固定Git bytesと既存indexを使い、P2の全93fileとplainの既存12file indexを確認した。121件すべてを今回ネットワーク再取得した意味ではない。入口4件の実GitHub再取得は[SENDER-REMOTE-READBACK.json](SENDER-REMOTE-READBACK.json)へ別記した。

| 入口 | bytes | SHA-256 |
| --- | ---: | --- |
| `p2/updated-884/EVIDENCE-INDEX.json` | 17204 | `1c6bb7f483649720e6b27e562461161ac0113403d350abec3a004fe9603a82c4` |
| `p2/updated-884/MANAGER-SOURCE-RECEIVED.json` | 7861 | `ebf5e656117ffb4480232f2a51ecaa64922ea0799925b2c9b46ff0713757653d` |
| `p2/updated-884/NEW-884-SOURCE-CLOSURE.json` | 8307 | `a5575821c430049c0054f0e1de00192d5dc175e0824db3f90c4042a772eb974f` |
| `p2/updated-884/observer-result.json` | 85723 | `6f60b1226424d5df5608cb8c8c34ae8835b7734143e580515ce0d7f0ba0b514a` |
| `p2/updated-884/decode/result.json` | 1210296 | `1dfd19f07b67a802c1c00000d00ff498f15409fd7633594d386512fc453de09b` |
| `p2/updated-884/cancel-recover/result.json` | 1216943 | `a676887cc7d5f5fab1d1bcfb11d9d8eaf2c2ee1eb92469a4ff6ded9894824914` |

各scenarioの `mean/{raw-mean,normalized-mean,restored-mean}/` にnative WKT、manifest、descriptor、trace、evidence、snapshot、extensions、receiptがある。`mean/received-rgb/` は既存受領RGBの履歴保存で、新decode出力ではない。新出力は正常の `decode/decode/1-decoded-rgb/`、取消復帰の `cancel-recover/decode/2-recovered-decode/`。それぞれ `rgb.wktensor` とpackage一式を同梱している。

対象profileは `wan21-raw-f32-1x16x32`。mean `[1,16,1,2,4]`、RGB `[1,3,1,16,32]`。両scenarioは同復元mean file `dd483ad83be782b769043f4a28b3ff3d05e5f0c8f6588215d85a3e780eb12612` を使用する。正規化markerは `wan21-comfy-f32-v1`、mean往復gate `2e-6`、RGB全1536値gate `atol=rtol=maxAbs=2e-5`。数値受入は既存f76 receiptを再利用し、今回の取得照合を新decodeへ加算しない。

正常traceは `works:p2:joint:fc24f1eb-a752-45c7-acd6-4a7fd6b07318`、取消復帰traceは `works:p2:joint:23cdb4ac-bab0-4909-9cf3-23295abc1f3f`。管理はsource/native/build/profile/規範と、mean3段階のE4、owner操作、queue、context/frame配列、実decode入力、RGB保存読戻しをこのtraceで照合する。`MANAGER-SOURCE-RECEIVED`はVAE/Textが管理884を受け取った方向の記録であり、管理が当返却を受領したACKとは異なる。

## 管理・Diffusionへ渡す実conditioning

入口は固定f76の `conditioning/manifest.json`（18626 bytes、SHA-256 `3a97422cda0c3bf8e731217ce230e92708945987db55498791d8421da8aec25a`）と `conditioning/RECEIVER.md`（6078 bytes、SHA-256 `78c03c72adcb8fc59b8cb5f05e0560bc8b5f0afde59fc3b50baa9a1dee4f2c32`）。manifest内の相対pathはこの元directoryを基準に読む。[FILES.json](FILES.json)内の引用metadataを新しい基準directoryへ移植して読まない。

| 実file | bytes | SHA-256 |
| --- | ---: | --- |
| `plain/evidence/plain-conditioning.wktensor` | 8390054 | `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9` |
| `conditioning/mask.u8` | 512 | `19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62` |
| `plain/evidence/plain-reference.f32` | 8388608 | `e59ad16a82799a42fe82eb76b3c7438a70c4766be7d7c7eb9b18222bfb1c83a9` |
| `plain/RECEIPT.json` | 8087 | `d8ae8e1733342ff868f394af5b2ad17bf9c07b9cb80c9975bac427ab022e9903` |

実payloadはfloat32 BLC `[1,512,4096]`、meaning `text_hidden_states`、payload SHA-256 `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`。plain入力は `Hello world`、maskは全512位置を保持して有効3位置、無効行は0。ID入力の `[1,L,4096]` と区別し、このplain出力を有効3位置へ短縮しない。

modelは `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`、Tokenizerは `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`。選択manifest `aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f`、最終RMSNormのweight/source・epsilon1e-6、元gate `.001/.001`、独立512位置参照と元実行5537をmanifest/receiptへ結ぶ。Text gateとDiffusionのP4 local/composed gateを混ぜない。Bernini prefix・negative選択・正負artifactの並びは管理側、4096→5120投影とcross-attentionはDiffusion側の責任である。

## 最新Diffusion契約と受領の境界

取得したDiffusion配布は `7ee36228030ba3bb544a90b1d4b528702a7bae32`。P4の実行source5744/base829と区別する。source取得記録・実出力とのmapping・差分はこの追補の `DIFFUSION-SOURCE-ACQUISITION.json` と `CONTRACT-COMPARISON.md` に記録する。f76 manifestが保持する829の4入口は新headとbyte同一であり、元manifestの履歴を上書きしない。

受領側は固定f76を取得し、元 `conditioning/RECEIVER.md` にあるモデル不要のprobeでsource/dataの照合ができる。probeのPASSはlocal確認で、相手本人のACK・cross-attention消費・生成READYには昇格しない。固定sourceの取得確認に再推論・再exportを要求しない。

相手から返してもらう情報は、担当、成果配布SHA、受領側の実行source/checkout SHA、取得path/bytes/SHA-256、確認scope、未取得・未受入事項、返却receiptまたは返信URL。管理はP2返却の最終照合結果も記載する。送付側self-check、こちらによる管理/Diffusion source取得、相手側の当成果取得を別々に記録する。

現時点の受領記録は `RECEIPT-STATUS.json` に保持する。相手本人の新ACKと管理最終照合は未確認。実TextのP4数値消費、P5実generated sample復元・最終decode、実媒体/slot未取得のprofile・81frame、全工程資源は未受入。merge・Pages公開は実施していない。
