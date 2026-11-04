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
