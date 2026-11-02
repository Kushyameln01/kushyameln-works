# Independent full 40-block reference

`tools/diffusion-models/standalone-reference.py` is a separate NumPy implementation
of the pinned actual Bernini/Wan source. It imports no candidate implementation,
runtime, ORT, or earlier reference module. It parses the original safetensors
header itself, checks the exact 1,815 tensor descriptors across all 40 blocks,
and validates each quantized matrix's own positive F32 scalar and exact profile.

Each projection seeks bounded rows from the retained original file, decodes only
that tile to F32, reduces the complete inner dimension in F64, rounds the dot to
F32, and adds its bias separately in F32. With 128 rows the largest decoded tile
is 7,077,888 bytes; the temporary F64 tile is 14,155,776 bytes. No complete F32
matrix or full model is cached. The original file is not downloaded or fully
hashed again. Prior verified model identities, exact header hashes, byte extents
and stable file stat values bind these local reads.

The reference executes channel-major 64-value patch convolution; both text
embedding projections; the complete time embedding and six time projections;
all 40 blocks with full 5120-wide Q/K RMS normalization, 40 attention heads,
global ordered target/context keys and source-ID RoPE; affine cross norm3;
GELU FFN with e3/e4 modulation and e5 gate; and the final head using raw time
embedding. Every concatenated token goes through the 64-column head before the
target prefix is selected and unpatchified. Text mask metadata does not remove
rows because the pinned source does not apply such a mask in cross attention.

The controlled case has target/source RGB geometry 1×16×32 and reference RGB
geometry 1×16×16. Their declared latent shapes are `[1,16,1,2,4]`,
`[1,16,1,2,4]`, and `[1,16,1,2,2]`, giving five tokens with source IDs 0, 1, 2.
The model-space declarations and encoder model/tokenizer IDs are explicit test
metadata; they do not authenticate a VAE or Text producer. All three Text rows
are separately constructed nonzero dyadic fixtures with mask `[1,1,1]`.
The L512 Text artifact supplies identity metadata only and is not truncated.

Before either reference or candidate execution, `freeze` saves explicit private
F32 inputs, noise and construction metadata and writes `contract.json` with
their hashes and the pre-existing composed gate
`abs(actual-reference) <= 0.01 + 0.001*abs(reference)`. No post-comparison gate
relaxation is permitted. `compare` requires all 47 arrays: five prefix arrays,
40 block outputs, all-token final head and target prediction. It compares every
value rather than norms or selected elements. Both artifacts must bind the
frozen contract, exact source/model/side identities and input hash. A separate
public reference receipt authenticates the private expected artifact's bytes.

Before execution, fixture revision 1 replaced the initial mask `[1,0,1]` with
`[1,1,1]` to satisfy established native conditioning admission, which requires
mask-zero rows to contain zeros. Numerical data, timestep and gates did not
change, and neither NN had executed. The contract records the superseded hash.

```sh
python development/ai-connection/standalone-d1-d4-20261102/reference/test-reference.py
python tools/diffusion-models/standalone-reference.py freeze \
  --output /workspace/work/diffusion-private-hidden/standalone-n5-l3-input.json
```

`run` is an explicitly heavy command and is not part of these analytic/header
tests. Each HIGH or LOW execution reads approximately 15.6 GB of retained model
data. Private input/reference/candidate values stay outside the repository;
public receipts contain hashes, shapes, gates, counts and source extents only.

This saved-small case cannot establish D2 completion, original media correctness,
the required 81-frame source/context domain, production precision, sample
continuation, or public load/predict/sample readiness. These remain separate
required checks even if all five-token values pass.
