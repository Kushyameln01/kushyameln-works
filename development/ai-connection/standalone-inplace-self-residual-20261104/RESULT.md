# In-place self-attention residual — 2026-11-04

Status: bounded native storage-change parity passed. Original N73947 completion, all40 blocks/final head, public sampler and full-model LoRA acceptance remain separate.

## Runtime change and dependency proof

After self-attention prepares **all original K/V rows** into the immutable owned pool, its Q/O/gate loop writes each completed residual into the same private block-input buffer. A future query reads only its own untouched row span. Attention reads every key/value from the completed immutable pool; it does not reread already overwritten input rows. The current row snapshot stays alive through Q, attention, O and `gateResidual` before its span is replaced.

The change aliases the existing output variable to input only when the prepared-K/V capability is active. Explicit older injected operators retain separate output and the four-span accounting path. No operator call, F32 boundary/order, graph, Q128/K256, exact tail, positions/sourceIDs, input snapshot/ownership or cancellation cleanup sequence changed. Public API names, readiness flags and the conservative four-store planning admission cap are unchanged. This engine can receive identified completed-F32 source weights; low-rank arithmetic remains external.

At N73947, one N×5120 F32 span is **1,514,434,560 bytes**. Prepared-path logical self-attention storage is now three spans (owned input/residual plus the two immutable K/V spans): **4,543,303,680 bytes**, down from 6,057,738,240. The prepared CPU K/V tensors are those same two logical spans and must not be counted again. Row temporaries, weight caches, ORT/WASM staging, source decoding, allocator and GC overhead remain additional. These are logical named spans, not measured aggregate peak. The admission cap still explicitly describes its conservative four-store estimate.

## Native evidence

[evidence/native-low-block0-259.json](evidence/native-low-block0-259.json) captures exact source hashes, test-only instrumentation hashes and the browser version. Its unchanged-source check passed. The model enters through a real browser File; no model payload HTTP route exists.

A fresh one-thread/no-COI Chromium executed actual retained LOW block0 weights, all 40 heads, and an explicit deterministic N259 hidden fixture with nonzero 3D positions and source IDs 0/1/2. Both variants used the actual candidate private `selfAttention`, actual Hike model math and actual ORT operators. Test-only captured-source instrumentation exposes that private function without adding a production API. The comparison variant restores only the prior separate output allocation and four-span accounting.

- All 259 queries and all 259 keys participated: Q128+128+3 and K256+3.
- All 33 emitted intermediate chunks were bit-identical between variants, including Q/K/V, attention, O and residual. Their progress events and ordering also matched.
- Both output SHA-256 values: `1ed83c1c0a5a649b3a7393da272ea2972b01a6f3ff7fe11d0d360f8d86f06c31`.
- Independent F64 `base + projected * gate` checks compared 2,652,160 residual values across both runs under the fixed `abs <= 1e-5 + 1e-6 * abs(reference)` gate: zero failures; max absolute error 4.4528860598802567e-8; max normalized-to-gate 0.004236786498640275.
- Logical hidden-store peak changed from 21,217,280 to 15,912,960 bytes (four to three spans). Both stage-weight caches ended at zero. Prepared K/V pairs, bytes and active leases ended at zero; all four pair creations were released. Both candidate owners and shared native owners were then disposed.

This bounded explicit-hidden fixture is applicable storage-change evidence, not native Text provenance, full40/N5 parity or original-shape acceptance.

## Node evidence and reproduction

`test-self-residual-inplace.mjs` exercises the actual extracted private row loop with deterministic operators solely to check ownership/order. N475 covers Q128+128+128+91 and K256+219, exact positions calls, immutable original V data across overwritten earlier query rows, bit parity against separate output, explicit legacy fallback, and cancellation during K/V preparation or after the first completed residual. Future rows remain intact after cancellation; weights and completed/partial K/V resources release. This is not a synthetic model-accuracy claim.

The RED run failed the prepared-input reuse assertion before the runtime change; the remaining three tests passed. After the change all four passed. The complete top-level execution Node test set (all files importing `node:test`) runs sequentially; its exact command, output and source hashes are saved in [evidence/node-execution-suite.json](evidence/node-execution-suite.json).

```sh
node docs/shared/diffusion-models/execution/test-self-residual-inplace.mjs
python3 docs/shared/diffusion-models/execution/test-self-residual-inplace-browser.py \
  --output /tmp/inplace-native-low-block0-259.json
```

The browser driver requires Playwright, Chromium and the retained original LOW model (default `../retained/bernini/Bernini_LOW_fp8_e4m3fn_scaled.safetensors`); `--model` selects its local path. It captures execution source bytes and refuses to report success if source bytes change during the run. No runtime files in either existing long-running execution worktree were modified.
