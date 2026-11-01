# Text conditioning の引渡し契約

2026-11-01。外側packet案 `works-conditioning-handoff/0.1-draft.1`。native `works-ai-1`、`WKTSR001/schemaVersion1`を変更しない。[manifest.draft.json](manifest.draft.json)は未完了artifact参照を含む準備用文書であり、consumerの実行許可や受領ACKではない。

## native出力と保持する情報

| 経路 | native出力 | 入力・mask規則 |
| --- | --- | --- |
| encode({text}) | float32 / BLC / `[1,512,4096]` / `text_hidden_states` | BOSなし、EOS1、PAD0、EOS込み最大512。無断切詰めなし。空文もEOSを持つ |
| encode({tokenIds,attentionMask}) | float32 / BLC / `[1,L,4096]`、1≤L≤512 | ID0..256383、同長mask0/1、少なくとも1位置有効。EOS/padding自動追加なし |

dataは有限Float32Array、attentionMaskはUint8Array[L]。返却Lと内部mask位置を保持し、mask0のhidden行は0。plainとID入力を同時指定しない。512×4096は2,097,152要素・8,388,608 bytesで、Diffusion pointwiseの1M上限とは別operationである。

これはText最終RMSNormを含むnative出力で、**まだmodel dimへ投影していない4096次元**である。latentのraw/normalized規約を付けない。意味をraw latent/mean/sampleや5120次元hiddenへ改名しない。4096→5120のtext projection、cross-attentionのK/V/Q・norm・精度・padding規則・数値参照はDiffusion ownerの責任とする。

固定識別は次のとおり。sourceの取得と新実行で使ったsourceは分ける。

| 対象 | 固定値 |
| --- | --- |
| encoder model | `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68` |
| Tokenizer spiece.model | 4,548,313 bytes / `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458` |
| 選択manifest | [既存原本](../../codec-marker-handoff/manifests/text/manifest.json)、19,908 bytes / `aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f` |
| final-norm.f32 | 16,384 bytes / `31ec55a911ef90efa7cfb36d7f3b004a8652d36979b0b1824dc7c2b335b24a02`、epsilon `1e-6` |
| G1C codec原本 | `2bdca59ea78580d4fe7a9d31a8de33209b64d029:docs/shared/inference/tensor.mjs`、8,256 bytes / `d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5` |

選択manifestのnumericGate原文は `maxAbsError=.001 / rtol=.001 / registeredBeforeComparison=true`、scopeは `FP32 source-reference diagnostics; no original workflow quality guarantee`。別profileのgateを転用せず、比較方法・独立reference・全値結果を[plain側の事前計画](../plain/predeclared-plan.json)と実receiptへ結ぶ。この文書自体はplain数値比較のPASSを先取りしない。

## packetを完成させるとき

1. G1C `.wktensor`全fileとpayloadそれぞれのSHA、dtype/layout/shape/meaning、encoder model/Tokenizer、maskを保存する。元tensor/evidenceを旧Diffusion wrapperで作り直さない。
2. 同じmaskをcodec header内のattentionMaskと、別のUint8バイナリfileの両方へ保持し、読戻した実bytesを比較する。別fileのhash/長さ、有効位置、input IDsとの対応を記録する。
3. 元promptのUTF-8 bytesを別fileへ保持し、BOM/newline/空白を含む全byteのhashを記録する。事前計画の文字列hashと、保存したfileの観測hashを分ける。Token ID入力は元ID列とmaskのfile/hashを別に記録する。
4. 実encodeのsource完全SHA/build/operation、manifest/finalNorm/Hike、独立全値reference、事前gate、比較件数・最大差・失敗位置・mask0行、保存読戻しを外側evidence/traceへ結ぶ。実行・配布・観測sourceのSHAを付け替えない。
5. `manifest.draft.json`のnullは理由付き未確定値である。plain担当の実output/reportが揃ってからrootが実path/hash/sourceを埋める。既定ファイル名は候補であり、存在しないfileや未確認hashを取得済みとして登録しない。全必須参照を解決するまではpacketをDRAFTのままにする。
6. 管理snapshot/owner/graph/build/trace、正負の役割やordered VAE context参照は外側packet/E4へ置く。strict native context/latentContractへ管理fieldを追加しない。E4 packageを作る場合、nativeだけでなくdescriptor/evidence/trace/snapshot/extensions・mask attachmentを結ぶ。snapshot未成立はnullを保持する。

今回の予定dataは一つのplain fixture `Hello world`。positive側診断としてのみ扱う。negative生成、Bernini task system prefix、default negative選択、正負conditioning共有context、ComfyUI prompt重み/custom embeddings/clip-skip/pooled出力は未検証／未対応を維持する。通常テキスト一件の比較から元workflow conditioning全体の再現を主張しない。

## 現Diffusionへ渡せる範囲

固定self-attention tailの証拠配布は[PR14 / `508d72cc9036e7f500827465c644b4aed3c5f711`](https://github.com/Kushyameln01/kushyameln-works/pull/14)。tail実行sourceは `a49aac492cc68e2dd6037e0deb4a6954731a847a`、管理runner実行sourceは `5c484a8783ab129a2ff3543a98b2537af9888199`。次の4項目はこの固定tailと旧interopのscopeであり、後述する新P4候補と区別する。配布SHAへ実行sourceを付け替えない。

- 現tailは `bernini-block0-n2-self-attention-residual-f32-v1`、HIGH scheduleIndex1／LOW3、block0、tokens2、固定artifact/receipt/全配列hashを要求するself-attention残差だけ。`stage.run({attention,patchHidden,timeAct1,signal,onProgress})`はconditioningを受け取らない。渡せるのは次のcross-attention実装に向けたdata/契約であり、現tailで消費済みとはしない。
- `validateConditioning`は `input:{tensor}` 包装でBLC/mask/modelを検査するが、cross-attentionの実行ではない。現 `tensor-interop.mjs` はTokenizer hashを照合せず、旧ownedTensor/wire metadata/旧codec writerはその識別を落とす。完全なG1C原本＋外側evidenceを保持し、この制約をreceiverへ伝える。
- 短いID入力Lの512化、mask0行削除、独自softmax mask、text projection後の行削減をこちらで追加しない。元cross-attentionのtext projection/全context行規則に適合する準備はDiffusion ownerが実source・独立比較とともに定義する。
- receiptで「形式検査」「data受領」「数値比較」「cross-attn実消費」を分ける。未実装consumerや実producerの不足を管理で数値計算して補わない。

根拠は固定[Diffusion API](https://github.com/Kushyameln01/kushyameln-works/blob/508d72cc9036e7f500827465c644b4aed3c5f711/docs/shared/diffusion-models/API.md)、[stage](https://github.com/Kushyameln01/kushyameln-works/blob/508d72cc9036e7f500827465c644b4aed3c5f711/docs/shared/diffusion-models/ort-bridge/self-attention-tail/stage.mjs)、[trusted inputs](https://github.com/Kushyameln01/kushyameln-works/blob/508d72cc9036e7f500827465c644b4aed3c5f711/docs/shared/diffusion-models/ort-bridge/self-attention-tail/trusted.mjs)、[conditioning validator](https://github.com/Kushyameln01/kushyameln-works/blob/508d72cc9036e7f500827465c644b4aed3c5f711/docs/shared/diffusion-models/tensor-interop.mjs)。

### source829467で追加されたP4候補

取得して読んだ新sourceは `829467c14ec6fd1ab1858dfc175c84605de1ac98`。別profile `bernini-block0-n2-cross-ffn-f32-candidate-v1` の入口を追加している。このsourceを今回のText実行source5537へ付け替えず、今回の実Textによるcapture・P4数値実行・独立比較・受領ACKは未確認のままとする。

- [conditioning.mjs:156](https://github.com/Kushyameln01/kushyameln-works/blob/829467c14ec6fd1ab1858dfc175c84605de1ac98/docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs#L156) の `captureP4Conditioning(tensor,{expectedModelSha256,expectedTokenizerSha256,missingTokenizerPolicy})` はnative `text_hidden_states`／float32／BLC `[1,L,4096]`、1≤L≤512を構造検査する。dataはcompactなnative Float32Array、maskはcompact Uint8Array[L]の0/1で1位置以上有効、mask0行は供給時点で全0が必要。既定のmodel/Tokenizerは本packetの固定hashへ一致させ、Tokenizer欠落は既定reject。明示retain-unknownでも既知hashを補わない。
- captureは同期owned copyで、正規化・projection・padding・行削除をしない。元tensorのadmitted metadataを保持するが、tensor外のreceipt/evidence/traceは外側packetに残す。`producerAuthenticated`／`realExecutionVerified`／`jointlyAccepted` はfalse。同module instanceのprivate sealを要求するため、MessagePortや保存読戻し後はreceiver側でcaptureへかけ直す。構造適合から元実行・本人性を認証しない。
- [新stage:17](https://github.com/Kushyameln01/kushyameln-works/blob/829467c14ec6fd1ab1858dfc175c84605de1ac98/docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs#L17) のgeneric `createPostSelfAttention(...).run({residual,timeAct1,conditioning,...})` は認識済みnative captureをsource上は許容し、fixture専用L4 gateを持たない。N2 residual／timeAct1と全L行を使う4096→5120投影・cross-attention・FFNはDiffusion側の処理。maskは来歴として保持し、softmax maskへの変更や行削除をこちらで加えない。実L512での数値・資源受入は未確認。
- 現在の[診断runner:35](https://github.com/Kushyameln01/kushyameln-works/blob/829467c14ec6fd1ab1858dfc175c84605de1ac98/docs/shared/diffusion-models/diagnostics/p4-cross-ffn/run.mjs#L35) は `[1,4,4096]` の固定fixture data／mask／fixtureContract hashを要求し、`captureP4FixtureConditioning`を使う。[browser比較:258](https://github.com/Kushyameln01/kushyameln-works/blob/829467c14ec6fd1ab1858dfc175c84605de1ac98/tools/diffusion-models/p4-cross-ffn-browser.py#L258) もL4 fixture専用である。本packetのL512をこの受入経路へ無変更で通せるとはしない。fixture比較を実UMT5 conditioningの比較へ読み替えない。

[native reference入力:100](https://github.com/Kushyameln01/kushyameln-works/blob/829467c14ec6fd1ab1858dfc175c84605de1ac98/tools/diffusion-models/p4-cross-ffn-reference.py#L100) の `--text` はG1C WKTとは別のprivate JSON schema `bernini-p4-native-text-input/0.1`。dtype/layout/meaning、`[1,L,4096]`、flat data、mask、`producer.module=text_encoder`／元実行の完全sourceCommit、model hash、Tokenizer既知hashまたは明示nullを保持する。`dataSHA256`がある場合は実F32 bytesと照合する。reference側の `nativeTextArtifactSHA256` はJSON全UTF-8 bytesのhashであり、元WKT全file hashの代用品ではない。

このJSONへ変換する別工程では、元WKT whole `90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9`、payload `107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7`、mask `19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62`、producer実行 `5537b8932343aa2476b95191817e8913f99dab02`、選択manifest・Tokenizer・元receipt・事前gateを外側で結ぶ。現時点でJSON変換・相手受領・P4実Text消費は実施済みとしない。P4候補のlocal/composed gateはText既存gateとは別で、Diffusion ownerが実input/reference/source/scopeを事前固定する。管理側は数値処理を重複実装しない。

取得済み829原文のbytes/hashは [manifest.json](manifest.json) の `consumerBoundary.observedP4Candidate` に保持する。これはconsumer sourceの読取り結果で、元plain data／native契約／実行5537／source6／数値receiptを変更するものではない。

## 既存ACKと今回の受領確認

管理配布 `60d16b64d6020d3d20239f087f8add91268dcaad` の [RECEIVER-ACK](https://github.com/Kushyameln01/kushyameln-works/blob/60d16b64d6020d3d20239f087f8add91268dcaad/development/ai-connection/codec-marker-adoption/RECEIVER-ACK.json) は実行checkpoint `0239c8117622bb388af0d7870b672e54a79beec3` でcodec2bd/d82の受領とE4保存読戻しを確認する。[MANIFEST-RECEIVER-ACK](https://github.com/Kushyameln01/kushyameln-works/blob/60d16b64d6020d3d20239f087f8add91268dcaad/development/ai-connection/codec-marker-adoption/MANIFEST-RECEIVER-ACK.json) はRect/Text manifest実bytes・Text gate/finalNormを受領済み。[採用結果](https://github.com/Kushyameln01/kushyameln-works/blob/60d16b64d6020d3d20239f087f8add91268dcaad/development/ai-connection/codec-marker-adoption/ADOPTED-RESULT.md) の実装checkpointは `830e58bbe1e9d783910cfc0a9c6bf8cf45071c58`。

これらは今回の新conditioning data、plain比較report、新配布sourceの受領ACKではない。相手が取得した完全SHA/path/実bytes/hashと、受領側自身のreceiptを新たに対応付ける。同host cloneや送付側のfetchを対向ACKにしない。元ACKの時刻・実行source・未受入scopeは保持する。
