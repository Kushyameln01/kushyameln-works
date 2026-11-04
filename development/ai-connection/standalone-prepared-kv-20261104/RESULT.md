# Prepared K/V resource boundary — 2026-11-04

Status: bounded native numerical/resource acceptance, not original-target complete inference.

Base commit: `ffeeeedb6b57d182a977c3ac02c042ce235fc87a`. The native receipt records this HEAD plus the SHA-256 of every captured modified execution file; those captured bytes, rather than an unmodified-HEAD assumption, identify the run. Distribution and execution commits are provided in the enclosing handoff after the change is committed.

## Change and unchanged arithmetic

`execution/prepared-attention-kv.mjs` owns compact native CPU `ort.Tensor` K/V pairs. `createOrderedAttentionKVPool` receives the existing projected row chunks in order, fills `[40,K<=256,128]` head-major tiles and transfers completed private buffers into the owner. The full row-major self-attention K/V arrays are replaced by the pool. All keys and every exact tail remain present.

`model-candidate.mjs` uses this pool for native self-attention; cross-attention prepares once from its existing at-most512-row projection staging and drops that staging before queries. Explicitly injected older test operators retain a labelled legacy path. `attentionQueryPreparedTile` leases the matching range and reuses prepared CPU tensors across queries. No graph, Q128/K256, F32 scale, online softmax recurrence, denominator division, model dtype or scheduler change is included. In-place residual and RoPE caching are not part of this accepted change.

This removes repeated host K/V packing, snapshots and finite scans. It does **not** establish zero-copy or native-resident WASM inputs. The checked ORT CPU/pinned-CPU path still allocates and copies into WASM. Normal tensor semantics, caller ownership and existing public load/predict/sample behavior remain unchanged.

## Internal contract

- `prepareAttentionKV({k,v,heads:40,keys:1..256,headDim:128,keyStart,ownership,signal})`: `k/v` are distinct compact nonshared native finite F32 buffers, already head-major. `keyStart` is nonnegative and 256-aligned. `copy` retains caller bytes; explicit `take` detaches both buffers after admission. Returns owner-local frozen metadata without tensor/data access.
- `attentionQueryPreparedTile({queryHandle,kvHandle,signal})`: validates the exact next global key range and remaining expected keys. Returns progress only. K/V read leases end after native work and output cleanup, including cancellation. Query state advances only after successful validation.
- `releaseAttentionKV(handle)`: idempotent for a released local handle, rejects foreign handles and active work. Partial native cleanup retains failed resources, blocks new execution and permits owner disposal/recovery.
- Pool append requires contiguous ordered projected rows of1..128; no gaps or overruns. Finish requires every declared key. Query finish still requires every expected key.
- Model owner retains incomplete cleanup pools for disposal retry. Prepared owner stats count K/V CPU tensor spans; those spans alias the logical K/V spans in the model's four-store estimate and must not be added twice.

## Native results

Receipt: [evidence/native-boundaries.json](evidence/native-boundaries.json), 31,642 bytes, SHA-256 `80594f7c88d4455432de568a4c04c8b47c9e8b18283a4d653d223df6705720fb`.

Separate fresh browsers ran ordinary1-thread/no-COI (`crossOriginIsolated:false`, zero pthreads) and explicit4-thread/COI (three observed native pthreads). No fallback or silent mode switch.

Each mode reused prepared inputs twice:

| Shape | Values compared against unchanged graph | Independent F64 maximum absolute error | Gate failures |
| --- | ---: | ---: | ---: |
| H40/Q3/K256+219/D128 | 31,200 | 0.00013975230757523605 | 0 |
| H40/Q91/K3/D128 | 946,400 | 0.0000002771020835012905 | 0 |
| H40/Q128/K256/D128 | 1,331,200 | 0.00012351352754080835 | 0 |

Every compared value was bit-identical to the existing `attentionTile` graph. The test-only independent gate was fixed at `abs <= 0.001 + 0.0001 * abs(reference)`; no reference or gate enters normal execution. Copy/take, mutation isolation, finite admission, aligned range/order, foreign/stale handles, cancellation/retry, active release and actual native disposal-failure/recovery passed. Final prepared pair count, bytes, leases and query owners were zero.

Node ownership/layout tests cover direct ordered rows with 256+219 keys, final91-row append, exact head-major mapping, absence of full row-major stores, gaps/ranges, partial pool cancellation and cleanup retries. Existing query-owner and model admission/cancellation tests also pass.

## Capacity and reused evidence

For declared N73947, one F32 N×5120 span is1,514,434,560 bytes. The complete prepared K/V pool is3,028,869,120 bytes, replacing the previous two equal spans. Block input+output+K/V retain the existing conservative four-span estimate6,057,738,240 bytes. Temporary row chunks, prepared weights, ORT/WASM staging, outputs and allocator/GC overhead are additional. This bounded test does not establish an original-shape aggregate peak.

The unchanged baseline partial run at `../public-worker-20261102/evidence/full73947-block0/full73947-block0-result.json` is reused only as motivation: K/V73947, native Q5248, compared O/residual5120, 11,849 attention calls, layout102.43s, attention wrapper474.38s including native session234.11s; K/V host snapshots124,183,633,920 bytes. This is not a measured speedup for the new pool. Diagnostic callback wall time and native time remain distinct.

## Reproduction

```sh
node docs/shared/diffusion-models/execution/test-prepared-attention-kv-owner.mjs
node docs/shared/diffusion-models/execution/test-owned-attention-query-owner.mjs
node docs/shared/diffusion-models/execution/test-model-candidate.mjs
python3 docs/shared/diffusion-models/execution/test-prepared-attention-kv-browser.py --output /tmp/prepared-kv-native.json
```

The browser driver captures exact source bytes before serving, records all SHA-256 values, checks no dependency is missing and verifies bytes are unchanged during execution. Chromium and Playwright are required. These tests do not load model weights.

## Not accepted by this receipt

Original N73947 all-query block0 and later operators, all40 blocks, complete HIGH/LOW predict, six updates, raw sample output and complete resource budgets require separate actual-model runs. The pool does not modify their acceptance state. No whole-product experiment, merge or Pages publication is claimed here.
