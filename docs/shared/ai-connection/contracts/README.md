# Adopted common descriptor schema

Common ID: `works-module-contract/1.0-draft.1`. This implementation adopts the
attached integration specification **1.1-draft.1** and implementation plan
**0.1-draft.1** (2026-10-31 JST), especially specification §§4,18,19 and plan M1.
This is an external common representation. It does not replace native
`works-ai-1`, `diffusion-models/0.1`, or LoRA SDK API version 1, and does not
assert owner agreement or native runtime readiness.

The five `*.schema.json` files are JSON Schema 2020-12. `schemas.mjs` is a static
browser-compatible mirror checked for byte-independent structural equality in
`tools/ai-connection/test-descriptor.mjs`. `descriptor.mjs` supports exactly the
keywords used here: `$ref` (local `$defs` only), `anyOf`, `type`, `const`, `enum`,
`required`, `properties`, `additionalProperties`, `propertyNames`, `items`,
`minItems`, `minLength`, `pattern`, and `minimum`. It is not a general schema
loader. It performs no remote fetches, interpretation callbacks, inference
runtime imports, defaulting, coercion, unknown field deletion, or native calls.

## Decisions adopted for previously unspecified details

- Module operations use `inputPorts` and `outputPorts`, each an array of the
  same public port contract. `roles` is a nonempty array per operation. Role
  registration is explicit in `registry.roles`; an unknown role is `UNKNOWN_ROLE`
  and must be treated as UNVERIFIED by connection consumers.
- Module `implementationRef`, native version/build/transport/entrypoint and
  nullable `adapterRef` are independent. Source is repository + full 40-digit
  commit + path, or archive reference + SHA-256. A native build can be `null`
  when that API has no independent build identity; this is not invented from a
  document version. Module `resourceContract` and `cancellation` are mandatory
  objects; resource and live-state acceptance remains explicit in M2.
- Public ports include `bindingRef`, `owner`, source/native references,
  `artifactKind`, `semantics`, `profileRef`, optional tensor constraints,
  required metadata JSON Pointers, required identities, ownership/transport,
  allowed adapter references, and required extension schemas. The port does
  not fix any model family, shape, stage count, precision, or scheduler.
  `null` in a port tensor shape denotes a declared variable dimension.
- Artifact retains the §4 representation. Optional `profileRef` makes the
  selected connection profile explicit; M2 can require it without changing
  native metadata. Tensor payloads remain references. `semantics.unit` and
  `normalization` are optional JSON values whose interpretation belongs to the
  registered semantic schema. Metadata is preserved as JSON, not rewritten.
- Extension keys are namespaced (`namespace:name`). Each value contains
  `schemaId`, `schemaVersion`, `requiredForUse`, and `data`. Unknown optional
  extension data is retained; unknown required schema interpretation is listed
  in `unknownRequiredSchemas` and must block dependent execution.
- Pipeline `externalArtifactRefs` is a required explicit array, including the
  empty array when there are no external inputs. Steps are an already ordered
  finite manifest. Inputs resolve only to external inputs or earlier outputs;
  duplicate step IDs, duplicate artifact producers, forward references,
  unresolved inputs and cycles are rejected. No scheduling engine is included.
- ExecutionSnapshot and EdgeDecision additionally require `contractVersion`.
  Snapshot validation checks structure and duplicate step bindings; it does not
  calculate or verify `snapshotHash`, execute the profile, publish state, or
  claim package completeness. Those are M5/M6 responsibilities.
- Edge checks/reasons allow additional diagnostic fields for M2 field paths,
  owner, contract references and other evidence. Native errors are not renamed
  into these common reason codes.

## Validation interface and scope

`validateModuleDescriptor`, `validateArtifactDescriptor`,
`validatePipelineProfile`, `validateExecutionSnapshot`, `validateEdgeDecision`,
and `validatePortContract` accept `(value, registry)` and return
`{ valid, issues, unknownRequiredSchemas, value }`. `value` is the original
object, with no mutation. Issues contain `code`, JSON Pointer `fieldPath`, and
`reason`. Unknown required schema entries contain `schemaId`, `schemaVersion`,
and `fieldPath`; these are distinct from malformed-structure issues.

Registry shape is `{schemas: [{schemaId, schemaVersion, ...}], roles: [string]}`.
Missing/malformed registry lists mean no known entries. A matching schema entry
confirms that the caller has selected that interpretation; it does not establish
numeric validation or model execution. Artifact native and semantic schema
references, module port semantics, operation semantic refs, and required
extensions are checked explicitly. Optional unknown data stays opaque.

A native schema entry can opt into `g1cMetadata: true`. Only that registry-selected
native contract checks strict G1C `context` and `latentContract`, including
nonempty unique producer model hashes, optional model membership, decoder hash,
normalization declaration, exact native keys, and frame-time cardinality. It also
cross-checks native decoder/all ordered producers and source frame arrays against
common provenance/lineage, and requires the exact generated native meaning
`wan21-raw-generated-sample:v1`.
These Wan/G1C rules are not universal artifact requirements. Frame array order
and duplicates are preserved, and latent T is not required to equal source F.
The validator checks declarations; `restored` is not evidence of numeric
restoration or correct decode. Native-to-common mapping and binary roundtrips
remain M3.

All descriptor values must be plain finite JSON. Runtime handles, TypedArrays,
nonfinite numbers, unsafe integer values, cycles and sparse holes are rejected.
Binary tensor/mask data belongs in payload storage, referenced by the descriptor.
The validator does not inspect payload bytes or prove provenance authenticity.
