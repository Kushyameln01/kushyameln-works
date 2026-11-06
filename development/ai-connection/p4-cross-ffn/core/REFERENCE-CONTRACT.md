The new oracle is `tools/diffusion-models/p4-cross-ffn-reference.py`. The earlier
`p4-reference.py` remains the fixed QKV diagnostic and is unchanged.

`candidate-plan.json` and `fixture-contract.json` were written before any new
original-matrix execution. Their SHA-256 values are pinned inside the oracle.
Local cuts use `abs 1e-3 + rel 1e-4`; the composed new-stage path uses
`abs 1e-2 + rel 1e-3`. Every value must pass. A failed gate remains failed and
cannot be widened after seeing results. These are diagnostic F32 versus binary64
gates, not original FP8 activation or GPU precision acceptance.

Default conditioning is the separately identified deterministic L4 fixture.
Its row2 is positive zero and mask0; all four rows pass through Text projection
and cross softmax unchanged in count. No encoder, tokenizer or real workflow
is claimed. Existing saved HIGH1 and LOW3 residual/timeAct1 inputs are checked
against their pinned export receipts and F32 identities. Prefix, attention and
the old tail are not rerun.

The oracle independently decodes IEEE binary16 and E4M3FN. FP8 decoded values
are multiplied by each matrix's own F32 scalar. Every original range is hashed;
scale/config receipts contain identities and source extents, never scalar
values. Weight rows are bounded to81920 decoded values. FFN down uses four
complete13824-column rows, preserving the Gemm reduction dimension. NumPy
binary64 dot products are rounded to F32 before separate F32 bias addition.
Norm reductions, tanh GELU and dense per-head stable attention use binary64;
their named outputs round to F32. Pointwise modulation and residual operations
are separate F32 operations. All40 heads and all supplied Text rows participate;
there is no cross RoPE, mask, dropout or phantom padding.

`--runtime-cuts` accepts a private `bernini-p4-runtime-arrays/0.1` JSON with
`side`, `candidatePlanSHA256`, `inputBindings`, and all25 flat `arrays` named by
the frozen plan. `inputBindings` is exactly savedArtifactSHA256 and
conditioningDataSHA256, plus finalF32PatchArtifactSHA256 for a patched run.
The exact inputBindings also include conditioningMaskSHA256 and, for a fixture,
fixtureContractSHA256. A native Text file instead supplies
nativeTextArtifactSHA256 over its complete UTF8 bytes, binding its producer
sourceCommit, mask and other metadata without authenticating the producer.
These identities are checked before accepting runtime predecessor arrays.
The oracle computes both composed references from the saved tail and local
references from each actual runtime predecessor during one weight traversal.
Both are compared with their respective frozen gates.

Private references include the same parameterSources used by public receipts.
Each source has rawSHA256, independent decodedF32SHA256 and finalF32SHA256.
Matrix aliases use `key:rowStart` to match runtime evidence. Time projection
weight has separate chunk aliases :15360/:20480/:25600; time bias and modulation
have the same element-offset aliases. Aggregate identities are retained too.
Each FP8 matrix alias includes its own scaleSHA256 and quantConfigSHA256.
This permits strict decoder/effective-feed byte comparisons before the numeric
gate without publishing scale values or parameter arrays.

`--text` is a separate explicit private input, schema
`bernini-p4-native-text-input/0.1`, with F32 BLC shape `[1,L,4096]`, flat data,
meaning `text_hidden_states`, attentionMask, producer module `text_encoder`,
producer sourceCommit, modelSha256 and tokenizerSha256. Unknown tokenizer
identity is explicit null. Providing a payload does not establish joint
producer acceptance; that remains false until separately checked.

`--patches` accepts final F32 overrides, without low-rank multiplication:
schema `bernini-p4-final-f32-patches/0.1`, side, candidatePlanSHA256 and patches.
Each patch supplies weightId, fullShape, offset/count in original tensor element
coordinates, exact F32 sha256, data, dtype `F32`, and a binding object. Matrix
binding is `runtime-input`; vectors use `hike-parameter`; binding name equals
the original key. Patches cover complete matrix input rows, max16 or max4 for
FFN down. Cross/FFN weight and bias targets are allowed. Text targets require
explicit allowTextEmbedding=true; norm/time/modulation patches are refused.
Overlaps, bad hashes, wrong side and bad bindings fail. Unpatched elements
remain the immutable base. Public metadata calls this a
`caller-final-f32-feed-fixture`, not a LoRA producer receipt.

All new array payloads must be written under `/tmp` in directory0700/file0600.
Public receipts are constructed from a whitelist of identities, shape/counts,
semantics, sources and gates. No private array or raw weight scale is published.
Readiness remains load/predict/sample NOT_READY, generationReady=false,
originalWorkflowInputsVerified=false and originalProductionPrecisionVerified=false.

Boundary checks, without original-matrix computation:

```sh
python tools/diffusion-models/test-p4-cross-ffn-reference.py
```

After the parent freezes execution source, one side can be generated using:

```sh
python tools/diffusion-models/p4-cross-ffn-reference.py \
  --models /workspace/work/retained/bernini --side HIGH \
  --saved-tail /workspace/work/diffusion-private-tail-saved-outputs-20261101/high-tail-outputs.json \
  --output-dir /tmp/p4-private-reference-high \
  --receipt-dir development/ai-connection/p4-cross-ffn/core/reference-high
```

Use a distinct new private output/receipt directory for every run. The script
does not overwrite output or recompute full model hashes.
