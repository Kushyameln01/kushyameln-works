# 新consumerの受領とLoRA接続境界

2026-11-01。Diffusion PR14の `508d72cc9036e7f500827465c644b4aed3c5f711`、管理PR7の `60d16b64d6020d3d20239f087f8add91268dcaad` を固定して確認した。source/path/bytes/hashは [CONSUMER-CONTRACT-RECEIPT.json](CONSUMER-CONTRACT-RECEIPT.json)。これはsource受領の記録であり、実LoRAを新tailへ適用した記録ではない。

## 現在成立する接続

`createBerniniBlockProvider → createDiagnosticConsumer → createDiffusionDiagnosticAdapter` が、Q先頭16行とbias16の実ORT/Hike診断へ接続する。mapping正本はLoRAの `createDiffusionDiagnosticAdapter`。管理にはこのmappingを複製しない。

Q16 consumer/base-block/diagnostic-base/ORT stageはDiffusion5f、a49、beff、508でbyte exactに一致する。この旧実consumerを維持できることと、新N2 tailへLoRAを適用できることは別である。新規の真正base試験は管理の正式DATA bridgeからこのQ16経路へ接続し、実行source・原本・範囲・数値参照を別途記録する。

## 新tailの原文で確認した制約

| 項目 | 固定N2 tail |
| --- | --- |
| profile | `bernini-block0-n2-self-attention-residual-f32-v1` |
| factory | `createSelfAttentionTail({file,side,trustedInputs,bridgeBytes,mathBytes})` |
| 公開method | describe / run / stats / dispose / recover |
| 元重み | O、time projection chunk2、bias、modulationの固定5keyを内部sourceから読む |
| 実演算 | 内部で復号した原本weightをdynamic Gemm sessionへ渡す |
| LoRAのprepared ingress | 公開されていない。外部provider/sink/candidate/feedを注入できない |
| 入力受入 | HIGH1/LOW3の固定attention・patchHidden・timeAct1のhashを照合 |
| LoRA接続状態 | `DEPENDENCY_WAITING` |

新tailにはQ16のsink begin/writeBlock/finish、prepareLoad/validate/commit/rollback/prepareBaseと同等のLoRA取引入口がない。registry/schema/profileも異なる。メソッド名だけを足したwrapperや、runtime入力名のinitializerへの詰め替えでは、実sessionへの適用を証明できない。

QKVへのLoRA適用でattentionが変わった場合も、既存の固定trusted hashへ付け替えない。新しいLoRA影響下の入力には、その生成元・profile・独立参照・数値gateを対応付けた受入が必要である。

## Diffusion側から必要な接続契約

1. pair/sideと実targetのregistry。原本key、full shape、選択領域、storage/compute dtype、実graph/feed/sessionのbindingを含む。
2. 不変base providerと、LoRAのprepared bytesを実linear sessionが採用するsink/candidate経路。上記取引と同等の版付きAPIでもよい。
3. validate・適用・解除・失敗復旧・取消と、session独立copyまたは受入済みleaseの寿命。強度変更は不変baseから再構築する。
4. LoRAで変化したactivationを検証できるprofile・独立参照・gate。旧固定診断入力のhashを流用しない。

これらを取得した対象から正本adapterへ対応を追加する。現段階では新tailのLoRA対象は依存待ちであり、[全2,904 patchの対応表](TARGET-CONSUMER-MATRIX.md)に理由を残す。未成立のtargetを黙って捨てず、全target/実graph consumerが成立するまでPARTIALを維持する。

依存の照合依頼は [Diffusion PR14](https://github.com/Kushyameln01/kushyameln-works/pull/14#issuecomment-6556133414)へ固定source付きで掲載した。コメントの掲載と対向担当による新consumerの提供・採用ACKは別である。LoRAへmean入出力APIを追加せず、二組同時合成・全model/session・生成・merge・Pages公開を今回へ追加しない。
