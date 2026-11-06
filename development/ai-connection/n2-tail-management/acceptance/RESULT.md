# 固定N2 tail管理接続のStep3受入

**HIGH1・LOW3の固定N2自己注意残差を、管理経由の数値・保持環境での5出力保存読戻し・自然終端／解放という範囲で受け入れた。**
管理とDiffusion双方の完全SHA、Profile、原bytes、入力／参照／gate、実行・保存証拠を照合した。
metadata上の2不備は原resultに残したまま、固定原本との対応を別の照合記録として明示する。
[機械可読受入](ADMISSION.json)、[返却原本の保存index](RECEIVED-INDEX.json)、
[再照合手順](REPRODUCE.md)、[独立監査](evidence/AUDIT.md)。

受入の正本は既存の `ADMISSION.json` に集約する。実行時のcatalog全文と6参照文書の版・digest、
元gate本文、両sideの3入力・5出力、参照receiptとprivate payloadの識別を同じ記録から追える。
今回の追記は既存証拠の接続だけで、数値実行や受入範囲の追加はない。

## SHAと契約

| 役割 | 固定commit |
| --- | --- |
| 管理基点 | `03e18b6116c3d778197e4d34ba0364a7dbe918f6` |
| 保持環境で実行した管理source | `5c484a8783ab129a2ff3543a98b2537af9888199` |
| 管理引渡し配布 | `055903abd667535e189ef50eb7dd70a0229a7efe` |
| Diffusion保持checkout／従前配布 | `beffdcb800b629d0b13ff43bbc90e9f74c659152` |
| Diffusion実行source | `a49aac492cc68e2dd6037e0deb4a6954731a847a` |
| Diffusion返却配布 | `508d72cc9036e7f500827465c644b4aed3c5f711` |
| 今後の公開metadata修正版 | `05c684f793e3f5525f3e2afea5d7d278f1ddc5ed` |

Profileは `bernini-block0-n2-self-attention-residual-f32-v1`、native APIは
`diffusion-models/0.1`、buildは
`diffusion-models/0.1+bba4dc740028dcecf849a36e395970b24358a6185378336d61d3a063ad72bc74`。
管理catalogは独立candidateのSHA `aa492b66fc3775b561bd6535290ebb5eabf7328039c47238e009996bd417943b`。
旧catalog6dae、LoRA DATA82b/nativefc・consumer5f、codec2bdのpinと受入scopeは維持した。
新修正版で数値再実行したとは記録しない。実行済み19管理moduleは5c484の原Git bytesに対応する。

受入対象は固定tail producerから同sideのartifact storageへの診断edgeに限る。別moduleや別edgeには、
そのownerのadapter、版付きProfile／規範、source／buildと独立した受入証拠が必要になる。
`evaluateEdge` は明示契約と実装済みの有限な規範bindingを比較し、数値検証と保存検査は既存ownerへ委譲する。
必須契約・規範が不明なら依存edgeを `UNVERIFIED` とし、数値gate／受入証拠だけが欠ける場合は契約上の
互換性を保って、必要phaseでvalidationを `NOT_VERIFIED`、readinessを `BLOCKED` とする。
実行前のpending scopeを許すdeclarationと、4 scopeすべてがpassになったpublished受入は区別する。

## 原本・出典の照合

- 返却差分は証拠12fileのみ。index対象11fileとindex自身を原Git blobから取得し、全長・SHA一致。
- 原 `result.json` は3,007,028B、SHA256
  `2d1e4a2205764a251af1357152c37d1fb11153d98bf5ba426d4257f3c0c4c859`。
  再serialize・補正していない。管理記録ではgzipで保存し、復元bytesが原Gitと一致する。
- 管理19・native24・build100・public receipt15の158照合recordが、固定実行Gitと配布Gitの双方に一致。
  これは重複を含み、138 commit/path組・134 Git blobに相当する。
- native/build/publicの139recordは以前取得した原bytesとも一致。管理原copyは未保存だったため、
  5c484／055903両Gitの19fileと既存hash inventory4件で照合した。
- build100のinventory digest、kernel、採用codec2bd原Git objectと配置8256Bも一致。
- 原型・意味・side/block0/HIGH1・LOW3、固定prefix/attentionと3入力F32 hash、独立local/composed参照、
  元gate、parameter fullshape/row/offset/binding、数値／保存／終端について862 metadata/hash/contract checksが成功。
  158／862は照合記録数であり、native実行件数や試験件数ではない。

出典の詳細は [source短報](evidence/SOURCE-RECONCILIATION.md) と
`evidence/SOURCE-RECONCILIATION.json.gz`、証拠の詳細は
[evidence短報](evidence/EVIDENCE-RECONCILIATION.md) と `evidence/EVIDENCE-RECONCILIATION.json.gz`。

## 受入結果

| 項目 | HIGH1 | LOW3 |
| --- | --- | --- |
| block／tokens | block0／N2 | block0／N2 |
| 固定ownerの数値比較 | 8比較・71680値・失敗0 | 8比較・71680値・失敗0 |
| strict parameter checks | 7 PASS | 7 PASS |
| 管理規範phase | published | published |
| 5出力保存／実disk読戻し | complete、追加32 reads、issues0 | complete、追加32 reads、issues0 |
| 元Promise／queue | completed・fulfilled・originalTerminal | completed・fulfilled・originalTerminal |
| 解放／再利用可能 | released・reusable、queue空、隔離なし | released・reusable、queue空、隔離なし |
| residual F32 SHA | `72a7de56a7364122197f4126a996f7131ff4fbda94f7f8201bdacbaad04d85b9` | `0024d0b19db9988d218e2a2ded4cc3713aca32d9517966455d17b34cfee801b6` |
| manifest全file SHA | `d87c1a36270d40a57c218a1bc2eaf2bc6fac5f6ad01e66dc304a76a180bbeaa7` | `346a6c580f56ff91a25e504b25bc21fb0ecdb147f95237bdb561d7a7fea4fa75` |

o/gated/residualはF32・LC `[2,5120]`、gateProjection/gateはF32・C `[5120]`。
全10出力の名前・F32 hash・shape・layout・意味が実行result／native evidence／readback auditで一致し、
manifestとpackageReceiptのhash・長さも実際に取得したmanifest bytesと一致した。
意味は自己注意後token hidden／専用gate中間値で、mean・生成latent・sampleへ読み替えていない。

この実行は保持環境で新たにtailを2回実行した証拠である。既存prefix・attention・固定参照とgate、
model full-file識別receiptを再利用し、prefix・attention・参照の再計算や約31GB pairの再hashはしていない。
保存済み旧tail outputの `HASH_VERIFIED` は別の原bit受領証拠で、新しい数値合格へ加算しない。
readback-auditも同じ成果の追加storage検査であり、数値再実行ではない。

## 原resultのmetadata不備と照合根拠

1. `publicReceiptProof[*].sourceRef.sha256` 全15件には、各receiptではなくstage.mjsのhashが残っていた。
   その値を正しいreceipt digestとして採用していない。record直下のsha256/byteLengthを各固定Git bytesへ
   再照合し、sourceRefのrepository/commit/pathと対応付けた。誤ったnested値も既知stage digestと一致する。
2. 公開投影が `trustedInputs.attention` のhash metadataを両sideで省略した。
   補足はa49の固定trusted/export/capture receiptと一致し、実attention artifact受領hash・実入力F32 hashにも
   結び付く。完全trustedInputsは公開投影前のnative検証／管理admissionで照合される固定sourceを確認した。
   補足をprivate runtime bodyの復元や元resultの修正とは扱っていない。

raw metadataの適合を無条件PASSへ変えていない。限定受入は上記の明示照合と原本保持を根拠にする。
今後のwriterは各file固有nested digestと、trustedInputs直下・同side・完全5キー・固定64桁hashのみの
attention metadataを保持するよう05c684で修正した。activation配列・未認識payloadは引き続き除外する。

## 検証・現状態・未受入

修正前に欠落／不整合を再現し、修正後は**459/459 PASS、fail0、skip0**。
従前456＋metadata負例／正例3件で、実行中104 source/test/reference fileのhash不変。
既存LoRA・queue・package・normを含む回帰であり、新しいprivate N2数値実行ではない。
独立scope／出典／証拠レビューはPROCEED。原packetは無変更、[検証log](evidence/node-tests.log)。

受入は保持環境の固定owner-runを管理が照合したもの。private model/activation/reference/package payloadを
管理環境へ取得した実績や、ここでのprivate E4 decode/readbackは含めない。
自然完了の `stopAcknowledged:false` を取消合格と扱わず、今回の実cancel/recover fault pathは未検証。
owner解放済みの過去の受入証拠であり、現在のactive model sessionや全工程snapshot readinessではない。
独立ES APIにないnative commit／model-session適用の動的traceも作らない。`snapshotPublished:false`。

Hike2883584BとORT16777216Bはtail専用の容量／宣言scope。実測ORT Memory・host/allocator/GC・総peakはnullで、
全工程の資源予算は未受入。cross-attention、FFN、全block/timestep、実HIGH→LOW、production/fused precision、
生成・VAE decode、任意LoRAは受入外。
**generationReady:false、load/predict/sample=NOT_READYを維持する。**
