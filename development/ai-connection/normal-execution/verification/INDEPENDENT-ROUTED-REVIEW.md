# VAE / P4通常接続の独立レビュー

2026-11-02 JST。**コード境界はPROCEED。新VAE/P4の実共同受入はPENDING_PRIVATE_ASSETS。** 固定sourceを使うholding環境での実行へ進める。旧mean通常実行・診断4667と取消f1の受入は[前回レビュー](INDEPENDENT-REVIEW.md)のsource/scopeを維持し、新しい接続コードの実NN証拠には付け替えない。

## 確認したsource

受検runtimeは次のSHA-256。VAEは配布`498eb25f027666e3cc661a5851288e4aabf39f0a`、P4は実行`30e283bb115741af6b475e9bdc41700a4e564053`／配布`5278069ee0b72a9f2d684cdc8075e460187a7acf`の実契約を使用する。新APIの存在と、管理側での実共同受入を分けている。

| path | SHA-256 |
| --- | --- |
| `adapters/normal-operation.mjs` | `73a43d984bceaf9e96c2a851905aa3cdae34024c28f699782d7c8fe61886df76` |
| `adapters/normal-vae-owner.mjs` | `cde51652e4ec7a93898bfedf0dae623428ec445507956c5eec66c5886d33cbbd` |
| `adapters/normal-p4-owner.mjs` | `4dadff8c9cb5bc52da4acc031c70b984be0b9e34accbec25ed277dd24a93d77f` |
| `tools/ai-connection/run-normal-holding.mjs` | `bee6e5f00b3ff075f1e3039f0821223c2eb12ee612d9b6d4057eb51067ff66d4` |
| `tools/ai-connection/normal-holding-browser.mjs` | `d16da25668aeaa6824170bf8d7cdfd79168f5e7c9a840172e3df71f97becf641` |

adapterのpath prefixは`docs/shared/ai-connection/`。VAE・named host/P4・holding runnerのfreezeにある10file全てをbyte/hash照合した。routerとその試験も直接読んだ。

## 境界の判定

- shared RGB/latent要求を、明示したoperation・意味・model/decoder/contextとともに実VAE能力照会へ渡す。unknown/absentではfactoryやownerを呼ばず、独立した既知要求は進める。ownerの応答・理由を保持し、共通判定は既存evaluateEdgeを使う。
- VAEの`MISSING_ASSET`等を形状非対応へ言い換えない。configured契約と`runtime.verified`を分離し、再configureで支持・旧runtime観測を失効する。結果は元inputDescriptor、操作、全input/output shape、asset hashes、実runtime bindingに束縛し、RGBと入力来歴を外側の通常結果に併存させる。snapshot等をstrict native contextへ追加しない。
- P4は実`checkExecutionSupport`へ委任し、metadata拒否時にmodel/ORT factoryを作らない。residual・timeAct1・conditioningをそれぞれ所有して3つのedge/inputBindingsに束縛し、一つのqueue取引からstrict native runへ渡す。数値参照・gate・事前PASS・診断callbackは要求しない。native Profile未prepare時の外側bindingを、native実Profileとして偽装しない。
- 取消は元処理の終端を待ち、古いtargetを新処理へ送らない。VAEは固定clientがWorker終了後にPromiseをsettleする実装を利用する。P4はnative dispose後のORT session／read leaseを確認し、解放失敗では成功を返さずquarantine/recoverへ進む。P4のmain-realm資源解放をWorker数から推定しない。
- holding runnerは内部bootstrapでVAE16file／P4 114fileと選択codecの実Git bytesを照合する。私有assetはlocal stat後にFileとして渡し、通常callerにsource/build/kernel証跡を要求しない。execute/cancelはasset不足時に入力payload・browser・native dispatchより前で停止し、metadata queryはownerの理由を確認できる。fresh出力先も実行前に確保する。
- 新498 codecはこの入口だけで選択し、Text markerとmaskを保持する。`umt5-final-rmsnorm-f32-v1`をP4の`encoder-final-rmsnorm`へ改名せず、実ownerの`UNSUPPORTED_NORMALIZATION`を返す。旧採用codecやnative pinを一括置換していない。

監査側で関連試験をfresh実行し**61/61 PASS、FAIL/CANCEL/SKIP0**。実native metadata validatorと制御transport／factory境界の試験であり、新graph/modelのNN・数値比較・実Workerは実行していない。主担当の[全体620/620、FAIL/SKIP0](ROUTED-ROOT-SUITE.log)を直接読み、[実行中不変の171file](ROUTED-SUITE-SOURCE-RECEIPT.json)を現bytesと独立照合した。APIの既存83,206B prefixも不変。全体回帰自体を監査側が再実行したものではない。

## 実行待ちの範囲

local missing-assets記録は`BLOCKED/LOCAL_ASSETS_MISSING`、入力payload読取0、native0、browser未起動、`diagnosticState:NOT_REQUESTED`。新VAE encode/decode・取消とP4の実管理接続が成功した証拠ではない。[holding手順](../HOLDING-REPRODUCE.md)を既存資産のある環境へ渡し、固定管理commitと実receiptで別途共同受入する。

canonical LoRA normal route、Text/P4 marker契約の整合、私有graph/conv2/model/実入力が必要な実行、元81frame workflow・任意shape・全工程RAM予算は未受入。論理input許容量とhost/ORT/global peakを区別し、未測定peakはnull、`generationReady:false`を維持する。今回のPROCEEDはコード境界とholding実行への移行についての判定である。

## 任意の事後診断の追加確認

別CLI `diagnose-normal-holding.mjs`（最終11,576B、SHA-256 `abb52e55811b680bcb73a68ab970a7d0d7c975deaaaa52ff8d8c5e758dc94ba3`）も**source PROCEED**。監査側で最終14件をfresh実行し14/14 PASS、診断source/test/手順のfreezeと通常runner3file不変をhash照合した。保存normal出力のwhole/payload/shapeと、全inputのpayload・whole-file SHA mapを先に確認する。後者はnormal.inputReceiptsと完全に同じkeyを必須とし、同じF32でもWKTのmask等が異なれば参照IO前に拒否する。その後に既存reference/gateのwhole SHAとfield pointerを検査し、固定7ee比較関数・498codecを使用する。nativeの再実行・Worker・新oracle・通常result変更はなく、数値診断の失敗は通常操作の完了状態と分けて記録する。

手順の855 `png-roundtrip.f32`／`reference-report.json`は実Git bytesのhashとも一致する。これは元PNGのFP32 encode→decode基準であり、今回選ぶrestored mean payload `71e89e…` を直接decodeした新独立oracleではない。input mapは通常入力の選択bindingを確認し、既存P2 pipeline基準を再利用する診断のscopeを広げない。raw F32/JSONの外部metadata宣言まではwhole-file hashで認証されず、呼出元宣言のまま残る。新VAE/P4の通常完了receiptがまだないため、この追加CLIによる新共同数値受入も未取得。最終手順hashは`23c65fe572f12f54b4cc4e221396dc93dc3a2ca3c769a394becbdd64fbc18ab9`。

## a543829での実receipt確認

固定管理source `a54382935423186dd3121d61a8b886b58cb08612` のraw receiptを直接確認した。mean経路は変更後のhostで実再実行した結果として受入可能。新VAE/P4は実ownerのmetadata照会と非dispatchを確認できたが、実NN共同受入は引き続きPENDING_PRIVATE_ASSETS。

| 実行 | receipt SHA-256 | 確認範囲 |
| --- | --- | --- |
| mean-normal | `8b1fa580b4e8db1ffff36ab2c648e70ea756819cbe9812f80b8ac550ee6c3486` | native5fで通常2操作、各Hike calls1、元終端・解放・採用、Worker2終了/live0 |
| mean-diagnostic | `ffa1fbe2c904399673558dd84eee419f411ca35384d0168cac41f8a4fd296154` | native0、独立stage bits一致、既存roundtrip gate内。上記新holding診断CLIの実行とは別 |
| mean-cancel | `b230afe1260c46eb594448ee0e8060a60191e0739097d9fef3bb06996215c7b1` | 2要求dispatch、A取消/元終端/解放、実B中の旧A拒否、B完了、Worker2終了/live0 |
| vae-query | `e241a8ed3f5dd98dac6740a3365db277e1a069bfaaba44dbcf36b093dabe0afa` | 既知RGB/meanはownerのMISSING_ASSET、target81はDESCRIPTOR_UNSUPPORTED、native/Worker0 |
| vae-missing | `a6da4c56795c5f9c415b8dd40521a52b4057437d8bfb0faf08c9bd60b90d04b6` | LOCAL_ASSETS_MISSING、入力payload読取0、browser未起動/native0 |
| p4-l512-query | `1861ec74a9346ac1aef1287804dde237cfed187176e1f020defd7ec896fe7590` | 実native支持true、3edge COMPATIBLE、File不足でRESOURCE_NOT_READY／dispatch不可 |
| p4-l512-marker | `b6a6c00747c0f4e5ad48498bbfcb29b04d1225fe406a99906fb1a202cf340887` | 新Text markerを保持し、ownerのUNSUPPORTED_NORMALIZATIONで非dispatch |

source proofを持つ通常/照会記録のnative53/16/114fileと管理17/21fileを実Git bytesへ再照合し一致。実mean WKT3fileのwhole/payload hashと各128値のshapeも照合した。通常networkに参照/gate取得はなく、mean診断だけ既存比較を別実行している。VAE不足の早期returnには管理source proofが埋め込まれないため、その実行sourceは外部PROCESS-LEDGERの固定command記録と区別する。

P4のL512は具体shapeを明示した新しいmetadata宣言であり、実conditioning payloadを受領・実行した証拠ではない。最初のnull wildcard付きP4宣言がUNSUPPORTED_SHAPEとなった負例も保持されており、後の具体宣言へ付け替えていない。metadata照会は全て入力receipt空・native/Worker0で、P4のmodel/ORT factoryも未作成。old4667/f1証拠も変更せず、今回の新source/new runと区別している。
