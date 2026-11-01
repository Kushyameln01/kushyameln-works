# Text plain memory and VAE profile integration plan

Goal: preserve accepted P2 and the native works-ai-1 contracts while measuring and reducing the fixed plain Hello world path's memory use, assisting the real L512 consumer, and preparing only media-backed missing VAE profiles.

Base distribution: a42ad61a7f56667ceefb4f21a9aacde859e00538. Existing actual conditioning/reference packet: f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48. Plain independent oracle execution: 5537b8932343aa2476b95191817e8913f99dab02. New work branch: codex/text-plain-memory. Use the already-isolated linked worktree; keep the original model, graph bundle, selected manifest, tokenizer, final norm and gates.

Architecture: keep File-backed staged24 graph loading, one ORT session at a time, and the actual Hike final RMSNorm. Instrument API-visible reads/hash/session/WASM lifecycle and process RSS/PSS without forced GC, synthetic model data or a replacement numeric implementation. First run an instrumented unchanged-runtime baseline. Choose only a measured cause's smallest loading/session allocation change. Compare the optimized native plain output to the existing independent full512 reference; do not recompute the oracle or export the model.

Constraints: Text owns final RMSNorm; Diffusion owns 4096 projection, cross-attention/FFN, and generated-latent restoration. Management owns queue, slot ordering, outer trace/package and persistence. Original plain outputs remain [1,512,4096]; ID outputs remain [1,L,4096]. Keep model/Tokenizer/mask and all native metadata. P2 Rect [1,16,1,2,4] to [1,3,1,16,32] accepted evidence stays at its original source/scope. No automatic merge/Pages publication or generation readiness promotion.

## Task1: measured cause and diagnostic baseline

- [ ] Obtain latest peer ACKs, L512 contract, actual media/slot and P5 producer receipts.
- [ ] Trace File/Blob reads, digest, graph copies, session creation/run/release, WASM capacity and output/caches; distinguish observable capacity/traffic from retained OS RAM.
- [ ] Instrument diagnostic helpers only, keeping the production runtime unchanged. Separate reused oracle source from current browser execution source.
- [ ] Freeze full execution SHA before running. Execute fixed Hello world plus existing cancellation in a fresh private directory, with 50ms process RSS/PSS/role/phase sampling, current8GiB task budget on this16GiB/4CPU environment and exclusive NN lease.
- [ ] Verify all2,097,152 values against the unchanged independent reference, original gate maxAbs=.001/atol=.001/rtol=.001,512 IDs/mask, zero padding, metadata, full24 sessions, cancellation, Worker/process exit.

## Task2: minimal memory correction and same-condition acceptance

- [ ] Based on measured baseline, choose one memory-retention/copy/prepack change; do not change graph shape, weights, dtype, norm, token semantics or gate. Existing CPU arena and mempattern defaults are already false; do not claim an improvement from redundantly setting those flags.
- [ ] Add focused lifetime/configuration regression only if needed to pin the corrected boundary, verify it rejects old behavior, implement minimal runtime change and review it.
- [ ] Freeze the changed source SHA before the second real run. Keep helper instrumentation, browser options, inputs, graph/source identities, CPU/threads, resource budget and reference/gate identical.
- [ ] Verify the same numeric/lifecycle conditions and compare full-run/suite RSS/PSS, WASM capacity, JS/read/hash/copy categories and wall time. Record OS-cache/measurement limits. Do not claim4GiB/device acceptance unless measured.

## Task3: joint L512 and missing VAE profile readiness

- [ ] Return current real Text packet and new source acquisition ACKs to Diffusion; require owner-side consumer/reference/gate receipts for actual L512 numerical consumption. Do not implement projection/cross-attention/FFN here.
- [ ] Match management-supplied original file hash, slot role, source frame/time arrays and exact preprocessing F/H/W to accepted profiles. If those facts are missing, request them from management and mark only the dependent profile blocked. Do not guess/pad/resize/drop frames.
- [ ] If a concrete missing shape is supplied, use a fresh private fixed profile export, unchanged original source/model, independent all-output reference and predeclared gate/resource budget; accept with actual WASM plus cancellation/lifecycle records. Existing profiles are not re-exported without a concrete difference.
- [ ] Before P5 actual producer exists, keep generated-sample raw space/model/producer/decoder binding and restoration-receipt requirements explicit. After those inputs exist, validate the matching profile's raw decode and management save; no duplicate restoration.

## Publication and evidence

- [ ] Preserve old acceptance records; distinguish old oracle/P2 evidence, new measurement/control tests and new actual inference.
- [ ] Independent review; push implementation/API/reproduction and small evidence to the work branch and Draft PR. Report distribution and actual execution SHAs separately, API delta, numerical/resource results, reused evidence and unaccepted scope. Source/data acquisition by ourselves is separate from recipient ACK.
