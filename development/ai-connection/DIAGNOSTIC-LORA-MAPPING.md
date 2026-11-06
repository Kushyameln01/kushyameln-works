# External diagnostic LoRA bridge 0.1-draft.1

Scope: the retrieved plan0.2-draft.2 E1 API boundary. Native implementations are
kept unchanged. This mapping is an implemented management adapter proposal,
not module-owner adoption or real-base × real-LoRA numerical acceptance.

Pinned originals read: LoRA `dcb1f504263955ef2a4b1613b7a9d802aebd1c18`
(`docs/shared/inference/lora/sdk-v2.mjs`, `planner-v2.mjs`, `CONNECTION_V2.md`),
and Diffusion `438972f30242e0a3bc66edb8591f38eaa0fcd384`
(`docs/shared/diffusion-models/lora/diagnostic-{base,consumer,identity}.mjs`,
`DIAGNOSTIC_API.md`). SDK/planner bytes remain the2bba907 originals; the three
Diffusion source files match f522d9a. Source retrieval is recorded separately.
Neither latest source has the external bridge implemented here.

Public entrypoint:
`await createDiagnosticLoraBridge({nativeTarget,nativeBaseProvider,
loaderPolicyId,registryVersion,ownerId,sourceRefs,validation,
isApplicationCurrent,verifyNativeRegistry?})`.

`sourceRefs` has full repository/commit/path references for `lora` and
`diffusion`. `validation` supplies owned copies of `x:Float32Array(5120)`,
`expected:Float32Array(16)`, finite nonnegative absolute/relative tolerances,
and `referenceId`. The bridge does not generate expected values. Both arrays
and identities are captured before asynchronous setup. Every numerical
operation remains in the owner SDK/provider/consumer/stage.

The result supplies LoRA-v2 `registry`, `diagnosticTargets`, `baseProvider`,
`createSink()`, and `target`. The caller passes the real opaque plan/prepared
objects through the unchanged SDK. Native handles/candidates stay opaque and
are tracked by object identity. `inspectPrepared(prepared)` returns owned
mapping evidence, never a reconstructed native handle. After `sdk.stage()`
returns its successful receipt, call `finalize(prepared, stageReceipt)` to
release native candidate rollback history, then `sdk.release(prepared)` to
release the original native sink package. The native candidate already owns
an independent feed copy. No foreign stage/provider/SDK is disposed here.

| Boundary | Explicit mapping |
| --- | --- |
| Native registry | Verify its own digest, retain the complete original descriptor including source/storage/FP8/coverage. Do not rewrite its hash. |
| LoRA registry | Full logical shapes and identity transform; native row-slice remains separate in bridge mapping and explicit diagnostic selection. LoRA registry hash stays a distinct identity. |
| Provider offsets | SDK full-tensor elements minus selected rowStart × full column count become native selected-slice elements. Bounds and model/graph/registry/side/profile/full-shape are checked. |
| Sink blocks | Full-shape/full offsets become selected shape/local offsets. Preserve the complete original SDK manifest, included/excluded patches/regions, local revisions and source hash. Native sink owns byte checksum/overlap/missing coverage checks. |
| Unpatched bias | Only when absent from explicit included patches, copy immutable selected base bias through unchanged, hash it and record it as base pass-through. Do not invent a zero bias or a LoRA patch. Q weight selection remains mandatory. |
| Validation | Native PARTIAL receipt and actual reference/evidence are retained inside the v2 diagnostic-projection receipt; source/plan/dual registry identities remain separate. |
| Commit | Native committed diagnostic feed maps to CONSUMER_APPLIED with source-contract independent-copy ownership. It is neither full model apply nor snapshot publication. |
| Cancellation/rollback | Normal calls require SDK currentness and explicit application currentness. Cleanup uses application currentness independently from an aborted SDK signal; native candidate/epoch ownership prevents old rollback from changing a newer application. |

Only the acquired PARTIAL 16×5120 Q projection, complete input columns and
optional selected Q bias are supported. FULL, initializer adaptation, unknown
bindings/transforms and ownership leases are rejected. No detach method is
invented; immutable-base restoration uses the native owner's separate
prepareBase/validate/commit transaction. Private original four LoRAs and real
base bytes are absent here, so E1 remains unverified. Synthetic source/base and
stage fixtures test API mapping and ownership only; real SDK/Hike/native
consumer runs are reported independently from real ORT and private originals.

## Verification and limits of this implementation

Run against the independently acquired fixed owner sources:

```sh
WORKS_LORA_NATIVE_ROOT=/workspace/work/ai-connection/resume/native/dcb1f50 \
WORKS_DIFFUSION_NATIVE_ROOT=/workspace/work/ai-connection/resume/native/438972f \
node --test tools/ai-connection/test-lora-diffusion.mjs
```

The environment paths identify this session's retrieval locations; obtain and
verify the full commits above before reproducing elsewhere. Without both source
roots, the native integration case is explicitly skipped, not counted as passed.
Fourteen cases pass with both roots. The native integration case uses the real
LoRA SDK/Hike and real Diffusion consumer with synthetic F32 safetensors,
synthetic immutable base, and a declared stage fixture. It compares every emitted
selected weight/bias value and all16 outputs at strengths2,0,-1, including
unpatched-bias pass-through. It does not run the real ORT graph, real base
FP8 decoder, or any private original LoRA, and is not E1 acceptance.

Additional cases cover nonzero selected rowStart3, full-versus-selected bounds,
dual registry hashes, unknown binding, FULL rejection, source/exclusion/revision
retention, immutable expected arrays, mismatched native package/graph receipts,
stale prepareLoad cleanup, explicit stage acknowledgement before history release,
and preserving the active independent feed after package release. Stale
prepareLoad cleanup failures retain the exact candidate for the SDK rollback
retry; no unrelated native resource is disposed.

LoRA's native identity uses its acquired recursively key-sorted JSON encoding
and finite IEEE754 numbers. This adapter reproduces that encoding for native
manifest/registry checks and keeps it distinct from common package numeric
restrictions and snapshot identities. For example, native finite scalar1e30
is not rejected merely because common artifact IDs/offsets require decimal
strings outside the safe-integer range. No numeric value is coerced or replaced.


A bridge sink keeps ownership if native `finish` allocates a package after an
abort. It releases that exact late handle before rejecting. Failed release is
retained in a sink-owned recovery set; new transactions are blocked until
`sink.recover()` succeeds. `sink.recoveryState()` reports the pending release
count and outstanding finish. `sink.abort()` also retries this cleanup, so the
unchanged SDK's pending-abort/recover path can recover it. Cleanup never releases
a different successful package and does not dispose foreign owners.

Each prepared package permits one outstanding candidate until rollback or
finalization. `finalize` verifies the returned SDK instance/local revisions and
the exact native validation candidate/receipt, in addition to plan/source/bundle
identities. A delayed acknowledgement cannot discard the rollback history of a
later staging attempt using the same package. These ownership races have
failure-first regression cases separate from the synthetic numerical chain.
