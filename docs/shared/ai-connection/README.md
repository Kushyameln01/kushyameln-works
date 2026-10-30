# Common AI connection contracts — A0 / M1 / M2

Implementation adoption: `works-module-contract/1.0-draft.1`, based on the current
attached connection specification **1.1-draft.1** and implementation plan
**0.1-draft.1**, 2026-10-31 JST. Native APIs remain unchanged. This directory
contains browser-safe ES modules with no model, Worker, ORT, Hike, or native
module imports. No adapter code is downloaded or invoked.

The authoritative source/build/owner matrix, unresolved U1–U9, owner questions,
and next-stage M4/M5 acceptance conditions are in
[`development/ai-connection/`](../../../development/ai-connection/SOURCE-BASELINE.md).
Current main, unmerged G1C, this older working checkout, reports, and unavailable
next contracts are separate sources. Owner agreement is not inferred.

## Validate declarations

Import any of these from `descriptor.mjs`:
`validateModuleDescriptor`, `validateArtifactDescriptor`,
`validatePipelineProfile`, `validateExecutionSnapshot`, `validateEdgeDecision`,
`validatePortContract`. Each accepts `(value, registry)` and returns
`{valid, issues, unknownRequiredSchemas, value}` without changing the input.
Binary tensors and masks remain payload references. Unknown optional extensions
are retained, not interpreted or deleted.

The five JSON Schemas and adoption details are in [`contracts/`](contracts/README.md).
`registry.schemas` explicitly selects known schema IDs/versions; `registry.roles`
selects known operation roles. A schema registry entry is a declared
interpretation, not proof of source authenticity or numeric correctness.

## Decide a concrete edge

```js
import { evaluateEdge } from './compatibility.mjs';
const decision = evaluateEdge({
  producerPort, consumerPort, artifact, adapters, registry,
  implementationState, requiredScopes, evidence, resourceState, activeBindings,
});
```

All live state comes from these explicit arguments. The decision records the
producer/consumer binding refs, comparison field paths, expectations/observations,
contract/source/build refs, reasons and owners. Roles and implementation states,
compatibility, per-scope validation, and readiness are independent records.
Known contradictions take precedence over missing interpretation when both are
present. Static operation capacity is an incompatibility; transient budget or
binding failures change readiness only.

This initial evaluator requires explicit `semantics.unit`, `normalization`,
`profileRef`, full source identity and non-null native build before returning
COMPATIBLE. A descriptor can validly retain a null/unknown build; the dependent
edge remains UNVERIFIED. This is a conservative common-side adoption, not a
new native field or replacement build ID. A profile is currently compared by
exact ID; subtyping/range inclusion is not guessed.

For tensor semantic registry entries, `nativeMeanings: [string]` explicitly
binds native meaning to that semantic version. Missing interpretation gives
UNVERIFIED; a contradictory native meaning gives INCOMPATIBLE. `semanticFields`
can name additional required semantics fields, compared exactly on both ports
and the artifact. `nativeAssertions: [{metadataPath, expected}]` can declare
fixed JSON-Pointer metadata assertions (e.g. a specific normalization declaration).
These finite comparisons run no callbacks. Optional opaque extension data is
not treated as a semantic synonym. Registered G1C native data also checks its
strict keys and native/common correspondence; numeric restoration still needs
separate evidence.

Port `requiredMetadata` contains JSON Pointers relative to native metadata.
Identity requirements match kind, role, algorithm, value and scope. An optional
`location: 'producerRefs' | 'consumerBindings'` pins the identity list, so a
decoder requirement can explicitly demand a consumer binding. Array order and
duplicates in source frame lineage remain intact.

`implementationState` has `producer` and `consumer` entries, each containing
`bindingRef`, `operationId`, `roles`, and `state` (`implemented`, `partial`,
`not-implemented`, `unknown`). Only an implemented, explicitly bound operation
can be ready. Partial numerical diagnostics do not enable full-model execution.

Each `requiredScopes` entry needs exactly matching evidence. Evidence records
have `evidenceId`, `scope`, `result`, `subjectRefs` containing both binding refs,
`contractRefs` containing both native versions/builds and source commits (or
archive digests), `artifactRef`, `profileRef`, and `inputConditions` with matching
shape/dtype plus explicit coverage/environment. Scope names are exact; no
partial-to-full promotion occurs. Evidence is supplied, not authenticated by
this module. Artifact IDs/binding refs must be immutable identities in the
caller's store; runtime byte/hash verification belongs to M3/M5.

`resourceState` explicitly provides `status`, `ownerId`, `requiredBytes`,
`budgetBytes`, `occupiedBytes` (finite safe nonnegative integers). `activeBindings`
has `producer`/`consumer` entries with bindingRef, ownerId, valid,
currentRevision, expectedRevision. Borrow/lease additionally needs
`activeBindings.artifact` with artifactRef, ownerId, valid, leaseCurrent.
This evaluates supplied state; it does not reserve resources or prevent races.

## Available adapters

This first implementation supports explicit finite semantic space/unit/
normalization transformations. An adapter declaration contains adapterId,
version, owner, full sourceRef, available:true, supported profiles,
`rules: [{fieldPath, from, to, reason}]`, and evidenceRefs. Both ports must permit
its adapterId and every mismatch must have an exact applicable rule. No shape,
model identity, missing required metadata, mean/sample relabel, approximation,
or dtype conversion is inferred. Unsupported transformations remain known
incompatibilities or UNVERIFIED when their interpretation is missing.

NEEDS_ADAPTER returns the full adapter selection with version/source/rules and
blocks readiness. The caller must insert it and re-evaluate its input/output,
evidence and resources. This code never reports a conversion as executed.

## Reproduce and interpret scope

```sh
node --test --test-isolation=none tools/ai-connection/test-*.mjs
node tools/ai-connection/show-decisions.mjs
```

Run from repository root. The first command checks schema structure and
registered coherence, retention, finite pipeline references, explicit-state
decisions and negative cases. The second emits reasoned fixture decisions for
all four outcomes, static capacity, temporary RAM and missing numeric evidence.
See [`examples/`](examples/README.md) for source-pinned external module
descriptions and a non-Wan one-stage audio fixture. They do not import native
modules, establish owner adoption, or claim real inference support.

M3 runtime/binary adapters, M4 queue/cancellation, M5 canonical hashes/packages,
M6 publication of snapshots, actual model execution and public deployment are
separate next stages. Snapshot validation does not verify its hash. No numerical
model condition, precision, output shape, or native wire has been changed here.
