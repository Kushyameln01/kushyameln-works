# Verification — A0 / M1 / M2

Date: 2026-10-31 JST. Scope: common descriptors and pure declaration-based connection judgments. This is not an inference, graph, LoRA application, runtime transport, queue, or package acceptance.

## Fresh checks

- `node --test --test-isolation=none tools/ai-connection/test-*.mjs`: 58/58 pass (descriptor 26, compatibility 25, examples 7). Separate `node --test` invocation of the three files also passes. The isolation flag exposes each named case in this environment rather than aggregating them as file-level tests.
- `node --test --test-isolation=none tools/inference/test-tensor.mjs tools/inference/test-controller.mjs tools/inference/test-external-api.mjs tools/inference/test-hike.mjs tools/inference/vae/test-api.mjs tools/lora/test-api.mjs tools/lora/test-sources.mjs tools/lora/test-folder.mjs tools/lora/test-kernel.mjs`: 37/37 pass in the existing local checkout. This checks the additive change does not require native imports or break the available local native tests; it does not re-run remote G1C real-model acceptance.
- Python `jsonschema.Draft202012Validator.check_schema` validates all five JSON Schemas. The same independent validator accepts all eight decisions emitted by `node tools/ai-connection/show-decisions.mjs` against the EdgeDecision schema.
- `git diff --check`: pass. All product changes are new files in the three requested locations; existing native APIs, kernels, codecs, vendor assets and build receipts are unchanged.
- A0 receipt: 18 retrieved source commit/path entries; independent Git blob SHA recalculation matches retrieved blob identity for all 18. See SOURCE-RECEIPT.json.

Do not add these counts to historical fixture12/source7/SDK32/Python53 or call their sum generation acceptance. They measure different scopes.

## Observed examples

| Fixture | Compatibility | Readiness | Reason |
| --- | --- | --- | --- |
| Exact known declarations + explicitly bound fixture evidence/state | COMPATIBLE | ready | Scope is synthetic fixture only |
| Native sample interpreted as mean | INCOMPATIBLE | blocked | SEMANTIC_MISMATCH, nativeMeaning/schema checks |
| Wrong decoder / missing mandatory metadata | INCOMPATIBLE | blocked | PROVENANCE_MISMATCH / REQUIRED_METADATA_MISSING |
| Unknown required schema | UNVERIFIED | blocked | UNKNOWN_SCHEMA and owner/source refs |
| Four elements into a three-element static cap | INCOMPATIBLE | blocked | STATIC_BUDGET_EXCEEDED, observed count and limit |
| Temporary RAM below request | COMPATIBLE | blocked | RESOURCE_NOT_READY, contract remains unchanged |
| Known exact versioned permitted restoration adapter | NEEDS_ADAPTER | blocked | Explicit insertion/re-evaluation, no conversion executed |
| Matching declarations without numeric-restoration evidence | COMPATIBLE | blocked | real-restoration scope not-verified |
| Different one-stage no-LoRA synthetic audio module | COMPATIBLE | blocked | Declared contract fits; not-implemented/no numeric evidence |

## Independent review and fixes

A read-only code reviewer reproduced two false-acceptance issues: inconsistent native/common G1C decoder/producers, and sample relabelled as a mean. Negative tests were run before repairs. G1C registry-selected coherence and versioned nativeMeaning correspondence now reject both. Additional malformed input paths (null extension requirement and non-array evidence/role lists) were reproduced and repaired with a negative regression. Final reviewer recheck is recorded in the handoff report.

A separate purpose/procedure auditor returned PROCEED for the A0/M1/M2 scope, the source distinctions, and the M4/M5 deferral. Its advice to expose static counts/byte limits and full adapter selection source/version/rules was implemented. This is a review of this work, not a promise of continuous monitoring.

## Limits and next stages

M3 native invocation/binary roundtrip; M4 targeted old-cancel barriers and parent/child read deadlock; M5 JCS/package/full-byte integrity; M6 snapshot publication/rollback; actual models/full workflows/peak RAM/public Pages execution are not tested here. The schemas validate snapshot structure, not snapshotHash; example all-zero hash is explicitly a schema fixture. Owner reading/adoption of 1.1 remains unconfirmed. Unavailable 9023329 and next consumer contracts remain unverified for their dependent edges.

RTK setup was attempted with the supplied pinned preparer and failed with `Operation not permitted` at network retrieval before installation. Normal commands were used; RTK was not reported active. No service account/payment change, publishing, merge, push, or model alteration occurred.
