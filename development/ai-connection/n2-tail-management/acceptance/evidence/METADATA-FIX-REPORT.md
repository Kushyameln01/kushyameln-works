# R8 future-writer metadata correction

Scope: two public-metadata defects reported with the returned Diffusion packet at `508d72cc9036e7f500827465c644b4aed3c5f711`, whose recorded management execution source is `5c484a8783ab129a2ff3543a98b2537af9888199`. The working checkout HEAD during this correction was `055903abd667535e189ef50eb7dd70a0229a7efe`.

Only these repository files were edited by this task:

- `tools/ai-connection/run-norm-required-n2-tail.mjs`
- `tools/ai-connection/test-run-norm-required-n2-tail.mjs`

## Corrections

1. Each `publicReceiptProof[].sourceRef.sha256` now explicitly uses that verified public file's `pin.sha256`. Previously, spreading `N2_TAIL_SOURCE` and overriding only `path` retained the native stage module hash. The outer receipt pin and the actual byte verification were already separate; the change corrects the nested source-reference metadata.
2. The public serializer now retains `trustedInputs.attention` only when the containing trusted-input side is HIGH or LOW and its object has exactly these five own keys: `receiptSHA256`, `artifactSHA256`, `contextSHA256`, `fullPrefixReceiptSHA256`, `fullPrefixArtifactSHA256`. Every value must be a lowercase 64-character hexadecimal string and equal the existing fixed pin for that same side. Activation arrays, typed arrays, objects with missing/additional fields, unknown attention payloads, mismatched hashes/sides, and attention outside a recognized `trustedInputs` field remain omitted.

The metadata allowlist does not authorize new input values or expand native admission. Native source, numerical operations, trusted-input pins, profile, owner gates and execution wiring were not changed.

## RED/GREEN evidence

The two new positive metadata tests first failed on the old writer:

- `each public receipt source reference binds its own verified file digest`: observed the stage hash `ca35f70d…` instead of the candidate-plan file hash `58a7a187…`.
- `public receipt retains only the five exact pinned trusted attention hashes for each side`: observed `undefined` instead of the five known public hashes.

A third new test checks continued omission of numeric attention payloads and unrecognized metadata. After the minimal correction:

| Command | Result |
| --- | --- |
| `node tools/ai-connection/test-run-norm-required-n2-tail.mjs` | 10 PASS, 0 FAIL; includes the original seven runner tests and three new metadata tests |
| `node tools/ai-connection/test-norm-required-n2-tail.mjs` | 23 PASS, 0 FAIL; controlled owner and E4 disk readback regression scope |
| `WORKS_N2_TAIL_NATIVE_ROOT=/workspace/work/ai-connection/n2-tail-r7/native/a49aac4 node tools/ai-connection/test-n2-tail-source.mjs` | 3 PASS, 0 FAIL, 0 SKIP; fixed public source-byte proof |

The source test was initially run without its optional environment variable and skipped two source-dependent cases; the explicit-root rerun above completed all three.

These checks used public source verification, empty-asset preflight, controlled owner fixtures, and temporary synthetic E4 output files. No original private model, original activation input, or real tail numerical run was invoked. The existing fixed-source owner comparison test exercised the previously established synthetic fixture only.

## Preservation and handoff

The returned raw owner packet and its `5c484…` result were not rewritten, reserialized, or repaired. Their acceptance and provenance must remain based on their original bytes and the separate intake verification. This correction affects future writer output and does not claim a new numerical acceptance or regeneration of old receipts.

No commit or push was performed. The final edited-file SHA-256 values are:

```text
0ef80822920863e03685fa982a98e6e53b3588311d5a520ae4914349eba03db7  tools/ai-connection/run-norm-required-n2-tail.mjs
ca81f1ca37416161a6ff9710138f13eb891b40449f7248ebabd6d617ff79f227  tools/ai-connection/test-run-norm-required-n2-tail.mjs
```
