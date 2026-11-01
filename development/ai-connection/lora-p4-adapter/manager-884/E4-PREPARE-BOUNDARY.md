# E4 reader拒否とnative prepare境界の区別

2026-11-02 JST。管理884の追加条件について、実行済みの負例と、その証拠で成立していない境界を明確にする追補。既存[RESULT](RESULT.md)・[RESULT.json](RESULT.json)・実行receiptは変更しない。再推論、再export、追加sentinel試験も行わない。

## 固定した実行と同package

実行sourceは管理 `8849891f19124df31847bd691503c2491278eaa8`、公開保存証拠の固定配布は `a80db72feea60b9bd69e292e4716665c6f0ee77f`。LoRA native `fc2789a0f649e33f15eb13750e6a983b5c52d170`、Diffusion native `5f880fd8eef9e63054bdbf772bc9a525ef3a3bf3`、DATA `82b21f09cb63926543181b16f0e97ebc6b9fa6be`、codec `2bdca59ea78580d4fe7a9d31a8de33209b64d029` を使用した。

対象E4 packageは、今回の `initial-one` の実16出力から新規保存し、実diskから読戻した同packageである。

- manifest: 2,124 bytes、SHA-256 `6d12468c1ca1348f01f74e023ed09942ea622f25930c03a6fa0ee04d9bd18979`
- 出力payload SHA-256: `04f51332b6934ad9a8658f9b52a6aa7000733b7f4ad1d453c8c68bdcabdb3575`
- 実snapshot hash: `70052e13634e2218092ed167ac41800bf8a1c9ee77726b53592d9fc9870ae108`

各fileのbytes/hash/readback記録は[artifact/package manifest](evidence/artifact-package-manifest.json)、完全metadataは[実行archive](evidence/run-result.json.gz)を参照。元packageを保存し直したり、別の合成packageへ置換して負例を通したりしていない。

## 成立した負例と成立していない境界

| 対象 | 実行した処理・拒否 | 確認できた範囲 | 未実証の範囲 |
| --- | --- | --- | --- |
| expected改変 | `wrong-reference` がexpected copy先頭へ+1。`NORM_REFERENCE_PAYLOAD_MISMATCH` で拒否 | 正式DATA bridge/owner入口がnative prepare前に拒否。当該queue invocationなし、直前feed保持、後続 `validation-recovery` 公開成功 | 他のexpected改変や別profileへの一般化 |
| 同E4 packageの改変 | readerが読む `.wktensor` bytesの末尾を反転し、`readArtifactPackage` が `ASSET_HASH_MISMATCH` で拒否 | 保存済み同packageの完全性検査によるE4 reader拒否 | 正式な再import→native prepare入口を通した拒否、当該負例専用のprepare counter前後観測 |
| 同E4 packageのsnapshot欠落 | readerが `snapshot.json` だけnullを返し、`REQUIRED_ASSET_MISSING` で拒否 | 必須sidecar欠落によるE4 reader拒否 | 正式な再import→native prepare入口を通した拒否、当該負例専用のprepare counter前後観測 |

改変・欠落のreader負例は `initial-one` の実native適用・snapshot公開・保存後に実行されている。したがって、これを今回run全体の最初のnative prepareより前に行った試験とは呼べない。readerの負例処理自体はnative prepareを呼ばないが、固定runnerはこの二つの読戻しを新たなnative prepareへのdispatch入口へ接続していない。

最終の `nativePrepareCount=7` / `nativeTransactionCount=7` は、6公開＋checkpoint取消1のrun全体の観測である。base復帰1と初期baselineは別。これらの全体counterから、二つのE4負例それぞれの「正式再import入口でprepare前拒否」を実測したことにはしない。

根拠は固定[runner browser本文](https://github.com/Kushyameln01/kushyameln-works/blob/8849891f19124df31847bd691503c2491278eaa8/tools/ai-connection/managed-lora-data-real-browser-cases.mjs)、[package reader](https://github.com/Kushyameln01/kushyameln-works/blob/8849891f19124df31847bd691503c2491278eaa8/docs/shared/ai-connection/package.mjs)、[診断package builder](https://github.com/Kushyameln01/kushyameln-works/blob/8849891f19124df31847bd691503c2491278eaa8/docs/shared/ai-connection/diagnostic-package.mjs)と、[公開receipt](evidence/receipt.json)の `savedPackage`・`lifecycle`・counterにある。

## output16 packageと適用packageを混同しない

このE4 artifactはfloat32 `[1,16]`、meaning `works:diagnostic-q-projection:v1` の**診断出力**。LoRAの選択weight/bias prepared packageではない。nativeの `packageHash`、E4のmanifest hash、管理snapshot hashも別の識別子である。

管理884のbuilder自身は実File・real base・full model・E5適用の成立を証明せず、保存local-inputは `reselectRequired:true` / `originalFileEmbedded:false` としている。再読込completeや診断snapshot側のmetadataが揃った事実だけで、元のFile capability、native prepared handle、active sessionまたは新しい管理snapshotが再成立したことにしない。selected-weight `N-ARTIFACT` の保存・再適用受入も今回成立していない。

## 管理5aaの正本確認と条件の読み分け

管理PR #7の取得時HEAD `5aa5a806f84a875c542b2922fe80ef6faafc7915` について、[RETURN-ADMISSION.jsonの正本](https://github.com/Kushyameln01/kushyameln-works/blob/5aa5a806f84a875c542b2922fe80ef6faafc7915/development/ai-connection/p23-joint-acceptance/owner-return/RETURN-ADMISSION.json)の本文を取得した。正しいprefixは `development/ai-connection/p23-joint-acceptance/owner-return/`。

| 取得対象 | 確認値 |
| --- | --- |
| 文書schema | `works-owner-return-admission/0.1-draft.1` |
| 配布commit | `5aa5a806f84a875c542b2922fe80ef6faafc7915` |
| 完全path | `development/ai-connection/p23-joint-acceptance/owner-return/RETURN-ADMISSION.json` |
| UTF-8 bytes / SHA-256 | 11,009 / `b4e14f7c1fccb750394e16ca17ca2a9174d19a96eb56292e06dd6359875de714` |
| Git blob SHA-1 | `3a424781170897e3015d2a6d394650dfe1bf3cb3` |

[管理884→5aaの固定差分](https://github.com/Kushyameln01/kushyameln-works/compare/8849891f19124df31847bd691503c2491278eaa8...5aa5a806f84a875c542b2922fe80ef6faafc7915)は41ファイルで、全てdevelopment配下の証拠・受領照合（検証scriptを含む）。40件はp23配下、1件は `development/ai-connection/reference-adoption/CANDIDATES.json` の `latestOwnerReturn` メタデータ追補だった。`docs/shared` のruntime/APIと `tools` runnerの変更はなく、正式再import→native prepare入口も追加されていない。関連MANAGEMENT-HANDOFF/RESULT/REPRODUCE本文も、既存成果の受領・照合とruntime未変更を明示している。

同RETURN-ADMISSIONの `p3.updated884.conditionsRemaining` は、次を別項目として列挙する。

1. `initial-one actual output16 E4 save and fresh disk readback`。
2. `E4 tamper and missing snapshot refusal`：要求文は「Returned actual readback rejects mutated .wktensor with ASSET_HASH_MISMATCH and absent snapshot.json with REQUIRED_ASSET_MISSING」。readerの拒否を要求し、この項目にnative prepare前という条件は書かれていない。
3. `pre-native reference payload guard`：こちらはexpected copy先頭+1を、native prepare/stage前に `NORM_REFERENCE_PAYLOAD_MISMATCH` で拒否し、7試行・旧feed保持を返す条件。

したがって、**管理884の3項目の契約**と、**今回のユーザー文言における、同packageの改変・snapshot欠落も正式再import→prepare経路で拒否するという追加境界**を分ける。今回run2には管理884の列挙したE4保存・reader拒否・expected事前guardに対応する実receiptがあるが、それだけで追加の再import経路を成立させない。管理担当による新run2の受領・採用判定も別に必要。

管理5aaの判定は `dd95ed05f058930a391f015c11b9a2b963a42db5` / owner28f / 管理60dの旧6caseを受領した時点のもの。updated884はCOMPATIBLE/NOT_VERIFIED/BLOCKED、新P4はCANDIDATE_RECEIVED_NOT_ADOPTEDと記録されている。この旧成果に対する保留判定を、後続run2を照合済みで拒否した判定へ読み替えない。取得ACK、記録済み旧scopeの受入、新run2の受入、正式再import→prepare入口の提供は別事実として保持する。

## 正式再import→prepareの残件

固定884には、このoutput16 E4 packageの再読込結果をLoRA native prepareへ接続する正本入口がない。そのため「同package改変・snapshot欠落を、正式再import→prepare経路でprepare前に拒否する」という要件は未受入として残す。制御sentinelをnative prepareに見立てたり、reader試験を正式適用試験へ読み替えたりしない。

管理担当へ[PR #7の依頼コメント](https://github.com/Kushyameln01/kushyameln-works/pull/7#issuecomment-6560597620)で実入口・固定sourceを依頼済み。再開には、受け入れるartifact meaning/profile、読戻し結果から実ownerへ渡すAPI、reference/原本再選択・source/registry/targetの照合、native prepareへ入る直前のguardと観測方法について、管理の正本契約が必要になる。新source取得と合意の前に独自の復元・適用経路を追加しない。

既存の実expected guard、E4保存・fresh disk readback、reader負例、取消・復帰と独立copyの合格scopeは維持する。未成立の再import→prepare境界を含めてTask1全条件達成とは宣言しない。管理担当本人による返却成果の受領・採用ACK、P4適用、全target/full model、生成もこの追補では受け入れない。`coverage:PARTIAL`、`generationReady:false`、`currentLiveAdmission:false` を維持する。
