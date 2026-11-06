# Actual block0 post-modulation hidden, natural N2

`createBlockHiddenPrefix({file,side,...explicitKernelBytes})` runs a bounded
prefix cut using actual immutable HIGH or LOW parameter ranges. It accepts the
actual VAE Rect mean from `855f435120f08eb9e818e51281fc26f0e2633829`, explicit
noise128 defined by the frozen plan, noiseScale=1, and HIGH scheduleIndex1 or LOW
scheduleIndex3. LOW is an independent diagnostic case, not a HIGH→LOW handoff.
No whole-model load/predict/sample readiness is changed.

```js
const prefix = await createBlockHiddenPrefix({file: originalLocalFile, side:'HIGH'});
try {
  const r = await prefix.run({
    rawMean: exactRectMean, noise: explicitDiagnosticNoise,
    noiseScale:1, scheduleIndex:1, signal,
  });
  // r.hidden: owned F32 LC [2,5120], implicitBatch=1
  // original core BLC shape [1,2,5120]; row0->(0,0,0), row1->(0,0,1)
  // positions: owned F32 [2,3], sourceIds: owned I32 [2], both derived
} finally { await prefix.dispose(); }
```

Rect NCTHW [1,16,1,2,4] is normalized by the existing Rect-specific Hike entry,
then mixed with explicit noise by the unchanged simple6/shift5 scheduler. The
actual F16 patch Conv3d [5120,16,1,2,2] is lowered into im2col C→kT→kH→kW [2,64]
and streamed runtime-input F32 Gemm. Actual time Linear256→5120→5120 and first
10240 time-projection rows produce shift/scale chunks0/1; actual block0 modulation
is added. All5120 LayerNorm and modulation produce the self-attention input.
The later four chunks, attention O projection, residuals, cross-attention and
FFN are outside this cut. No target/context tokens are padded or repeated;
context_latents=[] and sourceIds=[0,0].

`source.mjs` checks the original File/Blob's size, strict header hash, original
keys, full shapes, storage dtype, selected range and FP8 scalar scale/config.
F16 values and FP8 QKV tiles are decoded by the pinned existing Hike bridge.
Matrix entries bind to ORT `runtime-input`; bias, QK norm and modulation vectors
bind to `hike-parameter`. This scope has no weight initializer binding.
`readRows(key,start,count<=16)` and `readVector(key,start,count<=10240)` return
owned raw and F32 blocks plus selected source receipts. QKV FP8 is decoded only
under the explicit scaled-e4m3fn-scalar-F32 profile; prefix parameters are F16.
The expected full model hash comes from the earlier owner receipt: this run
neither recomputes nor reauthenticates the 31GB pair. Reading a registered key
with the wrong row/vector binding or outside its full shape fails.

`linear.mjs` creates ORT1.24.3 runtime-weight Gemm with symbolic M/K/N and an
optional F32 Sigmoid→Mul SiLU session. `includeSilu:false` omits that session for
the downstream QKV owner. Rows1..16, inner1..5120 and output columns1..16 are
explicitly admitted. Inputs are snapshotted before await; ORT input/result
Tensors stay internal and are disposed after each operation. The SiLU input
must be finite |x|<=1e6. This rule is separate from LayerNorm admission.

The owner acquires BUSY before input getters, rejects reentry, checks abort after
awaits/hash/progress, and commits no result on cancellation or failure. Cancel
then await before dispose. An in-flight ORT run finishes its native call before
abort is observed. Failed native Tensor/session disposal retains the handle,
blocks reuse, and can be retried with `recover()`; successful dispose/recover is
terminal. The manager owns the global queue and workflow; these factories own
local numerical work and native resources. Returned arrays are caller-owned;
no WASM view or native handle crosses the boundary.

Private actual artifacts contain all intermediates for independent checking.
`hidden-compare.py` first pins the full reference hash to the public independent
reference receipt and verifies the frozen plan hash and gates. Public trusted
receipts record actual-artifact SHA256, the owner-local executed source/build
inventory (the final main build closure owns complete import closure), all parameter
raw/F32 hashes, numeric gates and evidence. The downstream harness first checks
the artifact's complete bytes against that external receipt, then verifies
hidden/coordinate/source bits and producer identity. Caller booleans alone are
not production provenance. This is integrity binding to a reviewable receipt,
not cryptographic producer authentication.

A successful run streams 160,634,880 parameter bytes, maximum weight read
163,840B, maximum decoded tile327,680B. The strict header read181,280B is separate.
Four Hike Memories total5,046,272B; stage arrays total289,280B, plus temporary
raw/decode/weight snapshots/bias/modulation. Two ORT sessions coexist. ORT Memory,
allocator/GC/File/browser/harness and full-production concurrency require their
own measurement. Clear traffic (~1.73GB/run) and input snapshot traffic are
cumulative traffic, not simultaneous RAM. No file split or chunked pointwise
result is a graph-memory feasibility claim. Prefix disposal is an explicit
barrier before downstream construction in the current combined experiment.

Reproduction (private files stay outside the served `docs` directory):

```sh
DIFFUSION_TOOLCHAIN=/path/to/pinned/toolchain python docs/shared/diffusion-models/ort-bridge/block-hidden/build.py
BERNINI_LOW_FILE=/private/Bernini_LOW_fp8_e4m3fn_scaled.safetensors node --test --test-isolation=none docs/shared/diffusion-models/ort-bridge/block-hidden/test-boundaries.mjs
python tools/diffusion-models/hidden-reference.py --models /private/models --side LOW --output /private/low-prefix-reference.json --receipt /tmp/regenerated-low-reference-receipt.json
python tools/diffusion-models/hidden-browser.py --reference /private/low-prefix-reference.json --model /private/Bernini_LOW_fp8_e4m3fn_scaled.safetensors --actual-out /private/low-prefix-actual.json --out /tmp/low-browser.json
python tools/diffusion-models/hidden-compare.py --reference /private/low-prefix-reference.json --actual /private/low-prefix-actual.json --out /tmp/low-trusted-receipt.json
BERNINI_PRIVATE_HIDDEN=/private python tools/diffusion-models/test-hidden-compare.py
```

Use a new private reference output path (the generator refuses overwrite).
The repository must contain the VAE source commit855f435120f08eb9e818e51281fc26f0e2633829
for its exact raw-mean fixture. Repeat with HIGH's file/reference. The browser uses a local user-selected File;
the HTTP server serves only repository `docs`, never the original model or
private arrays. The independent reference recipe and public plan describe the
private input retrieval. `development/ai-connection/qkv-next/hidden-runtime/`
contains the observed RED/GREEN, browser and comparison receipts. All accepted
shapes and precision remain limited to the natural N2 profile and fixed cases.
