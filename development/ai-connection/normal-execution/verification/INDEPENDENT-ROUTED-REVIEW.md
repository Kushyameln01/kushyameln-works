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
