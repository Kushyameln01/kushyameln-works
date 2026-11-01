> 実NN開始前の実装・小fixture引継ぎ記録。以下の「未測定」はこの記録時点の範囲であり、その後の実測結果は[RESULT.md](../RESULT.md)と[SUMMARY.json](../SUMMARY.json)に保存した。元のphase/sourceを付け替えていない。

# Incremental Text manifest verification handoff

Base execution source: `44b188633343cc2c93ea6f85aac348059ac42757`. This task edits four files and performs no real browser/NN/model import/export/install/commit/push.

Root-provided measured motivation (not new runs by this task): unchanged-runtime baseline RSS 5,708,951,552 B, ORT WASM 2,526,806,016 B, full 117.26 s; disabling prepacking alone produced numeric PASS but RSS 6,007,259,136 B, WASM 2,191,261,696 B, full 101.66 s. Both RSS peaks occurred during the full 771,822,917-byte block WebCrypto digest. Prepacking alone therefore did not establish a high-RSS improvement.

Implementation:

- `docs/shared/inference/text-encoder.mjs` imports the existing `../vr180/sha256.mjs` Sha256 class. `verified(record, runSignal)` keeps the existing full File/Uint8Array read and manifest size/hash checks, updates the digest using <=8 MiB `subarray` views, yields an actual timer task after each update, and checks load/run signals plus disposed state before/after work. The final chunk also yields and checks cancellation before finalization/ORT. Small embedding row WebCrypto hashing remains unchanged. ORT prepacking settings and all numerical/token/shape/normalization behavior remain at the base source.
- `tools/inference/text-encoder/plain_observer_worker.mjs` imports the same canonical `/shared/vr180/sha256.mjs` module and wraps update/digestHex synchronously. It emits incremental digest start/update/end scalar metadata, chunk/cumulative bytes and epoch/timing. WeakMap values contain only scalar state. It preserves native returns and does not retain model buffers, views or hash inputs.
- `accept_plain.py` adds only the exact shared-SHA HTTP path and source-proof entry. The RSS/PSS sampler is untouched.
- `test-runtime.mjs` reuses its existing tiny fixture with a deterministic 9 MiB Blob graph and Node crypto independent manifest SHA. ORT is a sentinel and never parses or executes synthetic graph/model bytes.

RED→GREEN evidence:

1. Before production change: existing 5 runtime tests PASS; 4 new integration tests FAIL specifically on `whole-file WebCrypto snapshot forbidden`.
2. After production change: all 9 runtime tests PASS. New cases establish full 9 MiB equality plus [8 MiB, 1 MiB] views sharing the same buffer passed to ORT; final-byte corruption fails before ORT; queued run cancellation after chunk1 stops before chunk2/ORT; queued dispose during the final yield rejects the run and resolves activeDone without an ORT call.
3. Existing `tests/vr180-sha256.test.mjs`: 11 PASS (standard vectors, partitions, length/padding, bounded reads and task/Worker cancellation).
4. Existing connection contract: 12 PASS. Existing Python plain failure controls and plain checks: 3 + 3 PASS. Changed JS syntax, Python AST and git diff whitespace checks pass.

Control identity assertions against base44b:

- `plain_memory.mjs` unchanged: `dd0dcf5ef26ea1b71b2803db4d521af3bfeb24b0fa8323eb7437507b2d3cbc71`.
- Shared `vr180/sha256.mjs` unchanged: `cbf39a47d19ef1a0a150ad5219dd8a49e2ee5fc67d2550640ce33c73d08da36c`.
- The entire 50 ms sampler source segment is byte-identical. Helper changes are limited to source/route support and incremental-hash observation hooks.

Independent source review found no substantive blocker. Numerical output and real RSS/time benefit remain unmeasured for this candidate; root must freeze the source and execute the same independent full512 reference/gate suite. JavaScript hash CPU and timer-yield time can increase latency. Capacity, cumulative traffic and sampled RSS/PSS remain distinct metrics, and added hook events impose some observation overhead. The 9 MiB integration fixture covers a complete chunk plus remainder; exact 8 MiB-minus/plus-one integration sizes were not separately added, while existing SHA tests cover algorithm block/partition boundaries.
