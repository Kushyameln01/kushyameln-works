This diagnostic checks all 65,520 keys for 128 selected queries in all 40 heads,
with head dimension 128. It does not run all sequence queries, read a model file,
or establish whole-model or original-workflow precision compatibility.

The fixed contract defines independent Python and JavaScript coordinate
generators. Every exact logical key tile has at most 256 keys; the final tile has
240. The final key has a large value sentinel, and the F64 reference proves that
dropping that single key changes every normalized output by more than 0.01.
Python and browser hash the entire independently generated Q/K/V byte streams.

The NumPy reference uses F64 batched MatMul and online softmax; it never caches
the full K/V tensors or a sequence-square score matrix. The browser calls the
frozen batched ORT unit 256 times, then Hike `divideAttention`. The preset gate
checks every max, denominator, unnormalized context, and normalized output value
with absolute 0.001 plus relative 0.0001 tolerance and requires all values finite.

Preparation is light and does not start numerical work:

```sh
python development/ai-connection/standalone-d1-d4-20261102/long-attention/run.py prepare
OPENBLAS_NUM_THREADS=4 python development/ai-connection/standalone-d1-d4-20261102/long-attention/run.py self-test
```

Commit the prepared diagnostic and operator sources before the following heavy
commands. The runner rejects source content that differs from HEAD. Run only
after the coordinating agent authorizes the workload:

```sh
OPENBLAS_NUM_THREADS=4 python development/ai-connection/standalone-d1-d4-20261102/long-attention/run.py reference \
  --private-dir /tmp/d1-long-attention-reference \
  --public-meta development/ai-connection/standalone-d1-d4-20261102/long-attention/reference-public.json
python development/ai-connection/standalone-d1-d4-20261102/long-attention/run.py browser \
  --private-dir /tmp/d1-long-attention-reference \
  --report development/ai-connection/standalone-d1-d4-20261102/long-attention/browser-result.json
```

Numerical `.f64` files and their manifest stay in the dedicated `/tmp` directory.
Public reports contain counts, arithmetic/source identities, metadata and payload
hashes, scalar ranges, timing, and comparisons. The reference's named F64 arrays
and one K/V tile require roughly 100 MiB, excluding NumPy/BLAS/runtime overhead;
the measured reference maximum RSS is included in its public metadata. Browser
allocator memory is not inferred from named span sizes.
