# E0/E2 管理正本の取得状況とText/VAE確認待ち

2026-10-31 JST。read-only調査。対象管理commitは `21e77f292c2540975d1846e7efe320fe89625e23`、対象repoはユーザー指定 `Kushyameln01/kushyameln-works`。参照した総合仕様は1.1-draft.1、実行計画は0.2-draft.1。Text/VAEの取得可能な `54bfeadbd83f1fea074c503c0e05ec478aba5cfb` と既存G1C-MAPPINGは変更していない。

## 結論

**管理の実schema・validator・Text/VAE adapter正本は未取得。E0の当該edge受領とE2の実adapter情報保全照合は保留。** 報告上の58件/37件を再現した、5実schemaを照合した、native→共通→nativeが合格したとは報告しない。未取得は管理成果の不存在を意味しない。Text/VAE native単独経路と、別担当が進めるE6の個別profile実WASM受入は止めない。

## 実取得操作の証拠

| 操作 | 実際の結果 |
| --- | --- |
| GitHub connector `fetch_commit(repo_full_name='Kushyameln01/kushyameln-works',commit_sha='21e77f292c2540975d1846e7efe320fe89625e23')` | **422**。`No commit found for SHA: 21e77f292c2540975d1846e7efe320fe89625e23` |
| 同connector `fetch_file(ref=同完全commit,path='docs/shared/ai-connection/descriptor.mjs')` | **404**。`No commit found for the ref 21e77f292c2540975d1846e7efe320fe89625e23` |
| Space search `21e77f292c2540975d1846e7efe320fe89625e23` | 4ページ分16結果、返されたcursorがnullまで取得。管理source/archiveの取得先を発見できなかった |
| Space search `Kushyameln Works AI推論 管理ツール 引継ぎ` | 5ページ分23結果、cursor終端まで取得。共通仕様、計画0.1/0.2等は見つかったが、管理原本/配布archiveなし |
| Space search `ai-connection schema validator 管理 21e77f2` | 9ページ分43結果、cursor終端まで取得。LoRA引継ぎ・旧台帳等を含むが、管理正本を特定できなかった |
| 総合仕様Pageの直接の子Page一覧 | 計画0.1と0.2の2Pageだけ、next_cursor=null。独立した管理source引継ぎPageは一覧にない |
| [実行計画0.2 Page](https://chatgpt.com/space/page_cfdb3e2026608191964eb24af5c64e61)のfull取得 | 管理21e77・58/37は担当報告として記載。管理archive URL、library-file、project-file参照なし。Text/VAE・LoRAの参照を管理sourceと取り違えない |
| [前計画0.1 Page](https://chatgpt.com/space/page_c9419933213c8191b8e7375cf6d61865)の対象検索 | manager21e77、library-file、project-fileの一致なし。管理の新規配置・関数は案として記載されている |

GitHubの生error本文:

```json
{"message":"No commit found for SHA: 21e77f292c2540975d1846e7efe320fe89625e23","documentation_url":"https://docs.github.com/rest/commits/commits#get-a-commit","status":"422"}
```

```json
{"message":"No commit found for the ref 21e77f292c2540975d1846e7efe320fe89625e23","documentation_url":"https://docs.github.com/v3/repos/contents/","status":"404"}
```

Space検索は返された各検索cursorを終端まで取得したが、検索サービス自体が全Pageを網羅する証明ではない。読める計画本文と、原本sourceの取得成功は別である。

## 5種schemaの確認状態

以下は総合仕様/前計画にある型の分類であり、21e77の実schema名・export名を回収した結果ではない。

| 文書上の対象 | 今回の確認 | 原本取得後にText/VAE ownerが照合する箇所 |
| --- | --- | --- |
| ModuleDescriptor | Draft要件は取得済み、実schema/validator未取得 | works-ai-1を保つoperation/port/transport、独立利用、Text512/ID L、profileと検証scopeの分離 |
| ArtifactDescriptor | Draft要件とG1C-MAPPINGは取得済み、実schema未取得 | native metadata全保持、mask/Tokenizer、全producer、decoder binding、frame/時刻配列とevidence。未知optional保持とunknown required拒否 |
| PipelineProfile | Draft要件のみ、実schema未取得 | 有限step・input/output参照、native数値処理を管理へ移さない、未使用moduleを要求しない |
| ExecutionSnapshot | Draft要件のみ、実schema未取得 | 管理snapshotとnative所有コピー/要求ID/local revisionの分離。入力sample→RGB/evidence参照、実行後traceとの区別 |
| EdgeDecision | 4値判断の担当報告とDraft要件のみ、実validator/判断器未取得 | COMPATIBLE/NEEDS_ADAPTER/INCOMPATIBLE/UNVERIFIED、validation/readinessを別扱い、shape/meaning/binding/静的上限の理由 |

## 管理担当が渡すと照合を再開できる最小原本

1. 21e77完全commitが取得できるrepository/ref、または実source archiveの取得参照・byte数・SHA-256。別repoならそのrepoを明示し、絶対pathだけを配布証拠にしない。
2. 実際の5schemaの全fileと `$id`/version、依存schema、validator/registryと実export・CLI。報告で示した `descriptor.mjs`、`compatibility.mjs`、`contracts/` の実内容とsource閉包を含める。パス名は受領物で確定する。
3. Text/VAE adapterが作成済みなら、その実source/版/export、native要求ID→管理invocation、所有権、保存参照の対応表。未実装ならその状態を明示し、報告済みM1/M2をE2実adapter完成と呼ばない。
4. 58件/37件の実テストsource・実行コマンド・結果・対象commit。実modelを再実行する必要はなく、取得物の境界に必要な回帰だけを選ぶ。
5. 必須semantic/identity/extensionのregistry entry、profile readiness表。G1Cの追加metadataをschemaが落とさず保持することを示すfixture。

これは提供者への具体的な原本要求であり、利用者へ新規実装や同一資料の棚卸しを転嫁するものではない。外部投稿はこの担当から行っていない。窓口が既存handoff経路で渡す。

## E2受領後の情報保全チェックリスト

- **Text**: text `[1,512,4096]` とIDs `[1,L,4096]` を別port条件に対応。mask全位置、元modelとTokenizer hash、top-level mask/evidenceを保持。空文/EOS/PAD/無断切詰め拒否と、ComfyUI構文未対応を変えない。
- **生成sample**: `wan21-raw-generated-sample:v1` とlatentContractの全producer列（順序を維持）、decoder VAE、raw/restored/id/ownerを保持。VAE hashへの付替え・meanへのrelabel・VAE/管理での二重復元は禁止。宣言だけで実生成readyへしない。
- **context**: inputId/inputSha256/contextId/slotId、frame/時刻の配列、順序と重複を保持。F5→T2でも元frame5件を失わず、時刻未記載を0で補わない。欠番slotや正負共有の管理上の順序をnative配列へ混ぜない。
- **strict native境界**: snapshot/owner/build/graph/trace/共通extensionをnative contextやlatentContractへ挿入しない。未知optionalは外側に不透明で保持し、未知必須semanticは依存edgeを保留する。
- **RGB来歴**: RGB tensorのVAE識別に加え、入力sample artifact、全producer/latentContract、decode応答evidenceとのhash付き関連を保存する。RGBの.wktensorだけで生成履歴全体が保存されたと扱わない。
- **要求・所有権**: native works-ai-1とid/raw errorを保持し、管理IDへ明示対応。transfer後viewを再使用しない。旧cancelを新jobへ送らない対象/barrierは管理E3で所有する。
- **profile**: 要素数だけで互換判定しない。既存F1 `[1,16,1,2,2]` の64要素は現Diffusion mean128要素専用profile外。新しい非正方形profileがたまたま128要素でも、`[1,16,2,2,2]` と異なるshape・時間/空間gridを同じprofileとして受け入れない。

このチェックリストはE2の受入条件であり、実adapterに対して実行済みの試験結果ではない。管理M1/M5やnative adapterをこちらで再実装して代替しない。

## 影響edgeとowner

| edge | compatibility / 検証 / readiness | ownerと再開条件 |
| --- | --- | --- |
| G1C native→管理schema/validator | 実schema未取得のためUNVERIFIED、not-verified、blocked | 管理が取得可能な正本を提供、Text/VAEが実内容を照合 |
| Text/VAE native→共通→native adapter | 実adapter未取得、実装状態unknown、not-verified、blocked | 管理がE2実sourceと必要fixtureを提示し、両ownerで情報保全確認 |
| G1C codec→完全な管理package | E4実装/厳密schemaの受入未確認、blocked | 管理がpackage/sidecarを実装、codec ownerがnative保存allowlistとevidence境界を確認 |
| VAE native単独encode/decode | 上記管理正本不足だけでは停止しない | 受入済みprofile・native APIの既存scopeを維持 |
| E6新profileの個別実WASM受入 | 本調査の対象外。管理schema未取得だけでは停止しない | VAE ownerが別成果としてexport/参照/実WASMの結果を提示 |

本担当の変更はこのwork領域の調査報告だけ。repo、native API、kernel、codec、既存fixture、model dataを変更せず、試験・モデル推論・export・push・Page編集・外部コメントを実行していない。
