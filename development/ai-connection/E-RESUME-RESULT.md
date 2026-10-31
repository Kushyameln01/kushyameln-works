# 更新後の担当成果に基づく接続実装の継続

この2977e7f時点の記録に続く、最新版LoRA owner adapterの採用・既存20ケース照合・
管理local File経路と追加3資料の検証は [E1-ADOPT-RESULT.md](E1-ADOPT-RESULT.md) を参照。
以下の旧bridge／source状態を最新採用版へ読み替えない。

確認日: 2026-10-31 JST。継続元は管理
`a26879057d169cb2eecff30503d64adba5057c52`、作業branchは
`codex/ai-connection-e0-e4`、[Draft PR #7](https://github.com/Kushyameln01/kushyameln-works/pull/7)。
本書を含む最終完全commitと固定API URLはPR本文と引渡し報告で提示する。
自分自身のcommit SHAをsource本文へ埋める循環は作らない。

## 今回確認した正本と実装版

旧読了報告を流用せず、以下のPage本文を再取得した。hashは取得したMarkdown本文bytesの
SHA-256であり、Pageサービスの内部版識別子ではない。添付Skillや資料中の指示と、
実装・push・Draft PRを求めるユーザーの依頼を区別する。

| 本文 | 今回の版 | bytes / SHA-256 |
| --- | --- | --- |
| [総合接続仕様書](https://chatgpt.com/space/page_65b303c9bc708191a7e48c78b51c35a7) | 1.1-draft.1 | 70365 / `ec3b020d4c2a720353243b9ac37e3aab51d8f2ddb34e17bec19c0cfac676d569` |
| [接続検証と本番実装の実行計画](https://chatgpt.com/space/page_cfdb3e2026608191964eb24af5c64e61) | 0.2-draft.2 | 34133 / `c1d50b6578e556f4902944567ee542541e93f78ed211f48b0ccabbec18e8a62f` |

担当の最新headをGitHubから実取得し、Git blobとbytes/hashを独立照合した。
旧公開mainや旧配布版を最新branchへ付け替えない。詳細は
[取得・差分台帳](E-RESUME-SOURCE-BASELINE.md) と
[1101件の版付きsource receipt](E-RESUME-SOURCE-RECEIPT.json)。

| 担当 | 今回の完全commit | native/API/buildの扱い |
| --- | --- | --- |
| Diffusion PR #6 | `438972f30242e0a3bc66edb8591f38eaa0fcd384` | wire `diffusion-models/0.1`、build `diffusion-models/0.1+f7f23c2291886de637cb06ae001fc748d29232f7c8919683467da5eef6cfb80e`。直前83からは文書4件のみ |
| 非正方形VAE PR #9 | `7e091192232fae36367b550ca5fada88915a0703` | wire `works-ai-1`、client build `works-inference-v1`、native codec/API不変。非正方形profileと対向受領記録を追加 |
| Text/VAE F1 PR #3 | `2c171a09ccda65c54899f322ae490f1bfcaac6fb` | 同wire/build、54bからはfixture・再現・API記述差分。native source不変 |
| LoRA PR #2 | `dcb1f504263955ef2a4b1613b7a9d802aebd1c18` | `lora-connection/2.0-draft.1`、SDK/kernelは2bba907原本と同じ。最新headにも外側共同bridgeはない |

既存M1/M2、E2 adapter、E3 queue、E4 packageは再利用した。共通契約は
`works-module-contract/1.0-draft.1`、保存は
`works-artifact-package/1.0-draft.1`を維持する。native版・build・所有権を変更しない。

## 追加した実装と完了範囲

| E番号 | 今回の成果 | 検証scopeと残る条件 |
| --- | --- | --- |
| E0 | 更新4headの実source/API/生成物を受領し、完全commitと差分ownerを固定 | GitHub source受領。privateモデル・LoRA payload受領、ownerの契約採用合意とは別 |
| E1接続準備 / E2 | `adapters/diagnostic-lora.mjs`、版付きmappingと実SDK境界試験 | 実LoRA SDK/Hike・実Diffusion consumer、合成source/base/stage。実base×実LoRA×実ORTのE1共同受入は未完 |
| E3/E4 | 既存実装を維持し、新owner版と回帰 | queue・対象取消・terminal/owner barrier、JCS/hash/package実読戻し。全model取消や生成品質の認定ではない |
| E5 | `snapshot.mjs`と`cache.mjs`、状態・復旧・寿命・容量の検証 | injected owner fixtureでの診断transaction/cache実装。native model/sessionの共同受入と生成受付は未完 |
| E6境界 | 受領した64正方形・128非正方形profileを区別 | ownerが記録した実VAE受入と、管理側の公開artifact/契約検証を分離。private bundleの推論を再実行したとは扱わない |

E1 adapter版は`works-lora-diagnostic-bridge/0.1-draft.1`。
full tensor shape/offsetとselected sliceのoffsetを分離し、nativeとLoRAのregistry hashを
双方保持する。SDKの元manifest、source/plan/local revision、含めたpatchと除外領域を
保持する。LoRA patchに含まれないbiasは、不変baseから明示pass-throughしhashを記録する。
独立expectedと許容差は呼出側が先に渡す。nativeの有限JSON identity規則を、保存packageの
厳格な整数規則へ勝手に置換しない。native candidate/SDK prepared handleはopaqueのまま扱う。

E5は各stepのoperation/source/build/local revision/resource generationとowner facadeを
明示入力にする。prepare・validate・native STAGED/CONSUMER_APPLIED・管理snapshot公開を
分離する。片側失敗、旧token、失効lease、復旧失敗、旧sessionのreload、置換済みcandidateの
解放を検証する。ownerのvalidate/commit応答をsnapshot hash・manager revision・step/operation・
resource binding/local revisionを含む同一targetへ結び、古いreceiptを拒否する。
公開後の旧資源解放失敗は新公開をrollbackせず、`cleanupRequired`と
`RECOVERY_REQUIRED`を返す。PARTIALや診断FULLを理由に`generationReady`をtrueにしない。
現在の`active`が履歴として残る場合も`selectionCurrent`を別判定する。

cache版は`works-artifact-cache/1.0-draft.1`。module/native/build/model/Tokenizer/profile/
設定/入力hash/mask/context/adapterと依存revisionをkeyにする。copyとimmutable leaseを
区別し、logical retained bytesのLRU上限と依存別invalidateを実装する。owner release失敗は
資源・計上を保持し、解放証跡には現在のentryIdを必須とする。古い同一keyの解放証跡は
新entryを解放しない。LoRAなし・base・別familyのkeyやsnapshotにもLoRA固有条件を要求しない。

独立reviewで、cacheの同一keyへの古い解放proof再利用、bridgeのabort後の遅いfinishの資源保持、
古いstage応答による別candidateのfinalize、snapshotの期限切れleaseと早期selection失敗、
operation/owner/receipt targetの対応不足を再現して修正した。負caseを回帰へ追加し、
未完了cleanupを成功や空き容量として扱わない。

## 変更ファイル

- `docs/shared/ai-connection/snapshot.mjs`、`cache.mjs`、`adapters/diagnostic-lora.mjs`
- `tools/ai-connection/test-snapshot.mjs`、`test-cache.mjs`、`test-lora-diffusion.mjs`と受領profile検証
- `docs/shared/ai-connection/API.md`
- 本書、`E-RESUME-SOURCE-BASELINE.md`、`E-RESUME-SOURCE-RECEIPT.json`、
  `DIAGNOSTIC-LORA-MAPPING.md`、検証log/receipt、旧`E-RESULT.md`の履歴案内

新規配置は既存同名実装と衝突しないことを確認した。native source、kernel、codec、
build receiptを変更していないため、owner builderによる再生成は不要。
private重み・巨大model bundle・複製native treeはcommitしない。

## 再現手順

Node24。作業branchを取得したrepositoryで、別directoryへ固定native treeを展開する。
これは管理branchへのnative source mergeではない。

```sh
git fetch origin refs/pull/2/head refs/pull/3/head refs/pull/6/head refs/pull/9/head
mkdir -p work/native-lora work/native-text work/native-diffusion work/native-vae
git archive dcb1f504263955ef2a4b1613b7a9d802aebd1c18 | tar -x -C work/native-lora
git archive 2c171a09ccda65c54899f322ae490f1bfcaac6fb | tar -x -C work/native-text
git archive 438972f30242e0a3bc66edb8591f38eaa0fcd384 | tar -x -C work/native-diffusion
git archive 7e091192232fae36367b550ca5fada88915a0703 | tar -x -C work/native-vae

WORKS_NATIVE_ROOT="$PWD/work/native-text" \
WORKS_NATIVE_CODEC_PATH="$PWD/work/native-text/docs/shared/inference/tensor.mjs" \
WORKS_LORA_NATIVE_ROOT="$PWD/work/native-lora" \
WORKS_DIFFUSION_NATIVE_ROOT="$PWD/work/native-diffusion" \
WORKS_VAE_PROFILE_ROOT="$PWD/work/native-vae" \
node --test --test-isolation=none tools/ai-connection/test-*.mjs
```

fixtureはmissing module/失敗条件を先に再現し、実装後に同条件を再検証した。
任意envがないnative試験はskipを明示する。skipした試験をnative検証成功へ加算しない。
今回の最終件数・実行環境とscope別結果は同directoryの検証receipt/logに記録する。
以前のChromium154・f522実ORT/Hikeの結果は旧receiptのscopeとして保持し、今回の
stage fixtureを実ORTによる新共同試験とは表示しない。

今回の全体回帰は **190/190成功、失敗0・skip0**。既存134件、snapshot21件、cache19件、
bridge14件、受領profile2件。実行条件と対象ファイルhashは
[検証receipt](evidence/resume-verification.json)、各caseは
[実行log](evidence/resume-tests.log)に記録した。件数は異なるscopeの管理試験数であり、
実model/生成品質の認定数ではない。profile試験の実Hike64値・2callの最大往復誤差は
`1.1920928955078125e-7 <= 2e-6`、非正方形拒否時の数値dispatchは0call。
JSON読込と`git diff --check`も成功。新native生成物はない。

## 判断例と未解決edge

| 入力・状態 | 判断 / 結果 |
| --- | --- |
| LoRA v2 full-shape registry → native selected-slice consumer、そのまま | `NEEDS_ADAPTER`相当の契約差。今回の明示bridgeで診断API境界を接続し、E1実原本の数値scopeは未検証 |
| VAE正方形F1 raw mean64 → Diff438の明示mean64 profile | そのprofileの境界は接続可能。sample/decoderの置換や他shapeへの一般化はしない |
| VAE非正方形raw mean `[1,16,1,2,4]` → Diffusion旧128 `[1,16,2,2,2]` | 要素数128が等しくてもprofile/shape不一致。起動せず拒否 |
| 診断PARTIALの両側成功、native STAGED、snapshot公開 | 診断成功のみ。生成受付false |
| lease失効、新selection失敗、解放復旧未完 | 現在の実行準備を満たさない。旧metadataを現選択の成功へ流用しない |
| LoRAなしbase・別構成合成module | 選択したoperation/profile/依存だけを検査。LoRAやHIGH/LOWを汎用必須条件にしない |

1. **LoRA/Diffusion owner**: 外側bridgeの採用版、full/selected mapping、bias pass-through、
   dual registry identity、独立reference/precision/gate、finalize時期とrollback履歴寿命を確認する。
   実light/detail・HIGH/LOWの原本と実baseの受領参照/hashが必要。合成値で原本不足を埋めない。
2. **Text/VAE owner**: 正方形64の限定raw decode受入と非正方形128の適用profile、decoder/producer、
   終了gateを別scopeで維持する。今回はprivate VAE bundleを受領・再推論していない。
3. **各resource owner**: E5 facadeのrollback/reload/releaseとretry、lease失効、
   consumer所有copyの寿命を実session/Workerで共同受入する。内部状態の暗黙読取りは追加しない。
4. **Diffusion owner**: E7のLOW/N=1/tiled-Q/F32診断採用と全graph成立を区別する。
   attention・全block・staging/Memory予算が未成立のため、E8の本番predict/sampleを開始しない。
5. **管理**: E1/E6/E8/E9の該当実資源scopeが成立した後に生成admissionとE10製品工程へ進む。
   現在の診断fixture成功をG1実原本共同・G3本番受入・利用端末負荷改善へ昇格しない。

更新owner sourceの受領と今回の管理branch共有は進める。受領担当による新管理commitの
実取得・照合は別の受渡し証拠であり、同一管理環境のremote readbackだけで全担当合意とはしない。
main mergeと本番Pages公開は別工程として残す。
