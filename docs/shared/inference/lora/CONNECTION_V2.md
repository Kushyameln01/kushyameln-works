# LoRA connection v2 — A0/L1

Native contract: `lora-connection/2.0-draft.1`。既存の [SDK v1](README.md) と別の入口を追加する契約である。総合接続仕様書 `1.1-draft.1`（Page `page_65b303c9bc708191a7e48c78b51c35a7`、取得時sequence 1）のLoRA担当範囲を扱う。

この契約の実装と、Diffusion実graphへの結合合格は別である。実baseのprovider・registry・consumerは取得後に受け入れる。A0/L1ではfixture、Hike重み計算、test consumerまでを検証し、実base適合・実session適用・生成結果への寄与は未検証として残す。

取得・実行依存・検証command・必要生成物と再build手順は [REPRODUCE.md](../../../../development/lora/REPRODUCE.md) にまとめている。作業branchは `feat/lora-hike`。

## 正本と取得先

| 正本 | repository内のpath | 用途 |
| --- | --- | --- |
| v2契約 | `development/lora/contracts/connection-contract-v2.json` | loader、registry、plan、consumer、寿命、互換境界 |
| 以前のv0.1案 | `development/lora/contracts/connection-contract-v0.1.json` | 未合意だった設計案をbyte同一で保持 |
| 原本台帳 | `development/lora/contracts/original-inventory.json` | 4原本の全体hash、rank/alpha/diff/biasの既存棚卸し |
| 論理対応とbinding要件 | `development/lora/contracts/registry-correspondence-v2.json` | cached header対応と実registryに必要な情報 |
| binding例 | `development/lora/contracts/registry-binding-examples-v2.json` | `DIAGNOSTIC_FIXTURE_NOT_REAL_GRAPH`と明記した例 |
| descriptor | `development/lora/contracts/module-descriptor-v2.json` | native APIを変更しない外部記述。最終source identityは引継ぎreceiptで確定 |
| 実装と結果 | `development/lora/A0_L1_RESULT.md` | 完全commit／archive receipt、試験scope、未達事項 |

完成したsourceの完全commitと、取得可能なarchive/hashは引継ぎreceiptで固定する。作業端末内の絶対pathだけを取得先にはしない。モデル本体をarchiveへ含めない。

既存v0.1案は18,858 bytes、SHA-256 `f00b469cb32dd620a292007178feb10b135ddb4022a934df38876b754ee579e6`。原本台帳は495,806 bytes、SHA-256 `97229d6ea17738dc983fa898a38e771a784aeafff9513734c5af0ba0250c23b3`。これらは既存ファイルをそのまま保存した値で、4原本を再hash・再棚卸ししたという意味ではない。新たにDiffusionの`loadLora`を実行する際の必須全file hashは省略しない。

## SDK v1との差

| 項目 | SDK v1 | v2 |
| --- | --- | --- |
| 入口 | `sdk.mjs`、numeric `apiVersion:1` | `sdk-v2.mjs`、文字列contractVersion |
| target | `graphInitializer`必須 | `binding.kind/name`を明示 |
| binding | 実initializerの対応を前提とする | runtime-input、initializer、hike-parameterを区別 |
| loader規約 | 現コードのalpha省略倍率1 | 明示policy IDと対応variantで規約を固定 |
| plan | 原本内全patchの対応が必須 | FULLと独立したPARTIAL診断 |
| 検証 | `validate(...) === true` | plan/hash/coverage/scope付きの構造化結果 |
| 適用状態 | v1 transaction完了 | PREPARED、STAGED、CONSUMER_APPLIEDを明示 |
| snapshot | consumerと管理側の責任 | v2でも管理側の責任。SDKは公開しない |
| 寿命 | consumerの独立bytes所有を要求 | 明示copy receiptまたはlease、復帰未完の保持 |

既存v1の入口とboolean検証の意味は維持する。版付きadapterは真のinitializerとFULLに限定する。runtime入力名を`graphInitializer`へ詰めたり、boolean trueからPARTIALの検証証拠を作ったりしない。adapterで保持する`legacy-boolean`の証拠水準を実モデル検証へ昇格させない。

`adaptV1Registry(registry,{side,executionProfileId,loaderPolicyId})`、`createV1SinkAdapter(sink,{registry: nativeV1Registry})`、`adaptV1Consumer(target,{side,executionProfileId,loaderPolicyId,validationScope:'full-adapter',ownership})`を明示して使う。sinkとconsumerは同じnative registryを参照し、fullShapeとlocal revisionをv1のshapeとrevisionへ変換する。v1のregistry／adapter-set／bundle hashと元v2の識別は別に保持する。candidateはadapter所有のopaque handleで、元のnative識別はrollbackでも変更しない。独立copy／leaseはconsumerの明示契約であり、adapterが任意session内部の所有bytesを検査できるという意味ではない。

v2のmetadata identityはnative v2固有の再帰key順整列JSON／UTF-8／SHA-256で、v1は従来のJSON.stringify方式を維持する。このnative identityを管理snapshotのJCS適合・相互hash合意として流用しない。

## 固定loaderと対応variant

Policy IDは `comfy-lora-b5a4321-linear-diff-v1`。参照はComfyUI commit `b5a432157de6b8884f81104cd02926adf4d597e4` の次の箇所である。

- `comfy/weight_adapter/lora.py:160`以降：down/up、A/Bの対応。
- 同`:248`以降：alphaありはalpha/rank、省略時は1。
- 同`:267`以降：UP×DOWNの積と元weight shapeへの対応。
- `comfy/lora.py:45`以降：scalar alpha読取。
- 同`:76`、`:83`以降：`.diff`、`.diff_b`読取。
- 同`:537`以降：加算差分へのstrength適用。

| variant | 原本tensor | rank／倍率 | 対象 |
| --- | --- | --- | --- |
| `linear-down-up` | `.lora_down.weight`／`.lora_up.weight` | DOWN `[rank,in]`、UP `[out,rank]`。明示alphaはstrength×alpha/rank | 2D Linear weight |
| `linear-a-b` | `.lora_A.weight`／`.lora_B.weight` | AがDOWN、BがUP。同じ倍率規約 | 2D Linear weight |
| `additive-diff` | `.diff` | strength×delta。rank/alphaを掛けない | 対応する1D/2D weight |
| `additive-diff-b` | `.diff_b` | strength×delta。rank/alphaを掛けない | 対応するbias |

alpha省略時のscale=1は、このpolicyを明示した標準Linearの範囲に限定する。alpha=0や負数は省略ではなく実値である。rankはfactor shapeから検査し、不明倍率をmetadata・ファイル名・shapeの推測で補わない。sourceはBF16/F16/F32、LoRA boundaryのbaseと出力はF32 row-majorである。

転置・融合・Conv低rank・DoRA/LoHa/LoKr/mid/reshape・量子化されたbaseの直接入力は未対応で拒否する。元loader全体の対応形式を、このsubsetの対応済み一覧へ流用しない。FP8等の復号はDiffusionが所有する明示profileを通して行い、LoRAへowned F32を渡す。

ここでのbias対応は加算差分`.diff_b`であり、一般のbias学習方式を受理する宣言ではない。強度は呼出し側の明示入力とし、旧workflowのHIGH=3/LOW=1をlight/detailの既定値へ流用しない。

## bindingとregistry

```javascript
{
  contractVersion: 'lora-connection/2.0-draft.1',
  modelHash, graphHash, registryVersion,
  side: 'HIGH', executionProfileId, loaderPolicyId,
  targets: [{
    key: 'diffusion_model.blocks.0.self_attn.q.weight',
    weightId, module: 'diffusion_models',
    shape: [5120, 5120], // 元のfull shape
    dtype: 'F32', layout: 'row-major', parameterRole: 'weight',
    binding: {kind: 'runtime-input', name: actualWeightInputName},
    transform: {kind: 'identity'}
  }]
}
```

`runtime-input`はORT等への実weight feed、`initializer`は実graph/packageのinitializer、`hike-parameter`はHikeのbias等の実引数に対応する。bindingのnameだけでは実session適用の証拠にならない。対象graph/build、operatorの順序・layout、packageまたはfeedの生成、copy/leaseまでconsumerの正本で確認する。

現v2のtransformはidentityのみ。registry entryへtranspose、quantization、任意sliceを付けて通さない。LoRA診断の明示row sliceは下記の別引数で指定する。binding例の繰返しa/b hashや名前はfixture専用で、実base/graphの不明値を埋めるためには使わない。

## FULLとPARTIAL

```javascript
const plan = await sdk.plan({
  selection: {pairId: 'light', noise: 'high'},
  strength, registry, loaderPolicyId,
  diagnostic: {targets: [
    {key: qWeightKey, slice: {startRow: 0, rowCount: 16}},
    {key: qBiasKey,   slice: {startRow: 0, rowCount: 16}}
  ]}
});
```

診断は連続した出力rowと全入力columnに限定する。`fullShape:[5120,5120]`を保持し、出力tile `[16,5120]`へ元shapeを書き換えない。baseProviderのoffset/countはfull baseに対する要素単位で、byte単位ではない。weight row rのoffsetはr×5120、bias index rのoffsetはrである。

PARTIALは`coverage:'PARTIAL'`、`completeAdapter:false`を持つ。含むpatch、対象外target、選択したtarget内の対象外row、元原本hashを保持する。全原本tensorを先に分類・構造検査するため、選択外の未知tensorも拒否する。FULLを要求する旧planへ部分registryを渡して、欠落を無視する方式にはしない。

Berniniの単一Q射影をrow `[0,16)` で診断する場合の対応は次のとおり。これは選べる診断scopeの説明で、実base計算を済ませたという意味ではない。

| 組 | 含むpatch | 除外 |
| --- | --- | --- |
| light各side | `blocks.0.self_attn.q`のdown/up、alpha128、同Qの`.diff_b[0:16]` | 他404低rank、全201`.diff`、他445`.diff_b`。選択Q内のrow/index `[16,5120)`も除外 |
| detail各side | 同QのA/B、rank64、固定policyによるalpha省略規約 | 他399低rank。選択Q内のrow `[16,5120)`も除外 |

lightのQ weight自体には`.diff`は存在しない。biasを診断に含める場合は`.diff_b`を明示選択する。weightだけを選ぶ診断でbiasを計算済みと扱わない。原本台帳の全体hash一致、論理target名/shape一致、実graph binding、数値一致、生成結果への寄与は別々の判定である。

`tools/lora/check-inventory-plan-v2.mjs`は保存済みinventoryと既存の論理target shapeからschema fixtureを再構成する。`development/lora/contracts/inventory-plan-fixture-v2.json`のscopeは`RECONSTRUCTED_INVENTORY_SCHEMA_FIXTURE_NOT_RAW_HEADER_NOT_REAL_BASE_OR_GRAPH`であり、実headerの再読取、Hike計算、実base比較ではない。

## consumerと状態

`createLoraV2({folder,sourceFactory,kernel})`は`inspect / plan / prepare / stage / cancel / release / recover / dispose`を持つ。`sourceFactory(selection)`を使う場合はsize/read/hashを返す。`plan`は原本hashを必須にし、呼出し時に捕捉した選択・原本・registryと結び付ける。

`prepare`は不変baseから再計算し、Hikeの実低rank積／diff加算を行い、sinkへowned blockを渡す。manifestとhandleの返却状態はPREPAREDである。強度変更は不変baseから再構築し、適用済み重みへ再加算したり差分を引き戻したりしない。

`stage(prepared, consumer, {signal,isCurrent})`のv2検証結果は次を持つ。

```javascript
{
  contractVersion: 'lora-connection/2.0-draft.1', valid: true,
  coverage: 'PARTIAL', scope: 'diagnostic-projection',
  planId, registryHash, sourceSha256
}
```

FULLのscopeは`full-adapter`。検証結果がpreparedの識別・coverage・scopeと一致しなければcommitしない。commit receiptは同じ版とplanId、`state:'STAGED'|'CONSUMER_APPLIED'`、所有権を持つ。STAGEDはconsumerへの実適用完了ではない。CONSUMER_APPLIEDでも検証scopeを維持し、PARTIALから全adapterや生成へ昇格させない。SDK結果の`generationReady`はfalseで、SNAPSHOT_PUBLISHEDは管理側から別に通知する状態である。

既存v1パネルへv2/staging-only adapterをそのまま接続しない。原本登録、検査、PREPARED、STAGED、consumer適用、管理snapshot公開をそれぞれの証拠に対応させる。Hike計算だけで「適用済み」と表示しない。

## 資源の寿命と取消

- source Fileはcallerが選択した不変参照。原本のbytesを書き換えない。
- baseProviderは不変baseからowned F32 blockを返す。sinkはwriteBlockの応答前にcopy/保存を完了する。
- preparedはconsumer処理中にreleaseできない。consumerの独立copy receipt、または必要bytesの寿命を保持する有効leaseを要求する。
- leaseが有効な間はpreparedの必要bytesをreleaseしない。consumerがlease利用を終えてからreleaseを再試行する。
- rollback失敗時はRECOVERY_REQUIREDとしてpreparedを保持する。`recover(prepared)`で復帰を再試行し、成功するまで通常releaseへ進めない。
- begin途中等でsink.abortが失敗した場合もcleanupを保持する。`recover()`またはdisposeで再試行し、成功前の新transactionを拒否する。
- release失敗は所有権を保持して再試行できるようにする。disposeは進行中の協調停止と必要な解放を待つ。
- 取消はbounded Hike呼出し終了後のblock/async境界で行う。Promiseの破棄だけを計算停止・資源解放と呼ばない。

consumerはcommitの切替直前にもrevision/abort/currentを検査し、古いrollbackが新activeを上書きしないようにする。LoRA単体の検査は管理側の比較・公開処理を代行しない。別Memoryの同じpointer値を共有handleとして返さない。

## 管理・Diffusionへ渡す情報

管理にはsdkInstanceId、side、原本hash、pairId、local input/application revision、planId、registryHash、coverage/scope、prepared/bundle identity、状態、所有者・lease、取消／復帰の終端を渡す。managerRevisionやDiffusion inputRevisionと数値を同一視せず、対応表を保持する。

Bernini参照profileではHIGH/LOWに別SDK instanceを使い、light/detailは一組の選択・切替として扱う。共通Module/Artifact規格へHIGH/LOWやlight/detailを全module共通enumとして強制しない。moduleはnative APIで単独利用でき、管理側のdescriptor/queue/snapshotをimportしない。

Diffusionから必要なのは、完全source commit/build、実binding registry、不変F32 providerとFP8復号profile、実package/feed sink、scope付きconsumer検証と許容差、commit/rollbackの権限・現在性検査、copy/leaseと解放条件である。これらを取得後に実base小block比較へ進む。L2ではlight/detailを別々に全target受け入れし、全モデル推論・二組同時合成・公開は別工程とする。
