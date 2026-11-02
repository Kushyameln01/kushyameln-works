# P4 normal weight transactions

The LoRA owner adapter supports normal weight transactions without independent expected outputs or a forward executor. Numerical comparison remains a separate diagnostic operation. This document specifies adapter `0.2`; [P4-API.md](./P4-API.md) preserves the earlier `0.1` diagnostic baseline, including its target table and diagnostic input contract.

## Versions and source identity

| Boundary | Current contract |
| --- | --- |
| LoRA adapter `P4_ADAPTER_VERSION` / registry version | `lora-diffusion-p4-adapter/0.2-draft.1` |
| SDK connection | `lora-connection/2.0-draft.1` |
| Adapter capability descriptor | `lora-p4-capabilities/0.1-draft.1` |
| Native normal admission receipt | `bernini-p4-f32-feed-admission/0.1` |
| Native numerical diagnostic receipt | `bernini-p4-f32-feed-validation/0.1` |
| Native registry / immutable source | `bernini-p4-f32-feed-registry/0.1` / `bernini-p4-original-weights/0.1` |
| Native execution profile | `bernini-block0-n2-cross-ffn-f32-candidate-v1` |

The implementation sources are [sdk-v2.mjs](./sdk-v2.mjs), [diffusion-p4-adapter.mjs](./diffusion-p4-adapter.mjs), [p4-source-bindings.mjs](./p4-source-bindings.mjs), [diffusion-p4-registry.mjs](./diffusion-p4-registry.mjs) and [loader-policy.mjs](./loader-policy.mjs). Canonical LoRA mapping remains in this adapter; management must use it rather than duplicating mappings or stacking the old bridge on the same transaction.

The native owner's fixed source is [`48ff155988d995fc2569e495c8d8820273bd472c`](https://github.com/Kushyameln01/kushyameln-works/tree/48ff155988d995fc2569e495c8d8820273bd472c), including [weights.mjs](https://github.com/Kushyameln01/kushyameln-works/blob/48ff155988d995fc2569e495c8d8820273bd472c/docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs) and its [normal execution contract](https://github.com/Kushyameln01/kushyameln-works/blob/48ff155988d995fc2569e495c8d8820273bd472c/docs/shared/diffusion-models/execution/README.md). The adapter's historical native source reference `7ee36228030ba3bb544a90b1d4b528702a7bae32` establishes the earlier registry/operator baseline; it is not proof of the new runtime. Actual execution records the loaded native commit, path, bytes and SHA-256 separately. The real-File host requires the complete owner `48ff` SHA as `--diffusion-commit`, compares the loaded import closure with fixed Git objects, and records `sourcePins` and `loadedSources`.

## Validation mode and compatibility

`sdk.stage(prepared, target, {validationMode})` accepts an optional `normal` or `diagnostic`. The SDK carries an explicit mode into the LoRA target context, requires the same mode in its structured validation and commit receipts, and retains it in the result. It checks both the returned validation and its captured immutable snapshot before commit. A boolean validation is insufficient for SDK v2. The canonical adapter translates this SDK mode to the owner's separate methods; native owner context and receipts have no `validationMode` field.

| Mode | Owner target / native behavior | Numerical comparison |
| --- | --- | --- |
| `normal` | Check owner source/base binding; call native `validate` for structural admission, then native `commit` | SDK validation `numericalComparison:false`; no forward execution |
| `diagnostic` | Obtain native normal admission, then call native `diagnose` with captured input, independent expected/hash, declared reference and fixed gate | SDK validation `numericalComparison:true`; explicit diagnostic forward execution |
| omitted | Preserve the previous SDK context/result shape and diagnostic requirement; use the native method appropriate to the captured owner contract | No automatic conversion to normal |

Unknown modes and mismatched explicit SDK/target/wrapper-receipt modes are rejected. The owner exposes distinct `validate` and `diagnose` methods and declares structural admission in `registry.validationGate`, numerical diagnostics in `registry.numericalDiagnostics`. The LoRA adapter's capability descriptor reports whether that normal owner contract is available. Old consumers retain their established diagnostic path and are not silently relabeled as normal-capable. Capability assessment does not prove loaded source identity; execution pins provide that evidence.

For the exact owner `48ff` registry and separate `diagnose` entry, the adapter reports `nativeValidationProtocol:'bernini-p4-structural-admission-diagnose/0.1'` and `normalValidationAvailable:true`. `describeBinding().nativeValidationCapabilities` is an adapter-generated summary with schema `lora-p4-native-validation-protocol/0.1-draft.1`; it does not call a native capability method. Its modes describe the SDK translation that the adapter can provide.

The planner's existing argument `diagnostic` and plan scope `diagnostic-projection` are legacy names for an explicit PARTIAL target/range selection. They do not select numerical validation mode. A normal transaction can use that PARTIAL plan. SDK v1, its initializer/FULL-only adapter, Q16 adapter and prior mode-omitted fixtures retain their separate contracts. PARTIAL or runtime-input plans must not be disguised to pass through v1.

## Normal entry and owner support assessment

Normal standalone use does not inject a forward executor or conditioning clone:

```js
const adapter = createDiffusionP4Adapter({
  consumer: feed,
  isOwnerCurrent: resourceCurrent
  // baseProvider defaults to feed.baseProvider (immutable original base).
  // sourceBindings defaults to the owner-maintained known records.
});

const capabilities = adapter.describeCapabilities();
const support = adapter.assessSupport({
  operation: 'apply',
  sourceSha256, modelHash, graphHash, side, executionProfileId,
  loaderPolicyId: capabilities.loaderPolicy.id,
  targets: [{
    weightId, fullShape, slice: {startRow, rowCount},
    binding, dtype: 'F32', layout: 'row-major', parameterRole: 'weight',
    axes: ['O', 'I'], normalization: 'none'
  }]
});
// support: {supported, reasonCodes, sourceBinding, coverage:'PARTIAL',
//           generationReady:false}
```

The request uses actual weight descriptors: operation, original/model/graph/side/profile identities, full shape, selected rows, binding, dtype, layout, axes and normalization. It has no image F/H/W, prompt, noise, schedule, expected array or gate. Matrices have axes `['O','I']`; bias vectors have `['O']`, `parameterRole:'bias'` and the native hike-parameter binding. `axes` and `normalization` may be omitted; supplied declarations must match these values. All current targets declare `normalization:'none'`.

`describeCapabilities()` returns the native targets' full shapes, original storage and compute dtype, bindings/operator bindings, allowed ranges, per-block limits, loader variants and verified source bindings. The native registry contains the complete 12 cross-attention/FFN slots or the complete 16-slot descriptor with optional text embedding. Those structural descriptors are broader than the current source compatibility evidence.

The default owner record currently authorizes only the following known source/base/range combination:

| Property | Authorized identity / range |
| --- | --- |
| Source | light LOW; SHA-256 `86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b` |
| Base | LOW; model SHA-256 `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` |
| Graph | `9c3bbaf2488a763ab56a96a8f5ddfc65510bf197799ed83b9f6ead512cf7a52e` |
| Q weight | `blocks.0.cross_attn.q.weight`; full `[5120,5120]`; rows `[0,4)`, all 5120 input columns; full-coordinate elements `[0,20480)` |
| Explicit Q bias | `blocks.0.cross_attn.q.bias`; full `[5120]`; elements `[0,4)` |
| Weight storage / compute / feed | original `F8_E4M3` with native scale; compute and final feed `F32`, row-major |
| Bias storage / compute / feed | original `F16`; compute and final feed `F32`, row-major |

These owner records describe previously compared runtime compatibility, with `trainingBaseVerified:false` and `trainingBaseIdentityGuarantee:false`. They are not training-base metadata from the LoRA and do not certify arbitrary same-shape bases. Fresh selected local Files still undergo required header and whole-source hash checks. The historical four originals are not required to start a transaction.

`sourceBindings` is trusted owner factory configuration captured at construction, not a request field or a management override. Extending it requires owner evidence for that source, base, loader, target and full-coordinate range. File names and matching shapes cannot create a record. Unknown originals return `UNKNOWN_SOURCE_BINDING`; a known original with another base returns `SOURCE_BASE_BINDING_MISMATCH`; unverified rows/targets return `SOURCE_RANGE_UNVERIFIED`. Other reasons include `FULL_SHAPE_MISMATCH`, `BINDING_MISMATCH`, `TARGET_UNSUPPORTED`, `AXES_UNSUPPORTED`, `NORMALIZATION_UNSUPPORTED`, `PATCH_BUDGET_EXCEEDED` and `NORMAL_VALIDATION_UNAVAILABLE`. Unsupported requests do not prepare native candidates. `targetForPlan` repeats support assessment at the application boundary; preflight support does not exempt the actual plan from inspection and validation.

`assessSupport({operation:'restore-base',modelHash,graphHash,side,executionProfileId})` checks native/owner availability without LoRA source fields. Extra source, loader or target fields are unsupported for this operation.

## Loader, shapes and bounded F32 preparation

The fixed policy is `comfy-lora-b5a4321-linear-diff-v1`, based on ComfyUI `b5a432157de6b8884f81104cd02926adf4d597e4`. Supported variants remain `linear-down-up`, `linear-a-b`, `additive-diff` and `additive-diff-b`; source dtypes are BF16/F16/F32. For factors, Hike computes `up[out,rank] @ down[rank,in]`, scaled by `strength * alpha/rank` when alpha is present. An omitted alpha means `strength * 1` only under this explicit fixed loader policy. Additive weight/bias patches use `strength * delta`, without alpha/rank scaling. Strength and effective scale must be finite F32-representable values; the API does not declare a universal trained-strength interval. Unknown variants, multiplier conventions and implicit transpose/fusion/slice transformations are rejected.

Hike LoRA arithmetic, native base decoding and owner operator math retain their existing owners. Original scalar-scaled E4M3FN/F16 base values are read through the native immutable F32 provider. The LoRA adapter supplies completed F32 blocks to the sparse feed; it does not feed low-rank factors, raw FP8 or additive deltas into the final-weight sink.

Each operation retains its original `fullShape`, selected `slice`, explicit included patches and excluded targets/regions. Matrix slices always contain all input columns. `offset` and `count` are elements in the original full tensor, not bytes or offsets in a rebased diagnostic matrix. A `[4,5120]` projection cannot replace the full `[5120,5120]` layer shape. Explicit selected bias patches are included; omitted bias and every unselected target/region retain immutable base values.

The selected-patch cap is 16 MiB. A native block contains at most 81,920 F32 elements and complete rows: at most 16 rows for most matrices, 4 for FFN-down `[5120,13824]`; SDK workspace/rank limits may choose a smaller block. `describeCapabilities()` returns these limits. This is a bounded weight-feed contract, not arbitrary full-model shape support or a process-memory limit.

## Native validate → commit and receipts

The normal native call receives only model/graph/registry/side/profile/scope identity, `signal` and `isCurrent`. It receives no SDK mode, `input`, `expected`, `expectedSHA256`, `referenceId`, numerical `gateId`, `tolerance` or `run`. The adapter rejects diagnostic option fields even if their values are undefined; removing only a management-side check is insufficient.

The fixed owner registry declares structural gate `p4-sparse-final-f32-admission-v1`, scope `registered-targets-and-declared-ranges`, `numericalComparisonRequired:false`. Numerical gate `p4-cross-ffn-composed-f32-v1` and abs0.01/rel0.001 remain in `numericalDiagnostics`, with `requiredForCommit:false`. The returned admission's `gateId` names the structural gate; it is not a caller-supplied numerical reference gate.

| Native step | Checks and retained state |
| --- | --- |
| Sink `begin` / `writeBlock` | Identity, registered target, full shape/binding, bounded declared ranges, compact owned finite F32, block-byte hash, overlap and byte budget |
| Sink `finish` | Complete declared ranges; private package handle and metadata-derived package hash |
| `validate(candidate, context)` | Current candidate/epoch; retained block shape/binding/finite F32 and declared bounds; complete ranges and patch byte count; sets native internal `admittedAtEpoch` |
| `commit(candidate, context)` | Valid internal admission at the current epoch; uncommitted/current candidate and current/abort guard immediately before switching |

Native `validate` returns `bernini-p4-f32-feed-admission/0.1`, with identity, candidate/package, `valid`, structural `gateId`, `epoch`, `patchRangeCount`, `blockCount`, `patchBytes`, `completeDeclaredRanges:true`, `immutableBasePreserved:true`, `numericalComparison:false`, `modelInference:false` and `generationReady:false`. The adapter checks these values against its selected manifest/ranges and captured owner contract. The native receipt has no SDK mode, expected/reference/output arrays or numerical error report. The SDK wrapper adds `validationMode:'normal'`, the source binding and small application metadata without changing the original native receipt.

Native admission is held internally by candidate and epoch; caller-authored success metadata cannot authorize commit. Package integrity checks occur across the private sink/package/admission transaction. The owner does not promise a fresh whole-base hash or an additional base-liveness probe from `validate`. `immutableBasePreserved:true` describes immutable-base pass-through, not an independent proof that the underlying source remains live. The actual source provides disposal stats; execution evidence must separately confirm unpatched-base availability and disposal/release. Base restoration admits the private immutable-base package with zero patch ranges/blocks/bytes.

The adapter and SDK repeat their own current/abort checks. Native commit returns the new epoch/package and `numericalComparison:false`, without a mode field. The adapter returns the checked SDK mode in its commit wrapper. Native `diagnose` returns the existing `bernini-p4-f32-feed-validation/0.1` numerical receipt, marked `diagnosticOnly:true`, `requiredForCommit:false`; it does not establish native admission. In the adapter's explicit diagnostic transaction, diagnostic success and normal admission are both required before the adapter proceeds to commit. A stale or failed candidate rolls back and is released; an old rollback cannot overwrite a successor's active feed.

## Transaction and ownership

```js
const plan = await sdk.plan({
  selection: {pairId: 'light', noise: 'low'}, strength,
  registry: adapter.registry,
  loaderPolicyId: adapter.registry.loaderPolicyId,
  diagnostic: {targets: [
    {key: 'diffusion_model.blocks.0.cross_attn.q.weight',
     slice: {startRow: 0, rowCount: 4}},
    {key: 'diffusion_model.blocks.0.cross_attn.q.bias',
     slice: {startRow: 0, rowCount: 4}}
  ]}
});
const target = adapter.targetForPlan(plan, {
  validationMode: 'normal', applicationBinding
});
const prepared = await sdk.prepare(plan, {
  baseProvider: adapter.baseProvider, sink: adapter.createSink(plan), signal
});
try {
  const receipt = await sdk.stage(prepared, target, {
    validationMode: 'normal', signal, isCurrent: requestCurrent
  });
} finally {
  try { await adapter.finalize(plan); }
  finally { await sdk.release(prepared); }
}
// A different strength uses a new plan and immutable base again.
const restored = await adapter.restoreBase({
  validationMode: 'normal', signal, isCurrent: requestCurrent,
  applicationBinding
});
```

`applicationBinding` is optional small plain finite acyclic JSON, captured by the adapter. It may associate the SDK tuple, management request/revision/resource generation, queue target and `snapshotPublished:false`; it is metadata rather than an alternative weight mapping or numeric input. Typed/rich/cyclic metadata is rejected.

| Identity | Owner and meaning |
| --- | --- |
| `sdkInstanceId`, `localInputRevision`, `localApplicationRevision` | One SDK instance and its local plan/cancel generation |
| Management request/revision/resource generation | External request selection and queue ownership; carried separately in application metadata |
| Native internal `preparedAtEpoch` / `admittedAtEpoch`, public admission/commit `epoch` | Sparse feed candidate preparation/admission and current active-weight epoch |

The SDK's local revision is not a common HIGH/LOW revision or a native epoch. Use separate SDK instances for HIGH and LOW, and let management publish a generation-wide snapshot only after its own requirements are met. Initial scope selects/switches one light/detail pair; two-pair composition is not added.

Strength changes, reapplication and restoration never add onto the previous patched values or subtract a rounded delta. `baseProvider` always reads immutable original base; unselected ranges pass through to that same original base. Sink writes copy completed F32 into native private blocks. `prepareLoad` shares those private native blocks rather than making a second numerical copy. Package, candidate, previous active history, active feed and read leases may retain a private buffer; resource counts/retained bytes must distinguish them.

The SDK receipt's `ownership.kind:'independent-copy'` means the consumer owns the required completed patch bytes independently of the SDK prepared handle. It does not mean a second full numerical copy at `prepareLoad`, or that all unchanged base bytes are resident in a session. Release a prepared package after successful native ownership or after terminal rollback; release/finalize candidates separately. SDK v2 still supports other consumers' explicit valid leases and prevents prepared release while such a lease is live. Native read leases are internal feed ownership, not SDK prepared leases.

`cancel()` invalidates the SDK plan and aborts cooperatively after the current bounded synchronous Hike call. Await the original task's terminal state, rollback/abort and resource release before reporting stop/reuse. A failed cleanup requires `recover` or a retained resource/quarantine outcome, not a successful cancellation claim. The SDK rejects release while staging is in progress. The caller owns queue, SDK, feed, source and operator lifetimes and must wait for active work before disposing them.

For standalone composition, `isOwnerCurrent` must include actual source ownership and lifetime rather than a request-selection flag alone. The real-File runner binds both normal and diagnostic adapters to the same guard: its owner is live, `actualSource.stats().disposed===false`, and `actualSource.describe()` equals the initial captured immutable descriptor. It records that guard separately from native admission. The source is disposed last, after terminal operator/feed work. Missing disposal metadata is not another lifetime proof. The native `createBerniniP4Execution` owner instead keeps its immutable source in a private closure, uses `!closing && !disposed` as its lifecycle guard, and disposes stage → feed → source after terminal work; callers must preserve that ownership boundary.

After prepared/candidate release, the active native feed may continue using its owned patch bytes. It still needs a live immutable base source for unselected values and live operator resources. A test that releases the selected LoRA read capability while retaining the SDK instance/base is narrower than a test that disposes the SDK or all model resources. Independent active-source leases preserve their own epoch across later commits and must be released explicitly.

## State, coverage and evidence

| State/evidence | Meaning |
| --- | --- |
| Local source selected / `SOURCE_INSPECTED` | File capability/header inspection; no application |
| `PREPARED` | Hike completed selected final-F32 blocks in a package |
| `STAGED` | A consumer's staging-only receipt; no assertion of active execution |
| `CONSUMER_APPLIED` | The agreed native weight feed committed the selected package |
| Management snapshot published | Separate management acceptance/publication action |
| Normal validation succeeded | Structural/integrity/currentness checks passed; numerical diagnosis is a separate axis |
| `coverage:'PARTIAL'` | Only the declared source targets and regions were applied |

Normal success does not upgrade PARTIAL to FULL, publish a management snapshot or establish generation READY. The adapter returns `snapshotPublished:false` and `generationReady:false`. UI must distinguish these states; staging or Hike completion alone must not display an applied/ready claim. Current support excludes unverified originals/ranges, other pair/side acceptance, arbitrary model/graph shapes, full-target application, complete model sessions and generated-result contribution. Those require their own owner consumer and acceptance evidence.

The verification entrypoints are [test-sdk-validation-modes.mjs](../../../../tools/lora/test-sdk-validation-modes.mjs), [test-p4-normal-capabilities.mjs](../../../../tools/lora/test-p4-normal-capabilities.mjs), [test-p4-normal-transactions.mjs](../../../../tools/lora/test-p4-normal-transactions.mjs), and the real-File host [test-lora-normal-real.mjs](../../../../tools/ai-connection/test-lora-normal-real.mjs). Run results belong to the separately pinned execution report under `development/ai-connection/lora-normal-transaction/`, not to this interface document.

The real-File host supplies one selected local LoRA and the retained LOW base through native browser File inputs. It pins the new SDK/adapter/native source while reusing the immutable historical a80 oracle, its wrapper/core/plan bytes and manifest hash. It does not regenerate an oracle or require all four original LoRAs. Normal `prepare`/`validate`/`commit` have no independent expected/input/gate and execute no forward model. The test records these argument and run-count checks.

Existing independent weight/bias references and fixed numerical gates are used only in `diagnostics` after normal commit. Detailed F32 artifacts, operator evidence and full output comparisons remain there. Two separate controlled N2/K4 forward diagnoses compare the applied feed after prepared/source-capability release and restored immutable base against the existing reference. They are bounded operator checks, separate from normal transaction acceptance, real full-model inference, natural Text/P2 input acceptance and the original 81-frame workflow's target profile.
