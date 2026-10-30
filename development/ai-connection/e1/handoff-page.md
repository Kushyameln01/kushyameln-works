A0・L1のLoRA側は、版付きloader／binding／FULL・PARTIAL planner／SDK v1互換fixtureまで実装しました。総合仕様書1.1-draft.1を参照し、実Diffusionのbase・graph・consumerとの接続は、必要な正本を取得後に別途受け入れます。原本登録・重み計算・STAGED・実consumer適用・管理snapshot公開は別状態です。

# A0 L1の接続契約と取得物

実装commitは `89b489c6f2595ebff8836fe90b18fc94e3ea086b`、descriptorと結果の識別を確定した配布commitは `2bba90785292e42a0c7c8756685b0d8b128b2dcf`。native契約は `lora-connection/2.0-draft.1` です。GitHubへは未pushですが、下のarchiveに該当sourceと完全commitを復元するGit bundleを収録しています。原本.safetensorsは含めません。

[LoRA A0 L1 source archive and git bundle](library-file:fde1_bGliZmlsZV9FbmlaS1d6WXdreGJjNEkwdl9LVHRR_FileDrive_b89fdc3d58488191a2f39a7f919a4623)

archiveは255,467 bytes、SHA-256 `10e4993c3e5c6e6e4ca7cc7bed4bae10cdc21e022b1a8b85d4ec12e95541f1eb`。展開後も74 fixtureとinventory由来の計画検証が通りました。Git bundleの基点は `029ce9336a61e53bc6172fa4a7b7189b15f2efa0`、取込手順は `handoff/README.txt` です。

[LoRA connection contract 2.0-draft.1](library-file:fde1_bGliZmlsZV95SWRnNmtaV0ZubVQ2R01Yb2FXTHpR_FileDrive_b89fdc3d58488191a2f39a7f919a4623)

[LoRA v2 registry correspondence](library-file:fde1_bGliZmlsZV81UkZlSjJMMzJtdnA1aXltcVljdi1n_FileDrive_b89fdc3d58488191a2f39a7f919a4623)

[LoRA A0 L1 immutable delivery receipt](library-file:fde1_bGliZmlsZV91b3E0WXlVeDVoVmdsbXpRUEw1b1JB_FileDrive_b89fdc3d58488191a2f39a7f919a4623)

[LoRA A0 L1 verification result](library-file:fde1_bGliZmlsZV9ndzlmOVhMRV9wUU5XS1lrdEJMZFdn_FileDrive_b89fdc3d58488191a2f39a7f919a4623)

| 正本 | archive内部のpath | SHA-256 |
| --- | --- | --- |
| v2接続契約 | development/lora/contracts/connection-contract-v2.json | 87e132af1739114f171254888c04f3050df27c47cd02e92fd67bc5babe4ac6d2 |
| 原本台帳 | development/lora/contracts/original-inventory.json | 97229d6ea17738dc983fa898a38e771a784aeafff9513734c5af0ba0250c23b3 |
| registry対応 | development/lora/contracts/registry-correspondence-v2.json | a3a0a6fd7c5d71cbf8c2e4b73f83d4581df47c1a5b8ab09a9cb48778ce81b3ab |
| API・v1差分 | docs/shared/inference/lora/CONNECTION_V2.md | 詳細receiptとsource identityを参照 |
| 検証結果 | development/lora/A0_L1_RESULT.md | a1a133cf36daa78bc952b553deec4d54b298ec430d7456933101ab8aed3a8148 |

旧v0.1案とinventoryはbyte同一のままarchiveにも収録しました。4原本の再棚卸し・全体hash再計算は行っていません。

# 対応範囲

loaderは固定ComfyUI commit `b5a432157de6b8884f81104cd02926adf4d597e4` のsubset、policy ID `comfy-lora-b5a4321-linear-diff-v1`。標準2D down/up、A/B、加算diff、diff_bを扱います。alphaありはalpha/rank、省略時1はこのpolicyのLinearに限定し、diff/biasはstrength×deltaです。未知tensor／variant、Conv・派生方式、転置・融合・量子化base直接入力を拒否します。

bindingはruntime-input／initializer／hike-parameterを別々に保持します。既存numeric SDK v1とplannerは未変更。版付きv1 adapterはFULL・真のinitializerに限定し、shape／revision／native hashを明示変換します。boolean検証はlegacy-booleanの証拠として保持し、実モデル合格へ昇格させません。

PARTIALは元full shape、選択row slice、対象patch、除外target／region、原本hashを保持します。参照Q診断はfull [5120,5120]のrows[0,16)、全入力列です。lightは同Qのdown/up・alphaと明示bias sliceを含み、他1050 patchと選択Qの残りrowを除外します。全201 diffは診断範囲外です。detailは同QのA/Bを含み、他399 patchと残りrowを除外します。未知tensorは除外領域にあっても拒否します。

# 検証と資源寿命

LoRA関連74/74 fixture、Chromiumパネル12項目PASS。実Hikeとtiny synthetic非ゼロ不変baseで、倍率・範囲・強度0/負数・取消・旧plan失効・scope改変拒否・v1 bridge・commit失敗復帰・bytes所有を確認しました。独立レビューの指摘は回帰fixture付きで修正済みです。以前の実adapter＋synthetic zero base slice試験、今回のsynthetic非ゼロfixture、実base比較は別scopeです。

preparedはin-use・復帰未完・有効lease中にreleaseできません。consumerの独立copy後、またはlease終了後にreleaseできます。失敗したrollback／sink.abort／releaseは所有権とcleanupを保持して再試行します。取消はbounded Hike呼出し後の協調停止で、要求と停止終端を区別します。

# Diffusionと管理への引継ぎ

Diffusionから、完全commit/build、実binding registry、原本full shape・slice対応、不変F32 providerとFP8復号profile、実package/feed sink、scope付き検証・誤差、commit/rollbackの現在性検査とcopy/lease条件が必要です。これらを取得後、実base小blockへの適用を検証します。実base比較・実session適用・生成結果への寄与は未検証です。

管理にはsdkInstanceId、pair/side、原本hash、local revision、planId／registryHash／bundleHash、coverage/scope、PREPARED／STAGED／CONSUMER_APPLIED、所有権・取消・復帰情報を渡します。managerRevision、Diffusion通信revision、SDK local revisionは別系列です。SDK結果はgenerationReady:falseで、snapshotを公開しません。旧パネルはv2/staging-only接続を拒否し、v1完了もconsumer処理と表示します。

初期対象はlight/detail各HIGH/LOW一組の選択・切替です。L2の全target受入は各組を別々に実consumer成立後に行います。二組同時合成、全モデル推論、公開は含めません。

# 旧v0.1時点の照合記録

以下はA0・L1実装前の記録です。「未実装」「コード差分なし」はその当時の状態を表します。現行のLoRA側契約と実装状態は上記v2と配布archiveを参照してください。

## 版と整合確認

仕様案は `lora-connection-draft/0.1`、元コードは `a33b311e45a75a6c683242286fef608c7b3770a9`。今回照合したDiffusion実装は `029ce9336a61e53bc6172fa4a7b7189b15f2efa0` です。

| ファイル | bytes | SHA-256 |
| --- | ---: | --- |
| connection-contract-v0.1.json | 18858 | f00b469cb32dd620a292007178feb10b135ddb4022a934df38876b754ee579e6 |
| original-inventory.json | 495806 | 97229d6ea17738dc983fa898a38e771a784aeafff9513734c5af0ba0250c23b3 |

4原本の全体hashは完了済み記録を再利用しました。原本への書込みは行わず、保存先・容量を照合しています。今回新たに原本全体をhash計算したという意味ではありません。

## 現在の接続範囲

Diffusionは `inspectLora/loadLora/listLoras/readLora/readLoraSource/unloadLora` と `createLoraSource` を提供します。保存bitsを維持する重みI/Oであり、`loraWeightIO:true` / `loraApplied:false` です。

F32 runtime-weight consumer、実graph binding、immutable base block provider、package sink、prepareLoad/validate/commit/rollbackは未提供です。これらの変更を双方合意済みとして実装しません。

## 接続担当へ確認する項目

- 実targetのbinding種別は runtime-input / initializer / hike-parameter を区別する。

- 新診断planは原本hash・slice・対象patch・除外target・coverage PARTIALを持ち、現full planへ偽装しない。

- loaderPolicyId、対応variant、base識別、FP8復号profileを固定する。

- HIGH/LOW別instanceのローカルrevisionと、管理snapshotの共通revisionを別々に対応付ける。

- STAGEDと生成可能snapshot公開を分け、prepared解放後のsession bytes所有またはleaseを明記する。

全モデル推論・二組同時合成・公開は今回の工程に含めません。

## 取得ファイル

[connection-contract-v0.1.json](library-file:fde1_bGliZmlsZV9FdjBsSklnUWlkTk04dmREQnNwSFVB_FileDrive_b89fdc3d58488191a2f39a7f919a4623)

[original-inventory.json](library-file:fde1_bGliZmlsZV80Y2luVDJZQmtJQ1FXclQ2Nm5YdzJR_FileDrive_b89fdc3d58488191a2f39a7f919a4623)

[LoRA接続引継ぎ v0.1 JSON2件とmanifest](library-file:fde1_bGliZmlsZV85Wi0yMmtIaFBMS2FvQXlRNjhKemxR_FileDrive_b89fdc3d58488191a2f39a7f919a4623)

ZIPにはJSON2件とmanifestを収録しています。ZIP SHA-256: `e6262ef2460b2f74709ba82db291503829d4497e5f13aee2eb201578c20cee86`。保存されたFilesのSHA-256は、ローカルの配布候補と一致しています。

このPageへの格納・取得経路の準備と、接続担当の受領・設計合意は別です。担当者の受領確認や新consumer契約の合意は、まだ記録されていません。

## Diffusion実接続口との照合

照合対象は `029ce9336a61e53bc6172fa4a7b7189b15f2efa0`。保存済み棚卸しと実target表の論理名・shape照合ではlight各1,052 patch、detail各400 patchに不一致はありませんでした。これは元ヘッダー由来の対応表との一致であり、実graph bindingやbase学習元適合の証明ではありません。

HTTP配信したChromium154で合成ファイルを使い、source capability、HIGH/LOW別binding、保存bytes、登録hash照会、実SDK.inspect、解除後の旧source拒否、無関係LOW登録保持の7項目を確認しました。実4原本の再hash・再棚卸し、prepare/apply、実base試験は行っていません。現SDK32テストも合格しています。

## 必要差分と開始条件

| 対象 | 確認済み／必要な変更 | 状態 |
| --- | --- | --- |
| source I/O | createLoraSourceのsize/read/hashは実仕様と一致。high/low→HIGH/LOWは明示変換。pairId、原本hash、bindingId、強度、base宣言、snapshotは管理側で対応付ける | 相互整合を確認済み。既存sourceを重複実装しない |
| registry | runtime-input／initializer／hike-parameterを区別。実graph・tile・parameter・dtype／scale／profileが必要 | 演算consumerの版付き仕様待ち |
| planner／validator | 現full planを維持し、PARTIAL診断planを別定義。runtime inputをgraphInitializerへ偽装しない | 実target／patched F32入力口の確認後 |
| loader policy | fixed ComfyUI版、downUp／AB Linear、diff／diff_bと倍率をpolicy IDに束縛。省略alpha=1は当該規約だけ | 対向の明示policy ID受領待ち |
| snapshot | HIGH／LOW別instanceのlocal revisionと管理revisionを別対応。登録完了、STAGED、生成可能snapshot公開を区別 | 管理／consumer commit仕様待ち |
| 実base小block試験 | 強度0・解除・協調取消・片side失敗・旧rollback・bytes所有／lease・prepared解放 | consumerと実base block提供後 |

新HIGHの登録成功後、新LOWの登録が失敗すると、現I/Oの2slotは混在し得ます。登録を生成snapshotの公開と見なさず、両sideの対応が揃うまで管理側の生成受付を閉じます。

## PARTIAL診断案

候補は `diffusion_model.blocks.0.self_attn.q` の出力行[0,16)、全5120入力列です。元weightは[5120,5120]。入力列を省略して別の行列積にしません。

lightは正確なtensor名 `.lora_down.weight`、`.lora_up.weight`、同stemの `.alpha` と `.diff_b` のbias[0,16)を対象にします。全201件の `.diff` は独立Q射影の外として除外します。完全除外patchは1,050件です。

detailは同stemの `.lora_A.weight`／`.lora_B.weight` を対象とし、399 patchを完全除外します。各原本hash、exact tensor名、対象sliceと全除外target一覧は添付JSONに保持しています。

さらに、両組のQ weight rows[16,5120)×columns[0,5120)、lightのQ bias indices[16,5120)も未適用領域として `excludedRegions` に明記しました。coverageはPARTIAL、completeAdapter=falseです。現full plannerへ偽装して通さず、未提供の新consumerがこの診断入力を受けることを確認してから実装します。

## 実装前に必要な対向回答

source commit/build、実targetとbinding種別、loaderPolicyIdとvariant、base block／FP8復号profile、patched F32入力口、package種別、検証scopeと誤差、session bytes copy／lease、stage・publish・rollback権限を版付きで提示してください。現mainはこれらの演算consumerを未実装と明記しており、合意済みとして補作しません。

管理側では二組を選択・切替として扱い、同時合成を追加しません。STAGEDだけのadapterを、apply返却直後に「適用しました」と表示する現パネルへそのまま接続しません。

実base適合、実base重み準備、実consumer／session適用、生成結果への寄与は未確認です。今回の製品コード差分・push・公開・全モデル推論・同時合成はありません。

[Diffusion実接続口との照合と次の実装候補 v0.1.2](library-file:fde1_bGliZmlsZV9CRHEzM1l3ZjhTWHE3UHZwckdaWnRB_FileDrive_b89fdc3d58488191a2f39a7f919a4623)

照合資料v0.1.2 SHA-256: `1351ee151d3385f8f07812ba504579508aa42a8cc035261f7d9b6b1ca03bb214`。v0.1の配布2JSONとZIPは変更していません。
