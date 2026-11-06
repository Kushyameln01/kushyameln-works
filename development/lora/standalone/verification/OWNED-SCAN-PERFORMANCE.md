# Owned package finite-scan performance probe

This is a synthetic performance probe, not original-model or standalone numerical acceptance evidence. No original sources were read or hashed.

Private harness: `owned-scan-benchmark.mjs`. Results: `owned-scan-before.json` and `owned-scan-after.json`. Node v24.19.0. Each microbenchmark alternates order across five rounds, 24 scans per round.

| F32 elements | `.every` median, ms | Indexed median, ms | Ratio |
| --- | ---: | ---: | ---: |
| 655,360 | 126.42 | 24.26 | 5.21 |
| 1,036,800 | 201.15 | 42.37 | 4.75 |
| 1,769,472 | 324.67 | 64.16 | 5.06 |

The warm package probe uses the unchanged declared full shape `[5120,13824]`, rank 128, synthetic F32 factors, real streaming Hike, immutable synthetic base, and 75 complete original-coordinate rows per read. It repeatedly reads the same 1,036,800-element tile after warming its raw-product cache. It does not claim full-matrix execution. Four rounds contain 24 complete block reads each; no source hash or factor computation is included in these timed rounds. Product calls remain exactly one before and after the timed work in both processes.

| Warm package | Before | After |
| --- | ---: | ---: |
| Median of round times | 844.79 ms | 387.62 ms |
| Median time per block | 35.20 ms | 16.15 ms |

Observed warm-block improvement: **2.18×**. Overall full-acceptance improvement remains to be measured separately.

Implementation change is limited to `finite(a,n)`: preserve the F32/type/length guard and check every element using an indexed `Number.isFinite` loop. No check, gate, numerical operation, selected coordinate, read limit, package format, or lifecycle behavior was removed or relaxed.

Fresh verification: `node --test tools/lora/test-owned-package.mjs` — **24 passed**. This includes a full-block final-element NaN, positive infinity, negative infinity, and preserved negative-zero regression. Whitespace checks passed. No commit or push was performed.
