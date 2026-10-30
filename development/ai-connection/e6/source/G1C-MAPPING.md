# G1C native APIから共通記述子への無損失mapping

文書revision: `g1c-mapping-1`。2026-10-31 JST。対象sourceは [G1C `6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095`](https://github.com/Kushyameln01/kushyameln-works/tree/6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095)。そのText/VAE native契約・codecは原 `502b243d092b84979b10b1624df60612047d640a` から変更していない。native API版は `works-ai-1`、native保存は `WKTSR001` / schemaVersion `1` を維持する。

本書は、取得した次の原文に対するText/VAE所有者の公開mappingである。参照文書内の「文書作成のみ」という当時の状態は、今回ユーザーが指定したmapping作成とV1個別profile工程の許可を変更しない。

| 参照原文 | 版・原本SHA-256 | 適用箇所 |
| --- | --- | --- |
| 添付「Kushyameln Works AI推論モジュール 総合接続仕様書 Draft.md」 | `1.1-draft.1` / `0744a98219c6ddab4880773029e6318de3e770c8e14e1bb2edbb1bf25c1c3944` | 第4・6・10・13・15・18・19・20節。共通規格 `works-module-contract/1.0-draft.1` とnative版を分離 |
| 添付「Kushyameln Works AI推論モジュール 実装計画 Draft.md」 | `0.1-draft.1` / `770d1cdc26c07548cbe12b33cba93d3f22ab3b565ff58b0ba978f3983ff9c64d` | A0の正本対応、M1/M3向けmapping提供、M5のcodec境界、V1/V2の受入範囲 |

共通記述子の厳密schema・semantic registry・adapter・queue・保存package実装は管理担当のM1〜M5である。本書はそれらを実装せず、共通規格の採用・native→共通→native往復の実行合格とも報告しない。既存12接続fixtureと旧mean経路を作り直さない。V1の新profile export/実WASM結果は別のprofile成果であり、本書のmappingを根拠に受入済みprofileを増やさない。

## 1. mappingの単位と独立性

1回のnative要求・結果を一つのinvocation記録に結び、native tensorの各payloadと、元応答全体のmetadata/evidenceを所有コピーまたは寿命を保証した参照で保持する。native記録を正本とし、共通descriptorはその上への投影とする。projectionからnativeを再構成するときも、元のdtype/shape/meaning/配列/識別/任意fieldの有無を戻す。管理用に選んだ表示名・role・space分類からnativeの意味を推測しない。

Text/VAEは従来のfactory、`createInferenceAPI()`、同一origin ES module、明示MessagePortで単独利用できる。管理内部型やDiffusion/LoRAのimport・executorを必須にしない。`works-module-contract/1.0-draft.1` や保存規格をnativeの `apiVersion` へ送らない。ModuleDescriptorを提供する場合も、外部mapping記述で足り、新しいnative `describe()` は必要ない。

以下の共通pathは総合仕様の `ArtifactDescriptorDraft` に対する対応位置である。`artifactId`、`schemaId`、semanticの `spaceId`、role、identityKind、namespace等の登録値は本書で新設しない。M1で採用した規格entryへ結び付くまでは、その必須規格の解釈を `UNVERIFIED` とし、似た名前のnative関数へdispatchしない。

## 2. native要求と返却値

| native経路 | 入力制約 | 返却値と保持する情報 |
| --- | --- | --- |
| `textEncoder.encode({text})` | string、空文可。textとID/maskの混在を拒否。元SentencePiece、BOSなし、EOS1、PAD0、EOS込み512以内。超過を無断切詰めしない | `{tensor, attentionMask, evidence}`。tensorはfloat32 BLC **`[1,512,4096]`** / `text_hidden_states`、mask `[512]`、元model/Tokenizer hash。`evidence.inputMode='plain-text'` |
| `textEncoder.encode({tokenIds,attentionMask})` | `1<=L<=512`、IDは整数0..256383、同長0/1maskで少なくとも1つ有効。EOS/PADの自動追加なし | float32 BLC **`[1,L,4096]`**。内部mask位置・返却L・無効行の0を保持。top-levelとtensor内のmaskは同じ内容。`evidence.inputMode='token-ids'` |
| `vae.encode(rgbTensor)` | float32 NCTHW、configureしたprofileと厳密一致。`rgb-unit` は[0,1]、`raw-decoder-rgb` は[-1,1] | `{tensor,evidence}`、`raw-posterior-mean`、VAE model hash、任意contextの所有コピー。乱数posterior sampleは生成しない |
| `vae.decode(mean)` | `raw-posterior-mean`、profile一致。明示model hashは対象VAEと一致。旧契約のhash省略は維持 | `raw-decoder-rgb`、VAE model hash、任意context、evidence。clamp・画像色変換なし。hash省略を互換性の確認済みへ昇格させない |
| `vae.decode(sample)` | `wan21-raw-generated-sample:v1` と下記latentContract、有限float32 NCTHW、profile一致 | raw RGB tensorには実際に出力したVAE hash。元sampleのproducer/latentContractは応答evidenceと入力artifactの対応で保持。実生成結合はV2未受入 |

元UMT5 SHA-256は `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68`、Tokenizerは `e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458`。直接IDに返すTokenizer識別はモデルに対応する期待値であり、任意ID列の出所証明ではない。

Berniniの実system prompt・negative選択・正負区分は管理側が保持し、Text側は渡された文字列を処理する。ComfyUI prompt重み、custom/textual embedding、clip-skip、pooled output等は未対応。通常textの出力を元conditioning全体の再現と扱わない。

## 3. tensor・provenanceの対応表

| nativeの正本field | 共通descriptorでの投影 | 無損失条件 |
| --- | --- | --- |
| `dtype` / `shape` / `layout` | `tensor.dtype/shape/axes` と `native.metadata` | shape配列とlayout文字列を原順のまま保存。BLCはbatch/token/hidden、NCTHWはbatch/channel/時間/height/width。RGBの時間Fとlatentの時間Tを混同しない。layout変更・transposeはこのmappingに含めない |
| `meaning` | `tensor.nativeMeaning`、登録済みsemanticに対する `semantics` | 元文字列を完全一致で保持。`wan21-raw-generated-sample:v1` や `wan21-normalized-posterior-mean:v1` の `:v1` を落とさない。管理分類 `normalized-generated` 等をnativeへ送らない |
| `data:TypedArray` | `native.payloadRef` / `tensor.dataRef` | 実bytes、dtype、byte範囲を保ち、巨大JSON数値配列へ変換しない。view外のbacking buffer bytesをpayloadへ加えない。copy/transfer後も対応元を追跡する |
| `attentionMask` | `native.metadata` と当該text portのmask参照 | `[L]`全位置・0/1値・任意fieldの有無を保持。内部0を詰めず、mask合計を返却Lにしない。top-level maskも元応答記録に残す |
| `modelSha256` | 役割・種類・scope付きの `provenance.producerRefs` と `native.metadata` | Text/VAE encode/RGBでは実producer識別。generated sampleの任意model hashは既存値を保つ。decoder hashで上書きせず、存在しなかったhashを補わない |
| `tokenizerSha256` | Tokenizer識別として独立したidentity参照と `native.metadata` | model/graph/build hashと混ぜない。旧tensorで未記載なら未記載を保持し、検証済みTokenizerへ補完しない |
| `latentContract.producerModelSha256s` | 全件を役割付き `provenance.producerRefs` へ、原配列を `native.metadata.latentContract` へ | 非空・重複なしの原列をそのまま保持。先頭一件へ縮約せず、sortしない。この配列順序だけからHIGH/LOWの実行順を推測しない |
| `latentContract.vaeModelSha256` | 復号先として `provenance.consumerBindings`、原値を `native.metadata.latentContract` へ | producerへ混ぜない。実configureしたVAE model hashと照合する。復号後RGBのproducerとしてのVAE識別とは別の役割 |
| `latentContract.normalization` | 登録済みsemanticの正規化状態と原 `native.metadata`、数値証拠はtrace参照 | `id/state/owner`を一つも落とさない。`restored`の宣言を数値復元証明に置き換えない |
| `context` | 原 `native.metadata.context`、下記 `lineage` | contextId・inputId・inputSha256・slotId・frame配列・任意時刻を保持。slot名を連番へ書き換えない |
| 応答 `evidence` / 応答envelope | 元応答全体の参照と外側evidenceファイル、必要な `transformTraceRefs` 等 | evidence全fieldを保持し、当該native要求・入力artifact・出力artifactと対応付ける。evidenceをtensor内の未知fieldへ埋めてcodec保存済みと扱わない |

identity参照に使うalgorithmは実値の方式を保持する。元modelのSHA-256、graph実bytesのSHA-256、build ID、Tokenizer hash、payload hash、nativeファイル全体hash、metadata canonical hashは異なるidentityである。`modelSha256` にgraph/build/header hashを付け替えない。単一producer fieldだけではgenerated sampleを表現できない。

## 4. contextと複数producerの復元条件

contextが存在するtensor一件から、`lineage.inputs` へ元inputを参照し、`lineage.sourceFrames` へ `{inputId,slotId,indices,timesSeconds?}` を対応付ける。`contextId` と `inputSha256` はnative metadataに必ず残し、共通側で追加のidentity参照を作る場合もそのscopeを区別する。元の `context` が無い場合はframe対応を推測して生成しない。管理側が別に持つ原本証拠とnative宣言値を区別する。

- `sourceFrameIndices` と任意 `sourceFrameTimesSeconds` は順序・重複・同数性を維持する。時刻は有限・非負の秒。未記載の時刻を0で埋めない。
- encodeにcontextがある場合はRGB入力Fとframe配列長が同じである。F=5→latent T=2でも元frame配列5件を保持し、T=2へ削減しない。decodeのlatent Tや出力Fとの同数条件を追加しない。
- 複数contextは複数artifactと、管理側のordered contextId列で保持する。欠番slotを含む実供給元、順序、正負conditioningへの同一context共有は管理側が所有する。本mappingではconcat/stack/RoPE/source_idを生成しない。
- `producerModelSha256s` の各model identityと、別の実行traceにあるHIGH/LOW順・LoRA・sigma・precisionを対応付ける。native列の保持は実行traceの代替ではない。

nativeに戻す場合、共通の単一frameIndexや単一producerを使って再構成せず、保持した原native metadataの配列・field有無を復元する。共通投影とnative metadataが矛盾したら片方を便宜的に上書きせず、当該adapterの整合違反としてそのedgeを止める。

## 5. generated sampleからRGBへの来歴

VAE consumerが受理するnative sampleは、次を全て満たす。

```javascript
meaning: 'wan21-raw-generated-sample:v1'
latentContract: {
  schemaVersion: 1,
  representation: 'generated-sample',
  space: 'raw',
  vaeModelSha256: /* 実decoderと一致するVAE SHA-256 */,
  producerModelSha256s: /* 実際に生成へ寄与した全model SHA-256の非空・重複なし列 */,
  normalization: {
    id: 'wan21-comfy-f32-v1', state: 'restored', owner: 'diffusion_models'
  }
}
```

任意 `modelSha256` がある場合はproducer列の一員で、decoder VAE hashをproducer列へ入れない。現在のVAE原本hashは `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`。raw meanへsampleを改名したり、normalized tensorをrawへrelabelして通したりしない。

復元の実計算はDiffusionが所有する。VAE decodeはraw sampleへ既存Hike conv2とORT decoderを適用し、追加のlatent正規化・復元をせず `evidence.normalizationApplied=false` を返す。このfalseはRGB `[0,1]`→`[-1,1]` のencode変換を否定する指標ではなく、latentのmean/std正規化を適用していないという契約である。

RGB tensorの `modelSha256` はVAEであり、sample側producerを書き換えたものではない。完全な生成結果を保存するには、少なくとも次の対応を外側packageへ保持する。

1. 入力sampleのnative tensor、全producer・decoder binding・normalization宣言・payload/nativeファイルhash。
2. Diffusion所有の復元前後tensor/hash・normalization ID・Hike/build・数値比較・一度だけの適用を追うtransform trace。
3. 当該VAE decode invocationの入力sample参照と、返却RGB tensor参照。
4. 応答evidence全体。現実装には `inputMeaning/inputModelSha256/latentContract/normalizationApplied/profileId/modelSha256/assetHashes`、実行条件・Hike寄与・計測が含まれる。任意 `inputModelSha256` がnullでも、latentContractの複数producerを失わない。
5. 元input/slot/frame対応、選択profile・manifest/graph識別、管理snapshotと各owner/trace参照。

**RGBの `.wktensor` だけではこの来歴は保存されない。** RGB tensorにはgenerated-sample用latentContractを混ぜず、入力sampleと応答evidenceを別のhash付き参照で結ぶ。`restored` metadataとfixtureだけでは実producer・数値復元・実decodeは未検証のままであり、U1/V2や生成受付を解除しない。

## 6. native保存のallowlistと外側package

G1C `encodeTensor()` が書き出すheaderは次の集合である。ここでいうallowlistはwriterが保存するfieldの集合であり、共通manager型をnativeへ追加する拡張口ではない。

| 保存位置 | 実際に保持するもの | 境界 |
| --- | --- | --- |
| `.wktensor`固定header | schemaVersion、dtype、shape、layout、meaning、byteOrder、byteLength、dataSha256 | native `WKTSR001`、little-endian binary payload。header上限65,536 B。通常JSON headerを共通JCS規格の実装とみなさない |
| `.wktensor`任意header | modelSha256、attentionMask、tokenizerSha256、context、latentContract | 各native検査を通した値と配列。raw/normalizedの意味を維持。top-levelの任意未知fieldをwriterが自動保存する保証はない |
| 元native応答・evidence側 | top-level attentionMask、evidence全体、error/envelopeと要求対応 | `.wktensor`外へ別記録。tensorに入れ直しただけでは保存されない |
| 管理descriptor/manifest/sidecar | artifact/module/profile/semantic/adapter版、graph/build、ownerとtransfer/lease、snapshot、ordered contexts、全trace、unknown optional extensions | M1/M3/M5が規格化・実装する領域。本mappingではJSON schema・JCS実装・package APIを新設しない |

`context` の許可keyは `schemaVersion/contextId/inputId/inputSha256/slotId/sourceFrameIndices/sourceFrameTimesSeconds`。`latentContract` は `schemaVersion/representation/space/vaeModelSha256/producerModelSha256s/normalization`、そのnormalizationは `id/state/owner` だけである。`snapshotId`、`ownerId`、`graphHash`、`buildId`、管理role、任意extensionをこれらのstrict objectへ入れるとnative検査で拒否される。外側extensionsを使い、名前空間・schema版・requiredForUseは管理側で宣言する。

未知optional metadata/extensionは元native応答の所有snapshotまたは元bytesと外側記録に不透明のまま残す。nativeへdispatchする値はそのnative版の正しいfield集合で作り、未知fieldを勝手に意味付けしない。必須の意味解釈が不明なら `UNVERIFIED` として依存edgeのみ止める。strictなnative内部objectに未知keyを入れた場合の拒否を、optional拡張の保存方法として緩めない。

M5ではpayloadの `dataSha256` に加え、**nativeファイル全体hash** とdescriptor/evidence/trace/snapshot/extensionsの各bytes/hashを結ぶ必要がある。payload hashだけではheader改変を検知できず、`.wktensor`一件で全情報の保存完了とはしない。共通JCS/SHA-256と `works-artifact-package/1.0-draft.1` の実装・読戻しはU7/U8の別受入である。legacyで未記載の情報は不足として保持し、架空hash・推定frame・生成済みevidenceを補わない。

## 7. 所有権・要求・取消のmapping境界

同一originのdirect結果はcaller所有、Text/VAEのMessagePort結果tensor/maskはtransfer後receiver所有で、送信元viewは失効する。Worker入力はclone、Worker結果はtransferであり、異なるWASM Memoryのpointer共有を保証しない。正負fan-outや保存のため結果を再利用する場合は、移譲前の所有copyまたは明示した不変artifact参照を外側で保持する。

native MessagePortは `apiVersion:'works-ai-1', id, module, method, args`、応答は `apiVersion,id,ok,result` または `error`。管理invocation、module/native要求ID、executor/ownerの対応は外側に保持する。native error文字列をそのまま残し、管理上のreason codeと混ぜない。

native moduleの `cancel()` はjob IDを引数に持たない。管理側は遅い旧cancelを新jobへ送らない対象照合・取消終端barrierをM4で実装する。Text/VAEの共有executorとDiffusionのexecutorの横断queue、profileごとの資源readinessは管理側である。本書はnative cancelを新wireへ改変せず、M4を実装済みとも扱わない。`unbind()`、計算取消、`dispose()` は別の操作である。

## 8. 成立済み範囲と次の受入

| 範囲 | 本書の状態 |
| --- | --- |
| G1C native契約と共通案の対応 | sourceと添付原文を照合し、本mappingを提示。native code・kernel・codec・既存fixtureは変更しない |
| 既存接続12fixture、Tokenizer6件、過去実Text24層/VAE小profile | それぞれ既存のscopeを維持。本mapping作成で再実行・合算・別profileへの流用をしていない |
| 全体Python | 502の52/53と6432de5側の53/53は既存別履歴として維持。本mapping工程では再実行していない |
| native→共通→native実往復、未知拡張、完全保存 | M1/M3/M5の実装とfixture/実ブラウザ受入待ち。本書のみでC11〜C13やU8/U9を完了にしない |
| V1の新profile | 既存PROFILESの順序を引き継ぐ。個別export・FP32比較・実WASMの別成果を参照し、ここでは受入を宣言しない |
| 実generated sample復元→decode | Diffusion実producerとtrace、V1の対象decode、M5の保存に依存するV2。U1未解消 |

管理側へ渡す確認事項は、(1)登録済みsemantic/identity規格への正確な対応、(2)元native応答と投影の不一致拒否、(3)配列・field有無・evidenceの往復、(4)RGBと入力sampleのpackage参照、(5)旧cancel対象と所有権、である。profile・実モデル・全生成・負荷改善の受入は各担当の別工程として残す。

## source参照

- [G1C API](https://github.com/Kushyameln01/kushyameln-works/blob/6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095/docs/shared/inference/API.md)、[Text API](https://github.com/Kushyameln01/kushyameln-works/blob/6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095/docs/shared/inference/text-encoder-api.mjs)、[Tokenizer](https://github.com/Kushyameln01/kushyameln-works/blob/6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095/docs/shared/inference/tokenizer.mjs)。
- [native codec](https://github.com/Kushyameln01/kushyameln-works/blob/6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095/docs/shared/inference/tensor.mjs)、[VAE validator/runtime](https://github.com/Kushyameln01/kushyameln-works/blob/6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095/docs/shared/inference/vae.mjs)、[Worker応答](https://github.com/Kushyameln01/kushyameln-works/blob/6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095/docs/shared/inference/inference-worker.mjs)。
- 既存の必要profileは[PROFILES.md](PROFILES.md)、原成果は[RESULT.md](RESULT.md)、取得可能な原本と履歴の対応は[RECONCILIATION.md](RECONCILIATION.md)を参照する。
