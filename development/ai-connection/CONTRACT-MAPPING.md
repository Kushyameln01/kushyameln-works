# LoRA–Diffusion E0/E1 実契約の対応

2026年10月31日 JST更新。**実public APIを取得し、版付きadapterによる実行可能な接続を確認しました。** 対向はDiffusion `438972f30242e0a3bc66edb8591f38eaa0fcd384`、HIGH試験のLoRA runtimeは `4d5fd7363f40f0d743ead448193ef2bf1915bbdc` です。HIGHの実base×実LoRA light/detail計10caseがPARTIAL診断を通過しました。LOWも同一製品コードで10case成功し、runner固定commit `e1f03a4f6092c3154d5b47f166b77bbd32897ac9` と全結果は[共同試験結果](JOINT-LORA-RESULT.md)で別に記録します。

総合仕様 `1.1-draft.1`（sequence1・198blocks）と実行計画 `0.2-draft.2`（sequence2・134blocks）の取得版、file hashとsource URLは[現在のsource baseline](SOURCE-BASELINE.md)と[current-peer-source-manifest.json](evidence/lora-e0/current-peer-source-manifest.json)に固定しています。

## 固定した実装と識別子

- LoRA native: `lora-connection/2.0-draft.1`。接続実装は[diffusion-diagnostic-adapter.mjs@4d5fd736](https://github.com/Kushyameln01/kushyameln-works/blob/4d5fd7363f40f0d743ead448193ef2bf1915bbdc/docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs)、adapter版 `lora-diffusion-diagnostic-adapter/0.1`、SHA-256 `bcea7b495e819d1e1052543f36cbdad0ed8515e74bd8914cf66dc03b093c6e4f`。
- Diffusion native: [DIAGNOSTIC_API.md@438972](https://github.com/Kushyameln01/kushyameln-works/blob/438972f30242e0a3bc66edb8591f38eaa0fcd384/docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md)、[diagnostic-base.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/438972f30242e0a3bc66edb8591f38eaa0fcd384/docs/shared/diffusion-models/lora/diagnostic-base.mjs)、[diagnostic-consumer.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/438972f30242e0a3bc66edb8591f38eaa0fcd384/docs/shared/diffusion-models/lora/diagnostic-consumer.mjs)。
- Diffusion wire `diffusion-models/0.1`、registry `bernini-diagnostic-registry/0.1`、profile `bernini-q16x5120-f32-wasm-v1`。元f522のbase/provider・consumer・identity実装とbyte同一ですが、build IDは採用438のものを保持します。
- 元Q weightは `blocks.0.self_attn.q.weight`、full `[5120,5120]`。選択は16行・全5120列、biasは元 `[5120]` から同じ16行。weightは `runtime-input:weight`、biasは `hike-parameter:bias` です。

## 実adapterの署名と責任

```js
createDiffusionDiagnosticAdapter({
  consumer, baseProvider: nativeProvider, isOwnerCurrent
})
// => {registry, baseProvider, createSink(plan),
//     targetForPlan(plan, {x,expected,tolerance}), finalize(plan),
//     restoreBase({x,expected,tolerance,signal,isCurrent}),
//     run({x,signal}), describeBinding()}
```

factoryの `isOwnerCurrent` は必須です。consumerはdescribe/createSink/prepareLoad/validate/commit/rollback/prepareBase/releaseCandidate/run、providerはreadBlockを持つ実native objectを渡します。consumer/stage/providerはcaller所有で、このadapterのために他moduleの資源をdisposeしません。

| 境界 | LoRA v2の実契約 | adapterが行う実変換・照合 |
| --- | --- | --- |
| registry | full logical `shape`、identity transform、strict既知field | native fullShapeをLoRA shapeへ対応。nativeのselected shape/row-slice/FP8 descriptorを保持し、SDK connection registry hashとnative registry hashを別々に検査 |
| providerの座標 | `readBlock(weightId,offset,count,context)` のoffset/countは元full tensorのF32要素 | weightでは `fullOffset-rowStart*5120`、biasでは `fullOffset-rowStart` に変換。選択範囲内を検査しnative model/graph/registry三hashを注入 |
| sink manifest | SDK plan/source/loader/coverage/scope/bundleHashを持つ | SDK identityと実write列を照合し、native `{modelHash,graphHash,registryHash,side,scope:'PARTIAL'}` へ対応。二つのhashを付け替えない |
| sink block | fullShape、slice、binding、元full内offset、F32 bytes/hash | key/role/binding/fullShapeを照合。offsetをslice内へ変換し、native selected `shape:[16,5120]` または `[16]` を渡す。各入力をawait前にcopy |
| detailのbias | detailはQ weightだけを計算し、bias patchを持たない | finish時にnative不変baseのbias16値を読み、実bytes/hash付きでpass-through。LoRA加算と別の `immutable-base-pass-through` 証拠として記録 |
| validation | SDK scope `diagnostic-projection`、plan/registry/source識別を要求 | `targetForPlan` がx5120/独立expected16/toleranceをowned snapshotにし実native validateへ供給。native `PARTIAL` receiptとcandidate/package/graph/model/registry/sideを検査してSDK receiptへ包む |
| commit | `CONSUMER_APPLIED` と所有receipt、SDKのpost-commit現在性確認 | nativeの実commit/epoch/packageを確認。native prepareLoadの独立feed copyへ結び付く `ownership:{kind:'independent-copy',ownerId}` とnative receiptを返す |
| 候補解放 | SDKのpost-commit検査後も失敗復帰が必要な間はrollback履歴を保持 | `finalize(plan)` でnative releaseCandidateを呼ぶ。prepared package releaseとcandidate履歴解放を分け、active feedの所有copyを保持 |

LoRA SDKの `createLoraV2({folder,sourceFactory,kernel})`、`plan(input)`、`prepare(plan,{baseProvider,sink,blockRows,signal})`、`stage(prepared,target,{signal,isCurrent})` をそのまま呼びます。v1のinitializer/FULL経路へruntime-input/PARTIALを通しません。HIGH試験の実v1 adapter拒否も結果に記録しています。

## 現在性、取消、復帰、所有権

通常dispatchのnative `isCurrent` は **factoryのowner現在性と、stage invocationの現在性callbackの両方**がtrueのときだけtrueです。adapterはcallbackとidentityをawait前に捕捉し、native descriptorの差替えも検査します。

取消はinvocationを失効させますが、同じownerが自分のcandidateを片付ける権限は残ります。adapterはprepareLoad時にcleanup contextを保持し、rollbackにはowner現在性を使います。native consumerのcandidateId/active epoch照合が、古いrollbackによる新feedの上書きを防ぎます。owner自体が失効したcleanupには復帰権限を与えません。この区別により、実native commit後にSDK側で取消を検出した場合も、当該candidateの旧feedへ戻せます。HIGHのlight/detailでこの経路を確認しています。

解除相当のbase復帰はnative v2に存在しないdetach methodを呼ばず、`adapter.restoreBase({x,expected,tolerance,signal,isCurrent})` で実行します。明示current callbackを要求し、不変baseからnative prepareBase→独立参照によるvalidate→commit→最終current確認を行います。失敗時は保持したcleanup contextでnative rollbackし、成功後にcandidate履歴を解放します。片側のPARTIAL診断であり、管理snapshotの公開や両sideの原子的切替を意味しません。

native sink package→candidate→active feedは実owned copyです。準備済みpackageや成功candidateの解放後もactive feedが有効なことを実試験で確認しています。このconsumerにないlease機能は作らず、lease対応consumer一般へのSDK制約とは区別します。

## 実base検証と数値profile

native providerは元Fileのheader/file size、Q shape、actual config、positive scalar scale、読んだrangeを検査します。F8_E4M3→Hike F32復号×F32 scale、bias F16→Hike F32、実ORT WASM1.24.3 Gemm→Hike biasというprofileです。native `baseVerification.fullFileSHA256Verified:false` は保持し、外側の元File全体hash/coverage/stat binding receiptを別証拠として結び付けます。HIGHは全15,574,833,216 bytesのSHA-256と試験前後の同一性を確認済みです。

HIGH試験は事前にstrength `0,1,-1`、選択weight全81,920値、bias全16値、projection全16値を比較するgateを固定しました。weightは `abs1e-5+rel1e-4`、bias/base decodeは厳密一致、projectionは `abs1e-6+rel1e-5` です。detailの実base bias pass-throughも比較します。全体結果、独立oracle、input/hash、build/kernel、各caseの誤差、取消/復帰の記録は[共同試験結果](JOINT-LORA-RESULT.md)を参照します。旧合成74件やDiffusion単体試験との件数合算は行っていません。

現在の実行可能性はQ16×5120のPARTIAL診断で確認したものです。scope `diagnostic-projection`、`completeAdapter:false`、`snapshotPublished:false`、`generationReady:false` を保持します。全target、実model全session、生成への寄与はE9の別条件として残ります。

## 初回監査の履歴

以下は2026年10月31日 JST、対向source取得前のread-only監査原文です。「未取得」「未実行」「still needed」「blockers」はその当時の状態を表し、現在の接続状態には適用しません。旧file/stat観測も当時のmetadataです。

<details>
<summary>初回E0/E1 readiness audit（更新前の原文）</summary>

# LoRA–Diffusion E0契約対応の追補

**状態: LoRA側の原文確認済み、指定Diffusion原本未取得。相互適合・合意は未確定。**

# E0/E1 local LoRA readiness notes

Audit scope: read-only source/contract review at LoRA commit `2bba90785292e42a0c7c8756685b0d8b128b2dcf`, native `lora-connection/2.0-draft.1`. Execution plan: Page `page_cfdb3e2026608191964eb24af5c64e61`, `0.2-draft.1`; common contract: Page `page_65b303c9bc708191a7e48c78b51c35a7`, `1.1-draft.1` (versions supplied by coordinator). No product edits, original content reads, original rehash, inventory regeneration, synthetic suite run, real-base calculation, or joint consumer trial was performed for this audit.

## E0 state and limits

Local native LoRA interface can be compared against an obtained Diffusion peer. Peer `f522d9…` implementation/signatures were unavailable during this audit. Old available I/O code and prior test consumers do not establish this peer's real registry, full-F32 provider, PARTIAL consumer, stage/reset authority, numerical tolerances, or session ownership. No counterpart signatures or binding names are inferred here. E0 is a bounded partial finding; E1 real joint trial is unexecuted.

Read sources: `docs/shared/inference/lora/{sdk-v2.mjs,planner-v2.mjs,loader-policy.mjs,v1-adapter.mjs,CONNECTION_V2.md}`, `development/lora/contracts/{connection-contract-v2.json,original-inventory.json,cached-header-planner-evidence.json}`. Supporting byte/element and owned-output behavior was checked in `safetensors.mjs` and `kernel/host.mjs`.

## Exact native API, arguments, units, scope, and lifetime

These are LoRA's existing signatures; proposed/missing peer interfaces are separately identified below.

| Entry / argument | Exact LoRA behavior and units | Binding / scope / lifetime |
| --- | --- | --- |
| `createLoraV2({folder,sourceFactory,kernel}={})` | Requires `folder` or synchronous `sourceFactory(selection)` returning source. Optional supplied kernel; otherwise creates verified Hike kernel. | When folder exists, sourceFactory is not used. Each HIGH/LOW reference side uses a separate SDK instance. Provided kernel remains caller-owned; SDK disposes only its own kernel. |
| `selection` | `{pairId,noise}`; nonempty string `pairId`; `noise:'high'|'low'`. Reference pairIds light/detail are selection alternatives. | Selection is cloned/frozen. Native selection and local revisions are not management or Diffusion transport revisions. |
| source | `{size, read(offset,length,{signal}), hash({signal})}`. `size`, `offset`, `length` are bytes; read returns exact-length `Uint8Array`. `hash()` supplies verified whole-source lowercase SHA-256 (64 hex). | Source ref is immutable and caller-owned. Header inspection alone does not verify whole-source identity. Source/hash owner must preserve original identity and reject stale/unloaded source; SDK does not independently hash all source bytes. |
| `inspect(selection,{signal}={})` | Reads/validates safetensors header/ranges; returns `SOURCE_INSPECTED`, tensors, `sourceSha256:null`, `integrity:'header-only'`. | Caller AbortSignal applies. Inspect does not enter the serialized transaction or capture SDK generation; do not claim `cancel()` terminates an already running inspect. `generationReady:false`. |
| `plan({selection,registry,strength,loaderPolicyId,diagnostic})` | Explicit finite F32-representable strength; no default strength. Native plan accepts no external AbortSignal option. Cancels/increments local generation, reads header, decodes every `.alpha`, calls source hash, classifies all source tensors, then selects diagnostics. | Captures selection/registry/strength/policy/diagnostic before user-controlled async work; registry side must equal uppercase selection noise. Plan is SDK-instance/generation-bound and cannot be reconstructed from JSON for `prepare()`. |
| registry | Exact top-level fields: `contractVersion,modelHash,graphHash,registryVersion,side,executionProfileId,loaderPolicyId,targets`. Model/graph hashes 64 hex; side HIGH/LOW. | Must come from real consumer, including registry/profile versions. Native registry hash is recursive key-sorted JSON UTF-8 SHA-256, retaining array order; this is separate from management snapshot hash. Unknown fields rejected. |
| registry target | Exact fields: `key,weightId,module,shape,dtype,layout,parameterRole,binding,transform`. `shape` is positive safe-integer full logical 1D/2D shape; dtype F32; layout row-major; role weight/bias agrees with key suffix. | `binding:{kind,name}` where kind is `runtime-input`, `initializer`, or `hike-parameter`; nonempty actual name. `transform:{kind:'identity'}` only. Logical keys, weightIds, and binding addresses are unique. No `graphInitializer`, transpose, quantization, target slice, or fused layout. |
| `diagnostic` | `{targets:[{key,slice:{startRow,rowCount}},…]}`. Start/count are output rows (bias: indices), start nonnegative/count positive safe integers within original first dimension. All input columns retained. | Explicit diagnostic always produces `PARTIAL`, `completeAdapter:false`, `scope:'diagnostic-projection'`, including included patches, excluded targets and excluded row regions. Unknown source tensor anywhere still rejects. Full registry target shape must equal original full shape. |
| `prepare(plan,{baseProvider,sink,blockRows=16,signal}={})` | `blockRows` integer 1..256, an upper bound in rows, not guaranteed emitted block size. Operation step also capped by `max(1,floor(4_000_000/(cols*(rank??1))))`. | Rebuilds from immutable base. Original plan object must remain current in same SDK. Returns `{state:'PREPARED',manifest,handle}`; no session application or generation snapshot implied. |
| `baseProvider.readBlock(weightId,offset,count,context)` | Offset/count are **F32 elements in original full base**, never bytes or tile-local elements. Context exactly includes `signal,modelHash,graphHash,registryHash,fullShape,side,executionProfileId`. Return exact-count `Float32Array`. | Provider resolves real weightId to original immutable full logical parameter, verifies model/graph/profile/side/shape/registry, and returns owned F32 bytes. There is no binding name in this call context: provider must hold weightId mapping from the real registry. Never read already patched active weights as base. |
| `sink.begin(manifest)` | Starts transaction; initial manifest has empty blocks and `complete:false`. | SDK marks begin attempted before awaiting it, so abort may follow even a failed/partially completed begin. Sink must retain cleanup ownership. |
| `sink.writeBlock(block)` | `{key,weightId,binding,parameterRole,offset,count,fullShape,slice,dtype:'F32',sha256,data}`; data is owned Float32Array; sha256 covers its exact bytes; offset/count full-base elements. | Sink must copy/persist before resolve and validate extent, duplicate/missing blocks, binding/package/feed identity. Kernel returns an independent copy; no raw pointer crosses WASM owners. |
| `sink.finish(finalManifest)` | Manifest complete true, all block metadata and native `bundleHash`; must return non-null prepared handle. | SDK handle is opaque and sink-specific; not an inferred ORT session/feed. `sink.abort(error)` and `sink.release(handle)` are both required. |
| `stage(prepared,target,{signal,isCurrent=()=>true}={})` | Requires target version exactly `lora-connection/2.0-draft.1` plus describe/prepareLoad/validate/commit/rollback. Checks currentness around each await. | Real manager must supply actual external `isCurrent`; default callback alone provides no management currentness evidence. SDK serializes plan/prepare/stage and blocks new transactions while failed sink abort recovery is pending. |
| `target.describe()` | Returns valid native registry. SDK hashes and compares it to prepared registryHash. | Real consumer owns all binding/graph/profile truth; successful equality means same declared registry, not independently proved graph semantics. |
| `target.prepareLoad(prepared.handle,context)` | Prepares isolated candidate. Context is frozen prepared manifest plus local `signal` and `isCurrent()` callback. | Context callbacks are local capabilities, not structured-cloned wire values. Peer bridge must define its own transport/currentness correspondence explicitly. |
| `target.validate(candidate,context)` | Returns object with matching `contractVersion`, `valid:true`, `coverage`, `scope`, `planId`, `registryHash`, `sourceSha256`; boolean rejected. | Actual 81,920-element weight + 16-output numerical evidence and agreed tolerance must come from real validation; SDK checks identity/scope, not numerical truth itself. |
| `target.commit(candidate,context)` | Return matching version + planId, `state:'STAGED'|'CONSUMER_APPLIED'`, valid ownership receipt. | Must recheck revision/abort/current at actual atomic publication boundary; no stale publication. STAGED does not mean applied. PARTIAL retains scope even if applied. SDK result has snapshotPublished false and generationReady false. |
| receipt ownership | `{kind:'independent-copy',ownerId}` or `{kind:'lease',ownerId,isValid()}`; ownerId nonempty string; lease must initially return true. | Independent-copy confirms consumer owns all future-read bytes; valid lease retains prepared backing until consumer ends it. Lease callback is local and must not be cloned across port. SDK result exposes kind/ownerId, retaining callback internally. |
| `target.rollback(candidate,context)` | Called on any stage failure, including when candidate is undefined because preparation failed. | Rollback must clean only this candidate/transaction; old rollback must not overwrite newer active state. Rollback failure retains prepared resource in recovery-required state. Rollback is failure recovery, not a public detach/reset operation. |
| `cancel()` | Synchronous generation increment and abort of active plan/prepare/stage controller. Cooperative cancellation at async/block checkpoints, after bounded Hike call returns. | Does not restore base, detach committed state, free prepared bytes, or by itself prove remote compute cancellation. Starting plan also invokes cancel before transaction admission. |
| `recover(prepared)` | Retries pending sink aborts, then that package's failed rollback; `recover()` can retry sink aborts without a package. | Must succeed before release of rollback-retained package. No new transactional use during pending sink-abort cleanup. |
| `release(prepared)` | Calls sink release; idempotent after success; retains record if release fails. | Refuses in-use, recovery-required, or active-lease package. Independent copy or ended lease permits release. Does not detach/reset a consumer session. |
| `dispose()` | Cancels, waits for active transaction, retries abort cleanup, releases tracked packages; then disposes SDK-created kernel. | Active lease or failed rollback/cleanup leaves bytes retained and rejects; end lease/recover and retry disposal. Disposal is not a base-restore API. |

Fixed loader policy: `comfy-lora-b5a4321-linear-diff-v1`, pinned ComfyUI commit `b5a432157de6b8884f81104cd02926adf4d597e4`. Factors are UP[out,rank] × DOWN[rank,in]; A means DOWN, B means UP. Effective LoRA scale is strength × alpha/rank when scalar alpha is present; absent alpha uses strength × 1 only under this explicit policy. Zero/negative alpha are present values. `.diff` and `.diff_b` use strength × delta, no rank/alpha. No training-base compatibility follows from this arithmetic policy.

`adaptV1Registry`, `createV1SinkAdapter`, and `adaptV1Consumer` cannot supply this E1 route: adapters are explicit initializer/FULL/full-adapter only. PARTIAL is rejected, runtime feeds and Hike parameters cannot be renamed to `graphInitializer`, and a legacy boolean cannot create PARTIAL evidence.

## Full-F32 provider and detach/reset inputs still needed

Obtain peer's actual source/build and exact public signatures before writing any bridge. The native required `readBlock` signature above already exists; missing evidence is a real provider implementation/receipt and its mapping to the peer API. A consumer that only exposes selected BF16/FP8 byte ranges is insufficient without a declared owned-F32 decode route. For quantized source, the Diffusion owner must supply the exact full-base F32 reconstruction profile, scale identity/hash, precision and graph correspondence. The LoRA registry must retain fullShape `[5120,5120]` / `[5120]` even when only rows `[0,16)` are read. Whole-model F32 materialization is not required by this API; exact immutable logical full-base addressing is.

Native v2 has **no detach/reset/prepareBase API**. To run detach acceptance, the real consumer/manager must expose an explicit owner-authorized base-restore transaction (exact name/arguments unconfirmed), compare-current authority, candidate identity, atomic base publication, rollback behavior and base ownership receipt. It must restore both affected sides coherently under management policy, null LoRA-only fields in detached state, preserve base identity/profile, and close old leases at the documented terminal point. `strength:0`, `cancel`, `release`, `dispose`, failure rollback, and old source `unloadLora` are not evidence of this operation. V1's separate `prepareBase`/detach flow does not add a native v2 method.

## Required E1 real-original matrix

Common selected logical stem: `diffusion_model.blocks.0.self_attn.q`. Weight key is stem + `.weight`, fullShape `[5120,5120]`, diagnostic slice `{startRow:0,rowCount:16}`. Select bias key stem + `.bias` only for light, fullShape `[5120]`, same slice. Each row uses the real side's immutable base, actual graph binding, explicit strength supplied/agreed by the caller, and pinned loader policy. There is no assumed HIGH=3/LOW=1, implicit test strength, input vector, precision profile, or tolerance.

| Original / side | Real source selection | Included arithmetic | Required complete comparisons |
| --- | --- | --- | --- |
| light / HIGH | Bernini-R_LightX2V_high_noise.safetensors | DOWN `[128,5120]`, UP selected `[16,128]`, scalar alpha 128; Q `.diff_b[0:16]`; no Q weight `.diff` | Every one of 81,920 selected Q F32 weight elements; all 16 merged bias elements; all 16 actual Q operator output elements |
| light / LOW | Bernini-R_LightX2V_low_noise.safetensors | Same shapes/alpha/diff_b rule, independent original/base identity | Every one of 81,920 selected Q F32 weight elements; all 16 merged bias elements; all 16 actual Q operator output elements |
| detail / HIGH | NSFW-22-H-e8.safetensors | A `[64,5120]`, B selected `[16,64]`, alpha absent under explicit pinned policy; no bias delta | Every one of 81,920 selected Q F32 weight elements; all 16 actual Q operator output elements |
| detail / LOW | NSFW-22-L-e8.safetensors | Same A/B/absent-alpha rule, independent original/base identity | Every one of 81,920 selected Q F32 weight elements; all 16 actual Q operator output elements |

Totals: 327,680 weight elements, 32 light bias elements, 64 operator output elements. Weight output is 327,680 bytes per original; light bias is 64 bytes per side. Check every selected element, not only a checksum, a few sampled coordinates, or first/last output. Record per-original max absolute/relative error, failed count under the **agreed** criterion, and any nonfinite values. Tolerance values are currently missing and must not be invented.

Reference arithmetic: for each selected row `r` and all `c∈[0,5120)`, compare Hike prepared `W'[r,c]` to an independent reference `B[r,c] + effectiveScale * sum_k(UP[r,k]*DOWN[k,c])`. For light compare `b'[r]=bBase[r]+strength*diff_b[r]`. Run actual consumer Q for the same explicitly identified length-5120 input(s) and compare all 16 outputs against the declared independent reference arithmetic and precision. Detail must preserve any actual base bias consumed by that real operator; do not assume absence/zero from absent LoRA bias. The exact real operator input contract, bias placement and numerical accumulation profile await the peer source.

With `blockRows=16`, the current SDK emits light Q blocks of 6+6+4 rows (full-base offset/count: 0/30720, 30720/30720, 61440/20480), then light bias 0/16. Detail Q emits 12+4 rows (0/61440, 61440/20480). Assemble and compare the entire 16-row selection regardless of this bounded-block split.

Per-row acceptance evidence must link: original hash and registered source/binding; real base model/graph hashes; registry/profile/policy identity; full shapes and full-base offset/count; exact binding name/kind; input bytes/hash; reference implementation/version and arithmetic profile; explicit strength; exact acceptance tolerances; every weight/bias/output comparison; structured validation; stage/commit state and ownership; cancel/currentness terminal result; base-restore/detach receipt; lease close + safe prepared release. A passing PARTIAL comparison proves that diagnostic projection only; no full adapter, generated-output contribution, L2 all-target or generation snapshot claim follows.

## Retained original identities and metadata-only observations

The existing inventory is the retained proof record for previously established whole-original hashes. Cached-header planner evidence explicitly says originalFilesRead false / originalFilesRehashed false; its scope is `CACHED_LOGICAL_HEADER_FIXTURE_NOT_BASE_OR_GRAPH`. No original content was re-read or rehashed in E0. For a **new** prescribed Diffusion `loadLora` registration, perform its required whole-file hash and original header/range validation; retain expected/observed identity and source lifetime proof. Do not replace a required load-time whole-file hash with inventory text or a stat-size equality.

No earlier hash-cache stat witness was found in the reviewed local contract/inspection/connection-design metadata or coordinator search. The current stats below are metadata-only observations, not evidence that the current inode bytes are identical to the earlier hashed originals. No full rehash is required merely to report this read-only E0 audit.

| Original | Bytes (stat = retained inventory) | Retained full-file SHA-256 | Current dev / inode / mtimeNs / ctimeNs |
| --- | ---: | --- | --- |
| light / HIGH / `Bernini-R_LightX2V_high_noise.safetensors` | 1244141856 | `9a7e8d5f9b42b91a069ad98a8d114f66ce11ccf6b21ec5d86e0caf49aef67945` | `27 / 262251 / 1793377657813734192 / 1793378835648510978` |
| light / LOW / `Bernini-R_LightX2V_low_noise.safetensors` | 1244141856 | `86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b` | `27 / 262256 / 1793377657025711256 / 1793378835654093057` |
| detail / HIGH / `NSFW-22-H-e8.safetensors` | 613516752 | `34e2144d3cd65360f97d09ccbe03e1c39a096df6c9234af5fe3899d1b63cda39` | `27 / 262183 / 1793378385736811756 / 1793378835654093057` |
| detail / LOW / `NSFW-22-L-e8.safetensors` | 613516752 | `d6b783742f4d5fd63a0223ae1d5bf64fc995a6b408480ac2a00528ae0d4146db` | `27 / 262174 / 1793378385440803919 / 1793378835654144284` |

## Concrete blockers before the real E1 joint trial

1. Exact Diffusion `f522d9…` peer source/build and public contract are not available for raw comparison. An old source I/O implementation is insufficient; no successful real consumer call is recorded.
2. Actual side-specific base model/graph/profile identities, Q full-shape registry, binding kinds/names, and immutable owned-F32 provider are missing. Base/Q block acquisition and decode profile remain pending.
3. Real sink/feed/package handle contract and structured PARTIAL consumer describe/prepareLoad/validate/commit/rollback signatures are missing, including actual stage versus application semantics and identity/hash rules.
4. Real Q operator input, bias position, arithmetic/precision profile, independent reference method, explicit strength(s), and agreed weight/bias/output tolerances are missing. No numeric pass/fail threshold is asserted.
5. Management-to-local-to-transport revision correspondence, actual commit-time compare-current authority, remote cancellation terminal evidence, stale rollback protection, consumer copy/lease and release proof are not yet available.
6. Native v2 lacks detach/reset; an actual peer/manager base-restore route and receipt must be obtained or explicitly implemented under the agreed contract before detach acceptance can be claimed.

Next executable step: acquire the exact peer artifact and real base/Q-block provision, compare its raw API against the native table, then run the four-row matrix under the agreed real profile. No new mock consumer, synthetic harness result, or repeated synthetic suite can close these blockers.

</details>
