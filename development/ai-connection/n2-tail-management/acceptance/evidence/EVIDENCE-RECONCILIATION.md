# N2 tail 実行返却の数値・保存・終端照合

返却された公開証拠は、固定 `bernini-block0-n2-self-attention-residual-f32-v1` の HIGH1 / LOW3 をそれぞれ受け入れる根拠として整合している。今回の照合で新たな数値・出力・保存・終端の不一致は見つからなかった。既知の metadata 2事項は残し、source 全体の照合と合わせて正式受入へ使う。根拠の実データは [EVIDENCE-RECONCILIATION.json](EVIDENCE-RECONCILIATION.json)。862件は返却 metadata・hash・契約の照合数であり、native実行回数や独立した試験数ではない。別担当の [SOURCE-RECONCILIATION.json](SOURCE-RECONCILIATION.json) は158 source記録すべてのbyte identity一致を確認している。

対象は返却 commit `508d72cc9036e7f500827465c644b4aed3c5f711` の元 `result.json`、manifests、実行 context、追加読戻し監査である。管理実装 `5c484a8783ab129a2ff3543a98b2537af9888199`、管理引渡し `055903abd667535e189ef50eb7dd70a0229a7efe`、native実行source `a49aac492cc68e2dd6037e0deb4a6954731a847a`、従前配布 `beffdcb800b629d0b13ff43bbc90e9f74c659152` を区別した。元ownerのRESULT・handoffと管理HANDOFFも確認した。返却ファイルおよび実装sourceは変更していない。

## 数値と入力

| 項目 | HIGH | LOW |
| --- | --- | --- |
| side / block / schedule / tokens | HIGH / 0 / 1 / 2 | LOW / 0 / 3 / 2 |
| owner比較 / 全値 / failed | 8 / 71,680 / 0 | 8 / 71,680 / 0 |
| strict parameter checks | 7 / 全件hash一致 | 7 / 全件hash一致 |
| local residual最大絶対誤差 | 0.00005340576171875 | 0.000011444091796875 |
| composed residual最大絶対誤差 | 0.00002288818359375 | 0.0000171661376953125 |
| native tail経過 | 8,248.3 ms | 8,331.7 ms |

8比較は local O / gateProjection / gate / gated / residual と composed O / gated / residual。個々の件数・実出力hash・gateを照合した。gateは固定candidate-planの local O `abs1e-4 + rel1e-5`、他local `abs1e-3 + rel1e-4`、composed `abs1e-2 + rel1e-3` と一致する。凍結referenceは `e48ada4f8a44d9aced90886e3d67744d3571a4b7cde8bdb5ecdad2d107ffde42` / 3,712 bytes。4つの独立reference receiptとprivate referenceファイルhash・長さが固定Git bytesおよび返却asset receiptと対応する。

7 parameter checksは O weight / scale / quant config / bias、time projection weight / bias、block modulation。返却raw/F32 hashを元local reference receiptへ照合し、native証拠のfullshape・storage dtype・元offsetからの選択範囲も確認した。time projectionは `[30720,5120]` の rows `[10240,15360)`、bias/modulationはelements `[10240,15360)` を保持する。O/time weightはruntime-input、bias/modulationはhike-parameter。

3入力のF32 hashを receipt・validation・native証拠間で照合し、元fullPrefix/export receiptへ対応付けた。fullprefix artifact、attention artifact、local/composed reference、保存済みtail出力の計10 private JSONは、保持環境で全bytesをhashしたという返却記録である。管理環境ではprivate JSONを取得・再hashしていない。モデルは既受領full-file識別と今回の長さ・bounded header・選択parameter証拠を使い、約31 GB pairの全量hashは再計算していない。

## 5出力とE4保存

| 出力 | shape / layout | 意味 |
| --- | --- | --- |
| o | `[2,5120]` / LC | self-attention-o-projection-token-hidden |
| gateProjection | `[5120]` / C | time-modulation-chunk2-gate-projection |
| gate | `[5120]` / C | time-modulation-chunk2-gate |
| gated | `[2,5120]` / LC | self-attention-gated-token-hidden |
| residual | `[2,5120]` / LC | block0-self-attention-residual-token-hidden |

全出力はfloat32、合計163,840 bytes/side。10出力すべてでhash・shape・layout・meaningを元resultのoutputBinding、validation、native output hashes、publish receipt、追加読戻し監査の間で照合した。固定公開export receiptに記録された既受入bitsとも一致する。

- HIGH residual: `72a7de56a7364122197f4126a996f7131ff4fbda94f7f8201bdacbaad04d85b9`
- LOW residual: `0024d0b19db9988d218e2a2ded4cc3713aca32d9517966455d17b34cfee801b6`
- HIGH実取得manifest: 8,720 bytes / `d87c1a36270d40a57c218a1bc2eaf2bc6fac5f6ad01e66dc304a76a180bbeaa7`
- LOW実取得manifest: 8,709 bytes / `346a6c580f56ff91a25e504b25bc21fb0ecdb147f95237bdb561d7a7fea4fa75`

手元のmanifest実bytesから計算したhash・長さは元resultのpackageReceiptと一致した。各manifestは相異なる5 artifact / 30 required filesを列挙し、native / descriptor / evidence / trace / snapshot / extensions とdecoded-tensor-data bindingの対応が揃う。

保持環境の固定publisherは書込み直後に実storage readerで読戻し、`status:complete / readbackVerified:true` を発行した。追加の `readback-audit.json` はrunner終了後に固定readerで32 disk reads/side、5出力、issues空、ownership copyを記録する。これは保持環境での保存・読戻し証拠である。公開packetにはprivate native/evidence payloadや実packageの `receipt.json` は含まれず、この管理環境でprivate E4 packageをdecode・読戻しした実績はない。

## 終端・解放と規範

両sideのqueueは `completed / fulfilled`、`resultAccepted / originalTerminal / calculationStopped / resourceReleased / reusable = true`、active invocationなし、queued空、quarantineなし、errorCode null。固定adapter sourceでは、original native run Promiseの終端barrierとnative dispose後のstats確認を経てqueueがこの状態になる。返却queueはその成功経路を示す。独立したnative解放observerを管理環境で新規実行したものではない。

`stopAcknowledged:false` は自然完了の記録であり、今回の実取消・recover試験を意味しない。固定sourceや既存fixtureの取消・故障境界試験と、この返却の実成功経路は分ける。

両sideのnormExecutionは published / failure null / publicationObserved true。最終decisionはCOMPATIBLE、numeric・N-EVIDENCE・N-TRANSACTION・N-ARTIFACTが全PASS、pendingScopeRefs空。途中のdeclarationでpendingとなる記録を最終未検証と混同しない。`snapshotPublished:false` を保持し、native commit / model-session適用の受入は追加しない。

## metadata事項と証拠の数え方

1. `publicReceiptProof[*].sourceRef.sha256` 全15件はstageのhashを保持しており、各receipt自身のdigestとして使えない。record直下のsha256/byteLengthを固定Git bytesへ照合する。source担当の全件照合に統合する。
2. 固定 `publicN2TailReceipt` はkey `attention` を除外するため、元resultには `trustedInputs.attention` がない。補足ファイルのmetadataを固定export receiptへ照合し、元asset receiptのattention artifact hashと実入力F32 context hashへ対応付けた。元resultはそのまま残す。

新しい実績は管理経由tail 2回、ownerの8比較/side、E4保存/sideと自然完了・解放の返却である。元prefix/attention/reference/gateは再利用しており、この実行で再計算していない。`savedOutputAcceptance:HASH_VERIFIED` は既存保存outputのbit照合であり、追加の数値実行ではない。verification.jsonは同じ元resultの要約、readback-auditは同じ出力の追加storage検証であり、新たなnative数値実行として加算しない。反復declarationや複数箇所にある同一hashも独立証拠数へ加算しない。

## 推奨受入範囲

固定source/hashの別照合と統合したうえで、「保持環境の管理経由実行における、自然N2・block0・HIGH1 / LOW3別caseの O projection → chunk2 gate → 元patchHidden残差、明示F32診断」と「その5出力の保持環境E4保存・読戻し」を限定受入する。保存済みoutputはhash receiptを照合済みとし、private payloadの管理環境取得は未完了のままとする。

ORTMemoryBytes / observedORTMemoryBytes / nativeORTMemoryBytes / allocatorPeak / GCPeak / hostPeak / totalPeakはnull。16,777,216 bytesはORT宣言容量、2,883,584 bytesはHike容量であり、全体peakではない。累積copy/read trafficを同時live量へ読み替えない。

実HIGH→LOW受渡し、cross-attention、FFN、全block/timestep、本番81frame/context/noise、production/fused precision、生成・sample・VAE decode、任意N2/LoRA、全工程の資源予算、実cancel/recoverは今回の受入に含めない。`generationReady:false` と `load/predict/sample=NOT_READY` を維持する。
