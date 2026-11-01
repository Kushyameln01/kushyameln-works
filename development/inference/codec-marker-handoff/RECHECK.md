# 2026-11-01 JST 再照合

同じ3要件の再依頼に対し、共有codecの既存修正を維持し、利用側の固定sourceとの差を確認した。export、NN、Text全層再推論、Rectの数値正規化・復元、既存profile棚卸しは繰り返していない。既存のasset・実Chromium configure・数値受入は元scopeのまま再利用する。

## 修正版と未採用経路

共有codec修正はPR #13の既存source `2bdca59ea78580d4fe7a9d31a8de33209b64d029`、module SHA-256 `d82b8aaf00be2379c073205aabf82eceaea558a5d10e6f202365bc4a295f26e5`。供給された有効markerをhash前にsnapshotし、保存・読戻しで保持する。今回codecの再変更は不要だった。

| 対象 | 固定source | 今回の確認 |
| --- | --- | --- |
| 修正前main | `029ce9336a61e53bc6172fa4a7b7189b15f2efa0` | 合成128値のmarker欠落を再現 |
| 修正版PR #13 | `d8a19f684f75fdf2f772d64754cba9d08b8f5c82` | marker保持6テストPASS、同じ合成128値を変更せず保持 |
| 最新管理PR #7 | `0260fc0b153c2491cc94aca3d75c7835a03bf0f7` | E4 coreは既存検証sourceと同じbytes。保存helperの旧codec pinは未変更 |
| Diffusion PR #6 | `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3` | source変更なし。数値責任をVAE側へ移していない |

PR #13は確認時点でopen Draft・未マージ。mainは旧codecのままである。この再現は、ユーザーが確認した実ファイルの生成元を特定したことまでは意味しない。

main codecはSHA-256 `a3fdfc1654361713a5e8278e6af5d76a65aafed7f654c06813eebb933f7a0f4c`。GitHub取得のGit blob `b14716a91279eb7afacf2d680d4ae7d6da31359c`とローカルの固定Git objectを照合した。[合成再現receipt](evidence/recheck-main-vs-fixed.json)はmainと修正版を分けて記録する。markerのない過去fileへ正規化状態を推測で補っていない。

## E4と互換性の再確認

新codecの6テストを再実行した。旧G1C markerなしfileのbytes維持、旧readerで新markerを読めること、旧writer再保存でmarkerが欠落する制限、不正marker拒否を含めてPASS。

[E4再実行receipt](evidence/recheck-e4-results.json)は、固定管理`edda43f9ea69c5b3ab1af3c6eb82295f2912887c`の実capture/packageを使用した。既存Diffusionの録済Rect normalized128値を再計算せず保存・回収し、全128値・marker・model/context・sidecarが一致した。出力8filesの内容hashは[既存package](evidence/e4-run/normalized-package/manifest.json)と同じ。旧registryだけなら`NATIVE_CODEC_UNVERIFIED`、旧writerとmarker付きsidecarの不一致は`NATIVE_METADATA_MISMATCH`・書込み0。store残留0、Worker/NN session0。

最新管理0260の[5module照合](evidence/recheck-manager-core.json)は、GitHub connectorから本文を取得し、Git blob・bytes・SHA-256を照合した。5件とも旧eddaのE4固定sourceとbyte exactで同じ。これはsource比較であり、旧eddaの実行receiptを0260での実行へ付け替えたものではない。

管理側は、旧raw経路・旧pin helper・過去receiptを維持し、normalized中間保存用candidateへ新codec sourceRefと実module SHAを明示登録する必要がある。新bindingのmanifestとregistryは同じsourceRefを使う。[E4-SOURCES.json](E4-SOURCES.json)と[test-manager-e4.mjs](test-manager-e4.mjs)が動作確認済みの具体例。decoderのhash検証を飛ばしたり、旧sourceRefへ新codecを偽装したり、normalized meanをrawへ改名して既存raw専用経路を通したりしない。管理packageの実装責任は管理側に残す。

最新0260での具体的な採用境界は次のとおり。

- [rect-management-runner.mjs:96](https://github.com/Kushyameln01/kushyameln-works/blob/0260fc0b153c2491cc94aca3d75c7835a03bf0f7/tools/ai-connection/rect-management-runner.mjs#L96)のregistryと同101行のmanifest.codecは、現在VAE855由来の旧sourceRefを使用する。normalized candidateでは、実SHA検査済みの新codecを取得し、新しい同一sourceRefを両方へ登録する。
- 同47行の旧hash、155–159行のmarker欠落負例、[run-norm-required-rect.mjs:23](https://github.com/Kushyameln01/kushyameln-works/blob/0260fc0b153c2491cc94aca3d75c7835a03bf0f7/tools/ai-connection/run-norm-required-rect.mjs#L23)の既存raw用pinを一括置換しない。
- [norm-required-rect.mjs:17](https://github.com/Kushyameln01/kushyameln-works/blob/0260fc0b153c2491cc94aca3d75c7835a03bf0f7/docs/shared/ai-connection/adapters/norm-required-rect.mjs#L17)はraw meanのdecode専用入口である。そのnormalization拒否を緩めず、新しいnormalized中間保存の受入と区別する。
- E4 coreのcodec選択・native metadata一致検査を維持する。数値の正規化・復元はDiffusion側が所有する。

## 既存Rect・Textの引渡し範囲

[INPUTS.md](INPUTS.md)と[INPUTS.json](INPUTS.json)のmanifest原本・Mapキー・期待hash・ローカルFile入力方法を再利用する。Rectは`wan21-raw-f32-1x16x32`、RGB`[1,3,1,16,32]`、latent`[1,16,1,2,4]`。manifest SHAは`450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a`。VAE環境の4asset streamhash照合と、同hostの実管理source→実Chromium configureのreceiptは別に保持したまま。

Text選択manifest SHAは`aeb7986de538fb4a55c94ae55ea4d132d3a35b4b561d7a32cc2a3b6aedee133f`。numericGateは`maxAbsError=.001 / rtol=.001 / registeredBeforeComparison=true`、元scope原文と`finalNorm.epsilon=1e-6`を保持する。plain`[1,512,4096]`とID`[1,L,4096]`の区別、Tokenizer/model識別も変更していない。plain固有の独立全値比較は別残件。選択manifest/gateは取得済みなので、別profileのgateで補完したり全数再推論したりしない。

管理ownerの最新0260にある[受領・実行recordの抽出](evidence/recheck-manager-input-status.json)も確認した。Rect manifest450e…と元raw inputの受領・照合は記録されている。一方、公開preflightは`assetReceipts:[]`、decoder-body.onnx/conv2-weight.f32/conv2-bias.f32の3asset計286,314,451 bytesをmissingとしている。管理側がそのdecodeを行った証拠にはならず、nativeCalls0/browserLaunched:false/modelInference:falseを維持する。Worker smokeは初期化とcloseだけで、configure/job/NNは0。encoder assetの受領はこのdecode専用recordから判断しない。

選択Text manifestのaeb7986…は管理のSOURCE-RECEIPTへ記録されていなかった。これは公開されたrecordで受取を確認できないという結果であり、非公開進捗の不存在を断定しない。Page返信の有無だけで判断せず、owner側の実receiptと区別して照合した。管理側の新codec candidate採用と、実asset/選択Text manifest受取の確認は引き続き残る。

元の[RESULT.md](RESULT.md)・[REPRODUCE.md](REPRODUCE.md)の受入scopeは維持する。新codecの管理側candidate採用、別管理環境での対象asset受取・利用、Text plain独立全値、実generated sampleの受入を、この再照合の結果で完成扱いにしない。
