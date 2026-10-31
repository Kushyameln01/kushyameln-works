# LoRA v2 → Diffusion PARTIAL adapter

This is the **fixed2bba regression path**, retained with its historical tests. Under Profile catalog `1.0-draft.1` at `6dae9a6fac3e9ad29ea941f22211edbe4aa894ad`, the canonical full-shape/slice, dual-registry and sink/consumer mapping belongs to the LoRA owner's `createDiffusionDiagnosticAdapter` (`lora-diffusion-diagnostic-adapter/0.1`). See the [fixed owner source](https://github.com/Kushyameln01/kushyameln-works/blob/fc2789a0f649e33f15eb13750e6a983b5c52d170/docs/shared/inference/lora/diffusion-diagnostic-adapter.mjs). Inject that owner adapter for the current adoption path; do not stack this regression adapter with it. The native Diffusion provider/consumer contract is unchanged.

`v2-adapter.mjs` connects the actual LoRA SDK contract `lora-connection/2.0-draft.1` at commit `2bba90785292e42a0c7c8756685b0d8b128b2dcf` to the bounded Diffusion Q consumer. It implements no low-rank or delta arithmetic. Those operations run in the LoRA owner's SDK/Hike. Coverage remains **PARTIAL**, completeAdapter/modelInference/generationReady remain false, and no management snapshot is published.

The selected target is original Q `[5120,5120]`, sixteen contiguous rows and all5120 columns. The corresponding original bias `[5120]` is selected at the same rows. This is a runtime weight feed plus a Hike bias parameter, with no initializer substitution. The independent validation reference belongs to one application; create a new adapter when that reference changes.

## Factory and calls

```js
import {createLoraV2DiagnosticAdapter} from './v2-adapter.mjs';
const adapter = await createLoraV2DiagnosticAdapter({
  base, stage, // caller-owned immutable base and actual ORT/Hike stage
  includeBias: selection.pairId === 'light',
  reference: {x, expected, tolerance: {absolute, relative}},
  isCurrent: () => applicationStillCurrent()
});
const sdk = await createLoraV2({sourceFactory: () => verifiedSource, kernel});
const plan = await sdk.plan({
  selection, strength, registry: adapter.registry,
  diagnostic: adapter.diagnostic,
  loaderPolicyId: adapter.registry.loaderPolicyId
});
const prepared = await sdk.prepare(plan, {
  baseProvider: adapter.baseProvider, sink: adapter.createSink()
});
const applied = await sdk.stage(prepared, adapter.target, {
  isCurrent: () => applicationStillCurrent()
});
await sdk.release(prepared); // native candidate/active feed own an independent copy
await adapter.releaseHistory(); // only AFTER sdk.stage has settled successfully
const result = await adapter.run({x, signal});
```

`reference` requires compact finite F32 x[5120] and expected[16] plus explicit finite nonnegative absolute/relative tolerances. All reference bytes and mutable metadata are copied before the factory's first await. The adapter owns a native `createDiagnosticConsumer` instance, but never disposes the caller's base, stage, or LoRA kernel. `stage.runF32` must actually identify the bound graph; the native consumer performs its existing independent expected-output comparison.

Returned members:

- `registry`, `registryHash`, `diagnostic`: SDK-compatible metadata with full logical shapes and a separately declared row selection.
- `baseProvider.readBlock(weightId, fullElementOffset, count, sdkContext)`: maps only the selected full-tensor region into the native slice. It checks model/graph/SDK-registry/side/profile/full shape and supplies the native three-hash binding. Returns an owned F32 copy.
- `createSink()`: implements SDK `begin/writeBlock/finish/abort/release`. Blocks preserve fullShape/slice/binding at the SDK boundary and selected shape/offset at the native boundary. Native checksum/overlap/completeness checks remain in force.
- `target`: implements versioned `describe/prepareLoad/validate/commit/rollback` for actual `sdk.stage`. Validated/committed results identify PARTIAL scope, the SDK plan/source/registry and the actual native receipt separately.
- `run({x,signal})`: runs the adopted native feed, checking external application currentness before and after the bounded operation.
- `restoreBase({reference,signal,isCurrent})`: prepares the immutable base, validates its **separate** independent reference, commits and releases its rollback history. It does not subtract deltas. SDK v2 has no detach method.
- `releaseHistory()`: drops completed candidate rollback history while retaining independently owned active bytes. Do not call during the SDK transaction. An uncommitted candidate is refused.
- `recover()`: retries adapter-owned allocation cleanup described below. This is distinct from `sdk.recover(prepared)` / `sdk.recover()`.
- `dispose()`: invalidates this adapter, waits for native pending operations and releases its own packages/candidates. It does not end another module/Worker or guarantee immediate OS memory return.

## Two identities and bias completion

The SDK registry uses full shapes, identity logical transforms, module/parameterRole and the fixed loaderPolicyId. Its registryVersion includes the native registry digest. Its own sorted-JSON digest is **different** from the Diffusion descriptor digest. The latter includes actual storage/scale/source offsets and row-slice mapping. Neither is a manager snapshot hash. Do not merge native extra fields into the SDK's strict registry schema or rename either digest.

The native sink needs both weight and bias completely covered. For light, the SDK explicitly prepares the selected `.diff_b` patch. For detail, the adapter copies the unchanged immutable selected bias into the native feed at finish. That pass-through is not a fabricated bias patch, zero fill or an additional LoRA operation.

SDK scope `diagnostic-projection`, SDK coverage `PARTIAL`, and native scope `PARTIAL` are mapped explicitly. The explanatory label `single-projection-diagnostic` from correspondence notes is not sent as the SDK validation scope. A successful native commit becomes a scoped `CONSUMER_APPLIED` with an independent-copy ownership receipt; it is never full-adapter, full-model or generation readiness.

## Cancellation, rollback and recovery

The owner supplies `isCurrent` explicitly and coordinates its application revision with SDK local revisions. Cancellation is cooperative around bounded calls. There is no new MessagePort/RPC protocol and no function, signal or WASM pointer is serialized.

Rollback uses the owner's application-current callback for cleanup even after SDK cancellation; the native candidate/epoch guards prevent an older rollback from overwriting a newer active feed. The SDK retains its package on rollback failure. Call `sdk.recover(prepared)` before normal release. A failed sink abort is retried by `sdk.recover()`.

Allocation can succeed before a following async currentness check fails. The adapter releases that native candidate/package before propagating the original error. This retention also covers restoreBase if validation and rollback both encounter another busy run. If cleanup fails too, it throws an AggregateError containing both errors and retains the actual allocation in a pending cleanup closure. New work returns `RECOVERY_REQUIRED`; `adapter.recover()` retries before reuse. No orphaned handle is replaced with undefined. Normal disposal also ends the owned native resource lifecycle.

Use one owning SDK instance per adapter and serialize prepare/stage/restore/run and direct sink transactions through that owner. The four-entry admission check counts completed prepared packages plus retained candidate histories; it does not count concurrently opened unfinished sink transactions and is not a global peak-memory guarantee. Do not share one adapter across independently running SDK instances. Release prepared resources and completed history instead of growing retained copies. Known native feed copies are approximately328KB each; LoRA's pinned kernel reserves32MiB. ORT allocator and process/RSS peak remain separately unmeasured.

## Reproducible contract runs

The peer source is not vendored or edited. Obtain the fixed branch into a separate directory and expose its `docs/shared/inference/lora` path. Node tests and the browser runner verify eight actual SDK/Hike asset digests before use.

```sh
git archive 2bba90785292e42a0c7c8756685b0d8b128b2dcf docs/shared/inference/lora > /tmp/e1-lora-sdk.tar
mkdir -p /workspace/work/e1-lora-sdk
tar -xf /tmp/e1-lora-sdk.tar -C /workspace/work/e1-lora-sdk
E1_LORA_ROOT=/workspace/work/e1-lora-sdk/docs/shared/inference/lora node --test --test-isolation=none docs/shared/diffusion-models/lora/test-v2-adapter.mjs
python tools/ai-connection/test-lora-diffusion-browser.py --peer /workspace/work/e1-lora-sdk/docs/shared/inference/lora --output development/ai-connection/e1/browser-contract.json
python tools/ai-connection/test-lora-diffusion-browser.py --peer /workspace/work/e1-lora-sdk/docs/shared/inference/lora --base-artifact /private/path/base-blocks.json --output development/ai-connection/e1/browser-real-base-synthetic-lora.json
```

Node's20 contract cases use actual SDK/Hike, synthetic sources/base, and an explicitly labelled contract stage. Chromium's4 cases use actual SDK/Hike → native sink/consumer → actual ORT1.24.3 Gemm → Hike bias with synthetic sources/base. Neither suite uses the four original LoRA payloads or proves real-original joint success. The browser test serves only allowlisted code/runtime paths, with no original-file endpoint.

The explicit `--base-artifact` mode is a separate scope: actual HIGH/LOW bounded base provider/Hike decode, synthetic rank1 light/detail-shaped source, real SDK/Hike, real ORT/Hike consumer. The artifact is read from an external private directory, passed directly into the local browser evaluation and never exposed as an HTTP endpoint or written to the result. Independent Python E4M3FN/F16 decoding is checked against existing L1 selected-weight/bias SHA receipts; the fixture's one-column/one-hot expected values are closed-form references. This mode passes4 cases, compares every selected weight/bias/output and base restoration, and still reports realOriginalJoint:false. It does not exercise the actual rank128/rank64 LoRA originals.

## Actual-original joint runner and private base handoff

`tools/ai-connection/test-lora-diffusion.mjs` exports `runLoraDiffusionDiagnostic(...)`. Serve the repository and immutable fixed peer code on an explicit local origin, then pass owner-held inputs:

```js
const report = await runLoraDiffusionDiagnostic({
  peerRootUrl, base, loraSource, selection, strength,
  reference: {x, expected, tolerance}, baseReference,
  expectedWeight, expectedBias, expectedBaseWeight, expectedBaseBias,
  weightTolerance, expectedSourceSha256,
  evidenceScope: 'real-original-joint', isCurrent
});
```

The runner instantiates the pinned real SDK/Hike and actual ORT/Hike stage, compares **all**81920 selected weights and16 biases to independent owner-provided references, validates all16 outputs, releases prepared bytes, reruns the active feed and validates immutable-base restoration. Tolerances are required before execution. The source `hash()` must come from a valid owner-held full-file receipt/source binding; the runner does not download original payloads or independently rehash multi-GB files. `real-original-joint` checks the four known source identities against explicit light/detail and side. The synthetic harness supplies `synthetic-contract`, or `real-base-synthetic-lora` for the explicit private-base mode, and always reports realOriginalJoint:false.

If cleanup cannot finish, the runner retains its resources and stays BUSY. The local error's `recover()` retries SDK/adapter cleanup before releasing stage/kernel. That callback is local ownership, not a serialized port result.

The base can be the existing original-File provider or `createBerniniBlockProvider({artifact,side,hikeBytes?})` from `base-block.mjs`. The private artifact contains header181280B, selected Q81920B, bias32B, scalar scale4B and config27B per side with provenance/range hashes. It is not a virtual full model. Codes, recipes and nonpayload manifests may be shared through GitHub; actual ranges have been prepared privately; recipient delivery is pending sharing approval. No private payload reference is included in this public source document. Do not commit/push the artifact or invent a new full-file verification claim from range verification.

Current local evidence: actual peer source verified, adapter contract runs pass, real4 LoRA payloads remain unreceived, **realOriginalJoint:false**. After approved delivery and receipt of the private base artifact, the LoRA owner can run the same module with its actual originals, preserving exclusions and PARTIAL scope. Full model/session/application/generation and two-pair composition remain outside this module.
