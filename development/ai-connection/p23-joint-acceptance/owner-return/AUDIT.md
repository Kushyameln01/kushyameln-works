# returns-r10 独立監査

## 初回判定（2026-11-02 JST）

- event_id: returns-r10-initial
- revision: 管理基点 f34bf10a67c91f462ab46dec033eaeb2110facf1／固定runner 8849891f19124df31847bd691503c2491278eaa8／返却候補 VAE f76ebbbb・LoRA dd95ed05・P4 7ee36228
- status: **PROCEED（取得・hash・既存package読戻し・receipt/source照合・結果文案の作成）**。この判定は新admissionの確定・対外送信までを含まない。
- role: 独立read-only監査。例外としてこの運用記録だけを作成。repo、owner成果、source、数学、mappingを変更しない。

### 原要件との照合

直接確認した原要件 `/workspace/work/ai-connection/returns-r10/REQUEST.md` は、既存manifest/receiptを用いた返却成果の取得・照合と各ownerへの限定結果返信を求めている。再推論・再exportは不要であり、実際のGit bytes取得、hash、既存package読戻し、静的source確認はこの未達条件を直接減らす。新native演算やpinの一括置換、新検証機構の開発は必要ない。

管理baselineの PLAN/RESULT/SOURCE-PIN/OWNER-HANDOFF と旧N2 ADMISSIONを確認した。旧pendingは2026-11-01T09:47Z時点の観測として保持し、後着返却の拒否根拠や永久状態にしない。新取得と受入判断は別記録にする。

### 確定を保留する境界

1. **P2 admission: UNVERIFIED（最終照合待ち）**。VAE原本の RESULT、updated-884 SOURCE-REPORT、MANAGER-SOURCE-RECEIVED、observer-result の存在・限定内容を確認した。正常／取消復帰の新884と、初回60d／helper5537／observer e150／VAE855／owner5f／codec2bdの区別は妥当。実package hash・読戻し、currentInputLink/trace・実RGB・取消/解放の照合報告を読んでから限定admissionを確定する。旧成功の付け替えやP2全体/生成合格へ拡張しない。
2. **P3は60d16での6公開caseとしてのみ扱う**。LoRA dd95の RESULT は実行28f44・正式管理60d16を明示し、private F32保持・公開metadata/output16・selected-weight N-ARTIFACT未受入を分離している。新884のE4保存読戻し・改変拒否・事前参照guard充足は、この6件だけから認定できない。既存control成功を最新追加条件の成功へ付け替えない。
3. **P4は別候補で未採用**。P4 RESULT/handoff は配布7ee、実行5744/8294、元数値3aeを分け、N2/K4 fixture範囲・実Text/LoRA未受入・資源のWASM容量と総peak未測定を明示する。旧N2 ADMISSIONは旧a49/508d・旧Profile/build/catalog scopeのまま維持。metadata/公開receipt/sourceの取得をprivate原本/activation/reference/patch payload受領と同一視しない。
4. generationReady:false、load/predict/sample=NOT_READY、catalog6dae/1.0-draft.1、既存native pinsを維持。契約一致で数値のみ未確認はCOMPATIBLE/NOT_VERIFIED/BLOCKED、未知必須契約はUNVERIFIED。

### 根拠

- `/workspace/work/ai-connection/returns-r10/REQUEST.md`
- `development/ai-connection/p23-joint-acceptance/{PLAN.md,RESULT.md,SOURCE-PIN.json,OWNER-HANDOFF.json}`（管理baseline）
- `development/ai-connection/n2-tail-management/acceptance/ADMISSION.json`
- `returns-r10/vae-review/git-originals/development/inference/p2-p3-acceptance/{RESULT.md,p2/updated-884/SOURCE-REPORT.md,p2/updated-884/MANAGER-SOURCE-RECEIVED.json,p2/updated-884/observer-result.json}`
- `returns-r10/lora-dd95/development/ai-connection/lora-p2-p3-consumer/RESULT.md`
- `returns-r10/p4-7ee/development/ai-connection/p4-cross-ffn/{RESULT.md,handoff.json}`
- preserve-procedure-contract 1.0.0 §§1–4、audit-agent-work 1.0.0 §§2–5＋audit-protocol、verification-before-completion を本文から確認。

### 未読・未確認

rootによる最終取得inventory、各担当の照合report、選択admission/返信文案/実repo差分は初回監査時未完成。全ファイルhash、実NNの再実行、private payload、全履歴、merge/Pages状態の独立ネットワーク照合はこの初回判定の対象外。別途の最終監査で上記報告と実差分を直接確認する。

## R10-ADMISSION report監査（2026-11-02 JST）

- event_id: R10-ADMISSION-reports
- revision: `development/ai-connection/p23-joint-acceptance/owner-return` の初回report一式。rootのRETURN-ADMISSION・latest参照追記前。
- status: **PROCEED（提示された限定判定を正式recordへ反映）**。対外送信の確定は、作成後のRETURN-ADMISSIONと実差分をこの監査へ渡してから行う。
- findings: 進行を阻害する目的逸脱・手順置換は確認しなかった。初回P2 admission未確認は、実reportとsourceの直接確認をもって限定record化に進める。

### 直接確認した証拠と判断

1. VAE `vae/{REVIEW.md,scoped-admission.json,verification-output.json,portable-recheck-summary.json,verify-vae-return.mjs,prepare-git-origins.py}`。既存package reader/codecのGit bytesを抽出し、10 packageを読む手順であり、native client/kernel import・再推論・再exportへの経路を追加していない。93 index/20 source/各mean128・RGB1536の照合範囲を読み、今回実RGBと過去received-rgbの除外、同一trace/currentInputLink、取消Promise/token/解放→fresh復帰の検証を確認した。NN/model全filehash/元disk write/process終了はowner evidenceとして区別されている。
2. 未来receipt境界を原本から追加点検。固定884 `tools/ai-connection/norm-required-rect-browser.mjs:54–73` はdeclarationを `requiredScopes:[], evidence:[]` で作成。両scenarioの実原本 `decode/result.json` のnormExecutionでは、declaration4件ともN-EVIDENCE/N-TRANSACTION/N-ARTIFACTがnot-verified、validatedはN-EVIDENCEだけpass、publishedで残りがpass。事前段階のreadyは限定prepareの許可であり数値受入と同一視していない。mean側のbounded prepareはBLOCKED/NOT_VERIFIEDを保持。未来証拠の前倒しを確認しなかった。
3. LoRA `lora/{reconciliation.md,reconciliation.json,case-bindings.json,verification-output.json,snapshot-hash-verification.json,verify-lora-return.py,verify-snapshot-hashes.mjs}`。60d/owner28fの6取引、receipt-free preflight、checkpoint/postpublication target、native/manager状態、終了後uncurrentを分離した限定受入は原要件に適合。249 metadata検査・6 canonical hash・JSON96値の読戻しを、private491520weight値の今回再計算と混同していない。
4. 固定884 `managed-lora-data-real-browser-cases.mjs:78,100,118–124,130,149` を直接確認。期待copy改変の事前拒否、実output16 E4保存/読戻し、改変・snapshot欠落拒否は、dd95のnative activation改変による失敗と別観測。shared runtimeが60d/884で同一でもnew receiver追加条件の実行証拠にはならない。COMPATIBLE/NOT_VERIFIED/BLOCKED維持は妥当。
5. P4 `p4/{REPORT.md,CANDIDATE-RECORD.json,ACQUISITION-RECEIPT.json,verification.log}` と原本 RESULT/handoff。123公開file/22,427,434Bと50source/13,352,427B、745 metadata/source検査を、private payload受領/再数値実行と分けている。旧N2正本/Profile/buildは固定、P4新Profileは未採用。K4 fixtureと実Text、caller signbit最終F32とcanonical LoRA低rank適用、WASM容量と全工程peak、rollback tile再読とblock再計算の区別が維持されている。新mappingの未知必須契約はUNVERIFIEDであり、数値だけ不足の既知契約COMPATIBLEと区別されている。

### 今回独立実行した限定整合検査

2026-11-02 JSTのread-only Python検査で、VAE scoped-admissionが索引する6ファイルの実bytes/SHA256、P4取得receiptの実bytes/SHA256、LoRA verifierの実SHA256、MANAGEMENT-HANDOFFの12pathを固定f34のGit bytesへ再照合した。sameAsFixed884=trueは884のGit bytesとも照合。すべてPASS。検査時点ではtracked baselineの差分は空であり、`owner-return/` 追加のみだった。各報告の全検査を重複実行した実績として数えない。

### 残る最終点検

RETURN-ADMISSION作成後の実recordとlatest参照の差分を読む。今回の受入はhistorical disposed factsであり、current live generationにはしない。P3 updated884の未完、P4候補/未採用、private未受領、generationReady=false/NOT_READYを落とさない。旧N2 ADMISSION・core/native pins・旧BLOCKED原本の変更がないことを確認して対外送信可否を返す。

## R10-ADMISSION 最終判定（2026-11-02 JST）

- event_id: R10-ADMISSION-final
- status: **PROCEED（今回のsource記録commit/push・Draft PR更新・3ownerへの明示返却）**。
- target: `owner-return/RETURN-ADMISSION.json` SHA256 `43a6d3a5e5e5cc79baf9b26d069ebd9d84a5764fef9333c7dc870bd74742b235`
- findings: 最終record・RESULT/REPRODUCE/ROOT-VERIFICATIONと実差分の確認範囲で、対外返却を妨げる問題を確認しなかった。

最終受入recordはP2固定profile・既存normal/cancel/recovery/current E4だけをACCEPTとし、live owner/生成受入はfalse。LoRA60d/owner28fの6取引を記録済みscopeに限定し、884追加3条件のCOMPATIBLE/NOT_VERIFIED/BLOCKEDとprivate26payload未受領を保持。P4は別候補/未採用、real Text/mapping/資源/private入力未受入を保持。旧N2の唯一のADMISSIONは上書きしていない。元時刻と旧BLOCKED試験は当時のscopeとして残り、latest参照へ接続している。

最終read-only検査で、固定source/API/参照136pathが記録hashおよびf34の実Git bytesと一致、旧N2 ADMISSIONがf34とbyte exact、CANDIDATESのlatestOwnerReturn以外の全field不変、公開verifier5件のhash/bytes一致を確認してPASS。変更tracked pathはdevelopment配下6件のみ。2階層のEVIDENCE-MANIFEST（44件/28件）全pathの実bytes/SHA256を確認してPASS、`git diff --check` もexit0。

監査対象4最終fileのSHA256:

- RETURN-ADMISSION.json: `43a6d3a5e5e5cc79baf9b26d069ebd9d84a5764fef9333c7dc870bd74742b235`
- RESULT.md: `f78f711f7db383109882d0424defdc4aa215288bdaeea2e4f82b20a2d6619ea9`
- REPRODUCE.md: `076d2aec7370a9f74346dcf8044c98a35ac75a233c9040e3247581bd9517feb3`
- ROOT-VERIFICATION.json: `f0f47c61ff01a38cec2bf76c1ca138973a08433d867bfa06e44438d223da3fd5`

対外返却はこの版の限定結論とpath/bytes/hash/未取得・未受入を伝える範囲。push後に配布完全SHA、3comment URL、各読戻し一致を送信receiptへ加えることは既存許可の通常追跡であり、この監査へ再承認を求めなくてよい。新しいscope変更・実装・試験経路を加える場合は別途通知する。merge/Pages公開は許可範囲に含まれない。本監査はowner原NNの再実行や全過去履歴の保証を行っていない。

### R10-ADMISSION 最終追補：base経路とLoRA条件の分離

- status: **PROCEEDを維持**。
- 対象2fileの実内容と指定SHA256を照合した。RETURN-ADMISSIONのP4に `basePathIndependentFromLoraMapping:true`、`loraConditionsForcedOnBasePath:false`、RESULTに「LoRAなしbase経路と新LoRA mappingの受入は別scopeであり、LoRA固有条件をbase経路へ強制しない。」が追加されている。
- これはownerの既存base候補とcanonical LoRA適用未受入を混同しないための明文化であり、既存baseへLoRA固有の不足条件を強制しない。P4の未採用・管理dispatch未受入・canonical mapping未受入・生成falseは保たれている。原要件のscope分離と整合し、新経路・受入拡張を確認しなかった。
- 最新RETURN-ADMISSION.json SHA256: `b4e14f7c1fccb750394e16ca17ca2a9174d19a96eb56292e06dd6359875de714`
- 最新RESULT.md SHA256: `5dadc6a680eb98419c91700d9355476a356ca9066c9a48562413a6345ab30bc9`
- 前節の2file対象digestはこの追補で更新する。REPRODUCE/ROOT-VERIFICATIONの対象digestは前節どおり。manifest refreshと全hash確認はrootの通常記録更新として継続し、対外返却の再承認待ちを追加しない。
