# Full-model weight boundary, 2026-11-04

The new full-model feed binds the LoRA owner's canonical logical registry to
the existing original-weight reader and real ORT/Hike parameters. It retains
owned lazy completed-F32 packages, validates all declared values, switches
epochs, restores genuine base, pins operations and releases failed terminal
work through retryable ownership. No low-rank arithmetic was added.

The canonical mapping source is
`6d0c8df4cd4992f26745d2d26394f5e194d2567f`. Its 47,893-byte mapping table is
identical to Diffusion baseline
`ffeeeedb6b57d182a977c3ac02c042ce235fc87a`, SHA-256
`772ca63c3b82bafa7b2345cdda3361679112fcf4a97c79b67564da0fa196217d`.
The 1,095 native parameters and 1,053 logical weight/bias targets are separate.

The focused five-file Node command in
[FULL-WEIGHT-FEED.md](../../../docs/shared/diffusion-models/execution/FULL-WEIGHT-FEED.md)
passed 54 tests at execution. This includes the changing public transport tests;
the command's exact test count may grow with later revisions. It reuses the
existing decoder/read-window, head independent F64 and P4 numerical/structural
tests within their original scopes. New tests cover full native mapping,
completed-range validation, native read splitting, stale epochs, operation
pinning, failed cleanup and disposal races, asynchronous retain, terminal
exclusivity, immutable base restoration and unselected-range protection.

[REAL-BASE-BROWSER.json](./REAL-BASE-BROWSER.json) records the final tested source
files by path/bytes/SHA-256. On Chromium 154, explicit one-thread/no-COI, the
retained real LOW Q4/bias4 decode matched the independent Python decoder for
20,484 values exactly. The completed-F32 projection and restored-base projection
each compared eight values with max absolute error 2.3283064365386963e-9 against
the gate abs1e-5 + rel1e-4. Total elapsed time was 2,286ms. This includes bounded
setup, reads, two actual ORT calls and cleanup; it is not a full-model estimate.
Final ORT sessions/tensors, package references, candidates and read leases were
zero. Source Hike/decoder memory and copy counters are recorded; complete RSS/PSS
and ORT allocator peaks were not measured.

The browser test used a conforming completed-F32 test source and no LoRA original.
Actual LoRA full-model application, HIGH numerical weight consumption, full-model
time/memory budgets, original-size predict/sample and whole operation acceptance
remain outside this result. The base model whole-file hash was not recomputed.
No LoRA was sent to management, and no merge or Pages publication was performed
by this work unit.
