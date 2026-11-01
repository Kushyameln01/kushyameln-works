S2 adds an input/output byte guard before any reference weight traversal.
It changes no numerical operation, threshold, fixture construction or plan.
Historical S1 source and receipts remain retained separately.

The private runtime JSON must carry the original runtime evidence. Its
inputHashes.residualSHA256 and timeAct1SHA256 must equal the frozen saved-tail
case. conditioningSHA256 and conditioningMaskSHA256 must equal the declared
conditioning data and mask identities. The fixture contract or complete native
Text artifact binding remains required. A declared fixture identifier alone
does not validate the actual bits consumed by the runtime.

All25 private intermediate arrays are reconstructed as little-endian F32 and
hashed. Each hash must equal the original evidence.outputHashes entry. This
detects serialization that changes negative zero into positive zero even when
ordinary numerical comparison reports equality. Missing evidence, incomplete
hash coverage or any mismatch fails before Parameters is created and before
NumPy model projection.

JSON numeric negative zero must be emitted as `-0.0` for Python. JSON token
`-0` is parsed by Python as integer zero and loses the sign. Both incoming
Playwright payloads and outgoing private runtime arrays require a transfer
format that preserves these bits; the loader guard checks the resulting
evidence instead of assuming that transport preserved them.

`test-p4-cross-ffn-reference.py` has explicit failing-then-passing cases for
lost output negative zero and each mismatched input hash. The original gate
plan SHA256 remains
`051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600`.
No S2 original-model numerical execution was performed by this guard change.
