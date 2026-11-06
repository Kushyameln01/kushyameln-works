# Public Worker evidence: current accepted and incomplete scopes

All artifacts contain metadata/logs/hashes only. Model payloads, latent/text
values, outputs and canonical files remain private. Absolute private paths are
location provenance, not recipient transfer acknowledgments.

| Evidence | Actual execution source | Accepted scope |
| --- | --- | --- |
| [HIGH predict](predict-high-result.json), [comparison](predict-high-comparison.json) | `7cf77c21889d9642e61d9a41d3242a816e24d6be` | ControlledN5, all realTextL512, complete40blocks/head/unpatch, all128velocity values compared, actual File save/readback |
| [Six-update recovery](sample-recovery/README.md) | `0f761f374dce1d447bbb912ad13c08f9bf85c279` | SAME API cancel/reload, HIGH3/LOW3,6x40blocks, final raw128 comparison,1179B actual File readback; finalRaw-only new numeric comparison |
| [Full-target partial probe](full73947-block0/README.md) | `0f761f374dce1d447bbb912ad13c08f9bf85c279` | Partial73,947token HIGH block0; allKV, Q5248 and self/O/residual5120 accepted;1800s watchdog, complete block not accepted |
| [Failed-pair reset](failed-preparation-reset/README.md) | `6d12140eeab204385fa31f5da73d4796968a4003` | Actual wrong-pair Worker discard, clean fresh status/P4 release, valid pair prefix/cancel/reload/input-codec; exception-only changes, no full NN rerun |
| [Small chunk transport](small-chunks-result.json) | `7cf77c21889d9642e61d9a41d3242a816e24d6be` | N5/block0, all19selected stages,33chunks, independent comparisons; not a fullshape proof |

Independent six-update reference source is
`3e68d2fc54c67b16f8a82002f69fa183674a9f14`, retained in
[independent-small-six-receipt.json](independent-small-six-receipt.json). This
execution SHA is operator/harness attribution; the receipt itself does not embed
Git identity. Frozen source hashes are preserved. The saved-output comparator at
source0f761f3 does not run new inference. In comparison receipts, sourceCommit
identifies the native output's execution source, not a newly executed model.

The new realL512 six-update result compares finalRaw only (128values,0fail,
maxabs7.62939453125e-6). Earlier N5/L3 six-update16-array evidence remains scoped
to its original fixture and unchanged math. Per-side blocksCompleted40 is a
last-prediction counter;240total comes from summing six40block run receipts.
Shared math/ORT owner stats are not summed across HIGH/LOW aliases.

Normal small-domain execution succeeds through public API/Worker. Full target81,
allcontext/allquery complete1block/full40/six updates and raw generation at that
shape remain unaccepted. The full-target probe's watchdog is operational, not a
kernel error, numerical mismatch or proof of WASM impossibility. Original executed media/context descriptors, conditioning/noise packets and
mxfp8 environment records remain unconfirmed. Workflow settings alone do not
establish those executed artifacts. generationReady=false.

The initial7d8b053 bootstrap failure, red/green test and successful7cf77c2 smoke
are retained at this directory root. Initial first-message loss was a diagnostic
wrapper bug before model load, not model numeric/capacity failure. The later
failed-preparation fix has separate6d12140 provenance and did not rerun the earlier
complete numerical sample. Receipt source identities are not upgraded by packaging.

Resource summaries retain original all-sample peaks, source hashes, pre-exec gate,
shared baseline, nearest30s/peak windows and final cleanup observations. Their
untouched private raw receipts are identified by bytes and SHA-256. RSS sums can
duplicate shared pages; PSS is best effort. Renderer/Worker roles are heuristic,
WASM Memory capacity is not allocator usage, and unexported native copies and
unsampled spikes remain unobserved. Shared cgroup/tmpfs include other workloads;
memory.peak is historical and memory.stat.file already includes shmem.

[manifest.json](manifest.json) inventories published evidence, original identities,
source assets and accepted/unaccepted scopes. No repeat inference or tensor export
was performed for packaging. Distribution identity is separate from each recorded
execution source identity.
