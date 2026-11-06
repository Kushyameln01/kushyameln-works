The new oracle covers real Text L512, fixed N2/block0/LOW3, selected real
light/LOW LoRA, cross-Q rows0..3 across all5120 columns and bias elements0..3,
strength+1. The BF16 factors have rank128 and actual alpha128. Other original
LoRA targets and other regions of these full original tensors stay excluded.
No existing frozen base source is changed.

A imports the exact owner's `original_header`, `read_tensor`, `decode_fp8`,
`merge_reference` and `bias_reference` functions from commit
`a80db72feea60b9bd69e292e4716665c6f0ee77f`, oracle SHA256
`6f9ed048c7c1ae1ddbd3fa7b3d4328304c4fbd7dc4ca0bfd031c712e5e17987b`.
It does not call the owner's controlled-K4 generate path or copy its lowrank
implementation. Actual factors, alpha and diff_b are independently read from
the acquired complete light/LOW original, SHA256
`86910e35a56af3b782ab8b7f857953c3dfce681ff89386c0a7b6ce764f8b527b`,
header SHA256 `bd4e95892305560456676c8fc9a4545c27f4deb979f5d2b929b7be7df2d5d333`.
The existing whole-file acquisition receipt/stat is checked; the reference
does not repeat that whole-file hash. Original LOW model bytes are retained,
with fresh bounded header/range and own Q scale/config checks.

A saves independent F64 weight20480 and F32 bias4 plus separately rounded
F32 sparse-patch JSON. The predeclared owner A weight gate is
absolute1e-5/relative1e-4; bias is absolute0/relative0. Original scale/alpha
absence cannot trigger a default. Actual SDK/Hike patch hashes stay separate
from independent A F64 and independently rounded F32 patch hashes.

B calls unchanged `validate_patches`, `Parameters` and `run_reference` from
the existing independent P4 oracle, SHA256
`66ded34a4bb74d261b81484bf2abd2d9ee75b0e4cf82ce6a063e02237a7a7ecf`.
It consumes independent A final-F32 patches, the full frozen native Text JSON
SHA256 `9cbbdace203ea996d9dd6afc1a8ae832f4b68c2bf1fc54306b9f944f818bd6a8`,
and the retained actual LOW3 residual/timeAct1 guarded by the original plan.
All512 Text rows/mask metadata, full5120 QK RMSNorm,40 heads, no added mask or
cross RoPE, and FFN13824 remain unchanged. Every B original raw/decoded source
record must match the accepted pre-runtime base LOW reference manifest SHA256
`530746b1e2d59d0c9cbe82e1ddad6d743ae32eb8fd7029f56cca694b57672be7`.

Compose mode must finish before SDK preparation or native numerical execution.
The private manifest schema is `bernini-p4-real-text-l512-lora-oracle/0.1`,
mode `COMPOSED_BEFORE_RUNTIME`, scope
`real-text-l512-saved-low3-n2-block0-selected-light-q4-strength1`.
It contains A descriptors, all25 B binary descriptors/outputIdentities,
independent patch artifact hash, source/selection/gates, and referenceId
`real-text-l512-light-LOW-q4-s1:<executionSourceCommit>`.
Its inputBindings has the four frozen real input bindings plus the independent
A `finalF32PatchArtifactSHA256`. The independent B blockOutput has10240 F32
values. No private arrays or actual scale values enter public receipts.

After the parent commits the source, the compose command is:

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python development/ai-connection/p4-real-text-l512/lora-reference/lora-reference.py --mode compose --source-commit SOURCE_COMMIT --output-dir /tmp/p4-real-text-l512/lora-reference/s1 --receipt development/ai-connection/p4-real-text-l512/lora-reference/s1-composed-receipt.json
```

Freeze the returned manifest SHA256 before native execution. The browser
independently compares SDK final F32 weight/bias against A with the fixed owner
gates before running the native candidate. Native validation compares expected
blockOutput using owner projection gate abs0.01/rel0.001,
`p4-cross-ffn-composed-f32-v1`. Its runtime schema is
`bernini-p4-real-text-l512-lora-runtime/0.1`. Actual runtime inputBindings binds
the actual SDK patch artifact, while `independentReferenceBindings` separately
binds `{oracleManifestSHA256,independentPatchArtifactSHA256}`.

After native output, local mode requires the frozen reference manifest/hash,
actual runtime manifest, and actual SDK sparse-patch JSON. It verifies all25
native output bytes, repeats the independent A gate, recomputes the unchanged
local/composed P4 reference with independent A patches, and requires exact
reproduction of pre-runtime B. All25 local cuts use abs0.001/rel0.0001 and all25
composed cuts use abs0.01/rel0.001. Every value must pass; no gate may be widened.

Three distinct parameter proofs stay explicit: immutable original raw/decoded
hashes match base; SDK completed F32 values meet A's numerical gate; and native
consumed F32 bits match the actual SDK completed package. The last proof streams
only original Q/bias decoding with actual SDK byte overlays, without lowrank or
projection math. The resulting full-selection effective hashes feed the
unchanged strict all29 identity verifier. Unpatched27 selections match B/base;
the two patched selections retain both independent-A-rounded and SDK byte
overlay hashes. The frozen B artifact is never rewritten to actual bytes.
The browser separately proves candidate/active/old-lease readback and rollback.

All private output files use `/tmp`, directory0700/file0600, exclusive creation.
Tests import exact pure functions, exercise sparse coordinates, fixed gates,
signed zero and streamed byte overlays without opening model weights or running
A/B. Full model, all LoRA targets, HIGH→LOW, production precision and generation
remain unaccepted; load/predict/sample=NOT_READY.
