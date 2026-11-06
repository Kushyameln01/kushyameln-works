Real Text L512 reference preparation is limited to block0, fixed N2 HIGH1 and
LOW3, immutable base weights, and the existing cross-attention plus FFN stage.
The acquired packet is used in full: F32 BLC `[1,512,4096]`, all512 rows,
all512 mask entries, and its complete original native metadata/header.

The unchanged independent oracle is
`tools/diffusion-models/p4-cross-ffn-reference.py`, SHA256
`66ded34a4bb74d261b81484bf2abd2d9ee75b0e4cf82ce6a063e02237a7a7ecf`.
It already accepts explicit native Text L1..512. No numerical implementation
change or copied implementation is required. Its frozen plan SHA256 is
`051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600`.
Original core source SHA256 remains
`17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699`.

Local cuts keep abs0.001/rel0.0001. Composed cuts keep abs0.01/rel0.001.
Every value in all25 intermediate arrays must pass. Failures remain failures;
neither gate may be relaxed after observing results. Model parameters keep
their original storage, full widths and reductions: Text4096→5120→5120,
QK RMSNorm over5120 before all40 heads of128, FFN5120→13824→5120,
full512 K/V rows, no cross RoPE, no added attention mask or compaction.
The mask remains preserved metadata. Existing binary64 reference operations,
named F32 roundings and independent IEEE/FP8 decoders remain unchanged.

`prepare-input.py` is a packet adapter and input preflight only. It checks
the frozen whole packet, payload, raw header and mask hashes, decodes F32
without arithmetic, retains the exact header bytes plus all original metadata
in the private native JSON, and verifies the JSON roundtrip has identical F32
payload/mask bytes. The `producer.sourceCommit` is the acquired execution
source `5537b8932343aa2476b95191817e8913f99dab02`; the separate artifact source
is `f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48`. Those bindings do not create a
new producer acknowledgement or claim original workflow prompt acceptance.

The adapter calls the unchanged oracle's saved-input guard for both retained
tail artifacts and records each savedArtifact/residual/timeAct1 hash. It does
not open model files, rerun prefix/self-attention/tail, or execute reference
matrix operations. All new private files are under `/tmp`, directory0700 and
file0600, and no existing output is overwritten.

Prepare input and run boundary tests before the runtime/source freeze:

```sh
PYTHONDONTWRITEBYTECODE=1 python development/ai-connection/p4-real-text-l512/reference/test-prepare-input.py
PYTHONDONTWRITEBYTECODE=1 python development/ai-connection/p4-real-text-l512/reference/prepare-input.py --output-dir /tmp/p4-real-text-l512/inputs
```

After the parent approves the frozen source/input/gate plan, complete composed
reference execution before starting the actual runtime. `run-reference.py`
reuses the same unchanged oracle numeric functions and parameter decoder; its
new functionality is strict binary artifact transport. Each private artifact
contains one exact little-endian `.f32` file per cut and an identity manifest.
Example HIGH pre-runtime command:

```sh
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python development/ai-connection/p4-real-text-l512/reference/run-reference.py --mode compose --side HIGH --saved-tail /workspace/work/diffusion-private-tail-saved-outputs-20261101/high-tail-outputs.json --output-dir /tmp/p4-real-text-l512/composed/high --receipt development/ai-connection/p4-real-text-l512/reference/high-composed-receipt.json
```

Freeze its composed manifest SHA256 and all25 output hashes before native
execution. After the actual runtime writes its binary manifest, execute local
mode with `--runtime-manifest`, `--composed-manifest` and the previously frozen
`--composed-manifest-sha256`. Local mode checks all input/output identities
before reading original weights, runs the unchanged local/composed oracle,
requires exact reproduction of every pre-runtime composed cut and all
parameter-source receipts, and compares all25 actual cuts to both references.
It also reuses the unchanged strict all29 parameter identity verifier, pinned
to `p4-cross-ffn-browser.py` SHA256
`141ab992ec58f3b985e739ec00f79ec98b03d0bbfc4d1581bc4131a3c986707b`.
LOW uses the retained low-tail path, LOW schedule3 and new output/receipt paths.
Private arrays/native metadata remain outside Git; public receipts contain
only identity, count, parameter-source, numeric-gate and scope evidence.

Production/full-model inference, HIGH→LOW handoff, precision acceptance,
generation and VAE decode remain outside scope. Readiness remains
load/predict/sample=NOT_READY and generationReady=false.
