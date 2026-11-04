# Diffusion standalone continuation — 2026-11-04 JST

Starting distribution: `ffeeeedb6b57d182a977c3ac02c042ce235fc87a`; Draft PR14.

## Decisions

- Reuse prior N5/L512 and N5/L3 evidence only within each saved input / execution source / thread scope. No original-size promotion.
- Latest standalone plan body actually read from Page `page_1e950f67b0688191bd3f2a1d5b252224`, version1.0 draft1. No missing media or original mxfp8 precision inferred.
- Existing linked worktree is the implementation checkout. A detached `/tmp` execution worktree freezes only committed executable bytes for long runs; independent API/weight-feed work cannot invalidate its HEAD/source guards.
- Task A: exact saved packet/nativeJSON/N5 recovery completed; full73947 and smallN5-L512 manifests match prior bytes. Portable retrieval script and asset map in progress.
- Task B: prepared head-major immutable KV pool, same Q128/K256, is the first performance change. It replaces row-major KV storage; native ORT uploads remain real copies. Numerical validation precedes adoption.
- Task C: immutable genuine base provider / completed-F32 transactional feed / 1053 logical targets separately bound to1095 native targets in progress. Diffusion owns no low-rank arithmetic.
- Task D: public sampler epoch pinning and explicit duplex MessagePort package transport in progress. Main-side package functions are never cloned into Worker input.
- Task E: bounded blocks/full40+head diagnostic runner and explicit resource profiles in progress; original all-query execution next.
- Normal runtime inputs never require saved payload hashes, references, gates or detailed numerical receipts.
- User authorized implementation, verification, branch push and Draft PR update. No duplicate approval/ACK gate; no merge, Pages publish, experimental LoRA delivery or whole-operation experiment.

## Resource observations before new model execution

CPU cgroup quota400000/period100000 (4CPU); memory.max17179869184B; no detected GPU runtime. Two retained15,574,833,216B scaledFP8/F16 model files remain immutable in existing workspace. Full F32 model materialization is not used. Workspace filesystem had~87MB free; temporary execution checkout and bounded private artifacts use `/tmp` tmpfs (capacity9,441,329,152B). These are host observations, not proof of full model completion.

## Acceptance status

Original73947 all queries, full40/head and six updates remain unaccepted until corresponding new receipts complete. Management has real pinned public-call adapters, but new source adoption and actual saved-input management execution are separate scopes. Conforming weight-feed validation is not actual full-model LoRA acceptance.

## Work recorded after the initial plan

- `c0cbd456df2274078c89de3cdb3856f612543aeb`: public holding runner now defaults1/noCOI and refuses4/noCOI before reading assets. Actual retained-model public smoke passed15.760679497s, cancellation at patch -> fresh reload in the same API -> canonical real File readback. No complete neural prediction was accepted by this smoke. RSS sum peak1,295,982,592B / PSS sum peak1,015,153,664B (separate outer monitor, 1s sampling).
- `ecf1122b3afaba989277c5b44f523a40219b79eb`: preparedKV source plus blocks/predict chunk harness frozen. Independent review found no Important/Critical defect in TaskB. Native bounded1/noCOI and4/COI comparison receipts preserve old graph bits. All-query N73947 HIGH/block0 trial started from the detached frozen worktree; native4/COI and explicit independent BLAS4 are recorded separately. Actual1-vs4 reference Q/K/V rows1/3 and all40-head bounded attention were bit-identical before selecting BLAS4 for this new trial. Older one-thread-reference receipts are not promoted.
- TaskC review found candidate commit/release and terminal cleanup/dispose races; fixes and regression tests are required before consumer acceptance. Root additionally requires genuine base outside selected package ranges rather than trusting package pass-through values. These do not affect the running frozen base trial.
- TaskD review is checking interrupted prepare and package release failure ownership; successful structural RPC tests do not close those findings. Public normal inputs still contain no numerical reference/gate.
- Portable saved-input recovery tests pass4/4; byte-exact old full/small manifests are restored. No Text inference or raw re-export was needed.

Runtime job receipts are pending, not completion evidence. Current stdout/progress and private oracle files remain outside Git until terminal results and cleanup are recorded.
