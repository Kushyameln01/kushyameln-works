# E1 LoRA–Diffusion 実PARTIAL共同試験結果

2026年10月31日 JST。**初回完了条件の実PARTIAL共同試験が成立しました。** light/detailの各HIGH/LOWを順次選択し、実原本LoRAと実base、Diffusionの実provider/sink/consumer、実ORT/Hikeで検証しました。最終成功試験は各side10ケース、計20ケースです。全target・実model全session・生成への寄与・管理snapshot公開はE9に残します。

## 使用版と正本

| 対象 | 固定版／完全commit |
| --- | --- |
| 総合仕様／実行計画 | 本文取得済み `1.1-draft.1`／`0.2-draft.2`。Page/hashは [SOURCE-BASELINE](SOURCE-BASELINE.md) |
| native LoRA | `lora-connection/2.0-draft.1`。既存SDK v1/v2とplannerを再利用 |
| 外側接続adapter | `lora-diffusion-diagnostic-adapter/0.1`。`diffusion-diagnostic-adapter.mjs` |
| HIGH実行source | `4d5fd7363f40f0d743ead448193ef2bf1915bbdc` |
| LOW実行source | `e1f03a4f6092c3154d5b47f166b77bbd32897ac9` |
| Diffusion採用版 | `438972f30242e0a3bc66edb8591f38eaa0fcd384`、[Draft PR #6](https://github.com/Kushyameln01/kushyameln-works/pull/6) |
| 指定診断原本 | `f522d9aeff313558c4ef83022a340af9a4c21391`。採用版とbase/provider・consumer実装はbyte同一、build IDは別に保持 |
| LoRA Hike WASM | 5,051 bytes、SHA-256 `3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24` |
| Diffusion graph | SHA-256 `af48828a7e93d75f529cee34c9b609cf4c3748f095a2c6fb3d5f1d71424988b0`、ORT WASM `1.24.3` |
| 実行環境 | Chromium `154.0.8037.57`、Node `24.19.0`、Python `3.12.14`、NumPy `2.3.5` |

HIGH/LOW sourceの製品SDK・adapter・kernel・独立oracleは同一です。差分は共同runnerの旧rollback試験を、古い候補がcommit済みのケースへ強化し、現在epochで順次prepareする手順へ直した部分です。各試験で実際に取得した全source/WASMのbytes/hashを完全commitのGit blobと照合しました。[契約対応](CONTRACT-MAPPING.md)、[API](../../docs/shared/inference/lora/CONNECTION_V2.md)、[再現手順](../lora/REPRODUCE.md)を参照してください。

native契約JSONは13,748 bytes／SHA `87e132af1739114f171254888c04f3050df27c47cd02e92fd67bc5babe4ac6d2`。旧v0.1案・inventory・既存論理対応を再生成せず保持しました。原本台帳SHAは `97229d6ea17738dc983fa898a38e771a784aeafff9513734c5af0ba0250c23b3`。接続担当へ渡す取得可能な正本は同repositoryの固定commit/pathと、既存の[引継ぎPage](https://chatgpt.com/space/page_4988393f36e88191bcf7c0823139d1f3)です。

E1の機械可読な外側接続契約とHIGH/LOW別instanceの対応は [lora-diffusion-diagnostic-contract.json](lora-diffusion-diagnostic-contract.json) にあります。A0/L1 descriptorは当時の固定receiptを保持し、E1のsource identityと混ぜません。

## 原本・slice・除外範囲

| pair / side | LoRA原本SHA-256 | variant / rank / alpha | 選択patch |
| --- | --- | --- | --- |
| light HIGH | `9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945` | down/up・128・128 | Q weight＋明示Q diff_b |
| light LOW | `86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b` | down/up・128・128 | Q weight＋明示Q diff_b |
| detail HIGH | `34e2144d3cd65360f97d09ccbe03e1c39a096df6c9234af5fe3899d1b63cda39` | A/B・64・省略 | Q weightのみ |
| detail LOW | `d6b783742f4d5fd63a0223ae1d5bf64fc995a6b408480ac2a00528ae0d4146db` | A/B・64・省略 | Q weightのみ |

Q full shape `[5120,5120]` のrows `[0,16)`×全5120列、81,920重み。lightは同Q bias full `[5120]` のindices `[0,16)`も計算します。detailにLoRA biasはなく、実baseのbias16値を別のimmutable-base-pass-throughとして保存します。runtime入力名はweight、Hike parameter名はbiasであり、initializerへ偽装しません。

lightは他1,050 patch（他404低rank、全201 diff、他445 diff_b）、detailは他399 patchを除外し、選択Q内の残りrows/indices `[16,5120)`も未適用領域です。元shape、selected slice、全included patch名と全excluded target/regionは [matrix](JOINT-LORA-MATRIX.json) および各 `evidence/lora-e1/*-scope.json` に保持しています。未知tensorを捨ててplanを通す変更はありません。

baseの出典は `Comfy-Org/Bernini-R@f7fd9812e54095d0c511d5e7429e6d8f6acc381a`。各15,574,833,216 bytesの全体SHAはHIGH `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52`、LOW `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3`。両方とも全byteの正確な取得coverage→全体hash→immutable Fileのstat結合→試験前後の同一性を確認しました。native provider自身の `fullFileSHA256Verified:false` は改変せず、外側取得receiptを別証拠として保持しています。

新規load時には実LoRA Fileのheader/size/rangeと全体hashを確認し、同じimmutable Fileの強度切替だけhashを再利用しました。過去の棚卸しを繰り返したという意味ではありません。容量制約により実行順はlight HIGH→detail HIGH→light LOW→detail LOWとし、HIGHの検証後にtask所有の取得cacheだけを除去しました。原本LoRAは変更せず、同時合成は実行していません。

## 独立期待値と事前gate

固定loaderは ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`、policy `comfy-lora-b5a4321-linear-diff-v1`。倍率は `strength * alpha/rank`、alpha省略時1はこの固定Linear subsetに限ります。lightのdiff_bは `baseBias + strength * delta`。対象Q weightにはdiffがなく、診断外の全201 diffを適用済みとは扱いません。

独立Pythonは元FP8・F16・BF16 bytesをSDK/Hikeと別の処理で復号し、NumPy binary64で低rank積と射影期待値を計算しました。実計算はHike F32、DiffusionはE4M3FN＋scalar F32 scale→Hike F32、ORT WASM Gemm→Hike biasです。ComfyUI/PyTorch本体の実行や元GPU精度の同値性を主張しません。

activationは5120要素中 `x[0]=0.25, x[17]=-0.5, x[5119]=1`、他0。強度は明示診断集合 `0,1,-1`、宣言範囲 `[-1,1]`。これは製品の既定値でも範囲外の認証でもありません。gateは参照計算前に保存し、失敗後も変更していません。

| 比較 | 合格条件 |
| --- | --- |
| base復号全81,920 weight＋16 bias | 数値・F32 bytesとも厳密一致 |
| 選択weight全81,920値 | `abs(actual-ref) <= 1e-5 + 1e-4*abs(ref)` |
| bias全16値 | 厳密F32数値一致 |
| consumer出力全16値 | `abs(actual-ref) <= 1e-6 + 1e-5*abs(ref)` |

## 全結果と取得可能な比較値

| side | 最終成功case | 比較weight数 | 比較bias数 | 比較出力数 | weight最大絶対誤差 | 出力最大絶対誤差 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HIGH | 10 | 819,200 | 160 | 160 | 6.122718332335353e-9 | 7.450580596923828e-9 |
| LOW | 10 | 819,200 | 160 | 160 | 3.723471309058368e-9 | 7.450580596923828e-9 |

bias最大誤差は両sideとも0、失敗要素は全比較0。各pair/sideの最初の3強度と、強度1の再適用・取消復帰の計5caseを含みます。最初の3強度だけでは4原本×3＝12case、weight983,040値・bias192値・出力192値です。失敗した初回試験を最終20成功caseへ足していません。

各caseの**全16 actual/expected出力**、全要素の比較件数・最大誤差・gate・選択配列hash・source/graph/registry/package/plan識別・native receiptは [HIGH-result.json](evidence/lora-e1/HIGH-result.json)、[LOW-result.json](evidence/lora-e1/LOW-result.json)、[matrix](JOINT-LORA-MATRIX.json) に保存しました。保存した配列を独立に読み直して比較した [結果](evidence/lora-e1/independent-artifact-verification.json) もあります。

選択した全weight/biasのactual F32とexpected F64/F32、全除外target表、reference、取得receipt、SHA manifestは [引継ぎPageの数値archive](https://chatgpt.com/space/page_4988393f36e88191bcf7c0823139d1f3) に置いています。GitHubへモデルや選択重み配列を公開せず、公開JSONから各private archiveのhashと内部全fileのhashを照合できます。

| archive | bytes | SHA-256 |
| --- | ---: | --- |
| HIGH-fixed | 5,046,473 | `62fdd108602295c8fa4510cbe82a0b7b02229172b70ecda7f26278f94440e6c8` |
| LOW-fixed | 5,008,603 | `9386dd0c9907b73f6c2bea0308f70fb6a148723acbefd3e382ce04c807082a8a` |

## 所有権・取消・復帰・互換性

- 実consumerのprepareLoadは独立feed copyを作り、実commit後にprepared packageとcandidate履歴を解放してから再runし、全16値が一致しました。必要bytesはactive consumerが所有します。実consumerはlease非対応のため実lease試験はN/A、generic SDKのlease fixtureと区別します。
- 強度変更・解除相当・再適用は全て不変baseから再構築しました。解除は外側adapterのnative prepareBase→validate→commitで行い、native SDK v2にないdetach/resetを捏造していません。強度1の再適用weight hashは初回1と同じで、二重加算はありません。
- 実provider読取後のprepare取消、bounded ORT/Hike後のconsumer取消、旧plan失効、意図的validate不一致からのrollback、次のapplyによる復帰を各pair/sideで確認しました。
- native commit直後・SDK返却前の取消でも、ownerが同じなら元feedへ復帰しました。SDKのabort/local generationとowner現在性を分離し、native candidate/epoch guardを維持しました。owner交代・遅いcleanupの拒否はadapter契約fixtureでも検証しています。
- 実native sinkのmissing/duplicate/checksum/foreign bindingを拒否しました。HIGHの旧rollbackは古い未commit候補の拒否、LOWはepoch17でcommit済みの旧候補→epoch18の新commit→旧rollback `restored:false`を確認しました。HIGHで後者まで実測したとは扱いません。
- PARTIAL/runtime-inputはv2経路だけを通します。実registryをv1入口へそのまま渡す拒否を両sideで確認し、initializer/FULL限定の意味・scope/binding改変拒否は既存v1互換fixtureで別途確認しました。拒否を避ける再ラベルはありません。

## 初回失敗と修正の証拠

最初のHIGH（source `55b82f01fe524f94de44932121558280e0b1b8f8`、旧WASM `da6d56…`）はbase復号・強度0一致後、強度1の81,920重み中66,071値がgate超過し停止しました。大きなBF16デコードのループ内宣言がHike stackを進めてhost arenaへ衝突することを、元入力655,360値とraw-WASM sentinelで独立確認しました。ループ変数を外へ出して固定領域で再利用し、ABI・数値順・gateを変えずに修正しました。大行列回帰2件のRED→GREEN、固定stack54 bytes（decode）/50 bytes（merge）とbit-exact復号を確認しています。[初回失敗](evidence/lora-e1/HIGH-initial-failure.json)、[独立kernel review](evidence/lora-e1/KERNEL-FIX-REVIEW.md)を保存しました。

LOW初回は10数値case一致後、追加した旧commit試験の手順が二候補を同epochでprepareしていたため、先行commitで古くなった候補をnative guardが正しく拒否しました。順次prepareへ直した後に別source/出力directoryで再試験し、上の最終成功に至りました。[失敗手順の記録](evidence/lora-e1/LOW-stale-test.json)と元試験archiveを別に保持しています。

## 段階判定と残る範囲

| 段階 | 今回の判定 |
| --- | --- |
| 実header/range・新規source全体hash | 4原本PASS。台帳再利用と新規load検査を区別 |
| Hike重み計算 | 実baseの選択slice＋light bias PASS |
| 合成base／test consumer | Node97、Python3、Chromiumパネル12 PASS。実base結果と別scope |
| 実base適合 | 固定2base・Qの選択領域／profileに限りPASS |
| 実診断consumer | 実runtime weight feed＋Hike biasの検証・commit・run PASS |
| 全target／元model全session／生成寄与 | NOT_RUN、E9 |
| 管理生成snapshot公開／両side原子的切替 | NOT_RUN、管理との統合工程 |

Diffusionへは採用版の公開factory群、同じbase identity・profile、外側adapterとowner-current callbackを渡します。実base/full shape/binding/変換hashの再照合を次の全target consumerにも要求します。汎用量子化base入力、Conv/派生LoRA、転置・融合・未知variant、不明倍率は今回追加していません。

管理へ渡す状態はsdkInstanceId、pairId/side、原本hash、強度、planId、native/connection registry hash、bundle/package hash、local input/application revision、coverage/scope、PREPARED/STAGED/CONSUMER_APPLIED、ownership、取消／復帰終端です。HIGH/LOWのSDK local revisionを共通manager revisionへ流用しません。今回のreceiptは全てPARTIAL、completeAdapter=false、generationReady=false、snapshotPublished=false。二組は選択・切替だけで、同時合成・公開・生成を追加していません。
